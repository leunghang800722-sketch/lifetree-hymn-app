// lib/requireAdmin.js — 疊喺 requireAuth 後面用:
//   app.use('/api/admin', requireAuth, requireAdmin, ...)
// (MEMBERSHIP-PHASE2-ADMIN-PLAN §3.1)
//
// req.user.role 係 requireAuth 啱啱先由 DB SELECT 返嚟嘅,唔係 token
// payload——母 plan「每次由 DB 重新核實」呢度已經齊,唔使第二次 query。
// 另加 per-user 限速(抄 routes/me.js 嗰個 Map pattern),60/min。

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const rateByUser = new Map(); // user_id -> { count, windowStart }

function isRateLimited(userId) {
  const now = Date.now();
  const rec = rateByUser.get(userId);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    rateByUser.set(userId, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > RATE_MAX;
}

export default function requireAdmin(req, res, next) {
  if ((req.user?.role || 'member') !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (isRateLimited(req.user.id)) return res.status(429).json({ error: 'rate_limited' });
  next();
}
