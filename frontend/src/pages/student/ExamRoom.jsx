import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Flag, ShieldAlert, CheckCircle2 } from 'lucide-react';
import api from '../../api/client.js';

function useCountdown(scheduledEnd) {
  const [remaining, setRemaining] = useState(() => new Date(scheduledEnd) - new Date());
  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(scheduledEnd) - new Date()), 1000);
    return () => clearInterval(id);
  }, [scheduledEnd]);
  const clamped = Math.max(0, remaining);
  const mm = String(Math.floor(clamped / 60000)).padStart(2, '0');
  const ss = String(Math.floor((clamped % 60000) / 1000)).padStart(2, '0');
  return { label: `${mm}:${ss}`, expired: clamped <= 0 };
}

export default function ExamRoom() {
  const { examCode } = useParams();
  const navigate = useNavigate();
  const session = useMemo(() => JSON.parse(sessionStorage.getItem('examSession') || 'null'), []);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> selectedOptionIds
  const [flagged, setFlagged] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const flagSentRef = useRef(new Set());

  const { label: timeLabel, expired } = useCountdown(session?.scheduledEnd || Date.now());

  // Integrity monitoring: report tab-switch / window-blur, never trust the
  // client's own record as truth — this just posts signals for Super Admin
  // to review after the fact; it never blocks the candidate itself, since
  // silently locking someone out is worse than a false positive.
  useEffect(() => {
    function reportFlag(flagType) {
      if (!session) return;
      api.post(`/exam-schedules/attempts/${session.attemptId}/flag`, { flagType }).catch(() => {});
    }
    function onVisibility() {
      if (document.hidden) reportFlag('TAB_HIDDEN');
    }
    function onBlur() { reportFlag('WINDOW_BLUR'); }
    function onCopy(e) { e.preventDefault(); reportFlag('COPY_ATTEMPT'); }
    function onContextMenu(e) { e.preventDefault(); }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [session]);

  useEffect(() => {
    if (expired && !submitted) handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  if (!session) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center text-white">
        No active exam session. <button className="underline ml-2" onClick={() => navigate(`/exam/${examCode}`)}>Go back</button>
      </div>
    );
  }

  const questions = session.questions;
  const q = questions[current];

  async function selectOption(optionId) {
    const selectedOptionIds = [optionId];
    setAnswers((a) => ({ ...a, [q.questionId]: selectedOptionIds }));
    api.put(`/exam-schedules/attempts/${session.attemptId}/answer`, {
      questionId: q.questionId,
      selectedOptionIds,
      isMarkedForReview: !!flagged[q.questionId],
    }).catch(() => {});
  }

  function toggleFlag() {
    setFlagged((f) => ({ ...f, [q.questionId]: !f[q.questionId] }));
  }

  async function handleSubmit() {
    if (submitted) return;
    setSubmitted(true);
    try {
      await api.post(`/exam-schedules/attempts/${session.attemptId}/submit`);
    } finally {
      sessionStorage.removeItem('examSession');
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center text-white text-center px-4">
        <CheckCircle2 className="text-verdant-400 mb-4" size={48} />
        <h1 className="font-display text-2xl font-bold mb-2">Answers submitted</h1>
        <p className="text-white/50 max-w-sm">
          Your responses have been recorded. You may now close this window.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 text-white flex flex-col select-none" onCopy={(e) => e.preventDefault()}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span className="font-mono text-xs text-white/40">{examCode}</span>
        <div className={`flex items-center gap-2 font-mono text-lg font-semibold ${expired ? 'text-alert' : 'text-gold-400'}`}>
          <Clock size={18} /> {timeLabel}
        </div>
        <button
          onClick={handleSubmit}
          className="bg-verdant-500 hover:bg-verdant-400 text-ink-950 font-semibold px-4 py-1.5 rounded-lg text-sm"
        >
          Submit final answers
        </button>
      </header>

      <div className="flex-1 flex">
        <main className="flex-1 p-8 max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/40 text-sm">Question {current + 1} of {questions.length}</span>
            <button
              onClick={toggleFlag}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                flagged[q.questionId] ? 'border-gold-500 text-gold-400' : 'border-white/20 text-white/50'
              }`}
            >
              <Flag size={12} /> Mark for review
            </button>
          </div>

          <p lang={q.translations[0]?.languageCode} className="text-lg mb-6 leading-relaxed">
            {q.translations[0]?.body}
          </p>

          <div className="space-y-3">
            {q.options.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  answers[q.questionId]?.[0] === opt.id
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-white/10 hover:border-white/25'
                }`}
              >
                <input
                  type="radio"
                  name={q.questionId}
                  checked={answers[q.questionId]?.[0] === opt.id}
                  onChange={() => selectOption(opt.id)}
                  className="accent-gold-500"
                />
                <span lang={opt.translations[0]?.languageCode}>{opt.translations[0]?.body}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-between mt-8">
            <button
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
              className="px-4 py-2 rounded-lg border border-white/15 text-sm disabled:opacity-30"
            >
              Previous
            </button>
            <button
              disabled={current === questions.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
              className="px-4 py-2 rounded-lg bg-ink-800 text-sm"
            >
              Next
            </button>
          </div>
        </main>

        <aside className="w-72 border-l border-white/10 p-6">
          <p className="text-xs text-white/40 mb-3 flex items-center gap-1.5">
            <ShieldAlert size={12} /> Question navigator
          </p>
          <div className="grid grid-cols-6 gap-2">
            {questions.map((qq, idx) => {
              const answered = !!answers[qq.questionId];
              const isFlagged = !!flagged[qq.questionId];
              return (
                <button
                  key={qq.questionId}
                  onClick={() => setCurrent(idx)}
                  className={`w-9 h-9 rounded-md text-xs font-mono flex items-center justify-center border ${
                    idx === current
                      ? 'border-gold-500 text-gold-400'
                      : isFlagged
                      ? 'border-gold-600/50 bg-gold-500/10 text-gold-400'
                      : answered
                      ? 'border-verdant-500/50 bg-verdant-500/10 text-verdant-400'
                      : 'border-white/10 text-white/40'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
