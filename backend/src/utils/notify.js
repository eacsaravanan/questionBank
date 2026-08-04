import nodemailer from 'nodemailer';
import { prisma } from '../config/db.js';
import { decryptField } from './crypto.js';
import { logger } from './logger.js';

let cachedTransport = null;
let cachedConfigUpdatedAt = null;

/**
 * SMTP settings are configured by Super Admin at runtime (System Config
 * screen) and stored encrypted in SystemConfig — not in .env — so they
 * can be changed without a redeploy. We cache the nodemailer transport
 * and only rebuild it when the stored config changes.
 */
async function getTransport() {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: 'smtp' } });
  if (!cfg) return null;

  if (cachedTransport && cachedConfigUpdatedAt?.getTime() === cfg.updatedAt.getTime()) {
    return cachedTransport;
  }

  const value = cfg.value; // { host, port, secure, username, encryptedPassword, fromAddress }
  const password = value.encryptedPassword ? decryptField(value.encryptedPassword) : undefined;

  cachedTransport = nodemailer.createTransport({
    host: value.host,
    port: value.port,
    secure: !!value.secure,
    auth: value.username ? { user: value.username, pass: password } : undefined,
  });
  cachedConfigUpdatedAt = cfg.updatedAt;
  return cachedTransport;
}

/** Always writes the in-app notification; best-effort emails on top. */
export async function notifyUser(user, type, title, body) {
  if (!user) return;
  try {
    await prisma.notification.create({ data: { userId: user.id, type, title, body } });
  } catch (err) {
    logger.error({ err }, 'Failed to create in-app notification');
  }

  try {
    const transport = await getTransport();
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'smtp' } });
    if (transport && cfg?.value?.fromAddress) {
      await transport.sendMail({
        from: cfg.value.fromAddress,
        to: user.email,
        subject: title,
        text: body,
      });
    }
  } catch (err) {
    // Email is best-effort — never block the workflow action on SMTP failure.
    logger.error({ err }, 'Failed to send notification email');
  }
}
