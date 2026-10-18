#!/usr/bin/env node
// ODELY-OPT-EXEC-20261018 §④ harness C —— preflightAndSwapNext helper 抽取驗證。
// 做法(同 harness-b):用字元級 brace-matching 由「真 App.js 原文」抽段,babel 轉碼後
// 喺 new Function 注入 mock 依賴(TrackPlayer/refs/toTrack/logDiag/fetch)跑;
// preflightHls/isExplicitHttpFailure 係 src/hlsPreflight.js 真 module(babel 載入)。
//  - NEW helper:App.js 現版 `const preflightAndSwapNext = useCallback(...)` 全段
//  - NEW insertNext 守衛:`if (plan.insertAt === curIdx + 1) {...}` 全段
//  - NEW trackChanged call 行:`preflightAndSwapNext(queueRef.current[idx + 1], 'next');`
//  - OLD:`git show 6ade187:frontend/hymn-app/App.js` 嘅 trackChanged inline 段
//    (由 `if (Platform.OS === 'ios' && HLS_ENABLED) {` 緊接 `const nextSong = queueRef.current[idx + 1];` 起)
'use strict';
const Module = require('module');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const PREFLIGHT_PATH = path.join(APP_ROOT, 'src/hlsPreflight.js');
const CLIENTLOG_PATH = path.join(APP_ROOT, 'src/clientLog.js');
const babel = require(path.join(APP_ROOT, 'node_modules/@babel/core'));

const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
  if (filename === CLIENTLOG_PATH) { mod._compile('exports.sendClientLog = function () {};', filename); return; }
  if (filename === PREFLIGHT_PATH) {
    const { code } = babel.transform(fs.readFileSync(filename, 'utf8'), {
      filename, presets: ['babel-preset-expo'], babelrc: false, configFile: false,
      caller: { name: 'metro', platform: 'ios' }, cwd: APP_ROOT,
    });
    mod._compile(code, filename); return;
  }
  return origJs(mod, filename);
};
const { preflightHls, isExplicitHttpFailure } = require(PREFLIGHT_PATH);
Module._extensions['.js'] = origJs;

const newSrc = fs.readFileSync(path.join(APP_ROOT, 'App.js'), 'utf8');
const oldSrc = execSync('git show 6ade187:frontend/hymn-app/App.js', { cwd: APP_ROOT, maxBuffer: 1 << 28 }).toString('utf8');

function braceBlock(src, startMark, openFrom) {
  const s = src.indexOf(startMark);
  if (s < 0) throw new Error('抽取失敗: ' + startMark);
  let i = src.indexOf('{', openFrom != null ? s + openFrom : s);
  let d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return { s, e: i + 1 }; }
  }
  throw new Error('brace 唔 balance: ' + startMark);
}
// NEW helper:由 `const preflightAndSwapNext = useCallback(` 到 `}, []);`
const hs = newSrc.indexOf('const preflightAndSwapNext = useCallback(');
const he = newSrc.indexOf('}, []);', hs) + '}, []);'.length;
const helperSrc = newSrc.slice(hs, he);
// NEW insertNext 守衛
const g = braceBlock(newSrc, 'if (plan.insertAt === curIdx + 1) {');
const guardSrc = newSrc.slice(g.s, g.e);
// NEW trackChanged call
const callMark = "preflightAndSwapNext(queueRef.current[idx + 1], 'next');";
if (!newSrc.includes(callMark)) throw new Error('trackChanged call 行搵唔到');
// OLD inline
const oMark = "const nextSong = queueRef.current[idx + 1];\n          if (nextSong && nextSong.id != null && hlsDowngradedTrackRef";
const oPos = oldSrc.indexOf(oMark);
if (oPos < 0) throw new Error('舊版 inline 段搵唔到');
const oIfStart = oldSrc.lastIndexOf("if (Platform.OS === 'ios' && HLS_ENABLED) {", oPos);
const ob = braceBlock(oldSrc, "if (Platform.OS === 'ios' && HLS_ENABLED) {", 0);
// braceBlock 用 indexOf 首個,要由 oIfStart 起算
let od = 0, oe = -1;
for (let i = oldSrc.indexOf('{', oIfStart); i < oldSrc.length; i++) {
  if (oldSrc[i] === '{') od++; else if (oldSrc[i] === '}') { od--; if (od === 0) { oe = i + 1; break; } }
}
const oldSrcBlock = oldSrc.slice(oIfStart, oe);
console.log(`[抽取] helper ${helperSrc.length} 字元;insertNext 守衛 ${guardSrc.length};舊 inline ${oldSrcBlock.length}`);

