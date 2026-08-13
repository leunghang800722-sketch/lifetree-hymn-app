// lib/resolveAudio.js — shared YouTube audio URL resolver
// Used by routes/audio.js (legacy endpoint) and routes/stream.js (new stream proxy).
//
// ⚠️ 呢個檔案只 cache「googlevideo 音源 URL」(一串網址)同過期時間,**唔存音訊內容**
// (PERF-FAST-START-PLAN v2:Eric 拍板唔存副本)。

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zeroFragmentedMp4Durations } from './fixFragmentedMp4Duration.js';

const exec = promisify(execCb);

const cache = new Map(); // youtubeId -> { url, expiresAt }
const inFlight = new Map(); // youtubeId -> Promise<string>
const failCache = new Map(); // youtubeId -> failedUntil (ms)

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // fallback when expire= can't be parsed
const MAX_TTL_MS = 5 * 60 * 60 * 1000; // cap even if googlevideo expire= is further out
const EXPIRE_BUFFER_MS = 10 * 60 * 1000; // refresh before the real expiry hits
// Remember recent failures. A dead link costs ~6.4s to re-confirm (3 yt-dlp
// strategies each running to failure), and that whole wait happens again every
// time the queue hits it — which is most of the app's ~22s dead-link skip.
// Short enough that a temporary glitch (network blip, throttle) recovers on its
// own; long enough that skipping through a run of dead links is ~instant.
const FAIL_TTL_MS = 15 * 60 * 1000;

// §2b PERF-FAST-START-PLAN:冷 resolve timeout 由 30s → 12s。實測冷 resolve 6.6s,
// 12s 綽綽有餘;死鏈全 fail 由最壞 90s(3×30)縮到 36s(3×12)。
const RESOLVE_TIMEOUT_MS = 12000;
// ⚠️ 2026-07-20 止血:parallel resolve **預設關咗**(要開先 RESOLVE_PARALLEL=1)。
// 點解:tv 同 default 係兩個唔同 YouTube client,`bestaudio[ext=m4a]` 揀到嘅可能係
// **唔同 itag / bitrate / 檔案大細**。平行 race 邊個贏唔一定,所以同一首歌喺唔同時間
// resolve 可能出唔同 format。一旦播緊途中要重 resolve(URL 過期 / keep-warm 續熱),
// ExoPlayer 就會由 format A 嘅 byte offset 跳去 format B,byte 對唔上 → 播下停下。
// 順序固定(唔理邊個排先)= 同一首歌永遠出同一個 format,冇呢個問題
// (= v238 之前嘅行為,嗰陣冇 stutter)。冷 resolve 慢返少少係可接受嘅代價。
// ⚠️ 2026-07-29 Fable 5 診斷(SUPERVISION-LOG「tv client DRM experiment 全面化」
// 條目):yt-dlp #12563 —— YouTube 對 tv client 有個 session 級 DRM 實驗,越來越多
// 片嘅 tv 策略一律「DRM protected/format not available」,要靠 default fallback
// 先收到,每首白蝕一次注定失敗嘅 tv 請求(~4s + 多打一次 YouTube)。原本 STRATEGIES
// 次序 tv 行先,而家改做 **default 行先、tv 做後備**(下面陣列)——上面條 invariant
// 淨係要求「次序固定」,唔理邊個排第一,呢個位換晒都唔會累到 stutter 個 fix。
const RESOLVE_PARALLEL = process.env.RESOLVE_PARALLEL === '1';

// ── 「而家播緊邊幾首」登記(止血用)──────────────────────────────
// stream.js 開始 pipe 一首歌就 mark,收線就 unmark(refcount 應付 ExoPlayer 嘅
// 多個 range 連線)。keep-warm 靠呢個避開:①唔續正播緊嗰首(唔好中途換佢個 URL)
// ②有任何歌播緊就成個 tick 唔行(唔好 spawn yt-dlp 同串流爭頻寬/CPU)。
const streaming = new Map(); // youtubeId -> refcount
export function markStreaming(id) { if (id) streaming.set(id, (streaming.get(id) || 0) + 1); }
export function unmarkStreaming(id) {
  if (!id) return;
  const n = (streaming.get(id) || 0) - 1;
  if (n <= 0) streaming.delete(id); else streaming.set(id, n);
}
export function isStreaming(id) { return (streaming.get(id) || 0) > 0; }
export function anyStreaming() { return streaming.size > 0; }

const STRATEGIES = [
  { name: 'default', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '' },
  { name: 'youtube:player_client=tv', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '--extractor-args "youtube:player_client=tv"' },
  { name: 'default-any', fmt: 'bestaudio', extra: '' },
];

