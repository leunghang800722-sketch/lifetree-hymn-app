// routes/hls.js — HLS-ROOTFIX-PLAN-20260901 §1.4:新 route,由 sidx 生成
// byte-range HLS playlist。**唔改任何現有 route**——segment/init bytes 一律
// 照舊行 `/api/stream/:id`(routes/stream.js 完全冇改一個字)。
//
// 呢個 route 淨係做兩件事:
//   1. 攞返首歌 resolve 出嚟嘅 googlevideo URL 嘅頭一截 bytes(唔經過我哋自己
//      個 /api/stream proxy——避免遞迴、避免拖埋 markStreaming/warm 呢啲同
//      「真播放」綁死嘅語義,單純讀 box 結構)。
//   2. 解 ftyp/moov/sidx,砌一張 playlist 字串,回應。
//
// HLS-EXEC-AB-20260901 §1 A3:冇 sidx 嘅檔(非 fragmented / webm fallback)→
// 404,唔回 500、唔回爛 playlist,俾 JS 側見 404 即刻 fallback 返 `/api/stream/:id`。

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveAudioUrl, bustCache } from '../lib/resolveAudio.js';
import { parsePlaylistStructure, buildM3U8 } from '../lib/hlsPlaylist.js';
import { recordUpstream403, recordHlsPlaylist } from '../lib/opsMetrics.js';

// 逐級加大嘅 head fetch 大細——大部份 YouTube DASH 音訊 ftyp+moov+sidx 頭都
// 喺 4KB 之內(實測 id=4423:723+248=971 bytes),但唔准假設呢個上限一定夠
// (紅線:唔准 hardcode),搵唔齊就加大再攞一次,封頂 1MB 先死心(呢個上限
// 純粹防止異常檔案累到攞成個檔落嚟,唔係業務數字)。
const HEAD_FETCH_SIZES = [8 * 1024, 65 * 1024, 256 * 1024, 1024 * 1024];

// FIRST-TRACK-STEP01-EXEC-20260907 §2 N1 —— playlist 解析結果快取。sidx 嘅
// byte offset 係**媒體檔本身**嘅屬性(唔係嗰條簽名 URL 嘅屬性):YouTube
// 簽名 URL 每 4-5 小時續期一次,但 ftyp/moov/sidx 嘅結構(同一個
// itag/variant 之下)唔會變。舊 key(`${youtubeId}::${url}`)帶住 url,URL
// 一續期 key 就自然報廢,實測 `playlistCacheSize` gauge 長期停留喺個位數
// (DEEP-AUDIT-W1-EXEC-20260906 B4(c))。而家 key 改做純 `youtubeId`,entry
// 埋首咗 `clen`(對應嗰次 resolve 到嘅 googlevideo `content-range` 總長),
// 俾下面嘅「命中校驗」用嚟偵測「同一個 youtube_id 換咗 format/variant」
// (HLS Stage B 記錄過 1.7% no-sidx「同一首歌隨機」,唔可以假設 itag 永遠
// 一致)。TTL 24 小時、上限 2,000 條 LRU(FIRST-TRACK-STEP01-EXEC-20260907
// §2 N1 原文數字)。兩個都做成 env 可覆蓋(純測試用途,harness 可以用細
// 上限/短 TTL 快速驗 LRU/過期,production 冇設呢兩個 env 就用返呢度嘅
// 預設值,行為零改動)。
const PLAYLIST_CACHE_TTL_MS = Number(process.env.HLS_PLAYLIST_CACHE_TTL_MS) > 0
  ? Number(process.env.HLS_PLAYLIST_CACHE_TTL_MS) : 24 * 60 * 60 * 1000;
const PLAYLIST_CACHE_MAX_ENTRIES = Number(process.env.HLS_PLAYLIST_CACHE_MAX_ENTRIES) > 0
  ? Number(process.env.HLS_PLAYLIST_CACHE_MAX_ENTRIES) : 2000;
const playlistCache = new Map(); // key: youtubeId -> { structure, clen, initSize, expiresAt, savedAt }

