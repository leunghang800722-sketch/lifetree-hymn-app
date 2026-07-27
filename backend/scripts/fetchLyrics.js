#!/usr/bin/env node
// 歌詞入庫 —— LYRICS-PIPELINE-PLAN 落地。獨立夜晚隊列,同 growLibrary **完全分開**:
// 自己揀 curated 又冇歌詞(lyrics_status='none')嘅歌，新收錄嘅歌自動係 'none' 就
// 自然流入呢條隊，兩個 script 零耦合。
//
// ── 每首歌嘅流程(LYRICS-PIPELINE-PLAN §3c)──────────────────────
//   ① CC 字幕   yt-dlp --list-subs：有**人手**字幕軌 → 落載 vtt → 清 timestamp/重複 → draft(cc)
//   ② OCR       冇 CC → 落低清片抽 frame → macOS Vision 讀燒死喺畫面嘅字            [STAGE 2 已接]
//   ③ Whisper   OCR 讀唔到夠字(畫面冇字幕嘅 live 版)→ 用返同一條片嘅音軌轉錄        [STAGE 2 已接]
//   ④ 都唔得    標 unavailable(90 日後可重試),UI 照「暫無歌詞」
// STAGE 1(CC)已行緊,實測命中率接近 0(中文敬拜 MV 嘅字幕係燒死喺畫面,唔係字幕軌)。
// STAGE 2 加咗 OCR 做主力 + whisper 做少數畫面冇字嘅 live 版後備。CC 揾唔到嘅歌會
// 標 source='cc:miss' 泊住,OCR 揀嗰啲歌做(唔會夜夜重 CC)。
//
// ── 草稿 ≠ 入庫 ──────────────────────────────────────────────────
// CC/OCR/whisper 出嘅只係 `lyrics_draft` + status='draft',**唔會出街**。
// 要執行 session 對照官方來源(讚美之泉/小羊/CantonHymn)校對、寫入 `lyrics` +
// status='verified' 先至俾前端見到(見 reviewLyrics.js)。同擴庫「攞到 ID 唔算收錄」
// 同一精神。
//
// ── DB 寫入鎖(2026-07-24 P0 修) ──────────────────────────────────
// growLibrary 而家 24 小時每 15 分鐘行一次,用 hymnDb.js 嘅 acquireDbLock/releaseDbLock
// 做互斥。fetchLyrics 呢個 script 喺鎖機制出現**之前**寫嘅,一直係直接 openDb→寫→
// saveDb,冇同 growLibrary 協調。sql.js 成個 DB 檔讀落記憶體、成個檔寫返出去
// (last-writer-wins),結果已經實測證實過:fetchLyrics 三晚標咗 36 首 cc:miss,
// DB 最後得返 1 首,其餘全部俾 growLibrary 嘅 stale in-memory 副本覆蓋咗。
//
// 修法(關鍵設計原則,唔可以行返轉頭):**慢工序(yt-dlp 落載/OCR/whisper 轉錄)
// 唔可以揸住個鎖做** —— OCR 一首幾分鐘,揸住鎖會餓死 growLibrary 每 15 分鐘嘅 slot。
// 正確 pattern(見底下 `writeLyricsRow`):
//   1. 揀候選 / 落載 / 抽 frame / OCR / whisper —— 呢啲全部唔攞鎖,用返一開始
//      openDb() 嗰個唔理鎖嘅 snapshot 揀候選就得(讀唔使鎖)。
//   2. 淨係每首歌嘅慢工序做晒之後,先 acquireDbLock('fetchLyrics') → 重新
//      openDb()(攞返最新版,唔好用返開頭嗰個舊 snapshot)→ UPDATE 嗰一首 →
//      saveDb() → releaseDbLock(token)。即攞即放,揸鎖嗰段時間淨係一個
//      UPDATE + 一次 export,幾乎即時。
//   3. 攞唔到鎖(acquireDbLock 已經內建 retry,最多等 5 分鐘)就 skip 呢首,
//      留低等下晚再嚟,唔死等、唔阻住成個 script。
// 之前俾冚咗嘅 cc:miss 標記唔使人手補救:嗰啲歌 lyrics_source 已經變返空,
// 會自動重入 CC 隊,self-healing。
//
// ── 安全機制(全部沿用 growLibrary,唔好行返轉頭)────────────────
//   * 只喺 00:00-09:00 窗口行(script 自己 double check);排程排 04:20(growLibrary
//     跳過 4 點、deadlink 04:00 做完 ~4:07,呢個 gap 冇人爭 → 唔會同佢哋撞 YouTube
//     或者撞 DB 寫入)。concurrency=1、每首之間 jitter delay。
//   * budget 分兩級:CC 平,預設 12 首;OCR 重(落片+抽frame+OCR),預設 6 首。
//   * 連續 3 次「exec 失敗」(唔係「冇字幕/冇夠字」——嗰啲係正常 miss)→ 用一首
//     已知有 CC 嘅歌做對照探測,分清「俾 YouTube 擋」定「呢批片本身有問題」。
//   * 落載嘅片/抽出嚟嘅 frame/wav 全部喺 os.tmpdir() 嘅 mkdtemp 目錄,一首處理
//     完即刪成個目錄(唔存副本,同音訊串流嗰條鐵律一致)。
//
// Usage:
//   node scripts/fetchLyrics.js                          # 排程正常路徑:CC 12 首 → OCR 6 首
//   node scripts/fetchLyrics.js --cc-budget 12 --ocr-budget 6 --delay 4000
//   node scripts/fetchLyrics.js --mode cc --budget 10     # 淨係 CC(手動測試)
//   node scripts/fetchLyrics.js --mode ocr --budget 2     # 淨係 OCR(手動測試)
//   node scripts/fetchLyrics.js --status                  # 報告,唔改嘢
//   node scripts/fetchLyrics.js --ignore-window --dry     # 測試,唔寫 DB

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { normCompare, bigramDice } from '../lib/textSimilarity.js';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const CC_BUDGET = Number(arg('--cc-budget', arg('--budget', 12)));
const OCR_BUDGET = Number(arg('--ocr-budget', 6));
const DELAY_MS = Number(arg('--delay', 4000));
const STATUS_ONLY = process.argv.includes('--status');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const DRY = process.argv.includes('--dry');