const tf = (code, name) => babel.transform(code, {
  filename: path.join(APP_ROOT, name), presets: ['babel-preset-expo'], babelrc: false, configFile: false,
  caller: { name: 'metro', platform: 'ios' }, cwd: APP_ROOT, sourceType: 'script',
  parserOpts: { allowReturnOutsideFunction: true },
}).code;
const scopedRequire = (n) => require(path.join(APP_ROOT, 'node_modules', n));
const NAMES = ['require', 'Platform', 'HLS_ENABLED', 'queueRef', 'currentQueueIndexRef', 'hlsDowngradedTrackRef',
  'hlsPreflightSeenRef', 'appStateRef', 'toTrack', 'logDiag', 'TrackPlayer', 'preflightHls', 'isExplicitHttpFailure',
  'useCallback', 'idx', 'plan', 'curIdx', 'hymn'];
const mk = (body) => new Function(...NAMES, body);
const newHelperFactory = mk(tf(helperSrc, '__h.js') + '\n;return preflightAndSwapNext;');
const guardRunner = mk(tf(helperSrc, '__h2.js') + '\n;' + tf(guardSrc, '__g.js'));
const oldRunner = mk(tf(oldSrcBlock, '__o.js'));
const newTrackChangedRunner = mk(tf(helperSrc, '__h3.js') + '\n;' + tf(callMark, '__c.js'));

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${x ? ' — ' + JSON.stringify(x) : ''}`); } };
// ms=<耗時> 係真 wall-clock,每次跑都唔同,比較前抹走(其餘字段逐字比)
const norm = (v) => JSON.stringify(v).replace(/ms=\d+/g, 'ms=N');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchStatus = (st) => async () => ({ ok: st >= 200 && st < 300, status: st, text: async () => (st === 200 ? '#EXTM3U\n' : ''), body: { cancel: async () => {} } });

function env({ queueIds = [1, 2, 3], cur = 0, nativeIds = null, status = 404, platform = 'ios', hls = true, progress = { position: 1, duration: 200 },
  downgraded = null, seen = [], afterPreflight = null }) {
  const log = [];
  const e = {
    log, pfCalls: [], diag: [],
    Platform: { OS: platform }, HLS_ENABLED: hls,
    queueRef: { current: queueIds.map((id) => ({ id })) },
    currentQueueIndexRef: { current: cur },
    hlsDowngradedTrackRef: { current: downgraded },
    hlsPreflightSeenRef: { current: new Map(seen.map((s) => [String(s), true])) },
    appStateRef: { current: 'active' },
    toTrack: (s, o) => ({ id: String(s.id), url: o && o.forceProgressive ? `https://api/stream/${s.id}` : `https://api/stream/${s.id}.m3u8` }),
    logDiag: (ev, ex, op) => e.diag.push({ ev, ex, op }),
    TrackPlayer: {
      async getQueue() { log.push('getQueue'); return (nativeIds || queueIds).map((id) => ({ id: String(id) })); },
      async getProgress() { log.push('getProgress'); return progress; },
      async remove(i) { log.push(['remove', i]); },
      async add(t, i) { log.push(['add', t, i]); },
    },
    preflightHls: (url, o) => { e.pfCalls.push({ url, ...o }); return preflightHls(url, o); },
    isExplicitHttpFailure, useCallback: (f) => f,
  };
  e.status = status;
  e.afterPreflight = afterPreflight;
  return e;
}
const args = (e, extra = {}) => [scopedRequire, e.Platform, e.HLS_ENABLED, e.queueRef, e.currentQueueIndexRef, e.hlsDowngradedTrackRef,
  e.hlsPreflightSeenRef, e.appStateRef, e.toTrack, e.logDiag, e.TrackPlayer, e.preflightHls, e.isExplicitHttpFailure, e.useCallback,
  extra.idx, extra.plan, extra.curIdx, extra.hymn];
