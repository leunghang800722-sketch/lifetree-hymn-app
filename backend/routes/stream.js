// routes/stream.js — stable stream proxy, keyed by DB hymn id (not youtube_id)
// so a future non-YouTube source (e.g. user uploads) can slot in later
// without the app changing its playback URL scheme.

import { Router } from 'express';
import { Readable } from 'stream';
import { resolveAudioUrl, bustCache, preVerifyUrl, markStreaming, unmarkStreaming, cache, warmBuffer, getBufferedChunk } from '../lib/resolveAudio.js';
import { zeroFragmentedMp4Durations } from '../lib/fixFragmentedMp4Duration.js';

// BG-PLAYBACK-STOPS-PLAN Fix D:純 observability helper,唔改任何 proxy 行為。
// 一行 log,帶 ISO timestamp,用嚟診斷背景播放 3-4 首自動停個 bug(client abort
// 之前完全冇 log,飛盲)。
function logLine(fields) {
  console.log(`[stream] ${new Date().toISOString()} ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

// STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12 §5.2:兩條 googlevideo URL 係咪
// 同一個 itag/檔案大細(即係「換條 URL 但唔係換咗 format」)。攞唔到 itag 就保守
// 放行(true),唔好阻住現有 retry 行為——呢個 check 淨係用嚟攔「肯定唔同」嘅情況。
function sameFormat(urlA, urlB) {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    const itagA = a.searchParams.get('itag');
    const itagB = b.searchParams.get('itag');
    if (!itagA || !itagB) return true;
    if (itagA !== itagB) return false;
    const clenA = a.searchParams.get('clen');
    const clenB = b.searchParams.get('clen');
    if (clenA && clenB && clenA !== clenB) return false;
    return true;
  } catch (_) {
    return true;
  }
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
        try {
          const url = await resolveAudioUrl(yt);
          const verifiedUrl = await preVerifyUrl(yt, url);
          await warmBuffer(yt, verifiedUrl);
        } catch (_) {}
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

    // NEXT-TRACK-LATENCY 2026-08-12:原本呢度淨係處理「冇 clientRange」(見
    // STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12 §5.3)——但實測(真 AVFoundation
    // probe 打真 backend)證實 AVFoundation *每一個* request 都帶 Range header,
    // 一次都冇例外(即使係啱啱 warm 完嘅 track),所以舊嘅 `!clientRange` 閘
    // 對 iOS 係死碼:warmBuffer() 攞埋落嚟嘅頭 256KB 一直冇被 iOS 用過,佢每次
    // 都要重新開條新連線去 googlevideo(經 VPN,呢段先係 8-10s delay 嘅主因)。
    // 而家改成:只要 client 個 range 嘅起始 offset 落喺已 buffer 嗰截之內
    // (包括冇 Range 嘅舊case,起始offset當0),就用返嗰截記憶體數據應付,
    // 唔使等新連線。呢個係 IOS-NEXT-TRACK-PRELOAD-PLAN 方向3嘅完整實現。
    const parsedRange = (() => {
      const m = clientRange && /^bytes=(\d+)-(\d*)$/.exec(clientRange);
      if (!m) return null;
      return { start: Number(m[1]), end: m[2] ? Number(m[2]) : null };
    })();
    // clientRange 有值但格式古怪(multi-range 之類)—— parsedRange 會係 null,
    // rangeStart 跟住都係 null,下面 buffered 判斷自然跳過,行返原本冷路徑。
    const rangeStart = !isHead ? (clientRange ? (parsedRange ? parsedRange.start : null) : 0) : null;
    const bufferedChunk = (rangeStart != null) ? getBufferedChunk(hymn.youtube_id, url) : null;
    // clientRange 分支要寫 Content-Range,冇 totalLength(googlevideo 冇俾 content-range/
    // content-length,理論上唔會發生但要防)就唔知真正檔案總長,寧願行返冷路徑都好過
    // 報錯個 total(會累到 AVFoundation 以為成首歌得 256KB 長)。!clientRange 分支
    // 本身冇 Content-Range 呢個風險,維持原本行為。
    // NEXT-TRACK-LATENCY 2026-08-12 追加:bufferCache 而家除咗頭截(buf)仲可能有
    // 尾截(tailBuf/tailOffset,見 resolveAudio.js warmBuffer)——AVFoundation
    // 一定會另開一條尾巴 range 連線讀 duration/index,舊代碼淨係識睇頭截,呢類
    // 請求次次都跌落冷路徑。呢度揀返「呢個 rangeStart 落喺邊一截」,揀到用揀到
    // 嗰截嘅記憶體數據,兩截都冚唔到先真係行冷路徑(例如大過 12MB cap 嘅檔,
    // 中段嗰截冇快取,屬已知可接受嘅缺口)。
    const bufSource = (() => {
      if (!bufferedChunk || (clientRange && !bufferedChunk.totalLength)) return null;
      if (rangeStart < bufferedChunk.buf.length) return { arr: bufferedChunk.buf, base: 0 };
      if (bufferedChunk.tailBuf && bufferedChunk.tailOffset != null &&
          rangeStart >= bufferedChunk.tailOffset && rangeStart < bufferedChunk.tailOffset + bufferedChunk.tailBuf.length) {
        return { arr: bufferedChunk.tailBuf, base: bufferedChunk.tailOffset };
      }
      return null;
    })();
    const buffered = bufSource ? bufferedChunk : null;
    if (buffered) {
      const { totalLength, contentType } = buffered;
      const { arr, base } = bufSource;
      const total = totalLength || (base + arr.length);
      // ⚠️ sliceEnd 淨係「呢刻由記憶體即寫幾多」嘅邊界(俾 subarray 用)。
      // Content-Range 一定要報成個 response *最終*會送嘅範圍(buffered prefix +
      // 之後 pipe 落嚟嘅 live 續集),唔可以淨係報 buffered 嗰截——如果得
      // sliceEnd-1 就報做 range 上限,但之後仲有 wantsBeyondBuffer 續 pipe
      // 多啲 bytes 落同一個 response,個 header 應承嘅長度就會同實際 body
      // 長度對唔上,AVFoundation 會即刻拒收(實測:error -12935,幾百 ms
      // 內就 fail,唔使等到成個 response 派完)。
      const declaredEnd = (parsedRange && parsedRange.end != null)
        ? Math.min(parsedRange.end, total - 1)
        : total - 1;
      const sliceEndAbs = Math.min(declaredEnd + 1, base + arr.length);
      const chunk = arr.subarray(rangeStart - base, sliceEndAbs - base);

      res.setHeader('Content-Type', contentType || 'audio/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      if (clientRange) {
        res.setHeader('Content-Range', `bytes ${rangeStart}-${declaredEnd}/${total}`);
        res.status(206);
      } else {
        if (totalLength) res.setHeader('Content-Length', String(totalLength));
        res.status(200);
      }
      ttfbMs = Date.now() - reqStart;
      res.write(chunk);

      // 呢個 range 想要嘅嘢係咪已經全部喺 buffer 入面?(例如 AVFoundation
      // 成日發嘅細 range,好似 bytes=49152-65535,成個 request 都喺 buffer
      // 之內)——係就唔使開任何新連線,直接收工。
      const wantsBeyondBuffer = clientRange
        ? (parsedRange.end == null || parsedRange.end + 1 > base + arr.length) && (base + arr.length) < total
        : (totalLength && (base + arr.length) < totalLength);
      if (wantsBeyondBuffer) {
        try {
          const restRangeEnd = (parsedRange && parsedRange.end != null) ? `${parsedRange.end}` : '';
          const rest = await fetch(url, { method: 'GET', headers: { Range: `bytes=${base + arr.length}-${restRangeEnd}` }, signal: controller.signal });
          if ((rest.status === 200 || rest.status === 206) && rest.body) {
            const restBody = Readable.fromWeb(rest.body);
            restBody.on('error', () => { if (!res.writableEnded) res.destroy(); });
            restBody.pipe(res);
            return;
          }
          try { await rest.body?.cancel?.(); } catch (_) {}
        } catch (_) { /* 落返去下面直接收尾,buffer 都已經去到用家手上 */ }
      }
      // 2026-08-12 覆查 STREAM-LOCKSCREEN-STOP 事件時揪出:呢度一直硬寫死
      // finishLog(200),但 clientRange 分支上面明明 `res.status(206)`——即係
      // 90% 嘅正常 iOS ranged 請求全部俾呢個 fast-path 錯 log 做「200」。
      // 診斷嗰輪一度誤導咗自己(以為撞到「AVFoundation 唔帶 Range」嘅離奇案
      // 例,其實淨係 log 講大話,實際response一直都啱)。改用返 res.statusCode
      // 真實反映出去嗰個 status,唔好再靠估。
      finishLog(res.statusCode);
      return res.end();
    }

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
      const preRetryUrl = url;
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

      // STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12 §5.2:resolveAudio.js 自己
      // 講明「唔同時間 resolve 可能出唔同 format,byte offset 會對唔上」,但呢個
      // retry 路徑漏咗防護。中段 seek(clientRange 唔係由 byte 0 開始)嘅 offset
      // 係跟舊 format 嘅檔案大細計出嚟——換咗 itag 就完全對唔上另一個檔案,會
      // 餵到損毀 bytes。寧願 502 逼 client 由頭嚟過(App 側已有
      // TrackPlayer.retry()+skip 接得住),都好過靜靜哋餵爛檔。
      const midFileSeek = !!clientRange && !/^bytes=0-/.test(clientRange);
      if (midFileSeek && !sameFormat(preRetryUrl, url)) {
        console.warn(`[${new Date().toISOString()}] ⚠️ stream retry format mismatch: id=${id} yt=${hymn.youtube_id} — refusing to reuse mid-file range against a different format`);
        finishLog(502);
        return res.status(502).json({ error: 'format changed on retry' });
      }

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

    // STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12 §5.1:AVFoundation(iOS)完全
    // 播唔到 webm/opus——resolveAudio.js 嘅 format selector 喺搵唔到 m4a/mp4a
    // 嘅片會 fallback 去 webm(itag 251/249,例如 hymn 7511)。呢個 fmt selector
    // 係 resolveAudioUrl() 共用嘅(冇 platform 分支,cache key 亦冇分 platform),
    // 唔可以喺呢層淨係為 iOS 改埋 Android 嘅 format 選擇——改咗會令「而家 Android
    // 播得好地地」嘅 opus-only 片喺兩邊都變播唔到。所以只喺呢度做最小風險嘅
    // 攔截:淨係 iOS UA + webm content-type 先 502,即刻俾 App 現有
    // PlaybackError retry→skip 邏輯接手,好過畀 AVFoundation 拋一個 native
    // decode error、有機會冇俾 JS 層接到就靜靜哋卡住。Android 完全唔受影響
    // (呢個 if 淨係喺 UA 含 AppleCoreMedia 先入到)。
    const upstreamContentType = upstream.headers.get('content-type') || '';
    const isAppleClient = /AppleCoreMedia/i.test(req.headers['user-agent'] || '');
    if (isAppleClient && /webm|opus/i.test(upstreamContentType)) {
      try { await upstream.body?.cancel?.(); } catch (_) {}
      console.warn(`[${new Date().toISOString()}] ⚠️ stream iOS webm/opus unsupported: id=${id} yt=${hymn.youtube_id} content-type=${upstreamContentType}`);
      finishLog(502);
      return res.status(502).json({ error: 'format not supported on iOS' });
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

    // STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12:iOS fMP4 duration-doubling
    // 修補。moov(mvhd/tkhd/mdhd)實測一定喺檔頭 632 bytes 之內,而 AVFoundation
    // 嘅第一個內容請求一定係由 byte 0 開始 —— 所以只要處理「呢個 range 由 byte 0
    // 開始」嘅回應就 100% 覆蓋到。其餘 range(中段 seek)冇 moov,原封不動 pipe,
    // 零行為改動。
    const startsAtZero = !clientRange || /^bytes=0-/.test(clientRange);
    if (startsAtZero) {
      const HEAD_BYTES = 4096;
      let head = Buffer.alloc(0);
      let done = false;
      body.on('data', (chunk) => {
        if (done) return;
        head = Buffer.concat([head, chunk]);
        if (head.length < HEAD_BYTES) return;
        done = true;
        body.pause();
        try { zeroFragmentedMp4Durations(head); } catch (_) {}
        res.write(head);
        body.resume();
        body.pipe(res);
      });
      body.on('end', () => {
        if (!done) { // 成個檔案細過 HEAD_BYTES(理論上唔會,音訊檔一定大過 4KB)
          try { zeroFragmentedMp4Durations(head); } catch (_) {}
          res.end(head);
        }
      });
      return;
    }
    body.pipe(res);
  });

  return router;
}
