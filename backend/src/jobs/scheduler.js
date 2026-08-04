import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';

/**
 * Runs every 30s. Two jobs:
 *
 * 1. RELEASE: flips schedules from PENDING -> RELEASED the moment
 *    scheduledStart has passed. This is what actually "unlocks" a paper —
 *    /start already independently re-checks the time window per request,
 *    so even if this job is delayed a candidate still cannot get in early;
 *    this job exists for status visibility on the admin dashboard and to
 *    drive release notifications, not as the security boundary itself.
 *
 * 2. RECONCILE (self-healing): on every tick, look for any schedule whose
 *    scheduledStart is already in the past but is still marked PENDING —
 *    this covers the case where the server/scheduler was down at the
 *    exact release moment (deploy, crash, host restart). It releases them
 *    immediately on the next tick and logs a WARN so Super Admin sees it
 *    was a delayed auto-recovery, not a silent miss.
 *
 * 3. AUTO-SUBMIT: any IN_PROGRESS attempt whose schedule window has
 *    closed gets auto-submitted, so a dropped connection near the end of
 *    an exam never leaves a candidate's work unsaved/ungraded.
 *
 * If a step here throws in a way that isn't self-recoverable (e.g. DB
 * unreachable for several ticks), it logs an actionable error rather than
 * crashing the process — see the MANUAL INTERVENTION note below for what
 * an operator should do.
 */
export function startScheduler() {
  setInterval(async () => {
    const now = new Date();

    try {
      const dueForRelease = await prisma.examSchedule.findMany({
        where: { status: 'PENDING', scheduledStart: { lte: now } },
      });
      for (const schedule of dueForRelease) {
        const delayMs = now.getTime() - schedule.scheduledStart.getTime();
        await prisma.examSchedule.update({ where: { id: schedule.id }, data: { status: 'RELEASED' } });
        if (delayMs > 60_000) {
          logger.warn(
            { scheduleId: schedule.id, delaySeconds: Math.round(delayMs / 1000) },
            'Exam release was delayed beyond 60s — auto-recovered by reconciliation job. ' +
              'If this recurs, check that the app server had continuous uptime across the scheduled start time.'
          );
        }
      }
    } catch (err) {
      logger.error(
        { err },
        'MANUAL INTERVENTION MAY BE NEEDED: exam release reconciliation failed. ' +
          'Check database connectivity. If schedules remain PENDING past their scheduledStart, ' +
          'Super Admin can manually verify via GET /api/exam-schedules and, once DB access is ' +
          'restored, the next successful tick will auto-release them — no manual status edit needed.'
      );
    }

    try {
      const overdue = await prisma.examAttempt.findMany({
        where: { status: 'IN_PROGRESS', schedule: { scheduledEnd: { lte: now } } },
        include: { schedule: true },
      });
      for (const attempt of overdue) {
        await prisma.examAttempt.update({
          where: { id: attempt.id },
          data: { status: 'SUBMITTED', submittedAt: now, autoSubmitted: true },
        });
        logger.info({ attemptId: attempt.id }, 'Auto-submitted attempt at window close');
      }
    } catch (err) {
      logger.error({ err }, 'MANUAL INTERVENTION MAY BE NEEDED: auto-submit sweep failed. Check database connectivity.');
    }
  }, 30_000);
}
