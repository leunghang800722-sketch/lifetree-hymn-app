// Home page API routes — 10 sections for the main screen
// Uses ES module syntax + sql.js (matching server.js pattern)

import { Router } from 'express';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'hymns.db');

const router = Router();

// Lazy-load DB helper (same pattern as server.js)
let dbPromise = null;
async function getDb() {
  if (!dbPromise) {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    dbPromise = new SQL.Database(buffer);
  }
  return dbPromise;
}

// Helper: execute query and return array of objects
async function queryAll(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: execute query and return first row
async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

// 1. 每日精選一句 — 隨機返回一首 featured 詩歌
router.get('/daily-quote', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM hymns WHERE featured = 1 ORDER BY RANDOM() LIMIT 1');
    res.json(row || { message: 'No featured hymn available' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. 每日金句 — 隨機返回一首詩歌
router.get('/daily-verse', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM hymns ORDER BY RANDOM() LIMIT 1');
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 作者推薦 — 隨機挑一個 artist，返回佢嘅作品
router.get('/featured-artist', async (req, res) => {
  try {
    const artists = await queryAll(
      `SELECT artist, COUNT(*) as count FROM hymns
       WHERE artist IS NOT NULL AND artist != ''
       GROUP BY artist ORDER BY RANDOM() LIMIT 1`
    );
    if (!artists.length) {
      return res.status(500).json({ error: 'No artist found' });
    }
    const artistName = artists[0].artist;
    const hymns = await queryAll(
      'SELECT * FROM hymns WHERE artist = ? LIMIT 10',
      [artistName]
    );
    res.json({ artist: artistName, hymns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. 新作品 — 按 release_date DESC（fallback created_at）
router.get('/new-releases', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM hymns
       ORDER BY COALESCE(release_date, created_at) DESC
       LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 種類推薦 — 隨機返回 10 首
router.get('/genre-recommendation', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM hymns ORDER BY RANDOM() LIMIT 10');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. 根據喜好 — 隨機返回 10 首
router.get('/based-on-taste', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM hymns ORDER BY RANDOM() LIMIT 10');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. 共鳴詩 — 按 like_count DESC
router.get('/resonating', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM hymns ORDER BY like_count DESC LIMIT 10');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. 詩句榜 — 按 view_count DESC
router.get('/top-verses', async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM hymns ORDER BY view_count DESC LIMIT 10');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. 民謠分享 — category 包含 folk 或 民謠
router.get('/folk-sharing', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM hymns
       WHERE category LIKE '%folk%' OR category LIKE '%民謠%'
       ORDER BY RANDOM() LIMIT 10`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. 結合榜 — 綜合 view_count + like_count
router.get('/combined-charts', async (req, res) => {
  try {
    const rows = await queryAll(
      'SELECT * FROM hymns ORDER BY (COALESCE(view_count,0) + COALESCE(like_count,0)) DESC LIMIT 10'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
