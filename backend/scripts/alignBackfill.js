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
//   * 只喺 00:00-09:00 窗口行(--ignore-window 手動測試先可以跳過)。
//   * budget 預設 60(59 首存貨一晚做晒有突)、jitter delay。
//   * DB 寫入鎖:慢工序(落載/whisper)唔攞鎖,淨係每首寫嗰一刻先攞鎖 + 重新
//     openDb()(見 fetchLyrics.js `writeLyricsRow` 註解,同一個 P0 教訓)。
//   * 連續 3 次 exec 失敗 → 用已知有 CC 嘅片做對照探測,分清「俾擋」定
//     「呢批片本身有事」。
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

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('--budget', 60));
const DELAY_MS = Number(arg('--delay', 5000));
const SINGLE_ID = arg('--id', null);
const MODEL_NAME = arg('--model', 'small');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const STATUS_ONLY = process.argv.includes('--status');
const DRY = process.argv.includes('--dry');

const WINDOW_START = 0, WINDOW_END = 9;
const PROBE_VIDEO = 'gF-eDlXq3II'; // 同 fetchLyrics.js 一致嘅對照探測片
const WHISPER_BIN = 'whisper-cli';
const WHISPER_MODEL = path.join(__dirname, '..', 'models', `ggml-${MODEL_NAME}.bin`);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
const inWindow = () => { const h = new Date().getHours(); return h >= WINDOW_START && h < WINDOW_END; };

// ── 候選:draft/verified、source!=manual,而家仲未有 whisper timeline 嘅歌 ──
function hasWhisperTimeline(raw) {
  if (!raw) return false;
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t.whisper) && t.whisper.length > 0;
  } catch (_) { return false; }
}

function pickCandidates(db) {
  const rows = query(db, `SELECT id, youtube_id, title, artist, lang, lyrics_timeline FROM hymns_all
                          WHERE curated=1 AND status!='dead'
                            AND lyrics_status IN ('draft','verified')
                            AND (lyrics_source IS NULL OR lyrics_source != 'manual')
                          ORDER BY RANDOM()`);
  return rows.filter((r) => !hasWhisperTimeline(r.lyrics_timeline));
}

function report(db) {
  const cands = pickCandidates(db);
  log(`draft/verified、source!=manual、未有 whisper timeline:${cands.length} 首`);
}

// ── 落 bestaudio(唔使成條片,只要音軌)──────────────────────────────
async function downloadBestAudio(youtubeId, dir) {
  const outTemplate = path.join(dir, 'audio.%(ext)s');
  await exec(
    `yt-dlp -f "bestaudio/best" -o "${outTemplate}" "https://www.youtube.com/watch?v=${youtubeId}"`,
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

// whisper-cli -oj:JSON 輸出帶 offsets(ms)。轉做 { t0, t1, text }(秒,trim 咗嘅文字)。
async function runWhisperJson(wavPath) {
  const outBase = wavPath.replace(/\.wav$/, '');
  await exec(
    `${WHISPER_BIN} -m "${WHISPER_MODEL}" -f "${wavPath}" -l auto -oj -of "${outBase}" -np`,
    { timeout: 420000 }
  );
  const jsonPath = `${outBase}.json`;
  if (!fs.existsSync(jsonPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const segs = parsed?.transcription || [];
  return segs
    .map((s) => ({
      t0: Math.round((s.offsets?.from ?? 0) / 10) / 100,
      t1: Math.round((s.offsets?.to ?? 0) / 10) / 100,
      text: (s.text || '').trim(),
    }))
    .filter((s) => s.text);
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
    await exec(`yt-dlp --list-subs --skip-download "https://www.youtube.com/watch?v=${youtubeId}"`, { timeout: 30000 });
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
    freshDb.run(`UPDATE hymns_all SET lyrics_timeline=? WHERE id=?`, [JSON.stringify(timeline), id]);
    saveDb(freshDb);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

async function processOne(c) {
  log(`  [${c.artist}] ${c.title} (id=${c.id}, lang=${c.lang})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnalign-'));
  try {
    let audioPath;
    try {
      audioPath = await downloadBestAudio(c.youtube_id, dir);
    } catch (e) {
      log(`    ⚠ 落載失敗:${e?.message || e}`);
      return { ok: false, downloadFailed: true };
    }
    const wav = await toWav(audioPath, dir);
    const segs = await runWhisperJson(wav);
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
    const rows = query(db, `SELECT id, youtube_id, title, artist, lang FROM hymns_all WHERE id=?`, [Number(SINGLE_ID)]);
    if (!rows.length) { log(`搵唔到 id=${SINGLE_ID}`); return; }
    const result = await processOne(rows[0]);
    log(result.ok ? '✓ 完成' : '✗ 冇寫入');
    return;
  }

  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${WINDOW_START}:00-${WINDOW_END}:00,唔做嘢。`);
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
