// backend/src/ocr/providers/mistralOcr.js
// Kept for completeness / future use. Not recommended as primary for this
// Tamil-heavy dataset today (see recommendation) — wire it up the same way
// as customApi.js if/when Mistral's Tamil support improves and you want to pilot it.

import fetch from 'node-fetch'; // npm install node-fetch@2 --save

async function extractText(input, providerConfig) {
  const apiKey = process.env[providerConfig.apiKeyRef];

  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: providerConfig.model || 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral OCR error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = (data.pages || []).map((p) => p.markdown || '').join('\n\n');

  return {
    text,
    shape: 'flat',
    provider: 'mistral_ocr',
    raw: data,
  };
}

export { extractText };
