import { Router } from 'express';
import { createWorker } from 'tesseract.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { uploadOcrSource } from '../config/upload.js';
import { segmentOcrText } from '../utils/ocrSegment.js';

const router = Router();
router.use(authenticate);

/**
 * POST /api/questions/ocr-extract
 * multipart/form-data: image=<file>, language=eng|tam (default eng)
 *
 * Returns: { sourceRef, rawText, questions: [...] }
 * `questions` may contain ONE entry (single-question screenshot) or SEVERAL
 * (a full page with a set of questions) — the admin UI lets the preparer
 * accept each one individually, edit it, discard it, or fall back to typing
 * that one manually while accepting the rest via OCR — mixing both modes
 * freely within the same paper-preparation session.
 */
router.post('/ocr-extract', requirePermission('question.create'), uploadOcrSource.single('image'), async (req, res, next) => {
  let worker;
  try {
    if (!req.file) return res.status(400).json({ error: 'FILE_REQUIRED' });
    const lang = req.body.language === 'tam' ? 'tam' : 'eng';

    worker = await createWorker(lang);
    const { data } = await worker.recognize(req.file.path);

    const questions = segmentOcrText(data.text).map((q) => ({
      ...q,
      ocrConfidence: Math.round((data.confidence || 0)) / 100,
    }));

    const sourceRef = `/uploads/ocr-source/${req.file.filename}`;
    await req.audit('QUESTION_OCR_EXTRACT', 'OcrJob', sourceRef, { questionCount: questions.length, language: lang });

    res.json({ sourceRef, rawText: data.text, questions });
  } catch (err) {
    next(err);
  } finally {
    if (worker) await worker.terminate();
  }
});

export default router;
