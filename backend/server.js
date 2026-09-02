// 詩歌App Backend — YouTube Audio Extraction Server
// Provides audio URLs for react-native-track-player

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import initSqlJs from 'sql.js';
import fs from 'fs';
import zlib from 'zlib';
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
import hlsRoutes from './routes/hls.js';
import adminRoutes from './routes/admin.js';
import shareRoutes from './routes/share.js';
import friendsRoutes from './routes/friends.js';
import invitesRoutes from './routes/invites.js';
import clientLogRoutes from './routes/clientLog.js';
import { resolveAudioUrl, refreshAudioUrl, preVerifyUrl, cache, failCache, anyStreaming, isStreaming, getBufferCacheStats } from './lib/resolveAudio.js';
import { YTDLP } from './lib/ytdlpBin.js';
import { getUserDb } from './lib/userDb.js';
import { getDb, getDataVersion, DB_PATH, maybeReload } from './lib/serverDb.js';
import { getWarmCandidates } from './lib/warmLog.js';
import { enablePersistence as enableOpsMetrics, recordKeepWarmTick } from './lib/opsMetrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// PERF-STAGE2-EXEC-20260902 §2A A-3(修 PERF-STAGE2-2C-20260902 C-3)——
// 輕量 access log。1B S6/1A A4 都撞過「呢條 route 幾時俾人打過」完全冇數
// 得查(search.js/category.js/home.js 三個檔完全冇 console.*),要靠 grep
// 4.9 日窗口嘅 log 先間接推論。加一條通用 middleware,唔改任何 route 自己
// 嘅邏輯/log。
//
// **一定要喺 `app.use(compression(...))` 之前註冊**(呢個係 C-3 同 A-3
// 原版唯一嘅位置分別,原因見下面 §1):
//
// §1 bytes 唔可以靠 `content-length` header(A-3 原版做法)—— Opus 5
// 驗收(PERF-STAGE2-2A-OPUS-20260902.md §3.3)實測到:compression 對壓縮
// 過嘅 response 一律剷走 Content-Length(chunked encoding 冇呢個 header
// 嘅概念),即係最想量 bytes 嗰條 `/api/hymns` 出街之後永遠見 `-b`。修法
// 唔係讀 header,而係自己喺 `res.write`/`res.end` 層面砌住實際寫出嘅
// bytes——但呢個要求呢個 middleware 一定要**喺 compression 之前**
// 註冊:compression 喺自己個 middleware function 入面就即刻同步
// monkey-patch `res.write`/`res.end`,如果我哋喺佢之後(舊 A-3 個位置)
// 先再包一層,我哋攞到嘅係 compression **決定點壓縮之前**嗰個原始
// (未壓縮)chunk;而家擺喺佢之前,compression 會將我哋個 wrapper 當
// 「原始 res.write」嚟保存同 call(佢自己嘅 wrapper 壓完先轉頭 call
// 返我哋),我哋先真正攞到最後寫落 socket 嗰啲(已壓縮)bytes——即係
// wire bytes,同 CF edge/client 收到嘅大細一致。
//
// §2 `ms` 唔可以淨聽 `finish`——Opus 5 §3.6 實測:client 連 socket 都
// 未讀就 destroy,server 一樣會 fire `finish`(意思係「寫晒落 kernel
// socket buffer」,唔係「client 收晒」),log 出嚟同一條成功嘅 200 request
// 一模一樣,分唔到「其實中途 abort 咗」。而家 `finish` 同 `close` 兩個都
// 聽,邊個先到用邊個(`done` 旗標防止兩個都 fire 就 log 兩次);`close`
// 喺 `finish` 之前到就標 `aborted=1`。
//
// 排除 `/api/stream`、`/api/hls`(已經有自己成套遙測,呢度加多一行只會
// 洗版)同 `/api/client-log`(佢自己就係一條 log route,再幫佢 log 一次
// 冇意思)。
app.use((req, res, next) => {
  const p = req.path; // 一定要即刻讀、存落 local var——Express router 派發去
  // sub-router 嗰陣會就地改咗 req.url(裁走 mount prefix),完咗又冇 next()
  // 落嚟就唔會復原,遲啲先讀 req.path 會攞到裁剩嗰截(例如
  // `/api/home/daily-verse` 變咗 `/daily-verse`),見 harness 實測抓到。
  if (!p.startsWith('/api/')) return next();
  if (p.startsWith('/api/stream') || p.startsWith('/api/hls') || p.startsWith('/api/client-log')) return next();

  // §1 —— 喺 compression 有機會 wrap 之前,自己先攞住 res.write/res.end
  // 嘅參照。compression 之後會將呢兩個(已經係我哋嘅 wrapper)當「原始
  // 方法」嚟保存,佢自己嘅 wrapper 壓完 gzip 先轉頭 call 返呢度,所以
  // `bytes` 計嘅係真正寫落 socket 嗰啲——壓縮咗就係壓縮後嘅大細。
  let bytes = 0;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  res.write = function (chunk, ...rest) {
    if (chunk) bytes += Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    return origWrite(chunk, ...rest);
  };
  res.end = function (chunk, ...rest) {
    if (chunk) bytes += Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    return origEnd(chunk, ...rest);
  };

  const start = Date.now();
  let done = false;
  const logAccess = (aborted) => {
    if (done) return; // §2 —— finish/close 邊個先到算數,唔准 log 兩次
    done = true;
    const ms = Date.now() - start;
    console.log(`[access] ${new Date().toISOString()} ${req.method} ${p} ${res.statusCode} ${ms}ms ${bytes}b${aborted ? ' aborted=1' : ''}`);
  };
  res.on('finish', () => logAccess(false));
  res.on('close', () => logAccess(true));
  next();
});

