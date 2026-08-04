// routes/otpAuth.js — 電話號碼 + 驗證碼登入(PHONE-AUTH-PLAN v2)
//
// 主通道:WhatsApp OTP(Twilio Verify,channel=whatsapp);冇 WhatsApp 就 SMS 後備。
// 大陸 +86:唔行 SMS(見 plan §0),回專用錯誤碼俾前端顯示 email 提示。
//
// ⚠️ 呢個檔案**唔掂**現有 auth.js 嘅 email/password 登入(過渡期照用)。
// ⚠️ 冇 TWILIO_* env 嗰陣,endpoint 唔會 crash,只會回 503「未配置」,
//    前端 PHONE_AUTH_ENABLED flag 預設 false,所以未配置前根本唔會叫到呢度。
//
// 用 fetch 直駁 Twilio Verify REST API,前端零 SDK、backend 零新 dependency。

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../lib/authSecret.js';
import { saveUserDb } from '../lib/userDb.js';
import { ipLoginLimiter, phoneLoginLimiter, clientIp } from '../lib/loginRateLimit.js';
import { REGISTRATION_MODE } from '../lib/registrationMode.js';
import { redeemInviteAndFriend } from '../lib/inviteRedeem.js';

const TOKEN_EXPIRY = '30d';
const TICKET_EXPIRY = '10m';
const SALT_ROUNDS = 10;
const SENTINEL_HASH = 'otp-no-password';

// Twilio 配置(Eric 之後喺 launchd env 補;冇就當「未配置」)
const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TW_SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID;
// 主 channel:whatsapp / sms。冇 WhatsApp WABA 就先設 sms,將來一個 env 切返 whatsapp。
const PRIMARY_CHANNEL = process.env.OTP_CHANNEL || 'whatsapp';
const OTP_DAILY_CAP = Number(process.env.OTP_DAILY_CAP || 100); // 全局熔斷
const otpConfigured = () => !!(TW_SID && TW_TOKEN && TW_SERVICE);

// 白名單國碼(初期淨係香港)。+86 特別處理(回 email 提示),其他一律拒。
const ALLOWED_PREFIXES = (process.env.OTP_ALLOWED_PREFIXES || '+852').split(',').map((s) => s.trim());

// ── 防濫用(SMS pumping 係真金白銀)──────────────────────────────
// in-memory 夠用(單機 backend)。重啟即清,對限速嚟講可接受。
const perPhone = new Map(); // phone -> { lastAt, dayCount, day }
const perIp = new Map();    // ip -> { dayCount, day }
let globalDay = new Date().toDateString();
let globalCount = 0;
const PHONE_COOLDOWN_MS = 60 * 1000;
const PHONE_DAILY = 5;
const IP_DAILY = 10;

function today() { return new Date().toDateString(); }
function rollGlobal() { const d = today(); if (d !== globalDay) { globalDay = d; globalCount = 0; } }

function checkRate(phone, ip) {
  rollGlobal();
  if (globalCount >= OTP_DAILY_CAP) return { ok: false, code: 'global_cap' };

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

// E.164 粗略檢查:+ 開頭,8-15 位數字
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\s-()]/g, '');
  return /^\+\d{8,15}$/.test(t) ? t : null;
}

const twAuth = () => 'Basic ' + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString('base64');

