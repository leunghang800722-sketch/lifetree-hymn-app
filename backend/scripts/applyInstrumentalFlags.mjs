#!/usr/bin/env node
// 純音樂 Phase 1 / T3 —— INSTRUMENTAL-PHASE1-EXEC-20260821.md §3.3
//
// 將 T2(`scanInstrumentalCandidates.mjs`)出嘅回標名單寫落 DB。安全 pattern
// 照抄 `ops/lyrics/delist-batch.mjs`:輸入 `[{id, reason}]`(reason 必填,原文
// 寫入 log 做審計線索)、`--dry` 先出 before/after、冪等(再行一次零改動)、
// 逐條 log。
//
// 每條寫:
//   UPDATE hymns_all SET instrumental = 1,
//     lyrics_status = 'unavailable',   -- 只限原值唔係 'verified'(下面硬 gate)
//     lyrics_source = 'instrumental'
//   WHERE id = ?
//
// 硬 gate(任何一條中咗就 skip 唔寫,log 出嚟):
//   · `lyrics_status = 'verified'` —— 保護「器樂版但片上打晒歌詞字幕」嗰類
//     (3959/3976/3984/8033/8035;8033 仲救返過原曲 7721,見 SUPERVISION-LOG:6181)
//   · `lyrics` 欄有文本 —— 同上,雙保險
//   · `lyrics_status = 'draft'` —— 四條複核線(R1/R1b/R2/R2b)手頭活貨,
//     唔喺人哋隊列中間抽歌
//   · id 唔存在 / 已落架(curated≠1 或 status≠'ok')
//
// 紀律:
//   · 鎖內由碟 fresh openDb → 逐條 UPDATE → saveDb → 放鎖。慢工序(讀檔、
//     核對名單)全部鎖外做完先攞鎖(`fetchLyrics.js:20-38` 血淚註解)
//   · **長片照標**:739(57:58)、5065 呢類已上架長器樂片照落 flag —— Q2 個
//     10 分鐘上限係**新歌入庫**嘅 gate,唔係存量;呢啲歌今日已經咁樣播緊,
//     回標零行為改變(長檔串流應對係 Phase 3/5 嘅事)
//
// 用法:node scripts/applyInstrumentalFlags.mjs <list.json> [--dry]

import fs from 'fs';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const FILE = process.argv[2];
const DRY = process.argv.includes('--dry');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

if (!FILE) { log('用法:node scripts/applyInstrumentalFlags.mjs <list.json> [--dry]'); process.exit(1); }
if (!fs.existsSync(FILE)) { log(`搵唔到檔案:${FILE}`); process.exit(1); }

let items;
try { items = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch (e) { log(`JSON 格式錯:${e?.message || e}`); process.exit(1); }
if (!Array.isArray(items) || !items.length) { log('檔案要係非空嘅 [{id, reason}] 陣列'); process.exit(1); }

const bad = items.filter((it) => !Number.isInteger(it?.id) || !String(it?.reason || '').trim());
if (bad.length) {
  log(`${bad.length} 條缺 id 或者 reason(reason 係審計要求,唔准留空),成個檔唔跑:`);
  for (const b of bad) log(`   ${JSON.stringify(b)}`);
  process.exit(1);
}
const dupes = items.map((x) => x.id).filter((id, i, arr) => arr.indexOf(id) !== i);
if (dupes.length) { log(`名單有重覆 id:${[...new Set(dupes)].join(', ')},成個檔唔跑`); process.exit(1); }

(async () => {
  const token = await acquireDbLock('applyInstrumentalFlags');
  if (!token) { log('攞唔到 DB 鎖,收工'); process.exit(1); }

  let wrote = 0, already = 0, skipped = 0;
  const skips = [];
  try {
    const db = await openDb();
    for (const { id, reason } of items) {
      const row = query(db, 'SELECT id, title, curated, status, instrumental, lyrics_status, lyrics_source, TRIM(COALESCE(lyrics,\'\')) AS lyr FROM hymns_all WHERE id = ?', [id])[0];
      if (!row) { skipped++; skips.push(`${id}:DB 冇呢個 id`); continue; }
      if (row.curated !== 1 || row.status !== 'ok') { skipped++; skips.push(`${id}:curated=${row.curated} status=${row.status},唔喺上架範圍`); continue; }
      if (row.lyrics_status === 'verified') { skipped++; skips.push(`${id}:lyrics_status=verified,硬 gate 擋住`); continue; }
      if (row.lyr) { skipped++; skips.push(`${id}:\`lyrics\` 欄有 ${row.lyr.length} 字出街歌詞,硬 gate 擋住`); continue; }
      if (row.lyrics_status === 'draft') { skipped++; skips.push(`${id}:lyrics_status=draft(複核線活貨),硬 gate 擋住`); continue; }

      const before = { instrumental: row.instrumental, lyrics_status: row.lyrics_status, lyrics_source: row.lyrics_source };
      const after = { instrumental: 1, lyrics_status: 'unavailable', lyrics_source: 'instrumental' };
      const same = before.instrumental === 1 && before.lyrics_status === 'unavailable' && before.lyrics_source === 'instrumental';
      if (same) { already++; log(`· ${id} 早就標咗(冪等)—— ${row.title?.slice(0, 40)}`); continue; }

      if (DRY) { log(`[dry] ${id} ${JSON.stringify(before)} → ${JSON.stringify(after)} —— ${reason}`); wrote++; continue; }
      db.run("UPDATE hymns_all SET instrumental = 1, lyrics_status = 'unavailable', lyrics_source = 'instrumental' WHERE id = ?", [id]);
      wrote++;
      log(`✓ ${id} ${JSON.stringify(before)} → ${JSON.stringify(after)} —— ${reason}`);
    }

    if (!DRY && wrote) {
      // 寫落碟之前再核一次:verified 一條都唔可以俾我哋郁到
      const hurt = query(db, "SELECT COUNT(*) AS c FROM hymns_all WHERE instrumental = 1 AND lyrics_status = 'verified'")[0];
      if (hurt.c > 0) throw new Error(`有 ${hurt.c} 首 verified 俾標成 instrumental,唔敢寫落碟`);
      saveDb(db);
      log('已寫落碟');
    } else if (!DRY) {
      log('零改動,唔使寫碟');
    }
  } finally {
    releaseDbLock(token);
  }

  if (skips.length) { log(`--- skip 咗 ${skips.length} 條 ---`); for (const s of skips) log(`   ⊘ ${s}`); }
  log(`完成${DRY ? '(dry)' : ''}:寫入 ${wrote} 首,本身已標 ${already} 首,skip ${skipped} 首(共 ${items.length})`);
})().catch((e) => { console.error('applyInstrumentalFlags 出錯:', e); process.exit(1); });
