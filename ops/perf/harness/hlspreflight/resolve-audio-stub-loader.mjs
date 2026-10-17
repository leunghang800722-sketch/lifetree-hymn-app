// ops/perf/harness/hlspreflight/resolve-audio-stub-loader.mjs
// HLS-PREFLIGHT-EXEC-20260907 §3 H-C —— Node ESM loader hook,淨係喺
// `backend/routes/hls.js` 呢一個 importer 入面,將 `../lib/resolveAudio.js`
// 呢個 specifier 換做一個可以由 harness 隨意擺佈嘅 stub(`resolveAudioUrl`/
// `bustCache`),等 harness 可以用本機 mock http server 模擬 googlevideo 嘅
// 403/timeout/200,唔使真係打 yt-dlp/YouTube。
//
// ⚠️ 呢個 hook 淨係擋 hls.js 一個 importer——`routes/stream.js`、
// `lib/opsMetrics.js` 呢啲其他檔案 import 嘅嘢完全唔受影響,`hls.js` 本身
// import 嘅 `../lib/hlsPlaylist.js`、`../lib/opsMetrics.js` 都係真身。
export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL || '';
  if (specifier.endsWith('resolveAudio.js') && parent.includes('/routes/hls.js')) {
    return { url: 'hlspreflight-harness-stub:resolve-audio', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'hlspreflight-harness-stub:resolve-audio') {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export async function resolveAudioUrl(youtubeId) {
          globalThis.__hcResolveCalls = (globalThis.__hcResolveCalls || 0) + 1;
          const fn = globalThis.__hcMockResolveAudioUrl;
          if (typeof fn !== 'function') throw new Error('__hcMockResolveAudioUrl not installed');
          return fn(youtubeId);
        }
        export function bustCache(youtubeId) {
          globalThis.__hcBustCalls = (globalThis.__hcBustCalls || 0) + 1;
        }
      `,
    };
  }
  return nextLoad(url, context);
}
