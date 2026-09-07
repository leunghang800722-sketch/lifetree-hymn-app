#!/usr/bin/env node
// HLS-PREFLIGHT-EXEC-20260907 §3 H-B(§6 修訂)—— playQueue()「並行 + 熱換」
// 嗰段真正嘅 source text 抽取執行 harness。
//
// App.js 係一個成隻 3000+ 行嘅 React component 檔(冇 jest/react-test-renderer
// 呢個 repo,plain node 冇辦法真係 render 成個 PlayerProvider),執行單 H-B
// 一行本身已經寫明「抽取/模擬」,唔要求成個 component render。呢度做嘅係
// 「抽取」嗰一半:唔係抄一份自己諗嘅邏輯落嚟測,而係用字元級 brace-matching
// 由 App.js 原始文字直接截返 §1.2/§6 嗰個 if-block(由
// `const startTrack = trackList[startIndex];` 到佢個 if 嘅 closing brace),
// 用 `new Function(...)` 喺注入晒 mock 依賴(TrackPlayer/refs/preflightHls)
// 嘅環境入面真係跑一次呢段原文——如果之後有人改咗 App.js 呢段邏輯,呢個
// harness 會攞返新版文字一齊測,唔會靜靜哋同源碼分岔。
//
// preflightHls 本身唔係 mock——用 harness-a.cjs 嗰個「babel 真 module」手法
// require 返 frontend/hymn-app/src/hlsPreflight.js 嘅真身,淨係注入 mock fetch
// 去控制佢嘅結果(ok/403/timeout)。
'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const APP_JS_PATH = path.join(APP_ROOT, 'App.js');
const PREFLIGHT_PATH = path.join(APP_ROOT, 'src/hlsPreflight.js');
const CLIENTLOG_PATH = path.join(APP_ROOT, 'src/clientLog.js');
const babel = require(path.join(APP_ROOT, 'node_modules/@babel/core'));

// ---- 1) 用返 harness-a 嗰套手法,攞真身 preflightHls(唯一分別:clientLog
//         stub 呢度都要,唔關 H-B 事)。----
const clientLogCalls = [];
globalThis.__hlsPreflightClientLogCalls = clientLogCalls;
const origJsCompiler = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
  if (filename === CLIENTLOG_PATH) {
    mod._compile(`exports.sendClientLog = function (e, f) { globalThis.__hlsPreflightClientLogCalls.push({ e, f }); };`, filename);
    return;
  }
  if (filename === PREFLIGHT_PATH) {
    const src = fs.readFileSync(filename, 'utf8');
    const { code } = babel.transform(src, {
      filename, presets: ['babel-preset-expo'], babelrc: false, configFile: false,
      caller: { name: 'metro', platform: 'ios' }, cwd: APP_ROOT,
    });
    mod._compile(code, filename);
    return;
  }
  return origJsCompiler(mod, filename);
};
const { preflightHls, isExplicitHttpFailure } = require(PREFLIGHT_PATH);
Module._extensions['.js'] = origJsCompiler; // 用完即刻還原,唔影響之後嘅正常 require

