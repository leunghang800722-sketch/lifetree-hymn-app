#!/usr/bin/env node
// backfillAlbumFromTianyunCatalog.js — 天韻合唱團版 album backfill,跟
// backfillAlbumFromJoshuaCatalog.js 同一套匹配方法論(寧空莫錯)。食
// `data/album-backfill/tianyun-catalog.json`(爬自 shop.hms.org.tw 商城
// category=45「天韻專輯」53 件商品、514 首 track 嘅事實資料:歌名+所屬
// 專輯/單曲名),對 org='天韻合唱團' 冇 album 嘅 row 做歌名 match,match 到
// 先寫。
//
// ── DB 標題嘅特殊之處(同約書亞、讚美之泉都唔同)────────────────────────
//   天韻 DB 嘅 title/display_title 觀察到幾種 YouTube 片名格式:
//     1.「歌名__天韻合唱團 Official MV」                (最常見)
//     2.「【歌名】天韻合唱團 與爵士之間 Jazz ver._天韻合唱團 Official MV」
//     3.「歌名 小組敬拜版 ___跟天韻合唱團一起敬拜神」
//     4.「天韻聲活圈 第N集 ...」(節目/vlog,非歌曲,預期匹配唔到,正常)
//   所以呢度嘅候選歌名攞法:優先攞【】/[] 入面嘅內容(格式2);冇括號就攞
//   第一個 "__" 之前嘅部份(格式1/3);再冇就攞 " - " 之前嘅部份;最後 fallback
//   用成句。攞到候選之後,剝走「小組敬拜版」「Official MV」「Jazz ver.」
//   「與爵士之間」呢類尾隨標籤先 normalize 比對。
//
// ── 匹配規則(寧空莫錯,跟 Joshua 版同一套)───────────────────────────
//   · normalize 後嘅候選歌名(中文或英文)撞唔到 catalog → 唔寫
//   · 撞到但對應多過一隻唔同專輯(同名歌喺唔同專輯出現)→ 唔寫,flag 落
//     report 人手覆核
//   · 撞到得一隻專輯,而且 DB 呢個 row album 本身空、album_source 唔係
//     manual/legacy → 寫 `album=<catalog 專輯名>, album_source='website'`
//
// Usage:
//   node scripts/backfillAlbumFromTianyunCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromTianyunCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'tianyun-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'tianyun-catalog-report.md');
const DRY = process.argv.includes('--dry');
// --no-resolve-earliest:關掉「同名歌撞多隻碟時揀最早發行嗰隻(=原碟)」嘅解衝突規則
const RESOLVE_EARLIEST = !process.argv.includes('--no-resolve-earliest');

