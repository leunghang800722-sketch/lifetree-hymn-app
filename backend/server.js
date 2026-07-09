// 詩歌App Backend — YouTube Audio Extraction Server
// Provides audio URLs for react-native-track-player

import express from 'express';
import cors from 'cors';
import { exec, execSync } from 'child_process';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import homeRoutes from './routes/home.js';
import searchRoutes from './routes/search.js';
import categoryRoutes from './routes/category.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'hymns.db');

// Lazy-load DB on first request
let dbPromise = null;
async function getDb() {
  if (!dbPromise) {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    dbPromise = new SQL.Database(buffer);
  }
  return dbPromise;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api/home', homeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/category', categoryRoutes);

// Super simple APK download at root level
app.get('/app.apk', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'app.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="hymn-app.apk"');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Send file error:', err);
      res.status(500).send('Download failed');
    }
  });
});

// APK download with attachment header (must be before static middleware)
app.get('/downloads/app.apk', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'app.apk');
  res.setHeader('Content-Disposition', 'attachment; filename="hymn-app-v1.3.0-week2.apk"');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.sendFile(filePath);
});

// Serve other static files
app.use('/downloads', express.static('public'));

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

app.get('/api/audio/:youtubeId', async (req, res) => {
  const { youtubeId } = req.params;
  
  // Validate ID
  if (!YT_ID_REGEX.test(youtubeId)) {
    return res.status(400).json({ error: 'Invalid YouTube ID format' });
  }

  // Check cache (skip if cached url is empty — invalid)
  const cached = cache.get(youtubeId);
  if (cached && cached.url && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({ 
      url: cached.url, 
      title: cached.title,
      duration: cached.duration,
      cached: true
    });
  }

  try {
    // Use yt-dlp to extract audio URL and metadata
    // --get-url: get direct URL
    // -f bestaudio[ext=m4a]: best audio in M4A format
    const url = execSync(
      `yt-dlp -f "bestaudio[ext=m4a]" --cookies cookies.txt --js-runtime deno --get-url --no-playlist --extractor-args "youtube:skip=webpage" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { encoding: 'utf8', timeout: 30000 }
    ).trim();

    // Get metadata (title + duration)
    const metadataJson = execSync(
      `yt-dlp --cookies cookies.txt --js-runtime deno --print-json --no-playlist --extractor-args "youtube:skip=webpage" "https://www.youtube.com/watch?v=${youtubeId}"`,
      { encoding: 'utf8', timeout: 30000 }
    ).trim();
    
    const metadata = JSON.parse(metadataJson);
    const title = metadata.title || 'Unknown';
    const duration = metadata.duration || 0;
    const thumbnail = metadata.thumbnail || `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

    // Validate url is not empty before caching/returning
    if (!url) {
      console.error(`Empty URL returned by yt-dlp for ${youtubeId}`);
      throw new Error('Empty URL from yt-dlp');
    }
    
    // Cache the result
    cache.set(youtubeId, {
      url,
      title,
      duration,
      timestamp: Date.now()
    });

    res.json({ url, title, duration, thumbnail });
  } catch (err) {
    console.error(`Failed to extract audio for ${youtubeId}:`, err.message);
    
    // Fallback: try different audio format
    try {
      const urlFallback = execSync(
        `yt-dlp -f "bestaudio/best" --cookies cookies.txt --js-runtime deno --get-url --no-playlist --extractor-args "youtube:skip=webpage" "https://www.youtube.com/watch?v=${youtubeId}"`,
        { encoding: 'utf8', timeout: 30000 }
      ).trim();
      
      // Validate fallback url is not empty
      if (!urlFallback) {
        return res.status(502).json({ error: 'Failed to extract audio URL (empty fallback)' });
      }
      
      res.json({ url: urlFallback, title: youtubeId, duration: 0, thumbnail: null });
    } catch (err2) {
      res.status(502).json({ error: 'Failed to extract audio URL' });
    }
  }
});

// Get all hymns from the database
app.get('/api/hymns', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT id, title, artist, youtube_id, lang, duration FROM hymns ORDER BY id');
    const hymns = [];
    while (stmt.step()) {
      hymns.push(stmt.getAsObject());
    }
    res.json({ data: hymns });
  } catch (err) {
    console.error('Failed to fetch hymns:', err.message);
    res.status(500).json({ error: 'Failed to fetch hymns' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: cache.size });
});

// ===== Background pre-cache: non-blocking =====
const MAX_CONCURRENT_DOWNLOADS = 4; // Limit concurrent yt-dlp processes

async function preCacheOne(youtubeId) {
  return new Promise((resolve) => {
    exec(
      `yt-dlp -f "bestaudio[ext=m4a]" --get-url --no-playlist "https://www.youtube.com/watch?v=${youtubeId}"`,
      { timeout: 30000 },
      (error, stdout) => {
        if (!error && stdout) {
          const url = stdout.trim();
          if (url) {
            cache.set(youtubeId, { url, title: '', duration: 0, timestamp: Date.now() });
          }
        }
        resolve();
      }
    );
  });
}

async function preCacheAllHymns() {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT youtube_id FROM hymns ORDER BY id');
    const ids = [];
    while (stmt.step()) ids.push(stmt.getAsObject().youtube_id);
    console.log(`🔁 Pre-caching ${ids.length} hymns (background, max ${MAX_CONCURRENT_DOWNLOADS} concurrent)...`);
    
    // Process with concurrency limit
    let pending = 0;
    for (const yt of ids) {
      if (cache.has(yt)) continue;
      pending++;
      preCacheOne(yt); // fire-and-forget (non-blocking)
      if (pending >= MAX_CONCURRENT_DOWNLOADS) {
        await new Promise(r => setTimeout(r, 1000));
        pending = 0;
      }
    }
    console.log(`✅ Background pre-cache started for ${ids.length} hymns (concurrency: ${MAX_CONCURRENT_DOWNLOADS})`);
  } catch (e) {
    console.error('Pre-cache error:', e.message);
  }
}

// Global unhandled rejection / exception handler to prevent backend crash
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('🚨 Unhandled rejection:', reason);
});

app.listen(PORT, async () => {
  console.log(`🎵 Hymn App Backend running on port ${PORT}`);
  console.log(`📡 Audio API: http://localhost:${PORT}/api/audio/:youtubeId`);
  // Start pre-caching in background (non-blocking, server stays responsive)
  // Disabled by default (Zeabur OOM issue). Enable with ENABLE_PRECACHE=true env var
  if (process.env.ENABLE_PRECACHE === 'true') {
    preCacheAllHymns();
  }
});
