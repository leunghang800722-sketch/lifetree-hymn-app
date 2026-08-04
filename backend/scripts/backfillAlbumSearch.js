#!/usr/bin/env node
// backfillAlbumSearch.js — ALBUM-BACKFILL-ACCEL-PLAN.md Commit 4 / Phase C
// (最後一層 fallback,§6 Eric 拍板⑤:淨係呢層准 AI 用 web search,但要有
// 可靠出處(source_url)先准填,唔肯定一律 null——同 backfillMeta.js §3.3
// 「唔准 AI 估專輯」嘅精神唔矛盾,呢度係「AI 要引到出處先准填」)。
//
// ✅ 2026-08-04 Fable 5 已驗證:`claude -p --allowedTools WebSearch` headless
// 正常觸發 web search,測試問《寶貴十架》出版年,答返 strict JSON 連真實
// Apple Music source_url(年份 2006 同專輯 11P 對得上)。下面 TODO 留底做記錄。
// ⚠️⚠️⚠️ TODO(落地前一定要驗證)—— headless `claude -p` 用唔用到 web search
// 呢件事**未經實測**(brief 明文規定 Phase A/B 未清完之前唔准跑 Phase C,
// 所以呢個 script 淨係寫結構,冇真係 call 過 `claude -p --allowedTools
// WebSearch` 睇下佢答唔答到有 source_url 嘅結果)。落地前(即係 Phase A/B
// 白名單/catalog 都清得七七八八,輪到 Phase C 嗰陣)要做嘅事:
//   1. 手動測一次 `claude -p "<問句>" --allowedTools "WebSearch"`,睇吓
//      headless session 真係會唔會觸發 web search、response 入面有冇實際
//      搜到嘅網址(唔係憑訓練資料估一個睇落似樣嘅網址)。
//   2. 如果 headless 環境用唔到 WebSearch(例:冇網絡權限、tool 冇掛載),
//      呢個 script 嘅 `runAiSearchBatch()` 會攞唔到任何有 source_url 嘅
//      答案——程式層驗證(見底下)會將冚唪唥棄晒,行為上等於「安全咁乜都
//      唔填」,唔會誤填,但都要人手確認先好排入排程。
//   3. 用一個已知答案嘅歌(例如 sop.org catalog 已經 confirm 嘅《讓讚美
//      飛揚》入面一首歌)人手過一次,check AI 答返嚟嘅 source_url 係咪
//      真係指到啱嘅頁面(唔係作出嚟嘅 URL)。
//
// ── 候選 ──────────────────────────────────────────────────────────────
// album 空、而且 Phase A(playlist)/B(sop.org catalog)都兜唔到嘅 row。呢個
// script 冇辦法自動判斷「Phase A/B 兜唔到」(嗰兩層嘅白名單/catalog match
// 結果冧咗喺各自嘅 report,冇寫返落 DB 做旗標)——保守做法:候選直接揀
// `album=''`(呢個時間點 Phase A 都未 --apply,Phase B 都未真寫,所以而家
// 全部 album 空嘅 row 都合資格;等 A/B 真正跑完、行番 Phase C 嗰陣,album
// 空嘅 row 天然就係「A/B 都兜唔到」嗰批,唔使額外欄位)。`--limit` 預設 30
// (細 budget,慢慢清)。
//
// ── 規則(寫死喺 prompt,程式層再驗一次)────────────────────────────────
//   · 冇 source_url 一律唔准填(prompt 明文寫,程式層再擋一次)
//   · 唔肯定就答 null,唔准靠訓練資料估
//   · album 長度 > 40 字一律棄(sanity cap,同 Phase A 白名單一致)
//   · album_source='search',source_url 記落 report 俾人日後覆核
//
// Usage(⚠️ 呢個 script 而家淨係俾人睇結構/未來執行,依家唔准真跑):
//   node scripts/backfillAlbumSearch.js --dry            # 出 report,唔寫 DB
//   node scripts/backfillAlbumSearch.js --limit 10        # 真寫(要等 Phase A/B 清完先可以用)

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock, sleep } from '../lib/hymnDb.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', 30)); // 細 budget,§brief 明文
const DRY = process.argv.includes('--dry');
// 2026-08-04 Fable 5 實測:web search 每首 ~80s(3 首 batch 行咗 3 分 52 秒),
// 原本 batch 10 + timeout 180s 必爆(execFile 殺 process,成個 batch 冚唪唥
// 冇收成——第一次 dry run 0/15 嘅根因)。batch 縮到 3、timeout 開 600s。
const BATCH_SIZE = Number(arg('--batch-size', 3)); // web search 比純文字推斷貴+慢,batch 開細
const CLAUDE_TIMEOUT_MS = Number(arg('--claude-timeout', 600000));
const REPORT_PATH = arg('--report', path.join(__dirname, '..', 'data', 'album-backfill', 'search-report.md'));
const ALBUM_MAX_LEN = 40;

