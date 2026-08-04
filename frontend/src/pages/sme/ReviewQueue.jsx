import React, { useEffect, useState } from 'react';
import { ListChecks, LayoutDashboard } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import api from '../../api/client.js';

const NAV = [
  { to: '/sme', label: 'Overview', icon: LayoutDashboard },
  { to: '/sme/queue', label: 'Review Queue', icon: ListChecks },
];

export default function ReviewQueue() {
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    api.get('/questions', { params: { status: 'SUBMITTED_FOR_REVIEW' } })
      .then((res) => setQuestions(res.data.items))
      .catch(() => setQuestions([]));
  }, []);

  async function review(id, action) {
    const comment = action === 'REQUEST_CHANGES' ? prompt('What needs to change?') || '' : undefined;
    await api.post(`/questions/${id}/review`, { action, comment });
    setQuestions((qs) => qs.filter((q) => q.id !== id));
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
              <Button variant="primary" onClick={() => review(q.id, 'APPROVE')}>Approve</Button>
              <Button variant="ghost" onClick={() => review(q.id, 'REQUEST_CHANGES')}>Request changes</Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
