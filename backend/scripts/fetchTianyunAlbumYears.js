#!/usr/bin/env node
// fetchTianyunAlbumYears.js — 幫 tianyun-catalog.json 補返每隻專輯嘅發行年份。
//
// 點解要:tianyun-catalog.json 原本 year 全部 null,搞到
// backfillAlbumFromTianyunCatalog.js 遇到「同一首歌出現喺多隻專輯」
// (原碟 + 之後嘅精選/重編合輯)嘅時候淨係可以 flag conflict、唔敢寫,
// 62 首真歌就係咁卡住。有咗年份就可以用「最早發行嗰隻 = 原碟」呢條
// 規則去解 conflict。
//
// 資料源:shop.hms.org.tw 每隻碟嘅商品頁,內文有「YYYY年M月發行」字樣
// (例:野地的花 → 「1980年4月發行」)。頁尾 Copyright @ 2015 要排除。
//
// Usage: node scripts/fetchTianyunAlbumYears.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'tianyun-catalog.json');
const ITEM_URL = (id) => `https://shop.hms.org.tw/Item_id${id}.htm`;
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function fetchHtml(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
    } finally { clearTimeout(t); }
  }
}

function extractYear(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  // shop.hms.org.tw 唔止一種寫法:發行 / 出版 / 上市 / 推出 都見過。
  // 例:「1980年4月發行」(野地的花)、「2000年3月出版」(飛翔)。
  const VERBS = '發行|出版|上市|推出|問世';
  const m = t.match(new RegExp(`(19[5-9]\\d|20[0-2]\\d)\\s*年\\s*\\d{1,2}\\s*月\\s*(?:${VERBS})`));
  if (m) return Number(m[1]);
  const m2 = t.match(new RegExp(`(19[5-9]\\d|20[0-2]\\d)\\s*年\\s*(?:${VERBS})`));
  if (m2) return Number(m2[1]);
  return null;
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const albumIds = [...new Set(catalog.map((t) => t.album_id))].filter(Boolean);
  log(`專輯數:${albumIds.length}`);

  const years = {};
  let ok = 0, fail = 0;
  for (const id of albumIds) {
    try {
      const html = await fetchHtml(ITEM_URL(id));
      const y = extractYear(html);
      years[id] = y;
      if (y) ok++; else fail++;
      log(`id=${id} → ${y ?? '搵唔到'}`);
    } catch (e) {
      years[id] = null; fail++;
      log(`id=${id} → 失敗 ${e.message}`);
    }
    await sleep(600);
  }
  log(`攞到年份:${ok} / 搵唔到:${fail}`);

  let patched = 0;
  for (const t of catalog) {
    if (years[t.album_id] != null) { t.year = years[t.album_id]; patched++; }
  }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 1), 'utf8');
  log(`已回寫 tianyun-catalog.json,補咗 year 嘅 track:${patched}/${catalog.length}`);

  const byAlbum = {};
  for (const t of catalog) if (!byAlbum[t.album]) byAlbum[t.album] = t.year;
  Object.entries(byAlbum).sort((a, b) => (a[1] ?? 9999) - (b[1] ?? 9999))
    .forEach(([a, y]) => console.log(`  ${y ?? '????'}  ${a}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