// 2026-08-04:toISOString() 係 UTC 同本機 HKT 差 8 個鐘(上次三個 script 嘅
// 同款修正漏咗呢個),改本機時區。
const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// ── 時間窗(2026-08-04 Eric 拍板排程):星期一至六淨係 18:30→翌朝 10:30 先准
// 跑,即係封鎖一至六 10:30–18:30;星期日全日唔封。同 growLibrary.js 嘅
// OFFICE_HOURS_BLOCK 同一套語義/同一款實現,方便日後一齊調。launchd 定點
// 22:00 開跑本身已經喺窗內,呢個 guard 主要係兜 launchd 瞓醒 catch-up fire
// /人手誤跑呢啲 edge case。──────────────────────────────────────────
const IGNORE_OFFICE_HOURS = process.argv.includes('--ignore-office-hours');
const OFFICE_HOURS_BLOCK = {
  enforce: true,
  blockedDays: [1, 2, 3, 4, 5, 6], // JS getDay():0=日 1=一...6=六。淨係唔包星期日。
  startHour: 10, startMinute: 30,  // 10:30 起計入封鎖(inclusive)
  endHour: 18, endMinute: 30,      // 18:30 起解封(exclusive)
};
function isBlockedByOfficeHours(now = new Date()) {
  if (!OFFICE_HOURS_BLOCK.enforce) return false;
  const day = now.getDay();
  if (!OFFICE_HOURS_BLOCK.blockedDays.includes(day)) return false; // 星期日,唔封
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMin = OFFICE_HOURS_BLOCK.startHour * 60 + OFFICE_HOURS_BLOCK.startMinute;
  const endMin = OFFICE_HOURS_BLOCK.endHour * 60 + OFFICE_HOURS_BLOCK.endMinute;
  return minutesNow >= startMin && minutesNow < endMin;
}

