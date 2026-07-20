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

const JWT_SECRET = process.env.JWT_SECRET || 'hymn-app-jwt-secret-2026';
const TOKEN_EXPIRY = '30d';

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

function clientIp(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

export default function otpAuthRoutes(app, getDb) {
  // 遷移:users 加 phone。email/password_hash 保留,舊帳戶照登入。
  async function ensurePhoneColumn(db) {
    try { db.run('ALTER TABLE users ADD COLUMN phone TEXT'); } catch (_) {}
  }

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

      const db = await getDb();
      await ensurePhoneColumn(db);

      // upsert:有 phone 就登入,冇就開新用戶(註冊登入合一)
      let user = null;
      const sel = db.prepare('SELECT id, username, email, phone FROM users WHERE phone = ?');
      sel.bind([phone]);
      if (sel.step()) user = sel.getAsObject();
      sel.free();

      let isNew = false;
      if (!user) {
        isNew = true;
        // email NOT NULL 舊 schema:俾個 placeholder 唯一 email,password_hash 亦要有值
        db.run('INSERT INTO users (username, email, password_hash, phone) VALUES (?, ?, ?, ?)',
          [null, `phone_${phone}@placeholder.local`, 'otp-no-password', phone]);
        const s2 = db.prepare('SELECT id, username, email, phone FROM users WHERE phone = ?');
        s2.bind([phone]); s2.step(); user = s2.getAsObject(); s2.free();
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: { id: user.id, username: user.username, phone: user.phone }, isNew });
    } catch (e) {
      console.error('otp/verify error:', e?.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // 前端可以問一問電話登入通唔通,決定登入頁預設顯示邊個
  app.get('/api/auth/otp/status', (req, res) => {
    res.json({ configured: otpConfigured(), channel: PRIMARY_CHANNEL, allowed: ALLOWED_PREFIXES });
  });
}
