import React, { useEffect, useRef, useState } from 'react';
import { ScanText, Keyboard, Trash2, CheckCircle2 } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import FormattableInput from '../../components/FormattableInput.jsx';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { ADMIN_NAV as NAV } from './nav.js';

function QueueItem({ item, subjects, onChange, onRemove, onSave }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge tone={item.mode === 'OCR' ? 'gold' : 'ink'}>
            {item.mode === 'OCR' ? (
              <span className="flex items-center gap-1"><ScanText size={11} /> OCR extracted</span>
            ) : (
              <span className="flex items-center gap-1"><Keyboard size={11} /> Manual entry</span>
            )}
          </Badge>
          {item.mode === 'OCR' && typeof item.ocrConfidence === 'number' && (
            <span className="text-xs text-ink-900/40 font-mono">{Math.round(item.ocrConfidence * 100)}% confidence</span>
          )}
          {item.mode === 'OCR' && typeof item.ocrConfidence === 'number' && item.ocrConfidence < 0.7 && (
            <span className="text-xs text-alert">Low confidence — review carefully</span>
          )}
          {item.saved && <Badge tone="verdant"><span className="flex items-center gap-1"><CheckCircle2 size={11} /> Saved</span></Badge>}
        </div>
        <button onClick={onRemove} className="text-ink-900/30 hover:text-alert">
          <Trash2 size={15} />
        </button>
      </div>

      <label className="block text-xs font-medium text-ink-900/70 mb-1">Subject</label>
      <select
        className="w-full mb-3 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
        value={item.subjectId || ''}
        onChange={(e) => onChange({ ...item, subjectId: e.target.value })}
        disabled={item.saved}
      >
        <option value="">Select subject…</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>{s.examCode} — {s.name}</option>
        ))}
      </select>

      <FormattableInput
        label="Question text — English"
        value={item.englishBody}
        onChange={(v) => onChange({ ...item, englishBody: v })}
      />
      <FormattableInput
        label="Question text — Tamil"
        value={item.tamilBody}
        onChange={(v) => onChange({ ...item, tamilBody: v })}
        mode="tamil-live"
      />

      <label className="block text-xs font-medium text-ink-900/70 mb-1 mt-2">Options</label>
      <div className="space-y-3">
        {item.options.map((opt, idx) => (
          <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg border border-ink-900/8">
            <input
              type="radio"
              className="mt-2.5"
              name={`correct-${item.key}`}
              checked={opt.isCorrect}
              onChange={() =>
                onChange({
                  ...item,
                  options: item.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
                })
              }
            />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input
                className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm"
                value={opt.text}
                onChange={(e) =>
                  onChange({
                    ...item,
                    options: item.options.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)),
                  })
                }
                placeholder={`Option ${opt.label || idx + 1} — English`}
              />
              <input
                lang="ta"
                className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm"
                value={opt.textTamil || ''}
                onChange={(e) =>
                  onChange({
                    ...item,
                    options: item.options.map((o, i) => (i === idx ? { ...o, textTamil: e.target.value } : o)),
                  })
                }
                placeholder={`Option ${opt.label || idx + 1} — Tamil`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-4">
        <Button variant="primary" onClick={() => onSave(item)} disabled={item.saved}>
          {item.saved ? 'Saved' : 'Save question'}
        </Button>
      </div>
    </Card>
  );
}

let keyCounter = 0;
function makeManualItem() {
  return {
    key: `q-${++keyCounter}`,
    mode: 'MANUAL',
    subjectId: '',
    englishBody: '',
    tamilBody: '',
    options: [
      { label: 'A', text: '', textTamil: '', isCorrect: true },
      { label: 'B', text: '', textTamil: '' },
      { label: 'C', text: '', textTamil: '' },
      { label: 'D', text: '', textTamil: '' },
    ],
    saved: false,
  };
}

