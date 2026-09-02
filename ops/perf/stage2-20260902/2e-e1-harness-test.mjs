import { setTimeout as delay } from 'node:timers/promises';

// Byte-for-byte 抄自 production 修法(frontend/hymn-app/src/hooks/useCachedHymns.js
// makeAbortRejectPromise)——harness 用嚟量 JS-semantics,native fetch 本身嘅
// bug(text() 唔監聽 errorReceived)由 PERF-STAGE2-2B-OPUS-20260902.md §2.6
// 讀 ExpoFetchModule.swift/.kt 源碼實錘,呢度用 nativeBuggyText() 模擬返
// 同一個行為嚟做正控。
function makeAbortRejectPromise(controller) {
  return new Promise((_, reject) => {
    const onAbort = () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (controller.signal.aborted) { onAbort(); return; }
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
}

// 模擬 ExpoFetchModule 嘅 text() 語義：淨係監聽「body 自然讀完」，唔監聽
// abort/error——stream 因為 abort 而拋錯嗰陣，呢個 function 吞咗個 error、
// 永遠唔 settle。呢個先係 §2.6 講嘅真身 bug，唔係「r.text() 會 reject 但
// 冇人 catch」咁簡單——係佢連 reject 都冇。
async function nativeBuggyText(r) {
  const reader = r.body.getReader();
  const chunks = [];
  const decoder = new TextDecoder();
  for (;;) {
    let step;
    try {
      step = await reader.read();
    } catch (e) {
      await new Promise(() => {}); // 故意永遠唔 resolve/reject，模擬吞錯
    }
    if (step.done) break;
    chunks.push(step.value);
  }
  return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
}

async function fetchTwoStagePure(url, { headerMs, bodyMs, useRace }) {
  const controller = new AbortController();
  let t = setTimeout(() => controller.abort(), headerMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, reason: 'not-ok' };
    t = setTimeout(() => controller.abort(), bodyMs);
    let text;
    try {
      text = useRace
        ? await Promise.race([nativeBuggyText(r), makeAbortRejectPromise(controller)])
        : await nativeBuggyText(r);
    } finally {
      clearTimeout(t);
    }
    return { ok: true, text };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, reason: e.name || String(e) };
  }
}

const BASE = `http://localhost:${process.env.E1_PORT || 3987}`;

async function main() {
  const results = {};

  // (1) 正控 A —— WITH E-1 fix，/hang route，bodyMs 縮短做 2000ms(生產碼
  //     係 30000ms，呢度縮短淨係為咗測試快，唔改邏輯)。預期：~2000ms 內
  //     reject，reason=AbortError。
  {
    const t0 = Date.now();
    const r = await fetchTwoStagePure(`${BASE}/hang`, { headerMs: 8000, bodyMs: 2000, useRace: true });
    const ms = Date.now() - t0;
    results.withFix_hang = { ...r, ms };
  }

  // (2) 負控 —— WITHOUT E-1 fix(useRace:false)，/hang route，bodyMs 一樣
  //     2000ms，但用一個 6000ms 嘅「測試觀察窗」證明「6000ms 都未 settle」
  //     ——呢個 6000ms 唔係產品碼，淨係 harness 用嚟證明「一直掛住」。
  {
    const t0 = Date.now();
    const race = await Promise.race([
      fetchTwoStagePure(`${BASE}/hang`, { headerMs: 8000, bodyMs: 2000, useRace: false }).then((r) => ({ settled: true, ...r })),
      delay(6000).then(() => ({ settled: false })),
    ]);
    const ms = Date.now() - t0;
    results.withoutFix_hang = { ...race, ms };
  }

  // (3) 正控 B —— 正常 route 唔受影響，fix 開住，應該即刻(遠早於 bodyMs)
  //     攞到正確內容。
  {
    const t0 = Date.now();
    const r = await fetchTwoStagePure(`${BASE}/normal`, { headerMs: 8000, bodyMs: 2000, useRace: true });
    const ms = Date.now() - t0;
    results.withFix_normal = { ...r, ms };
  }

  console.log(JSON.stringify(results, null, 2));

  let fail = false;
  if (!(results.withFix_hang.ok === false && results.withFix_hang.reason === 'AbortError' && results.withFix_hang.ms < 2500)) {
    console.error('FAIL: withFix_hang 冇喺預期時間內用 AbortError reject');
    fail = true;
  }
  if (!(results.withoutFix_hang.settled === false)) {
    console.error('FAIL: withoutFix_hang 竟然喺 6000ms 內 settle 咗(應該永遠掛住先啱)');
    fail = true;
  }
  if (!(results.withFix_normal.ok === true && results.withFix_normal.text.includes('"title":"ok"') && results.withFix_normal.ms < 500)) {
    console.error('FAIL: withFix_normal 冇即刻攞到正確內容');
    fail = true;
  }
  process.exit(fail ? 1 : 0);
}

main();
