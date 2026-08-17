#!/usr/bin/env node
// backfillAlbumHeartProTitle.js — 全心製作 HeartPro 版 album backfill。
//
// 唔使爬任何外部資料源:呢隊 org 嘅上載者自己喺 YouTube 標題尾部寫低咗
// 所屬專輯字面標記「《HIS70ry 齊唱。吳秉堅之歌。》自傳第一樂章。」,
// 而 DB 入面已經有 2 首同一標記嘅 row 由早期 'search' 輪填咗
// album='齊唱‧吳秉堅之歌'(同一隻碟,得標點符號寫法唔同)。即係話呢個
// 標題字面標記 = 專輯,已經有 DB 內部實錘,唔使估。
//
// 跟 backfillAlbumFromXiaoyangCatalog.js 嘅 Tier1「標題自帶《專輯》字面」
// 做法(嗰次 233/266 命中,證實比歌名 match catalog 更可靠)。
//
// 匹配規則(寧空莫錯):
//   · title 冇 HIS70ry 標記 → 唔寫
//   · DB 呢個 row 已經有 album → 唔覆寫
//   · album_source = manual/legacy → 受保護,唔覆寫
//   · 其餘 → 寫 album='齊唱‧吳秉堅之歌', album_source='title'
//
// Usage:
//   node scripts/backfillAlbumHeartProTitle.js --dry
//   node scripts/backfillAlbumHeartProTitle.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'heartpro-title-report.md');
const DRY = process.argv.includes('--dry');

const TARGET_ORGS = ['全心製作 HeartPro'];
const ALBUM = '齊唱‧吳秉堅之歌';
// 標題字面標記:HIS70ry + 齊唱 + 吳秉堅之歌(容忍全形/半形句號、空格差異)
const MARKER = /HIS70ry[\s　]*齊唱[。．.・‧\s]*吳秉堅之歌/i;

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function writeReport({ rows, matched, alreadyHasAlbum, protectedRows, notFound, dry }) {
  const L = [];
  L.push('# backfillAlbumHeartProTitle 報告 —— 全心製作 HeartPro(標題字面標記)');
  L.push('');
  L.push(`> org=全心製作 HeartPro。生成時間:${stamp()}${dry ? ' (--dry,冇寫 DB)' : ''}`);
  L.push('');
  L.push(`- 候選 row 總數(org 全部 curated 生存 row):${rows.length}`);
  L.push(`- 標題帶 HIS70ry 標記且已寫(或 --dry 模擬):${matched.length}`);
  L.push(`- 標題帶標記但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  L.push(`- 標題帶標記但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  L.push(`- 標題冇 HIS70ry 標記(唔屬呢隻碟,唔碰):${notFound.length}`);
  L.push('');
  L.push(`寫入值:\`album='${ALBUM}', album_source='title'\``);
  L.push('');
  L.push('## 已寫(或 --dry 模擬)清單');
  L.push('');
  L.push('| id | youtube_id | title |');
  L.push('|---|---|---|');
  for (const r of matched) L.push(`| ${r.id} | ${r.youtube_id} | ${String(r.title).replace(/\|/g, '\\|')} |`);
  L.push('');
  L.push('## 標題冇標記、留空冇碰(人手參考)');
  L.push('');
  L.push('| id | title |');
  L.push('|---|---|');
  for (const r of notFound) L.push(`| ${r.id} | ${String(r.title).replace(/\|/g, '\\|')} |`);
  L.push('');
  fs.writeFileSync(REPORT_PATH, L.join('\n'), 'utf8');
  log('報告已寫:', REPORT_PATH);
}

async function main() {
  const db = await openDb();
  const rows = query(
    db,
    `SELECT id, youtube_id, title, album, album_source, org FROM hymns_all
     WHERE org = ? AND curated = 1 AND status NOT IN ('dead','rejected')
     ORDER BY id`,
    TARGET_ORGS
  );
  log(`候選 row:${rows.length}`);

  const matched = [], alreadyHasAlbum = [], protectedRows = [], notFound = [];
  for (const row of rows) {
    if (!MARKER.test(row.title || '')) { notFound.push(row); continue; }
    if (row.album && String(row.album).trim()) { alreadyHasAlbum.push(row); continue; }
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push(row); continue; }
    matched.push(row);
  }

  log(`標題帶標記可寫:${matched.length}`);
  log(`標題帶標記但已有 album:${alreadyHasAlbum.length}`);
  log(`受保護:${protectedRows.length}`);
  log(`標題冇標記:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumHeartProTitle');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const row of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source, org, title FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (!TARGET_ORGS.includes(fresh.org)) continue;
        if (!MARKER.test(fresh.title || '')) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && String(fresh.album).trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'title' WHERE id = ? AND org = ?", [ALBUM, row.id, row.org]);
        written++;
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${written} 首`);
    } finally {
      releaseDbLock(token);
    }
  } else if (DRY) {
    log('--dry:未寫 DB');
  } else {
    log('冇可寫候選,冇碰 DB');
  }

  writeReport({ rows, matched, alreadyHasAlbum, protectedRows, notFound, dry: DRY });
}

main().catch((e) => { console.error(e); process.exit(1); });
