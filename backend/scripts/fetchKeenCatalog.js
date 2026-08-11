#!/usr/bin/env node
// fetchKeenCatalog.js — 跟 ALBUM-BACKFILL-ACCEL-PLAN.md Phase B 約書亞樂團嗰套
// 做法,呢個係「基恩敬拜 Amazing Grace Worship(AGWMM)」版。agwmm.org 官網用
// WooCommerce,冇好似 joshua.com.tw 咁靜態嘅專輯清單頁,但 product-sitemap.xml
// 入面有 ~48 個 `/product/album-*/` 專輯商品頁,每頁用 accordion
// `<span>N. 歌名 English Title</span>` 列晒 track(仲有 demo mp3、部分歌詞,
// 呢度**淨係攞 span 嗰行嘅歌名文字,唔攞歌詞**)。DB 寫入由
// backfillAlbumFromKeenCatalog.js 負責,呢個 script 淨係爬網、寫 JSON。
//
// 禮貌爬法:每個專輯頁之間 800ms+jitter delay,UA 表明身份(agwmm.org
// robots.txt 冧全開放)。
//
// parse 到嘅專輯數 < 25 或 track 總數 < 250 就當 parse 失敗——網站結構變咗
// 就應該報錯,唔應該靜靜哋輸出一份殘缺 catalog。
//
// Usage:
//   node scripts/fetchKeenCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITEMAP_URL = 'https://agwmm.org/product-sitemap.xml';
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'keen-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';
const FETCH_TIMEOUT_MS = 30000;
const MIN_ALBUMS = 25;
const MIN_TRACKS = 250;

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
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

function parseAlbumUrls(sitemapXml) {
  const out = [];
  const re = /<loc>(https:\/\/agwmm\.org\/product\/album-[^<]+)<\/loc>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(sitemapXml))) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

// track 歌名格式係「中文 English」(空格分隔,冇 "/" ),少數用 "/" 分隔
// 中英(medley)。先試 "/" 切,冇先用「最後一個中文字之後嗰個空格」做分界。
function splitTitle(rawTitle) {
  let title = (rawTitle || '').trim();
  // 剝走尾隨嘅 (LIVE)/(Live)/（Live） 標記,唔當佢係英文歌名
  title = title.replace(/[(（]\s*live\s*[)）]\s*$/i, '').trim();
  if (!title) return { title_zh: null, title_en: null };

  const slashParts = title.split(/\s*[\/／]\s*/).map((p) => p.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    let zh = null, en = null;
    for (const p of slashParts) {
      if (hasCJK(p)) { if (!zh) zh = p; }
      else if (!en) en = p;
    }
    if (!zh && !en) { zh = slashParts[0]; en = slashParts.slice(1).join(' / '); }
    return { title_zh: zh, title_en: en };
  }

  let lastCjkIdx = -1;
  for (let i = 0; i < title.length; i++) {
    if (hasCJK(title[i])) lastCjkIdx = i;
  }
  if (lastCjkIdx === -1) return { title_zh: null, title_en: title };
  const rest = title.slice(lastCjkIdx + 1).trim();
  if (rest && /^[\x00-\x7F]+$/.test(rest)) {
    return { title_zh: title.slice(0, lastCjkIdx + 1).trim(), title_en: rest };
  }
  return { title_zh: title, title_en: null };
}

function parseAlbumPage(html, url) {
  const titleMatch = html.match(/property="og:title"\s+content="([^"]*)"/);
  let album = titleMatch ? titleMatch[1] : null;
  if (album) {
    album = album.replace(/\s*\|\s*AGWMM\s*$/i, '').replace(/《|》/g, '').trim();
  }

  const skuMatch = html.match(/<span class="sku">([^<]*)<\/span>/);
  const albumId = skuMatch ? skuMatch[1].trim() : url;

  const yearMatch = html.match(/出版日期[^0-9]{0,20}(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const tracks = [];
  const trackRe = /<span>(\d+)\.\s*([^<]+?)\s*<\/span>/g;
  let m;
  while ((m = trackRe.exec(html))) {
    const trackNo = Number(m[1]);
    const title = m[2].trim()
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#8217;/g, "'");
    tracks.push({ trackNo, title });
  }
  return { album, albumId, year, tracks };
}

async function main() {
  log('攞 product-sitemap.xml...');
  const sitemapXml = await fetchText(SITEMAP_URL);
  const albumUrls = parseAlbumUrls(sitemapXml);
  log(`搵到 ${albumUrls.length} 個專輯商品頁`);
  if (albumUrls.length < MIN_ALBUMS) {
    console.error(`專輯數(${albumUrls.length})< MIN_ALBUMS(${MIN_ALBUMS}),當網站結構變咗,收工唔寫檔`);
    process.exit(1);
  }

  const out = [];
  let albumOk = 0;
  for (const url of albumUrls) {
    process.stdout.write(`${url} ... `);
    try {
      const html = await fetchText(url);
      const parsed = parseAlbumPage(html, url);
      if (parsed.album && parsed.tracks.length) albumOk++;
      console.log(`${parsed.album || '(無標題)'} — ${parsed.tracks.length} 首`);
      for (const tr of parsed.tracks) {
        const { title_zh, title_en } = splitTitle(tr.title);
        if (!title_zh && !title_en) continue;
        out.push({ title_zh, title_en, album: parsed.album, year: parsed.year, track_no: tr.trackNo, album_id: parsed.albumId });
      }
    } catch (e) {
      console.log(`失敗: ${e.message}`);
    }
    await sleep(800 + Math.random() * 400);
  }

  log(`總專輯(有效): ${albumOk}/${albumUrls.length}, 總 track: ${out.length}`);
  if (out.length < MIN_TRACKS) {
    console.error(`track 總數(${out.length})< MIN_TRACKS(${MIN_TRACKS}),當 parse 失敗,收工唔寫檔`);
    process.exit(1);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  log(`已寫: ${OUT_PATH}`);
}

main().catch((e) => { console.error('fetchKeenCatalog 出錯:', e); process.exit(1); });
