import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui.jsx';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, tone, resolve }

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({
        title: options.title || 'Are you sure?',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        tone: options.tone || 'danger', // 'danger' | 'primary'
        resolve,
      });
    });
  }, []);

  function handle(result) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${state.tone === 'danger' ? 'bg-alert/10 text-alert' : 'bg-gold-500/10 text-gold-600'}`}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-ink-900">{state.title}</h3>
                {state.message && <p className="text-sm text-ink-900/60 mt-1">{state.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => handle(false)}>Cancel</Button>
              <Button variant={state.tone === 'danger' ? 'danger' : 'primary'} onClick={() => handle(true)}>
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm(options) function: await confirm({ title, message, confirmLabel, tone }) -> boolean */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
