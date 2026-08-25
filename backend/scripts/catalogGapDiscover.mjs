#!/usr/bin/env node
// 一般詩歌「官方目錄對比」P2 —— CATALOG-GAP-PLAN-20260824.md §3 P2
//
// 攞 P0/P1 出嘅「真缺」名單,喺**官方 YouTube 頻道嘅封閉集合**入面認返條片。
//
// 🔴 **零關鍵字搜尋紅線**(規劃書 §1):
//   · 候選片一律由 `yt-dlp --flat-playlist` **枚舉指定官方 channel** 攞返嚟
//     (`/videos` + `/releases`),即係「呢個 org 官方頻道自己出過嘅片」。
//   · 目錄歌名**只做認片嘅比對字串**,唔會做任何搜尋 query。
//   · 全 script 冇 `ytsearch`、冇 YouTube 搜尋頁、冇 `--match-title` 全站撈。
//   · Q5 拍板:目錄有但官方頻道冇上載 → **就係唔收**,唔去第三方搵。
//
// 🔴 **唔寫 DB**。出候選對應表俾 P3 入庫。
//
// 用法:node scripts/catalogGapDiscover.mjs --org <name> | --all

import fs from 'fs';
import path from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { openDb, query, sleep, isCompilation, isNonWorship, isInSongDurationBand } from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';
import { YTDLP } from '../lib/ytdlpBin.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'data', 'catalog-gap');
const CH_CACHE = path.join(OUT_DIR, 'channel-index');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const ALL = process.argv.includes('--all');
const GAP_FILE = arg('--gap', path.join(OUT_DIR, 'gap-20260825.json'));
const REFRESH = process.argv.includes('--refresh');

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const mdEsc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const FOLD = [['祢', '你'], ['禰', '你'], ['衪', '他'], ['祂', '他'], ['妳', '你'],
  ['裏', '里'], ['裡', '里'], ['著', '着'], ['讚', '赞'], ['讃', '赞']];
const fold = (s) => { let t = String(s || ''); for (const [a, b] of FOLD) t = t.split(a).join(b); return t; };
const cjk = (s) => fold(s).replace(/[^一-鿿㐀-䶿]/g, '');
const lat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const coreName = (t) => String(t || '')
  .replace(/[（(]\s*(feat|ft|with|featuring)\b[^）)]*[）)]/gi, ' ')
  .replace(/\s*[-–—]\s*(feat|ft)\.?\s.*$/i, ' ').trim();

// YouTube 影片 id 一定係 11 個字元;`OLAK5uy_…`(專輯 playlist)長好多
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
function findOrgConfig(o) { return GROUPS.find((g) => g.name === o || (g.aliases || []).includes(o)); }

async function ytdlpJson(url) {
  const { stdout } = await execFile(YTDLP, ['-J', '--flat-playlist', '--skip-download', url],
    { timeout: 300000, maxBuffer: 200 * 1024 * 1024 });
  return JSON.parse(stdout);
}

