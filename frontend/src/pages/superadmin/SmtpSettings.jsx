import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

export default function SmtpSettings() {
  const [form, setForm] = useState({ host: '', port: 587, secure: false, username: '', password: '', fromAddress: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/system-config/smtp').then((res) => {
      if (res.data) setForm((f) => ({ ...f, ...res.data, password: '' }));
    }).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    await api.put('/system-config/smtp', form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="System Configuration" title="SMTP / email setup" />
      <div className="px-8 pb-12 max-w-lg">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">
              Used for account creation emails, verification codes, and approval notifications
            </h2>
          </div>
          <form onSubmit={save} className="space-y-3">
            <input placeholder="SMTP host" className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Port" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} />
              <label className="flex items-center gap-2 text-sm text-ink-900/70">
                <input type="checkbox" checked={form.secure} onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))} /> Use TLS
              </label>
            </div>
            <input placeholder="Username / API key" className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            <input type="password" placeholder={form.passwordSet ? 'Password / secret set — leave blank to keep it' : 'Password / secret'}
              className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <input placeholder="From address, e.g. no-reply@yourinstitute.edu" className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.fromAddress} onChange={(e) => setForm((f) => ({ ...f, fromAddress: e.target.value }))} />
            <Button variant="primary">Save SMTP configuration</Button>
            {saved && <p className="text-verdant-600 text-sm">Saved.</p>}
          </form>
        </Card>
        <p className="text-xs text-ink-900/40 mt-4">
          The password/API key is encrypted before it's stored and is never shown again in the UI —
          only re-entered if you need to change it.
        </p>
      </div>
    </AppShell>
  );
}
