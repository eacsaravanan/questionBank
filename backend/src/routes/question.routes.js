import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { tanglishToTamil, tanglishToTamilWordVariants } from '../utils/transliterate.js';
import { notifyUser } from '../utils/notify.js';

const router = Router();
router.use(authenticate);

// POST /api/questions/transliterate  { text }  -> Tanglish to Tamil (input aid, not stored)
router.post('/transliterate', (req, res) => {
  const { text = '', targetLanguage = 'ta' } = req.body;
  if (targetLanguage !== 'ta') {
    return res.status(400).json({ error: 'UNSUPPORTED_LANGUAGE', message: 'Only ta (Tamil) supported in v1' });
  }
  res.json({ result: tanglishToTamil(text) });
});

// POST /api/questions/transliterate/word  { word } -> up to 3 candidate Tamil readings
// for a single Latin word, used by the live-as-you-type Tamil input's
// suggestion picker.
router.post('/transliterate/word', (req, res) => {
  const { word = '' } = req.body;
  res.json({ candidates: tanglishToTamilWordVariants(word) });
});

async function nextHumanCode(subjectCode, chapterCode = 'GEN') {
  const count = await prisma.question.count();
  return `${subjectCode}-${chapterCode}-${String(count + 1).padStart(6, '0')}`;
}

// GET /api/questions?subjectId=&status=&page=
router.get('/', requirePermission('question.read'), async (req, res, next) => {
  try {
    const { subjectId, status, chapterId, page = 1, pageSize = 25 } = req.query;
    const where = {
      ...(subjectId && { subjectId }),
      ...(status && { status }),
      ...(chapterId && { chapterId }),
    };
    const [items, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: { translations: true, options: { include: { translations: true } }, subject: true },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.question.count({ where }),
    ]);
    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    next(err);
  }
});

// POST /api/questions  — create a new question (Admin / Question Preparator)
router.post('/', requirePermission('question.create'), async (req, res, next) => {
  try {
    const {
      subjectId, chapterId, topicId, subtopicId, type, difficulty, bloomLevel,
      marks = 1, negativeMarks = 0, timeLimitSec, source, tags = [],
      translations, // [{ languageCode, body, explanation, hint }]
      options,       // [{ isCorrect, sortOrder, translations: [{languageCode, body}] }]
    } = req.body;

    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) return res.status(404).json({ error: 'SUBJECT_NOT_FOUND' });

    const humanCode = await nextHumanCode(subject.code || subject.name.slice(0, 3).toUpperCase());

    const question = await prisma.question.create({
      data: {
        humanCode,
        subjectId,
        chapterId,
        topicId,
        subtopicId,
        type,
        difficulty,
        bloomLevel,
        marks,
        negativeMarks,
        timeLimitSec,
        source,
        tags,
        createdById: req.user.id,
        status: 'DRAFT',
        translations: { create: translations || [] },
        options: {
          create: (options || []).map((o) => ({
            isCorrect: !!o.isCorrect,
            sortOrder: o.sortOrder || 0,
            translations: { create: o.translations || [] },
          })),
        },
      },
      include: { translations: true, options: { include: { translations: true } } },
    });

    await req.audit('QUESTION_CREATE', 'Question', question.id, { humanCode });
    res.status(201).json(question);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/questions/:id  — edit
router.patch('/:id', requirePermission('question.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatable = ['difficulty', 'bloomLevel', 'marks', 'negativeMarks', 'timeLimitSec', 'source', 'tags', 'status'];
    const data = {};
    for (const key of updatable) if (key in req.body) data[key] = req.body[key];

    const question = await prisma.question.update({ where: { id }, data });
    await req.audit('QUESTION_UPDATE', 'Question', id, data);
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// POST /api/questions/:id/submit-for-review
router.post('/:id/submit-for-review', requirePermission('question.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await prisma.question.update({
      where: { id },
      data: { status: 'SUBMITTED_FOR_REVIEW' },
      include: { subject: true },
    });

    // Notify the SME assigned to this subject
    const assignment = await prisma.smeSubjectAssignment.findFirst({
      where: { subjectId: question.subjectId, role: 'SME' },
      include: { user: true },
    });
    if (assignment) {
      await notifyUser(assignment.user, 'QUESTION_REVIEW_REQUESTED', 'Question ready for review', `Question ${question.humanCode} is ready for your review.`);
    }

    await req.audit('QUESTION_SUBMIT_FOR_REVIEW', 'Question', id);
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// POST /api/questions/:id/review  { action: APPROVE|REQUEST_CHANGES, comment }  — SME
router.post('/:id/review', requirePermission('question.review'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;

    await prisma.questionReview.create({
      data: { questionId: id, reviewerId: req.user.id, action, comment },
    });

    const newStatus = action === 'APPROVE' ? 'SME_APPROVED' : 'CHANGES_REQUESTED';
    const question = await prisma.question.update({ where: { id }, data: { status: newStatus } });

    if (newStatus === 'SME_APPROVED') {
      const superAdmins = await prisma.user.findMany({
        where: { roles: { some: { role: { name: 'Super Admin' } } } },
      });
      for (const sa of superAdmins) {
        await notifyUser(sa, 'QUESTION_SME_APPROVED', 'Question SME-approved', `Question ${question.humanCode} approved by SME, pending final approval.`);
      }
    } else {
      const creator = await prisma.user.findUnique({ where: { id: question.createdById } });
      await notifyUser(creator, 'QUESTION_CHANGES_REQUESTED', 'Changes requested', `Question ${question.humanCode}: ${comment || 'changes requested'}`);
    }

    await req.audit('QUESTION_REVIEW', 'Question', id, { action, comment });
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// POST /api/questions/:id/approve  — Super Admin final approval / publish
router.post('/:id/approve', requirePermission('question.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await prisma.question.update({
      where: { id },
      data: { status: 'SUPER_ADMIN_APPROVED' },
    });
    await req.audit('QUESTION_APPROVE', 'Question', id);
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/questions/:id
router.delete('/:id', requirePermission('question.delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.question.delete({ where: { id } });
    await req.audit('QUESTION_DELETE', 'Question', id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
