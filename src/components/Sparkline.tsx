import { useState } from 'react';
import { dateLabel } from '../domain/format';

/** 近 30 日成交额迷你柱状图（SVG，悬停显示日期与成交额） */
export function Sparkline({ data, width = 132, height = 34 }: { data: { date: string; amountYi: number }[]; width?: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data || data.length === 0) return <span className="text-xs text-slate-300">—</span>;
  const max = Math.max(...data.map((d) => d.amountYi), 0.0001);
  const gap = 1.5;
  const bw = (width - gap * (data.length - 1)) / data.length;
  return (
    <div className="relative inline-block">
      <svg
        width={width}
        height={height}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="近30日成交额"
      >
        {data.map((d, i) => {
          const h = Math.max(1, (d.amountYi / max) * (height - 4));
          const isLast = i === data.length - 1;
          const isHover = hover === i;
          return (
            <rect
              key={d.date}
              x={i * (bw + gap)}
              y={height - h}
              width={bw}
              height={h}
              rx={1}
              fill={isHover ? '#1B88EE' : isLast ? '#5aa5f2' : '#bcd7f7'}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white shadow">
          {dateLabel(data[hover].date)} {data[hover].amountYi.toFixed(2)} 亿
        </div>
      )}
    </div>
  );
}
