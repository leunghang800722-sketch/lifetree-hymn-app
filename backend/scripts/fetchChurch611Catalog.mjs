#!/usr/bin/env node
// fetchChurch611Catalog.mjs — 官網目錄對照表:抓 church611.org「611創作詩歌」分類頁
// 逐條 post,俾 Church 611 growLibrary 閘(lib/channelScan.js catalogAllowlist,
// 見 worshipGroups.js Church 611 entry)做官網目錄白名單用。
//
// 節流:1 req/s,正常 UA(同 fetchSopSiteCatalog.js 一樣嘅識別性 UA)。
// 唔碰 DB。輸出兩份 JSON 去 backend/data/album-backfill/(同現有 catalog JSON
// 一樣嘅目錄——sop-site-catalog.json/joshua-catalog.json 都喺呢度,唔開新
// backend/data/catalogs/ 目錄,跟「現有 catalog JSON 點處理就照跟」呢條指示)。
//
// Usage: node scripts/fetchChurch611Catalog.mjs(重抓最新目錄,例如官網出咗
// 新原創歌之後想更新 catalogAllowlist)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data', 'album-backfill');
const CATALOG_OUT = path.join(OUT_DIR, 'church611-org-catalog.json');
const LYRICS_OUT = path.join(OUT_DIR, 'church611-org-lyrics.json');

const BASE = 'https://church611.org/category/611%e5%89%b5%e4%bd%9c%e8%a9%a9%e6%ad%8c/';
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function fetchHtml(url) {
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: c.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1500 * i);
    } finally { clearTimeout(t); }
  }
}

const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// 去括號註記(例:「(2026普珥節Sc9)」),但輸出仍保留原文 title——呢個
// 淨係 matching 用嘅副本,唔覆寫顯示用嘅原文。
function stripAnnotation(raw) {
  return String(raw || '')
    .replace(/[（(][^）)]{0,20}[）)]\s*$/g, '') // 尾隨括號註記
    .replace(/\s*[!！]\s*$/g, '') // 尾隨感嘆號(Rejoice!)
    .trim();
}

function parseArchivePage(html) {
  const out = [];
  const articles = html.split('<article>').slice(1);
  for (const a of articles) {
    const titleM = a.match(/<h4><a href="([^"]+)">([^<]+)<\/a><\/h4>/);
    if (!titleM) continue;
    const url = titleM[1];
    const title = decodeEntities(titleM[2]).trim();
    const dateM = a.match(/fa-calendar"><\/i>([^<]+)<\/span>/);
    const langM = a.match(/fa-microphone"><\/i>([^<]+)<\/span>/);
    const ytM = a.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/);
    // excerpt 純文字(去晒 tag),連 credits(詞曲/發行)都喺入面。
    const excerptM = a.match(/<div class="post-excerpt">([\s\S]*?)<\/div><\/article>|<div class="post-excerpt">([\s\S]*?)$/);
    const excerptHtml = excerptM ? (excerptM[1] || excerptM[2] || '') : '';
    const excerpt = stripTags(excerptHtml);
    let dateIso = null;
    if (dateM) {
      const m = dateM[1].trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) dateIso = `${m[3]}-${m[2]}-${m[1]}`;
    }
    out.push({
      title,
      title_matchkey: stripAnnotation(title),
      url,
      date: dateIso,
      lang_tag: langM ? langM[1].trim() : null, // 普=國語 / 粵=粵語 / 英=英文(官網自家標籤)
      archive_youtube_id: ytM ? ytM[1] : null,
      excerpt,
    });
  }
  return out;
}

// 逐段擷取 elementor-text-editor 區塊(全曲歌詞通常喺呢種 div,一段一段
// <p>,中英對照版會有兩個區塊——用 hasCJK 分類)。同一頁仲有頁尾(地址/
// APP/copyright/核心價值橫額)都用緊同一 class,實測要用「Verse/Chorus/
// Bridge/Pre-chorus/主歌/副歌」呢啲結構標記做正控先揀啱歌詞區塊,唔係
// 淨係睇長度(見 post-newsong.html/post-woxin.html 樣本)。
function extractLyricBlocks(html) {
  const hasCJK = (s) => /[一-鿿㐀-䶿]/.test(s || '');
  const hasMarker = (s) => /\b(verse|chorus|bridge|pre-?chorus)\b/i.test(s || '') || /主歌|副歌/.test(s || '');
  const blocks = [];
  for (const m of html.matchAll(/class="elementor-text-editor elementor-clearfix">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)) {
    const raw = m[1];
    const text = stripTags(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n'));
    if (text.length < 20 || !hasMarker(text)) continue;
    blocks.push({ text, isCJK: hasCJK(text) });
  }
  return blocks;
}

async function main() {
  const pages = [];
  for (let p = 1; ; p++) {
    const url = p === 1 ? BASE : `${BASE}page/${p}/`;
    log(`攞第 ${p} 頁:`, url);
    const html = await fetchHtml(url);
    if (!html) { log(`  第 ${p} 頁 404,收工`); break; }
    pages.push(html);
    await sleep(1000);
  }
  log(`共 ${pages.length} 頁`);

  let catalog = [];
  for (const html of pages) catalog = catalog.concat(parseArchivePage(html));
  log(`archive 抽到 ${catalog.length} 條 post`);

  const lyricsOut = {};
  let withLyrics = 0, ytReconciled = 0;
  for (const entry of catalog) {
    log(`  post detail:`, entry.title, entry.url);
    const html = await fetchHtml(entry.url);
    if (html) {
      // iframe embed 係主要 youtube_id 來源(archive 有時冇 —— 見舊 post,
      // 2020-2023 批次無 archive_youtube_id 但 detail page iframe 有)。
      const iframeM = html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]+)/);
      if (iframeM) {
        if (!entry.archive_youtube_id) ytReconciled++;
        entry.youtube_id = iframeM[1];
      } else {
        entry.youtube_id = entry.archive_youtube_id || null;
      }
      const blocks = extractLyricBlocks(html);
      if (blocks.length) {
        withLyrics++;
        lyricsOut[entry.url] = {
          title: entry.title,
          lyrics_zh: blocks.filter((b) => b.isCJK).map((b) => b.text).join('\n\n---\n\n') || null,
          lyrics_en: blocks.filter((b) => !b.isCJK).map((b) => b.text).join('\n\n---\n\n') || null,
        };
      }
    } else {
      entry.youtube_id = entry.archive_youtube_id || null;
      entry.fetch_failed = true;
    }
    await sleep(1000);
  }

  fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog, null, 1), 'utf8');
  fs.writeFileSync(LYRICS_OUT, JSON.stringify(lyricsOut, null, 1), 'utf8');
  log(`寫出 catalog(${catalog.length} 首)→ ${CATALOG_OUT}`);
  log(`寫出 lyrics(${withLyrics} 首有歌詞區塊)→ ${LYRICS_OUT}`);
  log(`youtube_id 靠 detail page iframe 補返(archive 冇)嘅:${ytReconciled}`);
  const withYt = catalog.filter((c) => c.youtube_id).length;
  log(`有 youtube_id:${withYt}/${catalog.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
