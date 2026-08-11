// backend/src/ocr/ocrService.js
//
// Single entry point the rest of your app calls. Nothing outside this file
// should ever import a specific provider adapter directly.
//
// Usage (replace wherever your old code called the Custom API OCR endpoint):
//
//   import { runOcr, runMathOcr } from './ocr/ocrService.js';
//   const result = await runOcr({ imageBase64, mimeType }, ocrSettingsFromDb);
//
// ocrSettingsFromDb is the JSON object matching ocr-config.schema.json,
// loaded from whatever table/row your "Save OCR configuration" button writes to.

import * as googleDocumentAi from './providers/googleDocumentAi.js';
import * as googleCloudVision from './providers/googleCloudVision.js';
import * as mistralOcr from './providers/mistralOcr.js';
import * as sarvamVision from './providers/sarvamVision.js';
import * as mathpix from './providers/mathpix.js';
import * as customApi from './providers/customApi.js';

const ADAPTERS = {
  google_document_ai: googleDocumentAi,
  google_cloud_vision: googleCloudVision,
  mistral_ocr: mistralOcr,
  sarvam_vision: sarvamVision,
  mathpix: mathpix,
  custom_api: customApi,
};

function getAdapter(engineName) {
  const adapter = ADAPTERS[engineName];
  if (!adapter) {
    throw new Error(
      `Unknown OCR engine "${engineName}". Valid engines: ${Object.keys(ADAPTERS).join(', ')}`
    );
  }
  return adapter;
}

/**
 * Runs the primary engine. If settings.secondaryEngine is set, also runs that
 * and returns both so the review screen can show a side-by-side diff — this is
 * the "Compare OCR" feature referenced in the recommendation above; wire a
 * button to it next to your existing "Check for repeats" button.
 *
 * @param {{imageBase64: string, mimeType: string}} input
 * @param {object} settings - matches ocr-config.schema.json
 * @param {{compare?: boolean}} [opts]
 */
async function runOcr(input, settings, opts = {}) {
  const primaryAdapter = getAdapter(settings.engine);
  const primaryConfig = settings.providers[settings.engine];
  const primary = await primaryAdapter.extractText(input, primaryConfig);

  if (!opts.compare || !settings.secondaryEngine) {
    return { primary, secondary: null };
  }

  const secondaryAdapter = getAdapter(settings.secondaryEngine);
  const secondaryConfig = settings.providers[settings.secondaryEngine];
  const secondary = await secondaryAdapter.extractText(input, secondaryConfig);

  return { primary, secondary };
}

/**
 * Routes a crop through the configured math engine (Mathpix by default).
 * Call this from the review UI when the reviewer flags a region as "formula".
 */
async function runMathOcr(input, settings) {
  const engineName = settings.mathEngine || 'mathpix';
  const adapter = getAdapter(engineName);
  const config = settings.providers[engineName];
  return adapter.extractText(input, config);
}

export { runOcr, runMathOcr, getAdapter };