async function twilioStart(phone, channel) {
  const body = new URLSearchParams({ To: phone, Channel: channel });
  const r = await fetch(`https://verify.twilio.com/v2/Services/${TW_SERVICE}/Verifications`, {
    method: 'POST',
    headers: { Authorization: twAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

async function twilioCheck(phone, code) {
  const body = new URLSearchParams({ To: phone, Code: code });
  const r = await fetch(`https://verify.twilio.com/v2/Services/${TW_SERVICE}/VerificationCheck`, {
    method: 'POST',
    headers: { Authorization: twAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

// ── 密碼登入欄位驗證(PHONE-PASSWORD-AUTH-PLAN §3.5)──────────────────
const CURRENT_YEAR = new Date().getFullYear();

function validatePassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 6) return false;
  if (Buffer.byteLength(password, 'utf8') > 72) return false; // bcrypt 截斷位
  return true;
}
function validateUsername(username) {
  if (typeof username !== 'string') return false;
  const t = username.trim();
  return t.length >= 1 && t.length <= 30;
}
function validateGender(gender) {
  return gender === 'male' || gender === 'female';
}
function validateBirthYear(birthYear) {
  const y = Number(birthYear);
  return Number.isInteger(y) && y >= 1900 && y <= CURRENT_YEAR;
}

// ── Ticket(「電話已驗證」短期憑證,§3.2)────────────────────────────
// 用 JWT 自簽,唔使 server-side store。payload 冇 id,攞去撞 requireAuth
// 會因為 decoded.id undefined 查唔到用戶而 401——但唔靠呢個巧合,
// register-phone/reset-password 一律顯式驗 purpose claim。
function signTicket(phone) {
  return jwt.sign({ phone, purpose: 'phone_verified' }, JWT_SECRET, { expiresIn: TICKET_EXPIRY });
}

// 回 { error } 俾 route 直接 res.status(401).json(...);冇拋錯,call 位睇返回值。
function verifyTicket(ticket) {
  try {
    const decoded = jwt.verify(ticket, JWT_SECRET);
    if (decoded?.purpose !== 'phone_verified' || !decoded?.phone) {
      return { error: 'ticket_invalid' };
    }
    return { phone: decoded.phone };
  } catch (e) {
    if (e.name === 'TokenExpiredError') return { error: 'ticket_expired' };
    return { error: 'ticket_invalid' };
  }
}

// 統一 user object 形狀(§3.3):{ id, username, phone, email, role, gender, birthYear }
function toUserObject(row) {
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    email: row.email,
    role: row.role || 'member',
    gender: row.gender || null,
    birthYear: row.birth_year || null,
  };
}

// 邀請碼輸入正規化(同 routes/invites.js normalizeCode 一樣嘅正則,兩個 file
// 各自一份細 helper——照抄唔抽共用,同 normalizePhone 一致嘅取捨)。
function normalizeInviteCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function findUserByPhone(db, phone) {
  const stmt = db.prepare('SELECT id, username, email, phone, role, gender, birth_year, password_hash FROM users WHERE phone = ?');
  stmt.bind([phone]);
  const found = stmt.step();
  const row = found ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export default function otpAuthRoutes(app, getUserDb) {
  app.post('/api/auth/otp/request', async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (!phone) return res.status(400).json({ error: 'bad_phone', message: '電話號碼格式唔啱' });

      // +86:唔行 SMS,俾前端顯示 email 提示
      if (phone.startsWith('+86')) {
        return res.status(422).json({ error: 'cn_unsupported', message: '大陸號碼暫時未支援短訊登入,請用電郵驗證碼' });
      }
      if (!ALLOWED_PREFIXES.some((p) => phone.startsWith(p))) {
        return res.status(422).json({ error: 'region_unsupported', message: '呢個地區暫時未開放電話登入' });
      }
      if (!otpConfigured()) {
        return res.status(503).json({ error: 'not_configured', message: '電話登入未配置(等 Twilio key)' });
      }

      const rate = checkRate(phone, clientIp(req));
      if (!rate.ok) return res.status(429).json({ error: rate.code, message: '太頻密,唞一唞再試' });

      // 主 channel 試,失敗(例如冇 WhatsApp)自動 fallback SMS
      let r = await twilioStart(phone, PRIMARY_CHANNEL);
      if (!r.ok && PRIMARY_CHANNEL !== 'sms') r = await twilioStart(phone, 'sms');
      if (!r.ok) return res.status(502).json({ error: 'send_failed', message: '發送失敗,請稍後再試' });

      rate.commit();
      res.json({ ok: true, channel: r.data?.channel || PRIMARY_CHANNEL });
    } catch (e) {
      console.error('otp/request error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ⚠️ 舊 endpoint,PHONE-PASSWORD-AUTH-PLAN §2.4 改行為:唔再 upsert 開新戶。
  // 已有 phone 嘅存量用戶(舊 client)照樣登入,新 phone 一律引導去新流程。
  app.post('/api/auth/otp/verify', async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const code = String(req.body?.code || '').trim();
      if (!phone || !/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'bad_input' });
      if (!otpConfigured()) return res.status(503).json({ error: 'not_configured' });

      const chk = await twilioCheck(phone, code);
      if (!(chk.ok && chk.data?.status === 'approved')) {
        return res.status(401).json({ error: 'bad_code', message: '驗證碼唔啱或者過期' });
      }

      const db = await getUserDb();
      const user = findUserByPhone(db, phone);

      if (!user) {
        // 唔再 upsert 開新戶(§2.4)——舊 client 嘅新用戶要更新 app 行新註冊流程。
        return res.status(422).json({ error: 'use_new_flow', message: '請更新 app 再註冊' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: toUserObject(user), isNew: false });
    } catch (e) {
      console.error('otp/verify error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── verify-ticket(新,§3.3)────────────────────────────────────────
  // 驗完 Twilio code 之後發一個短期 ticket,證明「呢一刻控制住呢個電話」。
  // 對「已註冊」定「未註冊」嘅 phone 都發 ticket(payload 一樣)——由
  // register-phone / reset-password 兩個 endpoint 自己分流(§2.3)。
  app.post('/api/auth/otp/verify-ticket', async (req, res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const code = String(req.body?.code || '').trim();
      if (!phone || !/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'bad_input' });
      if (!otpConfigured()) return res.status(503).json({ error: 'not_configured' });

      const chk = await twilioCheck(phone, code);
      if (!(chk.ok && chk.data?.status === 'approved')) {
        return res.status(401).json({ error: 'bad_code', message: '驗證碼唔啱或者過期' });
      }

      const db = await getUserDb();
      const user = findUserByPhone(db, phone);
      const registered = !!user;
      const profileComplete = registered
        ? !!(user.username && user.gender && user.birth_year)
        : false;

      const ticket = signTicket(phone);
      res.json({ ticket, registered, profileComplete });
    } catch (e) {
      console.error('otp/verify-ticket error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── register-phone(新,§2.1/§3.3;MEMBERSHIP-PHASE4 §2.4 加邀請碼閘)──
  app.post('/api/auth/register-phone', async (req, res) => {
    try {
      const { ticket, password, username, gender, birthYear, inviteCode } = req.body || {};
      if (typeof ticket !== 'string') return res.status(401).json({ error: 'ticket_invalid' });

      const tv = verifyTicket(ticket);
      if (tv.error) return res.status(401).json({ error: tv.error });
      const phone = tv.phone; // 一律信 ticket 入面嘅 phone,body 冇送呢個欄

      if (!validatePassword(password)) return res.status(400).json({ error: 'weak_password' });
      if (!validateUsername(username)) return res.status(400).json({ error: 'bad_username' });
      if (!validateGender(gender)) return res.status(400).json({ error: 'bad_gender' });
      if (!validateBirthYear(birthYear)) return res.status(400).json({ error: 'bad_birth_year' });

      const db = await getUserDb();
      const existing = findUserByPhone(db, phone);
      if (existing) return res.status(422).json({ error: 'already_registered', message: '呢個號碼已註冊,請直接登入' });

      // ── 邀請碼閘(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.4)────────
      // 驗碼(存在、未用、未 revoked)要喺 INSERT user 之前,同開戶做同一個
      // 邏輯批次(§0.6:預檢喺 invite-check,呢度先係真正消費)。§4 case 9:
      // 舊 bundle 完全冇送 inviteCode 欄 → 當「請更新 app」處理,唔當「碼錯」。
      let inviteRow = null;
      if (REGISTRATION_MODE === 'invite') {
        const normalized = normalizeInviteCode(inviteCode);
        if (!normalized) return res.status(422).json({ error: 'invite_required', message: '請更新 app 再註冊' });
        const stmt = db.prepare('SELECT code, created_by, used_by, revoked FROM invites WHERE code = ?');
        stmt.bind([normalized]);
        inviteRow = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        // 唔存在/revoked 一律 invite_invalid(no oracle,同 invite-check 一致);
        // 存在但已用 → invite_used(§2.4 流程圖,前端跳返⓪嘅分流靠呢個分開嘅碼)。
        if (!inviteRow || inviteRow.revoked) {
          return res.status(422).json({ error: 'invite_invalid', message: '邀請碼唔啱,請問返邀請你嗰位朋友' });
        }
        if (inviteRow.used_by !== null && inviteRow.used_by !== undefined) {
          return res.status(422).json({ error: 'invite_used', message: '呢個邀請碼啱啱俾人用咗' });
        }
      }

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const trimmedUsername = username.trim();
      db.run(
        'INSERT INTO users (username, email, password_hash, phone, gender, birth_year) VALUES (?, ?, ?, ?, ?, ?)',
        [trimmedUsername, `phone_${phone}@placeholder.local`, hash, phone, gender, Number(birthYear)]
      );

      const user = findUserByPhone(db, phone);

      if (inviteRow) {
        // 消費碼 + 自動加好友(§2.6)—— 共用邏輯喺 lib/inviteRedeem.js(同
        // /api/invites/redeem 一份)。極罕見 race(§4 case 6:兩個人同時撞正用
        // 同一個碼)已開嘅戶唔回滾,淨係邀請關係冧咗,function 內部有 log。
        redeemInviteAndFriend(db, inviteRow, user.id);
      }

      saveUserDb(db);

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: toUserObject(user) });
    } catch (e) {
      console.error('register-phone error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── login-phone(新,§2.2/§3.4)────────────────────────────────────
  app.post('/api/auth/login-phone', async (req, res) => {
    const ip = clientIp(req);
    try {
      const phone = normalizePhone(req.body?.phone);
      const password = req.body?.password;
      if (!phone || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'bad_input' });
      }

      if (ipLoginLimiter.isLocked(ip)) {
        return res.status(429).json({ error: 'too_many_attempts', message: '太多次失敗,請15分鐘後再試' });
      }
      if (phoneLoginLimiter.isLocked(phone)) {
        return res.status(429).json({ error: 'too_many_attempts', message: '太多次失敗,請15分鐘後再試,或者用忘記密碼' });
      }

      const db = await getUserDb();
      const user = findUserByPhone(db, phone);

      if (!user) {
        ipLoginLimiter.recordFail(ip);
        phoneLoginLimiter.recordFail(phone);
        return res.status(401).json({ error: 'bad_credentials', message: '電話或密碼唔啱' });
      }

      // sentinel(§6):冇任何輸入 compare 得過,唔算「密碼估錯」,引導去忘記密碼。
      if (user.password_hash === SENTINEL_HASH) {
        return res.status(422).json({ error: 'password_not_set', message: '呢個帳戶未設密碼,請用「忘記密碼」設定' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        ipLoginLimiter.recordFail(ip);
        phoneLoginLimiter.recordFail(phone);
        return res.status(401).json({ error: 'bad_credentials', message: '電話或密碼唔啱' });
      }

      ipLoginLimiter.clear(ip);
      phoneLoginLimiter.clear(phone);
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: toUserObject(user) });
    } catch (e) {
      console.error('login-phone error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── reset-password(新,§2.3/§3.3)─────────────────────────────────
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { ticket, password, username, gender, birthYear } = req.body || {};
      if (typeof ticket !== 'string') return res.status(401).json({ error: 'ticket_invalid' });

      const tv = verifyTicket(ticket);
      if (tv.error) return res.status(401).json({ error: tv.error });
      const phone = tv.phone;

      if (!validatePassword(password)) return res.status(400).json({ error: 'weak_password' });
      // 呢三個係 optional 補完欄——冇送就唔驗;有送就要合規,先至寫得入去。
      if (username !== undefined && username !== null && !validateUsername(username)) {
        return res.status(400).json({ error: 'bad_username' });
      }
      if (gender !== undefined && gender !== null && !validateGender(gender)) {
        return res.status(400).json({ error: 'bad_gender' });
      }
      if (birthYear !== undefined && birthYear !== null && !validateBirthYear(birthYear)) {
        return res.status(400).json({ error: 'bad_birth_year' });
      }

      const db = await getUserDb();
      const existing = findUserByPhone(db, phone);
      if (!existing) return res.status(422).json({ error: 'no_account', message: '呢個號碼未註冊' });

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, existing.id]);

      // 補完 profile(§2.3):只喺該欄目前係 NULL 先寫入,有值一律唔覆蓋。
      if (!existing.username && username !== undefined && username !== null && validateUsername(username)) {
        db.run('UPDATE users SET username = ? WHERE id = ?', [username.trim(), existing.id]);
      }
      if (!existing.gender && gender !== undefined && gender !== null && validateGender(gender)) {
        db.run('UPDATE users SET gender = ? WHERE id = ?', [gender, existing.id]);
      }
      if (!existing.birth_year && birthYear !== undefined && birthYear !== null && validateBirthYear(birthYear)) {
        db.run('UPDATE users SET birth_year = ? WHERE id = ?', [Number(birthYear), existing.id]);
      }
      saveUserDb(db);

      const user = findUserByPhone(db, phone);
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: toUserObject(user) });
    } catch (e) {
      console.error('reset-password error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // 前端可以問一問電話登入通唔通,決定登入頁預設顯示邊個;registrationMode
  // (MEMBERSHIP-PHASE4 §2.4)俾前端決定註冊流程使唔使顯示邀請碼步,將來切
  // open 唔使再 OTA(§4 case 12)。
  app.get('/api/auth/otp/status', (req, res) => {
    res.json({ configured: otpConfigured(), channel: PRIMARY_CHANNEL, allowed: ALLOWED_PREFIXES, registrationMode: REGISTRATION_MODE });
  });
}
