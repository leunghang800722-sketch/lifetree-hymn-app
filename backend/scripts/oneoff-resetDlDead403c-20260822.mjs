#!/usr/bin/env node
// 一次性 **第三批**:reset 8/20–8/21 判嘅 53 首 `dl:dead`(Eric 2026-08-22 拍板)。
//
// Eric 原本嘅指示係「搵返替代 YouTube 連結,搵唔返就落架」。**但實測推翻咗個前提:**
//   1. 53 首全部 `fail_streak = 0` —— 即係每晚 `checkDeadLinks` 話啲連結**冇死**。
//      (`dl:dead` 只係我哋自己「落載失敗 3 次」嘅標籤,唔等於條 link 死咗。)
//   2. 隨機抽 8 首用 nightly yt-dlp 真落載:**8/8 全部成功**(9.1M–21M)。
// 即係話唔使搵替代、更加唔應該落架 —— 落架咗就係白白剷走 53 首好歌。
//
// 點解會喺 8/20–21 判死:嗰兩日正正係**模擬器搶 CPU** 嗰段時間(Xcode build +
// 播放實測),OCR pipeline 同佢爭資源,落載 timeout(300s)容易撞到;加上零散 403
// (未夠 5 次連續,觸發唔到全域封鎖掣)照樣會逐首記賬,三次就判死。
//
// 所以照前兩批做法 reset。真係壞嘅片會自然再失敗三次、再攞返個 dl:dead 標籤,
// 到時先至係真候選 —— 嗰陣先值得花 WebSearch 額度去搵替代片源。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = path.join(__dirname, '..', 'data', 'lyrics-dl-failures.json');
const OUT = path.join(__dirname, '..', 'data', 'dl-dead-reset-20260822.json');
const DRY = process.argv.includes('--dry');
const STORM_DATES = ['2026-08-20', '2026-08-21'];

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const token = await acquireDbLock('oneoff-resetDlDead403c');
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
