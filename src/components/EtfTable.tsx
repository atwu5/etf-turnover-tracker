import { GROUP_META, type Group } from '../config/pool';
import { fmtRatio, fmtYi } from '../domain/metrics';
import { quoteHMOf } from '../data/tencent';
import type { RowState } from '../hooks/useTracker';
import { tradeDatePretty } from '../domain/format';
import { Badge, Card, DeltaText } from './ui';
import { Sparkline } from './Sparkline';
import type { ReactNode } from 'react';

export type SortKey = 'huijin' | 'amount' | 'ratio' | 'net' | 'mktcap';
export type ScopeKey = 'all' | 'core' | 'watch';

function sortValue(r: RowState, key: SortKey): number {
  switch (key) {
    case 'amount': return r.amountYi ?? -1;
    case 'ratio': return r.ratioSpot ?? -1;
    case 'net': return r.netBuy ?? -Infinity;
    case 'mktcap': return r.quote?.mktcapYi ?? -1;
    case 'huijin': return (r.def.huijinYi ?? -1) * 1e6 + (r.quote?.mktcapYi ?? 0); // 汇金持仓优先，同档按规模
  }
}

/** 组内排序后的行 */
export function arrangeRows(rows: RowState[], sort: SortKey): RowState[] {
  return [...rows].sort((a, b) => sortValue(b, sort) - sortValue(a, sort));
}

export function EtfTable({ rows, sort, fullDay }: { rows: RowState[]; sort: SortKey; fullDay: boolean }) {
  const groups: Group[] = ['core', 'watch'];
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-gold-hair bg-gold-soft/40 text-left text-xs text-ink-muted">
              <th className="px-4 py-2.5 font-medium tracking-wide">ETF</th>
              <th className="px-3 py-2.5 font-medium">跟踪指数</th>
              <th className="px-3 py-2.5 text-right font-medium">规模(亿)</th>
              <th className="px-3 py-2.5 text-right font-medium">成交额(亿)</th>
              <th className="px-3 py-2.5 text-right font-medium">{fullDay ? '全天倍数' : '同时点倍数'}</th>
              <th className="px-3 py-2.5 text-right font-medium">主动净买入①</th>
              <th className="px-3 py-2.5 text-right font-medium">涨跌</th>
              <th className="px-3 py-2.5 text-right font-medium">份额(亿份)②</th>
              <th className="px-3 py-2.5 font-medium">近30日成交额</th>
              <th className="px-4 py-2.5 text-right font-medium">汇金持仓(25年报·亿份)</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const grs = rows.filter((r) => r.def.group === g);
            if (grs.length === 0) return null;
            return (
              <tbody key={g} className="divide-y divide-stone-100">
                <tr className="bg-gold-soft/30">
                  <td colSpan={10} className="px-4 py-1.5 text-xs text-ink-soft">
                    <span className="font-serif font-semibold text-gold-ink">{GROUP_META[g].label}</span>
                    <span className="ml-2 text-ink-muted">· {GROUP_META[g].note}</span>
                    <span className="ml-2 rounded border border-gold-hair/70 bg-ivory-card px-1.5 py-0.5 text-[11px] text-gold-ink">{grs.length} 只</span>
                  </td>
                </tr>
                {arrangeRows(grs, sort).map((r) => (
                  <TableRow key={r.def.code} r={r} />
                ))}
                {g === 'core' && <TotalRow rows={grs} />}
              </tbody>
            );
          })}
        </table>
      </div>
    </Card>
  );
}

