import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { getStorage } from '../storage';
import { API_BASE } from '../config.js';
import { createExternalStore } from './externalStore.js';
import { mark, note } from '../perfMarks'; // PERF-BASELINE-1B-20260902

// BATCH5 O7:改用 AbortController——舊嘅 Promise.race 逾時之後底層 fetch
// 連線唔會斷,慢網下會同 retry(fetchPrimaryHymnsWithRetry)疊住背景繼續拉多
// 幾份全量。而家逾時會真 abort 底層 fetch,throw 嘅係 AbortError(唔再
// 係自製 Error)——呢度全部 caller(fetchAllHymns/fetchVersion)已核實
// 只 catch 完回 null/空,冇人讀 error message,語義安全。
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// E-1(PERF-STAGE2-2E-20260902,承 PERF-STAGE2-2B-OPUS-20260902.md §2.6
// 保留②)—— Opus 5 讀 expo/fetch 原生碼(ExpoFetchModule.swift/.kt)實錘:
// `response.text()` 淨係監聽 `.bodyCompleted`,唔監聽 `.errorReceived`。
// `controller.abort()` 會令底層 URLSession/OkHttp task 真係取消(慳返
// socket/流量),但**唔會令 `text()` 嗰個 promise settle**——冇人再派
// `.bodyCompleted`,個 once-listener 永遠唔 fire,`await r.text()` 永遠
// 掛住。結果係下面嘅 30s body timeout 淨係識取消底層下載,JS 側 catch/
// retry 完全踩唔到,同「冇加呢個 timeout」喺呢個 runtime 效果一樣。
// 修法:唔淨係 abort,仲要用 Promise.race 加一個會喺 `controller.signal`
// 嘅 'abort' 事件 fire 嗰刻主動 reject(AbortError)嘅 promise,等外層
// `catch`/重試邏輯真正行得到。呢個 promise 唔會 leak——`r.text()` 一路
// resolve 先嘅話,race 贏出嗰個 promise 執行完,輸嗰個(呢個
// abortReject)冇人再理,冇 listener 泄漏(addEventListener 用
// {once:true},resolve 咗都唔會再有 abort 事件觸發佢)。
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

// F-1(PERF-STAGE2-2B-20260902)—— E-3(PERF-STAGE2-2E-20260902)已更正
// 註解:呢度**原本**寫住「1B baseline 5/5 run 第一次嘗試全部撞 8s」/
// 「實際逾時拉到 16s」,呢兩句已經俾 Opus 5(PERF-STAGE2-2B-OPUS-
// 20260902.md §1)撤回——Expo SDK 56 嘅 `global.fetch` 係 expo/fetch
// (winter runtime),`fetch()` 喺 **headers** 到就 resolve
// (`.responseReceived`,唔係等成個 body),`fetch=api/hymns:1` 呢個欄
// 已經證明 1B baseline 冇撞過 retry。真相係:改之前嗰個單一 8s
// timeout **淨係保護緊 headers(ttfb)**,body 由頭到尾冇 cap 過
// (body 3.66MB 傳輸秒級,10-11s 係單次 fetch 嘅真實耗時,唔係
// 8s燒完+retry)。而家拆做兩段、同一條 request(同一個
// AbortController/signal——abort 就係 cancel 緊呢條 request,唔係開
// 多一條):
//   1) headers 未到(fetch() 都未 resolve)—— 8s 內照 abort,斷網偵測
//      能力唔變差。
//   2) headers 一到就換一個新嘅 30s timeout 專登俾 body(慢網/tunnel
//      body 傳輸慢先會頂到呢個)。E-1 之前呢個 30s 淨係識令底層
//      URLSession/OkHttp task 取消,但因為 expo/fetch 嘅 `text()` 只等
//      `.bodyCompleted`、唔等 `.errorReceived`(PERF-STAGE2-2B-OPUS-
//      20260902.md §2.6),JS 側 `await r.text()` 會永遠掛住、catch/
//      retry 踩唔到。E-1 加咗 `makeAbortRejectPromise` 同 `r.text()`
//      race,而家 30s 到咗先真係會 reject、catch 先行得到。
// 淨係 /api/hymns 用,/api/version 保持原本單一 fetchWithTimeout(8s,
// 見上面)。D-1 嘅 ttfb/body/parse mark 依家逐個 attempt 分開記
// (hTtfb1/hBody1/hPars1、hTtfb2/hBody2/hPars2),先睇到兩次嘗試各自
// 嘅分佈,唔會俾第一次嘅數蓋咗第二次(mark() write-once)。
async function fetchHymnsTwoStage(url, attempt) {
  const controller = new AbortController();
  let t = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    mark(`hTtfb${attempt}`);
    if (!r.ok) return { hymns: [], dataVersion: null };
    t = setTimeout(() => controller.abort(), 30000);
    let text;
    try {
      // E-1 — race 住 abort 事件,等 30s body timeout 真係可以 catch 到
      // (見上面 makeAbortRejectPromise 註解)。
      text = await Promise.race([r.text(), makeAbortRejectPromise(controller)]);
    } finally {
      clearTimeout(t);
    }
    mark(`hBody${attempt}`);
    note('hymnsBytes', text.length);
    const body = JSON.parse(text);
    mark(`hPars${attempt}`);
    const d = body?.data || body;
    return { hymns: Array.isArray(d) ? d : [], dataVersion: body?.dataVersion ?? null };
  } catch (e) {
    clearTimeout(t);
    return { hymns: [], dataVersion: null };
  }
}

