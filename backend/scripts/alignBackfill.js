#!/usr/bin/env node
// 歌詞 STAGE 3「音訊次序驗證層」—— 任務3:backfill 舊歌嘅 whisper timeline。
//
// fetchLyrics.js 2026-07-27 起新歌一 run 齊做 OCR+whisper(見 fetchLyrics.js 頭
// 註解),但之前(2026-07-24~27)已經跑出嚟嘅 draft/verified 冇 whisper timeline
// (而家約 59 首,`migrate-lyrics-timeline.js` 有印實時數字)。呢個 script 補返
// 呢批舊歌:淨係落 bestaudio(唔使成條片,輕好多)→ whisper 轉錄(帶 timestamp)
// → 存入 `lyrics_timeline.whisper` → 即刪 audio。純寫 timeline 元資料,唔會
// 郁 `lyrics`/`lyrics_status`,已出街嘅 verified 歌詞內容完全唔受影響。
//
// ── 安全機制(同 fetchLyrics.js 一致,唔好行返轉頭)────────────────
//   * 2026-08-01 起窗口係 18:40 起夜晚跨到朝早 09:00(--ignore-window 手動測試
//     先可以跳過)。
//   * budget 預設 60(59 首存貨一晚做晒有突)、jitter delay。
//   * DB 寫入鎖:慢工序(落載/whisper)唔攞鎖,淨係每首寫嗰一刻先攞鎖 + 重新
//     openDb()(見 fetchLyrics.js `writeLyricsRow` 註解,同一個 P0 教訓)。
//   * 連續 3 次 exec 失敗 → 用已知有 CC 嘅片做對照探測,分清「俾擋」定
//     「呢批片本身有事」。
//   * 死片放棄(2026-08-01 Eric 拍板):單首落載失敗就喺 lyrics_timeline.alignFails
//     加一,累計 ≥3 次就寫 whisper:{failed:'dead-video'} 永久標走,唔會再入
//     `pickCandidates` 嘅隊(見底下 `hasWhisperTimeline`/`recordAlignFail`)。
//   * temp 音訊喺 mkdtemp 目錄,一首處理完即刪(唔理成功定失敗)。
//
// Usage:
//   node scripts/alignBackfill.js                      # 排程正常路徑(00:00-09:00 窗口)
//   node scripts/alignBackfill.js --budget 60 --delay 5000
//   node scripts/alignBackfill.js --id 141 --ignore-window          # 單首,測試用
//   node scripts/alignBackfill.js --id 141 --ignore-window --model medium
//   node scripts/alignBackfill.js --status              # 報告,唔改嘢

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { detectWhisperLang, runWhisperJson as runWhisperJsonShared, DEFAULT_WHISPER_MODEL_NAME } from '../lib/whisperTranscribe.js';
import { YTDLP } from '../lib/ytdlpBin.js';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('--budget', 60));
const DELAY_MS = Number(arg('--delay', 5000));
const SINGLE_ID = arg('--id', null);
// 2026-07-27 STAGE 3 對齊修:model 一律用 medium(small 唔可靠,見 lib/whisperTranscribe.js
// 頭註解)。--model 淨係留返俾測試用,唔好喺正常路徑改返 small。
const MODEL_NAME = arg('--model', DEFAULT_WHISPER_MODEL_NAME);
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const STATUS_ONLY = process.argv.includes('--status');
const DRY = process.argv.includes('--dry');

// 2026-08-01 由「06:50 開波、00:00-09:00 窗」改做「18:40 開波」(Eric 拍板,
// 配合 fetchLyrics 8 輪新排程挪位,見 ops/launchd/com.hymnapp.alignbackfill.plist
// 註解):窗口對應改做 h>=18 或者 h<9(18:40 呢輪 h=18 ✓ 準行)。
const NIGHT_START = 18, WINDOW_END = 9;
const PROBE_VIDEO = 'gF-eDlXq3II'; // 同 fetchLyrics.js 一致嘅對照探測片
const WHISPER_BIN = 'whisper-cli';
const WHISPER_MODEL = path.join(__dirname, '..', 'models', `ggml-${MODEL_NAME}.bin`);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
const inWindow = () => { const h = new Date().getHours(); return h >= NIGHT_START || h < WINDOW_END; };

