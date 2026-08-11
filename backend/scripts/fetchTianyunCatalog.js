#!/usr/bin/env node
// fetchTianyunCatalog.js — 天韻合唱團版 album catalog 爬蟲,跟 fetchJoshuaCatalog.js
// 同一套方法論(session local_2c1c2b66 約書亞樂團嗰輪,命中率 5-25%→70.7%),
// 但資料源唔同:天韻官網(heavenlymelody.com.tw)係 SPA 冇靜態專輯頁,改用天韻
// 官方商城 shop.hms.org.tw(category_id=45「天韻專輯」,85 件商品、5 頁)——
// 每件商品(CD/數位下載/單曲)頁都有 `<table class="table table-hover download">`
// 逐首列 `編號/曲名/時間`,呢個先係事實資料源(track 級,唔係淨係專輯名)。
//
// 商城入面 85 件商品有merch/歌譜/伴唱CD/USB精選合輯/組合bundle等雜項,呢啲
// 唔係「原創專輯嘅曲目」會製造噪音或同原專輯撞名衝突,所以按標題關鍵字排除:
// 伴唱/歌譜/歌本/合購/組合/黑膠/唱機/USB/精選/珍藏/紙本/桌遊/妙妙書/故事機/旋律譜,
// 淨留低標題有「CD」「數位下載」或「單曲」字樣嘅先當「原創專輯/單曲」爬曲目。
//
// **唔碰 DB、唔攞歌詞**——淨係攞 track 編號+曲名+所屬專輯名。DB 寫入由
// backfillAlbumFromTianyunCatalog.js 負責。
//
// 禮貌爬法:每個商品頁之間 800ms+jitter delay,UA 表明身份。
//
// parse 到嘅專輯(單曲)數 < MIN_ALBUMS 或 track 總數 < MIN_TRACKS 就當 parse
// 失敗——網站改版/結構變咗就應該報錯,唔應該靜靜哋輸出一份殘缺 catalog。
//
// Usage:
//   node scripts/fetchTianyunCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIST_URL = (page) => `https://shop.hms.org.tw/category/index/45/albumall/${page}/1/0/0/0`;
const ITEM_URL = (id) => `https://shop.hms.org.tw/Item_id${id}.htm`;
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'tianyun-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';
const FETCH_TIMEOUT_MS = 30000;
const LIST_PAGES = 5; // 2026-08-11 實測:category 45「天韻專輯」共 85 件商品,20 件/頁,5 頁
const MIN_ALBUMS = 25;
const MIN_TRACKS = 150;

const EXCLUDE_KW = [
  '伴唱', '歌譜', '歌本', '合購', '組合', '黑膠', '唱機', 'USB',
  '精選', '珍藏', '紙本', '桌遊', '妙妙書', '故事機', '旋律譜',
];

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

function shouldInclude(title) {
  if (EXCLUDE_KW.some((kw) => title.includes(kw))) return false;
  return title.includes('CD') || title.includes('數位下載') || title.includes('單曲');
}

// 商品標題 -> 乾淨嘅專輯/單曲名。優先攞 〈...〉/《...》 入面嘅內容(單曲慣用
// 呢種寫法);否則取第一個括號(【/(/（)之前嘅部份,再剝走「敬拜系列單曲_」
// 「聖詩系列單曲_」呢類系列前綴。
function cleanAlbumName(rawTitle) {
  let s = rawTitle.trim();
  const bracketMatch = s.match(/[〈《]([^〉》]+)[〉》]/);
  if (bracketMatch) return bracketMatch[1].trim();
  const cuts = [s.indexOf('【'), s.indexOf('('), s.indexOf('（')].filter((i) => i > 0);
  if (cuts.length) s = s.slice(0, Math.min(...cuts)).trim();
  s = s.replace(/^(敬拜系列單曲_|聖詩系列單曲_)/, '');
  s = s.replace(/~/g, ' ').trim();
  return s;
}

function parseListPage(html) {
  const items = [];
  const re = /<h2><a href="\/Item_id(\d+)\.htm">([^<]+)<\/a><\/h2>/g;
  let m;
  while ((m = re.exec(html))) {
    items.push({ id: Number(m[1]), title: m[2].trim() });
  }
  return items;
}

function parseItemTracks(html) {
  const idx = html.indexOf('table-hover download');
  if (idx < 0) return [];
  const window = html.slice(idx, idx + 40000);
  const closeIdx = window.indexOf('</table>');
  const scoped = closeIdx > 0 ? window.slice(0, closeIdx) : window;
  const rows = [];
  const re = /<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]+?)\s*<\/td>/g;
  let m;
  while ((m = re.exec(scoped))) {
    const title = m[2].trim()
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (title) rows.push({ trackNo: Number(m[1]), title });
  }
  return rows;
}

const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

// 天韻曲目多數係單一語言(中文或英文),少數用 "/" 分隔中英(例如
// 「祢真偉大/主愛有多少」呢種其實係專輯名,唔係單曲——真正單曲曲目入面
// 少見 "/"，但保留同 Joshua 版一致嘅切法以防萬一)。
function splitTitle(title) {
  const parts = title.split(/\s*[\/／]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    return hasCJK(parts[0]) ? { title_zh: parts[0], title_en: null } : { title_zh: null, title_en: parts[0] };
  }
  let zh = null, en = null;
  for (const p of parts) {
    if (hasCJK(p)) { if (!zh) zh = p; }
    else if (!en) en = p;
  }
  if (!zh && !en) { zh = parts[0]; en = parts.slice(1).join(' / '); }
  return { title_zh: zh, title_en: en };
}

async function main() {
  log('攞商品清單頁(category 45「天韻專輯」)...');
  const allItems = [];
  for (let page = 1; page <= LIST_PAGES; page++) {
    const html = await fetchHtml(LIST_URL(page));
    const items = parseListPage(html);
    log(`第 ${page} 頁: ${items.length} 件商品`);
    allItems.push(...items);
    await sleep(600 + Math.random() * 300);
  }
  log(`總商品數: ${allItems.length}`);

  const included = allItems.filter((it) => shouldInclude(it.title));
  log(`過濾後(排除伴唱/歌譜/合購/精選等雜項): ${included.length} 件`);
  if (included.length < MIN_ALBUMS) {
    console.error(`可用商品數(${included.length}) < MIN_ALBUMS(${MIN_ALBUMS}),當網站結構變咗,收工唔寫檔`);
    process.exit(1);
  }

  const out = [];
  let albumOk = 0;
  for (const { id, title } of included) {
    const albumName = cleanAlbumName(title);
    process.stdout.write(`Item_id=${id} 「${albumName}」... `);
    try {
      const html = await fetchHtml(ITEM_URL(id));
      const tracks = parseItemTracks(html);
      if (tracks.length) albumOk++;
      console.log(`${tracks.length} 首`);
      for (const tr of tracks) {
        const { title_zh, title_en } = splitTitle(tr.title);
        out.push({ title_zh, title_en, album: albumName, year: null, track_no: tr.trackNo, album_id: id });
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`總專輯/單曲(有效): ${albumOk}/${included.length}, 總 track: ${out.length}`);
  if (out.length < MIN_TRACKS) {
    console.error(`track 總數(${out.length}) < MIN_TRACKS(${MIN_TRACKS}),當 parse 失敗,收工唔寫檔`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchTianyunCatalog 出錯:', e); process.exit(1); });
