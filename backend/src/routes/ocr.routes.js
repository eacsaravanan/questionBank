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
import { detectDuplicates } from '../utils/duplicateDetection.js';
import { prisma } from '../config/db.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
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

/**
 * Rasterizes a PDF's pages to PNG images via pdftoppm (poppler-utils,
 * already installed in the backend image) for scanned/image-only PDFs
 * whose text layer is empty ΓÇö extractPdfText() can tell us that
 * (looksDigital: false), but can't extract anything from them since
 * there's no text to read. This is the OCR fallback path.
 *
 * Honors the SAME fromPage/toPage/skipPages contract as extractPdfText,
 * so a scanned and a digital PDF behave identically to the caller ΓÇö
 * pdftoppm's -f/-l flags handle the page RANGE directly; skipPages is
 * filtered out of the resulting file list afterward since pdftoppm has
 * no "skip these specific pages" option of its own.
 */
async function rasterizeScannedPdfPages(pdfPath, { fromPage, toPage, skipPages = new Set(), totalPages }) {
  const start = fromPage ? Math.max(1, fromPage) : 1;
  const end = toPage ? Math.min(totalPages, toPage) : totalPages;

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-pdf-'));
  const outPrefix = path.join(outDir, 'page');
  await execAsync(`pdftoppm -r 300 -png -f ${start} -l ${end} "${pdfPath}" "${outPrefix}"`);

  const files = (await fs.readdir(outDir)).filter((f) => f.endsWith('.png')).sort();
  const pages = [];
  for (const file of files) {
    const match = file.match(/-(\d+)\.png$/);
    const pageNum = match ? parseInt(match[1], 10) : null;
    if (pageNum !== null && skipPages.has(pageNum)) continue;
    pages.push({ pageNum, imagePath: path.join(outDir, file) });
  }
  return { pages, tempDir: outDir };
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
  let scannedPdfTempDir;
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
      const forceOcr = true; // TEMPORARY re-enabled ΓÇö always OCR every PDF until the real checkbox exists
      const fromPage = req.body.fromPage ? parseInt(req.body.fromPage, 10) : undefined;
      const toPage = req.body.toPage ? parseInt(req.body.toPage, 10) : undefined;
      const skipPages = parseSkipPages(req.body.skipPages);

      const extracted = await extractPdfText(req.file.path, { fromPage, toPage, skipPages });

      if (forceOcr || !extracted.looksDigital) {
        // Scanned/image-only PDF ΓÇö rasterize the requested page range and
        // run each page through the same OCR pipeline used for single
        // image uploads, then concatenate results in page order before
        // handing off to the segmenter, exactly as extractPdfText does for
        // digital PDFs below.
        const { pages, tempDir } = await rasterizeScannedPdfPages(req.file.path, {
          fromPage, toPage, skipPages, totalPages: extracted.totalPages,
        });
        scannedPdfTempDir = tempDir; // cleaned up in `finally` below

        const ocrConfig = await getOcrConfig();
        const pageTexts = [];
        const pageConfidences = [];
        for (const page of pages) {
          let pagePreprocessed;
          try {
            pagePreprocessed = await preprocessForOcr(page.imagePath);
          } catch (preErr) {
            logger.warn({ err: preErr, page: page.pageNum }, 'OCR preprocessing failed for scanned PDF page, using raw render');
            pagePreprocessed = page.imagePath;
          }
          const result = await runOcr(pagePreprocessed, ocrConfig);
          pageTexts.push(result.text);
          pageConfidences.push(result.confidence);
        }

        rawText = pageTexts.join('\n');
        confidence = pageConfidences.length
          ? pageConfidences.reduce((a, b) => a + b, 0) / pageConfidences.length
          : null;
        meta = {
          source: `ocr:pdf-scan:${ocrConfig.provider}`,
          totalPages: extracted.totalPages,
          pagesProcessed: pages.length,
        };
      } else {
        rawText = extracted.text;
        meta = { source: 'pdf-text-layer', totalPages: extracted.totalPages, pagesProcessed: extracted.pagesProcessed };
      }

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
      // sourceTag (e.g. "CCS4T/19"), if the segmenter found one, becomes
      // the starting point for this question's "Previously asked in" —
      // surfaced as method: OCR_SOURCE_TAG so the reviewer can see it was
      // read off the page rather than typed or auto-matched.
      previousAppearances: q.sourceTag
        ? [{ label: q.sourceTag, method: 'OCR_SOURCE_TAG', confidence: null }]
        : [],
    }));

    // Duplicate-reuse detection against the existing bank, gated by the
    // Super Admin's System Configuration toggle. Runs per extracted
    // question and MERGES into previousAppearances rather than
    // overwriting the OCR_SOURCE_TAG entry above — a question can
    // legitimately have both (the paper printed one prior exam code, and
    // the bank separately already has it filed under a different one).
    // Every suggestion here is unconfirmed (no confirmedById) until a
    // human accepts it in the Question Builder review queue.
    try {
      const dupConfig = await prisma.systemConfig.findUnique({ where: { key: 'duplicateDetection' } });
      const mode = dupConfig?.value?.mode || 'both';
      if (mode === 'automatic' || mode === 'both') {
        const threshold = dupConfig?.value?.threshold;
        for (const q of questions) {
          const matches = await detectDuplicates(prisma, {
            englishBody: q.questionText,
            ...(threshold !== undefined ? { threshold } : {}),
          });
          for (const m of matches) {
            q.previousAppearances.push({
              label: m.papers[0] || `Question ${m.humanCode}`,
              method: 'AUTO_DUPLICATE',
              confidence: m.similarity,
              matchedQuestionId: m.questionId,
            });
          }
        }
      }
    } catch (dupErr) {
      // Duplicate suggestions are a convenience, not a correctness
      // requirement — never let a failure here block the OCR import
      // itself.
      logger.warn({ err: dupErr }, 'Duplicate detection pass failed during OCR extract');
    }

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
    if (scannedPdfTempDir) {
      fs.rm(scannedPdfTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

export default router;