async function fetchAllHymns(attempt = 1) {
  return fetchHymnsTwoStage(`${API_BASE}/api/hymns`, attempt);
}

// PERF-STAGE2-2D-20260902(C-1 前端消費者)—— 開機第一次冷開改用
// `/api/hymns?lite=1`(backend C-1,commit 8d7a2d4:同一 SELECT/kids→lang
// 墊/real_lang,淨係剷走 lyrics 欄)先攞歌單,即刻可以畫首頁/詩歌庫,唔使
// 等 lyrics(佔 raw payload 49%,PERF-STAGE2-2A-OPUS-20260902.md §6)一齊
// 落嚟先開始 render。用同一套 fetchHymnsTwoStage(8s headers/30s body)+
// 重試一次嘅邏輯(舊版 `fetchAllHymnsWithRetry` 嘅同款寫法),淨係 URL 唔同。
async function fetchPrimaryHymns(attempt = 1) {
  return fetchHymnsTwoStage(`${API_BASE}/api/hymns?lite=1`, attempt);
}

// 404 fallback(執行單明文要求)—— live backend 喺 C-1 冇 restart 之前,
// `?lite=1` 會俾舊 server.js 忽略(query 冇對應邏輯),照樣回**full**
// payload(唔係 404)。用「第一個 hymn object 有冇 `lyrics` 呢個 key」嚟
// 分辨:新 backend 嘅 lite 分支連 key 都唔出(SELECT 冇帶呢欄),舊 backend
// 一定有(就算個別歌 lyrics 係 NULL,`stmt.getAsObject()` 都會出
// `lyrics:null` 呢個 key)。判做 full 就代表呢份 response 已經齊晒 lyrics,
// 唔使再打 `/api/hymns/lyrics` 補。
function finalizePrimaryResult(result) {
  const isFull = result.hymns.length > 0
    && Object.prototype.hasOwnProperty.call(result.hymns[0], 'lyrics');
  note('liteIsFull', isFull ? 1 : 0);
  return { hymns: result.hymns, dataVersion: result.dataVersion, isFull };
}

async function fetchPrimaryHymnsWithRetry() {
  const first = await fetchPrimaryHymns(1);
  note('hymnsAtt1Ok', first.hymns.length > 0 ? 1 : 0); // F-1 量度指標:第一次嘗試成功率
  if (first.hymns.length > 0) { note('hymnsAttempts', 1); return finalizePrimaryResult(first); }
  mark('hymns2Start'); // D-1 — 第二次嘗試開始嗰刻,俾 a2t(attempt2 ttfb)計相對時間
  const second = await fetchPrimaryHymns(2);
  note('hymnsAttempts', 2);
  return finalizePrimaryResult(second);
}

