import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Pencil, Ban, RotateCcw, X, Check } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV } from './nav.js';
import api from '../../api/client.js';

function EditUserRow({ user, roles, onCancel, onSaved }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [roleIds, setRoleIds] = useState(
    roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id)
  );
  const [saving, setSaving] = useState(false);

  function toggleRole(id) {
    setRoleIds((ids) => (ids.includes(id) ? ids.filter((r) => r !== id) : [...ids, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { fullName, email, roleIds });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-gold-500/5">
      <td className="py-2.5" colSpan={5}>
        <div className="flex flex-wrap items-center gap-2 py-1">
          <input
            className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm w-40"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
          />
          <input
            className="px-2.5 py-1.5 rounded-lg border border-ink-900/15 text-sm w-52"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => toggleRole(r.id)}
                className={`px-2 py-1 rounded-full text-xs border ${
                  roleIds.includes(r.id) ? 'border-gold-500 bg-gold-500/10 text-gold-600' : 'border-ink-900/15 text-ink-900/60'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="primary" onClick={save} disabled={saving}>
              <span className="flex items-center gap-1 text-xs"><Check size={13} /> {saving ? 'Saving…' : 'Save'}</span>
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              <span className="flex items-center gap-1 text-xs"><X size={13} /> Cancel</span>
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ username: '', email: '', fullName: '', employeeCode: '', roleIds: [] });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const [u, r] = await Promise.all([api.get('/users'), api.get('/users/roles/all')]);
    setUsers(u.data);
    setRoles(r.data);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/users', form);
      setForm({ username: '', email: '', fullName: '', employeeCode: '', roleIds: [] });
      await load();
    } finally {
      setCreating(false);
    }
  }

  function toggleRole(roleId) {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(roleId) ? f.roleIds.filter((id) => id !== roleId) : [...f.roleIds, roleId],
    }));
  }

  async function toggleActive(user) {
    setBusyId(user.id);
    try {
      if (user.isActive) {
        // Soft delete — deactivates rather than hard-deleting, so audit
        // log entries tied to this account stay intact.
        await api.delete(`/users/${user.id}`);
      } else {
        await api.patch(`/users/${user.id}`, { isActive: true });
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Super Admin" navItems={SUPER_ADMIN_NAV}>
      <PageHeader eyebrow="User Management" title="Employees & roles" />

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        <Card className="p-6 col-span-1 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={16} className="text-verdant-600" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">Create employee account</h2>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            {['fullName', 'username', 'email', 'employeeCode'].map((field) => (
              <input
                key={field}
                required={field !== 'employeeCode'}
                placeholder={field === 'fullName' ? 'Full name' : field === 'employeeCode' ? 'Employee code (optional)' : field[0].toUpperCase() + field.slice(1)}
                className="w-full px-3 py-2 rounded-lg border border-ink-900/15 text-sm focus:border-verdant-500 outline-none"
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              />
            ))}
            <div>
              <p className="text-xs text-ink-900/50 mb-2">Assign role(s)</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => toggleRole(r.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border ${
                      form.roleIds.includes(r.id) ? 'border-gold-500 bg-gold-500/10 text-gold-600' : 'border-ink-900/15 text-ink-900/60'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="primary" className="w-full" disabled={creating}>
              {creating ? 'Creating…' : 'Create account & email credentials'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-ink-800" />
            <h2 className="font-display font-semibold text-ink-900 text-sm">All accounts</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-900/40 text-xs uppercase tracking-wide">
                <th className="pb-2">Name</th><th className="pb-2">Username</th><th className="pb-2">Roles</th>
                <th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900/8">
              {users.map((u) =>
                editingId === u.id ? (
                  <EditUserRow
                    key={u.id}
                    user={u}
                    roles={roles}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); load(); }}
                  />
                ) : (
                  <tr key={u.id}>
                    <td className="py-2.5">{u.fullName}</td>
                    <td className="py-2.5 font-mono text-xs">{u.username}</td>
                    <td className="py-2.5">{u.roles.join(', ')}</td>
                    <td className="py-2.5"><Badge tone={u.isActive ? 'verdant' : 'alert'}>{u.isActive ? 'Active' : 'Disabled'}</Badge></td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setEditingId(u.id)}
                          className="text-ink-900/40 hover:text-verdant-600"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        {u.username !== 'superadmin' && (
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={busyId === u.id}
                            className={u.isActive ? 'text-ink-900/40 hover:text-alert' : 'text-ink-900/40 hover:text-verdant-600'}
                            title={u.isActive ? 'Deactivate' : 'Reactivate'}
                          >
                            {u.isActive ? <Ban size={15} /> : <RotateCcw size={15} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
