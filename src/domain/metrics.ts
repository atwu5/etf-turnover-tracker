/**
 * 核心指标计算（纯函数，零 DOM，全部可测试）。
 * 口径与参考站一致，见 docs/SPEC.md 第二节。
 */

import type { Bar } from '../data/sina';
import { minutesOf } from './session';

export type { Bar };

/** 5 分钟 K 一天的 48 个时点标签（K 线结束时间） */
export const BAR_LABELS: string[] = [
  ...morningLabels(),
  ...afternoonLabels(),
];

function morningLabels(): string[] {
  const out: string[] = [];
  for (let m = 9 * 60 + 35; m <= 11 * 60 + 30; m += 5) out.push(hhmm(m));
  return out;
}
function afternoonLabels(): string[] {
  const out: string[] = [];
  for (let m = 13 * 60 + 5; m <= 15 * 60; m += 5) out.push(hhmm(m));
  return out;
}
export function hhmm(m: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}

/** 单根 K 的成交额（亿）：优先 amount 精确值，缺失时 volume(份)×close 估算 */
export function barAmountYi(b: Bar): number {
  const yuan = b.amount ?? b.volume * b.close;
  return yuan / 1e8;
}

/** 按交易日分组（保持时间序） */
export function groupByDay(bars: Bar[]): Map<string, Bar[]> {
  const map = new Map<string, Bar[]>();
  for (const b of bars) {
    const arr = map.get(b.date);
    if (arr) arr.push(b);
    else map.set(b.date, [b]);
  }
  return map;
}

/** 完整交易日 = 当日 K 线覆盖到 15:00（至少 40 根） */
export function isCompleteDay(dayBars: Bar[]): boolean {
  return dayBars.length >= 40 && dayBars[dayBars.length - 1].hm === '15:00';
}

/**
 * 基线：从 5 分钟 K 构建单只 ETF 的指标基线。
 * avg20 / shape / tailBase 只用「不含当日」的最近 20 个完整交易日；
 * hist30 含当日（若当日已完整）。
 */
export interface Baseline {
  /** 20 日均额（亿元） */
  avg20Yi: number;
  /** 日内累计成交额占比曲线（48 时点，近 20 日均值） */
  shape: [string, number][];
  /** 尾盘（14:30–15:00）占比的 20 日均值 */
  tailBase: number;
  /** 近 30 日成交额（亿元，按日期升序，含当日若完整） */
  hist30: { date: string; amountYi: number }[];
  /** 实际使用的完整交易日数（不足 20 时小于 20） */
  daysUsed: number;
  /** 数据来源标记 */
  source: 'sina5m' | 'sinaDaily' | 'tencentDaily';
  /** 当日尾盘占比（仅当日完整收盘后计算并缓存） */
  tailToday?: number;
}

export function buildBaselineFrom5m(bars: Bar[], today: string): Baseline | null {
  const byDay = groupByDay(bars);
  const dates = [...byDay.keys()].filter((d) => isCompleteDay(byDay.get(d)!)).sort();
  if (dates.length === 0) return null;
  const hist30 = dates
    .filter((d) => d <= today)
    .slice(-30)
    .map((d) => ({ date: d, amountYi: dayTotal(byDay.get(d)!) }));
  const prevDays = dates.filter((d) => d < today).slice(-20);
  if (prevDays.length === 0) return null;
  const shape = averageShape(prevDays.map((d) => byDay.get(d)!));
  if (!shape) return null;
  const avg20Yi = prevDays.reduce((s, d) => s + dayTotal(byDay.get(d)!), 0) / prevDays.length;
  const tailBase = prevDays.reduce((s, d) => s + (tailAmountYi(byDay.get(d)!) / dayTotal(byDay.get(d)!)), 0) / prevDays.length;
  return { avg20Yi, shape, tailBase, hist30, daysUsed: prevDays.length, source: 'sina5m' };
}

/** 某日全天成交额（亿） */
export function dayTotal(dayBars: Bar[]): number {
  return dayBars.reduce((s, b) => s + barAmountYi(b), 0);
}

/** 尾盘（14:30–15:00，即结束时间 14:35–15:00 的 6 根 K）成交额（亿） */
export function tailAmountYi(dayBars: Bar[]): number {
  return dayBars
    .filter((b) => {
      const m = minutesOf(b.hm);
      return m > 14 * 60 + 30 && m <= 15 * 60;
    })
    .reduce((s, b) => s + barAmountYi(b), 0);
}

/** 当日尾盘占比（0–1）；无全天数据返回 null */
export function tailRatioOfDay(dayBars: Bar[]): number | null {
  if (!isCompleteDay(dayBars)) return null;
  const total = dayTotal(dayBars);
  if (total <= 0) return null;
  return tailAmountYi(dayBars) / total;
}

