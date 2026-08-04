import React, { useEffect, useState } from 'react';
import { FileCheck2, CalendarClock, Send } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

export default function PaperAssembly() {
  const [papers, setPapers] = useState([]);
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [title, setTitle] = useState('');
  const [schedule, setSchedule] = useState({ scheduledStart: '', scheduledEnd: '' });
  const [activePaper, setActivePaper] = useState(null);
  const [releaseInfo, setReleaseInfo] = useState(null);

  async function load() {
    const [p, q] = await Promise.all([
      api.get('/question-papers'),
      api.get('/questions', { params: { status: 'SME_APPROVED' } }),
    ]);
    setPapers(p.data);
    setApprovedQuestions(q.data.items);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function createPaper() {
    if (!title.trim() || selected.size === 0 || !approvedQuestions.length) return;
    const examId = approvedQuestions[0].subject.examId;
    const { data } = await api.post('/question-papers', {
      examId, title, paperType: 'Mock Test', questionIds: [...selected],
    });
    setTitle(''); setSelected(new Set());
    await load();
    setActivePaper(data);
  }

  async function submitForApproval(paper) {
    await api.post(`/question-papers/${paper.id}/submit-for-approval`);
    await load();
  }

  async function approveAsSuperAdmin(paper, stage) {
    await api.post(`/question-papers/${paper.id}/approve`, { stage, action: 'APPROVED' });
    await load();
  }

  async function scheduleExam(paper) {
    const { data } = await api.post('/exam-schedules', {
      examId: paper.examId,
      paperId: paper.id,
      scheduledStart: schedule.scheduledStart,
      scheduledEnd: schedule.scheduledEnd,
    });
    setReleaseInfo(data);
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="Question Papers" title="Assemble & schedule" />

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
          <Button variant="primary" onClick={createPaper} disabled={!title || selected.size === 0}>
            Create paper with {selected.size} question{selected.size !== 1 && 's'}
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">All papers</h2>
          <ul className="space-y-2">
            {papers.map((p) => (
              <li key={p.id} className="border border-ink-900/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <Badge tone={p.status === 'APPROVED' ? 'verdant' : 'gold'}>{p.status.replaceAll('_', ' ')}</Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {p.status === 'DRAFT' && <Button variant="ghost" onClick={() => submitForApproval(p)}><span className="flex items-center gap-1 text-xs"><Send size={12}/> Submit for approval</span></Button>}
                  {p.status === 'PENDING_SME_APPROVAL' && <Button variant="ghost" onClick={() => approveAsSuperAdmin(p, 'SME')}>Approve (as SME stage)</Button>}
                  {p.status === 'PENDING_SUPER_ADMIN_APPROVAL' && <Button variant="ghost" onClick={() => approveAsSuperAdmin(p, 'SUPER_ADMIN')}>Final approve</Button>}
                  {p.status === 'APPROVED' && <Button variant="gold" onClick={() => setActivePaper(p)}><span className="flex items-center gap-1 text-xs"><CalendarClock size={12}/> Schedule</span></Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {activePaper && (
        <div className="px-8 pb-12">
          <Card className="p-6 max-w-lg">
            <h2 className="font-display font-semibold text-ink-900 text-sm mb-4">Schedule "{activePaper.title}"</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input type="datetime-local" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                value={schedule.scheduledStart} onChange={(e) => setSchedule((s) => ({ ...s, scheduledStart: e.target.value }))} />
              <input type="datetime-local" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                value={schedule.scheduledEnd} onChange={(e) => setSchedule((s) => ({ ...s, scheduledEnd: e.target.value }))} />
            </div>
            <Button variant="primary" onClick={() => scheduleExam(activePaper)}>Schedule this exam</Button>

            {releaseInfo && (
              <div className="mt-4 p-3 bg-alert/5 border border-alert/25 rounded-lg text-xs">
                <p className="font-medium text-alert mb-1">Save this release key now — it will not be shown again:</p>
                <p className="font-mono">{releaseInfo.releaseKey}</p>
                <p className="mt-2 text-ink-900/60">Exam code for candidates: <span className="font-mono">{releaseInfo.examCode}</span></p>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
