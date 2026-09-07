#!/usr/bin/env node
// ops/perf/first-track/harness-n5-buffercache-pinned.mjs
// FIRST-TRACK-STEP01-EXEC-20260907 §3 H3 —— N5(`lib/resolveAudio.js`
// bufferCache pinned 熱池)嘅 harness。
//
// 直接 import 真身 `backend/lib/resolveAudio.js`(冇 stub——`warmBuffer()`
// 淨係要一個 URL 就得,完全唔行 yt-dlp/`resolveAudioUrl()` 嗰條路,測呢個
// module 唔需要任何網絡 mock 之外嘅嘢)。「googlevideo」由本機 mock http
// server 扮演。**唔會掂 production 嘅 `backend/cache/resolve-cache.json`**
// ——呢度完全唔 call `resolveAudioUrl`/`refreshAudioUrl`(淨係嗰兩個 call
// 先會觸發寫入),`loadCacheFromDisk()` 開機讀一次係唯一接觸,純讀唔寫。
'use strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

function makeRangeEndpoint(fixtureBuf, totalLen) {
  return (req, res) => {
    const rangeHeader = req.headers.range || 'bytes=0-';
    const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    const start = m ? Number(m[1]) : 0;
    const endReq = m && m[2] ? Number(m[2]) : totalLen - 1;
    const end = Math.min(endReq, totalLen - 1);
    const sliceEnd = Math.min(end + 1, fixtureBuf.length);
    const body = start < fixtureBuf.length ? fixtureBuf.subarray(start, sliceEnd) : Buffer.alloc(0);
    res.writeHead(206, { 'Content-Type': 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${totalLen}` });
    res.end(body);
  };
}

async function main() {
  const SMALL_FILE_BYTES = 300 * 1000; // 300KB,細過任何 cap,warmBuffer 攞一次就係成個「檔」
  const smallFixture = Buffer.alloc(SMALL_FILE_BYTES, 7);
  const routes = {};
  const server = http.createServer((req, res) => {
    const handler = routes[req.url.split('?')[0]];
    if (handler) return handler(req, res);
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const MOCK_BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`[mock googlevideo] 監聽 ${MOCK_BASE}`);

  const mod = await import(pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'resolveAudio.js')).href);
  const { setPinnedIds, getPinnedIds, warmBuffer, getBufferedChunk, evictBufferedChunk, getBufferCacheStats } = mod;

  // ============ (1) PINNED_MAX_COUNT 硬 clamp(spec:64MB/4MB=16)==========
  const tooMany = Array.from({ length: 30 }, (_, i) => `pin-clamp-${i}`);
  setPinnedIds(tooMany);
  check(`(1) setPinnedIds(30 個)硬 clamp 喺 16(實測 ${getPinnedIds().size})`, getPinnedIds().size === 16, getPinnedIds().size);
  setPinnedIds([]); // 清返,俾之後嘅 test 唔受污染

  // ============ (2) pinned id 入池一律 head-only(4MB cap),唔理 duration ==========
  {
    routes['/big'] = makeRangeEndpoint(smallFixture, SMALL_FILE_BYTES);
    const yt = 'yt-n5-pinned-a';
    setPinnedIds([yt]);
    // durationSec 傳一個好短嘅歌(遠細過 LONG_TRACK_SECONDS=600),普通嚟講
    // 應該用 WARM_CAP_BYTES(12MB)——但呢個 id 係 pinned,應該強制用
    // LONG_WARM_CAP_BYTES(4MB)。呢個 fixture 淨係 300KB(細過兩個 cap),
    // 冇得直接由攞落嚟嘅 bytes 分辨用邊個 cap——用一個獨立方法驗證:
    // fetch mock 記低實際收到嘅 Range header 上限,睇 warmBuffer 實際
    // 開嘅 Range 上限係咪 4MB(LONG_WARM_CAP_BYTES-1)。
    let capturedRangeEnd = null;
    routes['/capture'] = (req, res) => {
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
      capturedRangeEnd = m && m[2] ? Number(m[2]) : null;
      makeRangeEndpoint(smallFixture, SMALL_FILE_BYTES)(req, res);
    };
    await warmBuffer(yt, `${MOCK_BASE}/capture`, 60 /* 短歌,60秒 */);
    check(`(2) pinned id 用 LONG_WARM_CAP_BYTES(4MB-1=4194303)做 Range 上限,實測 requested end=${capturedRangeEnd}`, capturedRangeEnd === 4 * 1024 * 1024 - 1, capturedRangeEnd);
    const c = getBufferedChunk(yt, `${MOCK_BASE}/capture`);
    check('(2) pinned id 真係入咗 bufferCache', !!c, c);
    evictBufferedChunk(yt);
    setPinnedIds([]);
  }

  // ============ (3) bufferCacheTotalBytes 記帳前後一致(加/減/pin/unpin)========
  // ⚠️ 順序刻意排喺「(4) LRU 淹沒測試」之前:bufferCache 呢一刻應該淨係得
  // test (2) 用完即刻 evict 咗嗰個殘留(= 空),要喺乾淨基準先做「加一個 entry
  // 升幾多」呢類絕對數值斷言,唔係跌落一個已經俾 40 格上限封頂嘅狀態
  // (嗰種狀態加一個會即刻連帶 evict 走一個舊嘅,淨變化變咗 0,唔係 bug,
  // 但會誤導呢條斷言)。
  {
    // W1/W2 教訓(project-w1w2-two-silent-bugs.md):`getBufferedChunk()`
    // expiresAt/url 唔 match 嗰條路一定要用 `evictBufferedChunk()` 扣返
    // bytes,唔可以直接 `bufferCache.delete()`——呢度用「總 bytes 加減對
    // 得上」做直接證據,唔淨係睇有冇拋錯。
    routes['/acct'] = makeRangeEndpoint(smallFixture, SMALL_FILE_BYTES);
    const before = getBufferCacheStats().totalBytes;
    const yt = 'yt-n5-acct-1';
    await warmBuffer(yt, `${MOCK_BASE}/acct`, 60);
    const afterAdd = getBufferCacheStats().totalBytes;
    check(`(3) 加一個 entry 之後 totalBytes 升咗 ${SMALL_FILE_BYTES}(實測 ${afterAdd - before})`, (afterAdd - before) === SMALL_FILE_BYTES, { before, afterAdd });
    // url 唔 match(模擬 URL 續期但 buffer 仲係舊嗰份)嘅 miss 路徑——
    // getBufferedChunk 入面應該行 evictBufferedChunk(),扣返 bytes。
    const missed = getBufferedChunk(yt, `${MOCK_BASE}/acct?renewed=1`); // 唔同 url
    const afterMiss = getBufferCacheStats().totalBytes;
    check('(3) url 唔 match 嗰次 getBufferedChunk() 回 null', missed === null, missed);
    check(`(3) url 唔 match 觸發嘅 evict 已經扣返 bytes(afterMiss ${afterMiss} 應該跌返做 ${before})`, afterMiss === before, { before, afterMiss });
    // pin/unpin 本身唔應該直接改 totalBytes(pinned 純粹係「唔踢」旗標,
    // 唔係一種入池動作)。
    setPinnedIds([yt]);
    const afterPin = getBufferCacheStats().totalBytes;
    check('(3) pin 一個唔存在(已經俾上面 evict 咗)嘅 id,totalBytes 唔變', afterPin === before, { before, afterPin });
    setPinnedIds([]);
    const afterUnpin = getBufferCacheStats().totalBytes;
    check('(3) unpin 之後 totalBytes 都唔變', afterUnpin === before, { before, afterUnpin });
  }

  // ============ (4) pinned 唔被 evict、非 pinned 照 LRU ============
  {
    const NORMAL_COUNT = 39; // + 1 pinned = 40,啱啱撞 MAX_BUFFER_ENTRIES=40
    const pinnedYt = 'yt-n5-lru-pinned';
    routes['/lru'] = makeRangeEndpoint(smallFixture, SMALL_FILE_BYTES);
    setPinnedIds([pinnedYt]);
    // pinned 個先入池(最舊,理論上第一個俾 plain LRU 踢)。
    await warmBuffer(pinnedYt, `${MOCK_BASE}/lru?id=pinned`, 60);
    check('(4) pinned 個已經入咗 bufferCache', !!getBufferedChunk(pinnedYt, `${MOCK_BASE}/lru?id=pinned`));
    // 之後灌 41 個普通 id(39+2,確保總數超過 40,逼 eviction 真係 fire)。
    for (let i = 0; i < NORMAL_COUNT + 2; i++) {
      const yt = `yt-n5-lru-normal-${i}`;
      await warmBuffer(yt, `${MOCK_BASE}/lru?id=${i}`, 60);
    }
    const stats = getBufferCacheStats();
    check(`(4) bufferCache 格數封頂 ≤40(實測 ${stats.entries})`, stats.entries <= 40, stats);
    check('(4) pinned 個(最舊)完全冇被踢走', !!getBufferedChunk(pinnedYt, `${MOCK_BASE}/lru?id=pinned`));
    // 最早入嘅幾個普通 id(id=0)應該已經俾 LRU 踢走(pinned 霸住咗一個位,
    // 令普通 id 嘅有效上限變咗 39 格,理應踢走最早嗰幾個)。
    check('(4) 最早入嘅普通 id(id=0)已經俾 LRU 踢走', !getBufferedChunk('yt-n5-lru-normal-0', `${MOCK_BASE}/lru?id=0`));
    check('(4) 最新入嘅普通 id 仲喺度', !!getBufferedChunk(`yt-n5-lru-normal-${NORMAL_COUNT + 1}`, `${MOCK_BASE}/lru?id=${NORMAL_COUNT + 1}`));
    setPinnedIds([]);
  }

  server.close();
  console.log(`\nH3(N5 bufferCache pinned): ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('H3 harness 本身炸咗:', e);
  process.exit(2);
});
