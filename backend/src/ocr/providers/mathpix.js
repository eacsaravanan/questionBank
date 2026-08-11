// backend/src/ocr/providers/mathpix.js
//
// Use this ONLY for crops your reviewer marks as "contains formula/exponent" —
// it returns LaTeX, which is what you want for the X² / X₂ style questions
// (e.g. Q101, Q145, Q146 in the sample paper: 1.6×10⁻¹⁹, 16³+7³−23³, nested radicals).
// Full-page Tamil OCR should NOT go through Mathpix; it has no Tamil support.

import fetch from 'node-fetch'; // npm install node-fetch@2 --save

/**
 * @param {{imageBase64: string, mimeType: string}} input
 * @param {{appIdRef: string, appKeyRef: string}} providerConfig - env var NAMES, not values
 * @returns {Promise<import('../types').OcrResult>}
 */
async function extractText(input, providerConfig) {
  const appId = process.env[providerConfig.appIdRef];
  const appKey = process.env[providerConfig.appKeyRef];

  const response = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: {
      app_id: appId,
      app_key: appKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      src: `data:${input.mimeType};base64,${input.imageBase64}`,
      formats: ['text', 'latex_styled'],
      math_inline_delimiters: ['$', '$'],
    }),
  });

  if (!response.ok) {
    throw new Error(`Mathpix error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  return {
    text: data.text || data.latex_styled || '',
    confidence: data.confidence,
    shape: 'flat',
    provider: 'mathpix',
    raw: data,
  };
}

export { extractText };