/** 多日平均的日内累计占比曲线（48 时点） */
export function averageShape(days: Bar[][]): [string, number][] | null {
  if (days.length === 0) return null;
  const sum = new Array(BAR_LABELS.length).fill(0);
  let used = 0;
  for (const day of days) {
    if (day.length < BAR_LABELS.length) continue; // 48 根齐才参与，避免错位
    let cum = 0;
    const total = dayTotal(day);
    if (total <= 0) continue;
    for (let i = 0; i < BAR_LABELS.length; i++) {
      cum += barAmountYi(day[i]);
      sum[i] += cum / total;
    }
    used++;
  }
  if (used === 0) return null;
  return BAR_LABELS.map((label, i) => [label, sum[i] / used] as [string, number]);
}

/**
 * 当前时点已完成的历史进度 P（阶梯取值：最后一根已走完的 5 分钟 K 的累计占比）。
 * 盘中（am/pm）按当前时间取；lunch 锁定 11:30；after/closed 为 1；pre 为 0。
 */
export function progressAt(shape: [string, number][], nowHHMMStr: string, phase: 'pre' | 'am' | 'lunch' | 'pm' | 'after' | 'closed'): number {
  if (phase === 'after' || phase === 'closed') return 1;
  if (phase === 'pre') return 0;
  const nowM = minutesOf(nowHHMMStr);
  if (phase === 'lunch') {
    const pt = shape.find(([l]) => l === '11:30');
    return pt ? pt[1] : 0;
  }
  let p = 0;
  for (const [label, v] of shape) {
    const lm = minutesOf(label);
    if (phase === 'am' && lm > 11 * 60 + 30) break; // 上午不取下午时点
    if (lm <= nowM) p = v;
    else break;
  }
  return p;
}

/** 同时点倍数 = 当前累计成交额 ÷ (20日均额 × 同时点进度) */
export function spotRatio(amountYi: number, avg20Yi: number, progress: number): number | null {
  if (progress <= 0 || avg20Yi <= 0) return null;
  return amountYi / (avg20Yi * progress);
}

/** 已达成日均 = 当前累计成交额 ÷ 20日均额 */
export function dayRatio(amountYi: number, avg20Yi: number): number | null {
  if (avg20Yi <= 0) return null;
  return amountYi / avg20Yi;
}

/** 主动净买入① = (外盘−内盘)÷(外盘+内盘) × 成交额（亿） */
export function netBuyYi(outerLots: number, innerLots: number, amountYi: number): number | null {
  const total = outerLots + innerLots;
  if (total <= 0) return null;
  return ((outerLots - innerLots) / total) * amountYi;
}

/** 池内规模加权涨跌（%） */
export function weightedPct(items: { mktcapYi: number; pct: number }[]): number | null {
  const cap = items.reduce((s, x) => s + x.mktcapYi, 0);
  if (cap <= 0) return null;
  return items.reduce((s, x) => s + x.mktcapYi * x.pct, 0) / cap;
}

/** 申赎估算② = (当日份额 − 上一交易日份额) × 现价（亿元）；单位均为亿份 */
export function subscrNetYi(sharesYi: number, prevSharesYi: number | null, price: number): number | null {
  if (prevSharesYi == null || prevSharesYi <= 0 || price <= 0) return null;
  return (sharesYi - prevSharesYi) * price;
}

/**
 * 份额源未日更自检：同一市场 ≥70% 标的两日份额完全相同 → 判定该市场份额字段未更新。
 */
export function detectStaleMarkets(
  todayRec: Record<string, number>,
  prevRec: Record<string, number>,
  marketOf: (code: string) => 'sh' | 'sz',
): { sh: boolean; sz: boolean } {
  const out = { sh: false, sz: false };
  if (!prevRec) return out;
  const groups: Record<'sh' | 'sz', { same: number; total: number }> = { sh: { same: 0, total: 0 }, sz: { same: 0, total: 0 } };
  for (const code of Object.keys(todayRec)) {
    const mkt = marketOf(code);
    const prev = prevRec[code];
    if (prev == null) continue;
    groups[mkt].total++;
    if (todayRec[code] === prev) groups[mkt].same++;
  }
  (['sh', 'sz'] as const).forEach((mkt) => {
    const g = groups[mkt];
    if (g.total >= 5 && g.same / g.total >= 0.7) out[mkt] = true;
  });
  return out;
}

/**
 * 份额历史序列：每日份额变化（亿份）与加仓指数（首日=100）。
 * 份额源未日更的市场当日不贡献变化量；加仓指数对该类标的按前值顺延。
 */
