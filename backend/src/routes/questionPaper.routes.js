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

// POST /api/question-papers/:id/approve  { stage: 'SME'|'SUPER_ADMIN', action, comment }
// Super Admin may approve at either stage themselves, per requirements.
router.post('/:id/approve', requirePermission('paper.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stage, action, comment } = req.body; // action: APPROVED | CHANGES_REQUESTED

    await prisma.paperApproval.create({
      data: { paperId: id, approverId: req.user.id, stage, action, comment },
    });

    let newStatus;
    if (action === 'CHANGES_REQUESTED') newStatus = 'CHANGES_REQUESTED';
    else if (stage === 'SME') newStatus = 'PENDING_SUPER_ADMIN_APPROVAL';
    else newStatus = 'APPROVED';

    const paper = await prisma.questionPaper.update({ where: { id }, data: { status: newStatus } });

    if (newStatus === 'PENDING_SUPER_ADMIN_APPROVAL') {
      const superAdmins = await prisma.user.findMany({ where: { roles: { some: { role: { name: 'Super Admin' } } } } });
      for (const sa of superAdmins) {
        await notifyUser(sa, 'PAPER_FINAL_APPROVAL_REQUIRED', 'Final approval required', `"${paper.title}" is ready for final approval.`);
      }
    }

    await req.audit('PAPER_APPROVE', 'QuestionPaper', id, { stage, action, comment });
    res.json(paper);
  } catch (err) {
    next(err);
  }
});

export default router;
