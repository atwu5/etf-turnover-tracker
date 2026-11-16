/** 展示用格式化工具 */

export function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** yyyyMMdd → MM/DD（图表轴标签） */
export function dateLabel(yyyymmddStr: string): string {
  if (!/^\d{8}$/.test(yyyymmddStr)) return yyyymmddStr;
  return `${yyyymmddStr.slice(4, 6)}/${yyyymmddStr.slice(6, 8)}`;
}

/** yyyyMMdd → yyyy-MM */
export function monthLabel(yyyymmddStr: string): string {
  if (!/^\d{8}$/.test(yyyymmddStr)) return yyyymmddStr;
  return `${yyyymmddStr.slice(2, 4)}/${yyyymmddStr.slice(4, 6)}`;
}

export function tradeDatePretty(yyyymmddStr: string): string {
  if (!/^\d{8}$/.test(yyyymmddStr)) return yyyymmddStr;
  return `${yyyymmddStr.slice(0, 4)}-${yyyymmddStr.slice(4, 6)}-${yyyymmddStr.slice(6, 8)}`;
}
