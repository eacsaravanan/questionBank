// backend/src/pipeline/bilingualSplitter.js
//
// Splits a question's raw text block into English and Tamil parts
// automatically, by SCRIPT (Unicode code points), not by keyword matching.
// This is why it works "irrespective of subject" — Tamil script is Tamil
// script whether the question is about chemistry, history, or maths.
//
// Tamil Unicode block: U+0B80-U+0BFF

const TAMIL_RANGE = /[\u0B80-\u0BFF]/;
const LATIN_LETTER = /[A-Za-z]/;

/**
 * Splits interleaved text into ordered segments tagged by script, then
 * regroups them into an { english, tamil } pair. Numbers, math symbols,
 * and punctuation stay attached to whichever script segment they're
 * physically adjacent to, which matches how the source PDF actually
 * interleaves them (see Q101: "1.6x10^-19 electrons" then the Tamil line
 * with the same number reused).
 *
 * @param {string} rawText
 * @returns {{english: string, tamil: string}}
 */
function splitByScript(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  const englishLines = [];
  const tamilLines = [];

  for (const line of lines) {
    const tamilChars = (line.match(new RegExp(TAMIL_RANGE, 'g')) || []).length;
    const latinChars = (line.match(new RegExp(LATIN_LETTER, 'g')) || []).length;

    if (tamilChars === 0 && latinChars === 0) {
      // Pure numbers/symbols (e.g. "(A)", "1.6x10^-19") -- can't classify by
      // script alone. Attach to whichever language block we're currently
      // building, defaulting to English for the first such line.
      (tamilLines.length > englishLines.length ? tamilLines : englishLines).push(line);
      continue;
    }

    if (tamilChars > latinChars) {
      tamilLines.push(line);
    } else {
      englishLines.push(line);
    }
  }

  return {
    english: englishLines.join('\n').trim(),
    tamil: tamilLines.join('\n').trim(),
  };
}

/**
 * Applies splitByScript across every relevant field in a segmented question
 * (main text + 4 options) in one pass.
 *
 * @param {{questionText: string, options: string[]}} question
 */
function splitQuestionBilingual(question) {
  return {
    questionText: splitByScript(question.questionText),
    options: question.options.map((optText) => splitByScript(optText)),
  };
}

export { splitByScript, splitQuestionBilingual };
