#!/usr/bin/env node
// 純音樂 MORE-SOURCES / N1+N2 —— INSTRUMENTAL-MORE-SOURCES-PLAN-20260824.md §3.1 + §3.2
//
// Eric 2026-08-24 拍板:Q1 准用 `/releases` tab + Topic 頻道自動生成層;
// Q2 org 白名單加 ACM / 鹹蛋音樂事工 / 泥土音樂 / 天弦音樂事工 / 角聲使團;
// Q3 器樂 cover 算純音樂;Q5 專輯級證據優先於片級曲風 blacklist。
//
// 點解要呢個 script(T4 教訓):`discoverInstrumentalPlaylists.mjs` 只望頻道嘅
// `/playlists` tab —— 嗰個 tab 係人手維護,SOP 2022/2023 兩張安靜演奏專輯根本
// 冇對應 playlist,結構上永遠見唔到。`/releases` tab 同 Topic 頻道係**發行 feed
// 自動生成**,出咗街就有,係 YouTube 上最接近「官方 discography」嘅結構化資料。
//
// 🔴 零關鍵字搜尋紅線點守:全程係「已知官方頻道 → 佢自己個 /releases tab →
//    OLAK 專輯清單逐張列 member」,同 playlist discover 一模一樣嘅結構式枚舉,
//    只係換咗個 tab。iTunes 只做**目錄對數**,唔做搵歌。
// 🔴 iTunes 假陽性硬閘(§3.2 實測:搜「角聲使團」回過 Detlef Bensmann 嘅
//    saxophone 專輯):`artistName` 一定要 exact match 白名單,唔准靠搜尋命中。
//
// 用法:
//   node scripts/discoverInstrumentalReleases.mjs --itunes            # 淨係 refresh iTunes 目錄
//   node scripts/discoverInstrumentalReleases.mjs --org 讚美之泉
//   node scripts/discoverInstrumentalReleases.mjs --all
//
// 輸出:data/instrumental/itunes-<org>.json
//       data/instrumental/<org>-releases.json(候選白名單,全部 approved:false)
//       data/instrumental/releases-inventory-<stamp>.md

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, query, sleep, isCompilation, isNonWorship, isInSongDurationBand } from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';
import { YTDLP } from '../lib/ytdlpBin.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'instrumental');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const ALL = process.argv.includes('--all');
const ITUNES_ONLY = process.argv.includes('--itunes');
const DELAY_MS = Number(arg('--delay', 3000));
const BAND_MIN = 120, BAND_MAX = 600;

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (b) => Math.round(b * (0.7 + Math.random() * 0.9));
const mdEsc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ── org 設定 ─────────────────────────────────────────────────────────
// `itunesArtists` = **exact match 白名單**(§3.2 硬閘)。`topicChannel` 係人手
// 考證過先寫死(同 worshipGroups.js 補 channel handle 嘅現行做法一致)。
const ORG_CONFIG = {
  '讚美之泉':     { itunesArtists: ['讚美之泉'], topicChannel: null },
  '基恩敬拜':     { itunesArtists: ['基恩敬拜 Amazing Grace Worship'], topicChannel: 'UCRo18xj7YjX-EEEhi7yjW1g' },
  '鹹蛋音樂事工':  { itunesArtists: ['鹹蛋音樂事工', 'Salted Egg Music Ministry'], topicChannel: null },
  '泥土音樂':     { itunesArtists: ['泥土音樂', '盛曉玫', '盛曉玫 & 泥土音樂'], topicChannel: null },
  'ACM':         { itunesArtists: ['ACM', 'HKACM', '香港基督徒音樂事工協會'], topicChannel: null },
  '天弦音樂事工':  { itunesArtists: ['天弦音樂事工'], topicChannel: null },
  '角聲使團':     { itunesArtists: ['角聲使團'], topicChannel: null },
  '小羊詩歌':     { itunesArtists: ['小羊詩歌'], topicChannel: null },
  '天韻合唱團':   { itunesArtists: ['天韻合唱團', '天韻'], topicChannel: null },
  '約書亞樂團':   { itunesArtists: ['約書亞樂團'], topicChannel: null },
  '新心音樂事工':  { itunesArtists: ['新心音樂事工'], topicChannel: null },
};

