#!/usr/bin/env node
// ops/perf/harness/w1/backend-harness.mjs — DEEP-AUDIT-W1-EXEC-20260906 §2.2 driver
//
// 統籌 H-B1/H-B2(舊 vs 新 clientLogStore.js 寫入耗時 + 批量 flush 正確性,
// 用 child process 隔離,因為 CLIENT_LOG_DIR/MAX_FILE_BYTES 淨係喺 module
// top-level 讀一次 env,同一個 process 入面冇得中途換)、H-B3(per-IP 節流
// 正控/負控)、H-B4(size cap)、H-B5(opsMetrics 直接 call)、H-B7(node
// --check + module import 檢查)。H-B6 已經有獨立嘅 `ops/perf/
// classify-devices.mjs`,呢度唔重複跑。
//
// 每個 sub-test 嘅原始輸出、環境入帳(HEAD sha/node 版本/命令原文)全部
// dump 落 stdout 做 JSON,執行者複製落報告,唔喺呢度判斷 PASS/FAIL。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');

const SCRATCH_BASE = process.env.HARNESS_SCRATCH_DIR
  || path.join(os.tmpdir(), `w1-backend-harness-${Date.now()}`);
fs.mkdirSync(SCRATCH_BASE, { recursive: true });

function headSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.stdout.trim();
}

function runNode(scriptPath, env, timeoutMs = 60000) {
  const r = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { ok: false, error: r.stderr || r.error?.message, stdout: r.stdout };
  }
  try {
    return { ok: true, data: JSON.parse(r.stdout.trim().split('\n').pop()) };
  } catch (e) {
    return { ok: false, error: `JSON parse 失敗: ${e.message}`, stdout: r.stdout, stderr: r.stderr };
  }
}