// PERF-STAGE2-EXEC-20260902 §2A A-2 — gzip JSON API 回應。1A A1 量到
// /api/hymns 5.57MB→(prod+gzip)1.47MB,但呢個 gzip 淨係 Cloudflare edge 自己
// 見 `Accept-Encoding: gzip` 就順手做(origin 本身冇 compression middleware)
// ——換句話講 origin↔CF 之間仲係傳緊 5.57MB 未壓縮。加喺 origin 做,CF 到
// client 嗰段冇變(CF 見 response 已經係 gzip 就直接轉發)但 tunnel 呢段瘦身。
// **一定要排除**串流/媒體類 route:呢啲已經係二進位/已壓縮格式,compression
// 中間件會嘗試 buffer 成個 response 先計 gzip,對 range request(206)嚟講
// 會打斷 Content-Range 語意、對已經係壓縮格式嘅媒體亦冇著數兼多耗 CPU。
const COMPRESSION_EXCLUDE_PATHS = [/^\/api\/stream/, /^\/api\/hls/, /^\/api\/audio/, /^\/app\.apk/, /^\/downloads/];
app.use(compression({
  threshold: 1024, // 1KB — 細 response(如 /api/health)唔值得為咗省幾十 byte 加 gzip CPU
  filter: (req, res) => {
    if (COMPRESSION_EXCLUDE_PATHS.some((re) => re.test(req.path))) return false;
    return compression.filter(req, res); // 其餘照用 compression 套件預設判斷(尊重 Accept-Encoding/Content-Type)
  },
}));

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
// HLS-EXEC-D-FIXES-20260901 §3.2(b) D4 —— 加多一個 mount,將 hls router 掛埋
// `/api/stream`(同一個 factory 再 call 一次,新 Router 實例但共用
// module-level `playlistCache`)。**要喺 streamRoutes 個 mount 之前**:hls
// router 入面淨係得 `/:hymnId.m3u8` 呢條 route,對冇 `.m3u8` 尾嘅請求
// (`/api/stream/795`)佢會 fall through(冇 route match,Express 自動
// next() 去下一個 mounted middleware),所以順序上擺喺前面唔會影響
// `/api/stream/:id` 半個字節。實測(scratch Express harness,已刪)確認:
// `/api/stream/795.m3u8` 攞到 `req.params.hymnId==="795"`(冇 `.m3u8` 尾巴
// 污染),`/api/stream/795` 完全唔受影響、query string(`?swr=`)亦唔影響
// 邊條 route 中。目的:playlist URL 而家字面帶住 `/api/stream/`,令 native
// `hymnId(for:)`(AudioPlayer.swift,只認呢個 prefix)可以 parse 到
// hid,唔使掂任何 native code(§3.1(b) 個 hid=- 遙測缺口)。
app.use('/api/stream', hlsRoutes(getDb));
app.use('/api/stream', streamRoutes(getDb));
// HLS-ROOTFIX-PLAN-20260901 §1.4:原本 route,繼續掛住做後備/相容(有 log
// 就知道有冇嘢仲用緊呢條舊路)。階段 A/B 唔出街,`hlsEnabled` 喺
// backend/public/app-version.json 出嘅時候一律 false(見 A4)。
app.use('/api/hls', hlsRoutes(getDb));
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

// iOS Universal Links(FRONTEND-CODE-REVIEW-20260819 §4 #3)。Apple 喺裝機/
// 定期時間打呢條 URL 攞 AASA,response 一定要係 application/json content-type
// 但檔名唔准帶 .json 副檔名,亦唔准 redirect。呢個 route 兩個域
// (api.god-music.com / api.odemusics.com)都會答——同一個 host-based
// middleware 之後,兩個域打呢度都係命中呢條 route,而 details 唔記錄
// host,所以一份內容兩個域共用得。
// appID = <TEAM_ID>.<BUNDLE_ID>:TEAM_ID(3W5QC3PLSD)係由現役 TestFlight
// build(appBuildVersion 8)嘅 .ipa 入面 embedded.mobileprovision 用
// `security cms -D` 解出嚟,唔係猜嘅;BUNDLE_ID(com.hymnapp.praise)對得上
// app.json 嘅 ios.bundleIdentifier。paths 對齊 Android intentFilters
// 嘅 pathPrefix "/p/"(分享清單連結,見 shareRoutes)。
function sendAASA(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: '3W5QC3PLSD.com.hymnapp.praise',
          paths: ['/p/*'],
        },
      ],
    },
  });
}
app.get('/.well-known/apple-app-site-association', sendAASA);
// BATCH7 B7-6:官方標準路徑係 /.well-known/ 嗰個,但舊版 iOS/部分驗證工具會
// fallback 去 root 冇 /.well-known/ 嗰條(SECOND-PASS-REVIEW-20260820.md b4)。
// 加個 root alias,同一份內容。
app.get('/apple-app-site-association', sendAASA);

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
  // PERF-STAGE2-2C-20260902 C-4 —— 出 dataVersion 之前先 statSync 檢查真檔
  // 有冇被 out-of-process writer 改咗(夜晚 job/admin script),見
  // lib/serverDb.js maybeReload() 大註解。呢個 endpoint 本身就係「cache-bust
  // 判斷」用嘅,理應係全站最先追到新版嘅一條。
  maybeReload();
  const dataVersion = getDataVersion();
  console.log(`🔖 /api/version → ${dataVersion}`);
  // PERF-STAGE2-EXEC-20260902 §2A A-5 —— 純記錄用嘅 header,唔期望 CF 因為
  // 呢句就開始 cache(1A A1:57 個 endpoint×target 組合 cf-cache-status 全部
  // DYNAMIC,呢個係 Cloudflare page-rule/route 設定嘅事,唔係一個 response
  // header 講就算)。呢個 endpoint 本身就係俾 App 做 cache-bust 判斷用,
  // `no-cache` 淨係表明態度:即使將來邊一層加咗 cache,都要每次 revalidate。
  res.set('Cache-Control', 'no-cache');
  res.json({ dataVersion });
});