// ── 專輯級器樂訊號(album name 自我聲明)───────────────────────────────
// ⚠️ 同片級 blacklist 分開:呢度係「專輯係器樂發行」嘅正面證據。
// Q5 拍板之後,「輕音樂」喺**專輯名**度係正面訊號(泥土《鋼琴輕音樂》),
// 但喺**片名**度仍然係 exclude —— 兩層唔可以混。
const ALBUM_INSTRUMENTAL_ZH = [
  '演奏', '純音樂', '器樂', '弦樂', '管弦', '四重奏', '鋼琴', '結他', '吉他',
  '靈修音樂', '禱告音樂', '默想音樂', '安靜', '靜默', '輕音樂', '心曲',
];
const ALBUM_INSTRUMENTAL_EN = [
  /\binstrumental\b/i, /\bpiano\b/i, /\bguitar\b/i, /\bstring quartet\b/i,
  /\bsoaking\b/i, /\bdevotional music\b/i,
];
// 專輯級硬拒(§8 Q3 舊拍板,album 層一樣要擋)
const ALBUM_BLACKLIST = ['伴奏', '卡拉OK', 'karaoke', 'backing track', '教學', '琴譜', '樂譜'];

function albumInstrumentalSignal(name = '') {
  const low = name.toLowerCase();
  for (const w of ALBUM_BLACKLIST) if (low.includes(w.toLowerCase())) return { ok: false, blacklisted: w };
  for (const w of ALBUM_INSTRUMENTAL_ZH) if (name.includes(w)) return { ok: true, hit: w };
  for (const re of ALBUM_INSTRUMENTAL_EN) { const m = name.match(re); if (m) return { ok: true, hit: m[0] }; }
  return { ok: false };
}

// track 級後綴訊號(§3.4)—— 發行 metadata 直出,唔係頻道管理員手寫
const TRACK_SUFFIX_RE = /\((piano|guitar|instrumental|acoustic instrumental|string)[^)]*version[^)]*\)|\(instrumental\)|（(鋼琴|結他|演奏)[^）]*版）|- (piano|guitar|instrumental) version/i;

// 歌名 normalize(§6 R2 同曲異 id dedup 用)
const normTitle = (s) => String(s || '')
  .replace(/[（(【\[].*?[)）】\]]/g, '')
  .replace(/[|｜\-–—]/g, ' ')
  .replace(/[^\p{L}\p{N}]/gu, '')
  .toLowerCase();

function findOrgConfig(orgName) {
  return GROUPS.find((g) => g.name === orgName || (g.aliases || []).includes(orgName));
}

async function ytdlpJson(url, timeout = 180000) {
  const { stdout } = await execFile(YTDLP, ['-J', '--flat-playlist', '--skip-download', url],
    { timeout, maxBuffer: 80 * 1024 * 1024 });
  return JSON.parse(stdout);
}

