#!/usr/bin/env node
// fetchJoshuaCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md Phase B(約書亞樂團官網
// catalog)。joshua.com.tw/web/?menu=album&menu_id=27 有靜態專輯清單頁(59 隻
// 專輯,一 album_id 一頁),每隻專輯頁用 `<div class="title pull-left">N. 歌名</div>`
// 規律標記 track——一次過爬晒 59 個 album_id 頁,parse 出歌名+所屬專輯+年份,
// 寫 `backend/data/album-backfill/joshua-catalog.json`。**唔碰 DB、唔攞歌詞**
// (每首歌 track div 入面重有歌詞段落,呢度淨係攞 `.title` 嗰行嘅歌名文字)。
// DB 寫入由 backfillAlbumFromJoshuaCatalog.js 負責。
//
// 禮貌爬法:每個 album_id 頁之間 800ms+jitter delay,UA 表明身份。
//
// parse 到嘅專輯數 < 40 或 track 總數 < 400 就當 parse 失敗(2026-08-11 實測:
// 59 隻專輯、696 首 track)——網站改版/結構變咗就應該報錯,唔應該靜靜哋輸出
// 一份殘缺 catalog。
//
// Usage:
//   node scripts/fetchJoshuaCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIST_URL = 'https://www.joshua.com.tw/web/?menu=album&menu_id=27';
const ALBUM_URL = (id) => `https://www.joshua.com.tw/web/?menu=album&menu_id=27&album_id=${id}`;
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'joshua-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';
const FETCH_TIMEOUT_MS = 30000;
const MIN_ALBUMS = 40;
const MIN_TRACKS = 400;

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

// 順住 h4.list-title(年份)同 a[href*=album_id=] 出現次序行,將年份指派畀
// 之後嘅 album_id,直到下一個 h4 為止。
function parseAlbumIdsWithYear(html) {
  const out = [];
  const re = /<h4 class="list-title"><span>(\d{4})<\/span><\/h4>|album_id=(\d+)"/g;
  let year = null;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    if (m[1]) { year = Number(m[1]); continue; }
    const id = Number(m[2]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, year });
  }
  return out;
}

function parseAlbumPage(html, id) {
  const titleMatch = html.match(/<h2 class="album-title">([^<]*)<\/h2>/);
  const album = titleMatch ? titleMatch[1].trim() : null;
  const tracks = [];
  const trackRe = /<div class="title pull-left">\s*(\d+)\.\s*([^<]+?)\s*<\/div>/g;
  let m;
  while ((m = trackRe.exec(html))) {
    const trackNo = Number(m[1]);
    const title = m[2].trim().replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    tracks.push({ trackNo, title });
  }
  return { id, album, tracks };
}

const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

// track 歌名多數係「中文 / English」或「English / 中文」(用 "/" 或全形
// "／" 分隔);少數單一語言。用 CJK 偵測分派去 title_zh/title_en,唔靠位置。
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
  log('攞專輯清單頁...');
  const listHtml = await fetchHtml(LIST_URL);
  const idYears = parseAlbumIdsWithYear(listHtml);
  log(`搵到 ${idYears.length} 隻專輯 id`);
  if (idYears.length < MIN_ALBUMS) {
    console.error(`專輯數(${idYears.length})< MIN_ALBUMS(${MIN_ALBUMS}),當網站結構變咗,收工唔寫檔`);
    process.exit(1);
  }

  const out = [];
  let albumOk = 0;
  for (const { id, year } of idYears) {
    process.stdout.write(`album_id=${id} (year=${year})... `);
    try {
      const html = await fetchHtml(ALBUM_URL(id));
      const parsed = parseAlbumPage(html, id);
      if (parsed.album && parsed.tracks.length) albumOk++;
      console.log(`${parsed.album || '(無標題)'} — ${parsed.tracks.length} 首`);
      for (const tr of parsed.tracks) {
        const { title_zh, title_en } = splitTitle(tr.title);
        out.push({ title_zh, title_en, album: parsed.album, year, track_no: tr.trackNo, album_id: id });
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`總專輯(有效): ${albumOk}/${idYears.length}, 總 track: ${out.length}`);
  if (out.length < MIN_TRACKS) {
    console.error(`track 總數(${out.length})< MIN_TRACKS(${MIN_TRACKS}),當 parse 失敗,收工唔寫檔`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchJoshuaCatalog 出錯:', e); process.exit(1); });
