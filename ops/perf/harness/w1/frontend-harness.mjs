#!/usr/bin/env node
// ops/perf/harness/w1/frontend-harness.mjs — DEEP-AUDIT-W1-EXEC-20260906 §2.1
//
// 前端 harness:babel 轉真 module(同 memory「react-harness」慣例一致)餵
// shim,對住**而家 repo 入面真正嗰份源碼**(`../../../../frontend/hymn-app/
// src/*.js`)做斷言前嘅證據 dump——呢個 harness 唔判 PASS/FAIL,淨係印低
// 每種 event 嘅實際 payload/detail,俾人手核對。
//
// 做法:用 @babel/core(babel-preset-expo,同 App.js/perfMarks.js 本身用嘅
// preset 一樣)將 import/export 轉做 require/exports,然後用一個自定義
// `require` resolver 執行:
//   · 相對路徑('./x.js'/'../x.js')—— 讀返 repo 入面嗰個真檔案,一樣咁樣
//     transform,recursively load(cache 住,避免同一個檔案 transform 兩次)。
//   · bare specifier(react-native / expo-constants / expo-updates /
//     @react-native-async-storage/async-storage / react-native-mmkv)——
//     用低下面自定義嘅輕量 mock。
//   · 其餘(例如 @babel/runtime 呢類 babel 自己加嘅 helper)—— 用 Node
//     真正嘅 `require`(`createRequire` 綁定去 frontend/hymn-app,等
//     node_modules 解析得返)。
//
// 冇改任何 src/*.js 嘅內容——呢個 harness 淨係讀、transform、執行,寫入
// 檔案得返 `.tmp` 輸出(唔存在都得,純 in-memory 執行)。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'frontend', 'hymn-app');
const SRC_DIR = path.join(FRONTEND_ROOT, 'src');
const APP_JS_PATH = path.join(FRONTEND_ROOT, 'App.js');

// @babel/core 淨係喺 frontend/hymn-app 嘅 node_modules 有——呢個 harness
// 檔案本身喺 ops/perf/harness/,ESM 靜態 import 冇得用自定義 resolver,
// 所以要用 createRequire 綁定去 frontend/hymn-app 先解析得到(同下面
// requireShim 入面嘅 fallback 邏輯一致)。
const nodeRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));
const { transformSync } = nodeRequire('@babel/core');

// ── 事件收集器 ───────────────────────────────────────────────────
// 每次 mockFetch 打去 `${API_BASE}/api/client-log` 就記一條落呢度。
let capturedRequests = [];
function resetCaptured() { capturedRequests = []; }

const HARNESS_API_BASE = 'http://harness.local';

function makeMockFetch({ shouldReject = false, rejectMessage = 'mock fetch reject' } = {}) {
  return function mockFetch(url, opts) {
    if (shouldReject) return Promise.reject(new Error(rejectMessage));
    let body = null;
    try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (_) { body = opts && opts.body; }
    capturedRequests.push({ url, method: opts && opts.method, body });
    return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
  };
}

