// backend/src/pipeline/ocrPipeline.js
//
// End-to-end entry point: call this once per uploaded PDF page. It is
// deliberately subject-agnostic -- nothing here references "science" or
// "Tamil grammar" specifically, only structure (question numbers, script
// ranges, table layout, engine agreement). That's what lets "upload a
// similar PDF" work without per-subject configuration.
//
// Pipeline stages:
//   1. Ensemble OCR (Document AI primary + Cloud Vision secondary) on the
//      full page, so we get BOTH layout (for segmentation/tables) and a
//      second opinion (for consensus checking).
//   2. Segment into per-question blocks using layout geometry.
//   3. Detect match-the-following vs single-answer per question.
//   4. Split each question's text into English/Tamil by script.
//   5. Detect math-heavy questions and re-OCR just that crop with Mathpix.
//   6. Consensus check primary vs secondary per question.
//   7. On disagreement, run LLM reconciliation as a suggestion.
//   8. Write everything to the review queue -- status is ALWAYS
//      'pending_review' regardless of confidence. High confidence changes
//      what the reviewer sees (a green "high confidence, quick check"
//      badge vs a red "engines disagreed" badge), never whether review
//      happens at all.

import { runOcr, runMathOcr } from '../ocr/ocrService.js';
import { segmentQuestionsFromLayout, validateSegments } from './questionSegmenter.js';
import { splitQuestionBilingual } from './bilingualSplitter.js';
import { checkConsensus } from './consensus.js';
import { reconcile } from './llmReconciliation.js';
import { cropToBoundingBox } from './imageCrop.js';

const MATCH_THE_FOLLOWING_PATTERN = /match\s*the\s*following|Qurr@|s;s;/i;
// Broader than pure math notation on purpose -- this has to catch chemistry
// (H2O, CO2, Na+ with real subscript/superscript Unicode), physics symbols,
// AND the mangled forms OCR commonly produces when it loses a superscript
// (e.g. "1.6x10-19" instead of "1.6x10^-19", "10-19" with no visible sign
// distinction from a hyphen). Because OCR frequently strips the actual
// superscript/subscript formatting, this pattern deliberately over-triggers
// rather than under-triggers -- a false positive costs one extra Mathpix
// call; a false negative means a formula question silently ships without
// its notation, which is the failure mode we're trying to avoid.
const MATH_CONTENT_PATTERN = new RegExp(
  [
    '[\\u2070-\\u209F]', // Unicode super/subscript digits and symbols (10⁻¹⁹, H₂O, Na⁺)
    '[√×÷^Δ∑∫π±θ]', // common math/physics symbols
    '\\\\frac', '\\\\sqrt', // LaTeX already present in source text, if any
    '\\d+\\s*x\\s*10\\s*-?\\s*\\d+', // OCR-mangled scientific notation, e.g. "1.6x10-19"
    '[A-Z][a-z]?\\d+(?:[A-Z][a-z]?\\d*)+', // rough chemical formula shape: element+digit repeated (H2O, CO2, NaCl)
    '\\d+\\s*/\\s*\\d+', // fractions written as plain digits with a slash
  ].join('|'),
  'u'
);

/**
 * @param {{imageBase64: string, mimeType: string, pageNumber: number, sourcePaperName: string, width: number, height: number, storedImageRef?: string}} page
 * @param {object} ocrSettings - matches ocr-config.schema.json
 * @param {{alwaysRunMathOcr?: boolean}} [opts] - set alwaysRunMathOcr: true when you already know
 *   the paper is Maths/Physics/Chemistry (from the exam/subject the batch was uploaded under),
 *   so every question gets a Mathpix pass regardless of whether MATH_CONTENT_PATTERN matched.
 *   Leave false/omitted for mixed general-studies papers like the TNPSC sample, where most
 *   questions have no formula and running Mathpix on all of them would be wasted cost.
 * @returns {Promise<{results: object[], segmentationWarnings: object[]}>}
 */
