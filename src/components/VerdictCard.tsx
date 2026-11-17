import { fmtRatio, fmtSigned, VERDICT_RULE, type Verdict, type WindowStat, WINDOWS } from '../domain/metrics';
import { Card } from './ui';

const TONE_META: Record<Verdict['tone'], { chip: string; bar: string }> = {
  calm: { chip: 'bg-stone-100 text-stone-700', bar: 'bg-gold-grad' },
  warm: { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  hot: { chip: 'bg-up/10 text-up', bar: 'bg-up' },
  quiet: { chip: 'bg-down/10 text-down', bar: 'bg-down' },
  na: { chip: 'bg-stone-100 text-stone-500', bar: 'bg-stone-300' },
};

const PHASE_TAG: Record<string, string> = {
  pre: '盘前',
  am: '盘中',
  lunch: '午间半场',
  pm: '盘中',
  after: '收盘后',
  closed: '休市',
};

/** 10 分钟窗口上班标记：上排 09:30–11:30，下排 13:00–15:00，悬停看倍数 */
function WindowTimeline({ windows }: { windows: WindowStat[] }) {
  const map = new Map(windows.map((w) => [w.startHHMM, w]));
  const [am, pm] = [WINDOWS.slice(0, 12), WINDOWS.slice(12)];
  const block = ([a]: [string, string]) => {
    const w = map.get(a);
    if (!w) return null;
    const title = `${w.label} · 实际 ${w.actualYi.toFixed(1)} 亿 / 期望 ${w.expectedYi.toFixed(1)} 亿${w.ratio != null ? ` · ${w.ratio.toFixed(2)}×` : ''}${w.triggered ? ' · 上班信号' : ''}`;
    const cls = w.triggered
      ? 'bg-up'
      : w.complete
        ? 'bg-stone-300/80'
        : 'border border-dashed border-stone-300';
    return (
      <div key={a} title={title} className={`h-4 flex-1 rounded-[3px] ${cls} transition-colors hover:opacity-80`} />
    );
  };
  const anyTriggered = windows.some((w) => w.triggered);
  return (
    <div className="border-t border-slate-100 bg-stone-50/50 px-5 py-3">
      <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-stone-400">
        10 分钟窗口上班标记
        <span className="text-[10px] normal-case tracking-normal">
          红块 = 放量≥2× 且成交≥10 亿 · 悬停看明细
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <span className="w-6 shrink-0 text-[10px] text-stone-400">上午</span>
        <div className="flex flex-1 gap-[3px]">{am.map(block)}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <span className="w-6 shrink-0 text-[10px] text-stone-400">下午</span>
        <div className="flex flex-1 gap-[3px]">{pm.map(block)}</div>
      </div>
      {anyTriggered && (
        <div className="mt-1.5 text-[11px] text-up">
          集中放量窗口：{windows.filter((w) => w.triggered).map((w) => w.label).join('、')}
        </div>
      )}
    </div>
  );
}

export function VerdictCard({
  verdict, phase, ratio, progressPct, avgSum, fullDay, windows = [],
}: {
  verdict: Verdict;
  phase: string;
  ratio: number | null;
  progressPct: number | null;
  avgSum: number; // Σ 20日均额（亿）
  fullDay: boolean;
  windows?: WindowStat[];
}) {
  const tone = TONE_META[verdict.tone];
  // 进度条：同时点进度（盘中）或 100%（收盘）
  const barPct = Math.min(100, fullDay ? 100 : progressPct ?? 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch sm:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium tracking-widest text-ink-muted">
            今日结论
            <span className={`rounded px-1.5 py-0.5 text-[11px] tracking-normal ${tone.chip}`}>{PHASE_TAG[phase] ?? ''}</span>
          </div>
          <h2 className={`font-serif mt-2 text-[26px] font-bold tracking-tight ${verdict.tone === 'hot' ? 'text-up' : verdict.tone === 'quiet' ? 'text-down' : 'text-ink'}`}>
            {verdict.headline}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{verdict.detail}</p>
          <p className="mt-1.5 text-[11px] text-ink-muted">判定口径（自定假设）：{VERDICT_RULE} → 有上班；其余 → 没上班</p>
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-1 rounded-lg border border-dashed border-gold-hair bg-gold-soft/50 px-6 py-3 text-center">
          <div className="text-gold-grad num font-serif text-[40px] font-bold leading-none tracking-tight">{fmtRatio(ratio)}</div>
          <div className="mt-1 text-xs tracking-wide text-ink-muted">{fullDay ? '较 20 日均额' : '较同时点历史均值'}</div>
          {avgSum > 0 && !fullDay && (
            <div className="mt-1 w-40 self-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${barPct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-ink-muted">
                基准 {avgSum.toFixed(1)} 亿 = 20日均额 × 同时点进度 {(progressPct ?? 0).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="hairline-gold" />
      {windows.length > 0 && <WindowTimeline windows={windows} />}
    </Card>
  );
}

export function KpiGrid({
  totalAmount, asOf, dayRatioPool, ratio, progressPct, avgSum, netBuy, wPct, tradeDate, fullDay,
}: {
  totalAmount: number;
  asOf: string;
  dayRatioPool: number | null;
  ratio: number | null;
  progressPct: number | null;
  avgSum: number;
  netBuy: number | null;
  wPct: number | null;
  tradeDate: string;
  fullDay: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="重点池合计成交额" value={totalAmount.toFixed(1)} unit="亿" sub={`截至 ${asOf}${dayRatioPool != null ? ` · 已达成全天日均 ${dayRatioPool.toFixed(2)}×` : ''}`} valueCls="text-gold-deep" />
      <Kpi
        label="成交额放大倍数"
        value={ratio == null ? '—' : `${ratio.toFixed(2)}×`}
        sub={fullDay ? '基准 = 20 日均额' : `基准 ${avgSum.toFixed(1)} 亿 = 20日均额 × 同时点进度 ${(progressPct ?? 0).toFixed(1)}%`}
        barPct={Math.min(100, fullDay ? Math.min(100, (ratio ?? 0) * 50) : progressPct ?? 0)}
      />
      <Kpi label="合计主动净买入" value={netBuy == null ? '—' : fmtSigned(netBuy)} unit="亿" sub="主动买卖口径推算①" valueCls={(netBuy ?? 0) > 0 ? 'text-up' : (netBuy ?? 0) < 0 ? 'text-down' : ''} />
      <Kpi label="池内加权涨跌" value={wPct == null ? '—' : `${wPct > 0 ? '+' : ''}${wPct.toFixed(2)}%`} sub={`规模加权 · ${tradeDate.slice(4, 6)}/${tradeDate.slice(6, 8)}`} valueCls={(wPct ?? 0) > 0 ? 'text-up' : (wPct ?? 0) < 0 ? 'text-down' : ''} />
    </div>
  );
}

function Kpi({ label, value, unit, sub, valueCls = '', barPct }: {
  label: string; value: string; unit?: string; sub?: string; valueCls?: string; barPct?: number;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium tracking-widest text-ink-muted">{label}</div>
      <div className={`num font-serif mt-1.5 text-[26px] font-bold tracking-tight ${valueCls || 'text-ink'}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium text-ink-muted">{unit}</span>}
      </div>
      {barPct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
          <div className="bg-gold-grad h-full rounded-full" style={{ width: `${barPct}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-ink-muted">{sub}</div>}
    </Card>
  );
}
