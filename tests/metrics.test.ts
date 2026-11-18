import { describe, expect, it } from 'vitest';
import {
  BAR_LABELS, averageShape, barAmountYi, buildBaselineFrom5m, buildShareSeries, buildWindowStats, dayRatio,
  detectStaleMarkets, fmtSigned, makeVerdict, netBuyYi, progressAt, spotRatio, subscrNetYi,
  tailAmountYi, tailRatioOfDay, weightedPct, hhmm, marketTurnoverText, WINDOWS, type Bar,
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
  it('申赎估算 = (今份额-昨份额)×现价（亿份口径）；原站快照回归用例', () => {
    expect(subscrNetYi(500, 490, 4)).toBeCloseTo(40);
    expect(subscrNetYi(500, null, 4)).toBeNull();
    // 原站参考快照：510300 份额 456.232877 vs 上一交易日 463.630877 亿份，价 4.07 → -30.11 亿
    expect(subscrNetYi(456.232877, 463.630877, 4.07)).toBeCloseTo(-30.11, 1);
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

describe('结论文案（二元判定）', () => {
  const base = { progressPct: 50, tailToday: null, tailBase: null, fullDay: false } as const;
  it('显著放量且买盘主导 → 有上班', () => {
    const v = makeVerdict({ ...base, phase: 'am', ratio: 1.8, netBuy: 25 });
    expect(v.headline).toBe('汪汪队有上班');
    expect(v.tone).toBe('hot');
  });
  it('温和放量但未达阈值 → 没上班', () => {
    const v = makeVerdict({ ...base, phase: 'pm', ratio: 1.2, netBuy: 8 });
    expect(v.headline).toBe('汪汪队没上班');
    expect(v.tone).toBe('calm');
  });
  it('倍数不高但净买入 ≥50 亿 → 有上班', () => {
    const v = makeVerdict({ ...base, phase: 'pm', ratio: 0.9, netBuy: 60 });
    expect(v.headline).toBe('汪汪队有上班');
  });
  it('放量但卖盘主导（净买入为负）→ 没上班', () => {
    const v = makeVerdict({ ...base, phase: 'am', ratio: 1.8, netBuy: -30 });
    expect(v.headline).toBe('汪汪队没上班');
  });
  it('净买入恰在 50 亿边界 → 有上班', () => {
    expect(makeVerdict({ ...base, phase: 'am', ratio: 1.0, netBuy: 50 }).headline).toBe('汪汪队有上班');
    expect(makeVerdict({ ...base, phase: 'am', ratio: 1.0, netBuy: 49.9 }).headline).toBe('汪汪队没上班');
  });
  it('盘前与基准缺失 → 没上班（附说明）', () => {
    const pre = makeVerdict({ phase: 'pre', ratio: null, netBuy: null, ...base });
    expect(pre.headline).toBe('汪汪队没上班');
    expect(pre.detail).toContain('尚未开盘');
    const calc = makeVerdict({ phase: 'am', ratio: null, netBuy: null, ...base });
    expect(calc.headline).toBe('汪汪队没上班');
    expect(calc.detail).toContain('基线仍在计算');
  });
  it('收盘后包含尾盘对比', () => {
    const v = makeVerdict({ phase: 'after', ratio: 1.2, netBuy: 8, progressPct: 100, tailToday: 0.3, tailBase: 0.15, fullDay: true });
    expect(v.detail).toContain('全天成交额为 20 日均额的 1.20 倍');
    expect(v.detail).toContain('尾盘');
  });
});

describe('10 分钟窗口判定', () => {
  // shape：上午占 50%（09:30-11:30），下午 50%；10 分钟窗口约 1/24 ≈ 4.17%
  const shape: [string, number][] = [];
  for (let i = 0; i < 48; i++) {
    const cum = (i + 1) / 48;
    shape.push([BAR_LABELS[i], cum]);
  }
  const funds = [{ avg20Yi: 240, shape }]; // 每窗口期望 ≈ 240/24 = 10 亿
  const bar = (hm: string, yi: number): Bar => ({ date: '20261116', hm, close: 4, volume: 0, amount: yi * 1e8 });

  it('WINDOWS 生成 24 个窗口（12 上午 + 12 下午，跨越午休）', () => {
    expect(WINDOWS).toHaveLength(24);
    expect(WINDOWS[0]).toEqual(['09:30', '09:40']);
    expect(WINDOWS[11]).toEqual(['11:20', '11:30']);
    expect(WINDOWS[12]).toEqual(['13:00', '13:10']);
    expect(WINDOWS[23]).toEqual(['14:50', '15:00']);
  });

  it('正常窗口 → 不触发；尾盘放量 ≥2× 且 ≥10 亿 → 触发', () => {
    const todayBars = { '510300': [bar('14:55', 35)] }; // 仅最后一根 K：14:50-15:00 窗口 35 亿
    const stats = buildWindowStats(funds, todayBars, '20261116', '16:00', 'after');
    expect(stats).toHaveLength(24);
    const quiet = stats[5]; // 上午某窗口，无成交
    expect(quiet.complete).toBe(true);
    expect(quiet.ratio).toBeCloseTo(0);
    expect(quiet.triggered).toBe(false);
    const tail = stats[23]; // 14:50–15:00
    expect(tail.actualYi).toBeCloseTo(35);
    expect(tail.ratio).toBeCloseTo(35 / 10);
    expect(tail.triggered).toBe(true);
  });

  it('未走完的窗口不触发', () => {
    const todayBars = { '510300': [bar('09:40', 30)] };
    const stats = buildWindowStats(funds, todayBars, '20261116', '09:36', 'am'); // 09:40 窗口未走完
    expect(stats[1].complete).toBe(false);
    expect(stats[1].triggered).toBe(false);
  });

  it('成交额低于 10 亿下限不触发（防小窗口噪声）', () => {
    const todayBars = { '510300': [bar('14:55', 9)] };
    const stats = buildWindowStats(funds, todayBars, '20261116', '16:00', 'after');
    expect(stats[23].ratio).toBeCloseTo(0.9);
    expect(stats[23].triggered).toBe(false);
  });

  it('昨日式场景：全天累计平淡但尾盘两窗口放量 → 判「有上班」', () => {
    const todayBars = { '510300': [bar('14:45', 12), bar('14:50', 35), bar('14:55', 40)] };
    const stats = buildWindowStats(funds, todayBars, '20261116', '16:00', 'after');
    const v = makeVerdict({ phase: 'after', ratio: 0.91, netBuy: 40, progressPct: 100, tailToday: 0.2, tailBase: 0.073, fullDay: true, windows: stats });
    expect(v.headline).toBe('汪汪队有上班');
    expect(v.detail).toContain('10 分钟窗口出现集中放量');
    expect(v.detail).toContain('14:50–15:00');
  });
});

describe('大盘成交额提示', () => {
  it('收盘后：今日 vs 较昨日增减', () => {
    expect(marketTurnoverText(15200, 14500, true, '15:05')).toBe('大盘成交额 1.52万亿 · 较昨日 +700亿');
    expect(marketTurnoverText(13800, 14500, true, '15:05')).toBe('大盘成交额 1.38万亿 · 较昨日 −700亿');
  });
  it('盘中：展示截至时间与昨日全天（不直接比部分量）；万亿以下用亿', () => {
    expect(marketTurnoverText(6300, 14500, false, '10:40')).toBe('大盘成交额 6300亿（截至 10:40） · 昨日全天 1.45万亿');
  });
  it('万亿以下用亿；无昨日数据时省略对比；无数据返回 null', () => {
    expect(marketTurnoverText(9800, null, true, '15:00')).toBe('大盘成交额 9800亿');
    expect(marketTurnoverText(null, 14500, true, '15:00')).toBeNull();
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
