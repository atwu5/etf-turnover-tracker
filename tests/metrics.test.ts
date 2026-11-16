import { describe, expect, it } from 'vitest';
import {
  BAR_LABELS, averageShape, barAmountYi, buildBaselineFrom5m, buildShareSeries, dayRatio,
  detectStaleMarkets, fmtSigned, makeVerdict, netBuyYi, progressAt, spotRatio, subscrNetYi,
  tailAmountYi, tailRatioOfDay, weightedPct, hhmm,
  type Bar,
} from '../src/domain/metrics';

// ---------- 工具：构造合成 5 分钟 K ----------
function synthDay(date: string, totalYi: number, opts: { shapePower?: number } = {}): Bar[] {
  // 48 根 K，按「上午占 ~52%、前密后疏」的常见形态生成
  const power = opts.shapePower ?? 1.6;
  const labels = BAR_LABELS;
  const w = labels.map((_, i) => Math.pow(1 - i / labels.length, power) + 0.05);
  const wsum = w.reduce((s, x) => s + x, 0);
  let cum = 0;
  return labels.map((hm, i) => {
    cum += w[i] / wsum;
    const amountYuan = ((w[i] / wsum) * totalYi) * 1e8;
    return { date, hm, close: 4, volume: 0, amount: amountYuan, _cum: cum } as Bar & { _cum: number };
  });
}

describe('barAmountYi / 单位换算', () => {
  it('优先使用 amount 精确值（元 → 亿）', () => {
    expect(barAmountYi({ date: '20261114', hm: '09:35', close: 4, volume: 100, amount: 2e8 })).toBeCloseTo(2);
  });
  it('amount 缺失时用 volume(份)×close 估算', () => {
    expect(barAmountYi({ date: '20261114', hm: '09:35', close: 4, volume: 1e8 })).toBeCloseTo(4);
  });
});

describe('progressAt（同时点进度，阶梯取值）', () => {
  const shape: [string, number][] = [
    ['09:35', 0.08], ['09:40', 0.12], ['11:30', 0.5], ['13:05', 0.52], ['15:00', 1],
  ];
  it('取最后一根已走完 K 的累计占比（不插值）', () => {
    expect(progressAt(shape, '11:27', 'am')).toBeCloseTo(0.12); // 11:30 未走完 → 09:40 为最后完成
    expect(progressAt(shape, '11:30', 'am')).toBeCloseTo(0.5);
    expect(progressAt(shape, '13:02', 'pm')).toBeCloseTo(0.5);  // 午后未到 13:05 → 锁定 11:30
    expect(progressAt(shape, '14:00', 'pm')).toBeCloseTo(0.52);
  });
  it('午间休市锁定 11:30，收盘/休市为 1，盘前为 0', () => {
    expect(progressAt(shape, '12:00', 'lunch')).toBeCloseTo(0.5);
    expect(progressAt(shape, '16:00', 'after')).toBe(1);
    expect(progressAt(shape, '09:00', 'closed')).toBe(1);
    expect(progressAt(shape, '09:00', 'pre')).toBe(0);
  });
  it('上午阶段不取下午时点', () => {
    expect(progressAt(shape, '10:00', 'am')).toBeCloseTo(0.12);
  });
});

describe('倍数与净买入', () => {
  it('同时点倍数 = A ÷ (V×P)', () => {
    expect(spotRatio(10, 40, 0.25)).toBeCloseTo(1);
    expect(spotRatio(10, 40, 0)).toBeNull();
  });
  it('已达成日均 = A ÷ V', () => {
    expect(dayRatio(10, 40)).toBeCloseTo(0.25);
  });
  it('主动净买入 = (外-内)/(外+内)×A，内外盘和为 0 时返回 null', () => {
    expect(netBuyYi(300, 100, 10)).toBeCloseTo(5);
    expect(netBuyYi(100, 300, 10)).toBeCloseTo(-5);
    expect(netBuyYi(0, 0, 10)).toBeNull();
  });
  it('申赎估算 = (今份额-昨份额)×现价（亿）', () => {
    expect(subscrNetYi(500e8, 490e8, 4)).toBeCloseTo(40);
    expect(subscrNetYi(500e8, null, 4)).toBeNull();
  });
  it('规模加权涨跌', () => {
    expect(weightedPct([{ mktcapYi: 1000, pct: -2 }, { mktcapYi: 1000, pct: 0 }])).toBeCloseTo(-1);
  });
});