// §2 N1 ——「命中要唔要校驗」由 env 控制,兩個 mode 都做(FIRST-TRACK-
// STEP01-EXEC-20260907 §2 N1 原文:S0-2 sidx 穩定性數據俾 Fable 睇完先定
// 要唔要切 `0`,執行者兩個 mode 都要做)。預設 `1`(校驗)。
const VERIFY_ON_HIT = process.env.HLS_PLAYLIST_VERIFY !== '0';

// ── §2 N1 持久化:backend/cache/hls-playlist-cache.json ─────────────────
// 同 resolveAudio.js 嘅 resolve-cache.json 一樣嘅 debounce flush 手法。
// ⚠️ 單一寫手紀律(2026-08-25 project-catalog-gap-ingest 事故教訓):呢個
// 檔淨係俾 backend server process 寫,scripts/harness 一律唔准直接寫呢個
// production 路徑——`HLS_PLAYLIST_CACHE_FILE` env 俾 harness 指去隔離
// scratch 檔案,production(冇設呢個 env)先寫真身路徑。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLAYLIST_CACHE_FILE = path.join(__dirname, '..', 'cache', 'hls-playlist-cache.json');
const PLAYLIST_CACHE_FILE = process.env.HLS_PLAYLIST_CACHE_FILE || DEFAULT_PLAYLIST_CACHE_FILE;
const PLAYLIST_CACHE_DIR = path.dirname(PLAYLIST_CACHE_FILE);
let playlistFlushTimer = null;

