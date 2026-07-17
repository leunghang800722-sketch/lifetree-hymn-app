// lib/resolveAudio.js — shared YouTube audio URL resolver
// Used by routes/audio.js (legacy endpoint) and routes/stream.js (new stream proxy).

import { exec as execCb } from 'child_process';
import { promisify } from 'util';

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

const STRATEGIES = [
  { name: 'youtube:player_client=tv', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '--extractor-args "youtube:player_client=tv"' },
  { name: 'default', fmt: 'bestaudio[ext=m4a]/bestaudio', extra: '' },
  { name: 'default-any', fmt: 'bestaudio', extra: '' },
];

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

async function resolveViaYtDlp(youtubeId) {
  for (const strat of STRATEGIES) {
    try {
      const { stdout } = await exec(
        `yt-dlp -f "${strat.fmt}" ${strat.extra} --get-url --no-playlist "https://www.youtube.com/watch?v=${youtubeId}"`,
        { timeout: 30000 }
      );
      const url = stdout.trim();
      if (url && url.startsWith('http')) return url;
    } catch (_) {
      // try next strategy
    }
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

export function bustCache(youtubeId) {
  cache.delete(youtubeId);
  // Also clear any failure record: bustCache is called when a previously-good
  // URL got rejected (403/410), which is an expiry, not a dead link — the next
  // attempt must be allowed to actually re-resolve.
  failCache.delete(youtubeId);
}

export { cache };
