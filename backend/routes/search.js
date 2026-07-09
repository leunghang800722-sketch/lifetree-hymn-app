// routes/search.js
// 搜尋 API — 4 維度（歌名/歌手/歌詞/專輯）
import { Router } from 'express';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'hymns.db');

const router = Router();

// Helper: 執行 SQL query 並回傳結果陣列
async function queryDb(sql, params = []) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  db.close();
  return results;
}

// 1. 全維度搜尋 — 搜尋 title, artist, lyrics, album
router.get('/all', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  try {
    const results = await queryDb(
      `SELECT * FROM hymns
       WHERE title LIKE ? OR artist LIKE ? OR lyrics LIKE ? OR album LIKE ?
       ORDER BY
         CASE
           WHEN title LIKE ? THEN 1
           WHEN artist LIKE ? THEN 2
           WHEN lyrics LIKE ? THEN 3
           ELSE 4
         END
       LIMIT 50`,
      [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. 歌名搜尋
router.get('/title', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  try {
    const results = await queryDb(
      'SELECT * FROM hymns WHERE title LIKE ? LIMIT 50',
      [`%${q}%`]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. 歌手搜尋
router.get('/artist', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  try {
    const results = await queryDb(
      'SELECT * FROM hymns WHERE artist LIKE ? LIMIT 50',
      [`%${q}%`]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. 歌詞搜尋
router.get('/lyrics', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  try {
    const results = await queryDb(
      'SELECT * FROM hymns WHERE lyrics LIKE ? LIMIT 50',
      [`%${q}%`]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. 專輯搜尋
router.get('/album', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter: q' });
  try {
    const results = await queryDb(
      'SELECT * FROM hymns WHERE album LIKE ? LIMIT 50',
      [`%${q}%`]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
