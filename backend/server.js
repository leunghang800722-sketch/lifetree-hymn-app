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
import meRoutes from './routes/me.js';
import streamRoutes from './routes/stream.js';
import adminRoutes from './routes/admin.js';
import shareRoutes from './routes/share.js';
import friendsRoutes from './routes/friends.js';
import invitesRoutes from './routes/invites.js';
import clientLogRoutes from './routes/clientLog.js';
import { resolveAudioUrl, refreshAudioUrl, preVerifyUrl, cache, failCache, anyStreaming, isStreaming } from './lib/resolveAudio.js';
import { getUserDb } from './lib/userDb.js';
import { getDb, getDataVersion, DB_PATH } from './lib/serverDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ODE-REBRAND-PLAN §3.5 第2步 followup(F2):domain 遷移(god-music.com →
// odemusics.com,雙域並行,舊域唔剪)。⚠️ 舊域嘅 /p/*(分享連結)**唔准
// 301**——舊 APK 對 api.god-music.com 嘅 app-link 已經 autoVerify,撳連結會
// 直接開 app;一旦 301 去新域(新域未落 intent filter 嘅舊 APK 唔識),用戶
// 就會由「直接開 app」跌落瀏覽器,要多撳一次先入到 app,體驗倒退。所以 /p/*
// 照舊留喺呢個 host 直接出 SSR 頁(唔 redirect,落面 shareRoutes 照行)。
// 淨係 /downloads/*(APK 下載連結,冇 app-link 語意)先 301 去新域。
// /api/* 路由一律唔喺呢度攔截 redirect——舊 APK 嘅 src/config.js 仲會直接
// 打 api.god-music.com 打 API,301 佢會斷晒現有用戶(App 唔會跟 redirect 打 fetch)。
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host === 'api.god-music.com' && req.path.startsWith('/downloads/')) {
    return res.redirect(301, `https://api.odemusics.com${req.originalUrl}`);
  }
  next();
});

app.use('/api/home', homeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/stream', streamRoutes(getDb));
// 用戶數據行獨立 users.db(MEMBERSHIP-PLAN §2.1)——唔搭 hymns.db 順風車,
// 唔撞夜晚 grow/curate job 嘅 lock 協議;每次寫完即刻 atomic save 落碟。
authRoutes(app, getUserDb);
otpAuthRoutes(app, getUserDb); // 電話 OTP 登入(PHONE-AUTH-PLAN;未有 TWILIO key 前回 503)
meRoutes(app); // 跨裝置同步 API(MEMBERSHIP-PHASE1-LOGIN-SYNC §1.3)
adminRoutes(app); // 管理員功能(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.4)
shareRoutes(app); // 分享播放清單(MEMBERSHIP-PHASE3-SHARE-PLAN §1-3)—— 自己逐條掛 requireAuth,唔靠掛載次序
friendsRoutes(app); // 好友(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §1)—— 自己逐條掛 requireAuth
invitesRoutes(app); // 邀請碼 + 註冊閘配套(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2)
clientLogRoutes(app); // 播放 watchdog 診斷 beacon(STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇,2026-08-13)

// APK 下載檔名(APP-UPDATE-CHECK-PLAN §5 第二輪修正):以前寫死
// "hymn-app-v1.3.0-week2.apk"(rebrand 前、W2 個陣嘅殘留),同而家實際版本
// 完全脫節。而家動態由 app-version.json 讀 versionName 砌,manifest 讀唔到
// /壞 JSON 就 fallback 返 "Odely.apk"(唔准 crash)。
function buildApkFilename() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'public', 'app-version.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const versionName = typeof manifest?.versionName === 'string' ? manifest.versionName.trim() : '';
    // 淨係留返檔名安全字符,防止 manifest 手民之誤打入奇怪字元累到 HTTP header
    const safe = versionName.replace(/[^a-zA-Z0-9._-]/g, '');
    if (safe) return `Odely-v${safe}.apk`;
  } catch (e) {
    // manifest 讀唔到 / 壞 JSON —— fallback
  }
  return 'Odely.apk';
}

