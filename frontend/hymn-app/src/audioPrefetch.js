// IOS-ANDROID-PARITY-PLAN.md §5 Phase 2 — iOS 本地音頻預載。
//
// 目的:iOS 冇 ExoPlayer 嗰種伺服器端「暖」就夠嘅底,轉歌延遲主要嚟自
// AVPlayer 要重新起 HTTP connection。方案 A:App 自己落載緊接落嚟嘅
// 一兩首去 documentDirectory,播嗰陣直接用 file:// URI,徹底跳過網絡。
//
// ⚠️ 呢個 module 會俾 App.js 喺 **module 頂層 `import`**(冇 native 依賴,
// 純 JS,Android 一樣 safe)。但入面用到嘅 `expo-file-system` 就完全唔同
// 講法——嗰個先係 native module。Android 而家仲收緊 runtime-4 嘅舊 APK
// (冇呢個 native module),如果呢度 top-level `import`/`require`
// expo-file-system,新 JS bundle 一到 Android 就會即刻 throw / 冧 app。
// 所以規矩係:
//   1. expo-file-system 淨係喺 `getFS()` 入面先 `require()`,而 `getFS()`
//      淨係俾 `Platform.OS === 'ios'` 嘅 call site 叫。
//   2. 每個 export 函數第一行都自己再 check 一次 `Platform.OS`,即使
//      call site 理論上已經 gate 咗——雙重保險,呢個 module 唔應該假設
//      caller 冇漏 gate。
//   3. 任何 expo-file-system 用唔到(require 爆、native module 冧咗)嘅
//      情況,全部 swallow 咗當呢個功能唔存在,永遠唔准掟出去炸 caller。
//
// runtimeVersion 決策(見 app.json):加呢個 native module 令新 JS bundle
// 同舊 native build 唔相容,所以淨係將 `ios.runtimeVersion` 由 "4" 升做
// "5"——iOS 一定要等新 TestFlight build 先收呢輪 OTA。Android 冇加任何
// native 行為,`android` 冇覆寫,繼續食頂層 "4",APK vc54 完全唔受影響。

import { Platform } from 'react-native';
import { API_BASE } from './config.js';

const CACHE_SUBDIR = 'audio-cache';
const MIN_BYTES = 200 * 1024; // 200KB — 太細多數係 backend 錯誤頁/半頁
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300MB
const MAX_FILES = 60;
const PART_SUFFIX = '.part';
const FINAL_SUFFIX = '.m4a';
// BATCH5 S4:半死連線(socket 開住零 bytes)冇呢個 timeout 會令
// currentDownloadId 永遠唔清,成個 session 預載全滅。
const DOWNLOAD_TIMEOUT_MS = 90 * 1000;

// ── 長檔閘(INSTRUMENTAL-CATEGORY-PLAN §6 P0 / Phase 3a)──────────────
// 成套預載嘅單一假設係「一首歌 3-8MB」(backend resolveAudio.js:322 原文)。
// 純音樂 tab 一開,soaking / 鋼琴靈修呢類長片就有咗高流量入口(#739 = 57:58
// ≈ 57MB、#4820 = 25:48 ≈ 25MB),而呢個 module 落載係:
//   90 秒 timeout → 落唔切就 abort → 冇失敗記憶 → **每次開 App 重試一次**,
//   每次白燒幾十 MB 流量;而且 arrayBuffer() + Uint8Array 兩份一齊入 JS heap,
//   長檔峰值上到 100MB+,jetsam 高危。
// 所以超過閾值嘅歌**唔做本地全檔預載**,行返 streaming 冷路徑(佢本身一直
// 都係咁播,唔會變差)。閾值跟 §8 Q2 拍板嘅新歌上限:10 分鐘。
const MAX_PREFETCH_SECONDS = 10 * 60;

// songId(string) -> 秒數。由 App.js 喺攞到歌單之後 call setDurationIndex()
// 灌落嚟 —— prefetch() 四個 call site 有兩個淨係揸住 id(module-level 嘅
// tomorrowHeadIds / boot preloadIds),與其逐個 call site 各自 parse 一次
// duration(漏一個就等於冇閘),不如喺 prefetch() 呢個唯一收口位一次過查。
const durationSecById = new Map();

