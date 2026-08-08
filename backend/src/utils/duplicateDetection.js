/**
 * "Previously asked in" — automatic duplicate/reuse detection.
 *
 * Compares an incoming question's English text against the existing
 * question bank and surfaces likely repeats so a preparer/reviewer can
 * confirm "yes, this was already asked in <that question's paper>"
 * instead of typing it from memory. This never writes anything by
 * itself — every result here is a SUGGESTION (QuestionAppearance rows
 * with method: AUTO_DUPLICATE, confirmedById: null) that a human accepts,
 * edits, or dismisses in the review queue.
 *
 * Similarity approach: token-set Jaccard similarity over normalized text,
 * with an exact-normalized-match fast path. This is dependency-free (no
 * embeddings/vector DB/external API required) and works well for MCQ text,
 * which tends to repeat near-verbatim across compiled practice papers
 * rather than being paraphrased. It's intentionally simple — swap in a
 * proper embedding-similarity search later (e.g. pgvector) without
 * changing anything that calls detectDuplicates(), since the signature
 * (text in, ranked candidates out) stays the same.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'in', 'on', 'to', 'and', 'or',
  'which', 'what', 'who', 'whom', 'this', 'that', 'these', 'those', 'for', 'with', 'by',
]);

export function normalizeQuestionText(raw) {
  return (raw || '')
    .toLowerCase()
    // strip common boilerplate that varies between reprints of the same question
    .replace(/\b(ccs\w*|tnpsc|rrb)[\s\-/]?\d{2,4}\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(normalized) {
  return new Set(normalized.split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} opts
 * @param {string} opts.englishBody   the incoming question's English text
 * @param {string} [opts.subjectId]   scope comparison to this subject first (cheaper, more relevant)
 * @param {string} [opts.excludeQuestionId]  don't match a question against itself when re-checking on edit
 * @param {number} [opts.threshold]   0-1, default 0.72 (tuned for MCQ-length text; see systemConfig override)
 * @param {number} [opts.limit]       max candidates to return, default 5
 * @returns {Promise<Array<{questionId: string, humanCode: string, similarity: number, matchedText: string, papers: string[]}>>}
 */
export async function detectDuplicates(
  prisma,
  { englishBody, subjectId, excludeQuestionId, threshold = 0.72, limit = 5 }
) {
  const incomingNormalized = normalizeQuestionText(englishBody);
  if (!incomingNormalized) return [];
  const incomingTokens = tokenSet(incomingNormalized);
  if (incomingTokens.size === 0) return [];

  // Scope to the same subject when we have one — much cheaper than
  // scanning the whole bank, and reuse across subjects is rare in
  // practice. Falls back to a global scan if no subjectId is given
  // (e.g. bulk OCR import before subject is assigned).
  const candidates = await prisma.question.findMany({
    where: {
      ...(subjectId ? { subjectId } : {}),
      ...(excludeQuestionId ? { id: { not: excludeQuestionId } } : {}),
      status: { not: 'ARCHIVED' },
    },
    select: {
      id: true,
      humanCode: true,
      translations: {
        where: { languageCode: 'en' },
        select: { body: true },
        take: 1,
      },
      appearances: { select: { label: true } },
    },
    take: 5000, // safety cap; see note in systemConfig.routes.js about scaling this further
  });

  const scored = [];
  for (const candidate of candidates) {
    const candidateBody = candidate.translations[0]?.body;
    if (!candidateBody) continue;
    const candidateNormalized = normalizeQuestionText(candidateBody);

    // Fast path: exact match after normalization (verbatim repeat, the
    // overwhelmingly common case for reused exam questions).
    if (candidateNormalized === incomingNormalized) {
      scored.push({
        questionId: candidate.id,
        humanCode: candidate.humanCode,
        similarity: 1,
        matchedText: candidateBody,
        papers: candidate.appearances.map((a) => a.label),
      });
      continue;
    }

    const similarity = jaccardSimilarity(incomingTokens, tokenSet(candidateNormalized));
    if (similarity >= threshold) {
      scored.push({
        questionId: candidate.id,
        humanCode: candidate.humanCode,
        similarity: Math.round(similarity * 100) / 100,
        matchedText: candidateBody,
        papers: candidate.appearances.map((a) => a.label),
      });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}
