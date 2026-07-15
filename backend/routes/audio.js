// routes/audio.js — YouTube Audio Extraction
// When AUDIO_PROXY_TARGET env is set, proxies to that URL (e.g. MacBook backend via tunnel)
// Otherwise, uses yt-dlp directly (for local/free-cloud usage)

import { Router } from 'express';
import { resolveAudioUrl, cache } from '../lib/resolveAudio.js';

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
router.get('/cache/stats', (req, res) => {
  res.json({ cacheSize: cache.size });
});

export { cache };
export default router;