// "M:SS"(純分鐘制,62:30 = 62 分 30 秒)同 "H:MM:SS" 都收。parse 唔到回 null。
// ⚠️ 回 null = **唔知**,唔等於「短」—— 見 prefetch() 入面點處理。
export function parseDurationSec(text) {
  if (typeof text === 'number' && Number.isFinite(text)) return text > 0 ? text : null;
  if (typeof text !== 'string') return null;
  const parts = text.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  let sec = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    sec = sec * 60 + Number(p);
  }
  return sec > 0 ? sec : null;
}

// App.js 攞到 /api/hymns(或者 MMKV cache)之後 call 一次;之後個庫 background
// refresh 咗再 call 一次都得(idempotent,直接覆蓋)。Android 都 call 得,
// 呢個函數冇 native 依賴 —— 但 prefetch() 本身喺 Android 係 no-op。
export function setDurationIndex(songs) {
  if (!Array.isArray(songs)) return;
  for (const h of songs) {
    if (h == null || h.id == null) continue;
    const sec = parseDurationSec(h.duration);
    if (sec != null) durationSecById.set(String(h.id), sec);
  }
}

// songId(string) -> local file:// uri。淨係喺 iOS + 初始化完成先有嘢。
const index = new Map();
let ready = false;
let initPromise = null;

// 落載隊列:同一時間最多 1 條(唔想同播緊嗰首爭頻寬)。
const downloadQueue = [];
let currentDownloadId = null;
// Phase 2.5 —— 落載中嘅 fetch 嘅 AbortController。用戶撳 play 嗰首啱啱好
// 落載緊嗰陣,即刻 abort,唔准背景落載同即場串流爭網絡(嗰刻串流先係
// 用戶聽緊/等緊嘅嘢,落載讓路;首歌下次做「即將播放」時自然再排隊)。
let currentAbortController = null;
// PHASE2.5-PRELOAD-PLAN §4 W2-2 —— 「用戶聽得到嘅串流永遠大過背景落載」。
// 起播嗰首冇本地檔(即係就嚟行串流)嗰陣,唔止 cancel 佢自己,而係成條背景
// 落載隊列都停低讓路:弱網之下背景搶緊 6MB 頻寬,會令本來 9.6s 嘅串流更慢,
// 即係「做咗 Phase 2.5 反而令 miss case 衰咗」。呢個 flag 一 set,processQueue
// 就唔開新嘅;被踢走嗰批記喺 pausedIds,等真係出咗聲(App.js 喺 state=Playing
// 度 call resumeQueue())先重新排。
let paused = false;
let pausedIds = [];
// 安全網:如果首歌永遠去唔到 Playing(load 失敗/用戶即刻撳走),冇呢個
// timer 就成個 session 唔會再落載到任何嘢。夠鐘就自己恢復。
let resumeTimer = null;
const AUTO_RESUME_MS = 30 * 1000;

// 落載完成通知(App.js 用嚟做隊列熱換)。
const completeListeners = new Set();

let _fsCache = null;
let _cacheDirCache = null;

// 淨係俾 iOS-only call site 用。攞唔到就掟錯,由 caller try/catch 食咗。
function getFS() {
  if (_fsCache) return _fsCache;
  // eslint-disable-next-line global-require
  const mod = require('expo-file-system');
  if (!mod || !mod.File || !mod.Directory || !mod.Paths) {
    throw new Error('expo-file-system module shape unexpected');
  }
  _fsCache = mod;
  return _fsCache;
}

// 版權合規(Eric 2026-08-15 明確要求):快取檔一定要對外完全隱藏——用戶、
// 其他 App、電腦、備份全部唔可以搵到/攞到。所以放 Library/Caches
// (Paths.cache),唔係 Documents(Paths.document):
//   - Caches 預設排除喺 iCloud/電腦備份之外(Documents 預設會被備份,
//     即係音訊檔可以由 backup 抽返出嚟——唔合規,呢個就係由 Documents
//     搬過嚟嘅原因);
//   - 就算第日有人手多開咗 UIFileSharingEnabled,曝露嘅都只係 Documents,
//     Caches 永遠唔會出現喺「檔案」App/Finder;
//   - 代價:iOS 儲存空間緊張時可以自行清走 Caches——啱啱好,呢個本來
//     就係快取,boot scan 會重建 index,冇咗咪再落載過。
// 刪 App 時成個沙箱(連 Caches)即刻清晒。Android 冇本地快取(全 module
// iOS-only),自動合規。
function getCacheDir() {
  if (_cacheDirCache) return _cacheDirCache;
  const { Directory, Paths } = getFS();
  const dir = new Directory(Paths.cache, CACHE_SUBDIR);
  if (!dir.exists) {
    try { dir.create(); } catch (_) {}
  }
  _cacheDirCache = dir;
  return dir;
}

