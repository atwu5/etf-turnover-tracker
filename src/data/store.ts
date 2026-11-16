/**
 * 本地持久化：基线缓存（每交易日增量更新）+ 逐日份额历史积累。
 * 接口失败时保留已有数据，绝不伪造。
 */

import type { Baseline } from '../domain/metrics';
import { yyyymmdd } from '../domain/session';

const CACHE_KEY = 'ett_cache_v1';
const SHARES_KEY = 'ett_shares_v1';

export interface BaselinesCache {
  tradeDate: string;
  fetchedAt: string;
  baselines: Record<string, Baseline>;
  /** 计算过程中的降级/失败提示 */
  warnings: string[];
}

export function loadBaselines(): BaselinesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as BaselinesCache;
    if (!j || !j.tradeDate || !j.baselines) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveBaselines(c: BaselinesCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // 容量超限：丢弃 hist30 重试
    try {
      const shrunk: BaselinesCache = {
        ...c,
        baselines: Object.fromEntries(
          Object.entries(c.baselines).map(([k, v]) => [k, { ...v, hist30: v.hist30.slice(-10) }]),
        ),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(shrunk));
    } catch {
      /* 放弃持久化，页面仍可用实时数据 */
    }
  }
}

// ---------- 份额历史 ----------

export interface SharesStore {
  dates: string[]; // 升序
  byDate: Record<string, Record<string, number>>; // date -> code -> 份额(亿份)
  /** date -> {sh?, sz?} 未日更标记 */
  stale: Record<string, { sh?: boolean; sz?: boolean }>;
}

export function emptyShares(): SharesStore {
  return { dates: [], byDate: {}, stale: {} };
}

export function loadShares(): SharesStore {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) return emptyShares();
    const j = JSON.parse(raw) as SharesStore;
    if (!j || !j.byDate) return emptyShares();
    j.dates = Object.keys(j.byDate).sort();
    j.stale = j.stale ?? {};
    return j;
  } catch {
    return emptyShares();
  }
}

export function saveShares(s: SharesStore): void {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(s));
  } catch {
    // 超限：砍掉最老的 1/4 历史
    try {
      const keep = s.dates.slice(Math.floor(s.dates.length / 4));
      const byDate = Object.fromEntries(keep.map((d) => [d, s.byDate[d]]));
      const stale = Object.fromEntries(Object.entries(s.stale).filter(([d]) => byDate[d]));
      localStorage.setItem(SHARES_KEY, JSON.stringify({ dates: keep, byDate, stale }));
    } catch {
      /* ignore */
    }
  }
}

/**
 * 记录某交易日份额快照（若已存在则不覆盖——首拉为准）。
 * 返回该日使用的上一交易日记录日期（无则 null）。
 */
export function recordShares(
  store: SharesStore,
  date: string,
  rec: Record<string, number>,
  staleMark: { sh?: boolean; sz?: boolean } | null,
): { changed: boolean; prevDate: string | null } {
  if (!rec || Object.keys(rec).length === 0) return { changed: false, prevDate: prevShareDate(store, date) };
  const existed = store.byDate[date];
  if (!existed) {
    store.byDate[date] = { ...rec };
    store.dates = Object.keys(store.byDate).sort();
    if (staleMark && (staleMark.sh || staleMark.sz)) store.stale[date] = staleMark;
    saveShares(store);
    return { changed: true, prevDate: prevShareDate(store, date) };
  }
  // 已记录：仅在市场判定从「正常」变「未日更」时补标记
  if (staleMark && (staleMark.sh || staleMark.sz) && !store.stale[date]) {
    store.stale[date] = staleMark;
    saveShares(store);
  }
  return { changed: false, prevDate: prevShareDate(store, date) };
}

/** date 之前（不含）最近一个有记录的交易日 */
export function prevShareDate(store: SharesStore, date: string): string | null {
  const ds = store.dates.filter((d) => d < date);
  return ds.length ? ds[ds.length - 1] : null;
}

export function prevSharesOf(store: SharesStore, date: string, code: string): number | null {
  const pd = prevShareDate(store, date);
  if (!pd) return null;
  const v = store.byDate[pd]?.[code];
  return v == null ? null : v;
}

export function todayKey(): string {
  return yyyymmdd(new Date());
}

/**
 * 合并外部导入的份额历史（种子/导入文件）。
 * 只填补本地缺失的日期，绝不覆盖本地已积累数据（本地为准）。
 * 接受两种格式：完整 SharesStore 或 简洁 map {date: {code: 亿份}}。
 */
export function mergeSharesStore(
  store: SharesStore,
  incoming: { byDate?: Record<string, Record<string, number>>; dates?: string[] } | null,
): { merged: SharesStore; added: number } {
  const byDate = { ...store.byDate };
  let added = 0;
  const src = incoming?.byDate ?? {};
  for (const [d, rec] of Object.entries(src)) {
    if (!/^\d{8}$/.test(d) || typeof rec !== 'object' || rec == null) continue;
    if (byDate[d]) continue; // 本地已有，不覆盖
    const clean: Record<string, number> = {};
    for (const [c, v] of Object.entries(rec)) {
      const n = Number(v);
      if (/^\d{6}$/.test(c) && Number.isFinite(n) && n > 0) clean[c] = n;
    }
    if (Object.keys(clean).length > 0) {
      byDate[d] = clean;
      added++;
    }
  }
  return { merged: { dates: Object.keys(byDate).sort(), byDate, stale: store.stale }, added };
}
