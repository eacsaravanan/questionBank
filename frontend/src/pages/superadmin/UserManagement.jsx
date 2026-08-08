import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Pencil, Ban, RotateCcw, X, Check, Trash2, KeyRound } from 'lucide-react';
import AppShell from '../../components/AppShell.jsx';
import { PageHeader, Card, Button, Badge } from '../../components/ui.jsx';
import { SUPER_ADMIN_NAV } from './nav.js';
import api from '../../api/client.js';
import { useToast, apiErrorMessage } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';

function EditUserRow({ user, roles, onCancel, onSaved }) {
  const toast = useToast();
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
    if (!fullName.trim() || !email.trim()) {
      toast.warning('Name and email are required.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { fullName: fullName.trim(), email: email.trim(), roleIds });
      toast.success(`${fullName.trim()} updated.`);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save changes.'));
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
  const toast = useToast();
  const confirm = useConfirm();
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
  useEffect(() => { load().catch((err) => toast.error(apiErrorMessage(err, 'Could not load accounts.'))); }, []); // eslint-disable-line

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.username.trim() || !form.email.trim()) {
      toast.warning('Full name, username, and email are required.');
      return;
    }
    if (form.roleIds.length === 0) {
      toast.warning('Assign at least one role to this account.');
      return;
    }
    setCreating(true);
    try {
      await api.post('/users', form);
      const name = form.fullName;
      setForm({ username: '', email: '', fullName: '', employeeCode: '', roleIds: [] });
      await load();
      toast.success(`Account created for ${name}. Login credentials have been emailed (or check the audit trail if SMTP isn't configured).`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the account.'));
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
    const willDeactivate = user.isActive;
    const ok = await confirm({
      title: willDeactivate ? `Deactivate ${user.fullName}?` : `Reactivate ${user.fullName}?`,
      message: willDeactivate
        ? 'They will be immediately signed out and unable to log in. Their history and audit trail stay intact, and you can reactivate at any time.'
        : 'They will be able to log in again with their existing credentials.',
      confirmLabel: willDeactivate ? 'Deactivate' : 'Reactivate',
      tone: willDeactivate ? 'danger' : 'primary',
    });
    if (!ok) return;

    setBusyId(user.id);
    try {
      if (willDeactivate) {
        await api.delete(`/users/${user.id}`);
        toast.success(`${user.fullName} deactivated.`);
      } else {
        await api.patch(`/users/${user.id}`, { isActive: true });
        toast.success(`${user.fullName} reactivated.`);
      }
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update this account.'));
    } finally {
      setBusyId(null);
    }
  }

  async function permanentDelete(user) {
    const ok = await confirm({
      title: `Permanently delete ${user.fullName}?`,
      message: 'This cannot be undone. It will only succeed if this account has no questions, papers, reviews, or audit history attached — otherwise deactivate it instead.',
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(user.id);
    try {
      await api.delete(`/users/${user.id}/permanent`);
      toast.success(`${user.fullName} permanently deleted.`);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not permanently delete this account.'));
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(user) {
    const ok = await confirm({
      title: `Reset password for ${user.fullName}?`,
      message: 'They will be signed out of all devices and required to set a new password on next login. A temporary password will be emailed to them (or shown here if email isn\'t configured).',
      confirmLabel: 'Reset password',
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(user.id);
    try {
      const { data } = await api.post(`/users/${user.id}/reset-password`);
      toast.success(
        data.tempPassword
          ? `Password reset. Temporary password: ${data.tempPassword}`
          : `Password reset. A temporary password has been emailed to ${user.fullName}.`
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not reset this account\'s password.'));
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
                          <>
                            <button
                              onClick={() => resetPassword(u)}
                              disabled={busyId === u.id}
                              className="text-ink-900/40 hover:text-verdant-600"
                              title="Reset password"
                            >
                              <KeyRound size={15} />
                            </button>
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={busyId === u.id}
                              className={u.isActive ? 'text-ink-900/40 hover:text-alert' : 'text-ink-900/40 hover:text-verdant-600'}
                              title={u.isActive ? 'Deactivate' : 'Reactivate'}
                            >
                              {u.isActive ? <Ban size={15} /> : <RotateCcw size={15} />}
                            </button>
                            <button
                              onClick={() => permanentDelete(u)}
                              disabled={busyId === u.id}
                              className="text-ink-900/40 hover:text-alert"
                              title="Delete permanently"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
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
