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
    } catch (_) {
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

    let upstream;
    try {
      upstream = await doFetch(url);
      if (upstream.status === 403 || upstream.status === 410) {
        bustCache(hymn.youtube_id);
        url = await resolveAudioUrl(hymn.youtube_id);
        upstream = await doFetch(url);
      }
    } catch (_) {
      return res.status(502).json({ error: 'upstream fetch failed' });
    }

    if (!(upstream.status === 200 || upstream.status === 206)) {
      return res.status(502).json({ error: `upstream ${upstream.status}` });
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
