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
//
// PERF-STAGE2-2C-20260902-C6-OPUS §4.3 保留一(已修)—— in-flight dedupe。
// 呢個變量叫 `dbPromise`,但改之前存嘅其實**唔係 promise 係 Database
// object**,而且要兩個 `await` 之後先賦值(`await initSqlJs()` 再
// `fs.readFileSync(61MB)`)。Opus 5 實測:同一個 event-loop turn 落到嘅
// 並發 request(boot 嗰刻、或者兩條 socket 嘅 data 啱啱好落喺同一個
// poll batch)會全部見到 `dbPromise` 仲係 `null`,各自再 `readFileSync`
// 61MB + 起一份 `new SQL.Database`——C-4 之前呢個窗口幾乎唔會撞到(得
// admin in-process 寫入先觸發 reload),C-4 之後夜晚 job 每次 `saveDb()`
// 落地都會令三條 hymns route 一齊 miss 一齊 `getDb()`,fire 嘅機會大咗。
//
// 修法:**assignment 一定要喺任何 `await` 之前同步做**——`dbPromise =
// (async () => {...})()` 呢句本身唔會等,IIFE call 完即刻攞到個
// pending promise 賦落 `dbPromise`,第二個並發 request 入嚟嗰陣
// `dbPromise` 已經係呢個 promise(唔再係 `null`),`return dbPromise`
// 攞到同一份、等緊佢resolve,唔會再觸發第二次 `readFileSync`。
export async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs();
      const buffer = fs.readFileSync(DB_PATH);
      return new SQL.Database(buffer);
    })().catch((err) => {
      // 唔好因為呢次失敗就永久卡住一個 rejected promise——清返 `null`
      // 俾落次 `getDb()` 有機會由頭嚟過(同改之前「失敗咗落次自然會
      // retry」嘅行為睇齊,唔淨係得個 in-flight dedupe 冇埋呢個)。
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export function getDataVersion() {
  return dataVersion;
}

// admin 寫入 hymns.db 完(lib/adminHymns.js)一定要 call 呢個 —— dbPromise
// 清咗,下一個 request 嘅 getDb() 會由碟開新鮮副本;dataVersion 同時重算,
// App 端先知要 refetch(§3.3 大註解:呢個係成件事嘅膊頭位)。
//
// PERF-STAGE2-2C6-OPUS-20260902.md §5.2 —— 呢度以前**從來冇 `db.close()`**。
// sql.js 嘅 `new SQL.Database(buffer)` 將個 buffer 掛落 emscripten MEMFS,
// `close()` 入面先會 unlink 返(釋放 wasm heap 嗰邊嘅 arrayBuffer);淨係
// `dbPromise = null` 冇人再 hold 住個 JS reference,但 wasm heap 嗰邊
// **永遠唔會縮**(wasm 記憶體只可以長)。Opus 5 實測(`--expose-gc` 逐輪
// 強制 full GC):冇 close() 每次 reload 淨袋 +58MB、5 輪 143→392MB;有
// close() 五輪企定唔郁。C-4 之前 `reloadDb()` 淨係 admin in-process 寫入
// 先 call(罕有);C-4 `maybeReload()` 令佢變成「夜晚 job 每次改完
// hymns.db 就 fire 一次」——由「幾個禮拜一次」變「一日 1-4 次」,即係
// +58MB ~ +230MB/日、永不歸還。
//
// 修法:唔可以即刻 close 舊 database——攞住舊 `dbPromise` 嗰一刻,可能
// 有 request 啱啱好 `await getDb()` 攞咗返嚟嘅**係嗰一份**、仲喺度做緊
// 同步 SQL(prepare/step/free),close 咗會令佢哋 `Error: Database
// closed`。要延遲 close,等所有仲揸住舊 reference 嘅 handler 實一係做完。
//
// **延遲揀 10 秒嘅根據**(唔係亂諗嘅數):grep 晒全 backend 所有 `getDb()`
// caller(`routes/stream.js` ×2、`routes/me.js`、`routes/hls.js`、
// `server.js` ×4——`/api/hymns` 兩條、keep-warm tick、daily warm
// cron),逐個核實**攞到 `db` 之後全部係『同步』用完就放手**(`prepare`→
// `step`/`bind`→`getAsObject`→`free`,一路冇 `await`),之後即使函數本身
// 繼續行落去(例如再 `await resolveAudioUrl(...)`),都**唔會再掂返
// `db` 呢個 reference**。即係冇一個 caller 會「攞到 db → await 第二樣嘢
// → 先至再用返 db」。所有實測嘅同步 SQL 操作(SELECT 6,405 行都好)喺
// <100ms 完成(見 C-6 §3.2 harness),10 秒係呢個數量級嘅 100 倍安全邊際。
// ⚠️ 如果第日有新 caller 打破呢個 pattern(攞到 db 之後跨 await 仲用),
// 呢個 10 秒假設就要重新檢討,要嘛加大延遲要嘛改用 refcount。
const DB_CLOSE_DELAY_MS = 10_000;

export function reloadDb() {
  const old = dbPromise;
  dbPromise = null;
  dataVersion = computeDataVersion();
  if (old) {
    old
      .then((db) => {
        const t = setTimeout(() => {
          try {
            db.close();
          } catch (e) {
            // 已經 close 咗,或者呢個版本冇 close() 方法——唔好因為清理
            // 動作本身而炸咗成個 backend。
          }
        }, DB_CLOSE_DELAY_MS);
        if (typeof t.unref === 'function') t.unref(); // 唔好因為呢個背景清理 timer 拖住 process 唔收工
      })
      .catch(() => {
        // 舊 `dbPromise` 本身已經係 rejected(例如上次 readFileSync 失敗
        // 嗰個)——冇 db 可以 close,唔使處理。
      });
  }
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

// PERF-STAGE2-2C-20260902-C6-OPUS §4.4 保留二(已修,唔改行為淨係加
// 告警)—— 殘留 lock 檔會令 `maybeReload()` 永久唔郁,而且零聲。
// `lockIsStealable()`(`lib/hymnDb.js`,20 分鐘/2 粒鐘搶鎖)嗰套邏輯**只
// 喺 `acquireDbLock()` 入面行**,即係要「另一個 writer 開工」先會搶走
// 殘鎖;如果 writer crash/俾人 kill 之後留低個 lock 檔,而之後又冇second
// job 再開工,`maybeReload()` 會由嗰刻起永遠見到 lock 存在,悄悄退化返
// 「淨係 restart 先追到新資料」嘅狀態,冇任何 log 講過呢件事。Opus 5 5
// 指出 `backend/hymns.db.lock.bak*`(2026-08-17)就係歷史上真係搬過殘鎖
// 嘅證據。
//
// 而家嘅修法**唔改 C-4 原有行為**(lock 存在就係唔 reload,唔理鎖幾
// 舊)——淨係加一句告警:lock 齡 > 30 分鐘就 `console.warn`,每 10 分鐘
// 最多印一次(唔想夜晚 job 跑緊嗰陣、lock 本身合理存在嗰半個鐘,每個
// request 都嘈一次)。
const STALE_LOCK_WARN_THRESHOLD_MS = 30 * 60 * 1000; // 30 分鐘
const STALE_LOCK_WARN_THROTTLE_MS = 10 * 60 * 1000; // 10 分鐘最多一次
let lastStaleLockWarnAt = 0;

export function maybeReload() {
  let fresh;
  try {
    fresh = computeDataVersion();
  } catch (e) {
    return; // stat 都攞唔到,維持現狀,唔好爆
  }
  if (fresh === dataVersion) return; // 常態:檔案冇變
  let lockStat = null;
  try {
    lockStat = fs.statSync(LOCK_PATH);
  } catch (e) {
    lockStat = null; // 唔存在(或者讀唔到)→ 當冇鎖
  }
  if (lockStat) {
    const ageMs = Date.now() - lockStat.mtimeMs;
    if (ageMs > STALE_LOCK_WARN_THRESHOLD_MS) {
      const now = Date.now();
      if (now - lastStaleLockWarnAt > STALE_LOCK_WARN_THROTTLE_MS) {
        lastStaleLockWarnAt = now;
        console.warn(`[db] stale lock ${LOCK_PATH} age=${Math.round(ageMs / 1000)}s(>${STALE_LOCK_WARN_THRESHOLD_MS / 1000}s)—— maybeReload() 持續俾佢擋住,唔會 reload,可能要人手核實/刪走殘鎖(PERF-STAGE2-2C-OPUS-20260902.md §4.4:hymns.db.lock.bak* 係歷史證據)`);
      }
    }
    return; // C-4 原有行為不變:lock 存在就唔 reload,唔理年齡
  }
  reloadDb();
}
