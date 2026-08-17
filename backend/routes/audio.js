// routes/audio.js — YouTube Audio Extraction
// When AUDIO_PROXY_TARGET env is set, proxies to that URL (e.g. MacBook backend via tunnel)
// Otherwise, uses yt-dlp directly (for local/free-cloud usage)

import { Router } from 'express';
import { resolveAudioUrl, cache, failCache, FAIL_TTL_MS, FAIL_TTL_PLAYBACK_MS } from '../lib/resolveAudio.js';

const router = Router();

// Proxy target URL (local MacBook backend exposed via tunnel)
const PROXY_TARGET = process.env.AUDIO_PROXY_TARGET || null;

// If proxying, we don't need cache or yt-dlp on this server
const useProxy = !!PROXY_TARGET;

// Regular expression to validate YouTube video IDs
const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract clean YouTube ID from various input formats
 */
function extractYoutubeId(input) {
  if (!input || typeof input !== 'string') return null;
  if (YT_ID_REGEX.test(input)) return input;
  const match = input.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return match ? match[1] : null;
}

// GET /api/audio/:youtubeId
router.get('/:youtubeId', async (req, res) => {
  const { youtubeId } = req.params;
  const cleanId = extractYoutubeId(youtubeId);

  if (!cleanId) {
    return res.status(400).json({ error: 'Invalid YouTube ID format' });
  }

  // === PROXY MODE ===
  // Forward the request to the MacBook backend via tunnel
  if (useProxy) {
    try {
      console.log(`📻 Proxying audio request for: ${cleanId} → ${PROXY_TARGET}`);
      const response = await fetch(`${PROXY_TARGET}/api/audio/${cleanId}`, {
        signal: AbortSignal.timeout(35000),
      });
      if (!response.ok) {
        throw new Error(`Proxy returned ${response.status}`);
      }
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      console.error(`❌ Proxy failed for ${cleanId}: ${err.message}`);
      return res.status(502).json({ error: 'Audio extraction proxy failed', message: err.message });
    }
  }

  // === DIRECT yt-dlp MODE ===
  // Delegates to the shared resolver (async, cached, in-flight deduped).
  // Metadata (title/thumbnail) is not re-fetched here — the only current
  // consumer of this endpoint (App.js fetchAudioUrl) only reads `.url`.
  try {
    const url = await resolveAudioUrl(cleanId);
    return res.json({
      url,
      title: cleanId,
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`,
    });
  } catch (err) {
    console.error(`❌ Resolve failed for ${cleanId}: ${err.message}`);
    return res.status(502).json({ error: 'Failed to extract audio URL' });
  }
});

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

export { cache };
export default router;
