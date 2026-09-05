// ops/perf/harness/w2/hc5-admin-me-driver.mjs — DEEP-AUDIT W2 §2 (C5)
//
// admin.js previewRateLimited / me.js isRateLimited 兩個決策邏輯本身就係
// 「count 全部 request、window 由第一擊起計」,同 lib/rateLimit.js
// makeLimiter() 語意完全一致(呢個算法已經俾 Commit B 嘅 b3-harness.mjs
// 對四個獨立 route——invites/share/presence/clientLog——逐 byte 驗證過
// before/after 一致)。呢度淨係做多一次直接單元對照(舊版手抄邏輯 vs
// makeLimiter()),唔使再拖 requireAuth/JWT 全套嚟起 HTTP 層面 harness。
import { makeLimiter } from '../../../../backend/lib/rateLimit.js';

// ── OLD:逐字抄 admin.js previewRateLimited(git show 43589c7)────────────
function oldRateLimiterFactory(windowMs, max) {
  const byUser = new Map();
  return (userId) => {
    const now = Date.now();
    const rec = byUser.get(userId);
    if (!rec || now - rec.windowStart > windowMs) {
      byUser.set(userId, { count: 1, windowStart: now });
      return false;
    }
    rec.count++;
    return rec.count > max;
  };
}

const PREVIEW_RATE_WINDOW_MS = 60 * 1000;
const PREVIEW_RATE_MAX = 10;
const oldPreviewRateLimited = oldRateLimiterFactory(PREVIEW_RATE_WINDOW_MS, PREVIEW_RATE_MAX);

const newPreviewLimiter = makeLimiter({ name: 'admin-preview', keyOf: (x) => x, max: PREVIEW_RATE_MAX, windowMs: PREVIEW_RATE_WINDOW_MS });
const newPreviewRateLimited = (userId) => newPreviewLimiter.check(userId);

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const oldMeIsRateLimited = oldRateLimiterFactory(RATE_WINDOW_MS, RATE_MAX);
const newMeLimiter = makeLimiter({ name: 'me-sync', keyOf: (x) => x, max: RATE_MAX, windowMs: RATE_WINDOW_MS });
const newMeIsRateLimited = (userId) => newMeLimiter.check(userId);

// 逐個 i 對照 old vs new(兩個 fn 各自有獨立 Map,唔會互相污染)。
function compare(oldFn, newFn, max, label) {
  const out = [];
  for (let i = 1; i <= max + 1; i++) {
    out.push({ label, i, old: oldFn(777), new: newFn(777) });
  }
  // 5 個唔同 user 各打一次
  for (const uid of [1, 2, 3, 4, 5]) {
    out.push({ label, uid, old: oldFn(uid), new: newFn(uid) });
  }
  return out;
}

const previewResults = compare(oldPreviewRateLimited, newPreviewRateLimited, PREVIEW_RATE_MAX, 'admin-preview');
const meResults = compare(oldMeIsRateLimited, newMeIsRateLimited, RATE_MAX, 'me-sync');

let allMatch = true;
for (const r of [...previewResults, ...meResults]) {
  if (r.old !== r.new) allMatch = false;
  console.log(JSON.stringify(r));
}
console.log(JSON.stringify({ summary: 'allMatch', value: allMatch }));
