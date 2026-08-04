// routes/friends.js — 會員之間加好友(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §1)
//
// 六條 route,呢個 file 自己逐條掛 requireAuth(跟 share.js/routes/friends 一貫
// 做法,唔靠掛載次序)。搵人方式:電話號碼精確配對(§1.2),回應永遠唔出
// 電話號碼(§5-5,outgoing 嘅尾4 除外,嗰個係請求者自己打入嚟嘅)。
//
//   POST   /api/friends/lookup          { phone } → found/relation,唔答名
//   POST   /api/friends/request         { phone } → 發出請求(冪等/互相秒accept)
//   GET    /api/friends                 → { friends, incoming, outgoing }
//   POST   /api/friends/:userId/accept  → 接受
//   DELETE /api/friends/:userId         → 一 API 三用:拒絕/收回/解除
//   GET    /api/friends/:userId/shares  → 好友分享緊嘅清單(§1.4,重用 Phase 3)

import { getUserDb, saveUserDb } from '../lib/userDb.js';
import requireAuth from '../lib/requireAuth.js';

// E.164 粗略檢查(同 otpAuth.js normalizePhone 一樣嘅正則,兩個 file 各自一份
// 細 helper——呢個級數嘅重複唔值得為佢開新共用 lib)。
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\s-()]/g, '');
  return /^\+\d{8,15}$/.test(t) ? t : null;
}

function sortPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function findUserByPhone(db, phone) {
  const stmt = db.prepare('SELECT id, username, phone FROM users WHERE phone = ?');
  stmt.bind([phone]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function getFriendship(db, aId, bId) {
  const [lo, hi] = sortPair(aId, bId);
  const stmt = db.prepare('SELECT user_lo, user_hi, requested_by, status FROM friendships WHERE user_lo = ? AND user_hi = ?');
  stmt.bind([lo, hi]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// ── per-user 每日限速(§5-3/4)—— in-memory,重啟清零可接受(同 otpAuth.js
// perPhone/perIp 一致做法)。lookup 20/日、request(真・新請求)10/日。
function makeDailyLimiter(max) {
  const byUser = new Map(); // userId -> { day, count }
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
// 數值可用 env override(同 otpAuth.js OTP_DAILY_CAP 一致嘅做法),純粹方便
// Opus/Sonnet 驗收打爆 429 唔使等一日——冇設就係 spec 數值,production 一路
// 用緊嘅係呢啲 default。
const LOOKUP_DAILY_MAX = Number(process.env.FRIENDS_LOOKUP_DAILY_MAX || 20);
const REQUEST_DAILY_MAX = Number(process.env.FRIENDS_REQUEST_DAILY_MAX || 10);
const OUTGOING_PENDING_CAP = Number(process.env.FRIENDS_OUTGOING_PENDING_CAP || 20); // DB 數,persistent(唔係 in-memory)
const lookupLimiter = makeDailyLimiter(LOOKUP_DAILY_MAX);
const requestLimiter = makeDailyLimiter(REQUEST_DAILY_MAX);

function countOutgoingPending(db, userId) {
  const stmt = db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE status = 'pending' AND requested_by = ?");
  stmt.bind([userId]);
  stmt.step();
  const n = stmt.getAsObject().n;
  stmt.free();
  return n;
}

function usernameOf(db, userId) {
  const stmt = db.prepare('SELECT username FROM users WHERE id = ?');
  stmt.bind([userId]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row ? (row.username || '用戶') : null; // null = 用戶喺 DB 消失(§4 case 10)
}

export default function friendsRoutes(app) {
  // ── 搵人(§1.3)—— 唔回 username、唔回 user id ─────────────────────
  app.post('/api/friends/lookup', requireAuth, async (req, res) => {
    try {
      const rl = lookupLimiter.check(req.user.id);
      if (!rl.ok) return res.status(429).json({ error: 'rate_limited' });

      const phone = normalizePhone(req.body?.phone);
      if (!phone) return res.status(400).json({ error: 'bad_phone' });

      const db = await getUserDb();
      const other = findUserByPhone(db, phone);
      rl.commit();

      if (!other) return res.json({ found: false, relation: 'none' });
      if (other.id === req.user.id) return res.json({ found: true, relation: 'self' });

      const fr = getFriendship(db, req.user.id, other.id);
      let relation = 'none';
      if (fr) {
        if (fr.status === 'accepted') relation = 'friends';
        else relation = fr.requested_by === req.user.id ? 'pending_out' : 'pending_in';
      }
      res.json({ found: true, relation });
    } catch (err) {
      console.error('friends lookup error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 發出請求(§1.3,§4 case 1/2/3)──────────────────────────────────
  app.post('/api/friends/request', requireAuth, async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (!phone) return res.status(400).json({ error: 'bad_phone' });

      const db = await getUserDb();
      const other = findUserByPhone(db, phone);
      if (!other || other.id === req.user.id) return res.status(400).json({ error: 'not_found' });

      const fr = getFriendship(db, req.user.id, other.id);
      if (fr) {
        if (fr.status === 'accepted') return res.json({ ok: true, status: 'accepted' });
        if (fr.requested_by === req.user.id) return res.json({ ok: true, status: 'pending' }); // 冪等
        // 對方本身有 pending 請求緊你 → 互相想加,直接變 accepted(§4 case 1)
        const [lo, hi] = sortPair(req.user.id, other.id);
        db.run(
          "UPDATE friendships SET status = 'accepted', responded_at = ? WHERE user_lo = ? AND user_hi = ?",
          [new Date().toISOString(), lo, hi]
        );
        saveUserDb(db);
        return res.json({ ok: true, status: 'accepted' });
      }

      // 真・新請求 —— 先驗 cap(DB 數)先驗每日限速,兩關都過先寫入。
      if (countOutgoingPending(db, req.user.id) >= OUTGOING_PENDING_CAP) {
        return res.status(429).json({ error: 'too_many_pending' });
      }
      const rl = requestLimiter.check(req.user.id);
      if (!rl.ok) return res.status(429).json({ error: 'rate_limited' });

      const [lo, hi] = sortPair(req.user.id, other.id);
      db.run('INSERT INTO friendships (user_lo, user_hi, requested_by, status) VALUES (?, ?, ?, ?)', [lo, hi, req.user.id, 'pending']);
      rl.commit();
      saveUserDb(db);
      res.json({ ok: true, status: 'pending' });
    } catch (err) {
      console.error('friends request error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 好友列表(§1.3)──────────────────────────────────────────────
  app.get('/api/friends', requireAuth, async (req, res) => {
    try {
      const db = await getUserDb();
      const meId = req.user.id;
      const stmt = db.prepare('SELECT user_lo, user_hi, requested_by, status, created_at FROM friendships WHERE user_lo = ? OR user_hi = ?');
      stmt.bind([meId, meId]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();

      const friends = [];
      const incoming = [];
      const outgoing = [];

      for (const r of rows) {
        const otherId = r.user_lo === meId ? r.user_hi : r.user_lo;
        if (r.status === 'accepted') {
          const name = usernameOf(db, otherId);
          if (name === null) continue; // §4 case 10:防禦性 filter
          friends.push({ user_id: otherId, username: name });
        } else if (r.requested_by === otherId) {
          const name = usernameOf(db, otherId);
          if (name === null) continue;
          incoming.push({ user_id: otherId, username: name, created_at: r.created_at });
        } else {
          // 你 request 緊對方 —— 只回尾4(你自己打嘅號碼),唔回名。
          const u = db.prepare('SELECT phone FROM users WHERE id = ?');
          u.bind([otherId]);
          const urow = u.step() ? u.getAsObject() : null;
          u.free();
          if (!urow) continue;
          outgoing.push({ user_id: otherId, phone_tail: (urow.phone || '').slice(-4), created_at: r.created_at });
        }
      }

      res.json({ friends, incoming, outgoing });
    } catch (err) {
      console.error('friends list error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 接受請求(§1.3)—— pending(requested_by=對方)先 accept 得 ────────
  app.post('/api/friends/:userId/accept', requireAuth, async (req, res) => {
    try {
      const otherId = parseInt(req.params.userId, 10);
      if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'bad_user_id' });
      const db = await getUserDb();
      const fr = getFriendship(db, req.user.id, otherId);
      if (!fr || fr.status !== 'pending' || fr.requested_by !== otherId) {
        return res.status(400).json({ error: 'no_pending_request' });
      }
      const [lo, hi] = sortPair(req.user.id, otherId);
      db.run("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE user_lo = ? AND user_hi = ?", [new Date().toISOString(), lo, hi]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('friends accept error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 拒絕 / 收回 / 解除(§1.3)—— 一 API 三用,全部刪行 ─────────────────
  app.delete('/api/friends/:userId', requireAuth, async (req, res) => {
    try {
      const otherId = parseInt(req.params.userId, 10);
      if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'bad_user_id' });
      const db = await getUserDb();
      const [lo, hi] = sortPair(req.user.id, otherId);
      db.run('DELETE FROM friendships WHERE user_lo = ? AND user_hi = ?', [lo, hi]);
      saveUserDb(db);
      res.json({ ok: true });
    } catch (err) {
      console.error('friends delete error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 好友分享緊嘅清單(§1.4)—— 重用 Phase 3 share token,零新私隱面 ─────
  app.get('/api/friends/:userId/shares', requireAuth, async (req, res) => {
    try {
      const otherId = parseInt(req.params.userId, 10);
      if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'bad_user_id' });
      const db = await getUserDb();
      const fr = getFriendship(db, req.user.id, otherId);
      if (!fr || fr.status !== 'accepted') return res.status(403).json({ error: 'not_friends' });

      const stmt = db.prepare(
        `SELECT s.token, p.name, p.songs_json FROM playlist_shares s
         JOIN playlists p ON p.user_id = s.user_id AND p.id = s.playlist_id
         WHERE s.user_id = ? AND s.revoked = 0 AND p.deleted = 0`
      );
      stmt.bind([otherId]);
      const items = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        let songCount = 0;
        try { songCount = (JSON.parse(row.songs_json || '[]') || []).length; } catch (_) {}
        items.push({ token: row.token, name: row.name, song_count: songCount });
      }
      stmt.free();
      res.json({ shares: items });
    } catch (err) {
      console.error('friends shares error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}
