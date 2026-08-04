import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

// Generic dynamic hierarchy CRUD — Super Admin/Admin can add any number of
// exams/subjects/units/chapters/topics/subtopics at any time; nothing here
// is hardcoded to TNPSC/UPSC/NEET/etc, those are just rows created via seed.

router.get('/exams', requirePermission('content.read'), async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({ include: { subjects: true }, orderBy: { name: 'asc' } });
    res.json(exams);
  } catch (err) { next(err); }
});

router.post('/exams', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const exam = await prisma.exam.create({ data: req.body });
    await req.audit('EXAM_CREATE', 'Exam', exam.id, { code: exam.code });
    res.status(201).json(exam);
  } catch (err) { next(err); }
});

router.post('/subjects', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const subject = await prisma.subject.create({ data: req.body });
    await req.audit('SUBJECT_CREATE', 'Subject', subject.id);
    res.status(201).json(subject);
  } catch (err) { next(err); }
});

router.get('/subjects', requirePermission('content.read'), async (req, res, next) => {
  try {
    const { examId } = req.query;
    const subjects = await prisma.subject.findMany({ where: { ...(examId && { examId }) }, include: { units: true } });
    res.json(subjects);
  } catch (err) { next(err); }
});

router.post('/units', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const unit = await prisma.unit.create({ data: req.body });
    res.status(201).json(unit);
  } catch (err) { next(err); }
});

router.post('/chapters', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const chapter = await prisma.chapter.create({ data: req.body });
    res.status(201).json(chapter);
  } catch (err) { next(err); }
});

router.post('/topics', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const topic = await prisma.topic.create({ data: req.body });
    res.status(201).json(topic);
  } catch (err) { next(err); }
});

router.post('/subtopics', requirePermission('content.manage'), async (req, res, next) => {
  try {
    const subtopic = await prisma.subtopic.create({ data: req.body });
    res.status(201).json(subtopic);
  } catch (err) { next(err); }
});

export default router;
