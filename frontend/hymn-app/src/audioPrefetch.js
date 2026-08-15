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

// songId(string) -> local file:// uri。淨係喺 iOS + 初始化完成先有嘢。
const index = new Map();
let ready = false;
let initPromise = null;

// 落載隊列:同一時間最多 1 條(唔想同播緊嗰首爭頻寬)。
const downloadQueue = [];
let currentDownloadId = null;

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
// 只喺 session 內生效(重開 app 清零),最壞情況係 cache 短暫超 cap,可接受。
const touchedThisSession = new Set();

// 同步查——播放器建隊列嗰刻要即刻知有冇本地檔,唔可以等 async。
export function getLocalUri(songId) {
  if (Platform.OS !== 'ios' || !ready || songId == null) return null;
  const uri = index.get(String(songId)) || null;
  if (uri) touchedThisSession.add(String(songId));
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
  try {
    const url = `${API_BASE}/api/stream/${songId}`;
    const response = await fetch(url);
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
    const buf = await response.arrayBuffer();
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
    touchedThisSession.add(String(songId)); // 啱啱落載完,一定就快用,prune 唔准掂
    notifyComplete(String(songId), finalFile.uri);
    prune();
  } catch (e) {
    diagFail(songId, e?.message || 'exception');
    try { if (partFile.exists) partFile.delete(); } catch (_) {}
  }
}

function processQueue() {
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
  if (currentDownloadId === id || downloadQueue.includes(id)) return;
  downloadQueue.push(id);
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
