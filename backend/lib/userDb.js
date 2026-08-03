// lib/userDb.js — 會員系統獨立 DB(MEMBERSHIP-PLAN §2.1)
//
// 用戶數據唔搭 hymns.db 順風車:嗰邊有夜晚 grow/curate/lyrics job 嘅 lock
// 協議,backend 對佢係「讀完唔 reload」;用戶數據就要日頭零散寫、即時
// persist、得 server process 一個寫入者。分開兩個檔,兩邊互不干擾。
//
// 每次寫完即刻 atomic save(export → 寫 tmp → rename),抄 hymnDb.js 現成
// 做法。用戶量細(幾十人),每次全量 export 冇壓力。

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const USER_DB_PATH = path.join(__dirname, '..', 'users.db');

function initSchema(db) {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // 遷移:phone 欄位可能係舊版留低嘅(冇 UNIQUE),保持一致。
  try { db.run('ALTER TABLE users ADD COLUMN phone TEXT'); } catch (_) {}
  // requireAuth 順手記低最後活躍時間,舊 DB 冇呢欄就補一次(MEMBERSHIP-PHASE1 §1.2)。
  try { db.run('ALTER TABLE users ADD COLUMN last_seen_at TEXT'); } catch (_) {}
  // 管理員角色(MEMBERSHIP-PHASE2-ADMIN-PLAN §2.1)—— 冇任何 HTTP API 寫得,
  // 唯一途徑係 scripts/setAdmin.js。SQLite ADD COLUMN 帶 DEFAULT 對舊行都生效,
  // 但讀嗰邊一律再兜底 `row.role || 'member'`,唔賭 driver 行為。
  try { db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'"); } catch (_) {}
  // 電話+密碼登入(PHONE-PASSWORD-AUTH-PLAN §4)——純加欄,零破壞。舊行兩個
  // 新欄係 NULL,所有讀嗰邊都要容忍 NULL(username 一早已經係咁)。
  try { db.run('ALTER TABLE users ADD COLUMN gender TEXT'); } catch (_) {}
  try { db.run('ALTER TABLE users ADD COLUMN birth_year INTEGER'); } catch (_) {}

  // ── 會員系統 Phase 1:跨裝置同步(MEMBERSHIP-PHASE1-LOGIN-SYNC §1.1)──────
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    user_id    INTEGER NOT NULL,
    hymn_id    INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, hymn_id)
  )`);

  // 清單 id 係 client 生成嘅 TEXT('pl_<timestamp>'),用 (user_id, id) 做 PK
  // 令前端零遷移,唔使 server↔client id remap。songs 一舊過存 JSON,唔開
  // playlist_songs 表(母 plan §2.2 嗰個表係俾將來分享/協作先需要)。
  db.run(`CREATE TABLE IF NOT EXISTS playlists (
    user_id    INTEGER NOT NULL,
    id         TEXT NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER DEFAULT 0,
    songs_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    deleted    INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, id)
  )`);

  // ── 會員系統 Phase 3:分享播放清單(MEMBERSHIP-PHASE3-SHARE-PLAN §1.1)──────
  // token 係一個清單一條、永久有效(冇 expires_at)——失效途徑得兩條:清單
  // 本身刪咗(playlists.deleted=1,GET 果邊 join 判斷)、或者呢度 revoked=1
  // (今次唔出「取消分享」UI,DB/API 留後路)。冇任何 FOREIGN KEY 約束—— sql.js
  // 唔逼 enforce,同 favorites/playlists 一致做法(靠 app 層驗 ownership)。
  db.run(`CREATE TABLE IF NOT EXISTS playlist_shares (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    playlist_id TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    revoked     INTEGER DEFAULT 0
  )`);
}

export function saveUserDb(db) {
  const tmp = `${USER_DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, USER_DB_PATH);
}

let dbInstance = null;
let dbPromise = null;

// Lazy singleton, 同 server.js 個 getDb() 一樣嘅 pattern。第一次攞就順手
// 建檔(冇 users.db 就開新嘅),之後全部操作行同一個 in-memory 實例 +
// 每次寫完 saveUserDb() 落碟。
export async function getUserDb() {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs();
      const db = fs.existsSync(USER_DB_PATH)
        ? new SQL.Database(fs.readFileSync(USER_DB_PATH))
        : new SQL.Database();
      initSchema(db);
      saveUserDb(db); // 令 users.db 喺第一次 boot 即刻喺碟出現,唔使等第一個寫操作
      dbInstance = db;
      return db;
    })();
  }
  return dbPromise;
}
