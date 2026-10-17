// ops/perf/harness/w2/b3-otp-checkrate-old.mjs — DEEP-AUDIT W2 Commit B3
//
// OLD `checkRate()` 邏輯逐字複製自 `git show 43589c7:backend/routes/otpAuth.js`
// (只加咗一個 `export`,冧本身零改動)——摘出嚟做單元測試,因為完整
// otpAuth.js 有 jwt/bcrypt/authSecret 等 import,喺 scratchpad 呢個相對路徑
// 解析唔到,亦冇必要為咗測 checkRate() 呢個純 Map/Date 邏輯拖埋成個 module。
const OTP_DAILY_CAP = 100;
const perPhone = new Map();
const perIp = new Map();
let globalDay = new Date().toDateString();
let globalCount = 0;
const PHONE_COOLDOWN_MS = 60 * 1000;
const PHONE_DAILY = 5;
const IP_DAILY = 10;

function today() { return new Date().toDateString(); }
function rollGlobal() { const d = today(); if (d !== globalDay) { globalDay = d; globalCount = 0; } }

export function checkRate(phone, ip) {
  rollGlobal();
  if (globalCount >= OTP_DAILY_CAP) return { ok: false, code: 'global_cap' };

  const d = today();
  const p = perPhone.get(phone) || { lastAt: 0, dayCount: 0, day: d };
  if (p.day !== d) { p.dayCount = 0; p.day = d; }
  if (Date.now() - p.lastAt < PHONE_COOLDOWN_MS) return { ok: false, code: 'cooldown' };
  if (p.dayCount >= PHONE_DAILY) return { ok: false, code: 'phone_cap' };

  const ipRec = perIp.get(ip) || { dayCount: 0, day: d };
  if (ipRec.day !== d) { ipRec.dayCount = 0; ipRec.day = d; }
  if (ipRec.dayCount >= IP_DAILY) return { ok: false, code: 'ip_cap' };

  return { ok: true, commit: () => {
    p.lastAt = Date.now(); p.dayCount++; perPhone.set(phone, p);
    ipRec.dayCount++; perIp.set(ip, ipRec);
    globalCount++;
  } };
}

export function mapSizes() { return { perPhone: perPhone.size, perIp: perIp.size }; }
