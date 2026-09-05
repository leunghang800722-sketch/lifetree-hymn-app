#!/usr/bin/env node
// ops/perf/harness/w1/backend-http-worker.mjs — DEEP-AUDIT-W1-EXEC-20260906 H-B3/H-B4
//
// 起一個獨立 express app(隨機 port),掛真實 `backend/routes/clientLog.js`
// (連埋佢真正 import 嘅 `../lib/clientLogStore.js`/`../lib/loginRateLimit.js`,
// 一個字冇改過)。**唔起第二個完整 server 打 prod 歌庫**——呢度淨係
// `express()` + 一條 route,唔起 hymns.db、唔起 resolveAudio/yt-dlp。
// CLIENT_LOG_DIR_OVERRIDE 指去隔離嘅 scratch 目錄,唔會寫入
// `backend/logs/client-log/`(嗰度嘅數據仲要俾 classify-devices.mjs 讀住做
// 1E 對數,唔可以污染)。
//
// 環境變數:
//   HARNESS_HTTP_MODE = 'ratelimit' | 'sizecap'
//   CLIENT_LOG_DIR_OVERRIDE(必要)
//   CLIENT_LOG_RATE_MAX(ratelimit 模式用,唔設就用 production 預設 300)
//   CLIENT_LOG_MAX_FILE_BYTES(sizecap 模式用)
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'backend');

const MODE = process.env.HARNESS_HTTP_MODE;
if (!MODE) { console.error('缺 HARNESS_HTTP_MODE'); process.exit(2); }
if (!process.env.CLIENT_LOG_DIR_OVERRIDE) { console.error('缺 CLIENT_LOG_DIR_OVERRIDE(避免寫入 prod log)'); process.exit(2); }

async function post(port, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/client-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function main() {
  const expressMod = await import(`file://${path.join(BACKEND_ROOT, 'node_modules', 'express', 'index.js')}`);
  const express = expressMod.default;
  const clientLogRoutesMod = await import(`file://${path.join(BACKEND_ROOT, 'routes', 'clientLog.js')}`);
  const clientLogRoutes = clientLogRoutesMod.default;

  const app = express();
  app.use(express.json());
  clientLogRoutes(app);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  const sampleBody = { event: 'perfMarks', clientTs: new Date().toISOString(), platform: 'ios', deviceId: 'harness', detail: 'harness-http-test' };

  let result;
  if (MODE === 'ratelimit') {
    // 正控:同一個 IP 打 RATE_MAX+1 條(用 X-Forwarded-For 固定同一個假 IP),
    // 第 RATE_MAX+1 條要 429。
    const sameIp = '203.0.113.10';
    const statuses = [];
    // W1 Opus 驗收後預設由 120 改 300:打 RATE_MAX+1 條,第 RATE_MAX+1 條要 429。
    const RATE_MAX = Number(process.env.CLIENT_LOG_RATE_MAX || 300);
    const N = RATE_MAX + 1;
    for (let i = 0; i < N; i++) {
      statuses.push(await post(port, sampleBody, { 'X-Forwarded-For': sameIp }));
    }
    const okCount = statuses.filter((s) => s === 204).length;
    const limitedCount = statuses.filter((s) => s === 429).length;
    const firstLimitedAt = statuses.indexOf(429);

    // 負控:20 個唔同 IP 各 10 條,全部應該 200(204)。
    const negControlStatuses = [];
    for (let ipN = 0; ipN < 20; ipN++) {
      const ip = `198.51.100.${ipN + 1}`;
      for (let i = 0; i < 10; i++) {
        negControlStatuses.push(await post(port, sampleBody, { 'X-Forwarded-For': ip }));
      }
    }
    const negControlAll204 = negControlStatuses.every((s) => s === 204);

    result = {
      mode: 'ratelimit',
      positiveControl: { rateMax: RATE_MAX, totalRequests: N, status204Count: okCount, status429Count: limitedCount, firstLimitedAtRequestIndex1Based: firstLimitedAt === -1 ? null : firstLimitedAt + 1 },
      negativeControl: { totalIps: 20, requestsPerIp: 10, totalRequests: negControlStatuses.length, all204: negControlAll204, distinctStatuses: Array.from(new Set(negControlStatuses)) },
    };
  } else if (MODE === 'sizecap') {
    // MAX_FILE_BYTES 由 env 調到好細(例如 2000 bytes),不斷打到頂為止,
    // 證明:(a) response 照 200/204(b) 持久化底停低喺上限附近(c) stdout/
    // response 唔受影響(呢度淨睇 status)。
    const statuses = [];
    for (let i = 0; i < 200; i++) {
      statuses.push(await post(port, { ...sampleBody, detail: `sizecap-test-${i}-${'x'.repeat(50)}` }, { 'X-Forwarded-For': `10.0.0.${(i % 250) + 1}` }));
    }
    const all204 = statuses.every((s) => s === 204);
    await new Promise((r) => setTimeout(r, 2000));
    const fs = await import('fs');
    const { CLIENT_LOG_DIR } = await import(`file://${path.join(BACKEND_ROOT, 'lib', 'clientLogStore.js')}`);
    const todayFile = path.join(CLIENT_LOG_DIR, `client-log-${new Date().toISOString().slice(0, 10)}.jsonl`);
    let fileBytes = null;
    try { fileBytes = fs.statSync(todayFile).size; } catch (_) {}
    result = {
      mode: 'sizecap',
      maxFileBytesEnv: process.env.CLIENT_LOG_MAX_FILE_BYTES,
      requestsSent: 200,
      allResponsesWere204: all204,
      finalFileBytes: fileBytes,
    };
  } else {
    console.error('未知 HARNESS_HTTP_MODE:', MODE);
    process.exit(2);
  }

  server.close();
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error('WORKER FATAL:', e && e.stack || e);
  process.exit(1);
});