// ── 候選:draft/verified、source!=manual,而家仲未有 whisper timeline 嘅歌 ──
// ⚠️ 2026-08-01 死片放棄機制加咗之後,`t.whisper` 唔再只得兩種可能(冇 / array)——
// 仲有第三種:{failed:'dead-video'} 呢個 object,代表落載連續失敗 ≥3 次已經
// 放棄咗嘅片(見底下 recordAlignFail)。呢種一樣要當「已經有 timeline」處理
// (return true),先可以喺 pickCandidates 度俾 filter 走,唔會夜夜重排隊白試。
// 漏咗呢個分支嘅話,dead-video marker 淨係一個冇 length 嘅 object,
// `Array.isArray` 會係 false,反而變咗「仲未有 timeline」繼續入隊——同放棄機制
// 原意相反,一定要小心。
function hasWhisperTimeline(raw) {
  if (!raw) return false;
  try {
    const t = JSON.parse(raw);
    if (Array.isArray(t.whisper) && t.whisper.length > 0) return true;
    if (t.whisper && typeof t.whisper === 'object' && !Array.isArray(t.whisper) && t.whisper.failed) return true;
    return false;
  } catch (_) { return false; }
}

function pickCandidates(db) {
  // ⚠️ 純音樂 exclusion **刻意唔加**(INSTRUMENTAL-PHASE1-EXEC-20260821.md §4
  // 尾段):timeline 係人聲偵測嘅證據,continue 做落去冇壞(仲係 T2
  // scanInstrumentalCandidates.mjs 嘅原料);而且下面條 query 淨係揀
  // `lyrics_status IN ('draft','verified')`,instrumental 嘅歌係
  // `'unavailable'`,天然入唔到。呢個係刻意決定,唔係漏。
  const rows = query(db, `SELECT id, youtube_id, title, artist, lang, lyrics_draft, lyrics_timeline FROM hymns_all
                          WHERE curated=1 AND status!='dead'
                            AND lyrics_status IN ('draft','verified')
                            AND (lyrics_source IS NULL OR lyrics_source != 'manual')
                          ORDER BY RANDOM()`);
  return rows.filter((r) => !hasWhisperTimeline(r.lyrics_timeline));
}

// 判斷呢首歌叫 whisper 應該用邊個語言:優先用 lyrics_draft(OCR/CC 已有嘅文字,
// 最準),搵唔到就 fallback 用 DB 嘅 lang 欄位('英文' → en,其他(國語/粵語/
// 兒童)→ zh)。
function songWhisperLang(row) {
  if (row.lyrics_draft && row.lyrics_draft.trim()) return detectWhisperLang(row.lyrics_draft);
  return row.lang === '英文' ? 'en' : 'zh';
}

function report(db) {
  const cands = pickCandidates(db);
  log(`draft/verified、source!=manual、未有 whisper timeline:${cands.length} 首`);
}

// ── 落 bestaudio(唔使成條片,只要音軌)──────────────────────────────
async function downloadBestAudio(youtubeId, dir) {
  const outTemplate = path.join(dir, 'audio.%(ext)s');
  await exec(
    `"${YTDLP}" -f "bestaudio/best" -o "${outTemplate}" "https://www.youtube.com/watch?v=${youtubeId}"`,
    { timeout: 120000 }
  );
  const file = fs.readdirSync(dir).find((f) => f.startsWith('audio.') && !f.endsWith('.part'));
  if (!file) throw new Error('落載完但搵唔到音訊檔');
  return path.join(dir, file);
}

async function toWav(audioPath, dir) {
  const wavPath = path.join(dir, 'audio.wav');
  await exec(`ffmpeg -i "${audioPath}" -vn -ar 16000 -ac 1 -y "${wavPath}"`, { timeout: 120000 });
  return wavPath;
}

