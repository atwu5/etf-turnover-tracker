import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ShareSeriesPoint } from '../domain/metrics';
import { monthLabel } from '../domain/format';
import { Card, CardTitle } from './ui';

type Range = '3m' | '6m' | '1y';
const RANGE_MS: Record<Range, number> = { '3m': 92 * 864e5, '6m': 183 * 864e5, '1y': 366 * 864e5 };

function useEchart(option: echarts.EChartsOption | null, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, ...deps]);
  return ref;
}

function filterRange<T extends { date: string }>(arr: T[], range: Range): T[] {
  const now = Date.now();
  const last = arr.length ? Date.parse(`${arr[arr.length - 1].date.slice(0, 4)}-${arr[arr.length - 1].date.slice(4, 6)}-${arr[arr.length - 1].date.slice(6, 8)}`) : now;
  const from = last - RANGE_MS[range];
  const out = arr.filter((x) => Date.parse(`${x.date.slice(0, 4)}-${x.date.slice(4, 6)}-${x.date.slice(6, 8)}`) >= from);
  return out.length ? out : arr.slice(-1); // 数据不足时至少保留最新一点
}

const AXIS = {
  axisLine: { lineStyle: { color: '#cbd5e1' } },
  axisTick: { show: false },
  axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: string) => monthLabel(v) },
  splitLine: { lineStyle: { color: '#eef2f7' } },
} as const;

export function TrendCharts({ series, historyDays }: { series: ShareSeriesPoint[]; historyDays: number }) {
  const [r1, setR1] = useState<Range>('3m');
  const [r2, setR2] = useState<Range>('3m');
  const sparse = historyDays < 5;

  const changeData = useMemo(() => filterRange(series.filter((p) => p.changeYi != null) as Required<ShareSeriesPoint>[], r1), [series, r1]);
  const indexData = useMemo(() => filterRange(series.filter((p) => p.indexVal != null) as Required<ShareSeriesPoint>[], r2), [series, r2]);

  const changeOption = useMemo<echarts.EChartsOption>(() => ({
    grid: { left: 8, right: 8, top: 24, bottom: 0, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      valueFormatter: (v) => `${Number(v).toFixed(2)} 亿份`,
    },
    xAxis: { type: 'category', data: changeData.map((p) => p.date), ...AXIS },
    yAxis: { type: 'value', name: '亿份', nameTextStyle: { color: '#94a3b8', fontSize: 10 }, ...AXIS },
    series: [{
      type: 'bar',
      data: changeData.map((p) => ({ value: p.changeYi, itemStyle: { color: (p.changeYi ?? 0) >= 0 ? '#e03434' : '#0a9e6e' } })),
      barMaxWidth: 10,
    }],
  }), [changeData]);

  const indexOption = useMemo<echarts.EChartsOption>(() => ({
    grid: { left: 8, right: 8, top: 24, bottom: 0, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      valueFormatter: (v) => `${Number(v).toFixed(1)}`,
    },
    xAxis: { type: 'category', data: indexData.map((p) => p.date), ...AXIS },
    yAxis: { type: 'value', scale: true, name: '指数', nameTextStyle: { color: '#94a3b8', fontSize: 10 }, ...AXIS },
    series: [
      {
        type: 'line',
        data: indexData.map((p) => p.indexVal),
        symbol: 'none',
        lineStyle: { color: '#1B88EE', width: 2 },
        areaStyle: { color: 'rgba(27,136,238,.08)' },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 100 }],
          lineStyle: { color: '#94a3b8', type: 'dashed' },
          label: { formatter: '基期 100', color: '#64748b', fontSize: 10 },
        },
      },
    ],
  }), [indexData]);

  const c1 = useEchart(changeOption, [changeOption]);
  const c2 = useEchart(indexOption, [indexOption]);

  const note = sparse
    ? `份额历史自首次使用开始本地积累（当前 ${historyDays} 个交易日），需连续使用才能形成申赎趋势；期间按前值顺延，不产生假跳变。`
    : `估算方法：池内 ${'20'} 只重点监测 ETF「当日场内份额 − 上一交易日份额」加总，正数计申购、负数计赎回；日度份额变化全部视为监测对象操作是参考口径，实际申赎可能来自任何投资者。份额源未日更的交易日不贡献变化量，指数按前值顺延。`;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardTitle sub={<RangeButtons value={r1} onChange={setR1} />}>每日份额变化估算</CardTitle>
        <div className="px-2 pb-1 pt-2 text-[11px] text-slate-400">单位：亿份 · 正数净申购（红），负数净赎回（绿）</div>
        {changeData.length === 0 ? (
          <EmptyChart text="份额变化需至少两个交易日的份额记录，自首次使用起逐日积累。" />
        ) : (
          <div ref={c1} className="h-56 w-full" />
        )}
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">{note}</p>
      </Card>
      <Card>
        <CardTitle sub={<RangeButtons value={r2} onChange={setR2} />}>加仓指数估算</CardTitle>
        <div className="px-2 pb-1 pt-2 text-[11px] text-slate-400">区间首日 = 100 · 高于 100 为估算净加仓，低于 100 为估算净减仓</div>
        {indexData.length === 0 ? (
          <EmptyChart text="加仓指数自首个份额记录日开始计算。" />
        ) : (
          <div ref={c2} className="h-56 w-full" />
        )}
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">
          加仓指数 = 100 × 当日池内总份额 ÷ 区间首日总份额。不等于真实持仓比例：定期报告已停止披露前十大持有人，期初持仓不可验证，比例锚定会失真，故用指数刻画变化方向与幅度。
        </p>
      </Card>
    </div>
  );
}

function RangeButtons({ value, onChange }: { value: Range; onChange: (v: Range) => void }) {
  return (
    <div className="flex items-center gap-1">
      {([['3m', '近3月'], ['6m', '近6月'], ['1y', '近1年']] as const).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${value === k ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-slate-400">
      <svg className="h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 14l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs">{text}</span>
    </div>
  );
}
