import React, { useState } from 'react';
import { KeySquare } from 'lucide-react';
import { Card, Button } from './ui.jsx';

const POLICIES = {
  NONE: {
    label: 'No answer key',
    blurb: 'The exported paper never shows or implies the correct answers anywhere — no bolding, no trailing section. A standalone answer-key PDF is still always available separately for internal use, regardless of this choice.',
  },
  EMBEDDED: {
    label: 'Embedded in each question',
    blurb: 'The correct option is shown in bold, inline, right where it appears in each question — in both the English and Tamil text.',
  },
  SEPARATE_SECTION: {
    label: 'Separate section at the end',
    blurb: 'Questions print with no marking at all; a dedicated "ANSWER KEY" section is appended after the last question, listing every question number and its correct option.',
  },
};

/**
 * Two-step choice matching how a real exam-conducting workflow makes this
 * decision: first "should this paper publish an answer key at all", then
 * — only if yes — "where should it appear". Used both at final approval
 * (paper.routes: POST /:id/approve requires this for SUPER_ADMIN stage)
 * and afterwards to revise an already-approved paper's policy (PATCH
 * /:id/answer-key-policy) — `initialPolicy` and `confirmLabel` adapt the
 * copy for either case.
 */
export default function AnswerKeyPolicyModal({ paperTitle, initialPolicy, confirmLabel, onConfirm, onCancel, busy }) {
  const [includeKey, setIncludeKey] = useState(initialPolicy ? initialPolicy !== 'NONE' : null);
  const [placement, setPlacement] = useState(initialPolicy && initialPolicy !== 'NONE' ? initialPolicy : 'EMBEDDED');

  function handleConfirm() {
    onConfirm(includeKey ? placement : 'NONE');
  }

  return (
    <div className="fixed inset-0 bg-ink-950/60 flex items-center justify-center z-50 p-4">
      <Card className="p-6 max-w-md w-full">
        <div className="flex items-center gap-2 mb-1">
          <KeySquare size={16} className="text-gold-600" />
          <h2 className="font-display font-semibold text-ink-900 text-sm">Answer key for "{paperTitle}"</h2>
        </div>
        <p className="text-xs text-ink-900/50 mb-4">
          Do you need to publish the answer key along with this question paper?
        </p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setIncludeKey(true)}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${includeKey === true ? 'border-gold-500 bg-gold-500/10 text-gold-700' : 'border-ink-900/15 text-ink-900/60'}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setIncludeKey(false)}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${includeKey === false ? 'border-gold-500 bg-gold-500/10 text-gold-700' : 'border-ink-900/15 text-ink-900/60'}`}
          >
            No
          </button>
        </div>

        {includeKey === true && (
          <div className="space-y-2 mb-4">
            {['EMBEDDED', 'SEPARATE_SECTION'].map((id) => (
              <label key={id} className={`block p-3 rounded-lg border cursor-pointer ${placement === id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <input type="radio" checked={placement === id} onChange={() => setPlacement(id)} />
                  <span className="text-sm font-medium text-ink-900">{POLICIES[id].label}</span>
                </div>
                <p className="text-xs text-ink-900/50 ml-6">{POLICIES[id].blurb}</p>
              </label>
            ))}
          </div>
        )}

        {includeKey === false && (
          <div className="p-3 rounded-lg border border-ink-900/10 mb-4">
            <p className="text-xs text-ink-900/50">{POLICIES.NONE.blurb}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={busy || includeKey === null}>
            {busy ? 'Saving…' : confirmLabel || 'Confirm'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