// 一次性遷移:build 9 初版(2b6c53e)曾經將快取放咗喺 Documents,Eric 部機
// 上已經有檔。搬晒去 Caches 再剷走舊目錄——唔遷移嘅話,舊檔會一直留喺
// Documents 度被備份,合規等於冇修。冪等:舊目錄唔存在就咩都唔做。
function migrateLegacyDocumentsDir() {
  try {
    const { File, Directory, Paths } = getFS();
    const legacy = new Directory(Paths.document, CACHE_SUBDIR);
    if (!legacy.exists) return;
    const dest = getCacheDir();
    for (const entry of legacy.list()) {
      try {
        const name = entry.name || '';
        if (name.endsWith(FINAL_SUFFIX) && entry instanceof File) {
          const target = new File(dest, name);
          if (target.exists) { entry.delete(); continue; }
          entry.move(target);
        } else {
          entry.delete(); // .part 殘件/雜物直接清
        }
      } catch (_) {}
    }
    try { legacy.delete(); } catch (_) {}
  } catch (_) {}
}

function idFromFinalName(name) {
  return name.endsWith(FINAL_SUFFIX) ? name.slice(0, -FINAL_SUFFIX.length) : name;
}

// 同 App.js 嘅 logDiag() 一樣寫法(fire-and-forget,唔 await、唔 retry,
// 診斷本身唔可以拖累/整壞落載)。故意喺呢度自己另寫一份細版,唔跨檔案
// export 私有 helper,保持呢個 module 完全自足、Android 冇任何耦合。
function diagFail(songId, detail) {
  try {
    fetch(`${API_BASE}/api/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'prefetchFail',
        clientTs: new Date().toISOString(),
        hymnId: songId,
        detail,
      }),
    }).catch(() => {});
  } catch (_) {}
}

// boot scan:建 in-memory index + 清走上次冇落載完嘅 .part 垃圾。
// 冪等、可以隨時再 call(downloadOne 會順手再 call 一次確保 dir 已 ready)。
export function initCache() {
  if (Platform.OS !== 'ios') return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      migrateLegacyDocumentsDir(); // 合規遷移先行,scan 先會見到搬過嚟嘅檔
      const dir = getCacheDir();
      const entries = dir.exists ? dir.list() : [];
      for (const entry of entries) {
        try {
          const name = entry.name || '';
          if (name.endsWith(PART_SUFFIX)) {
            // 上次冧app/被殺留低嘅半成品——半成品永遠唔准俾播放器見到。
            entry.delete();
          } else if (name.endsWith(FINAL_SUFFIX)) {
            index.set(idFromFinalName(name), entry.uri);
          }
        } catch (_) {}
      }
      ready = true;
      prune();
    } catch (_) {
      // expo-file-system 用唔到(native module 冧咗/未連上)——整個功能
      // 靜靜哋停用,getLocalUri 會永遠回 null,行為等於冇裝呢個 module。
      ready = false;
    }
  })();
  return initPromise;
}

// Fable5 review 補(2026-08-14)—— prune 保護名單:本 session 內俾
// getLocalUri() 命中過(即係可能已經變咗隊列入面嘅 file:// URL)或者啱啱
// 落載完嘅 id,prune 唔准剷。否則舊歌重播+cache 頂 cap 嗰陣,LRU 有機會
// 刪走 AVPlayer 打開緊/排緊隊嘅檔,搞出一單本可避免嘅 PlaybackError+跳歌。
// 只喺 session 內生效(重開 app 清零),而家真係短暫超 cap,唔再單向增長
// (BATCH5 O5:bounded LRU,Set 保留插入順序,delete+add 就係 touch)。
const touchedThisSession = new Set();
const TOUCHED_MAX = 12; // 夠冚「播緊嗰首 + 隊列下 2 首 + 聽日 2 首」有突
function touch(id) {
  touchedThisSession.delete(id);
  touchedThisSession.add(id);
  while (touchedThisSession.size > TOUCHED_MAX) {
    touchedThisSession.delete(touchedThisSession.values().next().value);
  }
}

// 同步查——播放器建隊列嗰刻要即刻知有冇本地檔,唔可以等 async。
export function getLocalUri(songId) {
  if (Platform.OS !== 'ios' || !ready || songId == null) return null;
  const uri = index.get(String(songId)) || null;
  if (uri) touch(String(songId));
  return uri;
}

function notifyComplete(songId, uri) {
  completeListeners.forEach((cb) => {
    try { cb(songId, uri); } catch (_) {}
  });
}

// App.js 訂閱呢個嚟做隊列熱換(落載完成 → 換走隊列入面對應 index 嘅
// stream track object)。回傳 unsubscribe。
export function onPrefetchComplete(cb) {
  if (typeof cb !== 'function') return () => {};
  completeListeners.add(cb);
  return () => completeListeners.delete(cb);
}

// ⚠️ 2026-08-23 模擬器實錘(PHASE2.5 §8.1 場景 B 第 3 次重跑):`controller.abort()`
// 之後,Expo 個 fetch/arrayBuffer 嘅 promise **唔一定** settle —— 三次重跑入面
// 有一次係完全冇 reject:`downloadOne` 永遠停喺 await 度 → 條 finally 冇行 →
// `currentDownloadId` 永遠唔清 → `processQueue()` 頭嗰句就 return,成個 session
// 之後再冇任何預載(同 BATCH5 S4「半死連線」同一 class,但今次係 abort 路徑,
// 90 秒 timeout 都救唔到:個 request 已經 abort 咗,再 abort 一次乜都唔會發生)。
//
// 呢個 hazard 喺 W2-2 之前就已經存在(`cancelIfDownloading()` 一樣係 abort),
// 只不過 W2-2 令 abort 由「偶然」變成「用戶每次撳串流歌都會發生」,所以一定要修。
//
// 修法:唔靠底層 promise settle,自己同 abort signal 賽跑。一 abort 就即刻掟
// AbortError 落 catch,行返 finally 清 currentDownloadId。底層個 promise 就算
// 之後先 settle 都冇人理(race 已經幫兩邊都掛咗 handler,唔會 unhandled rejection)。
function abortRace(controller, promise) {
  if (!controller || !controller.signal) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const fire = () => {
        const err = new Error('aborted-by-controller');
        err.name = 'AbortError';
        reject(err);
      };
      try {
        if (controller.signal.aborted) { fire(); return; }
        if (typeof controller.signal.addEventListener === 'function') {
          controller.signal.addEventListener('abort', fire, { once: true });
        } else {
          const prev = controller.signal.onabort;
          controller.signal.onabort = (ev) => {
            try { if (typeof prev === 'function') prev(ev); } catch (_) {}
            fire();
          };
        }
      } catch (_) { /* 掛唔到就退化返舊行為,唔可以喺呢度炸 */ }
    }),
  ]);
}

async function downloadOne(songId) {
  await initCache();
  let File;
  try {
    ({ File } = getFS());
  } catch (_) {
    return;
  }
  const dir = getCacheDir();
  const partFile = new File(dir, `${songId}${PART_SUFFIX}`);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  currentAbortController = controller;
  // BATCH5 S4:半死連線(socket 開住零 bytes)會令 fetch/arrayBuffer 永遠唔
  // resolve,currentDownloadId 永遠唔清,成個 session 預載全滅。呢個 timer
  // 要冚埋 await response.arrayBuffer()(半死連線正正係卡喺 body 度),
  // 喺 fetch 之前開波,finally 先 clearTimeout。controller===null 嘅環境
  // (AbortController 唔存在)就唔加 timeout,行為照舊——防禦分支。
  let timedOut = false;
  const timeoutId = controller
    ? setTimeout(() => { timedOut = true; try { controller.abort(); } catch (_) {} }, DOWNLOAD_TIMEOUT_MS)
    : null;
  try {
    const url = `${API_BASE}/api/stream/${songId}`;
    const response = await abortRace(controller, fetch(url, controller ? { signal: controller.signal } : undefined));
    if (!response || response.status !== 200) {
      diagFail(songId, `status=${response ? response.status : 'none'}`);
      return;
    }
    const contentType = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
    // backend 對 AppleCoreMedia UA 已經有 502 攔截 webm/opus,但呢度嘅 fetch
    // UA 唔同,要自己驗一次——iOS 播唔到呢啲格式(-11828 實證 hymn 7511)。
    if (/webm|opus/i.test(contentType)) {
      diagFail(songId, `badType=${contentType}`);
      return;
    }
    const buf = await abortRace(controller, response.arrayBuffer());
    if (!buf || buf.byteLength < MIN_BYTES) {
      diagFail(songId, `tooSmall=${buf ? buf.byteLength : 0}`);
      return;
    }
    if (partFile.exists) { try { partFile.delete(); } catch (_) {} }
    partFile.create();
    partFile.write(new Uint8Array(buf));
    // 半成品永遠唔准俾播放器見到——成功寫完 .part 先改名做 .m4a。
    const finalFile = new File(dir, `${songId}${FINAL_SUFFIX}`);
    if (finalFile.exists) { try { finalFile.delete(); } catch (_) {} }
    await partFile.move(finalFile);
    index.set(String(songId), finalFile.uri);
    touch(String(songId)); // 啱啱落載完,一定就快用,prune 唔准掂
    notifyComplete(String(songId), finalFile.uri);
    prune();
  } catch (e) {
    // 被 cancelIfDownloading() 主動 abort 唔算失敗——係設計行為,只留一條
    // 輕量 diag 供核實機制有冇郁,唔好同真失敗撈亂。timedOut 要先判斷,
    // 同用戶主動 cancel 分開,唔好污染診斷。
    // ⚠️ 唔可以淨係認 `AbortError`/「abort」:Expo 嘅 fetch polyfill 掟出嚟嘅係
    // `FetchRequestCanceledException: Fetch request has been canceled`(2026-08-23
    // 模擬器實錘),name 唔係 AbortError、message 亦冇 "abort" 呢個字,結果主動
    // 讓路會被當成真失敗上報,診斷數就冇得分「機制有郁」定「真係落載失敗」。
    const abortMsg = String((e && (e.message || e.name)) || '');
    const aborted = e && (e.name === 'AbortError' || /abort|cancel/i.test(abortMsg));
    diagFail(songId, timedOut ? 'timeout' : (aborted ? 'aborted-for-stream' : (e?.message || 'exception')));
    try { if (partFile.exists) partFile.delete(); } catch (_) {}
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (currentAbortController === controller) currentAbortController = null;
  }
}

function processQueue() {
  if (paused) return;            // W2-2:讓路俾即場串流,等 resumeQueue() 先開波
  if (currentDownloadId) return; // 同一時間最多 1 條落載
  const id = downloadQueue.shift();
  if (id == null) return;
  if (index.has(id)) { processQueue(); return; } // 落載緊嗰陣已經有第二個 caller 攞到
  currentDownloadId = id;
  // Fable5 review 補:downloadOne 內部大部分路徑自己食咗錯,但 getCacheDir()/
  // new File() 喺佢個 try 之外,throw 落嚟呢度要兜住,唔准漏 unhandled rejection。
  downloadOne(id).catch(() => {}).finally(() => {
    currentDownloadId = null;
    processQueue();
  });
}

// 落載去 .part → 驗 HTTP 200 + size >= 200KB + content-type 唔係
// webm/opus → 先改名做 .m4a。失敗靜靜哋放棄(唔 retry loop,下次轉歌
// 事件自然再觸發)。同一時間最多 1 條落載,呢度用 module-level queue 排。
export function prefetch(songId) {
  if (Platform.OS !== 'ios' || songId == null) return;
  const id = String(songId);
  if (index.has(id)) return;
  // §6 P0 長檔閘:知道佢長過 10 分鐘先至擋。查唔到 duration(未 call
  // setDurationIndex / 歌 duration 係 NULL)就照舊落載 —— 「唔知」唔可以
  // 當「長」,否則 index 未灌好嗰個窗口會靜靜哋令成個預載功能熄火。
  const sec = durationSecById.get(id);
  if (sec != null && sec > MAX_PREFETCH_SECONDS) return;
  if (currentDownloadId === id || downloadQueue.includes(id)) return;
  downloadQueue.push(id);
  processQueue();
}

// Phase 2.5 —— 用戶撳咗 play 嘅歌啱啱好背景落載緊:即刻中止,讓路俾即場
// 串流。排緊隊未開始嘅一併踢走。已落載完成嘅(index 有)唔受影響。
export function cancelIfDownloading(songId) {
  if (Platform.OS !== 'ios' || songId == null) return;
  const id = String(songId);
  const qi = downloadQueue.indexOf(id);
  if (qi >= 0) downloadQueue.splice(qi, 1);
  // W2-2:被 pauseAllForStream() 收起嗰批都要踢,唔係播緊/啱啱播完嗰首會
  // 喺 resumeQueue() 嗰刻先復活,同「讓路」個原意撞。
  const pi = pausedIds.indexOf(id);
  if (pi >= 0) pausedIds.splice(pi, 1);
  if (currentDownloadId === id && currentAbortController) {
    try { currentAbortController.abort(); } catch (_) {}
  }
}

// PHASE2.5-PRELOAD-PLAN §4 W2-2 —— 無條件讓路:abort 落載緊嗰條 + 清空隊列,
// 被踢嘅 id 記低,等 resumeQueue() 先重新排。冪等(連續 call 唔會沖走 pausedIds)。
// 回傳被踢嘅 id 陣列,方便 caller 記 log。
export function pauseAllForStream() {
  if (Platform.OS !== 'ios') return [];
  const kicked = [];
  if (currentDownloadId != null) kicked.push(String(currentDownloadId));
  for (const id of downloadQueue) kicked.push(String(id));
  downloadQueue.length = 0;
  paused = true;
  for (const id of kicked) if (!pausedIds.includes(id)) pausedIds.push(id);
  if (currentAbortController) {
    // abort 之後 downloadOne 條 finally 會 call 返 processQueue(),嗰陣 paused
    // 已經係 true,所以唔會即刻又開新一條 —— 次序唔可以掉轉。
    try { currentAbortController.abort(); } catch (_) {}
  }
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { resumeTimer = null; resumeQueue(); }, AUTO_RESUME_MS);
  return kicked;
}

// 恢復背景落載。被踢走嗰批排喺**最後**——中間新排入嚟嘅(例如 trackChanged
// 嘅「下 2 首」)先係最等錢使嗰啲,唔可以俾舊嘢插佢隊。
export function resumeQueue() {
  if (Platform.OS !== 'ios') return;
  if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  paused = false;
  const restore = pausedIds;
  pausedIds = [];
  for (const id of restore) {
    if (index.has(id)) continue;
    // ⚠️ 呢度**唔可以**用 `currentDownloadId === id` 做去重條件。abort() 係
    // async:pause 之後即刻 resume(例如用戶撳完即刻又撳第二首)嗰陣,被 abort
    // 嗰條嘅 finally 仲未行到,currentDownloadId 仲係佢——咁樣就會將佢當成
    // 「仲落載緊」跳過,結果永遠冇人落載佢(scratch harness T6 實錘)。
    // pausedIds 入面全部都係已經被踢走嘅 id,照排返入去就啱;真係撞到同一個 id
    // 又落載緊,processQueue() 開波前嗰句 index.has() 會擋住,唔會落載兩次。
    if (downloadQueue.includes(id)) continue;
    downloadQueue.push(id);
  }
  processQueue();
}

// 本地檔 PlaybackError 用:剷檔 + 從 index 移除,令 retry/skip 跌返串流
// (下次 toTrack()/prefetch() 唔會再摸到呢個壞檔)。
export function invalidate(songId) {
  if (Platform.OS !== 'ios' || songId == null) return;
  const id = String(songId);
  index.delete(id);
  try {
    const { File } = getFS();
    const dir = getCacheDir();
    const f = new File(dir, `${id}${FINAL_SUFFIX}`);
    if (f.exists) f.delete();
  } catch (_) {}
}

// LRU cap:300MB 或 60 個檔,先到先算。boot 時行一次,每次落載成功後
// 都順手行一次(唔等到下次開機先清,長開 app 都唔會爆盤)。
function prune() {
  try {
    const { File } = getFS();
    const dir = getCacheDir();
    if (!dir.exists) return;
    const entries = dir.list().filter((e) => {
      try { return e instanceof File && (e.name || '').endsWith(FINAL_SUFFIX); } catch (_) { return false; }
    });
    const sized = entries.map((entry) => {
      let size = 0;
      let mtime = 0;
      try { size = entry.size || 0; } catch (_) {}
      try { mtime = entry.lastModified || 0; } catch (_) {}
      return { entry, size, mtime };
    });
    sized.sort((a, b) => a.mtime - b.mtime); // 舊嘅先(LRU 先剷)
    let total = sized.reduce((s, x) => s + x.size, 0);
    let count = sized.length;
    for (let i = 0; i < sized.length && (count > MAX_FILES || total > MAX_TOTAL_BYTES); i++) {
      const { entry, size } = sized[i];
      try {
        const name = entry.name || '';
        if (touchedThisSession.has(idFromFinalName(name))) continue; // 保護名單,見上面
        entry.delete();
        index.delete(idFromFinalName(name));
        total -= size;
        count -= 1;
      } catch (_) {}
    }
  } catch (_) {}
}
