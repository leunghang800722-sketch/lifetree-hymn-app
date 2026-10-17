#!/usr/bin/env node
// oneoff-clearAlbum735.js — ALBUM-BACKFILL-ACCEL-PLAN.md Opus 5 驗收 followup
// 必修②。id=735 喺 Phase A apply(讚美之泉「從早晨到夜晚」候選 playlist)
// 俾誤填咗 album=「從早晨到夜晚」——根因係嗰個 playlist 尾巴混入咗一條唔相關
// 嘅片(「粵語天堂敬拜 Acoustic｜讚美之泉 寧靜藍 Serenity 敬拜系列」,org=ACM,
// 睇個 title 明顯唔屬於「從早晨到夜晚」呢隻專輯),Opus 5 抽驗 905+25 首
// 揪出呢一條錯。
//
// 呢個 script 淨係做一件事,一次性:id=735 嘅 album 清空 + album_source
// 改做 'manual'(空值 + manual = 人手判定「呢條片冇專輯」,配合
// ALBUM-BACKFILL-ACCEL-PLAN.md 必修①嘅 protected-source guard,以後 Phase
// A/B/C 都唔會再重新填返呢個錯名)。經 acquireDbLock,唔用 raw sqlite3 CLI
// UPDATE(hymnDb 寫操作硬規矩)。
//
// Usage:
//   node scripts/oneoff-clearAlbum735.js

import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const TARGET_ID = 735;

async function main() {
  const token = await acquireDbLock('oneoff-clearAlbum735');
  if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
  try {
    const db = await openDb();
    const before = query(db, 'SELECT id, title, org, album, album_source, youtube_id FROM hymns_all WHERE id = ?', [TARGET_ID])[0];
    if (!before) { console.error(`搵唔到 id=${TARGET_ID}`); process.exit(1); }
    console.log('清走之前:', JSON.stringify(before));

    db.run("UPDATE hymns_all SET album = '', album_source = 'manual' WHERE id = ?", [TARGET_ID]);
    saveDb(db);

    const after = query(db, 'SELECT id, title, org, album, album_source, youtube_id FROM hymns_all WHERE id = ?', [TARGET_ID])[0];
    console.log('清走之後:', JSON.stringify(after));
  } finally {
    releaseDbLock(token);
  }
}

main().catch((e) => { console.error('oneoff-clearAlbum735 出錯:', e); process.exit(1); });
