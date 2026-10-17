#!/usr/bin/env node
// oneoff-cleanLegacyAlbumJunk.js — ALBUM-BACKFILL-ACCEL-PLAN.md Opus 5 擴展批次
// 驗收 followup①。migrateAlbumSource.js 一次過將現存 album 非空嘅 259 條
// stamp `album_source='legacy'`(保守當受保護,永唔覆寫)——但呢批「受保護」
// 名單入面混咗一批 migration 之前已經壞咗嘅垃圾值,而家反而因為受保護永遠
// 冇得修(Phase A/B/backfillMeta 都會因為 album_source='legacy' skip 呢啲
// row)。呢個 script 專門清呢批垃圾,分兩類處理,寧保守莫錯殺。
//
// ── 判定規則(白紙黑字,程式碼即文檔)────────────────────────────────────
//
// (a) 完全垃圾——三選一撞中就係:
//   1. 開頭係 `https:`(URL 碎片,parse 漏咗嘢剩低個 scheme)
//   2. trim 後 exact match 於呢個 closed set 嘅純技術英文詞:
//      'Live' / 'Karaoke' / '(Karaoke)' / 'MV' / '(MV)'
//   3. trim 後得返 1 個字符(單一漢字/標點,例如「信」「》」)
//   4. 成個值淨係一對半形括號包住嘅內容,冇任何括號外文字(例如「(1)」
//      呢種孤零零嘅編號殘留、「(詩四十二)」「(賽一)」呢種聖經章節引用—
//      章節引用本身唔係專輯名,好可能係 parse 漏咗撞正經文附註)。抽查過
//      現存 259 條入面撞呢條規則嘅 20 條,一條都唔係真.專輯名。
//   → 處理:album=''、album_source=''(交返俾之後 Phase A/夜晚
//     backfillMeta 用返 waterfall 重新填,唔再受 legacy 保護)
//
// (b) 帶殘留編號——value 完全 match `/^\(\d+\)\s*(.+)$/`(半形括號包住嘅
//   數字編號,後面跟實際歌名,例如「(3) 有一位神」)。呢類**唔係清空**,
//   個名本身(剝走編號之後)通常係啱嘅,淨係要剝走個殘留前綴。但如果剝走
//   之後嘅殘留值本身撞到「宣傳|短片|預告|花絮|介紹|試聽|教室」呢類非歌/
//   促銷內容關鍵字(例:「(1) 恩典之路宣傳短片」剝完係「恩典之路宣傳短片」,
//   本身都唔係一個乾淨嘅專輯名),就**唔自動改**,落入 grey area 畀人手覆核
//   (呢種情況成條片好可能根本唔係一首歌,應該去 suspected-nonsong.md 嗰邊
//   處理,唔喺呢個 script 負責)。
//   → 處理(通過檢查先做):album=剝走編號之後嘅殘留值,album_source
//     維持 'legacy' 唔郁(佢仲係人手來歷嘅保護狀態,呢度淨係修裂痕,唔係
//     改變 provenance)。
//
// ── grey area:一律唔掂,落 report 俾人睇 ─────────────────────────────────
// 唔肯定係咪垃圾嘅一律唔自動處理,包括但唔限於:
//   · 純 ASCII(冇任何中文字)嘅短值,冇撞 (a) 嘅 closed set(例如
//     「Kari Jobe」「passion」「Consumed」「Hello Love」「st Track」——
//     呢啲可能係真.專輯名(Kari Jobe 有自傳專輯《Kari Jobe》,Passion 係
//     知名敬拜系列),唔可以一刀切當垃圾)
//   · 開頭係破折號(－/-/–)嘅值(例如「－Brenda Li」,睇落似 parse 剩底嘅
//     藝人名殘留,但唔夠肯定)
//   · (b) candidate 但剝走編號之後嘅殘留值撞到非歌/促銷關鍵字
// 呢批全部落 report「冇掂嘅可疑值」一欄,DB 完全唔碰。
//
// ── 兩段式(硬規矩)────────────────────────────────────────────────────
//   --dry(預設):唔寫 DB,淨係出 report md。
//   --apply:先真寫(經 acquireDbLock)。**呢個 script 唔准自動接住
//     --dry 之後自己轉 --apply 跑**——report 出咗要等 Fable 5 睇過先話
//     知係咪真跑。
//
// Usage:
//   node scripts/oneoff-cleanLegacyAlbumJunk.js          # --dry(預設)
//   node scripts/oneoff-cleanLegacyAlbumJunk.js --apply   # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'legacy-junk-report.md');
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY; // 預設 dry,要明文 --apply 先真寫

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// (a) 完全垃圾嘅 closed set(見上面規則②)。
const JUNK_EXACT_SET = new Set(['Live', 'Karaoke', '(Karaoke)', 'MV', '(MV)']);
// (b) 殘留值本身仲係疑似非歌/促銷內容嘅關鍵字。
const NONSONG_LIKE_RE = /宣傳|短片|預告|花絮|介紹|試聽|教室/;
const PAREN_NUM_RE = /^\((\d+)\)\s*(.+)$/;

