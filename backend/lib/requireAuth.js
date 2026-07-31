// lib/requireAuth.js — 會員系統 Phase 1 同步 API 用嘅 auth middleware
// (MEMBERSHIP-PHASE1-LOGIN-SYNC §1.2)
//
// 驗 Authorization: Bearer <jwt>,decode 出 id 之後由 users.db 確認用戶
// 仲存在(而唔係齋信 token payload),順手更新 last_seen_at。掛 req.user。

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './authSecret.js';
import { getUserDb } from './userDb.js';

export default async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const db = await getUserDb();
    // role 由 DB 每個 request 重新讀(唔信 token payload)—— MEMBERSHIP-PHASE2-ADMIN-PLAN
    // §2.3/§3.1:requireAdmin 直接用呢個 req.user.role,revoke 即時生效,零額外 query。
    const stmt = db.prepare('SELECT id, username, email, phone, role FROM users WHERE id = ?');
    stmt.bind([decoded.id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(401).json({ error: 'unauthorized' });
    }
    const user = stmt.getAsObject();
    stmt.free();
    user.role = user.role || 'member';

    try {
      db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    } catch (_) {}

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
