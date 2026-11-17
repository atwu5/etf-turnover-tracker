/**
 * 编排层：行情轮询、基线计算（增量）、份额历史积累、派生指标。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CORE_POOL, POOL, type EtfDef } from '../config/pool';
import { fetchQuotes, fetchTencentDaily, quoteDateOf, type Quote } from '../data/tencent';
import { fetchQuotesEM } from '../data/eastmoney';
import { fetchSinaDaily, fetchSinaKline, type Bar } from '../data/sina';
import { poolAll } from '../data/jsonp';
import {
  loadBaselines, saveBaselines, loadShares, saveShares, recordShares, prevSharesOf, mergeSharesStore,
  type SharesStore,
} from '../data/store';
import {
  buildBaselineFrom5m, progressAt, spotRatio, dayRatio, netBuyYi, weightedPct, subscrNetYi,
  detectStaleMarkets, buildShareSeries, makeVerdict, buildWindowStats, groupByDay,
  type Baseline, type ShareSeriesPoint, type WindowStat,
} from '../domain/metrics';
import { isFullDayData, isLivePhase, nowHHMM, phaseOf, type SessionPhase } from '../domain/session';

export interface RowState {
  def: EtfDef;
  quote: Quote | null;
  baseline: Baseline | null;
  amountYi: number | null;
  ratioSpot: number | null;
  ratioDay: number | null;
  netBuy: number | null;
  sharesYi: number | null;
  subscr: number | null;
  subscrPrevDate: string | null;
  sharesStale: boolean;
  progress: number;
}

const K_DALEN_5M = 1500; // ≈ 30 个交易日的 5 分钟 K
const K_DALEN_DAILY = 60;
const POLL_MS = 20_000;
const MARKET_OF = (code: string): 'sh' | 'sz' => (POOL.find((x) => x.code === code)?.tcode.startsWith('sh') ? 'sh' : 'sz');

/**
 * 行情快照：腾讯为主源，失败时自动切换东方财富备用源。
 * 东方财富无外盘/内盘 → 降级模式下主动净买入不展示（其余指标齐全）。
 */
async function fetchQuotesWithFallback(): Promise<{ quotes: Record<string, Quote>; source: 'tencent' | 'eastmoney' }> {
  try {
    return { quotes: await fetchQuotes(POOL.map((x) => x.tcode)), source: 'tencent' };
  } catch (tencentErr) {
    const em = await fetchQuotesEM(POOL.map((x) => x.tcode));
    const quotes: Record<string, Quote> = {};
    for (const def of POOL) {
      const d = em[def.code];
      if (!d || !(d.price > 0)) continue;
      quotes[def.tcode] = {
        tcode: def.tcode,
        name: d.name || def.name,
        price: d.price,
        prevClose: d.prevClose,
        pct: d.pct,
        amountWan: d.amountYuan / 1e4,
        outerLots: 0,
        innerLots: 0,
        volumeLots: d.volumeLots,
        mktcapYi: d.mktcapYuan / 1e8,
        sharesFen: d.price > 0 ? d.mktcapYuan / d.price : 0,
        timeStr: d.tsSec > 0 ? formatTs(d.tsSec) : '',
      };
    }
    if (Object.keys(quotes).length === 0) throw tencentErr instanceof Error ? tencentErr : new Error(String(tencentErr));
    return { quotes, source: 'eastmoney' };
  }
}

