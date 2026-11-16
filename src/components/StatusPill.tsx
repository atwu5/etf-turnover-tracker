import { fmtDateTime } from '../domain/format';
import type { SessionPhase } from '../domain/session';

const PHASE_META: Record<SessionPhase, { text: (d: string) => string; dot: string; ring: string }> = {
  pre: { text: () => '盘前等待 · 展示上一交易日数据', dot: 'bg-stone-400', ring: 'ring-stone-200' },
  am: { text: () => '实时跟踪中 · 每 20 秒', dot: 'bg-emerald-600 animate-pulse', ring: 'ring-emerald-100' },
  lunch: { text: () => '午间休市 · 数据锁定 11:30', dot: 'bg-amber-500', ring: 'ring-amber-100' },
  pm: { text: () => '实时跟踪中 · 每 20 秒', dot: 'bg-emerald-600 animate-pulse', ring: 'ring-emerald-100' },
  after: { text: () => '已收盘 · 收盘数据', dot: 'bg-gold', ring: 'ring-gold/25' },
  closed: { text: (d) => `休市中 · 展示 ${d} 数据`, dot: 'bg-stone-400', ring: 'ring-stone-200' },
};

export function StatusPill({ phase, tradeDate, lastUpdate }: { phase: SessionPhase; tradeDate: string; lastUpdate: Date | null }) {
  const meta = PHASE_META[phase];
  const pretty = tradeDate ? `${tradeDate.slice(0, 4)}-${tradeDate.slice(4, 6)}-${tradeDate.slice(6, 8)}` : '';
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-gold-hair/70 bg-ivory-card px-3 py-1.5 text-[13px] font-medium text-ink-soft shadow-sm ring-1 ${meta.ring}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <span>{meta.text(pretty)}</span>
      {lastUpdate && <span className="num text-xs text-ink-muted">· {fmtDateTime(lastUpdate)}</span>}
    </div>
  );
}
