import React, { useEffect, useRef, useState } from 'react';
import { ScanText, Keyboard, Trash2, CheckCircle2 } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import FormattableInput from '../../components/FormattableInput.jsx';
import PreviouslyAskedIn from '../../components/PreviouslyAskedIn.jsx';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { ADMIN_NAV as NAV } from './nav.js';

function QueueItem({ item, subjects, onChange, onRemove, onSave, onSubmitReview }) {
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

      <PreviouslyAskedIn
        appearances={item.previousAppearances || []}
        onChange={(next) => onChange({ ...item, previousAppearances: next })}
        englishBody={item.englishBody}
        subjectId={item.subjectId}
        excludeQuestionId={item.questionId}
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

      <div className="flex justify-end gap-3 mt-4">
        <Button variant="primary" onClick={() => onSave(item)} disabled={item.saved}>
          {item.saved ? 'Saved' : 'Save question'}
        </Button>
        {item.saved && !item.submittedForReview && (
          <Button variant="gold" onClick={() => onSubmitReview(item)}>
            Submit for review
          </Button>
        )}
        {item.submittedForReview && <Badge tone="gold">Submitted for review</Badge>}
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
    previousAppearances: [],
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
  const [pendingFile, setPendingFile] = useState(null);
  const [pageRange, setPageRange] = useState({ fromPage: '', toPage: '', skipPages: '' });
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

  function selectPendingFile(file) {
    if (!file) return;
    setPendingFile(file);
  }

  async function runExtraction() {
    if (!pendingFile) return;
    setOcrBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', pendingFile);
      if (pendingFile.type === 'application/pdf') {
        if (pageRange.fromPage) fd.append('fromPage', pageRange.fromPage);
        if (pageRange.toPage) fd.append('toPage', pageRange.toPage);
        if (pageRange.skipPages) fd.append('skipPages', pageRange.skipPages);
      }
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
        tamilBody: q.questionTextTamil || '',
        // OCR_SOURCE_TAG (the code printed on the source PDF, e.g.
        // "CCS4T/19") is pre-confirmed automatically — it was read
        // straight off the page. AUTO_DUPLICATE (a similarity guess
        // against the existing bank) stays pending for the preparer to
        // confirm or dismiss.
        previousAppearances: (q.previousAppearances || []).map((a) => ({
          ...a,
          confirmed: a.method !== 'AUTO_DUPLICATE',
        })),
        options: q.options.length
          ? q.options.map((o, i) => ({ label: o.label, text: o.text, textTamil: o.textTamil || '', isCorrect: i === 0 }))
          : [
              { label: 'A', text: '', textTamil: '', isCorrect: true },
              { label: 'B', text: '', textTamil: '' },
              { label: 'C', text: '', textTamil: '' },
              { label: 'D', text: '', textTamil: '' },
            ],
        saved: false,
      }));

      if (newItems.length === 0) {
        toast.warning('No question-like content was detected in that file — instructions/front-matter are skipped automatically, so this may mean the file had none, or the layout wasn\'t recognized. Try manual entry for this one.');
      } else {
        setQueue((q) => [...q, ...newItems]);
        const confidences = newItems.map((i) => i.ocrConfidence).filter((c) => typeof c === 'number');
        const avgConfidence = confidences.length ? confidences.reduce((s, c) => s + c, 0) / confidences.length : null;
        if (avgConfidence !== null && avgConfidence < 0.7) {
          toast.warning(`Extracted ${newItems.length} question(s), but OCR confidence was low (${Math.round(avgConfidence * 100)}%) — review each one carefully before saving. Watermarks, small print, and subscripted formulas (like K₂Cr₂O₇) are the usual causes.`);
        } else {
          toast.success(`Extracted ${newItems.length} question(s) — review before saving.`);
        }
      }
      setPendingFile(null);
      setPageRange({ fromPage: '', toPage: '', skipPages: '' });
    } catch (err) {
      if (err.response?.data?.error === 'SCANNED_PDF_NOT_SUPPORTED') {
        toast.error(err.response.data.message);
      } else {
        toast.error(apiErrorMessage(err, 'Could not read that file. Try a clearer file, or type this one manually.'));
      }
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
      // Only CONFIRMED entries are sent — a pending duplicate-match
      // suggestion the preparer hasn't accepted yet stays purely local.
      previousAppearances: (item.previousAppearances || [])
        .filter((a) => a.confirmed)
        .map(({ label, method, confidence, matchedQuestionId }) => ({ label, method, confidence, matchedQuestionId })),
    };

    try {
      const { data } = await api.post('/questions', payload);
      updateItem(item.key, { ...item, saved: true, questionId: data.id });
      toast.success('Question saved as draft.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save this question.'));
    }
  }

  async function submitReview(item) {
    try {
      await api.post(`/questions/${item.questionId}/submit-for-review`);
      updateItem(item.key, { ...item, submittedForReview: true });
      toast.success('Submitted for SME review.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit for review.'));
    }
  }

  return (
    <AppShell title="Admin · Question Preparator" navItems={NAV}>
      <PageHeader eyebrow="Question Builder" title="Prepare questions" />

      <div className="px-8 pb-12 max-w-3xl">
        <Card className="p-5 mb-6 border-dashed">
          <div className="flex items-center gap-2 mb-3">
            <ScanText size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Add from screenshot, PDF, or Word document</h2>
          </div>
          <p className="text-xs text-ink-900/50 mb-3">
            Paste a screenshot (Ctrl/Cmd+V) or upload an image, PDF, or .docx — multi-page documents work
            too; each detected question is added to your queue below for review. Instructions and
            non-question text are filtered out automatically. Watermarks, small print, and scanned
            (non-digital) PDFs reduce accuracy — always review before saving.
          </p>
          <div
            onPaste={(e) => {
              const file = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
              if (file) selectPendingFile(file);
            }}
            tabIndex={0}
            className="border-2 border-dashed border-ink-900/15 rounded-lg p-6 text-center text-sm text-ink-900/40 focus:border-gold-500 outline-none cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {pendingFile ? `Selected: ${pendingFile.name}` : 'Click to upload, or click here and paste (Ctrl/Cmd+V) an image'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,.docx"
            className="hidden"
            onChange={(e) => selectPendingFile(e.target.files[0])}
          />

          {pendingFile && pendingFile.type === 'application/pdf' && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <input placeholder="From page" type="number" min="1"
                className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-xs"
                value={pageRange.fromPage} onChange={(e) => setPageRange((p) => ({ ...p, fromPage: e.target.value }))} />
              <input placeholder="To page" type="number" min="1"
                className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-xs"
                value={pageRange.toPage} onChange={(e) => setPageRange((p) => ({ ...p, toPage: e.target.value }))} />
              <input placeholder="Skip pages, e.g. 1, 10, 100"
                className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-xs"
                value={pageRange.skipPages} onChange={(e) => setPageRange((p) => ({ ...p, skipPages: e.target.value }))} />
            </div>
          )}

          {pendingFile && (
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" onClick={() => setPendingFile(null)} disabled={ocrBusy}>Clear</Button>
              <Button variant="gold" onClick={runExtraction} disabled={ocrBusy}>
                {ocrBusy ? 'Extracting…' : 'Start extraction'}
              </Button>
            </div>
          )}
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
              onSubmitReview={submitReview}
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
