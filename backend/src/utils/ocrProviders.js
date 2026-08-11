import { createWorker } from 'tesseract.js';
import fs from 'fs/promises';
import axios from 'axios';
import { prisma } from '../config/db.js';
import { decryptField } from './crypto.js';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

/**
 * Loads the Super Admin's configured OCR provider settings, decrypting
 * the stored API key/secret. Falls back to Tesseract (no config needed)
 * if nothing has been configured yet.
 */
export async function getOcrConfig() {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: 'ocr' } });
  if (!cfg) return { provider: 'tesseract' };
  return {
    provider: cfg.value.provider || 'tesseract',
    endpointUrl: cfg.value.endpointUrl,
    apiKey: cfg.value.encryptedApiKey ? decryptField(cfg.value.encryptedApiKey) : undefined,
    secretKey: cfg.value.encryptedSecretKey ? decryptField(cfg.value.encryptedSecretKey) : undefined,
  };
}

/**
 * Every provider function has the same contract:
 *   run(imagePath, config) -> { text: string, confidence: number (0-1) }
 * so ocr.routes.js never needs to know which one is active.
 */

async function runTesseract(imagePath) {
  const worker = await createWorker('eng+tam');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await worker.recognize(imagePath);
    return { text: data.text, confidence: Math.round(data.confidence || 0) / 100 };
  } finally {
    await worker.terminate();
  }
}

/**
 * Google Cloud Vision — REST API, called directly with axios (no Google
 * client SDK needed, no Python). Generally the most accurate option of
 * the three for watermarked/subscripted/mixed-script text, at the cost of
 * your exam content leaving your servers and a per-image charge once the
 * free tier (1,000 units/month at time of writing) is used up.
 */
async function runGoogleVision(imagePath, config) {
  const imageBase64 = (await fs.readFile(imagePath)).toString('base64');
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${config.apiKey}`;
  const { data } = await axios.post(url, {
    requests: [{
      image: { content: imageBase64 },
      features: [{ type: 'TEXT_DETECTION' }],
      imageContext: { languageHints: ['en', 'ta'] },
    }],
  }, { timeout: 30000 });

  const annotation = data?.responses?.[0]?.fullTextAnnotation;
  const text = annotation?.text || '';
  // Google Vision doesn't return one overall confidence number the way
  // Tesseract does — approximate from per-word confidences if present,
  // else assume high confidence since this API generally performs well.
  const pages = annotation?.pages || [];
  const wordConfidences = pages.flatMap((p) => (p.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((pg) => (pg.words || []).map((w) => w.confidence || 0))));
  const confidence = wordConfidences.length
    ? wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length
    : (text ? 0.85 : 0);

  return { text, confidence };
}

/**
 * Google Document AI ΓÇö unlike the other three providers, this one is
 * configured via server environment variables (GOOGLE_CLOUD_PROJECT_ID,
 * GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
 * GOOGLE_APPLICATION_CREDENTIALS), not the encrypted SystemConfig fields
 * the other providers use ΓÇö auth is via a mounted service account file,
 * not an API key typed into the admin UI.
 */
let documentAiClient;
function getDocumentAiClient() {
  if (!documentAiClient) {
    documentAiClient = new DocumentProcessorServiceClient({
      apiEndpoint: `${process.env.GOOGLE_DOCUMENT_AI_LOCATION}-documentai.googleapis.com`,
    });
  }
  return documentAiClient;
}

async function runDocumentAi(imagePath) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION;
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
  if (!projectId || !location || !processorId) {
    throw new Error('Google Document AI is not configured on the server.');
  }
  const client = getDocumentAiClient();
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  const imageBuffer = await fs.readFile(imagePath);
  const [result] = await client.processDocument({
    name,
    rawDocument: { content: imageBuffer.toString('base64'), mimeType: 'image/png' },
    processOptions: { ocrConfig: { hints: { languageHints: ['ta', 'en'] } } },
  });

  const document = result.document;
  const fullText = document?.text || '';

  // TEMPORARY debug -- tells us which fields Document AI actually populates
  // for THIS processor, instead of guessing again.
  const page0 = document?.pages?.[0];
  console.log('[DocumentAI debug]', {
    pages: document?.pages?.length,
    paragraphs: page0?.paragraphs?.length,
    lines: page0?.lines?.length,
    blocks: page0?.blocks?.length,
    tokens: page0?.tokens?.length,
    fullTextLength: fullText.length,
  });

  const resolve = (textAnchor) => {
    if (!textAnchor?.textSegments) return '';
    return textAnchor.textSegments
      .map((seg) => fullText.substring(Number(seg.startIndex || 0), Number(seg.endIndex)))
      .join('');
  };

  // Prefer LINES over paragraphs -- a "paragraph" can legally span several
  // questions as one block, which was likely why the earlier paragraph-only
  // fix still collapsed pages into too few blocks. Lines are the more
  // granular, physically-one-row unit the segmenter actually needs.
  const linesText = [];
  for (const page of document?.pages || []) {
    const source = (page.lines?.length ? page.lines : page.paragraphs) || [];
    for (const item of source) {
      const t = resolve(item.layout?.textAnchor).trim();
      if (t) linesText.push(t);
    }
  }
  const text = linesText.length ? linesText.join('\n') : fullText;

  return { text, confidence: text ? 0.85 : 0 };
}



/**
 * Generic contract for any self-hosted or third-party OCR service
 * (including a PaddleOCR Python microservice you run separately):
 *
 *   POST <endpointUrl>
 *   Headers: Authorization: Bearer <apiKey>   (if apiKey is set)
 *   Body:    { imageBase64: string, mimeType: string }
 *   Expects: { text: string, confidence?: number }  (confidence 0-1, optional)
 */
async function runCustom(imagePath, config) {
  const imageBase64 = (await fs.readFile(imagePath)).toString('base64');
  const { data } = await axios.post(
    config.endpointUrl,
    { imageBase64, mimeType: 'image/png' },
    {
      timeout: 60000,
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    }
  );
  return { text: data.text || '', confidence: typeof data.confidence === 'number' ? data.confidence : 0.75 };
}

export async function runOcr(imagePath, config) {
  const provider = config?.provider || 'tesseract';
  if (provider === 'google-vision') return runGoogleVision(imagePath, config);
  if (provider === 'document-ai') return runDocumentAi(imagePath);
  if (provider === 'custom') return runCustom(imagePath, config);
  return runTesseract(imagePath);
}
