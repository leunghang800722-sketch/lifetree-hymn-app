#!/usr/bin/env node
// fetchSopSiteCatalog.js —— 讚美之泉「第二個資料源」:官網 sop.org/music/ 逐隻專輯頁。
//
// ── 點解要多一個源 ──────────────────────────────────────────────────
// 而家嘅 `sop-catalog.json` 係爬 `sop.org/copyright-ccli/`——嗰個係
// **CCLI 版權登記表**,只列有登記版權嘅歌。結果:
//   · 得 51 隻專輯,而官網 /music/ 實際有 **60 隻**
//   · 「安靜敬拜/靈修」系列(dev01-04)、國際版(in05-08)、日韓版(jpw/jcpw)、
//     兒童 EP(cpw14ep)呢啲**全部唔喺 CCLI 表入面**
//   · 而 org='讚美之泉' 冇 album 嘅殘餘好多正正就係呢啲系列
//
// 呢個 script 直接爬 /music/ 嘅專輯頁清單,再逐頁抽 `.track-title` 逐曲名。
// **唔碰 DB**,只出 `sop-site-catalog.json`;寫入由
// backfillAlbumFromSopSiteCatalog.js 負責。
//
// Usage: node scripts/fetchSopSiteCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_URL = 'https://sop.org/music/';
const OUT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'sop-site-catalog.json');
const UA = 'Mozilla/5.0 (compatible; HymnAppCatalogBot/1.0; +https://god-music.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function fetchHtml(url) {
  for (let i = 1; i <= 3; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: c.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1500 * i);
    } finally { clearTimeout(t); }
  }
}

const strip = (s) => s.replace(/<[^>]+>/g, '')
  // ⚠️ 要先解 numeric entity(&#8211; = en dash),唔係下面剝站名尾巴會失敗
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

function extractTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  // 「住在祢裡面 – 讚美之泉音樂事工」→ 剝走站名尾巴
  return strip(m[1]).replace(/\s*[–—-]\s*讚美之泉音樂事工\s*$/, '').trim() || null;
}

function extractTracks(html) {
  const out = [];
  // `.track-title hidden` 係播放器隱藏副本,會出雙份 → 只收唔帶 hidden 嗰啲
  for (const m of html.matchAll(/class="track-title"[^>]*>([\s\S]*?)<\//g)) {
    const t = strip(m[1]);
    if (t) out.push(t);
  }
  return out;
}

function extractYear(html) {
  const t = strip(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
  const m = t.match(/(?:發行|出版|推出)[^\d]{0,8}(19[89]\d|20[0-3]\d)/) || t.match(/(19[89]\d|20[0-3]\d)\s*年\s*(?:發行|出版|推出)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  log('攞專輯頁清單:', INDEX_URL);
  const idx = await fetchHtml(INDEX_URL);
  const urls = [...new Set([...idx.matchAll(/href="(https:\/\/sop\.org\/music\/[^"]+)"/g)].map((m) => m[1]))]
    .filter((u) => !/\/music\/?$/.test(u));
  log(`專輯頁:${urls.length}`);

  const catalog = [];
  let ok = 0, empty = 0;
  for (const u of urls) {
    try {
      const html = await fetchHtml(u);
      const album = extractTitle(html);
      const tracks = extractTracks(html);
      const year = extractYear(html);
      if (!album || !tracks.length) { empty++; log(`  ${u} → 冇曲目(album=${album})`); await sleep(500); continue; }
      tracks.forEach((t, i) => catalog.push({ title_zh: t, album, year, track_no: i + 1, source_url: u }));
      ok++;
      log(`  ${album} (${year ?? '????'}) → ${tracks.length} 首`);
    } catch (e) {
      empty++; log(`  ${u} → 失敗 ${e.message}`);
    }
    await sleep(600);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 1), 'utf8');
  const albums = new Set(catalog.map((c) => c.album));
  log(`成功 ${ok} 隻 / 冇料 ${empty} 隻;寫出 ${catalog.length} 首、${albums.size} 隻專輯 → ${OUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
