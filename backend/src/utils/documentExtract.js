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
 * Extracts text from a PDF's text layer (i.e. a "digital" PDF — one
 * exported from Word, LaTeX, a question-bank tool, etc., as opposed to a
 * flatbed-scanned image saved as PDF). This is text extraction, not OCR —
 * it's exact and scales to thousands of pages in seconds, since it's just
 * reading embedded text, not recognizing pixels.
 *
 * `fromPage`/`toPage` (1-indexed, inclusive) and `skipPages` (a Set of
 * 1-indexed page numbers) let the caller import only part of a large
 * document. Returns per-page text so the range/skip filtering is exact.
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
      const text = textContent.items.map((item) => item.str).join(' ');
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
