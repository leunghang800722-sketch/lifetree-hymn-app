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
import { resolveAudioUrl, bustCache } from '../lib/resolveAudio.js';
import { parsePlaylistStructure, buildM3U8 } from '../lib/hlsPlaylist.js';
import { recordUpstream403 } from '../lib/opsMetrics.js';

// 逐級加大嘅 head fetch 大細——大部份 YouTube DASH 音訊 ftyp+moov+sidx 頭都
// 喺 4KB 之內(實測 id=4423:723+248=971 bytes),但唔准假設呢個上限一定夠
// (紅線:唔准 hardcode),搵唔齊就加大再攞一次,封頂 1MB 先死心(呢個上限
// 純粹防止異常檔案累到攞成個檔落嚟,唔係業務數字)。
const HEAD_FETCH_SIZES = [8 * 1024, 65 * 1024, 256 * 1024, 1024 * 1024];

// playlist 解析結果快取——sidx 解完好細(18 格 × 幾十 bytes),用
// `youtubeId + url` 做 key,同 URL cache 一齊過期(url 一換 key 自然唔中)。
// TTL 同 resolveAudio.js 嘅 URL cache 同一數量級,純粹減省重複網絡 round-trip,
// 唔係正確性所需(每次重新解都會得返同一個結果)。
const PLAYLIST_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const playlistCache = new Map(); // key: `${youtubeId}::${url}` -> { structure, expiresAt }

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
const structureInFlight = new Map(); // cacheKey -> Promise<{ structure, badStatus, retried, finalUrl }>

async function resolveStructureShared(youtubeId, url) {
  const cacheKey = `${youtubeId}::${url}`;
  const pending = structureInFlight.get(cacheKey);
  if (pending) return pending;
  const promise = resolveStructureInner(youtubeId, url).finally(() => {
    structureInFlight.delete(cacheKey);
  });
  structureInFlight.set(cacheKey, promise);
  return promise;
}

// HLS-PREFLIGHT-EXEC-20260907 §2.1 —— 之前呢度抄 stream.js 嗰套「30秒窗、
// 800ms/2000ms 兩級」升級 backoff(見舊 comment)。而家改做固定 800ms,唔再
// 升級:HLS 路徑而家有 client 側 5 秒 preflight 兜底(src/hlsPreflight.js),
// backend 呢邊唔應該賭「越嚟越耐先反彈」,一律短 backoff 早死早著,等 client
// 側嘅 5 秒 timeout 或者起播預檢去接手。目標:403 路徑 backend 回 404 嘅時間
// 由 ~14s → ≤4s(暖 resolve)/ ≤8s(冷 resolve)。
const HLS_RETRY_BACKOFF_MS = 800;
function backoffMsFor() {
  return HLS_RETRY_BACKOFF_MS;
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
  return { status: r.status, buf: Buffer.from(ab) };
}

// 單一條 URL(單一 generation)嘅 escalating-size loop。
//   - 解到 sidx  → { structure }
//   - 撞 403/410 → 即刻停手唔再加大(換 URL 都仲係嗰個節流窗口,加大冇用)
//                  → { badStatus: 403|410 },俾 caller 決定值唔值得重試
//   - timeout(3秒攞唔到)→ { badStatus: 'timeout' }
//   - 其他任何攞唔到 bytes 嘅原因(其他 status / 網絡錯誤)→ { badStatus: status||'network' }
//   - 真係讀齊晒 bytes 但解唔到 sidx(唔係 bytes 唔夠嗰種)→ { structure: null, badStatus: null }(真 no-sidx)
async function resolveStructureOnce(url) {
  for (const nBytes of HEAD_FETCH_SIZES) {
    const { status, buf, err, timedOut } = await fetchHeadBytes(url, nBytes);
    if (status === 403 || status === 410) return { structure: null, badStatus: status };
    if (!buf || buf.length === 0) {
      const bad = timedOut ? 'timeout' : (err ? 'network' : (status && status !== 200 && status !== 206 ? status : null));
      return { structure: null, badStatus: bad };
    }
    const result = parsePlaylistStructure(buf);
    if (result.ok) return { structure: result, badStatus: null };
    if (!result.needMoreBytes) return { structure: null, badStatus: null }; // 明確「唔係 bytes 唔夠」= 真 no-sidx
    if (buf.length < nBytes) return { structure: null, badStatus: null }; // upstream 送嘅已經細過要求,真係冇更多
  }
  return { structure: null, badStatus: null }; // 封頂 1MB 都夠唔到 sidx —— 當真 no-sidx
}

