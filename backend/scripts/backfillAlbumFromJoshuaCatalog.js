#!/usr/bin/env node
// backfillAlbumFromJoshuaCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md Phase B,
// 約書亞樂團版。食 `data/album-backfill/joshua-catalog.json`(scrape 自官網
// joshua.com.tw 59 隻專輯、696 首 track 嘅事實資料:歌名+所屬專輯+年份),
// 對 org='約書亞樂團' 冇 album 嘅 row 做歌名 match,match 到先寫。
//
// ── DB 標題嘅特殊之處(同讚美之泉個版唔同)──────────────────────────────
//   約書亞 DB 嘅 title/display_title 係原始 YouTube 片名,格式通常係
//   「【中文歌名 / English Title】標籤(官方歌詞MV/Live Video/...) - 演出者」,
//   淨用 sop 版嗰種「剷晒括號」normalize 會連歌名本身都剷晒——所以呢度**先
//   攞出【】/[]入面嘅內容**做候選歌名,再喺候選入面用 "/" 切中英,先做
//   normalize 比對(cn→tw、全半形、去空格)。冇括號嘅片名(少數,例如純英文
//   專輯名)就用成句 " - " 前嘅部份做候選。
//
// ── 匹配規則(寧空莫錯,跟 backfillAlbumFromCatalog.js 同一套)──────────
//   · normalize 後嘅候選歌名(中文或英文)撞唔到 catalog → 唔寫
//   · 撞到但對應多過一隻唔同專輯(同名歌喺唔同專輯出現)→ 唔寫,flag 落
//     report 人手覆核
//   · 撞到得一隻專輯,而且 DB 呢個 row album 本身空、album_source 唔係
//     manual/legacy → 寫 `album=<catalog 專輯名>, album_source='website'`
//
// Usage:
//   node scripts/backfillAlbumFromJoshuaCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromJoshuaCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'joshua-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'joshua-catalog-report.md');
const DRY = process.argv.includes('--dry');

const TARGET_ORGS = ['約書亞樂團'];

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

// 同 backfillAlbumFromCatalog.js 一樣嘅中文 normalize(cn→tw、全半形、去括號
// 副題、剝走尾隨純英文、去空白)——呢度用喺「已經攞出嚟嘅候選歌名」上,
// 唔係成句原始片名(片名嘅括號喺攞候選嗰步已經處理咗)。
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

// 由原始 YouTube 片名攞出「候選歌名」段落——優先攞【】/[] 入面嘅內容
// (可能多過一個,例如 medley 片);冇括號就用 " - " 前嘅部份。
function extractCandidates(rawTitle) {
  const raw = (rawTitle || '').trim();
  if (!raw) return [];
  const bracketRe = /[【\[]([^】\]]+)[】\]]/g;
  const found = [];
  let m;
  while ((m = bracketRe.exec(raw))) found.push(m[1]);
  if (found.length) return found;
  const dashIdx = raw.indexOf(' - ');
  return [dashIdx > 0 ? raw.slice(0, dashIdx) : raw];
}

// 候選段落入面用 "/" 或 "／" 切中英(取第一個 "/" 前做中文候選,之後嘅做
// 英文候選——candidate 本身可能係 medley 冇分隔黐埋,所以只信第一截)。
function splitCandidate(candidate) {
  const parts = candidate.split(/[\/／]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { zh: '', en: '' };
  if (parts.length === 1) {
    return hasCJK(parts[0]) ? { zh: parts[0], en: '' } : { zh: '', en: parts[0] };
  }
  return { zh: parts[0], en: parts[1] };
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ── 專輯名 canonical 對齊(2026-08-11 起 catalog 時,對比 Phase A 已寫落
// DB 嘅專輯名發現)────────────────────────────────────────────────────
// joshua.com.tw 官網專輯頁 h2 標題有時中英文合一(catalog 攞落嚟嘅原文),
// 但 Phase A(YouTube playlist)已經用純中文名寫咗大部分 row——用 DB 現存
// 多數票對齊,避免同一隻專輯喺 DB 出現兩個名。
// key=catalog 原文,value=canonical(DB 已用多數票嘅寫法)。
const ALBUM_CANONICAL = {
  '卸下冠冕 Crowns down': '卸下冠冕',
  'SHOUT FOR FREEDOM': '呼喊自由',
  'Acoustic Live 數位專輯〈盼望引力〉': '盼望引力',
};
function canonicalizeAlbum(album) {
  return ALBUM_CANONICAL[album] || album;
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalog.length} 行`);

  const zhIndex = new Map(); // normalized zh -> Set(album)
  const enIndex = new Map(); // normalized en -> Set(album)
  for (const entry of catalog) {
    if (!entry.album) continue;
    const album = canonicalizeAlbum(entry.album);
    if (entry.title_zh) {
      const key = normalizeZh(entry.title_zh);
      if (key) {
        if (!zhIndex.has(key)) zhIndex.set(key, new Set());
        zhIndex.get(key).add(album);
      }
    }
    if (entry.title_en) {
      const key = normalizeEn(entry.title_en);
      if (key) {
        if (!enIndex.has(key)) enIndex.set(key, new Set());
        enIndex.get(key).add(album);
      }
    }
  }
  log(`catalog normalize 後 distinct 中文歌名:${zhIndex.size},distinct 英文歌名:${enIndex.size}`);

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN ${TARGET_ORGS.join('/')}):${rows.length} 首`);

  const matched = []; // { row, album, matchedOn }
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];

  for (const row of rows) {
    const nameForMatch = (row.display_title && row.display_title.trim()) || row.title || '';
    const candidates = extractCandidates(nameForMatch);

    let hitAlbums = null;
    let matchedOn = null;
    for (const cand of candidates) {
      const { zh, en } = splitCandidate(cand);
      if (zh) {
        const key = normalizeZh(zh);
        const hit = key ? zhIndex.get(key) : null;
        if (hit) { hitAlbums = hit; matchedOn = zh; break; }
      }
      if (en) {
        const key = normalizeEn(en);
        const hit = key ? enIndex.get(key) : null;
        if (hit) { hitAlbums = hit; matchedOn = en; break; }
      }
    }

    if (!hitAlbums) { notFound.push(row); continue; }
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
    const token = await acquireDbLock('backfillAlbumFromJoshuaCatalog');
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
  lines.push('# backfillAlbumFromJoshuaCatalog 報告 —— Phase B(joshua.com.tw 官網 catalog)');
  lines.push('');
  lines.push(`> org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- catalog 搵唔到:${notFound.length}`);
  lines.push(`- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):${(((matched.length + conflicts.length + alreadyHasAlbum.length + protectedRows.length) / rows.length) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單(頭 200 條)');
  lines.push('');
  lines.push('| id | youtube_id | title | matched_on | album |');
  lines.push('|---|---|---|---|---|');
  for (const { row, album, matchedOn } of matched.slice(0, 200)) {
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
  lines.push(`(catalog 搵唔到嘅 ${notFound.length} 首、DB 已有 album 冇覆寫嘅 ${alreadyHasAlbum.length} 首、`);
  lines.push(`album_source=manual/legacy 受保護嘅 ${protectedRows.length} 首,唔逐條列,見上面統計數字。)`);
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumFromJoshuaCatalog 出錯:', e); process.exit(1); });
