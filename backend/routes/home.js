// Home page API routes — 10 sections for the main screen
// Uses ES module syntax + sql.js (matching server.js pattern)

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../lib/serverDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLE_VERSES_PATH = path.join(__dirname, '..', 'data', 'bible-verses.json');

const router = Router();

// PERF-STAGE2-EXEC-20260902 §2A A-4 —— 9/10 條子 route(除 `/daily-verse`
// 外)前端 `src/services/homeApi.js`(homeApi object)全 repo grep 都搵唔到
// 第二個呼叫者(PERF-BASELINE-1A A4)。`/daily-verse` 係 `homeApi.js` 淨係
// export 嗰個 method,繼續行真 DB 查詢;其餘 9 條即刻 410 Gone,**唔再執行**
// 呢啲 route 本身嘅 query(`queryAll`/`queryOne` 呢兩個 helper 仍然保留畀
// `/daily-verse` 以外?——不,`/daily-verse` 本身唔用呢兩個 helper,佢直接讀
// bible-verses.json;`queryAll`/`queryOne` 淨係俾下面 9 條已停用嘅 route
// 用,依家冇被呼叫到,留喺度唔刪(Stage 3 先執整份檔)。唔刪檔、掛載位置/
// router 結構原封不動。
function gone(req, res) {
  console.log(`[deprecated-route] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.status(410).json({ error: 'Gone', message: '呢條 route 已停用 —— 前端冇再用緊(PERF-STAGE2-EXEC-20260902 §2A A-4)' });
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

// 1. 每日精選一句 — 隨機返回一首 featured 詩歌 —— 已停用(A-4)
router.get('/daily-quote', gone);

// 2. 每日金句 — 隨機返回一句聖經金句
router.get('/daily-verse', async (req, res) => {
  try {
    const verses = JSON.parse(fs.readFileSync(BIBLE_VERSES_PATH, 'utf8'));
    // Same verse for the whole day using date-based seed
    const today = new Date().toISOString().slice(0, 10);
    const dayOfYear = Math.floor((new Date(today).getTime() - new Date(today.slice(0,4), 0, 0).getTime()) / 86400000);
    const idx = dayOfYear % verses.length;
    res.json(verses[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. 作者推薦 — 已停用(A-4)
router.get('/featured-artist', gone);

// 4. 新作品 — 已停用(A-4)
router.get('/new-releases', gone);

// 5. 種類推薦 — 已停用(A-4)
router.get('/genre-recommendation', gone);

// 6. 根據喜好 — 已停用(A-4)
router.get('/based-on-taste', gone);

// 7. 共鳴詩 — 已停用(A-4)
router.get('/resonating', gone);

// 8. 詩句榜 — 已停用(A-4)
router.get('/top-verses', gone);

// 9. 民謠分享 — 已停用(A-4)
router.get('/folk-sharing', gone);

// 10. 結合榜 — 已停用(A-4)
router.get('/combined-charts', gone);

export default router;
