import { JSDOM } from 'jsdom';

// Node 冇 DOM,react-dom/client 要有 document 先起到 root。呢個要喺
// import 'react-dom/client' 之前行,所以 scenario 檔要 top-level await
// setupDom() 先再 dynamic import react-dom。
export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  global.window = dom.window;
  global.document = dom.window.document;
  // Node 22+ 自己有一個 read-only 嘅 global navigator getter,直接賦值會
  // TypeError,要用 defineProperty 先蓋得過。
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

export function flushMicrotasks(rounds = 8) {
  let p = Promise.resolve();
  for (let i = 0; i < rounds; i++) {
    p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  }
  return p;
}

// scenario 用嚟砌 fetch mock:URL 前綴判斷 → JSON body。
export function makeFetchMock(routes) {
  return async (url) => {
    for (const [prefix, body] of routes) {
      if (String(url).startsWith(prefix)) {
        return {
          ok: true,
          json: async () => body,
        };
      }
    }
    return { ok: false, json: async () => ({}) };
  };
}