export default function QuestionBuilder() {
  const toast = useToast();
  const confirm = useConfirm();
  const [queue, setQueue] = useState([makeManualItem()]);
  const [subjects, setSubjects] = useState([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/content/exams')
      .then((res) => {
        const flat = res.data.flatMap((exam) =>
          (exam.subjects || []).map((s) => ({ ...s, examCode: exam.code }))
        );
        setSubjects(flat);
        if (flat.length === 0) {
          toast.warning('No subjects exist yet — ask your Super Admin to add subjects under Exams & Subjects before preparing questions.');
        }
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load subjects.')));
  }, []); // eslint-disable-line

  function updateItem(key, updated) {
    setQueue((q) => q.map((item) => (item.key === key ? updated : item)));
  }

  async function removeItem(key, item) {
    if (item.saved) {
      const ok = await confirm({
        title: 'Remove this from your working list?',
        message: 'The question itself has already been saved and submitted — this only removes it from view here, it does not delete it.',
        confirmLabel: 'Remove from list',
        tone: 'primary',
      });
      if (!ok) return;
    }
    setQueue((q) => q.filter((i) => i.key !== key));
  }

  function addManual() {
    setQueue((q) => [...q, makeManualItem()]);
  }

  async function handleImageSelected(file) {
    if (!file) return;
    setOcrBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/questions/ocr-extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newItems = data.questions.map((q) => ({
        key: `q-${++keyCounter}`,
        mode: 'OCR',
        subjectId: '',
        ocrConfidence: q.ocrConfidence,
        sourceRef: data.sourceRef,
        englishBody: q.questionText,
        tamilBody: '',
        options: q.options.length
          ? q.options.map((o, i) => ({ label: o.label, text: o.text, textTamil: '', isCorrect: i === 0 }))
          : [
              { label: 'A', text: '', textTamil: '', isCorrect: true },
              { label: 'B', text: '', textTamil: '' },
              { label: 'C', text: '', textTamil: '' },
              { label: 'D', text: '', textTamil: '' },
            ],
        saved: false,
      }));

      setQueue((q) => [...q, ...newItems]);
      const avgConfidence = newItems.reduce((s, i) => s + (i.ocrConfidence || 0), 0) / newItems.length;
      if (avgConfidence < 0.7) {
        toast.warning(`Extracted ${newItems.length} question(s), but OCR confidence was low (${Math.round(avgConfidence * 100)}%) — review each one carefully before saving. Watermarks, small print, and subscripted formulas (like K₂Cr₂O₇) are the usual causes.`);
      } else {
        toast.success(`Extracted ${newItems.length} question(s) from the image — review before saving.`);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not read that image. Try a clearer screenshot, or type this one manually.'));
    } finally {
      setOcrBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveItem(item) {
    if (!item.subjectId) { toast.warning('Select a subject before saving.'); return; }
    if (!item.englishBody.trim()) { toast.warning('Enter the question text in English.'); return; }
    const filledOptions = item.options.filter((o) => o.text.trim());
    if (filledOptions.length < 2) { toast.warning('Enter at least two options.'); return; }
    if (!item.options.some((o) => o.isCorrect && o.text.trim())) { toast.warning('Mark which option is correct.'); return; }

    const payload = {
      subjectId: item.subjectId,
      type: 'SINGLE_MCQ',
      difficulty: 'Medium',
      translations: [
        { languageCode: 'en', body: item.englishBody },
        ...(item.tamilBody ? [{ languageCode: 'ta', body: item.tamilBody }] : []),
      ],
      options: item.options
        .filter((o) => o.text.trim())
        .map((o) => ({
          isCorrect: !!o.isCorrect,
          translations: [
            { languageCode: 'en', body: o.text },
            ...(o.textTamil?.trim() ? [{ languageCode: 'ta', body: o.textTamil }] : []),
          ],
        })),
      preparationMode: item.mode,
      ocrConfidence: item.ocrConfidence,
      ocrSourceRef: item.sourceRef,
    };

    try {
      await api.post('/questions', payload);
      updateItem(item.key, { ...item, saved: true });
      toast.success('Question saved as draft.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save this question.'));
    }
  }

  return (
    <AppShell title="Admin · Question Preparator" navItems={NAV}>
      <PageHeader eyebrow="Question Builder" title="Prepare questions" />

      <div className="px-8 pb-12 max-w-3xl">
        <Card className="p-5 mb-6 border-dashed">
          <div className="flex items-center gap-2 mb-3">
            <ScanText size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Add from screenshot (OCR)</h2>
          </div>
          <p className="text-xs text-ink-900/50 mb-3">
            Paste a screenshot (Ctrl/Cmd+V) or upload one — a full page with several questions works too;
            each detected question is added to your queue below for review. Watermarks and subscripted
            formulas reduce accuracy — always review before saving.
          </p>
          <div
            onPaste={(e) => {
              const file = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
              if (file) handleImageSelected(file);
            }}
            tabIndex={0}
            className="border-2 border-dashed border-ink-900/15 rounded-lg p-6 text-center text-sm text-ink-900/40 focus:border-gold-500 outline-none cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            Click to upload, or click here and paste (Ctrl/Cmd+V) an image
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleImageSelected(e.target.files[0])}
          />
          {ocrBusy && <p className="text-xs text-verdant-600 mt-2">Reading image…</p>}
        </Card>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-ink-900 text-sm">
            Question queue ({queue.length})
          </h2>
          <Button variant="ghost" onClick={addManual}>
            <span className="flex items-center gap-1.5 text-xs"><Keyboard size={13} /> Add manual question</span>
          </Button>
        </div>

        <div className="space-y-4">
          {queue.map((item) => (
            <QueueItem
              key={item.key}
              item={item}
              subjects={subjects}
              onChange={(updated) => updateItem(item.key, updated)}
              onRemove={() => removeItem(item.key, item)}
              onSave={saveItem}
            />
          ))}
        </div>

        <p className="text-xs text-ink-900/40 mt-6 leading-relaxed">
          Select any text in the English or Tamil fields and use the "x₂" / "x²" buttons above each
          field to apply real subscript/superscript formatting (e.g. K2Cr2O7 → K₂Cr₂O₇) — this always
          works, since it's a direct character substitution. The Tamil field converts Tanglish to Tamil
          automatically as you type each word; click an alternate suggestion chip if it guessed wrong.
        </p>
      </div>
    </AppShell>
  );
}
