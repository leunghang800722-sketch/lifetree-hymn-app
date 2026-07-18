// 詩歌App Backend — YouTube Audio Extraction Server
// Provides audio URLs for react-native-track-player

import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import homeRoutes from './routes/home.js';
import searchRoutes from './routes/search.js';
import categoryRoutes from './routes/category.js';
import audioRoutes from './routes/audio.js';
import authRoutes from './routes/auth.js';
import streamRoutes from './routes/stream.js';
import { resolveAudioUrl } from './lib/resolveAudio.js';

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
app.use('/api/audio', audioRoutes);
app.use('/api/stream', streamRoutes(getDb));
authRoutes(app, getDb);

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all hymns from the database
app.get('/api/hymns', async (req, res) => {
  try {
    const db = await getDb();
    // lyrics included so the player can show real 歌詞 (§3.4) and grey out the
    // 歌詞 pill when a song has none. Only ~10 of the curated songs have lyrics,
    // so the payload cost is negligible.
    const stmt = db.prepare('SELECT id, title, artist, youtube_id, lang, duration, lyrics FROM hymns ORDER BY id');
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



// Global unhandled rejection / exception handler to prevent backend crash
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('🚨 Unhandled rejection:', reason);
});

app.listen(PORT, async () => {
  console.log(`🎵 Hymn App Backend running on port ${PORT}`);
  console.log(`📡 Audio API: http://localhost:${PORT}/api/audio/:youtubeId (yt-dlp)`);
  console.log(`📡 Hymns API: http://localhost:${PORT}/api/hymns`);
  
  // Background pre-cache — deliberately NARROW.
  //
  // This used to hammer yt-dlp for all 1518 hymns on every boot. That's the
  // same burst pattern that got Zeabur's IP YouTube-banned, and it was doing it
  // from the home broadband line the whole app now depends on. Not worth
  // gambling the one working IP just to pre-warm songs nobody may play.
  //
  // So: warm only a small, bounded set that a first tap realistically hits.
  // Most home sections are ORDER BY RANDOM() so they can't be predicted; we
  // take the deterministic ones (featured / newest / most liked / most viewed)
  // plus the head of the default id-ordered list, dedupe, and cap it.
  // Everything else resolves on demand at play time (~1-2s) and is then cached.
  const PRECACHE_MAX = 50;
  const PRECACHE_CONCURRENCY = 2; // was 4 — gentler on the shared home IP
  try {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);

    const pick = (sql) => {
      const out = [];
      try {
        const s = db.prepare(sql);
        while (s.step()) out.push(s.getAsObject());
        s.free();
      } catch (_) {}
      return out;
    };

    const candidates = [
      ...pick('SELECT id, youtube_id FROM hymns WHERE featured = 1 LIMIT 10'),
      ...pick('SELECT id, youtube_id FROM hymns ORDER BY COALESCE(release_date, created_at) DESC LIMIT 10'),
      ...pick('SELECT id, youtube_id FROM hymns ORDER BY like_count DESC LIMIT 10'),
      ...pick('SELECT id, youtube_id FROM hymns ORDER BY view_count DESC LIMIT 10'),
      ...pick('SELECT id, youtube_id FROM hymns ORDER BY id LIMIT 20'),
    ];
    db.close();

    // dedupe by youtube_id (the DB has duplicate youtube_ids under different ids)
    const seen = new Set();
    const hymns = [];
    for (const h of candidates) {
      if (!h.youtube_id || seen.has(h.youtube_id)) continue;
      seen.add(h.youtube_id);
      hymns.push(h);
      if (hymns.length >= PRECACHE_MAX) break;
    }

    if (hymns.length > 0) {
      console.log(`🔁 Background pre-caching ${hymns.length} hymns (narrow set; rest resolve on demand)...`);
      let cached = 0;
      const queue = [...hymns];
      async function worker() {
        while (queue.length > 0) {
          const hymn = queue.shift();
          try {
            await resolveAudioUrl(hymn.youtube_id);
            cached++;
          } catch (_) {
            // dead link — skip; the resolver now remembers the failure briefly
          }
        }
      }
      await Promise.all(Array.from({ length: PRECACHE_CONCURRENCY }, () => worker()));
      console.log(`✅ Pre-cache complete: ${cached}/${hymns.length} hymns cached`);
    }
  } catch (e) {
    console.log('⚠️ Pre-cache skipped (first run? DB may need initialization):', e.message);
  }
});
