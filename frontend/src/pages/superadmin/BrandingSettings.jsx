import React, { useEffect, useState } from 'react';
import { Palette, EyeOff, Image as ImageIcon, Star } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV as NAV } from './nav.js';
import api from '../../api/client.js';

const BLANK = {
  label: '', instituteName: '', address: '', contactNumber: '', contactEmail: '', website: '',
  logoDisplayMode: 'FIRST_PAGE_ONLY', confidentialMode: false,
  headerTemplate: '<div style="text-align:center">{{logo}}<h3>{{instituteName}}</h3><p>{{address}}</p><hr/><b>{{examName}}</b> — Paper Code: {{paperCode}}</div>',
  footerTemplate: '<div style="display:flex;justify-content:space-between"><span>{{confidentialNotice}}</span><span>Page {{pageNumber}} of {{totalPages}}</span></div>',
  isDefault: false,
};

export default function BrandingSettings() {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/branding-profiles');
    setProfiles(data);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  function selectProfile(p) {
    setEditingId(p.id);
    setForm({ ...BLANK, ...p });
    setLogoFile(null);
  }

  function newProfile() {
    setEditingId(null);
    setForm(BLANK);
    setLogoFile(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let saved;
      if (editingId) {
        saved = (await api.patch(`/branding-profiles/${editingId}`, form)).data;
      } else {
        saved = (await api.post('/branding-profiles', form)).data;
      }
      if (logoFile && !form.confidentialMode) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        await api.post(`/branding-profiles/${saved.id}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      await load();
      newProfile();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Super Admin" navItems={NAV}>
      <PageHeader eyebrow="White-labeling" title="Institute branding profiles" />

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        <Card className="p-6 col-span-1 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-ink-900 text-sm">Saved profiles</h2>
            <button onClick={newProfile} className="text-xs text-verdant-600 font-medium">+ New</button>
          </div>
          <ul className="space-y-2">
            {profiles.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selectProfile(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${
                    editingId === p.id ? 'border-gold-500 bg-gold-500/5' : 'border-ink-900/10 hover:border-ink-900/25'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {p.isDefault && <Star size={12} className="text-gold-600" />}
                    {p.label}
                  </span>
                  {p.confidentialMode && <Badge tone="alert">Confidential</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 col-span-2">
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-verdant-600" />
              <h2 className="font-display font-semibold text-ink-900 text-sm">
                {editingId ? 'Edit profile' : 'New branding profile'}
              </h2>
            </div>

            <input
              required
              placeholder="Profile name (internal, e.g. 'Default' or 'Batch 2026 — Confidential')"
              className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />

            <label className="flex items-start gap-3 p-3 rounded-lg border border-alert/25 bg-alert/5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-alert"
                checked={form.confidentialMode}
                onChange={(e) => setForm((f) => ({ ...f, confidentialMode: e.target.checked }))}
              />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-sm text-ink-900">
                  <EyeOff size={14} /> Confidential mode
                </span>
                <span className="text-xs text-ink-900/60">
                  Question papers using this profile will never print an institute name, logo, address,
                  or contact details — no exceptions, even if fields below are filled in.
                </span>
              </span>
            </label>

            {!form.confidentialMode && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Institute / Academy name" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                    value={form.instituteName || ''} onChange={(e) => setForm((f) => ({ ...f, instituteName: e.target.value }))} />
                  <input placeholder="Contact number (optional)" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                    value={form.contactNumber || ''} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
                  <input placeholder="Email (optional)" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                    value={form.contactEmail || ''} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
                  <input placeholder="Website (optional)" className="px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                    value={form.website || ''} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <input placeholder="Address (optional)" className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm"
                  value={form.address || ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />

                <div>
                  <label className="flex items-center gap-2 text-sm text-ink-900/70 mb-2">
                    <ImageIcon size={14} /> Logo
                  </label>
                  {form.logoUrl && <img src={form.logoUrl} alt="Current logo" className="h-10 mb-2" />}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files[0])} className="text-sm" />
                  <div className="flex gap-4 mt-2 text-xs text-ink-900/60">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="logoMode" checked={form.logoDisplayMode === 'ALL_PAGES'}
                        onChange={() => setForm((f) => ({ ...f, logoDisplayMode: 'ALL_PAGES' }))} />
                      Print logo on every page
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="logoMode" checked={form.logoDisplayMode === 'FIRST_PAGE_ONLY'}
                        onChange={() => setForm((f) => ({ ...f, logoDisplayMode: 'FIRST_PAGE_ONLY' }))} />
                      First page only
                    </label>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-ink-900/70 mb-1">Header template</label>
              <textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-xs font-mono"
                value={form.headerTemplate} onChange={(e) => setForm((f) => ({ ...f, headerTemplate: e.target.value }))} />
              <p className="text-xs text-ink-900/40 mt-1">
                Placeholders: {'{{logo}} {{instituteName}} {{address}} {{examName}} {{paperCode}} {{date}}'}
              </p>
            </div>

            <div>
              <label className="block text-sm text-ink-900/70 mb-1">Footer template</label>
              <textarea rows={2} className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-xs font-mono"
                value={form.footerTemplate} onChange={(e) => setForm((f) => ({ ...f, footerTemplate: e.target.value }))} />
              <p className="text-xs text-ink-900/40 mt-1">
                Placeholders: {'{{pageNumber}} {{totalPages}} {{examCode}} {{confidentialNotice}}'}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-900/70">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
              Make this the default profile (used when a paper doesn't pick one explicitly)
            </label>

            <Button variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
