#!/usr/bin/env node
// fetchXinxinCatalog.js — 新心音樂事工官網 catalog(nopCommerce 商店
// newheartmusic.org)。官網分 7 個專輯分類(國語/粵語/英語/聖誕/兒童/小組/
// 器樂),每分類 `?pagesize=20` 攞晒 product 清單(data-productid + 連結),
// 每隻 product 頁 full-description 入面有規律嘅 track table(track_no +
// 中文歌名<br>英文歌名),一次過爬晒寫 `data/album-backfill/xinxin-catalog.json`。
// **唔碰 DB、唔攞歌詞**(track table 淨係歌名,冇歌詞內容)。
// DB 寫入由 backfillAlbumFromXinxinCatalog.js 負責。
//
// 禮貌爬法:每個 product 頁之間 800ms+jitter delay,UA 表明身份。
//
// parse 到嘅專輯數 < 20 或 track 總數 < 100 就當 parse 失敗——網站改版/
// 結構變咗就應該報錯,唔應該靜靜哋輸出一份殘缺 catalog。
//
// Usage:
//   node scripts/fetchXinxinCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.newheartmusic.org';
const CATEGORIES = [
  '-mandarin-albums',
  '-cantonese-albums',
  '-english-albums',
  '-christmas-albums',
  '%E5%85%92%E7%AB%A5%E8%A9%A9%E6%AD%8C%E5%B0%88%E8%BC%AF-children-albums',
  '-small-group-albums',
  '-instrumental-albums',
];
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'xinxin-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';
const FETCH_TIMEOUT_MS = 30000;
const MIN_ALBUMS = 20;
const MIN_TRACKS = 100;

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

// 分類清單頁:`product-item data-productid=594 ... product-title><a href=/-xxx-album>`
function parseCategoryList(html) {
  const items = [];
  const re = /product-item data-productid=(\d+).*?product-title><a href=([^ >]+)>/gs;
  let m;
  while ((m = re.exec(html))) {
    items.push({ productId: Number(m[1]), url: m[2] });
  }
  return items;
}

// product 頁:<h1 itemprop=name>專輯中文名 (專輯) English Name (Album)</h1>
// full-description 入面嘅 track table:<td>track_no<td align=left>中文<br> 英文<td...
function parseProductPage(html) {
  const nameMatch = html.match(/<h1 itemprop=name>([^<]*)<\/h1>/);
  const rawAlbumName = nameMatch ? decodeEntities(nameMatch[1]).trim() : null;

  const descIdx = html.indexOf('full-description');
  const desc = descIdx >= 0 ? html.slice(descIdx) : html;
  const tracks = [];
  // <td>N<td align=left>中文歌名<br> 英文歌名<td align=center>time...
  const trackRe = /<td>(\d{1,3})<td align=left>([^<]*(?:<br>[^<]*)?)<td align=center>\d/g;
  let m;
  while ((m = trackRe.exec(desc))) {
    const trackNo = Number(m[1]);
    const raw = m[2];
    const parts = raw.split(/<br>\s*/).map((p) => decodeEntities(p).trim()).filter(Boolean);
    let zh = null, en = null;
    for (const p of parts) {
      if (/[㐀-鿿豈-﫿]/.test(p)) { if (!zh) zh = p; }
      else if (!en) en = p;
    }
    if (!zh && !en) continue;
    tracks.push({ trackNo, zh, en });
  }
  return { rawAlbumName, tracks };
}

// 專輯名格式通常係「中文名 (專輯) English Name (Album)」——攞去括號嘅
// 「(專輯)」「(Album)」標記,留低中英文名。
function cleanAlbumName(raw) {
  if (!raw) return { zh: null, en: null };
  let s = raw.replace(/\(專輯\)/g, '').replace(/\(Album\)/gi, '').trim();
  const parts = s.split(/\s{2,}|(?<=[)一-鿿])\s+(?=[A-Za-z])/).map((p) => p.trim()).filter(Boolean);
  // 保守做法:第一段有中文就係 zh,之後嘅係 en
  let zh = null, en = null;
  for (const p of parts) {
    if (/[㐀-鿿豈-﫿]/.test(p)) { if (!zh) zh = p; else en = en ? `${en} ${p}` : p; }
    else { en = en ? `${en} ${p}` : p; }
  }
  if (!zh && !en) zh = s;
  return { zh, en };
}

async function main() {
  const productMap = new Map(); // productId -> url (dedupe across categories)
  for (const cat of CATEGORIES) {
    const url = `${BASE}/${cat}?pagesize=20`;
    process.stdout.write(`分類 ${cat} ... `);
    try {
      const html = await fetchHtml(url);
      const items = parseCategoryList(html);
      console.log(`${items.length} 隻專輯`);
      for (const it of items) {
        if (!productMap.has(it.productId)) productMap.set(it.productId, it.url);
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`合共 distinct 專輯(跨分類去重):${productMap.size}`);
  if (productMap.size < MIN_ALBUMS) {
    console.error(`專輯數(${productMap.size})< MIN_ALBUMS(${MIN_ALBUMS}),當網站結構變咗,收工唔寫檔`);
    process.exit(1);
  }

  const out = [];
  let albumOk = 0;
  for (const [productId, relUrl] of productMap) {
    const fullUrl = `${BASE}${relUrl}`;
    process.stdout.write(`product ${productId} ${relUrl} ... `);
    try {
      const html = await fetchHtml(fullUrl);
      const { rawAlbumName, tracks } = parseProductPage(html);
      const { zh, en } = cleanAlbumName(rawAlbumName);
      const albumLabel = zh || en || rawAlbumName;
      if (albumLabel && tracks.length) albumOk++;
      console.log(`${albumLabel || '(無標題)'} — ${tracks.length} 首`);
      for (const tr of tracks) {
        out.push({
          title_zh: tr.zh,
          title_en: tr.en,
          album: albumLabel,
          album_en: en && en !== albumLabel ? en : null,
          year: null,
          track_no: tr.trackNo,
          album_id: productId,
        });
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`總專輯(有效): ${albumOk}/${productMap.size}, 總 track: ${out.length}`);
  if (out.length < MIN_TRACKS) {
    console.error(`track 總數(${out.length})< MIN_TRACKS(${MIN_TRACKS}),當 parse 失敗,收工唔寫檔`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchXinxinCatalog 出錯:', e); process.exit(1); });
