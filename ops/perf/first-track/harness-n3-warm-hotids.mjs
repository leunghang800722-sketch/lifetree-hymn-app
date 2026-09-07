#!/usr/bin/env node
// ops/perf/first-track/harness-n3-warm-hotids.mjs
// FIRST-TRACK-STEP01-EXEC-20260907 §3 H2 —— N3(`lib/hotIds.js` + `/warm`
// 補位邏輯)嘅 harness。
//
// Part 1:直接 unit test `backend/lib/hotIds.js`(UA 過濾、去重、排序、
// 5,000 上限)——完全唔使起 server。
// Part 2:起真身 `backend/routes/stream.js`(`resolveAudioUrl`/`warmLog.js`
// 兩個 import 用 ESM loader hook 換做可控 stub,`getDb` 用 mock),測
// `/warm` 嘅「client 名單 + backend 熱門補位」邏輯 + `anyStreaming()` 讓路。
//
// 零改動任何 production 檔案:`HOT_IDS_FILE` 指去 scratch,`HOT_IDS_DEDUP_MS`
// 縮短(純測試用),`warmLog.js` 完全俾 stub 頂替(唔會掂
// `backend/data/warm-daily.json`)。
'use strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
const SCRATCH_DIR = path.join(__dirname, '.scratch-n3');
fs.mkdirSync(SCRATCH_DIR, { recursive: true });
const HOT_IDS_FILE = path.join(SCRATCH_DIR, 'hot-ids.json');
try { fs.unlinkSync(HOT_IDS_FILE); } catch (_) {}

process.env.HOT_IDS_FILE = HOT_IDS_FILE;
process.env.HOT_IDS_DEDUP_MS = '20'; // 純測試:縮短去重窗口,唔使真係等 60 秒