let _whisperReadyCache = null;
async function checkWhisperAvailable() {
  if (_whisperReadyCache !== null) return _whisperReadyCache;
  try {
    await exec(`command -v ${WHISPER_BIN}`);
    _whisperReadyCache = fs.existsSync(WHISPER_MODEL);
  } catch (_) {
    _whisperReadyCache = false;
  }
  return _whisperReadyCache;
}

async function listManualSubsProbe(youtubeId) {
  try {
    await exec(`"${YTDLP}" --list-subs --skip-download "https://www.youtube.com/watch?v=${youtubeId}"`, { timeout: 30000 });
    return { error: false };
  } catch (e) {
    return { error: !e?.stdout };
  }
}

// ── DB 寫入(帶鎖,即攞即放)—— 同 fetchLyrics.js writeLyricsRow 一模一樣嘅 pattern。
async function writeTimeline(id, whisperSegs) {
  const token = await acquireDbLock('alignBackfill');
  if (!token) {
    log('    ⚠ 攞唔到 DB 鎖,skip(下次再嚟)');
    return false;
  }
  try {
    const freshDb = await openDb();
    const rows = query(freshDb, `SELECT lyrics_timeline FROM hymns_all WHERE id=?`, [id]);
    let timeline = {};
    try { timeline = JSON.parse(rows[0]?.lyrics_timeline || '{}') || {}; } catch (_) { timeline = {}; }
    timeline.whisper = whisperSegs;
    timeline.model = MODEL_NAME;
    timeline.updatedAt = new Date().toISOString();
    timeline.alignFails = 0; // 成功咗,清返之前(如果有)嘅落載失敗計數
    freshDb.run(`UPDATE hymns_all SET lyrics_timeline=? WHERE id=?`, [JSON.stringify(timeline), id]);
    saveDb(freshDb);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

// ── 死片放棄機制(2026-08-01 Eric 拍板)──────────────────────────────
// 有啲片一路 403 / 已下架,每晚落載都失敗、留喺隊入面比下一晚再試,白費
// budget(實測:id=246 呢類片,連續多晚 0 收穫)。落載失敗一次就喺
// lyrics_timeline.alignFails 加一;累計 ≥3 次就寫 whisper:{failed:'dead-video'},
// 靠 hasWhisperTimeline(見上面)將佢當「已經有 timeline」濾走,令呢首歌永久
// 離隊、唔會再排隊白試。同 writeTimeline 一樣行鎖 pattern(即攞即放)。
async function recordAlignFail(id) {
  const token = await acquireDbLock('alignBackfill');
  if (!token) {
    log('    ⚠ 攞唔到 DB 鎖,呢次落載失敗冇記到(下次再嚟)');
    return;
  }
  try {
    const freshDb = await openDb();
    const rows = query(freshDb, `SELECT lyrics_timeline FROM hymns_all WHERE id=?`, [id]);
    let timeline = {};
    try { timeline = JSON.parse(rows[0]?.lyrics_timeline || '{}') || {}; } catch (_) { timeline = {}; }
    const fails = (timeline.alignFails || 0) + 1;
    timeline.alignFails = fails;
    if (fails >= 3) {
      timeline.whisper = { failed: 'dead-video' };
      log(`    放棄(死片,累計${fails}次)`);
    } else {
      log(`    落載失敗計數 alignFails=${fails}(未到3次,留隊下次再試)`);
    }
    freshDb.run(`UPDATE hymns_all SET lyrics_timeline=? WHERE id=?`, [JSON.stringify(timeline), id]);
    saveDb(freshDb);
  } finally {
    releaseDbLock(token);
  }
}

async function processOne(c) {
  const whisperLang = songWhisperLang(c);
  log(`  [${c.artist}] ${c.title} (id=${c.id}, lang=${c.lang}, whisper -l ${whisperLang})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnalign-'));
  try {
    let audioPath;
    try {
      audioPath = await downloadBestAudio(c.youtube_id, dir);
    } catch (e) {
      log(`    ⚠ 落載失敗:${e?.message || e}`);
      if (!DRY) await recordAlignFail(c.id);
      return { ok: false, downloadFailed: true };
    }
    let whisperResult;
    try {
      const wav = await toWav(audioPath, dir);
      whisperResult = await runWhisperJsonShared(wav, WHISPER_MODEL, whisperLang);
    } catch (e) {
      // 2026-08-08 修:呢個 try/catch 之前冇包住,whisper-cli 逾時/爆(例:片太長,
      // 好似 id=246 個成場敬拜巡迴錄影咁,7 分鐘 timeout 一定爆)會一路飛到
      // main() 嘅頂層 catch,成個 script exit 1 死咗,而且唔會行 recordAlignFail
      // 計數 —— 導致隊尾嗰首爛片夜夜重試、夜夜拖死成個 job,永遠去唔到 3 次
      // 死片放棄門檻。而家同下載失敗一樣攞去 recordAlignFail 計數,3 次後一樣
      // 會標 dead-video 永久甩隊,script 唔會再因為單一首爛片成個死咗。
      log(`    ⚠ whisper 轉錄失敗(逾時或者程序爆咗):${e?.message || e}`);
      if (!DRY) await recordAlignFail(c.id);
      return { ok: false, whisperFailed: true };
    }
    const { segs, garbageDropped, failed } = whisperResult;
    if (garbageDropped) log(`    ⚠ 剷走 ${garbageDropped} 段疑似垃圾(CJK 佔比太低)`);
    if (failed) { log('    · whisper 出嚟嘅嘢大部分係垃圾,當轉錄失敗,skip 唔寫'); return { ok: false, garbage: true }; }
    log(`    whisper 出咗 ${segs.length} 段`);
    if (!segs.length) { log('    · whisper 冇轉到嘢(可能純音樂/失敗),skip 唔寫'); return { ok: false, empty: true }; }
    if (!DRY) await writeTimeline(c.id, segs);
    return { ok: true, segs };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

async function main() {
  const db = await openDb();
  if (STATUS_ONLY) { report(db); return; }

  const whisperReady = await checkWhisperAvailable();
  if (!whisperReady) { log(`⚠ whisper-cli 或者 model ${WHISPER_MODEL} 未裝妥,收工`); return; }

  if (SINGLE_ID) {
    if (!inWindow() && !IGNORE_WINDOW) { log(`而家 ${new Date().getHours()} 點,唔喺窗口內,加 --ignore-window 先可以測試單首。`); return; }
    const rows = query(db, `SELECT id, youtube_id, title, artist, lang, lyrics_draft FROM hymns_all WHERE id=?`, [Number(SINGLE_ID)]);
    if (!rows.length) { log(`搵唔到 id=${SINGLE_ID}`); return; }
    const result = await processOne(rows[0]);
    log(result.ok ? '✓ 完成' : '✗ 冇寫入');
    return;
  }

  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${NIGHT_START}:00-${WINDOW_END}:00(隔夜)窗口內,唔做嘢。`);
    return;
  }
  report(db);
  const cands = pickCandidates(db);
  if (!cands.length) { log('全部候選都有 whisper timeline 喇,冇嘢做。'); return; }

  let done = 0, streak = 0;
  for (let i = 0; i < BUDGET && i < cands.length; i++) {
    const c = cands[i];
    const result = await processOne(c);
    if (result.downloadFailed) {
      streak++;
      log(`    (連續落載失敗 ${streak})`);
      if (streak >= 3) {
        log('  連續 3 次落載失敗 —— 用 CC 對照探測分清係咪俾擋…');
        await sleep(jitter(DELAY_MS));
        const probe = await listManualSubsProbe(PROBE_VIDEO);
        if (probe.error) { log('  對照都 exec 失敗 → 疑似俾 YouTube 擋,今晚收工'); break; }
        log('  對照行到 → 唔關 block 事,繼續'); streak = 0;
      }
    } else {
      streak = 0;
      if (result.ok) done++;
    }
    if (i < BUDGET - 1 && i < cands.length - 1) await sleep(jitter(DELAY_MS));
  }
  log(`今次:寫入 whisper timeline ${done} 首`);
}

main().catch((e) => { console.error('alignBackfill 出錯:', e); process.exit(1); });
