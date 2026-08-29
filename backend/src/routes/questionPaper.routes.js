import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { notifyUser } from '../utils/notify.js';

const router = Router();
router.use(authenticate);

// GET /api/question-papers?status=&examId=
router.get('/', requirePermission('paper.read'), async (req, res, next) => {
  try {
    const { status, examId } = req.query;
    const papers = await prisma.questionPaper.findMany({
      where: { ...(status && { status }), ...(examId && { examId }) },
      include: { exam: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(papers);
  } catch (err) {
    next(err);
  }
});

// POST /api/question-papers  { examId, masterConfigId, title, paperType, questionIds: [] }
// Super Admin (or Admin, with a permission) consolidates pre-approved
// SME-reviewed questions into a full paper.
router.post('/', requirePermission('paper.create'), async (req, res, next) => {
  try {
    const { examId, masterConfigId, title, paperType, questionIds = [] } = req.body;

    // Only questions that have cleared SME approval can enter a paper.
    const eligible = await prisma.question.findMany({
      where: { id: { in: questionIds }, status: { in: ['SME_APPROVED', 'SUPER_ADMIN_APPROVED'] } },
      select: { id: true },
    });
    if (eligible.length !== questionIds.length) {
      return res.status(400).json({
        error: 'INELIGIBLE_QUESTIONS',
        message: 'One or more selected questions have not yet been SME-approved',
      });
    }

    const paper = await prisma.questionPaper.create({
      data: {
        examId,
        masterConfigId,
        title,
        paperType,
        createdById: req.user.id,
        status: 'DRAFT',
        items: { create: questionIds.map((qid, idx) => ({ questionId: qid, sortOrder: idx })) },
      },
      include: { items: true },
    });

    await req.audit('PAPER_CREATE', 'QuestionPaper', paper.id, { title, count: questionIds.length });
    res.status(201).json(paper);
  } catch (err) {
    next(err);
  }
});

// POST /api/question-papers/:id/submit-for-approval
router.post('/:id/submit-for-approval', requirePermission('paper.create'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const paper = await prisma.questionPaper.update({
      where: { id },
      data: { status: 'PENDING_SME_APPROVAL' },
      include: { exam: true },
    });

    const approvers = await prisma.smeSubjectAssignment.findMany({
      where: { role: 'APPROVER' },
      include: { user: true },
      distinct: ['userId'],
    });
    for (const a of approvers) {
      await notifyUser(a.user, 'PAPER_APPROVAL_REQUESTED', 'Question paper ready for approval', `"${paper.title}" is ready for your review.`);
    }

    await req.audit('PAPER_SUBMIT_FOR_APPROVAL', 'QuestionPaper', id);
    res.json(paper);
  } catch (err) {
    next(err);
  }
});

const VALID_ANSWER_KEY_POLICIES = ['NONE', 'EMBEDDED', 'SEPARATE_SECTION'];

// POST /api/question-papers/:id/approve  { stage: 'SME'|'SUPER_ADMIN', action, comment, answerKeyPolicy? }
// Super Admin may approve at either stage themselves, per requirements.
// When finally approving at the SUPER_ADMIN stage, this is also where the
// answer-key publish decision gets made ("should this paper's exports
// include the answer key, and if so, embedded or as a separate section?")
// — answerKeyPolicy is required at that specific transition; it can still
// be revised afterwards via PATCH /:id/answer-key-policy below.
router.post('/:id/approve', requirePermission('paper.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage, action, comment, answerKeyPolicy } = req.body; // action: APPROVED | CHANGES_REQUESTED

    if (stage === 'SUPER_ADMIN' && action === 'APPROVED') {
      if (!VALID_ANSWER_KEY_POLICIES.includes(answerKeyPolicy)) {
        return res.status(400).json({
          error: 'ANSWER_KEY_POLICY_REQUIRED',
          message: 'Choose whether this paper should publish an answer key (NONE, EMBEDDED, or SEPARATE_SECTION) before giving final approval.',
        });
      }
    }

    await prisma.paperApproval.create({
      data: { paperId: id, approverId: req.user.id, stage, action, comment },
    });

    let newStatus;
    if (action === 'CHANGES_REQUESTED') newStatus = 'CHANGES_REQUESTED';
    else if (stage === 'SME') newStatus = 'PENDING_SUPER_ADMIN_APPROVAL';
    else newStatus = 'APPROVED';

    const paper = await prisma.questionPaper.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === 'APPROVED' && {
          answerKeyPolicy,
          answerKeyPolicySetAt: new Date(),
        }),
      },
    });

    if (newStatus === 'PENDING_SUPER_ADMIN_APPROVAL') {
      const superAdmins = await prisma.user.findMany({ where: { roles: { some: { role: { name: 'Super Admin' } } } } });
      for (const sa of superAdmins) {
        await notifyUser(sa, 'PAPER_FINAL_APPROVAL_REQUIRED', 'Final approval required', `"${paper.title}" is ready for final approval.`);
      }
    }

    await req.audit('PAPER_APPROVE', 'QuestionPaper', id, { stage, action, comment, answerKeyPolicy });
    res.json(paper);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/question-papers/:id/answer-key-policy  { policy }
// Lets Super Admin revise the answer-key publish decision after final
// approval too (e.g. an already-approved paper needs its policy flipped
// from NONE to SEPARATE_SECTION ahead of a re-export) without re-running
// the whole approval workflow.
router.patch('/:id/answer-key-policy', requirePermission('paper.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { policy } = req.body;
    if (!VALID_ANSWER_KEY_POLICIES.includes(policy)) {
      return res.status(400).json({ error: 'INVALID_POLICY', message: `policy must be one of: ${VALID_ANSWER_KEY_POLICIES.join(', ')}` });
    }

    const paper = await prisma.questionPaper.update({
      where: { id },
      data: { answerKeyPolicy: policy, answerKeyPolicySetAt: new Date() },
    });
    await req.audit('PAPER_ANSWER_KEY_POLICY_UPDATE', 'QuestionPaper', id, { policy });
    res.json(paper);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/question-papers/:id
// A paper can only be removed while it's still "in flight" — DRAFT, awaiting
// either approval stage, or kicked back with changes requested. Once it's
// APPROVED it may already be referenced by an ExamSchedule (or about to be),
// so deletion is blocked from that point on to avoid orphaning a scheduled
// exam; use the exam-schedules flow to cancel a scheduled exam instead.
const DELETABLE_PAPER_STATUSES = ['DRAFT', 'PENDING_SME_APPROVAL', 'PENDING_SUPER_ADMIN_APPROVAL', 'CHANGES_REQUESTED'];

router.delete('/:id', requirePermission('paper.delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.questionPaper.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });

    const isSuperAdmin = req.user.roles?.includes('Super Admin');
    if (!isSuperAdmin && existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only delete papers you created.' });
    }

    if (!DELETABLE_PAPER_STATUSES.includes(existing.status)) {
      return res.status(409).json({
        error: 'NOT_DELETABLE',
        message: `"${existing.title}" is ${existing.status.replaceAll('_', ' ').toLowerCase()} and can no longer be deleted. Cancel its exam schedule first if it needs to be removed.`,
      });
    }

    // Items and approval history cascade automatically (see schema); the
    // approved questions themselves are untouched and remain available to
    // include in another paper.
    await prisma.questionPaper.delete({ where: { id } });
    await req.audit('PAPER_DELETE', 'QuestionPaper', id, { title: existing.title, status: existing.status });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