// ── §1a URL cache 持久化落碟 ──────────────────────────────────────
// backend 重啟即全冷嘅缺口:每次寫入 debounce flush 落 cache/resolve-cache.json,
// 開機讀返、棄咗過期嘅。存嘅只係網址 + 過期時間。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'resolve-cache.json');
let flushTimer = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const obj = {};
      const now = Date.now();
      for (const [id, v] of cache) {
        if (v.expiresAt > now) obj[id] = v; // 唔好寫已過期嘅
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) {
      console.warn('resolve-cache flush failed:', e?.message);
    }
  }, 5000);
  if (flushTimer.unref) flushTimer.unref(); // 唔好因為個 timer 阻住 process 收工
}

function loadCacheFromDisk() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    let n = 0;
    for (const [id, v] of Object.entries(obj)) {
      if (v && typeof v.url === 'string' && v.expiresAt > now) { cache.set(id, v); n++; }
    }
    if (n) console.log(`🗃️  resolve-cache:由碟載返 ${n} 條未過期 URL`);
  } catch (_) { /* 第一次冇檔,正常 */ }
}
loadCacheFromDisk();

function computeExpiresAt(url) {
  try {
    const expireParam = new URL(url).searchParams.get('expire');
    const expireMs = Number(expireParam) * 1000;
    if (expireParam && Number.isFinite(expireMs)) {
      return Math.min(expireMs - EXPIRE_BUFFER_MS, Date.now() + MAX_TTL_MS);
    }
  } catch (_) {}
  return Date.now() + DEFAULT_TTL_MS;
}

// ⚠️ 2026-07-28 Fable 5 診斷「神我屬祢」卡 loading 事故加嘅 logging(SUPERVISION-LOG
// 條目):之前逐個 strategy `catch (_)` 靜吞,一條片喺 in-process 持續 resolve 失敗
// 完全冇跡可尋(全 log grep 'All yt-dlp' = 0 條)。改一處(呢個 function 本身)就
// 兩條調用路徑(下面 parallel/順序)自動受惠 —— 唔使逐個 call site 加。err.message
// 通常帶埋 yt-dlp 嘅 stderr(例如「tv client formats skipped as DRM protected」),
// 順手令呢類 YouTube 側實驗性擋法有得追蹤,唔使靠估。
// ── NEXT-TRACK-LATENCY 2026-08-12 追加:YouTube 429/bot-check 全局冷卻 ──────
// backend log 實測(2026-08-12 晚 - 08-13 朝):103 條「HTTP Error 429」/「Sign in
// to confirm you're not a bot」,係一輪連續唔同 video id 嘅 resolve 連環撞出嚟
// (大機會係夜晚維護 job 冚成庫冇 spacing)。呢種 429 係 IP 級,唔係單條片級 ——
// 一撞到就代表呢個 IP 而家俾 YouTube 睇住,繼續打(包括仲未撞過嘅其他片、仲有
// 同一個 strategy loop 入面剩低嗰兩個 strategy)只會累加多幾次 429 hit,拖長個
// block、仲要每次陪足 12s timeout。而家:①撞到即刻停晒呢次 resolve 剩低嘅
// strategy(唔好再打)②全局冷卻一段時間,期間新嚟嘅 resolve 直接 fail fast,
// 唔好再打 YouTube 火上加油。
let ytRateLimitedUntil = 0;
const YT_RATE_LIMIT_COOLDOWN_MS = 30 * 1000;
function isRateLimitError(msg) {
  return /HTTP Error 429|Too Many Requests|Sign in to confirm you.{0,3}re not a bot/i.test(String(msg || ''));
}

function runStrategy(youtubeId, strat) {
  return exec(
    `yt-dlp -f "${strat.fmt}" ${strat.extra} --get-url --no-playlist "https://www.youtube.com/watch?v=${youtubeId}"`,
    { timeout: RESOLVE_TIMEOUT_MS }
  ).then(({ stdout }) => {
    const url = stdout.trim();
    if (url && url.startsWith('http')) return url;
    throw new Error(`empty url (${strat.name})`);
  }).catch((e) => {
    console.warn(`⚠️ resolve strategy failed: strategy=${strat.name} id=${youtubeId} err=${e?.message || e}`);
    throw e;
  });
}

