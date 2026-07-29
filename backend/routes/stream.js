// routes/stream.js — stable stream proxy, keyed by DB hymn id (not youtube_id)
// so a future non-YouTube source (e.g. user uploads) can slot in later
// without the app changing its playback URL scheme.

import { Router } from 'express';
import { Readable } from 'stream';
import { resolveAudioUrl, bustCache, preVerifyUrl, markStreaming, unmarkStreaming } from '../lib/resolveAudio.js';

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
      url = await resolveAudioUrl(hymn.youtube_id);
    } catch (e) {
      console.warn(`⚠️ stream resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      return res.status(502).json({ error: 'resolve failed' });
    }

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
    res.on('close', () => { doUnmark(); if (!res.writableFinished) controller.abort(); });

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
        console.warn(`⚠️ stream upstream bad status: id=${id} yt=${hymn.youtube_id} status=${r.status}`);
        // 唔consume嘅 body 喺 undici 底下會揸住個連線直到 GC——呢個分支而家
        // 觸發得比之前(淨係 403/410)密好多,要即刻放手,唔留手尾。
        try { r.body?.cancel(); } catch (_) {}
        return null;
      } catch (e) {
        if (controller.signal.aborted) throw e; // 客戶端自己走咗,唔使 retry/log
        console.warn(`⚠️ stream upstream fetch threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
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
      return res.status(502).json({ error: 'upstream fetch aborted' });
    }

    if (!upstream) {
      bustCache(hymn.youtube_id);
      try {
        url = await resolveAudioUrl(hymn.youtube_id);
      } catch (e) {
        console.warn(`⚠️ stream retry resolve failed: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
        return res.status(502).json({ error: 'resolve failed (retry)' });
      }
      try {
        upstream = await attemptFetch(url);
      } catch (_) {
        return res.status(502).json({ error: 'upstream fetch aborted' });
      }
    }

    if (!upstream) {
      return res.status(502).json({ error: 'upstream fetch failed after retry' });
    }

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
