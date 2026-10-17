#!/usr/bin/env node
// 一般詩歌「官方目錄對比」P0 —— CATALOG-GAP-PLAN-20260824.md §3 P0
//
// 逐張 iTunes 專輯抽曲目 → 同 DB 逐首歌名對 → 出缺口報告。
// 🔴 **完全唔寫 DB、完全唔入歌、零 YouTube request。** 純情報。
//
// Eric 2026-08-24 拍板:
//   Q1 唔開 Spotify,淨用 iTunes  · Q2 做有 iTunes 目錄嗰 11 個 org
//   Q3 **唔收「同一首歌嘅另一個版本」**,淨收真係未入過庫嘅全新歌
//   Q4 非敬拜 track 唔收          · Q5 官方頻道冇上載嘅唔收
//
// 缺口分四類(§P1 人手分類就係核呢個分類啱唔啱):
//   real      —— 真缺:歌名 DB 完全冇,又冇版本標記 → 候選
//   alt       —— 另一個版本:剝走版本標記之後個底歌 DB 已經有(Q3 唔收)
//   marked    —— 有版本標記但**底歌 DB 都冇** → ⚠️ 灰色,落人手裁
//   nonsong   —— isNonWorship / isCompilation 中招(Q4 唔收)
//
// ⚠️ 歌名比對紀律(N4 R2 血淚):
//   · **唔可以剝走 `【】` 入面嘅內容** —— 好多機構個歌名就係喺入面
//   · 用 CJK 包含比對 + 簡繁 fold;純拉丁要夠長先夠膽比
//
// 用法:node scripts/catalogGapScan.mjs [--org <name>] [--all] [--no-cache]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, query, isNonWorship, isCompilation } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'data', 'instrumental');
const OUT_DIR = path.join(__dirname, '..', 'data', 'catalog-gap');
const CACHE_DIR = path.join(OUT_DIR, 'itunes-tracks');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const ALL = process.argv.includes('--all');
const NO_CACHE = process.argv.includes('--no-cache');

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mdEsc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ── 歌名正規化 ───────────────────────────────────────────────────────
// ⚠️ 只 fold 簡繁常見對,唔准剝括號內容(見檔頭)
const FOLD = [['祢', '你'], ['禰', '你'], ['衪', '他'], ['祂', '他'], ['妳', '你'],
  ['裏', '里'], ['裡', '里'], ['著', '着'], ['讚', '赞'], ['讃', '赞']];
function fold(s) { let t = String(s || ''); for (const [a, b] of FOLD) t = t.split(a).join(b); return t; }
const cjk = (s) => fold(s).replace(/[^一-鿿㐀-䶿]/g, '');
const lat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── 版本標記(Q3 用)─────────────────────────────────────────────────
// 括號裏面 or 明文寫住嘅版本/語言/編制標記。**完整詞組**,唔用單字。
const VERSION_MARKERS = [
  '演奏版', '演奏', '純音樂', '伴奏', '卡拉OK', 'karaoke', 'backing track',
  'instrumental', 'piano version', 'guitar version', 'acoustic', 'remix',
  '閩南語', '闽南语', '台語', '台语', '粵語版', '粤语版', '國語版', '国语版',
  '英文版', '日語版', '日语版', '韓語版', '韩语版', '兒童版', '儿童版',
  'live', '現場', '现场', '演唱會', '演唱会', 'demo', '組曲', '组曲', 'medley',
  '重唱', '合唱版', '獨唱版', '新版', '舊版', 'remastered', 'reprise', '二重奏',
  // 2026-08-25 P1 人手覆核補:實測撞到嘅版本標記
  '靜思版', '静思版', 'cover', '單曲卡拉', '单曲卡拉', '卡拉版', '無人聲',
  'a cappella', '清唱', '快版', '慢版', '簡易版', '简易版',
];
// P1 覆核補:專輯嘅**序曲/間奏/尾聲**類 track,唔係一首歌,唔應該當缺口。
// ⚠️ 用完整詞組 +(序)呢類帶括號嘅寫法,唔用單字「序」(會撞「序言」型歌名)。
const INTERLUDE_MARKERS = [
  '序曲', '(序)', '（序）', '前奏', '間奏', '间奏', '尾聲', '尾声',
  '片頭', '片尾', 'intro', 'prelude', 'interlude', 'outro', 'overture',
];
function isInterlude(title) {
  const low = String(title || '').toLowerCase();
  return INTERLUDE_MARKERS.some((m) => low.includes(m.toLowerCase()));
}
function versionMarker(title) {
  const low = String(title || '').toLowerCase();
  for (const m of VERSION_MARKERS) if (low.includes(m.toLowerCase())) return m;
  return null;
}
// 剝走括號內容攞「底歌名」—— 淨係為咗答「呢首歌本身有冇喺庫」,
// **唔會**攞嚟做主要比對(見檔頭 R2 教訓)
function baseName(title) {
  return String(title || '')
    .replace(/[（(\[][^）)\]]*[）)\]]/g, ' ')
    .replace(/\s*-\s*(演奏版|純音樂|instrumental|piano|guitar).*$/i, ' ')
    .trim();
}

