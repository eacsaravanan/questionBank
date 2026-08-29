// backend/src/ocr/providers/sarvamVision.js
//
// Sarvam AI is built specifically for Indian languages, so it's worth a
// side-by-side pilot against Google Document AI on this exact paper before
// you commit budget to one provider. Confirm current endpoint/response shape
// against Sarvam's live docs before enabling in production — this adapter
// follows their published parse-endpoint shape as of this writing and should
// be treated as a starting point, not a guarantee.

import fetch from 'node-fetch'; // npm install node-fetch@2 --save

async function extractText(input, providerConfig) {
  const apiKey = process.env[providerConfig.apiKeyRef];

  const response = await fetch(providerConfig.endpoint, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: `data:${input.mimeType};base64,${input.imageBase64}`,
      language: 'ta',
    }),
  });

  if (!response.ok) {
    throw new Error(`Sarvam OCR error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  return {
    text: data.text || data.transcript || '',
    confidence: data.confidence,
    shape: 'flat',
    provider: 'sarvam_vision',
    raw: data,
  };
}

export { extractText };