// C-1 前端 —— `/api/hymns/lyrics`(backend commit 8d7a2d4)背景 fetch,
// `{ data: { [id]: lyrics }, dataVersion }`,只包含 5,387/6,405(84.1%)非空
// lyrics。同一套兩段 timeout,但**唔重試**——攞唔到就維持 lite 版顯示,
// 下次開 App 因為冇存 `allHymnsVersion` 會自動再嘗試一次(見 refresh() 底
// 嗰句註解)。`map:null` 代表 fail(HTTP 錯誤/斷網/JSON 壞);`map:{}` 係
// 合法嘅「成功但冇非空 lyrics」(理論上唔會發生,但唔應該當 fail)。
async function fetchLyricsMap() {
  const controller = new AbortController();
  let t = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${API_BASE}/api/hymns/lyrics`, { signal: controller.signal });
    clearTimeout(t);
    // 404 = 舊 backend(C-1 未 restart)冇呢條 route;非 200 一律當 fail。
    if (!r.ok) return { map: null, dataVersion: null, bytes: 0 };
    t = setTimeout(() => controller.abort(), 30000);
    let text;
    try {
      // E-1 — 同 fetchHymnsTwoStage 一樣嘅 abort race,唔係就 30s 之後淨係
      // 底層下載被取消、JS 側 catch/lyricsFail 分支永遠踩唔到。
      text = await Promise.race([r.text(), makeAbortRejectPromise(controller)]);
    } finally {
      clearTimeout(t);
    }
    const body = JSON.parse(text);
    const map = (body && body.data && typeof body.data === 'object') ? body.data : {};
    return { map, dataVersion: body?.dataVersion ?? null, bytes: text.length };
  } catch (e) {
    clearTimeout(t);
    return { map: null, dataVersion: null, bytes: 0 };
  }
}

// E-5(PERF-STAGE2-2E-20260902,Fable 5.1 拍板)—— 上行搶佔緩解:lite 一到手
// 就即刻背景開 `/api/hymns/lyrics`(2.7MB raw)會同用戶撳第一首歌嘅音頻
// 預載爭緊同一條上行(慢網/tunnel 尤其明顯,見 memory 0.65MB/s 上行樽頸)。
// 而家等 `InteractionManager` 判斷「首屏果輪 interaction 做完」之後,再多
// 等 8s(俾第一首歌音頻預載一個頭),先至真正開始打 lyrics endpoint。純
// 背景 fetch,唔影響 lite 已經即畫嘅首屏,`lyrStart` mark 挪咗去延遲之後
// 先落(相對 T0 嘅時間戳,語義不變)。
function waitBeforeLyricsFetch() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    // PERF-FINAL-OPUS §A4.2：runAfterInteractions 理論上可以永遠唔 fire（長期有
    // interaction），加 15s hard cap 堵靜默失效——lyrics fetch 最遲 15s 一定開。
    const cap = setTimeout(finish, 15000);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => { clearTimeout(cap); finish(); }, 8000);
    });
  });
}

// 新 array + 新 object(唔係原地改)——令 HomeScreen/LibraryScreen 嗰啲用
// `hymns` identity 做 dep 嘅 useMemo/memo 喺 lyrics merge 完之後正確重跑。
function mergeLyrics(hymns, lyricsMap) {
  return hymns.map((h) => ({ ...h, lyrics: lyricsMap[h.id] ?? '' }));
}

// C-1 前端 —— 播放器讀歌詞嗰個 race window 用嘅 fallback:lite 已經畫咗、
// 用戶已經撳咗播、`/api/hymns/lyrics` 背景 fetch 仲未 merge 入 hymns array
// 之前,`cur.lyrics`(App.js FullScreenPlayerOverlay)會係 undefined/''。
// 淨係喺 lyrics fetch 成功嗰陣先populate,失敗/`isFull`(冇背景 fetch)嗰啲
// case 唔會有嘢入嚟——嗰啲 case 冇呢個窗口(isFull 嗰刻 hymns 本身已經有
// 齊 lyrics;失敗嗰陣本來就冇 lyrics 好補)。
let lyricsMapStore = {};
export function getLyricsById(id) {
  if (id == null) return '';
  return lyricsMapStore[id] ?? '';
}

// dataVersion cache-bust(SUPERVISION-LOG 2026-07-27 18:00)—— 24 小時內兩單
// 「DB/API 一早啱,App 顯示 MMKV 舊 cache」事故都係因為:開 App 一路都係
// 「照畫 cache + 背景全量 refresh」,冇辦法知 cache 係咪已經過時,亦冇壓力
// 逼佢一定要 refresh。而家用 /api/version(超平,唔讀 DB)嚟判斷:
// version 唔同(或者根本冇存過 version)先做全量 fetch;相同就跳過,慳返
// 每次開 App 都全量拉嘅流量。/api/version 攞唔到(斷網/舊 backend 未部署呢個
// endpoint)就 fallback 返舊行為 —— 無條件背景 refresh,唔可以行為變差。
async function fetchVersion() {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/version`);
    if (!r.ok) return null;
    const body = await r.json();
    return body?.dataVersion ?? null;
  } catch (e) {
    return null;
  }
}

