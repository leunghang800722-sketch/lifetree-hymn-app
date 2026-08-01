// lib/loginRateLimit.js — 登入失敗限速(抽自 routes/auth.js,
// PHONE-PASSWORD-AUTH-PLAN §3.4)
//
// in-memory,單機 pattern,同 otpAuth.js 防濫用做法一致。reset 靠重啟,對
// 登入限速嚟講可接受。
//
// 兩個維度(per-IP / per-phone)各自一份獨立 state,用 makeLimiter(windowMs,
// max) 開;清一個唔會影響另一個。

function makeLimiter(windowMs, max) {
  const fails = new Map(); // key -> { count, windowStart }

  function isLocked(key) {
    const rec = fails.get(key);
    if (!rec) return false;
    if (Date.now() - rec.windowStart > windowMs) { fails.delete(key); return false; }
    return rec.count >= max;
  }

  function recordFail(key) {
    const now = Date.now();
    const rec = fails.get(key);
    if (!rec || now - rec.windowStart > windowMs) {
      fails.set(key, { count: 1, windowStart: now });
    } else {
      rec.count++;
    }
  }

  function clear(key) {
    fails.delete(key);
  }

  return { isLocked, recordFail, clear };
}

// per-IP:15 分鐘 10 次失敗 → 429(現有規格照搬,auth.js email login /
// login-phone 共用同一份 state)。
export const ipLoginLimiter = makeLimiter(15 * 60 * 1000, 10);

// per-phone(新):15 分鐘 5 次失敗 → 429。鎖電話唔會鎖死真用戶,因為 OTP
// reset 通道(PHONE-PASSWORD-AUTH-PLAN §2.3)唔受呢個限。
export const phoneLoginLimiter = makeLimiter(15 * 60 * 1000, 5);

export function clientIp(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}
