import React, { useEffect, useState } from 'react';
import { ListChecks, LayoutDashboard } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';

const NAV = [
  { to: '/sme', label: 'Overview', icon: LayoutDashboard },
  { to: '/sme/queue', label: 'Review Queue', icon: ListChecks },
];

export default function ReviewQueue() {
  const toast = useToast();
  const confirm = useConfirm();
  const [questions, setQuestions] = useState([]);
  const [busyId, setBusyId] = useState(null);

  function load() {
    api.get('/questions', { params: { status: 'SUBMITTED_FOR_REVIEW' } })
      .then((res) => setQuestions(res.data.items))
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load the review queue.')));
  }
  useEffect(load, []); // eslint-disable-line

  async function review(id, action) {
    let comment;
    if (action === 'REQUEST_CHANGES') {
      const ok = await confirm({
        title: 'Request changes on this question?',
        message: 'It will go back to the preparer for edits before it can be reviewed again.',
        confirmLabel: 'Request changes',
        tone: 'primary',
      });
      if (!ok) return;
      comment = window.prompt('What needs to change? (shown to the preparer)') || '';
    }

    setBusyId(id);
    try {
      await api.post(`/questions/${id}/review`, { action, comment });
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      toast.success(action === 'APPROVE' ? 'Question approved.' : 'Changes requested — the preparer has been notified.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not submit your review.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Subject Matter Expert" navItems={NAV}>
      <PageHeader eyebrow="Review Queue" title="Questions awaiting your review" />
      <div className="px-8 pb-12 space-y-4 max-w-3xl">
        {questions.length === 0 && (
          <p className="text-sm text-ink-900/50">Your queue is empty — nothing is waiting on you right now.</p>
        )}
        {questions.map((q) => (
          <Card key={q.id} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-ink-900/40">{q.humanCode}</span>
              <Badge tone="gold">{q.type}</Badge>
            </div>
            <p className="text-sm text-ink-900 mb-4">
              {q.translations.find((t) => t.languageCode === 'en')?.body || '(no English text)'}
            </p>
            <div className="flex gap-3">
              <Button variant="primary" disabled={busyId === q.id} onClick={() => review(q.id, 'APPROVE')}>Approve</Button>
              <Button variant="ghost" disabled={busyId === q.id} onClick={() => review(q.id, 'REQUEST_CHANGES')}>Request changes</Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
