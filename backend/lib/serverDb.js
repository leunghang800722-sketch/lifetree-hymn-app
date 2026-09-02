// lib/serverDb.js — server 讀取用嘅 hymns.db in-memory 副本(單一模組)。
// (MEMBERSHIP-PHASE2-ADMIN-PLAN §3.3)
//
// 之前 server.js 同 routes/home.js 各自有一份一模一樣嘅 lazy-loader,
// admin 寫入之後想令 App 即刻見到新嘢,冇一個統一嘅地方可以「清一份、兩邊都
// 生效」——漏一份就會出現「詩歌庫改咗、首頁未改」呢類半生熟狀態。合併做
// 一份 singleton,server.js/home.js 都改用呢個模組,reloadDb() 一 call 兩邊
// 齊清。
//
// dataVersion(App cache-bust 機制,見 useCachedHymns.js)一齊搬過嚟:
// admin 寫完 hymns.db,呢個模組嘅 reloadDb() 會攞 hymns.db 最新嘅 mtime+size
// 重新計一次,唔重算嘅話 App 端 MMKV 永遠唔知要 refetch。

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, '..', 'hymns.db');

function computeDataVersion() {
  try {
    const stat = fs.statSync(DB_PATH);
    return `${stat.mtimeMs}-${stat.size}`;
  } catch (e) {
    return String(Date.now()); // DB 都讀唔到就用開機時間頂住,唔好爆
  }
}

let dbPromise = null;
let dataVersion = computeDataVersion();

// Lazy-load DB on first request(同舊版 server.js/home.js 個 getDb() 一樣嘅行為)。
export async function getDb() {
  if (!dbPromise) {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(DB_PATH);
    dbPromise = new SQL.Database(buffer);
  }
  return dbPromise;
}

export function getDataVersion() {
  return dataVersion;
}

// admin 寫入 hymns.db 完(lib/adminHymns.js)一定要 call 呢個 —— dbPromise
// 清咗,下一個 request 嘅 getDb() 會由碟開新鮮副本;dataVersion 同時重算,
// App 端先知要 refetch(§3.3 大註解:呢個係成件事嘅膊頭位)。
export function reloadDb() {
  dbPromise = null;
  dataVersion = computeDataVersion();
}

// PERF-STAGE2-2C-20260902 C-4 —— out-of-process writer(夜晚 growLibrary/
// fetchLyrics job、admin 一次性 script 直接改 hymns.db)追檔。上面
// `reloadDb()` 淨係 in-process admin 寫入路徑(lib/adminHymns.js)會
// call——夜晚 job 由**另一個 process** 寫檔,backend 完全見唔到
// (PERF-STAGE2-2A-OPUS-20260902.md §1.3 實測:live process 嘅 dataVersion
// 落後真檔 10.86 鐘頭)。而家嘅事實係「唯一令 backend 見到新歌嘅方法 =
// restart」。`maybeReload()` 補呢個窿:淨係一次 `statSync`(<0.1ms),唔會
// 每個 request 都去讀成個 61MB DB。
//
// 安全性建基於 `lib/hymnDb.js` 現存兩個性質(冇改過呢個檔,淨係讀):
//   (a) `saveDb()` 用 `writeFileSync(tmp)` + `renameSync(tmp, DB_PATH)`
//       寫——`rename` 係 atomic 嘅,`stat` 一見到新 mtime/size 就實一係
//       完整嘅新版本,唔會見到寫到一半嘅碎片。
//   (b) 所有跨 process 寫手(夜晚 job / admin script)由 `acquireDbLock()`
//       到成個 run 嘅所有 `saveDb()` 做完至先 `releaseDbLock()`,lock 檔
//       (`hymns.db.lock`)全程存在——`LOCK_STALE_MS`/`LOCK_HARD_STALE_MS`
//       嗰套搶鎖邏輯淨係用喺鎖持有者死咗嘅情況,唔影響呢度嘅判斷。
// 判斷邏輯:
//   1. 新 `statSync` 同而家嘅 `dataVersion` 一樣 → 常態,乜都唔做。
//   2. 唔一樣,但 lock 檔存在 → writer 中途(有可能啱啱好 rename 緊),
//      唔敢信呢個 stat,等落次 request 再驗一次(唔會落後太耐,下一個
//      `/api/version`/`/api/hymns` 就會再試)。
//   3. 唔一樣,而且 lock 檔唔存在 → writer 已經做完,安全 `reloadDb()`。
// ⚠️ 呢個假設如果第日有 writer 唔跟 (a)/(b)(例如直接
// `writeFileSync(DB_PATH)` 唔攞鎖)就會失效——冇再加第二重保護,刻意keep
// 呢個函數淨係做呢一個判斷,方便獨立驗證/覆核。
const LOCK_PATH = `${DB_PATH}.lock`;

export function maybeReload() {
  let fresh;
  try {
    fresh = computeDataVersion();
  } catch (e) {
    return; // stat 都攞唔到,維持現狀,唔好爆
  }
  if (fresh === dataVersion) return; // 常態:檔案冇變
  let lockExists;
  try {
    lockExists = fs.existsSync(LOCK_PATH);
  } catch (e) {
    return; // 判斷唔到 lock 狀態,保守唔 reload
  }
  if (lockExists) return; // writer 中途,唔好讀半桶水
  reloadDb();
}
