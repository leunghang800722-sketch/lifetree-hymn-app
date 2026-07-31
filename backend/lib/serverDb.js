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
