// ops/auth/test/token-revoke-harness.mjs — TOKEN-REVOKE-DRILL-EXEC-20260929 Part A 驗證
//
// 隔離:copy backend/lib + backend/routes 去 scratch 樹(USER_DB_PATH 因而落 scratch),
// 自己生成 JWT secret,server 子進程隨機 port。唔讀/寫 prod users.db / .env / token。
// 用法: node ops/auth/test/token-revoke-harness.mjs [scratchRoot]
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '../../../backend');
const root = process.argv[2] || os.tmpdir();
fs.mkdirSync(root, { recursive: true });
const TREE = fs.mkdtempSync(path.join(root, 'revoke-'));
const SECRET = crypto.randomBytes(24).toString('hex');
const require_ = (await import('module')).createRequire(path.join(BACKEND, 'x.js'));
const jwt = require_('jsonwebtoken');
const bcrypt = require_('bcryptjs');

fs.cpSync(path.join(BACKEND, 'lib'), path.join(TREE, 'lib'), { recursive: true });
fs.cpSync(path.join(BACKEND, 'routes'), path.join(TREE, 'routes'), { recursive: true });
fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(TREE, 'node_modules'));
fs.writeFileSync(path.join(TREE, 'package.json'), '{"type":"module"}');
const USERS_DB = path.join(TREE, 'users.db');

const OLDPW = 'OldPass123';
const NEWPW = 'NewPass456';
const PH_A = '+85290000001'; // 會被 reset
const PH_B = '+85290000002'; // 對照:唔 reset
const PH_L = '+85290000003'; // 舊用戶 token_valid_after NULL

fs.writeFileSync(path.join(TREE, 'serve.mjs'), `
import express from 'express';
import { getUserDb, saveUserDb } from './lib/userDb.js';
import authRoutes from './routes/auth.js';
import otpAuthRoutes from './routes/otpAuth.js';
import presenceRoutes from './routes/presence.js';
import friendsRoutes from './routes/friends.js';
const app = express();
app.use(express.json());
const db = await getUserDb();
if (process.env.SEED === '1') {
  const seed = JSON.parse(process.env.SEED_ROWS);
  for (const r of seed) db.run('INSERT INTO users (username,email,password_hash,phone) VALUES (?,?,?,?)', [r.u, r.e, r.h, r.p]);
  saveUserDb(db);
}
authRoutes(app, getUserDb); otpAuthRoutes(app, getUserDb); presenceRoutes(app); friendsRoutes(app);
app.post('/__dbg/reset_seen/:id', (q, s) => { db.run('UPDATE users SET last_seen_at=NULL WHERE id=?', [q.params.id]); s.end('ok'); });
app.get('/__dbg/seen/:id', (q, s) => { const st = db.prepare('SELECT last_seen_at FROM users WHERE id=?'); st.bind([q.params.id]); st.step(); const r = st.getAsObject(); st.free(); s.json(r); });
const srv = app.listen(0, '127.0.0.1', () => console.log('PORT ' + srv.address().port));
`);

const children = [];
function startServer(seedRows) {
  return new Promise((resolve, reject) => {
    const env = { PATH: process.env.PATH, HOME: os.tmpdir(), JWT_SECRET: SECRET };
    if (seedRows) { env.SEED = '1'; env.SEED_ROWS = JSON.stringify(seedRows); }
    const c = spawn(process.execPath, [path.join(TREE, 'serve.mjs')], { cwd: TREE, env });
    children.push(c);
    let buf = ''; let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.stdout.on('data', (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) resolve({ proc: c, base: `http://127.0.0.1:${m[1]}` }); });
    c.on('exit', (code) => reject(new Error('server exited ' + code + ' ' + err)));
    setTimeout(() => reject(new Error('server start timeout ' + err)), 15000);
  });
}
function killChild(c) { const i = children.indexOf(c); c.removeAllListeners('exit'); c.kill('SIGTERM'); if (i >= 0) children.splice(i, 1); }

