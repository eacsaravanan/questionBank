/**
 * Splits raw OCR text (which may contain several questions from one
 * screenshot / scanned page) into individual draft questions.
 *
 * This is a heuristic, pattern-based segmenter — not a trained model — so
 * it's transparent about what it can and can't do:
 *   - Handles numbered questions: "1.", "1)", "Q1.", "Q1)", "Question 1:"
 *   - Handles lettered/numbered options: "A)", "(A)", "A.", "a)", "1)", "i)"
 *   - Everything it extracts is returned with needsReview: true and the
 *     original raw block, so a human always reviews/corrects before the
 *     question enters the approval workflow — this tool accelerates typing,
 *     it does not replace the SME/Admin's judgment call.
 */

const QUESTION_START = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.).:]\s+/;
const OPTION_START = /^[\(\[]?([A-Da-d]|[1-4]|[i-iv]+)[\).\]]\s+/;

export function segmentOcrText(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks = [];
  let current = null;

  for (const line of lines) {
    const qMatch = line.match(QUESTION_START);
    if (qMatch) {
      if (current) blocks.push(current);
      current = { number: qMatch[1], lines: [line.replace(QUESTION_START, '')] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Text before the first recognized question number — keep as a
      // preamble block so nothing silently disappears; the reviewing
      // human can discard or reattach it.
      current = { number: null, lines: [line] };
    }
  }
  if (current) blocks.push(current);

  return blocks.map((block) => parseBlock(block));
}

function parseBlock(block) {
  const questionLines = [];
  const options = [];
  let inOptions = false;

  for (const line of block.lines) {
    const optMatch = line.match(OPTION_START);
    if (optMatch) {
      inOptions = true;
      options.push({ label: optMatch[1].toUpperCase(), text: line.replace(OPTION_START, '') });
    } else if (inOptions && options.length > 0) {
      // Continuation of the previous option's text (wrapped line)
      options[options.length - 1].text += ' ' + line;
    } else {
      questionLines.push(line);
    }
  }

  return {
    questionNumber: block.number,
    questionText: questionLines.join(' ').trim(),
    options,
    rawText: block.lines.join('\n'),
    needsReview: true,
  };
}
