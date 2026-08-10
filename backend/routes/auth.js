// 詩歌App Auth Routes — 會員系統 backend
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/authSecret.js';
import { ipLoginLimiter, clientIp } from '../lib/loginRateLimit.js';

const TOKEN_EXPIRY = '30d';

// ── 登入限速(MEMBERSHIP-PLAN §5.3)──────────────────────────────────
// 每 IP 每 15 分鐘 10 次失敗即 429。抽咗做共用 lib/loginRateLimit.js
// (PHONE-PASSWORD-AUTH-PLAN §3.4),login-phone 用埋同一個 limiter 實例,
// 呢度行為不變。
function isLoginLocked(ip) { return ipLoginLimiter.isLocked(ip); }
function recordLoginFail(ip) { ipLoginLimiter.recordFail(ip); }
function clearLoginFails(ip) { ipLoginLimiter.clear(ip); }

export default function authRoutes(app, getUserDb) {
  app.post('/api/auth/register', async (req, res) => {
    // ── 側門永久封(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.5 +
    // REGISTER-OPTIONAL-INVITE-PLAN §2-B1)─────────────────────────────
    // 呢條 email 通道(冇 OTP 冇限速)無條件封死,唔再跟 REGISTRATION_MODE——
    // 一旦邀請碼變 optional(open mode),留返呢條路等於重開一個冇電話驗證、
    // 知 URL 就開到戶嘅後門。收埋佢嘅原意喺 open mode 一樣成立。現有 email
    // 帳戶(opus-verify 等)登入(下面 /api/auth/login)完全唔受影響。
    return res.status(422).json({ error: 'registration_closed', message: '呢個方式已經停用,請用電話註冊' });
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = clientIp(req);
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }

      if (isLoginLocked(ip)) {
        return res.status(429).json({ error: 'too_many_attempts', message: '太多次失敗,請15分鐘後再試' });
      }

      const db = await getUserDb();

      const stmt = db.prepare('SELECT id, username, email, password_hash, role FROM users WHERE email = ?');
      stmt.bind([email]);

      if (!stmt.step()) { stmt.free(); recordLoginFail(ip); return res.status(401).json({ error: 'Invalid email or password' }); }

      const user = stmt.getAsObject(); stmt.free();
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) { recordLoginFail(ip); return res.status(401).json({ error: 'Invalid email or password' }); }

      clearLoginFails(ip);
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role || 'member' } });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      // 簽名啱但冇 id claim(例如 PHONE-PASSWORD-AUTH-PLAN §3.2 嗰個 ticket)——
      // 一定要喺呢度截,唔好 bind(undefined) 落 sql.js,否則變 500 而唔係 401。
      // requireAuth.js 靠 try/catch 兜到 401,呢度冇,要顯式擋。
      if (decoded?.id === undefined || decoded?.id === null) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const db = await getUserDb();
      const stmt = db.prepare('SELECT id, username, email, phone, role, gender, birth_year FROM users WHERE id = ?');
      stmt.bind([decoded.id]);

      if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'User not found' }); }

      const user = stmt.getAsObject(); stmt.free();
      res.json({
        user: {
          id: user.id, username: user.username, email: user.email, phone: user.phone,
          role: user.role || 'member', gender: user.gender || null, birthYear: user.birth_year || null,
        },
      });
    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      console.error('Auth me error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
}
