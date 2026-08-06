import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { logger } from './utils/logger.js';
import { helmetMiddleware, hppMiddleware, apiLimiter } from './middleware/security.js';
import { auditLogger } from './middleware/auditLog.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { startScheduler } from './jobs/scheduler.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import contentRoutes from './routes/content.routes.js';
import questionRoutes from './routes/question.routes.js';
import questionPaperRoutes from './routes/questionPaper.routes.js';
import examRoutes from './routes/exam.routes.js';
import auditRoutes from './routes/audit.routes.js';
import systemConfigRoutes from './routes/systemConfig.routes.js';
import brandingRoutes from './routes/branding.routes.js';
import ocrRoutes from './routes/ocr.routes.js';
import pdfExportRoutes from './routes/pdfExport.routes.js';

const app = express();

app.set('trust proxy', 1); // required for correct req.ip behind a load balancer / reverse proxy

app.use(helmetMiddleware);
app.use(hppMiddleware);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || false,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger }));
app.use(apiLimiter);
app.use(auditLogger);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Uploaded logos and OCR source images. Confidential-mode branding profiles
// never get a logo written to disk in the first place (see branding.routes.js),
// so there is nothing sensitive to accidentally expose here for those cases.
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/questions', ocrRoutes); // adds POST /api/questions/ocr-extract
app.use('/api/question-papers', questionPaperRoutes);
app.use('/api/question-papers', pdfExportRoutes); // adds /pdf-font-status and /:id/export-pdf
app.use('/api/exam-schedules', examRoutes); // includes /attempts/* sub-routes
app.use('/api/audit-logs', auditRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/branding-profiles', brandingRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  logger.info(`qbank-backend listening on :${port}`);
  startScheduler();
});
