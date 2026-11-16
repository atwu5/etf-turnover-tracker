#!/usr/bin/env node
/**
 * 份额历史回填脚本（可选工具）。
 *
 * 背景：每日场内份额没有公开的浏览器可访问数据源（交易所接口 CORS 封锁），
 * 本工具通过 tushare Pro 的 `fund_share` 接口（每日基金份额）拉取历史，
 * 生成 `public/data/shares-history.json`，应用启动时会自动加载种子并合并
 * （只填补本地缺失日期，不覆盖本地已积累数据）。
 *
 * 前置条件：
 *   1. tushare Pro 账号与 token（https://tushare.pro 注册），fund_share 接口
 *      需要一定积分权限，请以 tushare 官方文档为准；
 *   2. Node.js 18+（原生 fetch）。
 *
 * 用法：
 *   TUSHARE_TOKEN=你的token node scripts/backfill-shares.mjs [天数=190]
 *
 * 产出：public/data/shares-history.json
 *   { generatedAt, source, byDate: { "YYYYMMDD": { "510300": 456.23, ... } } }
 *   份额单位：亿份（接口返回万份，已换算）。
 *
 * 注意：本脚本与接口字段映射未经本环境实测（需要有效 token），如接口返回
 * 字段有出入，请按 tushare 文档调整 FIELDS 与解析逻辑。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.TUSHARE_TOKEN;
if (!TOKEN) {
  console.error('缺少 TUSHARE_TOKEN 环境变量。用法: TUSHARE_TOKEN=xxx node scripts/backfill-shares.mjs [天数]');
  process.exit(1);
}

const DAYS = Number(process.argv[2] ?? 190);

/** 与 src/config/pool.ts 保持一致的监测池（ts_code → 展示代码） */
const POOL = [
  ['510300.SH', '510300'], ['510310.SH', '510310'], ['510050.SH', '510050'], ['510330.SH', '510330'],
  ['159919.SZ', '159919'], ['512100.SH', '512100'], ['588080.SH', '588080'], ['159915.SZ', '159915'],
  ['510500.SH', '510500'], ['159845.SZ', '159845'], ['560010.SH', '560010'], ['510180.SH', '510180'],
  ['159629.SZ', '159629'], ['510230.SH', '510230'], ['159922.SZ', '159922'], ['512500.SH', '512500'],
  ['515800.SH', '515800'], ['159952.SZ', '159952'], ['588050.SH', '588050'], ['159901.SZ', '159901'],
  ['588000.SH', '588000'], ['512050.SH', '512050'], ['159338.SZ', '159338'], ['159339.SZ', '159339'],
];

const today = new Date();
const start = new Date(today.getTime() - DAYS * 864e5);
const fmt = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

async function fetchShare(tsCode, startDate, endDate, attempt = 1) {
  const resp = await fetch('https://api.tushare.pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_name: 'fund_share',
      token: TOKEN,
      params: { ts_code: tsCode, start_date: startDate, end_date: endDate },
      fields: 'ts_code,trade_date,fd_amount',
    }),
  });
  const j = await resp.json();
  if (j.code !== 0) {
    // 简单限速重试（tushare 每分钟调用有上限）
    if (j.code === 2002 && attempt <= 3) {
      await new Promise((r) => setTimeout(r, 15_000));
      return fetchShare(tsCode, startDate, endDate, attempt + 1);
    }
    throw new Error(`tushare ${tsCode}: code=${j.code} msg=${j.msg}`);
  }
  const { fields, items } = j.data;
  const iDate = fields.indexOf('trade_date');
  const iShare = fields.indexOf('fd_amount');
  const out = {};
  for (const row of items) {
    // fd_amount 单位万份 → 亿份
    const v = Number(row[iShare]);
    if (Number.isFinite(v) && v > 0) out[row[iDate]] = v / 10_000;
  }
  return out;
}

const byDate = {};
let done = 0;
for (const [tsCode, code] of POOL) {
  const shares = await fetchShare(tsCode, fmt(start), fmt(today));
  for (const [d, v] of Object.entries(shares)) {
    (byDate[d] ??= {});
    byDate[d][code] = v;
  }
  done++;
  const dates = Object.keys(shares).length;
  console.log(`[${done}/${POOL.length}] ${tsCode}: ${dates} 个交易日`);
  await new Promise((r) => setTimeout(r, 300)); // 限速
}

const dates = Object.keys(byDate).sort();
const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/shares-history.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'tushare Pro fund_share（每日基金份额，万份→亿份）',
  byDate,
}, null, 1));

console.log(`完成：${dates.length} 个交易日 × ${POOL.length} 只，已写入 ${outPath}`);
console.log('重新 npm run build 后，应用启动时会自动加载该种子并与本地积累合并。');