// ── main ─────────────────────────────────────────────────────────────
fs.mkdirSync(CACHE_DIR, { recursive: true });
const db = await openDb();
const dbRows = query(db, "SELECT COALESCE(org,artist) o, title, display_title FROM hymns_all WHERE curated=1 AND status='ok'");
const byOrg = new Map();
for (const r of dbRows) {
  if (!byOrg.has(r.o)) byOrg.set(r.o, []);
  byOrg.get(r.o).push({ c: cjk(r.title), l: lat(r.title), cd: cjk(r.display_title), t: r.title });
}
log(`DB:${dbRows.length} 首 curated ok,${byOrg.size} 個 org`);

// ⚠️ P1 人手覆核揪出嘅系統性假缺(2026-08-25):iTunes 個 track name 好興夾住
//    `(feat. 林婉容)` 呢類客串標註,而我哋 DB 個 title 冇。直接 CJK 包含比
//    會因為候選多咗「林婉容」三個字而**永遠對唔中**,令成批同名歌報做「真缺」。
//    實測小羊詩歌 103 首「真缺」入面大部分就係咁嚟(「盟約 (feat. 徐潮敏 &
//    林婉容)」其實庫入面有「盟約」)。
//    所以比對之前要先剝走**候選側**嘅客串/註解括號。
//    ⚠️ 只准剝候選側(iTunes 乾淨歌名 + 括號註解),**唔准剝 DB 側嘅 `【】`**
//       —— DB 側好多機構個歌名就係喺【】入面(N4 R2 血淚)。
function coreName(title) {
  return String(title || '')
    .replace(/[（(]\s*(feat|ft|with|featuring)\b[^）)]*[）)]/gi, ' ')
    .replace(/\s*[-–—]\s*(feat|ft)\.?\s.*$/i, ' ')
    .trim();
}
function inDb(org, title) {
  const core = coreName(title);
  const c = cjk(core), l = lat(core);
  for (const r of (byOrg.get(org) || [])) {
    if (c.length >= 2 && (r.c.includes(c) || r.cd.includes(c))) return r.t;
    if (!c.length && l.length >= 8 && r.l.length >= 8 && (r.l.includes(l) || l.includes(r.l))) return r.t;
  }
  return null;
}
// 太短嘅歌名(1 個中文字 / 好短拉丁)比對唔可靠,唔准當「真缺」——落灰色區
function tooShortToJudge(title) {
  const core = coreName(title);
  return cjk(core).length < 2 && lat(core).length < 8;
}