// HLS-EXEC-D123-GATE-20260901 P3 —— 單機 gate:manifest 入面 `hlsEnabled` 係
// 「全量開關」;`hlsDeviceIds`(非空 array 先生效)可以將佢收窄做「淨開俾
// 指定幾部機」,Stage D 淨開俾 Eric 一部機用呢個。純函數,方便 harness 逐
// assert 測試(唔起 server)。
//   - `hlsDeviceIds` 唔存在 / 唔係 array / 空 array → 全量模式,原值照出,
//     行為零改動(而家 live JSON 冇呢個欄位,呢個 branch 係現行實況)。
//   - `hlsDeviceIds` 係非空 array → 淨係 `hlsEnabled===true` 兼 `d` 喺
//     名單先算開;`hlsEnabled:false` 就算 `d` 喺名單都照樣 false(全域開關
//     優先於名單)。
function computeEffectiveHlsEnabled(manifest, deviceId) {
  const ids = manifest && Array.isArray(manifest.hlsDeviceIds) ? manifest.hlsDeviceIds : null;
  if (!ids || ids.length === 0) return manifest?.hlsEnabled === true;
  return manifest?.hlsEnabled === true && ids.includes(deviceId);
}

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
    // HLS-EXEC-D123-GATE-20260901 P3 —— 淨係覆寫 `hlsEnabled`,其餘欄位一律
    // 原封(Android update check 靠佢)。
    const effective = { ...manifest, hlsEnabled: computeEffectiveHlsEnabled(manifest, req.query.d) };
    res.json(effective);
  });
});

// 內部用:俾夜晚維護 script(growLibrary.js / checkDeadLinks.js)查詢「而家有冇
// 真人聽緊歌」,實現「有真人用就縮」呢個開關(2026-07-21 Eric 拍板,暫時未開)。
// 直接讀返 keep-warm tick 用緊嗰個 refcount(見上面 §206 anyStreaming),
// 唔係額外維護一份新狀態 —— 一個 process 入面單一事實來源。唔係俾 App 用嘅。
app.get('/api/internal/activity', (req, res) => {
  res.json({ streaming: anyStreaming() });
});

// PERF-STAGE2-EXEC-20260902 §2A A-1 — /api/hymns response cache, keyed on
// getDataVersion()(hymns.db 嘅 mtime+size,見 lib/serverDb.js)。呢條 route
// 每次都要 SELECT 6,405 行 + getAsObject() + JSON.stringify(~5.5MB),1A A2
// 量到呢三步合共 ~110-190ms;dataVersion 冇變即係 hymns.db 冇被 admin 寫過,
// 應該可以放心出返上次計好嘅同一份 string,唔使重做呢輪工。reloadDb()(admin
// 寫入後一定會 call)會清 dbPromise 但**唔會**主動清呢個 cache——所以判斷
// 用 dataVersion 讀出嚟嘅值本身(reloadDb 令佢重新計過),而唔係靠一個獨立
// 「已被清」旗標,先至可以自然 miss。
let hymnsResponseCache = null; // { dataVersion, json, gz?, br? }

// PERF-STAGE2-2C-20260902 C-1(A-6 落地)—— `?lite=1` 用嘅獨立 cache slot,
// 唔可以同上面 `hymnsResponseCache` 共用,否則兩種 envelope 會互相打架
// (full request 見到 lite 存落嘅 cache,或者反過來)。**預設(冇 `?lite=1`)
// 嗰條分支完全冇改——SQL 字串、object 形狀、cache 變量都同改動前一樣**,
// 呢個係「舊 client 一個 byte 都唔可以變」嘅硬要求(PERF-STAGE2-2C-20260902
// C-1)。
let hymnsLiteResponseCache = null; // { dataVersion, json, gz?, br? }
// `/api/hymns/lyrics` 專用 cache slot,見底下嗰條獨立 route。
let hymnsLyricsResponseCache = null; // { dataVersion, json, gz?, br? }

