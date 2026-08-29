// backend/src/pipeline/llmReconciliation.js
//
// When two OCR engines disagree on a question (see consensus.js), a raw
// diff is often hard for a reviewer to parse quickly, especially in mixed
// Tamil/English text. This stage asks an LLM to propose a reconciled
// reading, WITH ITS REASONING, as a suggestion only -- it never auto-applies
// the result. The reviewer still approves or rejects.
//
// Why this helps: LLMs are good at exactly this kind of contextual
// correction (e.g. recognizing "l1LDl1JJTC1TT" is garbled Tamil OCR noise
// around a real word, or that "6.25x1018" should read "6.25x10^18" given
// the surrounding physics context) in a way plain string diffing can't.
//
// Why it's still not "the answer": the LLM can also be wrong, and it has
// no way to independently verify against the physical page. Treat its
// output as a well-informed second opinion, not ground truth.
//
// Uses the Anthropic Messages API. Check https://docs.claude.com for the
// current recommended model string before deploying -- do not assume the
// one below stays correct indefinitely.

import fetch from 'node-fetch'; // npm install node-fetch@2 --save

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RECONCILIATION_MODEL || 'claude-sonnet-5';

/**
 * @param {{primaryText: string, secondaryText: string, questionNumber: number}} input
 * @returns {Promise<{suggestedText: string, reasoning: string, stillUncertain: boolean}>}
 */
async function reconcile({ primaryText, secondaryText, questionNumber }) {
  const prompt = `You are reconciling two OCR readings of the same exam question from a bilingual Tamil/English government exam paper (TNPSC-style). Both readings may contain OCR errors. Do not invent content that is not plausibly present in either reading -- if you cannot confidently reconcile a word, mark it clearly rather than guessing.

Question number: ${questionNumber}

Reading A (primary engine):
"""
${primaryText}
"""

Reading B (secondary engine):
"""
${secondaryText}
"""

Respond in this exact JSON shape, nothing else:
{
  "suggestedText": "your best reconciled reading",
  "reasoning": "brief explanation of what you changed and why",
  "stillUncertain": true or false (true if a human MUST check the original scan)
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Reconciliation LLM call failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');

  try {
    return JSON.parse(textBlock.text);
  } catch {
    // If the model didn't return clean JSON, fail safe: force human review
    // rather than guessing at a parse.
    return {
      suggestedText: primaryText,
      reasoning: 'LLM response was not parseable JSON; defaulted to primary engine reading.',
      stillUncertain: true,
    };
  }
}

export { reconcile };
