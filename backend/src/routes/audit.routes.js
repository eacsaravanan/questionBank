import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

// GET /api/audit-logs?userId=&action=&from=&to=&page=
router.get('/', requirePermission('audit.read'), async (req, res, next) => {
  try {
    const { userId, action, from, to, page = 1, pageSize = 50 } = req.query;
    const where = {
      ...(userId && { userId }),
      ...(action && { action }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) },
      }),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) { next(err); }
});

// GET /api/audit-logs/export.csv?userId=&action=&from=&to=
router.get('/export.csv', requirePermission('audit.export'), async (req, res, next) => {
  try {
    const { userId, action, from, to } = req.query;
    const where = {
      ...(userId && { userId }),
      ...(action && { action }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) },
      }),
    };
    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50000,
    });

    const header = 'timestamp,username,action,entityType,entityId,ipAddress\n';
    const rows = logs.map((l) =>
      [l.createdAt.toISOString(), l.user?.username || '', l.action, l.entityType || '', l.entityId || '', l.ipAddress || '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );

    await req.audit('AUDIT_LOG_EXPORT', null, null, { rowCount: logs.length });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log-export.csv"');
    res.send(header + rows.join('\n'));
  } catch (err) { next(err); }
});

export default router;
