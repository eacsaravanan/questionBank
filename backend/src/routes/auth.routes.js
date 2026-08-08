import { Router } from 'express';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import {
  authLimiter,
  passwordResetLimiter,
  recordFailedLogin,
  clearFailedLogin,
  isLockedOut,
} from '../middleware/security.js';
import { authenticate } from '../middleware/auth.js';
import { randomToken, hashSecret } from '../utils/crypto.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { notifyUser } from '../utils/notify.js';

const router = Router();
const RESET_TOKEN_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 30);

async function getRolesAndPermissions(userId) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const roles = userRoles.map((ur) => ur.role.name);
  const permissions = new Set();
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }
  return { roles, permissions: [...permissions] };
}

// POST /api/auth/login  { username, password, otp? }
router.post(
  '/login',
  authLimiter,
  body('username').isString().trim().notEmpty(),
  body('password').isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });

      const { username, password, otp } = req.body;

      if (await isLockedOut(username)) {
        return res.status(423).json({
          error: 'ACCOUNT_LOCKED',
          message: 'Too many failed attempts. Try again later or contact your administrator.',
        });
      }

      const user = await prisma.user.findUnique({ where: { username } });
      if (!user || !user.isActive) {
        await recordFailedLogin(username);
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }

      const validPassword = await argon2.verify(user.passwordHash, password);
      if (!validPassword) {
        await recordFailedLogin(username);
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }

      if (user.mfaEnabled) {
        if (!otp) {
          return res.status(401).json({ error: 'MFA_REQUIRED', message: 'One-time passcode required' });
        }
        const validOtp = authenticator.verify({ token: otp, secret: user.mfaSecret });
        if (!validOtp) {
          await recordFailedLogin(username);
          return res.status(401).json({ error: 'MFA_INVALID' });
        }
      }

      await clearFailedLogin(username);

      const { roles, permissions } = await getRolesAndPermissions(user.id);
      const accessToken = signAccessToken(user, roles, permissions);
      const refreshToken = signRefreshToken(user);

      await prisma.session.create({
        data: {
          userId: user.id,
          refreshToken,
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIp: req.ip, failedLoginCount: 0 },
      });

      await req.audit('LOGIN_SUCCESS', 'User', user.id);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          roles,
          permissions,
          mustResetPassword: user.mustResetPassword,
          preferredLanguage: user.preferredLanguage,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh { refreshToken }
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'REFRESH_TOKEN_REQUIRED' });

    const payload = verifyRefreshToken(refreshToken);
    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'SESSION_INVALID' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'SESSION_INVALID' });

    const { roles, permissions } = await getRolesAndPermissions(user.id);
    const accessToken = signAccessToken(user, roles, permissions);
    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'REFRESH_INVALID' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.session.updateMany({
        where: { refreshToken, userId: req.user.id },
        data: { revokedAt: new Date() },
      });
    }
    await req.audit('LOGOUT', 'User', req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: req.user.roles,
      permissions: req.user.permissions,
      preferredLanguage: user.preferredLanguage,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------
// Password reset — three related but distinct flows:
//   1. POST /forgot-password  — public, emailed-link, self-service
//   2. POST /reset-password   — public, consumes the emailed token
//   3. POST /change-password  — authenticated, "I know my current password
//      and want to set a new one" (used by the Profile page for every role)
// A fourth flow — admin-assisted force-reset — lives in user.routes.js
// since it's scoped by the RBAC permission for managing OTHER users.
// -----------------------------------------------------------------------

// POST /api/auth/forgot-password { email }
// Always responds 200 with the same generic message whether or not the
// email exists, and is rate-limited — both deliberately, to prevent using
// this endpoint to enumerate registered emails.
router.post(
  '/forgot-password',
  passwordResetLimiter,
  body('email').isString().trim().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });

      const { email } = req.body;
      const genericResponse = {
        ok: true,
        message: 'If an account exists for that email, a password reset link has been sent.',
      };

      const user = await prisma.user.findFirst({ where: { email, isActive: true } });
      if (!user) {
        // Deliberately identical response/timing-shape to the "user found"
        // path below — do not branch on this in a way that's observable.
        return res.json(genericResponse);
      }

      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashSecret(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
          requestIp: req.ip,
        },
      });

      const resetUrl = `${process.env.FRONTEND_URL || ''}/reset-password?token=${token}`;
      await notifyUser(
        user,
        'PASSWORD_RESET_REQUESTED',
        'Reset your password',
        `We received a request to reset your password. This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this message.`
      );

      await req.audit('PASSWORD_RESET_REQUESTED', 'User', user.id);
      res.json(genericResponse);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/reset-password { token, newPassword }
router.post(
  '/reset-password',
  passwordResetLimiter,
  body('token').isString().notEmpty(),
  body('newPassword').isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });

      const { token, newPassword } = req.body;
      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: 'WEAK_PASSWORD', problems: strength.problems });
      }

      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashSecret(token) } });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
      }

      const passwordHash = await argon2.hash(newPassword);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash, mustResetPassword: false, failedLoginCount: 0 },
        }),
        prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
        // Reset via a stolen/guessed link should not leave existing
        // sessions (possibly the attacker's own, if the account was
        // already compromised) valid.
        prisma.session.updateMany({ where: { userId: record.userId }, data: { revokedAt: new Date() } }),
      ]);

      const user = await prisma.user.findUnique({ where: { id: record.userId } });
      await notifyUser(
        user,
        'PASSWORD_RESET_COMPLETED',
        'Your password was changed',
        'Your password was just reset. If this wasn\'t you, contact your administrator immediately.'
      );

      req.user = { id: record.userId }; // req.audit reads req.user; this isn't an authenticated request
      await req.audit('PASSWORD_RESET_COMPLETED', 'User', record.userId);

      res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/change-password { currentPassword, newPassword }
// Self-service, for a logged-in user who knows their current password —
// backs the "Security" section on the Profile page for every role.
router.post(
  '/change-password',
  authenticate,
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'VALIDATION_ERROR', details: errors.array() });

      const { currentPassword, newPassword } = req.body;
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(404).json({ error: 'NOT_FOUND' });

      const validCurrent = await argon2.verify(user.passwordHash, currentPassword);
      if (!validCurrent) return res.status(401).json({ error: 'CURRENT_PASSWORD_INCORRECT' });

      const strength = validatePasswordStrength(newPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: 'WEAK_PASSWORD', problems: strength.problems });
      }

      const passwordHash = await argon2.hash(newPassword);
      const currentRefreshToken = req.body.refreshToken; // let the caller keep its own session alive

      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustResetPassword: false } }),
        prisma.session.updateMany({
          where: { userId: user.id, ...(currentRefreshToken ? { refreshToken: { not: currentRefreshToken } } : {}) },
          data: { revokedAt: new Date() },
        }),
      ]);

      await notifyUser(
        user,
        'PASSWORD_CHANGED',
        'Your password was changed',
        'Your password was just changed. If this wasn\'t you, contact your administrator immediately.'
      );
      await req.audit('PASSWORD_CHANGED', 'User', user.id);

      res.json({ ok: true, message: 'Password updated.' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
