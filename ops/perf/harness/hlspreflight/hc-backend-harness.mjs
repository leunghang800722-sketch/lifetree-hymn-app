#!/usr/bin/env node
// ops/perf/harness/hlspreflight/hc-backend-harness.mjs
// HLS-PREFLIGHT-EXEC-20260907 §3 H-C(+ §6 修訂 A 加嘅並發 de-dup 一項)
//
// 起一個 express app,掛真身 `backend/routes/hls.js`(`app.use('/api/stream',
// hlsRoutes(getDb))`,同 server.js 完全一樣嘅掛法),`getDb` 用 mock(唔碰
// hymns.db)。「googlevideo」由本機另一個 http server(隨機 port)扮演,由
// `resolve-audio-stub-loader.mjs`(Node ESM loader hook)將 hls.js 手上嗰個
// `resolveAudioUrl` 換做可以指返嚟呢個 mock server 嘅版本——呢一步之後,
// `fetchHeadBytes`/`resolveStructureOnce`/`resolveStructureShared`/
// `buildM3U8`/opsMetrics 全部係真身,一個字冇改。
//
// 點跑: node --experimental-loader=./resolve-audio-stub-loader.mjs hc-backend-harness.mjs
//       (下面用 module.register() programmatically 做同一件事,唔使 CLI flag)
'use strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');

register(pathToFileURL(path.join(__dirname, 'resolve-audio-stub-loader.mjs')));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

// ---- 1) 構造一個合法但人手砌嘅 fragmented-mp4 head(ftyp+moov+sidx),
//         唔靠任何真實音訊檔——hlsPlaylist.js 嘅 parsePlaylistStructure()
//         淨係睇 box header/sidx 內容,唔理 moov 入面實際圖層,人手砌一個
//         一樣過到佢個判斷。----
function box(type, bodyBuf) {
  const size = 8 + bodyBuf.length;
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(size, 0);
  buf.write(type, 4, 4, 'latin1');
  bodyBuf.copy(buf, 8);
  return buf;
}
function buildFixtureMp4(refs) {
  const ftyp = box('ftyp', Buffer.from('isomiso2mp41', 'latin1'));
  const moov = box('moov', Buffer.alloc(16)); // 內容唔重要,parser 淨係要個 offset/size
  const refCount = refs.length;
  // version+flags(4) + reference_ID(4) + timescale(4) + earliest_presentation_time(4)
  // + first_offset(4) + reserved+reference_count(4) + refCount*12
  const sidxBody = Buffer.alloc(4 + 4 + 4 + 4 + 4 + 4 + refCount * 12);
  let p = 0;
  sidxBody.writeUInt8(0, p); p += 1; // version=0
  p += 3; // flags(3) = 0
  sidxBody.writeUInt32BE(1, p); p += 4; // reference_ID
  sidxBody.writeUInt32BE(1000, p); p += 4; // timescale
  sidxBody.writeUInt32BE(0, p); p += 4; // earliest_presentation_time
  sidxBody.writeUInt32BE(0, p); p += 4; // first_offset
  sidxBody.writeUInt16BE(0, p); p += 2; // reserved
  sidxBody.writeUInt16BE(refCount, p); p += 2;
  for (const r of refs) {
    sidxBody.writeUInt32BE(r.size & 0x7fffffff, p); p += 4;
    sidxBody.writeUInt32BE(r.duration, p); p += 4;
    sidxBody.writeUInt32BE(0, p); p += 4; // SAP info,唔理
  }
  const sidx = box('sidx', sidxBody);
  return Buffer.concat([ftyp, moov, sidx]);
}
const FIXTURE_REFS = [
  { size: 200000, duration: 4000 },
  { size: 180000, duration: 4000 },
  { size: 220000, duration: 4000 },
];
const FIXTURE_BUF = buildFixtureMp4(FIXTURE_REFS);