function schedulePlaylistFlush() {
  if (playlistFlushTimer) return;
  playlistFlushTimer = setTimeout(() => {
    playlistFlushTimer = null;
    try {
      fs.mkdirSync(PLAYLIST_CACHE_DIR, { recursive: true });
      const obj = {};
      const now = Date.now();
      for (const [id, v] of playlistCache) {
        if (v.expiresAt > now) obj[id] = v; // 唔好寫已過期嘅
      }
      fs.writeFileSync(PLAYLIST_CACHE_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) {
      console.warn('hls-playlist-cache flush failed:', e?.message);
    }
  }, 5000);
  if (playlistFlushTimer.unref) playlistFlushTimer.unref();
}

function loadPlaylistCacheFromDisk() {
  try {
    const raw = fs.readFileSync(PLAYLIST_CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    let n = 0;
    for (const [id, v] of Object.entries(obj)) {
      if (v && v.structure && v.expiresAt > now) { playlistCache.set(id, v); n++; }
    }
    if (n) console.log(`🗃️  hls-playlist-cache:由碟載返 ${n} 條未過期 playlist 結構`);
  } catch (_) { /* 第一次冇檔,正常 */ }
}
loadPlaylistCacheFromDisk();

// LRU:Map 插入順序 = LRU 順序(同 resolveAudio.js bufferCache 同一手法)。
function touchPlaylistCache(youtubeId, entry) {
  playlistCache.delete(youtubeId);
  playlistCache.set(youtubeId, entry);
}

function evictPlaylistCacheOverflow() {
  while (playlistCache.size > PLAYLIST_CACHE_MAX_ENTRIES) {
    const oldestKey = playlistCache.keys().next().value;
    if (oldestKey === undefined) break;
    playlistCache.delete(oldestKey);
  }
}

// §2 N1 命中校驗:淨係攞 `Range: bytes=0-0` 嘅 1 byte,讀 `content-range`
// 嘅總長(clen)同快取入面存低嘅 clen 對比。呢個係一個輕量 round trip(唔使
// 好似 miss 咁解成個 sidx),但足以偵測「同一個 youtube_id 換咗 format/
// variant」(clen 唔同 = 唔同檔案大細 = 唔同 itag,快取嘅 byte offset 唔可信)。
async function verifyClenMatches(url, storedClen) {
  if (storedClen == null) return false; // 冇記錄過 clen(理論上唔會,防禦性)—— 當要重新resolve
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, HEAD_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    clearTimeout(timer);
    if (r.status !== 200 && r.status !== 206) { try { await r.body?.cancel?.(); } catch (_) {} return false; }
    const cr = r.headers.get('content-range');
    try { await r.body?.cancel?.(); } catch (_) {}
    const m = cr && /\/(\d+)$/.exec(cr);
    const total = m ? Number(m[1]) : null;
    return total != null && total === storedClen;
  } catch (_) {
    clearTimeout(timer);
    return false;
  }
}

// HLS-PREFLIGHT-EXEC-20260907 §6 修訂 A 點 2 —— 並行預檢之下,同一首歌會有
// 兩個幾乎同一刻嘅 GET `/:hymnId.m3u8` 請求(JS `preflightHls()` 一個、
// AVPlayer 真正 fetch 一個)。`resolveAudioUrl()` 本身已經對 yt-dlp resolve
// 做緊 in-flight coalescing(resolveAudio.js `inFlight` Map),但呢度嘅
// head-fetch+parse-sidx(`resolveStructure()`)之前完全冇做——兩個並發請求
// 撞正 `playlistCache` 未暖(cold resolve)嗰陣,會各自對 googlevideo 發一輪
// escalating-size range fetch,即係「檔頭 range fetch 做兩次」。呢度加一個
// pending Map,將同一個 cacheKey(`${youtubeId}::${url}`)嘅並發 call 全部
// 指去同一個 in-flight promise——第一個 call 真正去 fetch,之後嚟嘅全部
// 攞返同一份結果,唔會重複打 googlevideo。唔改 `resolveStructure()` 本身
// 嘅重試/cache 邏輯,純粹喺出面加一層 de-dup。
// FIRST-TRACK-STEP01-EXEC-20260907 §2 N1 ——「structureInFlight key 同步改」:
// 舊 key 帶住 url,而家 playlistCache 本身已經改用純 youtubeId 做 key(sidx
// offset 係媒體檔屬性,唔跟簽名 URL),呢度嘅 in-flight de-dup key 都應該
// 跟埋轉,先可以喺「快取命中」路徑都繼續做到「兩個幾乎同一刻嘅並發請求
// 淨係校驗一次」(唔改 dedup 目的本身,只係令佢對得住新 key 空間)。
const structureInFlight = new Map(); // cacheKey(youtubeId) -> Promise<{ structure, badStatus, retried, finalUrl, cacheStatus }>

async function resolveStructureShared(youtubeId, url) {
  const cacheKey = youtubeId;
  const pending = structureInFlight.get(cacheKey);
  if (pending) return pending;
  const promise = resolveStructureInner(youtubeId, url).finally(() => {
    structureInFlight.delete(cacheKey);
  });
  structureInFlight.set(cacheKey, promise);
  return promise;
}

// HLS-PREFLIGHT-EXEC-20260907 §2.1 —— head fetch 加 3 秒 AbortController
// timeout,唔重試(重試留返俾外層 403/410 嗰一次)。timeout 當
// `badStatus: 'timeout'`,同其他「攞唔到 bytes」嘅原因分開報(唔會撞入
// 403/410 嗰條重試路——timeout ≠ 認證過期,換 URL 冇用)。
// DEEP-AUDIT-W1-EXEC-20260906 §2.2 —— 每次完成一次 head fetch(唔理成敗)
// 就計一次 `upstream403` 嘅分母,403 先計分子,俾長期追出口 IP 問題。
const HEAD_FETCH_TIMEOUT_MS = 3000;
async function fetchHeadBytes(url, nBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, HEAD_FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, { method: 'GET', headers: { Range: `bytes=0-${nBytes - 1}` }, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = !!(e && (e.name === 'AbortError' || String(e.message || '').toLowerCase().includes('abort')));
    recordUpstream403('hls', false);
    return { status: null, buf: null, err: e, timedOut };
  }
  clearTimeout(timer);
  recordUpstream403('hls', r.status === 403);
  if (r.status !== 200 && r.status !== 206) {
    try { await r.body?.cancel?.(); } catch (_) {}
    return { status: r.status, buf: null };
  }
  const ab = await r.arrayBuffer();
  // FIRST-TRACK-STEP01-EXEC-20260907 §2 N1 —— 順手由 `content-range` 攞返
  // 呢次 head fetch 睇到嘅檔案總長(clen),存入 playlistCache entry,俾之後
  // 嘅命中校驗(`verifyClenMatches`)用嚟偵測「同一個 youtube_id 換咗
  // format/variant」。冇 content-range(理論上唔會,googlevideo range
  // 請求一定帶)就係 null,唔拋錯。
  const cr = r.headers.get('content-range');
  const m = cr && /\/(\d+)$/.exec(cr);
  const clen = m ? Number(m[1]) : null;
  return { status: r.status, buf: Buffer.from(ab), clen };
}

// 單一條 URL(單一 generation)嘅 escalating-size loop。
//   - 解到 sidx  → { structure, clen }
//   - 撞 403/410 → 即刻停手唔再加大(換 URL 都仲係嗰個節流窗口,加大冇用)
//                  → { badStatus: 403|410 },俾 caller 決定值唔值得重試
//   - timeout(3秒攞唔到)→ { badStatus: 'timeout' }
//   - 其他任何攞唔到 bytes 嘅原因(其他 status / 網絡錯誤)→ { badStatus: status||'network' }
//   - 真係讀齊晒 bytes 但解唔到 sidx(唔係 bytes 唔夠嗰種)→ { structure: null, badStatus: null }(真 no-sidx)
async function resolveStructureOnce(url) {
  let lastClen = null;
  for (const nBytes of HEAD_FETCH_SIZES) {
    const { status, buf, err, timedOut, clen } = await fetchHeadBytes(url, nBytes);
    if (clen != null) lastClen = clen;
    if (status === 403 || status === 410) return { structure: null, badStatus: status, clen: lastClen };
    if (!buf || buf.length === 0) {
      const bad = timedOut ? 'timeout' : (err ? 'network' : (status && status !== 200 && status !== 206 ? status : null));
      return { structure: null, badStatus: bad, clen: lastClen };
    }
    const result = parsePlaylistStructure(buf);
    if (result.ok) return { structure: result, badStatus: null, clen: lastClen };
    if (!result.needMoreBytes) return { structure: null, badStatus: null, clen: lastClen }; // 明確「唔係 bytes 唔夠」= 真 no-sidx
    if (buf.length < nBytes) return { structure: null, badStatus: null, clen: lastClen }; // upstream 送嘅已經細過要求,真係冇更多
  }
  return { structure: null, badStatus: null, clen: lastClen }; // 封頂 1MB 都夠唔到 sidx —— 當真 no-sidx
}

// 回傳 { structure, badStatus, retried, finalUrl, cacheStatus }——badStatus
// 淨係喺 structure 攞唔到嗰陣先有意義,俾 route 層分開報 no-sidx /
// headfetch-failed。`cacheStatus` ∈ 'hit' | 'miss' | 'verifyfail',俾 route
// 層印落 `[hls]` log 行 + opsMetrics 計數(FIRST-TRACK-STEP01-EXEC-20260907
// §2 N1)。
// HLS-PREFLIGHT-EXEC-20260907 §6 修訂 A 點 2 —— 改名做 `*Inner`,對外(route
// handler + 舊 export 名)一律經 `resolveStructureShared()` 入嚟做
// in-flight de-dup。
async function resolveStructureInner(youtubeId, url) {
  const cached = playlistCache.get(youtubeId);
  const hasFreshCached = !!(cached && cached.expiresAt > Date.now());

  if (hasFreshCached) {
    // §2 N1:命中要唔要校驗由 `HLS_PLAYLIST_VERIFY` env 控制(預設校驗)。
    // 唔校驗嗰個 mode 純粹跳過呢個輕量 fetch,直接信 24 小時 TTL 內嘅快取。
    const verified = VERIFY_ON_HIT ? await verifyClenMatches(url, cached.clen) : true;
    if (verified) {
      touchPlaylistCache(youtubeId, cached); // LRU:命中就搬去最新
      recordHlsPlaylist('hit');
      return { structure: cached.structure, badStatus: null, retried: false, finalUrl: url, cacheStatus: 'hit' };
    }
    // 校驗失敗(clen 對唔上,= 呢個 youtube_id 換咗 format/variant)——快取
    // 唔可信,落去下面完整重新 resolve;呢個 entry 而家已經作廢,即刻
    // 剷走(唔留住個錯 offset 等下一個 request 再校驗一次先發現)。
    playlistCache.delete(youtubeId);
    recordHlsPlaylist('verifyFail');
  } else {
    recordHlsPlaylist('miss');
  }

  const { structure, badStatus, clen } = await resolveStructureOnce(url);
  const cacheStatus = hasFreshCached ? 'verifyfail' : 'miss';

  // HLS-PREFLIGHT-FIX-20260907 #1/#4(Opus 驗收)—— 之前呢度撞 403/410 會
  // backoff 800ms → bustCache → 重新 yt-dlp resolve → 再試一次 head-fetch。
  // Opus 用隔離 backend 副本 + mock 403 + **真 resolveAudioUrl(真
  // yt-dlp)**量過:呢條「重試」路徑喺生產條件下同「唔重試」幾乎一樣慢
  // (主要成本係 fresh yt-dlp re-resolve 嘅 3–5s,唔係 800ms backoff 嗰
  // 一截),即係對 403 情境嚟講「等 backend 重試」接近 no-op,而且真機
  // 實測試過一次撞到 ms=12428 先回 404,冇達到 §2.1 個「≤8s(冷)」目標。
  // 而家改做:403/410 一見到即刻 bustCache(令下次 resolve 攞新 URL)+
  // 即刻回 404,唔喺呢個 request 入面再等/再重新 resolve——真正嘅重試
  // 留俾兩條已經存在嘅路:(a) client 側 hlsPreflight 熱換去 progressive
  // (App.js §1.2/§1.3),(b) progressive 本身喺 routes/stream.js 嘅 403
  // 重試邏輯(呢度一個字冇改,佢先係 progressive 後備嘅依靠)。目標:
  // 403→404 由 ~14s(甚至 ms=12428)→ ≤1s。
  if (!structure && (badStatus === 403 || badStatus === 410)) {
    try { bustCache(youtubeId); } catch (_) {}
    return { structure: null, badStatus, retried: false, finalUrl: url, cacheStatus };
  }

  if (structure) {
    touchPlaylistCache(youtubeId, {
      structure,
      clen,
      initSize: structure.initSize,
      expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS,
      savedAt: Date.now(),
    });
    evictPlaylistCacheOverflow();
    schedulePlaylistFlush();
  }
  return { structure, badStatus, retried: false, finalUrl: url, cacheStatus };
}

export default function hlsRoutes(getDb) {
  const router = Router();

  router.get('/:hymnId.m3u8', async (req, res) => {
    // HLS-PREFLIGHT-EXEC-20260907 §2.1 —— 「總耗時」量法:由呢個 request
    // handler 一開始計,俾 log 行印低 ms=<總耗時>,答返 §2.1 目標「403 路徑
    // backend 回 404 嘅時間 ~14s → ≤4s(暖)/≤8s(冷)」有冇達到。
    const reqStart0 = Date.now();
    const id = Number(req.params.hymnId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'bad id' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT youtube_id FROM hymns WHERE id = ?');
    stmt.bind([id]);
    const found = stmt.step();
    const hymn = found ? stmt.getAsObject() : null;
    stmt.free();

    if (!hymn?.youtube_id) {
      return res.status(404).json({ error: 'not found' });
    }

    let url;
    try {
      // 呢度唔傳 `playbackRetry: true`——攞 playlist 結構嘅失敗唔應該搶咗
      // 真播放請求(routes/stream.js)嗰個短 60 秒重試視野,兩條路徑各自獨立。
      url = await resolveAudioUrl(hymn.youtube_id);
    } catch (e) {
      console.warn(`[hls] resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e} ms=${Date.now() - reqStart0}`);
      return res.status(404).json({ error: 'resolve failed' });
    }

    let structure, badStatus, retried, cacheStatus;
    try {
      ({ structure, badStatus, retried, cacheStatus } = await resolveStructureShared(hymn.youtube_id, url));
    } catch (e) {
      console.warn(`[hls] structure parse threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      structure = null; badStatus = null; retried = false; cacheStatus = null;
    }

    if (!structure) {
      // HLS-EXEC-PREWINDOW-20260901 §1 W-a —— 404 分開報:真 no-sidx(badStatus
      // 冇)vs head-fetch 撞非 200/206(badStatus 有,即使已經 retry 過都仲係
      // 失敗)。之前一個 code 冚兩種病,統計數字冇意義。
      const reason = badStatus ? `headfetch-failed(status=${badStatus})` : 'no-sidx';
      console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=404-${reason} retried=${retried} cache=${cacheStatus || '-'} ms=${Date.now() - reqStart0}`);
      return res.status(404).json({ error: reason });
    }

    // HLS-EXEC-D-FIXES-20260901 §3.2(a) D4 —— native `swReloadFresh()`
    // (AVPlayerWrapper.swift)靠加/遞增 `?swr=N` 落佢手上嗰條 URL 嚟令
    // mediaserverd 當佢係全新 resource(NATIVE-STALL-ROOTFIX §6 B1,實測
    // 「舊 reload 0/5 成功率」)。HLS 之下 wrapper 手上嗰條係呢張 playlist
    // 嘅 URL,`?swr=N` 加落嚟淨係換咗 playlist 本身嘅 identity——playlist
    // *入面* 18-66 條 segment URI 如果原封不動照用 `/api/stream/:id`,
    // zombie 風暴真正發生嗰個 resource(segment bytes)一個字都冇變。
    // 呢度將收到嘅 `swr` nonce 逐字傳落 EXT-X-MAP + 每條 segment URI,等
    // reload 之後成張 playlist(init + 全部 segment)都變成新 resource。
    // 只准純數字(native 個 counter 係遞增 Int),其他一律當冇帶。
    const swrRaw = req.query.swr;
    const swr = typeof swrRaw === 'string' && /^[0-9]+$/.test(swrRaw) ? swrRaw : null;
    const streamPath = swr ? `/api/stream/${id}?swr=${swr}` : `/api/stream/${id}`;
    const body = buildM3U8({ streamPath, initSize: structure.initSize, segments: structure.segments });
    console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=ok initSize=${structure.initSize} refs=${structure.referenceCount} segBytes=${structure.segmentsByteTotal} cache=${cacheStatus || '-'} ms=${Date.now() - reqStart0}`);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);
  });

  return router;
}

// HLS-EXEC-PREWINDOW-20260901 §7 —— 淨係俾驗證 harness import,唔改任何
// route 行為。俾方法可以喺唔起 server(唔撞紅線「唔准另起 node server.js」/
// 「唔准 restart backend」)嘅情況下,直接對真實 googlevideo URL 測試新嘅
// retry 邏輯。
export { fetchHeadBytes, resolveStructureOnce, resolveStructureInner, resolveStructureShared };
// 保留舊名俾未改過嘅 harness/caller 用——語義而家係「入面經 in-flight
// de-dup」,同 route handler 用緊嘅係同一個函式。
export { resolveStructureShared as resolveStructure };

// DEEP-AUDIT-W1-EXEC-20260906 B4(c)—— playlistCache 冇 eviction/size cap
// (1D HLS-1),之前完全冇得睇實際格數。俾 server.js sampler 讀,寫落
// opsMetrics gauge,純觀測,唔改呢個 Map 本身任何行為。
export function getPlaylistCacheSize() {
  return playlistCache.size;
}