const WINDOW_START = 0, WINDOW_END = 9;
// 對照探測片:LYRICS-PIPELINE-PLAN §0 記錄小羊詩歌精選有 zh-CN 人手字幕軌。
const PROBE_VIDEO = 'gF-eDlXq3II';
// 想收嘅字幕語言(人手軌;auto-generated 唔算)
const WANT_LANGS = ['zh-Hant', 'zh-HK', 'yue', 'zh', 'zh-Hans', 'zh-CN', 'en'];
// OCR 抽 frame 間隔(秒)——LYRICS-PIPELINE-PLAN §3c:每 2 秒一張。
const FRAME_INTERVAL_SEC = 2;
// OCR/whisper 草稿去晒水印之後少過呢個字數,當「呢個來源攞唔到嘢」。
const MIN_DRAFT_CHARS = 40;

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
const inWindow = () => { const h = new Date().getHours(); return h >= WINDOW_START && h < WINDOW_END; };
const charCount = (s) => (s || '').replace(/\s/g, '').length;

function report(db) {
  const rows = query(db, `SELECT lyrics_status, COUNT(*) n FROM hymns_all WHERE curated=1 AND status!='dead' GROUP BY lyrics_status`);
  log('歌詞進度(curated,按 status):');
  for (const r of rows) log(`   ${r.lyrics_status || 'none'}  →  ${r.n} 首`);
  const bySource = query(db, `SELECT lyrics_source, COUNT(*) n FROM hymns_all
                              WHERE curated=1 AND status!='dead' AND lyrics_source IS NOT NULL AND lyrics_source != ''
                              GROUP BY lyrics_source`);
  if (bySource.length) log('   (source 細分:' + bySource.map((r) => `${r.lyrics_source}=${r.n}`).join(', ') + ')');
}

