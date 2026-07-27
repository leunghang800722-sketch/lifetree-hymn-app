#!/usr/bin/env node
// 頻道內容審核工具 —— 2026-07-27 Fable 5 content-filter 架構升級方案
// (docs/SUPERVISION-LOG.md 10:40 條目)Q2「頻道審核流程升級」。
//
// 教訓(Kids on the Move 事故):新加/覆核一個頻道以前,淨係人手睇幾條
// 最新標題唔夠代表性 —— 87 首入面 83 首(95%)其實係兒童聖經教育節目,
// 但冇一條撞正 isCompilation() 嘅負面關鍵字,純粹因為題目式標題唔似歌名
// 先俾人手睇得出。今後新頻道 / 覆核舊頻道一律跟呢個流程:
//   ① 攞 60 條(唔係 3 條)duration+title
//   ② 計三個量化比例:歌片長帶% / blocklist 命中% / 標題正面訊號%
//   ③ 隨機(唔淨係最新)抽 10 條俾人眼睇
//   ④ 門檻判定:歌帶 ≥60% 正常收;30-60% 要開 contentGate:'duration+title'
//      先收;<30% 係節目台,唔收
//
// Usage:
//   node scripts/auditChannel.js --channel @handle --name "團體名" [--depth 60]
//   node scripts/auditChannel.js --group "Kids on the Move"          # 由 worshipGroups.js 攞 channel
//   node scripts/auditChannel.js --all [--depth 60]                  # 掃晒 ACTIVE_GROUPS 有 channel 嘅團體
//   node scripts/auditChannel.js --all --only-kids-en                # 淨審英文兒童頻道(優先序最高嗰批)

import {
  listChannelVideos, isCompilation, isNonWorship, isInSongDurationBand,
  passesTitlePositiveSignal, formatDuration, sleep,
} from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DEPTH = Number(arg('--depth', 60));
const SAMPLE_N = 10;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 門檻淨係跟「歌片長帶%」判(見 Fable 5 方案原文)—— blocklist/正面訊號%
// 一齊印出嚟做輔助判斷,但唔係決定性嘅門檻。
function verdictFor(inBandPct) {
  if (inBandPct >= 60) return { verdict: 'OK', label: '≥60% 正常收(contentGate:duration 已夠)' };
  if (inBandPct >= 30) return { verdict: 'GATE', label: '30-60% 要開 contentGate:duration+title 先收' };
  return { verdict: 'REJECT', label: '<30% 係節目台,唔收' };
}

export async function auditChannel(name, channelHandle, depth = DEPTH) {
  const listing = await listChannelVideos(channelHandle, depth);
  const n = listing.length;
  if (!n) return { name, channel: channelHandle, n: 0, error: '頻道搵唔到片(handle 可能舊咗)' };

  const withDuration = listing.filter((v) => v.duration != null);
  const inBand = listing.filter((v) => isInSongDurationBand(v.duration));
  const blocklistHit = listing.filter((v) => isCompilation(v.title) || isNonWorship(v.title, name));
  const positiveHit = listing.filter((v) => passesTitlePositiveSignal(v.title));

  const pct = (x) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  const inBandPct = pct(inBand.length);
  const { verdict, label } = verdictFor(inBandPct);

  const sample = shuffle(listing).slice(0, SAMPLE_N).map((v) => ({
    title: v.title,
    duration: v.duration != null ? formatDuration(v.duration) : '(未知)',
    inBand: isInSongDurationBand(v.duration),
    blocklisted: isCompilation(v.title) || isNonWorship(v.title, name),
    positive: passesTitlePositiveSignal(v.title),
  }));

  return {
    name, channel: channelHandle, n,
    withDurationPct: pct(withDuration.length),
    inBandPct,
    blocklistPct: pct(blocklistHit.length),
    positivePct: pct(positiveHit.length),
    verdict, label, sample,
  };
}

function printReport(r) {
  console.log(`\n=== ${r.name}  (${r.channel}) ===`);
  if (r.error) { console.log(`  ⚠ ${r.error}`); return; }
  console.log(`  攞到 ${r.n} 條(有 duration 資料 ${r.withDurationPct}%)`);
  console.log(`  歌片長帶(75-600s)%: ${r.inBandPct}%   blocklist 命中%: ${r.blocklistPct}%   標題正面訊號%: ${r.positivePct}%`);
  console.log(`  判定:${r.verdict} — ${r.label}`);
  console.log(`  隨機抽 ${r.sample.length} 條(唔淨係最新):`);
  for (const s of r.sample) {
    const flags = [s.inBand ? '帶內' : '帶外', s.blocklisted ? 'blocklist' : null, s.positive ? '正面' : null]
      .filter(Boolean).join('/');
    console.log(`    [${String(s.duration).padStart(6)}] [${flags}] ${s.title}`);
  }
}

async function main() {
  const channelArg = arg('--channel', null);
  const nameArg = arg('--name', channelArg || '');
  const groupArg = arg('--group', null);
  const all = process.argv.includes('--all');
  const onlyKidsEn = process.argv.includes('--only-kids-en');

  if (all) {
    let targets = GROUPS.filter((g) => g.priority <= 4 && g.channel);
    if (onlyKidsEn) targets = targets.filter((g) => g.kidsLang === '英文');

    // Eric 指定嘅優先序:英文兒童全部 > Asia for JESUS/台北復興堂 > 中文成人。
    const rank = (g) => {
      if (g.kidsLang === '英文') return 0;
      if (['Asia for JESUS', '台北復興堂'].includes(g.name)) return 1;
      return 2;
    };
    targets = [...targets].sort((a, b) => rank(a) - rank(b));

    const results = [];
    for (const g of targets) {
      console.log(`\n[審核中] ${g.name} …`);
      try {
        const r = await auditChannel(g.name, g.channel, DEPTH);
        results.push(r);
        printReport(r);
      } catch (e) {
        console.log(`  ⚠ 出錯:${e?.message || e}`);
        results.push({ name: g.name, channel: g.channel, error: e?.message || String(e) });
      }
      await sleep(3000 + Math.random() * 2000);
    }

    console.log('\n\n========== 總覽 ==========');
    for (const r of results) {
      if (!r.n) { console.log(`${r.name}: ⚠ ${r.error}`); continue; }
      console.log(
        `${r.name.padEnd(16)}  帶內${String(r.inBandPct).padStart(5)}%  blocklist${String(r.blocklistPct).padStart(5)}%  ` +
        `正面${String(r.positivePct).padStart(5)}%  → ${r.verdict}`
      );
    }
    return;
  }

  if (groupArg) {
    const g = GROUPS.find((x) => x.name === groupArg);
    if (!g || !g.channel) { console.error(`揾唔到「${groupArg}」或者佢冇 channel`); process.exit(1); }
    printReport(await auditChannel(g.name, g.channel, DEPTH));
    return;
  }

  if (channelArg) {
    printReport(await auditChannel(nameArg, channelArg, DEPTH));
    return;
  }

  console.error('用法:--channel @handle [--name X] | --group "團體名" | --all [--only-kids-en]');
  process.exit(1);
}

main().catch((e) => { console.error('auditChannel 出錯:', e); process.exit(1); });
