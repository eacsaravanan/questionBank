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

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        username, email, fullName, employeeCode,
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
