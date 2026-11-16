/** 监测池定义 —— 与参考站同源的公开市场信息（代码/名称/跟踪指数/汇金 2025 年报前十大持有人持仓） */

export type Group = 'core' | 'watch';

export interface EtfDef {
  /** 6 位代码 */
  code: string;
  /** 带交易所前缀，如 sh510300 */
  tcode: string;
  name: string;
  index: string;
  group: Group;
  /** 汇金 2025 年报前十大持有人口径持仓（亿份）；扩展观察为 null */
  huijinYi: number | null;
}

export const POOL: EtfDef[] = [
  { code: '510300', tcode: 'sh510300', name: '沪深300ETF华泰柏瑞', index: '沪深300', group: 'core', huijinYi: 735.13 },
  { code: '510310', tcode: 'sh510310', name: '沪深300ETF易方达', index: '沪深300', group: 'core', huijinYi: 558.94 },
  { code: '510050', tcode: 'sh510050', name: '上证50ETF华夏', index: '上证50', group: 'core', huijinYi: 487.59 },
  { code: '510330', tcode: 'sh510330', name: '沪深300ETF华夏', index: '沪深300', group: 'core', huijinYi: 420.28 },
  { code: '159919', tcode: 'sz159919', name: '沪深300ETF嘉实', index: '沪深300', group: 'core', huijinYi: 354.98 },
  { code: '512100', tcode: 'sh512100', name: '中证1000ETF南方', index: '中证1000', group: 'core', huijinYi: 221.69 },
  { code: '588080', tcode: 'sh588080', name: '科创50ETF易方达', index: '科创50', group: 'core', huijinYi: 216.07 },
  { code: '159915', tcode: 'sz159915', name: '创业板ETF易方达', index: '创业板指', group: 'core', huijinYi: 170.2 },
  { code: '510500', tcode: 'sh510500', name: '中证500ETF南方', index: '中证500', group: 'core', huijinYi: 142.17 },
  { code: '159845', tcode: 'sz159845', name: '中证1000ETF华夏', index: '中证1000', group: 'core', huijinYi: 137.26 },
  { code: '560010', tcode: 'sh560010', name: '中证1000ETF广发', index: '中证1000', group: 'core', huijinYi: 105.5 },
  { code: '510180', tcode: 'sh510180', name: '上证180ETF华安', index: '上证180', group: 'core', huijinYi: 52.32 },
  { code: '159629', tcode: 'sz159629', name: '中证1000ETF富国', index: '中证1000', group: 'core', huijinYi: 36.34 },
  { code: '510230', tcode: 'sh510230', name: '金融ETF国泰', index: '上证180金融', group: 'core', huijinYi: 25.64 },
  { code: '159922', tcode: 'sz159922', name: '中证500ETF嘉实', index: '中证500', group: 'core', huijinYi: 23.11 },
  { code: '512500', tcode: 'sh512500', name: '中证500ETF华夏', index: '中证500', group: 'core', huijinYi: 20.51 },
  { code: '515800', tcode: 'sh515800', name: '中证800ETF汇添富', index: '中证800', group: 'core', huijinYi: 13.08 },
  { code: '159952', tcode: 'sz159952', name: '创业板ETF广发', index: '创业板指', group: 'core', huijinYi: 10.91 },
  { code: '588050', tcode: 'sh588050', name: '科创50ETF工银', index: '科创50', group: 'core', huijinYi: 9.7 },
  { code: '159901', tcode: 'sz159901', name: '深证100ETF易方达', index: '深证100', group: 'core', huijinYi: 7.19 },
  { code: '588000', tcode: 'sh588000', name: '科创50ETF华夏', index: '科创50', group: 'watch', huijinYi: null },
  { code: '512050', tcode: 'sh512050', name: 'A500ETF华夏', index: '中证A500', group: 'watch', huijinYi: null },
  { code: '159338', tcode: 'sz159338', name: '中证A500ETF国泰', index: '中证A500', group: 'watch', huijinYi: null },
  { code: '159339', tcode: 'sz159339', name: 'A500ETF银华', index: '中证A500', group: 'watch', huijinYi: null },
];

export const CORE_POOL = POOL.filter((e) => e.group === 'core');

export const GROUP_META: Record<Group, { label: string; badge: string; note: string }> = {
  core: {
    label: '重点监测',
    badge: '重点',
    note: '2025 年报中央汇金进入前十大持有人 · 最后一次实名披露（此后规则停止点名）',
  },
  watch: {
    label: '扩展观察',
    badge: '观察',
    note: '2025 年报未见汇金前十大持仓（名单已停止更新），仅作对照，不计入结论判断',
  },
};

/** 名单口径说明（静态历史标签，非当前持仓） */
export const LIST_BASIS =
  '汇金持仓依据 Wind 统计的 2025 年报「前十大持有人」口径（2026-03 披露），为最后一次公开实名披露；' +
  '2026-05-01 起新规删除上市基金列示前十名持有人的强制条款，此后公开渠道无法验证当前持仓。' +
  '本名单仅为「历史上买过」的静态标签，不代表当前持仓。';