// ── mocks(bare specifier -> module.exports 形狀)────────────────────
function makeAsyncStorageMock() {
  const store = new Map();
  return {
    default: {
      getItem: async (k) => (store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => { store.set(k, v); },
    },
  };
}

function makeMmkvMock() {
  class MMKV {
    constructor() { this._m = new Map(); }
    getString(k) { return this._m.has(k) ? this._m.get(k) : undefined; }
    set(k, v) { this._m.set(k, v); }
    delete(k) { this._m.delete(k); }
  }
  return { MMKV };
}

function makeMockRegistry(opts = {}) {
  const platform = opts.platform || 'ios';
  const dev = !!opts.__DEV__;
  const updateId = 'updateId' in opts ? opts.updateId : 'harness-update-abc123';
  const appVersion = opts.appVersion || '9.9.9-harness';
  return {
    'react-native': { Platform: { OS: platform } },
    '@react-native-async-storage/async-storage': makeAsyncStorageMock(),
    'expo-constants': { default: { expoConfig: { version: appVersion } } },
    'expo-updates': (updateId == null ? {} : { updateId }),
    'react-native-mmkv': makeMmkvMock(),
    __DEV_FLAG__: dev,
  };
}

// ── 通用 CJS loader:babel 轉真源碼 + 自定義 require resolver ───────
function buildLoader(mockRegistry) {
  const moduleCache = new Map(); // absolute path -> exports

  function transformFile(absPath) {
    const src = fs.readFileSync(absPath, 'utf8');
    // ⚠️ cwd 一定要指去 FRONTEND_ROOT(唔係 process.cwd())—— babel preset
    // 用 node module resolution 揾 'babel-preset-expo',而呢個 harness 檔
    // 本身喺 ops/perf/harness/,冇呢個 override 會拎 repo root 做 base 揾
    // 唔到(佢淨係喺 frontend/hymn-app/node_modules 有裝)。
    const out = transformSync(src, { presets: ['babel-preset-expo'], filename: absPath, cwd: FRONTEND_ROOT, babelrc: false, configFile: false });
    return out.code;
  }

  function loadModule(absPath) {
    if (moduleCache.has(absPath)) return moduleCache.get(absPath);
    const dir = path.dirname(absPath);
    const code = transformFile(absPath);
    const module = { exports: {} };
    moduleCache.set(absPath, module.exports); // 佔位,防 circular require 無限遞歸

    function requireShim(specifier) {
      if (specifier in mockRegistry) return mockRegistry[specifier];
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        let resolved = path.resolve(dir, specifier);
        if (!fs.existsSync(resolved) && fs.existsSync(resolved + '.js')) resolved += '.js';
        return loadModule(resolved);
      }
      // 唔係相對路徑、又唔喺 mock 名單——用真正嘅 node require(等 @babel/
      // runtime 呢類 babel helper 解析返 frontend/hymn-app 嘅 node_modules)。
      return nodeRequire(specifier);
    }

    const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', '__DEV__', code);
    fn(module.exports, requireShim, module, absPath, dir, !!mockRegistry.__DEV_FLAG__);
    moduleCache.set(absPath, module.exports);
    return module.exports;
  }

  return { loadModule };
}

function freshClientLogModule(mockOpts) {
  const registry = makeMockRegistry(mockOpts);
  const { loadModule } = buildLoader(registry);
  const mod = loadModule(path.join(SRC_DIR, 'clientLog.js'));
  return mod;
}

function freshPerfMarksModule(mockOpts) {
  const registry = makeMockRegistry(mockOpts);
  const { loadModule } = buildLoader(registry);
  // perfMarks.js top-level import 咗 'react'(useRef)——用真 node require 就
  // 得(frontend/hymn-app node_modules 有 react)。
  const mod = loadModule(path.join(SRC_DIR, 'perfMarks.js'));
  return mod;
}

function freshUserSyncModule(mockOpts) {
  const registry = makeMockRegistry(mockOpts);
  const { loadModule } = buildLoader(registry);
  const mod = loadModule(path.join(SRC_DIR, 'sync', 'userSync.js'));
  return mod;
}