async function resolveViaYtDlp(youtubeId) {
  if (Date.now() < ytRateLimitedUntil) {
    const secsLeft = Math.ceil((ytRateLimitedUntil - Date.now()) / 1000);
    console.warn(`⚠️ yt-dlp rate-limit 冷卻中(仲有 ${secsLeft}s)—— 跳過 ${youtubeId},唔好加重個 block`);
    throw new Error(`yt-dlp rate-limited (cooldown), skipping ${youtubeId}`);
  }
  if (RESOLVE_PARALLEL) {
    // §2a:tv + default 同時開跑,邊個先返有效 URL 用邊個。Promise.any 只喺全部
    // reject 先 reject,所以兩個都死先落去第三個順序後備。
    try {
      return await Promise.any([
        runStrategy(youtubeId, STRATEGIES[0]),
        runStrategy(youtubeId, STRATEGIES[1]),
      ]);
    } catch (aggErr) {
      const hitRateLimit = (aggErr?.errors || []).some((e) => isRateLimitError(e?.message));
      if (hitRateLimit) {
        ytRateLimitedUntil = Date.now() + YT_RATE_LIMIT_COOLDOWN_MS;
        console.warn(`⚠️ YouTube rate-limit/bot-check 偵測到(parallel)—— 全局冷卻 ${YT_RATE_LIMIT_COOLDOWN_MS / 1000}s,唔再試第三個 strategy`);
        console.error(`❌ All yt-dlp strategies failed for ${youtubeId}`);
        throw new Error(`All yt-dlp strategies failed for ${youtubeId}`);
      }
      try { return await runStrategy(youtubeId, STRATEGIES[2]); } catch (_) {}
      console.error(`❌ All yt-dlp strategies failed for ${youtubeId}`);
      throw new Error(`All yt-dlp strategies failed for ${youtubeId}`);
    }
  }
  // 順序後備(RESOLVE_PARALLEL=0)—— 同舊版一模一樣,加埋 429 偵測即停。
  for (const strat of STRATEGIES) {
    try { return await runStrategy(youtubeId, strat); } catch (e) {
      if (isRateLimitError(e?.message)) {
        ytRateLimitedUntil = Date.now() + YT_RATE_LIMIT_COOLDOWN_MS;
        console.warn(`⚠️ YouTube rate-limit/bot-check 偵測到 id=${youtubeId} strategy=${strat.name} —— 全局冷卻 ${YT_RATE_LIMIT_COOLDOWN_MS / 1000}s,停晒呢次剩低嘅 strategy`);
        break;
      }
    }
  }
  console.error(`❌ All yt-dlp strategies failed for ${youtubeId}`);
  throw new Error(`All yt-dlp strategies failed for ${youtubeId}`);
}

export async function resolveAudioUrl(youtubeId) {
  const cached = cache.get(youtubeId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // Known-dead recently? Fail immediately instead of paying ~6.4s to rediscover
  // the same dead link.
  const failedUntil = failCache.get(youtubeId);
  if (failedUntil && failedUntil > Date.now()) {
    throw new Error(`Known-bad (cached failure) for ${youtubeId}`);
  }

  const pending = inFlight.get(youtubeId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const url = await resolveViaYtDlp(youtubeId);
      cache.set(youtubeId, { url, expiresAt: computeExpiresAt(url) });
      failCache.delete(youtubeId); // recovered — forget the old failure
      scheduleFlush();
      return url;
    } catch (e) {
      failCache.set(youtubeId, Date.now() + FAIL_TTL_MS);
      throw e;
    } finally {
      inFlight.delete(youtubeId);
    }
  })();

  inFlight.set(youtubeId, promise);
  return promise;
}

// §1c 保溫用:就算 cache 仲有效都強制 resolve 一次,拎條新 URL 原子換入 cache
// (唔 bust 先 → 唔會有短暫「冇 entry」嘅空窗俾播放請求撞冷)。
export async function refreshAudioUrl(youtubeId) {
  const pending = inFlight.get(youtubeId);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const url = await resolveViaYtDlp(youtubeId);
      cache.set(youtubeId, { url, expiresAt: computeExpiresAt(url) });
      failCache.delete(youtubeId);
      scheduleFlush();
      return url;
    } catch (e) {
      failCache.set(youtubeId, Date.now() + FAIL_TTL_MS);
      throw e;
    } finally {
      inFlight.delete(youtubeId);
    }
  })();
  inFlight.set(youtubeId, promise);
  return promise;
}

// §4 1-byte 預驗:向 googlevideo 發 Range: bytes=0-0,收 1 byte 即棄(唔存)。
// URL 已失效(403/410)→ 即場 bust + 重 resolve,唔使等用戶撳播先發現;
// 順手令 CDN 節點行完 TLS/定位檔案,正式播放首 byte 快啲。回傳最終有效 URL。
export async function preVerifyUrl(youtubeId, url) {
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    if (r.body) { try { await r.body.cancel(); } catch (_) {} }
    if (r.status === 403 || r.status === 410) {
      bustCache(youtubeId);
      return await resolveAudioUrl(youtubeId);
    }
    return url;
  } catch (_) {
    return url; // 網絡問題唔當 URL 死;交返俾正式播放路徑處理
  }
}

