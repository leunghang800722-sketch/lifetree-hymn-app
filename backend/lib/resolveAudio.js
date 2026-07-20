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
// §2a:tv 同 default 兩個 strategy 平行 race,鬥快(冷 resolve 期望值砍半)。
// 有前科(IP 俾 ban 過),所以留個 env 掣,想關返順序試就 RESOLVE_PARALLEL=0。
const RESOLVE_PARALLEL = process.env.RESOLVE_PARALLEL !== '0';

const STRATEGIES = [
  { name: 'youtube:player_client=tv', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '--extractor-args "youtube:player_client=tv"' },
  { name: 'default', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '' },
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

function runStrategy(youtubeId, strat) {
  return exec(
    `yt-dlp -f "${strat.fmt}" ${strat.extra} --get-url --no-playlist "https://www.youtube.com/watch?v=${youtubeId}"`,
    { timeout: RESOLVE_TIMEOUT_MS }
  ).then(({ stdout }) => {
    const url = stdout.trim();
    if (url && url.startsWith('http')) return url;
    throw new Error(`empty url (${strat.name})`);
  });
}

async function resolveViaYtDlp(youtubeId) {
  if (RESOLVE_PARALLEL) {
    // §2a:tv + default 同時開跑,邊個先返有效 URL 用邊個。Promise.any 只喺全部
    // reject 先 reject,所以兩個都死先落去第三個順序後備。
    try {
      return await Promise.any([
        runStrategy(youtubeId, STRATEGIES[0]),
        runStrategy(youtubeId, STRATEGIES[1]),
      ]);
    } catch (_) {
      try { return await runStrategy(youtubeId, STRATEGIES[2]); } catch (_) {}
      throw new Error(`All yt-dlp strategies failed for ${youtubeId}`);
    }
  }
  // 順序後備(RESOLVE_PARALLEL=0)—— 同舊版一模一樣。
  for (const strat of STRATEGIES) {
    try { return await runStrategy(youtubeId, strat); } catch (_) {}
  }
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

export { cache };
