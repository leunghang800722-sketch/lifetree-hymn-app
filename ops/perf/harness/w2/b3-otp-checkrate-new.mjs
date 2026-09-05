// ops/perf/harness/w2/b3-otp-checkrate-new.mjs — DEEP-AUDIT W2 Commit B3
//
// NEW `checkRate()` 邏輯逐字複製自改咗之後嘅 backend/routes/otpAuth.js
// (淨係加咗 sweepOnThreshold 兩句,`export` 前綴唔算數——冧本身冇改)。
// 摘出嚟做單元測試嘅理由同 b3-otp-checkrate-old.mjs 一樣。
import { sweepOnThreshold } from '../../../../backend/lib/rateLimit.js';

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
function isStaleDayRec(rec, now) { return rec.day !== new Date(now).toDateString(); }

export function checkRate(phone, ip) {
  rollGlobal();
  if (globalCount >= OTP_DAILY_CAP) return { ok: false, code: 'global_cap' };

  sweepOnThreshold(perPhone, { isExpired: isStaleDayRec });
  sweepOnThreshold(perIp, { isExpired: isStaleDayRec });

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
