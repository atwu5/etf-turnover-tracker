# 宽基 ETF 动向监测（etf-turnover-tracker）

宽基 ETF 成交额与资金动向监测工具：以公开行情的量价特征（成交额、主动买卖、场内份额申赎）观察「平准类资金」当日是否活跃。功能复刻自参考站（宽基 ETF 成交额跟踪器），业务口径一致，视觉升级为科技蓝金融终端风格。

## 技术栈

- React 18 + TypeScript + Vite
- Tailwind CSS（白金高奢风：象牙白 × 香槟金 #b08d57，衬线标题 + 金色渐变大数字）
- ECharts（份额变化柱状图 / 加仓指数折线图，悬停查看数值）
- 纯前端实现，无需后端（行情通过 JSONP / CORS 直连公开接口）
- 行情双源容灾：腾讯 qt.gtimg.cn 主源 → 东方财富 push2 备源自动切换
- localStorage 本地缓存（每交易日增量更新）+ 逐日份额历史积累
- Vitest 单元测试（核心计算公式）

## 本地启动

```bash
npm install
npm run dev        # 开发模式 http://localhost:5173
npm run test       # 运行核心计算公式测试
npm run build      # 生产构建（tsc 检查 + vite build → dist/）
npm run preview    # 预览生产构建 http://localhost:4318
```

## 部署

`npm run build` 产物为 `dist/` 静态文件，可部署到任意静态托管（GitHub Pages / Nginx / OSS）。例如：

```bash
npx serve dist     # 本地静态预览
# 或拷贝 dist/ 到任意静态服务器目录
```

> 首次打开会拉取 24 只 ETF 的 5 分钟 K 线计算基线（约 20–40 秒），每个交易日只需计算一次，之后从本地缓存读取，仅行情快照每 20 秒轮询。

## 数据来源（全部为公开接口，无任何伪造数据）

| 数据 | 来源 | 说明 |
|---|---|---|
| 成交额 / 涨跌 / 规模 / 份额 / 外盘内盘 | `qt.gtimg.cn`（腾讯行情） | GBK 文本 `<script>` 直连，每 20 秒 |
| 成交额 / 涨跌 / 规模 / 份额（备用） | `push2.eastmoney.com`（东方财富） | CORS fetch 直连，腾讯失败时自动切换；无外盘/内盘 |
| 5 分钟 K 线（日内分布、20 日均额、近 30 日成交额） | `quotes.sina.cn`（新浪，JSONP） | 自带精确成交额 amount |
| 日 K（降级备用） | 新浪 / `web.ifzq.gtimg.cn`（腾讯，CORS） | 成交额=量×价估算 |

## 项目结构（分层）

```
src/
  config/pool.ts        监测池定义（24 只宽基 ETF + 汇金 2025 年报历史持仓标签）
  data/                 数据获取层
    jsonp.ts              script 注入 / JSONP / 并发池
    tencent.ts            腾讯实时快照解析（字段映射见 docs/SPEC.md）
    eastmoney.ts          东方财富备用行情（push2，CORS）
    sina.ts               新浪 5 分钟 K / 日 K
    store.ts              localStorage 缓存与份额历史积累
  domain/               指标计算层（纯函数，零 DOM，全部可测试）
    metrics.ts            同时点倍数、主动净买入、日内分布、加仓指数等
    session.ts            交易时段状态机
    format.ts             展示格式化
  hooks/useTracker.ts   编排层：轮询、增量基线计算、降级链、派生指标
  components/           展示层（结论卡 / KPI / 表格 / 卡片 / 图表 / 说明区）
docs/SPEC.md           功能清单、计算口径、接口字段、复刻对照清单
tests/                 Vitest 单元测试
```

## 扩展新指标

1. 在 `domain/metrics.ts` 增加纯函数并补测试；
2. 在 `hooks/useTracker.ts` 的 `rows`/`pool` 派生处接入；
3. 表格列在 `components/EtfTable.tsx` 增加一列（可排序列同步在 `domain/sort.ts` 注册 sortKey）。

## 份额历史导入 / 回填

每日场内份额没有公开的浏览器可访问数据源（交易所接口 CORS 封锁、iFinD/东财不覆盖场内 ETF 份额），因此两张份额图表默认从首次使用起逐日积累。要快速填满历史：

1. **导入 JSON**：图表卡「导入历史数据」按钮，接受 `{"byDate": {"YYYYMMDD": {"510300": 456.2, ...}}}` 格式（Wind / iFinD / tushare 导出后转换均可）；只填补缺失日期，不覆盖本地已积累数据；
2. **回填脚本**：`TUSHARE_TOKEN=xxx node scripts/backfill-shares.mjs [天数]`（tushare Pro `fund_share` 接口，需 token，字段映射未经实测请对照官方文档），产出 `public/data/shares-history.json`，应用启动时自动加载种子；
3. **导出**：「导出已积累数据」按钮随时备份。

## 已知局限（如实标注）

- **份额历史深度**：交易所不提供浏览器可直接访问的每日份额历史接口，份额序列自本工具首次使用起逐日积累（与参考站文档描述的机制一致；参考站部署侧另有一次未公开来源的历史回补）。
- **节假日**：依赖行情接口的日期字段兜底判断，不内置节假日表。
- **结论文案分级阈值**（二元判定：同时点倍数 ≥1.5 且主动净买入为正，或主动净买入 ≥50 亿 → 「汪汪队有上班」，否则「汪汪队没上班」）为复刻时的自定假设，核心指标公式均与参考站口径一致。

详见 [docs/SPEC.md](docs/SPEC.md)。仅供研究参考，不构成投资建议。
