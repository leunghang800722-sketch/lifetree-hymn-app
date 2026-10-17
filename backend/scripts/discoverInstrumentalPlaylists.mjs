#!/usr/bin/env node
// 純音樂 Phase 4 / T4-T5 —— INSTRUMENTAL-PHASE4-PLAN-20260824.md §5.1 `--discover`
//
// 「零關鍵字搜尋」嘅唯一入口:列一個**官方 channel** 嘅全部 playlist,認出
// 器樂訊號嗰批,攞 member、算「幾多首已經喺庫」,寫白名單 + report。
//
// 🔴 呢個 script **完全唔寫 DB、完全唔入歌**。佢淨係出情報。
// 🔴 佢**唔准掂** `data/album-backfill/` —— 嗰邊啲白名單有 album 線簽咗嘅
//    `approved:true`,`backfillAlbumFromPlaylists.js --discover` 會成個覆寫。
//    呢度自己寫落 `data/instrumental/`,兩條線嘅簽名互不干擾。
//
// 點解唔直接用 `backfillAlbumFromPlaylists.js --discover`(實查 2026-08-24):
//   ① 佢個 `EXCLUDE_RULES` 有一條 `/純音樂|靈修|soaking|舒壓/i` —— **佢主動
//      剷走晒器樂 playlist**(album 線當佢哋係雜訊)。器樂線啱啱相反,嗰條
//      exclude 就係我哋要嘅 seed。
//   ② 佢 discover 會覆寫 `<org>-playlists.json`,冚咗 album 線嘅簽名。
//   ③ 佢 `--apply` 係 UPDATE album,唔係 INSERT 新歌(見 PLAN §3.1)。
//
// 用法:
//   node scripts/discoverInstrumentalPlaylists.mjs --org 讚美之泉
//   node scripts/discoverInstrumentalPlaylists.mjs --org 讚美之泉 --all   # 連冇器樂訊號嘅都攞 member(慢)
//   node scripts/discoverInstrumentalPlaylists.mjs --inventory            # 一次過掃晒六個中文 org,只出盤點數
//
// 輸出:data/instrumental/<org>-playlists.json + <org>-discover-report.md
//       (`--inventory` 另出 inventory-<stamp>.md 總表)

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, query, sleep } from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';
import { YTDLP } from '../lib/ytdlpBin.js';
import { isNonWorship, isCompilation } from '../lib/hymnDb.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'instrumental');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const INVENTORY = process.argv.includes('--inventory');
const ALL_PLAYLISTS = process.argv.includes('--all');
const DELAY_MS = Number(arg('--delay', 3500));

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (b) => Math.round(b * (0.7 + Math.random() * 0.9));
const mdEsc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

// §5.1 拍板嘅中文 org 白名單(§8 Q1:英文 org 唔收住,係 Phase 6)
const ZH_ORGS = ['讚美之泉', '約書亞樂團', '新心音樂事工', '小羊詩歌', '天韻合唱團', '基恩敬拜'];

// ── 器樂訊號(playlist 標題級)────────────────────────────────────────
// 閘 1 要求 playlist **本身**講明係器樂專輯,唔准靠推測。全部完整詞組。
const PLAYLIST_INSTRUMENTAL_ZH = [
  '演奏', '純音樂', '弦樂', '管弦', '四重奏', '鋼琴曲', '琴韻',
  '禱告音樂', '靈修音樂', '默想音樂', '冥想音樂', '安靜系列', '背景音樂',
];
const PLAYLIST_INSTRUMENTAL_EN = [
  /\binstrumental\b/i, /\bstring quartet\b/i, /\bsoaking\b/i,
  /\bpiano (collection|solo|instrumental|worship)\b/i, /\blullab(y|ies)\b/i,
];
// Q3 拍板唔收 —— playlist 標題中咗就成條唔要
const PLAYLIST_BLACKLIST = ['伴奏', '卡拉OK', 'karaoke', 'backing track', '教學', '琴譜', '樂譜'];

function instrumentalSignal(title = '') {
  const low = title.toLowerCase();
  for (const w of PLAYLIST_BLACKLIST) if (low.includes(w.toLowerCase())) return { ok: false, blacklisted: w };
  for (const w of PLAYLIST_INSTRUMENTAL_ZH) if (title.includes(w)) return { ok: true, hit: w };
  for (const re of PLAYLIST_INSTRUMENTAL_EN) { const m = title.match(re); if (m) return { ok: true, hit: m[0] }; }
  return { ok: false };
}

