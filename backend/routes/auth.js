// 詩歌App Auth Routes — 會員系統 backend
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/authSecret.js';
import { saveUserDb } from '../lib/userDb.js';

const TOKEN_EXPIRY = '30d';
const SALT_ROUNDS = 10;

// ── 登入限速(MEMBERSHIP-PLAN §5.3)──────────────────────────────────
// 每 IP 每 15 分鐘 10 次失敗即 429。in-memory 夠用(單機 backend,同
// otpAuth.js 嘅防濫用做法一致),reset 靠重啟,對登入限速嚟講可接受。
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_MAX = 10;
const loginFailsByIp = new Map(); // ip -> { count, windowStart }

function clientIp(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

function isLoginLocked(ip) {
  const rec = loginFailsByIp.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.windowStart > LOGIN_FAIL_WINDOW_MS) { loginFailsByIp.delete(ip); return false; }
  return rec.count >= LOGIN_FAIL_MAX;
}

function recordLoginFail(ip) {
  const now = Date.now();
  const rec = loginFailsByIp.get(ip);
  if (!rec || now - rec.windowStart > LOGIN_FAIL_WINDOW_MS) {
    loginFailsByIp.set(ip, { count: 1, windowStart: now });
  } else {
    rec.count++;
  }
}

function clearLoginFails(ip) {
  loginFailsByIp.delete(ip);
}

export default function authRoutes(app, getUserDb) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email, password required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const db = await getUserDb();

      const existing = db.prepare('SELECT id FROM users WHERE email = ?');
      existing.bind([email]);
      const exists = existing.step();
      existing.free();

      if (exists) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash]);
      saveUserDb(db);

      const stmt = db.prepare('SELECT id, username, email FROM users WHERE email = ?');
      stmt.bind([email]); stmt.step();
      const user = stmt.getAsObject(); stmt.free();

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error' });
    }
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

      const stmt = db.prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
      stmt.bind([email]);

      if (!stmt.step()) { stmt.free(); recordLoginFail(ip); return res.status(401).json({ error: 'Invalid email or password' }); }

      const user = stmt.getAsObject(); stmt.free();
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) { recordLoginFail(ip); return res.status(401).json({ error: 'Invalid email or password' }); }

      clearLoginFails(ip);
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
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

      const db = await getUserDb();
      const stmt = db.prepare('SELECT id, username, email FROM users WHERE id = ?');
      stmt.bind([decoded.id]);

      if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'User not found' }); }

      const user = stmt.getAsObject(); stmt.free();
      res.json({ user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      console.error('Auth me error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
}
