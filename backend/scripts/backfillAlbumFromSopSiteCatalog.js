#!/usr/bin/env node
// backfillAlbumFromSopSiteCatalog.js —— 讚美之泉,食官網 sop.org/music/ catalog。
//
// 同 backfillAlbumFromCatalog.js(食 CCLI 版權表嗰個)嘅分別:CCLI 表只有
// 51 隻登記過版權嘅專輯,官網 /music/ 有 60 隻,多咗「安靜敬拜/靈修」系列、
// 國際版、日韓版、兒童 EP 等——而 org='讚美之泉' 殘餘冇 album 嘅歌好多正正
// 就係嗰啲系列。見 fetchSopSiteCatalog.js。
//
// ── 匹配規則(寧空莫錯,跟 Tianyun/Joshua 同一套 + CantonHymn 輪學到嘅教訓)──
//   · 候選歌名由標題抽:【】/[] 入面、` - `/`__` 之前、成句;再剝走
//     「官方歌詞版MV」「Official Lyric Video」呢類尾標。
//   · **唔用 substring**——2026-08-17 CantonHymn 輪證實 substring 會令
//     「一」撞中 514 首。要 normalize 後完全相等。
//   · 撞多隻專輯 → 用「最早發行 = 原碟」解(catalog 有 year);欠年份或者
//     平手 → 唔寫。
//   · DB 已有 album / album_source=manual|legacy → 唔覆寫。
//   · 寫入 album_source='website'。
//
// Usage:
//   node scripts/backfillAlbumFromSopSiteCatalog.js --dry
//   node scripts/backfillAlbumFromSopSiteCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'sop-site-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'sop-site-catalog-report.md');
const DRY = process.argv.includes('--dry');
const RESOLVE_EARLIEST = !process.argv.includes('--no-resolve-earliest');

const TARGET_ORGS = ['讚美之泉', '讚美之泉粵語', '讚美之泉兒童', '讚美之泉 Stream Of Praise Music Ministries'];

const stamp = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const toTraditional = Converter({ from: 'cn', to: 'tw' });
const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

