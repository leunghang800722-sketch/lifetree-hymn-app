#!/usr/bin/env node
// 歌詞 pipeline 遷移 —— LYRICS-PIPELINE-PLAN §3b。一次性,行一次就得(可重複行,ALTER 會 skip)。
//
// 加 4 個欄落 hymns_all:
//   lyrics_source     cc / ocr / whisper / official / manual  (draft 有草稿之後 = 真來源;
//                     status='none' 但 source='cc:miss' = CC 試過冇,等 OCR 接手)
//   lyrics_status     none(未做)/ draft(有草稿未校)/ verified(已校,先出街)/ unavailable
//   lyrics_draft      草稿區,唔會出街(前端只讀 `lyrics`)
//   lyrics_checked_at 上次試過幾時(節流,唔好夜夜重試同一首)
//
// 現有 10 首人手歌詞 → 直接標 verified / manual(佢哋本身就喺 `lyrics` 欄,前端睇到)。
//
// ⚠️ `hymns` view 係 SELECT *,喺 view 建立之後先 ADD 嘅欄唔會入 view —— 但呢個
//    pipeline 全部用 hymns_all,前端只讀 view 個 `lyrics`(view 本身有),所以唔使重建 view。

import { openDb, saveDb, query } from '../lib/hymnDb.js';

const COLS = [
  ['lyrics_source', 'TEXT'],
  ['lyrics_status', "TEXT DEFAULT 'none'"],
  ['lyrics_draft', 'TEXT'],
  ['lyrics_checked_at', 'TEXT'],
];

async function main() {
  const db = await openDb();
  for (const [name, type] of COLS) {
    try { db.run(`ALTER TABLE hymns_all ADD COLUMN ${name} ${type}`); console.log('✓ added', name); }
    catch (e) { console.log('· skip', name, '(' + (e?.message || '') + ')'); }
  }
  // 現有人手歌詞 → verified / manual
  db.run(`UPDATE hymns_all SET lyrics_status='verified', lyrics_source='manual'
          WHERE lyrics IS NOT NULL AND TRIM(lyrics) != ''`);
  saveDb(db);

  const rows = query(db, `SELECT lyrics_status, COUNT(*) n FROM hymns_all GROUP BY lyrics_status`);
  console.log('\nlyrics_status 分佈:');
  for (const r of rows) console.log('  ', r.lyrics_status, '→', r.n);
  const curated = query(db, `SELECT COUNT(*) n FROM hymns_all WHERE curated=1 AND status!='dead' AND (lyrics_status IS NULL OR lyrics_status='none')`)[0];
  console.log('\ncurated 未有歌詞、排入隊列嘅:', curated.n, '首');
}

main().catch((e) => { console.error('migrate-lyrics 出錯:', e); process.exit(1); });