// ── 抽取 App.js 嘅單一 function 文字(唔係手抄——每次跑都由真檔案讀,
//    行數/內容改咗呢度會自動反映)──────────────────────────────────
function extractTopLevelFunction(sourceText, functionSignaturePrefix) {
  const startIdx = sourceText.indexOf(functionSignaturePrefix);
  if (startIdx === -1) throw new Error(`揾唔到 "${functionSignaturePrefix}" —— App.js 可能改咗簽名`);
  let i = sourceText.indexOf('{', startIdx);
  let depth = 0;
  let endIdx = -1;
  for (; i < sourceText.length; i++) {
    if (sourceText[i] === '{') depth++;
    else if (sourceText[i] === '}') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) throw new Error('括號冇 match 到');
  return sourceText.slice(startIdx, endIdx + 1);
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const results = {};
  const sha = (() => {
    try { return nodeRequire('child_process').execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim(); } catch (_) { return 'unknown'; }
  })();
  results._env = { headSha: sha, nodeVersion: process.version, ranAt: new Date().toISOString() };

  // ── H-F1:clientLog.js 每種 event 一條,dump payload ────────────────
  {
    resetCaptured();
    global.fetch = makeMockFetch();
    const { sendClientLog } = freshClientLogModule({ platform: 'ios' });
    const events = [
      ['nextTrackMs', { hymnId: 4423, detail: 'ms=2160' }],
      ['prefetchFail', { hymnId: 7511, detail: 'tooSmall=1024 bytes=1024 min=204800 dur=- ct=-' }],
      ['wallClockDrift', { appState: 'active', trackState: 2, detail: 'driftMs=6000 bgMs=-' }],
      ['perfNav', { detail: 'tab=Library tapToMount=120ms tapToPaint=180ms' }],
      ['syncUnknownOp', { detail: 'pl_rename' }],
      ['outboxLong', { detail: '57' }],
    ];
    for (const [event, fields] of events) {
      sendClientLog(event, fields);
    }
    await sleep(50); // resolveDeviceId() 係 promise-based,俾佢 resolve 先攞到 fetch call
    results['H-F1'] = capturedRequests.map((r) => r.body);
  }

  // ── H-F2:logDiag() DIAG_ENABLED 閘(由 App.js 即時抽取真源碼) ────
  {
    const appJsSrc = fs.readFileSync(APP_JS_PATH, 'utf8');
    const logDiagSrc = extractTopLevelFunction(appJsSrc, 'function logDiag(event, extra, opts)');
    const calls = [];
    function buildLogDiag(diagEnabled) {
      // eslint-disable-next-line no-new-func
      const factory = new Function('DIAG_ENABLED', 'sendClientLog', `return ${logDiagSrc.replace('function logDiag', 'function')};`);
      return factory(diagEnabled, (event, extra) => calls.push({ event, extra }));
    }
    calls.length = 0;
    const logDiagOff = buildLogDiag(false);
    logDiagOff('stateChange', { foo: 1 }); // 負控:DIAG_ENABLED=false,唔帶 always
    logDiagOff('wallClockDrift', { detail: 'driftMs=6000 bgMs=-' }, { always: true }); // 正控:always
    results['H-F2'] = {
      extractedSource: logDiagSrc,
      diagEnabledFalse_calls: calls.slice(),
    };
  }

  // ── H-F3:navBeacon cap(perfMarks.js 真 module,連續 45 次) ────────
  {
    resetCaptured();
    global.fetch = makeMockFetch();
    const perfMarks = freshPerfMarksModule({ platform: 'ios' });
    for (let i = 0; i < 45; i++) {
      perfMarks.recordNavBeacon('Library', 100 + i, 150 + i);
    }
    await sleep(80);
    const perfNavCount = capturedRequests.filter((r) => r.body && r.body.event === 'perfNav').length;
    const cappedCount = capturedRequests.filter((r) => r.body && r.body.event === 'navBeaconCapped').length;
    const totalNavRelated = perfNavCount + cappedCount;
    results['H-F3'] = {
      callsIssued: 45,
      perfNavCount,
      navBeaconCappedCount: cappedCount,
      cappedDetail: capturedRequests.filter((r) => r.body && r.body.event === 'navBeaconCapped').map((r) => r.body.detail),
      note: '之後再 call 多幾次應該零新增,下面另外驗證',
    };
    // 再打多 5 次,確認之後零條新增(唔係 perfNav 唔係 navBeaconCapped)
    resetCaptured();
    for (let i = 0; i < 5; i++) perfMarks.recordNavBeacon('Mine', 1, 1);
    await sleep(50);
    results['H-F3'].afterCapExtraCalls = 5;
    results['H-F3'].afterCapNewRequests = capturedRequests.length;
  }

  // ── H-F4a:prefetchFail(N-6)—— 由 audioPrefetch.js 抽取 tooSmall 區塊 +
  //    diagFail() 真源碼一齊 eval(冇經 expo-file-system,純字串抽取現行
  //    源碼,理由見報告「方法論限制」一節)。
  {
    const srcPath = path.join(SRC_DIR, 'audioPrefetch.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    const diagFailSrc = extractTopLevelFunction(src, 'function diagFail(songId, detail');
    const tooSmallStart = src.indexOf('if (!buf || buf.byteLength < MIN_BYTES) {');
    if (tooSmallStart === -1) throw new Error('揾唔到 tooSmall 區塊,audioPrefetch.js 可能改咗');
    let depth = 0, i = src.indexOf('{', tooSmallStart), endIdx = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    const tooSmallBlockSrc = src.slice(tooSmallStart, endIdx + 1);

    const captured = [];
    // eslint-disable-next-line no-new-func
    const runTooSmall = new Function(
      'diagFail', 'songId', 'buf', 'MIN_BYTES', 'durationSecById', 'contentType',
      `${tooSmallBlockSrc}\nreturn 'fell-through';`
    );
    function diagFailCapture(songId, detail) { captured.push({ songId, detail }); }
    const durationSecById = new Map([['7511', 45]]);
    const outcome = runTooSmall(diagFailCapture, '7511', { byteLength: 1024 }, 200 * 1024, durationSecById, 'text/html; charset=utf-8');
    results['H-F4-prefetchFail'] = {
      method: '源碼抽取(唔經 expo-file-system,見報告方法論限制)',
      extractedDiagFailSrc: diagFailSrc,
      extractedTooSmallBlockSrc: tooSmallBlockSrc,
      capturedDiagFailCall: captured,
      earlyReturn: outcome !== 'fell-through' ? outcome : null,
    };
  }

  // ── H-F4b:wallClockDrift(N-7 bgMs)—— 由 App.js 抽取 if(drift>5000) 區塊
  {
    const appJsSrc = fs.readFileSync(APP_JS_PATH, 'utf8');
    const marker = 'if (drift > 5000) {';
    const startIdx = appJsSrc.indexOf(marker);
    if (startIdx === -1) throw new Error('揾唔到 wallClockDrift 區塊,App.js 可能改咗');
    let depth = 0, i = startIdx + marker.length - 1, endIdx = -1;
    for (; i < appJsSrc.length; i++) {
      if (appJsSrc[i] === '{') depth++;
      else if (appJsSrc[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    const blockSrc = appJsSrc.slice(startIdx, endIdx + 1);
    const captured = [];
    function runVariant(lastForegroundResumeAt, nowTs, drift) {
      const driftLog = [];
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'nowTs', 'drift', 'driftLogRef', 'lastForegroundResumeAtRef', 'appStateRef', 'trackStateRef', 'logDiag',
        blockSrc
      );
      fn(nowTs, drift, { current: driftLog }, { current: lastForegroundResumeAt }, { current: 'active' }, { current: 2 },
        (event, extra, opts) => captured.push({ event, extra, opts }));
    }
    runVariant(null, 1_000_000, 6000); // 冷開機未發生過 background→active transition
    runVariant(999_000, 1_000_000, 6000); // 1 秒前啱啱返前台
    results['H-F4-wallClockDrift'] = {
      extractedBlockSrc: blockSrc,
      capturedCalls: captured,
    };
  }

  // ── H-F4c/d:syncUnknownOp + outboxLong(userSync.js 真 module) ─────
  {
    resetCaptured();
    global.fetch = makeMockFetch();
    const userSync = freshUserSyncModule({ platform: 'ios' });
    userSync.setAuthToken('harness-token');
    userSync.enqueue({ op: 'pl_rename', foo: 1 }); // 未知 op
    for (let n = 0; n < 55; n++) userSync.enqueue({ op: 'fav_add', hymn_id: 9000 + n });
    const drained = await userSync.flush();
    await sleep(50);
    const clientLogCalls = capturedRequests.filter((r) => r.url && r.url.includes('/api/client-log')).map((r) => r.body);
    results['H-F4-syncUnknownOp-outboxLong'] = {
      drained,
      syncUnknownOpBeacons: clientLogCalls.filter((b) => b.event === 'syncUnknownOp'),
      outboxLongBeacons: clientLogCalls.filter((b) => b.event === 'outboxLong'),
      favAddNetworkCalls: capturedRequests.filter((r) => r.url && r.url.includes('/api/me/favorites/')).length,
    };
  }

  // ── H-F5:fetch throw/reject —— caller 唔 throw、冇 unhandled rejection
  {
    let unhandled = 0;
    const onUnhandled = () => { unhandled++; };
    process.on('unhandledRejection', onUnhandled);
    global.fetch = makeMockFetch({ shouldReject: true });
    const { sendClientLog } = freshClientLogModule({ platform: 'ios' });
    let threw = false;
    try {
      sendClientLog('nextTrackMs', { detail: 'x' });
    } catch (e) {
      threw = true;
    }
    await sleep(80);
    process.removeListener('unhandledRejection', onUnhandled);
    results['H-F5'] = { callerThrew: threw, unhandledRejectionCount: unhandled };
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('HARNESS FATAL:', e && e.stack || e);
  process.exit(1);
});