register(pathToFileURL(path.join(__dirname, 'resolve-audio-stub-loader-stream.mjs')));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const hotIds = await import(pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'hotIds.js')).href);

  // ============ Part 1:hotIds.js 純 unit test ============
  console.log('\n== Part 1: lib/hotIds.js ==');

  // (1) UA 過濾:curl 唔計入。
  hotIds.recordStreamHit('9001', 'curl/8.7.1');
  check('(1) curl UA 唔算數(isSyntheticUa=true)', hotIds.isSyntheticUa('curl/8.7.1') === true);
  check('(1) curl 嘅 hit 冇被計落 hotIds(9001 唔出現)', !hotIds.getHotIds(9999).includes('9001'));

  // (2) 去重:同一 id 短時間內連環 hit,淨計一次;隔咗 dedup 窗口先再計。
  hotIds.recordStreamHit('9002', 'AppleCoreMedia/1.0');
  hotIds.recordStreamHit('9002', 'AppleCoreMedia/1.0'); // 即刻再嚟,應該去重
  hotIds.recordStreamHit('9003', 'ExoPlayerLib/2.19');  // 得一個 id,得一次 hit
  await sleep(30); // 過咗 HOT_IDS_DEDUP_MS(20ms)
  hotIds.recordStreamHit('9002', 'AppleCoreMedia/1.0'); // 9002 而家應該有 2 次 hit,9003 得 1 次
  const top2 = hotIds.getHotIds(2);
  check(`(2) 排序:9002(2 hit)行喺 9003(1 hit)之前，實測 [${top2.join(',')}]`, top2[0] === '9002' && top2[1] === '9003', top2);

  // (3) 5,000 上限:塞爆佢,確認格數封頂 + 最舊嘅俾踢走。
  for (let i = 1; i <= 5010; i++) {
    hotIds.recordStreamHit(`cap-test-${i}`, 'ExoPlayerLib/2.19');
  }
  const trackedCount = hotIds.getHotIdsTrackedCount();
  check(`(3) 追蹤格數封頂 ≤5000(實測 ${trackedCount})`, trackedCount <= 5000, trackedCount);
  const allIds = hotIds.getHotIds(10000);
  check('(3) 最舊嘅(cap-test-1)已經俾踢走', !allIds.includes('cap-test-1'));
  check('(3) 最新嘅(cap-test-5010)仲喺度', allIds.includes('cap-test-5010'));

  // ============ Part 2:routes/stream.js `/warm` 補位邏輯 ============
  console.log('\n== Part 2: routes/stream.js /warm ==');

  const HYMN_TABLE = new Map(); // id -> { youtube_id, duration }
  function makeMockDb() {
    return {
      prepare(sql) {
        return {
          _id: null,
          bind(p) { this._id = p[0]; },
          step() { return HYMN_TABLE.has(this._id); },
          getAsObject() { const r = HYMN_TABLE.get(this._id); return { youtube_id: r?.youtube_id, duration: r?.duration }; },
          free() {},
        };
      },
    };
  }
  async function getDb() { return makeMockDb(); }

  globalThis.__h2MockResolveAudioUrl = async (id) => `https://mock.googlevideo.example/${id}`;

  const streamModUrl = pathToFileURL(path.join(BACKEND_ROOT, 'routes', 'stream.js')).href;
  const streamMod = await import(streamModUrl);
  const expressUrl = pathToFileURL(path.join(BACKEND_ROOT, 'node_modules', 'express', 'index.js')).href;
  const { default: express } = await import(expressUrl);

  const app = express();
  app.use(express.json());
  app.use('/api/stream', streamMod.default(getDb));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const APP_BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`[stream route app] 監聽 ${APP_BASE}`);

  // 準備 6 個 client id + 10 個「熱門」id(靠 hotIds.recordStreamHit 谷 count=3,
  // 確保贏晒 Part 1 留低嘅雜訊 9002/9003/cap-test-*,個個都得 1-2 hit)。
  const clientIds = [101, 102, 103, 104, 105, 106];
  const hotOnlyIds = [201, 202, 203, 204, 205, 206, 207, 208, 209, 210];
  for (const id of [...clientIds, ...hotOnlyIds]) HYMN_TABLE.set(id, { youtube_id: `yt-${id}`, duration: '3:30' });
  for (const id of hotOnlyIds) {
    for (let i = 0; i < 3; i++) {
      hotIds.recordStreamHit(String(id), 'AppleCoreMedia/1.0');
      await sleep(30);
    }
  }
  // 106 同時係 client 名單入面又係「熱門」——驗證去重(唔會俾補位嗰邊再加一次)。
  for (let i = 0; i < 3; i++) { hotIds.recordStreamHit('106', 'AppleCoreMedia/1.0'); await sleep(30); }

  const logLines = [];
  const origLog = console.log;
  console.log = (...args) => { logLines.push(args.join(' ')); origLog(...args); };

  globalThis.__h2AnyStreaming = false;
  const r1 = await fetch(`${APP_BASE}/api/stream/warm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: clientIds }),
  });
  const body1 = await r1.json();
  check('(4) /warm 202', r1.status === 202, r1.status);
  check(`(4) client=6 + hot 補到 16(實測 warming=${body1.warming})`, body1.warming === 16, body1);
  const warmLogLine = logLines.slice().reverse().find((l) => l.startsWith('[warm]'));
  check(`(4) log 行 client=6 hot=10 total=16(實測「${warmLogLine}」)`, /client=6 hot=10 total=16/.test(warmLogLine || ''), warmLogLine);
  check('(4) 106(client 兼熱門)冇被去重漏檢:client 名單本身已經帶佢,補位唔應該再計多次(warming 數啱 = 6+10 冇多computed)', body1.warming === clientIds.length + hotOnlyIds.length);

  await sleep(150); // 俾背景 fire-and-forget loop 有時間行
  check(`(4) anyStreaming=false 之下 warmBuffer 真係俾 call 過(實測 ${(globalThis.__h2WarmBufferCalls || []).length} 次)`, (globalThis.__h2WarmBufferCalls || []).length > 0, globalThis.__h2WarmBufferCalls);
  check('(4) recordWarmIds 淨係收到 client 原裝 6 個 id(唔連熱門補位)', JSON.stringify(globalThis.__h2RecordWarmIdsCalls?.[0]) === JSON.stringify(clientIds), globalThis.__h2RecordWarmIdsCalls);

  // ============ (5) anyStreaming() 讓路照舊:true 之下 warmBuffer 一次都唔應該 fire ============
  globalThis.__h2WarmBufferCalls = [];
  globalThis.__h2AnyStreaming = true;
  const r2 = await fetch(`${APP_BASE}/api/stream/warm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [102] }),
  });
  await r2.json();
  await sleep(150);
  check(`(5) anyStreaming=true 之下 warmBuffer 一次都冇 fire(實測 ${(globalThis.__h2WarmBufferCalls || []).length} 次)`, (globalThis.__h2WarmBufferCalls || []).length === 0, globalThis.__h2WarmBufferCalls);
  globalThis.__h2AnyStreaming = false;

  console.log = origLog;
  server.close();

  console.log(`\nH2(N3 hotIds+warm): ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('H2 harness 本身炸咗:', e);
  process.exit(2);
});
