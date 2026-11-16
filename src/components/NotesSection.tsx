import { LIST_BASIS } from '../config/pool';
import type { ReactNode } from 'react';
import { Card } from './ui';

/** 口径与合规说明区（可折叠） */
export function NotesSection({ dataNotes }: { dataNotes: string[] }) {
  return (
    <div className="space-y-2">
      {dataNotes.length > 0 && (
        <Notice tone="warn">
          <b>数据提示：</b>
          {dataNotes.join('；')}
        </Notice>
      )}
      <Card>
        <details open>
          <summary className="cursor-pointer list-none px-4 py-3 font-serif text-[15px] font-semibold tracking-wide text-ink">
            数据来源与刷新机制
          </summary>
          <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-stone-500">
            <p><b className="text-ink-soft">成交额 / 涨跌 / 规模 / 份额 / 外盘内盘：</b>腾讯行情公开接口 qt.gtimg.cn（GBK 文本，&lt;script&gt; 直连），交易时段每 20 秒刷新（可开关）。规模为行情口径「价格 × 份额」，非基金净值口径。腾讯不可用时自动切换<b className="text-ink-soft">东方财富 push2 接口备用源</b>（CORS 直连，份额=总市值÷现价；该源无外盘/内盘，降级期间主动净买入不展示），源切换会在页顶提示。</p>
            <p><b className="text-stone-700">日内成交额分布 / 20 日均额 / 近 30 日成交额：</b>新浪 5 分钟 K 线（quotes.sina.cn，JSONP）近 20 个完整交易日，按日算出「累计成交额占全天比例」曲线（48 个时点取均值）——这是把盘中不完整数据对齐到全天基准的关键。5 分钟 K 自带精确成交额；若新浪不可用，降级为日 K 成交量×收盘价估算（误差约 0.1%–0.5%），并在页面顶部提示。</p>
            <p><b className="text-stone-700">盘中怎么比才可比：</b>上午 11:30 的成交额是「半天」，直接除全天 20 日均额没有意义。本页用<b className="text-stone-700">同时点对齐</b>：分母 = 20 日均额 × 该标的在此时点历史上平均已走完的比例，分子是当前累计成交额，两者都代表「到此刻为止」，可以直接比。表格里的「同时点倍数」是可比值，「已达成日均」是原始进度（半天干了全天均额的多少倍），后者只作参考。</p>
            <p><b className="text-stone-700">尾盘占比：</b>当日 14:30—15:00 成交额占全天比例，与 20 日均值（同为 14:30—15:00）比较。只有收盘后才计算。</p>
            <p><b className="text-stone-700">本地缓存与增量更新：</b>每交易日只需拉取一次 K 线，结果存 localStorage；交易日切换后自动增量重算。行情接口失败时保留缓存数据并提示，绝不伪造最新数据。</p>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer list-none border-t border-gold-hair/60 px-4 py-3 font-serif text-[15px] font-semibold tracking-wide text-ink">
            指标口径与脚注
          </summary>
          <div className="space-y-3 px-4 pb-4 text-[13px] leading-relaxed text-stone-500">
            <p>① <b className="text-stone-700">主动净买入 = (外盘 − 内盘) ÷ (外盘 + 内盘) × 成交额。</b>外盘是主动买（成交在卖价）、内盘是主动卖（成交在买价），所以这只是<b className="text-stone-700">逐笔成交方向的推算</b>：不是资金净流入，不是基金申赎净流入，也不含大宗交易与协议转让。ETF 有一二级市场套利对冲，同一笔申赎会在二级市场产生反向成交，会稀释该信号；机构调仓、做市双边报价同样会干扰。</p>
            <p>② <b className="text-stone-700">份额 / 申赎 = 行情披露的场内份额；申赎估算 = (本次快照份额 − 上一份快照份额) × 现价。</b>是份额变化的市值估算，不是基金公司公布的申赎数据。行情商的份额字段偶发未按日更新——当同一市场 ≥70% 标的两日份额完全相同时，该市场一律标「份额源未日更」而不给数字，避免把数据源滞后说成「没有申赎」。任何情况下都以基金公司公告为准。</p>
            <p><b className="text-stone-700">加仓指数：</b>100 × 当日池内总份额 ÷ 区间首日总份额。不等于真实持仓比例——定期报告已停止披露前十大持有人，期初持仓不可验证，故用指数刻画变化方向与幅度。份额源未日更的交易日按前值顺延（不产生假跳变）。</p>
            <p><b className="text-stone-700">结论文案分级阈值（放大倍数 1.5 / 1.1 / 0.85 等）为本工具自定假设</b>，用于组织文字表述；核心指标公式均按上述口径精确计算。</p>
          </div>
        </details>
        <details>
          <summary className="cursor-pointer list-none border-t border-gold-hair/60 px-4 py-3 font-serif text-[15px] font-semibold tracking-wide text-ink">
            名单与合规说明
          </summary>
          <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-stone-500">
            <p>{LIST_BASIS}</p>
            <p>「平准类资金 / 国家队」为市场俗称，非官方表述。本页结论基于公开行情的量价特征推测，不能证明任何机构当日是否交易，仅适合研究参考，不构成投资建议。</p>
            <p>数据来自第三方公开接口，可能存在延迟、缺失或口径差异，请以基金公司公告与交易所披露为准。投资有风险。</p>
          </div>
        </details>
      </Card>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'info'; children: ReactNode }) {
  const cls = tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gold/30 bg-gold-soft text-gold-deep';
  return <div className={`rounded-lg border px-4 py-2.5 text-[13px] leading-relaxed ${cls}`}>{children}</div>;
}