function findOrgConfig(orgName) {
  return GROUPS.find((g) => g.name === orgName || (g.aliases || []).includes(orgName));
}

async function fetchFlatJson(url) {
  const { stdout } = await execFile(YTDLP, ['-J', '--flat-playlist', '--skip-download', url],
    { timeout: 120000, maxBuffer: 40 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function discoverOrg(org, dbIndex) {
  const cfg = findOrgConfig(org);
  if (!cfg) return { org, error: `worshipGroups.js 搵唔到 org「${org}」` };
  if (!cfg.channel) return { org, error: 'channel = null,discover 用唔到' };
  if (cfg.channel.startsWith('playlist?list=')) return { org, error: 'channel 本身係一條 playlist,列唔到全部 playlists' };

  log(`discover:${org} channel=${cfg.channel}`);
  let channelJson;
  try { channelJson = await fetchFlatJson(`https://www.youtube.com/${cfg.channel}/playlists`); }
  catch (e) { return { org, channel: cfg.channel, error: `列 playlists 失敗:${e?.message || e}` }; }

  const entries = (channelJson.entries || []).filter((e) => e && e.id);
  const classified = entries.map((e) => ({
    playlist_id: e.id,
    playlist_title: e.title || '',
    signal: instrumentalSignal(e.title || ''),
  }));
  const hits = classified.filter((c) => c.signal.ok);
  const blacklisted = classified.filter((c) => c.signal.blacklisted);
  log(`  ${entries.length} 個 playlist → 器樂訊號 ${hits.length}、Q3 blacklist ${blacklisted.length}`);

  const targets = ALL_PLAYLISTS ? classified.filter((c) => !c.signal.blacklisted) : hits;
  const candidates = [];
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    let members = [];
    let fetchErr = null;
    try {
      const j = await fetchFlatJson(`https://www.youtube.com/playlist?list=${c.playlist_id}`);
      members = (j.entries || []).filter((e) => e && e.id);
    } catch (e) { fetchErr = e?.message || String(e); }
    if (i < targets.length - 1) await sleep(jitter(DELAY_MS));

    const inDb = members.filter((m) => dbIndex.has(m.id));
    const fresh = members.filter((m) => !dbIndex.has(m.id));
    // 閘 2 預估(唔攞真 duration,flat JSON 已經有 duration 秒數)
    const freshPass = fresh.filter((m) => {
      const t = m.title || '';
      if (isCompilation(t) || isNonWorship(t, org, { line: 'instrumental' })) return false;
      if (m.duration != null && (m.duration < 120 || m.duration > 600)) return false;
      return true;
    });
    candidates.push({
      playlist_id: c.playlist_id,
      playlist_title: c.playlist_title,
      instrumental_signal: c.signal.ok ? c.signal.hit : null,
      member_count: members.length,
      matched_in_db: inDb.length,
      fresh_count: fresh.length,
      fresh_pass_gate2: freshPass.length,
      fetch_error: fetchErr,
      // ↓ T5 人手簽嗰陣要填(PLAN §5.2)。T4 一律留 false/null。
      approved: false,
      proposed_album: null,
      signed_by: null,
      signed_at: null,
      fresh_sample: freshPass.slice(0, 8).map((m) => ({ id: m.id, title: m.title, duration: m.duration })),
    });
    log(`    「${c.playlist_title}」 member=${members.length} 已喺庫=${inDb.length} 新=${fresh.length} 過閘2=${freshPass.length}${fetchErr ? ' ⚠' + fetchErr : ''}`);
  }

  return { org, channel: cfg.channel, total_playlists: entries.length,
    signal_hits: hits.length, blacklisted: blacklisted.length, candidates,
    all_titles: classified.map((c) => c.playlist_title) };
}

// ── main ─────────────────────────────────────────────────────────────
const db = await openDb();
const dbIndex = new Set(query(db, 'SELECT youtube_id FROM hymns_all').map((r) => r.youtube_id).filter(Boolean));
log(`DB 索引:${dbIndex.size} 個 youtube_id(全表,唔限 curated)`);
fs.mkdirSync(DATA_DIR, { recursive: true });

const orgs = INVENTORY ? ZH_ORGS : (ORG ? [ORG] : null);
if (!orgs) { console.error('要帶 --org <name> 或者 --inventory'); process.exit(1); }

const results = [];
for (const org of orgs) {
  const r = await discoverOrg(org, dbIndex);
  results.push(r);
  if (r.candidates) {
    fs.writeFileSync(path.join(DATA_DIR, `${org}-playlists.json`), JSON.stringify(r.candidates, null, 2), 'utf8');
  }
  if (org !== orgs[orgs.length - 1]) await sleep(jitter(DELAY_MS));
}

// ── report ───────────────────────────────────────────────────────────
const st = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const L = [];
L.push('# 純音樂 Phase 4 / T4 貨源盤點', '');
L.push(`產生時間:${new Date().toISOString()}`);
L.push('範圍:INSTRUMENTAL-PHASE4-PLAN-20260824.md §6 —— **零關鍵字搜尋**,只列官方 channel 嘅 playlist。');
L.push('**呢個 run 冇寫過 DB、冇入過任何歌。**', '');
L.push('## §1 總表', '');
L.push('| Org | channel playlist 總數 | 器樂訊號 playlist | member 合計 | 已喺庫 | **新片** | **過閘2(標題+片長)** |');
L.push('|---|---|---|---|---|---|---|');
let gM = 0, gDb = 0, gFresh = 0, gPass = 0;
for (const r of results) {
  if (r.error) { L.push(`| ${mdEsc(r.org)} | ⚠ ${mdEsc(r.error)} | — | — | — | — | — |`); continue; }
  const m = r.candidates.reduce((a, c) => a + c.member_count, 0);
  const d = r.candidates.reduce((a, c) => a + c.matched_in_db, 0);
  const f = r.candidates.reduce((a, c) => a + c.fresh_count, 0);
  const p = r.candidates.reduce((a, c) => a + c.fresh_pass_gate2, 0);
  gM += m; gDb += d; gFresh += f; gPass += p;
  L.push(`| ${mdEsc(r.org)} | ${r.total_playlists} | ${r.signal_hits} | ${m} | ${d} | **${f}** | **${p}** |`);
}
L.push(`| **合計** | | | ${gM} | ${gDb} | **${gFresh}** | **${gPass}** |`);
L.push('');
L.push('> 「過閘2」= 新片入面過到「標題 blacklist(器樂線 config)+ 片長 120-600 秒」嘅數。');
L.push('> **仲未過閘 3(YouTube auto-caption)同閘 4(whisper 雙 pass)** —— 呢兩閘要 T7 先跑,實際入庫數會再低。', '');

for (const r of results) {
  L.push(`## §2 ${mdEsc(r.org)}`, '');
  if (r.error) { L.push(`⚠ ${mdEsc(r.error)}`, ''); continue; }
  L.push(`channel:\`${mdEsc(r.channel)}\` · playlist 總數 ${r.total_playlists} · 器樂訊號 ${r.signal_hits} · Q3 blacklist 剔走 ${r.blacklisted}`, '');
  if (!r.candidates.length) { L.push('_冇器樂訊號 playlist。_', ''); }
  else {
    L.push('| playlist | 訊號 | member | 已喺庫 | 新片 | 過閘2 |');
    L.push('|---|---|---|---|---|---|');
    for (const c of r.candidates) {
      L.push(`| ${mdEsc(c.playlist_title)} | ${mdEsc(c.instrumental_signal || '(無)')} | ${c.member_count} | ${c.matched_in_db} | ${c.fresh_count} | ${c.fresh_pass_gate2} |`);
    }
    L.push('');
    for (const c of r.candidates) {
      if (!c.fresh_sample.length) continue;
      L.push(`**${mdEsc(c.playlist_title)}** 新片樣本:`);
      for (const s of c.fresh_sample) L.push(`- \`${s.id}\` ${mdEsc(s.title)} (${s.duration ?? '?'}s) — https://www.youtube.com/watch?v=${s.id}`);
      L.push('');
    }
  }
  L.push('<details><summary>呢個 channel 全部 playlist 標題(核對有冇漏認器樂)</summary>', '');
  for (const t of r.all_titles) L.push(`- ${mdEsc(t)}`);
  L.push('', '</details>', '');
}
const outPath = path.join(DATA_DIR, `inventory-${st}.md`);
fs.writeFileSync(outPath, L.join('\n'), 'utf8');
log(`report:${outPath}`);
log(`盤點:member ${gM} / 已喺庫 ${gDb} / 新片 ${gFresh} / 過閘2 ${gPass}`);
