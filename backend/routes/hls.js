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
import { resolveAudioUrl } from '../lib/resolveAudio.js';
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

async function fetchHeadBytes(url, nBytes) {
  const r = await fetch(url, { method: 'GET', headers: { Range: `bytes=0-${nBytes - 1}` } });
  if (r.status !== 200 && r.status !== 206) {
    try { await r.body?.cancel?.(); } catch (_) {}
    return null;
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

async function resolveStructure(youtubeId, url) {
  const cacheKey = `${youtubeId}::${url}`;
  const cached = playlistCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.structure;

  let structure = null;
  for (const nBytes of HEAD_FETCH_SIZES) {
    const buf = await fetchHeadBytes(url, nBytes);
    if (!buf || buf.length === 0) break; // upstream 都攞唔到,再加大都冇用
    const result = parsePlaylistStructure(buf);
    if (result.ok) { structure = result; break; }
    if (!result.needMoreBytes) break; // 明確話「唔係 bytes 唔夠」嘅失敗(例如冇 sidx),再加大冇用
    if (buf.length < nBytes) break; // upstream 送嘅已經細過我哋要求(即係成個檔都攞晒都唔夠),唔使再試
  }

  if (structure) playlistCache.set(cacheKey, { structure, expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS });
  return structure;
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

    let structure;
    try {
      structure = await resolveStructure(hymn.youtube_id, url);
    } catch (e) {
      console.warn(`[hls] structure parse threw: id=${id} yt=${hymn.youtube_id} err=${e?.message || e}`);
      structure = null;
    }

    if (!structure) {
      // A3:冇 sidx / 解唔到 —— 乾淨 404,唔回 500、唔回爛 playlist。
      console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=404-no-sidx`);
      return res.status(404).json({ error: 'no sidx / not fragmented' });
    }

    const streamPath = `/api/stream/${id}`;
    const body = buildM3U8({ streamPath, initSize: structure.initSize, segments: structure.segments });
    console.log(`[hls] ${new Date().toISOString()} id=${id} yt=${hymn.youtube_id} result=ok initSize=${structure.initSize} refs=${structure.referenceCount} segBytes=${structure.segmentsByteTotal}`);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);
  });

  return router;
}