function normalizeZh(raw) {
  let s = toTraditional(String(raw || '').trim());
  // 小羊/台語異體字統一(跟 Xiaoyang 輪教訓:一定要喺 toTraditional **之後**)
  s = s.replace(/[禰袮]/g, '祢');
  return s.replace(/[\s　（）()【】\[\]｜|、,，。.:：!！?？'"“”‘’~～\-—_·・\/]/g, '').toLowerCase();
}
const normalizeEn = (raw) => String(raw || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

// 尾標:唔係歌名嘅一部分
const SUFFIX_RE = /(官方)?(完整版|歌詞版?|中英版|無插電版|acoustic)?\s*(mv|m\/v|official\s*(lyric|music)?\s*video|lyric\s*video|music\s*video|live|現場版|試聽|預告|花絮)\s*$/i;
const stripSuffix = (s) => String(s || '').replace(SUFFIX_RE, '').replace(/[\s|｜/／-]+$/, '').trim();

// ⚠️ 2026-08-17:第一版 4 個候選入面有 1 個係錯——
// 「2019 讚美之泉敬拜讚美專輯 (23&24) 平安・I Believe [我相信] 宣傳短片」
// 個 matcher 由中括號抽咗「我相信」出嚟,再 map 去 2011 年嗰隻碟。但呢條
// row 本身係 **2019 兩隻碟嘅宣傳片**,唔係邊隻碟嘅曲目。所以宣傳/幕後/
// 訪談類 row 一律唔准 match(佢哋標題必然引用到歌名,係 false positive 溫床)。
const NON_SONG_RE = /(宣傳短片|宣傳片|預告|trailer|teaser|幕後|花絮|開箱|訪談|專訪|異象影片|ng\s*畫面|behind\s*the\s*scenes|epk)/i;

function extractCandidates(rawTitle) {
  const raw = String(rawTitle || '').trim();
  if (!raw) return [];
  const out = [];
  for (const m of raw.matchAll(/[【\[]([^】\]]+)[】\]]/g)) out.push(m[1]);
  const d = raw.indexOf('__'); if (d > 0) out.push(raw.slice(0, d));
  const dash = raw.indexOf(' - '); if (dash > 0) out.push(raw.slice(0, dash));
  for (const sep of ['｜', '|']) { const i = raw.indexOf(sep); if (i > 0) out.push(raw.slice(0, i)); }
  out.push(raw);
  // 「中文名 English Name」→ 分開兩個候選
  const extra = [];
  for (const c of out) {
    const s = stripSuffix(c);
    if (!s) continue;
    extra.push(s);
    const mm = s.match(/^([㐀-鿿豈-･][^\x00-\x7f]*?)\s+([A-Za-z][A-Za-z0-9'’,!?\s\.\-]{2,})$/);
    if (mm) { extra.push(mm[1].trim()); extra.push(mm[2].trim()); }
  }
  return [...new Set(extra)].filter(Boolean);
}

function writeReport(d) {
  const L = [];
  L.push('# backfillAlbumFromSopSiteCatalog 報告 —— 讚美之泉(官網 sop.org/music/ catalog)');
  L.push(''); L.push(`> 生成時間:${stamp()}${d.dry ? ' (--dry,冇寫 DB)' : ''}`); L.push('');
  L.push(`- catalog:${d.catalogCount} 首 / ${d.albumCount} 隻專輯`);
  L.push(`- 候選 row(org IN ${TARGET_ORGS.join('/')}):${d.rows.length}`);
  L.push(`- match 到單一專輯且已寫(或 --dry 模擬):${d.matched.length}`);
  L.push(`- 撞多隻專輯、靠「最早發行=原碟」解決咗:${d.resolvedEarliest.length}`);
  L.push(`- match 到但撞多隻專輯(解唔到,冇寫):${d.conflicts.length}`);
  L.push(`- match 到但 DB 已有 album(冇覆寫):${d.alreadyHasAlbum.length}`);
  L.push(`- match 到但 album_source=manual/legacy(受保護):${d.protectedRows.length}`);
  L.push(`- catalog 搵唔到:${d.notFound.length}`);
  L.push('');
  L.push('## 已寫(或 --dry 模擬)'); L.push('');
  L.push('| id | org | title | matched_on | album |'); L.push('|---|---|---|---|---|');
  for (const m of d.matched) L.push(`| ${m.row.id} | ${m.row.org} | ${String(m.row.title).slice(0, 70).replace(/\|/g, '\\|')} | ${m.matchedOn} | ${m.album} |`);
  L.push('');
  L.push('## DB 已有 album(冇覆寫,可核對 catalog 啱唔啱)'); L.push('');
  L.push('| id | title | DB album | catalog album |'); L.push('|---|---|---|---|');
  for (const m of d.alreadyHasAlbum.slice(0, 60)) L.push(`| ${m.row.id} | ${String(m.row.title).slice(0, 55).replace(/\|/g, '\\|')} | ${m.row.album} | ${m.album} |`);
  L.push('');
  L.push('## 撞多隻專輯解唔到(人手覆核)'); L.push('');
  L.push('| id | title | matched_on | 撞中專輯 |'); L.push('|---|---|---|---|');
  for (const c of d.conflicts) L.push(`| ${c.row.id} | ${String(c.row.title).slice(0, 55).replace(/\|/g, '\\|')} | ${c.matchedOn} | ${c.albums.join(' / ')} |`);
  L.push('');
  fs.writeFileSync(REPORT_PATH, L.join('\n'), 'utf8');
  log('報告已寫:', REPORT_PATH);
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const zhIndex = new Map(), enIndex = new Map(), albumYear = new Map();
  for (const t of catalog) {
    if (t.album && t.year != null && !albumYear.has(t.album)) {
      const y = Number(t.year); if (Number.isFinite(y)) albumYear.set(t.album, y);
    }
    const zk = normalizeZh(t.title_zh);
    if (zk && hasCJK(t.title_zh)) { if (!zhIndex.has(zk)) zhIndex.set(zk, new Set()); zhIndex.get(zk).add(t.album); }
    const ek = normalizeEn(t.title_zh);
    if (ek && !hasCJK(t.title_zh) && ek.length >= 4) { if (!enIndex.has(ek)) enIndex.set(ek, new Set()); enIndex.get(ek).add(t.album); }
  }
  log(`catalog:${catalog.length} 首 / ${new Set(catalog.map((c) => c.album)).size} 隻;中文 key ${zhIndex.size}、英文 key ${enIndex.size}`);

  const db = await openDb();
  const ph = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all
                          WHERE org IN (${ph}) AND curated = 1 AND status NOT IN ('dead','rejected')`, TARGET_ORGS);
  log(`候選 row:${rows.length}`);

  const matched = [], conflicts = [], alreadyHasAlbum = [], protectedRows = [], notFound = [], resolvedEarliest = [];
  const skippedNonSong = [];
  for (const row of rows) {
    if (NON_SONG_RE.test(String(row.display_title || row.title || ''))) { skippedNonSong.push(row); notFound.push(row); continue; }
    let hit = null, matchedOn = null;
    for (const cand of [...extractCandidates(row.display_title || ''), ...extractCandidates(row.title || '')]) {
      const h = hasCJK(cand) ? zhIndex.get(normalizeZh(cand)) : enIndex.get(normalizeEn(cand));
      if (h) { hit = h; matchedOn = cand; break; }
    }
    if (!hit) { notFound.push(row); continue; }

    let album;
    if (hit.size > 1) {
      const list = [...hit];
      const years = list.map((a) => albumYear.get(a));
      if (!RESOLVE_EARLIEST || years.some((y) => y == null)) { conflicts.push({ row, matchedOn, albums: list }); continue; }
      const min = Math.min(...years);
      const win = list.filter((a) => albumYear.get(a) === min);
      if (win.length !== 1) { conflicts.push({ row, matchedOn, albums: list }); continue; }
      album = win[0];
      resolvedEarliest.push({ row, album, matchedOn });
    } else album = [...hit][0];

    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, album, matchedOn }); continue; }
    if (row.album && String(row.album).trim()) { alreadyHasAlbum.push({ row, album, matchedOn }); continue; }
    matched.push({ row, album, matchedOn });
  }

  log(`宣傳/幕後/訪談類 row 直接跳過:${skippedNonSong.length}`);
  log(`可寫:${matched.length} / 靠最早發行解咗:${resolvedEarliest.length} / 解唔到衝突:${conflicts.length} / 已有album:${alreadyHasAlbum.length} / 受保護:${protectedRows.length} / 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromSopSiteCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source, org FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (!TARGET_ORGS.includes(fresh.org)) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && String(fresh.album).trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'website' WHERE id = ?", [album, row.id]);
        written++;
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${written} 首`);
    } finally { releaseDbLock(token); }
  } else if (DRY) log('--dry:未寫 DB');
  else log('冇可寫候選,冇碰 DB');

  writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, resolvedEarliest,
                catalogCount: catalog.length, albumCount: new Set(catalog.map((c) => c.album)).size, dry: DRY });
}

main().catch((e) => { console.error(e); process.exit(1); });
