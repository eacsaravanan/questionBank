// backend/src/ocr/providers/googleCloudVision.js
//
// Requires: npm install @google-cloud/vision --save
// Auth: GOOGLE_APPLICATION_CREDENTIALS (can reuse the same service account as Document AI
// if that account has both Vision API and Document AI API enabled/roles granted).

import vision from '@google-cloud/vision';

/**
 * @param {{imageBase64: string, mimeType: string}} input
 * @returns {Promise<import('../types').OcrResult>}
 */
async function extractText(input) {
  const client = new vision.ImageAnnotatorClient();

  const [result] = await client.documentTextDetection({
    image: { content: input.imageBase64 },
    imageContext: { languageHints: ['ta', 'en'] },
  });

  const annotation = result.fullTextAnnotation;
  const text = annotation ? annotation.text : '';

  // Vision doesn't return tables, only paragraph/word/symbol geometry.
  // Flatten to paragraph blocks for consistency with the unified shape.
  const blocks = [];
  for (const page of (annotation && annotation.pages) || []) {
    for (const block of page.blocks || []) {
      const paraText = (block.paragraphs || [])
        .map((p) =>
          (p.words || [])
            .map((w) => (w.symbols || []).map((s) => s.text).join(''))
            .join(' ')
        )
        .join('\n');
      if (paraText.trim()) blocks.push({ type: 'paragraph', text: paraText });
    }
  }

  // Vision gives per-word confidence; average it as an overall estimate.
  const wordConfidences = ((annotation && annotation.pages) || [])
    .flatMap((p) => p.blocks || [])
    .flatMap((b) => b.paragraphs || [])
    .flatMap((p) => p.words || [])
    .map((w) => w.confidence)
    .filter((c) => typeof c === 'number');
  const confidence = wordConfidences.length
    ? wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length
    : undefined;

  return {
    text,
    confidence,
    shape: 'flat',
    blocks,
    provider: 'google_cloud_vision',
    raw: result,
  };
}

export { extractText };
