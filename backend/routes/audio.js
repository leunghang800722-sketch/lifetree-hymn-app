// routes/audio.js — YouTube Audio Extraction
//
// PERF-STAGE2-EXEC-20260902 §2A A-4 —— PERF-BASELINE-1A A4 用 frontend grep
// `api/audio`/`fetchAudioUrl` = 0 hit,comment 聲稱嘅「唯一 consumer」
// (App.js fetchAudioUrl)喺前端已經搵唔到。⚠️ 1A 亦記錄咗 `backend/check_hymns.cjs`
// (一個零引用嘅維運 script,見 PERF-BASELINE-1A A4 backend-root-scripts 表)
// 有一句真實 `fetch(.../api/audio/${youtube_id})` 呼叫——執行單 §2A A-4 明文
// 列呢條 route 做 410,依家跟單執行;呢個維運腳本本身冇被任何地方引用/排程,
// 影響範圍記錄喺 PERF-STAGE2-2A-20260902.md「限制」段。唔刪檔(留返 Stage 3
// 先做),掛載位置/router 結構原封不動。
import { Router } from 'express';

const router = Router();

function gone(req, res) {
  console.log(`[deprecated-route] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.status(410).json({ error: 'Gone', message: '呢條 route 已停用 —— 前端冇再用緊(PERF-STAGE2-EXEC-20260902 §2A A-4)' });
}

router.get('/:youtubeId', gone);
router.get('/cache/stats', gone);
router.get('/cache/warm-stats', gone);

export default router;