// ── DB 寫入(帶鎖,即攞即放)──────────────────────────────────────
// 見檔案頭註解:呢個 function 一定要喺慢工序(落載/OCR/whisper)做晒之後先叫,
// 唔可以擺喺慢工序入面或者之前。`fields` 係 { 欄名: 值 } 嘅 plain object。
async function writeLyricsRow(id, fields) {
  const token = await acquireDbLock('fetchLyrics');
  if (!token) {
    log('    ⚠ 攞唔到 DB 鎖(俾 growLibrary 用緊,已經等到 acquireDbLock 嘅上限),呢首今晚寫唔到,skip(下晚再嚟)');
    return false;
  }
  try {
    // 一定要重新 openDb() 攞返呢一刻最新嘅版本 —— 唔可以用返 run 開頭嗰個舊
    // snapshot,否則寫返出去嗰陣會蓋走 growLibrary 呢排(慢工序行緊嗰幾分鐘)
    // 寫落去嘅嘢,即係 P0 bug 原本個問題。
    const freshDb = await openDb();
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

// 揀下一首:curated、生、status='none'、未 CC 試過(source 空)。隨機次序(同 growLibrary
// 教訓:唔好用 id 順序,舊 id 死亡率高)。
function pickCandidates(db) {
  return query(db, `SELECT id, youtube_id, title, artist FROM hymns_all
                    WHERE curated=1 AND status!='dead'
                      AND (lyrics_status IS NULL OR lyrics_status='none')
                      AND (lyrics_source IS NULL OR lyrics_source='')
                    ORDER BY RANDOM()`);
}

// OCR 候選:CC 試過冇(source='cc:miss')嘅歌。
function pickOcrCandidates(db) {
  return query(db, `SELECT id, youtube_id, title, artist FROM hymns_all
                    WHERE curated=1 AND status!='dead'
                      AND lyrics_status='none' AND lyrics_source='cc:miss'
                    ORDER BY RANDOM()`);
}

// yt-dlp --list-subs：返「有邊啲**人手**字幕軌」。auto-generated 唔算。
// 回傳 { langs: [...], error: bool }。error=true = yt-dlp exec 出錯(可能俾擋)。
async function listManualSubs(youtubeId) {
  try {
    const { stdout } = await exec(
      `yt-dlp --list-subs --skip-download "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 30000 }
    );
    // "Available subtitles" section = 人手;"Available automatic captions" = auto,唔要。
    const manualBlock = stdout.split(/Available automatic captions/i)[0];
    const langs = WANT_LANGS.filter((l) => new RegExp(`^\\s*${l}\\b`, 'im').test(manualBlock));
    return { langs, error: false };
  } catch (e) {
    // 分辨:yt-dlp 行到但冇字幕 vs 真係 exec 錯。有 stdout 就當行到。
    if (e?.stdout) return { langs: [], error: false };
    return { langs: [], error: true };
  }
}

// 落載字幕 vtt → 清做純文字。處理完即刪 temp 檔(同「唔存副本」鐵律一致)。
async function downloadSubs(youtubeId, langs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnlyr-'));
  try {
    await exec(
      `yt-dlp --write-subs --sub-langs "${langs.join(',')}" --sub-format vtt ` +
      `--skip-download -o "${path.join(dir, '%(id)s')}" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 40000 }
    );
    const vtt = fs.readdirSync(dir).find((f) => f.endsWith('.vtt'));
    if (!vtt) return null;
    const raw = fs.readFileSync(path.join(dir, vtt), 'utf8');
    return cleanVtt(raw);
  } catch (_) {
    return null;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

// vtt → 純歌詞:剝走 header / timestamp / 序號 / <tag> / 連續重複行。
function cleanVtt(raw) {
  const out = [];
  let last = null;
  for (let line of raw.split(/\r?\n/)) {
    line = line.replace(/<[^>]+>/g, '').trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/-->/.test(line)) continue;            // timestamp
    if (/^\d+$/.test(line)) continue;          // 序號
    if (/^(Kind|Language):/i.test(line)) continue;
    if (line === last) continue;               // 連續重複
    last = line;
    out.push(line);
  }
  return out.join('\n').trim();
}

async function runCC(db, budget) {
  log(`mode=CC budget=${budget} delay=~${DELAY_MS}ms`);
  // 同 runOcr 一致化:一律用最新 snapshot 揀候選,唔好靠 main() 傳落嚟嗰個
  // (呢度風險本身細好多——run 一開波就叫,同 main() openDb() 相隔幾乎零——
  // 但養成「揀候選就攞新鮮」嘅習慣,唔會因為第日改咗執行次序而中招)。
  const freshDb = await openDb();
  const cands = pickCandidates(freshDb);
  if (!cands.length) { log('冇更多要做嘅歌(全部 curated 都試過 CC 或者有歌詞)'); return 0; }

  let drafted = 0, missed = 0, streak = 0;
  for (let i = 0; i < budget && i < cands.length; i++) {
    const c = cands[i];
    log(`  CC 檢查 [${c.artist}] ${c.title}`);
    const { langs, error } = await listManualSubs(c.youtube_id);

    if (error) {
      streak++;
      log(`    ⚠ yt-dlp exec 失敗 (連續 ${streak})`);
      if (streak >= 3) {
        log('  連續 3 次 exec 失敗 —— 用已知有 CC 嘅片做對照探測…');
        await sleep(jitter(DELAY_MS));
        const probe = await listManualSubs(PROBE_VIDEO);
        if (probe.error) { log('  對照都 exec 失敗 → 疑似俾 YouTube 擋,今晚收工'); break; }
        log('  對照行到 → 唔關 block 事,繼續'); streak = 0;
      }
      if (i < budget - 1) await sleep(jitter(DELAY_MS));
      continue;
    }
    streak = 0;

    if (langs.length) {
      const text = await downloadSubs(c.youtube_id, langs);
      if (text && text.length > 10) {
        if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: text, lyrics_status: 'draft', lyrics_source: 'cc', lyrics_checked_at: today() });
        drafted++;
        log(`    ✓ CC 有字幕(${langs.join(',')}),存草稿 ${text.length} 字(累計 +${drafted})`);
      } else {
        // 話有軌但落唔到 → 當 miss,泊去等 OCR
        if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'cc:miss', lyrics_checked_at: today() });
        missed++;
        log('    · 有軌但攞唔到內容,標 cc:miss(等 OCR)');
      }
    } else {
      // 冇人手字幕(大多數中文敬拜 MV 都係咁)→ 標 cc:miss,等 STAGE 2 OCR
      if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'cc:miss', lyrics_checked_at: today() });
      missed++;
      log('    · 冇人手 CC,標 cc:miss(等 OCR)');
    }
    if (i < budget - 1) await sleep(jitter(DELAY_MS));
  }
  log(`今次:CC 草稿 ${drafted} 首,冇 CC(泊去等 OCR)${missed} 首`);
  return drafted;
}

