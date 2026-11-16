/**
 * 新浪 K 线接口（quotes.sina.cn JSONP）。
 * scale=5   → 5 分钟 K：{day:"2026-11-16 11:30:00", open, high, low, close, volume(份), amount(元)}
 * scale=240 → 日 K：无 amount 字段（成交额需估算，作为备用路径）
 */

import { fetchSinaJsonp } from './jsonp';

export interface Bar {
  /** 交易日 yyyyMMdd */
  date: string;
  /** K 线结束时间 HH:mm（5 分钟线） */
  hm: string;
  close: number;
  /** 成交量（份） */
  volume: number;
  /** 成交额（元）；日 K 无此字段 */
  amount?: number;
}

interface RawBar {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  amount?: string;
}

function normalize(raw: RawBar[]): Bar[] {
  return raw
    .map((b) => {
      const date = b.day.slice(0, 10).replace(/-/g, '');
      const hm = b.day.length > 10 ? b.day.slice(11, 16) : '15:00';
      const close = Number(b.close);
      // 新浪偶发返回空字符串 amount（与 Referer/CDN 有关）→ 视为缺失，回退 volume×close
      const amt = b.amount != null ? Number(b.amount) : NaN;
      return {
        date,
        hm,
        close,
        volume: Number(b.volume) || 0,
        amount: isFinite(amt) && amt > 0 ? amt : undefined,
      };
    })
    .filter((b) => b.date.length === 8 && b.close > 0);
}

export async function fetchSinaKline(tcode: string, scale: 5 | 240, datalen: number, timeoutMs = 15000): Promise<Bar[]> {
  const raw = await fetchSinaJsonp<RawBar[]>(
    'CN_MarketDataService.getKLineData',
    `symbol=${tcode}&scale=${scale}&ma=no&datalen=${datalen}`,
    timeoutMs,
  );
  if (!Array.isArray(raw)) throw new Error('sina kline not array');
  return normalize(raw);
}

/** 新浪日 K（备用）：成交额 = volume × close 估算 */
export async function fetchSinaDaily(tcode: string, datalen: number, timeoutMs = 15000) {
  return fetchSinaKline(tcode, 240, datalen, timeoutMs);
}
