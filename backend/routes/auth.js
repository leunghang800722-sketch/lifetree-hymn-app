// 詩歌App Auth Routes — 會員系統 backend
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hymn-app-jwt-secret-2026';
const TOKEN_EXPIRY = '30d';
const SALT_ROUNDS = 10;

export async function initAuthTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Add username column if missing (migration for old table)
  try { db.run('ALTER TABLE users ADD COLUMN username TEXT'); } catch(_) {}
}

export default function authRoutes(app, getDb) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email, password required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const db = await getDb();
      await initAuthTable(db);

      const existing = db.prepare('SELECT id FROM users WHERE email = ?');
      existing.bind([email]);
      const exists = existing.step();
      existing.free();

      if (exists) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const hash = bcrypt.hashSync(password, SALT_ROUNDS);
      db.run('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash]);

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
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }

      const db = await getDb();
      await initAuthTable(db);

      const stmt = db.prepare('SELECT id, username, email, password_hash FROM users WHERE email = ?');
      stmt.bind([email]);

      if (!stmt.step()) { stmt.free(); return res.status(401).json({ error: 'Invalid email or password' }); }

      const user = stmt.getAsObject(); stmt.free();
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) { return res.status(401).json({ error: 'Invalid email or password' }); }

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

      const db = await getDb();
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