async function processPage(page, ocrSettings, opts = {}) {
  // Stage 1: ensemble OCR on the full page.
  const { primary, secondary } = await runOcr(
    { imageBase64: page.imageBase64, mimeType: page.mimeType },
    ocrSettings,
    { compare: true }
  );

  if (primary.shape !== 'layout') {
    throw new Error(
      'Primary engine did not return layout/table blocks. Question segmentation requires ' +
        'an engine with layout detection (Google Document AI). Check your OCR engine setting.'
    );
  }

  // Stage 2: segment into questions using geometry, not vocabulary.
  const pageDimensions = { width: page.width, height: page.height };
  const segments = segmentQuestionsFromLayout(primary.blocks, pageDimensions);
  const { valid, problems } = validateSegments(segments);

  const results = [];

  for (const segment of segments) {
    const segmentText = segment.blocks.map((b) => b.text || '').join('\n');
    const tableBlocks = segment.blocks.filter((b) => b.type === 'table');

    // Stage 3: classify question type from structure, not subject.
    const isMatchTheFollowing =
      tableBlocks.length > 0 || MATCH_THE_FOLLOWING_PATTERN.test(segmentText);

    // Stage 4: split by script.
    const optionParagraphs = segment.blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text);
    const { questionText, options } = splitQuestionBilingual({
      questionText: optionParagraphs[0] || '',
      options: optionParagraphs.slice(1, 5),
    });

    // Stage 5: math/chemistry-heavy detection -> targeted Mathpix re-pass on
    // an actual crop of just this question, not the whole page. Padding
    // guards against clipping a subscript/superscript that sits right at the
    // detected paragraph box's edge -- a common way formula crops get cut off.
    let mathOcrResult = null;
    const shouldRunMathOcr = opts.alwaysRunMathOcr || MATH_CONTENT_PATTERN.test(segmentText);
    if (shouldRunMathOcr && ocrSettings.providers.mathpix) {
      const croppedImage = await cropToBoundingBox(page.imageBase64, segment.boundingBox, {
        paddingPx: 12,
      });
      mathOcrResult = await runMathOcr(
        { imageBase64: croppedImage, mimeType: page.mimeType },
        ocrSettings
      );
    }

    // Stage 6: consensus check against secondary engine's reading of the
    // same vertical band (approximate — secondary engine has no layout,
    // so we compare against its full-page text search for this segment).
    const secondaryApproxText = secondary ? secondary.text : '';
    const consensus = checkConsensus(segmentText, secondaryApproxText);

    // Stage 7: reconcile on disagreement, suggestion only.
    let reconciliation = null;
    if (consensus.needsReview) {
      try {
        reconciliation = await reconcile({
          primaryText: segmentText,
          secondaryText: secondaryApproxText,
          questionNumber: segment.questionNumber,
        });
      } catch (err) {
        // Reconciliation failing is not fatal -- it just means the reviewer
        // sees the raw disagreement instead of an LLM's cleaned-up
        // suggestion. Never block the pipeline on this stage.
        reconciliation = { error: err.message };
      }
    }

    // Shape matches OcrReviewQueue in schema-additions.prisma exactly, so the
    // approve endpoint (see ocrReviewApprove.js) can write this straight into
    // Question / QuestionTranslation / QuestionOption / QuestionOptionTranslation
    // without any reshaping.
    results.push({
      sourcePaperName: page.sourcePaperName,
      sourcePage: page.pageNumber,
      questionNumber: segment.questionNumber,
      // 'SINGLE_MCQ' / 'MATCH_FOLLOWING' match your Prisma QuestionType enum values
      // exactly (uppercase) -- adjust here if you later detect other types
      // (TRUE_FALSE, FILL_BLANK, etc.) using the same structural signals.
      questionType: isMatchTheFollowing ? 'MATCH_FOLLOWING' : 'SINGLE_MCQ',

      translationsJson: [
        { languageCode: 'en', body: questionText.english },
        { languageCode: 'ta', body: questionText.tamil },
      ],

      optionsJson: options.map((o, i) => ({
        sortOrder: i,
        isCorrect: false, // reviewer sets this explicitly -- OCR never infers the correct answer
        translations: [
          { languageCode: 'en', body: o.english },
          { languageCode: 'ta', body: o.tamil },
        ],
      })),

      // Only populated for match-the-following -- see the metadata convention
      // documented in schema-additions.prisma. Left/right list extraction from
      // the table blocks is a further structural-parsing step on top of what's
      // here; this pipeline currently hands the raw table rows through as a
      // starting point for that, not a finished parse.
      matchListJson: isMatchTheFollowing
        ? { rawTableRows: tableBlocks.map((b) => b.rows) }
        : null,

      mathOcrLatex: mathOcrResult ? mathOcrResult.text : null,
      boundingBoxJson: segment.boundingBox, // lets the review screen re-crop and re-run Mathpix later
      pageImageRef: page.storedImageRef, // wherever you persist the uploaded page image (S3 key, file path, etc.)
      confidenceScore: consensus.score,
      reviewBadge: consensus.agrees ? 'high_confidence' : 'engines_disagreed',
      primaryEngineRaw: segmentText,
      secondaryEngineRaw: secondaryApproxText,
      llmSuggestionJson: reconciliation,
      status: 'PENDING_REVIEW', // ALWAYS -- see file header
    });
  }

  return { results, segmentationWarnings: valid ? [] : problems };
}

export { processPage };