// ---- 2) 由 App.js 原文抽取 §1.2/§6 個 if-block(字元級 brace matching)。----
const appSrc = fs.readFileSync(APP_JS_PATH, 'utf8');
const START_MARK = 'const startTrack = trackList[startIndex];';
const startIdx = appSrc.indexOf(START_MARK);
if (startIdx < 0) throw new Error('抽取失敗:搵唔到 START_MARK,App.js 呢段可能已經改咗名/搬咗位');
// 由 START_MARK 開始,搵第一個 "if (" 嘅位置,再由嗰個 "{" 開始數 brace depth。
const ifOpenParenIdx = appSrc.indexOf('if (', startIdx);
const ifBraceIdx = appSrc.indexOf('{', appSrc.indexOf(')', ifOpenParenIdx));
let depth = 0;
let endIdx = -1;
for (let i = ifBraceIdx; i < appSrc.length; i++) {
  const c = appSrc[i];
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) { endIdx = i; break; }
  }
}
if (endIdx < 0) throw new Error('抽取失敗:brace 冇 balance 返(App.js 呢段可能改咗形狀)');
const blockSrc = appSrc.slice(startIdx, endIdx + 1);
console.log(`[抽取] 由 offset ${startIdx} 到 ${endIdx},共 ${blockSrc.length} 字元。`);
// 自證:抽出嚟嘅文字要包含幾個已知關鍵字(如果冇,即係抽錯咗位/App.js 已經
// 改到面目全非,寧願 harness 爆咗都唔好靜靜哋測緊過時邏輯)。
for (const must of [
  'preflightHls(startTrack.url', 'hlsDowngradedTrackRef.current', 'TrackPlayer.load(freshTrack)',
  'TrackPlayer.getActiveTrack()', 'transitionT0Ref.current !== myT0',
  // HLS-PREFLIGHT-FIX-20260907 自證:確保呢四項修復真係落咗喺呢段抽出嚟嘅
  // 文字入面,唔係得個「文檔話已改」——冇呢啲字眼即係 harness 同源碼分岔。
  'isExplicitHttpFailure(pre)', // #1:淨係明確 HTTP status 先降級
  "origin: 'jsRecover'", // #3:熱換前補返轉場標記,避免假 nativeSkipAttributed
  'expectPlayingRef.current === false', // #6:用戶暫停咗就唔夾硬 play() 番
]) {
  if (!blockSrc.includes(must)) throw new Error(`抽取到嘅 block 冇包含預期字串: ${JSON.stringify(must)} —— harness 同 App.js 可能已經分岔`);
}

// ---- 3) 用 babel 將抽出嚟嘅 block(ESM 環境下寫嘅,含 async/await、可能有
//         JSX?冇——純邏輯)轉做可以喺 `new Function` 入面跑嘅 CJS-ish code。----
const { code: transformedBlock } = babel.transform(blockSrc, {
  filename: path.join(APP_ROOT, '__hlsPreflightExtractedBlock.js'),
  presets: ['babel-preset-expo'],
  babelrc: false,
  configFile: false,
  caller: { name: 'metro', platform: 'ios' },
  cwd: APP_ROOT,
  parserOpts: { allowReturnOutsideFunction: true },
  sourceType: 'script',
});

// ---- 4) 執行環境:注入晒 App.js 呢段用到嘅所有自由變量。----
// 抽出嚟嗰段經 babel 轉咗 async/await 做 `_asyncToGenerator(regeneratorRuntime
// 或 @babel/runtime helper)`,靠緊 `require('@babel/runtime/helpers/...')`——
// `new Function` 環境冇原生 `require`,呢度注入一個淨係識揾 APP_ROOT 底下
// node_modules 嘅版本(唔係任意 require,收窄風險)。
const scopedRequire = (name) => require(path.join(APP_ROOT, 'node_modules', name));
function makeRunner() {
  const fn = new Function(
    'require',
    'Platform', 'HLS_ENABLED', 'trackList', 'startIndex', 'finalList',
    'transitionT0Ref', 'hlsDowngradedTrackRef', 'currentQueueIndexRef',
    'preflightHls', 'TrackPlayer', 'toTrack', 'logDiag', 'appStateRef', 'expectPlayingRef',
    // HLS-PREFLIGHT-FIX-20260907 —— App.js 呢段而家多用咗呢兩個自由變量:
    // `NATIVE_WD_V2`(module-level const,#3 嘅 transitionT0Ref marker 由佢
    // 閘住)、`isExplicitHttpFailure`(#1,由 src/hlsPreflight.js 真身 import)。
    'NATIVE_WD_V2', 'isExplicitHttpFailure',
    transformedBlock,
  );
  return (...args) => fn(scopedRequire, ...args);
}

// ---- 測試 harness ----
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`); }
}

function makeTrack(id, url) { return { id: String(id), url, title: 't' + id, artist: '', artwork: null }; }
function toTrackMock(song, opts) {
  const forceProg = opts && opts.forceProgressive;
  return makeTrack(song.id, forceProg ? `https://api/stream/${song.id}` : `https://api/stream/${song.id}.m3u8`);
}