function formatTs(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function useTracker() {
  const [booting, setBooting] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [baselines, setBaselines] = useState<Record<string, Baseline>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [baselineDone, setBaselineDone] = useState(0);
  const [baselineTotal, setBaselineTotal] = useState(0);
  const [dataMode, setDataMode] = useState<'live' | 'cached' | 'error'>('live');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [auto, setAuto] = useState(true);
  const [sharesStore, setSharesStore] = useState<SharesStore>(() => loadShares());
  const [prevShareDateLabel, setPrevShareDateLabel] = useState<string | null>(null);
  const [todayBars, setTodayBars] = useState<Record<string, Bar[]>>({});
  const quoteErrRef = useRef(0);
  const quoteSrcRef = useRef<'tencent' | 'eastmoney'>('tencent');
  const todayBarsDateRef = useRef('');

  const phase: SessionPhase = useMemo(() => {
    const firstQuote = Object.values(quotes)[0];
    return phaseOf(now, firstQuote ? quoteDateOf(firstQuote) : '');
  }, [now, quotes]);

  const tradeDate = useMemo(() => {
    const firstQuote = Object.values(quotes)[0];
    return firstQuote ? quoteDateOf(firstQuote) : '';
  }, [quotes]);

  // ---------- 基线计算（新浪 5 分 K → 新浪日 K → 腾讯日 K 三级降级） ----------
  const rebuildBaselines = useCallback(async (forDate: string) => {
    setBaselineTotal(POOL.length);
    setBaselineDone(0);
    const results: Record<string, Baseline> = {};
    const warns: string[] = [];
    const oldCache = loadBaselines();
    const { results: per } = await poolAll(POOL, 5, async (def) => {
      let primaryErr = '';
      try {
        const bars = await fetchSinaKline(def.tcode, 5, K_DALEN_5M);
        const b = buildBaselineFrom5m(bars, forDate);
        if (b) {
          const byDay = groupByDay(bars);
          const todayBars = byDay.get(forDate);
          return { ...b, tailToday: todayBars ? tailRatioOrNull(todayBars) : undefined } as Baseline;
        }
        primaryErr = '5 分钟 K 数据不足';
      } catch (e) {
        primaryErr = `5 分钟 K 拉取失败（${e instanceof Error ? e.message : e}）`;
      }
      // 降级 1：新浪日 K（成交额=量×价估算，shape 沿用旧缓存）
      try {
        const daily = await fetchSinaDaily(def.tcode, K_DALEN_DAILY);
        const b = baselineFromDaily(daily, forDate, 'sinaDaily');
        if (b) {
          warns.push(`${def.name}: ${primaryErr}，使用日 K 估算均额（日内分布沿用缓存）`);
          return b;
        }
      } catch { /* 降级 2 */ }
      // 降级 2：腾讯日 K
      try {
        const daily = await fetchTencentDaily(def.tcode, K_DALEN_DAILY);
        const b = baselineFromDaily(daily.map((x) => ({ date: x.date, hm: '15:00', close: x.close, volume: x.volumeLots * 100 })), forDate, 'tencentDaily');
        if (b) {
          warns.push(`${def.name}: ${primaryErr}，使用腾讯日 K 估算均额（日内分布沿用缓存）`);
          return b;
        }
      } catch { /* 全部失败 */ }
      warns.push(`${def.name}: ${primaryErr}，且日 K 降级失败，沿用上次缓存`);
      return null;
    }, (done, _total) => setBaselineDone(done));
    per.forEach((b, i) => {
      if (b) {
        const code = POOL[i].code;
        // 降级路径无日内分布：沿用旧缓存的 shape / tailBase
        const old = oldCache?.baselines[code];
        if (!b.shape.length && old?.shape.length) {
          results[code] = { ...b, shape: old.shape, tailBase: old.tailBase || b.tailBase };
        } else {
          results[code] = b;
        }
      }
    });
    setBaselines((old) => {
      const merged = { ...old, ...results };
      saveBaselines({ tradeDate: forDate, fetchedAt: new Date().toISOString(), baselines: merged, warnings: warns });
      return merged;
    });
    setWarnings(warns);
  }, []);

  // ---------- 当日 5 分钟 K（10 分钟窗口判定用） ----------
  const fetchTodayBars = useCallback(async (td: string) => {
    if (!td) return;
    try {
      const { results } = await poolAll(POOL, 6, async (def) => {
        const bars = await fetchSinaKline(def.tcode, 5, 64);
        return bars.filter((b) => b.date === td);
      });
      const map: Record<string, Bar[]> = {};
      POOL.forEach((def, i) => {
        const r = results[i];
        if (r && r.length) map[def.code] = r;
      });
      todayBarsDateRef.current = td;
      setTodayBars(map);
    } catch { /* 保留旧数据，下次再拉 */ }
  }, []);

  // ---------- 首次启动 ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const cache = loadBaselines();
      if (cache) setBaselines(cache.baselines);
      const store = loadShares();
      setSharesStore(store);
      // 静默尝试加载随仓库分发的份额历史种子（scripts/backfill-shares.mjs 生成，文件不存在时忽略）
      let seedStore = store;
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}data/shares-history.json`);
        if (r.ok) {
          const seed = await r.json();
          const { merged, added } = mergeSharesStore(store, seed);
          if (added > 0) {
            seedStore = merged;
            setSharesStore(merged);
            saveShares(merged);
          }
        }
      } catch { /* 无种子文件，走本地积累 */ }
      try {
        const { quotes: q, source } = await fetchQuotesWithFallback();
        if (!alive) return;
        setQuotes(q);
        setDataMode('live');
        setLastUpdate(new Date());
        quoteErrRef.current = 0;
        if (source !== quoteSrcRef.current) {
          quoteSrcRef.current = source;
          if (source === 'eastmoney') setWarnings((w) => [...w, '腾讯行情不可用，已自动切换东方财富备用行情（该源无外盘/内盘，主动净买入暂缺）']);
        }
        const td = quoteDateOf(Object.values(q)[0]);
        // 缓存失效判定：交易日变化，或缓存中多数基线缺日内分布（上次全量降级）→ 重算
        const shapeless = cache ? Object.values(cache.baselines).filter((b) => !b.shape || b.shape.length === 0).length : POOL.length;
        const needRebuild = !cache || cache.tradeDate !== td || shapeless > POOL.length * 0.3;
        if (needRebuild) {
          await rebuildBaselines(td);
        }
        void fetchTodayBars(td);
        await recordSharesFor(q, td, seedStore, setSharesStore, setPrevShareDateLabel);
      } catch (e) {
        if (!alive) return;
        setDataMode('error');
        setWarnings((w) => [...w, '行情接口获取失败，展示缓存数据；可点击「立即刷新」重试']);
      }
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 定时器：20 秒时钟推进 + 自动刷新行情 ----------
  useEffect(() => {
    const t = window.setInterval(async () => {
      setNow(new Date());
      const ph = phaseOf(new Date(), tradeDate);
      if (auto && isLivePhase(ph)) {
        try {
          const { quotes: q, source } = await fetchQuotesWithFallback();
          setQuotes(q);
          setDataMode('live');
          setLastUpdate(new Date());
          quoteErrRef.current = 0;
          if (source !== quoteSrcRef.current) {
            quoteSrcRef.current = source;
            if (source === 'eastmoney') setWarnings((w) => [...w, '腾讯行情不可用，已自动切换东方财富备用行情（该源无外盘/内盘，主动净买入暂缺）']);
            else setWarnings((w) => w.filter((x) => !x.includes('东方财富备用行情')));
          }
        } catch {
          quoteErrRef.current++;
          if (quoteErrRef.current >= 3) setDataMode('cached');
        }
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [auto, tradeDate]);

  // ---------- 每 5 分钟：盘中刷新当日 5 分钟 K（供 10 分钟窗口判定） ----------
  useEffect(() => {
    const t = window.setInterval(() => {
      const ph = phaseOf(new Date(), tradeDate);
      if (isLivePhase(ph)) void fetchTodayBars(tradeDate);
    }, 5 * 60_000);
    return () => window.clearInterval(t);
  }, [tradeDate, fetchTodayBars]);

  // ---------- 交易日变更 / 收盘后补拉当日完整 K ----------
  useEffect(() => {
    if (tradeDate && todayBarsDateRef.current !== tradeDate && !isLivePhase(phase)) {
      void fetchTodayBars(tradeDate);
    }
  }, [phase, tradeDate, fetchTodayBars]);

  // ---------- 手动刷新 ----------
  const hardRefresh = useCallback(async () => {
    try {
      const { quotes: q, source } = await fetchQuotesWithFallback();
      setQuotes(q);
      setDataMode('live');
      setLastUpdate(new Date());
      quoteSrcRef.current = source;
      const td = quoteDateOf(Object.values(q)[0]);
      void fetchTodayBars(td);
      const cache = loadBaselines();
      if (!cache || cache.tradeDate !== td) await rebuildBaselines(td);
      await recordSharesFor(q, td, sharesStore, setSharesStore, setPrevShareDateLabel);
    } catch {
      setDataMode('cached');
      setWarnings((w) => [...w.slice(-4), '刷新失败：行情接口暂不可用']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharesStore, rebuildBaselines]);

  // ---------- 份额历史导入 / 导出 ----------
  const mergeShares = useCallback((incoming: { byDate?: Record<string, Record<string, number>>; dates?: string[] } | null): number => {
    const { merged, added } = mergeSharesStore(sharesStore, incoming);
    if (added > 0) {
      setSharesStore(merged);
      saveShares(merged);
    }
    return added;
  }, [sharesStore]);

  const exportShares = useCallback((): string => {
    return JSON.stringify({ exportedAt: new Date().toISOString(), note: 'ett shares history (亿份); 格式 {byDate: {YYYYMMDD: {code: 份额亿份}}}', ...sharesStore }, null, 1);
  }, [sharesStore]);

  // ---------- 派生行 ----------
  const rows: RowState[] = useMemo(() => {
    const hm = nowHHMM(now);
    return POOL.map((def) => {
      const quote = quotes[def.tcode] ?? null;
      const baseline = baselines[def.code] ?? null;
      const amountYi = quote ? quote.amountWan / 1e4 : null;
      const progress = baseline ? progressAt(baseline.shape, hm, phase) : 0;
      const ratioSpot = amountYi != null && baseline ? spotRatio(amountYi, baseline.avg20Yi, progress) : null;
      const ratioDay = amountYi != null && baseline ? dayRatio(amountYi, baseline.avg20Yi) : null;
      const netBuy = quote && amountYi != null ? netBuyYi(quote.outerLots, quote.innerLots, amountYi) : null;
      const sharesYi = quote && quote.sharesFen > 0 ? quote.sharesFen / 1e8 : null;
      const st = sharesStore.stale[tradeDate] ?? {};
      const mkt = MARKET_OF(def.code);
      const sharesStale = !!st[mkt];
      const prevShares = sharesYi != null ? prevSharesOf(sharesStore, tradeDate, def.code) : null;
      const subscr = quote && sharesYi != null && !sharesStale ? subscrNetYi(sharesYi, prevShares, quote.price) : null;
      return {
        def, quote, baseline, amountYi, ratioSpot, ratioDay, netBuy,
        sharesYi, subscr, subscrPrevDate: prevShareDateLabel, sharesStale, progress,
      };
    });
  }, [quotes, baselines, now, phase, sharesStore, tradeDate, prevShareDateLabel]);

  // ---------- 池级汇总（仅重点监测池） ----------
  const pool = useMemo(() => {
    const coreRows = rows.filter((r) => r.def.group === 'core');
    const withBase = coreRows.filter((r) => r.baseline && r.amountYi != null);
    const totalAmount = coreRows.reduce((s, r) => s + (r.amountYi ?? 0), 0);
    const denom = withBase.reduce((s, r) => s + (r.baseline!.avg20Yi * r.progress), 0);
    const avgSum = withBase.reduce((s, r) => s + r.baseline!.avg20Yi, 0);
    const progressPct = avgSum > 0 ? (denom / avgSum) * 100 : null;
    const ratio = denom > 0 ? totalAmount / denom : null;
    const netBuy = coreRows.reduce((s, r) => s + (r.netBuy ?? 0), 0);
    const netBuyKnown = coreRows.some((r) => r.netBuy != null);
    const wPct = weightedPct(coreRows.filter((r) => r.quote).map((r) => ({ mktcapYi: r.quote!.mktcapYi, pct: r.quote!.pct })));
    const dayRatioPool = avgSum > 0 ? totalAmount / avgSum : null;
    // 池级当日尾盘占比（收盘后）：按成交额加权各标的尾盘占比
    const tailVals = coreRows.filter((r) => r.baseline?.tailToday != null && r.amountYi);
    const tailToday = tailVals.length
      ? tailVals.reduce((s, r) => s + (r.baseline!.tailToday as number) * (r.amountYi as number), 0) / tailVals.reduce((s, r) => s + (r.amountYi as number), 0)
      : null;
    const tailBase = withBase.length
      ? withBase.reduce((s, r) => s + r.baseline!.tailBase * r.baseline!.avg20Yi, 0) / withBase.reduce((s, r) => s + r.baseline!.avg20Yi, 0)
      : null;
    return { totalAmount, ratio, netBuy: netBuyKnown ? netBuy : null, wPct, progressPct, dayRatioPool, tailToday, tailBase, count: coreRows.length };
  }, [rows]);

  const fullDay = isFullDayData(phase);

  // ---------- 10 分钟窗口判定 ----------
  const windowStats: WindowStat[] = useMemo(() => {
    if (!tradeDate) return [];
    const funds = CORE_POOL.map((def) => baselines[def.code]).filter((b): b is Baseline => !!b && b.shape.length > 0)
      .map((b) => ({ avg20Yi: b.avg20Yi, shape: b.shape }));
    return buildWindowStats(funds, todayBars, tradeDate, nowHHMM(now), phase);
  }, [baselines, todayBars, tradeDate, now, phase]);

  const verdict = useMemo(
    () => makeVerdict({ phase, ratio: pool.ratio, netBuy: pool.netBuy, progressPct: pool.progressPct, tailToday: pool.tailToday, tailBase: pool.tailBase, fullDay, windows: windowStats }),
    [phase, pool, windowStats],
  );

  // ---------- 份额序列（图表用，重点监测池） ----------
  const shareSeries: ShareSeriesPoint[] = useMemo(() => {
    return buildShareSeries(sharesStore.dates, sharesStore.byDate, sharesStore.stale, CORE_POOL.map((x) => x.code), MARKET_OF);
  }, [sharesStore]);

  return {
    booting, ready: !booting, quotes, rows, pool, verdict, phase, tradeDate, fullDay,
    warnings, baselineDone, baselineTotal, dataMode, lastUpdate, now,
    auto, setAuto, hardRefresh, shareSeries, prevShareDateLabel,
    sharesCount: sharesStore.dates.length, mergeShares, exportShares, windowStats,
  };
}

// ---------- 内部工具 ----------

function tailRatioOrNull(bars: Bar[]): number | null {
  const total = bars.reduce((s, b) => s + (b.amount ?? b.volume * b.close), 0);
  if (total <= 0 || bars[bars.length - 1]?.hm !== '15:00') return null;
  const tail = bars
    .filter((b) => { const m = Number(b.hm.slice(0, 2)) * 60 + Number(b.hm.slice(3)); return m > 870 && m <= 900; })
    .reduce((s, b) => s + (b.amount ?? b.volume * b.close), 0);
  return tail / total;
}

/** 日 K 降级基线：avg20 / hist30 估算；shape 沿用旧缓存（调用方合并） */
function baselineFromDaily(
  bars: { date: string; hm: string; close: number; volume: number }[],
  forDate: string,
  source: 'sinaDaily' | 'tencentDaily',
): Baseline | null {
  const days = new Map<string, { close: number; volume: number }>();
  bars.forEach((b) => days.set(b.date, b));
  const dates = [...days.keys()].sort();
  const prevDays = dates.filter((d) => d < forDate).slice(-20);
  if (prevDays.length === 0) return null;
  const amountOf = (d: string) => { const x = days.get(d)!; return (x.volume * x.close) / 1e8; };
  const avg20Yi = prevDays.reduce((s, d) => s + amountOf(d), 0) / prevDays.length;
  const hist30 = dates.filter((d) => d <= forDate).slice(-30).map((d) => ({ date: d, amountYi: amountOf(d) }));
  // 尾盘均值与 shape 未知 → 置 0/空，调用方合并旧缓存
  return { avg20Yi, shape: [], tailBase: 0, hist30, daysUsed: prevDays.length, source };
}

async function recordSharesFor(
  q: Record<string, Quote>,
  tradeDate: string,
  store: SharesStore,
  setStore: (s: SharesStore) => void,
  setLabel: (s: string | null) => void,
): Promise<void> {
  if (!tradeDate || !q[POOL[0].tcode]) return;
  const rec: Record<string, number> = {};
  for (const def of POOL) {
    const quote = q[def.tcode];
    if (quote?.sharesFen > 0) rec[def.code] = quote.sharesFen / 1e8;
  }
  const prevDate = store.dates.filter((d) => d < tradeDate).pop() ?? null;
  const staleMark = prevDate ? detectStaleMarkets(rec, store.byDate[prevDate] ?? {}, MARKET_OF) : null;
  const { changed, prevDate: usedPrev } = recordShares(store, tradeDate, rec, staleMark);
  if (changed) setStore({ ...store });
  setLabel(usedPrev);
}
