import { Router } from 'express';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs/promises';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadOcrSource } from '../config/upload.js';
import { segmentOcrText } from '../utils/ocrSegment.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticate);

/**
 * Preprocessing pass before handing the image to Tesseract. None of this
 * makes OCR perfect — no OCR engine, free or paid, guarantees that on a
 * watermarked scan with small subscripted text — but each step targets a
 * specific, common failure mode:
 *  - grayscale + normalize: evens out scan/photo lighting
 *  - sharpen: helps small/thin glyph edges (chemistry subscripts, Tamil
 *    matras) survive resizing
 *  - 2x upscale: Tesseract's accuracy drops sharply below ~300dpi-equivalent
 *    text height; screenshots are often much smaller than that
 *  - threshold: pushes light-gray watermark text toward white so it stops
 *    competing with the real (darker) question text — this is a blunt
 *    instrument and can also wash out faint real text, hence why it's
 *    tuned conservatively rather than aggressively
 */
async function preprocessForOcr(inputPath) {
  const outputPath = inputPath.replace(/(\.\w+)$/, '-preprocessed.png');
  await sharp(inputPath)
    .resize({ width: 2400, withoutEnlargement: false }) // upscale small screenshots
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(200) // conservative — suppresses light watermark gray, keeps real text
    .toFile(outputPath);
  return outputPath;
}

/**
 * POST /api/questions/ocr-extract
 * multipart/form-data: image=<file>
 *
 * Runs combined English+Tamil recognition in a single pass (this platform's
 * papers are routinely bilingual on one page) rather than requiring the
 * preparer to pick a language up front.
 *
 * Returns: { sourceRef, rawText, questions: [...] }
 * `questions` may contain ONE entry (single-question screenshot) or SEVERAL
 * (a full page with a set of questions).
 */
router.post('/ocr-extract', requirePermission('question.create'), uploadOcrSource.single('image'), async (req, res, next) => {
  let worker;
  let preprocessedPath;
  try {
    if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });

    try {
      preprocessedPath = await preprocessForOcr(req.file.path);
    } catch (preErr) {
      // Preprocessing is a best-effort accuracy boost, not a hard
      // requirement — if it fails for any reason (corrupt image, unusual
      // format), fall back to running OCR on the original upload rather
      // than failing the whole request.
      logger.warn({ err: preErr }, 'OCR preprocessing failed, falling back to original image');
      preprocessedPath = req.file.path;
    }

    worker = await createWorker('eng+tam');
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // assume a single uniform block of text — fits typical question layouts
    });
    const { data } = await worker.recognize(preprocessedPath);

    const questions = segmentOcrText(data.text).map((q) => ({
      ...q,
      ocrConfidence: Math.round(data.confidence || 0) / 100,
    }));

    const sourceRef = `/uploads/ocr-source/${req.file.filename}`;
    await req.audit('QUESTION_OCR_EXTRACT', 'OcrJob', sourceRef, {
      questionCount: questions.length,
      confidence: data.confidence,
    });

    res.json({ sourceRef, rawText: data.text, confidence: Math.round(data.confidence || 0) / 100, questions });
  } catch (err) {
    next(err);
  } finally {
    if (worker) await worker.terminate();
    if (preprocessedPath && preprocessedPath !== req.file?.path) {
      fs.unlink(preprocessedPath).catch(() => {}); // best-effort cleanup of the temp preprocessed copy
    }
  }
});

export default router;