// PERF-STAGE2-2C7-OPUS-20260902 §(2) —— 冷開機並發 miss dedupe。
// Opus 5(`PERF-STAGE2-2C6-OPUS-20260902.md` §3.4)實測:`getDb()` 本身
// 已經有 in-flight dedupe(C-6 d),但「攞到 db 之後嘅 SELECT+stringify+
// 壓縮」冇——DB 未 lazy-load(restart 後第一批 request)嗰陣,3 個並發
// miss 會各自行一次 SELECT+stringify(仲有 scheduleHymnsCompression),
// 冷開機情景量到 wall ≈ 377ms。三條 hymns route 各自一個 in-flight slot
// (`{ dataVersion, promise }`):第一個 miss 攞唔到 in-flight 就自己起
// 一份、存落呢個 slot;跟住嚟嘅並發 miss 見到同一個 dataVersion 嘅
// in-flight 存在,直接 `await` 果條 promise,唔會再觸發第二次 SELECT。
// 完成(成功定失敗)之後清返呢個 slot——用嚟做判斷嘅唔係 promise identity
// 係「而家個 slot 係咪仲係我掛落去嗰個 entry」,咁樣如果掉線嗰陣已經有
// 第二輪(新 dataVersion)嘅 in-flight 頂咗上去,唔會誤刪佢。
let hymnsFullMissInFlight = null; // { dataVersion, promise }
let hymnsLiteMissInFlight = null; // { dataVersion, promise }
let hymnsLyricsMissInFlight = null; // { dataVersion, promise }

function dedupeHymnsMiss(getInFlight, setInFlight, dataVersion, computeFn) {
  const existing = getInFlight();
  if (existing && existing.dataVersion === dataVersion) {
    return existing.promise;
  }
  const entry = { dataVersion, promise: null };
  entry.promise = computeFn().finally(() => {
    if (getInFlight() === entry) setInFlight(null);
  });
  setInFlight(entry);
  return entry.promise;
}

// PERF-STAGE2-2C-20260902 C-5 —— 預壓縮 cache。C-1 個 cache slot 淨係存
// raw JSON string,每個帶 `Accept-Encoding: gzip` 嘅 request 都要
// compression middleware 重新壓一次(Opus 5 §2.3 已知 trade-off:cache
// hit identity 12ms,帶 gzip 就變返 108ms,慳嘅嗰 77% 俾 gzip CPU 攞返)。
// 帶 gzip/br 嘅 request 直接送已經 cache 咗嘅 buffer 兼自己 set
// `Content-Encoding`——compression middleware 見到 response 已經有呢個
// header 就會跳過(佢原碼 `onHeaders` 入面 `encoding !== 'identity'` 就
// 即刻 `nocompress('already encoded')`),唔會 double-encode。
//
// PERF-STAGE2-2C-20260902-C6-OPUS §5.3 保留一(已修)—— ETag 而家
// **route-scoped**:`sendHymnsCache` 多收一個 `tagSuffix` 參數,
// `/api/hymns` full 唔傳(維持 `W/"<dataVersion>"`,同 C-5 出街時一樣嘅
// 值),`?lite=1` 傳 `'lite'`(`W/"<dataVersion>-lite"`),
// `/api/hymns/lyrics` 傳 `'lyrics'`(`W/"<dataVersion>-lyrics"`)。Opus 5
// 實測到「三條唔同資源共用一個 tag」呢個係 C-5 新引入嘅問題(改前三條
// 靠 express auto-hash content 計 ETag,必然唔同;C-5 令佢哋一模一樣)——
// 今日冇活嘅觸發路徑(前端零 conditional GET、CF 唔 cache 呢啲 route),
// 但一改就手尾長,而家零成本補返。raw/gz/br 三個 representation **依然
// 共用同一個 route 嘅 tag**——呢個係 C-5 出街前已經存在嘅性質(express
// 原本個 auto-ETag 都係用未壓縮 body 計,壓縮前後一樣),Opus 5 §5.3(a)
// 已經核實過呢點唔算問題(RFC 7232 weak validator + `Vary` 已經 set,
// 冇合規 cache 會攞錯)。
function sendHymnsCache(req, res, cache, tagSuffix) {
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  res.set('ETag', tagSuffix ? `W/"${cache.dataVersion}-${tagSuffix}"` : `W/"${cache.dataVersion}"`);
  res.set('Vary', 'Accept-Encoding');
  res.set('Content-Type', 'application/json');
  // PERF-STAGE2-2C-20260902-C6-OPUS §5.4 保留二(已修)—— brotli。C-5
  // 一見到 client 收 gzip 就即刻 set Content-Encoding:gzip,連帶令
  // compression middleware 嘅 br 協商都行唔到(`nocompress('already
  // encoded')` 擋咗)。Opus 5 實測同一份 body gzip=1,474,223B、
  // brotli(compression 套件 default quality)=1,198,686B,br client 平白
  // 多食 23% wire。
  //
  // ⚠️ 呢度**冇**用 `req.acceptsEncodings(['br','gzip'])` 單一 call 嚟揀——
  // harness 實測過(`2c-c6-etag-brotli-async.log`)`negotiator` 套件嘅
  // tie-break 次序係 `q desc → specificity desc → 客戶端 header 入面個
  // encoding 出現嘅位置 asc → 我哋 provided array 嘅 index asc`,即係話
  // 客戶端自己喺 header 度嘅次序(第三個 tiebreak)會贏我哋傳嘅 array 次序
  // (最後先輪到)。實測 `Accept-Encoding: gzip, deflate, br`(冇 q value,
  // 客戶端淨係咁啱 gzip 寫喺前面)會揀 gzip,唔係我哋想要嘅「br 優先」。
  // 改為分開兩次獨立 acceptability check(`req.acceptsEncodings('br')`
  // 淨係答「client 收唔收 br」,唔理佢喺 header 邊個位/同邊個比較),先
  // 自己喺 code 度話事邊個優先——呢個先真正做到「br 優先」,唔受客戶端
  // header 寫法影響。
  //
  // `cache.br`/`cache.gz` 有冇準備好(見底下 `scheduleHymnsCompression`
  // ——miss 嗰刻唔會同步阻塞去起呢兩份 buffer)決定咗:起緊嗰段窗口揀
  // 「有邊份就用邊份」,乜都未有就跌落最底 raw send,交返俾 compression
  // middleware 用返 C-5 之前嗰套 async 協商,唔會扔錯 encoding 俾個
  // client。
  const acceptsBr = req.acceptsEncodings('br') === 'br';
  const acceptsGzip = req.acceptsEncodings('gzip') === 'gzip';
  if (acceptsBr && cache.br) {
    res.set('Content-Encoding', 'br');
    return res.send(cache.br);
  }
  if (acceptsGzip && cache.gz) {
    res.set('Content-Encoding', 'gzip');
    return res.send(cache.gz);
  }
  return res.send(cache.json);
}

