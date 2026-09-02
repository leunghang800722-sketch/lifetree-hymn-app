// PERF-IMPROVEMENT-PLAN-20260902 Stage 1B —— 極輕量效能儀器。
//
// 設計原則(鐵律,唔好加重):
//   1. 100% try/catch,永遠唔 throw、唔阻塞 render、唔改任何現有邏輯。
//   2. 淨係喺 index.js 第一行 import(令 T0 盡量貼近 bundle entry 執行時間),
//      call site 淨係加一行 mark()/note()/useRenderCount() 呼叫。
//   3. 三種 beacon(perfMarks/perfRenders/perfNav),cadence 見下面
//      schedulePerfMarksBeacon/scheduleRenderBeacons/recordNavBeacon —— 呢個
//      係「3 個 beacon 事件類型」嘅上限,唔係「全程序生命週期淨送 3 條」
//      (perfNav 每次切 tab 都送,封頂 10 次,見 PERF-BASELINE-1B-20260902.md
//      「限制」一節嘅說明)。
//
// 讀 global.performance?.rnStartupTiming(RN 0.74+ ReactNativeStartupTiming)、
// 包一層 fetch 計首 30 秒 request 數、hymnsMs/mmkvRead/parse 等 span,全部
// 存喺 module-level Map,15 秒後執行緒閒落嚟先送一次 beacon,唔會影響開機
// 主線程。

import { useRef } from 'react';
import { Platform } from 'react-native';

export const PERF_MARKS_ENABLED = true;

const T0 = Date.now();

const marks = new Map();   // name -> elapsed ms since T0(時間戳,首次寫入為準)
const notes = new Map();   // name -> 任意數值(唔係時間,例如 count/flag)
const renderCounts = new Map(); // component name -> render 次數

function safe(fn) {
  try { fn(); } catch (_) {}
}

export function mark(name) {
  safe(() => { if (!marks.has(name)) marks.set(name, Date.now() - T0); });
}

// 直接記一個已知時長(ms),唔使 T0 起計 —— 留俾 call site 自己計咗差再入嚟嘅情況。
export function span(name, ms) {
  safe(() => { if (!marks.has(name)) marks.set(name, ms); });
}

export function note(name, value) {
  safe(() => { if (!notes.has(name)) notes.set(name, value); });
}

export function elapsedSinceT0() {
  return Date.now() - T0;
}

function getMark(name) { return marks.has(name) ? marks.get(name) : '-'; }
function getNote(name) { return notes.has(name) ? notes.get(name) : '-'; }
function durMark(a, b) {
  return (marks.has(a) && marks.has(b)) ? (marks.get(b) - marks.get(a)) : '-';
}

// ---------------------------------------------------------------------------
// fetch 請求計數 —— 開機 30 秒內,按 URL path 首兩段聚合。
// ⚠️ 只計 fetch:<Image> 走 native image loader,唔經呢層,唔會計入。
// ---------------------------------------------------------------------------
const fetchCounts = new Map();
let fetchCounterInstalled = false;

export function installFetchCounter() {
  if (fetchCounterInstalled) return;
  fetchCounterInstalled = true;
  safe(() => {
    const origFetch = global.fetch;
    if (typeof origFetch !== 'function') return;
    global.fetch = function perfPatchedFetch(input, init) {
      safe(() => {
        if (Date.now() - T0 <= 30000) {
          let urlStr = '';
          try { urlStr = typeof input === 'string' ? input : (input && input.url) || ''; } catch (_) {}
          let pathKey = 'unknown';
          try {
            const u = new URL(urlStr);
            const segs = u.pathname.split('/').filter(Boolean);
            pathKey = segs.slice(0, 2).join('/') || 'root';
          } catch (_) {}
          fetchCounts.set(pathKey, (fetchCounts.get(pathKey) || 0) + 1);
        }
      });
      return origFetch.apply(this, arguments);
    };
  });
}

function fetchSummary() {
  let total = 0;
  const parts = [];
  try {
    fetchCounts.forEach((v, k) => { total += v; parts.push(`${k}:${v}`); });
  } catch (_) {}
  return `${total}(${parts.join(',')})`;
}

// ---------------------------------------------------------------------------
// re-render 次數 —— call site 逐個 component 掛一個 useRenderCount('Name')。
// ---------------------------------------------------------------------------
export function useRenderCount(name) {
  const ref = useRef(0);
  ref.current += 1;
  safe(() => renderCounts.set(name, ref.current));
  return ref.current;
}

const RENDER_NAMES = ['Home', 'Library', 'Mine', 'Mini', 'TabBar', 'FullPlayer', 'AppContent'];

function renderSummary() {
  return RENDER_NAMES.map((n) => `${n}=${renderCounts.get(n) ?? 0}`).join(' ');
}

// ---------------------------------------------------------------------------
// beacon 送出 —— 跟 App.js logDiag() 一樣嘅 body 格式,打
// `${API_BASE}/api/client-log`。deviceId 用現有 src/deviceId.js。
// ---------------------------------------------------------------------------
let deviceIdCache = null;
async function resolveDeviceId() {
  if (deviceIdCache) return deviceIdCache;
  try {
    const mod = require('./deviceId.js');
    deviceIdCache = await mod.getOrCreateDeviceId();
  } catch (_) { deviceIdCache = 'na'; }
  return deviceIdCache;
}

