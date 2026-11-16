import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-gold-hair/70 bg-ivory-card shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-4 py-3">
      <h3 className="text-[15px] font-semibold text-stone-800">{children}</h3>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'core' | 'watch'; children: ReactNode }) {
  const cls =
    tone === 'core'
      ? 'bg-gold-soft text-gold-ink border-gold/50'
      : 'bg-stone-100 text-stone-500 border-stone-300';
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1 py-px text-[10px] font-medium leading-tight tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

/** 红涨绿跌（A 股惯例） */
export function DeltaText({ value, suffix = '', className = '', digits = 2 }: { value: number | null; suffix?: string; className?: string; digits?: number }) {
  if (value == null || !isFinite(value)) return <span className={`text-stone-400 ${className}`}>—</span>;
  const cls = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-stone-500';
  const s = value.toFixed(digits);
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`num font-medium ${cls} ${className}`}>
      {sign}
      {s}
      {suffix}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin text-gold ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}
