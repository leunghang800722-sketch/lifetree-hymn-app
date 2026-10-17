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

  // ============ (4) FIRST-TRACK-STEP01-FIX #5:isStart gating ============
  // 淨係「起播」(冇 Range 或 Range 由 0 開始)先算一次「開歌」,中段續播
  // range(isStart=false)一律唔計。
  {
    hotIds.recordStreamHit('9101', 'AppleCoreMedia/1.0', { isStart: false, clientKey: 'ip1|ua1' });
    check('(4) isStart=false(中段續播)唔算開歌,9101 完全冇入 hotIds', !hotIds.getHotIds(99999).includes('9101'));
    hotIds.recordStreamHit('9101', 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'ip1|ua1' });
    check('(4) isStart=true(真正起播)先真係計落,9101 而家出現', hotIds.getHotIds(99999).includes('9101'));
  }

  // ============ (5) 連播 14 分鐘只計 1 次 vs 開 3 次計 3 次(Opus P2-5 修正)========
  // 舊版「同一 DB id 隔咗去重窗口先再嚟嘅第一個 request 先算一次」變咗
  // 「每隔一個窗口 +1」,持續播放愈耐計愈多。而家淨係「起播」先計——一首
  // 歌連續播 14 分鐘,中間 AVPlayer 打嘅全部係非起播 range(isStart=false),
  // 應該全程只計 1 次(下面用 20 條 isStart=false 嘅「續播」request 模擬
  // 呢 14 分鐘);相對地,用戶真係分開三次開返同一首歌(isStart=true,
  // 用 sleep 隔開 dedup 窗口代表「相隔夠耐先算另一次」),就應該計 3 次。
  {
    // 「連播 14 分鐘」:1 個起播 + 20 條非起播續播 range,全部同一 client。
    hotIds.recordStreamHit('9102', 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'ip2|ua2' });
    for (let i = 0; i < 20; i++) {
      hotIds.recordStreamHit('9102', 'AppleCoreMedia/1.0', { isStart: false, clientKey: 'ip2|ua2' });
    }
    // 對照組:「開 3 次」——3 個獨立起播,用 sleep(30ms > HOT_IDS_DEDUP_MS=20ms)
    // 隔開,確保唔會俾去重窗口吞埋。
    for (let i = 0; i < 3; i++) {
      hotIds.recordStreamHit('9103', 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'ip3|ua3' });
      await sleep(30);
    }
    const top = hotIds.getHotIds(99999);
    const rank9102 = top.indexOf('9102');
    const rank9103 = top.indexOf('9103');
    check(`(5) 連播 14 分鐘(1 次)嘅 9102 都有入榜(實測 rank=${rank9102})`, rank9102 !== -1, top);
    check(`(5) 開 3 次嘅 9103 都有入榜(實測 rank=${rank9103})`, rank9103 !== -1, top);
    check(`(5) 開 3 次(9103)嘅次數多過連播 14 分鐘只計 1 次嘅(9102)——排名 9103 行喺 9102 之前(實測 [${top.slice(0, 6).join(',')}])`, rank9103 !== -1 && rank9102 !== -1 && rank9103 < rank9102, { rank9102, rank9103, top: top.slice(0, 6) });
  }

  // ============ (6) key 一律 String(id)——跨「restart」唔會分裂 ============
  // FIRST-TRACK-STEP01-FIX #4(Opus P2-4 修正):caller 傳嘅 hymnId 係
  // `Number(req.params.hymnId)`,但由碟載返嘅 entry key 一定係 string。
  // 模擬:用 Number 型別 call 一次、flush 落碟、「restart」(cache-busted
  // 重新 import,module-level `loadFromDisk()` 重新行一次)、再用另一個
  // client 打多一次同一個 Number id——應該仍然係**同一條**記錄(唔會
  // 1550/"1550" 分裂做兩條)。
  {
    hotIds.recordStreamHit(1550, 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'ipR1|uaR1' });
    check('(6) restart 之前:1550(Number)已經記落(hotIds 入面攞到嘅係 string "1550")', hotIds.getHotIds(99999).includes('1550'));
    await new Promise((r) => setTimeout(r, 5500)); // 等 debounce flush(5s)完成
    check('(6) flush 咗落碟(v2 格式)', (() => {
      try {
        const onDisk = JSON.parse(fs.readFileSync(HOT_IDS_FILE, 'utf8'));
        return onDisk.v === 2 && Array.isArray(onDisk.hits?.['1550']);
      } catch (_) { return false; }
    })());

    // 「restart」:cache-busted 重新 import,module-level loadFromDisk() 重新行一次。
    const hotIds2Url = pathToFileURL(path.join(BACKEND_ROOT, 'lib', 'hotIds.js')).href + `?n3restart=${Date.now()}-${Math.random()}`;
    const hotIds2 = await import(hotIds2Url);
    const afterRestartIds = hotIds2.getHotIds(99999);
    check(`(6) restart 之後由碟載返,1550 仲喺度(實測 [${afterRestartIds.filter((x) => String(x) === '1550').join(',')}])`, afterRestartIds.includes('1550'), afterRestartIds);
    // 再用第二個 client 打多一次同一個 Number id——如果 key 冇 String() 化,
    // 呢個 module instance 入面而家會有一條 `1550`(碟載返,string)+一條
    // 新嘅 number 型別 key,`getHotIds()` 會出現重複。
    hotIds2.recordStreamHit(1550, 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'ipR2|uaR2' });
    const afterSecondHit = hotIds2.getHotIds(99999);
    const occurrences = afterSecondHit.filter((x) => String(x) === '1550').length;
    check(`(6) 兩個 client 打同一個 Number id,冇分裂成兩條記錄(實測出現 ${occurrences} 次,應該係 1)`, occurrences === 1, afterSecondHit);
  }

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
  // 確保贏晒 Part 1 留低嘅雜訊 9002/9003/9101-9103/cap-test-*,個個都得 1-3 hit)。
  // FIRST-TRACK-STEP01-FIX #6(Opus P2-6 修正)——WARM_TOTAL_CAP 執行單原文
  // 16 收窄做 10:16 個 id 每個最壞 12MB = 192MB upstream fetch,遠超 128MB
  // bufferCache 閘,而且排喺頭嗰批(client、非 pinned)反而俾之後 hot 補位
  // 嗰批擠走。下面 hotOnlyIds 仍然攞 10 個(舊執行單數字)—— 淨係首 4 個會
  // 真正俾補落去(client=6 + hot=4 = 10),用嚟證明「補到總數封頂就唔再補」
  // 呢個邏輯,唔係話 10 個全部都會用到。
  const clientIds = [101, 102, 103, 104, 105, 106];
  const hotOnlyIds = [201, 202, 203, 204, 205, 206, 207, 208, 209, 210];
  for (const id of [...clientIds, ...hotOnlyIds]) HYMN_TABLE.set(id, { youtube_id: `yt-${id}`, duration: '3:30' });
  for (const id of hotOnlyIds) {
    for (let i = 0; i < 3; i++) {
      hotIds.recordStreamHit(String(id), 'AppleCoreMedia/1.0', { isStart: true, clientKey: `warmtest-${id}` });
      await sleep(30);
    }
  }
  // 106 同時係 client 名單入面又係「熱門」——驗證去重(唔會俾補位嗰邊再加一次)。
  for (let i = 0; i < 3; i++) { hotIds.recordStreamHit('106', 'AppleCoreMedia/1.0', { isStart: true, clientKey: 'warmtest-106' }); await sleep(30); }

  const logLines = [];
  const origLog = console.log;
  console.log = (...args) => { logLines.push(args.join(' ')); origLog(...args); };

  globalThis.__h2AnyStreaming = false;
  const r1 = await fetch(`${APP_BASE}/api/stream/warm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: clientIds }),
  });
  const body1 = await r1.json();
  check('(4) /warm 202', r1.status === 202, r1.status);
  check(`(4) client=6 + hot 補到 WARM_TOTAL_CAP=10(實測 warming=${body1.warming})`, body1.warming === 10, body1);
  const warmLogLine = logLines.slice().reverse().find((l) => l.startsWith('[warm]'));
  check(`(4) log 行 client=6 hot=4 total=10(實測「${warmLogLine}」)`, /client=6 hot=4 total=10/.test(warmLogLine || ''), warmLogLine);
  check('(4) 106(client 兼熱門)冇被去重漏檢:client 名單本身已經帶佢,補位唔應該再計多次(warming 數啱 = 10,冇多computed)', body1.warming === 10);

  await sleep(150); // 俾背景 fire-and-forget loop 有時間行
  check(`(4) anyStreaming=false 之下 warmBuffer 真係俾 call 過(實測 ${(globalThis.__h2WarmBufferCalls || []).length} 次)`, (globalThis.__h2WarmBufferCalls || []).length > 0, globalThis.__h2WarmBufferCalls);
  check('(4) recordWarmIds 淨係收到 client 原裝 6 個 id(唔連熱門補位)', JSON.stringify(globalThis.__h2RecordWarmIdsCalls?.[0]) === JSON.stringify(clientIds), globalThis.__h2RecordWarmIdsCalls);

  // ============ (4b) client 已經 10 個(=WARM_TOTAL_CAP)→ hot 一個都唔補 ========
  {
    const tenClientIds = [301, 302, 303, 304, 305, 306, 307, 308, 309, 310];
    for (const id of tenClientIds) HYMN_TABLE.set(id, { youtube_id: `yt-${id}`, duration: '3:30' });
    globalThis.__h2WarmBufferCalls = [];
    const rFull = await fetch(`${APP_BASE}/api/stream/warm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: tenClientIds }),
    });
    const bodyFull = await rFull.json();
    check(`(4b) client=10(已經頂閘)之下 hot 一個都冇補(實測 warming=${bodyFull.warming})`, bodyFull.warming === 10, bodyFull);
    const warmLogLineFull = logLines.slice().reverse().find((l) => l.startsWith('[warm]'));
    check(`(4b) log 行 client=10 hot=0 total=10(實測「${warmLogLineFull}」)`, /client=10 hot=0 total=10/.test(warmLogLineFull || ''), warmLogLineFull);
  }

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
