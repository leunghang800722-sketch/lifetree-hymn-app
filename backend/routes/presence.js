// routes/presence.js — Admin「在線」頁(ADMIN-PRESENCE-EXEC-20260905 §2)
//
//   POST /api/presence/heartbeat  —— 冇強制 auth:有 Bearer token 就當會員
//                                     (順手更新 last_seen_at,同 requireAuth
//                                     一致做法),token 冇/invalid 就當訪客
//                                     (要有 deviceId 先計數)。永遠回 204——
//                                     心跳係 fire-and-forget,唔應該因為
//                                     壞 body 拖累 app(同 clientLog.js 一致
//                                     嘅診斷 beacon 態度)。
//   GET  /api/admin/presence      —— requireAuth + requireAdmin,回在線快照。
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/authSecret.js';
import { getUserDb } from '../lib/userDb.js';
import requireAuth from '../lib/requireAuth.js';
import requireAdmin from '../lib/requireAdmin.js';
import { recordHeartbeat, getPresenceSnapshot } from '../lib/presence.js';

// 電話遮中間四位(§3「name:users 表有名就用名,冇就電話遮中間四位」)。
// 例:+85261234567(12 字)→ mid=6,start=4,end=8 → +852**** 4567 遮法為
// 保留頭尾、剷走中間 4 個字符。字太短(<8)就淨係遮晒,唔強行對出 4 個字。
function maskPhoneMiddle(phone) {
  if (!phone || typeof phone !== 'string') return null;
  if (phone.length < 8) return '*'.repeat(phone.length);
  const mid = Math.floor(phone.length / 2);
  const start = Math.max(mid - 2, 0);
  const end = Math.min(start + 4, phone.length);
  return phone.slice(0, start) + '****' + phone.slice(end);
}

// 有 token 就經 requireAuth 嗰套邏輯驗(decode → DB 核實 → 更新
// last_seen_at),但唔可以用 requireAuth 個 middleware 本身——佢冇 token/
// invalid 會直接 401,呢度要求嘅係「當訪客繼續行落去」,唔係拒絕請求。
async function tryAuthenticate(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getUserDb();
    const stmt = db.prepare('SELECT id, username, email, phone, role FROM users WHERE id = ?');
    stmt.bind([decoded.id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const user = stmt.getAsObject();
    stmt.free();
    try {
      db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    } catch (_) {}
    return user;
  } catch (_) {
    return null; // token 冇效 —— 當訪客,唔 401
  }
}

export default function presenceRoutes(app) {
  app.post('/api/presence/heartbeat', async (req, res) => {
    try {
      const b = req.body || {};
      const deviceId = String(b.deviceId || '').slice(0, 40) || null;
      const state = String(b.state || '').slice(0, 20);
      const user = await tryAuthenticate(req);
      recordHeartbeat({ userId: user ? user.id : null, deviceId, state });
    } catch (_) {
      // fire-and-forget beacon,壞咗靜靜算,唔拖累 app。
    }
    res.status(204).end();
  });

  app.get('/api/admin/presence', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getUserDb();
      const nameCache = new Map();
      const resolveMemberName = (userId) => {
        if (nameCache.has(userId)) return nameCache.get(userId);
        let name = null;
        try {
          const stmt = db.prepare('SELECT username, phone FROM users WHERE id = ?');
          stmt.bind([userId]);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            name = row.username || maskPhoneMiddle(row.phone) || null;
          }
          stmt.free();
        } catch (_) {}
        nameCache.set(userId, name);
        return name;
      };
      const snapshot = getPresenceSnapshot(resolveMemberName);
      res.json(snapshot);
    } catch (err) {
      console.error('admin presence error:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });
}
