#!/usr/bin/env node
// 歌詞入庫 —— LYRICS-PIPELINE-PLAN 落地。獨立夜晚隊列,同 growLibrary **完全分開**:
// 自己揀 curated 又冇歌詞(lyrics_status='none')嘅歌，新收錄嘅歌自動係 'none' 就
// 自然流入呢條隊，兩個 script 零耦合。
//
// ── 每首歌嘅流程(LYRICS-PIPELINE-PLAN §3c)──────────────────────
//   ① CC 字幕   yt-dlp --list-subs：有**人手**字幕軌 → 落載 vtt → 清 timestamp/重複 → draft(cc)
//   ② OCR       冇 CC → 落低清片抽 frame → vision model 讀燒死喺畫面嘅字   [STAGE 2,未接]
//   ③ Whisper   畫面都冇字 → 音訊轉錄                                    [STAGE 2,未接]
//   ④ 都唔得    標 unavailable(90 日後可重試),UI 照「暫無歌詞」
// ⚠️ 呢個 STAGE 1 只做 ①(CC,平、可測)。②③ 係 stub —— CC 揾唔到嘅歌會標
//    source='cc:miss' 泊住,等 STAGE 2 接 OCR/whisper 嗰陣再揀返(唔會夜夜重 CC)。
//
// ── 草稿 ≠ 入庫 ──────────────────────────────────────────────────
// CC/OCR/whisper 出嘅只係 `lyrics_draft` + status='draft',**唔會出街**。
// 要執行 session 對照官方來源(讚美之泉/小羊/CantonHymn)校對、寫入 `lyrics` +
// status='verified' 先至俾前端見到。同擴庫「攞到 ID 唔算收錄」同一精神。
//
// ── 安全機制(全部沿用 growLibrary,唔好行返轉頭)────────────────
//   * 只喺 00:00-09:00 窗口行(script 自己 double check);排程排 04:20(growLibrary
//     跳過 4 點、deadlink 04:00 做完 ~4:07,呢個 gap 冇人爭 → 唔會同佢哋撞 YouTube
//     或者撞 DB 寫入)。concurrency=1、每首之間 jitter delay。
//   * budget 分兩級:CC 平,10 首;OCR 重,3-5 首(STAGE 2)。
//   * 連續 3 次 yt-dlp **exec 失敗**(唔係「冇字幕」——嗰個係正常 miss)→ 用一首已知
//     有 CC 嘅歌做對照探測,分清「俾 YouTube 擋」定「呢批片本身冇字幕」。
//
// Usage:
//   node scripts/fetchLyrics.js --budget 10 --delay 4000
//   node scripts/fetchLyrics.js --status         # 報告,唔改嘢
//   node scripts/fetchLyrics.js --ignore-window --dry   # 測試,唔寫 DB

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openDb, saveDb, query, sleep } from '../lib/hymnDb.js';

const exec = promisify(execCb);

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('--budget', 10));
const DELAY_MS = Number(arg('--delay', 4000));
const STATUS_ONLY = process.argv.includes('--status');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const DRY = process.argv.includes('--dry');

const WINDOW_START = 0, WINDOW_END = 9;
// 對照探測片:LYRICS-PIPELINE-PLAN §0 記錄小羊詩歌精選有 zh-CN 人手字幕軌。
const PROBE_VIDEO = 'gF-eDlXq3II';
// 想收嘅字幕語言(人手軌;auto-generated 唔算)
const WANT_LANGS = ['zh-Hant', 'zh-HK', 'yue', 'zh', 'zh-Hans', 'zh-CN', 'en'];

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
const inWindow = () => { const h = new Date().getHours(); return h >= WINDOW_START && h < WINDOW_END; };

function report(db) {
  const rows = query(db, `SELECT lyrics_status, COUNT(*) n FROM hymns_all WHERE curated=1 AND status!='dead' GROUP BY lyrics_status`);
  log('歌詞進度(curated):');
  for (const r of rows) log(`   ${r.lyrics_status || 'none'}  →  ${r.n} 首`);
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

async function runCC(db) {
  log(`mode=CC budget=${BUDGET} delay=~${DELAY_MS}ms`);
  const cands = pickCandidates(db);
  if (!cands.length) { log('冇更多要做嘅歌(全部 curated 都試過 CC 或者有歌詞)'); return 0; }

  let drafted = 0, missed = 0, streak = 0;
  for (let i = 0; i < BUDGET && i < cands.length; i++) {
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
      if (i < BUDGET - 1) await sleep(jitter(DELAY_MS));
      continue;
    }
    streak = 0;

    if (langs.length) {
      const text = await downloadSubs(c.youtube_id, langs);
      if (text && text.length > 10) {
        if (!DRY) {
          db.run(`UPDATE hymns_all SET lyrics_draft=?, lyrics_status='draft', lyrics_source='cc', lyrics_checked_at=? WHERE id=?`,
            [text, today(), c.id]);
          saveDb(db);
        }
        drafted++;
        log(`    ✓ CC 有字幕(${langs.join(',')}),存草稿 ${text.length} 字(累計 +${drafted})`);
      } else {
        // 話有軌但落唔到 → 當 miss,泊去等 OCR
        if (!DRY) { db.run(`UPDATE hymns_all SET lyrics_source='cc:miss', lyrics_checked_at=? WHERE id=?`, [today(), c.id]); saveDb(db); }
        missed++;
        log('    · 有軌但攞唔到內容,標 cc:miss(等 OCR)');
      }
    } else {
      // 冇人手字幕(大多數中文敬拜 MV 都係咁)→ 標 cc:miss,等 STAGE 2 OCR
      if (!DRY) { db.run(`UPDATE hymns_all SET lyrics_source='cc:miss', lyrics_checked_at=? WHERE id=?`, [today(), c.id]); saveDb(db); }
      missed++;
      log('    · 冇人手 CC,標 cc:miss(等 OCR)');
    }
    if (i < BUDGET - 1) await sleep(jitter(DELAY_MS));
  }
  log(`今次:CC 草稿 ${drafted} 首,冇 CC(泊去等 OCR)${missed} 首`);
  return drafted;
}

// STAGE 2 stub —— 揀 source='cc:miss' 嘅歌做 OCR/whisper。未接 vision API / whisper。
async function runOcrStub(db) {
  const n = query(db, `SELECT COUNT(*) n FROM hymns_all WHERE curated=1 AND lyrics_status='none' AND lyrics_source='cc:miss'`)[0].n;
  log(`mode=OCR —— STAGE 2 未實作。而家有 ${n} 首 cc:miss 等緊 OCR/whisper。`);
  log('   要落實:落低清片 → ffmpeg 抽 frame → vision model 讀字(繁體 OCR)→ draft(ocr);');
  log('   畫面都冇字先 whisper 轉錄。處理完即刪片檔(唔存副本)。見 LYRICS-PIPELINE-PLAN §2④⑤。');
  return 0;
}

async function main() {
  const db = await openDb();
  if (STATUS_ONLY) { report(db); return; }
  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${WINDOW_START}:00-${WINDOW_END}:00,唔做嘢。`);
    return;
  }
  report(db);
  const mode = arg('--mode', 'cc');
  if (mode === 'ocr') await runOcrStub(db);
  else await runCC(db);
  log('---');
}

main().catch((e) => { console.error('fetchLyrics 出錯:', e); process.exit(1); });
