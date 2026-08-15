#!/usr/bin/env node
// 粵語歌 cantonhymn.net 核對底本預篩 —— Eric 2026-08-15 拍板(47H 衝刺加建)。
//
// 做乜:逐首「粵語 + 仲未有歌詞」嘅歌行一次 scripts/cantonhymnLookup.js,記低邊啲
// 喺 cantonhymn.net 搵到現成核對底本,寫入 backend/data/cantonhymn-prescreen.json。
// fetchLyrics.js 讀呢個檔,將有底本嘅歌**排到 OCR/CC 隊頭**。
//
// 點解值得做:實測 50 首樣本,52% 有候選底本(其中 85% 核過係同一首,即有效 ~44%),
// 每首 0.8 秒、零 YouTube request、零 Claude 額度。而家 OCR 池嘅語言分佈係
// 國語 409 / 粵語 125 —— producer 隨機抽,即係大部分複核決定花咗喺「冇免費核對
// 來源」嗰批,而有現成底本嘅粵語歌反而排後面。呢個 script 就係反轉呢個次序。
//
// ⚠️ 版權紅線(HANDOFF.md §2.0,Eric 2026-07-27 永久規矩)冇變:cantonhymn 嘅文字
//    **只准核對,唔准照抄入 DB**。呢個 script 淨係做「排隊優先次序」同埋預熱 cache,
//    **一個字歌詞都唔會寫入 DB**(佢根本冇 DB 寫入路徑)。標記咗 = 複核嗰陣有底本
//    可以對,唔等於嗰首歌自動有歌詞。
//
// 用法:
//   node ops/lyrics/cantonhymn-prescreen.mjs            # 全跑(識 resume,已probe過嘅會skip)
//   node ops/lyrics/cantonhymn-prescreen.mjs --limit 50 # 只做頭 N 首(試機用)
//   node ops/lyrics/cantonhymn-prescreen.mjs --stats    # 淨係印現有結果統計,唔打網絡

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..', '..');
const BACKEND = path.join(REPO, 'backend');
const DB = path.join(BACKEND, 'hymns.db');
const OUT = path.join(BACKEND, 'data', 'cantonhymn-prescreen.json');
const LOOKUP = path.join(BACKEND, 'scripts', 'cantonhymnLookup.js');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', 0));
const STATS_ONLY = process.argv.includes('--stats');
const DELAY_MS = 400; // 客氣啲,~1.5 req/s 封頂

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadOut() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { return { hits: {}, misses: [] }; }
}

function saveOut(data) {
  data.generatedAt = new Date().toISOString();
  data.stats = {
    probed: Object.keys(data.hits).length + data.misses.length,
    hits: Object.keys(data.hits).length,
    misses: data.misses.length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(`${OUT}.tmp`, OUT); // 原子寫,中途 kill 都唔會爛檔
}

// 用 sqlite3 CLI read-only 攞名單 —— 零 DB 鎖風險,唔會阻住 producer / backend。
async function fetchTargets() {
  const sql = `SELECT id, title FROM hymns_all
               WHERE curated=1 AND status!='dead' AND lang='粵語'
                 AND (lyrics_status IS NULL OR lyrics_status='none')
               ORDER BY id`;
  const { stdout } = await execFileP('sqlite3', ['-json', `file:${DB}?mode=ro`, sql], { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout || '[]');
}

async function probe(title) {
  try {
    const { stdout } = await execFileP('node', [LOOKUP, title, '--json', '--limit', '2'],
      { cwd: BACKEND, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const j = JSON.parse(stdout || '{}');
    if (!j.found) return null;
    const r = j.results[0];
    return { slug: r.match.slug, type: r.match.type, chTitle: r.currentSong?.title || null, via: r.match.via || null };
  } catch (e) {
    // exit 2 = index 揾唔到 / API 冇料(正常 miss);其餘當 miss 但唔好因為佢死成個 run
    return null;
  }
}

(async () => {
  const data = loadOut();
  if (STATS_ONLY) {
    const s = data.stats || {};
    log(`已 probe ${s.probed || 0} 首:有底本 ${s.hits || 0}、冇 ${s.misses || 0}` +
        (s.probed ? `(命中率 ${(s.hits / s.probed * 100).toFixed(1)}%)` : ''));
    return;
  }

  const targets = await fetchTargets();
  const done = new Set([...Object.keys(data.hits).map(Number), ...data.misses]);
  let todo = targets.filter((t) => !done.has(t.id));
  if (LIMIT) todo = todo.slice(0, LIMIT);

  log(`粵語冇歌詞:${targets.length} 首,已 probe ${done.size} 首,今轉做 ${todo.length} 首(每首 ~0.8 秒)`);

  let hits = 0;
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    const r = await probe(t.title);
    if (r) { data.hits[t.id] = r; hits++; } else { data.misses.push(t.id); }
    if ((i + 1) % 25 === 0 || i === todo.length - 1) {
      saveOut(data);
      log(`  ${i + 1}/${todo.length} —— 今轉有底本 ${hits} 首(累計 ${Object.keys(data.hits).length})`);
    }
    await sleep(DELAY_MS);
  }

  saveOut(data);
  const s = data.stats;
  log(`完成:全池 probe ${s.probed} 首,**有現成核對底本 ${s.hits} 首**(${(s.hits / s.probed * 100).toFixed(1)}%),冇 ${s.misses} 首`);
  log(`→ ${OUT}(fetchLyrics.js 會讀呢個檔排隊;API JSON 已順手落咗 30 日 cache)`);
})().catch((e) => { console.error('prescreen 出錯:', e); process.exit(1); });
