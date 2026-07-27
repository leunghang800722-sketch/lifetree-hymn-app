#!/usr/bin/env node
// 歌詞 STAGE 3「音訊次序驗證層」遷移。一次性,行一次就得(可重複行,ALTER 會 skip)。
//
// 加一個欄落 hymns_all:
//   lyrics_timeline   JSON,存 OCR/whisper 嘅時間軸原始資料,俾 alignLyrics.js 用嚟
//                     重建「實際演唱次序」。格式:
//                       {
//                         "ocr":     [{ "t": 秒數(frame 落嘅位置), "text": "…" }, …],
//                         "whisper": [{ "t0": 開始秒, "t1": 結束秒, "text": "…" }, …],
//                         "model":   "small" | "medium",
//                         "updatedAt": ISO timestamp
//                       }
//                     ocr/whisper 兩個陣列可以各自得一半(例如新歌 fetchLyrics 一
//                     run齊有,backfill 之前嘅舊歌可能淨係得 whisper)。
//
// 呢個欄純粹係「對齊用嘅原始材料」,唔係最終歌詞——`lyrics`/`lyrics_draft` 兩個
// 欄嘅語意完全冇變。alignLyrics.js 讀呢個欄 + lyrics_draft 計出嚟嘅「演唱次序版」
// 淨係入 report,唔會自動寫返 `lyrics_draft`(校對 session 揀啱先落實)。

import { openDb, saveDb, query } from '../lib/hymnDb.js';

const COLS = [
  ['lyrics_timeline', 'TEXT'],
];

async function main() {
  const db = await openDb();
  for (const [name, type] of COLS) {
    try { db.run(`ALTER TABLE hymns_all ADD COLUMN ${name} ${type}`); console.log('✓ added', name); }
    catch (e) { console.log('· skip', name, '(' + (e?.message || '') + ')'); }
  }
  saveDb(db);

  const total = query(db, `SELECT COUNT(*) n FROM hymns_all
                           WHERE lyrics_status IN ('draft','verified') AND lyrics_source != 'manual'`)[0];
  const withTimeline = query(db, `SELECT COUNT(*) n FROM hymns_all
                           WHERE lyrics_status IN ('draft','verified') AND lyrics_source != 'manual'
                             AND lyrics_timeline IS NOT NULL AND TRIM(lyrics_timeline) != ''`)[0];
  console.log(`\n候選(draft/verified、source!=manual):${total.n} 首,已有 timeline:${withTimeline.n} 首`);
  console.log(`等 backfill(scripts/alignBackfill.js)嘅:${total.n - withTimeline.n} 首`);
}

main().catch((e) => { console.error('migrate-lyrics-timeline 出錯:', e); process.exit(1); });
