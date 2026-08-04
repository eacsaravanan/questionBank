import React, { useEffect, useState } from 'react';
import { TrendingUp, ShieldAlert, Clock, Users, BookOpen, FileCheck2 } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, StatCard, Card, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingPapers, setPendingPapers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [papersRes] = await Promise.all([
          api.get('/question-papers', { params: { status: 'PENDING_SUPER_ADMIN_APPROVAL' } }),
        ]);
        setPendingPapers(papersRes.data);
      } catch (e) {
        // dashboard should degrade gracefully if a widget's data source is unavailable
      }
    })();
  }, []);

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="Command Center" title="Platform overview" />

      <div className="px-8 grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Active staff accounts" value="—" tone="ink" />
        <StatCard icon={BookOpen} label="Questions published" value="—" tone="verdant" />
        <StatCard icon={FileCheck2} label="Papers pending your approval" value={pendingPapers.length} tone="gold" />
        <StatCard icon={ShieldAlert} label="Integrity flags (24h)" value="—" tone="alert" />
      </div>

      <div className="px-8 grid grid-cols-3 gap-6">
        <Card className="col-span-2 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-gold-600" />
            <h2 className="font-display font-semibold text-ink-900">Awaiting final approval</h2>
          </div>
          {pendingPapers.length === 0 ? (
            <p className="text-sm text-ink-900/50">
              Nothing needs your sign-off right now. Papers appear here once an SME has approved them.
            </p>
          ) : (
            <ul className="divide-y divide-ink-900/8">
              {pendingPapers.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-ink-900">{p.title}</p>
                    <p className="text-xs text-ink-900/50">{p.paperType} · {p.exam?.name}</p>
                  </div>
                  <Badge tone="gold">Pending your approval</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900">This platform, at a glance</h2>
          </div>
          <p className="text-sm text-ink-900/60 leading-relaxed">
            You have full authority over every role, every question, and every scheduled exam.
            Nothing releases early — question papers stay locked until the exact scheduled moment,
            and every action on this platform is written to the audit log automatically.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
