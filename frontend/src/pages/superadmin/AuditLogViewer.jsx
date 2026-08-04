import React, { useEffect, useState } from 'react';
import { ScrollText, Download } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get('/audit-logs', { params: { page: 1, pageSize: 50 } })
      .then((res) => { setLogs(res.data.items); setTotal(res.data.total); })
      .catch(() => {});
  }, []);

  async function exportCsv() {
    const res = await api.get('/audit-logs/export.csv', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-log-export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader
        eyebrow="Compliance"
        title={`Audit log (${total} events)`}
        action={<Button variant="primary" onClick={exportCsv}><span className="flex items-center gap-1.5"><Download size={14}/> Export CSV</span></Button>}
      />
      <div className="px-8 pb-12">
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/5">
              <tr className="text-left text-ink-900/50 text-xs uppercase tracking-wide">
                <th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Entity</th><th className="px-4 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900/8">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 font-mono text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{l.user?.username || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2 text-xs text-ink-900/50">{l.entityType} {l.entityId?.slice(0, 8)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