// 回傳 { structure, badStatus, retried, finalUrl }——badStatus 淨係喺
// structure 攞唔到嗰陣先有意義,俾 route 層分開報 no-sidx / headfetch-failed。
// HLS-PREFLIGHT-EXEC-20260907 §6 修訂 A 點 2 —— 改名做 `*Inner`,對外(route
// handler + 舊 export 名)一律經 `resolveStructureShared()` 入嚟做
// in-flight de-dup,呢個函式本身邏輯一個字冇改。
async function resolveStructureInner(youtubeId, url) {
  const cacheKey = `${youtubeId}::${url}`;
  const cached = playlistCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { structure: cached.structure, badStatus: null, retried: false, finalUrl: url };
  }

  let { structure, badStatus } = await resolveStructureOnce(url);
  let retried = false;
  let finalUrl = url;

  // 只喺 403/410(認證/URL 過期類)先值得重試——照抄 stream.js:backoff→
  // bustCache→重新 resolve→再試一次。其他 bad status(網絡錯誤/其他 4xx5xx)
  // 換條新 URL 未必有用,唔喺呢度自創擴大重試範圍,直接落 headfetch-failed
  // 交 caller 報。
  if (!structure && (badStatus === 403 || badStatus === 410)) {
    retried = true;
    const backoffMs = backoffMsFor();
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    bustCache(youtubeId);
    try {
      finalUrl = await resolveAudioUrl(youtubeId);
    } catch (e) {
      console.warn(`[hls] retry resolve failed: yt=${youtubeId} err=${e?.message || e}`);
      return { structure: null, badStatus, retried, finalUrl: url };
    }
    const retry = await resolveStructureOnce(finalUrl);
    structure = retry.structure;
    badStatus = retry.badStatus;
  }

  if (structure) playlistCache.set(`${youtubeId}::${finalUrl}`, { structure, expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS });
  return { structure, badStatus, retried, finalUrl };
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

    let structure, badStatus, retried;
    try {
      ({ structure, badStatus, retried } = await resolveStructureShared(hymn.youtube_id, url));
    } catch (e) {
      console.warn(`[hls] structure parse threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      structure = null; badStatus = null; retried = false;
    }

    if (!structure) {
      // HLS-EXEC-PREWINDOW-20260901 §1 W-a —— 404 分開報:真 no-sidx(badStatus
      // 冇)vs head-fetch 撞非 200/206(badStatus 有,即使已經 retry 過都仲係
      // 失敗)。之前一個 code 冚兩種病,統計數字冇意義。
      const reason = badStatus ? `headfetch-failed(status=${badStatus})` : 'no-sidx';
      console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=404-${reason} retried=${retried} ms=${Date.now() - reqStart0}`);
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
    console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=ok initSize=${structure.initSize} refs=${structure.referenceCount} segBytes=${structure.segmentsByteTotal} ms=${Date.now() - reqStart0}`);
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
export { fetchHeadBytes, resolveStructureOnce, resolveStructureInner, resolveStructureShared, backoffMsFor };
// 保留舊名俾未改過嘅 harness/caller 用——語義而家係「入面經 in-flight
// de-dup」,同 route handler 用緊嘅係同一個函式。
export { resolveStructureShared as resolveStructure };

// DEEP-AUDIT-W1-EXEC-20260906 B4(c)—— playlistCache 冇 eviction/size cap
// (1D HLS-1),之前完全冇得睇實際格數。俾 server.js sampler 讀,寫落
// opsMetrics gauge,純觀測,唔改呢個 Map 本身任何行為。
export function getPlaylistCacheSize() {
  return playlistCache.size;
}