// PERF-STAGE2-2C-20260902-C6-OPUS §5.5 保留三(已修)—— miss 路徑唔准
// 同步阻塞。C-5 原本喺 miss 嗰刻用 `zlib.gzipSync`,Opus 5 實測一次
// `/api/hymns` full miss 嘅同步時間分佈:readFileSync 20.5ms + new
// SQL.Database 4.7ms + SELECT/stringify 99.5ms + **gzipSync 109.2ms** =
// 233.9ms event loop 全程凍住;三個 slot 一齊 miss(dataVersion 一變就
// 係咁,C-4 令呢個情況由「淨係 restart」變成「夜晚 job 完之後」都會撞)
// 累計 427.9ms,其中 221ms 係 C-5 新加嘅同步時間。
//
// 而家 miss 分支唔再自己壓縮:即刻用 raw body 起 cache slot(`gz`/`br`
// 未有)send 落去,由 compression middleware 用返 C-5 之前嗰套 **async**
// (行 libuv threadpool、唔阻 event loop)協商呢一個 response 嘅
// encoding;然之後先用 `zlib.gzip`/`zlib.brotliCompress`(async 版,唔係
// *Sync)去補 `gz`/`br` 落 cache slot,俾之後真正嘅 cache hit 用。
//
// 寫入之前一定要覆核 dataVersion 冇再變(`getCurrentSlot()` 攞返嗰一刻
// 個真實 slot,同呢次 compute 開始嗰陣嘅 dataVersion 比)——如果起緊
// 呢兩份 buffer 嗰段時間 dataVersion 又變咗(第二輪 miss 已經寫咗新
// entry 落 slot),就掉咗手上呢份唔寫,避免將舊版 gz/br 錯誤咁貼落新
// entry 度(執行單原話:「起完先寫入 slot,帶 dataVersion 核對,避免
// stale 寫入」)。
function scheduleHymnsCompression(cacheEntry, getCurrentSlot, label) {
  const { dataVersion, json } = cacheEntry;
  const buf = Buffer.from(json, 'utf8');
  const gzPromise = new Promise((resolve, reject) => {
    zlib.gzip(buf, (err, out) => (err ? reject(err) : resolve(out)));
  });
  const brPromise = new Promise((resolve, reject) => {
    // quality 5——compression 套件行 br 用嘅 default 係 4(Opus 5 §5.4 引
    // 用嘅 1,198,686B 就係 q4);5/6 換多少少 CPU 攞多少少壓縮率,喺呢個
    // async(唔阻 event loop)嘅路徑度抵做。
    zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, (err, out) => (err ? reject(err) : resolve(out)));
  });
  Promise.all([gzPromise, brPromise])
    .then(([gz, br]) => {
      const current = getCurrentSlot();
      if (!current || current.dataVersion !== dataVersion) {
        console.log(`🗜️ ${label} async compress 完成但 dataVersion 已經郁咗(${dataVersion} → ${current ? current.dataVersion : 'null'}),掉咗唔寫`);
        return;
      }
      current.gz = gz;
      current.br = br;
      console.log(`🗜️ ${label} async compress → gz=${gz.length}B br=${br.length}B`);
    })
    .catch((err) => {
      console.error(`🚨 ${label} async compress 失敗:${err.message}(cache 會繼續冇 gz/br,sendHymnsCache 自然 fallback 落 raw)`);
    });
}

