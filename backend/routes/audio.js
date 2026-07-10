// routes/audio.js — YouTube Audio Extraction via yt-dlp
// Extracts audio URLs from YouTube for react-native-track-player

import { Router } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Regular expression to validate YouTube video IDs
const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Simple in-memory cache (URLs are only valid for ~6 hours)
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

  // Check cache
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

  // Multiple client strategies to bypass YouTube bot detection
  const strategies = [
    // Strategy 1: TV HTML5 client (different signature than web)
    {
      name: 'youtube:player_client=tv',
      fmt: 'bestaudio[ext=m4a]/bestaudio',
      extra: '--extractor-args "youtube:player_client=tv"',
    },
    // Strategy 2: Default web client (fallback)
    {
      name: 'default',
      fmt: 'bestaudio[ext=m4a]/bestaudio',
      extra: '',
    },
    // Strategy 3: Any audio format fallback
    {
      name: 'default-any',
      fmt: 'bestaudio',
      extra: '',
    },
  ];

  for (const strat of strategies) {
    try {
      console.log(`📻 Extracting audio for: ${cleanId} (${strat.name})`);

      const url = execSync(
        `yt-dlp -f "${strat.fmt}" ${strat.extra} --get-url --no-playlist "https://www.youtube.com/watch?v=${cleanId}"`,
        { encoding: 'utf8', timeout: 30000 }
      ).trim();

      if (!url) {
        console.warn(`Empty URL from strategy ${strat.name}`);
        continue;
      }

      // Try to get metadata (may fail with some clients)
      let title = cleanId;
      let duration = 0;
      let thumbnail = null;

      try {
        const metadataJson = execSync(
          `yt-dlp ${strat.extra} --print-json --no-playlist "https://www.youtube.com/watch?v=${cleanId}"`,
          { encoding: 'utf8', timeout: 30000 }
        ).trim();
        const metadata = JSON.parse(metadataJson);
        title = metadata.title || cleanId;
        duration = metadata.duration || 0;
        thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`;
      } catch (metaErr) {
        // Metadata is optional; continue with partial data
        console.warn(`Metadata fetch failed for ${cleanId} (${strat.name}): ${metaErr.message}`);
      }

      cache.set(cleanId, {
        url,
        title,
        duration,
        thumbnail,
        timestamp: Date.now(),
      });

      return res.json({ url, title, duration, thumbnail });
    } catch (err) {
      console.warn(`❌ Strategy ${strat.name} failed for ${cleanId}: ${err.message}`);
      // Continue to next strategy
    }
  }

  // All strategies failed
  console.error(`❌ All extraction strategies failed for ${cleanId}`);
  res.status(502).json({ error: 'Failed to extract audio URL' });
});

// GET /api/audio/cache/stats — debug endpoint
router.get('/cache/stats', (req, res) => {
  res.json({ cacheSize: cache.size });
});

export { cache };
export default router;