function TableRow({ r }: { r: RowState }) {
  const q = r.quote;
  const asOf = q ? quoteHMOf(q) : '';
  return (
    <tr className="transition-colors hover:bg-gold-soft/40">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-ink">{r.def.name}</span>
          <Badge tone={r.def.group}>{GROUP_META[r.def.group].badge}</Badge>
        </div>
        <div className="num mt-0.5 text-[11px] text-ink-muted">{r.def.code}</div>
      </td>
      <td className="px-3 py-2.5 text-ink-soft">{r.def.index}</td>
      <td className="num px-3 py-2.5 text-right text-ink-soft">{q ? fmtYi(q.mktcapYi, 1) : '—'}</td>
      <td className="px-3 py-2.5 text-right">
        <div className="num font-semibold text-ink">{fmtYi(r.amountYi)}</div>
        {asOf && <div className="text-[10px] text-ink-muted">截至 {asOf}</div>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="num font-semibold text-ink">{fmtRatio(r.ratioSpot)}</div>
        {r.ratioDay != null && <div className="text-[10px] text-ink-muted">已达成日均 {r.ratioDay.toFixed(2)}×</div>}
      </td>
      <td className="px-3 py-2.5 text-right"><DeltaText value={r.netBuy} /></td>
      <td className="px-3 py-2.5 text-right"><DeltaText value={q ? q.pct : null} suffix="%" /></td>
      <td className="px-3 py-2.5 text-right">
        {r.sharesYi == null ? (
          <span className="text-stone-400">—</span>
        ) : (
          <>
            <div className="num text-stone-700">{fmtYi(r.sharesYi, 1)}</div>
            <div className="text-[10px]">
              {r.sharesStale ? (
                <span className="text-amber-600">份额源未日更</span>
              ) : r.subscr != null ? (
                <>
                  <span className="text-stone-400">较{r.subscrPrevDate?.slice(4, 6)}/{r.subscrPrevDate?.slice(6, 8)} </span>
                  <DeltaText value={r.subscr} digits={2} />
                  <span className="text-stone-400">亿</span>
                </>
              ) : (
                <span className="text-stone-400">申赎 待积累</span>
              )}
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Sparkline data={r.baseline?.hist30 ?? []} />
      </td>
      <td className="num px-4 py-2.5 text-right text-stone-600">{r.def.huijinYi != null ? fmtYi(r.def.huijinYi, 1) : '—'}</td>
    </tr>
  );
}

function TotalRow({ rows }: { rows: RowState[] }) {
  const totalAmount = rows.reduce((s, r) => s + (r.amountYi ?? 0), 0);
  const denom = rows.filter((r) => r.baseline && r.amountYi != null).reduce((s, r) => s + r.baseline!.avg20Yi * r.progress, 0);
  const ratio = denom > 0 ? totalAmount / denom : null;
  const net = rows.reduce((s, r) => s + (r.netBuy ?? 0), 0);
  return (
    <tr className="border-t-2 border-gold-hair bg-gold-soft/40 font-medium">
      <td className="px-4 py-2.5 text-ink">重点池合计</td>
      <td className="px-3 py-2.5 text-ink-muted">{rows.length} 只</td>
      <td className="px-3 py-2.5 text-right text-ink-muted">—</td>
      <td className="num px-3 py-2.5 text-right font-semibold text-ink">{fmtYi(totalAmount)}</td>
      <td className="num px-3 py-2.5 text-right font-semibold text-ink">{fmtRatio(ratio)}</td>
      <td className="px-3 py-2.5 text-right"><DeltaText value={net} /></td>
      <td colSpan={4} className="px-3 py-2.5 text-right text-[11px] text-ink-muted">合计口径与上方判断一致（{rows.length} 只重点监测标的）</td>
    </tr>
  );
}

/** 移动端卡片列表 */
export function EtfCardList({ rows, fullDay }: { rows: RowState[]; fullDay: boolean }) {
  const groups: Group[] = ['core', 'watch'];
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const grs = rows.filter((r) => r.def.group === g);
        if (grs.length === 0) return null;
        return (
          <div key={g} className="space-y-2">
            <div className="px-1 text-xs text-stone-500">
              <span className="font-semibold text-stone-600">{GROUP_META[g].label}</span>
              <span className="ml-1.5 text-stone-400">{grs.length} 只</span>
            </div>
            {arrangeRows(grs, 'huijin').map((r) => (
              <Card key={r.def.code} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-stone-800">{r.def.name}</span>
                      <Badge tone={r.def.group}>{GROUP_META[r.def.group].badge}</Badge>
                    </div>
                    <div className="num mt-0.5 text-xs text-stone-400">{r.def.code} · {r.def.index}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gold-grad num font-serif text-[26px] font-bold leading-none">{r.ratioSpot == null ? '—' : `${r.ratioSpot.toFixed(2)}×`}</div>
                    <div className="mt-0.5 text-[10px] text-ink-muted">{fullDay ? '较20日均额' : '同时点倍数'}{r.ratioDay != null && ` · 已达成日均 ${r.ratioDay.toFixed(2)}×`}</div>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-stone-100 pt-2.5 text-center">
                  <MiniCell label="成交额" value={r.amountYi == null ? '—' : `${fmtYi(r.amountYi)}亿`} sub={r.quote ? `截至 ${quoteHMOf(r.quote)}` : ''} />
                  <MiniCell label="净买入" value={<DeltaText value={r.netBuy} />} sub="主动买卖①" />
                  <MiniCell label="涨跌" value={<DeltaText value={r.quote ? r.quote.pct : null} suffix="%" />} sub={r.quote ? `规模 ${fmtYi(r.quote.mktcapYi, 0)}亿` : ''} />
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                  <span className="text-stone-500">
                    份额 <span className="num">{r.sharesYi == null ? '—' : fmtYi(r.sharesYi, 1)}</span> 亿份
                  </span>
                  <span className="text-[11px]">
                    {r.sharesStale ? (
                      <span className="text-amber-600">份额源未日更</span>
                    ) : r.subscr != null ? (
                      <>
                        <span className="text-stone-400">较{r.subscrPrevDate ? tradeDatePretty(r.subscrPrevDate) : ''} </span>
                        <DeltaText value={r.subscr} />
                        <span className="text-stone-400">亿</span>
                      </>
                    ) : (
                      <span className="text-stone-400">申赎 待积累</span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
                  <span className="text-[11px] text-stone-400">近30日成交额</span>
                  <Sparkline data={r.baseline?.hist30 ?? []} width={110} height={26} />
                  <span className="text-[11px] text-stone-400">汇金持仓 {r.def.huijinYi != null ? `${fmtYi(r.def.huijinYi, 1)}亿份` : '—'}</span>
                </div>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MiniCell({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] text-stone-400">{label}</div>
      <div className="num text-[13px] font-medium">{value}</div>
      {sub && <div className="text-[10px] text-stone-300">{sub}</div>}
    </div>
  );
}
