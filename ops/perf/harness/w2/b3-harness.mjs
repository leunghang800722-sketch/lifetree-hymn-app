// ops/perf/harness/w2/b3-harness.mjs — DEEP-AUDIT W2 Commit B3
//
// 舊實作 vs 新實作嘅節流布林序列對照。**唔起完整 server.js**——用 express
// 起單一 route 嘅 router 喺隨機 port(process.env.PORT=0 由 OS 分配),淨係
// send request 睇 429 定唔係 429,唔掂 prod 歌庫任何寫入路徑。
//
// 用法:node b3-harness.mjs <invites|share|presence|clientlog>
// 要喺 Commit B 改動前後各行一次,兩次輸出逐行 diff 要一致(H-B 證據)。
//
// 「過窗後再打」嗰步唔靠真係等 15 分鐘/60 秒——monkeypatch `Date.now`(單一
// 呢個 harness process 入面,唔影響 prod)令節流邏輯(以及改後嘅
// makeLimiter)自己讀到嘅「而家」跳去窗口之後,同真實等鐘一樣嘅效果。

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// ⚠️ 呢個 harness 刻意擺喺 ops/perf/harness/w2/(唔准放 backend/ 底下,執行單
// §1「唔包/紅線」),但 express 淨係喺 backend/node_modules 有——ESM 嘅
// node_modules 解析係跟住「importing 模組自己個路徑」逐層向上搵,唔係跟
// cwd,呢個檔案嘅上層冇 node_modules,所以帶埋絕對路徑直接 import
// backend 嗰份(唔裝多一份、唔起 backend 入面嘅新檔案)。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../../../../backend');
const express = (await import(path.join(BACKEND_DIR, 'node_modules/express/index.js'))).default;

process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-test-secret-not-real';
// clientlog 測試會行過 lib/clientLogStore.js 嘅 appendClientLog()——佢預設寫
// 落 backend/logs/client-log/(真實診斷 log 目錄)。呢個 env override 本身
// 已經係 clientLogStore.js 現成支援嘅逃生門,唔使改任何 lib code,將呢次
// harness 嘅 301 條合成 beacon 導去 scratchpad,唔沾手真實診斷資料。
process.env.CLIENT_LOG_DIR_OVERRIDE = process.env.CLIENT_LOG_DIR_OVERRIDE
  || '/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w2/client-log-dir';

const kind = process.argv[2];
if (!kind) {
  console.error('usage: node b3-harness.mjs <invites|share|presence|clientlog>');
  process.exit(2);
}

function withFakeNow(deltaMs, fn) {
  const real = Date.now;
  const base = real();
  Date.now = () => base + deltaMs;
  try { return fn(); } finally { Date.now = real; }
}

async function withFakeNowAsync(deltaMs, fn) {
  const real = Date.now;
  const base = real();
  Date.now = () => base + deltaMs;
  try { return await fn(); } finally { Date.now = real; }
}

async function startApp(mountFn) {
  const app = express();
  app.use(express.json());
  await mountFn(app);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, port };
}

async function hit(port, method, path, ip, body) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // 消耗埋 body,唔留手柄。
  await r.text().catch(() => {});
  return r.status;
}

// ── 每種 route 嘅測試規格(method/path/body/windowMs/max)───────────────
const SPECS = {
  invites: {
    mod: '../../../../backend/routes/invites.js',
    exportName: 'default',
    method: 'POST',
    path: '/api/auth/invite-check',
    body: {}, // 空 code -> 過咗節流檢查之後即刻 `res.json({valid:false})`,唔掂 DB
    max: 10, // CHECK_RATE_MAX 預設(冇 env override)
    windowMs: 15 * 60 * 1000,
  },
  share: {
    mod: '../../../../backend/routes/share.js',
    exportName: 'default',
    method: 'GET',
    path: '/api/p/nonexistent-harness-token',
    body: undefined,
    max: 60,
    windowMs: 15 * 60 * 1000,
  },
  presence: {
    mod: '../../../../backend/routes/presence.js',
    exportName: 'default',
    method: 'POST',
    path: '/api/presence/heartbeat',
    body: {}, // 冇 Authorization header + 冇 deviceId -> 當訪客,唔計 presence Map
    max: 300,
    windowMs: 60 * 1000,
  },
  clientlog: {
    mod: '../../../../backend/routes/clientLog.js',
    exportName: 'default',
    method: 'POST',
    path: '/api/client-log',
    body: { event: 'b3-harness', clientTs: 'x' },
    max: 300,
    windowMs: 60 * 1000,
  },
};

const spec = SPECS[kind];
if (!spec) { console.error('unknown kind', kind); process.exit(2); }

const mod = await import(spec.mod);
const mountFn = mod[spec.exportName];

const { server, port } = await startApp(async (app) => { mountFn(app); });

const results = [];
try {
  // ── (a) 同一 IP 打 max+1 次 ──────────────────────────────────────
  const ipA = '203.0.113.11';
  for (let i = 1; i <= spec.max + 1; i++) {
    const status = await hit(port, spec.method, spec.path, ipA, spec.body);
    results.push({ phase: 'sameIp', i, ip: ipA, status, limited: status === 429 });
  }

  // ── (b) 5 個唔同 IP,各打 1 次 ─────────────────────────────────────
  const otherIps = ['203.0.113.21', '203.0.113.22', '203.0.113.23', '203.0.113.24', '203.0.113.25'];
  for (const ip of otherIps) {
    const status = await hit(port, spec.method, spec.path, ip, spec.body);
    results.push({ phase: 'distinctIp', ip, status, limited: status === 429 });
  }

  // ── (c) 過咗窗口之後,ipA 再打一次 —— 應該恢復未 limited ────────────
  const afterWindowStatus = await withFakeNowAsync(spec.windowMs + 1000, () => hit(port, spec.method, spec.path, ipA, spec.body));
  results.push({ phase: 'afterWindow', ip: ipA, status: afterWindowStatus, limited: afterWindowStatus === 429 });
} finally {
  server.close();
}

// 淨輸出布林序列(status 一齊列出方便肉眼核對 429 語意),唔輸出時間戳
// (避免每次跑個 log 都唔一樣,搞到 diff 誤判)。
for (const r of results) {
  console.log(JSON.stringify(r));
}
