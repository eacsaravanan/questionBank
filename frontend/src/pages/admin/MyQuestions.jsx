import React, { useEffect, useState } from 'react';
import { ListChecks, Send, Pencil, Trash2, X, Check } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import FormattableInput from '../../components/FormattableInput.jsx';
import { ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';

const STATUS_TONE = {
  DRAFT: 'ink',
  SUBMITTED_FOR_REVIEW: 'gold',
  CHANGES_REQUESTED: 'alert',
  SME_APPROVED: 'verdant',
  SUPER_ADMIN_APPROVED: 'verdant',
  PUBLISHED: 'verdant',
};

function EditForm({ question, onCancel, onSaved }) {
  const toast = useToast();
  const [englishBody, setEnglishBody] = useState(question.translations.find((t) => t.languageCode === 'en')?.body || '');
  const [tamilBody, setTamilBody] = useState(question.translations.find((t) => t.languageCode === 'ta')?.body || '');
  const [options, setOptions] = useState(
    question.options.map((o) => ({
      isCorrect: o.isCorrect,
      text: o.translations.find((t) => t.languageCode === 'en')?.body || '',
      textTamil: o.translations.find((t) => t.languageCode === 'ta')?.body || '',
    }))
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!englishBody.trim()) { toast.warning('Enter the question text in English.'); return; }
    const filled = options.filter((o) => o.text.trim());
    if (filled.length < 2) { toast.warning('Enter at least two options.'); return; }
    if (!options.some((o) => o.isCorrect && o.text.trim())) { toast.warning('Mark which option is correct.'); return; }

    setSaving(true);
    try {
      await api.put(`/questions/${question.id}/content`, {
        translations: [
          { languageCode: 'en', body: englishBody },
          ...(tamilBody.trim() ? [{ languageCode: 'ta', body: tamilBody }] : []),
        ],
        options: options.filter((o) => o.text.trim()).map((o) => ({
          isCorrect: !!o.isCorrect,
          translations: [
            { languageCode: 'en', body: o.text },
            ...(o.textTamil.trim() ? [{ languageCode: 'ta', body: o.textTamil }] : []),
          ],
        })),
      });
      toast.success('Question updated.');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save changes.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-ink-900/8 mt-3 pt-3">
      <FormattableInput label="Question text — English" value={englishBody} onChange={setEnglishBody} />
      <FormattableInput label="Question text — Tamil" value={tamilBody} onChange={setTamilBody} mode="tamil-live" />
      <label className="block text-xs font-medium text-ink-900/70 mb-1 mt-2">Options</label>
      <div className="space-y-2">
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="radio" checked={opt.isCorrect}
              onChange={() => setOptions((os) => os.map((o, i) => ({ ...o, isCorrect: i === idx })))} />
            <input className="flex-1 px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm"
              value={opt.text} placeholder="English"
              onChange={(e) => setOptions((os) => os.map((o, i) => (i === idx ? { ...o, text: e.target.value } : o)))} />
            <input lang="ta" className="flex-1 px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm"
              value={opt.textTamil} placeholder="Tamil"
              onChange={(e) => setOptions((os) => os.map((o, i) => (i === idx ? { ...o, textTamil: e.target.value } : o)))} />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          <span className="flex items-center gap-1"><Check size={13} /> {saving ? 'Saving…' : 'Save changes'}</span>
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <span className="flex items-center gap-1"><X size={13} /> Cancel</span>
        </Button>
      </div>
    </div>
  );
}

export default function MyQuestions() {
  const toast = useToast();
  const confirm = useConfirm();
  const [questions, setQuestions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { data } = await api.get('/questions', { params: { mine: 'true', ...(statusFilter && { status: statusFilter }) } });
      setQuestions(data.items);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load your questions.'));
    }
  }
  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line

  async function submitForReview(q) {
    setBusyId(q.id);
    try {
      await api.post(`/questions/${q.id}/submit-for-review`);
      toast.success(`${q.humanCode} submitted for SME review.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit for review.'));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuestion(q) {
    const ok = await confirm({
      title: `Delete ${q.humanCode}?`,
      message: 'This permanently removes this draft question. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(q.id);
    try {
      await api.delete(`/questions/${q.id}`);
      toast.success(`${q.humanCode} deleted.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not delete this question.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Admin · Question Preparator" navItems={NAV}>
      <PageHeader
        eyebrow="Question Builder"
        title="My questions"
        action={
          <select className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED_FOR_REVIEW">Submitted for review</option>
            <option value="CHANGES_REQUESTED">Changes requested</option>
            <option value="SME_APPROVED">SME approved</option>
            <option value="SUPER_ADMIN_APPROVED">Super Admin approved</option>
          </select>
        }
      />

      <div className="px-8 pb-12 space-y-3 max-w-3xl">
        {questions.length === 0 && (
          <Card className="p-8 text-center">
            <ListChecks className="mx-auto mb-3 text-ink-900/30" size={26} />
            <p className="text-sm text-ink-900/50">
              No questions here yet — head to Question Builder to create some.
            </p>
          </Card>
        )}

        {questions.map((q) => (
          <Card key={q.id} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-900/40">{q.humanCode}</span>
                <Badge tone={STATUS_TONE[q.status] || 'ink'}>{q.status.replaceAll('_', ' ')}</Badge>
              </div>
              <div className="flex items-center gap-3">
                {(q.status === 'DRAFT' || q.status === 'CHANGES_REQUESTED') && (
                  <button onClick={() => setEditingId(editingId === q.id ? null : q.id)} className="text-ink-900/40 hover:text-verdant-600" title="Edit">
                    <Pencil size={15} />
                  </button>
                )}
                {q.status === 'DRAFT' && (
                  <>
                    <button onClick={() => submitForReview(q)} disabled={busyId === q.id} className="text-ink-900/40 hover:text-gold-600" title="Submit for review">
                      <Send size={15} />
                    </button>
                    <button onClick={() => deleteQuestion(q)} disabled={busyId === q.id} className="text-ink-900/40 hover:text-alert" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-ink-900">
              {q.translations.find((t) => t.languageCode === 'en')?.body}
            </p>
            {q.status === 'CHANGES_REQUESTED' && (
              <p className="text-xs text-alert mt-2">
                SME requested changes — edit and resubmit for review.
              </p>
            )}

            {editingId === q.id && (
              <EditForm question={q} onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); load(); }} />
            )}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
