/**
 * 东方财富行情接口（备用数据源，腾讯行情不可用时切换）。
 * push2.eastmoney.com 支持 CORS，可直接 fetch。
 * 字段：f2 最新价 f3 涨跌% f4 涨跌额 f5 成交量(手) f6 成交额(元) f12 代码
 *       f13 市场(1=SH,0=SZ) f14 名称 f15 高 f16 低 f17 开 f18 昨收
 *       f20 总市值(元) f124 更新时间戳(unix 秒)
 * 注意：该源无外盘/内盘字段 → 降级模式下「主动净买入」不展示（其余指标齐全）。
 * 场内份额 = 总市值 ÷ 现价（与腾讯口径交叉验证一致，误差 <0.1%）。
 */

export interface QuoteEM {
  code: string;
  name: string;
  price: number;
  prevClose: number;
  pct: number;
  amountYuan: number;
  volumeLots: number;
  mktcapYuan: number;
  /** 更新时间（unix 秒） */
  tsSec: number;
}

const EM_FIELDS = 'f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18,f20,f124';

/** sh510300 → 1.510300；sz159915 → 0.159915 */
export function tcodeToSecid(tcode: string): string {
  const m = /^(sh|sz)(\d{6})$/.exec(tcode);
  if (!m) throw new Error(`bad tcode: ${tcode}`);
  return `${m[1] === 'sh' ? 1 : 0}.${m[2]}`;
}

export async function fetchQuotesEM(tcodes: string[], timeoutMs = 12000): Promise<Record<string, QuoteEM>> {
  const secids = tcodes.map(tcodeToSecid).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${secids}&fields=${EM_FIELDS}`;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`eastmoney http ${r.status}`);
    const j = (await r.json()) as { rc: number; data: { diff: Record<string, number | string>[] } | null };
    if (j.rc !== 0 || !j.data?.diff) throw new Error('eastmoney empty');
    const out: Record<string, QuoteEM> = {};
    for (const d of j.data.diff) {
      const code = String(d.f12);
      out[code] = {
        code,
        name: String(d.f14 ?? ''),
        price: Number(d.f2),
        prevClose: Number(d.f18),
        pct: Number(d.f3),
        amountYuan: Number(d.f6) || 0,
        volumeLots: Number(d.f5) || 0,
        mktcapYuan: Number(d.f20) || 0,
        tsSec: Number(d.f124) || 0,
      };
    }
    if (Object.keys(out).length === 0) throw new Error('eastmoney no rows');
    return out;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 时间戳 → HH:MM（本地时区） */
export function emTsToHHMM(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
