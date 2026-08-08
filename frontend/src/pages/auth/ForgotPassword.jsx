import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailQuestion } from 'lucide-react';
import api from '../../api/client.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      // Always show the same success state, whether or not the email
      // exists — the backend responds identically either way, so the UI
      // shouldn't leak the difference either.
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <img src="/dturn-logo.png" alt="dturn" className="h-8 w-auto" />
          <span className="font-display font-bold text-2xl text-white tracking-tight">dturn Question Bank</span>
        </div>

        <div className="bg-ink-900 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <MailQuestion size={15} className="text-verdant-400" />
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Reset your password</p>
          </div>

          {done ? (
            <div className="text-white/80 text-sm leading-relaxed">
              If an account exists for <span className="text-white">{email}</span>, we've sent a password reset
              link to it. The link expires in 30 minutes.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="block text-sm text-white/70 mb-1">Email address</label>
              <input
                type="email"
                className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              {error && <p className="text-alert text-sm mb-4">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
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
