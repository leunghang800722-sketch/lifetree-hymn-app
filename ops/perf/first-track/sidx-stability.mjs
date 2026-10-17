#!/usr/bin/env node
// ops/perf/first-track/sidx-stability.mjs — FIRST-TRACK-STEP01-EXEC-20260907
// §1 S0-2(G-4):同一個 youtube_id 跨兩次獨立 resolve,sidx offset 會唔會變。
//
// ⚠️ 紅線遵守方式:
//   - **完全唔 import backend/lib/resolveAudio.js**,唔碰佢個 cache Map、
//     唔碰 `backend/cache/resolve-cache.json`。呢度自己重新 shell out
//     yt-dlp(同 production 用緊嘅 default strategy 完全一樣嘅 `-f` 參數),
//     每次都係一次全新、零快取嘅 resolve —— 「第二次 bust cache」呢個
//     要求因為根本冇 cache 而自動滿足。
//   - 限速:每次 yt-dlp resolve(呢個 script 入面淨係得 resolve 呢一種
//     會打 YouTube 嘅動作)之間至少相隔 4 秒;全程最多 60 次 yt-dlp
//     invocation(30 首 × 2 次)。
//   - 撞 403(googlevideo HEAD fetch)即刻停手,唔再打任何一次 yt-dlp/HEAD。
//   - 讀 DB 用 backend/lib/hymnDb.js 嘅 `openDb()`(純讀,唔會 saveDb,
//     唔會攞 DB 鎖 —— 冇寫入,唔需要)。
//
// 用法: node ops/perf/first-track/sidx-stability.mjs
'use strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');

const MIN_RESOLVE_GAP_MS = 4000;
const MAX_YTDLP_CALLS = 60;
const SAMPLE_SIZE = 30;
const HEAD_BYTES_FIRST = 256 * 1024;
const HEAD_BYTES_ESCALATE = 1024 * 1024;

let ytdlpCalls = 0;
let lastYtdlpAt = 0;
let halted = false;
let haltReason = null;

