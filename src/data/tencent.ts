/**
 * 腾讯行情公开接口 qt.gtimg.cn —— 实时快照（成交额/涨跌/外盘内盘/份额/规模）。
 * 字段下标见 docs/SPEC.md 第三节。
 */

import { loadScript } from './jsonp';

export interface Quote {
  tcode: string;
  name: string;
  price: number;
  prevClose: number;
  pct: number; // 涨跌 %
  amountWan: number; // 成交额（万元）
  outerLots: number; // 外盘（手）
  innerLots: number; // 内盘（手）
  volumeLots: number; // 成交量（手）
  mktcapYi: number; // 规模（亿元，行情口径 价格×份额）
  /** 场内份额（份）；异常时回退 规模/现价 */
  sharesFen: number;
  /** 行情时间 yyyyMMddHHmmss */
  timeStr: string;
}

export function parseQuote(tcode: string, raw: string): Quote | null {
  const f = raw.split('~');
  if (f.length < 40) return null;
  const price = Number(f[3]);
  const mktcapYi = Number(f[45]) || Number(f[44]) || 0;
  const sharesFiled = Number(f[72]);
  const sharesFen =
    sharesFiled > 0 ? sharesFiled : price > 0 && mktcapYi > 0 ? (mktcapYi * 1e8) / price : 0;
  return {
    tcode,
    name: f[1],
    price,
    prevClose: Number(f[4]),
    pct: Number(f[32]),
    amountWan: Number(f[37]) || 0,
    outerLots: Number(f[7]) || 0,
    innerLots: Number(f[8]) || 0,
    volumeLots: Number(f[36]) || 0,
    mktcapYi,
    sharesFen,
    timeStr: f[30] || '',
  };
}

/** 拉取一批标的的实时快照（GBK 编码） */
export async function fetchQuotes(tcodes: string[], timeoutMs = 12000): Promise<Record<string, Quote>> {
  const r = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const url = `https://qt.gtimg.cn/q=${tcodes.join(',')}&r=${r}`;
  await loadScript(url, { charset: 'GBK', timeoutMs });
  const w = window as unknown as Record<string, unknown>;
  const out: Record<string, Quote> = {};
  for (const tc of tcodes) {
    const v = w[`v_${tc}`];
    if (typeof v === 'string') {
      const q = parseQuote(tc, v);
      if (q) out[tc] = q;
    }
  }
  if (Object.keys(out).length === 0) throw new Error('quotes empty');
  return out;
}

/**
 * 腾讯日 K（备用数据源，新浪 K 线不可用时估算 20 日均额 / 近 30 日成交额）。
 * 响应支持 CORS（access-control-allow-origin: *），可直接 fetch。
 * 行格式：[date, open, close, high, low, volume(手)]
 */
export async function fetchTencentDaily(
  tcode: string,
  n: number,
  timeoutMs = 12000,
): Promise<{ date: string; close: number; volumeLots: number }[]> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tcode},day,,,${n},qfq`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`tencent daily http ${r.status}`);
    const j = (await r.json()) as {
      code: number;
      data: Record<string, Record<string, unknown>>;
    };
    if (j.code !== 0) throw new Error(`tencent daily code ${j.code}`);
    const d = j.data?.[tcode] ?? {};
    const rows = (d.qfqday ?? d.day) as unknown as (string | number)[][] | undefined;
    if (!Array.isArray(rows)) throw new Error('tencent daily empty');
    return rows
      .map((row) => ({
        date: String(row[0]).replace(/-/g, ''),
        close: Number(row[2]),
        volumeLots: Number(row[5]) || 0,
      }))
      .filter((x) => x.date.length === 8 && x.close > 0);
  } finally {
    window.clearTimeout(timer);
  }
}

export function quoteDateOf(q: Quote): string {
  return q.timeStr.slice(0, 8); // yyyyMMdd
}

export function quoteHMOf(q: Quote): string {
  return `${q.timeStr.slice(8, 10)}:${q.timeStr.slice(10, 12)}`;
}