// ── last_album_search_attempt 輪換欄(排程前置,C5b② 同一個教訓):唔准淨係
// ORDER BY id ASC——「搜極都搵唔到」嘅死症 row 會永遠塞住隊頭,夜夜重搜同一
// 批 30 首,budget 全蝕。每次嘗試(唔理搵唔搵到)都 stamp,候選未試過先行、
// 試過耐先重試。獨立開新欄唔借用 last_meta_attempt——嗰個係 backfillMeta
// 自己嘅輪換狀態,兩個 job 候選集有交集,共用會互相干擾對方嘅排隊次序。──
function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}
async function ensureLastAlbumSearchAttemptColumn() {
  const token = await acquireDbLock('backfillAlbumSearch-migrate');
  if (!token) { log('⚠ 攞唔到 DB 鎖去加 last_album_search_attempt 欄,收工'); process.exit(1); }
  try {
    const db = await openDb();
    if (!hasColumn(db, 'hymns_all', 'last_album_search_attempt')) {
      log('ALTER TABLE hymns_all ADD COLUMN last_album_search_attempt TEXT');
      db.run('ALTER TABLE hymns_all ADD COLUMN last_album_search_attempt TEXT');
      saveDb(db);
    }
  } finally {
    releaseDbLock(token);
  }
}
// 每個 batch 搜完,冚唪唥 stamp 一次(一次鎖寫晒成個 batch,唔逐條攞鎖)。
// 唔行 writeRow 嗰條路——writeRow 嘅 album guard 會擋咗「淨係想 stamp」嘅
// miss row。DRY 都照 stamp?唔——dry 唔碰 DB,一致啲。
async function stampAttempts(ids) {
  if (DRY || !ids.length) return;
  const token = await acquireDbLock('backfillAlbumSearch-stamp');
  if (!token) { log('    ⚠ 攞唔到 DB 鎖 stamp attempt,呢個 batch 下次可能重複入隊'); return; }
  try {
    const freshDb = await openDb();
    const ts = stamp();
    for (const id of ids) {
      freshDb.run('UPDATE hymns_all SET last_album_search_attempt = ? WHERE id = ?', [ts, id]);
    }
    saveDb(freshDb);
  } finally {
    releaseDbLock(token);
  }
}
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ── candidate 揀選:album 空(見上面大註解,呢個時間點就係「A/B 都兜唔到」)
// 2026-08-04 Fable 5 開跑前補兩個漏(同 Phase A/B 必修①同一套):
//   · album_source='manual'/'legacy' 一律唔准做候選——admin 清空咗嘅 row
//     (album='' + source='manual',例:id=735)係人手判定「冇專輯」,search
//     層照揀就會重填,成個「清空」機制冇晒意思
//   · 淨揀 status='ok'——soft-delete 咗嘅歌唔好嘥 web search budget
function pickCandidates(db) {
  const rows = query(db, `SELECT id, youtube_id, title, display_title, org, album
                          FROM hymns_all
                          WHERE (album IS NULL OR trim(album) = '')
                            AND COALESCE(album_source,'') NOT IN ('manual','legacy')
                            AND status = 'ok'
                          ORDER BY last_album_search_attempt IS NOT NULL, last_album_search_attempt ASC, id ASC`);
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

// ── claude -p headless + web search:一次過問一個 batch,strict JSON 輸出 ──
async function checkClaudeCliAvailable() {
  try {
    await execFile('claude', ['-p', '回覆得返一個字:ok'], { timeout: 30000 });
    return true;
  } catch (e) {
    return false;
  }
}

function buildSearchPrompt(items) {
  const payload = items.map((it) => ({
    youtube_id: it.youtube_id,
    title: it.display_title || it.title,
    org: it.org || '',
  }));
  return [
    '你係詩歌 metadata 研究員,有 web search 工具可以用。以下每首歌俾你',
    'youtube_id、title、org(所屬團體)。用 web search 搵呢首歌屬於邊隻',
    '官方專輯(album)。',
    '',
    '硬規則(一定要跟,寧願答 null 都唔可以估):',
    '- 一定要用 web search 搵到一個具體、可靠嘅出處網頁(官網/CCLI 登記/',
    '  官方discography 頁面),先可以答有專輯名——冇搵到可靠出處嘅一律答 null',
    '- source_url 一定要係你真係搜到嘅網址,唔准作一個睇落似樣嘅 URL',
    '- 唔肯定/搜出嚟結果模糊/多個唔同答案衝突 → 答 null,唔好靠估',
    '- album 名淨係專輯名本身(唔超過 20 字),唔好加多餘文字',
    '',
    '輸出**只可以係**一個 JSON object,key=youtube_id,value 係',
    '`{"album": "專輯名", "source_url": "https://..."}` 或者 `null`,',
    '唔准有其他文字、唔准 markdown code fence、唔准解釋。',
    '',
    '例:{"abc123": {"album": "讓讚美飛揚", "source_url": "https://sop.org/copyright-ccli/"}, "def456": null}',
    '',
    '資料:',
    JSON.stringify(payload),
  ].join('\n');
}

function parseAiJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch (_) {}
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  return null;
}

// ⚠️ 呢個 function 真係會 spawn `claude -p --allowedTools WebSearch`——落地
// 前見到上面 header 嘅 TODO,呢個 call 本身未經實測過。
async function runAiSearchBatch(items) {
  if (!items.length) return {};
  const prompt = buildSearchPrompt(items);
  try {
    const { stdout } = await execFile(
      'claude',
      ['-p', prompt, '--allowedTools', 'WebSearch'],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }
    );
    const parsed = parseAiJson(stdout);
    if (!parsed || typeof parsed !== 'object') {
      log(`    ⚠ AI batch 回應 parse 唔到 JSON(前 200 字):${(stdout || '').slice(0, 200)}`);
      return {};
    }
    const out = {};
    for (const it of items) {
      const v = parsed[it.youtube_id];
      if (!v || typeof v !== 'object') continue; // null / 冇答 = 冇把握,跳過
      const album = typeof v.album === 'string' ? v.album.trim() : '';
      const sourceUrl = typeof v.source_url === 'string' ? v.source_url.trim() : '';
      // ── 程式層再驗一次(prompt 淨係軟約束,呢度先係真正把關)──────────
      if (!album || album.length > ALBUM_MAX_LEN) continue; // 棄:album 空或者過長
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) continue; // 棄:冇可靠出處
      out[it.youtube_id] = { album, source_url: sourceUrl };
    }
    return out;
  } catch (e) {
    log(`    ⚠ claude -p 執行失敗:${e?.message || e}`);
    return null; // null = CLI 行唔到/呢個 batch 完全冧咗,同「行到但冇答案」({}) 分開
  }
}

