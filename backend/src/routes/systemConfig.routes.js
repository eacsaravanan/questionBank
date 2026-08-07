import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { encryptField } from '../utils/crypto.js';

const router = Router();
router.use(authenticate);

// PUT /api/system-config/smtp  { host, port, secure, username, password, fromAddress }
router.put('/smtp', requirePermission('system.configure'), async (req, res, next) => {
  try {
    const { host, port, secure, username, password, fromAddress } = req.body;

    // If the password field was left blank, carry forward whatever
    // encryptedPassword is already stored rather than dropping it —
    // "leave blank to keep it" needs to actually be true.
    let encryptedPassword;
    if (password) {
      encryptedPassword = encryptField(password);
    } else {
      const existing = await prisma.systemConfig.findUnique({ where: { key: 'smtp' } });
      encryptedPassword = existing?.value?.encryptedPassword;
    }

    const value = {
      host, port, secure, username, fromAddress,
      ...(encryptedPassword && { encryptedPassword }),
    };
    await prisma.systemConfig.upsert({
      where: { key: 'smtp' },
      update: { value, isSecret: true },
      create: { key: 'smtp', value, isSecret: true },
    });
    await req.audit('SYSTEM_CONFIG_UPDATE', 'SystemConfig', 'smtp');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/system-config/smtp — returns config WITHOUT the secret
router.get('/smtp', requirePermission('system.configure'), async (req, res, next) => {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'smtp' } });
    if (!cfg) return res.json(null);
    const { encryptedPassword, ...safe } = cfg.value;
    res.json({ ...safe, passwordSet: !!encryptedPassword });
  } catch (err) { next(err); }
});

// ---- Exam master configuration (per-exam marking scheme, sections, etc.) ----

// POST /api/system-config/exam-master-config
// { examId, name, totalQuestions, totalMarks, qualifyingMarks, negativeMarking, negativeMarkValue, durationMinutes, sections }
router.post('/exam-master-config', requirePermission('exam.configure'), async (req, res, next) => {
  try {
    const config = await prisma.examMasterConfig.create({ data: req.body });
    await req.audit('EXAM_MASTER_CONFIG_CREATE', 'ExamMasterConfig', config.id);
    res.status(201).json(config);
  } catch (err) { next(err); }
});

router.get('/exam-master-config', requirePermission('exam.configure'), async (req, res, next) => {
  try {
    const { examId } = req.query;
    const configs = await prisma.examMasterConfig.findMany({ where: { ...(examId && { examId }) } });
    res.json(configs);
  } catch (err) { next(err); }
});

// ---- OCR engine configuration ----

// PUT /api/system-config/ocr
// { provider: 'tesseract'|'google-vision'|'custom', apiKey?, secretKey?, endpointUrl? }
router.put('/ocr', requirePermission('ocr.configure'), async (req, res, next) => {
  try {
    const { provider, apiKey, secretKey, endpointUrl } = req.body;
    if (!['tesseract', 'google-vision', 'custom'].includes(provider)) {
      return res.status(400).json({ error: 'INVALID_PROVIDER', message: 'Unknown OCR provider.' });
    }
    if (provider === 'google-vision' && !apiKey) {
      const existing = await prisma.systemConfig.findUnique({ where: { key: 'ocr' } });
      if (!existing?.value?.encryptedApiKey) {
        return res.status(400).json({ error: 'API_KEY_REQUIRED', message: 'An API key is required for Google Cloud Vision.' });
      }
    }
    if (provider === 'custom' && !endpointUrl) {
      return res.status(400).json({ error: 'ENDPOINT_REQUIRED', message: 'A custom provider needs an endpoint URL.' });
    }

    const existing = await prisma.systemConfig.findUnique({ where: { key: 'ocr' } });
    const value = {
      provider,
      endpointUrl: endpointUrl || null,
      encryptedApiKey: apiKey ? encryptField(apiKey) : existing?.value?.encryptedApiKey,
      encryptedSecretKey: secretKey ? encryptField(secretKey) : existing?.value?.encryptedSecretKey,
    };

    await prisma.systemConfig.upsert({
      where: { key: 'ocr' },
      update: { value, isSecret: true },
      create: { key: 'ocr', value, isSecret: true },
    });
    await req.audit('SYSTEM_CONFIG_UPDATE', 'SystemConfig', 'ocr', { provider });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/system-config/ocr — returns config WITHOUT secrets
router.get('/ocr', requirePermission('ocr.configure'), async (req, res, next) => {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'ocr' } });
    if (!cfg) return res.json({ provider: 'tesseract', endpointUrl: null, apiKeySet: false, secretKeySet: false });
    res.json({
      provider: cfg.value.provider,
      endpointUrl: cfg.value.endpointUrl,
      apiKeySet: !!cfg.value.encryptedApiKey,
      secretKeySet: !!cfg.value.encryptedSecretKey,
    });
  } catch (err) { next(err); }
});

export default router;
