import React from 'react';

export function PageHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-start justify-between px-8 pt-8 pb-6">
      <div>
        {eyebrow && <p className="text-xs font-mono uppercase tracking-widest text-verdant-600 mb-1">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, tone = 'ink' }) {
  const tones = {
    ink: 'text-ink-800 bg-ink-800/5',
    gold: 'text-gold-600 bg-gold-500/10',
    verdant: 'text-verdant-600 bg-verdant-500/10',
    alert: 'text-alert bg-alert/10',
  };
  return (
    <div className="bg-white rounded-xl border border-ink-900/8 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-ink-900 leading-none">{value}</p>
        <p className="text-xs text-ink-900/50 mt-1">{label}</p>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'ink' }) {
  const tones = {
    ink: 'bg-ink-800/10 text-ink-800',
    gold: 'bg-gold-500/15 text-gold-600',
    verdant: 'bg-verdant-500/15 text-verdant-600',
    alert: 'bg-alert/15 text-alert',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-ink-900/8 shadow-sm ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-ink-800 text-white hover:bg-ink-700',
    gold: 'bg-gold-500 text-ink-950 hover:bg-gold-400 font-semibold',
    ghost: 'bg-transparent text-ink-800 hover:bg-ink-900/5',
    danger: 'bg-alert text-white hover:opacity-90',
  };
  return (
    <button
      className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
