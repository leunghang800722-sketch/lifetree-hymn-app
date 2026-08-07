// routes/stream.js — stable stream proxy, keyed by DB hymn id (not youtube_id)
// so a future non-YouTube source (e.g. user uploads) can slot in later
// without the app changing its playback URL scheme.

import { Router } from 'express';
import { Readable } from 'stream';
import { resolveAudioUrl, bustCache, preVerifyUrl, markStreaming, unmarkStreaming, cache } from '../lib/resolveAudio.js';

// BG-PLAYBACK-STOPS-PLAN Fix D:純 observability helper,唔改任何 proxy 行為。
// 一行 log,帶 ISO timestamp,用嚟診斷背景播放 3-4 首自動停個 bug(client abort
// 之前完全冇 log,飛盲)。
function logLine(fields) {
  console.log(`[stream] ${new Date().toISOString()} ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

export default function streamRoutes(getDb) {
  const router = Router();

  // §3b PERF-FAST-START-PLAN:預熱端點。App 開機(繼續收聽 + 今日為你預備)同
  // 每次起播後(隊列下 3 首)會 POST 呢度,令自動接續/撳「下一首」永遠 warm。
  // ⚠️ 純附加路由,冇掂下面 GET /:hymnId 個 proxy(嗰個 Range 語義係 load-bearing)。
  // 即回 202,resolve 喺背景單線程行,唔阻 response。
  router.post('/warm', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 10) : [];
    res.status(202).json({ warming: ids.length });
    if (!ids.length) return;
    try {
      const db = await getDb();
      const ytIds = [];
      for (const raw of ids) {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) continue;
        const stmt = db.prepare('SELECT youtube_id FROM hymns WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) { const r = stmt.getAsObject(); if (r.youtube_id) ytIds.push(r.youtube_id); }
        stmt.free();
      }
      for (const yt of ytIds) {
        try { const url = await resolveAudioUrl(yt); await preVerifyUrl(yt, url); } catch (_) {}
      }
    } catch (_) { /* 背景嘢,靜靜哋收工就得 */ }
  });

  router.get('/:hymnId', async (req, res) => {
    // BG-PLAYBACK-STOPS-PLAN Fix D:純 observability,零行為改動。
    const reqStart = Date.now();
    const id = Number(req.params.hymnId);
    if (!Number.isInteger(id) || id <= 0) {
      logLine({ id: req.params.hymnId, yt: '-', mode: '-', resolve_ms: 0, ttfb_ms: Date.now() - reqStart, total_ms: Date.now() - reqStart, status: 400, aborted: false, retried: false });
      return res.status(400).json({ error: 'bad id' });
    }

    const db = await getDb();
    const stmt = db.prepare('SELECT youtube_id FROM hymns WHERE id = ?');
    stmt.bind([id]);
    const found = stmt.step();
    const hymn = found ? stmt.getAsObject() : null;
    stmt.free();

    if (!hymn?.youtube_id) {
      logLine({ id, yt: '-', mode: '-', resolve_ms: 0, ttfb_ms: Date.now() - reqStart, total_ms: Date.now() - reqStart, status: 404, aborted: false, retried: false });
      return res.status(404).json({ error: 'not found' });
    }

    // warm|cold 係「行呢個 request 之前」個 cache 狀態(唔改 resolveAudio.js
    // 任何行為,只係讀返佢已經 export 咗嘅 cache Map)。
    const warm = (() => {
      const c = cache.get(hymn.youtube_id);
      return !!(c && c.expiresAt > Date.now());
    })();
    let resolveMs = 0;
    let retried = false;
    let logged = false;
    // Opus 5 驗收修正:原本 ttfb_ms 係喺 res 'close' 度先量,即係「成個 request
    // 由頭到尾嘅時間」——一首正常播完嘅歌會報幾分鐘,根本唔係 time-to-first-byte。
    // 而 §1.5 要對比嘅正正係「冷歌 TTFB vs ExoPlayer 8s budget」,讀錯呢個數
    // 就會誤判。而家喺攞到 upstream response header 嗰刻定格真 TTFB,另外用
    // total_ms 保留返舊嗰個「成個 request 用咗幾耐」。純 log,零行為改動。
    let ttfbMs = null;
    // 收工一定 log 一行,唔會重覆:正常/錯誤路徑同 res 'close' 都可能行到,
    // 用 logged flag 防重覆(參考 doUnmark 個寫法)。
    const finishLog = (status, extra = {}) => {
      if (logged) return;
      logged = true;
      logLine({
        id,
        yt: hymn.youtube_id,
        mode: warm ? 'warm' : 'cold',
        resolve_ms: resolveMs,
        ttfb_ms: extra.ttfbMs != null ? extra.ttfbMs : (ttfbMs != null ? ttfbMs : (Date.now() - reqStart)),
        total_ms: Date.now() - reqStart,
        status,
        aborted: extra.aborted ?? false,
        retried,
      });
    };

    // Fix D coverage gap: if the client aborts *while resolveAudioUrl() is
    // still running* (before the proxy's own res.on('close') below gets
    // registered), that 'close' event would otherwise fire with zero
    // listeners attached and be lost forever — silently unlogged, which is
    // exactly the ExoPlayer-timeout fingerprint this fix exists to catch.
    // This listener is purely additive (logging only) — it does NOT touch
    // doUnmark/controller/markStreaming, those stay exactly where they were.
    res.on('close', () => {
      finishLog(res.headersSent ? res.statusCode : 0, { aborted: !res.writableFinished });
    });

    let url;
    const resolveStart1 = Date.now();
    try {
      url = await resolveAudioUrl(hymn.youtube_id);
    } catch (e) {
      resolveMs += Date.now() - resolveStart1;
      console.warn(`[${new Date().toISOString()}] ⚠️ stream resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      finishLog(502);
      return res.status(502).json({ error: 'resolve failed' });
    }
    resolveMs += Date.now() - resolveStart1;

    // 止血:登記「呢首歌播緊」,keep-warm 就唔會中途換佢個 URL / 唔會同串流爭資源。
    // 純附加,唔改下面 proxy 邏輯。refcount 應付 ExoPlayer 嘅多個 range 連線。
    markStreaming(hymn.youtube_id);
    let unmarked = false;
    const doUnmark = () => { if (!unmarked) { unmarked = true; unmarkStreaming(hymn.youtube_id); } };

    const controller = new AbortController();
    // Abort the upstream fetch only if the client bailed before we finished
    // sending (ExoPlayer closes+reopens range connections constantly while
    // streaming). res 'close' fires on normal completion too, so gate on
    // writableFinished to avoid aborting a request that already succeeded.
    res.on('close', () => {
      doUnmark();
      const clientAborted = !res.writableFinished;
      if (clientAborted) controller.abort();
      // Fallback log for the streaming-success path (no explicit `return`
      // after body.pipe(res)) and for any mid-stream abort. No-op if an
      // explicit finishLog() below already fired. Express defaults
      // statusCode to 200 even when nothing was ever sent — only trust it
      // once headers actually went out, otherwise report 0 (client left
      // before we responded at all).
      finishLog(res.headersSent ? res.statusCode : 0, { aborted: clientAborted });
    });
    // Opus 5 驗收揪出嘅舊 bug(唔關 Fix D 事,但呢單背景播放 bug 直接撞到佢):
    // 如果 client 喺上面 resolveAudioUrl() 仲跑緊嗰陣就已經走人(= ExoPlayer 8s
    // timeout 撞冷歌,正正係呢單嘢嘅場景),個 'close' event 喺呢個 listener
    // 註冊之前就已經 fire 咗,doUnmark 永遠唔會行 → markStreaming refcount
    // 永久卡住 1 → anyStreaming() 永遠 true → 兩個 keep-warm timer 永久熄火
    // 直到 backend 重啟。呢句補漏:listener 啱啱先註冊完,如果個 socket 已經
    // 閂咗(res.destroyed),即刻補做一次 doUnmark()。doUnmark 本身有
    // unmarked flag 防重覆,呢句絕對唔會 double-unmark。
    if (res.destroyed) doUnmark();

    const isHead = req.method === 'HEAD';
    const clientRange = req.headers.range;
    // Always send a Range upstream. googlevideo throttles range-less (full-file)
    // GETs to ~17KB/s but serves ranged requests at ~1.5MB/s. ExoPlayer's first
    // request usually has NO Range header — forwarding that as-is throttled
    // playback into an infinite buffer (the "正在載入" hang). When the client
    // didn't ask for a range we request the whole thing as `bytes=0-` purely to
    // dodge the throttle, then present the result to the client as a plain 200.
    const doFetch = (u) => fetch(u, {
      method: isHead ? 'HEAD' : 'GET',
      headers: { Range: clientRange || 'bytes=0-' },
      signal: controller.signal,
    });

    // ⚠️ 2026-07-29 Eric「新歌十幾秒」診斷(Opus 5 覆核揪出):真正撞 ExoPlayer 8s
    // timeout 嘅位唔係 resolve 慢(嗰截通常 2-6s),係呢度——冷歌第一次連去
    // googlevideo 個 CDN edge,實測有時會頂唔順、成 10s 先 502(冷 edge 冇做過
    // TLS/未定位過檔案)。舊碼淨係 403/410(URL 過期)先會 bust+重試,呢種「連線
    // 本身失敗/其他壞 status」一律直接 502,冇得救,亦冇 log,完全飛盲。而家
    // 統一晒:唔理邊種失敗,一律 log(先至知係邊個 branch 中招)+ bust cache +
    // 重新 resolve + 再試一次先死心——換條新 URL 好多時等於換咗個 CDN edge,
    // 好返嘅機會好高。
    async function attemptFetch(u) {
      try {
        const r = await doFetch(u);
        if (r.status === 200 || r.status === 206) return r;
        console.warn(`[${new Date().toISOString()}] ⚠️ stream upstream bad status: id=${id} yt=${hymn.youtube_id} status=${r.status}`);
        // 唔consume嘅 body 喺 undici 底下會揸住個連線直到 GC——呢個分支而家
        // 觸發得比之前(淨係 403/410)密好多,要即刻放手,唔留手尾。
        try { r.body?.cancel(); } catch (_) {}
        return null;
      } catch (e) {
        if (controller.signal.aborted) throw e; // 客戶端自己走咗,唔使 retry(但 Fix D:要 log)
        console.warn(`[${new Date().toISOString()}] ⚠️ stream upstream fetch threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
        return null;
      }
    }

    // 分開兩個 try/catch:attemptFetch 拋出嘅淨係「客戶端自己 abort 咗」(見上面
    // 個判斷),retry 路徑嘅 resolveAudioUrl 拋出就係另一回事(死鏈/resolve
    // 失敗)——之前混埋一個 catch 會將後者都當做「upstream fetch aborted」,
    // 唔止個錯誤訊息報錯,仲完全冇 log,同「呢次改動係為咗唔再飛盲」自相矛盾。
    let upstream;
    try {
      upstream = await attemptFetch(url);
    } catch (_) {
      // Fix D: 呢個係 ExoPlayer 8s timeout 嘅指紋分支,一定要 log。
      finishLog(502, { aborted: true });
      return res.status(502).json({ error: 'upstream fetch aborted' });
    }

    if (!upstream) {
      // 2026-07-29 STREAM-403-FGS-CRASH-PLAN §1.4:即刻重試好大機會撞返同一個
      // 節流窗口(prod log 7 次失敗 5 次都係 403 retry 中招)。加 2 秒 backoff
      // 先至 bust+重 resolve,等節流窗口過返先。已經 abort 咗嘅客戶端唔使陪佢
      // 等(慳返 2 秒),但 bust+resolve 本身唔可以因為 abort 而唔做——
      // resolveAudioUrl 唔綁 controller,resolve 完結果照落 cache,app 端嗰下
      // TrackPlayer.retry() 返嚟就食到 warm cache,呢個接力係而家架構本身嘅
      // 優點,唔好破壞(即係:client abort 之後唔好 short-circuit 個 resolve)。
      if (!controller.signal.aborted) {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 2000);
          controller.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
      retried = true;
      bustCache(hymn.youtube_id);
      const resolveStart2 = Date.now();
      try {
        url = await resolveAudioUrl(hymn.youtube_id);
      } catch (e) {
        resolveMs += Date.now() - resolveStart2;
        console.warn(`[${new Date().toISOString()}] ⚠️ stream retry resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
        finishLog(502);
        return res.status(502).json({ error: 'resolve failed (retry)' });
      }
      resolveMs += Date.now() - resolveStart2;
      try {
        upstream = await attemptFetch(url);
      } catch (_) {
        finishLog(502, { aborted: true });
        return res.status(502).json({ error: 'upstream fetch aborted' });
      }
    }

    if (!upstream) {
      finishLog(502, { aborted: controller.signal.aborted });
      return res.status(502).json({ error: 'upstream fetch failed after retry' });
    }
    // 真 TTFB 定格位:upstream response header 已經到手,再落去就係寫 header
    // + pipe body。純賦值,唔會拋、唔會改任何 proxy 行為。
    ttfbMs = Date.now() - reqStart;

    // Forward pass-through headers. content-range is only meaningful when the
    // client actually asked for a range — we may have added `bytes=0-` upstream
    // purely to dodge throttling, so suppress it (and the 206) in that case and
    // hand the client a normal full 200.
    for (const h of ['content-type', 'content-length', 'accept-ranges']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (clientRange) {
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('content-range', cr);
      res.status(upstream.status);
    } else {
      res.status(200);
    }
    if (!upstream.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (!upstream.headers.get('content-type')) res.setHeader('Content-Type', 'audio/mp4');

    if (isHead || !upstream.body) {
      return res.end();
    }

    // Pipe the upstream body to the client. The 'error' handler is essential:
    // when the client disconnects mid-stream, controller.abort() errors this
    // web-stream, and without a handler that surfaces as a process-level
    // 'uncaughtException' and leaves the client connection half-broken (which
    // is exactly what made ExoPlayer hang on "loading" forever).
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => { if (!res.writableEnded) res.destroy(); });
    body.pipe(res);
  });

  return router;
}
