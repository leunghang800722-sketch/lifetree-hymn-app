// routes/category.js
// 分類 API — 7 維度（中文名/英文名/歌手/國語/粵語/英文/華語）
//
// PERF-STAGE2-EXEC-20260902 §2A A-4 —— 前端零引用(PERF-BASELINE-1A A4:全
// repo grep `api/category` = 0 hit)。`/mandarin`(35,145,812 B)、
// `/cantonese`(15,971,383 B)兩條實測 prod total time 21-33 秒 / 16-29 秒,
// 每個 GET 一樣無條件重開 61MB DB 檔(`queryDb()` 同 search.js 一模一樣嘅
// inline loader,唔經 singleton)。依家改做即刻 410 Gone,**唔再執行**呢段
// DB loader/query 半步——唔刪檔,掛載位置/router 結構原封不動。
import { Router } from 'express';

const router = Router();

function gone(req, res) {
  console.log(`[deprecated-route] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.status(410).json({ error: 'Gone', message: '呢條 route 已停用 —— 前端冇再用緊(PERF-STAGE2-EXEC-20260902 §2A A-4)' });
}

router.get('/chinese-name', gone);
router.get('/english-name', gone);
router.get('/artist', gone);
router.get('/artist/:name', gone);
router.get('/mandarin', gone);
router.get('/cantonese', gone);
router.get('/english', gone);
router.get('/chinese', gone);

export default router;