// O1-O2-REPLAN-20260819.md §2.2 —— 呢個 hook 舊版每個 mount instance 都有
// 自己嗰份 useState + useEffect,獨立行足一次 refresh()(MMKV JSON.parse 幾
// MB + /api/version + 可能全量 /api/hymns),App.js 同 MineScreen.js 兩邊各自
// mount 一次,即係開機成套流程行足兩次。舊版(c9bd715)試過改做「module-level
// singleton state + useState 影一份 snapshot + useEffect 補訂閱」嚟慳呢個
// 重複,但呢個 pattern 喺 render 同 effect 之間有窗口:child 喺 parent 訂閱
// 到之前就同步 broadcast 咗,parent 永久錯過(P0,已 revert)。而家改用 React
// 內建 useSyncExternalStore(uSES)—— 佢嘅 mount effect 內部規定咗要對比
// 「render 嗰刻讀到嘅 snapshot」同「而家 store 嘅 snapshot」,唔同就強制
// re-render,呢個窗口喺 React 承諾嘅行為入面已經冚咗。
//
// `refreshKicked` 保證成套 MMKV read + network refresh 全 app 生命週期淨係
// 行一次(第一個掛嘅 hook instance 觸發);之後 mount 嘅 instance 只係加入
// store 訂閱,唔會重複整套流程。
const hymnsStore = createExternalStore({ hymns: null, loading: true });

let refreshKicked = false;

// Admin 寫入完成即刻刷新用(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)——admin API
// response 已經帶埋新 dataVersion,唔使再問一次 /api/version。改完自己部機即時
// 見到;其他裝置跟現有 pull-on-open 機制下次開 app 見到)。
export function notifyHymnsChanged(serverDataVersion) {
  (async () => {
    const s = getStorage();
    const cachedVersion = s ? s.getString('allHymnsVersion') : null;
    if (serverDataVersion != null && cachedVersion === serverDataVersion) return; // 冇改
    const { hymns: fresh, dataVersion } = await fetchAllHymns();
    if (fresh && fresh.length > 0) {
      if (s) {
        s.set('allHymns', JSON.stringify(fresh));
        s.set('allHymnsVersion', dataVersion ?? serverDataVersion ?? '');
      }
      hymnsStore.setState({ hymns: fresh });
    }
  })().catch(() => {});
}

