import { useMemo, useState } from 'react';
import { useTracker } from './hooks/useTracker';
import { StatusPill } from './components/StatusPill';
import { VerdictCard, KpiGrid } from './components/VerdictCard';
import { FilterBar } from './components/FilterBar';
import { EtfTable, EtfCardList, type ScopeKey } from './components/EtfTable';
import type { SortKey, SortDir } from './domain/sort';
import { TrendCharts } from './components/TrendCharts';
import { NotesSection } from './components/NotesSection';
import { Spinner } from './components/ui';
import { formatDateTime, weekdayOf } from './domain/session';
import { quoteHMOf } from './data/tencent';

export default function App() {
  const t = useTracker();
  const [sort, setSortState] = useState<SortKey>('huijin');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const setSort = (k: SortKey) => setSortState(k); // 下拉选择默认降序
  const onSort = (k: SortKey) => {
    if (k === sort) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortState(k); setSortDir('desc'); }
  };
  const [scope, setScope] = useState<ScopeKey>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim();
    return t.rows.filter((r) => {
      if (scope !== 'all' && r.def.group !== scope) return false;
      if (!q) return true;
      return (
        r.def.code.includes(q) ||
        r.def.name.toLowerCase().includes(q.toLowerCase()) ||
        r.def.index.toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [t.rows, scope, query]);

  const asOf = useMemo(() => {
    const anyQuote = t.rows.find((r) => r.quote)?.quote;
    return anyQuote ? quoteHMOf(anyQuote) : formatDateTime(t.lastUpdate ?? t.now).slice(11, 16);
  }, [t.rows, t.lastUpdate, t.now]);

  const tradeDatePretty = `${t.tradeDate.slice(0, 4)}-${t.tradeDate.slice(4, 6)}-${t.tradeDate.slice(6, 8)} ${weekdayOf(t.tradeDate)}`;
  const coreCount = t.rows.filter((r) => r.def.group === 'core').length;
  const watchCount = t.rows.filter((r) => r.def.group === 'watch').length;
  const coreAvgSum = t.rows.filter((r) => r.def.group === 'core' && r.baseline).reduce((s, r) => s + (r.baseline?.avg20Yi ?? 0), 0);
  const dataNotes = [...t.warnings];
  if (t.dataMode === 'cached') dataNotes.push('行情暂时不可用，正在展示最近一次成功获取的数据');
  if (t.dataMode === 'error') dataNotes.push('行情接口获取失败（可能被网络拦截），请稍后点击「立即刷新」重试');

  return (
    <div className="mx-auto max-w-7xl px-3 pb-10 pt-5 sm:px-5">
      {/* 页头 */}
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-serif text-[28px] font-bold tracking-tight text-ink">
            宽基 ETF 动向监测
            <span className="text-gold-grad ml-3 align-middle text-[11px] font-semibold uppercase tracking-[0.3em]">Platinum & Flow</span>
          </h1>
          <p className="mt-1.5 text-[13px] tracking-wide text-ink-muted">
            宽基 ETF 成交额与资金动向 · 以公开量价数据观察平准类资金是否活跃
          </p>
        </div>
        <StatusPill phase={t.phase} tradeDate={t.tradeDate} lastUpdate={t.lastUpdate} />
      </header>
      <div className="hairline-gold mt-3" />

      {/* 快照信息 */}
      <div className="mt-2 text-xs text-stone-400">
        交易日 {tradeDatePretty || '—'} · 重点监测 {coreCount} 只 + 扩展观察 {watchCount} 只 · 份额历史已积累 {t.sharesCount} 个交易日
      </div>

      {/* 工具栏 */}
      <div className="sticky top-0 z-20 -mx-3 mt-3 bg-[#f7f3ec]/90 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <FilterBar
          sort={sort} setSort={setSort} sortDir={sortDir}
          scope={scope} setScope={setScope}
          query={query} setQuery={setQuery}
          auto={t.auto} setAuto={t.setAuto}
          onRefresh={t.hardRefresh}
          refreshing={t.baselineTotal > 0 && t.baselineDone < t.baselineTotal}
          phase={t.phase}
        />
      </div>

      {/* 基线计算进度 / 错误提示 */}
      {t.baselineTotal > 0 && t.baselineDone < t.baselineTotal && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold-soft px-4 py-2.5 text-[13px] text-gold-deep">
          <Spinner />
          正在拉取 K 线并计算基线（20 日均额 · 日内分布）：{t.baselineDone}/{t.baselineTotal} —— 每个交易日只需计算一次，之后走本地缓存
        </div>
      )}
      {dataNotes.length > 0 && t.baselineDone >= t.baselineTotal && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] leading-relaxed text-amber-800">
          {dataNotes.join('；')}
        </div>
      )}

      {/* 主体 */}
      {t.booting && t.baselineTotal === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-stone-400">
          <Spinner className="h-6 w-6" />
          <span className="text-sm">正在连接行情接口…</span>
        </div>
      ) : (
        <main className="mt-3 space-y-3">
          <VerdictCard
            verdict={t.verdict}
            phase={t.phase}
            ratio={t.pool.ratio}
            progressPct={t.pool.progressPct}
            avgSum={coreAvgSum}
            fullDay={t.fullDay}
            windows={t.windowStats}
            marketText={t.marketText}
          />
          <KpiGrid
            totalAmount={t.pool.totalAmount}
            asOf={asOf}
            dayRatioPool={t.pool.dayRatioPool}
            ratio={t.pool.ratio}
            progressPct={t.pool.progressPct}
            avgSum={coreAvgSum}
            netBuy={t.pool.netBuy}
            wPct={t.pool.wPct}
            tradeDate={t.tradeDate}
            fullDay={t.fullDay}
          />
          <TrendCharts series={t.shareSeries} historyDays={t.sharesCount} onImportShares={t.mergeShares} onExportShares={t.exportShares} />

          {/* PC 表格 / 移动卡片 */}
          <div className="hidden md:block">
            <EtfTable rows={rows} sort={sort} sortDir={sortDir} onSort={onSort} fullDay={t.fullDay} />
          </div>
          <div className="md:hidden">
            <EtfCardList rows={rows} fullDay={t.fullDay} />
          </div>

          <NotesSection dataNotes={[]} />
        </main>
      )}

      <footer className="mt-8 border-t border-gold-hair/60 pt-4 text-center text-[11px] leading-relaxed text-ink-muted">
        数据来源：腾讯行情 qt.gtimg.cn（实时快照）+ 新浪 K 线 quotes.sina.cn（日内分布 / 均额）· 份额名单为 2025 年报历史标签
        <br />
        最近更新 {t.lastUpdate ? formatDateTime(t.lastUpdate) : '—'} · 仅供研究参考，不构成投资建议
      </footer>
    </div>
  );
}
