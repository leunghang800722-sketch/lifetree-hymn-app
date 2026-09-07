#!/usr/bin/env node
// HLS-PREFLIGHT-EXEC-20260907 §3 H-D(iOS,執行者做嘅呢一次)—— 見報告
// §H-D 段解釋點解冇做真機/iOS Simulator 全流程(要重新 export+patch Hermes
// bundle 落一個已裝嘅 dev-client .app,幅度超出呢個 session 合理範圍)。
//
// 呢度做嘅係「隔離 backend 副本喺另一 port 對某 id 回 403」嘅**核心可驗證
// 部分**:真係起一個獨立 http server(唔掂 prod backend/hymns.db 一個字),
// 對一個測試 id 嘅 `.m3u8` 端點回 403,然後用真身 `preflightHls()`(同 H-A
// 一樣嘅「babel 真 module」手法攞返嚟,唔係抄邏輯)打真 HTTP 去嗰個獨立
// server,量真實 round-trip 需要幾耐先偵測到 403、同 native 16 秒看門狗死線
// 之間剩幾多秒畀「熱換 progressive」用(§6 點3 講嘅「睇門狗 16s 內剩 ≥11s」)。
'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const PREFLIGHT_PATH = path.join(APP_ROOT, 'src/hlsPreflight.js');
const CLIENTLOG_PATH = path.join(APP_ROOT, 'src/clientLog.js');
const babel = require(path.join(APP_ROOT, 'node_modules/@babel/core'));

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
const { preflightHls } = require(PREFLIGHT_PATH);
Module._extensions['.js'] = origJsCompiler;

const NATIVE_WATCHDOG_DEADLINE_MS = 16000; // NATIVE-STALL-WATCHDOG-PLAN 既有死線,呢個 harness 冇改佢,純粹用嚟計margin

async function main() {
  // ---- 隔離 backend 副本(獨立 http server,隨機 port,唔掂 prod backend) ----
  let hitCount403 = 0;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/stream/9999.m3u8')) {
      hitCount403++;
      // 真實 googlevideo 403 一分鐘節流窗嘅簡化版:即刻回 403(唔延遲),
      // 因為呢度測嘅係「preflightHls 收到 403 要幾耐」,唔係 backend 內部
      // 嘅 head-fetch/backoff/retry(嗰部分已經喺 H-C 用真身 routes/hls.js
      // 測過)。
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.url.startsWith('/api/stream/9999')) {
      // 熱換之後 App 會攞嘅 progressive URL——證明「隔離副本」呢個 id 嘅
      // progressive 端點係好嘅,熱換之後真係有嘢播(唔係兩條路都死)。
      res.writeHead(200, { 'Content-Type': 'audio/mp4' });
      res.end(Buffer.from('FAKE-AUDIO-BYTES'));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`[隔離 backend 副本] 監聽 ${base}(對 id=9999 嘅 .m3u8 回 403,progressive 正常)`);

  const m3u8Url = `${base}/api/stream/9999.m3u8`;
  const t0 = Date.now();
  const pre = await preflightHls(m3u8Url, { hymnId: 9999, ctx: 'start' });
  const elapsedMs = Date.now() - t0;
  const marginMs = NATIVE_WATCHDOG_DEADLINE_MS - elapsedMs;

  console.log(`\n[結果] preflightHls 對隔離副本嘅 403 端點: ${JSON.stringify(pre)}`);
  console.log(`  真實 HTTP round-trip 耗時: ${elapsedMs}ms`);
  console.log(`  native 16s 看門狗死線剩返: ${marginMs}ms(§6 點3 要求 ≥11000ms)`);
  console.log(`  hlsPreflight beacon 送咗: ${clientLogCalls.length} 條`);
  console.log(`  獨立 server 收到嘅 .m3u8 請求次數: ${hitCount403}(=1,證明冇重試——preflightHls 本身唔重試)`);

  // progressive 端點驗證一下(證明「隔離副本」呢個 id 真係有嘢可以熱換去)。
  const progRes = await fetch(`${base}/api/stream/9999`);
  console.log(`  progressive 端點(熱換之後會攞嘅 URL)status: ${progRes.status}`);

  let pass = 0, fail = 0;
  function check(name, cond) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } }
  check('preflightHls 正確判 403(ok=false, reason=status:403)', pre.ok === false && pre.reason === 'status:403');
  check('真實 round-trip 遠低於 5s timeoutMs(本機 loopback,無 tunnel RTT)', elapsedMs < 5000);
  check('睇門狗 16s 死線剩 ≥11s 俾熱換 progressive(§6 點3)', marginMs >= 11000);
  check('.m3u8 端點淨係俾打中 1 次(preflightHls 本身唔重試)', hitCount403 === 1);
  check('熱換去嘅 progressive 端點正常(200)', progRes.status === 200);

  server.close();
  console.log(`\nH-D(iOS,隔離 backend 真 HTTP 部分): ${pass} pass / ${fail} fail`);
  console.log('⚠️ 呢個唔係完整 iOS Simulator/真機行為驗證(App 冇真係跑,冇睇到「唔跳歌」嘅 UI/native 行為)——');
  console.log('   完整兩平台 403 情境確認留返俾 Opus(執行單 §5/H-D 本身寫明「由 Opus 做」);呢度證明嘅係');
  console.log('   preflightHls() 對住一個會真係 403 嘅獨立 backend,真實網絡延遲下嘅偵測時間同睇門狗 margin。');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('H-D harness 本身炸咗:', e); process.exit(2); });
