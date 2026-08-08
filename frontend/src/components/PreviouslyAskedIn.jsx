import React, { useState } from 'react';
import { History, Plus, X, Sparkles } from 'lucide-react';
import api from '../api/client.js';
import { useToast, apiErrorMessage } from './Toast.jsx';

/**
 * "Previously asked in" — shows confirmed appearances as removable chips,
 * lets the preparer add one by hand, and surfaces pending duplicate-match
 * suggestions (found via the "Check for repeats" button, or pre-filled
 * automatically after OCR/bulk import) for a one-click Confirm / Dismiss.
 * Only CONFIRMED entries are ever included when the question is saved —
 * a pending suggestion is purely a UI affordance until accepted.
 *
 * Shared between QuestionBuilder.jsx (new questions) and MyQuestions.jsx
 * (editing an existing draft) so both stay in sync as this evolves.
 */
export default function PreviouslyAskedIn({ appearances, onChange, englishBody, subjectId, excludeQuestionId }) {
  const toast = useToast();
  const [manualLabel, setManualLabel] = useState('');
  const [checking, setChecking] = useState(false);

  const confirmed = appearances.filter((a) => a.confirmed);
  const pending = appearances.filter((a) => !a.confirmed);

  function addManual() {
    if (!manualLabel.trim()) return;
    onChange([...appearances, { label: manualLabel.trim(), method: 'MANUAL', confirmed: true }]);
    setManualLabel('');
  }

  function removeAt(idx) {
    onChange(appearances.filter((_, i) => i !== idx));
  }

  function confirmAt(idx) {
    onChange(appearances.map((a, i) => (i === idx ? { ...a, confirmed: true } : a)));
  }

  async function checkForRepeats() {
    if (!englishBody?.trim()) { toast.warning('Enter the English question text first.'); return; }
    setChecking(true);
    try {
      const { data } = await api.post('/questions/detect-duplicates', {
        englishBody,
        subjectId: subjectId || undefined,
        excludeQuestionId: excludeQuestionId || undefined,
      });
      if (data.mode === 'off' || data.mode === 'manual') {
        toast.info('Automatic duplicate detection is turned off in System Configuration — add "Previously asked in" manually.');
        return;
      }
      const existingLabels = new Set(appearances.map((a) => a.label));
      const fresh = (data.candidates || [])
        .filter((c) => !existingLabels.has(c.papers[0] || `Question ${c.humanCode}`))
        .map((c) => ({
          label: c.papers[0] || `Question ${c.humanCode} (no source tag on file — confirm manually)`,
          method: 'AUTO_DUPLICATE',
          confidence: c.similarity,
          matchedQuestionId: c.questionId,
          confirmed: false,
        }));
      if (fresh.length === 0) {
        toast.success('No likely repeats found in the existing question bank.');
      } else {
        onChange([...appearances, ...fresh]);
        toast.info(`Found ${fresh.length} possible repeat(s) — review below.`);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not check for duplicates.'));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-900/70">
          <History size={13} /> Previously asked in <span className="text-ink-900/40 font-normal">(optional)</span>
        </label>
        <button
          type="button"
          onClick={checkForRepeats}
          disabled={checking}
          className="flex items-center gap-1 text-xs text-verdant-600 hover:text-verdant-700 disabled:opacity-50"
        >
          <Sparkles size={12} /> {checking ? 'Checking…' : 'Check for repeats'}
        </button>
      </div>

      {confirmed.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {appearances.map((a, idx) =>
            a.confirmed ? (
              <span key={idx} className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs bg-ink-900/5 border border-ink-900/10 font-semibold">
                {a.label}
                <button type="button" onClick={() => removeAt(idx)} className="text-ink-900/30 hover:text-alert">
                  <X size={11} />
                </button>
              </span>
            ) : null
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {appearances.map((a, idx) =>
            !a.confirmed ? (
              <div key={idx} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/30">
                <span className="text-xs text-ink-900">
                  Possible repeat of <strong>{a.label}</strong>
                  {typeof a.confidence === 'number' && (
                    <span className="text-ink-900/40"> · {Math.round(a.confidence * 100)}% match</span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => confirmAt(idx)} className="text-xs text-verdant-700 font-medium hover:underline">
                    Confirm
                  </button>
                  <button type="button" onClick={() => removeAt(idx)} className="text-xs text-ink-900/40 hover:text-alert">
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-xs"
          placeholder="e.g. CCS4T/19, TNPSC Group IV 2019"
          value={manualLabel}
          onChange={(e) => setManualLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }}
        />
        <button
          type="button"
          onClick={addManual}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-xs text-ink-900/70 hover:border-verdant-500"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}
