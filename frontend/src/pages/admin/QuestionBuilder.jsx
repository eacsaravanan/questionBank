import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, PenSquare, FileStack, Languages, ScanText, Keyboard, Trash2, CheckCircle2 } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/questions', label: 'Question Builder', icon: PenSquare },
  { to: '/admin/papers', label: 'Assemble Papers', icon: FileStack },
];

function LanguageField({ label, value, onChange, tamilAssist }) {
  const toast = useToast();
  const [tanglish, setTanglish] = useState('');
  const [converting, setConverting] = useState(false);

  async function handleConvert() {
    if (!tanglish.trim()) return;
    setConverting(true);
    try {
      const { data } = await api.post('/questions/transliterate', { text: tanglish, targetLanguage: 'ta' });
      onChange((value ? value + ' ' : '') + data.result);
      setTanglish('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not convert that text.'));
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-ink-900/70 mb-1">{label}</label>
      <textarea
        lang={tamilAssist ? 'ta' : undefined}
        className="w-full px-3 py-2 rounded-lg border border-ink-900/15 focus:border-verdant-500 outline-none text-sm"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tamilAssist ? 'தமிழில் தட்டச்சு செய்யவும் / type in Tamil' : 'Type in English'}
      />
      {tamilAssist && (
        <div className="mt-1.5 flex gap-2">
          <input
            className="flex-1 px-3 py-1.5 rounded-lg border border-ink-900/15 text-xs focus:border-gold-500 outline-none"
            placeholder="Type Tanglish here e.g. 'vanakkam ulagam' — press Convert"
            value={tanglish}
            onChange={(e) => setTanglish(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleConvert())}
          />
          <Button variant="gold" onClick={handleConvert} disabled={converting}>
            <span className="flex items-center gap-1.5 text-xs">
              <Languages size={13} /> {converting ? '…' : 'Convert'}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

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

      <LanguageField
        label="Question text — English"
        value={item.englishBody}
        onChange={(v) => onChange({ ...item, englishBody: v })}
      />
      <LanguageField
        label="Question text — Tamil"
        value={item.tamilBody}
        onChange={(v) => onChange({ ...item, tamilBody: v })}
        tamilAssist
      />

      <label className="block text-xs font-medium text-ink-900/70 mb-1 mt-2">Options</label>
      <div className="space-y-1.5">
        {item.options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${item.key}`}
              checked={opt.isCorrect}
              onChange={() =>
                onChange({
                  ...item,
                  options: item.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
                })
              }
            />
            <input
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm"
              value={opt.text}
              onChange={(e) =>
                onChange({
                  ...item,
                  options: item.options.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)),
                })
              }
              placeholder={`Option ${opt.label || idx + 1}`}
            />
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
    options: [{ label: 'A', text: '', isCorrect: true }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
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
          ? q.options.map((o, i) => ({ label: o.label, text: o.text, isCorrect: i === 0 }))
          : [{ label: 'A', text: '', isCorrect: true }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
        saved: false,
      }));

      setQueue((q) => [...q, ...newItems]);
      toast.success(`Extracted ${newItems.length} question(s) from the image — review before saving.`);
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
        .map((o) => ({ isCorrect: !!o.isCorrect, translations: [{ languageCode: 'en', body: o.text }] })),
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
            each detected question is added to your queue below for review.
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
          You can freely mix modes — some questions typed manually, others pulled from a screenshot —
          within the same session. OCR-extracted text is always editable before saving, and every
          question is still routed through SME review regardless of how it was authored.
        </p>
      </div>
    </AppShell>
  );
}
