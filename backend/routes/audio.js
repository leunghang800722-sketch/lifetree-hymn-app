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
//
// PERF-STAGE2-2C-20260902 C-2 carve-out(Opus 5 §4.4 blocking-ish 意見)——
// `/cache/stats` 同 `/cache/warm-stats` 唔應該 410:兩條都唔掂 DB(讀
// in-memory Map / opsMetrics counter,<1ms、零 RSS 影響),A-4 嘅 perf 理據
// (「每 request 重開 61MB DB」)對佢哋唔成立;而且係我哋自己嘅維運觀察口
// (2026-07-28「神我屬祢」卡 loading 事故靠 /cache/stats 斷症、warm-stats 上
// 星期先用過)。410 佢哋 = 零收益 + 剷走下次撞 stall 事故要用嘅儀器。
// 逐字還原自 `ebe29ba~1`(410 化之前嗰個 commit)嘅原文,`/:youtubeId` 維持
// 410(冇 consumer,見上面段落)。
import { Router } from 'express';
import { cache, failCache, FAIL_TTL_MS, FAIL_TTL_PLAYBACK_MS } from '../lib/resolveAudio.js';
import { getOpsMetrics } from '../lib/opsMetrics.js';

const router = Router();

function gone(req, res) {
  console.log(`[deprecated-route] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  res.status(410).json({ error: 'Gone', message: '呢條 route 已停用 —— 前端冇再用緊(PERF-STAGE2-EXEC-20260902 §2A A-4)' });
}

router.get('/:youtubeId', gone);

// GET /api/audio/cache/stats — debug endpoint
// 2026-07-28 加 failCache 觀察口(Fable 5「神我屬祢」卡 loading 事故指示):
// 呢個 in-memory 負面快取(15分鐘)之前完全冇得睇,「一條片 resolve 持續失敗、
// failCache 唔斷重 arm」呢類狀況要重啟 backend 先發現得到。而家可以直接
// curl 呢個 endpoint 睇邊啲 id 而家仲喺 failCache、幾時到期,唔使靠估。
router.get('/cache/stats', (req, res) => {
  const now = Date.now();
  const failing = [...failCache.entries()]
    .filter(([, until]) => until > now)
    .map(([id, until]) => ({
      youtubeId: id,
      retryInSec: Math.round((until - now) / 1000),
      // APP-HANG-2026-08-17 —— 播放路徑用短視野(FAIL_TTL_PLAYBACK_MS),所以上面
      // 個 retryInSec 對真人播放嚟講唔再係實情。呢條係「真人撳播幾時解封」,
      // ≤0 = 而家撳落去已經會真真正正 resolve 一次。
      playbackRetryInSec: Math.round((until - FAIL_TTL_MS + FAIL_TTL_PLAYBACK_MS - now) / 1000),
    }));
  res.json({
    cacheSize: cache.size,
    failCacheSize: failing.length,
    failTtlSec: FAIL_TTL_MS / 1000,
    failTtlPlaybackSec: FAIL_TTL_PLAYBACK_MS / 1000,
    failing,
  });
});

// GET /api/audio/cache/warm-stats — THIRD-PASS-REVIEW §5 Batch D-2/D-4 量數口。
// 純讀 opsMetrics 嘅計數器(見 lib/opsMetrics.js),唔改任何行為。睇邊幾個數:
//   derived.trackStartWarmRatePct —— 「開一首歌」入面幾多 % 食住暖 cache(D-2 主指標)
//   total.keepWarm.ceiling        —— 追落後 timer 撞 CACHE_SIZE_CEILING 熄火嘅次數
//   total.resolve.winner / rescued —— 三招 yt-dlp 邊招贏、後備招救返幾多次(D-4)
router.get('/cache/warm-stats', (req, res) => {
  res.json(getOpsMetrics());
});

export default router;
