// routes/audio.js — YouTube Audio Extraction
// When AUDIO_PROXY_TARGET env is set, proxies to that URL (e.g. MacBook backend via tunnel)
// Otherwise, uses yt-dlp directly (for local/free-cloud usage)

import { Router } from 'express';
import { execSync } from 'child_process';

const router = Router();

// Proxy target URL (local MacBook backend exposed via tunnel)
const PROXY_TARGET = process.env.AUDIO_PROXY_TARGET || null;

// If proxying, we don't need cache or yt-dlp on this server
const useProxy = !!PROXY_TARGET;

// Regular expression to validate YouTube video IDs
const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 30 * 60 * 1000);

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

  // Check local cache first
  const cached = cache.get(cleanId);
  if (cached && cached.url && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({
      url: cached.url,
      title: cached.title,
      duration: cached.duration,
      thumbnail: cached.thumbnail,
      cached: true,
    });
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

      // Cache the result locally too
      if (data.url) {
        cache.set(cleanId, {
          url: data.url,
          title: data.title || cleanId,
          duration: data.duration || 0,
          thumbnail: data.thumbnail || null,
          timestamp: Date.now(),
        });
      }

      return res.json(data);
    } catch (err) {
      console.error(`❌ Proxy failed for ${cleanId}: ${err.message}`);
      return res.status(502).json({ error: 'Audio extraction proxy failed', message: err.message });
    }
  }

  // === DIRECT yt-dlp MODE ===
  // Multiple client strategies to bypass YouTube bot detection
  const strategies = [
    { name: 'youtube:player_client=tv', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '--extractor-args "youtube:player_client=tv"' },
    { name: 'default', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '' },
    { name: 'default-any', fmt: 'bestaudio', extra: '' },
  ];

  for (const strat of strategies) {
    try {
      console.log(`📻 Extracting audio for: ${cleanId} (${strat.name})`);
      const url = execSync(
        `yt-dlp -f "${strat.fmt}" ${strat.extra} --get-url --no-playlist "https://www.youtube.com/watch?v=${cleanId}"`,
        { encoding: 'utf8', timeout: 30000 }
      ).trim();

      if (!url) continue;

      let title = cleanId;
      let duration = 0;
      let thumbnail = null;
      try {
        const metaJson = execSync(
          `yt-dlp ${strat.extra} --print-json --no-playlist "https://www.youtube.com/watch?v=${cleanId}"`,
          { encoding: 'utf8', timeout: 30000 }
        ).trim();
        const meta = JSON.parse(metaJson);
        title = meta.title || cleanId;
        duration = meta.duration || 0;
        thumbnail = meta.thumbnail || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`;
      } catch (_) {}

      cache.set(cleanId, { url, title, duration, thumbnail, timestamp: Date.now() });
      return res.json({ url, title, duration, thumbnail });
    } catch (err) {
      console.warn(`❌ Strategy ${strat.name} failed: ${err.message}`);
    }
  }

  console.error(`❌ All extraction strategies failed for ${cleanId}`);
  res.status(502).json({ error: 'Failed to extract audio URL' });
});

// GET /api/audio/cache/stats — debug endpoint
router.get('/cache/stats', (req, res) => {
  res.json({ cacheSize: cache.size });
});

export { cache };
export default router;
