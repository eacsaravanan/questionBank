import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { bg: 'bg-verdant-500/10', border: 'border-verdant-500/30', text: 'text-verdant-700', icon: CheckCircle2, iconColor: 'text-verdant-600' },
  error: { bg: 'bg-alert/10', border: 'border-alert/30', text: 'text-alert', icon: XCircle, iconColor: 'text-alert' },
  warning: { bg: 'bg-gold-500/10', border: 'border-gold-500/40', text: 'text-gold-700', icon: AlertTriangle, iconColor: 'text-gold-600' },
  info: { bg: 'bg-ink-800/5', border: 'border-ink-800/20', text: 'text-ink-900', icon: Info, iconColor: 'text-ink-700' },
};

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const api = {
    success: (msg) => push('success', msg),
    error: (msg) => push('error', msg),
    warning: (msg) => push('warning', msg),
    info: (msg) => push('info', msg),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
        {toasts.map((t) => {
          const s = STYLES[t.type];
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm bg-white ${s.border} animate-[fadeIn_0.15s_ease-out]`}
            >
              <Icon size={18} className={`shrink-0 mt-0.5 ${s.iconColor}`} />
              <p className={`text-sm flex-1 ${s.text}`}>{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-ink-900/30 hover:text-ink-900/60 shrink-0">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Extracts the best available human-readable message from an API error. */
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}
