import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { examLimiter } from '../middleware/security.js';
import { hashSecret, randomToken } from '../utils/crypto.js';
import { notifyUser } from '../utils/notify.js';

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// Super Admin: list & inspect schedules
// ---------------------------------------------------------------------------

// GET /api/exam-schedules
router.get('/', requirePermission('exam.schedule'), async (req, res, next) => {
  try {
    const schedules = await prisma.examSchedule.findMany({
      include: {
        exam: true,
        paper: { select: { id: true, title: true } },
        examCenter: true,
        _count: { select: { registrations: true, attempts: true } },
      },
      orderBy: { scheduledStart: 'desc' },
    });
    res.json(schedules);
  } catch (err) { next(err); }
});

// GET /api/exam-schedules/:id
router.get('/:id', requirePermission('exam.schedule'), async (req, res, next) => {
  try {
    const schedule = await prisma.examSchedule.findUnique({
      where: { id: req.params.id },
      include: {
        exam: true,
        paper: { select: { id: true, title: true } },
        examCenter: true,
        registrations: { include: { user: { select: { id: true, fullName: true, username: true, email: true } } } },
      },
    });
    if (!schedule) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(schedule);
  } catch (err) { next(err); }
});

// POST /api/exam-schedules
// { examId, paperId, examCenterId, scheduledStart, scheduledEnd, config }
router.post('/', requirePermission('exam.schedule'), async (req, res, next) => {
  try {
    const { examId, paperId, examCenterId, scheduledStart, scheduledEnd, config } = req.body;

    const paper = await prisma.questionPaper.findUnique({ where: { id: paperId } });
    if (!paper || paper.status !== 'APPROVED') {
      return res.status(400).json({ error: 'PAPER_NOT_APPROVED', message: 'Only fully approved papers can be scheduled' });
    }

    const examCode = `EX-${crypto.randomInt(100000, 999999)}`;
    const releaseKey = randomToken(24); // the actual decryption/release key — shown to Super Admin ONCE
    const releaseKeyHash = hashSecret(releaseKey);

    const schedule = await prisma.examSchedule.create({
      data: {
        examId,
        paperId,
        examCenterId,
        examCode,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        releaseKeyHash,
        config,
        status: 'PENDING',
      },
    });

    await prisma.questionPaper.update({ where: { id: paperId }, data: { status: 'SCHEDULED' } });
    await req.audit('EXAM_SCHEDULE_CREATE', 'ExamSchedule', schedule.id, { examCode, scheduledStart, scheduledEnd });

    // releaseKey is returned ONLY in this response, never persisted in plaintext,
    // never logged. Operationally: store it in your org's secrets manager /
    // sealed envelope process if you need a manual override capability.
    res.status(201).json({ ...schedule, releaseKey });
  } catch (err) {
    next(err);
  }
});

