#!/usr/bin/env node
// scripts/classifyLangByWhisper.js — ORG-611-RAW-LANG-REPORT-20260905 T3。
//
// 可重跑嘅語言判定工具:抽 60 秒音訊(由 30% 位置開始,避開前奏)落
// scratchpad,跑 whisper 語言偵測,判 粵語/國語/英文/混合,寫返 hymns_all.lang
// (經 acquireDbLock)。每首處理完即刻 rm 臨時音訊,唔留本地副本。
//
// ⚠️ 重要限制(方法論已經 calibrate 過,詳見 ORG-611-RAW-LANG-REPORT-
// 20260905.md §3 正控):whisper 嘅語言自動偵測(-l auto -dl)喺呢部機裝嘅
// 兩個 model(ggml-medium.bin / ggml-large-v3-turbo-q5_0.bin)**都分唔到
// 粵語(yue)同國語(zh)**——兩種中文一律偵測做 "zh",p>=0.93。呢個唔係
// bug,係 whisper 呢代 model 對粵語冇獨立 language token 訓練夠(large-v3
// 雖然 vocab 有 yue token,但 -dl auto-detect 從來冇揀過,forced -l yue
// 転錄仲會質素明顯跌,見報告 §3 四組樣本)。所以:
//   · 中文 vs 英文 —— whisper 判得準,呢個工具主判。
//   · 粵語 vs 國語 —— whisper 判唔到,呢個工具淨係做「內容輔助」(Cantonese
//     語氣助詞掃描:嘅/唔/冇/喺/佢/哋/咗/嚟/咁/啲/嘢/乜/嗰/畀/俾 等,喺
//     zh 轉錄文字度搵),搵到就當粵語強訊號;搵唔到(絕大部份情況,因為
//     詩歌歌詞書面文字通常用標準中文,唔管唱嘅時候發音係粵定國)就沿用
//     現有 lang(頻道層面推斷),note 標「內容證據不足,沿用頻道推斷,要
//     人手聽真人發音先可以實錘」。
//
// Usage:
//   node scripts/classifyLangByWhisper.js --org "Church 611" --dry
//   node scripts/classifyLangByWhisper.js --org "Church 611"          # 真寫
//   node scripts/classifyLangByWhisper.js --ids 9042,9043 --dry       # 測個別 id

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, acquireDbLock, releaseDbLock, query } from '../lib/hymnDb.js';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY = process.argv.includes('--dry');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const IDS = arg('--ids', null) ? arg('--ids', null).split(',').map((s) => Number(s.trim())) : null;

const SCRATCH = process.env.CLASSIFY_SCRATCH_DIR
  || '/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/611audio/run';
fs.mkdirSync(SCRATCH, { recursive: true });

const MODEL = path.join(__dirname, '..', 'models', 'ggml-large-v3-turbo-q5_0.bin');
const CLIP_SEC = 60;
const OFFSET_FRACTIONS = [0.3, 0.6, 0.15]; // 30% → 60% → 15%,首個唔得先試下一個

const CANTO_CHARS = ['嘅', '唔', '冇', '喺', '佢', '哋', '咗', '嚟', '咁', '啲', '嘢', '乜', '嗰', '噉', '畀', '俾', '嗌'];
const GARBAGE_PHRASES = [
  '字幕志愿者', '字幕組', 'Amara.org', '独播剧场', '独播劇場', '中文字幕由',
  '感谢观看', '請不吝點贊', '訂閱', '点赞', '关注', 'www.', 'subtitles by',
];

