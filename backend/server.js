// 詩歌App Backend — YouTube Audio Extraction Server
// Provides audio URLs for react-native-track-player

import express from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync } from 'child_process';
import homeRoutes from './routes/home.js';
import searchRoutes from './routes/search.js';
import categoryRoutes from './routes/category.js';
import audioRoutes, { cache } from './routes/audio.js';
import authRoutes from './routes/auth.js';

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
  
  // Background pre-cache: warm up all hymn audio URLs
  // yt-dlp is fast locally (~1-2s per song, 665 songs ≈ 3-5 min)
  try {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(buffer);
    const stmt = db.prepare('SELECT id, youtube_id FROM hymns ORDER BY id');
    const hymns = [];
    while (stmt.step()) hymns.push(stmt.getAsObject());
    db.close();
    
    if (hymns.length > 0) {
      console.log(`🔁 Background pre-caching ${hymns.length} hymns...`);
      let cached = 0;
      const CONCURRENCY = 4;
      
      function preCacheOne(hymn) {
        return new Promise((resolve) => {
          const { id, youtube_id } = hymn;
          if (!youtube_id || cache.has(youtube_id)) { resolve(); return; }
          exec(
            `yt-dlp -f "bestaudio[ext=m4a]/bestaudio" --get-url --no-playlist "https://www.youtube.com/watch?v=${youtube_id}"`,
            { timeout: 30000 },
            (error, stdout) => {
              if (!error && stdout) {
                const url = stdout.trim();
                if (url && url.startsWith('http')) {
                  cache.set(youtube_id, { url, title: '', duration: 0, thumbnail: null, timestamp: Date.now() });
                  cached++;
                  if (cached % 50 === 0) console.log(`  ✅ Pre-cached ${cached}/${hymns.length}`);
                }
              }
              resolve();
            }
          );
        });
      }
      
      // Process with concurrency
      const queue = [...hymns];
      async function worker() {
        while (queue.length > 0) {
          const hymn = queue.shift();
          await preCacheOne(hymn);
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      console.log(`✅ Pre-cache complete: ${cached}/${hymns.length} hymns cached`);
    }
  } catch (e) {
    console.log('⚠️ Pre-cache skipped (first run? DB may need initialization):', e.message);
  }
});