// ---- 2) 「googlevideo」mock server ----
const mockCounters = { always403: 0, hang: 0, ok: 0, okSlow: 0 };
const mockGooglevideo = http.createServer((req, res) => {
  const u = req.url || '';
  if (u.startsWith('/always403')) {
    mockCounters.always403++;
    res.writeHead(403);
    res.end();
    return;
  }
  if (u.startsWith('/hang')) {
    mockCounters.hang++;
    // 故意乜都唔答,等 client 側 3s AbortController timeout。
    return;
  }
  if (u.startsWith('/ok-slow')) {
    mockCounters.okSlow++;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(FIXTURE_BUF);
    }, 300); // 夠長,等第二個並發請求嚟到嗰陣第一個仲未完
    return;
  }
  if (u.startsWith('/ok')) {
    mockCounters.ok++;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(FIXTURE_BUF);
    return;
  }
  res.writeHead(404);
  res.end();
});

// ---- 3) mock getDb:淨係俾 hls.js 攞 youtube_id,唔碰真 hymns.db ----
const HYMN_TABLE = new Map(); // id(number) -> youtube_id(string)
function makeMockDb() {
  return {
    prepare(sql) {
      return {
        _id: null,
        bind(params) { this._id = params[0]; },
        step() { return HYMN_TABLE.has(this._id); },
        getAsObject() { return { youtube_id: HYMN_TABLE.get(this._id) }; },
        free() {},
      };
    },
  };
}
async function getDb() { return makeMockDb(); }

