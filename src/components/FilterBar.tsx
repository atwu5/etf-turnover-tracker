import type { SortKey, ScopeKey } from './EtfTable';

export function FilterBar({
  sort, setSort, scope, setScope, query, setQuery, auto, setAuto, onRefresh, refreshing, phase,
}: {
  sort: SortKey;
  setSort: (v: SortKey) => void;
  scope: ScopeKey;
  setScope: (v: ScopeKey) => void;
  query: string;
  setQuery: (v: string) => void;
  auto: boolean;
  setAuto: (v: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  phase: string;
}) {
  const live = phase === 'am' || phase === 'pm';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-700 outline-none focus:border-brand"
        aria-label="排序"
      >
        <option value="huijin">汇金历史持仓 → 规模优先</option>
        <option value="amount">今日成交额</option>
        <option value="ratio">放量倍数</option>
        <option value="net">主动净买入</option>
        <option value="mktcap">最新规模</option>
      </select>
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value as ScopeKey)}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-700 outline-none focus:border-brand"
        aria-label="范围"
      >
        <option value="all">全部</option>
        <option value="core">仅重点监测</option>
        <option value="watch">仅扩展观察</option>
      </select>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜代码 / 名称 / 指数"
        className="h-8 w-44 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-brand"
      />
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {refreshing ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        立即刷新
      </button>
      <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[13px] text-slate-600">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 accent-[#1B88EE]"
        />
        自动刷新{auto && live && <span className="text-xs text-slate-400">（每 20 秒）</span>}
      </label>
    </div>
  );
}
