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
 *   - A new question boundary is only accepted when its number is
 *     STRICTLY GREATER than the last accepted question number (or it's
 *     the very first candidate in the document). This is what stops a
 *     numbered sub-statement inside a statement-based question (e.g.
 *     "1. In 2019, World Environment Day..." / "2. The Theme for...")
 *     from being mistaken for a new question — those numbers restart low
 *     mid-document, so they fail the "must increase" test and stay part
 *     of the question they belong to. Trade-off: this assumes numbering
 *     is monotonically increasing within a single upload, which holds for
 *     every normal single-paper import; it does NOT hold if you
 *     concatenate two separately-numbered papers into one upload — import
 *     those as separate uploads instead.
 *   - Every question's English text is scanned for a short trailing
 *     source code (e.g. "CCS4T/19") — the exam/paper code that compiled
 *     practice papers print after each reused question. When found, it's
 *     stripped out of the question body and returned separately as
 *     `sourceTag`, ready to pre-fill "Previously asked in".
 *   - Everything it extracts is returned with needsReview: true and the
 *     original raw block, so a human always reviews/corrects before the
 *     question enters the approval workflow.
 */

const QUESTION_START = /^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.).:]\s+/;
const TAMIL_RE = /[\u0B80-\u0BFF]/;
const MATCH_TRIGGER = /match\s+the\s+following/i;
const MATCH_ROW = /^\(([a-dA-D])\)\s*(.*?)\s*(\d+)\.\s*(.+)$/;
const CODES_TRIGGER = /^codes?\s*:?/i;

function tryParseMatchTheFollowing(lines) {
  if (!lines.length) return null;
  const looksLikeMatch =
    MATCH_TRIGGER.test(lines.slice(0, 2).join(' ')) ||
    lines.filter((l) => MATCH_ROW.test(l)).length >= 2;
  if (!looksLikeMatch) return null;

  let i = 0;
  let stem = '';
  if (!MATCH_ROW.test(lines[0])) { stem = lines[0]; i = 1; }

  const leftItems = [];
  const rightItems = [];
  for (; i < lines.length; i++) {
    const m = lines[i].match(MATCH_ROW);
    if (!m) break;
    leftItems.push({ label: m[1].toLowerCase(), text: m[2].trim() });
    rightItems.push({ number: m[3], text: m[4].trim() });
  }

  while (i < lines.length && (CODES_TRIGGER.test(lines[i]) || /^\([a-d]\)\s*\([a-d]\)/i.test(lines[i]))) i++;

  const remainder = lines.slice(i).join(' ');
  const { options } = splitOptionsBlob(remainder);
  return { stem, leftItems, rightItems, options };
}

// Option markers, tried in order. Numeric and roman-numeral schemes
// deliberately REQUIRE parentheses/brackets — without that, a bare "1."
// or "2." is indistinguishable from a numbered sub-statement inside a
// statement-based question ("1. In 2019, World Environment Day..." /
// "2. The Theme for..."), and would wrongly be read as the start of the
// answer options instead of stem content. Lettered options (the vast
// majority of real MCQs) are still recognized whether parenthesized or
// bare, since "A)" / "(A)" / "A." all appear in the wild.
const OPTION_START_PATTERNS = [
  /^\(([A-Da-d])\)\s*/, // (A) or (a)
  /^\[([A-Da-d])\]\s*/, // [A] or [a]
  /^([A-Da-d])[.)]\s+/, // A)  or  A.
  /^\((\d)\)\s*/, // (1)  — bare "1." is NOT treated as an option, see above
  /^\(([ivx]{1,4})\)\s*/i, // (i) / (ii) / (iii) / (iv)
];

function matchOptionStart(line) {
  for (const re of OPTION_START_PATTERNS) {
    const m = line.match(re);
    if (m) return { label: m[1], full: m[0] };
  }
  return null;
}

// Matches a short trailing exam/paper code like "CCS4T/19", "TNPSC-G4/2019",
// "RRB2020" at the very end of a line — 2-3 letters/digits, optional
// separator, optional year. Deliberately narrow (uppercase + digits only,
// 3-12 chars) so it doesn't accidentally eat ordinary sentence-ending
// abbreviations.
const SOURCE_TAG = /\b([A-Z]{2,8}\d{0,3}[A-Z]?\s*\/\s*\d{2,4}|[A-Z]{2,8}\d{2,4})\s*$/;