export interface ShareSeriesPoint {
  date: string;
  /** 池内当日份额变化合计（亿份，正=净申购） */
  changeYi: number | null;
  /** 加仓指数（首日=100） */
  indexVal: number | null;
}

export function buildShareSeries(
  dates: string[],
  byDate: Record<string, Record<string, number>>,
  stale: Record<string, { sh?: boolean; sz?: boolean }>,
  codes: string[],
  marketOf: (code: string) => 'sh' | 'sz',
): ShareSeriesPoint[] {
  const out: ShareSeriesPoint[] = [];
  let baseTotal: number | null = null;
  const lastGood = new Map<string, number>();
  for (const date of dates) {
    const rec = byDate[date];
    if (!rec) continue;
    const st = stale[date] ?? {};
    let changeSum = 0;
    let changeCount = 0;
    let total = 0;
    let totalKnown = 0;
    for (const code of codes) {
      const v = rec[code];
      if (v == null) continue;
      const mkt = marketOf(code);
      const prev = lastGood.get(code);
      if (!st[mkt]) {
        if (prev != null) {
          changeSum += v - prev;
          changeCount++;
        }
        lastGood.set(code, v);
      }
      total += lastGood.get(code) ?? v;
      totalKnown++;
    }
    if (baseTotal == null && totalKnown > 0) baseTotal = total;
    out.push({
      date,
      changeYi: changeCount > 0 ? changeSum : null,
      indexVal: baseTotal && baseTotal > 0 && totalKnown > 0 ? (100 * total) / baseTotal : null,
    });
  }
  return out;
}

/** 结论文案：二元判定（原站内部阈值不可见，阈值为本站自定假设，已在 SPEC 标注） */
export interface Verdict {
  headline: string;
  detail: string;
  tone: 'calm' | 'warm' | 'hot' | 'quiet' | 'na';
}

/** 判定阈值：全天口径（同时点倍数≥1.5且净买入>0，或净买入≥50亿），或任一完整 10 分钟窗口放量≥2×且成交≥10亿 → 有上班 */
export const VERDICT_RULE =
  '全天同时点倍数 ≥ 1.5 且主动净买入为正，或主动净买入 ≥ 50 亿；或任一完整 10 分钟窗口放量 ≥ 2× 且成交 ≥ 10 亿';

export const WINDOW_RATIO_TRIGGER = 2.0;
export const WINDOW_MIN_AMOUNT_YI = 10;

/** 10 分钟窗口（09:30–11:30 12 个 + 13:00–15:00 12 个） */
export const WINDOWS: [string, string][] = (() => {
  const out: [string, string][] = [];
  let m1 = 9 * 60 + 30;
  let m2 = m1 + 10;
  for (let i = 0; i < 24; i++) {
    out.push([hhmm(m1), hhmm(m2)]);
    if (m2 === 11 * 60 + 30) {
      m1 = 13 * 60;
      m2 = m1 + 10;
    } else {
      m1 = m2;
      m2 += 10;
    }
  }
  return out;
})();

export interface WindowStat {
  startHHMM: string;
  endHHMM: string;
  label: string;
  /** 当日该窗口实际成交额（亿，重点池合计） */
  actualYi: number;
  /** 期望成交额 = Σ 20日均额 × 该窗口历史占比（亿） */
  expectedYi: number;
  ratio: number | null;
  triggered: boolean;
  /** 窗口是否已走完 */
  complete: boolean;
}

/**
 * 10 分钟窗口放量判定（重点池合计）。
 * 期望 = Σ(各标的 20日均额 × 该窗口历史占比)，占比来自日内分布 shape（近 20 日均值）。
 * 窗口净买入无法从公开分钟数据取得（外盘/内盘为全日累计），故窗口只判放量。
 */
