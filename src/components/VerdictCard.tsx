import { fmtRatio, fmtSigned, type Verdict } from '../domain/metrics';
import { Card } from './ui';

const TONE_META: Record<Verdict['tone'], { chip: string; bar: string }> = {
  calm: { chip: 'bg-slate-100 text-slate-700', bar: 'bg-brand' },
  warm: { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  hot: { chip: 'bg-up/10 text-up', bar: 'bg-up' },
  quiet: { chip: 'bg-down/10 text-down', bar: 'bg-down' },
  na: { chip: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300' },
};

const PHASE_TAG: Record<string, string> = {
  pre: '盘前',
  am: '盘中',
  lunch: '午间半场',
  pm: '盘中',
  after: '收盘后',
  closed: '休市',
};

export function VerdictCard({
  verdict, phase, ratio, progressPct, avgSum, fullDay,
}: {
  verdict: Verdict;
  phase: string;
  ratio: number | null;
  progressPct: number | null;
  avgSum: number; // Σ 20日均额（亿）
  fullDay: boolean;
}) {
  const tone = TONE_META[verdict.tone];
  // 进度条：同时点进度（盘中）或 100%（收盘）
  const barPct = Math.min(100, fullDay ? 100 : progressPct ?? 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-stretch sm:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            今日结论
            <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone.chip}`}>{PHASE_TAG[phase] ?? ''}</span>
          </div>
          <h2 className={`mt-1.5 text-2xl font-bold tracking-tight ${verdict.tone === 'hot' ? 'text-up' : verdict.tone === 'quiet' ? 'text-down' : 'text-slate-900'}`}>
            {verdict.headline}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{verdict.detail}</p>
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-3 text-center">
          <div className="num text-4xl font-bold tracking-tight text-slate-900">{fmtRatio(ratio)}</div>
          <div className="text-xs text-slate-400">{fullDay ? '较 20 日均额' : '较同时点历史均值'}</div>
          {avgSum > 0 && !fullDay && (
            <div className="mt-1 w-40 self-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${barPct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                基准 {avgSum.toFixed(1)} 亿 = 20日均额 × 同时点进度 {(progressPct ?? 0).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>
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
      <Kpi label="重点池合计成交额" value={totalAmount.toFixed(1)} unit="亿" sub={`截至 ${asOf}${dayRatioPool != null ? ` · 已达成全天日均 ${dayRatioPool.toFixed(2)}×` : ''}`} valueCls="text-brand-dark" />
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
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className={`num mt-1 text-2xl font-bold tracking-tight ${valueCls || 'text-slate-900'}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      {barPct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-slate-400">{sub}</div>}
    </Card>
  );
}