// POST /api/exam-schedules/:id/register  { userIds: [] }
// Bulk-register candidates; each gets a unique, single-use verification
// code emailed out of band (never shown in the API response body itself
// beyond this admin-only call, and hashed at rest).
router.post('/:id/register', requirePermission('exam.schedule'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userIds = [] } = req.body;

    const results = [];
    for (const userId of userIds) {
      const code = crypto.randomInt(100000, 999999).toString();
      const reg = await prisma.examRegistration.create({
        data: { scheduleId: id, userId, verificationCodeHash: hashSecret(code) },
      });
      const user = await prisma.user.findUnique({ where: { id: userId } });
      await notifyUser(user, 'EXAM_VERIFICATION_CODE', 'Your exam verification code', `Your verification code for this exam is ${code}. Keep it confidential — you'll need it along with your login to start the exam.`);
      results.push({ registrationId: reg.id, userId });
    }

    await req.audit('EXAM_CANDIDATES_REGISTERED', 'ExamSchedule', id, { count: results.length });
    res.status(201).json({ registered: results.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Candidate: start & take exam — only within the scheduled window, only
// for verified, registered candidates.
// ---------------------------------------------------------------------------

// POST /api/exam-schedules/:examCode/start  { verificationCode }
router.post('/:examCode/start', examLimiter, async (req, res, next) => {
  try {
    const { examCode } = req.params;
    const { verificationCode } = req.body;

    const schedule = await prisma.examSchedule.findUnique({ where: { examCode } });
    if (!schedule) return res.status(404).json({ error: 'SCHEDULE_NOT_FOUND' });

    const now = new Date();
    if (now < schedule.scheduledStart) {
      return res.status(403).json({ error: 'NOT_YET_RELEASED', message: 'This exam has not started yet.' });
    }
    if (now > schedule.scheduledEnd) {
      return res.status(403).json({ error: 'WINDOW_CLOSED', message: 'This exam window has closed.' });
    }

    const registration = await prisma.examRegistration.findUnique({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: req.user.id } },
    });
    if (!registration) {
      return res.status(403).json({ error: 'NOT_REGISTERED', message: 'You are not registered for this exam.' });
    }
    if (hashSecret(String(verificationCode)) !== registration.verificationCodeHash) {
      await req.audit('EXAM_VERIFICATION_FAILED', 'ExamSchedule', schedule.id);
      return res.status(403).json({ error: 'VERIFICATION_FAILED', message: 'Incorrect verification code.' });
    }

    let attempt = await prisma.examAttempt.findUnique({
      where: { scheduleId_userId: { scheduleId: schedule.id, userId: req.user.id } },
    });
    if (attempt && attempt.status === 'SUBMITTED') {
      return res.status(403).json({ error: 'ALREADY_SUBMITTED', message: 'You have already submitted this exam.' });
    }
    if (!attempt) {
      attempt = await prisma.examAttempt.create({
        data: {
          scheduleId: schedule.id,
          userId: req.user.id,
          startedAt: now,
          status: 'IN_PROGRESS',
          ipAddress: req.ip,
        },
      });
    }

    const paper = await prisma.questionPaper.findUnique({
      where: { id: schedule.paperId },
      include: {
        items: {
          include: {
            question: {
              include: { translations: true, options: { include: { translations: true } } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Strip correctness flags before sending to the candidate — never leak
    // the answer key to the client under any circumstance.
    const safeItems = paper.items.map((item) => ({
      questionId: item.question.id,
      sectionName: item.sectionName,
      type: item.question.type,
      marks: item.question.marks,
      negativeMarks: item.question.negativeMarks,
      translations: item.question.translations,
      options: item.question.options.map((o) => ({ id: o.id, sortOrder: o.sortOrder, translations: o.translations })),
    }));

    await req.audit('EXAM_ATTEMPT_START', 'ExamAttempt', attempt.id);

    res.json({
      attemptId: attempt.id,
      viewMode: paper.viewMode,
      allowAnswerChange: paper.allowAnswerChange,
      scheduledEnd: schedule.scheduledEnd,
      questions: safeItems,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/exam-attempts/:attemptId/answer  { questionId, selectedOptionIds, answerText, isMarkedForReview }
router.put('/attempts/:attemptId/answer', examLimiter, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionIds = [], answerText, isMarkedForReview = false } = req.body;

    const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'ATTEMPT_NOT_FOUND' });
    if (attempt.status !== 'IN_PROGRESS') return res.status(403).json({ error: 'ATTEMPT_NOT_ACTIVE' });

    const schedule = await prisma.examSchedule.findUnique({ where: { id: attempt.scheduleId } });
    if (new Date() > schedule.scheduledEnd) {
      return res.status(403).json({ error: 'WINDOW_CLOSED', message: 'Exam time is over; this answer was not saved.' });
    }

    const answer = await prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedOptionIds, answerText, isMarkedForReview },
      create: { attemptId, questionId, selectedOptionIds, answerText, isMarkedForReview },
    });

    res.json(answer);
  } catch (err) {
    next(err);
  }
});

// POST /api/exam-attempts/:attemptId/submit
router.post('/attempts/:attemptId/submit', examLimiter, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'ATTEMPT_NOT_FOUND' });
    if (attempt.status === 'SUBMITTED') return res.status(400).json({ error: 'ALREADY_SUBMITTED' });

    const updated = await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    await req.audit('EXAM_ATTEMPT_SUBMIT', 'ExamAttempt', attemptId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/exam-attempts/:attemptId/flag  { flagType, detail }
// Client-side integrity signals: tab-switch, blur, dev-tools opened, copy/paste
// attempt, multiple-screen detection, etc. Accumulated server-side so Super
// Admin can review anomalies after the fact rather than trusting the client.
router.post('/attempts/:attemptId/flag', async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { flagType } = req.body;
    const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== req.user.id) return res.status(404).json({ error: 'ATTEMPT_NOT_FOUND' });

    const flags = attempt.integrityFlags || {};
    flags[flagType] = (flags[flagType] || 0) + 1;

    await prisma.examAttempt.update({ where: { id: attemptId }, data: { integrityFlags: flags } });
    await req.audit('EXAM_INTEGRITY_FLAG', 'ExamAttempt', attemptId, { flagType });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
