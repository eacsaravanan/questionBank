// backend/src/pipeline/imageCrop.js
//
// Requires: npm install sharp --save
//
// This replaces the "TODO: pass cropped region" placeholder in ocrPipeline.js.
// Document AI and your segmenter already compute a boundingBox per question
// (in the coordinate system of the full page image) -- this actually crops
// the image to that box before handing it to Mathpix, instead of sending
// the whole page.

import sharp from 'sharp';

/**
 * @param {string} imageBase64 - full page image
 * @param {{x:number, y:number, w:number, h:number}} boundingBox - in pixels,
 *   matching the page image's actual dimensions (NOT normalized 0..1 --
 *   Document AI returns normalized coordinates in some response shapes,
 *   so convert against page width/height BEFORE calling this if needed)
 * @param {{paddingPx?: number}} [opts] - small padding avoids clipping
 *   superscripts/subscripts that sit right at the edge of the detected
 *   paragraph box, which is a common way formula crops get truncated
 * @returns {Promise<string>} cropped image as base64
 */
async function cropToBoundingBox(imageBase64, boundingBox, opts = {}) {
  const padding = opts.paddingPx ?? 12;
  const buffer = Buffer.from(imageBase64, 'base64');
  const image = sharp(buffer);
  const metadata = await image.metadata();

  const left = Math.max(0, Math.round(boundingBox.x - padding));
  const top = Math.max(0, Math.round(boundingBox.y - padding));
  const width = Math.min(
    metadata.width - left,
    Math.round(boundingBox.w + padding * 2)
  );
  const height = Math.min(
    metadata.height - top,
    Math.round(boundingBox.h + padding * 2)
  );

  const cropped = await image.extract({ left, top, width, height }).toBuffer();
  return cropped.toString('base64');
}

export { cropToBoundingBox };
