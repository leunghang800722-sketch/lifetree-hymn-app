#!/usr/bin/env node
// ops/perf/harness/w1/backend-store-timing-worker.mjs — DEEP-AUDIT-W1-EXEC-20260906 H-B1/H-B2
//
// 呢個係一個「一次性 child process」worker,由 backend-harness.mjs 用
// `spawn` 起。每個 variant(old/new)喺**自己獨立嘅 process**入面跑,
// 因為 lib/clientLogStore.js 嘅 `MAX_FILE_BYTES`/`CLIENT_LOG_DIR`(new 版)
// 淨係喺 module top-level 讀一次 env,同一個 process 入面冇得中途換。
//
// 環境變數:
//   HARNESS_VARIANT   = 'old' | 'new'
//   HARNESS_STORE_PATH= appendClientLog 嘅模組路徑(old 版指去 git show 出嚟
//                       嘅臨時檔;new 版直接指去真實 backend/lib/clientLogStore.js)
//   CLIENT_LOG_DIR_OVERRIDE(new 專用,old 淨係靠複製檔案所在目錄嘅相對路徑天然隔離)
//   HARNESS_REQUEST_COUNT(預設 1000)
//
// 輸出:一嚿 JSON 落 stdout,包含:
//   handlerTimingMs: { p50, p90, max, totalWallMs }
//   fsSyncCallCounts: 喺 1000 次 append 過程入面,spy 到嘅 fs.*Sync call 次數
//   flush: { waitedMs, jsonlLineCount, allLinesValid, orderPreserved, sampleLine }
import fs from 'fs';
import path from 'path';

const VARIANT = process.env.HARNESS_VARIANT;
const STORE_PATH = process.env.HARNESS_STORE_PATH;
const REQUEST_COUNT = Number(process.env.HARNESS_REQUEST_COUNT || 1000);

if (!VARIANT || !STORE_PATH) {
  console.error('缺 HARNESS_VARIANT/HARNESS_STORE_PATH');
  process.exit(2);
}

async function main() {
  // ── fs spy(裝喺 import 之前——mkdirSync/chmodSync 喺 module load 果陣
  //    already 行咗,呢度要计入定要之後,睇你想證邊件事。呢度分兩個計數器:
  //    「模組載入期間」(mkdir/chmod 應該係呢度做)同「1000 次 append 期間」
  //    (應該淨係第一次 statSync 一次,唔可以有 appendFileSync)。
  const counts = { mkdirSync: 0, chmodSync: 0, statSync: 0, appendFileSync: 0, appendFile_async: 0 };
  const origMkdirSync = fs.mkdirSync;
  const origChmodSync = fs.chmodSync;
  const origStatSync = fs.statSync;
  const origAppendFileSync = fs.appendFileSync;
  const origAppendFile = fs.appendFile;
  fs.mkdirSync = (...a) => { counts.mkdirSync++; return origMkdirSync.apply(fs, a); };
  fs.chmodSync = (...a) => { counts.chmodSync++; return origChmodSync.apply(fs, a); };
  fs.statSync = (...a) => { counts.statSync++; return origStatSync.apply(fs, a); };
  fs.appendFileSync = (...a) => { counts.appendFileSync++; return origAppendFileSync.apply(fs, a); };
  fs.appendFile = (...a) => { counts.appendFile_async++; return origAppendFile.apply(fs, a); };

  const moduleLoadCounts = { ...counts };
  const mod = await import(`file://${STORE_PATH}`);
  moduleLoadCounts.mkdirSync = counts.mkdirSync;
  moduleLoadCounts.chmodSync = counts.chmodSync;

  const { appendClientLog, CLIENT_LOG_DIR } = mod;

  // 由呢度開始,先計「1000 次 append 期間」嘅 sync fs 用量(唔計 module load 嗰吓)。
  const beforeLoop = { ...counts };

  const durationsMs = [];
  const wallStart = process.hrtime.bigint();
  for (let i = 0; i < REQUEST_COUNT; i++) {
    const t0 = process.hrtime.bigint();
    appendClientLog({
      event: 'perfMarks',
      clientTs: new Date().toISOString(),
      platform: 'ios',
      deviceId: 'harness-device-id-0000000000000001',
      appVersion: '9.9.9-harness',
      updateId: 'harness-update-id',
      sessionId: `sess-${i}`,
      detail: `n=${i} app=100 cont=150 hymnsMs=900`,
    });
    const t1 = process.hrtime.bigint();
    durationsMs.push(Number(t1 - t0) / 1e6);
  }
  const wallEnd = process.hrtime.bigint();
  const totalWallMs = Number(wallEnd - wallStart) / 1e6;

  const afterLoop = { ...counts };
  const duringLoop = {
    mkdirSync: afterLoop.mkdirSync - beforeLoop.mkdirSync,
    chmodSync: afterLoop.chmodSync - beforeLoop.chmodSync,
    statSync: afterLoop.statSync - beforeLoop.statSync,
    appendFileSync: afterLoop.appendFileSync - beforeLoop.appendFileSync,
    appendFile_async: afterLoop.appendFile_async - beforeLoop.appendFile_async,
  };

  durationsMs.sort((a, b) => a - b);
  const pct = (p) => durationsMs[Math.min(durationsMs.length - 1, Math.floor((p / 100) * durationsMs.length))];

  // ── 等 buffer flush 晒(new 版係 async,舊版本身就已經同步寫完)──────
  const waitStart = Date.now();
  await new Promise((r) => setTimeout(r, 2000)); // > FLUSH_INTERVAL_MS(1s)兩個身位
  const waitedMs = Date.now() - waitStart;

  const todayFile = path.join(CLIENT_LOG_DIR, `client-log-${new Date().toISOString().slice(0, 10)}.jsonl`);
  let lines = [];
  let readErr = null;
  try {
    const text = fs.readFileSync(todayFile, 'utf8');
    lines = text.split('\n').filter((l) => l.trim());
  } catch (e) {
    readErr = e?.message;
  }
  let allLinesValid = true;
  let orderPreserved = true;
  const parsed = [];
  for (const l of lines) {
    try {
      parsed.push(JSON.parse(l));
    } catch (_) {
      allLinesValid = false;
    }
  }
  for (let i = 0; i < parsed.length; i++) {
    const m = /n=(\d+)/.exec(parsed[i].detail || '');
    if (!m || Number(m[1]) !== i) { orderPreserved = false; break; }
  }

  const result = {
    variant: VARIANT,
    requestCount: REQUEST_COUNT,
    handlerTimingMs: {
      p50: pct(50), p90: pct(90), max: durationsMs[durationsMs.length - 1], totalWallMs,
    },
    fsSyncCallCounts: { moduleLoad: { mkdirSync: moduleLoadCounts.mkdirSync, chmodSync: moduleLoadCounts.chmodSync }, duringLoop },
    flush: {
      waitedMs, jsonlPath: todayFile, jsonlLineCount: lines.length, allLinesValid, orderPreserved, readErr,
      sampleLine: parsed[0] || null,
    },
  };
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error('WORKER FATAL:', e && e.stack || e);
  process.exit(1);
});
