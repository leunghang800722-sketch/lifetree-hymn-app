#!/usr/bin/env node
// ops/perf/first-track/harness-n1-hls-playlist-cache.mjs
// FIRST-TRACK-STEP01-EXEC-20260907 §3 H1 —— N1(playlistCache 持久化 + key
// 改 youtubeId + clen 校驗)嘅 harness。
//
// 做法同 ops/perf/harness/hlspreflight/hc-backend-harness.mjs 一模一樣:
// express 起真身 `backend/routes/hls.js`,`resolveAudioUrl` 用同一個 Node
// ESM loader hook 換做可控 stub,「googlevideo」由本機 mock http server 扮演。
// **零改動任何 production 檔案**,`HLS_PLAYLIST_CACHE_FILE` 指去 scratch
// 目錄,唔會掂 `backend/cache/hls-playlist-cache.json`。
'use strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
const SCRATCH_DIR = path.join(__dirname, '.scratch-n1');
fs.mkdirSync(SCRATCH_DIR, { recursive: true });
const CACHE_FILE = path.join(SCRATCH_DIR, 'hls-playlist-cache.json');
try { fs.unlinkSync(CACHE_FILE); } catch (_) {}

register(pathToFileURL(path.join(REPO_ROOT, 'ops', 'perf', 'harness', 'hlspreflight', 'resolve-audio-stub-loader.mjs')));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

// ---- 人手砌 fragmented-mp4 head(ftyp+moov+sidx),同現存 harness 一樣 ----
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
  const moov = box('moov', Buffer.alloc(16));
  const refCount = refs.length;
  const sidxBody = Buffer.alloc(4 + 4 + 4 + 4 + 4 + 4 + refCount * 12);
  let p = 0;
  sidxBody.writeUInt8(0, p); p += 1;
  p += 3;
  sidxBody.writeUInt32BE(1, p); p += 4;
  sidxBody.writeUInt32BE(1000, p); p += 4;
  sidxBody.writeUInt32BE(0, p); p += 4;
  sidxBody.writeUInt32BE(0, p); p += 4;
  sidxBody.writeUInt16BE(0, p); p += 2;
  sidxBody.writeUInt16BE(refCount, p); p += 2;
  for (const r of refs) {
    sidxBody.writeUInt32BE(r.size & 0x7fffffff, p); p += 4;
    sidxBody.writeUInt32BE(r.duration, p); p += 4;
    sidxBody.writeUInt32BE(0, p); p += 4;
  }
  const sidx = box('sidx', sidxBody);
  return Buffer.concat([ftyp, moov, sidx]);
}
const FIXTURE_A = buildFixtureMp4([{ size: 200000, duration: 4000 }, { size: 180000, duration: 4000 }]);
const FIXTURE_B = buildFixtureMp4([{ size: 999000, duration: 5000 }]); // 唔同結構,模擬換咗 format