async function withFetch(e, fn) { const o = global.fetch; global.fetch = fetchStatus(e.status); try { await fn(); await sleep(60); } finally { global.fetch = o; } }

(async () => {
  console.log('(1) trackChanged 路徑 vs 舊版 inline(6ade187)');
  for (const st of [404, 403, 200, 500]) {
    const eo = env({ status: st }), en = env({ status: st });
    await withFetch(eo, async () => oldRunner(...args(eo, { idx: 0 })));
    await withFetch(en, async () => newTrackChangedRunner(...args(en, { idx: 0 })));
    check(`(1) status=${st}: preflightHls args(url/hymnId/ctx) 逐字一致`, JSON.stringify(eo.pfCalls) === JSON.stringify(en.pfCalls) && en.pfCalls.length === 1 && en.pfCalls[0].ctx === 'next' && en.pfCalls[0].url === 'https://api/stream/2.m3u8' && en.pfCalls[0].hymnId === 2, { o: eo.pfCalls, n: en.pfCalls });
    check(`(1) status=${st}: TrackPlayer 呼叫序列 + hlsFallback beacon + downgraded ref 一致`,
      norm([eo.log, eo.diag, eo.hlsDowngradedTrackRef.current]) === norm([en.log, en.diag, en.hlsDowngradedTrackRef.current]), { o: [eo.log, eo.diag], n: [en.log, en.diag] });
  }
  { // 邊界:seen / downgraded / 近尾 / 已 current / 非 iOS 兩邊一致
    const cases = [
      { n: 'seen', o: { seen: [2] } }, { n: 'downgraded', o: { downgraded: 2 } },
      { n: 'near-end', o: { progress: { position: 190, duration: 200 } } },
      { n: 'native 已 current', o: { nativeIds: [2, 1, 3] } }, { n: '非 iOS', o: { platform: 'android' } },
      { n: 'HLS off', o: { hls: false } }, { n: 'idx+1 不存在', o: { queueIds: [1] } },
    ];
    for (const c of cases) {
      const eo = env(c.o), en = env(c.o);
      await withFetch(eo, async () => oldRunner(...args(eo, { idx: 0 })));
      await withFetch(en, async () => newTrackChangedRunner(...args(en, { idx: 0 })));
      check(`(1) 邊界 ${c.n}: 新舊行為一致`, norm([eo.pfCalls, eo.log, eo.diag]) === norm([en.pfCalls, en.log, en.diag]));
    }
  }

  console.log('(2) insertNext 插 idx+1 → 預檢一次 ctx=insertNext、404 熱換');
  {
    const hymn = { id: 9 };
    const e = env({ queueIds: [1, 9, 2], cur: 0 });
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn })));
    check('(2) 預檢一次,ctx=insertNext,url/hymnId 正確', e.pfCalls.length === 1 && e.pfCalls[0].ctx === 'insertNext' && e.pfCalls[0].hymnId === 9 && e.pfCalls[0].url === 'https://api/stream/9.m3u8', e.pfCalls);
    check('(2) 404 → TrackPlayer.remove(1) + add(progressive,1)', JSON.stringify(e.log.filter((x) => Array.isArray(x)).map((x) => x[0] === 'add' ? ['add', x[1].url, x[2]] : x)) === JSON.stringify([['remove', 1], ['add', 'https://api/stream/9', 1]]), e.log);
    check('(2) hlsFallback beacon 帶 via=preflight ctx=insertNext + always', e.diag.length === 1 && e.diag[0].ev === 'hlsFallback' && /^via=preflight ctx=insertNext reason=/.test(e.diag[0].ex.detail) && e.diag[0].op.always === true && e.diag[0].ex.hymnId === 9, e.diag);
    check('(2) hlsDowngradedTrackRef set', e.hlsDowngradedTrackRef.current === 9);
  }
  { // 200 → 唔熱換
    const e = env({ queueIds: [1, 9, 2] });
    e.status = 200;
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })));
    check('(2b) 200 → 預檢一次但冇 remove/add', e.pfCalls.length === 1 && !e.log.some((x) => Array.isArray(x)), e.log);
  }
  console.log('(3) 插 idx+2 → 零預檢');
  {
    const e = env({ queueIds: [1, 2, 9] });
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 2 }, curIdx: 0, hymn: { id: 9 } })));
    check('(3) 零預檢、零 TrackPlayer 呼叫', e.pfCalls.length === 0 && e.log.length === 0 && e.diag.length === 0);
  }
  console.log('(4) 已 downgraded 嘅 id → 唔重複');
  {
    const e = env({ queueIds: [1, 9, 2], downgraded: 9 });
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })));
    check('(4) 零預檢', e.pfCalls.length === 0 && e.log.length === 0);
  }
  console.log('(5) hlsPreflightSeenRef 去重');
  {
    const e = env({ queueIds: [1, 9, 2] });
    e.status = 200;
    await withFetch(e, async () => { guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })); });
    await withFetch(e, async () => { guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })); });
    check('(5) 同 id 第二次 → 仍然只有 1 次預檢', e.pfCalls.length === 1, e.pfCalls);
    check('(5) seen 封頂 200:塞 205 個 id 後 size<=200', (() => {
      const e2 = env({ queueIds: [1, 2] }); e2.status = 200;
      const run = newHelperFactory(...args(e2));
      for (let i = 100; i < 305; i++) run({ id: i }, 'next');
      return e2.hlsPreflightSeenRef.current.size === 200 && !e2.hlsPreflightSeenRef.current.has('100');
    })());
  }
  console.log('(6) 非 iOS / HLS_ENABLED=false → 零預檢');
  for (const o of [{ platform: 'android' }, { hls: false }]) {
    const e = env({ queueIds: [1, 9, 2], ...o });
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })));
    check(`(6) ${JSON.stringify(o)} → 零預檢零呼叫`, e.pfCalls.length === 0 && e.log.length === 0);
  }
  console.log('(7) 預檢期間用戶已跳去該歌 (nativeIdx <= curIdxNow) → 唔 swap');
  {
    const e = env({ queueIds: [1, 9, 2] });
    // fetch 期間把 currentQueueIndexRef 推到 1
    const o = global.fetch;
    global.fetch = async () => { e.currentQueueIndexRef.current = 1; return fetchStatus(404)(); };
    try { guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })); await sleep(60); } finally { global.fetch = o; }
    check('(7) 預檢發生咗但冇 remove/add、冇 beacon、ref 不變', e.pfCalls.length === 1 && !e.log.some((x) => Array.isArray(x)) && e.diag.length === 0 && e.hlsDowngradedTrackRef.current === null, e.log);
  }
  console.log('(8) 近尾 15 秒 → 唔 swap');
  {
    const e = env({ queueIds: [1, 9, 2], progress: { position: 186, duration: 200 } });
    await withFetch(e, async () => guardRunner(...args(e, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })));
    check('(8) 位置 186/200(尾 14 秒)→ 冇 remove/add、冇 beacon', e.pfCalls.length === 1 && !e.log.some((x) => Array.isArray(x)) && e.diag.length === 0, e.log);
    const e2 = env({ queueIds: [1, 9, 2], progress: { position: 184, duration: 200 } });
    await withFetch(e2, async () => guardRunner(...args(e2, { plan: { insertAt: 1 }, curIdx: 0, hymn: { id: 9 } })));
    check('(8) 正控: 位置 184/200(尾 16 秒)→ 照 swap', e2.log.some((x) => Array.isArray(x) && x[0] === 'remove'));
  }
  console.log(`\nH-C: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('H-C 炸咗', e); process.exit(2); });
