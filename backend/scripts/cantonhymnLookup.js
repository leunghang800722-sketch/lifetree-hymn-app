#!/usr/bin/env node
// 用 cantonhymn.net 自己個公開 JSON API 攞歌詞,俾歌詞複核 routine 做核對底本。
//
// 背景(2026-08-12):cantonhymn.net 個歌曲頁改晒做 React 前端,靜態 HTML / WebFetch
// 淨係攞到 og:description 頭 ~300 字,攞唔到完整歌詞。但佢個前端 bundle
// (react_components/parentSongSingleView.js)其實係打呢個 endpoint 攞 JSON:
//     GET https://cantonhymn.net/api/song-detail.php?slug=<slug>&songHierarchyType=parent|child
// 呢個 endpoint 免登入、robots.txt 冇 Disallow、返完整結構化歌詞,
// 而且一次過連埋所有粵語翻譯版本(otherRelatedSongs),比逐頁 WebFetch 抵得多。
// 唯一要注意:Cloudflare 會擋預設 UA(python-urllib 之類直接 403),要帶瀏覽器 UA。
//
// 用法:
//   node scripts/cantonhymnLookup.js "歌名"            # 用歌名搵(index grep + fetch)
//   node scripts/cantonhymnLookup.js "歌名" --limit 3  # 最多睇幾多個候選(預設 3)
//   node scripts/cantonhymnLookup.js --slug <slug> --type child
//   node scripts/cantonhymnLookup.js "歌名" --json     # 出 JSON 俾其他 script 食
//   node scripts/cantonhymnLookup.js "歌名" --no-cache # 唔用本地 cache
//   node scripts/cantonhymnLookup.js "歌名" --keep-chords # 保留 [C][G] 和弦標記(預設剷走)
//
// ⚠️ 版權紅線(HANDOFF.md §2.0):呢度攞返嚟嘅文字淨係用嚟核對 OCR draft 嘅結構同錯字,
//    一隻字都唔准成段照抄入 DB;報告/log 都唔准貼完整歌詞。

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'lyrics-verify-cache', 'api');
const TSV_PATH = path.join(__dirname, '..', 'data', 'lyrics-verify-cache', 'cantonhymn-title-url-index.tsv');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const opts = { query: null, slug: null, type: null, limit: 3, json: false, cache: true, keepChords: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--slug') { opts.slug = argv[++i]; }
    else if (a === '--type') { opts.type = argv[++i]; }
    else if (a === '--limit') { opts.limit = Number(argv[++i]) || 3; }
    else if (a === '--json') { opts.json = true; }
    else if (a === '--no-cache') { opts.cache = false; }
    else if (a === '--keep-chords') { opts.keepChords = true; }
    else if (!a.startsWith('--') && opts.query === null) { opts.query = a; }
  }
  return opts;
}

