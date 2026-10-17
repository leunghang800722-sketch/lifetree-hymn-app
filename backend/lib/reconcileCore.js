// lib/reconcileCore.js — 逐頻道三數核對嘅共用邏輯 —— 2026-07-31 Fable 5
// 結構性修復方案:`scripts/reconcileChannels.js`(人手 CLI)同 `growLibrary.js`
// (自動每日一次嘅 incremental reconcile)共用**同一份** code,唔好維護兩套。
//
//   ① 官方總數 —— channel 用 About 頁 videoCountText,playlist 用 yt-dlp playlist_count。
//   ② 全量枚舉 —— channel:/videos+/streams+/shorts 三分頁 flat-playlist 全深度,id 取
//      union;playlist:枚舉個 playlist 本身。
//   ③ DB 逐條對帳 —— 每條 id 歸五類:curated✓/rejected(內容判死)/dead(死鏈)/
//      欠收-帶內非junk/欠收-帶外或junk。
//
// Incremental 模式(`reconcileGroupIncremental`):自動每日循環用嘅平版本 ——
// 淨係攞官方數(一個 fetch,平)同上次已知嘅官方數比,冇變就即刻 skip(唔使
// 再做貴嘅三分頁全深度枚舉),做到「增量成本近零」。

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isCompilation, isNonWorship, isInSongDurationBand } from './hymnDb.js';
import { YTDLP } from './ytdlpBin.js';

const exec = promisify(execCb);
export const ENUM_DEPTH = 3000; // 遠超任何現有頻道嘅片量(最大 Asia for JESUS ~1424)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MISSING_CACHE_PATH = path.join(__dirname, '..', 'cache', 'reconcile-missing.json');

export function loadMissingCache() {
  try {
    return JSON.parse(fs.readFileSync(MISSING_CACHE_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

export function saveMissingCache(cache) {
  fs.mkdirSync(path.dirname(MISSING_CACHE_PATH), { recursive: true });
  fs.writeFileSync(MISSING_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

// ── ① 官方總數 ─────────────────────────────────────────────────
export async function getOfficialCount(channelHandle) {
  if (channelHandle.startsWith('playlist?list=')) {
    const { stdout } = await exec(
      `"${YTDLP}" --dump-single-json --flat-playlist --playlist-items 0 "https://www.youtube.com/${channelHandle}"`,
      { timeout: 30000, maxBuffer: 20 * 1024 * 1024 }
    );
    const info = JSON.parse(stdout);
    return typeof info.playlist_count === 'number' ? info.playlist_count : null;
  }
  const url = `https://www.youtube.com/${channelHandle}/about`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(20000),
  });
  const html = await res.text();
  // ⚠️ About 頁入面「相關頻道」卡片都有 videoCountText,但嗰啲用 `{"runs":[...]}`
  // 格式;個頻道**自己**個先係 plain string `"NNN videos"`,唔可以撞第一個match就算。
  const m = html.match(/"videoCountText":"([0-9,]+) videos"/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// ── ② 全量枚舉 ─────────────────────────────────────────────────
async function listTab(channelHandle, tab) {
  const url = `https://www.youtube.com/${channelHandle}/${tab}`;
  try {
    const { stdout } = await exec(
      `"${YTDLP}" --flat-playlist --playlist-end ${ENUM_DEPTH} --print "%(id)s|%(duration)s|%(title)s" "${url}"`,
      { timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
    );
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const i1 = line.indexOf('|');
      const i2 = line.indexOf('|', i1 + 1);
      const id = line.slice(0, i1);
      const d = Number(line.slice(i1 + 1, i2));
      const title = line.slice(i2 + 1);
      return { id, title, duration: Number.isFinite(d) && d > 0 ? d : null };
    });
  } catch (e) {
    // 頻道冇呢個分頁(例如冇開 live 過就冇 /streams)係正常情況,唔係錯誤。
    return [];
  }
}

export async function enumerateChannel(channelHandle) {
  if (channelHandle.startsWith('playlist?list=')) {
    const url = `https://www.youtube.com/${channelHandle}`;
    const { stdout } = await exec(
      `"${YTDLP}" --flat-playlist --playlist-end ${ENUM_DEPTH} --print "%(id)s|%(duration)s|%(title)s" "${url}"`,
      { timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
    );
    const rows = stdout.trim().split('\n').filter(Boolean).map((line) => {
      const i1 = line.indexOf('|');
      const i2 = line.indexOf('|', i1 + 1);
      const id = line.slice(0, i1);
      const d = Number(line.slice(i1 + 1, i2));
      const title = line.slice(i2 + 1);
      return { id, title, duration: Number.isFinite(d) && d > 0 ? d : null };
    });
    return { union: rows, byTab: { playlist: rows.length } };
  }
  const [videos, streams, shorts] = await Promise.all([
    listTab(channelHandle, 'videos'),
    listTab(channelHandle, 'streams'),
    listTab(channelHandle, 'shorts'),
  ]);
  const seen = new Map();
  for (const v of [...videos, ...streams, ...shorts]) {
    if (v.id && !seen.has(v.id)) seen.set(v.id, v);
  }
  return {
    union: [...seen.values()],
    byTab: { videos: videos.length, streams: streams.length, shorts: shorts.length },
  };
}

// ── ③ DB 逐條對帳 ───────────────────────────────────────────────
function classify(db, group, video) {
  const rows = query(db, `SELECT curated, status FROM hymns_all WHERE youtube_id=?`, [video.id]);
  if (rows.length) {
    const r = rows[0];
    if (r.curated === 1) return 'curated';
    if (r.status === 'rejected') return 'rejected';
    if (r.status === 'dead') return 'dead';
    return 'unchecked-inDB'; // 已入 hymns_all 但 curate 仲未輪到佢(唔算欠收,已經喺 backlog)
  }
  const junk = isCompilation(video.title) || isNonWorship(video.title, group.name);
  const inBand = isInSongDurationBand(video.duration, group.durationCapSec);
  if (!junk && inBand) return 'missing-inband';
  return 'missing-outband-or-junk';
}

export async function reconcileGroup(db, group) {
  const official = await getOfficialCount(group.channel);
  const { union, byTab } = await enumerateChannel(group.channel);
  const diff = official != null ? union.length - official : null;
  const tolOk = official == null || Math.abs(diff) <= 2;

  const buckets = { curated: [], rejected: [], dead: [], 'unchecked-inDB': [], 'missing-inband': [], 'missing-outband-or-junk': [] };
  for (const v of union) buckets[classify(db, group, v)].push(v);

  return {
    name: group.name, channel: group.channel, lang: group.lang,
    official, enumerated: union.length, byTab, diff, tolOk,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    missing: buckets['missing-inband'],
  };
}

// Incremental 版:每日自動循環用。淨係攞官方數(平)先,同上次記低嘅
// `cachedOfficialCount` 比,冇變就 skip(傳返 null),做到「增量成本近零」
// (Fable 5 方案原話:「About數冇變嘅頻道skip」)。官方數變咗(或者從來未
// reconcile 過)先做貴嘅三分頁全深度枚舉。
export async function reconcileGroupIncremental(db, group, cachedOfficialCount) {
  const official = await getOfficialCount(group.channel);
  if (official != null && official === cachedOfficialCount) {
    return null; // 冇新片,skip
  }
  return reconcileGroup(db, group);
}