// PERF-STAGE2-2C7-OPUS-20260902 §(2) —— `/api/hymns` miss 嗰刻真正計嘢
// 嘅部分,抽出嚟做獨立 function 俾 `dedupeHymnsMiss` call(冷開機並發
// miss 淨係第一個真係行到呢度,其餘join 返同一個 promise)。邏輯逐字
// 搬自改之前嘅 route handler,冇改任何行為。
async function computeHymnsEntry(lite) {
  const db = await getDb();
  // lyrics included so the player can show real 歌詞 (§3.4) and grey out the
  // 歌詞 pill when a song has none. Only ~10 of the curated songs have lyrics,
  // so the payload cost is negligible.
  // tags / view_count / created_at:俾自動播放 chip 加權抽樣用(AUTOPLAY-MIX-PLAN §5.6)。
  // 全部係現有欄位(view_count 而家係 0,等 metadata job 填;tags 等標註 pass)。
  // album / title_en:詩歌庫頁本地搜尋要齊維度(SEARCH-MERGE-PLAN §5)。
  // org / performer / kids:TAXONOMY-5D-PLAN.md §2.2/§4.4 五維分類新欄。
  // instrumental:INSTRUMENTAL-CATEGORY-PLAN §3.2 Phase 2a —— 純音樂 flag,
  // 前端詩歌庫 tab + 首頁 chip 靠佢分流(Phase 1 已經回標咗 65 首)。
  // PERF-STAGE2-2C-20260902 C-1 —— lite 分支淨係喺 SELECT 欄位表剷走
  // `lyrics`,其餘 17 個欄位/次序完全一樣,`?lite=1` 缺席(`lite===false`)
  // 嗰句 column list 同改動前逐字一樣。
  const columns = lite
    ? 'id, title, display_title, artist, youtube_id, lang, duration, tags, view_count, created_at, album, title_en, org, performer, kids, instrumental'
    : 'id, title, display_title, artist, youtube_id, lang, duration, lyrics, tags, view_count, created_at, album, title_en, org, performer, kids, instrumental';
  const stmt = db.prepare(`SELECT ${columns} FROM hymns ORDER BY id`);
  const hymns = [];
  while (stmt.step()) {
    hymns.push(stmt.getAsObject());
  }
  // TAXONOMY-5D-PLAN.md §3.4 K-E 兼容墊:kids=1 嘅歌對外 lang 永遠show
  // 「兒童」(舊 client filter `lang==='兒童'` 唔會斷),真語言另開 real_lang
  // 出——而家(C4 換血前)kids=1 嘅 row 喺 DB 入面 lang 本身就係「兒童」,
  // 所以呢個墊而家係 no-op,唔會改變現有 API 行為(見 §8 C1 落地後驗證)。
  // INSTRUMENTAL-CATEGORY-PLAN §3.2 —— instrumental **刻意冇**對應嘅
  // lang 改寫(對比上面 kids 嗰句)。舊 client 個 LANGS 冇「純音樂」呢個
  // tab,如果將 lang 強制改做「純音樂」,呢 65 首喺舊 App 度邊個 tab 都
  // 揀唔到 = 人間蒸發;保持真 lang 就最多係「暫時仲喺原語言 tab 度」,
  // 而 §8 Q5 Eric 已經接受呢個過渡期行為。real_lang 上面嗰行已經一律
  // 出街,所以呢度乜都唔使做——呢段註解就係要防止第日有人「補返對稱」。
  // 呢個墊喺 lite 分支都要行(C-1 要求「同一模一樣嘅…kids→lang 墊/real_lang」)。
  for (const h of hymns) {
    h.real_lang = h.lang;
    if (h.kids) h.lang = '兒童';
  }
  // dataVersion 隨 envelope 帶埋出去,向後兼容(舊 client 淨係讀 .data 唔受影響)。
  const dataVersion = getDataVersion();
  console.log(`📚 /api/hymns ${lite ? 'lite' : 'full'} fetch → ${hymns.length} hymns, dataVersion=${dataVersion}`);
  const body = JSON.stringify({ data: hymns, dataVersion });
  // PERF-STAGE2-2C-20260902-C6-OPUS §5.5 —— miss 唔再同步 gzipSync。即刻
  // 用 raw body 起 cache slot(冇 gz/br),送出去嗰次由 compression
  // middleware 用返 async 協商;gz/br 用 `scheduleHymnsCompression`
  // 喺背景補(唔阻呢個 request)。
  const cacheEntry = { dataVersion, json: body };
  if (lite) hymnsLiteResponseCache = cacheEntry;
  else hymnsResponseCache = cacheEntry;
  scheduleHymnsCompression(cacheEntry, () => (lite ? hymnsLiteResponseCache : hymnsResponseCache), `/api/hymns ${lite ? 'lite' : 'full'}`);
  return cacheEntry;
}

// Get all hymns from the database
app.get('/api/hymns', async (req, res) => {
  try {
    // PERF-STAGE2-2C-20260902 C-4 —— 追 out-of-process 寫入,見
    // lib/serverDb.js maybeReload() 大註解;一次 statSync,常態(檔案冇變)
    // 幾乎零成本。
    maybeReload();
    // PERF-STAGE2-2C-20260902 C-1 —— `lite=1` 先行入呢條分支,SELECT 唔帶
    // `lyrics` 欄(連 key 都唔出)。Opus 5 實測 lyrics 佔 full payload raw
    // 49.00%(PERF-STAGE2-2A-OPUS-20260902.md §6),lite+gzip 372KB
    // (−74.8% vs full 1.47MB)。
    const lite = req.query.lite === '1';
    const currentDataVersion = getDataVersion();
    const cacheSlot = lite ? hymnsLiteResponseCache : hymnsResponseCache;
    if (cacheSlot && cacheSlot.dataVersion === currentDataVersion) {
      // PERF-STAGE2-EXEC-20260902 §2A A-5 / PERF-STAGE2-2C-20260902 C-5 ——
      // Cache-Control 純記錄,唔期望 CF 因為呢句就 HIT(1A A1 全部 57 組合
      // cf-cache-status 都係 DYNAMIC)。ETag 而家 route-scoped(C-6),
      // full 冇 suffix、lite 有 `-lite`。
      return sendHymnsCache(req, res, cacheSlot, lite ? 'lite' : undefined);
    }
    // PERF-STAGE2-2C7-OPUS-20260902 §(2) —— 並發 miss dedupe:同一
    // dataVersion 嘅並發 request 共用一次 `computeHymnsEntry`,唔會各自
    // SELECT+stringify+schedule 壓縮。
    const cacheEntry = await dedupeHymnsMiss(
      () => (lite ? hymnsLiteMissInFlight : hymnsFullMissInFlight),
      (v) => { if (lite) hymnsLiteMissInFlight = v; else hymnsFullMissInFlight = v; },
      currentDataVersion,
      () => computeHymnsEntry(lite),
    );
    sendHymnsCache(req, res, cacheEntry, lite ? 'lite' : undefined);
  } catch (err) {
    console.error('Failed to fetch hymns:', err.message);
    res.status(500).json({ error: 'Failed to fetch hymns' });
  }
});

