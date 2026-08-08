import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';

export default function Profile() {
  const { user, patchUser } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const forcePasswordChange = !!(location.state?.forcePasswordChange || user?.mustResetPassword);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleChangePassword(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
        refreshToken: localStorage.getItem('refreshToken'),
      });
      patchUser({ mustResetPassword: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated.');
    } catch (err) {
      if (err.response?.data?.error === 'WEAK_PASSWORD') {
        setError(err.response.data.problems.join(' '));
      } else if (err.response?.data?.error === 'CURRENT_PASSWORD_INCORRECT') {
        setError('Current password is incorrect.');
      } else {
        setError(err.response?.data?.message || 'Could not update password.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest">Account</p>
        <h1 className="text-2xl font-display font-bold text-white">My Profile</h1>
      </div>

      <div className="bg-ink-900 border border-white/10 rounded-2xl p-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Name</p>
            <p className="text-white">{user?.fullName}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Username</p>
            <p className="text-white">{user?.username}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Email</p>
            <p className="text-white">{user?.email}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Role</p>
            <p className="text-white">{user?.roles?.join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="bg-ink-900 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-verdant-400" />
          <h2 className="text-white font-semibold">Security</h2>
        </div>
        <p className="text-white/50 text-sm mb-5">Change your password. You'll stay signed in on this device.</p>

        {forcePasswordChange && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-5">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200 text-sm">
              Your password was reset by an administrator. Please set a new password to continue.
            </p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="max-w-sm">
          <label className="block text-sm text-white/70 mb-1">Current password</label>
          <input
            type="password"
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label className="block text-sm text-white/70 mb-1">New password</label>
          <input
            type="password"
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <label className="block text-sm text-white/70 mb-1">Confirm new password</label>
          <input
            type="password"
            className="w-full mb-2 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <p className="text-xs text-white/40 mb-4">
            At least 10 characters, with uppercase, lowercase, a digit, and a symbol.
          </p>

          {error && <p className="text-alert text-sm mb-4">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
