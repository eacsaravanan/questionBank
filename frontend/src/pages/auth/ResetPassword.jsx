import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import api from '../../api/client.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      if (err.response?.data?.error === 'WEAK_PASSWORD') {
        setError(err.response.data.problems.join(' '));
      } else if (err.response?.data?.error === 'TOKEN_INVALID_OR_EXPIRED') {
        setError('This reset link is invalid or has expired. Request a new one.');
      } else {
        setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <img src="/dturn_site_logo.png" alt="dturn" className="h-8 w-auto" style={{ background: '#fff', borderRadius: '10px', padding: '10px' }} />
          <span className="font-display font-bold text-2xl text-white tracking-tight">dEDU</span>
        </div>

        <div className="bg-ink-900 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound size={15} className="text-verdant-400" />
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Set a new password</p>
          </div>

          {!token ? (
            <p className="text-white/70 text-sm">
              This link is missing its reset token.{' '}
              <Link to="/forgot-password" className="text-gold-400">Request a new one</Link>.
            </p>
          ) : done ? (
            <p className="text-white/80 text-sm">Password updated. Redirecting you to sign in…</p>
          ) : (
            <form onSubmit={handleSubmit}>
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
                className="w-full bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <Link to="/login" className="text-xs text-white/50 hover:text-gold-400">
              &larr; Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
