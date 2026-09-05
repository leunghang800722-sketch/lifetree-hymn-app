// ops/perf/harness/w2/hc3-cors-harness.mjs — DEEP-AUDIT W2 §2 H-C3
//
// 唔起完整 server.js(佢會落 hymns.db/routes 全套)。呢度起一個獨立 express
// app,喺隨機 port,cors 設定逐字抄 backend/server.js Commit C3 改嗰段
// (allowlist 陣列人手同步,harness 頂部有斷言核對兩邊一致,防止之後有人
// 改咗 server.js 個 allowlist 但冇同步呢個 harness)。
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../../../../backend');
const express = (await import(path.join(BACKEND_DIR, 'node_modules/express/index.js'))).default;
const cors = (await import(path.join(BACKEND_DIR, 'node_modules/cors/lib/index.js'))).default;

// ── 核對 server.js 真身仍然係呢三個域(防 harness 同真身漂移)──────────
const serverSrc = fs.readFileSync(path.join(BACKEND_DIR, 'server.js'), 'utf8');
const EXPECTED_ORIGINS = ['https://api.odemusics.com', 'https://odemusics.com', 'https://www.odemusics.com'];
for (const o of EXPECTED_ORIGINS) {
  if (!serverSrc.includes(`'${o}'`)) {
    console.error(`FATAL: server.js 冇搵到 allowlist entry ${o} —— harness 同真身唔同步,唔可以當呢次結果有效`);
    process.exit(2);
  }
}
if (!serverSrc.includes("app.set('trust proxy', 1)")) {
  console.error('FATAL: server.js 冇 app.set(\'trust proxy\', 1) —— harness 同真身唔同步');
  process.exit(2);
}

const CORS_ALLOWED_ORIGINS = new Set(EXPECTED_ORIGINS);

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.get('/api/hymns', (req, res) => res.status(200).json({ ok: true }));

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

async function hit(origin) {
  const headers = origin ? { Origin: origin } : {};
  const r = await fetch(`http://127.0.0.1:${port}/api/hymns`, { headers });
  const acao = r.headers.get('access-control-allow-origin');
  const body = await r.text();
  return { status: r.status, acao, body };
}

const results = [];
results.push({ case: 'evil_origin', origin: 'https://evil.example', ...(await hit('https://evil.example')) });
results.push({ case: 'allowed_origin', origin: 'https://odemusics.com', ...(await hit('https://odemusics.com')) });
results.push({ case: 'allowed_origin_api_subdomain', origin: 'https://api.odemusics.com', ...(await hit('https://api.odemusics.com')) });
results.push({ case: 'allowed_origin_www', origin: 'https://www.odemusics.com', ...(await hit('https://www.odemusics.com')) });
results.push({ case: 'no_origin_rn_app', origin: null, ...(await hit(null)) });

server.close();
for (const r of results) console.log(JSON.stringify(r));
