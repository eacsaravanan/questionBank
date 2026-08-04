import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(username, password, needsOtp ? otp : undefined);
      const roleHome = {
        'Super Admin': '/super-admin',
        Admin: '/admin',
        SME: '/sme',
        'Paper Approver': '/sme',
        Aspirant: '/exam',
      };
      navigate(roleHome[user.roles?.[0]] || '/');
    } catch (err) {
      if (err.response?.data?.error === 'MFA_REQUIRED') setNeedsOtp(true);
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

        <form onSubmit={handleSubmit} className="bg-ink-900 border border-white/10 rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={15} className="text-verdant-400" />
            <p className="text-xs font-mono text-white/50 uppercase tracking-widest">Secure sign-in</p>
          </div>

          <label className="block text-sm text-white/70 mb-1">Username</label>
          <input
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />

          <label className="block text-sm text-white/70 mb-1">Password</label>
          <input
            type="password"
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {needsOtp && (
            <>
              <label className="block text-sm text-white/70 mb-1">Authenticator code</label>
              <input
                className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-gold-500 outline-none tracking-widest font-mono"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                placeholder="000000"
                required
              />
            </>
          )}

          {error && error !== 'MFA_REQUIRED' && (
            <p className="text-alert text-sm mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : needsOtp ? 'Verify & sign in' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-white/30 mt-6 font-mono">
          Every sign-in is logged. Unauthorized access is a criminal offence.
        </p>
      </div>
    </div>
  );
}
