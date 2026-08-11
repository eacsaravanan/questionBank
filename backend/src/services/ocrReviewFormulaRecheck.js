// backend/src/services/ocrReviewFormulaRecheck.js
//
// The automatic MATH_CONTENT_PATTERN in ocrPipeline.js WILL miss some
// formulas -- OCR can mangle a superscript badly enough that no character
// pattern survives to trigger detection. This is the safety net: a reviewer
// looking at the source scan who spots an un-flagged formula can force a
// Mathpix re-pass on that exact question's crop, using the boundingBox and
// pageImageRef already stored on the queue row (see schema-additions.prisma).
//
// Wire to POST /api/admin/ocr-review-queue/:id/recheck-formula

import { PrismaClient } from '@prisma/client';
import { cropToBoundingBox } from '../pipeline/imageCrop.js';
import { runMathOcr } from '../ocr/ocrService.js';
import { getOcrSettings } from './ocrSettingsService.js';
import fs from 'fs/promises'; // swap for your actual storage client (S3, GCS, etc.)

const prisma = new PrismaClient();

/**
 * @param {string} queueId
 */
async function recheckFormula(queueId) {
  const item = await prisma.ocrReviewQueue.findUniqueOrThrow({ where: { id: queueId } });

  if (!item.boundingBoxJson || !item.pageImageRef) {
    throw new Error(
      'This queue item has no stored bounding box / page image reference -- ' +
        'it predates this feature, or was ingested before boundingBoxJson was populated.'
    );
  }

  // Adjust to however you actually fetch a stored page image (S3 getObject,
  // GCS download, local file read, etc.) -- this assumes local disk as a
  // placeholder.
  const pageImageBuffer = await fs.readFile(item.pageImageRef);
  const pageImageBase64 = pageImageBuffer.toString('base64');

  const croppedImage = await cropToBoundingBox(pageImageBase64, item.boundingBoxJson, {
    paddingPx: 12,
  });

  const settings = await getOcrSettings();
  const result = await runMathOcr({ imageBase64: croppedImage, mimeType: 'image/png' }, settings);

  return prisma.ocrReviewQueue.update({
    where: { id: queueId },
    data: { mathOcrLatex: result.text },
  });
}

export { recheckFormula };
