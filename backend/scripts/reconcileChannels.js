#!/usr/bin/env node
// 逐頻道三數核對 —— 2026-07-30 Fable 5「逐頻道三數核對」方案(docs/SUPERVISION-LOG.md
// 07-30「📐」條目)。之前嘅「假枯竭審計」只掃 /videos 分頁,漏咗 /streams、/shorts,
// 亦冇跟官方數對過(枚舉幾多就信幾多)。呢個 script 三數互相核對,冇一個數係估:
//
//   ① 官方總數 —— channel 用 About 頁 videoCountText,playlist 用 yt-dlp playlist_count。
//   ② 全量枚舉 —— channel:/videos+/streams+/shorts 三分頁 flat-playlist 全深度,id 取
//      union;playlist:枚舉個 playlist 本身。**核對規則:union 必須 = 官方數(容差 ≤2,
//      俾 deleted/private)**,超出就 log 警告(枚舉可能有漏)。
//   ③ DB 逐條對帳 —— 每條 id 歸五類:curated✓/rejected(內容判死)/dead(死鏈)/
//      欠收-帶內非junk/欠收-帶外或junk。
//   ④ 輸出 —— per-channel 對帳表 + 「欠收-帶內非junk」id 清單(有 title/duration),
//      寫入 cache/reconcile-missing.json 俾 backfillFromList.js 食;人睇嘅摘要 print
//      出嚟,執行 session 自己 append 落 SUPERVISION-LOG.md。
//
// Usage:
//   node scripts/reconcileChannels.js --group "CantonHymn"
//   node scripts/reconcileChannels.js --all [--only-lang 粵語]

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  openDb, query, isCompilation, isNonWorship, isInSongDurationBand, formatDuration,
} from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MISSING_CACHE_PATH = path.join(__dirname, '..', 'cache', 'reconcile-missing.json');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ENUM_DEPTH = 3000; // 遠超任何現有頻道嘅片量(最大 Asia for JESUS ~1424)

// ── ① 官方總數 ─────────────────────────────────────────────────
async function getOfficialCount(channelHandle) {
  if (channelHandle.startsWith('playlist?list=')) {
    const { stdout } = await exec(
      `yt-dlp --dump-single-json --flat-playlist --playlist-items 0 "https://www.youtube.com/${channelHandle}"`,
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
      `yt-dlp --flat-playlist --playlist-end ${ENUM_DEPTH} --print "%(id)s|%(duration)s|%(title)s" "${url}"`,
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

async function enumerateChannel(channelHandle) {
  if (channelHandle.startsWith('playlist?list=')) {
    const url = `https://www.youtube.com/${channelHandle}`;
    const { stdout } = await exec(
      `yt-dlp --flat-playlist --playlist-end ${ENUM_DEPTH} --print "%(id)s|%(duration)s|%(title)s" "${url}"`,
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

async function reconcileGroup(db, group) {
  console.log(`\n[核對中] ${group.name} …`);
  const official = await getOfficialCount(group.channel);
  const { union, byTab } = await enumerateChannel(group.channel);
  const diff = official != null ? union.length - official : null;
  const tolOk = official == null || Math.abs(diff) <= 2;

  const buckets = { curated: [], rejected: [], dead: [], 'unchecked-inDB': [], 'missing-inband': [], 'missing-outband-or-junk': [] };
  for (const v of union) buckets[classify(db, group, v)].push(v);

  const report = {
    name: group.name, channel: group.channel, lang: group.lang,
    official, enumerated: union.length, byTab, diff, tolOk,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    missing: buckets['missing-inband'],
  };
  return report;
}

function printReport(r) {
  const tabStr = Object.entries(r.byTab).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  官方數:${r.official ?? '?'}  枚舉:${r.enumerated}(${tabStr})  差:${r.diff ?? '?'} ${r.tolOk ? '✓' : '⚠️ 超容差'}`);
  console.log(`  curated✓${r.counts.curated} / rejected${r.counts.rejected} / dead${r.counts.dead} / 已喺backlog${r.counts['unchecked-inDB']} / 欠收-帶內${r.counts['missing-inband']} / 欠收-帶外或junk${r.counts['missing-outband-or-junk']}`);
}

async function main() {
  const db = await openDb();
  const groupArg = arg('--group', null);
  const onlyLang = arg('--only-lang', null);
  const all = process.argv.includes('--all');

  let targets;
  if (groupArg) {
    const g = GROUPS.find((x) => x.name === groupArg);
    if (!g || !g.channel) { console.error(`揾唔到「${groupArg}」或者佢冇 channel`); process.exit(1); }
    targets = [g];
  } else if (all) {
    targets = GROUPS.filter((g) => g.priority <= 4 && g.channel && g.lang !== '英文'
      && !(g.lang === '兒童' && g.kidsLang === '英文'));
    if (onlyLang) targets = targets.filter((g) => g.lang === onlyLang);
  } else {
    console.error('用法:--group "團體名" | --all [--only-lang 粵語]');
    process.exit(1);
  }

  const reports = [];
  for (const g of targets) {
    try {
      const r = await reconcileGroup(db, g);
      reports.push(r);
      printReport(r);
    } catch (e) {
      console.log(`  ⚠ 出錯:${e?.message || e}`);
      reports.push({ name: g.name, channel: g.channel, error: e?.message || String(e) });
    }
  }

  console.log('\n\n========== 對帳表總覽 ==========');
  console.log('頻道'.padEnd(16), '官方', '枚舉', '差', 'curated', 'rejected', 'dead', 'backlog', '欠收帶內', '欠收帶外/junk');
  for (const r of reports) {
    if (r.error) { console.log(`${r.name}: ⚠ ${r.error}`); continue; }
    console.log(
      r.name.padEnd(16),
      String(r.official ?? '?').padStart(4),
      String(r.enumerated).padStart(4),
      String(r.diff ?? '?').padStart(4),
      String(r.counts.curated).padStart(7),
      String(r.counts.rejected).padStart(8),
      String(r.counts.dead).padStart(4),
      String(r.counts['unchecked-inDB']).padStart(7),
      String(r.counts['missing-inband']).padStart(8),
      String(r.counts['missing-outband-or-junk']).padStart(10),
    );
  }

  // 寫低「欠收-帶內非junk」清單俾 backfillFromList.js 食
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(MISSING_CACHE_PATH, 'utf8')); } catch (_) {}
  for (const r of reports) {
    if (r.error) continue;
    existing[r.name] = {
      updatedAt: new Date().toISOString(),
      channel: r.channel,
      lang: r.lang,
      missing: r.missing.map((v) => ({ id: v.id, title: v.title, duration: v.duration })),
    };
  }
  fs.mkdirSync(path.dirname(MISSING_CACHE_PATH), { recursive: true });
  fs.writeFileSync(MISSING_CACHE_PATH, JSON.stringify(existing, null, 2), 'utf8');
  console.log(`\n已寫入 ${MISSING_CACHE_PATH}`);
}

main().catch((e) => { console.error('reconcileChannels 出錯:', e); process.exit(1); });
