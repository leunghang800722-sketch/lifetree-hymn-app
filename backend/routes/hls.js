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

// HLS-EXEC-PREWINDOW-20260901 §1 W-a —— Opus5 對 resolve-cache.json 起底:
// 220 首掃描報嘅 18 個「no-sidx」全部係「啱啱 fresh resolve 完、即刻
// head-fetch 失敗」,20 分鐘後覆查用緊同一條 URL/itag、期間冇再 resolve
// 過,全部反轉做 200 ——即係 googlevideo 間歇 403,唔係「呢首歌冇 sidx」。
// 隔籬 routes/stream.js 對呢種情況一早有 bust+backoff+重 resolve
// 嘅自癒鏈(見該檔 backoffMsFor() 個 comment),hls.js 呢個 route 一直冇
// 抄呢套——呢度原封不動照抄嗰個節流保護(30秒窗、800ms/2000ms 兩級
// backoff),唔自創新數。故意唔同 stream.js share 同一個 Map:兩條 route
// 嘅失敗性質唔同(呢度淨係讀 head bytes,唔算真播放失敗),混埋會令
// 「30秒內第一次/第二次」嘅語義撈亂。
const RECENT_FAIL_WINDOW_MS = 30 * 1000;
const recentHeadFetchFail = new Map(); // youtubeId -> last-fail timestamp(ms)
function backoffMsFor(youtubeId) {
  const now = Date.now();
  const last = recentHeadFetchFail.get(youtubeId);
  recentHeadFetchFail.set(youtubeId, now);
  if (recentHeadFetchFail.size > 200) {
    for (const [k, ts] of recentHeadFetchFail) {
      if (now - ts > RECENT_FAIL_WINDOW_MS) recentHeadFetchFail.delete(k);
    }
  }
  if (last && now - last < RECENT_FAIL_WINDOW_MS) return 2000;
  return 800;
}

// 單一 HEAD fetch 嘗試——而家分開返 status 同 buf,等 caller 分得到
// 「403/410(值得重試)」同「其他任何原因攞唔到 bytes」。
async function fetchHeadBytes(url, nBytes) {
  let r;
  try {
    r = await fetch(url, { method: 'GET', headers: { Range: `bytes=0-${nBytes - 1}` } });
  } catch (e) {
    return { status: null, buf: null, err: e };
  }
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
//   - 其他任何攞唔到 bytes 嘅原因(其他 status / 網絡錯誤)→ { badStatus: status||'network' }
//   - 真係讀齊晒 bytes 但解唔到 sidx(唔係 bytes 唔夠嗰種)→ { structure: null, badStatus: null }(真 no-sidx)
async function resolveStructureOnce(url) {
  for (const nBytes of HEAD_FETCH_SIZES) {
    const { status, buf, err } = await fetchHeadBytes(url, nBytes);
    if (status === 403 || status === 410) return { structure: null, badStatus: status };
    if (!buf || buf.length === 0) {
      const bad = err ? 'network' : (status && status !== 200 && status !== 206 ? status : null);
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
async function resolveStructure(youtubeId, url) {
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
    const backoffMs = backoffMsFor(youtubeId);
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
      console.warn(`[hls] resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      return res.status(404).json({ error: 'resolve failed' });
    }

    let structure, badStatus, retried;
    try {
      ({ structure, badStatus, retried } = await resolveStructure(hymn.youtube_id, url));
    } catch (e) {
      console.warn(`[hls] structure parse threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      structure = null; badStatus = null; retried = false;
    }

    if (!structure) {
      // HLS-EXEC-PREWINDOW-20260901 §1 W-a —— 404 分開報:真 no-sidx(badStatus
      // 冇)vs head-fetch 撞非 200/206(badStatus 有,即使已經 retry 過都仲係
      // 失敗)。之前一個 code 冚兩種病,統計數字冇意義。
      const reason = badStatus ? `headfetch-failed(status=${badStatus})` : 'no-sidx';
      console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=404-${reason} retried=${retried}`);
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
    console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=ok initSize=${structure.initSize} refs=${structure.referenceCount} segBytes=${structure.segmentsByteTotal}`);
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
export { fetchHeadBytes, resolveStructureOnce, resolveStructure, backoffMsFor };