// Super simple APK download at root level
app.get('/app.apk', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'app.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${buildApkFilename()}"`);
  // 換 APK 後 Cloudflare 之前 cache 住舊版 4 個鐘,用戶落到舊版又觸發返
  // update banner,同新推嘅 APK 打交。呢條同 /downloads/app.apk 一齊唔准
  // 俾任何 CDN/瀏覽器 cache 住(APP-UPDATE-CHECK-PLAN §5)。
  res.setHeader('Cache-Control', 'no-store');
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
  res.setHeader('Content-Disposition', `attachment; filename="${buildApkFilename()}"`);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

// ⚠️ 舊版曾經有 `app.use('/downloads', express.static('public'))`——即係
// `backend/public/` 成個目錄任何檔案（包括 `.bak-*` 歷史 APK、其他運行時
// 產物)都可以由 `/downloads/<檔名>` 直接公開讀取。已剷走呢個 static mount
// (APP-UPDATE-CHECK-PLAN §5 第二輪修正);`/downloads/` 而家淨係識派上面
// 嗰條 `/downloads/app.apk` route,任何其他 `/downloads/<其他檔案>` 一律
// 404。已 grep 全 repo 確認冇其他地方依賴 `/downloads/` 底下 app.apk 以外
// 嘅檔案(分享頁/邀請文案全部指返 `/downloads/app.apk`)。

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// dataVersion cache-bust:超平嘅 endpoint,唔讀 DB,俾 App 開機時同 MMKV 存嗰個
// version 對一對,唔同先做全量 fetch(見 useCachedHymns.js)。
app.get('/api/version', (req, res) => {
  const dataVersion = getDataVersion();
  console.log(`🔖 /api/version → ${dataVersion}`);
  res.json({ dataVersion });
});

// APK 更新提示 manifest(APP-UPDATE-CHECK-PLAN §1.1)。讀 backend/public/app-version.json
// 原樣回傳,no-store 避免 CDN/瀏覽器 cache 住舊版本號。檔案唔存在/壞 JSON 一律
// 404,唔准 crash——呢個 endpoint 純粹俾 App 靜默檢查,前端任何失敗都當冇更新。
app.get('/api/app-version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const filePath = path.join(__dirname, 'public', 'app-version.json');
  fs.readFile(filePath, 'utf8', (err, raw) => {
    if (err) {
      console.error('app-version.json 讀取失敗:', err.message);
      return res.status(404).json({ error: 'not found' });
    }
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch (parseErr) {
      console.error('app-version.json 壞 JSON:', parseErr.message);
      return res.status(404).json({ error: 'invalid manifest' });
    }
    res.json(manifest);
  });
});

