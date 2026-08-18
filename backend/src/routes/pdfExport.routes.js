import { Router } from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();
router.use(authenticate);

const MARGIN = 50;
const TAMIL_FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansTamil-Regular.ttf');

const MAX_BODY_CHARS = 2000;
function safeBody(text) {
  if (!text) return '';
  if (text.length <= MAX_BODY_CHARS) return text;
  return text.slice(0, MAX_BODY_CHARS) + ' […content truncated — this question has abnormally long text, check it in Question Builder]';
}

// "Previously asked in" labels -- capped both in COUNT and total length.
// This was the one field the earlier safeBody() pass missed, and is a
// second, independent way a single corrupted question can blow up page
// count (a question with hundreds of appearance rows renders one giant
// unbroken bold line here).
const MAX_APPEARANCE_LABELS = 10;
function safePriorSuffix(appearances) {
  const labels = (appearances || []).map((a) => a.label).filter(Boolean);
  if (!labels.length) return '';
  const shown = labels.slice(0, MAX_APPEARANCE_LABELS);
  const extra = labels.length - shown.length;
  const joined = shown.join(', ') + (extra > 0 ? ` (+${extra} more)` : '');
  return `  ${safeBody(joined)}`;
}

const tamilFontAvailable = fs.existsSync(TAMIL_FONT_PATH);
const VALID_ANSWER_KEY_POLICIES = ['NONE', 'EMBEDDED', 'SEPARATE_SECTION'];

router.get('/pdf-font-status', (req, res) => {
  res.json({ tamilFontAvailable });
});

function watermarkOrigin(position, pageWidth, pageHeight, imgWidth, imgHeight) {
  const pad = 24;
  const positions = {
    'top-left': [pad, pad],
    'top-center': [(pageWidth - imgWidth) / 2, pad],
    'top-right': [pageWidth - imgWidth - pad, pad],
    'center-left': [pad, (pageHeight - imgHeight) / 2],
    center: [(pageWidth - imgWidth) / 2, (pageHeight - imgHeight) / 2],
    'center-right': [pageWidth - imgWidth - pad, (pageHeight - imgHeight) / 2],
    'bottom-left': [pad, pageHeight - imgHeight - pad],
    'bottom-center': [(pageWidth - imgWidth) / 2, pageHeight - imgHeight - pad],
    'bottom-right': [pageWidth - imgWidth - pad, pageHeight - imgHeight - pad],
  };
  return positions[position] || positions.center;
}