async function main() {
  await new Promise((resolve) => mockGooglevideo.listen(0, '127.0.0.1', resolve));
  const mockPort = mockGooglevideo.address().port;
  const MOCK_BASE = `http://127.0.0.1:${mockPort}`;
  console.log(`[mock googlevideo] 監聽 ${MOCK_BASE}`);

  // 每個 youtubeId 對應一個 mock 端點,resolveAudioUrl stub 逐個查表。
  const resolveTable = new Map(); // youtubeId -> url
  globalThis.__hcMockResolveAudioUrl = async (youtubeId) => {
    const url = resolveTable.get(youtubeId);
    if (!url) throw new Error(`resolveTable 冇呢個 id: ${youtubeId}`);
    return url;
  };

  const hlsModUrl = pathToFileURL(path.join(BACKEND_ROOT, 'routes', 'hls.js')).href;
  const opsMetricsUrl = pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'opsMetrics.js')).href;
  const hlsMod = await import(hlsModUrl);
  const opsMetrics = await import(opsMetricsUrl);

  console.log(`[抽查] resolveStructureShared 存在: ${typeof hlsMod.resolveStructureShared === 'function'}`);
  console.log(`[抽查] resolveStructureInner 存在: ${typeof hlsMod.resolveStructureInner === 'function'}`);
  // HLS-PREFLIGHT-FIX-20260907 #1/#4 —— backoffMsFor()/重試 已經剷咗(403/410
  // 而家即刻 bustCache+回404,唔再等 backoff/重新 resolve),舊 export 已刪。
  console.log(`[抽查] backoffMsFor 已刪(#1/#4:403/410 唔再重試):${typeof hlsMod.backoffMsFor === 'undefined'}`);

  // express 起真 app,同 server.js 一樣嘅掛法。
  const expressUrl = pathToFileURL(path.join(BACKEND_ROOT, 'node_modules', 'express', 'index.js')).href;
  const { default: express } = await import(expressUrl);
  const app = express();
  app.use('/api/stream', hlsMod.default(getDb));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const appPort = server.address().port;
  const APP_BASE = `http://127.0.0.1:${appPort}`;
  console.log(`[hls route app] 監聽 ${APP_BASE}\n`);

  // ============ (a) HLS-PREFLIGHT-FIX-20260907 #1/#4:403 → 即刻 bustCache
  // + 回 404,唔再重試,總耗時 ≤1s ============
  {
    const id = 1001;
    const yt = 'yt-403loop';
    HYMN_TABLE.set(id, yt);
    resolveTable.set(yt, `${MOCK_BASE}/always403`);
    const before = opsMetrics.getOpsMetrics().total.upstream403;
    const beforeBust = globalThis.__hcBustCalls || 0;
    const t0 = Date.now();
    const res = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const elapsed = Date.now() - t0;
    const body = await res.json().catch(() => null);
    const after = opsMetrics.getOpsMetrics().total.upstream403;
    const afterBust = globalThis.__hcBustCalls || 0;
    check('(a) 403 → HTTP 404', res.status === 404, res.status);
    check('(a) reason 帶 headfetch-failed(status=403)', body && /headfetch-failed\(status=403\)/.test(body.error || ''), body);
    check(`(a) 總耗時 ≤1s(#1/#4:唔再等 backoff/重新 resolve),實測 ${elapsed}ms`, elapsed <= 1000, elapsed);
    check('(a) mock googlevideo 淨係打咗 1 次 403(#1/#4:唔再重試)', mockCounters.always403 === 1, mockCounters.always403);
    check('(a) bustCache(youtubeId) 真係俾 call 咗一次(#1/#4:令下次 resolve 攞新 URL)', (afterBust - beforeBust) === 1, { beforeBust, afterBust });
    check('(a) opsMetrics upstream403.hls 加咗 1、hlsTotal 加咗 1(唔再重試,淨係一次 head-fetch)', (after.hls - before.hls) === 1 && (after.hlsTotal - before.hlsTotal) === 1, { before, after });
  }

  // ============ (a2) HLS-PREFLIGHT-FIX-20260907 #4:403→404 耗時三次量度
  // (呢個 harness 嘅 resolveAudioUrl 仍然係 stub——真 yt-dlp resolve 條件
  // 下嘅三次量度留俾 iOS Simulator + 隔離 backend 副本嗰邊做,呢度純粹係
  // 「唔理 resolve 耗時,head-fetch 呢一層本身有冇重試」嘅重複量度,confirm
  // 三次都一致咁快、冇偶發變回慢) ============
  {
    const id = 1005;
    const yt = 'yt-403loop-again';
    HYMN_TABLE.set(id, yt);
    resolveTable.set(yt, `${MOCK_BASE}/always403`);
    const timings = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const res = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
      await res.json().catch(() => null);
      timings.push(Date.now() - t0);
    }
    check(`(a2) 403→404 三次耗時全部 ≤1s(實測 ${timings.join('ms, ')}ms)`, timings.every((t) => t <= 1000), timings);
    console.log(`  ℹ️  (a2) 403→404 三次耗時: ${timings.map((t) => t + 'ms').join(', ')}`);
  }

  // ============ (b) 檔頭 fetch 掛住 → 3s timeout 回 404 ============
  {
    const id = 1002;
    const yt = 'yt-hang';
    HYMN_TABLE.set(id, yt);
    resolveTable.set(yt, `${MOCK_BASE}/hang`);
    const t0 = Date.now();
    const res = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const elapsed = Date.now() - t0;
    const body = await res.json().catch(() => null);
    check('(b) 掛住嘅 head fetch → HTTP 404', res.status === 404, res.status);
    check('(b) reason 帶 headfetch-failed(status=timeout)', body && /headfetch-failed\(status=timeout\)/.test(body.error || ''), body);
    check(`(b) 耗時喺 3s 附近(3000-3800ms,唔會重試 timeout),實測 ${elapsed}ms`, elapsed >= 2900 && elapsed <= 3800, elapsed);
  }

  // ============ (c) 200 正常路徑不變(HEAD 前後 playlist bytes 一致) ============
  {
    const id = 1003;
    const yt = 'yt-ok';
    HYMN_TABLE.set(id, yt);
    resolveTable.set(yt, `${MOCK_BASE}/ok`);
    const res = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const text = await res.text();
    check('(c) 200 正常路徑 → HTTP 200', res.status === 200);
    // undici(Node fetch)/express 會喺 header 自動加 `; charset=utf-8`,呢度淨係
    // 驗證前綴(route 本身 setHeader 嗰句一個字冇改)。
    check('(c) Content-Type 係 application/vnd.apple.mpegurl', String(res.headers.get('content-type') || '').startsWith('application/vnd.apple.mpegurl'), res.headers.get('content-type'));
    check('(c) playlist 帶 #EXTM3U', text.startsWith('#EXTM3U'));
    // 獨立直接 parse 同一份 fixture bytes,同 route 吐出嚟嗰份 playlist 對數。
    const { parsePlaylistStructure } = await import(pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'hlsPlaylist.js')).href);
    const directParse = parsePlaylistStructure(FIXTURE_BUF);
    const mapMatch = new RegExp(`BYTERANGE="${directParse.initSize}@0"`).test(text);
    check(`(c) EXT-X-MAP BYTERANGE 嘅 initSize(${directParse.initSize})同獨立 parse 一致`, mapMatch, text);
    const segCount = (text.match(/#EXTINF:/g) || []).length;
    check(`(c) segment 數(${segCount})同獨立 parse 一致(${directParse.segments.length})`, segCount === directParse.segments.length);
    const byteRangeSum = [...text.matchAll(/#EXT-X-BYTERANGE:(\d+)@/g)].reduce((s, m) => s + Number(m[1]), 0);
    check(`(c) segment byte 總和(${byteRangeSum})同獨立 parse 一致(${directParse.segmentsByteTotal})`, byteRangeSum === directParse.segmentsByteTotal);
  }

  // ============ §6 加驗證:同一 id 兩個並發 m3u8 請求 → 檔頭 fetch 只做一次 ============
  {
    const id = 1004;
    const yt = 'yt-ok-slow';
    HYMN_TABLE.set(id, yt);
    resolveTable.set(yt, `${MOCK_BASE}/ok-slow`);
    const before = mockCounters.okSlow;
    const beforeResolveCalls = globalThis.__hcResolveCalls || 0;
    // 兩個幾乎同一刻嘅並發請求(模擬 JS preflightHls() vs AVPlayer 真正 fetch)。
    const [r1, r2] = await Promise.all([
      fetch(`${APP_BASE}/api/stream/${id}.m3u8`),
      fetch(`${APP_BASE}/api/stream/${id}.m3u8`),
    ]);
    const afterOkSlow = mockCounters.okSlow;
    const afterResolveCalls = globalThis.__hcResolveCalls || 0;
    check('§6:兩個並發請求都 200', r1.status === 200 && r2.status === 200, [r1.status, r2.status]);
    const [t1, t2] = await Promise.all([r1.text(), r2.text()]);
    check('§6:兩份 playlist body 一模一樣', t1 === t2);
    check(`§6:mock googlevideo 嘅 /ok-slow 淨係俾打中 1 次(唔係 2 次)—— resolveStructureShared 做咗 in-flight de-dup,實測 ${afterOkSlow - before} 次`, (afterOkSlow - before) === 1, afterOkSlow - before);
    console.log(`  ℹ️  (參考,唔係呢張執行單嘅新改動)resolveAudioUrl stub 呢兩個並發請求 call 咗 ${afterResolveCalls - beforeResolveCalls} 次 —— 呢個係 route handler 頂頭嘅 resolveAudioUrl(),唔係本張單新加嘅 in-flight de-dup 對象(嗰個係 backend/lib/resolveAudio.js 現有嘅 per-id coalescing,呢個 harness stub 咗佢,唔喺呢度重複驗)`);
  }

  server.close();
  mockGooglevideo.close();

  console.log(`\nH-C: ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('H-C harness 本身炸咗:', e);
  process.exit(2);
});
