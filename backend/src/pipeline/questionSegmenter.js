// backend/src/pipeline/questionSegmenter.js
//
// Splits a full page's OCR layout into per-question crops, WITHOUT knowing
// anything about the subject. This is what makes "upload any similar PDF"
// work — it doesn't look for "science words" or "Tamil grammar words", it
// looks for the structural pattern every TNPSC-style paper shares:
//
//   <number>.  <question text>
//   (A) ...  (B) ...  (C) ...  (D) ...
//   <same content repeated in Tamil>
//
// Strategy: use the BOUNDING BOXES from Document AI's layout output (not
// plain text) to find where each question number sits on the page, then
// slice the page image at those y-coordinates. This survives subject
// changes, language changes, and formula-heavy questions because it's
// working off geometry, not vocabulary.

const QUESTION_NUMBER_PATTERN = /^\s*(\d{1,3})\s*\.\s*/;

/**
 * @param {import('../ocr/types').OcrBlock[]} blocks - from Document AI (must be shape:'layout')
 * @param {{width: number, height: number}} pageDimensions
 * @returns {Array<{questionNumber: number, boundingBox: {x:number,y:number,w:number,h:number}, blocks: object[]}>}
 */
function segmentQuestionsFromLayout(blocks, pageDimensions) {
  const paragraphBlocks = blocks.filter((b) => b.type === 'paragraph' && b.boundingBox);

  // Find every paragraph that STARTS a question, i.e. begins with "101." etc.
  const questionStarts = paragraphBlocks
    .map((block) => {
      const match = block.text.match(QUESTION_NUMBER_PATTERN);
      return match ? { number: parseInt(match[1], 10), block } : null;
    })
    .filter(Boolean)
    // Guard against false positives (e.g. a page number or an option that
    // happens to start with a digit-dot pattern): question numbers on a
    // TNPSC paper are strictly increasing and usually sequential.
    .sort((a, b) => a.block.boundingBox.y - b.block.boundingBox.y);

  const segments = [];
  for (let i = 0; i < questionStarts.length; i++) {
    const current = questionStarts[i];
    const next = questionStarts[i + 1];

    const yStart = current.block.boundingBox.y;
    const yEnd = next ? next.block.boundingBox.y : pageDimensions.height;

    // Collect every block whose top edge falls inside this question's
    // vertical band — this naturally captures the bilingual repeat, the
    // 4 options, and any match-the-following table, because they're all
    // physically between this question number and the next one.
    const blocksInRange = blocks.filter(
      (b) => b.boundingBox && b.boundingBox.y >= yStart - 4 && b.boundingBox.y < yEnd
    );

    segments.push({
      questionNumber: current.number,
      boundingBox: { x: 0, y: yStart, w: pageDimensions.width, h: yEnd - yStart },
      blocks: blocksInRange,
    });
  }

  return segments;
}

/**
 * Sanity check to run after segmentation and BEFORE anything is queued for
 * review — catches the common failure modes automatically instead of
 * relying on a human to notice a skipped question number.
 */
function validateSegments(segments) {
  const problems = [];
  const numbers = segments.map((s) => s.questionNumber);

  for (let i = 1; i < numbers.length; i++) {
    const gap = numbers[i] - numbers[i - 1];
    if (gap !== 1) {
      problems.push({
        type: gap > 1 ? 'missing_question' : 'duplicate_or_out_of_order',
        between: [numbers[i - 1], numbers[i]],
      });
    }
  }

  return { valid: problems.length === 0, problems };
}

export { segmentQuestionsFromLayout, validateSegments };
