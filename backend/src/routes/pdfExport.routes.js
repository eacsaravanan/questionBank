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
const tamilFontAvailable = fs.existsSync(TAMIL_FONT_PATH);

// GET /api/question-papers/pdf-font-status — lets the frontend warn up
// front if Tamil text will be omitted from exports, rather than the
// preparer discovering it after downloading a PDF.
router.get('/pdf-font-status', (req, res) => {
  res.json({ tamilFontAvailable });
});

/**
 * Computes the top-left (x, y) to draw a watermark image at, for a given
 * named position on a page of size (pageWidth, pageHeight).
 */
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

// POST /api/question-papers/:id/export-pdf
// { brandingProfileId?: string, watermark?: { enabled, position, pages: 'all'|'custom', customPages: number[] } }
router.post('/:id/export-pdf', requirePermission('paper.read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { brandingProfileId, watermark } = req.body;

    const paper = await prisma.questionPaper.findUnique({
      where: { id },
      include: {
        exam: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            question: {
              include: { translations: true, options: { include: { translations: true } }, subject: true },
            },
          },
        },
      },
    });
    if (!paper) return res.status(404).json({ error: 'NOT_FOUND' });

    const branding = brandingProfileId
      ? await prisma.brandingProfile.findUnique({ where: { id: brandingProfileId } })
      : await prisma.brandingProfile.findFirst({ where: { isDefault: true } });

    // Confidential mode is enforced here too, at render time, not just at
    // the settings-save step — a paper can never end up with identity
    // fields printed for a confidential profile, even if some future code
    // path passed one in unexpectedly.
    const showBranding = branding && !branding.confidentialMode;

    const wm = {
      enabled: !!watermark?.enabled && showBranding && !!branding?.logoUrl,
      position: watermark?.position || 'center',
      pages: watermark?.pages || 'all', // 'all' | 'custom'
      customPages: Array.isArray(watermark?.customPages) ? watermark.customPages : [],
    };
    const logoPath = branding?.logoUrl ? path.join(process.cwd(), branding.logoUrl.replace(/^\//, '')) : null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    let pageNumber = 0;
    let tamilContentSkipped = false;
    if (tamilFontAvailable) {
      doc.registerFont('Tamil', TAMIL_FONT_PATH);
    }

    function drawHeaderFooter(pageNum) {
      const { width, height } = doc.page;
      const showLogoThisPage = showBranding && branding.logoUrl && (branding.logoDisplayMode === 'ALL_PAGES' || pageNum === 1);

      doc.save();
      let cursorY = 20;
      if (showLogoThisPage && logoPath) {
        try { doc.image(logoPath, MARGIN, cursorY, { height: 32 }); } catch { /* skip if logo file unreadable */ }
      }
      if (showBranding && branding.instituteName) {
        doc.fontSize(13).font('Helvetica-Bold').text(branding.instituteName, MARGIN, cursorY, { align: 'center', width: width - MARGIN * 2 });
        cursorY += 16;
        if (branding.address) {
          doc.fontSize(8).font('Helvetica').text(branding.address, MARGIN, cursorY, { align: 'center', width: width - MARGIN * 2 });
        }
      }
      doc.fontSize(9).font('Helvetica').fillColor('#555').text(
        `${paper.exam?.name || ''} — ${paper.title}`,
        MARGIN, 55, { align: 'center', width: width - MARGIN * 2 }
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

    doc.on('pageAdded', () => {
      pageNumber += 1;
      drawHeaderFooter(pageNumber);
      maybeDrawWatermark(pageNumber);
    });

    doc.pipe(res);
    // The constructor's implicit first page fires 'pageAdded' too, so the
    // handler above already covers page 1 — no separate manual call needed.

    // Group questions by subject, in the order they first appear.
    const groups = [];
    for (const item of paper.items) {
      const subjName = item.question.subject?.name || 'General';
      let group = groups.find((g) => g.name === subjName);
      if (!group) { group = { name: subjName, items: [] }; groups.push(group); }
      group.items.push(item);
    }

    let qNumber = 0;
    for (const group of groups) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text(group.name, { underline: true });
      doc.moveDown(0.5);

      for (const item of group.items) {
        qNumber += 1;
        const q = item.question;
        const en = q.translations.find((t) => t.languageCode === 'en');
        const ta = q.translations.find((t) => t.languageCode === 'ta');

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(`${qNumber}. ${en?.body || ''}`);

        for (const opt of q.options) {
          const optEn = opt.translations.find((t) => t.languageCode === 'en');
          const label = ['A', 'B', 'C', 'D', 'E', 'F'][opt.sortOrder] || '';
          if (optEn) doc.fontSize(9).font('Helvetica').text(`   (${label}) ${optEn.body}`);
        }

        if (ta?.body) {
          if (tamilFontAvailable) {
            doc.font('Tamil').fontSize(10).text(ta.body);
            for (const opt of q.options) {
              const optTa = opt.translations.find((t) => t.languageCode === 'ta');
              const label = ['A', 'B', 'C', 'D', 'E', 'F'][opt.sortOrder] || '';
              if (optTa) doc.font('Tamil').fontSize(9).text(`   (${label}) ${optTa.body}`);
            }
            doc.font('Helvetica'); // reset for the next question's English text
          } else {
            tamilContentSkipped = true;
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#999')
              .text('   [Tamil text omitted from this export — Tamil font not installed on the server, see backend/assets/fonts/README.md]');
            doc.fillColor('#000');
          }
        }

        doc.moveDown(0.7);
        if (doc.y > doc.page.height - MARGIN - 60) doc.addPage();
      }
      doc.moveDown(0.5);
    }

    await req.audit('PAPER_EXPORT_PDF', 'QuestionPaper', id, { watermarkEnabled: wm.enabled, tamilContentSkipped });
    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
