/**
 * Splits raw OCR text (which may contain several bilingual questions from
 * one page) into individual draft questions, with English and Tamil
 * content correctly merged per question and per option — not treated as
 * separate questions/options.
 *
 * This is a heuristic, pattern-based segmenter — not a trained model — so
 * it's transparent about what it can and can't do:
 *   - Handles numbered questions: "1.", "1)", "Q1.", "Q1)", "Question 1:"
 *   - Handles lettered/numbered options: "A)", "(A)", "A.", "a)", "1)", "i)"
 *   - Assumes the common bilingual layout: English question, English
 *     options, then the Tamil question, then Tamil options — lines are
 *     classified by script (Tamil Unicode range vs not) and the Nth
 *     English option is paired with the Nth Tamil option by POSITION,
 *     not by re-matching the (A)/(B)/(C)/(D) label text.
 *   - Blocks with no question-number match at all (front-matter,
 *     instructions) are dropped rather than surfaced as a fake question.
 *   - Blocks with fewer than 2 detected options are dropped too — these
 *     are usually instructions or stray numbered text, not real MCQs.
 *   - Everything it extracts is returned with needsReview: true and the
 *     original raw block, so a human always reviews/corrects before the
 *     question enters the approval workflow.
 */

const QUESTION_START = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.).:]\s+/;
const OPTION_START = /^[\(\[]?([A-Da-d]|[1-4]|[i-iv]+)[\).\]]\s+/;
const TAMIL_RE = /[\u0B80-\u0BFF]/;

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
    }
    // Lines before the first recognized question number (front-matter,
    // instructions) are intentionally dropped — see module docblock.
  }
  if (current) blocks.push(current);

  return blocks
    .map((block) => parseBlock(block))
    .filter((q) => q.options.length >= 2); // drop non-MCQ noise blocks
}

function splitQuestionAndOptions(lines) {
  const questionParts = [];
  const options = [];
  let inOptions = false;

  for (const line of lines) {
    const optMatch = line.match(OPTION_START);
    if (optMatch) {
      inOptions = true;
      options.push({ label: optMatch[1].toUpperCase(), text: line.replace(OPTION_START, '') });
    } else if (inOptions && options.length > 0) {
      options[options.length - 1].text += ' ' + line; // wrapped continuation
    } else {
      questionParts.push(line);
    }
  }
  return { questionText: questionParts.join(' ').trim(), options };
}

function parseBlock(block) {
  const englishLines = [];
  const tamilLines = [];
  for (const line of block.lines) {
    (TAMIL_RE.test(line) ? tamilLines : englishLines).push(line);
  }

  const en = splitQuestionAndOptions(englishLines);
  const ta = splitQuestionAndOptions(tamilLines);

  // English and Tamil options are paired by POSITION (1st English option
  // with 1st Tamil option, and so on) since both should list A, B, C, D in
  // the same order — this is what actually merges "K2Cr2O7" (English row)
  // with its Tamil translation into ONE option instead of two.
  const count = Math.max(en.options.length, ta.options.length);
  const options = [];
  for (let i = 0; i < count; i++) {
    options.push({
      label: en.options[i]?.label || ta.options[i]?.label || String.fromCharCode(65 + i),
      text: en.options[i]?.text || '',
      textTamil: ta.options[i]?.text || '',
    });
  }

  return {
    questionNumber: block.number,
    questionText: en.questionText,
    questionTextTamil: ta.questionText,
    options,
    rawText: block.lines.join('\n'),
    needsReview: true,
  };
}
