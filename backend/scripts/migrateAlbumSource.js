#!/usr/bin/env node
// migrateAlbumSource.js — ALBUM-BACKFILL-ACCEL-PLAN.md Commit 1:加 `album_source`
// 欄,俾之後嘅 Phase A(playlist)/B(sop.org catalog)/C(search)三層自動化
// backfill 有 provenance 可追溯,亦令「邊啲 album 受保護唔准覆寫」有個
// 機械可查嘅欄(唔使淨靠「非空就唔覆寫」呢條粗規則)。
//
// 做兩件事,跟 migrateTaxonomy.js/backfillMeta.js `ensureLastMetaAttemptColumn`
// 同一套 idempotent pattern(PRAGMA table_info 查完先 ALTER,backfill 用
// WHERE 條件天然 idempotent,重跑結果一樣):
//   1. `hymns_all` 加 TEXT 欄 `album_source`,預設 ''。
//   2. 現有 album 非空而 album_source 仲係空嘅 row,一律 stamp
//      `album_source='legacy'`——呢批來歷混雜(手動輸入/舊 crawl/admin 改過都
//      有),源頭考究唔到,保守當受保護,同 'manual' 一樣永唔俾自動化層覆寫
//      (見 backfillAlbumFromPlaylists.js/backfillAlbumFromCatalog.js/
//      backfillAlbumSearch.js 嘅寫入規則:「只准填 album 為空嘅 row」)。
//
// Usage:
//   node scripts/migrateAlbumSource.js         # 真跑
//   node scripts/migrateAlbumSource.js --dry   # 唔寫,淨係印會做咩

import fs from 'fs';
import { openDb, saveDb, DB_PATH, acquireDbLock, releaseDbLock, query } from '../lib/hymnDb.js';

const DRY = process.argv.includes('--dry');

function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bak = `${DB_PATH}.bak-albumsource-${stamp}`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(DB_PATH, bak);
    console.log(`備份完成: ${bak}`);
  } else {
    console.log(`備份已存在,跳過: ${bak}`);
  }

  const token = await acquireDbLock('migrateAlbumSource');
  if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }

  try {
    const db = await openDb();

    if (!hasColumn(db, 'hymns_all', 'album_source')) {
      console.log("ALTER TABLE hymns_all ADD COLUMN album_source TEXT DEFAULT ''");
      if (!DRY) db.run("ALTER TABLE hymns_all ADD COLUMN album_source TEXT DEFAULT ''");
    } else {
      console.log('欄位已存在,跳過: album_source');
    }

    // --dry 唔會真 ALTER,呢陣 album_source 欄可能仲未存在——冇欄就冧唔到
    // beforeCount 呢條 SELECT,淨印「會 ALTER」就夠,唔使再算候選數。
    if (hasColumn(db, 'hymns_all', 'album_source') || !DRY) {
      const beforeCount = query(db, "SELECT COUNT(*) c FROM hymns_all WHERE album IS NOT NULL AND trim(album) != '' AND (album_source IS NULL OR album_source = '')")[0]?.c ?? 0;
      console.log(`候選 stamp 'legacy'(album 非空 AND album_source 空):${beforeCount} 首`);
    } else {
      console.log('--dry 且欄未存在,跳過候選計數(真跑時會計)');
    }
    if (!DRY) {
      db.run("UPDATE hymns_all SET album_source = 'legacy' WHERE album IS NOT NULL AND trim(album) != '' AND (album_source IS NULL OR album_source = '')");
    }

    if (!DRY) {
      saveDb(db);
      console.log('已寫入 hymns.db');
      const legacyCount = query(db, "SELECT COUNT(*) c FROM hymns_all WHERE album_source = 'legacy'")[0]?.c ?? 0;
      const totalAlbumNonEmpty = query(db, "SELECT COUNT(*) c FROM hymns_all WHERE album IS NOT NULL AND trim(album) != ''")[0]?.c ?? 0;
      console.log(`驗證:album_source='legacy' 共 ${legacyCount} 首(現有 album 非空總數 ${totalAlbumNonEmpty} 首,兩者應該非常接近)`);
    } else {
      console.log('--dry:未寫入');
    }
  } finally {
    releaseDbLock(token);
  }
}

main();
