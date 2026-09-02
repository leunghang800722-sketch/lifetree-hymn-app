// routes/search.js
// 搜尋 API — 4 維度（歌名/歌手/歌詞/專輯）
//
// PERF-STAGE2-EXEC-20260902 §2A A-4 —— 前端零引用(PERF-BASELINE-1A A4:
// App.js + frontend/hymn-app/src 全 repo grep `api/search` = 0 hit,正控用
// `resolveAudio`/`api/hymns` 已證 grep 有效)。每個 GET 之前會無條件
// `initSqlJs()` + `fs.readFileSync()` 61MB DB 檔 + `new SQL.Database()`
// (完全冇快取,唔經 `lib/serverDb.js` singleton),1A A2 已經記錄呢個成本。
// 依家改做即刻 410 Gone,**唔再執行**呢段 inline DB loader/query 半步——
// 唔刪檔(留返 Stage 3 先做),掛載位置/router 結構原封不動。
import { Router } from 'express';

const router = Router();

function gone(req, res) {
  console.log(`[deprecated-route] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.status(410).json({ error: 'Gone', message: '呢條 route 已停用 —— 前端冇再用緊(PERF-STAGE2-EXEC-20260902 §2A A-4)' });
}

router.get('/all', gone);
router.get('/title', gone);
router.get('/artist', gone);
router.get('/lyrics', gone);
router.get('/album', gone);

export default router;
