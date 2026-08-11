#!/usr/bin/env node
// fetchXiaoyangCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md 加碼(小羊詩歌官網
// catalog)。跟返約書亞樂團嗰輪做法(fetchJoshuaCatalog.js)嘅套路,但小羊
// 詩歌官網(w247.net,小羊詩歌靈修網)結構同約書亞唔同——冇「一 album 一
// 頁列 track」,而係 /songs/ 底下逐首歌一張卡,每張卡直接標明所屬專輯
// (連結去 /product/{slug}/),分 21 頁(每頁 12 首,尾頁 10 首,共 250 首
// 左右)。所以呢度直接爬 /songs/、/songs/2/ ... /songs/21/,逐張卡攞
// 「歌名 + 所屬專輯」,唔使再逐隻專輯開頁。
//
// 冇專輯嘅歌(未正式出版/譯自外語/單曲等)卡上冇 <!-- album title --> 嗰段
// 嘅 <a href="/product/...">,呢啲照樣記錄(album=null),backfill script
// 自然會 skip。
//
// 禮貌爬法:每頁之間 800ms+jitter delay,UA 表明身份。
//
// parse 到嘅頁數 < 15 或總 track 數 < 150 就當 parse 失敗(2026-08-11 實測:
// 21 頁、250 首)——網站改版/結構變咗就應該報錯,唔應該靜靜哋輸出一份
// 殘缺 catalog。
//
// Usage:
//   node scripts/fetchXiaoyangCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_URL = (n) => (n === 1 ? 'https://w247.net/songs/' : `https://w247.net/songs/${n}/`);
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'xiaoyang-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';
const FETCH_TIMEOUT_MS = 30000;
const MAX_PAGES = 40; // 安全上限,實測 21 頁
const MIN_PAGES = 15;
const MIN_TRACKS = 150;

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

const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// 逐張卡 parse:歌名(/songs/{slug}/)+ 所屬專輯(/product/{slug}/,可能冇)。
function parseSongsPage(html) {
  const cards = html.split('card-base rounded-[var(--radius-large)] overflow-hidden relative onload-animation');
  const out = [];
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const titleMatch = card.match(/<a href="(\/songs\/[^"]+)\/"[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<\/a>/);
    if (!titleMatch) continue;
    const slug = titleMatch[1].replace(/^\/songs\//, '');
    const title = decodeEntities(titleMatch[2]).trim();
    const albumMatch = card.match(/<a href="(\/product\/[^"]+)\/"[^>]*>\s*([^<]+?)\s*<\/a>/);
    const album = albumMatch ? decodeEntities(albumMatch[2]).trim() : null;
    const albumSlug = albumMatch ? albumMatch[1].replace(/^\/product\//, '') : null;
    out.push({ slug, title, album, albumSlug });
  }
  return out;
}

const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

function splitTitle(title) {
  // 小羊官網歌名多數係單一語言(中文或英文),少數帶「(中/英)」副題括號,
  // 呢度唔拆括號,交返 backfill script 個 normalize 步驟處理。
  return hasCJK(title) ? { title_zh: title, title_en: null } : { title_zh: null, title_en: title };
}

async function main() {
  const out = [];
  let pagesWithData = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = PAGE_URL(p);
    process.stdout.write(`page ${p}: ${url} ... `);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      console.log(`失敗: ${e.message}`);
      break;
    }
    const songs = parseSongsPage(html);
    console.log(`${songs.length} 首`);
    if (songs.length === 0) break;
    pagesWithData++;
    for (const s of songs) {
      const { title_zh, title_en } = splitTitle(s.title);
      out.push({ title_zh, title_en, album: s.album, album_slug: s.albumSlug, song_slug: s.slug });
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`總頁數(有資料): ${pagesWithData}, 總 track: ${out.length}`);
  if (pagesWithData < MIN_PAGES || out.length < MIN_TRACKS) {
    console.error(`頁數(${pagesWithData})< MIN_PAGES(${MIN_PAGES}) 或 track 總數(${out.length})< MIN_TRACKS(${MIN_TRACKS}),當 parse 失敗,收工唔寫檔`);
    process.exit(1);
  }

  const withAlbum = out.filter((o) => o.album).length;
  log(`有專輯資料嘅 track: ${withAlbum}/${out.length}`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchXiaoyangCatalog 出錯:', e); process.exit(1); });
