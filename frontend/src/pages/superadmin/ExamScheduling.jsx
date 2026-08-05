import React, { useEffect, useState } from 'react';
import { CalendarClock, Users2, Clock, X } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';

function statusTone(status) {
  if (status === 'RELEASED' || status === 'ONGOING') return 'gold';
  if (status === 'COMPLETED') return 'verdant';
  if (status === 'CANCELLED') return 'alert';
  return 'ink'; // PENDING
}

function RegisterCandidatesModal({ schedule, onClose, onRegistered }) {
  const toast = useToast();
  const [aspirants, setAspirants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/users')
      .then((res) => setAspirants(res.data.filter((u) => u.roles.includes('Aspirant') && u.isActive)))
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load candidates.')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function submit() {
    if (selected.size === 0) {
      toast.warning('Select at least one candidate.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/exam-schedules/${schedule.id}/register`, { userIds: [...selected] });
      toast.success(`${selected.size} candidate(s) registered — verification codes have been sent.`);
      onRegistered();
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not register candidates.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink-950/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-ink-900">Register candidates — {schedule.examCode}</h3>
          <button onClick={onClose} className="text-ink-900/40 hover:text-ink-900"><X size={18} /></button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-900/50">Loading aspirant accounts…</p>
        ) : aspirants.length === 0 ? (
          <p className="text-sm text-ink-900/50">
            No active Aspirant accounts exist yet. Create one from Employees & Roles (assign the "Aspirant" role) before registering candidates.
          </p>
        ) : (
          <ul className="overflow-y-auto flex-1 divide-y divide-ink-900/8 border border-ink-900/8 rounded-lg mb-4">
            {aspirants.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                <span>{a.fullName}</span>
                <span className="text-xs text-ink-900/40 ml-auto font-mono">{a.username}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || aspirants.length === 0}>
            {submitting ? 'Registering…' : `Register ${selected.size || ''} candidate(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ExamScheduling() {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registeringFor, setRegisteringFor] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/exam-schedules');
      setSchedules(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load scheduled exams.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="Secure Delivery" title="Exam scheduling" />

      <div className="px-8 pb-12">
        {loading ? (
          <p className="text-sm text-ink-900/50">Loading…</p>
        ) : schedules.length === 0 ? (
          <Card className="p-8 text-center">
            <CalendarClock className="mx-auto mb-3 text-ink-900/30" size={28} />
            <p className="text-sm text-ink-900/60 max-w-sm mx-auto">
              Nothing is scheduled yet. Schedules are created from an <b>approved</b> question paper —
              go to <b>Question Papers</b>, approve one, and click "Schedule" on it. It'll appear here
              once created.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => (
              <Card key={s.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-ink-900">{s.examCode}</span>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </div>
                    <p className="text-sm text-ink-900/70">{s.paper?.title} · {s.exam?.name}</p>
                    <p className="text-xs text-ink-900/40 mt-1 flex items-center gap-1.5">
                      <Clock size={12} />
                      {new Date(s.scheduledStart).toLocaleString()} → {new Date(s.scheduledEnd).toLocaleString()}
                    </p>
                    <p className="text-xs text-ink-900/40 mt-1 flex items-center gap-1.5">
                      <Users2 size={12} /> {s._count?.registrations || 0} registered · {s._count?.attempts || 0} attempt(s)
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => setRegisteringFor(s)}>
                    <span className="flex items-center gap-1.5 text-xs"><Users2 size={13} /> Register candidates</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {registeringFor && (
        <RegisterCandidatesModal
          schedule={registeringFor}
          onClose={() => setRegisteringFor(null)}
          onRegistered={load}
        />
      )}
    </AppShell>
  );
}