export function buildWindowStats(
  funds: { avg20Yi: number; shape: [string, number][] }[],
  todayBars: Record<string, Bar[]>,
  tradeDate: string,
  nowHHMMStr: string,
  phase: 'pre' | 'am' | 'lunch' | 'pm' | 'after' | 'closed',
): WindowStat[] {
  const nowM = minutesOf(nowHHMMStr);
  const cumAt = (shape: [string, number][], t: string): number => {
    let v = 0;
    for (const [label, x] of shape) {
      if (minutesOf(label) <= minutesOf(t)) v = x;
      else break;
    }
    return v;
  };
  const out: WindowStat[] = [];
  for (const [a, b] of WINDOWS) {
    const aM = minutesOf(a);
    const bM = minutesOf(b);
    let actual = 0;
    let expected = 0;
    for (const f of funds) {
      if (!(f.avg20Yi > 0) || f.shape.length === 0) continue;
      expected += f.avg20Yi * (cumAt(f.shape, b) - cumAt(f.shape, a));
    }
    for (const bars of Object.values(todayBars)) {
      for (const bar of bars) {
        if (bar.date !== tradeDate) continue;
        const m = minutesOf(bar.hm);
        if (m > aM && m <= bM) actual += barAmountYi(bar);
      }
    }
    const complete = (() => {
      if (phase === 'after' || phase === 'closed') return true;
      if (phase === 'pre') return false;
      if (phase === 'lunch') return bM <= 11 * 60 + 30;
      if (phase === 'am') return bM <= nowM && bM <= 11 * 60 + 30;
      return bM <= nowM; // pm
    })();
    const ratio = expected > 0 ? actual / expected : null;
    const triggered = complete && ratio != null && ratio >= WINDOW_RATIO_TRIGGER && actual >= WINDOW_MIN_AMOUNT_YI;
    out.push({ startHHMM: a, endHHMM: b, label: `${a}–${b}`, actualYi: actual, expectedYi: expected, ratio, triggered, complete });
  }
  return out;
}

export function makeVerdict(args: {
  phase: 'pre' | 'am' | 'lunch' | 'pm' | 'after' | 'closed';
  ratio: number | null; // 池级同时点倍数（收盘后=相对20日均额）
  netBuy: number | null; // 池级合计主动净买入（亿）
  progressPct: number | null; // 同时点进度 %
  tailToday: number | null; // 当日尾盘占比（收盘后）
  tailBase: number | null; // 尾盘占比 20 日均值
  fullDay: boolean;
  windows?: WindowStat[];
}): Verdict {
  const { phase, ratio, netBuy, progressPct, tailToday, tailBase, fullDay, windows } = args;
  // 二元判定：全天口径或任一完整窗口放量，均算上班
  const triggered = (windows ?? []).filter((w) => w.triggered);
  const working =
    (ratio != null && ((ratio >= 1.5 && (netBuy ?? 0) > 0) || (netBuy ?? 0) >= 50)) || triggered.length > 0;
  const headline = working ? '汪汪队有上班' : '汪汪队没上班';
  const tone: Verdict['tone'] = ratio == null ? 'na' : working ? 'hot' : 'calm';

  const parts: string[] = [];
  if (phase === 'pre') parts.push('今日尚未开盘，暂无信号，按未上班展示');
  if (ratio == null) parts.push('20日均额与日内分布基线仍在计算，暂按未上班展示');
  const netTxt =
    netBuy == null
      ? ''
      : Math.abs(netBuy) >= 15
        ? `主动净买入 ${fmtSigned(netBuy)} 亿元，${netBuy > 0 ? '买盘明显占优' : '卖盘明显占优'}`
        : Math.abs(netBuy) >= 5
          ? `主动净买入 ${fmtSigned(netBuy)} 亿元`
          : '主动买卖基本均衡，量价都平静';
  if (ratio != null) {
    parts.push(
      fullDay
        ? `全天成交额为 20 日均额的 ${ratio.toFixed(2)} 倍`
        : `成交额为历史同时点均值的 ${ratio.toFixed(2)} 倍（历史平均已走完全天 ${(progressPct ?? 0).toFixed(1)}%，分母已同比例缩小）`,
    );
  }
  if (netTxt) parts.push(netTxt);
  if (triggered.length > 0) {
    const list = triggered
      .slice(-3)
      .map((w) => `${w.label} 放量 ${w.ratio!.toFixed(1)}×（成交 ${w.actualYi.toFixed(1)} 亿）`)
      .join('、');
    parts.push(`10 分钟窗口出现集中放量：${list}${triggered.length > 3 ? ` 等 ${triggered.length} 个窗口` : ''}`);
  }
  if (fullDay && tailToday != null && tailBase != null && tailBase > 0) {
    const r = tailToday / tailBase;
    parts.push(
      r >= 1.3
        ? `尾盘成交占比 ${(tailToday * 100).toFixed(1)}%，明显高于 20 日均值 ${(tailBase * 100).toFixed(1)}%，尾盘有集中动作`
        : `尾盘成交占比 ${(tailToday * 100).toFixed(1)}%，与 20 日均值 ${(tailBase * 100).toFixed(1)}% 相当，尾盘平静`,
    );
  }
  parts.push('（主动净买入为逐笔方向推算，非资金净流入）');
  return { headline, detail: parts.join('；'), tone };
}

export function fmtSigned(n: number, digits = 2): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function fmtYi(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtRatio(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(digits)}×`;
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—';
  const s = n.toFixed(digits);
  return `${n > 0 ? '+' : ''}${s}%`;
}