// PERF-STAGE2-2C7-OPUS-20260902 §(2) —— `/api/hymns/lyrics` miss 嗰刻真正
// 計嘢嘅部分,同上面 `computeHymnsEntry` 一樣抽出嚟俾 `dedupeHymnsMiss`
// call,邏輯逐字搬自改之前嘅 route handler。
async function computeHymnsLyricsEntry() {
  const db = await getDb();
  const stmt = db.prepare("SELECT id, lyrics FROM hymns WHERE lyrics IS NOT NULL AND lyrics != '' ORDER BY id");
  const data = {};
  let count = 0;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    data[row.id] = row.lyrics;
    count++;
  }
  const dataVersion = getDataVersion();
  console.log(`📚 /api/hymns/lyrics fetch → ${count} hymns, dataVersion=${dataVersion}`);
  const body = JSON.stringify({ data, dataVersion });
  // PERF-STAGE2-2C-20260902-C6-OPUS §5.5 —— 同 `/api/hymns` 一樣,miss
  // 唔再同步 gzipSync,background schedule gz/br。
  const cacheEntry = { dataVersion, json: body };
  hymnsLyricsResponseCache = cacheEntry;
  scheduleHymnsCompression(cacheEntry, () => hymnsLyricsResponseCache, '/api/hymns/lyrics');
  return cacheEntry;
}

// PERF-STAGE2-2C-20260902 C-1(A-6 落地)—— `/api/hymns/lyrics`:淨係 84.1%
// (5,387/6,405)有非空 lyrics 嘅歌先入呢個 map,前端起播/揭開一首歌先要
// 呢啲字,唔使跟開機首屏一齊拉。要喺 `/api/hymns` 之後註冊(冇實際影響,
// 因為 backend 冇 `/api/hymns/:id`,但跟執行單提示留呢個次序,防止第日
// 有人加返 `/api/hymns/:id` 撞到)。同一個 dataVersion-keyed cache 手法。
app.get('/api/hymns/lyrics', async (req, res) => {
  try {
    // PERF-STAGE2-2C-20260902 C-4 —— 同 `/api/hymns` 一樣,追 out-of-process
    // 寫入(見 lib/serverDb.js maybeReload())。
    maybeReload();
    const currentDataVersion = getDataVersion();
    if (hymnsLyricsResponseCache && hymnsLyricsResponseCache.dataVersion === currentDataVersion) {
      return sendHymnsCache(req, res, hymnsLyricsResponseCache, 'lyrics');
    }
    const cacheEntry = await dedupeHymnsMiss(
      () => hymnsLyricsMissInFlight,
      (v) => { hymnsLyricsMissInFlight = v; },
      currentDataVersion,
      () => computeHymnsLyricsEntry(),
    );
    sendHymnsCache(req, res, cacheEntry, 'lyrics');
  } catch (err) {
    console.error('Failed to fetch hymn lyrics:', err.message);
    res.status(500).json({ error: 'Failed to fetch hymn lyrics' });
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

  // yt-dlp binary 開機自報(YTDLP-UNIFY-PLAN-20260822.md):2026-08-22 全庫播歌
  // 事故查咗一輪先發現「串流用緊嘅 yt-dlp 版本」根本冇任何地方睇得到。而家開機
  // 印一行,restart 之後一眼對到用緊邊個版本、邊條路徑。攞唔到版本(binary 唔見/
  // 爛檔)就大聲嘈 —— 呢個係播歌命脈,唔可以靜靜哋壞。
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const { stdout } = await promisify(execFile)(YTDLP, ['--version'], { timeout: 15000 });
    console.log(`🔧 yt-dlp: ${stdout.trim()} @ ${YTDLP}`);
  } catch (e) {
    console.error(`🚨 攞唔到 yt-dlp 版本(${YTDLP}):${e?.message || e} —— 串流 resolve 會冧,` +
                  `行 ops/ytdlp/update-ytdlp.sh --apply 落返個 binary`);
  }

  // ⚠️ 2026-08-23 THIRD-PASS-REVIEW §5 Batch D-2/D-4:開觀測計數器(warm 命中率、
  // keep-warm tick 收工理由、yt-dlp 三招邊招贏)。擺喺 app.listen 而唔係
  // warmColdBacklog() 入面,因為嗰個 function 喺 URL_KEEPWARM=0 嘅時候唔會行到 ——
  // 量數唔應該跟住 keep-warm 一齊熄。sampler 用 callback 傳 cache.size,避免
  // opsMetrics 反過來 import resolveAudio.js 整出循環 import。
  // 淨係 backend server process 會 call(= 單一寫手),script 唔會,見 opsMetrics.js。
  // W1(STARTUP-ROOTFIX-EXEC-BC-20260831):順手加返 bufferCache 格數/字節數 +
  // process RSS 落 sampler——40 格/256MB 呢兩個數擴大咗之後,要有得直接喺
  // ops-metrics.json 睇到實際食緊幾多,唔使每次都手動 ps。
  enableOpsMetrics({ sampler: () => ({
    cacheSize: cache.size,
    bufferCacheStats: getBufferCacheStats(),
    rssKb: process.memoryUsage().rss / 1024,
  }) });
  
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
  startDailyWarmCron();
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
      // ⚠️ 2026-08-23 THIRD-PASS-REVIEW §5 Batch D-2:每個 tick 因為咩理由收工,
      // 而家有數。P2-5 講「CACHE_SIZE_CEILING=1800 落後庫存 6,053」——但係咪真係
      // 喺度攔住,以前完全睇唔到(呢啲 return 一句 log 都冇)。`ceiling` 一路升
      // 就係實錘。純計數器,唔改任何一句判斷同 return。
      if (hr < 7) { recordKeepWarmTick('offHours'); return; }
      if (usedToday >= MAX_PER_DAY) { recordKeepWarmTick('dailyCap'); return; }
      if (cache.size >= CACHE_SIZE_CEILING) { recordKeepWarmTick('ceiling'); return; } // 已經追到安全上限,唔再攤薄
      if (anyStreaming()) { recordKeepWarmTick('streaming'); return; } // 同上:用戶聽緊就唔好爭頻寬

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
        recordKeepWarmTick('warmed');
      } catch (_) {
        // resolveAudioUrl 本身已經寫咗 failCache(死鏈),呢度冇嘢再做。
        recordKeepWarmTick('failed');
      }
    } catch (e) {
      console.warn('keep-warm 追落後 tick error:', e?.message);
    }
  }, 90 * 1000);
  if (timer.unref) timer.unref();
}

