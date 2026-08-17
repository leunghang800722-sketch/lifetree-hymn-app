#!/usr/bin/env node
// 一次性止血:21 首「一邊排住重做隊、一邊仲餵緊英文歌詞出街」嘅個案,剷走 `lyrics` 欄。
//
// 背景(2026-08-17,Eric 批准):47H 衝刺收尾核數揾到呢 21 首處於矛盾狀態 ——
// `lyrics` 欄有英文歌詞(而首歌係中文歌)仲喺 live 出緊街,但 `lyrics_status` 已經
// 俾中文 OCR 根因線改咗做 'none'(18 首)/ 'draft'(3 首)入咗重做隊。即係一邊
// 等重做,一邊繼續餵錯嘢俾用戶。Eric 2026-08-16 政策:**完全拒絕「中文歌配英文
// 歌詞」**,所以呢批要即刻止血。
//
// 只改 `lyrics` 一個欄 —— **唔郁** `lyrics_status` / `lyrics_draft` /
// `lyrics_checked_at`,所以重做隊嘅排序同底本完全唔受影響(Eric 明確要求)。
//
// ⚠️ 一定要行呢個 script,唔可以用 raw sqlite3 CLI 改 —— hymns.db 隨時有並行 job
//    (growLibrary / fetchLyrics)揸住成個 DB 喺記憶體,佢哋 saveDb() 就會靜靜哋
//    覆寫返你 CLI 改嘅嘢。要行返 hymnDb.js 個鎖。
//
// 用法:node scripts/oneoff-clearBiLiveLyrics-20260817.mjs [--dry]

import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const DRY = process.argv.includes('--dry');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// SUPERVISION-LOG 2026-08-17 11:15 段落列低嗰 21 個 id(原文照抄)
const IDS = [1857, 3527, 3720, 4094, 4098, 5702, 5902, 6000, 6059, 6564, 6601,
             6712, 6822, 6861, 6989, 7113, 7129, 7538, 7752, 7804, 7982];

const CJK_LANGS = new Set(['國語', '粵語', '兒童']);
const cjk = (s) => ((s || '').match(/[㐀-鿿]/g) || []).length;
const lat = (s) => ((s || '').match(/[A-Za-z]/g) || []).length;

const token = await acquireDbLock('oneoff-clearBiLiveLyrics');
if (!token) { log('⛔ 攞唔到 DB 鎖(等到上限),乜都冇做,遲啲再試'); process.exit(1); }

try {
  const db = await openDb();
  const rows = query(db, `SELECT id, title, lang, lyrics_status, lyrics, lyrics_draft
                          FROM hymns_all WHERE id IN (${IDS.join(',')})`);
  let cleared = 0, skipped = 0;
  for (const r of rows) {
    // 逐首重驗先郁 —— 隔咗一段時間,狀態可能已經變(例如根因線重做完 verify 咗)
    const hasLyrics = !!(r.lyrics || '').trim();
    const isBi = CJK_LANGS.has(r.lang) && lat(r.lyrics) > cjk(r.lyrics);
    const inRedo = r.lyrics_status !== 'verified';
    if (!hasLyrics || !isBi || !inRedo) {
      skipped++;
      log(`· skip ${r.id}(狀態已變:有詞=${hasLyrics} BI=${isBi} 非verified=${inRedo} status=${r.lyrics_status})`);
      continue;
    }
    if (!(r.lyrics_draft || '').trim()) {
      // 冇 draft 底本就唔好剷 —— 剷咗就真係乜都冇,重做都冇得參照
      skipped++;
      log(`· skip ${r.id}(冇 lyrics_draft 底本,剷咗會蝕晒,留返俾人手處理)`);
      continue;
    }
    if (!DRY) db.run(`UPDATE hymns_all SET lyrics=NULL WHERE id=?`, [r.id]);
    cleared++;
    log(`${DRY ? '[dry] 會剷' : '✓ 剷咗'} ${r.id} [${r.lang}/${r.lyrics_status}] ${String(r.title).slice(0, 40)}(原本 ${cjk(r.lyrics)} 中文字 / ${lat(r.lyrics)} 英文字母)`);
  }
  if (!DRY && cleared) saveDb(db);
  log(`${DRY ? '[dry] ' : ''}完成:剷咗 ${cleared} 首,skip ${skipped} 首(共 ${rows.length} 首,清單 ${IDS.length} 個 id)`);
} finally {
  releaseDbLock(token);
}