// 內部用:俾夜晚維護 script(growLibrary.js / checkDeadLinks.js)查詢「而家有冇
// 真人聽緊歌」,實現「有真人用就縮」呢個開關(2026-07-21 Eric 拍板,暫時未開)。
// 直接讀返 keep-warm tick 用緊嗰個 refcount(見上面 §206 anyStreaming),
// 唔係額外維護一份新狀態 —— 一個 process 入面單一事實來源。唔係俾 App 用嘅。
app.get('/api/internal/activity', (req, res) => {
  res.json({ streaming: anyStreaming() });
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
    // album / title_en:詩歌庫頁本地搜尋要齊維度(SEARCH-MERGE-PLAN §5)。
    // org / performer / kids:TAXONOMY-5D-PLAN.md §2.2/§4.4 五維分類新欄。
    const stmt = db.prepare('SELECT id, title, display_title, artist, youtube_id, lang, duration, lyrics, tags, view_count, created_at, album, title_en, org, performer, kids FROM hymns ORDER BY id');
    const hymns = [];
    while (stmt.step()) {
      hymns.push(stmt.getAsObject());
    }
    // TAXONOMY-5D-PLAN.md §3.4 K-E 兼容墊:kids=1 嘅歌對外 lang 永遠show
    // 「兒童」(舊 client filter `lang==='兒童'` 唔會斷),真語言另開 real_lang
    // 出——而家(C4 換血前)kids=1 嘅 row 喺 DB 入面 lang 本身就係「兒童」,
    // 所以呢個墊而家係 no-op,唔會改變現有 API 行為(見 §8 C1 落地後驗證)。
    for (const h of hymns) {
      h.real_lang = h.lang;
      if (h.kids) h.lang = '兒童';
    }
    // dataVersion 隨 envelope 帶埋出去,向後兼容(舊 client 淨係讀 .data 唔受影響)。
    const dataVersion = getDataVersion();
    console.log(`📚 /api/hymns full fetch → ${hymns.length} hymns, dataVersion=${dataVersion}`);
    res.json({ data: hymns, dataVersion });
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
//
// ⚠️ 2026-07-29 Eric 報「新歌要 load 十幾秒」根因:開機
// PRECACHE_MAX=200 淨係 `ORDER BY id LIMIT 200`,永遠鎖住最舊嗰 200 首(id 1-226)。
// growLibrary 呢排狂加歌(539→1744),curated 庫 id 去到 2886,新歌全部喺 226 之後,
// 永遠冇被 precache/keep-warm 摸過 —— 每次撳新歌都係第一次 cold resolve(resolve
// ~2-6s + 上游 googlevideo 冇 preVerify 過、首個連線去 CDN 冷點,實測會不定時卡
// 到 ~11s 先 502)。ExoPlayer 8s connect timeout 通常喺 backend 都仲未回應之前就
// 先爆,觸發 App 已有嘅「retry 一次」邏輯,retry 嗰次因為 resolve 已經 cache 咗
// 所以好快 —— 8s(timeout)+ 幾秒(retry 成功)合埋就係 Eric 見到嘅「十幾秒」。
// 之前冇咁慢係因為嗰陣成個 curated 庫都喺 200 首以內,精 precache 已經蓋晒;而家
// 庫大咗成 8 倍,精 precache 冇跟大,缺口越來越闊。
//
// 修法:下面加返第二個獨立 timer(warmColdBacklog)專門追落後 —— 揾「成庫入面
// 從未 resolve 過」嘅 curated 歌暖佢。刻意唔同 refresh timer 共用同一個 tick/
// budget:實測(2026-07-29)248 首已暖嘅 URL 好多都係同一批(開機精 precache)
// 一齊 resolve 落嚟,佢哋嘅 4-5 小時 TTL 會埋堆一齊到期,連續好多個 tick 都畀
// 「就嚟過期」嗰批霸晒,cold 追落後分支輪唔到轉,等於冇修到。獨立 timer + 獨立
// 節流(逐分鐘、逐日上限)= 兩份工都唔會停,唔會加大成體流量(單首 resolve 嘅
// yt-dlp 成本一樣,淨係邊個攞嚟做嘅分別)。
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

  warmColdBacklog();
}

// 追落後 timer —— 獨立於上面嘅 refresh timer,專責「成庫入面從未 resolve 過」
// 嘅 curated 歌。每 90 秒一首,唔會同 refresh 撞流量(見上面大註解釋點解要分開
// 兩個 timer)。ORDER BY id 從頭掃一次,已暖嘅 O(1) 跳過,無記名進度指標 ——
// 下次 tick 自然接住上次跳過嘅位繼續(因為之前果啲已經喺 cache 度)。
//
// ⚠️ 2026-07-29 Opus 5 覆核呢個 timer 揪出嘅數學問題:上面 refresh timer 每日
// 上限 800、URL 壽命封頂 5 小時(30 分鐘前續)= 每首歌大約需要 4.5 小時續一次
// = 800/day 淨係夠養 **~150 首**長期保持新鮮(800 ÷ (24/4.5))。而家單係開機
// precache 已經 200 首,即係未計呢個 timer 都已經超出「800/day 養得起」嘅上限
// ——呢個 timer 如果照原本諗法(冚成個 1744 首庫)追落去,只會不斷加更多歌入
// cache 度爭緊嗰 800/day 嘅續熱額度,攤薄晒全部人(包括開機精 precache 嗰
// 「應該最穩陣」嗰 226 首),幾日後可能連而家播開好地地嘅歌都變返冷。
// 修法:加個總量上限(CACHE_SIZE_CEILING),追到就停,唔再冚落去——留返個
// 安全邊際俾 refresh timer 養得起嘅範圍。長尾(呢個 timer 追唔到嘅新歌)靠
// routes/stream.js 而家加咗嘅「冷連線失敗就 bust+重 resolve+re-fetch 一次」
// 頂住(呢個先係 Eric 個「十幾秒」嘅真正根因同真正修法,見嗰邊嘅大註),
// 唔再單靠呢個 timer 嘅覆蓋率。
//
// ⚠️ 2026-07-29 STREAM-403-FGS-CRASH-PLAN §1.2 發現:上面呢段推論冇錯,但
// 300 呢個具體數值訂錯咗——訂嘅時候冇對過現存 disk cache 已經有幾多條。
// 詩歌庫 1744 首,disk cache 開機已經 300+ 條、cache.size 長期 ≥300,即係
// 呢個 timer 由第一個 tick 開始就見「cache.size >= CACHE_SIZE_CEILING」
// 即刻 return,實際暖咗 0 首,完全冇行過。改做 1800(> 庫存 1744),等
// timer 真係可以以 MAX_PER_DAY 嘅速度追落去;每日上限冇郁,唔會多打
// YouTube,純粹修返「上限訂到細過現存 cache」呢個 bug。
const CACHE_SIZE_CEILING = 1800;

function warmColdBacklog() {
  const MAX_PER_DAY = Number(process.env.KEEPWARM_BACKLOG_MAX_PER_DAY || 150);
  let day = new Date().toDateString();
  let usedToday = 0;
  console.log(`🧯 keep-warm 追落後啟動:07:00-23:59,每 90 秒最多暖 1 首從未 resolve 過嘅歌,每日上限 ${MAX_PER_DAY},總量封頂 ${CACHE_SIZE_CEILING}`);

  const timer = setInterval(async () => {
    try {
      const today = new Date().toDateString();
      if (today !== day) { day = today; usedToday = 0; }
      const hr = new Date().getHours();
      if (hr < 7) return;
      if (usedToday >= MAX_PER_DAY) return;
      if (cache.size >= CACHE_SIZE_CEILING) return; // 已經追到安全上限,唔再攤薄
      if (anyStreaming()) return; // 同上:用戶聽緊就唔好爭頻寬

      const now = Date.now();
      let target = null;
      try {
        const db = await getDb();
        const stmt = db.prepare('SELECT id, youtube_id FROM hymns ORDER BY id');
        while (stmt.step()) {
          const row = stmt.getAsObject();
          if (!row.youtube_id || cache.has(row.youtube_id)) continue;
          const failedUntil = failCache.get(row.youtube_id);
          if (failedUntil && failedUntil > now) continue;
          target = row.youtube_id;
          break;
        }
        stmt.free();
      } catch (_) {}
      if (!target) return; // 全庫已經暖晒,或者暫時攞唔到 DB

      usedToday++;
      try {
        const url = await resolveAudioUrl(target);
        await preVerifyUrl(target, url);
      } catch (_) {
        // resolveAudioUrl 本身已經寫咗 failCache(死鏈),呢度冇嘢再做。
      }
    } catch (e) {
      console.warn('keep-warm 追落後 tick error:', e?.message);
    }
  }, 90 * 1000);
  if (timer.unref) timer.unref();
}
