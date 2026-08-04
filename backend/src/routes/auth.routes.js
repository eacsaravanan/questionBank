import { Router } from 'express';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { authLimiter, recordFailedLogin, clearFailedLogin, isLockedOut } from '../middleware/security.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

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

export default router;