router.post('/:id/export-pdf', requirePermission('paper.read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { brandingProfileId, watermark, answerKeyOverride, includePreviouslyAskedIn = true } = req.body;

    const paper = await prisma.questionPaper.findUnique({
      where: { id },
      include: {
        exam: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: {
                translations: true,
                options: { include: { translations: true }, orderBy: { sortOrder: 'asc' } },
                subject: true,
                appearances: true,
              },
            },
          },
        },
      },
    });
    if (!paper) return res.status(404).json({ error: 'NOT_FOUND' });
    req.log?.warn({
      paperId: id,
      itemCount: paper.items.length,
      itemIds: paper.items.map((it) => it.question.id),
    }, '[DIAG] paper fetched');

    const answerKeyPolicy = VALID_ANSWER_KEY_POLICIES.includes(answerKeyOverride)
      ? answerKeyOverride
      : paper.answerKeyPolicy || 'NONE';

    const branding = brandingProfileId
      ? await prisma.brandingProfile.findUnique({ where: { id: brandingProfileId } })
      : await prisma.brandingProfile.findFirst({ where: { isDefault: true } });

    const showBranding = branding && !branding.confidentialMode;
    req.log?.warn({ brandingFound: !!branding, confidentialMode: branding?.confidentialMode, showBranding }, '[BRANDING DEBUG]');

    const wm = {
      enabled: !!watermark?.enabled && showBranding && !!branding?.logoUrl,
      position: watermark?.position || 'center',
      pages: watermark?.pages || 'all',
      customPages: Array.isArray(watermark?.customPages) ? watermark.customPages : [],
    };
    const logoPath = branding?.logoUrl ? path.join(process.cwd(), branding.logoUrl.replace(/^\//, '')) : null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    res.on('error', (err) => {
      req.log?.error({ err }, 'PDF export response stream error (client likely disconnected mid-stream)');
    });

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    let pageNumber = 0;
    let tamilContentSkipped = false;
    let aborted = false; // <-- NEW: actually stops generation, not just logging
    if (tamilFontAvailable) {
      doc.registerFont('Tamil', TAMIL_FONT_PATH);
    }

    function drawHeaderFooter(pageNum) {
      const { width, height } = doc.page;
      const showLogoThisPage = showBranding && branding.logoUrl && (branding.logoDisplayMode === 'ALL_PAGES' || pageNum === 1);

      doc.save();
      let cursorY = 20;
      if (showLogoThisPage && logoPath) {
        try { doc.image(logoPath, MARGIN, cursorY, { fit: [32, 32] }); } catch (err) {
          req.log?.warn({ message: err.message }, 'Header logo image draw failed, skipping');
        }
      }
      if (showBranding && branding.instituteName) {
        doc.fontSize(13).font('Helvetica-Bold').text(branding.instituteName, MARGIN, cursorY, {
          align: 'center', width: width - MARGIN * 2, height: 16, ellipsis: true, lineBreak: false,
        });
        cursorY += 16;
        if (branding.address) {
          doc.fontSize(8).font('Helvetica').text(branding.address, MARGIN, cursorY, {
            align: 'center', width: width - MARGIN * 2, height: 10, ellipsis: true, lineBreak: false,
          });
        }
      }
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(
        `${paper.exam?.name || ''} — ${paper.title}`,
        MARGIN, 55, { align: 'center', width: width - MARGIN * 2, height: 12, ellipsis: true, lineBreak: false }
      );
      doc.moveTo(MARGIN, 72).lineTo(width - MARGIN, 72).strokeColor('#ccc').stroke();

      doc.fontSize(8).fillColor('#888').text(
        branding?.confidentialMode ? 'CONFIDENTIAL' : '',
        MARGIN, height - 30, { align: 'left', width: 200 }
      );
      doc.fontSize(8).fillColor('#888').text(`Page ${pageNum}`, MARGIN, height - 30, { align: 'right', width: width - MARGIN * 2 });
      doc.restore();
      doc.y = 85;
    }

    function maybeDrawWatermark(pageNum) {
      if (!wm.enabled) return;
      const applies = wm.pages === 'all' || wm.customPages.includes(pageNum);
      if (!applies) return;
      try {
        const { width, height } = doc.page;
        const imgW = 200;
        const imgH = 200;
        const [x, y] = watermarkOrigin(wm.position, width, height, imgW, imgH);
        doc.save();
        doc.opacity(0.08);
        doc.image(logoPath, x, y, { width: imgW, height: imgH });
        doc.opacity(1);
        doc.restore();
      } catch { /* skip if watermark image unreadable */ }
    }

    const MAX_PAGES = 300;

    doc.on('pageAdded', () => {
      pageNumber += 1;
      if (pageNumber % 25 === 0 || pageNumber < 5) {
        req.log?.warn({ pageNumber, docY: doc.y, qNumber }, '[DIAG] page added');
      }
      if (aborted) return;
      if (pageNumber > MAX_PAGES) {
        aborted = true;
        req.log?.error({ pageNumber }, 'PDF export exceeded MAX_PAGES -- aborting to avoid OOM');
        res.destroy(new Error('PDF generation exceeded maximum page count'));
        return;
      }
      try {
        drawHeaderFooter(pageNumber);
        maybeDrawWatermark(pageNumber);
      } catch (err) {
        req.log?.error({ message: err.message, stack: err.stack?.slice(0, 500), pageNumber }, 'Header/footer/watermark draw failed for this page');
      }
    });
    doc.pipe(res);

    const groups = [];
    req.log?.warn({
      groupCount: groups.length,
      groupSizes: groups.map((g) => ({ name: g.name, count: g.items.length })),
    }, '[DIAG] groups built');
    for (const item of paper.items) {
      const subjName = item.question.subject?.name || 'General';
      let group = groups.find((g) => g.name === subjName);
      if (!group) { group = { name: subjName, items: [] }; groups.push(group); }
      group.items.push(item);
    }

    let qNumber = 0;
    const answerKeyEntries = [];

    groupLoop:
    for (const group of groups) {
      if (aborted) break groupLoop;
      // Subject heading intentionally removed per requirement -- questions
      // flow continuously without a per-subject label.

      for (const item of group.items) {
        if (aborted) break groupLoop;
        qNumber += 1;
        const pageAtQuestionStart = pageNumber;
        const q = item.question;
        const en = q.translations.find((t) => t.languageCode === 'en');
        const ta = q.translations.find((t) => t.languageCode === 'ta');

        const correctOption = q.options.find((o) => o.isCorrect);
        if (correctOption) {
          const label = ['A', 'B', 'C', 'D', 'E', 'F'][q.options.indexOf(correctOption)] || '';
          answerKeyEntries.push({ qNumber, label });
        }
        const priorSuffix = includePreviouslyAskedIn ? safePriorSuffix(q.appearances) : '';

        // ---- English question ----
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
          .text(`${qNumber}. `, { continued: true })
          .font('Helvetica').text(safeBody(en?.body), { continued: !!priorSuffix, width: doc.page.width - MARGIN * 2 });
        if (priorSuffix) doc.font('Helvetica-Bold').text(priorSuffix);

        doc.moveDown(0.35); // padding: question -> its options

        // ---- English options ----
        for (const opt of q.options) {
          const optEn = opt.translations.find((t) => t.languageCode === 'en');
          const label = ['A', 'B', 'C', 'D', 'E', 'F'][q.options.indexOf(opt)] || '';
          if (!optEn) continue;
          const bold = answerKeyPolicy === 'EMBEDDED' && opt.isCorrect;
          doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(`   (${label}) ${safeBody(optEn.body)}`);
        }

        // ---- Tamil block (question + its own options), only if present ----
        if (ta?.body) {
          doc.moveDown(0.5); // padding: English block -> Tamil block
          doc.moveDown(0.25);

          if (tamilFontAvailable) {
            doc.font('Tamil').fontSize(10).text(safeBody(ta.body));
            doc.moveDown(0.35); // padding: Tamil question -> Tamil options

            for (const opt of q.options) {
              const optTa = opt.translations.find((t) => t.languageCode === 'ta');
              const optEn = opt.translations.find((t) => t.languageCode === 'en');
              const label = ['A', 'B', 'C', 'D', 'E', 'F'][q.options.indexOf(opt)] || '';
              // If this option has no Tamil translation (e.g. a formula
              // like K2Cr2O7 that's identical in both languages), fall
              // back to the English text rather than leaving it blank.
              const displayText = optTa?.body?.trim() ? optTa.body : optEn?.body;
              if (!displayText) continue;
              const bold = answerKeyPolicy === 'EMBEDDED' && opt.isCorrect;
              doc.font('Tamil').fontSize(9).text(`   (${label}) ${safeBody(displayText)}`, { underline: bold });
            }
            doc.font('Helvetica');
          } else {
            tamilContentSkipped = true;
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#999')
              .text('   [Tamil text omitted from this export — Tamil font not installed on the server, see backend/assets/fonts/README.md]');
            doc.fillColor('#000');
          }
        }

        doc.moveDown(1);
        if (doc.y > doc.page.height - MARGIN - 60) doc.addPage();

        // Safety net: no single question should ever legitimately need more
        // than a handful of pages. If one somehow does (corrupted text
        // breaking PDFKit's pagination, an oversized field that slipped
        // past safeBody, etc.), stop the WHOLE export rather than let it
        // consume unbounded memory -- this is what let qNumber:5 sit stuck
        // while pageNumber climbed to 600.
        if (pageNumber - pageAtQuestionStart > 15) {
          req.log?.error({ questionId: q.id, humanCode: q.humanCode, pagesConsumed: pageNumber - pageAtQuestionStart }, 'Single question consumed abnormal page count -- aborting export, this question needs manual review');
          aborted = true;
          res.destroy(new Error(`Question ${q.humanCode} appears to have corrupted content that breaks PDF pagination -- fix it in Question Builder before exporting this paper.`));
          break groupLoop;
        }
      }
      doc.moveDown(0.5);
    }

    if (aborted) {
      // res.destroy() already ended the response -- do NOT call doc.end()
      // or req.audit() on a stream that's already torn down.
      return;
    }

    if (answerKeyPolicy === 'SEPARATE_SECTION' && answerKeyEntries.length) {
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text('ANSWER KEY', { align: 'center' });
      doc.moveDown(1);

      const perRow = 5;
      const colWidth = (doc.page.width - MARGIN * 2) / perRow;
      doc.fontSize(10).font('Helvetica');
      for (let i = 0; i < answerKeyEntries.length; i += perRow) {
        if (aborted) break;
        const row = answerKeyEntries.slice(i, i + perRow);
        const y = doc.y;
        row.forEach((entry, col) => {
          doc.text(`Q${entry.qNumber} - ${entry.label}`, MARGIN + col * colWidth, y, { width: colWidth });
        });
        doc.y = y + 18;
        if (doc.y > doc.page.height - MARGIN - 30 && i + perRow < answerKeyEntries.length) doc.addPage();
      }
    }

    if (aborted) return;

    await req.audit('PAPER_EXPORT_PDF', 'QuestionPaper', id, { watermarkEnabled: wm.enabled, tamilContentSkipped, answerKeyPolicy });
    doc.end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/export-answer-key', requirePermission('paper.approve'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const paper = await prisma.questionPaper.findUnique({
      where: { id },
      include: {
        exam: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { question: { include: { options: true } } },
        },
      },
    });
    if (!paper) return res.status(404).json({ error: 'NOT_FOUND' });
    req.log?.warn({
      paperId: id,
      itemCount: paper.items.length,
      itemIds: paper.items.map((it) => it.question.id),
    }, '[DIAG] paper fetched');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, '_')}_ANSWER_KEY.pdf"`);
    res.on('error', (err) => {
      req.log?.error({ err }, 'PDF export response stream error (client likely disconnected mid-stream)');
    });

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    doc.pipe(res);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#a00').text('CONFIDENTIAL — INTERNAL USE ONLY', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#000').text(`${paper.title} — Answer Key`, { align: 'center' });
    doc.moveDown(1);

    const entries = paper.items.map((item, idx) => {
      const correctIdx = item.question.options
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .findIndex((o) => o.isCorrect);
      const label = ['A', 'B', 'C', 'D', 'E', 'F'][correctIdx] || '?';
      return { qNumber: idx + 1, label };
    });

    const perRow = 5;
    const colWidth = (doc.page.width - MARGIN * 2) / perRow;
    doc.fontSize(10).font('Helvetica').fillColor('#000');
    for (let i = 0; i < entries.length; i += perRow) {
      const row = entries.slice(i, i + perRow);
      const y = doc.y;
      row.forEach((entry, col) => {
        doc.text(`Q${entry.qNumber} - ${entry.label}`, MARGIN + col * colWidth, y, { width: colWidth });
      });
      doc.y = y + 18;
      if (doc.y > doc.page.height - MARGIN - 30 && i + perRow < entries.length) doc.addPage();
    }

    await req.audit('PAPER_EXPORT_ANSWER_KEY', 'QuestionPaper', id);
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
