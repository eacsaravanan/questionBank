import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';

/**
 * Attaches req.audit(action, entityType, entityId, metadata) so route
 * handlers can log domain-meaningful events (not just "POST /questions").
 * Every role's actions flow through this same function — Super Admin gets
 * a unified, exportable audit trail across the whole application.
 */
export function auditLogger(req, res, next) {
  req.audit = async (action, entityType = null, entityId = null, metadata = null) => {
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id || null,
          action,
          entityType,
          entityId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        },
      });
    } catch (err) {
      // Audit logging must never crash the request, but it must be loud in logs.
      logger.error({ err, action }, 'Failed to write audit log');
    }
  };
  next();
}
