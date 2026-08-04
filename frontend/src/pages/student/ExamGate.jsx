import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, KeyRound } from 'lucide-react';
import api from '../../api/client.js';

export default function ExamGate() {
  const { examCode } = useParams();
  const navigate = useNavigate();
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleStart(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/exam-schedules/${examCode}/start`, { verificationCode });
      sessionStorage.setItem('examSession', JSON.stringify(data));
      navigate(`/exam/${examCode}/room`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to start the exam.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <ShieldCheck className="text-gold-500 mx-auto mb-4" size={36} />
        <h1 className="font-display text-white text-xl font-bold mb-1">Exam verification</h1>
        <p className="text-white/50 text-sm mb-8 font-mono">{examCode}</p>

        <form onSubmit={handleStart} className="bg-ink-900 border border-white/10 rounded-2xl p-8 text-left">
          <label className="flex items-center gap-2 text-sm text-white/70 mb-2">
            <KeyRound size={14} /> Verification code
          </label>
          <input
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white tracking-widest font-mono focus:border-gold-500 outline-none"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            maxLength={6}
            placeholder="000000"
            required
          />
          {error && <p className="text-alert text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-500 hover:bg-gold-400 text-ink-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Enter exam room'}
          </button>
        </form>

        <p className="text-white/30 text-xs mt-6 leading-relaxed">
          The exam will only start if you're inside the scheduled time window. Your session,
          IP address, and device are logged for exam integrity.
        </p>
      </div>
    </div>
  );
}