// BATCH5 §7.3-C:daily cron 預 resolve「噚日+今日」精選 —— 每日 06:30(backend
// 部機本地時)揀 warmLog 記錄嘅熱門 id,趁朝早黃金時段(07:00-11:00)開始前
// 消滅③段 yt-dlp 冷 spawn(淨係 resolve+preVerify,唔做 warmBuffer——bytes
// 級數嘅 warm 留返俾 B3 tee 同用戶自己開 App 嘅 /warm 冚)。URL 壽命 ~4.5h,
// 06:30 resolve 岩岩好冚晒朝早黃金時段。純 setTimeout 自我續期,唔用
// node-cron(唔加依賴)。
//
// 純函數,抽出嚟方便 harness 測(「而家 → 下一個 HH:MM 嘅 ms」,今日未到/
// 啱過/跨月三個時點)。now 由 caller 傳入,唔靠 Date.now()。
function msUntilNextDailyTime(now, hour, minute) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1); // Date 物件自己會跨月/跨年,唔使手動處理月尾
  }
  return next.getTime() - now.getTime();
}

const DAILY_WARM_HOUR = 6;
const DAILY_WARM_MINUTE = 30;
const DAILY_WARM_CAP = 40;
const DAILY_WARM_SLEEP_MS = 2000; // 溫柔對 shared home IP;resolveAudioUrl 現有 429 全局冷卻照罩

async function runDailyWarmJob() {
  const ids = getWarmCandidates(DAILY_WARM_CAP);
  if (!ids.length) {
    console.log('☀️  daily warm cron:今日冇候選(warmLog 空),跳過');
    return;
  }
  console.log(`☀️  daily warm cron 開始:${ids.length} 個候選`);
  let success = 0;
  for (const rawId of ids) {
    try {
      // 有人咁早聽緊就唔爭 —— 逐個 check(唔係 loop 前 check 一次),中途
      // 開始播都即刻讓。
      if (!anyStreaming()) {
        const id = Number(rawId);
        if (Number.isInteger(id) && id > 0) {
          const db = await getDb();
          const stmt = db.prepare('SELECT youtube_id FROM hymns WHERE id = ?');
          stmt.bind([id]);
          const found = stmt.step();
          const row = found ? stmt.getAsObject() : null;
          stmt.free();
          if (row?.youtube_id) {
            const url = await resolveAudioUrl(row.youtube_id);
            await preVerifyUrl(row.youtube_id, url);
            success++;
          }
        }
      }
    } catch (_) { /* resolveAudioUrl 本身已經寫咗 failCache(死鏈),呢度冇嘢再做 */ }
    await new Promise((resolve) => setTimeout(resolve, DAILY_WARM_SLEEP_MS));
  }
  console.log(`☀️  daily warm cron 完成:${success}/${ids.length} 成功`);
}

function startDailyWarmCron() {
  function scheduleNext() {
    const delay = msUntilNextDailyTime(new Date(), DAILY_WARM_HOUR, DAILY_WARM_MINUTE);
    const t = setTimeout(async () => {
      try { await runDailyWarmJob(); } catch (e) { console.warn('daily warm cron job error:', e?.message); }
      scheduleNext(); // 自我續期,下一個 06:30
    }, delay);
    if (t.unref) t.unref();
  }
  console.log(`☀️  daily warm cron 已排程:每日 ${String(DAILY_WARM_HOUR).padStart(2, '0')}:${String(DAILY_WARM_MINUTE).padStart(2, '0')} 預 resolve 「噚日+今日」精選(cap ${DAILY_WARM_CAP})`);
  scheduleNext();
}
