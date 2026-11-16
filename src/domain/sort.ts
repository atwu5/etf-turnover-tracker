/** 表格排序（纯函数，可测试） */

import type { RowState } from '../hooks/useTracker';

export type SortKey = 'huijin' | 'amount' | 'ratio' | 'net' | 'mktcap' | 'pct' | 'shares' | 'hist';
export type SortDir = 'desc' | 'asc';
export type ScopeKey = 'all' | 'core' | 'watch';

export const SORT_LABELS: Record<SortKey, string> = {
  huijin: '汇金历史持仓 → 规模优先',
  amount: '今日成交额',
  ratio: '放量倍数',
  net: '主动净买入',
  mktcap: '最新规模',
  pct: '涨跌',
  shares: '份额',
  hist: '近30日均额',
};

/** 近30日成交额均值（亿），无数据返回 -1 */
export function hist30Avg(row: RowState): number {
  const h = row.baseline?.hist30;
  if (!h || h.length === 0) return -1;
  return h.reduce((s, x) => s + x.amountYi, 0) / h.length;
}

export function sortValue(row: RowState, key: SortKey): number {
  switch (key) {
    case 'amount': return row.amountYi ?? -1;
    case 'ratio': return row.ratioSpot ?? -1;
    case 'net': return row.netBuy ?? -Infinity;
    case 'mktcap': return row.quote?.mktcapYi ?? -1;
    case 'pct': return row.quote?.pct ?? -Infinity;
    case 'shares': return row.sharesYi ?? -1;
    case 'hist': return hist30Avg(row);
    case 'huijin': return (row.def.huijinYi ?? -1) * 1e6 + (row.quote?.mktcapYi ?? 0); // 汇金持仓优先，同档按规模
  }
}

/** 组内排序：null/缺失值恒排最后（升序时最前） */
export function arrangeRows(rows: RowState[], key: SortKey, dir: SortDir = 'desc'): RowState[] {
  const sorted = [...rows].sort((a, b) => sortValue(b, key) - sortValue(a, key));
  return dir === 'asc' ? sorted.reverse() : sorted;
}