function parseDurationToSec(text) {
  if (!text) return null;
  const parts = String(text).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

async function downloadClip(youtubeId, start, end, outBase) {
  await exec(
    `yt-dlp -f bestaudio --extract-audio --audio-format wav --download-sections "*${start}-${end}" ` +
    `--force-keyframes-at-cuts -o "${outBase}.%(ext)s" "https://www.youtube.com/watch?v=${youtubeId}" -q`,
    { timeout: 90000 }
  );
  const wav = `${outBase}.wav`;
  if (!fs.existsSync(wav)) throw new Error('yt-dlp 冇拎到 wav');
  const wav16k = `${outBase}_16k.wav`;
  await exec(`ffmpeg -i "${wav}" -vn -ar 16000 -ac 1 -y "${wav16k}" -loglevel error`, { timeout: 30000 });
  fs.unlinkSync(wav);
  return wav16k;
}

async function detectLang(wavPath) {
  const { stdout, stderr } = await exec(`whisper-cli -m "${MODEL}" -f "${wavPath}" -l auto -dl`, { timeout: 60000 });
  const m = (stdout + stderr).match(/auto-detected language:\s*(\w+)\s*\(p\s*=\s*([\d.]+)\)/);
  if (!m) return { lang: null, prob: 0 };
  return { lang: m[1], prob: Number(m[2]) };
}

async function transcribeZh(wavPath) {
  const { stdout, stderr } = await exec(`whisper-cli -m "${MODEL}" -f "${wavPath}" -l zh -np`, { timeout: 90000 });
  const out = stdout + stderr;
  const lines = out.split('\n').filter((l) => l.includes('-->'));
  const text = lines.map((l) => l.replace(/^\[[\d:.>\- ]+\]\s*/, '').trim()).join(' ');
  return { text, segLines: lines };
}

function isHallucination(result) {
  const { text, segLines } = result;
  if (!text || text.replace(/\s/g, '').length < 6) return true;
  if (GARBAGE_PHRASES.some((p) => text.includes(p))) return true;
  // 30 秒一半 vs 另一半完全一樣(逐字重覆)= whisper 幻覺嘅經典指紋。
  if (segLines.length >= 2) {
    const half = Math.floor(segLines.length / 2);
    const firstHalf = segLines.slice(0, half).join('|');
    const secondHalf = segLines.slice(half).join('|');
    if (half > 0 && firstHalf === secondHalf) return true;
  }
  return false;
}

function cantoParticleScan(text) {
  const hits = CANTO_CHARS.filter((c) => text.includes(c));
  return { hit: hits.length > 0, chars: hits };
}

// 主分類:傳返 { lang, prob, method, note, rawText }
export async function classifySong({ youtube_id, duration, title }, existingLang) {
  const durSec = parseDurationToSec(duration);
  if (!durSec || durSec < CLIP_SEC + 5) {
    return { lang: existingLang, prob: null, method: 'duration-too-short', note: '片長唔夠攞60秒clip,沿用現有lang' };
  }

  for (const frac of OFFSET_FRACTIONS) {
    const start = Math.floor(durSec * frac);
    const end = Math.min(start + CLIP_SEC, durSec - 1);
    if (end - start < 20) continue;
    const outBase = path.join(SCRATCH, `${youtube_id}_${Math.round(frac * 100)}`);
    let wav16k = null;
    try {
      wav16k = await downloadClip(youtube_id, start, end, outBase);
      const det = await detectLang(wav16k);

      if (det.lang === 'en' && det.prob >= 0.6) {
        return { lang: '英文', prob: det.prob, method: `whisper-auto@${Math.round(frac * 100)}%`, note: '偵測到英文,高信心' };
      }

      if (det.lang === 'zh' || det.prob < 0.6) {
        const tr = await transcribeZh(wav16k);
        if (isHallucination(tr)) {
          // 呢個位冇聲/幻覺,試下一個 offset
          continue;
        }
        const canto = cantoParticleScan(tr.text);
        if (canto.hit) {
          return {
            lang: '粵語', prob: det.prob, method: `whisper-zh+粵語助詞@${Math.round(frac * 100)}%`,
            note: `轉錄文字撞到粵語助詞(${canto.chars.join('')}),強訊號`, rawText: tr.text,
          };
        }
        // 中文但搵唔到粵語助詞——書面歌詞通常標準中文,分唔到粵/國,沿用
        // 現有 lang(頻道層面推斷),但要人手覆核。
        return {
          lang: existingLang, prob: det.prob, method: `whisper-zh-content-inconclusive@${Math.round(frac * 100)}%`,
          note: '偵測到中文,但轉錄文字冇撞到粵語專屬助詞(書面歌詞標準中文,粵/國分唔到)——沿用頻道推斷,要人手聽真人發音', rawText: tr.text, needsHuman: true,
        };
      }

      // 其他語言 code(例如幻覺出嚟嘅 fi/ko 等)或者低信心——試下一個 offset。
    } catch (e) {
      // 呢個 offset 出錯(下載/whisper 失敗),試下一個
    } finally {
      if (wav16k && fs.existsSync(wav16k)) fs.unlinkSync(wav16k);
    }
  }

  return { lang: existingLang, prob: null, method: 'all-offsets-failed', note: '三個offset都冇攞到有效語音(幻覺/下載失敗),要人手', needsHuman: true };
}

async function main() {
  const db = await openDb();
  let rows;
  if (IDS) rows = query(db, `SELECT id, title, youtube_id, duration, lang FROM hymns_all WHERE id IN (${IDS.map(() => '?').join(',')})`, IDS);
  else if (ORG) rows = query(db, `SELECT id, title, youtube_id, duration, lang FROM hymns_all WHERE org = ? ORDER BY id`, [ORG]);
  else { console.error('要 --org 或者 --ids'); process.exit(1); }

  console.log(`共 ${rows.length} 首,dry=${DRY}`);
  const results = [];
  for (const r of rows) {
    process.stdout.write(`  [${r.id}] ${r.title.slice(0, 40)} … `);
    const res = await classifySong(r, r.lang);
    console.log(`${r.lang} → ${res.lang} (${res.method}, p=${res.prob ?? 'n/a'})`);
    results.push({ id: r.id, title: r.title, oldLang: r.lang, ...res });
    await sleep(jitter(1500));
  }

  console.log('\n=== 對照表 ===');
  console.log('id\t舊lang\t新lang\tprob\tmethod\tneedsHuman');
  for (const r of results) {
    console.log(`${r.id}\t${r.oldLang}\t${r.lang}\t${r.prob ?? ''}\t${r.method}\t${r.needsHuman ? '要人手' : ''}`);
  }

  const changed = results.filter((r) => r.lang !== r.oldLang);
  console.log(`\n有變動:${changed.length}/${results.length}`);

  if (!DRY && changed.length) {
    const token = await acquireDbLock('classify-lang-whisper');
    if (!token) { console.error('攞唔到 DB 鎖,唔寫'); process.exit(1); }
    try {
      for (const r of changed) {
        db.run(`UPDATE hymns_all SET lang = ? WHERE id = ?`, [r.lang, r.id]);
      }
      saveDb(db);
      console.log(`已寫入 ${changed.length} 條 lang 改動`);
    } finally {
      releaseDbLock(token);
    }
  } else {
    console.log(DRY ? '(--dry,未寫DB)' : '冇變動,唔使寫DB');
  }

  return results;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
