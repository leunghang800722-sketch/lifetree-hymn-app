// routes/stream.js — stable stream proxy, keyed by DB hymn id (not youtube_id)
// so a future non-YouTube source (e.g. user uploads) can slot in later
// without the app changing its playback URL scheme.

import { Router } from 'express';
import { Readable } from 'stream';
import { resolveAudioUrl, bustCache } from '../lib/resolveAudio.js';

export default function streamRoutes(getDb) {
  const router = Router();

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

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const isHead = req.method === 'HEAD';
    const doFetch = (u) => fetch(u, {
      method: isHead ? 'HEAD' : 'GET',
      headers: req.headers.range ? { Range: req.headers.range } : {},
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

    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (!upstream.headers.get('content-type')) res.setHeader('Content-Type', 'audio/mp4');

    if (isHead || !upstream.body) {
      return res.end();
    }
    Readable.fromWeb(upstream.body).pipe(res);
  });

  return router;
}