// 判定單一 row,回一個分類結果:
//   { kind: 'junk' }                         → (a) 完全垃圾
//   { kind: 'renumber', clean: 'XXX' }        → (b) 剝走編號,得返乾淨值
//   { kind: 'grey', reason: '...' }           → 唔肯定,唔掂
//   { kind: 'none' }                          → 睇落正常,唔使理
function classify(album) {
  const v = (album || '').trim();
  if (!v) return { kind: 'none' };

  // (a)① URL 碎片
  if (v.startsWith('https:')) return { kind: 'junk', reason: 'URL 碎片(https: 開頭)' };
  // (a)② 純技術英文詞 closed set
  if (JUNK_EXACT_SET.has(v)) return { kind: 'junk', reason: `純技術英文詞(「${v}」)` };
  // (a)③ 單一字符/標點
  if ([...v].length === 1) return { kind: 'junk', reason: `單一字符/標點(「${v}」)` };
  // (a)④ 成個值淨係一對半形括號包住嘅內容,冇括號外文字(孤零零編號殘留/
  // 聖經章節引用呢類,唔係專輯名)。
  if (/^\([^()]*\)$/.test(v)) return { kind: 'junk', reason: `成個值淨係括號包住嘅內容(「${v}」),唔係專輯名` };

  // (b) 帶殘留編號 "(N) XXX"
  const m = v.match(PAREN_NUM_RE);
  if (m) {
    const clean = m[2].trim();
    if (!clean) return { kind: 'grey', reason: '(N) 編號剝走之後得返空值' };
    if (clean.length > 40) return { kind: 'grey', reason: `(N) 編號剝走之後仲有 ${clean.length} 字,太長唔夠肯定` };
    if (NONSONG_LIKE_RE.test(clean)) return { kind: 'grey', reason: `(N) 編號剝走之後嘅殘留值「${clean}」本身撞非歌/促銷關鍵字,懷疑成條片根本唔係一首歌` };
    return { kind: 'renumber', clean };
  }

  // grey area:純 ASCII(冇 CJK)嘅短值——唔夠肯定係咪垃圾。
  const hasCJK = /[㐀-鿿豈-﫿]/.test(v);
  if (!hasCJK && v.length <= 20) return { kind: 'grey', reason: '純英文短值,冇 CJK 字符,唔夠肯定係咪垃圾(可能係真.專輯名例如藝人自傳專輯)' };
  // grey area:開頭係破折號,睇落似 parse 剩底嘅殘留。
  if (/^[－\-–]/.test(v)) return { kind: 'grey', reason: '開頭係破折號,睇落似 parse 剩底嘅殘留,唔夠肯定' };

  return { kind: 'none' };
}

