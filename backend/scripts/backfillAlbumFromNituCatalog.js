#!/usr/bin/env node
// backfillAlbumFromNituCatalog.js — 泥土音樂(盛曉玫/Clay Music)版,跟返約書亞/天韻
// 嗰個做法。食 `data/album-backfill/nitu-catalog.json`(scrape 自官網
// claymusic.org/albums 逐張專輯 track listing:10 張正式創作專輯 + 2 張
// 「泥娃娃」兒童版),對 org='泥土音樂' 冇 album 嘅 row 做歌名 match。
//
// ── DB 標題嘅特殊之處(同約書亞唔同,呢度冇【】括號規律)────────────────
//   泥土音樂 DB 嘅 title/display_title 格式好雜,常見有:
//     ·「中文歌名 English Title」(空格分隔,冇斜線)
//     ·「中文歌名/English Title, 盛曉玫 /Amy Sand, 專輯 N：專輯名」(逗號分隔多段)
//     ·「中文歌名 (English Title) / 泥娃娃 (Clay Music for kids)」(兒童版標記)
//   所以呢度**唔用【】攞候選**,而係:①逗號前嘅段落做主候選(去到「,盛曉玫」
//   嗰段前);②偵測「/泥娃娃」或「Clay Music for kids」標記,剝走嗰段尾巴,
//   剩低嘅先再用同約書亞一樣嘅 "/" 中英切分 + normalizeZh(佢自己會剝走
//   括號同尾隨純英文)。
//
// ── 兒童版隔離(避免同正式專輯撞名)────────────────────────────────────
//   「泥娃娃」兩張兒童專輯有唔少 track 同正式專輯同名(例如「活出愛」喺
//   幸福專輯同泥娃娃#1都有)。若混做一個 index,呢啲同名歌會變成「撞多隻
//   專輯」而唔寫,浪費咗本來清晰嘅信號。所以分開兩個 index:DB row 嘅原始
//   標題有冇「泥娃娃/Clay Music for kids」標記,決定佢淨係查 kidsIndex
//   定係淨係查 mainIndex,兩個 index 之間唔會互相撞。
//
// ── 匹配規則(寧空莫錯,跟 backfillAlbumFromJoshuaCatalog.js 同一套)────
//   · normalize 後嘅候選歌名(中文或英文)撞唔到 catalog(對應 index)→ 唔寫
//   · 撞到但對應多過一隻唔同專輯 → 唔寫,flag 落 report 人手覆核
//   · 撞到得一隻專輯,而且 DB 呢個 row album 本身空、album_source 唔係
//     manual/legacy → 寫 `album=<catalog 專輯名>, album_source='website'`
//
// Usage:
//   node scripts/backfillAlbumFromNituCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromNituCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'nitu-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'nitu-catalog-report.md');
const DRY = process.argv.includes('--dry');

const TARGET_ORGS = ['泥土音樂'];

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const toTraditional = Converter({ from: 'cn', to: 'tw' });
const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

