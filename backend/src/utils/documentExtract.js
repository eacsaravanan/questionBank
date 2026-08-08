import fs from 'fs/promises';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

/** DOCX always has a real text layer — always fast, always accurate, no OCR involved. */
export async function extractDocxText(filePath) {
  const buffer = await fs.readFile(filePath);
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Reconstructs visual lines from pdf.js's flat text-item array. pdf.js
 * hands back one item per run of text with NO reliable newline markers —
 * a naive `items.map(i => i.str).join(' ')` collapses an entire page into
 * ONE line, which silently breaks any downstream logic that looks for
 * "start of line" (e.g. ocrSegment.js's question-number matcher). We
 * rebuild real lines by grouping items whose baseline Y position
 * (`transform[5]`) is within a small tolerance of each other, then
 * ordering those groups top-to-bottom and each group's items
 * left-to-right by X (`transform[4]`).
 */
function itemsToLines(items) {
  const Y_TOLERANCE = 2; // points; same-line text can jitter a little (superscripts, kerning)
  const rows = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str: item.str });
  }
  // PDF space has Y increasing UPWARD, so sort descending to read top -> bottom.
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').trim())
    .filter(Boolean);
}

/**
 * Extracts text from a PDF's text layer (i.e. a "digital" PDF — one
 * exported from Word, LaTeX, a question-bank tool, etc., as opposed to a
 * flatbed-scanned image saved as PDF). This is text extraction, not OCR —
 * it's exact and scales to thousands of pages in seconds, since it's just
 * reading embedded text, not recognizing pixels.
 *
 * `fromPage`/`toPage` (1-indexed, inclusive) and `skipPages` (a Set of
 * 1-indexed page numbers) let the caller import only part of a large
 * document. Returns per-page text (as real, newline-separated lines — see
 * itemsToLines above) so the range/skip filtering is exact AND downstream
 * line-based parsing actually works.
 */
export async function extractPdfText(filePath, { fromPage, toPage, skipPages = new Set() } = {}) {
  const buffer = await fs.readFile(filePath);
  const pageTexts = [];

  await pdfParse(buffer, {
    // pdf-parse calls this once per page during parsing — capturing text
    // here (rather than using the flat concatenated `.text` result) is
    // what makes page-range/skip filtering possible.
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const lines = itemsToLines(textContent.items);
      const text = lines.join('\n');
      pageTexts.push(text);
      return text;
    },
  });

  const totalPages = pageTexts.length;
  const start = fromPage ? Math.max(1, fromPage) : 1;
  const end = toPage ? Math.min(totalPages, toPage) : totalPages;

  const selected = [];
  for (let pageNum = start; pageNum <= end; pageNum++) {
    if (skipPages.has(pageNum)) continue;
    selected.push(pageTexts[pageNum - 1] || '');
  }

  const combinedText = selected.join('\n');
  const avgCharsPerPage = selected.length ? combinedText.length / selected.length : 0;

  return {
    text: combinedText,
    totalPages,
    pagesProcessed: selected.length,
    // A digital PDF typically has well over 100 characters of real text
    // per page; a scanned/image-only PDF's text layer is empty or near-
    // empty. This is how we detect "this needs OCR, not text extraction"
    // without guessing from the file extension alone.
    looksDigital: avgCharsPerPage > 40,
  };
}