// ---- 「googlevideo」mock:通用 Range-aware endpoint,回應正確 content-range ----
const hitCounts = {};
function makeRangeEndpoint(name, fixtureBuf, totalLen) {
  hitCounts[name] = 0;
  return (req, res) => {
    hitCounts[name]++;
    const rangeHeader = req.headers.range || 'bytes=0-';
    const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    const start = m ? Number(m[1]) : 0;
    const endReq = m && m[2] ? Number(m[2]) : Math.min(fixtureBuf.length, totalLen) - 1;
    const end = Math.min(endReq, totalLen - 1);
    const sliceEnd = Math.min(end + 1, fixtureBuf.length);
    const body = start < fixtureBuf.length ? fixtureBuf.subarray(start, sliceEnd) : Buffer.alloc(0);
    res.writeHead(206, {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${totalLen}`,
    });
    res.end(body);
  };
}

async function main() {
  const routes = {};
  const server = http.createServer((req, res) => {
    const handler = routes[req.url.split('?')[0]];
    if (handler) return handler(req, res);
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const mockPort = server.address().port;
  const MOCK_BASE = `http://127.0.0.1:${mockPort}`;
  console.log(`[mock googlevideo] 監聽 ${MOCK_BASE}`);

  // 兩個獨立「檔案」:A(clen=5,000,000)、A-renewed(同 A 一樣嘅 clen,模擬
  // URL 續期但 format 冇變)、B(clen=9,999,999,模擬換咗 format/variant)。
  routes['/fileA'] = makeRangeEndpoint('fileA', FIXTURE_A, 5000000);
  routes['/fileA-renewed'] = makeRangeEndpoint('fileA-renewed', FIXTURE_A, 5000000);
  routes['/fileB'] = makeRangeEndpoint('fileB', FIXTURE_B, 9999999);
  // FIRST-TRACK-STEP01-FIX-20260907 #2 —— D(clen=6,000,000)/D-renewed(同
  // clen)俾「URL 帶 clen」嘅離線校驗 test 用,URL query string 要帶
  // `?itag=&clen=` 先會行到 `urlClenMatches()` 呢條零上游請求嘅路;上面
  // fileA/fileA-renewed/fileB 全部冇 query string,特登用嚟保留驗
  // `verifyClenMatches()` 網絡 fallback 呢條路徑嘅覆蓋。
  routes['/fileD'] = makeRangeEndpoint('fileD', FIXTURE_A, 6000000);
  routes['/fileD-renewed'] = makeRangeEndpoint('fileD-renewed', FIXTURE_A, 6000000);
  // FIRST-TRACK-STEP01-FIX-20260907 §細項——「死路」:一律 500,俾 verifyfail
  // 之後嘅重新 resolve 都失敗(structure 保持 null),測「flush 亦喺
  // verifyfail 重解後排隊」呢條——即使重解都失敗,之前作廢咗嘅 cache entry
  // 都應該落實到碟,唔靠嗰次(已經失敗嘅)重解成功先觸發 flush。
  routes['/deadend'] = (req, res) => { res.writeHead(500); res.end(); };

  const resolveTable = new Map(); // youtubeId -> url(可以中途改,模擬 URL 續期)
  globalThis.__hcMockResolveAudioUrl = async (youtubeId) => {
    const url = resolveTable.get(youtubeId);
    if (!url) throw new Error(`resolveTable 冇呢個 id: ${youtubeId}`);
    return url;
  };

  async function freshHlsApp(cacheFile, maxEntries, ttlMs) {
    const env = { ...process.env, HLS_PLAYLIST_CACHE_FILE: cacheFile };
    if (maxEntries) env.HLS_PLAYLIST_CACHE_MAX_ENTRIES = String(maxEntries); else delete env.HLS_PLAYLIST_CACHE_MAX_ENTRIES;
    if (ttlMs) env.HLS_PLAYLIST_CACHE_TTL_MS = String(ttlMs); else delete env.HLS_PLAYLIST_CACHE_TTL_MS;
    process.env.HLS_PLAYLIST_CACHE_FILE = env.HLS_PLAYLIST_CACHE_FILE;
    if (env.HLS_PLAYLIST_CACHE_MAX_ENTRIES) process.env.HLS_PLAYLIST_CACHE_MAX_ENTRIES = env.HLS_PLAYLIST_CACHE_MAX_ENTRIES; else delete process.env.HLS_PLAYLIST_CACHE_MAX_ENTRIES;
    if (env.HLS_PLAYLIST_CACHE_TTL_MS) process.env.HLS_PLAYLIST_CACHE_TTL_MS = env.HLS_PLAYLIST_CACHE_TTL_MS; else delete process.env.HLS_PLAYLIST_CACHE_TTL_MS;
    // 「重新 import」:module URL 加 query cache-buster,逼 Node ESM loader
    // 當佢係新 module instance(module-level const/loadPlaylistCacheFromDisk()
    // 會重新行一次,等同一次真正 restart)。
    const hlsModUrl = pathToFileURL(path.join(BACKEND_ROOT, 'routes', 'hls.js')).href + `?n1harness=${Date.now()}-${Math.random()}`;
    const hlsMod = await import(hlsModUrl);
    const opsMetricsUrl = pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'opsMetrics.js')).href;
    const opsMetrics = await import(opsMetricsUrl);
    const expressUrl = pathToFileURL(path.join(BACKEND_ROOT, 'node_modules', 'express', 'index.js')).href;
    const { default: express } = await import(expressUrl);
    const HYMN_TABLE = new Map();
    function makeMockDb() {
      return { prepare(sql) { return { _id: null, bind(p) { this._id = p[0]; }, step() { return HYMN_TABLE.has(this._id); }, getAsObject() { return { youtube_id: HYMN_TABLE.get(this._id) }; }, free() {} }; } };
    }
    const app = express();
    app.use('/api/stream', hlsMod.default(async () => makeMockDb()));
    const appServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => appServer.once('listening', resolve));
    const appPort = appServer.address().port;
    return { hlsMod, opsMetrics, HYMN_TABLE, appServer, APP_BASE: `http://127.0.0.1:${appPort}` };
  }

  // 攔截 console.log,俾 test 可以睇返 [hls] log 行嘅 cache= 欄。
  const logLines = [];
  const origLog = console.log;
  console.log = (...args) => { logLines.push(args.join(' ')); origLog(...args); };
  function lastHlsLogFor(id) {
    for (let i = logLines.length - 1; i >= 0; i--) {
      if (logLines[i].startsWith('[hls]') && logLines[i].includes(`id=${id} `)) return logLines[i];
    }
    return null;
  }

  // ============ (1) miss → hit:同一 id,URL 續期(唔同 url、同 clen)==========
  // ⚠️ fileA/fileA-renewed 兩條 mock URL 都冇 query string(冇 clen/itag),
  // 特登噉樣整——`urlClenMatches()` 讀唔到 URL 帶嘅 clen 會回 null,逼呢個
  // test 行落 `verifyClenMatches()` 網絡 fallback 嗰條路(見下面(1c)先係
  // 免費 URL-clen 路徑嘅覆蓋)。
  {
    const { HYMN_TABLE, appServer, APP_BASE, opsMetrics } = await freshHlsApp(CACHE_FILE);
    const id = 2001;
    HYMN_TABLE.set(id, 'yt-a');
    resolveTable.set('yt-a', `${MOCK_BASE}/fileA`);
    const before = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    const r1 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(1) 第一次 request 200', r1.status === 200, r1.status);
    check('(1) 第一次 log cache=miss', /cache=miss/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    const body1 = await r1.text();

    // URL 續期:youtube_id 一樣,resolveAudioUrl 而家指去另一條 url(fileA-renewed),
    // 但 clen 一樣(5000000)——應該命中,唔應該重新解 sidx。
    resolveTable.set('yt-a', `${MOCK_BASE}/fileA-renewed`);
    const beforeHit = hitCounts['fileA-renewed'];
    const before403 = opsMetrics.getOpsMetrics().total.upstream403;
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const body2 = await r2.text();
    check('(1) 第二次(URL 續期,clen 一樣)200', r2.status === 200, r2.status);
    check('(1) 第二次 log cache=hit', /cache=hit/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    check('(1) playlist body 前後一致(byte-for-byte)', body1 === body2, { body1, body2 });
    check('(1) 命中之下淨係打咗一次 fileA-renewed(bytes=0-0 校驗 fallback,URL 冇 clen),冇再做完整 escalating fetch', hitCounts['fileA-renewed'] - beforeHit === 1, hitCounts['fileA-renewed'] - beforeHit);
    const after = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    check('(1) opsMetrics miss+1 hit+1', (after.miss - before.miss) === 1 && (after.hit - before.hit) === 1, { before, after });
    const after403 = opsMetrics.getOpsMetrics().total.upstream403;
    check(`(1) FIRST-TRACK-STEP01-FIX §細項:verifyClenMatches fallback 都會計 upstream403.hlsTotal(實測 +${after403.hlsTotal - before403.hlsTotal})`, (after403.hlsTotal - before403.hlsTotal) === 1, { before403, after403 });
    appServer.close();
  }

  // ============ (1c) FIRST-TRACK-STEP01-FIX #2:URL 帶 clen —— 免費(零上游
  // 請求)校驗,命中 ms≈0 ============
  {
    const urlClenCacheFile = path.join(SCRATCH_DIR, 'cache-urlclen.json');
    try { fs.unlinkSync(urlClenCacheFile); } catch (_) {} // 上一次跑呢個 harness 留低嘅碟,唔清會令「第一次」變咗「由碟載返嘅 hit」
    const { HYMN_TABLE, appServer, APP_BASE } = await freshHlsApp(urlClenCacheFile);
    const id = 2005;
    HYMN_TABLE.set(id, 'yt-d');
    resolveTable.set('yt-d', `${MOCK_BASE}/fileD?itag=140&clen=6000000`);
    const r1 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(1c) 第一次 200', r1.status === 200, r1.status);
    check('(1c) 第一次 cache=miss', /cache=miss/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));

    // URL 續期:新 URL 唔同(fileD-renewed),但 query string 本身帶住同一個
    // clen/itag——應該命中,而且**零**上游請求(唔使打 fileD-renewed 都知一致)。
    resolveTable.set('yt-d', `${MOCK_BASE}/fileD-renewed?itag=140&clen=6000000`);
    const beforeHit = hitCounts['fileD-renewed'] || 0;
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(1c) 第二次 200', r2.status === 200, r2.status);
    check('(1c) 第二次 cache=hit', /cache=hit/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    check(`(1c) URL clen 離線校驗——零上游請求(實測 fileD-renewed 被打咗 ${hitCounts['fileD-renewed'] - beforeHit} 次)`, (hitCounts['fileD-renewed'] - beforeHit) === 0, hitCounts['fileD-renewed'] - beforeHit);
    const hlsLog = lastHlsLogFor(id);
    const msMatch = hlsLog && /ms=(\d+)/.exec(hlsLog);
    check(`(1c) 命中 ms 極細(<20ms,冇網絡 round trip,實測「${hlsLog}」)`, !!msMatch && Number(msMatch[1]) < 20, hlsLog);
    appServer.close();
  }

  // ============ (1d) URL clen 唔同 → verifyfail(離線就判斷到,唔使打先知)==
  {
    const urlClenMismatchFile = path.join(SCRATCH_DIR, 'cache-urlclen-mismatch.json');
    try { fs.unlinkSync(urlClenMismatchFile); } catch (_) {}
    const { HYMN_TABLE, appServer, APP_BASE, opsMetrics } = await freshHlsApp(urlClenMismatchFile);
    const id = 2006;
    HYMN_TABLE.set(id, 'yt-e');
    resolveTable.set('yt-e', `${MOCK_BASE}/fileA?itag=140&clen=5000000`);
    await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    // 換 format:新 URL clen(同 itag)都唔同(fileB=9,999,999/itag=251)。
    resolveTable.set('yt-e', `${MOCK_BASE}/fileB?itag=251&clen=9999999`);
    const before = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const after = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    check('(1d) 200', r2.status === 200, r2.status);
    check('(1d) log cache=verifyfail(URL clen 離線判斷已經偵測到,唔使打 googlevideo 先知)', /cache=verifyfail/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    check('(1d) opsMetrics verifyFail+1', (after.verifyFail - before.verifyFail) === 1, { before, after });
    appServer.close();
  }

  // ============ (1e) FIRST-TRACK-STEP01-FIX §細項:flush 亦喺 verifyfail
  // 重解後排隊(即使嗰次重解本身失敗)============
  {
    const flushCacheFile = path.join(SCRATCH_DIR, 'cache-flush-on-verifyfail.json');
    try { fs.unlinkSync(flushCacheFile); } catch (_) {}
    const { HYMN_TABLE, appServer, APP_BASE } = await freshHlsApp(flushCacheFile);
    const id = 2007;
    HYMN_TABLE.set(id, 'yt-f');
    resolveTable.set('yt-f', `${MOCK_BASE}/fileA?itag=140&clen=5000000`);
    await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    await new Promise((r) => setTimeout(r, 5500)); // 等第一次(成功)flush 落碟做基準
    const onDiskBefore = JSON.parse(fs.readFileSync(flushCacheFile, 'utf8'));
    // ⚠️ playlistCache 個 key 係 youtubeId(`yt-f`),唔係 DB hymn id(2007)。
    check(`(1e) 基準:第一次(成功)flush 咗落碟,yt-f 存在`, !!onDiskBefore['yt-f'], onDiskBefore);

    // 換 format(clen 唔夾)→ verifyfail;新 URL 指去 /deadend(一律 500),
    // 令重解都失敗(structure 保持 null)。
    resolveTable.set('yt-f', `${MOCK_BASE}/deadend?itag=999&clen=1`);
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(1e) verifyfail 之後重解失敗 → 404', r2.status === 404, r2.status);
    check('(1e) log cache=verifyfail', /cache=verifyfail/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));

    await new Promise((r) => setTimeout(r, 5500)); // 等第二次 flush(由 verifyfail 嘅 delete 觸發,唔係由「成功寫新 structure」觸發)
    const onDiskAfter = JSON.parse(fs.readFileSync(flushCacheFile, 'utf8'));
    check(`(1e) 即使重解失敗,verifyfail 嘅 delete 都已經落實到碟(yt-f 唔喺碟上,實測 ${JSON.stringify(Object.keys(onDiskAfter))})`, !onDiskAfter['yt-f'], onDiskAfter);
    appServer.close();
  }

  // ============ (2) clen 唔夾 → verifyfail → 重解 ============
  {
    const { HYMN_TABLE, appServer, APP_BASE, opsMetrics } = await freshHlsApp(CACHE_FILE);
    const id = 2002;
    HYMN_TABLE.set(id, 'yt-b');
    resolveTable.set('yt-b', `${MOCK_BASE}/fileA`);
    const r1 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(2) 第一次 200', r1.status === 200, r1.status);
    // ⚠️ fixture A/B 嘅 moov 大細特登整到一樣(人手砌嘅 fixture,唔係真實
    // 檔案),initSize 唔係一個可靠嘅「結構變咗」訊號——用 segBytes/segment
    // 數(refs)嚟核對,呢兩個先真係跟住 fileB 個 sidx 內容變。
    const segBytes1 = (await r1.text()).match(/#EXT-X-BYTERANGE:(\d+)@/g)?.reduce((s, x) => s + Number(x.match(/\d+/)[0]), 0);

    // 換咗 format(fileB,clen 完全唔同)——校驗應該偵測到,行 verifyfail → 重解,
    // 結構應該變返做 fileB 嘅結構(segment 數/segBytes 唔同)。
    resolveTable.set('yt-b', `${MOCK_BASE}/fileB`);
    const before = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const after = opsMetrics.getOpsMetrics().total.hlsPlaylist;
    check('(2) 換 format 之後 200', r2.status === 200, r2.status);
    check('(2) log cache=verifyfail', /cache=verifyfail/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    check('(2) opsMetrics verifyFail+1', (after.verifyFail - before.verifyFail) === 1, { before, after });
    const body2 = await r2.text();
    const segBytes2 = body2.match(/#EXT-X-BYTERANGE:(\d+)@/g)?.reduce((s, x) => s + Number(x.match(/\d+/)[0]), 0);
    const segCount2 = (body2.match(/#EXTINF:/g) || []).length;
    check(`(2) 重解之後結構變返做 fileB(segBytes ${segBytes1} → ${segBytes2}，segCount=${segCount2}），證明冇繼續用舊(錯)結構`, segBytes2 === 999000 && segCount2 === 1 && segBytes1 !== segBytes2, { segBytes1, segBytes2, segCount2 });
    appServer.close();
  }

  // ============ (2b) VERIFY=0 mode:同一情況唔校驗,繼續用返舊(錯)結構 ==========
  {
    process.env.HLS_PLAYLIST_VERIFY = '0';
    const noverifyCacheFile = path.join(SCRATCH_DIR, 'cache-noverify.json');
    try { fs.unlinkSync(noverifyCacheFile); } catch (_) {}
    const { HYMN_TABLE, appServer, APP_BASE } = await freshHlsApp(noverifyCacheFile);
    const id = 2003;
    HYMN_TABLE.set(id, 'yt-c');
    resolveTable.set('yt-c', `${MOCK_BASE}/fileA`);
    const r1 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    const segBytes1 = (await r1.text()).match(/#EXT-X-BYTERANGE:(\d+)@/g)?.reduce((s, x) => s + Number(x.match(/\d+/)[0]), 0);
    resolveTable.set('yt-c', `${MOCK_BASE}/fileB`); // 換咗 format,但 VERIFY=0 唔應該偵測到
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(2b) VERIFY=0 之下 log 仍然 cache=hit(冇做校驗)', /cache=hit/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    const segBytes2 = (await r2.text()).match(/#EXT-X-BYTERANGE:(\d+)@/g)?.reduce((s, x) => s + Number(x.match(/\d+/)[0]), 0);
    check(`(2b) VERIFY=0 之下繼續用返舊(過時)結構(segBytes 一樣 ${segBytes1}==${segBytes2},冇跟住 fileB 變,佐證真係跳過咗校驗)`, segBytes1 === segBytes2, { segBytes1, segBytes2 });
    delete process.env.HLS_PLAYLIST_VERIFY;
    appServer.close();
  }

  // ============ (3) restart(重新 import module)後由 json 載返命中 ==========
  {
    const restartCacheFile = path.join(SCRATCH_DIR, 'cache-restart.json');
    try { fs.unlinkSync(restartCacheFile); } catch (_) {}
    let app1 = await freshHlsApp(restartCacheFile);
    const id = 2004;
    app1.HYMN_TABLE.set(id, 'yt-d');
    resolveTable.set('yt-d', `${MOCK_BASE}/fileA`);
    await fetch(`${app1.APP_BASE}/api/stream/${id}.m3u8`);
    app1.appServer.close();
    // 等 debounce flush(5s)完成先「restart」。
    await new Promise((r) => setTimeout(r, 5500));
    check('(3) flush 咗落碟', fs.existsSync(restartCacheFile) && JSON.parse(fs.readFileSync(restartCacheFile, 'utf8'))['yt-d'], fs.existsSync(restartCacheFile));

    const app2 = await freshHlsApp(restartCacheFile);
    app2.HYMN_TABLE.set(id, 'yt-d');
    resolveTable.set('yt-d', `${MOCK_BASE}/fileA-renewed`); // 模擬 restart 之間 URL 又續期咗
    const beforeHit = hitCounts['fileA-renewed'];
    const r = await fetch(`${app2.APP_BASE}/api/stream/${id}.m3u8`);
    check('(3) 「restart」之後第一個 request 就 cache=hit(由碟載返)', /cache=hit/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    check('(3) 200', r.status === 200, r.status);
    app2.appServer.close();
  }

  // ============ (4) LRU 上限 ============
  {
    const lruCacheFile = path.join(SCRATCH_DIR, 'cache-lru.json');
    try { fs.unlinkSync(lruCacheFile); } catch (_) {}
    const { HYMN_TABLE, appServer, APP_BASE, hlsMod } = await freshHlsApp(lruCacheFile, 3);
    const ids = [3001, 3002, 3003, 3004];
    for (const id of ids) {
      HYMN_TABLE.set(id, `yt-lru-${id}`);
      resolveTable.set(`yt-lru-${id}`, `${MOCK_BASE}/fileA`);
      await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    }
    check(`(4) LRU 上限=3 之下,playlistCacheSize 冇超過 3(實測 ${hlsMod.getPlaylistCacheSize()})`, hlsMod.getPlaylistCacheSize() <= 3, hlsMod.getPlaylistCacheSize());
    // 最舊嗰個(3001)應該俾踢咗,再攞應該 miss。
    const r = await fetch(`${APP_BASE}/api/stream/3001.m3u8`);
    check('(4) 俾踢走嗰個(id=3001)再攞 → cache=miss', /cache=miss/.test(lastHlsLogFor(3001) || ''), lastHlsLogFor(3001));
    appServer.close();
  }

  // ============ (5) TTL 過期 ============
  {
    const ttlCacheFile = path.join(SCRATCH_DIR, 'cache-ttl.json');
    try { fs.unlinkSync(ttlCacheFile); } catch (_) {}
    const { HYMN_TABLE, appServer, APP_BASE } = await freshHlsApp(ttlCacheFile, null, 200); // 200ms TTL
    const id = 4001;
    HYMN_TABLE.set(id, 'yt-ttl');
    resolveTable.set('yt-ttl', `${MOCK_BASE}/fileA`);
    await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(5) 第一次(冇快取)係 cache=miss,做基準', /cache=miss/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    await new Promise((r) => setTimeout(r, 350));
    const r2 = await fetch(`${APP_BASE}/api/stream/${id}.m3u8`);
    check('(5) TTL 過咗之後 → cache=miss(冇繼續當 hit)', /cache=miss/.test(lastHlsLogFor(id) || ''), lastHlsLogFor(id));
    appServer.close();
  }

  console.log = origLog;
  server.close();
  console.log(`\nH1(N1 playlistCache): ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('H1 harness 本身炸咗:', e);
  process.exit(2);
});
