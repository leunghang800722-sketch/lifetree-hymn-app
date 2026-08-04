#!/usr/bin/env node
// backfillAlbumFromCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md Commit 3 / Phase B。
// 食 fetchSopCatalog.js 出嘅 `data/album-backfill/sop-catalog.json`(sop.org
// 官網 CCLI 表格),歌名 normalize 之後同 catalog `title_zh` exact match,
// 淨係處理 org 屬「讚美之泉」「讚美之泉兒童」「讚美之泉粵語」嘅 row(粵語
// 翻唱填**原曲**所屬專輯,係 Eric §6 拍板④)。
//
// ── 匹配規則(寧空莫錯)────────────────────────────────────────────────
//   歌名(display_title 優先,冇先用 title)normalize 後同 catalog title_zh
//   normalize 後 exact match(唔做 fuzzy)。
//     · match 唔到 → 唔寫(留俾 Phase C search)
//     · match 到但呢個 normalize 後嘅歌名喺 catalog 對應多過一隻唔同專輯
//       (原版/精選/Live 等)→ 唔寫,flag 落 report,人手覆核
//     · match 到,得一隻專輯,而且 DB 呢個 row 嘅 album 本身空 → 寫
//       `album=<catalog 專輯名>, album_source='website'`
//
// ── normalize(§4:簡→繁、全半形、去空格、去括號副題/英文尾巴)──────────────
//   1. cn→tw(opencc-js,呢個 repo alignLyrics.js 已經用緊同一個做法)
//   2. 全形 ASCII/標點 → 半形
//   3. 剷晒括號(）()【】[]內容(副題/英文譯名/系列標記通常喺呢度)
//   4. 剝走尾隨純英文譯名(中文 + 空白 + 全 ASCII 到尾)
//   5. 去晒空白
//
// Usage:
//   node scripts/backfillAlbumFromCatalog.js --dry   # 出 report,唔寫 DB(現階段唯一准跑嘅模式)
//   node scripts/backfillAlbumFromCatalog.js         # 真寫(要等 Eric/Fable5 睇過 --dry report 先可以用)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'sop-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'catalog-report.md');
const DRY = process.argv.includes('--dry');

// Eric §6 拍板④:粵語翻唱(讚美之泉粵語)填**原曲**所屬專輯。
// 2026-08-04 Opus 5 驗收 followup⑤:DB 入面重有 2 首用咗舊/變體 org 名
// 「讚美之泉 Stream Of Praise Music Ministries」(冇合併落「讚美之泉」),
// 加落嚟先兜到。
const TARGET_ORGS = ['讚美之泉', '讚美之泉兒童', '讚美之泉粵語', '讚美之泉 Stream Of Praise Music Ministries'];

// 2026-08-04 Opus 5 驗收 followup④:toISOString() 係 UTC,同本機 HKT 差 8
// 個鐘,睇 log 好易誤判做「stall咗」(跟 67dcd23 對 growLibrary.js 同款修法)。
const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const toTraditional = Converter({ from: 'cn', to: 'tw' });

function fullwidthToHalfwidth(s) {
  return (s || '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

function normalizeTitle(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = toTraditional(s);
  s = fullwidthToHalfwidth(s);
  // 剷晒括號(全形/半形)包住嘅內容——副題/英文譯名/系列編號通常喺呢度。
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '');
  // 剝走尾隨純英文譯名(中文 + 空白 + 全 ASCII 到尾)。
  const m = s.match(/^([^\x00-\x7F][\s\S]*?)\s+[\x00-\x7F]+$/);
  if (m && m[1].trim()) s = m[1].trim();
  // 去晒空白(catalog title_zh 冇空格,DB 標題有時有)。
  s = s.replace(/\s+/g, '');
  return s;
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ── 專輯名 canonical 對齊(2026-08-04 Fable 5 簽白名單時發現)────────────────
// 同一隻專輯,sop.org CCLI 表同官方 YouTube playlist 嘅寫法唔一致(catalog 用
// 全名/舊譯/唔同標點)。Phase A(playlist)先行已經用咗右邊嗰個名寫 DB,呢度
// 一律對齊落 playlist 白名單嘅寫法,唔係同一隻專輯會喺 DB 出現兩個變體。
// key=catalog 原文,value=canonical(以 讚美之泉-playlists.json approved 名為準)。
const ALBUM_CANONICAL = {
  'G.L.O.W. 差遣我': '差遣我',
  'I Believe': '我相信',
  '不要放棄・滿有能力': '不要放棄．滿有能力', // 中點「・」→ 全形「．」
  '單單只為你': '單單只為祢',
  '將天敞開．活著為要敬拜祢': '將天敞開', // series=敬拜讚美(17),同 playlist 專輯 17 同一隻
  '我能給你什麼': '我能給你什麼？',
};
function canonicalizeAlbum(album) {
  return ALBUM_CANONICAL[album] || album;
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH},請先跑 node scripts/fetchSopCatalog.js`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalog.length} 行`);

  // normalizedTitle -> Set(album 原文)——一個 normalize 後嘅歌名可能撞多隻
  // 唔同專輯(原版/精選/Live 等),留到 match 嗰步先判斷寫唔寫。
  const catalogIndex = new Map();
  for (const entry of catalog) {
    if (!entry.title_zh || !entry.album) continue;
    const key = normalizeTitle(entry.title_zh);
    if (!key) continue;
    if (!catalogIndex.has(key)) catalogIndex.set(key, new Set());
    catalogIndex.get(key).add(canonicalizeAlbum(entry.album));
  }
  log(`catalog normalize 後 distinct 歌名:${catalogIndex.size}`);

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN ${TARGET_ORGS.join('/')}):${rows.length} 首`);

  const matched = []; // { row, album }
  const conflicts = []; // { row, normTitle, albums }
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = []; // followup①:album_source 已經係 manual/legacy

  for (const row of rows) {
    const nameForMatch = (row.display_title && row.display_title.trim()) || row.title || '';
    const key = normalizeTitle(nameForMatch);
    const hit = key ? catalogIndex.get(key) : null;
    if (!hit) { notFound.push(row); continue; }
    if (hit.size > 1) { conflicts.push({ row, normTitle: key, albums: [...hit] }); continue; }
    const album = [...hit][0];
    // followup①(必修):淨睇 `row.album` 有冇值唔夠——admin 清空一個寫錯
    // 嘅 album 之後(album='' + album_source='manual'),淨靠「album 空就
    // 可以寫」會即刻重新填返錯名,令「清空」動作形同冇做過。
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
    const token = await acquireDbLock('backfillAlbumFromCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      for (const { row, album } of matched) {
        // 鎖內重新確認(防止 discover→apply 之間第二個 job 寫咗,或者
        // admin 啱啱手動清空咗做 manual)。
        const fresh = query(freshDb, 'SELECT album, album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'website' WHERE id = ?", [album, row.id]);
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${matched.length} 首`);
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
  lines.push('# backfillAlbumFromCatalog 報告 —— Phase B(sop.org catalog)');
  lines.push('');
  lines.push(`> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 3。org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- catalog 搵唔到:${notFound.length}`);
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單');
  lines.push('');
  lines.push('| id | youtube_id | title | album |');
  lines.push('|---|---|---|---|');
  for (const { row, album } of matched) {
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

main().catch((e) => { console.error('backfillAlbumFromCatalog 出錯:', e); process.exit(1); });
