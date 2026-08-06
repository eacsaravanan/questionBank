import React, { useEffect, useState } from 'react';
import { FileCheck2, Send } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';

export default function AdminPapers() {
  const toast = useToast();
  const [papers, setPapers] = useState([]);
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [p, q] = await Promise.all([
        api.get('/question-papers'),
        api.get('/questions', { params: { status: 'SME_APPROVED' } }),
      ]);
      setPapers(p.data);
      setApprovedQuestions(q.data.items);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load question papers.'));
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function createPaper() {
    if (!title.trim()) { toast.warning('Enter a paper title.'); return; }
    if (selected.size === 0) { toast.warning('Select at least one approved question.'); return; }
    setBusy(true);
    try {
      const examId = approvedQuestions[0].subject.examId;
      await api.post('/question-papers', {
        examId, title: title.trim(), paperType: 'Mock Test', questionIds: [...selected],
      });
      toast.success(`"${title.trim()}" created with ${selected.size} question(s).`);
      setTitle(''); setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the paper.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitForApproval(paper) {
    setBusy(true);
    try {
      await api.post(`/question-papers/${paper.id}/submit-for-approval`);
      toast.success(`"${paper.title}" submitted for approval.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit for approval.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Admin · Question Preparator" navItems={NAV}>
      <PageHeader eyebrow="Question Papers" title="Assemble papers" />

      <div className="px-8 pb-12 grid grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck2 size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Consolidate SME-approved questions</h2>
          </div>
          <input placeholder="Paper title, e.g. 'TNPSC Group 1 — Prelims Mock #4'"
            className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm mb-3"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <ul className="max-h-72 overflow-y-auto divide-y divide-ink-900/8 border border-ink-900/8 rounded-lg mb-3">
            {approvedQuestions.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} />
                <span className="font-mono text-xs text-ink-900/40">{q.humanCode}</span>
                <span className="truncate">{q.translations.find((t) => t.languageCode === 'en')?.body}</span>
              </li>
            ))}
            {approvedQuestions.length === 0 && <li className="px-3 py-4 text-sm text-ink-900/40">No SME-approved questions waiting yet.</li>}
          </ul>
          <Button variant="primary" onClick={createPaper} disabled={busy || !title.trim() || selected.size === 0}>
            Create paper with {selected.size} question{selected.size !== 1 && 's'}
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">Your papers</h2>
          {papers.length === 0 && <p className="text-sm text-ink-900/40">No papers created yet.</p>}
          <ul className="space-y-2">
            {papers.map((p) => (
              <li key={p.id} className="border border-ink-900/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <Badge tone={p.status === 'APPROVED' ? 'verdant' : 'gold'}>{p.status.replaceAll('_', ' ')}</Badge>
                </div>
                {p.status === 'DRAFT' && (
                  <Button variant="ghost" disabled={busy} onClick={() => submitForApproval(p)}>
                    <span className="flex items-center gap-1 text-xs"><Send size={12} /> Submit for approval</span>
                  </Button>
                )}
                {p.status !== 'DRAFT' && (
                  <p className="text-xs text-ink-900/40">Awaiting Super Admin / approver action.</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