const rows = [];
function rec(id, what, got) { rows.push({ id, what, got }); console.log(`[${id}] ${what} => ${got}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(base, method, url, token, body) {
  const r = await fetch(base + url, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
async function probeAll(base, token, uid, tag) {
  const out = {};
  out.me = (await call(base, 'GET', '/api/auth/me', token)).status;
  out.renew = (await call(base, 'POST', '/api/auth/renew', token)).status;
  out.requireAuth = (await call(base, 'GET', '/api/friends', token)).status; // 真 requireAuth route
  await call(base, 'POST', `/__dbg/reset_seen/${uid}`);
  await call(base, 'POST', '/api/presence/heartbeat', token, { deviceId: 'abcdef012345' + uid, state: 'active' });
  const seen = (await call(base, 'GET', `/__dbg/seen/${uid}`)).json.last_seen_at;
  out.presence = seen ? 'authenticated(last_seen_at set)' : 'guest(last_seen_at NULL)';
  return out;
}
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ');

try {
  const hOld = bcrypt.hashSync(OLDPW, 4);
  const seed = [
    { u: 'userA', e: 'a@x.test', h: hOld, p: PH_A },
    { u: 'userB', e: 'b@x.test', h: hOld, p: PH_B },
    { u: 'userL', e: 'l@x.test', h: hOld, p: PH_L },
  ];
  const s1 = await startServer(seed);
  const base = s1.base;
  const mk = (id, name, extra = {}, opts = { expiresIn: '30d' }) => jwt.sign({ id, username: name, ...extra }, SECRET, opts);
  // 舊 token:iat 拉到 1 小時前,避開「同一秒」邊界
  const past = Math.floor(Date.now() / 1000) - 3600;
  const oldA = jwt.sign({ id: 1, username: 'userA', iat: past }, SECRET, { expiresIn: '30d' });
  const oldB = jwt.sign({ id: 2, username: 'userB', iat: past }, SECRET, { expiresIn: '30d' });
  const oldL = jwt.sign({ id: 3, username: 'userL', iat: past }, SECRET, { expiresIn: '30d' });

  // A-1
  rec('A-1', 'token_valid_after NULL(userA 未 reset 前 + userL):舊 token', `userA:{${fmt(await probeAll(base, oldA, 1))}} userL:{${fmt(await probeAll(base, oldL, 3))}}`);
  const nullCol = await call(base, 'POST', '/api/auth/login-phone', null, { phone: PH_L, password: OLDPW });
  rec('A-1', 'login-phone 簽發內容(唔改)', `status=${nullCol.status} payloadKeys=${Object.keys(jwt.decode(nullCol.json.token)).join(',')}`);

  // reset-password
  await sleep(1100); // 確保 reset 秒 > 之前簽嘅 token iat,亦令「新 token iat >= 值」有意義
  const ticket = jwt.sign({ phone: PH_A, purpose: 'phone_verified' }, SECRET, { expiresIn: '10m' });
  const rs = await call(base, 'POST', '/api/auth/reset-password', null, { ticket, password: NEWPW });
  const newA = rs.json?.token;
  const dec = jwt.decode(newA);
  rec('A-2', 'reset-password response', `status=${rs.status} newToken.iat=${dec?.iat}`);
  rec('A-2', '舊 token(userA)每個入口', fmt(await probeAll(base, oldA, 1)));
  rec('A-2', 'response 新 token 每個入口', fmt(await probeAll(base, newA, 1)));
  rec('A-2', '對照 userB 舊 token(未 reset)', fmt(await probeAll(base, oldB, 2)));
  rec('A-2', '新密碼登入 / 舊密碼登入', `${(await call(base, 'POST', '/api/auth/login-phone', null, { phone: PH_A, password: NEWPW })).status} / ${(await call(base, 'POST', '/api/auth/login-phone', null, { phone: PH_A, password: OLDPW })).status}`);

  // A-3
  rec('A-3', '舊 token 打 renew(冇新 token 回)', `status=${(await call(base, 'POST', '/api/auth/renew', oldA)).status}`);
  const rn = await call(base, 'POST', '/api/auth/renew', newA);
  rec('A-3', '新 token renew(續得,新 token 亦有效)', `status=${rn.status} renewedMe=${(await call(base, 'GET', '/api/auth/me', rn.json?.token)).status}`);

  // A-4
  const noIat = jwt.sign({ id: 1, username: 'userA' }, SECRET, { expiresIn: '30d', noTimestamp: true });
  rec('A-4', `冇 iat 偽造 token(iat=${jwt.decode(noIat).iat}) 對有 token_valid_after 嘅 userA`, fmt(await probeAll(base, noIat, 1)));
  const noIatB = jwt.sign({ id: 2, username: 'userB' }, SECRET, { expiresIn: '30d', noTimestamp: true });
  rec('A-4', '(補充)冇 iat 對 NULL 用戶 userB', fmt(await probeAll(base, noIatB, 2)));

  // A-6:重起(fresh process 由碟 load)
  killChild(s1.proc);
  await sleep(300);
  const s2 = await startServer(null);
  rec('A-6', 'restart 後(新進程由 users.db 讀)舊 token userA', fmt(await probeAll(s2.base, oldA, 1)));
  rec('A-6', 'restart 後 新 token userA', fmt(await probeAll(s2.base, newA, 1)));
  rec('A-6', 'restart 後 userB/userL 舊 token 照 200', `B:{${fmt(await probeAll(s2.base, oldB, 2))}} L:{${fmt(await probeAll(s2.base, oldL, 3))}}`);
  killChild(s2.proc);

  // A-5:舊 schema db 副本
  const T5 = fs.mkdtempSync(path.join(root, 'mig-'));
  fs.cpSync(path.join(BACKEND, 'lib'), path.join(T5, 'lib'), { recursive: true });
  fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(T5, 'node_modules'));
  fs.writeFileSync(path.join(T5, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(T5, 'mig.mjs'), `
import initSqlJs from 'sql.js'; import fs from 'fs';
const SQL = await initSqlJs();
const old = new SQL.Database();
old.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, phone TEXT, created_at TEXT DEFAULT (datetime('now')))");
old.run("INSERT INTO users (username,email,password_hash) VALUES ('legacy','l@l.test','x')");
fs.writeFileSync('./users.db', Buffer.from(old.export()));
const cols = (d) => { const r = d.exec('PRAGMA table_info(users)')[0].values.map(v => v[1]); return r; };
console.log('before has token_valid_after:', cols(old).includes('token_valid_after'));
const { getUserDb } = await import('./lib/userDb.js');
const db = await getUserDb();
console.log('after boot 1 has token_valid_after:', cols(db).includes('token_valid_after'));
const r = db.exec('SELECT id, token_valid_after FROM users')[0].values; console.log('legacy row token_valid_after:', JSON.stringify(r));
`);
  fs.writeFileSync(path.join(T5, 'mig2.mjs'), `
import initSqlJs from 'sql.js';
const { getUserDb } = await import('./lib/userDb.js');
const db = await getUserDb(); // 第二次起:欄已存在,ALTER 應被 try/catch 吞
console.log('after boot 2 (欄已存在,無報錯) has token_valid_after:', db.exec('PRAGMA table_info(users)')[0].values.some(v => v[1]==='token_valid_after'));
`);
  const { execFileSync } = await import('child_process');
  const runN = (f) => execFileSync(process.execPath, [path.join(T5, f)], { cwd: T5, env: { PATH: process.env.PATH, JWT_SECRET: SECRET } }).toString().trim().replace(/\n/g, ' | ');
  rec('A-5', '舊 schema db 副本起 boot#1', runN('mig.mjs'));
  rec('A-5', '重起 boot#2', runN('mig2.mjs'));
} catch (e) {
  console.log('HARNESS ERROR', e.stack || e);
  process.exitCode = 1;
} finally {
  for (const c of [...children]) killChild(c);
}
fs.writeFileSync(path.join(TREE, 'results.json'), JSON.stringify(rows, null, 2));
console.log('scratch tree:', TREE);