// 歌名正規化:剷走標點/空白/WordPress 嘅 -2 -3 去重後綴,方便寬鬆比對
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/-\d+$/, '')
    .replace(/[\s　·、,,。.!!??::;;「」『』（）()\[\]【】<>《》~~\-_'"'"]/g, '');
}

function loadIndex() {
  if (!fs.existsSync(TSV_PATH)) {
    throw new Error(`揾唔到 index:${TSV_PATH}(行 node scripts/updateCantonhymnIndex.js 先)`);
  }
  return fs.readFileSync(TSV_PATH, 'utf8').split('\n').filter(Boolean).map((line) => {
    const parts = line.split('\t');
    // 舊格式(2 欄:title \t url)照樣讀得,type 當 parent
    if (parts.length < 4) {
      const slug = (parts[1] || '').replace(/\/$/, '').split('/song/')[1] || '';
      return { title: parts[0], type: 'parent', slug, url: parts[1] };
    }
    return { title: parts[0], type: parts[1], slug: parts[2], url: parts[3] };
  });
}

// 我哋 DB 啲 title 係 YouTube 原題,成日夾住頻道名/專輯名/場地/「Official MV」之類。
// 拆返做候選片語,逐個試,先試整條、再試括號/分隔符入面嘅片段(通常真歌名喺嗰度)。
const NOISE = /(official|lyric|lyrics|mv|music\s*video|audio|hd|4k|live|cover|demo|piano|acoustic|feat\.?|ft\.?|版|鋼琴版|純音樂|敬拜|專輯|現場|字幕)/i;

const OPEN = '《【「（(\\[';
const CLOSE = '》】」）)\\]';

function titleCandidates(raw) {
  const t = String(raw || '').trim();
  const out = [t];
  // 括號類入面嘅內容通常就係歌名
  for (const m of t.matchAll(new RegExp(`[${OPEN}]([^${CLOSE}]{2,30})[${CLOSE}]`, 'g'))) out.push(m[1]);
  // 剷走成組括號之後剩返嘅主體(例:「默然愛我 (Amazed 廣東話版)」→「默然愛我」)
  const stripped = t.replace(new RegExp(`[${OPEN}][^${CLOSE}]*[${CLOSE}]`, 'g'), ' ');
  out.push(stripped);
  // 再按常見分隔符拆(括號本身都當分隔符,因為好多 title 得半邊括號)
  for (const src of [t, stripped]) {
    for (const seg of src.split(new RegExp(`\\s*(?:\\|\\||//|[|/／•·–—~〜:：${OPEN}${CLOSE}]|\\s-\\s)\\s*`))) {
      const c = seg.trim();
      if (c.length >= 2 && c.length <= 30) out.push(c);
    }
  }
  const seen = new Set();
  return out
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .filter((c) => c.length >= 2 && !(c.length <= 12 && NOISE.test(c)))
    .filter((c) => { const k = normalize(c); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// 粵語 cover 通常係 child,同名時 child 排前;之後短 title 優先(少啲雜訊)
const rankRow = (a, b) => (a.type === b.type ? a.title.length - b.title.length : (a.type === 'child' ? -1 : 1));

function searchIndex(query, limit) {
  const rows = loadIndex();
  const norm = rows.map((r) => ({ ...r, n: normalize(r.title) }));
  const picked = [];
  const pickedKeys = new Set();
  const push = (r, via) => {
    const k = `${r.type}:${r.slug}`;
    if (pickedKeys.has(k)) return;
    pickedKeys.add(k);
    picked.push({ ...r, via });
  };

  const cands = titleCandidates(query);
  // 第一輪:所有候選片語嘅 exact match(最可信)
  for (const c of cands) {
    const nc = normalize(c);
    if (!nc) continue;
    norm.filter((r) => r.n === nc).sort(rankRow).forEach((r) => push(r, c));
    if (picked.length >= limit) return picked.slice(0, limit);
  }
  // 第二輪:substring match —— 只准「候選片語 ⊂ index 歌名」呢個方向。
  // 反方向(index 歌名 ⊂ 成條 YouTube title)實測會出大量假陽性:
  // 短英文歌名「One」撞中「Milk&Honey」入面個 one、「讚美之泉」撞中頻道名等等。
  for (const c of cands) {
    const nc = normalize(c);
    // 純英文短片語太易撞(「AKF」撞中「Break Free」),要夠長先算
    const isCjk = /[\u3400-\u9fff]/.test(nc);
    if (nc.length < (isCjk ? 3 : 6)) continue;
    norm.filter((r) => r.n !== nc && r.n.includes(nc))
      .sort(rankRow).slice(0, limit).forEach((r) => push(r, c));
    if (picked.length >= limit) break;
  }
  return picked.slice(0, limit);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Referer: 'https://cantonhymn.net/' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse 失敗:${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// sitemap 有啲 slug 喺 child endpoint 唔認、要行 parent(或者相反),所以一邊唔得就試另一邊
async function fetchSongDetail(slug, type, useCache) {
  const first = type === 'child' ? 'child' : 'parent';
  try {
    return await fetchSongDetailOnce(slug, first, useCache);
  } catch (e) {
    return fetchSongDetailOnce(slug, first === 'child' ? 'parent' : 'child', useCache);
  }
}

async function fetchSongDetailOnce(slug, type, useCache) {
  const hierarchy = type === 'child' ? 'child' : 'parent';
  const cachePath = path.join(CACHE_DIR, `${hierarchy}-${encodeURIComponent(slug).replace(/%/g, '_')}.json`);
  if (useCache && fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < CACHE_TTL_MS) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  const url = `https://cantonhymn.net/api/song-detail.php?slug=${slug}&songHierarchyType=${hierarchy}`;
  const body = await fetchJson(url);
  if (!body || body.success !== true || !body.data || !body.data.currentSong) {
    throw new Error(`API 冇返有效資料(slug=${slug} type=${hierarchy})`);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(body));
  return body;
}

// API 啲 meta 欄位有時係字串,有時係 [{id,label,slug}] 陣列,要攤平做人睇得明嘅文字
function flatten(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(',');
  if (typeof v === 'object') return String(v.label || v.name || v.title || '');
  return String(v);
}

function creditLine(s) {
  const bits = [
    ['曲', s.songcomposer], ['詞', s.songlyricist], ['粵譯', s.songtranslate],
    ['語言', s.songlanguage], ['專輯', s.songalbum],
  ].map(([k, v]) => { const t = flatten(v); return t ? `${k}:${t}` : ''; }).filter(Boolean);
  return bits.join(' / ');
}

// cantonhymn 係 chord 譜平台,歌詞行成日夾住 [C] [G/B] 呢類和弦標記同 chord-only 行。
// 核對 OCR draft 嗰陣呢啲純粹係雜訊,預設剷走(要睇原文就 --keep-chords)。
function stripChords(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\[[^\]]*\]/g, '').replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n');
}

function printSong(s, label, keepChords) {
  const credit = creditLine(s);
  console.log(`\n【${label}】${s.title}${credit ? `  (${credit})` : ''}`);
  console.log(`  slug: ${s.slug}`);
  console.log('  ---');
  const body = keepChords ? String(s.lyrics || '').replace(/\r\n/g, '\n') : stripChords(s.lyrics);
  console.log((body.trim() ? body : '(冇歌詞)').split('\n').map((l) => `  ${l}`).join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.query && !opts.slug) {
    console.error('用法: node scripts/cantonhymnLookup.js "歌名" [--limit N] [--json] [--no-cache]');
    console.error('      node scripts/cantonhymnLookup.js --slug <slug> --type parent|child');
    process.exit(1);
  }

  const targets = opts.slug
    ? [{ title: opts.slug, type: opts.type || 'parent', slug: opts.slug }]
    : searchIndex(opts.query, opts.limit);

  if (targets.length === 0) {
    const msg = `index 揾唔到「${opts.query}」——當「呢個來源核對唔到」,落 WebSearch fallback`;
    if (opts.json) console.log(JSON.stringify({ query: opts.query, found: 0, results: [] }));
    else console.log(msg);
    process.exit(2);
  }

  const results = [];
  for (const t of targets) {
    let body;
    try {
      body = await fetchSongDetail(t.slug, t.type, opts.cache);
    } catch (e) {
      if (!opts.json) console.error(`⚠️ ${t.title} (${t.type}) 攞唔到:${e.message}`);
      continue;
    }
    const cur = body.data.currentSong;
    const related = (body.data.otherRelatedSongs || []).filter((r) => (r.lyrics || '').trim());
    results.push({ match: t, currentSong: cur, otherRelatedSongs: related });

    if (!opts.json) {
      console.log(`\n${'='.repeat(72)}`);
      if (t.via && normalize(t.via) !== normalize(opts.query || '')) {
        console.log(`(靠片語「${t.via}」喺 index 撞到,唔係成條 title 直中 —— 一定要對埋內容先當核到)`);
      }
      if (t.title && normalize(t.title) !== normalize(cur.title)) {
        console.log(`(index 收錄嘅歌名係「${t.title}」,但個站而家 return「${cur.title}」—— 同一個 slug 改過名,自己判斷係咪同一首)`);
      }
      printSong({ ...cur, slug: t.slug }, t.type === 'child' ? '粵語版' : '原曲', opts.keepChords);
      for (const r of related) printSong(r, '相關粵語版', opts.keepChords);
    }
  }

  if (opts.json) console.log(JSON.stringify({ query: opts.query || opts.slug, found: results.length, results }, null, 2));
  else console.log(`\n${'='.repeat(72)}\n候選 ${targets.length} 個,成功攞到 ${results.length} 個。⚠️ 只准核對,唔准照抄。`);
  if (results.length === 0) process.exit(2);
}

main().catch((err) => {
  console.error('cantonhymnLookup 失敗:', err.message);
  process.exit(1);
});