function fullwidthToHalfwidth(s) {
  return (s || '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

function normalizeZh(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = toTraditional(s);
  s = fullwidthToHalfwidth(s);
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '');
  const m = s.match(/^([^\x00-\x7F][\s\S]*?)\s+[\x00-\x7F]+$/);
  if (m && m[1].trim()) s = m[1].trim();
  s = s.replace(/\s+/g, '');
  return s;
}

function normalizeEn(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = fullwidthToHalfwidth(s);
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return s;
}

const KIDS_MARKER_RE = /泥娃娃|Clay Music for kids/i;
// 好多 DB 標題用「TITLE_ZH TITLE_EN 盛曉玫 Amy Sand 專輯 N：ALBUM」呢種格式
// (冇逗號分隔),呢個 marker 用嚟搵到「歌名本身」同「盛曉玫/Amy Sand/專輯 一堆
// 宣傳/分類文字」嘅分界。
const TRAILING_MARKER_RE = /(盛曉玫|Amy Sand|專輯)/;

// 由原始 YouTube 片名攞出「候選歌名」段落:
//   1) 剝走「盛曉玫詩歌 」「泥土音樂 」呢類固定前綴
//   2) 喺「盛曉玫/Amy Sand/專輯」呢類 marker 前面切一刀(冚唔切晒逗號個案)
//   3) 若偵測到「泥娃娃/Clay Music for kids」標記,剝走嗰段尾巴
//   4) 保留埋原句做 fallback 候選(以防切錯咗)
function extractCandidates(rawTitle) {
  const raw = (rawTitle || '').trim();
  if (!raw) return [];
  const s = raw.replace(/^盛曉玫詩歌\s*/, '').replace(/^泥土音樂\s*/, '');

  const markerMatch = s.match(TRAILING_MARKER_RE);
  let cut = markerMatch && markerMatch.index > 0 ? s.slice(0, markerMatch.index) : s;
  cut = cut.replace(/\s*\/\s*泥娃娃.*$/i, '').replace(/\s*\(Clay Music for kids\).*$/i, '');
  cut = cut.replace(/[,，\/／\s]+$/, '').trim();

  const candidates = [];
  if (cut) candidates.push(cut);
  const sTrim = s.trim();
  if (sTrim && sTrim !== cut) candidates.push(sTrim);
  return candidates;
}

// 候選段落攞出可以試嘅 {zh, en} 配對:
//   · 有 "/" 或 "／" → 第一截做中文候選,第二截做英文候選(約書亞版做法)
//   · 冇斜線但「前CJK 後純英文」(例如 "腳步 Footsteps") → 分別拆做純中文
//     候選同純英文候選,兩個都試(唔好淨係靠 normalizeZh 嘅尾隨英文剝離,
//     因為官網/DB 中文用字唔一定一致,英文往往仲啱)
//   · 淨返嘅就成句做中文候選(有 CJK)或英文候選(冇 CJK)
function toMatchPairs(candidate) {
  const c = (candidate || '').trim();
  if (!c) return [];
  const slashParts = c.split(/[\/／]/).map((p) => p.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    return [
      { zh: slashParts[0], en: '' },
      { zh: '', en: slashParts[1] },
    ];
  }
  const m = c.match(/^([^\x00-\x7F][\s\S]*?)\s+([\x00-\x7F][\x00-\x7F\s]*)$/);
  if (m) {
    return [
      { zh: m[1].trim(), en: '' },
      { zh: '', en: m[2].trim() },
    ];
  }
  return hasCJK(c) ? [{ zh: c, en: '' }] : [{ zh: '', en: c }];
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildIndex(entries) {
  const zhIndex = new Map();
  const enIndex = new Map();
  for (const entry of entries) {
    if (!entry.album) continue;
    if (entry.title_zh) {
      const key = normalizeZh(entry.title_zh);
      if (key) {
        if (!zhIndex.has(key)) zhIndex.set(key, new Set());
        zhIndex.get(key).add(entry.album);
      }
    }
    if (entry.title_en) {
      const key = normalizeEn(entry.title_en);
      if (key) {
        if (!enIndex.has(key)) enIndex.set(key, new Set());
        enIndex.get(key).add(entry.album);
      }
    }
  }
  return { zhIndex, enIndex };
}

function matchRow(nameForMatch, zhIndex, enIndex) {
  const candidates = extractCandidates(nameForMatch);
  for (const cand of candidates) {
    for (const { zh, en } of toMatchPairs(cand)) {
      if (zh) {
        const key = normalizeZh(zh);
        const hit = key ? zhIndex.get(key) : null;
        if (hit) return { hitAlbums: hit, matchedOn: zh };
      }
      if (en) {
        const key = normalizeEn(en);
        const hit = key ? enIndex.get(key) : null;
        if (hit) return { hitAlbums: hit, matchedOn: en };
      }
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const mainEntries = catalog.filter((e) => e.category !== 'kids');
  const kidsEntries = catalog.filter((e) => e.category === 'kids');
  log(`catalog 載入:${catalog.length} 行(主專輯 ${mainEntries.length},泥娃娃 ${kidsEntries.length})`);

  const mainIdx = buildIndex(mainEntries);
  const kidsIdx = buildIndex(kidsEntries);
  log(`主 index distinct 中文歌名:${mainIdx.zhIndex.size},英文:${mainIdx.enIndex.size}`);
  log(`泥娃娃 index distinct 中文歌名:${kidsIdx.zhIndex.size},英文:${kidsIdx.enIndex.size}`);

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN ${TARGET_ORGS.join('/')}):${rows.length} 首`);

  const matched = [];
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];

  for (const row of rows) {
    const nameForMatch = (row.display_title && row.display_title.trim()) || row.title || '';
    const isKids = KIDS_MARKER_RE.test(nameForMatch);
    const { zhIndex, enIndex } = isKids ? kidsIdx : mainIdx;
    const result = matchRow(nameForMatch, zhIndex, enIndex);

    if (!result) { notFound.push(row); continue; }
    const { hitAlbums, matchedOn } = result;
    if (hitAlbums.size > 1) { conflicts.push({ row, matchedOn, albums: [...hitAlbums] }); continue; }
    const album = [...hitAlbums][0];
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, catalogAlbum: album }); continue; }
    if (row.album && row.album.trim()) { alreadyHasAlbum.push({ row, catalogAlbum: album }); continue; }
    matched.push({ row, album, matchedOn });
  }

  log(`match 到單一專輯且可寫(album 本身空):${matched.length}`);
  log(`match 到但衝突(撞多隻專輯,唔寫):${conflicts.length}`);
  log(`match 到但 DB 已經有 album(保護規則,唔覆寫):${alreadyHasAlbum.length}`);
  log(`match 到但 album_source=manual/legacy(受保護,唔覆寫):${protectedRows.length}`);
  log(`喺 catalog 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromNituCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'website' WHERE id = ?", [album, row.id]);
        written++;
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${written} 首`);
    } finally {
      releaseDbLock(token);
    }
  } else if (DRY) {
    log('--dry:未寫 DB(以上為模擬計數)');
  } else {
    log('冇可寫嘅候選,冇碰 DB');
  }

  writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, dry: DRY });
}

function writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, dry }) {
  const lines = [];
  lines.push('# backfillAlbumFromNituCatalog 報告 —— 泥土音樂(claymusic.org 官網 catalog)');
  lines.push('');
  lines.push(`> org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- catalog 搵唔到:${notFound.length}`);
  const hitRate = rows.length ? (((matched.length + conflicts.length + alreadyHasAlbum.length + protectedRows.length) / rows.length) * 100).toFixed(1) : '0.0';
  lines.push(`- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):${hitRate}%`);
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單');
  lines.push('');
  lines.push('| id | youtube_id | title | matched_on | album |');
  lines.push('|---|---|---|---|---|');
  for (const { row, album, matchedOn } of matched) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.display_title || row.title)} | ${mdEscape(matchedOn)} | ${mdEscape(album)} |`);
  }
  lines.push('');
  lines.push('## 衝突清單(撞多隻專輯,人手覆核)');
  lines.push('');
  lines.push('| id | youtube_id | title | matched_on | 撞中嘅專輯 |');
  lines.push('|---|---|---|---|---|');
  for (const c of conflicts) {
    lines.push(`| ${c.row.id} | ${c.row.youtube_id} | ${mdEscape(c.row.display_title || c.row.title)} | ${mdEscape(c.matchedOn)} | ${mdEscape(c.albums.join(' / '))} |`);
  }
  lines.push('');
  lines.push('## Catalog 搵唔到清單(頭 150 條)');
  lines.push('');
  lines.push('| id | youtube_id | title |');
  lines.push('|---|---|---|');
  for (const row of notFound.slice(0, 150)) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.display_title || row.title)} |`);
  }
  lines.push('');
  lines.push(`(DB 已有 album 冇覆寫嘅 ${alreadyHasAlbum.length} 首、album_source=manual/legacy 受保護嘅 ${protectedRows.length} 首,唔逐條列,見上面統計數字。)`);
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumFromNituCatalog 出錯:', e); process.exit(1); });
