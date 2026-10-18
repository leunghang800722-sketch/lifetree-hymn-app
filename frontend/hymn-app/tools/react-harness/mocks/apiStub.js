// ../api 嘅 harness stub —— 只提供 useCachedHymns 用到嘅 fetchWithTimeout,
// 實作與 src/api.js 一字不差(AbortController 逾時),避免拖入 authSession 等依賴。
export async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
