import { Router } from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { notifyUser } from '../utils/notify.js';

const router = Router();
router.use(authenticate);

// GET /api/users
router.get('/', requirePermission('user.read'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users.map((u) => ({
      id: u.id, username: u.username, email: u.email, fullName: u.fullName,
      isActive: u.isActive, employeeCode: u.employeeCode,
      roles: u.roles.map((r) => r.role.name),
      lastLoginAt: u.lastLoginAt,
    })));
  } catch (err) { next(err); }
});

// POST /api/users  — Super Admin creates any number of employees/admins/SMEs
router.post('/', requirePermission('user.create'), async (req, res, next) => {
  try {
    const { username, email, fullName, employeeCode, roleIds = [] } = req.body;

    // A unique column treats "" as a real, colliding value in Postgres —
    // only NULL is exempt from the uniqueness check. Since employeeCode is
    // optional, an empty/blank submission must become undefined here, not
    // "", or the second blank-code account ever created will always fail.
    const normalizedEmployeeCode = employeeCode && employeeCode.trim() ? employeeCode.trim() : undefined;

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        username, email, fullName, employeeCode: normalizedEmployeeCode,
        passwordHash,
        mustResetPassword: true,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });

    await notifyUser(user, 'ACCOUNT_CREATED', 'Your account has been created',
      `Username: ${username}\nTemporary password: ${tempPassword}\nYou will be required to change this on first login.`);

    await req.audit('USER_CREATE', 'User', user.id, { username, roleIds });
    res.status(201).json({ id: user.id, username: user.username });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id  — edit / activate / deactivate
router.patch('/:id', requirePermission('user.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, isActive, roleIds } = req.body;

    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (email !== undefined) data.email = email;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data });
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      return updated;
    });

    await req.audit('USER_UPDATE', 'User', id, req.body);
    res.json({ id: user.id });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', requirePermission('user.delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.user.update({ where: { id }, data: { isActive: false } }); // soft delete — never hard-delete audit-linked accounts
    await req.audit('USER_DEACTIVATE', 'User', id);
    res.status(204).send();
  } catch (err) { next(err); }
});

// DELETE /api/users/:id/permanent
// True hard delete. Only allowed when the account has no content or history
// tied to it that would break referential integrity (created questions,
// papers, exam attempts, audit log entries, etc.) — those relations exist
// specifically so the platform's audit trail stays trustworthy, so a user
// who has ever done anything on the platform can't be silently erased from
// it. In that case this returns a clear explanation rather than a raw
// database error, and deactivating (the button above) remains the correct
// action for those accounts.
router.delete('/:id/permanent', requirePermission('user.delete'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });
    if (target.username === 'superadmin') {
      return res.status(400).json({ error: 'PROTECTED_ACCOUNT', message: 'The system Super Admin account cannot be deleted.' });
    }

    const [questionCount, paperCount, auditCount, attemptCount, reviewCount, approvalCount] = await Promise.all([
      prisma.question.count({ where: { createdById: id } }),
      prisma.questionPaper.count({ where: { createdById: id } }),
      prisma.auditLog.count({ where: { userId: id } }),
      prisma.examAttempt.count({ where: { userId: id } }),
      prisma.questionReview.count({ where: { reviewerId: id } }),
      prisma.paperApproval.count({ where: { approverId: id } }),
    ]);
    const linkedRecordCount = questionCount + paperCount + auditCount + attemptCount + reviewCount + approvalCount;

    if (linkedRecordCount > 0) {
      return res.status(409).json({
        error: 'HAS_LINKED_RECORDS',
        message:
          `This account can't be permanently deleted — it has ${linkedRecordCount} linked record(s) ` +
          `(questions, papers, reviews, audit log entries, or exam attempts) that other parts of the ` +
          `platform depend on for history and audit purposes. Deactivate it instead — that immediately ` +
          `blocks the account from signing in while preserving that history.`,
      });
    }

    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.userRole.deleteMany({ where: { userId: id } }),
      prisma.notification.deleteMany({ where: { userId: id } }),
      prisma.smeSubjectAssignment.deleteMany({ where: { userId: id } }),
      prisma.examRegistration.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await req.audit('USER_PERMANENT_DELETE', 'User', id, { username: target.username });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/users/:id/assign-subject  { subjectId, role: 'SME'|'APPROVER' }
router.post('/:id/assign-subject', requirePermission('user.update'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subjectId, role } = req.body;
    const assignment = await prisma.smeSubjectAssignment.create({ data: { userId: id, subjectId, role } });
    await req.audit('SUBJECT_ASSIGNMENT_CREATE', 'User', id, { subjectId, role });
    res.status(201).json(assignment);
  } catch (err) { next(err); }
});

// --- Roles & Permissions (fully dynamic — Super Admin can add new ones any time) ---

router.get('/roles/all', requirePermission('role.read'), async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    res.json(roles);
  } catch (err) { next(err); }
});

router.post('/roles', requirePermission('role.create'), async (req, res, next) => {
  try {
    const { name, description, permissionCodes = [] } = req.body;
    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    const role = await prisma.role.create({
      data: {
        name, description,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });
    await req.audit('ROLE_CREATE', 'Role', role.id, { name, permissionCodes });
    res.status(201).json(role);
  } catch (err) { next(err); }
});

export default router;
