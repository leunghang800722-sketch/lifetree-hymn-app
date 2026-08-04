#!/usr/bin/env node
// fetchSopCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md Commit 3 / Phase B(讚美之泉
// sop.org catalog)。sop.org/copyright-ccli/ 有一份靜態 HTML 表格(TablePress
// 插件生成,唔使 JS 渲染):中文曲名/英文曲名/專輯名稱/專輯系列/作詞/作曲/
// CCLI#/Copyright Year——一次過 fetch 就攞晒成個 catalog(§2 選項B 實測
// 確認)。呢個 script 淨係做一件事:fetch → parse → 寫
// `backend/data/album-backfill/sop-catalog.json`。**唔碰 DB**,DB 寫入由
// backfillAlbumFromCatalog.js 負責。
//
// 禮貌爬法:一次 fetch,唔 loop、唔逐頁爬(TablePress 呢個表本身就係一頁
// 全部 707 行,冇分頁 API 要打)。表明身份嘅 UA。
//
// parse 到嘅行數 < 300 就當 parse 失敗——sop.org 呢份 catalog 應該有幾百首
// (實測 2026-08-04:707 行),行數太少多數係網站改咗版/表格結構變咗,唔應該
// 靜靜哋輸出一份殘缺 catalog。
//
// Usage:
//   node scripts/fetchSopCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOP_URL = 'https://sop.org/copyright-ccli/';
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'sop-catalog.json');
const MIN_ROWS = 300; // sop.org catalog 應該有幾百首,少過呢個當 parse 失敗

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// TablePress 表格用 HTML entity 包一啲字符(主要 &amp;),做個輕量 decode——
// 呢份 catalog 冇用到需要重型 HTML parser 嘅複雜結構(表格本身好規律),
// 跟返呢個 repo 其他 script 慣例(yt-dlp/描述 regex parse),唔加新 dependency。
function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(html) {
  return decodeEntities((html || '').replace(/<[^>]*>/g, '')).trim();
}

// 表格結構(2026-08-04 實測):<table id="tablepress-102">…<tbody>…
// <tr><td class="column-1">中文曲名</td><td class="column-2">英文曲名</td>
// <td class="column-3">專輯名稱</td><td class="column-4">專輯系列</td>
// <td class="column-5">作詞</td><td class="column-6">作曲</td>
// <td class="column-7">CCLI#</td><td class="column-8">Copyright Year</td></tr>
// Copyright Year 欄格式係「YYYY 版權方」或者「Public Domain」,呢度淨抽開頭
// 4 位數字做 year,抽唔到就留 null(唔估)。
function parseCatalogHtml(html) {
  const tableStart = html.indexOf('<table id="tablepress-102"');
  if (tableStart === -1) throw new Error('搵唔到 <table id="tablepress-102">,網站結構可能變咗');
  const tableEnd = html.indexOf('</table>', tableStart);
  const table = html.slice(tableStart, tableEnd === -1 ? undefined : tableEnd + '</table>'.length);

  const tbodyStart = table.indexOf('<tbody');
  const tbody = tbodyStart === -1 ? table : table.slice(tbodyStart);

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const entries = [];
  let rowMatch;
  while ((rowMatch = rowRe.exec(tbody)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) cells.push(stripTags(cellMatch[1]));
    if (cells.length < 8) continue; // 表頭/格式唔合嘅行(理論上唔應該有,保守略過)

    const [titleZh, titleEn, album, series, lyricist, composer, ccli, copyrightYearRaw] = cells;
    if (!titleZh) continue;
    const yearMatch = (copyrightYearRaw || '').match(/^(\d{4})/);
    entries.push({
      title_zh: titleZh,
      title_en: titleEn || '',
      album: album || '',
      series: series || '',
      lyricist: lyricist || '',
      composer: composer || '',
      ccli: ccli || '',
      year: yearMatch ? Number(yearMatch[1]) : null,
    });
  }
  return entries;
}

async function main() {
  log(`fetch:${SOP_URL}`);
  const res = await fetch(SOP_URL, {
    headers: { 'User-Agent': 'hymn-app-album-backfill/1.0 (ALBUM-BACKFILL-ACCEL-PLAN.md; low-frequency one-off fetch)' },
  });
  if (!res.ok) {
    console.error(`fetch 失敗:HTTP ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  log(`攞到 HTML,${html.length} 字符`);

  let entries;
  try {
    entries = parseCatalogHtml(html);
  } catch (e) {
    console.error(`parse 失敗:${e?.message || e}`);
    process.exit(1);
  }
  log(`parse 到 ${entries.length} 行`);

  if (entries.length < MIN_ROWS) {
    console.error(`⚠ parse 到嘅行數(${entries.length})少過門檻(${MIN_ROWS}),當 parse 失敗——sop.org 網站結構可能變咗,唔輸出殘缺 catalog`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2), 'utf8');
  log(`catalog 已寫:${OUT_PATH}(${entries.length} 首)`);

  const albumCount = new Set(entries.map((e) => e.album).filter(Boolean)).size;
  log(`統計:distinct album 數 ${albumCount}`);
}

main().catch((e) => { console.error('fetchSopCatalog 出錯:', e); process.exit(1); });
