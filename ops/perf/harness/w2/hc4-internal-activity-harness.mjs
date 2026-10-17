// ops/perf/harness/w2/hc4-internal-activity-harness.mjs — DEEP-AUDIT W2 §2 H-C4
//
// 起獨立 express app(隨機 port)重現 server.js Commit C4 加嘅 localhost-only
// guard(邏輯逐字抄——唔起完整 server.js)。
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../../../../backend');
const express = (await import(path.join(BACKEND_DIR, 'node_modules/express/index.js'))).default;

// ── 核對 server.js 真身仍然有呢個 guard(防 harness 同真身漂移)──────
const serverSrc = fs.readFileSync(path.join(BACKEND_DIR, 'server.js'), 'utf8');
if (!serverSrc.includes('LOOPBACK_ADDRS') || !serverSrc.includes("req.socket.remoteAddress") || !serverSrc.includes("req.headers['cf-ray']")) {
  console.error('FATAL: server.js 冇搵到 localhost-only guard —— harness 同真身唔同步');
  process.exit(2);
}

const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const app = express();
app.set('trust proxy', 1);
app.get('/api/internal/activity', (req, res) => {
  // W2 Opus 驗收 #1 修法(同 server.js 逐字):tunnel 帶 cf-* header 即當外部。
  const viaTunnel = !!(req.headers['cf-connecting-ip'] || req.headers['cf-ray']);
  if (viaTunnel || !LOOPBACK_ADDRS.has(req.socket.remoteAddress)) {
    return res.status(404).end();
  }
  res.json({ streaming: false });
});

// 0.0.0.0 綁埋所有介面(唔淨係 127.0.0.1)——先至有得由 LAN IP 連返嚟做
// 「真.非-loopback socket」正控(下面)。呢個 harness process 一行完即刻
// server.close(),唔會留低任何長駐 listener。
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
const port = server.address().port;

async function hit(headers, host = '127.0.0.1') {
  const r = await fetch(`http://${host}:${port}/api/internal/activity`, { headers: headers || {} });
  await r.text().catch(() => {});
  return r.status;
}

const results = [];
// (a) 由 127.0.0.1(harness 本身就係經 loopback 連,同真實 growLibrary.js
//     打法一致)冇任何額外 header —— 期望 200。
results.push({ case: 'plain_loopback', status: await hit() });

// (b) X-Forwarded-For 假裝外部 IP —— 因為 guard 睇嘅係 `req.socket.
//     remoteAddress`(TCP 連線事實)唔係 header,呢個 socket 本身仍然係
//     127.0.0.1(harness 冇能力由 Node 內部偽造唔同 remoteAddress 嚟連接
//     同一個 loopback listener),所以**期望依然係 200**——寫低呢個限制:
//     呢條 harness 冇能力做「真.非 loopback socket」正控(見下面注解),
//     淨係證明「XFF 呃唔到 guard」呢一半。
results.push({ case: 'spoofed_xff_still_loopback_socket', status: await hit({ 'X-Forwarded-For': '203.0.113.99' }) });
results.push({ case: 'cf_connecting_ip_via_tunnel_loopback_socket_expect404', status: await hit({ 'cf-connecting-ip': '203.0.113.99' }) });
results.push({ case: 'cf_ray_via_tunnel_loopback_socket_expect404', status: await hit({ 'cf-ray': 'abc123-HKG' }) });

// ── 正控:由呢部機真.LAN IP 連返嚟(唔係 127.0.0.1)—— socket 層面真係
// 唔係 loopback,期望 404。搵一個 non-internal IPv4 介面(通常 en0);搵唔到
// 就跳過,寫明原因(而唔係假裝做咗)。
const ifaces = os.networkInterfaces();
let lanIp = null;
for (const addrs of Object.values(ifaces)) {
  for (const a of addrs || []) {
    if (a.family === 'IPv4' && !a.internal) { lanIp = a.address; break; }
  }
  if (lanIp) break;
}
if (lanIp) {
  const status = await hit({}, lanIp);
  results.push({ case: 'real_non_loopback_socket_positive_control', host: lanIp, status });
} else {
  results.push({ case: 'real_non_loopback_socket_positive_control', skipped: true, reason: '呢部機搵唔到 non-internal IPv4 介面' });
}

server.close();
for (const r of results) console.log(JSON.stringify(r));