// 2026-08-11:加返「天韻詩歌」(worshipGroups.js 已經將呢個名列做「天韻合唱團」
// 嘅 alias,但 DB 部分 row 仲用緊呢個舊/獨立 org 字串)——同一個官方
// tianyun.org.tw catalog 應該都撞得中。
const TARGET_ORGS = ['天韻合唱團', '天韻詩歌'];

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

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// 尾隨標籤(格式1/2/3共有嘅雜訊),攞到候選之後先剝走先 normalize。
const SUFFIX_STRIP_RE = /\s*(小組敬拜版|與爵士之間|Jazz\s*ver\.?|Official\s*MV|Official|MV|Live版|LIVE版|現場版)\s*$/i;
function stripSuffixLabels(s) {
  let prev = s;
  for (let i = 0; i < 5; i++) {
    const next = prev.replace(SUFFIX_STRIP_RE, '').trim();
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

// 由原始 YouTube 片名(或 display_title)攞出候選歌名段落——見檔案頭部
// 格式1-3 嘅說明。
function extractCandidates(rawTitle) {
  const raw = (rawTitle || '').trim();
  if (!raw) return [];
  const candidates = [];
  const bracketRe = /[【\[]([^】\]]+)[】\]]/g;
  let m;
  while ((m = bracketRe.exec(raw))) candidates.push(m[1]);
  const dunderIdx = raw.indexOf('__');
  if (dunderIdx > 0) candidates.push(raw.slice(0, dunderIdx));
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx > 0) candidates.push(raw.slice(0, dashIdx));
  candidates.push(raw);
  return candidates.map(stripSuffixLabels).filter(Boolean);
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalog.length} 行`);

  const zhIndex = new Map();
  const enIndex = new Map();
  for (const entry of catalog) {
    if (!entry.album) continue;
    const album = entry.album;
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

  const matched = [];
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];

  // album → 發行年份(由 fetchTianyunAlbumYears.js 由 shop.hms.org.tw 補入 catalog)
  const albumYear = new Map();
  for (const t of catalog) {
    if (!t.album || t.year == null || albumYear.has(t.album)) continue;
    const y = Number(t.year);            // 有啲 catalog(MusicBrainz)嘅 year 係字串
    if (Number.isFinite(y)) albumYear.set(t.album, y);
  }
  const resolvedEarliest = [];

  for (const row of rows) {
    const titleCandidates = [
      ...extractCandidates(row.display_title || ''),
      ...extractCandidates(row.title || ''),
    ];

    let hitAlbums = null;
    let matchedOn = null;
    for (const cand of titleCandidates) {
      if (hasCJK(cand)) {
        const key = normalizeZh(cand);
        const hit = key ? zhIndex.get(key) : null;
        if (hit) { hitAlbums = hit; matchedOn = cand; break; }
      } else {
        const key = normalizeEn(cand);
        const hit = key ? enIndex.get(key) : null;
        if (hit) { hitAlbums = hit; matchedOn = cand; break; }
      }
    }

    if (!hitAlbums) { notFound.push(row); continue; }
    let album;
    if (hitAlbums.size > 1) {
      // 同一首歌撞多隻碟 = 原碟 + 之後嘅精選/重編合輯。有齊年份就揀最早
      // 嗰隻(原碟);差一隻冇年份、或者最早嗰個唔止一隻(平手)就照舊唔寫。
      const list = [...hitAlbums];
      const years = list.map((a) => albumYear.get(a));
      if (!RESOLVE_EARLIEST || years.some((y) => y == null)) {
        conflicts.push({ row, matchedOn, albums: list, reason: RESOLVE_EARLIEST ? '有專輯欠年份' : '規則關咗' });
        continue;
      }
      const min = Math.min(...years);
      const winners = list.filter((a) => albumYear.get(a) === min);
      if (winners.length !== 1) {
        conflicts.push({ row, matchedOn, albums: list, reason: `最早年份${min}平手` });
        continue;
      }
      album = winners[0];
      resolvedEarliest.push({ row, album, matchedOn, year: min, from: list.map((a) => `${a}(${albumYear.get(a)})`).join(' / ') });
    } else {
      album = [...hitAlbums][0];
    }
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, catalogAlbum: album }); continue; }
    if (row.album && row.album.trim()) { alreadyHasAlbum.push({ row, catalogAlbum: album }); continue; }
    matched.push({ row, album, matchedOn });
  }

  log(`match 到單一專輯且可寫(album 本身空):${matched.length}`);
  log(`衝突靠「最早發行=原碟」解決咗:${resolvedEarliest.length}`);
  log(`match 到但衝突(仲係解唔到,唔寫):${conflicts.length}`);
  log(`match 到但 DB 已經有 album(保護規則,唔覆寫):${alreadyHasAlbum.length}`);
  log(`match 到但 album_source=manual/legacy(受保護,唔覆寫):${protectedRows.length}`);
  log(`喺 catalog 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromTianyunCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source, org FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.org !== row.org) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'website' WHERE id = ? AND org = ?", [album, row.id, row.org]);
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

  writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, resolvedEarliest, dry: DRY });
}

function writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, resolvedEarliest = [], dry }) {
  const lines = [];
  lines.push('# backfillAlbumFromTianyunCatalog 報告 —— 天韻合唱團(shop.hms.org.tw 官方商城 catalog)');
  lines.push('');
  lines.push(`> org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- 其中撞多隻專輯、靠「最早發行=原碟」解決咗:${resolvedEarliest.length}`);
  lines.push(`- match 到但撞多隻專輯(仲係解唔到,冇寫):${conflicts.length}`);
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

main().catch((e) => { console.error('backfillAlbumFromTianyunCatalog 出錯:', e); process.exit(1); });
