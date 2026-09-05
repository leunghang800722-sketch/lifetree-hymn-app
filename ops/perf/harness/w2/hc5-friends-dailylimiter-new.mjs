// ops/perf/harness/w2/hc5-friends-dailylimiter-new.mjs — DEEP-AUDIT W2 §2 (C5)
// NEW `makeDailyLimiter` 逐字複製自改咗之後嘅 backend/routes/friends.js
// (加咗 sweepOnThreshold 一句,control flow 冇改)。
import { sweepOnThreshold } from '../../../../backend/lib/rateLimit.js';

export function makeDailyLimiter(max) {
  const byUser = new Map();
  return {
    check(userId) {
      const d = new Date().toDateString();
      sweepOnThreshold(byUser, { isExpired: (rec) => rec.day !== d });
      const rec = byUser.get(userId);
      if (!rec || rec.day !== d) {
        return { ok: true, commit: () => byUser.set(userId, { day: d, count: 1 }) };
      }
      if (rec.count >= max) return { ok: false };
      return { ok: true, commit: () => { rec.count++; } };
    },
  };
}
