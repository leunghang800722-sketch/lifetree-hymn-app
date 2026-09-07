#!/usr/bin/env node
// HLS-PREFLIGHT-EXEC-20260907 §3 H-A —— hlsPreflight.js 真 module harness。
//
// 做法(「babel 真 module」):唔抄一份 preflightHls() 嘅副本落嚟測,而係用
// babel-preset-expo(呢個 repo 自己嘅 babel config 用緊嗰個 preset)將
// frontend/hymn-app/src/hlsPreflight.js 原封不動轉做 CJS,再用
// Module._extensions['.js'] hook 喺 require 呢個特定檔案路徑嗰陣先落呢層轉換,
// 其他檔案(理論上唔會有第二個)照舊行 Node 原生 require。
//
// 依賴隔離:hlsPreflight.js 唯一嘅 import 係 `./clientLog.js`(sendClientLog)。
// H-A 呢張表淨係測 preflightHls() 本身嘅 { ok, status, ms, reason } 判斷邏輯
// (§1.1 spec:2xx+#EXTM3U→ok;403→status:403;5s 唔答→timeout;2xx 但唔係
// m3u8→not-m3u8;fetch throw→network;全部唔 throw),唔關「送咗個 beacon
// 出去冇」事——所以呢度將 `./clientLog.js` 呢一個 import 換做記低 call 嘅
// stub(唔係代表 hlsPreflight.js 本身用緊 mock,佢個人邏輯完全冇改一個字)。
'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const PREFLIGHT_PATH = path.join(APP_ROOT, 'src/hlsPreflight.js');
const CLIENTLOG_PATH = path.join(APP_ROOT, 'src/clientLog.js');
// scratch 檔案本身唔喺 App 嘅 node_modules 解析範圍入面,直接用絕對路徑
// require project 自己嘅 @babel/core(唔裝新套嘢,用返 repo 現成嗰個)。
const babel = require(path.join(APP_ROOT, 'node_modules/@babel/core'));

const clientLogCalls = [];
globalThis.__hlsPreflightClientLogCalls = clientLogCalls;

const origJsCompiler = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
  if (filename === CLIENTLOG_PATH) {
    // 純 stub,唔係真 clientLog.js 邏輯——呢個 import 邊界特登隔離開(見檔頭註解)。
    const stubSrc = `exports.sendClientLog = function (event, fields) { globalThis.__hlsPreflightClientLogCalls.push({ event, fields }); };`;
    mod._compile(stubSrc, filename);
    return;
  }
  if (filename === PREFLIGHT_PATH) {
    const src = fs.readFileSync(filename, 'utf8');
    const { code } = babel.transform(src, {
      filename,
      presets: ['babel-preset-expo'],
      babelrc: false,
      configFile: false,
      caller: { name: 'metro', platform: 'ios' },
      cwd: APP_ROOT,
    });
    mod._compile(code, filename);
    return;
  }
  return origJsCompiler(mod, filename);
};

const { preflightHls } = require(PREFLIGHT_PATH);

// ---- 測試 harness ----
let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ' — ' + JSON.stringify(extra) : ''}`);
  }
}

function makeRes({ status = 200, body = '' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    body: { cancel: async () => {} },
  };
}

async function run() {
  const origFetch = global.fetch;

  // Case 1: 2xx + #EXTM3U → ok
  {
    global.fetch = async (url, opts) => makeRes({ status: 200, body: '#EXTM3U\n#EXT-X-VERSION:7\n...' });
    const r = await preflightHls('https://x/test1.m3u8', { hymnId: 1, ctx: 'start' });
    check('2xx+#EXTM3U → ok=true', r.ok === true && r.status === 200 && r.reason === null, r);
  }

  // Case 2: 403 → status:403
  {
    global.fetch = async () => makeRes({ status: 403, body: '' });
    const r = await preflightHls('https://x/test2.m3u8', { hymnId: 2 });
    check('403 → ok=false reason=status:403', r.ok === false && r.status === 403 && r.reason === 'status:403', r);
  }

  // Case 3: 5s 唔答 → timeout(mock fetch 6s,自己攞 signal 嚟 abort 先睇到真 AbortError)
  {
    global.fetch = (url, opts) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(makeRes({ status: 200, body: '#EXTM3U' })), 6000);
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', () => {
          clearTimeout(t);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
    const t0 = Date.now();
    const r = await preflightHls('https://x/test3.m3u8', { hymnId: 3, timeoutMs: 5000 });
    const elapsed = Date.now() - t0;
    check('6s 唔答,5s timeoutMs → reason=timeout', r.ok === false && r.reason === 'timeout', r);
    check('真係喺 ~5s(唔係 6s)就有結果', elapsed < 5500, { elapsed });
  }

  // Case 4: 2xx 但唔係 m3u8 → not-m3u8
  {
    global.fetch = async () => makeRes({ status: 200, body: '<html>not a playlist</html>' });
    const r = await preflightHls('https://x/test4.m3u8', { hymnId: 4 });
    check('2xx 冇 #EXTM3U → reason=not-m3u8', r.ok === false && r.reason === 'not-m3u8' && r.status === 200, r);
  }

  // Case 5: fetch throw(非 abort)→ network
  {
    global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const r = await preflightHls('https://x/test5.m3u8', { hymnId: 5 });
    check('fetch throw(非abort) → reason=network', r.ok === false && r.reason === 'network' && r.status === null, r);
  }

  // Case 6: 全部案例都冇拋出 —— 上面五個 case 如果有一個 throw 咗,run() 本身會
  // 喺 catch 度爆出嚟,呢度用一個額外嘅「故意整爛嘅 fetch」(random throw
  // 唔同錯誤形狀)確保仲係唔 throw。
  {
    global.fetch = async () => { const e = 'not even an Error object'; throw e; };
    let threw = false;
    let r = null;
    try { r = await preflightHls('https://x/test6.m3u8', {}); } catch (e) { threw = true; }
    check('fetch throw 非 Error 物件都唔會令 preflightHls 本身 throw', threw === false && r && r.ok === false, r);
  }

  // 每次都送咗 beacon(唔驗證送信本身,淨係驗證每次 call 完 clientLogCalls 都加咗一條)
  check('每次 preflightHls 完結都送咗一條 hlsPreflight beacon(6 次 call → 6 條)', clientLogCalls.length === 6, { n: clientLogCalls.length });
  check('beacon detail 帶埋 ctx/reason/status/ms', /ctx=start/.test(clientLogCalls[0].fields.detail), clientLogCalls[0]);

  global.fetch = origFetch;

  console.log(`\nH-A: ${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('H-A harness 本身炸咗(唔係 preflightHls 嘅責任):', e);
  process.exit(2);
});