async function main() {
  const results = { _env: { headSha: headSha(), nodeVersion: process.version, ranAt: new Date().toISOString(), scratchDir: SCRATCH_BASE } };

  // ── H-B1/H-B2:舊 vs 新 clientLogStore.js ───────────────────────────
  {
    // 由 git 攞返「改之前」嘅版本(HEAD 喺呢輪執行單開工之前就係無節流/同步
    // fs 版,因為呢個 session 仲未 commit 過)。
    // W1 Opus 驗收 #1:W1 commit 落地後 HEAD 已經係新版,對照組要釘死 pre-W1 sha(可用 env 覆寫)。
    const OLD_REF = process.env.HARNESS_OLD_REF || '17ed1bc';
    const oldSrc = spawnSync('git', ['show', `${OLD_REF}:backend/lib/clientLogStore.js`], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (oldSrc.status !== 0) throw new Error(`git show 攞唔到舊版 clientLogStore.js: ${oldSrc.stderr}`);
    const oldDir = path.join(SCRATCH_BASE, 'old', 'lib');
    fs.mkdirSync(oldDir, { recursive: true });
    const oldStorePath = path.join(oldDir, 'clientLogStore.js');
    fs.writeFileSync(oldStorePath, oldSrc.stdout);

    const workerPath = path.join(__dirname, 'backend-store-timing-worker.mjs');

    const oldRun = runNode(workerPath, {
      HARNESS_VARIANT: 'old',
      HARNESS_STORE_PATH: oldStorePath,
      HARNESS_REQUEST_COUNT: '1000',
    });
    const newDirOverride = path.join(SCRATCH_BASE, 'new-logs');
    const newRun = runNode(workerPath, {
      HARNESS_VARIANT: 'new',
      HARNESS_STORE_PATH: path.join(BACKEND_ROOT, 'lib', 'clientLogStore.js'),
      CLIENT_LOG_DIR_OVERRIDE: newDirOverride,
      HARNESS_REQUEST_COUNT: '1000',
    });

    results['H-B1_H-B2'] = { old: oldRun, new: newRun };
  }

  // ── H-B3:per-IP 節流正控/負控 ───────────────────────────────────────
  {
    const dirOverride = path.join(SCRATCH_BASE, 'ratelimit-logs');
    const run = runNode(path.join(__dirname, 'backend-http-worker.mjs'), {
      HARNESS_HTTP_MODE: 'ratelimit',
      CLIENT_LOG_DIR_OVERRIDE: dirOverride,
      // 唔設 CLIENT_LOG_RATE_MAX —— 用 production 預設(300),worker 自己讀同一個預設。
    });
    results['H-B3'] = run;
  }

  // ── H-B4:size cap(MAX_FILE_BYTES 臨時調細) ─────────────────────────
  {
    const dirOverride = path.join(SCRATCH_BASE, 'sizecap-logs');
    const run = runNode(path.join(__dirname, 'backend-http-worker.mjs'), {
      HARNESS_HTTP_MODE: 'sizecap',
      CLIENT_LOG_DIR_OVERRIDE: dirOverride,
      CLIENT_LOG_MAX_FILE_BYTES: '3000', // 好細,200 條 request 一定爆
      CLIENT_LOG_RATE_MAX: '100000', // 呢個 sub-test 唔想俾節流打岔
    });
    results['H-B4'] = run;
  }

  // ── H-B5:opsMetrics 直接 call(冇 enablePersistence,純 in-memory,
  //    唔會寫任何檔案,可以喺 driver process 自己直接 import 真檔案) ──────
  {
    const opsMetrics = await import(`file://${path.join(BACKEND_ROOT, 'lib', 'opsMetrics.js')}`);
    const { recordDeprecatedRouteHit, recordResolveOutcome, getOpsMetrics } = opsMetrics;

    for (let i = 0; i < 3; i++) recordDeprecatedRouteHit('/api/category');
    for (let i = 0; i < 3; i++) recordDeprecatedRouteHit('/api/search');
    for (let i = 0; i < 3; i++) recordDeprecatedRouteHit('/api/home');
    for (let i = 0; i < 3; i++) recordDeprecatedRouteHit('/api/audio');

    // 一次失敗 resolve outcome,ms=45000(落 30-60s bucket)。
    recordResolveOutcome(null, 45000, 'default');
    recordResolveOutcome(null, 5000, 'default');   // <10s bucket
    recordResolveOutcome(null, 15000, 'default');  // 10-30s bucket
    recordResolveOutcome(null, 90000, 'default');  // 60-120s bucket
    recordResolveOutcome(null, 130000, 'default'); // >=120s bucket

    const metrics = getOpsMetrics();

    // gauge 三個新 sibling —— setInterval sampler 30 分鐘一 tick,harness
    // 冇可能等到,呢部分改用 code review 核對(見報告方法論限制),呢度淨係
    // 證明 blankBucket() 個 shape 有呢三個新 key(undeployed gauge 初始值)。
    results['H-B5'] = {
      deprecatedRouteHits: metrics.total.deprecatedRouteHits,
      resolveFailMs: metrics.total.resolve.failMs,
      gaugesShapePresent: Object.keys(metrics.total.gauges || {}),
      note: 'gauge 嘅 sampler 寫入(server.js setInterval,30分鐘一次)未實際觸發——見報告方法論限制,呢度淨係證明 counter/histogram 兩樣(可以即時 call 到)嘅記帳啱',
    };
  }

  // ── H-B7:node --check + 逐個 module import(唔起 server.js) ──────────
  {
    const changedFiles = [
      'backend/lib/clientLogStore.js',
      'backend/lib/opsMetrics.js',
      'backend/routes/audio.js',
      'backend/routes/category.js',
      'backend/routes/clientLog.js',
      'backend/routes/hls.js',
      'backend/routes/home.js',
      'backend/routes/search.js',
      'backend/server.js',
    ];
    const nodeCheck = {};
    for (const rel of changedFiles) {
      const r = spawnSync(process.execPath, ['--check', path.join(REPO_ROOT, rel)], { encoding: 'utf8' });
      nodeCheck[rel] = { status: r.status, stderr: r.stderr?.trim() || null };
    }

    const importCheck = {};
    // server.js 明文排除(會起 server) —— 其餘逐個 import。
    const importableFiles = changedFiles.filter((f) => f !== 'backend/server.js');
    for (const rel of importableFiles) {
      try {
        await import(`file://${path.join(REPO_ROOT, rel)}?t=${Date.now()}-${Math.random()}`);
        importCheck[rel] = { ok: true };
      } catch (e) {
        importCheck[rel] = { ok: false, error: e?.message };
      }
    }
    results['H-B7'] = { nodeCheck, importCheck };
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('HARNESS FATAL:', e && e.stack || e);
  process.exit(1);
});
