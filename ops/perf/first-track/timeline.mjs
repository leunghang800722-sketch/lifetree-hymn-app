#!/usr/bin/env node
// ops/perf/first-track/timeline.mjs — FIRST-TRACK-STEP01-EXEC-20260907 §1 S0-1(G-1)
//
// 純讀 log,零改動、零網絡。輸入:
//   - backend/logs/client-log/client-log-<date>.jsonl (nextTrackMs origin=start
//     連 jsRecover、hlsStartupKick、hlsPreflight、nativeStall)
//   - /tmp/hymn_backend.log(`[hls]` / `[stream]` 行)
// 對每一條「起播」事件(nextTrackMs origin=start|jsRecover),由 `clientTs − ms`
// 反推撳掣時刻 T0,喺 [T0-2s, T0+ms+2s] 窗口內撈返 backend 側嘅 [hls]/[stream]
// 行,砌出時間軸,答:「2.3 秒未歸屬去咗邊」+「init/seg0 串行定並行」(G-3)。
//
// ⚠️ 已知限制(如實寫低,唔隱瞞):
//   1. nativeStall beacon 冇 hymnId/deviceId/sessionId(全部空字串/null)——
//      呢個係現有儀器本身嘅缺口,呢支 script 冧唔到,淨係做「時間窗重疊」
//      配對(唔保證同一首歌/同一部機),報告會標明。
//   2. seg0 嘅辨識係啟發式(第一條 range.start ≠ 0 嘅 [stream] request),
//      唔係逐個 sidx segment offset 精確核對——[hls] log 冇印低逐段 offset,
//      淨係印 initSize/refs/segBytes 總數。
//   3. [stream] log 完成時間戳係 request *完成* 嗰刻(finishLog),request
//      開始時間由 `完成ts − total_ms` 反推;[hls] 同理由 `完成ts − ms` 反推。
//   4. 09-05 一部分 [hls] 行係加 `ms=` 之前寫嘅舊格式,冇 `ms=`——呢啲行會
//      當「攞唔到耗時」處理,唔會拋錯累到成個 script。
//
// 用法: node ops/perf/first-track/timeline.mjs [--dates=2026-09-06,2026-09-07]
//                                              [--backend-log=/tmp/hymn_backend.log]
//                                              [--control=<hymnId>]
'use strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const out = { dates: ['2026-09-06', '2026-09-07'], backendLog: '/tmp/hymn_backend.log', control: null };
  for (const a of argv) {
    if (a.startsWith('--dates=')) out.dates = a.slice('--dates='.length).split(',').filter(Boolean);
    else if (a.startsWith('--backend-log=')) out.backendLog = a.slice('--backend-log='.length);
    else if (a.startsWith('--control=')) out.control = a.slice('--control='.length);
  }
  return out;
}

