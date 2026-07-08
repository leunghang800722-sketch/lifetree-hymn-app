// 詩歌App Database - 用 sql.js (純 JS SQLite，唔使 compile)
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'hymns.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  // 如果已經有 database file，load 佢
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 開 Table - 用新版 schema（加 album, title_en, lang）
  // ALTER TABLE can't add columns in sql.js, so we CREATE IF NOT EXISTS (won't drop existing)
  db.run(`
    CREATE TABLE IF NOT EXISTS hymns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      title_en TEXT DEFAULT '',
      artist TEXT,
      category TEXT DEFAULT '粵語',
      album TEXT DEFAULT '',
      lang TEXT DEFAULT '粵語',
      youtube_id TEXT NOT NULL,
      duration TEXT,
      lyrics TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 加新 column (如果未有的話，ignore error)
  try { db.run("ALTER TABLE hymns ADD COLUMN title_en TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE hymns ADD COLUMN album TEXT DEFAULT ''"); } catch(e) {}
  try { db.run("ALTER TABLE hymns ADD COLUMN lang TEXT DEFAULT '粵語'"); } catch(e) {}

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Playlists table (max 10 per user)
  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Playlist hymns table
  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_hymns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      hymn_id INTEGER NOT NULL,
      position INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (hymn_id) REFERENCES hymns(id)
    )
  `);

  saveDb();
  console.log('✅ Database 已準備好');
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database 未初始化！');
  }
  return db;
}

module.exports = { initDb, saveDb, getDb };