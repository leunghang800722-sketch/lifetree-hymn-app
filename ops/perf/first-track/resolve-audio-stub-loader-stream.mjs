// ops/perf/first-track/resolve-audio-stub-loader-stream.mjs
// FIRST-TRACK-STEP01-EXEC-20260907 §3 H2 —— Node ESM loader hook,淨係喺
// `backend/routes/stream.js` 呢一個 importer 入面,將 `../lib/resolveAudio.js`
// 同 `../lib/warmLog.js` 呢兩個 specifier 換做 harness 可控嘅 stub,等
// `/warm` route 嘅測試唔使真係打 yt-dlp/googlevideo,亦唔會寫到
// production 嘅 `backend/data/warm-daily.json`。
//
// 同 ops/perf/harness/hlspreflight/resolve-audio-stub-loader.mjs 同一手法
// (嗰個係擋 `routes/hls.js` 嘅 importer,呢個係擋 `routes/stream.js`)。
// `routes/stream.js` 本身、`lib/hotIds.js`、`lib/opsMetrics.js` 全部係真身,
// 一個字冇改。
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (parent.includes('/routes/stream.js')) {
    if (specifier.endsWith('resolveAudio.js')) {
      return { url: 'h2-harness-stub:resolve-audio', shortCircuit: true };
    }
    if (specifier.endsWith('warmLog.js')) {
      return { url: 'h2-harness-stub:warm-log', shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'h2-harness-stub:resolve-audio') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export async function resolveAudioUrl(id, opts) {
          globalThis.__h2ResolveCalls = (globalThis.__h2ResolveCalls || 0) + 1;
          const fn = globalThis.__h2MockResolveAudioUrl;
          if (typeof fn !== 'function') throw new Error('__h2MockResolveAudioUrl not installed');
          return fn(id, opts);
        }
        export function bustCache(id) { globalThis.__h2BustCalls = (globalThis.__h2BustCalls || 0) + 1; }
        export async function preVerifyUrl(id, url) { return url; }
        export function markStreaming(id) { globalThis.__h2MarkStreamingCalls = (globalThis.__h2MarkStreamingCalls || 0) + 1; }
        export function unmarkStreaming(id) {}
        export const cache = new Map();
        export async function warmBuffer(id, url, durationSec, onDequeue) {
          globalThis.__h2WarmBufferCalls = globalThis.__h2WarmBufferCalls || [];
          globalThis.__h2WarmBufferCalls.push({ id, url, durationSec });
          if (typeof onDequeue === 'function') { try { onDequeue(); } catch (_) {} }
        }
        export function getBufferedChunk() { return null; }
        export function evictBufferedChunk() {}
        export function anyStreaming() { return !!globalThis.__h2AnyStreaming; }
        export async function adoptStreamedHead() {}
        export const WARM_CAP_BYTES = 12 * 1024 * 1024;
        export function parseDurationSec(text) {
          if (typeof text === 'number' && Number.isFinite(text)) return text > 0 ? text : null;
          if (typeof text !== 'string') return null;
          const parts = text.trim().split(':');
          if (parts.length < 2 || parts.length > 3) return null;
          let sec = 0;
          for (const p of parts) { if (!/^\\d+$/.test(p)) return null; sec = sec * 60 + Number(p); }
          return sec > 0 ? sec : null;
        }
      `,
    };
  }
  if (url === 'h2-harness-stub:warm-log') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export function recordWarmIds(ids) {
          globalThis.__h2RecordWarmIdsCalls = globalThis.__h2RecordWarmIdsCalls || [];
          globalThis.__h2RecordWarmIdsCalls.push(ids);
        }
      `,
    };
  }
  return nextLoad(url, context);
}