export function bustCache(youtubeId) {
  cache.delete(youtubeId);
  // Also clear any failure record: bustCache is called when a previously-good
  // URL got rejected (403/410), which is an expiry, not a dead link — the next
  // attempt must be allowed to actually re-resolve.
  failCache.delete(youtubeId);
}

// ── IOS-NEXT-TRACK-PRELOAD-PLAN 方向3:warm 升級做真正 buffer ──────────
// 舊 warm 止步喺「resolve 到 CDN URL」,`GET /api/stream/:id` 打嚟嗰刻仲要
// 由零開一條新 backend↔googlevideo TCP/TLS 連線,呢段 RTT 之前完全冇慳到。
// 而家 warm 順手用 Range 攞埋頭一截音訊落嚟,擺喺記憶體,俾 stream.js 嗰個
// GET handler 一收到「由頭播」嘅請求就可以即刻吐呢截,唔使等新連線。
// NEXT-TRACK-LATENCY 2026-08-12:256KB 曾經係「頭幾百KB」量級嘅估計,但實測
// (真 AVFoundation probe 打真 backend)發現 AVFoundation 對「呢個 asset 係咪
// playable」嘅判斷,唔止睇 moov(632 bytes 已經夠),仲會主動開多條 range
// 連線去攞遠超 256KB 嘅內容;仲揪出真正嘅根因(見 probe_run5.log/logproxy.log,
// scratchpad「4fa328cb」session)——AVFoundation 一定會另外開一條**尾巴** range
// 連線(例:5.78MB 嘅檔攞 bytes=4194304-5780700),用嚟讀 duration/index,4MB
// 頭截完全冚唔到呢條尾巴 range,呢條連線每次都要行冷路徑(對正呢次「換歌等
// 16s」嘅大部份時間)。而家索性:淨係一個 fetch 就攞盡呢首歌(絕大部份詩歌
// 3-8MB,封頂 12MB 已經覆蓋成首歌);萬一真係大過 cap,另外補攞返最尾一截,
// 令尾巴 range probe 都命中記憶體。
const WARM_CAP_BYTES = 12 * 1024 * 1024; // 12MB 封頂——大部份詩歌全首得 3-8MB,一次過攞晒成首歌
const TAIL_BYTES = 512 * 1024; // 511KB 尾巴,俾 cap 都唔夠嘅大檔一個安全網,冚 AVFoundation 嘅尾巴 range probe
// NEXT-TRACK-LATENCY 2026-08-12 追加(Opus 5 驗收 punch list):3 分鐘 TTL 太短
// ——warm() 喺 App.js 一開波/換歌就即刻叫,但用戶真正撳到「下一首」可能係幾
// 分鐘之後(聽緊成首歌先轉),舊 TTL 好多時等唔切就過期,變返冷路徑。加長到
// 25 分鐘,俾夠晒 lead time,對記憶體嘅代價由下面嘅 LRU 上限頂住。
const BUFFER_TTL_MS = 25 * 60 * 1000;
// bufferCache 冇上限會愈食愈多記憶體(封頂 12MB × 冇限首數)。加返 LRU:
// 上限 8 首(約 8×12MB=96MB 頂闩,絕大部份歌實際細過 cap 所以遠低於呢個數),
// Map 保留插入順序嘅特性攞嚟做 LRU——攞中(getBufferedChunk)/寫入(warmBuffer)
// 都會 delete 完再 set,將個 entry 搬去「最新」尾,行到上限就踢最舊(頭)嗰個。
const MAX_BUFFER_ENTRIES = 8;
const bufferCache = new Map(); // youtubeId -> { url, buf, tailBuf, tailOffset, totalLength, contentType, expiresAt }

function touchBufferEntry(youtubeId, entry) {
  bufferCache.delete(youtubeId);
  bufferCache.set(youtubeId, entry);
}

function evictBufferCacheOverflow() {
  while (bufferCache.size > MAX_BUFFER_ENTRIES) {
    const oldestKey = bufferCache.keys().next().value;
    if (oldestKey === undefined) break;
    bufferCache.delete(oldestKey);
  }
}

