import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { toSubscript, toSuperscript } from '../utils/scriptFormat.js';

const TERMINATORS = /[ \n.,!?;:)]/;

/**
 * A textarea with:
 *  - Subscript/Superscript buttons that transform the CURRENTLY SELECTED
 *    text in this field (select "2" in "K2Cr2O7", click "x₂" -> "K₂Cr2O7").
 *    This is 100% reliable — it's a Unicode character swap, not OCR/guessing.
 *  - (mode="tamil-live" only) As you type Latin letters and hit a word
 *    boundary (space/punctuation), the just-typed word is auto-converted
 *    to Tamil in place, right here — no separate box. If the conversion
 *    engine has more than one plausible reading for that word, up to 2
 *    alternates appear as small chips right below the field; click one to
 *    swap it in. This is still the same deterministic rule engine as
 *    before (not a trained predictive keyboard) — it will not be perfect
 *    on every word, which is exactly why the field stays fully editable
 *    and every question still goes through SME review before publishing.
 */
export default function FormattableInput({ label, value, onChange, mode = 'plain', rows = 2, placeholder }) {
  const textareaRef = useRef(null);
  const valueRef = useRef(value);
  const [suggestion, setSuggestion] = useState(null); // { wordStart, wordEnd, primary, alts }

  useEffect(() => { valueRef.current = value; }, [value]);

  function applyScript(transform) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === selectionEnd) return; // nothing selected
    const selected = value.slice(selectionStart, selectionEnd);
    const { result } = transform(selected);
    const next = value.slice(0, selectionStart) + result + value.slice(selectionEnd);
    onChange(next);
  }

  async function maybeConvertLastWord(newValue) {
    if (mode !== 'tamil-live') return;
    const lastChar = newValue.slice(-1);
    if (!TERMINATORS.test(lastChar)) return;

    const beforeBoundary = newValue.slice(0, -1);
    const match = beforeBoundary.match(/([a-zA-Z]+)$/);
    if (!match) return;

    const word = match[1];
    const wordStart = beforeBoundary.length - word.length;
    const wordEnd = beforeBoundary.length;

    try {
      const { data } = await api.post('/questions/transliterate/word', { word });
      const [primary, ...alts] = data.candidates || [];
      if (!primary) return;

      const current = valueRef.current;
      // Only apply if that exact word is still sitting where we expect —
      // if the person kept typing past it or edited it, skip silently
      // rather than corrupting text elsewhere.
      if (current.slice(wordStart, wordEnd) !== word) return;

      const converted = current.slice(0, wordStart) + primary + current.slice(wordEnd);
      onChange(converted);
      setSuggestion(alts.length > 0 ? { wordStart, wordEnd: wordStart + primary.length, primary, alts } : null);
    } catch {
      // Conversion is a typing aid — a failed lookup just leaves the
      // Latin text as typed, no error surfaced for every keystroke.
    }
  }

  function handleChange(e) {
    const newValue = e.target.value;
    onChange(newValue);
    maybeConvertLastWord(newValue);
  }

  function pickAlternate(alt) {
    if (!suggestion) return;
    const current = valueRef.current;
    const next = current.slice(0, suggestion.wordStart) + alt + current.slice(suggestion.wordEnd);
    onChange(next);
    setSuggestion(null);
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-ink-900/70">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            title="Subscript selected text"
            onClick={() => applyScript(toSubscript)}
            className="w-6 h-6 text-xs rounded border border-ink-900/15 text-ink-900/60 hover:border-verdant-500 hover:text-verdant-600"
          >
            x₂
          </button>
          <button
            type="button"
            title="Superscript selected text"
            onClick={() => applyScript(toSuperscript)}
            className="w-6 h-6 text-xs rounded border border-ink-900/15 text-ink-900/60 hover:border-verdant-500 hover:text-verdant-600"
          >
            x²
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        lang={mode === 'tamil-live' ? 'ta' : undefined}
        className="w-full px-3 py-2 rounded-lg border border-ink-900/15 focus:border-verdant-500 outline-none text-sm"
        rows={rows}
        value={value}
        onChange={handleChange}
        placeholder={placeholder || (mode === 'tamil-live' ? 'தமிழில் தட்டச்சு செய்யவும் / type in Tamil or Tanglish — auto-converts as you type' : 'Type in English')}
      />
      {suggestion && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-ink-900/40">Also could be:</span>
          {suggestion.alts.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => pickAlternate(alt)}
              lang="ta"
              className="px-2 py-0.5 rounded-full text-xs border border-gold-500/40 bg-gold-500/5 text-gold-700 hover:border-gold-500"
            >
              {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
