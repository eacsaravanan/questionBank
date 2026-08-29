// backend/src/ocr/providers/customApi.js
//
// This preserves your EXISTING contract exactly (the one already shown in your
// OCR Engine screen): POST { imageBase64, mimeType } -> { text, confidence? }
// So any provider you already pointed at this (PaddleOCR, Azure, AWS Textract via
// a thin wrapper, Sarvam via a thin wrapper) keeps working unchanged.

import fetch from 'node-fetch'; // npm install node-fetch@2 --save

/**
 * @param {{imageBase64: string, mimeType: string}} input
 * @param {{endpointUrl: string, apiKeyRef: string, secretKeyRef: string}} providerConfig
 * @returns {Promise<import('../types').OcrResult>}
 */
async function extractText(input, providerConfig) {
  const apiKey = providerConfig.apiKeyRef ? process.env[providerConfig.apiKeyRef] : undefined;
  const secretKey = providerConfig.secretKeyRef ? process.env[providerConfig.secretKeyRef] : undefined;

  const response = await fetch(providerConfig.endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
      ...(secretKey ? { 'X-Secret-Key': secretKey } : {}),
    },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom OCR API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  return {
    text: data.text || '',
    confidence: data.confidence,
    shape: 'flat',
    provider: 'custom_api',
    raw: data,
  };
}

export { extractText };