// 枚舉一個官方 channel 嘅全部片(/videos + /releases),有 cache
async function channelIndex(org, cfg) {
  const cf = path.join(CH_CACHE, `${org}.json`);
  if (!REFRESH && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const out = [];
  for (const tab of ['videos', 'releases']) {
    try {
      const j = await ytdlpJson(`https://www.youtube.com/${cfg.channel}/${tab}`);
      const walk = (entries) => {
        for (const e of (entries || [])) {
          if (!e) continue;
          if (e._type === 'playlist' && e.entries) { walk(e.entries); continue; }
          if (e.id && e.title) out.push({ id: e.id, title: e.title, duration: e.duration ?? null, tab });
        }
      };
      walk(j.entries);
      log(`  ${tab}:累計 ${out.length} 條`);
      // 🔴 `/releases` tab 出返嚟嘅係**專輯 playlist**(`OLAK5uy_…`),唔係影片。
      //    2026-08-25 實測踩過:唔展開就會攞住 playlist id 當 youtube_id,
      //    9 個「認到」全部係假嘅(寫落 DB 會變成播唔到嘅死行)。
      //    專輯 track 正正就係喺呢啲 playlist 入面,所以要逐張展開。
      if (tab === 'releases') {
        const albums = out.filter((v) => v.tab === 'releases' && !VIDEO_ID_RE.test(v.id));
        log(`  releases:${albums.length} 張專輯 playlist,逐張展開…`);
        for (const alb of albums) {
          try {
            const pj = await ytdlpJson(`https://www.youtube.com/playlist?list=${alb.id}`);
            for (const e of (pj.entries || [])) {
              if (e && e.id && VIDEO_ID_RE.test(e.id)) {
                out.push({ id: e.id, title: e.title || '', duration: e.duration ?? null, tab: 'release-track', album: alb.title });
              }
            }
          } catch (e) { /* 單張失敗唔阻成個 org */ }
          await sleep(1200);
        }
        log(`  releases 展開後累計 ${out.length} 條`);
      }
    } catch (e) { log(`  ⚠ ${tab} 枚舉失敗:${String(e?.message || e).slice(0, 90)}`); }
    await sleep(2000);
  }
  // 🔴 只留真影片 id —— playlist id(OLAK5uy_…)一律剔走,唔可以當 youtube_id
  const uniq = [...new Map(out.filter((v) => VIDEO_ID_RE.test(v.id)).map((v) => [v.id, v])).values()];
  fs.mkdirSync(CH_CACHE, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(uniq), 'utf8');
  return uniq;
}

// ── main ─────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });
const gap = JSON.parse(fs.readFileSync(GAP_FILE, 'utf8')).filter((r) => r.cls === 'real');
const db = await openDb();
const inDbIds = new Set(query(db, 'SELECT youtube_id FROM hymns_all').map((r) => r.youtube_id).filter(Boolean));
log(`真缺候選 ${gap.length} 首,DB 已有 ${inDbIds.size} 個 youtube_id`);

const orgs = ALL ? [...new Set(gap.map((r) => r.org))] : (ORG ? [ORG] : null);
if (!orgs) { console.error('要帶 --org 或 --all'); process.exit(1); }

const results = [];
for (const org of orgs) {
  const cfg = findOrgConfig(org);
  const cand = gap.filter((r) => r.org === org);
  if (!cfg || !cfg.channel) { log(`⚠ ${org}:冇 channel,${cand.length} 首全部收唔到(Q5)`); cand.forEach((c) => results.push({ ...c, match: null, why: 'org 冇官方 channel' })); continue; }
  if (cfg.channel.startsWith('playlist?list=')) { log(`⚠ ${org}:channel 係 playlist,枚舉唔到`); cand.forEach((c) => results.push({ ...c, match: null, why: 'channel 係單一 playlist,枚舉唔到' })); continue; }
  log(`▶ ${org}:枚舉官方頻道…`);
  const idx = await channelIndex(org, cfg);
  log(`  頻道片 ${idx.length} 條,對 ${cand.length} 首候選`);
  const prepared = idx.map((v) => ({ ...v, c: cjk(v.title), l: lat(v.title) }));

  for (const c of cand) {
    const core = coreName(c.track);
    const cc = cjk(core), cl = lat(core);
    let hits = [];
    if (cc.length >= 3) hits = prepared.filter((v) => v.c.includes(cc));
    else if (!cc.length && cl.length >= 10) hits = prepared.filter((v) => v.l.includes(cl));
    if (!hits.length) { results.push({ ...c, match: null, why: '官方頻道冇呢首(Q5:唔去第三方搵)' }); continue; }
    // 過閘:已喺庫 / 標題 blacklist / 片長
    const usable = hits.filter((v) => !inDbIds.has(v.id)
      && !isCompilation(v.title) && !isNonWorship(v.title, org)
      && (v.duration == null || isInSongDurationBand(v.duration)));
    if (!usable.length) {
      const already = hits.some((v) => inDbIds.has(v.id));
      results.push({ ...c, match: null, why: already ? '頻道有片但已經喺庫(P0 歌名比對假缺)' : '頻道有片但過唔到標題/片長閘' });
      continue;
    }
    // 揀最貼身嗰條(標題最短 = 雜訊最少)
    usable.sort((a, b) => a.title.length - b.title.length);
    results.push({ ...c, match: { id: usable[0].id, title: usable[0].title, duration: usable[0].duration, tab: usable[0].tab },
      ambiguous: usable.length > 1 ? usable.slice(0, 4).map((v) => ({ id: v.id, title: v.title })) : null, why: null });
  }
  const got = results.filter((r) => r.org === org && r.match).length;
  log(`  → 認到 ${got}/${cand.length}`);
}

const st = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.writeFileSync(path.join(OUT_DIR, `discover-${st}.json`), JSON.stringify(results, null, 2), 'utf8');
const matched = results.filter((r) => r.match);
// 同一條片可能俾兩首候選撞中 —— 去重
const byVid = new Map();
for (const r of matched) if (!byVid.has(r.match.id)) byVid.set(r.match.id, r);
log(`合計:候選 ${results.length} / 官方頻道認到 ${matched.length} / 去重後 ${byVid.size} 條片`);

const L = ['# 官方目錄對比 P2 —— 官方頻道認片結果', '',
  `產生時間:${new Date().toISOString()}`,
  '**零關鍵字搜尋**:候選片全部由官方 channel `/videos` + `/releases` 枚舉,歌名只做認片比對。',
  '> 呢個 run **冇寫過 DB**。', '',
  `候選 ${results.length} · 認到 ${matched.length} · 去重後 **${byVid.size}** 條片`, '',
  '## §1 逐 org', '', '| Org | 候選 | 認到 | 頻道冇 | 已喺庫/過唔到閘 |', '|---|---|---|---|---|'];
for (const o of [...new Set(results.map((r) => r.org))]) {
  const rs = results.filter((r) => r.org === o);
  L.push(`| ${mdEsc(o)} | ${rs.length} | **${rs.filter((r) => r.match).length}** | ${rs.filter((r) => /頻道冇呢首/.test(r.why || '')).length} | ${rs.filter((r) => r.why && !/頻道冇呢首/.test(r.why)).length} |`);
}
L.push('', '## §2 認到嘅片(P3 入庫對象)', '', '| Org | 目錄曲目 | → YouTube 標題 | 長度 | 多過一個對象? |', '|---|---|---|---|---|');
for (const r of byVid.values()) {
  L.push(`| ${mdEsc(r.org)} | ${mdEsc(r.track)} | ${mdEsc(r.match.title.slice(0, 60))} | ${r.match.duration ?? '?'}s | ${r.ambiguous ? `⚠️ ${r.ambiguous.length}` : ''} |`);
}
fs.writeFileSync(path.join(OUT_DIR, `discover-report-${st}.md`), L.join('\n'), 'utf8');
log(`→ ${path.join(OUT_DIR, `discover-report-${st}.md`)}`);