// ── OCR(STAGE 2 主力)──────────────────────────────────────────────
// 落低清視訊 → ffmpeg 抽 frame → macOS Vision(ocrframe binary)讀畫面字 →
// 合併去重 → draft(ocr)。OCR 唔夠字先撞 whisper(用返同一條片嘅音軌,零額外 request)。

const OCRFRAME_BIN = path.join(__dirname, '..', 'tools', 'ocrframe');
const WHISPER_BIN = 'whisper-cli';
const WHISPER_MODEL = path.join(__dirname, '..', 'models', 'ggml-small.bin');

// 落低清片(video+audio 埋一齊,俾 whisper 之後攞音軌用,唔使再落多次)。
// bestvideo+bestaudio 先(ffmpeg merge),先 fallback 去 combined best —— 純
// bestvideo 冇音軌,whisper 就用唔到,一定要有音軌先夠用。
async function downloadVideoLowRes(youtubeId, dir) {
  const outTemplate = path.join(dir, 'video.%(ext)s');
  await exec(
    `yt-dlp -f "bestvideo[height<=360]+bestaudio/best[height<=360]" -o "${outTemplate}" ` +
    `"https://www.youtube.com/watch?v=${youtubeId}"`,
    { timeout: 180000 }
  );
  const file = fs.readdirSync(dir).find((f) => f.startsWith('video.') && !f.endsWith('.part'));
  if (!file) throw new Error('落載完但搵唔到片檔');
  return path.join(dir, file);
}

