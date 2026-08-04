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

export default router;
