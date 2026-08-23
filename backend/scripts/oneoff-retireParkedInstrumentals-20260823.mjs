#!/usr/bin/env node
// 純音樂 Phase 1 / T3 ledger 同步 —— INSTRUMENTAL-PHASE1-EXEC-20260821.md §3.3
//
// 「改 DB 但唔清 ledger 等於冇改」(`oneoff-resetDlDead403-20260819.mjs:12-16`
// 教訓)。T3 落咗 `instrumental=1` 之後,三份 ledger 要跟手清:
//
//  1. `data/lyrics-requeue-priority.json` 個 `parkedInstrumentals` key 整體移除
//     —— 嗰 7 首(5699/5700/5794/5795/5799/5801/6734)Eric 2026-08-16 講「純音樂
//     擱置唔好理」,而家由 `instrumental` flag 正式接手,唔使再靠一個手寫名單擋。
//     (執行前已核實:7 首全部喺 T3 回標名單入面。)
//  2. 同一份檔嘅 `ids`(重做隊)清走已回標嘅 id —— 佢哋唔會再入重做隊。
//  3. `data/lyrics-dl-failures.json` 清走已回標嘅 id —— 落片失敗紀錄冇意義,
//     呢啲歌根本唔再需要落片攞歌詞。
//
// 冪等:再行一次零改動。`--dry` 只出 report。
//
// 用法:node scripts/oneoff-retireParkedInstrumentals-20260823.mjs [--dry]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const DRY = process.argv.includes('--dry');
const log = (...a) => console.log(...a);

const applyPath = path.join(DATA, 'instrumental', 'apply-20260823.json');
const flagged = new Set(JSON.parse(fs.readFileSync(applyPath, 'utf8')).map((x) => x.id));
log(`T3 回標名單:${flagged.size} 首`);

// ── 1 + 2:lyrics-requeue-priority.json ────────────────────────
const prPath = path.join(DATA, 'lyrics-requeue-priority.json');
const pr = JSON.parse(fs.readFileSync(prPath, 'utf8'));
let prChanged = false;

if (pr.parkedInstrumentals) {
  const parked = pr.parkedInstrumentals.ids || [];
  const missing = parked.filter((id) => !flagged.has(id));
  if (missing.length) {
    console.error(`⛔ parkedInstrumentals 有 ${missing.length} 首唔喺 T3 回標名單(${missing.join(', ')}),唔敢移除個 key`);
    process.exit(1);
  }
  log(`移除 parkedInstrumentals(${parked.length} 首:${parked.join(', ')})—— 由 instrumental flag 接手`);
  delete pr.parkedInstrumentals;
  prChanged = true;
} else {
  log('parkedInstrumentals 已經冇咗(冪等)');
}

const beforeIds = pr.ids || [];
const afterIds = beforeIds.filter((id) => !flagged.has(id));
if (afterIds.length !== beforeIds.length) {
  log(`重做隊 ids:${beforeIds.length} → ${afterIds.length}(清走 ${beforeIds.filter((id) => flagged.has(id)).join(', ')})`);
  pr.ids = afterIds;
  prChanged = true;
} else {
  log('重做隊 ids 冇回標 id 殘留(冪等)');
}

if (prChanged) {
  pr.updatedAt = new Date().toISOString();
  pr.note = `${pr.note} | 2026-08-23 純音樂 Phase 1 T3:parkedInstrumentals 退役,改由 hymns_all.instrumental flag 接手`;
  if (!DRY) fs.writeFileSync(prPath, `${JSON.stringify(pr, null, 2)}\n`);
  log(DRY ? '[dry] 唔會寫 lyrics-requeue-priority.json' : '✓ 寫咗 lyrics-requeue-priority.json');
}

// ── 3:lyrics-dl-failures.json ─────────────────────────────────
const dfPath = path.join(DATA, 'lyrics-dl-failures.json');
const dfBefore = fs.statSync(dfPath).mtimeMs;
const df = JSON.parse(fs.readFileSync(dfPath, 'utf8'));
const hit = Object.keys(df).filter((k) => flagged.has(Number(k)));
if (hit.length) {
  log(`lyrics-dl-failures 清走 ${hit.length} 條:${hit.join(', ')}`);
  for (const k of hit) delete df[k];
  if (!DRY) {
    // ⚠️ 呢份檔係 fetchLyrics 跑住嗰陣會寫嘅,寫之前再核一次 mtime,
    // 撞正人哋寫緊就唔好蓋(下次再行,冪等)
    if (fs.statSync(dfPath).mtimeMs !== dfBefore) {
      console.error('⛔ lyrics-dl-failures.json 喺我讀完之後有人改過,唔敢蓋 —— 遲啲再行一次');
      process.exit(1);
    }
    fs.writeFileSync(dfPath, `${JSON.stringify(df, null, 2)}\n`);
    log('✓ 寫咗 lyrics-dl-failures.json');
  } else {
    log('[dry] 唔會寫 lyrics-dl-failures.json');
  }
} else {
  log('lyrics-dl-failures 冇回標 id 殘留(冪等)');
}
