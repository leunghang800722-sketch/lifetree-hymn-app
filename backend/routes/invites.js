// routes/invites.js — 邀請碼系統(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2)
//
// 五條 route,自己逐條掛 requireAuth/requireAdmin(跟 routes/friends.js 一致
// 做法)。REGISTRATION_MODE 閘本身喺 otpAuth.js(register-phone)同 auth.js
// (email register 封側門)接,呢度淨係管邀請碼本身嘅生成/查詢/revoke/
// 公開預檢。

import crypto from 'crypto';
import { getUserDb, saveUserDb } from '../lib/userDb.js';
import requireAuth from '../lib/requireAuth.js';
import requireAdmin from '../lib/requireAdmin.js';
import { clientIp } from '../lib/loginRateLimit.js';
import { appendAudit, whoOf } from '../lib/auditLog.js';
import { REGISTRATION_MODE } from '../lib/registrationMode.js';
import { redeemInviteAndFriend } from '../lib/inviteRedeem.js';

// 8 字元,alphabet 去晒易撈亂字符(冇 0/O/1/I/L),31 字元 ≈ 39.6-bit(§2.1)。
// crypto.randomBytes % 31 有極輕微 modulo bias,對呢個用途(防陌生人量產
// 帳戶,唔係密碼學簽名)可接受,唔使 rejection sampling 加複雜度。
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 8;
// member 配額可 env override(同 friends.js 一致做法,方便驗收唔使等一日)。
const MEMBER_QUOTA = Number(process.env.INVITES_MEMBER_QUOTA || 5);

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function formatDisplay(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// 輸入時 strip 連字號+空格+統一大寫(§2.1:WhatsApp 發字、口講、人手打全部 OK)。
function normalizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function countActiveInvites(db, userId) {
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM invites WHERE created_by = ? AND used_by IS NULL AND revoked = 0');
  stmt.bind([userId]);
  stmt.step();
  const n = stmt.getAsObject().n;
  stmt.free();
  return n;
}

// 用嗰個碼嘅人而家係咪同生成者做緊好友(§5-5:used_by_name 淨係「用咗嘅人
// 而家係你好友」先回名)。同 routes/friends.js getFriendship() 邏輯一樣,
// 呢度細到唔值得抽 lib——照抄。
function areFriends(db, aId, bId) {
  const lo = Math.min(aId, bId), hi = Math.max(aId, bId);
  const stmt = db.prepare('SELECT status FROM friendships WHERE user_lo = ? AND user_hi = ?');
  stmt.bind([lo, hi]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return !!row && row.status === 'accepted';
}

// ── 公開 invite-check 限速(§5-1)—— 抄 routes/share.js 嘅 per-IP sweep pattern
// + routes/otpAuth.js 嘅 globalCount 熔斷 pattern。
const CHECK_RATE_WINDOW_MS = 15 * 60 * 1000;
const CHECK_RATE_MAX = Number(process.env.INVITES_CHECK_RATE_MAX || 10); // env override 方便驗收
const hitsByIp = new Map();
const SWEEP_THRESHOLD = 500;
function sweepExpired(now) {
  for (const [ip, rec] of hitsByIp) {
    if (now - rec.windowStart > CHECK_RATE_WINDOW_MS) hitsByIp.delete(ip);
  }
}
function isCheckRateLimited(ip) {
  const now = Date.now();
  if (hitsByIp.size > SWEEP_THRESHOLD) sweepExpired(now);
  const rec = hitsByIp.get(ip);
  if (!rec || now - rec.windowStart > CHECK_RATE_WINDOW_MS) {
    hitsByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count++;
  return rec.count > CHECK_RATE_MAX;
}

const GLOBAL_DAILY_CAP = Number(process.env.INVITES_CHECK_GLOBAL_DAILY_CAP || 500);
let globalDay = new Date().toDateString();
let globalCount = 0;
function globalChecksCapped() {
  const d = new Date().toDateString();
  if (d !== globalDay) { globalDay = d; globalCount = 0; }
  if (globalCount >= GLOBAL_DAILY_CAP) return true;
  globalCount++;
  return false;
}

export default function invitesRoutes(app) {
  // ── 生成(§2.3)—— member 5 個未用未撤銷 cap,admin 唔數 ─────────────
  app.post('/api/me/invites', requireAuth, async (req, res) => {
    try {
      const db = await getUserDb();
      if (req.user.role !== 'admin') {
        const count = countActiveInvites(db, req.user.id);
        if (count >= MEMBER_QUOTA) {
          return res.status(422).json({ error: 'quota_full', message: '未用嘅邀請碼已經用晒,用咗先可以再生成' });
        }
      }

      let code = null;
      for (let i = 0; i < 5; i++) {
        const candidate = generateCode();
        const chk = db.prepare('SELECT 1 FROM invites WHERE code = ?');
        chk.bind([candidate]);
        const exists = chk.step();
        chk.free();
        if (!exists) { code = candidate; break; }
      }
      if (!code) return res.status(500).json({ error: 'server_error' }); // 39-bit 空間,理論上唔會發生

      db.run('INSERT INTO invites (code, created_by) VALUES (?, ?)', [code, req.user.id]);
      saveUserDb(db);
      appendAudit({ ts: new Date().toISOString(), user_id: req.user.id, who: whoOf(req.user), action: 'invite_created', code });
      res.json({ code: formatDisplay(code) });
    } catch (err) {
      console.error('invites create error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 自己生成過嘅碼(§2.3)────────────────────────────────────────
  app.get('/api/me/invites', requireAuth, async (req, res) => {
    try {
      const db = await getUserDb();
      const stmt = db.prepare('SELECT code, used_by, created_at FROM invites WHERE created_by = ? ORDER BY created_at DESC');
      stmt.bind([req.user.id]);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();

      const invites = rows.map((r) => {
        const used = r.used_by !== null && r.used_by !== undefined;
        let used_by_name = null;
        if (used && areFriends(db, req.user.id, r.used_by)) {
          const u = db.prepare('SELECT username FROM users WHERE id = ?');
          u.bind([r.used_by]);
          const urow = u.step() ? u.getAsObject() : null;
          u.free();
          used_by_name = urow?.username || '用戶';
        }
        return { code: formatDisplay(r.code), used, used_by_name, created_at: r.created_at };
      });
      res.json({ invites });
    } catch (err) {
      console.error('invites list error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 已登入用戶輸入邀請碼(MEMBERSHIP-PHASE4 補漏——之前邀請碼淨係開新戶
  // 流程消費得到,已有 app 嘅用戶完全冇入口)。兌換 = 自動同派碼者做好友,
  // 行為對齊 register-phone 消費完之後嘅結果,共用邏輯喺 lib/inviteRedeem.js。
  app.post('/api/invites/redeem', requireAuth, async (req, res) => {
    try {
      const code = normalizeCode(req.body?.code);
      if (!code) return res.status(400).json({ error: 'bad_code', message: '請輸入邀請碼' });

      const db = await getUserDb();
      const stmt = db.prepare('SELECT code, created_by, used_by, revoked FROM invites WHERE code = ?');
      stmt.bind([code]);
      const inviteRow = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();

      // 唔存在/revoked 一律 invite_invalid(no oracle,同 invite-check 一致)。
      if (!inviteRow || inviteRow.revoked) {
        return res.status(422).json({ error: 'invite_invalid', message: '邀請碼唔啱,請確認冇打錯' });
      }
      if (inviteRow.used_by !== null && inviteRow.used_by !== undefined) {
        return res.status(422).json({ error: 'invite_used', message: '呢個邀請碼已經用咗' });
      }
      // 唔可以兌換自己派嘅碼。
      if (inviteRow.created_by === req.user.id) {
        return res.status(422).json({ error: 'invite_self', message: '唔可以用自己派嘅邀請碼' });
      }

      const result = redeemInviteAndFriend(db, inviteRow, req.user.id);
      if (!result.consumed) {
        // race:兩個人同時撞正用同一個碼(§4 case 6 同款情況)。
        return res.status(422).json({ error: 'invite_used', message: '呢個邀請碼啱啱俾人用咗' });
      }
      saveUserDb(db);

      const u = db.prepare('SELECT username FROM users WHERE id = ?');
      u.bind([inviteRow.created_by]);
      const urow = u.step() ? u.getAsObject() : null;
      u.free();

      res.json({ ok: true, alreadyFriends: result.alreadyFriends, friendUsername: urow?.username || '用戶' });
    } catch (err) {
      console.error('invites redeem error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── admin:全部碼(§2.3)────────────────────────────────────────────
  app.get('/api/admin/invites', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getUserDb();
      const stmt = db.prepare('SELECT code, created_by, used_by, used_at, revoked, created_at FROM invites ORDER BY created_at DESC');
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      res.json({ invites: rows.map((r) => ({ ...r, code: formatDisplay(r.code) })) });
    } catch (err) {
      console.error('admin invites list error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── admin:revoke(§2.3)—— 未用先 revoke 得,已用嘅碼開戶已成事實 ───────
  app.post('/api/admin/invites/:code/revoke', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getUserDb();
      const code = normalizeCode(req.params.code);
      const stmt = db.prepare('SELECT used_by, revoked FROM invites WHERE code = ?');
      stmt.bind([code]);
      const row = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.used_by !== null && row.used_by !== undefined) return res.status(400).json({ error: 'already_used' });
      if (!row.revoked) {
        db.run('UPDATE invites SET revoked = 1 WHERE code = ?', [code]);
        saveUserDb(db);
        appendAudit({ ts: new Date().toISOString(), user_id: req.user.id, who: whoOf(req.user), action: 'invite_revoked', code });
      }
      res.json({ ok: true }); // 已 revoke 過都回 ok(冪等)
    } catch (err) {
      console.error('admin invite revoke error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── 公開預檢(§2.3/§0.6)—— 燒 OTP 錢之前先驗;唔透露原因(no oracle)──
  app.post('/api/auth/invite-check', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (isCheckRateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });
      if (globalChecksCapped()) return res.status(429).json({ error: 'rate_limited' });

      if (REGISTRATION_MODE === 'open') return res.json({ valid: true }); // §2.3/§4 case 12

      const code = normalizeCode(req.body?.code);
      if (!code) return res.json({ valid: false });

      const db = await getUserDb();
      const stmt = db.prepare('SELECT used_by, revoked FROM invites WHERE code = ?');
      stmt.bind([code]);
      const row = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      const valid = !!row && !row.revoked && (row.used_by === null || row.used_by === undefined);
      res.json({ valid });
    } catch (err) {
      console.error('invite-check error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });
}
