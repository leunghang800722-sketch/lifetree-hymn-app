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
import otpAuthRoutes from './routes/otpAuth.js';
import streamRoutes from './routes/stream.js';
import { resolveAudioUrl, refreshAudioUrl, preVerifyUrl, cache, anyStreaming, isStreaming } from './lib/resolveAudio.js';

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
otpAuthRoutes(app, getDb); // 電話 OTP 登入(PHONE-AUTH-PLAN;未有 TWILIO key 前回 503)

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
    // tags / view_count / created_at:俾自動播放 chip 加權抽樣用(AUTOPLAY-MIX-PLAN §5.6)。
    // 全部係現有欄位(view_count 而家係 0,等 metadata job 填;tags 等標註 pass)。
    const stmt = db.prepare('SELECT id, title, artist, youtube_id, lang, duration, lyrics, tags, view_count, created_at FROM hymns ORDER BY id');
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
  // §1b PERF-FAST-START-PLAN:由「熱 50 首」升到「全 curated 庫」(cap 200)。
  // ⚠️ 睇落好似更爆,其實唔係 —— §1a 令 URL cache 由碟載返,開機只需補「過期咗
  // 嗰啲」,唔係次次 150 首全做。第一次 boot(碟上冇 cache)先會做足全庫,
  // 之後每次重啟大部分都仲熱。concurrency 照舊 2,唔會回到當初 ban IP 嗰個
  // 「1518 首 × concurrency 4」爆發式流量。
  const PRECACHE_MAX = 200;
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

    // §1b:全 curated 庫(hymns view 已經淨係 curated + 唔死)。
    const candidates = pick('SELECT id, youtube_id FROM hymns ORDER BY id');
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
      console.log(`🔁 Background pre-caching ${hymns.length} hymns (full curated lib; disk-cache means reboots mostly warm)...`);
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

  startKeepWarm();
});

// §1c 保溫 loop —— URL 過期前自動續熱,令日常播放永遠行 warm 路徑。
//
// 流量帳(俾人安心):150 首 × URL 壽命 ~4.5 鐘 × 17 個活躍鐘 ≈ 每日 ~550 次
// resolve,平均每分鐘 0.4 次,**永遠單線程**。對比被 ban 嗰次係「開機 1518 首 ×
// concurrency 4」爆發式。呢個係細水長流。仍然有:①時段窗口 ②每分鐘最多 1 首
// ③每日熔斷上限 ④env 總掣。
function startKeepWarm() {
  if (process.env.URL_KEEPWARM === '0') {
    console.log('🌡️  URL keep-warm 停用 (URL_KEEPWARM=0)');
    return;
  }
  const MAX_PER_DAY = Number(process.env.KEEPWARM_MAX_PER_DAY || 800);
  const EXPIRING_WINDOW_MS = 30 * 60 * 1000; // 30 分鐘內就過期先續
  let day = new Date().toDateString();
  let usedToday = 0;
  console.log(`🌡️  URL keep-warm 啟動:07:00-23:59,每分鐘最多續 1 首,每日上限 ${MAX_PER_DAY}`);

  const timer = setInterval(async () => {
    try {
      const today = new Date().toDateString();
      if (today !== day) { day = today; usedToday = 0; } // 過咗零點重置每日計數
      const hr = new Date().getHours();
      if (hr < 7) return;                 // 00:00-06:59 唔行,個窗口留返俾夜晚 grow job
      if (usedToday >= MAX_PER_DAY) return; // 熔斷

      // 🩹 止血:有任何歌播緊就唔好行 —— 唔好 spawn yt-dlp 同串流爭頻寬/CPU
      // (呢個係「播下停下」regression 嘅其中一個成因)。用戶唔聽緊先續熱。
      if (anyStreaming()) return;

      // 揾「30 分鐘內就過期(或者已過期)」入面最快到期、而且**冇播緊**嗰一個,
      // 一次只續一首。唔續正播緊嗰首 → 唔會中途換佢個 URL / format。
      const now = Date.now();
      let pick = null;
      for (const [id, v] of cache) {
        if (isStreaming(id)) continue;
        if (v.expiresAt - now < EXPIRING_WINDOW_MS) {
          if (!pick || v.expiresAt < pick.expiresAt) pick = { id, expiresAt: v.expiresAt };
        }
      }
      if (!pick) return;

      usedToday++;
      try {
        const url = await refreshAudioUrl(pick.id);
        await preVerifyUrl(pick.id, url); // §4:順手 1-byte 預驗 + 暖 CDN
      } catch (_) {
        // 續唔到(多數係死鏈)→ 唔好留住個過期 entry,否則次次 tick 都揀返佢、
        // 燒晒每日額度喺一條死鏈度。
        cache.delete(pick.id);
      }
    } catch (e) {
      console.warn('keep-warm tick error:', e?.message);
    }
  }, 60 * 1000);
  if (timer.unref) timer.unref();
}