// ── N2:iTunes 目錄 ───────────────────────────────────────────────────
async function fetchItunes(org) {
  const cfg = ORG_CONFIG[org];
  const allow = new Set(cfg.itunesArtists);
  const seen = new Map();
  for (const term of cfg.itunesArtists) {
    for (const country of ['HK', 'TW', 'US']) {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=200&country=${country}`;
      let j;
      try { const r = await fetch(url); j = await r.json(); }
      catch (e) { log(`  ⚠ iTunes ${term}/${country} 失敗:${e?.message || e}`); continue; }
      for (const a of (j.results || [])) {
        // 🔴 §3.2 硬閘:artistName 一定要 exact match,唔准靠搜尋命中
        if (!allow.has(a.artistName)) continue;
        if (!seen.has(a.collectionId)) seen.set(a.collectionId, {
          collectionId: a.collectionId, album: a.collectionName, artist: a.artistName,
          trackCount: a.trackCount, releaseDate: a.releaseDate, country,
          signal: albumInstrumentalSignal(a.collectionName || ''),
        });
      }
      await sleep(400);
    }
  }
  const albums = [...seen.values()].sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
  fs.writeFileSync(path.join(DATA_DIR, `itunes-${org}.json`), JSON.stringify(albums, null, 2), 'utf8');
  const instr = albums.filter((a) => a.signal.ok);
  log(`  iTunes:${albums.length} 張(artistName exact-match 後),器樂訊號 ${instr.length} 張,合計 ${instr.reduce((s, a) => s + (a.trackCount || 0), 0)} tracks`);
  instr.forEach((a) => log(`     · ${a.album}(${a.trackCount} 首,${String(a.releaseDate).slice(0, 10)})訊號「${a.signal.hit}」`));
  return albums;
}

// ── N1:releases / Topic 枚舉 ─────────────────────────────────────────
async function listReleases(url, label) {
  try {
    const j = await ytdlpJson(url);
    const e = (j.entries || []).filter((x) => x && x.id);
    log(`  ${label}:${e.length} 張 release`);
    return e.map((x) => ({ id: x.id, title: x.title || '', source: label }));
  } catch (err) {
    log(`  ${label}:攞唔到(${String(err?.message || err).split('\n')[0].slice(0, 80)})`);
    return [];
  }
}

async function discoverOrg(org, dbIdx) {
  const gcfg = findOrgConfig(org);
  const cfg = ORG_CONFIG[org];
  if (!gcfg || !cfg) return { org, error: 'worshipGroups / ORG_CONFIG 搵唔到' };
  log(`\n▶ ${org}`);

  const itunes = await fetchItunes(org);
  const itunesInstr = itunes.filter((a) => a.signal.ok);
  const itunesByNorm = new Map(itunesInstr.map((a) => [normTitle(a.album), a]));

  const releases = [];
  if (gcfg.channel && !gcfg.channel.startsWith('playlist?list=')) {
    releases.push(...await listReleases(`https://www.youtube.com/${gcfg.channel}/releases`, 'main/releases'));
    await sleep(jitter(DELAY_MS));
  }
  if (cfg.topicChannel) {
    releases.push(...await listReleases(`https://www.youtube.com/channel/${cfg.topicChannel}/releases`, 'topic/releases'));
    await sleep(jitter(DELAY_MS));
  }

  // 專輯層判定:① 專輯名自己有器樂訊號 ② 或者對到 iTunes 器樂專輯
  const candidates = [];
  for (const r of releases) {
    const own = albumInstrumentalSignal(r.title);
    const it = itunesByNorm.get(normTitle(r.title))
      || itunesInstr.find((a) => normTitle(r.title).includes(normTitle(a.album)) || normTitle(a.album).includes(normTitle(r.title)));
    if (own.blacklisted) continue;            // Q3:伴奏/karaoke/教學 專輯層直接剔
    if (!own.ok && !it) continue;
    candidates.push({ ...r, album_signal: own.ok ? own.hit : null, itunes: it || null });
  }
  log(`  → 器樂 release 候選 ${candidates.length} 張(自身訊號 ${candidates.filter((c) => c.album_signal).length} / iTunes 對數 ${candidates.filter((c) => c.itunes).length})`);

  // 逐張攞 member
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let members = [];
    try {
      const j = await ytdlpJson(`https://www.youtube.com/playlist?list=${c.id}`);
      members = (j.entries || []).filter((e) => e && e.id);
    } catch (e) { log(`    ⚠「${c.title}」攞 member 失敗`); }
    if (i < candidates.length - 1) await sleep(jitter(DELAY_MS));

    const albumEvidence = !!(c.itunes || c.album_signal);
    const rows = members.map((m) => {
      const t = m.title || '';
      const reasons = [];
      if (dbIdx.byId.has(m.id)) reasons.push('youtube_id 已喺庫');
      // §6 R2:同曲異 id —— org 內歌名級 dedup
      const nk = `${org}::${normTitle(t)}`;
      if (!dbIdx.byId.has(m.id) && dbIdx.byOrgTitle.has(nk)) reasons.push(`org 內同名已存在(#${dbIdx.byOrgTitle.get(nk)})`);
      if (isCompilation(t)) reasons.push('isCompilation');
      if (isNonWorship(t, org, { line: 'instrumental', albumEvidence })) reasons.push('isNonWorship(器樂線)');
      if (m.duration != null && !isInSongDurationBand(m.duration, BAND_MAX, BAND_MIN)) reasons.push(`片長 ${m.duration}s 唔喺 ${BAND_MIN}-${BAND_MAX}`);
      return { youtube_id: m.id, title: t, duration: m.duration ?? null,
        track_suffix: TRACK_SUFFIX_RE.test(t), pass_pre: reasons.length === 0, reasons };
    });
    const pass = rows.filter((r) => r.pass_pre);
    log(`    「${c.title.slice(0, 44)}」member=${rows.length} 過預篩=${pass.length}${c.itunes ? ` [iTunes ${c.itunes.trackCount} 首]` : ''}`);
    out.push({
      release_id: c.id, release_title: c.title, source: c.source,
      album_signal: c.album_signal,
      itunes_album: c.itunes?.album ?? null, itunes_track_count: c.itunes?.trackCount ?? null,
      itunes_release_date: c.itunes?.releaseDate ?? null,
      album_evidence: albumEvidence,
      member_count: rows.length, pass_pre_count: pass.length,
      members: rows,
      approved: false, proposed_album: null, instrumental_signal: null, signed_by: null, signed_at: null,
    });
  }
  return { org, lang: gcfg.lang, releases_total: releases.length, itunes_total: itunes.length,
    itunes_instrumental: itunesInstr.length, candidates: out };
}