export function segmentOcrText(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks = [];
  let current = null;
  let lastAcceptedNumber = null;

  for (const line of lines) {
    const qMatch = line.match(QUESTION_START);
    const candidateNumber = qMatch ? parseInt(qMatch[1], 10) : null;
    const isNewQuestionStart =
      qMatch && (lastAcceptedNumber === null || candidateNumber > lastAcceptedNumber);

    if (isNewQuestionStart) {
      if (current) blocks.push(current);
      current = { number: qMatch[1], lines: [line.replace(QUESTION_START, '')] };
      lastAcceptedNumber = candidateNumber;
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before the first recognized question number (front-matter,
    // instructions) are intentionally dropped — see module docblock.
  }
  if (current) blocks.push(current);

  return blocks
    .map((block) => parseBlock(block))
    /* .filter((q) => q.options.length >= 2);  *** Newly added line below 12-08-2026 - 12:45 pm*/
	.filter((q) => q.questionType === 'MATCH_FOLLOWING' || q.options.length >= 2); // drop non-MCQ noise blocks
}

function splitQuestionAndOptions(lines) {
  const matchResult = tryParseMatchTheFollowing(lines);

  if (matchResult) {
    return {
      questionText: matchResult.stem,
      options: matchResult.options,
      repeatedOptions: [],
      matchLeftItems: matchResult.leftItems,
      matchRightItems: matchResult.rightItems,
      isMatchFollowing: true,
    };
  }

  const questionParts = [];
  const optionLines = [];
  let inOptions = false;

  for (const line of lines) {
    if (!inOptions && matchOptionStart(line)) inOptions = true;
    (inOptions ? optionLines : questionParts).push(line);
  }

  const { options, repeatedOptions } =
    splitOptionsBlob(optionLines.join(' '));

  return {
    questionText: questionParts.join(' ').trim(),
    options,
    repeatedOptions,
  };
}

const LABEL_SCHEMES = [
  ['A', 'B', 'C', 'D'],
  ['a', 'b', 'c', 'd'],
  ['1', '2', '3', '4'],
  ['i', 'ii', 'iii', 'iv'],
];

/**
 * Splits a blob of "options region" text into individual options. Source
 * PDFs lay options out two different ways — one per line, or several
 * packed onto a single physical row (e.g. a short-answer question like
 * "(A) 6.5%   (B) 5.5%   (C) 7.5%   (D) 8.5%") — this handles both by
 * locating every marker that continues the label scheme detected from the
 * FIRST marker in the blob (A/B/C/D, a/b/c/d, 1/2/3/4, or i/ii/iii/iv),
 * in strict order, wherever it falls, and slicing the text between
 * consecutive accepted markers. A marker is only accepted if it's the
 * next one expected in sequence — this is what stops a stray "(A)"
 * reappearing later inside option text (e.g. a chemical formula) from
 * being misread as a 5th option.
 */
function splitOptionsBlob(blob) {
  const first = matchOptionStart(blob);
  if (!first) return { options: [], repeatedOptions: [] };
  const scheme =
    LABEL_SCHEMES.find((seq) => seq.some((label) => label.toLowerCase() === first.label.toLowerCase())) ||
    LABEL_SCHEMES[0];
  const markerRe = buildMarkerRegex(scheme);

  const accepted = [];
  let expectedIdx = 0;
  let repeatIndex = null;
  for (const m of blob.matchAll(markerRe)) {
    const label = (m.groups.paren || m.groups.bare || '').toLowerCase();
    if (expectedIdx < scheme.length) {
      if (label === scheme[expectedIdx].toLowerCase()) {
        accepted.push(m);
        expectedIdx++;
      }
    } else if (label === scheme[0].toLowerCase()) {
      repeatIndex = m.index;
      break;
    }
  }
  if (accepted.length === 0) return { options: [], repeatedOptions: [] };

  const options = [];
  for (let i = 0; i < accepted.length; i++) {
    const start = accepted[i].index + accepted[i][0].length;
    const end = i + 1 < accepted.length ? accepted[i + 1].index : repeatIndex ?? blob.length;
    options.push({ label: scheme[i].toUpperCase(), text: blob.slice(start, end).trim() });
  }

  // A second A..D cycle right after the first usually means the
  // Tamil-labelled options were pure formulas/numbers with no Tamil
  // script (e.g. "K2Cr2O7"), so the script-based classifier below
  // couldn't tell the two rows apart. Recover the second cycle instead
  // of discarding it.
  let repeatedOptions = [];
  if (repeatIndex !== null) {
    repeatedOptions = splitOptionsBlob(blob.slice(repeatIndex)).options;
  }

  return { options, repeatedOptions };
}

/**
 * Builds the "find every option marker in this scheme" regex used above.
 * Numeric and roman-numeral schemes require enclosing parens/brackets
 * (same reasoning as OPTION_START_PATTERNS — a bare "2" is too easy to
 * false-match inside ordinary text). Letter schemes accept parens/
 * brackets OR "A." / "A)", but never a fully bare letter — that would
 * false-match any standalone capital letter used as a label inside an
 * option's own text (e.g. "Point A and Point B").
 */
function buildMarkerRegex(scheme) {
  const escaped = [...scheme]
    .sort((a, b) => b.length - a.length) // longest first: "iii" before "i"
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const alt = escaped.join('|');
  const isLetterScheme = scheme === LABEL_SCHEMES[0] || scheme === LABEL_SCHEMES[1];
  return isLetterScheme
    ? new RegExp(`(?:[\\(\\[](?<paren>${alt})[\\)\\]]|\\b(?<bare>${alt})[.)])\\s*`, 'gi')
    : new RegExp(`[\\(\\[](?<paren>${alt})[\\)\\]]\\s*`, 'gi');
}

/**
 * Pulls a trailing source/paper code (e.g. "CCS4T/19") off the END of the
 * English question text, if present, and returns { questionText, sourceTag }
 * with the tag removed from the body. Compiled practice papers print this
 * right after each reused question to show which original exam it's from —
 * we lift it out so it can pre-fill "Previously asked in" instead of
 * getting stuck inside the question text itself.
 */
function extractSourceTag(questionText) {
  const match = questionText.match(SOURCE_TAG);
  if (!match) return { questionText, sourceTag: null };
  return {
    questionText: questionText.slice(0, match.index).trim(),
    sourceTag: match[1].replace(/\s+/g, ''),
  };
}

function parseBlock(block) {
  const englishLines = [];
  const tamilLines = [];
  for (const line of block.lines) {
    (TAMIL_RE.test(line) ? tamilLines : englishLines).push(line);
  }

  const en = splitQuestionAndOptions(englishLines);
  const ta = splitQuestionAndOptions(tamilLines);
  const { questionText: englishQuestionText, sourceTag } = extractSourceTag(en.questionText);

  // Fall back to the recovered second cycle when the Tamil block itself
  // produced no options -- see splitOptionsBlob() above.
  const tamilOptions = ta.options.length ? ta.options : en.repeatedOptions;

  const count = Math.max(en.options.length, tamilOptions.length);
  const options = [];
  for (let i = 0; i < count; i++) {
    options.push({
      label: en.options[i]?.label || tamilOptions[i]?.label || String.fromCharCode(65 + i),
      text: en.options[i]?.text || '',
      textTamil: tamilOptions[i]?.text || '',
    });
  }

  return {
	  questionNumber: block.number,
	  questionText: englishQuestionText,
	  questionTextTamil: ta.questionText,
	  options,
	  sourceTag,
	  rawText: block.lines.join('\n'),
	  needsReview: true,

	  questionType:
		en.isMatchFollowing || ta.isMatchFollowing
		  ? 'MATCH_FOLLOWING'
		  : 'SINGLE_MCQ',

	  matchLeftItemsEn: en.matchLeftItems || null,
	  matchRightItemsEn: en.matchRightItems || null,

	  matchLeftItemsTa: ta.matchLeftItems || null,
	  matchRightItemsTa: ta.matchRightItems || null,
	};
}
