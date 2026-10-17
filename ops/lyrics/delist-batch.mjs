#!/usr/bin/env node
// 批量落架「明確非歌內容」——LYRICS-47H-SPRINT-PLAN §P0.4。
//
// 衝刺期間各班複核 draft 嗰陣會撞到訪問/教學/花絮/巡迴紀錄/幕後/單句短講呢類
// 根本唔係歌嘅片。標準做法(Eric 2026-08-09 拍板,見 memory
// feedback-nonsong-autonomous-delist):**明確個案直接落架唔使問**,模糊個案先
// 留低問 Eric。呢個 script 就係俾班次唔使每次抄一份 oneoff-delist*.mjs。
//
// ⚠️ 唔好攞嚟處理「底本救唔返」嘅歌 —— 嗰啲係 reviewLyrics.js --apply
//    {id, unusable:true},唔係落架。呢度淨係處理「內容根本唔係歌」。
//
// 用法:
//   node ops/lyrics/delist-batch.mjs <list.json> [--dry]
//
// <list.json> 格式(reason 必填,會原文寫入 log 做審計線索):
//   [ { "id": 7624, "reason": "專輯製作花絮訪談,唔係歌" }, ... ]
//
// delistHymn() 自己行 withLock + 冪等(已落架嘅會 idempotent:true),亦會觸發
// server reloadDb() —— 副作用係順手令啱 apply 嘅歌詞即時生效,係 bonus 唔係 bug。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { delistHymn } from '../../backend/lib/adminHymns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const FILE = process.argv[2];
const DRY = process.argv.includes('--dry');

if (!FILE) { log('用法:node ops/lyrics/delist-batch.mjs <list.json> [--dry]'); process.exit(1); }
if (!fs.existsSync(FILE)) { log(`搵唔到檔案:${FILE}`); process.exit(1); }

let items;
try {
  items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  log(`JSON 格式錯:${e?.message || e}`); process.exit(1);
}
if (!Array.isArray(items) || !items.length) { log('檔案要係非空嘅 [{id, reason}] 陣列'); process.exit(1); }

const bad = items.filter((it) => !Number.isInteger(it?.id) || !String(it?.reason || '').trim());
if (bad.length) {
  log(`${bad.length} 條缺 id 或者 reason(reason 係審計要求,唔准留空),成個檔唔跑:`);
  for (const b of bad) log(`   ${JSON.stringify(b)}`);
  process.exit(1);
}

(async () => {
  let done = 0, already = 0, failed = 0;
  for (const { id, reason } of items) {
    if (DRY) { log(`[dry] 會落架 ${id} —— ${reason}`); done++; continue; }
    try {
      const r = await delistHymn(id);
      if (r.idempotent) { already++; log(`· ${id} 早就落咗架(冪等)—— ${reason}`); }
      else { done++; log(`✓ 落架 ${id}:before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} —— ${reason}`); }
    } catch (e) {
      failed++;
      log(`✗ ${id} 落架失敗:${e?.message || e}`);
    }
  }
  log(`完成:落架 ${done} 首,本身已落架 ${already} 首,失敗 ${failed} 首(共 ${items.length})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('delist-batch 出錯:', e); process.exit(1); });
