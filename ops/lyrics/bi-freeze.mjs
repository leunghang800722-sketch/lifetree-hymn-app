#!/usr/bin/env node
// 「中文歌配英文歌詞」扣起 —— Eric 2026-08-16 朝早拍板(全面扣起)。
//
// ⚠️ 2026-08-16 下晝更新:Fable 5 根因診斷完(LYRICS-CJK-OCR-ROOTCAUSE-PLAN),
// Eric 拍板「跟官方——雙語對照照出街」。所以判定式改咗行級(見下面 import):
// 中英對照(CJK 行齊)唔再凍結,凍結剩返「真·中文歌但幾乎冇中文行」+
// 「亂碼淹沒嘅爛 draft」兩類 —— 嗰啲行 §P4 重做隊列,唔係俾班次 apply。
//
// 決定原文:**完全拒絕「中文歌配英文歌詞」呢種做法,唔可以為咗衝數字而做。**
// 唔止係舊嗰單 55/263 首,係全面政策。hold 池嗰批 + draft 入面嗰批,一律
// **維持扣起**:唔准 apply、唔准當 verified 出街、亦**唔准判 unusable**
// (底本冇罪,係我哋攞唔到準確中文歌詞)。等另一條線(Fable 5 session
// local_00518844)診斷返點解中文字幕 OCR 成日失敗、搵到真正攞到準確中文
// 歌詞嘅方法(換 OCR 引擎 / 改預處理 / whisper 聽譯替代)先再處理呢批積壓。
//
// 呢個 script 將個決定**機械化**,唔靠各班自律:
//   --refresh   掃 draft + hold 池,寫 backend/data/lyrics-bi-frozen.json(凍結 id 名單)
//   --count     印「真正可做嘅 draft 數」(draft 總數 − 凍結),俾 keeper 判斷使唔使
//               繼續出貨(唔可以俾凍結貨塞爆隊列之後就熄咗 producer)
//   --filter <export.json> --out <dir>  將一個 reviewLyrics --export 檔拆做
//               <dir>/actionable.json(可做)同 <dir>/frozen.json(扣起,唔好讀)
//               —— 呢個係慳額度嘅關鍵:班次唔應該花 token 讀完先發現出唔到街。
//
// 判定式(同 auditLyricsBatch.js 個擋板一致):lang ∈ {國語,粵語,兒童}
// 而 draft 入面拉丁字母數 > CJK 字數。lang='英文' 嘅歌唔受影響。

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(__dirname, '..', '..', 'backend');
const DB = path.join(BACKEND, 'hymns.db');
const FROZEN = path.join(BACKEND, 'data', 'lyrics-bi-frozen.json');
const HOLD = path.join(BACKEND, 'data', 'lyrics-langmismatch-hold.json');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// 2026-08-16 改行級判定(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P0,Eric 拍板):
// 雙語對照(CJK 行佔比 ≥35%)唔再算 blocked ——「跟官方,雙語照出街」。
// 判定式共用 backend/lib/lyricsLangCheck.js,唔准喺度再抄一份公式。
import { langMismatchReason } from '../../backend/lib/lyricsLangCheck.js';
export const isBilingualBlocked = (lang, text) => !!langMismatchReason(lang, text);

async function queryDb(sql) {
  const { stdout } = await execFileP('sqlite3', ['-json', `file:${DB}?mode=ro`, sql], { maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout || '[]');
}

function readHoldIds() {
  try {
    const j = JSON.parse(fs.readFileSync(HOLD, 'utf8'));
    const arr = Array.isArray(j) ? j : (j.entries || []);
    return arr.map((e) => Number(e.id)).filter(Number.isInteger);
  } catch (_) { return []; }
}

async function refresh() {
  const rows = await queryDb(`SELECT id, lang, lyrics_draft FROM hymns_all
                              WHERE curated=1 AND status!='dead' AND lyrics_status='draft'`);
  const fromDraft = rows.filter((r) => isBilingualBlocked(r.lang, r.lyrics_draft)).map((r) => r.id);
  const fromHold = readHoldIds();
  const ids = [...new Set([...fromDraft, ...fromHold])].sort((a, b) => a - b);
  const data = {
    policy: 'Eric 2026-08-16 拍板:中文歌配英文歌詞全面拒絕,呢批一律扣起,唔准 apply / 唔准 verified / 唔准 unusable,等新方法出嚟先再處理',
    generatedAt: new Date().toISOString(),
    stats: { draftTotal: rows.length, frozenFromDraft: fromDraft.length, frozenFromHold: fromHold.length, frozenTotal: ids.length,
             actionableDrafts: rows.length - fromDraft.length },
    ids,
  };
  fs.writeFileSync(`${FROZEN}.tmp`, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(`${FROZEN}.tmp`, FROZEN);
  log(`draft 總數 ${rows.length} → 凍結 ${fromDraft.length} 首(draft 本身英文為主)+ hold 池 ${fromHold.length} 條,合共 ${ids.length} 個 id`);
  log(`**真正可做嘅 draft:${data.stats.actionableDrafts} 首**`);
  log(`→ ${FROZEN}`);
}

function loadFrozenIds() {
  try { return new Set(JSON.parse(fs.readFileSync(FROZEN, 'utf8')).ids || []); } catch (_) { return new Set(); }
}

async function count() {
  const rows = await queryDb(`SELECT id, lang, lyrics_draft FROM hymns_all
                              WHERE curated=1 AND status!='dead' AND lyrics_status='draft'`);
  // 即場算,唔靠可能過時嘅名單檔 —— keeper 每 5 分鐘叫一次,要準。
  console.log(String(rows.filter((r) => !isBilingualBlocked(r.lang, r.lyrics_draft)).length));
}

function filterExport(file, outDir) {
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  const frozenIds = loadFrozenIds();
  const actionable = [], frozen = [];
  for (const it of items) {
    const blocked = frozenIds.has(it.id) || isBilingualBlocked(it.lang, it.draft || it.lyrics_draft || '');
    (blocked ? frozen : actionable).push(it);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const a = path.join(outDir, 'actionable.json'), f = path.join(outDir, 'frozen.json');
  fs.writeFileSync(a, JSON.stringify(actionable, null, 2), 'utf8');
  fs.writeFileSync(f, JSON.stringify(frozen, null, 2), 'utf8');
  log(`${items.length} 條 → 可做 ${actionable.length} 條、扣起 ${frozen.length} 條`);
  log(`  → ${a}(淨係讀呢個)`);
  log(`  → ${f}(唔好讀、唔好 apply —— 讀咗都出唔到街,純粹燒額度)`);
}

const FILE = arg('--filter', null);
if (process.argv.includes('--refresh')) await refresh();
else if (process.argv.includes('--count')) await count();
else if (FILE) filterExport(FILE, arg('--out', path.join(path.dirname(FILE), 'bi-split')));
else {
  console.log('用法:node ops/lyrics/bi-freeze.mjs --refresh | --count | --filter <export.json> [--out <dir>]');
  process.exit(1);
}