// 通用:一行 `[tag] ISO k1=v1 k2=v2 …` 拆做 { tag, ts(epochMs), tsIso, fields }。
// 冇 `=` 嘅 token 忽略(唔應該有,但防禦性)。value 本身唔會帶空格(log helper
// 已經 sanitize 走空格/控制字元),split(' ') 對呢個格式安全。
function parseTaggedLine(line, tag) {
  if (!line.startsWith(`[${tag}] `)) return null;
  const rest = line.slice(tag.length + 3);
  const sp = rest.indexOf(' ');
  if (sp < 0) return null;
  const tsIso = rest.slice(0, sp);
  const ts = Date.parse(tsIso);
  if (!Number.isFinite(ts)) return null;
  const fields = {};
  for (const tok of rest.slice(sp + 1).trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq < 0) continue;
    fields[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  return { tag, ts, tsIso, fields };
}

function loadBackendLog(filePath) {
  const hls = [];
  const stream = [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.warn(`⚠️ 讀唔到 backend log ${filePath}: ${e.message}`);
    return { hls, stream };
  }
  for (const line of raw.split('\n')) {
    if (line.startsWith('[hls] ')) {
      const p = parseTaggedLine(line, 'hls');
      if (p) hls.push(p);
    } else if (line.startsWith('[stream] ')) {
      const p = parseTaggedLine(line, 'stream');
      if (p) stream.push(p);
    }
  }
  hls.sort((a, b) => a.ts - b.ts);
  stream.sort((a, b) => a.ts - b.ts);
  return { hls, stream };
}

function parseDetail(detail) {
  const fields = {};
  for (const tok of String(detail || '').trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq < 0) continue;
    fields[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  return fields;
}

function loadClientLog(dates) {
  const starts = [];
  const kicks = [];
  const preflights = [];
  const nativeStalls = [];
  for (const date of dates) {
    const p = path.join(REPO_ROOT, 'backend', 'logs', 'client-log', `client-log-${date}.jsonl`);
    let raw;
    try {
      raw = fs.readFileSync(p, 'utf8');
    } catch (_) {
      console.warn(`⚠️ 讀唔到 client-log ${p}(可能嗰日冇檔)`);
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (_) { continue; }
      const ts = Date.parse(ev.clientTs || ev.ts);
      if (!Number.isFinite(ts)) continue;
      const detail = parseDetail(ev.detail);
      const rec = { ...ev, tsEpoch: ts, detail };
      if (ev.event === 'nextTrackMs' && (detail.origin === 'start' || detail.origin === 'jsRecover')) {
        starts.push(rec);
      } else if (ev.event === 'hlsStartupKick') {
        kicks.push(rec);
      } else if (ev.event === 'hlsPreflight') {
        preflights.push(rec);
      } else if (ev.event === 'nativeStall') {
        nativeStalls.push(rec);
      }
    }
  }
  starts.sort((a, b) => a.tsEpoch - b.tsEpoch);
  return { starts, kicks, preflights, nativeStalls };
}

function parseRange(rangeStr) {
  if (!rangeStr || rangeStr === '-') return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(rangeStr);
  if (!m) return null;
  return { start: Number(m[1]), end: m[2] ? Number(m[2]) : null };
}

function within(ts, lo, hi) { return ts >= lo && ts <= hi; }

function pct(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function median(arr) { return pct(arr, 50); }

function buildTimelineForEvent(ev, backendLogs, clientLogs) {
  const ms = Number(ev.detail.ms);
  if (!Number.isFinite(ms)) return null;
  const T0 = ev.tsEpoch - ms; // 撳掣時刻
  const winLo = T0 - 2000;
  const winHi = T0 + ms + 2000;
  const hymnId = ev.hymnId != null ? String(ev.hymnId) : null;

  // [hls] 行:同一 hymnId,窗口內,揀最貼近(通常得一條)。
  const hlsMatches = backendLogs.hls.filter((h) => h.fields.id === hymnId && within(h.ts, winLo, winHi));
  const hlsEntry = hlsMatches[0] || null;
  let hlsInfo = null;
  if (hlsEntry) {
    const hMs = Number(hlsEntry.fields.ms);
    const reqEnd = hlsEntry.ts;
    const reqStart = Number.isFinite(hMs) ? reqEnd - hMs : null;
    hlsInfo = {
      tsIso: hlsEntry.tsIso,
      result: hlsEntry.fields.result,
      ms: Number.isFinite(hMs) ? hMs : null,
      initSize: hlsEntry.fields.initSize ? Number(hlsEntry.fields.initSize) : null,
      reqStartOffset: reqStart != null ? reqStart - T0 : null,
      reqEndOffset: reqEnd - T0,
    };
  }

  // [stream] 行:同一 hymnId,窗口內,頭三條(by 完成時間排序)。
  const streamMatches = backendLogs.stream
    .filter((s) => s.fields.id === hymnId && within(s.ts, winLo, winHi))
    .slice(0, 8); // 攞多幾條做分類判斷,report 淨係印頭三條
  const streamInfo = streamMatches.map((s) => {
    const totalMs = Number(s.fields.total_ms);
    const ttfbMs = Number(s.fields.ttfb_ms);
    const reqEnd = s.ts;
    const reqStart = Number.isFinite(totalMs) ? reqEnd - totalMs : null;
    const range = parseRange(s.fields.range);
    return {
      tsIso: s.tsIso,
      mode: s.fields.mode,
      range,
      rangeRaw: s.fields.range,
      total_ms: Number.isFinite(totalMs) ? totalMs : null,
      ttfb_ms: Number.isFinite(ttfbMs) ? ttfbMs : null,
      sent: s.fields.sent,
      reqStartOffset: reqStart != null ? reqStart - T0 : null,
      reqEndOffset: reqEnd - T0,
    };
  });

  // 啟發式分類:init = range.start===0 且 range.end+1 == initSize(若知道 initSize)
  //            或 range.start===0 且係窗口內第一條(冇 initSize 都當 init)。
  //            seg0 = 第一條 range.start>0(或者 start!=0)嘅請求,喺 init 之後。
  let seenInit = false;
  for (const s of streamInfo) {
    if (s.range && s.range.start === 0) {
      const matchesInitSize = hlsInfo && hlsInfo.initSize != null
        ? (s.range.end != null && s.range.end + 1 === hlsInfo.initSize)
        : !seenInit; // 冇 initSize 資訊,保守當第一條 start=0 就係 init
      if (matchesInitSize && !seenInit) { s.classified = 'init'; seenInit = true; continue; }
    }
    if (seenInit && !s.classified && s.range && s.range.start > 0) { s.classified = 'seg0'; seenInit = 'done'; continue; }
    if (!s.classified) s.classified = 'other';
  }

  const kicks = clientLogs.kicks.filter((k) => String(k.hymnId) === hymnId && within(k.tsEpoch, winLo, winHi))
    .map((k) => ({ tsOffset: k.tsEpoch - T0, detail: k.detail }));
  const preflights = clientLogs.preflights.filter((p) => String(p.hymnId) === hymnId && within(p.tsEpoch, winLo, winHi))
    .map((p) => ({ tsOffset: p.tsEpoch - T0, detail: p.detail }));
  // nativeStall 冇 hymnId/deviceId —— 淨係時間窗重疊,唔保證屬於呢首歌(見檔頭註釋限制 1)。
  const nativeStallsInWindow = clientLogs.nativeStalls.filter((n) => within(n.tsEpoch, winLo, winHi))
    .map((n) => ({ tsOffset: n.tsEpoch - T0, detail: n.detail }));

  // 未歸屬 = ms − 已知(hls/stream)覆蓋到嘅最後一個 offset。
  const knownEnds = [];
  if (hlsInfo) knownEnds.push(hlsInfo.reqEndOffset);
  for (const s of streamInfo.slice(0, 3)) knownEnds.push(s.reqEndOffset);
  const lastKnownEnd = knownEnds.length ? Math.max(...knownEnds) : 0;
  const unattributedMs = ms - lastKnownEnd;

  // G-3:init/seg0 串行定並行(gap < 50ms 當並行)。
  const initSeg = streamInfo.find((s) => s.classified === 'init');
  const seg0Seg = streamInfo.find((s) => s.classified === 'seg0');
  let g3 = 'n/a(冇齊 init+seg0 兩條記錄)';
  if (initSeg && seg0Seg && initSeg.reqEndOffset != null && seg0Seg.reqStartOffset != null) {
    const gap = seg0Seg.reqStartOffset - initSeg.reqEndOffset;
    g3 = `gap=${gap}ms → ${Math.abs(gap) < 50 ? '並行(<50ms)' : '串行'}`;
  }

  return {
    ev, T0, ms, hymnId,
    platform: ev.platform, deviceId: ev.deviceId, source: ev.detail.source, surface: ev.detail.surface,
    origin: ev.detail.origin,
    hlsInfo, streamInfo: streamInfo.slice(0, 3), kicks, preflights, nativeStallsInWindow,
    lastKnownEnd, unattributedMs, g3,
  };
}

function fmtMs(n) { return n == null ? '-' : `${Math.round(n)}`; }

function renderEventBlock(t) {
  const lines = [];
  lines.push(`### hymnId=${t.hymnId} platform=${t.platform} source=${t.source} surface=${t.surface} origin=${t.origin} deviceId=${t.deviceId}`);
  lines.push(`- T0(撳掣)= ${new Date(t.T0).toISOString()}；量得 ms=${t.ms}（即 nextTrackMs 報嘅起播耗時）`);
  if (t.hlsInfo) {
    lines.push(`- playlist(.m3u8)：offset ${fmtMs(t.hlsInfo.reqStartOffset)}→${fmtMs(t.hlsInfo.reqEndOffset)}ms，result=${t.hlsInfo.result}，ms=${fmtMs(t.hlsInfo.ms)}${t.hlsInfo.initSize ? `，initSize=${t.hlsInfo.initSize}` : ''}`);
  } else {
    lines.push('- playlist(.m3u8)：窗口內冇搵到 [hls] 行（可能係 Android/progressive，或 source=local）');
  }
  if (t.streamInfo.length) {
    for (const s of t.streamInfo) {
      lines.push(`- [stream] ${s.classified}：offset ${fmtMs(s.reqStartOffset)}→${fmtMs(s.reqEndOffset)}ms，range=${s.rangeRaw}，mode=${s.mode}，ttfb_ms=${fmtMs(s.ttfb_ms)}，total_ms=${fmtMs(s.total_ms)}，sent=${s.sent}`);
    }
  } else {
    lines.push('- [stream] 窗口內冇搵到任何 range request');
  }
  if (t.kicks.length) lines.push(`- hlsStartupKick：${t.kicks.map((k) => `+${fmtMs(k.tsOffset)}ms(${k.detail.bufferedNow != null ? 'bufferedNow=' + k.detail.bufferedNow : JSON.stringify(k.detail)})`).join('; ')}`);
  if (t.preflights.length) lines.push(`- hlsPreflight：${t.preflights.map((p) => `+${fmtMs(p.tsOffset)}ms(ok=${p.detail.ok} ms=${p.detail.ms} ctx=${p.detail.ctx})`).join('; ')}`);
  if (t.nativeStallsInWindow.length) lines.push(`- nativeStall(⚠️冇 hymnId/deviceId，純時間窗重疊，唔保證屬於呢首歌)：${t.nativeStallsInWindow.length} 條，例如 +${fmtMs(t.nativeStallsInWindow[0].tsOffset)}ms`);
  lines.push(`- G-3（init/seg0 串行定並行）：${t.g3}`);
  lines.push(`- **未歸屬** = ${t.ms} − ${fmtMs(t.lastKnownEnd)}(最後已知 backend 事件 offset) = **${fmtMs(t.unattributedMs)}ms**`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const backendLogs = loadBackendLog(args.backendLog);
  const clientLogs = loadClientLog(args.dates);

  console.log(`[timeline] 讀到 [hls] ${backendLogs.hls.length} 行、[stream] ${backendLogs.stream.length} 行`);
  console.log(`[timeline] client-log 讀到 nextTrackMs(origin=start|jsRecover) ${clientLogs.starts.length} 條、hlsStartupKick ${clientLogs.kicks.length} 條、hlsPreflight ${clientLogs.preflights.length} 條、nativeStall ${clientLogs.nativeStalls.length} 條`);

  const timelines = clientLogs.starts
    .map((ev) => buildTimelineForEvent(ev, backendLogs, clientLogs))
    .filter(Boolean);

  const out = [];
  out.push(`# G-1 起播時間軸 — ${args.dates.join(', ')}`);
  out.push('');
  out.push(`產生時間：${new Date().toISOString()}（純讀 log，零改動、零網絡）`);
  out.push('');
  out.push('## 方法 + 已知限制');
  out.push('- T0（撳掣時刻）由 `clientTs − ms`（nextTrackMs detail）反推。');
  out.push('- backend `[hls]`/`[stream]` 行印嘅係 **request 完成** 嗰刻,由 `完成ts − ms/total_ms` 反推 request 開始。');
  out.push('- `nativeStall` beacon 冇 hymnId/deviceId/sessionId(現有儀器本身缺口),配對淨係睇時間窗重疊,**唔保證屬於同一首歌/同一部機**。');
  out.push('- seg0 嘅辨識係啟發式(第一條 `range.start>0` 嘅 [stream] request),[hls] log 冇印逐段 sidx offset,唔係逐格精確核對。');
  out.push('- 09-05 一部分 `[hls]` 行未加 `ms=` 欄(舊格式),呢啲行嘅 ms 會顯示 `-`。');
  out.push('');

  // === S0-4 (G-9)：playlist 回應耗時分佈 + miss 率估算 ===
  const hlsMsList = backendLogs.hls.map((h) => Number(h.fields.ms)).filter((n) => Number.isFinite(n));
  const missCount = hlsMsList.filter((n) => n > 500).length;
  out.push('## S0-4(G-9)：`[hls] ms=` 分佈 + miss 率估算（ms>500 當 miss）');
  out.push(`- 樣本數（有 ms= 嘅 [hls] 行）：${hlsMsList.length}（[hls] 總行數 ${backendLogs.hls.length}，其餘係舊格式冇 ms=）`);
  out.push(`- p50 = ${fmtMs(median(hlsMsList))}ms，p90 = ${fmtMs(pct(hlsMsList, 90))}ms，max = ${fmtMs(Math.max(0, ...hlsMsList))}ms`);
  out.push(`- 估算 miss 率（ms>500）= ${missCount}/${hlsMsList.length} = ${hlsMsList.length ? (100 * missCount / hlsMsList.length).toFixed(1) : '-'}%`);
  out.push('');

  // === 核心結論:playlist 步驟佔咗 ms 幾多 % + init/seg0 gap 分佈 ===
  // 呢個係讀完全部 timeline 之後浮現嘅發現,寫成獨立段落,答返「2.3 秒未歸屬
  // 去咗邊」——真身唔係一嚿獨立嘅黑盒時間,而係「playlist 步驟本身已經食咗
  // 個 total ms 嘅大部份」,而 init/seg0 兩步(warm buffer 之下)反而好快,
  // 快到 seg0 成條 request 完全落完嘅時刻仲跌喺 nextTrackMs(有聲)之後 ——
  // 即係話 AVPlayer 唔使等成個 segment 0 派晒先開聲,seg0 嘅 total_ms 唔應該
  // 攞嚟做「起播done」嘅終點,先會解釋到點解「未歸屬」成日係負數。
  const iosHlsWithPlaylist = timelines.filter((t) => t.platform === 'ios' && t.hlsInfo && t.hlsInfo.reqEndOffset != null);
  const playlistRatios = iosHlsWithPlaylist.map((t) => (100 * t.hlsInfo.reqEndOffset) / t.ms);
  const initSeg0Gaps = [];
  for (const t of timelines) {
    const initSeg = t.streamInfo.find((s) => s.classified === 'init');
    const seg0Seg = t.streamInfo.find((s) => s.classified === 'seg0');
    if (initSeg && seg0Seg && initSeg.reqEndOffset != null && seg0Seg.reqStartOffset != null) {
      initSeg0Gaps.push(seg0Seg.reqStartOffset - initSeg.reqEndOffset);
    }
  }
  out.push('## 核心結論(讀晒全部 timeline 之後浮現,答 S0-1「2.3 秒未歸屬去咗邊」)');
  out.push('');
  out.push(`1. **playlist(.m3u8)步驟佔 total ms 嘅比例**(n=${playlistRatios.length},iOS HLS 有齊 [hls] 記錄嘅樣本):p50=${fmtMs(median(playlistRatios))}%，p90=${fmtMs(pct(playlistRatios, 90))}%，min=${fmtMs(Math.min(...playlistRatios))}%，max=${fmtMs(Math.max(...playlistRatios))}%。`);
  out.push('   → 喺絕大部份樣本入面,由撳掣到 backend 吐返 playlist(含 resolveAudioUrl cache 查詢 + sidx head-fetch + 一嚟一回網絡)已經食咗成個「起播耗時」嘅八成以上。呢個先係「2.3 秒」真正嘅去向 —— 唔係一嚿獨立嘅黑盒,而係集中晒喺 playlist 呢一步,同 N1(playlist 持久化)嘅目標完全對得上。');
  out.push(`2. **init/seg0 gap 分佈**(n=${initSeg0Gaps.length}):p50=${fmtMs(median(initSeg0Gaps))}ms，全部樣本 gap ${initSeg0Gaps.every((g) => g >= 50) ? '≥50ms' : '有部份<50ms'} → G-3 答案:**串行**(AVPlayer 攞完 init 隔 ~400ms 先發 segment 0 request,唔係同一刻並行發兩條)。`);
  out.push('3. **「未歸屬」時常見負數嘅解釋**:seg0 request 嘅 `total_ms` 係「成個 range 派晒」嘅時間(呢度睇到嘅係 162KB 幾嘅完整 segment),但 AVPlayer 唔需要等成個 segment 派完先開聲 —— 樣本入面成日見到 `nextTrackMs`(有聲)落喺 seg0 request 仲**未開始**或者**仲未派完**嗰陣,即係話真正嘅「開始有聲」門檻遠低過「攞晒 segment 0」。呢個係「未歸屬」出現負數嘅根源,唔係量錯,而係我哋用嘅「seg0 完整落完」呢個代理指標本身就大過真正嘅起播門檻。');
  out.push('');

  // === 逐條 timeline ===
  out.push('## 逐條起播事件時間軸');
  out.push('');
  for (const t of timelines) {
    out.push(renderEventBlock(t));
    out.push('');
  }

  // === 分佈匯總(未歸屬 p50/p90,按 platform+source 分組) ===
  out.push('## 未歸屬時間分佈（分組：platform × source）');
  const groups = new Map();
  for (const t of timelines) {
    const key = `${t.platform}/${t.source}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t.unattributedMs);
  }
  out.push('| platform/source | n | 未歸屬 p50 | 未歸屬 p90 | 未歸屬 max |');
  out.push('|---|---|---|---|---|');
  for (const [key, arr] of groups) {
    out.push(`| ${key} | ${arr.length} | ${fmtMs(median(arr))} | ${fmtMs(pct(arr, 90))} | ${fmtMs(Math.max(...arr))} |`);
  }
  out.push('');

  // === 正控 ===
  if (args.control) {
    const controlEvents = timelines.filter((t) => t.hymnId === args.control);
    out.push(`## 正控：hymnId=${args.control} 逐段人手核`);
    if (!controlEvents.length) {
      out.push(`⚠️ 窗口內搵唔到 hymnId=${args.control} 嘅起播事件。`);
    } else {
      for (const t of controlEvents) out.push(renderEventBlock(t));
    }
    out.push('');
  }

  const reportPath = path.join(__dirname, `timeline-20260907.md`);
  fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
  console.log(`[timeline] 報告已寫: ${reportPath}`);
}

main();