async function main() {
  log(`oneoff-cleanLegacyAlbumJunk:apply=${APPLY}(dry=${DRY})`);

  const db = await openDb();
  const rows = query(db, "SELECT id, youtube_id, title, album FROM hymns_all WHERE album_source = 'legacy' ORDER BY id");
  log(`album_source='legacy' 候選:${rows.length} 首`);

  const junkRows = [];
  const renumberRows = [];
  const greyRows = [];

  for (const row of rows) {
    const result = classify(row.album);
    if (result.kind === 'junk') junkRows.push({ row, reason: result.reason });
    else if (result.kind === 'renumber') renumberRows.push({ row, clean: result.clean });
    else if (result.kind === 'grey') greyRows.push({ row, reason: result.reason });
  }

  log(`(a) 完全垃圾:${junkRows.length} 條`);
  log(`(b) 帶殘留編號,剝走前綴:${renumberRows.length} 條`);
  log(`grey area(唔掂):${greyRows.length} 條`);

  if (APPLY) {
    const token = await acquireDbLock('oneoff-cleanLegacyAlbumJunk');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      for (const { row } of junkRows) {
        // 鎖內重新確認仲係 legacy(防止之間第二個 job/admin 改咗)。
        const fresh = query(freshDb, 'SELECT album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh || fresh.album_source !== 'legacy') continue;
        freshDb.run("UPDATE hymns_all SET album = '', album_source = '' WHERE id = ?", [row.id]);
      }
      for (const { row, clean } of renumberRows) {
        const fresh = query(freshDb, 'SELECT album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh || fresh.album_source !== 'legacy') continue;
        // album_source 維持 'legacy' 唔郁——淨係修裂痕,唔改 provenance。
        freshDb.run("UPDATE hymns_all SET album = ? WHERE id = ?", [clean, row.id]);
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:(a) ${junkRows.length} 條清空、(b) ${renumberRows.length} 條剝走編號`);
    } finally {
      releaseDbLock(token);
    }
  } else {
    log('--dry:未寫 DB(以上為模擬計數,report 出咗等 Fable 5 睇過先話知係咪 --apply)');
  }

  writeReport({ total: rows.length, junkRows, renumberRows, greyRows, dry: DRY });
}

function writeReport({ total, junkRows, renumberRows, greyRows, dry }) {
  const lines = [];
  lines.push('# legacy album_source 垃圾值清理報告');
  lines.push('');
  lines.push(`> ALBUM-BACKFILL-ACCEL-PLAN.md Opus 5 擴展批次驗收 followup①。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : '(已真寫 DB)'}`);
  lines.push('');
  lines.push(`- album_source='legacy' 總數:${total}`);
  lines.push(`- (a) 完全垃圾,清空(album='' album_source=''):${junkRows.length}`);
  lines.push(`- (b) 帶殘留編號,剝走前綴(album_source 維持 legacy):${renumberRows.length}`);
  lines.push(`- grey area,冇掂:${greyRows.length}`);
  lines.push('');
  lines.push('## (a) 完全垃圾(清空,交返俾 Phase A/backfillMeta 重新填)');
  lines.push('');
  lines.push('| id | youtube_id | title | 而家嘅 album 值 | 判定原因 |');
  lines.push('|---|---|---|---|---|');
  for (const { row, reason } of junkRows) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.title)} | ${mdEscape(row.album)} | ${mdEscape(reason)} |`);
  }
  lines.push('');
  lines.push('## (b) 帶殘留編號(剝走 "(N) " 前綴,album_source 維持 legacy)');
  lines.push('');
  lines.push('| id | youtube_id | title | 而家嘅 album 值 | 改做 |');
  lines.push('|---|---|---|---|---|');
  for (const { row, clean } of renumberRows) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.title)} | ${mdEscape(row.album)} | ${mdEscape(clean)} |`);
  }
  lines.push('');
  lines.push('## 冇掂嘅可疑值(grey area,DB 完全未碰,俾人手覆核)');
  lines.push('');
  lines.push('| id | youtube_id | title | 而家嘅 album 值 | 點解冇掂 |');
  lines.push('|---|---|---|---|---|');
  for (const { row, reason } of greyRows) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.title)} | ${mdEscape(row.album)} | ${mdEscape(reason)} |`);
  }
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('oneoff-cleanLegacyAlbumJunk 出錯:', e); process.exit(1); });
