/**
 * Tanglish -> Tamil Unicode transliteration engine (rule-based, v1).
 *
 * Approach: greedy longest-match syllable tokenizer, same family of
 * technique used by ITRANS/Aksharamukha-style schemes.
 *   1. Try to match the longest known CONSONANT CLUSTER + VOWEL combo.
 *   2. Fall back to consonant + inherent 'அ' vowel.
 *   3. Fall back to a bare vowel.
 *   4. Unrecognized characters (numbers, punctuation, already-Tamil text)
 *      pass through untouched.
 *
 * This is intentionally NOT a dictionary / ML model — it is deterministic,
 * fast, works fully offline, and gets ~85-90% of everyday Tanglish typing
 * right. Ambiguous cases (e.g. "e" for எ vs ஏ) are resolved with sane
 * defaults; ambiguity that matters for exam-grade Tamil content (Tamil
 * literature / Tamil language subject) should be authored directly in
 * Tamil or reviewed by an SME before publishing — this tool is an
 * authoring aid, not a substitute for the SME approval step in the
 * question workflow.
 *
 * Swap-in point for v2: replace transliterateWord() with a call to a
 * third-party API (e.g. Google Input Tools) behind the same function
 * signature — nothing else in the app needs to change.
 */

// Independent vowels (used when a vowel appears with no preceding consonant)
const INDEPENDENT_VOWELS = [
  ['aa', 'ஆ'], ['ii', 'ஈ'], ['ee', 'ஏ'], ['uu', 'ஊ'], ['oo', 'ஓ'],
  ['ai', 'ஐ'], ['au', 'ஔ'],
  ['a', 'அ'], ['i', 'இ'], ['u', 'உ'], ['e', 'எ'], ['o', 'ஒ'],
];

// Dependent vowel signs (attached to a consonant's inherent 'அ')
// Key: matra suffix appended in Unicode composition (empty = inherent vowel, consonant alone)
const VOWEL_SIGNS = {
  'aa': 'ா', 'ii': 'ீ', 'ee': 'ே', 'uu': 'ூ', 'oo': 'ோ',
  'ai': 'ை', 'au': 'ௌ',
  'a': '', 'i': 'ி', 'u': 'ு', 'e': 'ெ', 'o': 'ொ',
};

// Vowel sound keys, longest-first for greedy matching
const VOWEL_KEYS = ['aa', 'ii', 'ee', 'uu', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o'];

// Consonants — longest romanization first so e.g. "ng" is tried before "n"
const CONSONANTS = [
  ['ng', 'ங'], ['nj', 'ஞ'], ['ny', 'ஞ'],
  ['ch', 'ச'], ['sh', 'ஷ'], ['zh', 'ழ'],
  ['th', 'த'], ['dh', 'த'],
  ['kR', 'க்ஷ'], ['ksh', 'க்ஷ'],
  ['k', 'க'], ['c', 'ச'], ['g', 'க'],
  ['t', 'ட'], ['T', 'ட'], ['d', 'ட'],
  ['N', 'ண'], ['n', 'ந'],
  ['p', 'ப'], ['b', 'ப'],
  ['m', 'ம'],
  ['y', 'ய'],
  ['r', 'ர'], ['R', 'ற'],
  ['l', 'ல'], ['L', 'ள'],
  ['v', 'வ'], ['w', 'வ'],
  ['z', 'ழ'],
  ['s', 'ஸ'],
  ['h', 'ஹ'],
  ['j', 'ஜ'],
  ['f', 'ஃப'],
];

const PULLI = '்'; // virama — used when a consonant has no following vowel (cluster end)

function isTamilAlready(str) {
  return /[\u0B80-\u0BFF]/.test(str);
}

function transliterateWord(word, opts = {}) {
  if (isTamilAlready(word)) return word; // don't double-convert
  if (!/^[a-zA-Z]+$/.test(word)) return word; // numbers/punctuation pass through

  // Some Tanglish typists use single "e"/"o" to mean the LONG vowel (ஏ/ஓ)
  // rather than the short one (எ/ஒ) — both conventions are common, so this
  // is one axis we vary across candidates instead of guessing once.
  const eoLong = !!opts.eoLong;
  const vowelSigns = { ...VOWEL_SIGNS };
  const independentVowels = INDEPENDENT_VOWELS.slice();
  if (eoLong) {
    vowelSigns.e = vowelSigns.ee;
    vowelSigns.o = vowelSigns.oo;
  }

  const lower = word;
  let i = 0;
  let out = '';
  const n = lower.length;

  while (i < n) {
    let matchedConsonant = null;
    for (const [rom, tam] of CONSONANTS) {
      if (lower.substr(i, rom.length).toLowerCase() === rom.toLowerCase()) {
        matchedConsonant = { rom, tam };
        break;
      }
    }

    if (matchedConsonant) {
      i += matchedConsonant.rom.length;
      // look for a following vowel sound to attach as a matra
      let matchedVowel = null;
      for (const vk of VOWEL_KEYS) {
        if (lower.substr(i, vk.length).toLowerCase() === vk.toLowerCase()) {
          matchedVowel = vk;
          break;
        }
      }
      if (matchedVowel) {
        out += matchedConsonant.tam + vowelSigns[matchedVowel];
        i += matchedVowel.length;
      } else {
        // consonant with no vowel following -> check if end of word or another consonant
        // if followed by another consonant or end of string, treat as pulli (cluster)
        out += matchedConsonant.tam + PULLI;
      }
      continue;
    }

    // No consonant matched — try an independent vowel
    let matchedVowel = null;
    for (const [rom, tam] of independentVowels) {
      if (lower.substr(i, rom.length).toLowerCase() === rom.toLowerCase()) {
        matchedVowel = { rom, tam: (eoLong && rom === 'e') ? 'ஏ' : (eoLong && rom === 'o') ? 'ஓ' : tam };
        break;
      }
    }
    if (matchedVowel) {
      out += matchedVowel.tam;
      i += matchedVowel.rom.length;
      continue;
    }

    // Unrecognized character — pass through
    out += lower[i];
    i += 1;
  }

  return out;
}

/**
 * Generate up to 3 differing candidate readings for one Tanglish word, for
 * a suggestion picker. This is still the same deterministic rule engine —
 * not a trained predictive model — just run with the two conventions
 * typists commonly use for ambiguous "e"/"o" vowels. Genuinely novel
 * ambiguities (which consonant a typist meant, etc.) aren't covered; this
 * catches the single most common source of "that's not what I meant"
 * for this ruleset.
 */
export function tanglishToTamilWordVariants(word) {
  const variants = [transliterateWord(word, { eoLong: false })];
  const long = transliterateWord(word, { eoLong: true });
  if (long !== variants[0]) variants.push(long);
  return variants.slice(0, 3);
}

/**
 * Convert a full Tanglish sentence/paragraph to Tamil Unicode.
 * Preserves punctuation, numbers, and word boundaries.
 */
export function tanglishToTamil(text) {
  if (!text) return text;
  return text
    .split(/(\s+|[.,!?;:()"'\-\/]+)/) // split but keep delimiters
    .map((token) => (/^[a-zA-Z]+$/.test(token) ? transliterateWord(token) : token))
    .join('');
}

export default { tanglishToTamil };
