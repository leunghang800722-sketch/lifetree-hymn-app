#!/usr/bin/env node
// backend/scripts/restoreKidsLyricsC4.js — 修復 C4 換血(commit 3c1fcfb)歌詞陪葬
//
// 根因:C4 兒童庫換血(finalizeKidsC4.js --swap)用 delete+insert 原子對換,
// insert 嗰段 SQL(見該檔 §Step5 runSwap)冇帶 lyrics/lyrics_source/
// lyrics_status/lyrics_draft/lyrics_checked_at/lyrics_timeline 呢六個欄位
// (staging table kids_refetch 本身都冇呢啲欄位),導致換血前 51 首已經
// lyrics_status='verified' 嘅兒童歌詞連行陪葬,全庫 verified 由 259 跌到 208。
//
// 修復:用換血前一刻嘅備份 hymns.db.bak-c4swap-20260802 做資料來源,逐條
// youtube_id 核對:
//   Case A — youtube_id 喺現庫有 row 但冇 verified 歌詞 → 將備份嘅歌詞六欄
//            繼承落現庫嗰行(只填現行歌詞係空/none 嘅行,已有新歌詞嘅 skip)
//   Case B — youtube_id 現庫搵唔到(被 C4 triage 剔走/refetch 走漏)→ 備份
//            成行復活插返 hymns_all,curated=0(唔入主庫),status 照備份原樣
//
// Usage: node scripts/restoreKidsLyricsC4.js [--dry-run]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock, DB_PATH } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'kids-refetch');
const BACKUP_PATH = path.join(__dirname, '..', 'hymns.db.bak-c4swap-20260802');
const DRY_RUN = process.argv.includes('--dry-run');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const LYRICS_COLS = ['lyrics', 'lyrics_source', 'lyrics_status', 'lyrics_draft', 'lyrics_checked_at', 'lyrics_timeline'];
const FULL_ROW_COLS = [
  'title', 'artist', 'category', 'youtube_id', 'duration', 'lyrics', 'title_en', 'album', 'lang', 'tags',
  'featured', 'release_date', 'view_count', 'like_count', 'status', 'last_checked', 'fail_streak', 'curated',
  'lyrics_source', 'lyrics_status', 'lyrics_draft', 'lyrics_checked_at', 'display_title', 'lyrics_timeline',
  'org', 'performer', 'performer_source', 'kids',
];

async function main() {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error(`⛔ 紅線:搵唔到備份 ${BACKUP_PATH},唔准郁 prod。`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const bak = new SQL.Database(fs.readFileSync(BACKUP_PATH));
  const bakStmt = bak.prepare(
    `SELECT ${FULL_ROW_COLS.join(', ')} FROM hymns_all WHERE lang='兒童' AND lyrics_status='verified'`
  );
  const bakRows = [];
  while (bakStmt.step()) bakRows.push(bakStmt.getAsObject());
  bakStmt.free();
  bak.close();
  log(`備份 ${BACKUP_PATH} 入面 lang='兒童' AND lyrics_status='verified' 共 ${bakRows.length} 首`);

  const token = await acquireDbLock('restoreKidsLyricsC4');
  if (!token) { log('⛔ 攞唔到 DB 鎖(可能 backfillMeta 排隊中,rerun 試下)'); process.exit(1); }

  const report = { caseA: [], caseB: [], skipped: [], notFoundBoth: [] };

  try {
    const db = await openDb();

    for (const row of bakRows) {
      const yid = row.youtube_id;
      const curRows = query(db, 'SELECT id, lyrics_status, lyrics FROM hymns_all WHERE youtube_id=?', [yid]);

      if (curRows.length === 0) {
        // Case B: 復活插返(curated=0,唔入主庫;status 照備份原樣)
        report.caseB.push({ youtube_id: yid, title: row.title, org: row.org, status: row.status });
        if (!DRY_RUN) {
          const vals = FULL_ROW_COLS.map((c) => (c === 'curated' ? 0 : row[c]));
          const placeholders = FULL_ROW_COLS.map(() => '?').join(', ');
          db.run(`INSERT INTO hymns_all (${FULL_ROW_COLS.join(', ')}) VALUES (${placeholders})`, vals);
        }
        continue;
      }

      // 可能同一 youtube_id 有多過一行(理論上唔應該,但保守處理全部符合條件嘅行)
      let touchedAny = false;
      for (const cur of curRows) {
        const hasNewLyrics = cur.lyrics_status === 'verified' || (cur.lyrics && String(cur.lyrics).trim().length > 0);
        if (hasNewLyrics) {
          report.skipped.push({ youtube_id: yid, id: cur.id, title: row.title, curStatus: cur.lyrics_status });
          continue;
        }
        // Case A: 繼承歌詞六欄
        report.caseA.push({ youtube_id: yid, id: cur.id, title: row.title });
        touchedAny = true;
        if (!DRY_RUN) {
          db.run(
            `UPDATE hymns_all SET lyrics=?, lyrics_source=?, lyrics_status=?, lyrics_draft=?, lyrics_checked_at=?, lyrics_timeline=? WHERE id=?`,
            [row.lyrics, row.lyrics_source, row.lyrics_status, row.lyrics_draft, row.lyrics_checked_at, row.lyrics_timeline, cur.id]
          );
        }
      }
      if (!touchedAny && curRows.every((c) => !(c.lyrics_status === 'verified' || (c.lyrics && String(c.lyrics).trim().length > 0)))) {
        // 理論上唔會行到呢度(above loop 已經覆蓋每行),留低做保險
      }
    }

    if (!DRY_RUN) {
      saveDb(db);
    }

    const verifiedAfter = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE lyrics_status='verified'`)[0].c;
    log(`=== 完成${DRY_RUN ? '(dry-run,未寫盤)' : ''} === Case A(繼承)=${report.caseA.length} Case B(復活)=${report.caseB.length} skip(現行已有新歌詞)=${report.skipped.length}`);
    log(`全庫 verified 現數:${verifiedAfter}(備份 259,期望 208+CaseA${report.caseA.length}+CaseB${report.caseB.length}=${208 + report.caseA.length + report.caseB.length})`);

    log('--- Case A youtube_id 清單 ---');
    report.caseA.forEach((r) => log(`   [A] ${r.youtube_id} id=${r.id} ${r.title}`));
    log('--- Case B youtube_id 清單 ---');
    report.caseB.forEach((r) => log(`   [B] ${r.youtube_id} org=${r.org} status=${r.status} ${r.title}`));
    if (report.skipped.length) {
      log('--- Skip(現行已有新歌詞,唔覆寫)清單 ---');
      report.skipped.forEach((r) => log(`   [SKIP] ${r.youtube_id} id=${r.id} curStatus=${r.curStatus} ${r.title}`));
    }

    fs.writeFileSync(
      path.join(DATA_DIR, 'lyrics-restore-c4-report.json'),
      JSON.stringify({ generatedAt: stamp(), dryRun: DRY_RUN, verifiedAfter, ...report }, null, 2),
      'utf8'
    );
    log(`報告已寫:${path.join(DATA_DIR, 'lyrics-restore-c4-report.json')}`);
  } finally {
    releaseDbLock(token);
  }
}

main().catch((e) => { console.error('restoreKidsLyricsC4 出錯:', e); process.exit(1); });
