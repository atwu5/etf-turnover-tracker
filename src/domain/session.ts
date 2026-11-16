/** 交易时段状态机与时间工具（A 股：09:30–11:30 / 13:00–15:00） */

export type SessionPhase = 'pre' | 'am' | 'lunch' | 'pm' | 'after' | 'closed';

export function yyyymmdd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function nowHHMM(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function weekdayOf(yyyymmddStr: string): string {
  if (!/^\d{8}$/.test(yyyymmddStr)) return '';
  const d = new Date(
    Number(yyyymmddStr.slice(0, 4)),
    Number(yyyymmddStr.slice(4, 6)) - 1,
    Number(yyyymmddStr.slice(6, 8)),
  );
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

export function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 依据本地时间与行情日期判断阶段。
 * quoteDate：行情时间字段日期（yyyyMMdd）。若行情日期 < 本地日期，说明行情停留在上一交易日（休市或盘前）。
 */
export function phaseOf(now: Date, quoteDate: string): SessionPhase {
  const today = yyyymmdd(now);
  if (quoteDate && quoteDate < today) return 'closed';
  const m = now.getHours() * 60 + now.getMinutes();
  const wd = now.getDay();
  if (wd === 0 || wd === 6) return 'closed'; // 周末（法定节假日由行情日期兜底判断）
  if (m < 9 * 60 + 15) return 'pre';
  if (m < 11 * 60 + 30) return 'am';
  if (m < 13 * 60) return 'lunch';
  if (m < 15 * 60) return 'pm';
  return 'after';
}

export function isLivePhase(p: SessionPhase): boolean {
  return p === 'am' || p === 'pm';
}

export function isFullDayData(p: SessionPhase): boolean {
  return p === 'after' || p === 'closed';
}