function kickRefreshOnce() {
  if (refreshKicked) return; // singleton 已經有第一個 instance 行緊/行完
  refreshKicked = true;

  const s = getStorage();

  // Try MMKV cache first (non-blocking — even if MMKV fails, we show content)
  let cachedVersion = null;
  let hadCache = false;
  if (s) {
    try {
      mark('mmkvReadStart');
      const cached = s.getString('allHymns');
      mark('mmkvReadEnd');
      if (cached) {
        mark('parseStart');
        const parsed = JSON.parse(cached);
        mark('parseEnd');
        if (Array.isArray(parsed) && parsed.length > 0) {
          note('hymnsCount', parsed.length);
          hymnsStore.setState({ hymns: parsed });
          hymnsStore.setState({ loading: false });
          mark('cacheReady');
          hadCache = true;
        }
      }
      cachedVersion = s.getString('allHymnsVersion') || null;
    } catch (e) {}
  }
  // 冇 cache(新裝 / 清咗 data)就唔可以即刻收 loading——首頁淨係睇
  // hymns.length 嚟判斷「網絡斷咗」(HomeScreen.js),loading 一早收咗
  // 會令個「攞緊緊」窗口睇落好似「已經攞完 = 冇網」,喺網絡正常都會
  // 閃一嘢錯誤畫面。要等第一次網絡攞到結果(成功或者真係失敗)先收。

  async function refresh() {
    mark('verStart');
    const serverVersion = await fetchVersion();
    mark('verEnd');

    // 冇 cache 嘅時候一定要做一次全量 fetch,唔可以因為 version 啱就 skip
    // ——嗰個 skip 係「慳流量」用嘅,前提係已經有嘢喺畫面度顯示緊。
    const canSkip = hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion;
    note('verSkip', canSkip ? 1 : 0);
    if (!canSkip) {
      mark('hymnsStart');
      const primary = await fetchPrimaryHymnsWithRetry();
      mark('hymnsEnd');
      if (primary.hymns && primary.hymns.length > 0) {
        note('hymnsCount', primary.hymns.length);
        // C-1 前端(A-6)—— 即刻用 lite(或者舊 backend fallback 嘅 full)版
        // 畫面,唔等 lyrics 到先畫。
        hymnsStore.setState({ hymns: primary.hymns });
        if (!hadCache) hymnsStore.setState({ loading: false });

        if (primary.isFull) {
          // 舊 backend(C-1 未 restart)—— `?lite=1` 俾佢忽略咗,response 本
          // 身已經帶齊 lyrics,冇嘢好合併,直接當合併完成寫 MMKV。
          note('merged', 1);
          if (s) {
            s.set('allHymns', JSON.stringify(primary.hymns));
            s.set('allHymnsVersion', primary.dataVersion ?? serverVersion ?? '');
          }
        } else {
          await waitBeforeLyricsFetch(); // E-5 — 俾第一首歌音頻預載一個頭
          mark('lyrStart');
          const lyr = await fetchLyricsMap();
          mark('lyrEnd');
          note('lyrBytes', lyr.bytes || 0);
          if (lyr.map) {
            // 兩個 fetch 嘅 dataVersion 唔同 = 中途 DB 改咗(歌詞班/admin 寫
            // 入撞正呢個窗口)——以 lite 嗰個為準照合併,唔重新攞。
            if (primary.dataVersion != null && lyr.dataVersion != null && primary.dataVersion !== lyr.dataVersion) {
              note('lyrVerMismatch', 1);
            }
            Object.assign(lyricsMapStore, lyr.map);
            const merged = mergeLyrics(primary.hymns, lyr.map);
            note('merged', 1);
            hymnsStore.setState({ hymns: merged });
            if (s) {
              s.set('allHymns', JSON.stringify(merged));
              s.set('allHymnsVersion', primary.dataVersion ?? serverVersion ?? '');
            }
          } else {
            // lyrics fetch 失敗(斷網 / 404 = 舊 backend 冇呢條 route)——照存
            // lite 版落 MMKV,但**唔寫** allHymnsVersion,逼落次開 App(version
            // 對唔上 cachedVersion)會再全套嘗試多一次。
            //
            // E-5 P0(PERF-STAGE2-2E-20260902,Opus 5 2D 驗收發現)—— 呢個
            // 意圖有個窿:「唔寫」淨係代表**呢次**冇 set 新值,但 MMKV 入面
            // 好可能仲存住**舊嘅** `allHymnsVersion`(上次成功 merge 留低嘅)。
            // 落次開 App:`cachedVersion` 讀到嗰個舊值,`serverVersion`
            // 攞新鮮嘅——如果呢段時間 DB 冇改過(冇新 dataVersion),兩者
            // 相等 ⇒ `canSkip=true` ⇒ 永久 skip 網絡、永久卡喺 lite-only
            // (冇歌詞),直到 DB 版本先至變。要真正逼到落次一定會重試,一定
            // 要主動刪走呢個 key,唔可以淨係「唔寫新值」。
            note('merged', 0);
            note('lyricsFail', 1);
            if (s) {
              s.set('allHymns', JSON.stringify(primary.hymns));
              s.delete('allHymnsVersion');
            }
          }
        }
      } else if (!hadCache) {
        hymnsStore.setState({ loading: false });
      }
    }
    if (!hadCache) hymnsStore.setState({ loading: false });
  }

  refresh().catch(() => { if (!hadCache) hymnsStore.setState({ loading: false }); });
}

export const useCachedHymns = () => {
  const { hymns, loading } = hymnsStore.useStore();
  useEffect(() => { kickRefreshOnce(); }, []); // 第一個 mount 嘅 instance kick
  return { hymns: hymns || [], loading }; // API 對外完全不變
};