describe('shape / 基线构建', () => {
  it('averageShape 输出 48 点且终点为 1', () => {
    const days = [synthDay('20261110', 50), synthDay('20261111', 100)];
    const shape = averageShape(days)!;
    expect(shape).toHaveLength(48);
    expect(shape[0][0]).toBe('09:35');
    expect(shape[47][0]).toBe('15:00');
    expect(shape[47][1]).toBeCloseTo(1);
    // 同形态不同量级 → 各时点占比应一致（均值不变）；合成形态上午偏重，11:30 约 0.4–0.9
    expect(shape[23][1]).toBeGreaterThan(0.4);
    expect(shape[23][1]).toBeLessThan(0.9);
  });
  it('K 线不足 48 根的交易日被跳过', () => {
    const good = synthDay('20261110', 50);
    const bad = synthDay('20261111', 50).slice(0, 30);
    const shape = averageShape([good, bad])!;
    expect(shape[0][1]).toBeCloseTo(averageShape([good])![0][1]);
  });
  it('buildBaselineFrom5m：avg20 只用当日之前的 20 个完整日；hist30 含当日', () => {
    const bars: Bar[] = [];
    for (let i = 1; i <= 22; i++) bars.push(...synthDay(`202611${String(i).padStart(2, '0')}`, 50));
    const b = buildBaselineFrom5m(bars, '20261122')!;
    expect(b.daysUsed).toBe(20);
    expect(b.avg20Yi).toBeCloseTo(50);
    expect(b.hist30.at(-1)!.date).toBe('20261122'); // 当日完整 → 计入 hist30
    expect(b.hist30).toHaveLength(22);
    expect(b.source).toBe('sina5m');
  });
  it('尾盘占比：14:30–15:00 六根 K 占全天比例', () => {
    const day = synthDay('20261110', 100);
    const tail = tailAmountYi(day);
    expect(tail).toBeGreaterThan(0);
    const r = tailRatioOfDay(day);
    expect(r).not.toBeNull();
    const total = day.reduce((s, b) => s + b.amount! / 1e8, 0);
    expect(tail).toBeCloseTo(r! * total, 5);
    // 不完整日 → null
    expect(tailRatioOfDay(day.slice(0, 10))).toBeNull();
  });
});

describe('份额源未日更自检（≥70% 规则）', () => {
  const marketOf = (c: string) => (c.startsWith('5') ? 'sh' as const : 'sz' as const);
  it('沪市 ≥70% 份额未变 → 判定未日更；深市正常', () => {
    const today: Record<string, number> = {};
    const prev: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      const c = `5${String(i).padStart(5, '0')}`;
      today[c] = 100; prev[c] = i < 8 ? 100 : 99; // 8/10 相同 → 80%
    }
    for (let i = 0; i < 6; i++) {
      const c = `1${String(i).padStart(5, '0')}`;
      today[c] = 200 + i; prev[c] = 200; // 全部变化
    }
    const st = detectStaleMarkets(today, prev, marketOf);
    expect(st.sh).toBe(true);
    expect(st.sz).toBe(false);
  });
  it('样本不足 5 只不判定', () => {
    const today = { '5000001': 100, '5000002': 100 };
    const prev = { '5000001': 100, '5000002': 100 };
    const st = detectStaleMarkets(today, prev, marketOf);
    expect(st.sh).toBe(false);
  });
});

describe('份额序列与加仓指数', () => {
  const codes = ['510300', '159915'];
  const marketOf = (c: string) => (c === '510300' ? ('sh' as const) : ('sz' as const));
  it('变化量=当日-前日，指数首日=100，未日更按前值顺延', () => {
    const dates = ['20261110', '20261111', '20261112', '20261113'];
    const byDate: Record<string, Record<string, number>> = {
      '20261110': { 510300: 100, 159915: 50 },
      '20261111': { 510300: 110, 159915: 45 },   // 沪 +10，深 -5
      '20261112': { 510300: 110, 159915: 40 },   // 沪未变（若标未日更则不计变化）
      '20261113': { 510300: 100, 159915: 40 },   // 沪 -10
    };
    const stale = { '20261112': { sh: true } };
    const s = buildShareSeries(dates, byDate, stale, codes, marketOf);
    expect(s[0].indexVal).toBeCloseTo(100);
    expect(s[0].changeYi).toBeNull(); // 首日无前值
    expect(s[1].changeYi).toBeCloseTo(5); // +10-5
    expect(s[2].changeYi).toBeCloseTo(-5); // 沪被跳过，深 -5
    // 指数：11/12 沪按前值 110 顺延 → total = 110+40 = 150；基期 150 → 100
    expect(s[2].indexVal).toBeCloseTo(100 * 150 / 150);
    expect(s[3].changeYi).toBeCloseTo(-10);
    expect(s[3].indexVal).toBeCloseTo(100 * 140 / 150);
  });
});

describe('结论文案', () => {
  it('盘中放量与缩量', () => {
    const hot = makeVerdict({ phase: 'am', ratio: 1.8, netBuy: 25, progressPct: 50, tailToday: null, tailBase: null, fullDay: false });
    expect(hot.headline).toContain('显著放量');
    const quiet = makeVerdict({ phase: 'pm', ratio: 0.6, netBuy: -2, progressPct: 80, tailToday: null, tailBase: null, fullDay: false });
    expect(quiet.headline).toContain('没看出');
  });
  it('盘前与基准缺失', () => {
    expect(makeVerdict({ phase: 'pre', ratio: null, netBuy: null, progressPct: null, tailToday: null, tailBase: null, fullDay: false }).headline).toBe('盘前等待');
    expect(makeVerdict({ phase: 'am', ratio: null, netBuy: null, progressPct: null, tailToday: null, tailBase: null, fullDay: false }).headline).toBe('基准计算中');
  });
  it('收盘后包含尾盘对比', () => {
    const v = makeVerdict({ phase: 'after', ratio: 1.2, netBuy: 8, progressPct: 100, tailToday: 0.3, tailBase: 0.15, fullDay: true });
    expect(v.detail).toContain('全天成交额为 20 日均额的 1.20 倍');
    expect(v.detail).toContain('尾盘');
  });
});

describe('格式化', () => {
  it('fmtSigned 带符号', () => {
    expect(fmtSigned(1.2)).toBe('+1.20');
    expect(fmtSigned(-1.2)).toBe('-1.20');
  });
  it('hhmm', () => {
    expect(hhmm(9 * 60 + 35)).toBe('09:35');
    expect(hhmm(15 * 60)).toBe('15:00');
  });
});