function makeMockTrackPlayer(callLog) {
  return {
    async add(t) { callLog.push({ fn: 'add', arg: t }); },
    async skip(i) { callLog.push({ fn: 'skip', arg: i }); },
    async play() { callLog.push({ fn: 'play' }); },
    async remove(i) { callLog.push({ fn: 'remove', arg: i }); if (this._removeShouldThrow) throw new Error('remove boom'); },
    async load(t) { callLog.push({ fn: 'load', arg: t }); if (this._loadShouldThrow) throw new Error('load boom'); },
    async getActiveTrack() { callLog.push({ fn: 'getActiveTrack' }); return this._activeTrack; },
    async getProgress() { callLog.push({ fn: 'getProgress' }); return this._progress; },
    async getQueue() { callLog.push({ fn: 'getQueue' }); return this._queue || []; },
  };
}

function makeMockFetchOk() {
  return async () => ({ ok: true, status: 200, text: async () => '#EXTM3U\n...', body: { cancel: async () => {} } });
}
function makeMockFetch403() {
  return async () => ({ ok: false, status: 403, text: async () => '', body: { cancel: async () => {} } });
}
function makeMockFetch404() {
  return async () => ({ ok: false, status: 404, text: async () => '', body: { cancel: async () => {} } });
}
// HLS-PREFLIGHT-FIX-20260907 #1 —— 模擬 fetch throw(非 abort)= reason=network。
function makeMockFetchNetworkError() {
  return async () => { throw new Error('getaddrinfo ENOTFOUND'); };
}
// HLS-PREFLIGHT-FIX-20260907 #1 —— 模擬「攞極都唔答,撞 timeoutMs」= reason=timeout。
// 用返真身 preflightHls 嘅 AbortController signal:fetch 永遠唔 resolve,
// 直到 signal abort 先 reject(同真 fetch/undici 行為一致,唔係 RN 嗰種
// 「abort 唔 dispatch event」病態——H-A 已經專門驗過嗰個病態,呢度淨係要
// 一個乾淨嘅 timeout 案例)。
function makeMockFetchHang() {
  return (url, opts) => new Promise((resolve, reject) => {
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }
  });
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runOneScenario({
  name, fetchImpl, activeTrack, progress, transitionT0Same = true, alreadyDowngraded = false,
  loadThrows = false, removeThrows = false, nativeWdV2 = true, preflightTimeoutMs = null,
  pauseDuringPreflight = false, sleepAfterMs = null,
}) {
  const callLog = [];
  const startSong = { id: 501 };
  const otherSong = { id: 502 };
  const finalList = [startSong, otherSong];
  const startIndex = 0;
  const trackList = [makeTrack(501, 'https://api/stream/501.m3u8'), makeTrack(502, 'https://api/stream/502.m3u8')];

  const origFetch = global.fetch;
  global.fetch = fetchImpl;

  const mockTP = makeMockTrackPlayer(callLog);
  mockTP._activeTrack = activeTrack;
  mockTP._progress = progress;
  mockTP._loadShouldThrow = loadThrows;
  mockTP._removeShouldThrow = removeThrows;

  const t0Obj = { ts: Date.now(), origin: 'start', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
  const transitionT0Ref = { current: t0Obj };
  const hlsDowngradedTrackRef = { current: alreadyDowngraded ? startSong.id : null };
  const currentQueueIndexRef = { current: 0 };
  const logDiagCalls = [];
  const appStateRef = { current: 'active' };
  const expectPlayingRef = { current: false };
  // preflightTimeoutMs 淨係俾 harness 自己嘅 wrappedPreflightHls 用(縮短
  // timeout 等 timeout/hang case 唔使真係等 9 秒),唔改真身 preflightHls
  // 嘅 default。
  const preflightHlsForRun = preflightTimeoutMs == null
    ? preflightHls
    : (url, opts) => preflightHls(url, { ...opts, timeoutMs: preflightTimeoutMs });

  // 模擬「add/skip/play 已經即刻做咗」(§6 點1:呢啲喺 real App.js 係喺呢個
  // block 之前執行,harness 呢度手動先call一次,反映返真實次序)。真身
  // App.js(~App.js:2942)喺呢個 play() 之後、進入呢段 preflight 邏輯之前,
  // 同步 set 咗 `expectPlayingRef.current = true`——harness 呢度要照做,
  // 否則 #6 嘅「用戶冇暫停」對照組會錯誤咁睇落好似「一開波已經係 false」。
  await mockTP.add(trackList);
  await mockTP.play();
  expectPlayingRef.current = true;

  const runner = makeRunner();
  // 執行段落本身(fire-and-forget 嗰個 IIFE 響入面,呢個 call 本身唔會 block)。
  // 呢度計嘅 syncCallMs 就係 §6「並行」設計嘅核心承諾:呢個 block 本身係一個
  // *同步* function call(內裏起咗個 unawaited async IIFE 就即刻 return),
  // 起播路徑(add/skip/play,已經喺呢個 block 之前做晒)唔會因為呢段新增
  // 邏輯而多等一納秒——唔理個 mock fetch 用幾耐(0ms 定 5000ms),`runner(...)`
  // 呢一行本身嘅同步執行時間都應該係 <1ms。
  const tSyncStart = process.hrtime.bigint();
  runner(
    { OS: 'ios' }, true, trackList, startIndex, finalList,
    transitionT0Ref, hlsDowngradedTrackRef, currentQueueIndexRef,
    preflightHlsForRun, mockTP, toTrackMock,
    (event, fields) => logDiagCalls.push({ event, fields }),
    appStateRef, expectPlayingRef,
    nativeWdV2, isExplicitHttpFailure,
  );
  const syncCallMs = Number(process.hrtime.bigint() - tSyncStart) / 1e6;

  const addSkipPlayDoneBeforePreflightStarts = callLog.filter((c) => c.fn === 'add' || c.fn === 'play').length === 2;

  if (!transitionT0Same) {
    // 模擬「呢次轉歌已經完結/俾蓋過」——preflight 都仲未 resolve 嗰陣就換咗個新 t0。
    transitionT0Ref.current = { ts: Date.now(), origin: 'auto', trackChangedSeen: true, bufferingSeen: false, hymnId: null };
  }
  if (pauseDuringPreflight) {
    // HLS-PREFLIGHT-FIX-20260907 #6 —— 模擬用戶喺預檢窗口期間自己撳
    // cmd_pause()(App.js:3036 同步 set false,「唔好嗌醒」嗰句)。
    expectPlayingRef.current = false;
  }

  // preflightHls 用真 timeoutMs(預設 9000ms,個別 case 會用
  // preflightTimeoutMs 縮短),呢度啲 mock fetch 全部即刻resolve/reject
  // (或者靠 AbortController abort 觸發),淨係俾少少時間等 microtask/
  // setTimeout 跑晒。`sleepAfterMs` 俾個別故意加咗網絡延遲嘅 mock fetch
  // (例如「403 喺 0.5s」個case)攞多啲時間先算完。
  await sleep(sleepAfterMs != null ? sleepAfterMs : (preflightTimeoutMs != null ? preflightTimeoutMs + 80 : 50));

  global.fetch = origFetch;
  return { callLog, logDiagCalls, hlsDowngradedTrackRef, transitionT0Ref, addSkipPlayDoneBeforePreflightStarts, syncCallMs, t0Obj };
}

async function run() {
  // Scenario 1:預檢 ok → 零改動(§6 點4)
  {
    const r = await runOneScenario({
      name: 'preflight ok',
      fetchImpl: makeMockFetchOk(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('§6點1:add()同play()已經即刻做咗(冇等preflight)', r.addSkipPlayDoneBeforePreflightStarts);
    check('§6點4:preflight ok → 零 load/remove call', swapCalls.length === 0, r.callLog);
    check('preflight ok → hlsDowngradedTrackRef 冇被set', r.hlsDowngradedTrackRef.current === null);
  }

  // Scenario 2:預檢 403,track 仲係 current 而且仲未出聲 → 熱換(load)
  {
    const r = await runOneScenario({
      name: '403 + still current + not sounding',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
    });
    const loadCalls = r.callLog.filter((c) => c.fn === 'load');
    check('403+仲未出聲 → 用 TrackPlayer.load() 熱換', loadCalls.length === 1, r.callLog);
    check('熱換用嘅係 progressive URL(冇 .m3u8)', loadCalls[0] && !/\.m3u8/.test(loadCalls[0].arg.url), loadCalls[0]);
    check('熱換之後 hlsDowngradedTrackRef set 咗做 501', r.hlsDowngradedTrackRef.current === 501);
    check('有送 hlsFallback via=preflight beacon', r.logDiagCalls.some((c) => c.event === 'hlsFallback' && /via=preflight/.test(c.fields.detail)), r.logDiagCalls);
    // HLS-PREFLIGHT-FIX-20260907 #3(Opus 驗收)—— 熱換之前一定要補
    // transitionT0Ref = { origin: 'jsRecover', ... },唔係就會製造假
    // nativeSkipAttributed(PlaybackActiveTrackChanged 誤判做 native skip)。
    check(
      '#3:熱換之前 transitionT0Ref 已經換咗做 origin=jsRecover 嘅新 marker(identity 同開頭嗰個 t0Obj 唔同)',
      r.transitionT0Ref.current !== r.t0Obj && r.transitionT0Ref.current.origin === 'jsRecover',
      r.transitionT0Ref.current
    );
    // HLS-PREFLIGHT-FIX-20260907 #6(Opus 驗收)—— 用戶冇暫停過,熱換之後
    // 應該照舊夾硬 play() 一次(初始 add() 之後嗰個 play() + 熱換完呢個
    // play(),一共 2 次)。
    check('#6:用戶冇暫停 → 熱換之後照舊 play() 一次(連初始嗰次共 2 次)', r.callLog.filter((c) => c.fn === 'play').length === 2, r.callLog);
  }

  // Scenario 3:預檢 403,但已經出聲(position>=0.5)→ 唔換
  {
    const r = await runOneScenario({
      name: '403 + already sounding(position=1.2)',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 1.2 },
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('已出聲(position=1.2)→ 冇熱換', swapCalls.length === 0, r.callLog);
    check('已出聲 → hlsDowngradedTrackRef 保持 null(留返PlaybackError/handleStuckTrackEnd)', r.hlsDowngradedTrackRef.current === null);
  }

  // Scenario 4:預檢 403,但 transitionT0Ref 已經俾另一次轉歌蓋過 → 唔換
  {
    const r = await runOneScenario({
      name: '403 + transitionT0 已經俾蓋過(呢次轉歌已完結)',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      transitionT0Same: false,
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('transitionT0 identity 唔同(已完結/俾蓋過)→ 冇熱換', swapCalls.length === 0, r.callLog);
  }

  // Scenario 5:預檢 403,但已經俾第二條路(例如 PlaybackError)降級咗 → 唔重覆換
  {
    const r = await runOneScenario({
      name: '403 + 已經俾第二條路降級咗',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      alreadyDowngraded: true,
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('已經降級過(hlsDowngradedTrackRef 已 set)→ 冇再熱換一次', swapCalls.length === 0, r.callLog);
  }

  // Scenario 6:預檢 403,但 active track 已經唔係呢首歌(race:用戶跳咗去第二首)→ 唔換
  {
    const r = await runOneScenario({
      name: '403 + active track 已經唔係 startIndex 嗰首(race)',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '502', url: 'https://api/stream/502.m3u8' }, // 唔係 501
      progress: { position: 0 },
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('active track id 唔 match → 冇熱換(避免換錯歌)', swapCalls.length === 0, r.callLog);
  }

  // Scenario 7:load() throw → fallback remove+add+skip(fallback 成功)
  {
    const r = await runOneScenario({
      name: '403 + TrackPlayer.load() 拋錯 → fallback remove+add+skip',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      loadThrows: true,
    });
    const fns = r.callLog.map((c) => c.fn);
    const loadIdx = fns.indexOf('load');
    const removeIdx = fns.indexOf('remove');
    const secondAddIdx = fns.indexOf('add', 1); // 第一個 add 係開頭嗰個,搵第二個
    check('load() 拋錯之後 fallback 行 remove→add→skip', loadIdx >= 0 && removeIdx > loadIdx && secondAddIdx > removeIdx, r.callLog);
    // HLS-PREFLIGHT-FIX-20260907 #5(Opus 驗收)—— fallback 成功咗(remove/
    // add/skip 都冇拋錯)→ 應該照樣 set hlsDowngradedTrackRef,同之前行為
    // 一致,唔係「淨係 load() 成功先算」。
    check('#5:load() 拋錯但 fallback 成功 → hlsDowngradedTrackRef 照樣 set 咗做 501', r.hlsDowngradedTrackRef.current === 501);
  }

  // Scenario 7b —— HLS-PREFLIGHT-FIX-20260907 #5(Opus 驗收):load() 同
  // fallback(remove)成條路都拋錯 → hlsDowngradedTrackRef **唔准** set。
  // 呢個係 Opus 揪出嘅缺口:之前寫法喺 load() 之前就 set 咗支旗,成條路失敗
  // 會令隊列入面仲係死 `.m3u8`,但支旗已經話「已經降級過」,閂死
  // PlaybackError/handleStuckTrackEnd 兩條現有 HLS 降級分支,D2 家族原病
  // 復發。
  {
    const r = await runOneScenario({
      name: '403 + load() 同 fallback remove() 都拋錯 → 唔准 set hlsDowngradedTrackRef',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      loadThrows: true,
      removeThrows: true,
    });
    check(
      '#5:熱換成條路(load+fallback)都失敗 → hlsDowngradedTrackRef 保持 null(唔閂死 PlaybackError/handleStuckTrackEnd 兩條現有分支)',
      r.hlsDowngradedTrackRef.current === null,
      r.hlsDowngradedTrackRef.current
    );
  }

  // Scenario 9 —— HLS-PREFLIGHT-FIX-20260907 #1(Opus 驗收):reason=timeout
  // (冇任何實質證據)唔准觸發降級,同 App.js handleStuckTrackEnd 嘅 HLS 分支
  // (HLS-EXEC-STARTUP-GRACE-20260902 R4)紅線一致。用短 preflightTimeoutMs
  // (200ms)令 case 快,唔使真係等 9 秒。
  {
    const r = await runOneScenario({
      name: '#1: reason=timeout → 唔降級',
      fetchImpl: makeMockFetchHang(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      preflightTimeoutMs: 200,
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('#1: reason=timeout(冇明確 HTTP status)→ 冇熱換', swapCalls.length === 0, r.callLog);
    check('#1: reason=timeout → hlsDowngradedTrackRef 保持 null', r.hlsDowngradedTrackRef.current === null);
  }

  // Scenario 10 —— HLS-PREFLIGHT-FIX-20260907 #1(Opus 驗收):
  // reason=network(fetch throw,唔係 abort)一樣冇明確 HTTP status,唔准降級。
  {
    const r = await runOneScenario({
      name: '#1: reason=network → 唔降級',
      fetchImpl: makeMockFetchNetworkError(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
    });
    const swapCalls = r.callLog.filter((c) => c.fn === 'load' || c.fn === 'remove');
    check('#1: reason=network(冇明確 HTTP status)→ 冇熱換', swapCalls.length === 0, r.callLog);
  }

  // Scenario 11 —— HLS-PREFLIGHT-FIX-20260907 #1(Opus 驗收):正控,明確
  // 404(4xx)一樣要降級,唔係淨係 403 先得。
  {
    const r = await runOneScenario({
      name: '#1 正控: 明確 404 → 照樣降級',
      fetchImpl: makeMockFetch404(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
    });
    const loadCalls = r.callLog.filter((c) => c.fn === 'load');
    check('#1 正控: 明確 404(4xx)→ 照樣熱換', loadCalls.length === 1, r.callLog);
  }

  // Scenario 11b —— Fable 拍板嘅執行單直接要求嘅 harness case:「403 喺 0.5s
  // → 降級」。同 Case 9(H-A)配對:證明「值唔值得降級」淨係睇明確 HTTP
  // status,同耗時快慢完全無關(0.5s 嘅 403 一樣要降級,6.2s 嘅 200 一樣
  // 唔降級)。
  {
    const delayed403 = () => async () => {
      await sleep(500);
      return { ok: false, status: 403, text: async () => '', body: { cancel: async () => {} } };
    };
    const r = await runOneScenario({
      name: '#1: 403 喺 0.5s → 降級',
      fetchImpl: delayed403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      sleepAfterMs: 650,
    });
    const loadCalls = r.callLog.filter((c) => c.fn === 'load');
    check('#1: 403 喺 0.5s(有延遲但係明確 status)→ 照樣熱換降級', loadCalls.length === 1, r.callLog);
  }

  // Scenario 12 —— HLS-PREFLIGHT-FIX-20260907 #6(Opus 驗收):用戶喺預檢
  // 窗口期間自己撳咗暫停(expectPlayingRef 同步 set false)→ 熱換照做
  // (URL 要換走死嘅 .m3u8),但唔准夾硬再 play() 一次。
  {
    const r = await runOneScenario({
      name: '#6: 熱換期間用戶已暫停 → 換URL但唔play()',
      fetchImpl: makeMockFetch403(),
      activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
      progress: { position: 0 },
      pauseDuringPreflight: true,
    });
    const loadCalls = r.callLog.filter((c) => c.fn === 'load');
    const playCalls = r.callLog.filter((c) => c.fn === 'play');
    check('#6: 用戶已暫停 → 熱換(load)照做', loadCalls.length === 1, r.callLog);
    check('#6: 用戶已暫停 → 唔夾硬 play()(淨係初始嗰次 1 次,冇熱換後嗰次)', playCalls.length === 1, r.callLog);
    check('#6: 用戶已暫停 → hlsDowngradedTrackRef 照樣 set(URL 已經換咗)', r.hlsDowngradedTrackRef.current === 501);
  }

  // ============================================================
  // Scenario 8 —— §6 修訂 A 嘅核心承諾:「並行」= 起播路徑(add/skip/play)
  // 完全唔等預檢,+0ms。冇 iOS Simulator/真機喺呢個 sandbox 可用(見
  // HLS-PREFLIGHT-REPORT-20260907.md §H-D 段解釋點解冇做真機/模擬器
  // nextTrackMs 交錯 A/B),呢度做嘅係結構性替代證據:交錯 5 run(ok/403/
  // ok/403/ok,模擬「正常⇄403」交替),每次都用一個刻意加咗 2000ms 網絡
  // 延遲嘅 mock fetch(模擬弱網/慢 googlevideo),量 `runner(...)` 呢一行
  // 本身(即係 App.js 入面 add/skip/play 之後、preflight IIFE fire 嗰一刻)
  // 嘅**同步**執行時間——如果呢個設計真係「並行」,呢個數應該同 mock fetch
  // 用幾耐延遲完全無關,永遠 <5ms(唔會有 2000ms 咁誇張)。
  // ⚠️ 呢個唔等於真機 nextTrackMs 交錯 A/B(冇真機/模擬器數據),但結構性咁
  // 證明咗「起播路徑唔會被預檢拖慢」呢個設計承諾。
  {
    const slowFetch = (resultStatus) => async () => {
      await sleep(2000);
      if (resultStatus === 200) return { ok: true, status: 200, text: async () => '#EXTM3U\n...', body: { cancel: async () => {} } };
      return { ok: false, status: resultStatus, text: async () => '', body: { cancel: async () => {} } };
    };
    const pattern = [200, 403, 200, 403, 200]; // 交錯 5 run
    const syncMsList = [];
    for (const status of pattern) {
      const r = await runOneScenario({
        name: `interleaved(${status})`,
        fetchImpl: slowFetch(status),
        activeTrack: { id: '501', url: 'https://api/stream/501.m3u8' },
        progress: { position: 0 },
      });
      syncMsList.push(r.syncCallMs);
    }
    const maxSyncMs = Math.max(...syncMsList);
    console.log(`  ℹ️  交錯 5 run(狀態序列 [${pattern.join(',')}],mock fetch 每次故意等 2000ms)同步呼叫耗時(ms): ${syncMsList.map((n) => n.toFixed(3)).join(', ')}`);
    check(`§6 結構性證據:5 run 嘅同步呼叫耗時全部 <5ms(同 mock fetch 用嘅 2000ms 延遲完全無關)→ 起播 add/skip/play 唔會被預檢拖慢,結構性 +0ms`, maxSyncMs < 5, syncMsList);
  }

  console.log(`\nH-B: ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('H-B harness 本身炸咗:', e);
  process.exit(2);
});