async function throttleBeforeYtdlp() {
  const wait = MIN_RESOLVE_GAP_MS - (Date.now() - lastYtdlpAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

// 同 backend/lib/resolveAudio.js STRATEGIES[0]('default')完全一樣嘅
// `-f`/`--get-url` 參數,獨立 shell out,零 cache、零共用 module state。
async function ytdlpResolve(youtubeId, YTDLP) {
  if (halted) return null;
  if (ytdlpCalls >= MAX_YTDLP_CALLS) { haltReason = `已經打咗 ${MAX_YTDLP_CALLS} 次 yt-dlp,封頂停手`; halted = true; return null; }
  await throttleBeforeYtdlp();
  ytdlpCalls++;
  lastYtdlpAt = Date.now();
  try {
    const { stdout } = await exec(
      `"${YTDLP}" -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-playlist "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 12000 }
    );
    const url = stdout.trim();
    if (url && url.startsWith('http')) return url;
    return null;
  } catch (e) {
    console.warn(`  ⚠️ yt-dlp resolve failed for ${youtubeId}: ${e?.message || e}`);
    return null;
  }
}

async function fetchHeadBytes(url, nBytes) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: `bytes=0-${nBytes - 1}` } });
    if (r.status === 403) { haltReason = '撞 403(googlevideo HEAD fetch)—— 即刻停手'; halted = true; try { await r.body?.cancel?.(); } catch (_) {} return null; }
    if (r.status !== 200 && r.status !== 206) { try { await r.body?.cancel?.(); } catch (_) {} return null; }
    const cr = r.headers.get('content-range'); // "bytes 0-N/TOTAL"
    const clen = cr ? Number(/\/(\d+)$/.exec(cr)?.[1]) : null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, clen };
  } catch (e) {
    return null;
  }
}

async function getStructureFor(url, parsePlaylistStructure) {
  let got = await fetchHeadBytes(url, HEAD_BYTES_FIRST);
  if (!got) return null;
  let result = parsePlaylistStructure(got.buf);
  if (!result.ok && result.needMoreBytes) {
    const got2 = await fetchHeadBytes(url, HEAD_BYTES_ESCALATE);
    if (got2) { got = got2; result = parsePlaylistStructure(got.buf); }
  }
  return { result, clen: got.clen };
}

async function main() {
  const { openDb, query } = await import(path.join(BACKEND_ROOT, 'lib', 'hymnDb.js'));
  const { YTDLP } = await import(path.join(BACKEND_ROOT, 'lib', 'ytdlpBin.js'));
  const { parsePlaylistStructure } = await import(path.join(BACKEND_ROOT, 'lib', 'hlsPlaylist.js'));

  // ── 揀歌:09-06/09-07 有 [hls] result=ok 記錄嘅 id(最多 20)+ 隨機 10 首 curated ──
  const backendLogPath = '/tmp/hymn_backend.log';
  const seenIds = new Set();
  try {
    const raw = fs.readFileSync(backendLogPath, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.startsWith('[hls] ')) continue;
      if (!/2026-09-0[67]/.test(line)) continue;
      if (!/result=ok/.test(line)) continue;
      const m = /\bid=(\d+)\b/.exec(line);
      if (m) seenIds.add(Number(m[1]));
    }
  } catch (e) {
    console.warn(`⚠️ 讀唔到 ${backendLogPath}: ${e.message}`);
  }
  const fromLog = [...seenIds].slice(0, 20);

  const db = await openDb();
  const idPlaceholders = fromLog.length ? fromLog.join(',') : '-1';
  const fromLogRows = query(db, `SELECT id, youtube_id, title FROM hymns WHERE id IN (${idPlaceholders}) AND youtube_id IS NOT NULL`);
  const needRandom = SAMPLE_SIZE - fromLogRows.length;
  const excludeIds = fromLogRows.map((r) => r.id);
  const excludeClause = excludeIds.length ? `AND id NOT IN (${excludeIds.join(',')})` : '';
  const randomRows = needRandom > 0
    ? query(db, `SELECT id, youtube_id, title FROM hymns WHERE curated = 1 AND youtube_id IS NOT NULL ${excludeClause} ORDER BY RANDOM() LIMIT ${needRandom}`)
    : [];

  const songs = [...fromLogRows, ...randomRows];
  console.log(`[sidx-stability] 揀咗 ${songs.length} 首歌（${fromLogRows.length} 首嚟自 [hls] log、${randomRows.length} 首隨機）`);

  const results = [];
  for (const song of songs) {
    if (halted) break;
    console.log(`[sidx-stability] id=${song.id} yt=${song.youtube_id} 「${song.title}」`);
    const url1 = await ytdlpResolve(song.youtube_id, YTDLP);
    if (halted || !url1) { results.push({ ...song, error: halted ? haltReason : 'resolve #1 失敗' }); if (halted) break; continue; }
    const struct1 = await getStructureFor(url1, parsePlaylistStructure);
    if (halted) { results.push({ ...song, error: haltReason }); break; }

    const url2 = await ytdlpResolve(song.youtube_id, YTDLP);
    if (halted || !url2) { results.push({ ...song, error: halted ? haltReason : 'resolve #2 失敗' }); if (halted) break; continue; }
    const struct2 = await getStructureFor(url2, parsePlaylistStructure);
    if (halted) { results.push({ ...song, error: haltReason }); break; }

    const s1 = struct1?.result;
    const s2 = struct2?.result;
    const clen1 = struct1?.clen ?? null;
    const clen2 = struct2?.clen ?? null;
    const sameClen = clen1 != null && clen2 != null && clen1 === clen2;
    const sameUrl = url1 === url2;
    let sameSidx = null;
    let sameInitSize = null;
    let seg5Match = null;
    if (s1?.ok && s2?.ok) {
      sameInitSize = s1.initSize === s2.initSize;
      const n = Math.min(5, s1.segments.length, s2.segments.length);
      seg5Match = true;
      for (let i = 0; i < n; i++) {
        if (s1.segments[i].offset !== s2.segments[i].offset || s1.segments[i].length !== s2.segments[i].length) { seg5Match = false; break; }
      }
      sameSidx = sameInitSize && seg5Match;
    }
    results.push({
      ...song, sameUrl, clen1, clen2, sameClen,
      ok1: !!s1?.ok, ok2: !!s2?.ok, initSize1: s1?.initSize ?? null, initSize2: s2?.initSize ?? null,
      sameInitSize, seg5Match, sameSidx,
    });
    console.log(`  url1==url2: ${sameUrl}  clen: ${clen1} vs ${clen2} (same=${sameClen})  sidx一致: ${sameSidx}`);
  }

  // ── 出報告 ──
  const out = [];
  out.push('# G-4 sidx 穩定性 — 2026-09-07');
  out.push('');
  out.push(`產生時間：${new Date().toISOString()}`);
  out.push(`yt-dlp 呼叫次數：${ytdlpCalls}/${MAX_YTDLP_CALLS}`);
  if (halted) out.push(`⚠️ **提早停手**：${haltReason}`);
  out.push('');
  out.push('## 方法');
  out.push('- 對每首歌獨立 shell out yt-dlp 兩次（同 production `default` strategy 一樣嘅 `-f` 參數），**完全唔用 resolveAudio.js 嘅 cache**（兩次天然就係兩次獨立 cold resolve，唔使額外 bustCache）。');
  out.push('- 對每條 resolve 到嘅 URL，attach Range HEAD fetch（256KB，唔夠再攞 1MB）解 sidx，讀 `content-range` 攞 `clen`。');
  out.push('- 比較：①兩次 resolve 出嚟嘅 URL 係咪同一條；②`clen` 是否一致；③`initSize` 是否一致；④頭 5 個 segment 嘅 offset/length 是否一致。');
  out.push('');

  const withData = results.filter((r) => r.sameSidx !== undefined && r.sameSidx !== null);
  const consistent = withData.filter((r) => r.sameSidx === true).length;
  const inconsistentButSameClen = withData.filter((r) => r.sameSidx === false && r.sameClen === true).length;
  const inconsistentDiffClen = withData.filter((r) => r.sameSidx === false && r.sameClen === false).length;

  out.push('## 結果匯總');
  out.push(`- 有齊兩次結構嘅樣本數：${withData.length}`);
  out.push(`- sidx 完全一致（initSize + 頭5段 offset/length）：${consistent}/${withData.length}${withData.length ? ` = ${(100 * consistent / withData.length).toFixed(1)}%` : ''}`);
  out.push(`- sidx 唔一致但 clen 都一樣（= 同一個 format，sidx 本身漂移 —— 對 N1 校驗係壞消息）：${inconsistentButSameClen}`);
  out.push(`- sidx 唔一致而且 clen 都唔同（= 換咗 format/variant，屬預期、clen 校驗攔得住）：${inconsistentDiffClen}`);
  out.push('');
  out.push('## 逐首結果');
  out.push('| id | title | url1==url2 | clen1 | clen2 | sameClen | initSize1 | initSize2 | sameInitSize | seg5Match | sameSidx |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.error) { out.push(`| ${r.id} | ${r.title} | - | - | - | - | - | - | - | - | **錯誤:${r.error}** |`); continue; }
    out.push(`| ${r.id} | ${r.title} | ${r.sameUrl} | ${r.clen1} | ${r.clen2} | ${r.sameClen} | ${r.initSize1} | ${r.initSize2} | ${r.sameInitSize} | ${r.seg5Match} | ${r.sameSidx} |`);
  }
  out.push('');
  out.push('## 決定 N1 key 用 `yt` 定 `yt+clen`');
  if (withData.length === 0) {
    out.push('⚠️ 冇收到任何完整樣本（提早停手），呢個決定留返俾 Fable 睇實際 log 判斷。**保守做法**：`HLS_PLAYLIST_VERIFY` 預設 1（校驗），符合執行單原文預設值。');
  } else if (consistent === withData.length) {
    out.push(`✅ **${withData.length}/${withData.length} 全部一致** —— 支持「key 用 \`yt\`、可以唔校驗」嘅方向。但執行單原文話明「執行者兩個 mode 都做」，`);
    out.push('預設環境變數 `HLS_PLAYLIST_VERIFY` 仍然保持 `1`（校驗）不變 —— 樣本數細（≤30），一次性量度唔足以推翻「預設校驗」呢個保守立場，留返俾 Fable 睇呢份數據決定會唔會之後切 `0`。');
  } else {
    out.push(`🔴 有 ${withData.length - consistent} 首唔一致 —— 支持「key 一定要連 clen 校驗，唔可以淨用 \`yt\`」。`);
    if (inconsistentButSameClen > 0) {
      out.push(`⚠️ 更關鍵：${inconsistentButSameClen} 首係「clen 都一樣但 sidx 唔同」—— 即係話單純校驗 clen **唔夠**，呢種情況 N1 嘅 verify-by-clen 一樣會誤判做 hit，播出嚟嘅 offset 會錯。呢個發現要即刻同 Fable 講。`);
    }
    out.push('`HLS_PLAYLIST_VERIFY` 預設 `1`（校驗）——呢個結果進一步支持保持預設校驗，唔應該改做 `0`。');
  }

  const reportPath = path.join(__dirname, 'sidx-stability-20260907.md');
  fs.writeFileSync(reportPath, out.join('\n'), 'utf8');
  console.log(`[sidx-stability] 報告已寫: ${reportPath}`);
}

main().catch((e) => {
  console.error('sidx-stability script 本身炸咗:', e);
  process.exit(1);
});
