import { describe, expect, it } from 'vitest';
import { arrangeRows, hist30Avg } from '../src/domain/sort';
import { mergeSharesStore, emptyShares } from '../src/data/store';
import type { RowState } from '../src/hooks/useTracker';
import type { EtfDef } from '../src/config/pool';

function row(over: Partial<RowState> & { code: string }): RowState {
  const def: EtfDef = { code: over.code, tcode: `sh${over.code}`, name: over.code, index: '沪深300', group: 'core', huijinYi: null };
  return {
    def,
    quote: null,
    baseline: null,
    amountYi: null,
    ratioSpot: null,
    ratioDay: null,
    netBuy: null,
    sharesYi: null,
    subscr: null,
    subscrPrevDate: null,
    sharesStale: false,
    progress: 0,
    ...over,
  } as RowState;
}

describe('arrangeRows 表头排序', () => {
  const rows = [
    row({ code: '510300', amountYi: 30, ratioSpot: 1.0, sharesYi: 456, netBuy: 5, quote: null }),
    row({ code: '159915', amountYi: 100, ratioSpot: 0.8, sharesYi: 452, netBuy: -11 }),
    row({ code: '560010', amountYi: 20, ratioSpot: 1.44, sharesYi: 37, netBuy: null }),
  ];

  it('desc / asc 切换', () => {
    expect(arrangeRows(rows, 'amount').map((r) => r.def.code)).toEqual(['159915', '510300', '560010']);
    expect(arrangeRows(rows, 'amount', 'asc').map((r) => r.def.code)).toEqual(['560010', '510300', '159915']);
    expect(arrangeRows(rows, 'ratio', 'desc').map((r) => r.def.code)).toEqual(['560010', '510300', '159915']);
    expect(arrangeRows(rows, 'shares', 'asc').map((r) => r.def.code)).toEqual(['560010', '159915', '510300']);
  });

  it('null 值在降序时排最后（net 为 null 的 560010）', () => {
    expect(arrangeRows(rows, 'net', 'desc').at(-1)!.def.code).toBe('560010');
  });

  it('近30日均额排序取 hist30 均值', () => {
    const withHist = [
      { ...rows[0], baseline: { hist30: [{ date: '20261110', amountYi: 40 }, { date: '20261111', amountYi: 60 }] } },
      { ...rows[1], baseline: { hist30: [{ date: '20261110', amountYi: 200 }] } },
    ] as RowState[];
    expect(hist30Avg(withHist[0])).toBeCloseTo(50);
    expect(arrangeRows(withHist, 'hist', 'desc').map((r) => r.def.code)).toEqual(['159915', '510300']);
    // 无 hist30 的行排最后
    expect(arrangeRows(rows, 'hist', 'desc').at(-1)!.def.code).toBe('560010');
  });
});

describe('mergeSharesStore 份额历史导入', () => {
  it('只填补缺失日期，不覆盖本地已有数据', () => {
    const store = emptyShares();
    store.byDate['20261114'] = { '510300': 455.0 };
    store.dates = ['20261114'];
    const incoming = {
      byDate: {
        '20261113': { '510300': 456.5, '159915': 452.0 },
        '20261114': { '510300': 999 }, // 本地已有 → 不覆盖
        '20261115': { '510300': 455.8 },
        'bad-date': { '510300': 1 },
        '20261116': { '510300': -5, '159915': 452 }, // 非法值剔除，159915 有效 → 该日计入
      },
    };
    const { merged, added } = mergeSharesStore(store, incoming);
    expect(added).toBe(3); // 1113 / 1115 / 1116
    expect(merged.byDate['20261114']['510300']).toBe(455.0); // 本地为准
    expect(merged.byDate['20261116']['510300']).toBeUndefined(); // 非法值被剔除
    expect(merged.byDate['20261116']['159915']).toBe(452);
    expect(merged.dates).toEqual(['20261113', '20261114', '20261115', '20261116']);
  });

  it('接受 null / 非法结构而不崩溃', () => {
    const { merged, added } = mergeSharesStore(emptyShares(), null);
    expect(added).toBe(0);
    expect(merged.dates).toEqual([]);
  });
});