// ── VPN 頻寬爭用止血:全局序列化 warmBuffer 嘅實際 fetch ──────────────
// NEXT-TRACK-LATENCY punch list 第4點:換歌一刻/開 App 一刻,前後可以有多個
// `/warm` POST 疊埋一齊到(開機「繼續收聽」+「今日為你預備」兩組各暖3首、
// 換歌又觸發新一組),每個 warmBuffer() call 而家會扯成首歌(至多 12MB)—
// 完全平行嘅話 backend↔googlevideo 條 VPN link 一次過要扛幾條 12MB 連線,
// 同「而家正播緊嗰首」爭緊同一條頻寬。單一 /warm request 入面本身已經係
// sequential for-loop(見 routes/stream.js),但唔同 request 之間冇隔離。
// 呢度加一條全局隊列,確保**成個 process 入面同一時間淨係得一個 warmBuffer
// fetch 真正喺度扯緊 bytes**,唔理幾多個 /warm call 疊埋嚟都好——純粹減低
// peak 併發,唔改任何暖法本身。
let warmQueueTail = Promise.resolve();
function withWarmLock(fn) {
  const run = warmQueueTail.then(fn, fn);
  warmQueueTail = run.then(() => {}, () => {});
  return run;
}

// url 由呼叫方(warm 路由)傳入,一定係 resolveAudioUrl/preVerifyUrl 啱啱拎到嗰條——
// 存埋佢係為咗喺 getBufferedChunk() 度可以核對「而家播放請求攞到嘅 url 係咪
// 同warm嗰陣一樣」,唔一樣就唔用(避免罕見情況下 URL 被 bust 重 resolve 換咗
// 唔同 format/itag,叉埋舊 buffer 落新 stream 會爛檔)。
export async function warmBuffer(youtubeId, url) {
  return withWarmLock(async () => {
    try {
      const r = await fetch(url, { method: 'GET', headers: { Range: `bytes=0-${WARM_CAP_BYTES - 1}` } });
      if (r.status !== 200 && r.status !== 206) { try { await r.body?.cancel?.(); } catch (_) {} return; }
      const buf = Buffer.from(await r.arrayBuffer());
      // STREAM-MIDTRACK-SILENCE-ROOTCAUSE-2026-08-12:呢截頭一定包住成個
      // moov(mvhd/tkhd/mdhd 實測喺 632 bytes 之內),喺存入 cache 之前就地修好,
      // 之後 getBufferedChunk() 攞返嚟嘅永遠係已修版本,唔使逐次 stream.js 補。
      try { zeroFragmentedMp4Durations(buf); } catch (_) {}
      let totalLength = null;
      const cr = r.headers.get('content-range'); // "bytes 0-12582911/12345678"
      const m = cr && /\/(\d+)$/.exec(cr);
      if (m) totalLength = Number(m[1]);
      else {
        const cl = r.headers.get('content-length'); // 全首歌細過 cap,直接 200 —— 呢個 fetch 已經係成首歌
        if (cl) totalLength = Number(cl);
      }

      let tailBuf = null;
      let tailOffset = null;
      if (totalLength && buf.length < totalLength) {
        // 檔案大過 12MB cap,頭截冚唔到尾——補攞返最後 TAIL_BYTES,俾
        // AVFoundation 嘅尾巴 range probe(讀 duration/index)都有得命中記憶體。
        // 呢個 fetch 都排喺同一個 warm lock 入面,唔會加多一條*同時*嘅連線。
        try {
          const tailStart = Math.max(buf.length, totalLength - TAIL_BYTES);
          const tr = await fetch(url, { method: 'GET', headers: { Range: `bytes=${tailStart}-${totalLength - 1}` } });
          if (tr.status === 200 || tr.status === 206) {
            tailBuf = Buffer.from(await tr.arrayBuffer());
            tailOffset = tailStart;
          } else {
            try { await tr.body?.cancel?.(); } catch (_) {}
          }
        } catch (_) { /* 尾巴攞唔到唔緊要,頭截照用 */ }
      }

      touchBufferEntry(youtubeId, {
        url,
        buf,
        tailBuf,
        tailOffset,
        totalLength,
        contentType: r.headers.get('content-type') || null,
        expiresAt: Date.now() + BUFFER_TTL_MS,
      });
      evictBufferCacheOverflow();
    } catch (_) { /* 熱身失敗唔緊要,行返冷路徑 */ }
  });
}

export function getBufferedChunk(youtubeId, url) {
  const c = bufferCache.get(youtubeId);
  if (!c) return null;
  if (c.expiresAt <= Date.now() || c.url !== url) { bufferCache.delete(youtubeId); return null; }
  touchBufferEntry(youtubeId, c); // LRU:攞中就搬去最新
  return c;
}

export { cache, failCache };