async function extractFrames(videoPath, dir) {
  const pattern = path.join(dir, 'frame_%04d.png');
  await exec(`ffmpeg -i "${videoPath}" -vf "fps=1/${FRAME_INTERVAL_SEC}" -y "${pattern}"`, { timeout: 240000 });
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));
}

// 叫已經 compile 好嘅 Swift Vision binary 讀一張 frame,返嗰張 frame 由上到下嘅文字行。
async function ocrFrame(framePath) {
  try {
    const { stdout } = await exec(`"${OCRFRAME_BIN}" "${framePath}"`, { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (_) {
    return []; // 呢張 frame 冇字或者 Vision 出錯,當冇字跳過(唔阻住成首歌)
  }
}

// 清一行 OCR 文字:實測撞過卡拉OK填色特效令 Vision 將同一句讀成「AA」兩份黏埋
// 一齊(例:「找到我找到我」),得返偶數長度先可能係呢種情況,一半一半比較,
// 啱就摺埋得返一份。
function cleanOcrLine(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  if (s.length % 2 === 0) {
    const half = s.length / 2;
    if (s.slice(0, half) === s.slice(half)) s = s.slice(0, half);
  }
  return s;
}

// 段落級(block)相似度門檻 —— 相鄰 frame 嘅文字 normalize 後 bigram Dice ≥ 呢個數,
// 當係同一版字幕(OCR 抽 frame 密過畫面轉字幕,同一句歌詞正常會影中 2-5 張 frame)。
const BLOCK_SIM_THRESHOLD = 0.7;

// 合併全部 frame 嘅 OCR 文字做一份歌詞草稿 + 段落級時間軸。
//
// ⚠️ 2026-07-27 STAGE 3(音訊次序驗證層)重寫:舊版(逐行/逐段浮現去重)靠「畫面
// 顯示次序」做重複判斷嘅唯一根據,冇對照實際演唱(audio)—— Eric 抽查 id=141
// 揪出嚟:OCR 每 2 秒抽一張 frame,同一版字幕正常影 2-5 次(假重複),舊版嘅
// 「連續完全一樣先算重複」對雜訊(卡拉OK填色令逐張 OCR 結果有少少出入)好脆弱,
// 斷鏈之後假重複同真重複(唱兩次)混埋一齊,冇得分。
//
// 新做法分兩步(唔再靠「畫面次序」判斷真假重複 —— 呢個判斷而家交咗俾 STAGE 3
// 嘅 alignLyrics.js,靠 whisper timestamp 做 ground truth):
//   1. 段落分組:相鄰 frame 文字相似度 ≥ BLOCK_SIM_THRESHOLD → 同一個 block(假
//      重複,frame 抽得密過字幕轉嘅速度),block 代表文字揀當中最長/最完整嘅
//      變體(卡拉OK/經文逐字浮現,最遲嗰張通常最齊全,但唔假設順序,逐張比長度)。
//   2. 相鄰 block 之間再撞多次相似度 —— OCR 雜訊(一張讀衰咗)有時會將本應
//      合埋嘅假重複喺同一版字幕入面截斷做兩個相鄰 block,需要再合一次。相隔
//      遠(中間隔咗其他唔同 block)嘅重複唔會撞入呢層,保留做「可能係真重複」
//      (真定假,終極由 alignLyrics.js 對照 whisper 判)。
// 唔再用「同句全曲上限N次」呢種規則 —— 會連真正嘅第二輪都一齊刪走。
//
// 回傳 { blocks: [{t, text}], text, watermarkCount }。blocks 直接存入
// lyrics_timeline.ocr(STAGE 3 schema:{t: 秒, text: block 文字})。
// frameLineLists: string[][],每個元素係一張 frame(已經跟返個 frame 上到下嘅次序)嘅文字行。
function mergeOcrLines(frameLineLists) {
  const cleaned = frameLineLists.map((lines) => lines.map(cleanOcrLine).filter(Boolean));

  // 水印偵測(不變):淨係當有字嘅 frame 做分母(冇字嘅 frame 唔應該拉低個百分比)。
  const framesWithText = cleaned.filter((f) => f.length > 0);
  const freq = new Map();
  for (const f of cleaned) for (const line of new Set(f)) freq.set(line, (freq.get(line) || 0) + 1);
  const watermark = new Set();
  if (framesWithText.length) {
    for (const [line, n] of freq) if (n / framesWithText.length > 0.6) watermark.add(line);
  }

  // 逐張 frame 剔水印,計時間點(第 N 張 frame ≈ N × FRAME_INTERVAL_SEC 秒,N 由 1 起)。
  const frames = [];
  cleaned.forEach((rawFrame, idx) => {
    const lines = rawFrame.filter((l) => !watermark.has(l));
    if (!lines.length) return;
    frames.push({ t: (idx + 1) * FRAME_INTERVAL_SEC, text: lines.join('\n') });
  });

  // Step 1:段落分組 —— 相鄰 frame 相似度夠高就合做同一個 block。
  const rawBlocks = [];
  for (const f of frames) {
    const cur = rawBlocks[rawBlocks.length - 1];
    const lastFrameInBlock = cur ? cur.frames[cur.frames.length - 1] : null;
    if (lastFrameInBlock && bigramDice(normCompare(lastFrameInBlock.text), normCompare(f.text)) >= BLOCK_SIM_THRESHOLD) {
      cur.frames.push(f);
    } else {
      rawBlocks.push({ frames: [f] });
    }
  }
  // 每個 block 揀最長(最完整)嘅變體做代表文字。
  let blocks = rawBlocks.map((b) => {
    const best = b.frames.reduce((a, c) => (charCount(c.text) >= charCount(a.text) ? c : a));
    return { t: b.frames[0].t, text: best.text };
  });

  // Step 2:相鄰 block 之間再合一次(修雜訊令假重複斷鏈嘅情況)。
  let merged = true;
  while (merged) {
    merged = false;
    const next = [];
    for (const b of blocks) {
      const prev = next[next.length - 1];
      if (prev && bigramDice(normCompare(prev.text), normCompare(b.text)) >= BLOCK_SIM_THRESHOLD) {
        if (charCount(b.text) > charCount(prev.text)) prev.text = b.text; // 揀長嗰份
        merged = true; // t 保留 prev 嗰個(較早)
      } else {
        next.push({ ...b });
      }
    }
    blocks = next;
  }

  return {
    blocks,
    text: blocks.map((b) => b.text).join('\n\n').trim(),
    watermarkCount: watermark.size,
  };
}

async function extractAudioWav(videoPath, dir) {
  const wavPath = path.join(dir, 'audio.wav');
  await exec(`ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -y "${wavPath}"`, { timeout: 120000 });
  return wavPath;
}

// whisper-cli 未裝 / model 未落 → 唔死磕,cache 住結果(一個 run 淨係查一次)。
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

// 用返任務1已經落載嗰條片嘅音軌轉錄 —— 零額外 YouTube request。small model,
// -l auto 自動偵測語言(粵/國/英都食到)。
// ⚠️ 2026-07-27 STAGE 3 改用 -oj(JSON,帶 timestamp)代替舊版 -otxt -nt(淨文字,
// 冇時間) —— alignLyrics.js 對齊演算法要 whisper 嘅逐段時間做「實際演唱」ground
// truth,冇 timestamp 就做唔到。回傳 [{t0,t1,text}](秒),plainText() 幫手 join
// 返純文字俾 OCR 唔夠字嗰種 fallback(舊行為,直接寫 lyrics_draft)用。
async function runWhisperTranscribe(wavPath) {
  const outBase = wavPath.replace(/\.wav$/, '');
  await exec(
    `${WHISPER_BIN} -m "${WHISPER_MODEL}" -f "${wavPath}" -l auto -oj -of "${outBase}" -np`,
    { timeout: 300000 }
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
const whisperPlainText = (segs) => segs.map((s) => s.text).join(' ').trim();

const WHISPER_MODEL_NAME = path.basename(WHISPER_MODEL).replace(/^ggml-/, '').replace(/\.bin$/, '');

async function runOcr(db, budget) {
  log(`mode=OCR budget=${budget} delay=~${DELAY_MS}ms`);
  const whisperReady = await checkWhisperAvailable();
  // 2026-07-27 STAGE 3:whisper 而家唔再淨係「OCR 唔夠字」先撞——同一個 run 順手
  // 幫每首(唔理 OCR 夠唔夠字)做埋 whisper,攞 timestamp 存 lyrics_timeline.whisper
  // 做 alignLyrics.js 對齊嘅 ground truth(零額外 YouTube request,片已經落咗)。
  // OCR 唔夠字嗰種情況,whisper 出嚟嘅文字仲係會當 draft 後備(舊行為冇變)。
  log(`  whisper:${whisperReady ? `已裝妥(${WHISPER_MODEL_NAME} model)——每首順手做 timeline,OCR 唔夠字仲會揀嚟做 draft 後備` : '未裝 / model 未落,冇 timeline,OCR 唔夠字嘅歌會標 ocr:miss 留低(唔算失敗)'}`);

  // ⚠️ 2026-07-25 P0 修:唔可以用 main() 開場嗰個舊 `db` snapshot 揀候選 ——
  // 實錄:CC 層(runCC)喺同一個 run 入面經 writeLyricsRow 剛啱標咗 25 首
  // cc:miss(呢啲寫入直接落正式 DB 檔,冇改到記憶體入面呢個舊 snapshot),
  // 跟住呢度用舊 snapshot 查 pickOcrCandidates 就完全見唔到呢 25 首,
  // 誤判「冇更多 cc:miss 等 OCR」,0 首收工。要重新 openDb() 攞返呢一刻
  // 最新嘅版,先睇得到 CC 層啱啱寫落去嘅嘢。
  const freshDb = await openDb();
  const cands = pickOcrCandidates(freshDb);
  if (!cands.length) { log('冇更多 cc:miss 嘅歌等 OCR'); return 0; }

  let drafted = 0, unavailable = 0, ocrMiss = 0, streak = 0;
  for (let i = 0; i < budget && i < cands.length; i++) {
    const c = cands[i];
    log(`  OCR 處理 [${c.artist}] ${c.title}`);
    // 慢工序全部喺 mkdtemp 目錄入面做,呢首(唔理成功定失敗)一定即刪。
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hymnocr-'));
    try {
      let videoPath;
      try {
        videoPath = await downloadVideoLowRes(c.youtube_id, dir);
      } catch (e) {
        streak++;
        log(`    ⚠ 落載失敗 (連續 ${streak}):${e?.message || e}`);
        if (streak >= 3) {
          log('  連續 3 次落載失敗 —— 用 CC 對照探測分清係咪俾擋…');
          await sleep(jitter(DELAY_MS));
          const probe = await listManualSubs(PROBE_VIDEO);
          if (probe.error) { log('  對照都 exec 失敗 → 疑似俾 YouTube 擋,今晚 OCR 收工'); break; }
          log('  對照行到 → 唔關 block 事,呢首本身落唔到,繼續'); streak = 0;
        }
        continue; // 冇寫 DB,留返下晚再試(finally 已經會清 temp dir)
      }
      streak = 0;

      const frames = await extractFrames(videoPath, dir);
      log(`    抽咗 ${frames.length} 張 frame`);
      const frameLines = [];
      for (const f of frames) frameLines.push(await ocrFrame(f));
      const { blocks: ocrBlocks, text: ocrText, watermarkCount } = mergeOcrLines(frameLines);
      const ocrChars = charCount(ocrText);
      log(`    OCR 草稿 ${ocrChars} 隻字、${ocrBlocks.length} 個段落 block(剔咗 ${watermarkCount} 種疑似水印行)`);

      // 順手做 whisper(用返呢首歌啱啱落載嗰條片嘅音軌,零額外 request)。失敗
      // 唔阻 OCR draft(catch 咗)——timeline 冇 whisper 就等 alignBackfill.js 補。
      let whisperSegs = [], whisperError = null;
      if (whisperReady) {
        try {
          const wav = await extractAudioWav(videoPath, dir);
          whisperSegs = await runWhisperTranscribe(wav);
          log(`    whisper 出咗 ${whisperSegs.length} 段(存 timeline,俾將來對齊用)`);
        } catch (e) {
          whisperError = e;
          log(`    ⚠ whisper 轉錄出錯(唔阻 OCR draft):${e?.message || e}`);
        }
      }
      const whisperText = whisperPlainText(whisperSegs);
      const whisperChars = charCount(whisperText);
      const timelineFields = (ocrBlocks.length || whisperSegs.length)
        ? { lyrics_timeline: JSON.stringify({ ocr: ocrBlocks, whisper: whisperSegs, model: WHISPER_MODEL_NAME, updatedAt: new Date().toISOString() }) }
        : {};

      if (ocrChars >= MIN_DRAFT_CHARS) {
        if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: ocrText, lyrics_status: 'draft', lyrics_source: 'ocr', lyrics_checked_at: today(), ...timelineFields });
        drafted++;
        log(`    ✓ OCR 有效草稿(累計 +${drafted})`);
      } else if (whisperChars >= MIN_DRAFT_CHARS) {
        // OCR 去晒水印之後少過 40 字(當畫面冇字幕)—— whisper 文字夠就做後備 draft。
        if (!DRY) await writeLyricsRow(c.id, { lyrics_draft: whisperText, lyrics_status: 'draft', lyrics_source: 'whisper', lyrics_checked_at: today(), ...timelineFields });
        drafted++;
        log(`    ✓ OCR 冇字幕,whisper 有效草稿(累計 +${drafted})`);
      } else if (whisperReady && !whisperError) {
        if (!DRY) await writeLyricsRow(c.id, { lyrics_status: 'unavailable', lyrics_source: 'whisper', lyrics_checked_at: today(), ...timelineFields });
        unavailable++;
        log('    · OCR 冇字幕、whisper 都攞唔到嘢(可能純音樂/即興 live),標 unavailable');
      } else {
        if (!DRY) await writeLyricsRow(c.id, { lyrics_source: 'ocr:miss', lyrics_checked_at: today(), ...timelineFields });
        ocrMiss++;
        log(whisperReady ? '    · whisper 轉錄出錯,標 ocr:miss 留低(下次再試)' : '    · whisper 未裝,標 ocr:miss 留低(唔算失敗,等裝好再揀返)');
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    if (i < budget - 1) await sleep(jitter(DELAY_MS));
  }
  log(`今次:OCR/whisper 有效草稿 ${drafted} 首,unavailable ${unavailable} 首,ocr:miss(等 whisper/重試)${ocrMiss} 首`);
  return drafted;
}

async function main() {
  const db = await openDb();
  if (STATUS_ONLY) { report(db); return; }
  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${WINDOW_START}:00-${WINDOW_END}:00,唔做嘢。`);
    return;
  }
  report(db);
  const mode = arg('--mode', null);
  if (mode === 'ocr') {
    await runOcr(db, Number(arg('--budget', OCR_BUDGET)));
  } else if (mode === 'cc') {
    await runCC(db, Number(arg('--budget', CC_BUDGET)));
  } else {
    // 排程正常路徑(2026-07-24 起):每晚一次過,CC 先(平、處理新收錄嘅歌),
    // 跟住 OCR(主力,處理 CC 揾唔到嘅 backlog)。
    await runCC(db, CC_BUDGET);
    await runOcr(db, OCR_BUDGET);
  }
  log('---');
}

main().catch((e) => { console.error('fetchLyrics 出錯:', e); process.exit(1); });