async function tracksOf(collectionId) {
  const cf = path.join(CACHE_DIR, `${collectionId}.json`);
  if (!NO_CACHE && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const r = await fetch(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`);
  const j = await r.json();
  const tracks = (j.results || []).filter((x) => x.wrapperType === 'track')
    .map((x) => ({ trackId: x.trackId, name: x.trackName, num: x.trackNumber, ms: x.trackTimeMillis }));
  fs.writeFileSync(cf, JSON.stringify(tracks), 'utf8');
  await sleep(350);
  return tracks;
}

const orgs = ALL
  ? fs.readdirSync(SRC_DIR).filter((f) => f.startsWith('itunes-') && f.endsWith('.json')).map((f) => f.replace('itunes-', '').replace('.json', ''))
  : (ORG ? [ORG] : null);
if (!orgs) { console.error('要帶 --org <name> 或 --all'); process.exit(1); }

const all = [];
for (const org of orgs) {
  const catFile = path.join(SRC_DIR, `itunes-${org}.json`);
  if (!fs.existsSync(catFile)) { log(`⚠ ${org}:冇 iTunes 目錄,skip`); continue; }
  const cat = JSON.parse(fs.readFileSync(catFile, 'utf8'));
  if (!cat.length) { log(`⚠ ${org}:iTunes 目錄空,skip`); continue; }
  log(`▶ ${org}:${cat.length} 張碟`);
  const rows = [];
  for (const alb of cat) {
    let tracks = [];
    try { tracks = await tracksOf(alb.collectionId); }
    catch (e) { log(`  ⚠ 攞唔到 ${alb.album}:${e?.message || e}`); continue; }
    for (const t of tracks) {
      const hit = inDb(org, t.name);
      const vm = versionMarker(t.name);
      const nonsong = isCompilation(t.name) || isNonWorship(t.name, org) || isInterlude(t.name);
      let cls;
      if (hit) cls = 'have';
      else if (nonsong) cls = 'nonsong';
      else if (tooShortToJudge(t.name)) cls = 'tooshort';
      else if (vm) {
        const bHit = inDb(org, baseName(t.name));
        cls = bHit ? 'alt' : 'marked';
      } else cls = 'real';
      rows.push({ org, album: alb.album, year: (alb.releaseDate || '').slice(0, 4),
        track: t.name, trackNum: t.num, sec: t.ms ? Math.round(t.ms / 1000) : null,
        cls, dbHit: hit, versionMarker: vm });
    }
  }
  const c = (k) => rows.filter((r) => r.cls === k).length;
  log(`  曲目 ${rows.length} | 已有 ${c('have')} | 真缺 ${c('real')} | 另一版本 ${c('alt')} | 有標記底歌都冇 ${c('marked')} | 非敬拜 ${c('nonsong')} | 名太短唔敢判 ${c('tooshort')}`);
  all.push(...rows);
}

const st = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.writeFileSync(path.join(OUT_DIR, `gap-${st}.json`), JSON.stringify(all, null, 2), 'utf8');

// ── report ───────────────────────────────────────────────────────────
const L = ['# 官方目錄對比 P0 —— 缺口報告', '',
  `產生時間:${new Date().toISOString()} · 曲目總數 ${all.length}`,
  'Eric 拍板:Q1 唔開 Spotify(淨 iTunes)· Q3 **唔收另一版本** · Q4 非敬拜唔收 · Q5 官方頻道冇上載唔收', '',
  '> **呢個 run 冇寫過 DB、冇入過任何歌、零 YouTube request。**', '',
  '## §1 總表', '',
  '| Org | 目錄曲目 | 已有 | **真缺(候選)** | 另一版本(Q3 唔收) | 有標記底歌都冇(人手裁) | 非敬拜(Q4 唔收) |',
  '|---|---|---|---|---|---|---|'];
const orgsSeen = [...new Set(all.map((r) => r.org))];
const cnt = (o, k) => all.filter((r) => r.org === o && r.cls === k).length;
let T = { n: 0, have: 0, real: 0, alt: 0, marked: 0, nonsong: 0 };
for (const o of orgsSeen) {
  const n = all.filter((r) => r.org === o).length;
  T.n += n; T.have += cnt(o, 'have'); T.real += cnt(o, 'real'); T.alt += cnt(o, 'alt'); T.marked += cnt(o, 'marked'); T.nonsong += cnt(o, 'nonsong');
  L.push(`| ${mdEsc(o)} | ${n} | ${cnt(o, 'have')} | **${cnt(o, 'real')}** | ${cnt(o, 'alt')} | ${cnt(o, 'marked')} | ${cnt(o, 'nonsong')} |`);
}
L.push(`| **合計** | **${T.n}** | ${T.have} | **${T.real}** | ${T.alt} | ${T.marked} | ${T.nonsong} |`, '');
L.push('## §2 真缺名單(P1 人手分類對象)', '');
for (const o of orgsSeen) {
  const rs = all.filter((r) => r.org === o && r.cls === 'real');
  if (!rs.length) continue;
  L.push(`### ${mdEsc(o)} —— ${rs.length} 首`, '', '| 專輯 | 年 | # | 曲目 | 長度 |', '|---|---|---|---|---|');
  rs.forEach((r) => L.push(`| ${mdEsc(r.album)} | ${r.year} | ${r.trackNum ?? ''} | **${mdEsc(r.track)}** | ${r.sec ? `${Math.floor(r.sec / 60)}:${String(r.sec % 60).padStart(2, '0')}` : '?'} |`));
  L.push('');
}
L.push('## §3 「有版本標記但底歌都冇」—— 灰色地帶,人手裁', '');
const marked = all.filter((r) => r.cls === 'marked');
if (!marked.length) L.push('_冇。_', '');
else { L.push('| Org | 專輯 | 曲目 | 標記 |', '|---|---|---|---|');
  marked.forEach((r) => L.push(`| ${mdEsc(r.org)} | ${mdEsc(r.album)} | ${mdEsc(r.track)} | ${mdEsc(r.versionMarker)} |`)); L.push(''); }
fs.writeFileSync(path.join(OUT_DIR, `gap-report-${st}.md`), L.join('\n'), 'utf8');
log(`合計:曲目 ${T.n} / 已有 ${T.have} / 真缺 ${T.real} / 另一版本 ${T.alt} / 灰色 ${T.marked} / 非敬拜 ${T.nonsong}`);
log(`→ ${path.join(OUT_DIR, `gap-report-${st}.md`)}`);
