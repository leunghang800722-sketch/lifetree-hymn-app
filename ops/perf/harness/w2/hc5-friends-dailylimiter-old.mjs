// ops/perf/harness/w2/hc5-friends-dailylimiter-old.mjs — DEEP-AUDIT W2 §2 (C5)
// OLD `makeDailyLimiter` 逐字複製自 git show 43589c7:backend/routes/friends.js
export function makeDailyLimiter(max) {
  const byUser = new Map();
  return {
    check(userId) {
      const d = new Date().toDateString();
      const rec = byUser.get(userId);
      if (!rec || rec.day !== d) {
        return { ok: true, commit: () => byUser.set(userId, { day: d, count: 1 }) };
      }
      if (rec.count >= max) return { ok: false };
      return { ok: true, commit: () => { rec.count++; } };
    },
  };
}
