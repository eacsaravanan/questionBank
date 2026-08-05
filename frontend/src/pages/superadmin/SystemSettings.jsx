import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';

export default function SystemSettings() {
  const toast = useToast();
  const [exams, setExams] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    examId: '', name: '', totalQuestions: 100, totalMarks: 100, qualifyingMarks: '',
    negativeMarking: false, negativeMarkValue: 0.25, durationMinutes: 120,
  });

  useEffect(() => {
    api.get('/content/exams').then((r) => setExams(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Could not load exams.')));
    api.get('/system-config/exam-master-config').then((r) => setConfigs(r.data)).catch((err) => toast.error(apiErrorMessage(err, 'Could not load configurations.')));
  }, []); // eslint-disable-line

  async function save(e) {
    e.preventDefault();
    if (!form.examId) { toast.warning('Select an exam.'); return; }
    if (!form.name.trim()) { toast.warning('Enter a configuration name.'); return; }
    if (!form.totalQuestions || form.totalQuestions <= 0) { toast.warning('Total questions must be greater than 0.'); return; }
    if (!form.totalMarks || form.totalMarks <= 0) { toast.warning('Total marks must be greater than 0.'); return; }
    if (!form.durationMinutes || form.durationMinutes <= 0) { toast.warning('Duration must be greater than 0.'); return; }
    if (form.qualifyingMarks && Number(form.qualifyingMarks) > form.totalMarks) {
      toast.warning('Qualifying marks cannot exceed total marks.');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, sections: [] };
      const { data } = await api.post('/system-config/exam-master-config', payload);
      setConfigs((c) => [...c, data]);
      toast.success(`"${form.name.trim()}" saved.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save this configuration.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="System Configuration" title="Exam master setup" />
      <div className="px-8 pb-12 grid grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">New master configuration</h2>
          </div>
          <form onSubmit={save} className="space-y-3">
            <select required className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.examId} onChange={(e) => setForm((f) => ({ ...f, examId: e.target.value }))}>
              <option value="">Select exam…</option>
              {exams.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
            <input required placeholder="Configuration name, e.g. 'Group 1 Prelims 2026'"
              className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-ink-900/60">Total questions
                <input type="number" className="w-full mt-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={form.totalQuestions} onChange={(e) => setForm((f) => ({ ...f, totalQuestions: Number(e.target.value) }))} />
              </label>
              <label className="text-xs text-ink-900/60">Total marks
                <input type="number" className="w-full mt-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={form.totalMarks} onChange={(e) => setForm((f) => ({ ...f, totalMarks: Number(e.target.value) }))} />
              </label>
              <label className="text-xs text-ink-900/60">Qualifying marks
                <input type="number" className="w-full mt-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={form.qualifyingMarks} onChange={(e) => setForm((f) => ({ ...f, qualifyingMarks: Number(e.target.value) }))} />
              </label>
              <label className="text-xs text-ink-900/60">Duration (minutes)
                <input type="number" className="w-full mt-1 px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-900/70">
              <input type="checkbox" checked={form.negativeMarking}
                onChange={(e) => setForm((f) => ({ ...f, negativeMarking: e.target.checked }))} />
              Enable negative marking
            </label>
            {form.negativeMarking && (
              <input type="number" step="0.05" placeholder="Marks deducted per wrong answer"
                className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                value={form.negativeMarkValue} onChange={(e) => setForm((f) => ({ ...f, negativeMarkValue: Number(e.target.value) }))} />
            )}
            <Button variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">Saved configurations</h2>
          <ul className="space-y-2">
            {configs.map((c) => (
              <li key={c.id} className="border border-ink-900/10 rounded-lg p-3 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-ink-900/50">
                  {c.totalQuestions} questions · {String(c.totalMarks)} marks · {c.durationMinutes} min
                  {c.negativeMarking && ` · −${c.negativeMarkValue} per wrong answer`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
