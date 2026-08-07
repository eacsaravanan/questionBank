import { Router } from 'express';
import sharp from 'sharp';
import fs from 'fs/promises';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadOcrSource } from '../config/upload.js';
import { segmentOcrText } from '../utils/ocrSegment.js';
import { logger } from '../utils/logger.js';
import { runOcr, getOcrConfig } from '../utils/ocrProviders.js';
import { extractDocxText, extractPdfText } from '../utils/documentExtract.js';

const router = Router();
router.use(authenticate);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Preprocessing pass before handing an IMAGE to OCR. None of this makes
 * OCR perfect — no OCR engine, free or paid, guarantees that on a
 * watermarked scan with small subscripted text — but each step targets a
 * specific, common failure mode: evening out lighting, upscaling small
 * screenshots, and suppressing light-gray watermark text. Applies
 * regardless of which OCR provider is configured.
 */
async function preprocessForOcr(inputPath) {
  const outputPath = inputPath.replace(/(\.\w+)$/, '-preprocessed.png');
  await sharp(inputPath)
    .resize({ width: 2400, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(200)
    .toFile(outputPath);
  return outputPath;
}

function parseSkipPages(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
  );
}

/**
 * POST /api/questions/ocr-extract
 * multipart/form-data:
 *   image=<file>            (image, PDF, or .docx)
 *   fromPage, toPage         (optional, PDF only, 1-indexed inclusive)
 *   skipPages                (optional, PDF only, comma-separated e.g. "1,10,100")
 *
 * Returns: { sourceRef, rawText, questions: [...], meta }
 * `questions` may contain ONE entry or SEVERAL — one per detected question
 * in the source. Blocks that don't look like real MCQ questions
 * (instructions, front-matter, stray numbered text with no options) are
 * dropped automatically rather than surfaced as fake questions.
 */
router.post('/ocr-extract', requirePermission('question.create'), uploadOcrSource.single('image'), async (req, res, next) => {
  let preprocessedPath;
  try {
    if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
    const sourceRef = `/uploads/ocr-source/${req.file.filename}`;
    const mimeType = req.file.mimetype;

    let rawText;
    let confidence = null;
    let meta = {};

    if (mimeType === DOCX_MIME) {
      // DOCX always has a real text layer — no OCR needed, fast at any
      // page count.
      rawText = await extractDocxText(req.file.path);
      meta = { source: 'docx-text-layer' };

    } else if (mimeType === 'application/pdf') {
      const fromPage = req.body.fromPage ? parseInt(req.body.fromPage, 10) : undefined;
      const toPage = req.body.toPage ? parseInt(req.body.toPage, 10) : undefined;
      const skipPages = parseSkipPages(req.body.skipPages);

      const extracted = await extractPdfText(req.file.path, { fromPage, toPage, skipPages });

      if (!extracted.looksDigital) {
        // This PDF's text layer is empty/sparse — it's a scanned or
        // image-only PDF. Per-page OCR for scanned PDFs isn't supported
        // in this version (it needs image-rendering infrastructure this
        // build doesn't include yet). Being upfront about that here
        // rather than returning empty/garbage results.
        return res.status(422).json({
          error: 'SCANNED_PDF_NOT_SUPPORTED',
          message:
            `This PDF appears to be scanned/image-only (page ${extracted.pagesProcessed} averaged very little extractable text) — ` +
            `OCR on scanned PDF pages isn't supported yet. For now: convert the pages you need to PNG/JPEG images ` +
            `(e.g. a screenshot, or "Export as image" in your PDF viewer) and upload those instead — the image ` +
            `upload path works for scanned content.`,
          totalPages: extracted.totalPages,
        });
      }

      rawText = extracted.text;
      meta = { source: 'pdf-text-layer', totalPages: extracted.totalPages, pagesProcessed: extracted.pagesProcessed };

    } else {
      // Image path — run through the configured OCR provider (Tesseract
      // by default; Google Cloud Vision or a custom API if the Super
      // Admin has configured one under System Configuration).
      try {
        preprocessedPath = await preprocessForOcr(req.file.path);
      } catch (preErr) {
        logger.warn({ err: preErr }, 'OCR preprocessing failed, falling back to original image');
        preprocessedPath = req.file.path;
      }

      const ocrConfig = await getOcrConfig();
      const result = await runOcr(preprocessedPath, ocrConfig);
      rawText = result.text;
      confidence = result.confidence;
      meta = { source: `ocr:${ocrConfig.provider}` };
    }

    const questions = segmentOcrText(rawText).map((q) => ({
      ...q,
      ocrConfidence: confidence,
    }));

    await req.audit('QUESTION_OCR_EXTRACT', 'OcrJob', sourceRef, {
      questionCount: questions.length,
      confidence,
      ...meta,
    });

    res.json({ sourceRef, rawText, confidence, questions, meta });
  } catch (err) {
    if (err.message === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({
        error: 'UNSUPPORTED_FILE_TYPE',
        message: 'Supported formats: PNG, JPEG, WebP images, PDF, and .docx (legacy .doc is not supported — re-save as .docx).',
      });
    }
    next(err);
  } finally {
    if (preprocessedPath && preprocessedPath !== req.file?.path) {
      fs.unlink(preprocessedPath).catch(() => {});
    }
  }
});

export default router;
