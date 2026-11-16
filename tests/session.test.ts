import { describe, expect, it } from 'vitest';
import { phaseOf, yyyymmdd, weekdayOf, minutesOf } from '../src/domain/session';

describe('phaseOf', () => {
  const mk = (h: number, m: number, wd = 1) => new Date(2026, 10, 16 + (wd - 1), h, m); // 2026-11-16 是周一
  it('交易时段', () => {
    expect(phaseOf(mk(9, 0), '20261116')).toBe('pre');
    expect(phaseOf(mk(9, 20), '20261116')).toBe('am');
    expect(phaseOf(mk(11, 29), '20261116')).toBe('am');
    expect(phaseOf(mk(11, 45), '20261116')).toBe('lunch');
    expect(phaseOf(mk(13, 1), '20261116')).toBe('pm');
    expect(phaseOf(mk(15, 1), '20261116')).toBe('after');
  });
  it('行情停留在上一交易日 → closed', () => {
    expect(phaseOf(mk(10, 0), '20261113')).toBe('closed'); // 行情是上周五的
  });
  it('周末 → closed（无论行情日期）', () => {
    const sun = new Date(2026, 10, 22, 10, 0);
    expect(phaseOf(sun, '20261122')).toBe('closed');
  });
  it('非交易日当天行情日期小于今天 → closed', () => {
    const sat = new Date(2026, 10, 21, 10, 0);
    expect(phaseOf(sat, '20261120')).toBe('closed');
  });
});

describe('工具函数', () => {
  it('yyyymmdd 补零', () => {
    expect(yyyymmdd(new Date(2026, 0, 5))).toBe('20260105');
  });
  it('weekdayOf', () => {
    expect(weekdayOf('20261116')).toBe('周一');
    expect(weekdayOf('20261122')).toBe('周日');
  });
  it('minutesOf', () => {
    expect(minutesOf('09:35')).toBe(575);
  });
});
