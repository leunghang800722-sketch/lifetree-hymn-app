#!/usr/bin/env node
// 純音樂 Phase 1 / T1 —— INSTRUMENTAL-PHASE1-EXEC-20260821.md §2
//
// `hymns_all` 加一個 `instrumental INTEGER DEFAULT 0` flag 欄,再重建 `hymns`
// view。骨架完全照抄 `scripts/migrateTaxonomy.js`(backup → lock → PRAGMA 查欄
// → ALTER → saveDb → 放鎖),additive-only,零 backfill(回標係 T3
// `applyInstrumentalFlags.mjs` 嘅事)。
//
// 分類做法跟返 `kids` flag 嗰套,**唔開新 `lang` 值**(INSTRUMENTAL-CATEGORY-
// PLAN §0.1:`lang='兒童'` 嗰條路 C4 換血已經證明係錯)。
//
// ⚠️ 重建 view 呢步唔可以慳:`hymns` 係 `SELECT *` view,建立嗰刻已經凍結咗
//    欄位清單,唔 DROP + CREATE 返就永遠見唔到新欄(`migrate-lyrics.js:13-15`
//    明文,做法參考 `scripts/migrate-hymns-view.js`)。
//
// ⚠️ 唔使停 backend:`lib/serverDb.js` 係純讀 in-memory 副本,而所有寫路徑
//    (`lib/adminHymns.js` withLock、`scripts/reviewLyrics.js` --apply 三個
//    分支、夜晚 grow/curate job)全部係「攞鎖 → 由碟 fresh openDb() → 改 →
//    saveDb」,長駐 process 唔會用舊 snapshot 剷返走個新欄。
//
// Idempotent:欄位用 PRAGMA table_info 查完先 ALTER;view 每次照重建(DROP IF
// EXISTS + CREATE),重跑結果一樣。
//
// 用法:node scripts/migrate-instrumental.js [--dry]

import fs from 'fs';
import { openDb, saveDb, DB_PATH, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { USER_DB_PATH } from '../lib/userDb.js';

const DRY = process.argv.includes('--dry');

// `hymns` view 嘅原句(同 sqlite_master 入面現存嗰句逐字一樣)——重建要照抄,
// 唔可以順手改條件,改咗等於靜靜哋改咗成個 App 見到嘅歌單。
const VIEW_SQL = "CREATE VIEW hymns AS SELECT * FROM hymns_all WHERE curated = 1 AND status != 'dead' AND status != 'rejected'";

function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}

function scalar(db, sql) {
  const r = db.exec(sql);
  return r[0]?.values[0][0] ?? null;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bak = `${DB_PATH}.bak-instrumental-${stamp}`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(DB_PATH, bak);
    console.log(`備份完成: ${bak}`);
  } else {
    console.log(`備份已存在,跳過: ${bak}`);
  }
  const usersBak = `${USER_DB_PATH}.bak-instrumental-${stamp}`;
  if (!fs.existsSync(usersBak)) {
    fs.copyFileSync(USER_DB_PATH, usersBak);
    console.log(`備份完成: ${usersBak}`);
  } else {
    console.log(`備份已存在,跳過: ${usersBak}`);
  }

  const token = await acquireDbLock('migrate-instrumental');
  if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }

  try {
    // 鎖內先由碟開 fresh 副本(唔准用鎖前嘅 snapshot —— sql.js 全檔
    // last-writer-wins,舊 snapshot 一寫落去就冚走人哋期間 apply 咗嘅歌詞)
    const db = await openDb();

    const beforeHymns = scalar(db, 'SELECT COUNT(*) FROM hymns');
    const beforeAll = scalar(db, 'SELECT COUNT(*) FROM hymns_all');
    console.log(`migration 前:hymns=${beforeHymns} hymns_all=${beforeAll}`);

    if (!hasColumn(db, 'hymns_all', 'instrumental')) {
      console.log('ALTER TABLE hymns_all ADD COLUMN instrumental INTEGER DEFAULT 0');
      if (!DRY) db.run('ALTER TABLE hymns_all ADD COLUMN instrumental INTEGER DEFAULT 0');
    } else {
      console.log('欄位已存在,跳過: instrumental');
    }

    const oldView = scalar(db, "SELECT sql FROM sqlite_master WHERE type='view' AND name='hymns'");
    console.log(`重建 view(舊句:${oldView})`);
    if (!DRY) {
      db.run('DROP VIEW IF EXISTS hymns');
      db.run(VIEW_SQL);
    }

    if (!DRY) {
      // view 真係見到新欄先算數(view 冇重建嘅話呢句會 no such column 掟錯)
      const probe = db.exec('SELECT instrumental FROM hymns LIMIT 1');
      if (!probe.length) throw new Error('view 重建後查唔到 instrumental 欄,唔敢寫落碟');
      const afterHymns = scalar(db, 'SELECT COUNT(*) FROM hymns');
      const afterAll = scalar(db, 'SELECT COUNT(*) FROM hymns_all');
      if (afterHymns !== beforeHymns || afterAll !== beforeAll) {
        throw new Error(`行數變咗(hymns ${beforeHymns}→${afterHymns}, hymns_all ${beforeAll}→${afterAll}),唔敢寫落碟`);
      }
      console.log(`migration 後:hymns=${afterHymns} hymns_all=${afterAll}(一致)`);
      saveDb(db);
      console.log('已寫落碟');
    } else {
      console.log('[dry] 唔會寫落碟');
    }
  } finally {
    releaseDbLock(token);
  }
}

main().catch((e) => { console.error('migrate-instrumental 出錯:', e); process.exit(1); });
