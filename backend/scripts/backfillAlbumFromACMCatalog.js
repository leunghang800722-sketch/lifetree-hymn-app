#!/usr/bin/env node
// backfillAlbumFromACMCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md ACM 版。
// 食 fetchACMCatalog.js 寫嘅 `data/album-backfill/acm-catalog.json`(ACM 官方
// YouTube channel 專輯 playlist member,youtube_id 級)。同 org IN
// ('ACM','ACM兒童詩歌') 冇 album 嘅 row 撞 youtube_id(exact,唔係 fuzzy 撞
// 歌名),撞到先寫。兩個 org 用同一個 HKACM Official channel(worshipGroups.js
// 已註明),所以一齊處理。
//
// ── 匹配規則(寧空莫錯,跟 backfillAlbumFromJoshuaCatalog.js 同一套邏輯)──
//   · youtube_id 撞唔到 catalog → 唔寫
//   · 撞到但對應多過一隻唔同專輯名 → 唔寫,flag 落 report 人手覆核
//   · 撞到得一隻專輯,而且 DB 呢個 row album 本身空、album_source 唔係
//     manual/legacy → 寫 album=<catalog 專輯名>, album_source='playlist'
//     (同 backfillAlbumFromPlaylists.js 用同一個 album_source 慣例)
//
// Usage:
//   node scripts/backfillAlbumFromACMCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromACMCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'acm-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'acm-catalog-report.md');
const DRY = process.argv.includes('--dry');

const TARGET_ORGS = ['ACM', 'ACM兒童詩歌'];

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalog.length} 行`);

  const idIndex = new Map(); // youtube_id -> Set(album)
  for (const entry of catalog) {
    if (!entry.youtube_id || !entry.album) continue;
    if (!idIndex.has(entry.youtube_id)) idIndex.set(entry.youtube_id, new Set());
    idIndex.get(entry.youtube_id).add(entry.album);
  }
  log(`catalog distinct youtube_id:${idIndex.size}`);

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id, status FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN ${TARGET_ORGS.join('/')}):${rows.length} 首`);

  const matched = [];
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];

  for (const row of rows) {
    const hitAlbums = row.youtube_id ? idIndex.get(row.youtube_id) : null;
    if (!hitAlbums) { notFound.push(row); continue; }
    if (hitAlbums.size > 1) { conflicts.push({ row, albums: [...hitAlbums] }); continue; }
    const album = [...hitAlbums][0];
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, catalogAlbum: album }); continue; }
    if (row.album && row.album.trim()) { alreadyHasAlbum.push({ row, catalogAlbum: album }); continue; }
    matched.push({ row, album });
  }

  log(`match 到單一專輯且可寫(album 本身空):${matched.length}`);
  log(`match 到但衝突(撞多隻專輯,唔寫):${conflicts.length}`);
  log(`match 到但 DB 已經有 album(保護規則,唔覆寫):${alreadyHasAlbum.length}`);
  log(`match 到但 album_source=manual/legacy(受保護,唔覆寫):${protectedRows.length}`);
  log(`喺 catalog 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromACMCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source, org FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (!TARGET_ORGS.includes(fresh.org)) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'playlist' WHERE id = ?", [album, row.id]);
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
  lines.push('# backfillAlbumFromACMCatalog 報告 —— ACM(HKACM Official YouTube channel 專輯 playlist)');
  lines.push('');
  lines.push(`> org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- catalog 搵唔到(youtube_id 唔喺任何已收錄嘅專輯 playlist 入面):${notFound.length}`);
  lines.push(`- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):${(((matched.length + conflicts.length + alreadyHasAlbum.length + protectedRows.length) / rows.length) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單(頭 200 條)');
  lines.push('');
  lines.push('| id | youtube_id | title | album |');
  lines.push('|---|---|---|---|');
  for (const { row, album } of matched.slice(0, 200)) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.display_title || row.title)} | ${mdEscape(album)} |`);
  }
  lines.push('');
  lines.push('## 衝突清單(撞多隻專輯,人手覆核)');
  lines.push('');
  lines.push('| id | youtube_id | title | 撞中嘅專輯 |');
  lines.push('|---|---|---|---|');
  for (const c of conflicts) {
    lines.push(`| ${c.row.id} | ${c.row.youtube_id} | ${mdEscape(c.row.display_title || c.row.title)} | ${mdEscape(c.albums.join(' / '))} |`);
  }
  lines.push('');
  lines.push(`(catalog 搵唔到嘅 ${notFound.length} 首、DB 已有 album 冇覆寫嘅 ${alreadyHasAlbum.length} 首、`);
  lines.push(`album_source=manual/legacy 受保護嘅 ${protectedRows.length} 首,唔逐條列,見上面統計數字。)`);
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumFromACMCatalog 出錯:', e); process.exit(1); });
