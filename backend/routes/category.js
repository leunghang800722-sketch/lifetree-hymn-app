// routes/category.js
// 分類 API — 7 維度（中文名/英文名/歌手/國語/粵語/英文/華語）
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

// 1. 中文名分類（lang='粵語' / '國語' / '台語'）
//    ⚠️ 2026-08-19 加咗 '台語':7872 投靠者的謳咾 實錘係台語(國語版係 7704),
//    Eric 拍板改 lang。但呢度六處查詢一直硬編死咗四個值,單改 DB 會令首歌
//    **由所有分類頁消失**(只剩搜尋揾得返)。所以「中文名分類」同「全部中文」
//    兩處要收埋台語 —— 佢本身就係中文歌;但**唔會**混入「國語詩歌」(lang='國語'),
//    分類先至啱。第日再有新語言值,記住同步呢兩處。
router.get('/chinese-name', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang IN ('國語', '粵語', '台語') ORDER BY title`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. 英文名分類（lang='英文'）
router.get('/english-name', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang = '英文' ORDER BY title_en`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. 按歌手分類（返回所有 unique artists + 詩歌數）
router.get('/artist', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT artist, COUNT(*) as count
       FROM hymns
       WHERE artist IS NOT NULL AND artist != ''
       GROUP BY artist
       ORDER BY count DESC, artist`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. 按歌手獲取詩歌（配合 /artist 使用）
router.get('/artist/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const results = await queryDb(
      'SELECT * FROM hymns WHERE artist = ?',
      [name]
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. 國語詩歌（lang='國語'）
router.get('/mandarin', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang = '國語' ORDER BY title`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. 粵語詩歌（lang='粵語'）
router.get('/cantonese', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang = '粵語' ORDER BY title`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. 英文詩歌（lang='英文'）
router.get('/english', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang = '英文' ORDER BY title_en`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. 所有中文詩歌（國語 + 粵語）
router.get('/chinese', async (req, res) => {
  try {
    const results = await queryDb(
      `SELECT * FROM hymns WHERE lang IN ('國語', '粵語', '台語') ORDER BY title`
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