async function writeRow(id, fields) {
  if (!Object.keys(fields).length) return true;
  if (DRY) return true;
  const token = await acquireDbLock('backfillAlbumSearch');
  if (!token) {
    log(`    ⚠ 攞唔到 DB 鎖,id=${id} 呢首寫唔到(下次再嚟)`);
    return false;
  }
  try {
    const freshDb = await openDb();
    // 鎖內重新確認 album 仲係空(防止 Phase A/B/search 之間第二個 job 寫咗),
    // 兼 re-check album_source 冇變 manual/legacy(admin 啱啱清空都唔准填返)。
    const fresh = query(freshDb, 'SELECT album, album_source FROM hymns_all WHERE id = ?', [id])[0];
    if (fresh && fresh.album && fresh.album.trim()) return false;
    if (fresh && (fresh.album_source === 'manual' || fresh.album_source === 'legacy')) return false;
    const cols = Object.keys(fields);
    freshDb.run(
      `UPDATE hymns_all SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`,
      [...cols.map((c) => fields[c]), id]
    );
    saveDb(freshDb);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

async function main() {
  log(`backfillAlbumSearch:limit=${LIMIT} dry=${DRY}(⚠️ Phase C —— 等 Phase A/B 清完先應該行呢個 script)`);

  if (!IGNORE_OFFICE_HOURS && isBlockedByOfficeHours()) {
    log('而家係辦公時間封鎖窗(一至六 10:30–18:30),收工唔跑(--ignore-office-hours 可越過)');
    return;
  }

  await ensureLastAlbumSearchAttemptColumn();

  const db = await openDb();
  const candidates = pickCandidates(db);
  log(`候選(album 空):${candidates.length} 首`);

  if (!candidates.length) { log('冇候選,收工'); return; }

  const cliAvailable = await checkClaudeCliAvailable();
  if (!cliAvailable) {
    log('⚠ claude CLI 行唔到(未登入/唔喺 PATH/出錯),收工,冇寫任何嘢');
    writeReport({ candidates, results: [], cliAvailable: false, dry: DRY });
    return;
  }

  const results = []; // { row, album, sourceUrl, written }
  let writtenCount = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    log(`  AI+search batch [${i + 1}-${i + batch.length}/${candidates.length}]`);
    const out = await runAiSearchBatch(batch);
    if (out === null) {
      log('  ⚠ batch 中途 CLI 出錯,跳過呢個 batch');
    } else {
      for (const row of batch) {
        const hit = out[row.youtube_id];
        if (!hit) { results.push({ row, album: null, sourceUrl: null, written: false }); continue; }
        const ok = await writeRow(row.id, { album: hit.album, album_source: 'search' });
        if (ok) writtenCount++;
        results.push({ row, album: hit.album, sourceUrl: hit.source_url, written: ok });
      }
    }
    // 輪換 stamp:成個 batch(唔理 hit/miss/CLI 出錯)都當「試過」,下次隊尾排。
    await stampAttempts(batch.map((r) => r.id));
    if (i + BATCH_SIZE < candidates.length) await sleep(jitter(3500));
  }

  log(`寫入完成:${writtenCount}/${candidates.length} 首${DRY ? '(--dry,實際冇寫,以上為模擬計數)' : ''}`);
  writeReport({ candidates, results, cliAvailable: true, dry: DRY });
}

function writeReport({ candidates, results, cliAvailable, dry }) {
  const lines = [];
  lines.push('# backfillAlbumSearch 報告 —— Phase C(web search fallback)');
  lines.push('');
  lines.push(`> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 4。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${candidates.length}`);
  lines.push(`- claude CLI 可用:${cliAvailable}`);
  const hit = results.filter((r) => r.written || (dry && r.album));
  lines.push(`- 有出處且填咗(或 --dry 模擬):${hit.length}`);
  lines.push('');
  lines.push('## 寫入清單(連 source_url,俾人日後覆核)');
  lines.push('');
  lines.push('| id | youtube_id | title | album | source_url |');
  lines.push('|---|---|---|---|---|');
  for (const r of hit) {
    lines.push(`| ${r.row.id} | ${r.row.youtube_id} | ${mdEscape(r.row.display_title || r.row.title)} | ${mdEscape(r.album)} | ${mdEscape(r.sourceUrl)} |`);
  }
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumSearch 出錯:', e); process.exit(1); });
