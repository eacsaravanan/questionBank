import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { redis } from '../config/redis.js';

// Baseline hardening headers: CSP, HSTS, no-sniff, frameguard, etc.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // prevents the exam UI from being framed/clickjacked
    },
  },
  crossOriginEmbedderPolicy: true,
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
});

export const hppMiddleware = hpp();

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tight limiter specifically for login/auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts, try again later' },
});

// Limiter for forgot-password requests — deliberately tighter than
// authLimiter and keyed by IP (express-rate-limit default). Combined with
// the "always return 200" response in auth.routes.js, this keeps the
// endpoint from being usable either to enumerate valid emails or to spam
// a victim's inbox with reset links.
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS', message: 'Too many password reset requests, try again later' },
});

// Very tight limiter for exam attempt submission endpoints — protects
// against scripted mass-submission / automated answer harvesting during
// a live exam window.
export const examLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Application-level account lockout, on top of the IP-based rate limiter.
 * Tracks failed attempts per-username in Redis so a distributed attack
 * from many IPs against one account is still caught.
 */
export async function recordFailedLogin(username) {
  const key = `login:fail:${username}`;
  const attempts = await redis.incr(key);
  await redis.expire(key, Number(process.env.LOGIN_LOCKOUT_MINUTES || 15) * 60);
  return attempts;
}

export async function clearFailedLogin(username) {
  await redis.del(`login:fail:${username}`);
}

export async function isLockedOut(username) {
  const attempts = await redis.get(`login:fail:${username}`);
  return Number(attempts || 0) >= Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
}