// ── main ─────────────────────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = await openDb();
const rowsAll = query(db, 'SELECT id, youtube_id, title, org, artist FROM hymns_all');
const dbIdx = { byId: new Set(), byOrgTitle: new Map() };
for (const r of rowsAll) {
  if (r.youtube_id) dbIdx.byId.add(r.youtube_id);
  const o = r.org || r.artist || '';
  const k = `${o}::${normTitle(r.title)}`;
  if (!dbIdx.byOrgTitle.has(k)) dbIdx.byOrgTitle.set(k, r.id);
}
log(`DB 索引:${dbIdx.byId.size} 個 youtube_id、${dbIdx.byOrgTitle.size} 個 org+歌名 key`);

const orgs = ALL ? Object.keys(ORG_CONFIG) : (ORG ? [ORG] : null);
if (!orgs) { console.error('要帶 --org <name> / --all / --itunes'); process.exit(1); }

const results = [];
for (const org of orgs) {
  if (ITUNES_ONLY) { log(`\n▶ ${org}`); await fetchItunes(org); continue; }
  const r = await discoverOrg(org, dbIdx);
  results.push(r);
  if (r.candidates) fs.writeFileSync(path.join(DATA_DIR, `${org}-releases.json`), JSON.stringify(r.candidates, null, 2), 'utf8');
  await sleep(jitter(DELAY_MS));
}
if (ITUNES_ONLY) process.exit(0);

const st = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const L = ['# 純音樂 MORE-SOURCES / N1+N2 —— releases + Topic + iTunes 盤點', '',
  `產生時間:${new Date().toISOString()}`,
  'Eric 2026-08-24 拍板:Q1 准用自動生成層 · Q2 org 白名單 +5 · Q3 器樂 cover 收 · Q5 專輯級證據優先', '',
  '**呢個 run 冇寫過 DB、冇入過任何歌。**', '',
  '| Org | releases | iTunes 專輯 | 器樂專輯 | 器樂 release 候選 | member | **過預篩** |', '|---|---|---|---|---|---|---|'];
let g = { m: 0, p: 0 };
for (const r of results) {
  if (r.error) { L.push(`| ${mdEsc(r.org)} | ⚠ ${mdEsc(r.error)} | | | | | |`); continue; }
  const m = r.candidates.reduce((a, c) => a + c.member_count, 0);
  const p = r.candidates.reduce((a, c) => a + c.pass_pre_count, 0);
  g.m += m; g.p += p;
  L.push(`| ${mdEsc(r.org)} | ${r.releases_total} | ${r.itunes_total} | ${r.itunes_instrumental} | ${r.candidates.length} | ${m} | **${p}** |`);
}
L.push(`| **合計** | | | | | ${g.m} | **${g.p}** |`, '');
for (const r of results) {
  if (r.error || !r.candidates?.length) continue;
  L.push(`## ${mdEsc(r.org)}`, '', '| release | 訊號 | iTunes 專輯(首數) | member | 過預篩 |', '|---|---|---|---|---|');
  for (const c of r.candidates) {
    L.push(`| ${mdEsc(c.release_title)} | ${mdEsc(c.album_signal || '(靠 iTunes)')} | ${mdEsc(c.itunes_album || '—')}${c.itunes_track_count ? `(${c.itunes_track_count})` : ''} | ${c.member_count} | ${c.pass_pre_count} |`);
  }
  L.push('');
}
const out = path.join(DATA_DIR, `releases-inventory-${st}.md`);
fs.writeFileSync(out, L.join('\n'), 'utf8');
log(`\nreport:${out}`);
log(`盤點:member ${g.m} / 過預篩 ${g.p}`);
