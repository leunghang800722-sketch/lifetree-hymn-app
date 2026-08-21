#!/usr/bin/env node
// 一次性 **第二批**:reset 2026-08-16/17 判嘅 `dl:dead`(Eric 2026-08-21 拍板)。
//
// 點解呢批都係冤枉:8/19 查實 403 嘅真根因係 **yt-dlp stable 2026.07.04 太舊**
// (YouTube 8/18 起唔再派 format 18),換咗 nightly + DASH format 之後即刻 6/6 通。
// 但 dl:dead 呢個判死機制**由 8/16 就開始行緊**,即係 8/16(75 首)同 8/17(106 首)
// 嗰 181 首,好可能同 8/18-19 嗰 685 首一樣係俾舊 client 個 bug 冤枉,唔係真死片。
// (8/20-21 嗰 53 首係新引擎之下先判嘅,**唔郁** —— 嗰啲先係真落唔到。)
//
// 做法同第一批一樣,兩步缺一不可:DB `dl:dead`→`cc:miss` + 清 dl-failures ledger。
//
// 背景:8/18–8/19 yt-dlp 落載全線 HTTP 403 Forbidden(用已知好片 gF-eDlXq3II 對照
// 實測:--list-subs 完全正常,-f 18 真落載即刻 403)。fetchLyrics 個 dl-failures
// ledger 設計成「同一首失敗 3 次就寫 lyrics_source='dl:dead' 永久踢出 OCR 隊」——
// 呢個設計假設咗失敗係**逐首**嘅問題,但今次係**全域性**封鎖,結果將大批完全冇
// 問題嘅片判死。
//
// 呢個 script 做兩件事(缺一不可):
//   1. DB:`lyrics_source` 由 'dl:dead' 改返 'cc:miss'(status 本身一直係 'none',
//      唔使郁)—— 咁 pickOcrCandidates 先揀返佢哋。
//   2. **ledger:同時清走 backend/data/lyrics-dl-failures.json 入面嗰啲 id** ——
//      唔清嘅話 filterByDlLedger() 見到 fails>=3 一樣會喺 loop 之前剔走佢哋,
//      DB 改咗都冇用(呢個係最易漏嘅一步)。
//
// 只 reset 風暴期(lyrics_checked_at 係 2026-08-18 或 2026-08-19)嗰批;
// 8/16–8/17 嗰 181 首係風暴之前判嘅,唔郁(嗰啲有可能係真死片)。
//
// reset 咗嘅 id 會寫低落 backend/data/dl-dead-reset-20260821.json,方便之後追蹤
// 佢哋究竟落唔落到 draft(Eric 要求)。
//
// 用法:node scripts/oneoff-resetDlDead403-20260819.mjs [--dry]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(__dirname, '..', 'data', 'lyrics-dl-failures.json');
const OUT = path.join(__dirname, '..', 'data', 'dl-dead-reset-20260821.json');
const DRY = process.argv.includes('--dry');
const STORM_DATES = ['2026-08-16', '2026-08-17'];

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const token = await acquireDbLock('oneoff-resetDlDead403b');
if (!token) { log('⛔ 攞唔到 DB 鎖,乜都冇做'); process.exit(1); }

try {
  const db = await openDb();
  const rows = query(db, `SELECT id, title, artist, lyrics_status, lyrics_checked_at
                          FROM hymns_all
                          WHERE curated=1 AND status!='dead' AND lyrics_source='dl:dead'
                            AND lyrics_checked_at IN (${STORM_DATES.map((d) => `'${d}'`).join(',')})`);
  log(`風暴期(${STORM_DATES.join(' / ')})俾判 dl:dead 嘅歌:${rows.length} 首`);

  const byDate = {};
  for (const r of rows) byDate[r.lyrics_checked_at] = (byDate[r.lyrics_checked_at] || 0) + 1;
  for (const [d, n] of Object.entries(byDate)) log(`   ${d}: ${n} 首`);

  const ids = rows.map((r) => r.id);
  if (!DRY && ids.length) {
    for (const id of ids) db.run(`UPDATE hymns_all SET lyrics_source='cc:miss' WHERE id=?`, [id]);
    saveDb(db);
    log(`✓ DB:${ids.length} 首 lyrics_source 由 dl:dead 改返 cc:miss(status 冇郁,一直都係 none)`);
  }

  // 第 2 步:清 ledger,唔清嘅話 filterByDlLedger 一樣會剔走佢哋
  let cleared = 0;
  try {
    const led = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    for (const id of ids) if (led[String(id)]) { delete led[String(id)]; cleared++; }
    if (!DRY) fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2), 'utf8');
    log(`✓ ledger:清走 ${cleared} 條失敗紀錄(淨低 ${Object.keys(led).length} 條)`);
  } catch (e) {
    log(`⚠ 清 ledger 出錯:${e?.message || e} —— DB 改咗但 ledger 未清,佢哋仍然會俾 filter 剔走!`);
  }

  if (!DRY) {
    fs.writeFileSync(OUT, JSON.stringify({
      note: '2026-08-19 403 風暴錯判 dl:dead → reset 返 cc:miss(Eric 拍板)。留低個名單方便追蹤佢哋之後落唔落到 draft。',
      resetAt: new Date().toISOString(),
      stormDates: STORM_DATES,
      count: ids.length,
      ledgerEntriesCleared: cleared,
      ids,
    }, null, 1), 'utf8');
    log(`→ 名單寫咗落 ${OUT}`);
  }
  log(`${DRY ? '[dry] ' : ''}完成:${ids.length} 首`);
} finally {
  releaseDbLock(token);
}