async function sendBeacon(event, detail) {
  try {
    const { API_BASE } = require('./config.js');
    const deviceId = await resolveDeviceId();
    const body = {
      event,
      clientTs: Date.now(),
      platform: Platform.OS,
      deviceId,
      detail: String(detail).slice(0, 300),
    };
    await fetch(`${API_BASE}/api/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

function buildRnstSummary() {
  try {
    const t = global.performance && global.performance.rnStartupTiming;
    if (!t) return 'na';
    const st = t.startTime;
    const rtS = t.initializeRuntimeStart, rtE = t.initializeRuntimeEnd;
    const epS = t.executeJavaScriptBundleEntryPointStart, epE = t.executeJavaScriptBundleEntryPointEnd;
    const rt = (rtS != null && rtE != null) ? (rtE - rtS) : '-';
    const ep = (epS != null && epE != null) ? (epE - epS) : '-';
    return `st=${st ?? '-'},rt=${rt},ep=${ep}`;
  } catch (_) { return 'na'; }
}

let perfMarksSent = false;
export function schedulePerfMarksBeacon() {
  if (perfMarksSent) return;
  perfMarksSent = true;
  safe(() => {
    setTimeout(() => {
      safe(() => {
        // D-1(PERF-STAGE2-2B-20260902):dropped `rnst:` summary from this
        // string to make room — 冇任何比較表格用過呢個欄,拎走純為咗
        // 300 字上限畀新加嘅 hymns fetch 三段(ttfb/body/parse)留位,
        // 唔影響任何改前/改後對比嘅欄位。
        const detail = [
          `b0=0`,
          `app=${getMark('app')}`,
          `cont=${getMark('cont')}`,
          `mmkvRead=${durMark('mmkvReadStart', 'mmkvReadEnd')}`,
          `parse=${durMark('parseStart', 'parseEnd')}`,
          `n=${getNote('hymnsCount')}`,
          `cacheReady=${getMark('cacheReady')}`,
          `home=${getMark('home')}`,
          `verMs=${durMark('verStart', 'verEnd')}`,
          `verSkip=${getNote('verSkip')}`,
          `hymnsMs=${durMark('hymnsStart', 'hymnsEnd')}`,
          // D-1 新增:/api/hymns 單一 fetch 拆三段——headers 到(ttfb)、
          // r.text() 完(body)、JSON.parse 完(pars);byt=body 嘅 string.length。
          `ttfb=${durMark('hymnsStart', 'hymnsTtfb')}`,
          `body=${durMark('hymnsTtfb', 'hymnsBody')}`,
          `pars=${durMark('hymnsBody', 'hymnsParse')}`,
          `byt=${getNote('hymnsBytes')}`,
          `fetch=${fetchSummary()}`,
          `rss=na`,
        ].join(' ');
        sendBeacon('perfMarks', detail);
      });
    }, 15000);
  });
}

// ---------------------------------------------------------------------------
// D-1(PERF-STAGE2-2B-20260902)—— 首頁各 section 嘅 compute 耗時(span())
// + 兩個 hidden tab(Library/Mine)首次 render 嘅耗時,獨立一個 beacon,
// 5 秒後送(首頁 section 嘅 useMemo 同 Library/Mine 嘅 render 都喺開機頭
// 幾百 ms 內就會發生,5 秒窗口綽綽有餘,唔使等 15 秒個 perfMarks beacon)。
// ---------------------------------------------------------------------------
let perfHomeSent = false;
export function schedulePerfHomeBeacon() {
  if (perfHomeSent) return;
  perfHomeSent = true;
  safe(() => {
    setTimeout(() => {
      safe(() => {
        const detail = [
          `chips=${getMark('secChips')}`,
          `pages=${getMark('secPages')}`,
          `today=${getMark('secToday')}`,
          `recent=${getMark('secRecent')}`,
          `lib=${getMark('libraryRenderMs')}`,
          `mine=${getMark('mineRenderMs')}`,
        ].join(' ');
        sendBeacon('perfHome', detail);
      });
    }, 5000);
  });
}

let renderBeaconsSent = 0;
export function scheduleRenderBeacons() {
  safe(() => {
    [15000, 60000].forEach((delay) => {
      setTimeout(() => {
        safe(() => {
          if (renderBeaconsSent >= 2) return;
          renderBeaconsSent += 1;
          const t = Math.round(delay / 1000);
          sendBeacon('perfRenders', `t=${t} ${renderSummary()}`);
        });
      }, delay);
    });
  });
}

let navBeaconsSent = 0;
export function recordNavBeacon(tab, tapToMountMs, tapToPaintMs) {
  safe(() => {
    if (navBeaconsSent >= 10) return;
    navBeaconsSent += 1;
    sendBeacon('perfNav', `tab=${tab} tapToMount=${tapToMountMs}ms tapToPaint=${tapToPaintMs}ms`);
  });
}

if (PERF_MARKS_ENABLED) {
  installFetchCounter();
  schedulePerfMarksBeacon();
  scheduleRenderBeacons();
  schedulePerfHomeBeacon(); // D-1(PERF-STAGE2-2B-20260902)
}
