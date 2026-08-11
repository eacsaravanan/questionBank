// backend/src/ocr/providers/googleDocumentAi.js
//
// Requires: npm install @google-cloud/documentai --save
// Auth: GOOGLE_APPLICATION_CREDENTIALS env var pointing at the service account JSON.
// Never expose the JSON key to the browser/admin UI — the config screen only stores
// projectId / location / processorId, all non-secret.

import { v1 } from '@google-cloud/documentai';
const { DocumentProcessorServiceClient } = v1;

/**
 * @param {{imageBase64: string, mimeType: string}} input
 * @param {{projectId: string, location: string, processorId: string}} providerConfig
 * @returns {Promise<import('../types').OcrResult>}
 */
async function extractText(input, providerConfig) {
  const { imageBase64, mimeType } = input;
  const { projectId, location, processorId } = providerConfig;

  const client = new DocumentProcessorServiceClient({
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: imageBase64,
      mimeType,
    },
  });

  const { document } = result;
  const fullText = document.text || '';

  // Document AI gives you page -> paragraphs/tables with text anchors into fullText.
  // We resolve those anchors into actual strings so the review UI / importer never
  // has to touch offsets.
  const resolve = (textAnchor) => {
    if (!textAnchor || !textAnchor.textSegments) return '';
    return textAnchor.textSegments
      .map((seg) => fullText.substring(Number(seg.startIndex || 0), Number(seg.endIndex)))
      .join('');
  };

  const blocks = [];
  for (const page of document.pages || []) {
    for (const para of page.paragraphs || []) {
      blocks.push({ type: 'paragraph', text: resolve(para.layout.textAnchor) });
    }
    for (const table of page.tables || []) {
      const rows = [];
      const allRows = [...(table.headerRows || []), ...(table.bodyRows || [])];
      for (const row of allRows) {
        rows.push((row.cells || []).map((cell) => resolve(cell.layout.textAnchor).trim()));
      }
      if (rows.length) blocks.push({ type: 'table', rows });
    }
  }

  // Rough confidence: average of paragraph-level detectedLanguages confidence if present,
  // else fall back to a fixed heuristic. Document AI doesn't give one overall score.
  let confidence;
  const langConfidences = (document.pages || [])
    .flatMap((p) => p.paragraphs || [])
    .flatMap((par) => (par.layout.textAnchor && par.detectedLanguages) || [])
    .map((l) => l.confidence)
    .filter((c) => typeof c === 'number');
  if (langConfidences.length) {
    confidence = langConfidences.reduce((a, b) => a + b, 0) / langConfidences.length;
  }

  return {
    text: fullText,
    confidence,
    shape: blocks.some((b) => b.type === 'table') ? 'layout' : 'flat',
    blocks,
    provider: 'google_document_ai',
    raw: document,
  };
}

export { extractText };
