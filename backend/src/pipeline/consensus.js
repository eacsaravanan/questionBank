// backend/src/pipeline/consensus.js
//
// This is the core accuracy mechanism: instead of trusting one OCR engine's
// output, run two and check if they agree. Agreement -> high confidence,
// auto-fill. Disagreement -> force human review, and show both outputs so
// the reviewer doesn't have to re-read the scan from scratch.
//
// This is what actually moves you toward "no wrong answer ships silently" --
// not a claim that any single engine hit 100%.

const CONFIDENCE_THRESHOLD = 0.92; // tune after piloting on real pages

/**
 * Normalized Levenshtein-based similarity, 0..1. Normalizes whitespace and
 * common OCR punctuation noise before comparing, so two engines using
 * different spacing/quote styles don't get flagged as "disagreeing" over
 * nothing.
 */
function similarity(a, b) {
  const normalize = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['"`]/g, '')
      .trim();

  const s1 = normalize(a);
  const s2 = normalize(b);
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;

  const distance = levenshtein(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - distance / maxLen;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * @param {string} primaryText
 * @param {string} secondaryText
 * @returns {{score: number, agrees: boolean, needsReview: boolean}}
 */
function checkConsensus(primaryText, secondaryText) {
  const score = similarity(primaryText, secondaryText);
  return {
    score,
    agrees: score >= CONFIDENCE_THRESHOLD,
    needsReview: score < CONFIDENCE_THRESHOLD,
  };
}

export { checkConsensus, similarity, CONFIDENCE_THRESHOLD };
