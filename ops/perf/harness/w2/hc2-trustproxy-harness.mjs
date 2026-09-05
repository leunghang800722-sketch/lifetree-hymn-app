// ops/perf/harness/w2/hc2-trustproxy-harness.mjs — DEEP-AUDIT W2 §2 H-C2
//
// 測 Commit C2(trust proxy + clientIp() 優先 cf-connecting-ip)嘅實際效果。
// ⚠️ 呢度刻意做咗三組測試,唔淨係「跟返執行單原句」,因為喺寫呢個 harness
// 之前實測證實咗一個 Express 本身嘅架構限制(見下面「殘留缺口」):
//
//   `app.set('trust proxy', 1)`(或者 'loopback')淨係計「隔幾多個 hop」/
//   「peer 係咪 loopback」,唔識分「呢個 loopback peer 係真cloudflared定係
//   同一部機嘅人手動 curl」——兩種喺 socket 層面一模一樣(cloudflared 本身
//   都係經 127.0.0.1 轉發)。所以「攻擊者唔設 cf-connecting-ip、淨係亂噏
//   XFF」呢種案例,`req.ip` 依然會信 XFF——呢個殘留缺口 W1 Opus 報告本身
//   已經標明「可接受」(繞得到嘅係「直連 localhost/同一LAN」)。C2 修嘅係
//   唔同嗰個問題:「經真 Cloudflare 路嚟嘅請求,cf-connecting-ip 由 CF 邊緣
//   寫,client 呢個字冒充唔到」。
//
// 三組測試:
//   A(重現 NC-3b 原案)—— 冇 cf-connecting-ip,淨係亂噏 XFF(每次唔同值),
//     301 次全部應該 204(**呢個殘留缺口冇變,唔係 regression,亦唔係
//     C2 聲稱解決緊嘅威脅模型**)。
//   B(C2 真正防住嘅威脅模型)—— cf-connecting-ip 固定一個值(模擬真經
//     Cloudflare 嘅同一個真實客戶端),XFF 亂噏(唔同值,模擬中間隨便一層
//     或者 client 自己嘅雜訊),301 次應該喺第 301 次 429(cf-connecting-ip
//     令佢啱啱好認得返係同一個人)。
//   C(負控)—— 20 個唔同 cf-connecting-ip,各打 10 次(遠低於 RATE_MAX=300),
//     全部 204,證明唔同真實客戶端唔會互相拖累。

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// 避免 831 次合成 request 寫入真實 backend/logs/client-log/(clientLogStore.js
// 現成支援嘅 env override,唔改任何 lib code)。
process.env.CLIENT_LOG_DIR_OVERRIDE = process.env.CLIENT_LOG_DIR_OVERRIDE
  || '/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w2/client-log-dir-hc2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../../../../backend');
const express = (await import(path.join(BACKEND_DIR, 'node_modules/express/index.js'))).default;

const clientLogMod = await import(path.join(BACKEND_DIR, 'routes/clientLog.js'));

const app = express();
app.set('trust proxy', 1); // 同 server.js Commit C2 一致
app.use(express.json());
clientLogMod.default(app);

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

async function hit(headers) {
  const r = await fetch(`http://127.0.0.1:${port}/api/client-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ event: 'hc2-harness', clientTs: 'x' }),
  });
  await r.text().catch(() => {});
  return r.status;
}

const results = [];

// ── A:冇 cf-connecting-ip,XFF 每次唔同值(重現 NC-3b)──────────────────
let statusesA = [];
for (let i = 1; i <= 301; i++) {
  const status = await hit({ 'X-Forwarded-For': `198.51.100.${i % 250}` });
  statusesA.push(status);
}
results.push({
  test: 'A_spoofed_xff_no_cf_header',
  total: statusesA.length,
  count429: statusesA.filter((s) => s === 429).length,
  count204: statusesA.filter((s) => s === 204).length,
  note: '殘留缺口(W1 Opus 已標明可接受,C2 冇聲稱解決)——期望全部 204',
});

// ── B:cf-connecting-ip 固定,XFF 亂噏 ────────────────────────────────
const fixedCfIp = '203.0.113.200';
let statusesB = [];
for (let i = 1; i <= 301; i++) {
  const status = await hit({
    'cf-connecting-ip': fixedCfIp,
    'X-Forwarded-For': `198.51.100.${(i * 7) % 250}`, // 特登每次唔同,證明冇被用嚟做 key
  });
  statusesB.push(status);
}
results.push({
  test: 'B_fixed_cf_connecting_ip_noisy_xff',
  total: statusesB.length,
  count429: statusesB.filter((s) => s === 429).length,
  count204: statusesB.filter((s) => s === 204).length,
  first429At: statusesB.findIndex((s) => s === 429) + 1 || null,
  note: 'C2 實際防住嘅場景——期望第 301 次先 429(前 300 次 204)',
});

// ── C:20 個唔同 cf-connecting-ip,各打 10 次 ─────────────────────────
let count429C = 0;
let count204C = 0;
for (let k = 0; k < 20; k++) {
  const cfIp = `203.0.113.${10 + k}`;
  for (let i = 0; i < 10; i++) {
    const status = await hit({ 'cf-connecting-ip': cfIp });
    if (status === 429) count429C++; else if (status === 204) count204C++;
  }
}
results.push({
  test: 'C_distinct_cf_connecting_ip_negative_control',
  totalRequests: 200,
  count429: count429C,
  count204: count204C,
  note: '負控——期望全部 204(20×10=200 次,遠低於 RATE_MAX=300)',
});

server.close();
for (const r of results) console.log(JSON.stringify(r));
