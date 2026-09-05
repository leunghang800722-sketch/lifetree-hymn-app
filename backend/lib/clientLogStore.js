// lib/clientLogStore.js — D1 診斷 beacon(routes/clientLog.js)持久化存法
//
// 背景(2026-08-17):clientLog.js 之前刻意「唔存 DB、淨係 print 去 stdout」,
// stdout 由 launchd 轉去 /tmp/hymn_backend.log。今日整機重啟,macOS 開機清咗
// /tmp,8/15-17 三日收集嘅 beacon 全部蒸發,冇第二份底。呢個 module 加一份
// 寫落 repo 目錄內(backend/logs/,已經係 .gitignore 咗嘅「產物」目錄,同
// lib/auditLog.js 嘅 admin-audit.log 共用同一個豁免/慣例)嘅持久化底,
// 唔會俾整機重啟/launchd 重啟/OS 清 /tmp 影響。
//
// 設計原則(同 clientLog.js 本身一致):呢個係診斷 helper,唔係業務邏輯,
// 寫入失敗、目錄有問題、單日檔爆咗上限——一律靜靜哋 console.error 算,
// 唔可以拖累/整壞 client-log 個 request。
//
// 格式:JSON Lines,按 UTC 日期分檔(client-log-YYYY-MM-DD.jsonl),
// 每個檔案有 size 上限(單日內異常洗版嘅安全閥),而且每次寫入順便
// (throttled,唔係逐次)清走超過 RETENTION_DAYS 嘅舊檔——呢個係
// rotation/上限機制,但 RETENTION_DAYS 預設 14 天,保證撐夠「呢排最少
// 7 日資料唔清」呢個要求仲有buffer。
//
// DEEP-AUDIT-W1-EXEC-20260906 B2(1D CLOG-1)—— 之前每個 request 同步行
// `mkdirSync`+`chmodSync`+`statSync`+`appendFileSync`,會同 event loop 上
// 其他 request(`/api/stream`/`/api/hls`)爭主線程。而家:
//   1. `mkdirSync`/`chmodSync` 搬去 module load 一次過(唔再逐 request 重做)。
//   2. per-request 淨係 push 落 in-memory buffer,真正落碟改用 `fs.appendFile`
//      (async),定時(≤1s)或者滿 64KB 先 flush 一次。
//   3. size cap 用 buffer 自己喺記憶體累計嘅 bytes(每個日檔第一次撞到先
//      `statSync` 一次攞返「開機時已經寫咗幾多」做起點,之後純粹 memory 加數,
//      唔會逐 request 再 stat)。
//   4. process 結束前(`beforeExit`)盡力 flush 一次——**唔准加 SIGTERM
//      handler**(memory:Batch D 紅線,`server.js` 冇 SIGTERM handler 先可以
//      俾 `launchctl bootout` 直接 SIGTERM 殺死,一加就會等到 SIGKILL
//      timeout,拖冧 `backend-restart.sh`)。`beforeExit` 唔攔任何 signal,
//      淨係喺 event loop 自然清空(process 準備正常結束)先會 fire,同
//      opsMetrics.js 已有嘅同類設計一致。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DEEP-AUDIT-W1-EXEC-20260906 §2.2 harness 測試座:兩個 env override,預設
// 行為完全唔變(冇設 env 就同之前一樣)。俾 H-B1/H-B2/H-B4 嘅隔離 harness
// 用——唔可以起第二個真 server 打 prod 歌庫,但要有辦法測「寫 1000 條」
// 「size cap 頂咗會點」而唔污染 `backend/logs/client-log/` 嘅真實生產數據
// (呢個目錄本身仲要俾 `ops/perf/classify-devices.mjs` 讀嚟做 1E 對數)。
export const CLIENT_LOG_DIR = process.env.CLIENT_LOG_DIR_OVERRIDE
  ? path.resolve(process.env.CLIENT_LOG_DIR_OVERRIDE)
  : path.join(__dirname, '..', 'logs', 'client-log');

// 保留幾多日嘅檔案——要求話「最少要撐到7日資料唔清」,呢度留寬鬆啲。
export const RETENTION_DAYS = 14;

// 單日檔案 size 安全閥:呢個 endpoint 冇認證,異常洗版時唔可以無限增長。
// 白名單後單行大約 <400 bytes,50MB 已經係好巨量嘅單日 beacon 數量,
// 到咗上限就淨係停寫呢份持久化底(stdout 同 response 照舊唔受影響)。
export const MAX_FILE_BYTES = Number(process.env.CLIENT_LOG_MAX_FILE_BYTES) || 50 * 1024 * 1024;

// B2(1)—— mkdir/chmod 喺 module load 做一次過。失敗一律 console.error 唔
// throw:呢個係診斷 helper,目錄有問題唔可以拖累 client-log 個 request
// (下面 appendClientLog 嘅 fs.appendFile 一樣會失敗,但唔會炸 caller)。
try {
  fs.mkdirSync(CLIENT_LOG_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(CLIENT_LOG_DIR, 0o700);
} catch (e) {
  console.error('[client-log-store] 初始化目錄失敗:', e?.message);
}

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 最多每小時 prune 一次,唔逐 request scan 目錄

function todayFileName(now) {
  return `client-log-${now.toISOString().slice(0, 10)}.jsonl`;
}

function pruneOldFiles(now) {
  try {
    const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(CLIENT_LOG_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !/^client-log-\d{4}-\d{2}-\d{2}\.jsonl$/.test(ent.name)) continue;
      const dateStr = ent.name.slice('client-log-'.length, 'client-log-'.length + 10);
      const fileDate = new Date(`${dateStr}T00:00:00.000Z`);
      if (Number.isNaN(fileDate.getTime())) continue;
      if (fileDate.getTime() < cutoff) {
        fs.rmSync(path.join(CLIENT_LOG_DIR, ent.name), { force: true });
        diskBytesByFile.delete(ent.name); // 檔冇咗,快取嘅 bytes 起點都要清
      }
    }
  } catch (e) {
    console.error('[client-log-store] prune 失敗:', e?.message);
  }
}

// ── B2(2)(3):in-memory buffer + 批量 async writer ─────────────────
const FLUSH_INTERVAL_MS = 1000;      // ≤1s 就算冧咗機都蝕唔多
const FLUSH_BYTES_THRESHOLD = 64 * 1024; // 64KB

// 按檔名分組嘅待寫 buffer(唔淨係跟「而家嗰個檔」,防止跨日邊界嗰 1 秒
// 內收到嘅 line 混錯落第二日個檔)。
const pendingByFile = new Map(); // fileName -> { lines: string[], bytes: number }
// 每個日檔「已經落碟」嘅 bytes 起點——第一次撞到嗰個檔名先 statSync 一次,
// 之後純粹記憶體加數,唔會逐 request 再 stat。
const diskBytesByFile = new Map(); // fileName -> bytes
const flushingFiles = new Set();
let flushTimer = null;

function getDiskBytesBaseline(fileName) {
  if (diskBytesByFile.has(fileName)) return diskBytesByFile.get(fileName);
  let sz = 0;
  try {
    sz = fs.statSync(path.join(CLIENT_LOG_DIR, fileName)).size;
  } catch (_) {
    sz = 0; // 檔案未存在,當 0
  }
  diskBytesByFile.set(fileName, sz);
  return sz;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    for (const fileName of Array.from(pendingByFile.keys())) flushFile(fileName);
  }, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

function flushFile(fileName) {
  const pending = pendingByFile.get(fileName);
  if (!pending || pending.lines.length === 0) return;
  if (flushingFiles.has(fileName)) return; // 呢個檔已經有一個 flush 行緊,等佢完
  flushingFiles.add(fileName);
  pendingByFile.delete(fileName);
  const data = pending.lines.join('');
  const filePath = path.join(CLIENT_LOG_DIR, fileName);
  fs.appendFile(filePath, data, (err) => {
    flushingFiles.delete(fileName);
    if (err) {
      console.error('[client-log-store] 批量寫入失敗:', err?.message);
      // 呢批數蝕咗——診斷 helper 唔可以因為呢個再拖累任何 caller。
    } else {
      diskBytesByFile.set(fileName, getDiskBytesBaseline(fileName) + pending.bytes);
      const now = new Date();
      if (now.getTime() - lastPruneAt > PRUNE_INTERVAL_MS) {
        lastPruneAt = now.getTime();
        pruneOldFiles(now);
      }
    }
    // flush 緊嗰陣又嚟咗新 line(同一個檔)就即刻再嚟一次,唔使等落一個 timer tick。
    if (pendingByFile.has(fileName)) flushFile(fileName);
  });
}

function flushAllSync_bestEffort() {
  // beforeExit 專用:淨係觸發 flush,唔阻塞等 callback(process 本身就快
  // 收工,呢度只係盡力唔好蝕晒成個 buffer)。
  for (const fileName of Array.from(pendingByFile.keys())) flushFile(fileName);
}

// 寫一行 client-log beacon 落持久化 JSONL 檔(唔即刻落碟,入返 buffer)。
// fields 應該已經係 clientLog.js 白名單/截斷完嘅安全物件。呢個 function
// 保證唔會 throw 出去俾 caller。
export function appendClientLog(fields) {
  try {
    const now = new Date();
    const fileName = todayFileName(now);
    const diskBytes = getDiskBytesBaseline(fileName);
    const pending = pendingByFile.get(fileName);
    const queuedBytes = pending ? pending.bytes : 0;

    if (diskBytes + queuedBytes >= MAX_FILE_BYTES) {
      console.error(`[client-log-store] 今日檔已達 ${MAX_FILE_BYTES} bytes 上限,停寫持久化底(stdout 唔受影響):${fileName}`);
      return;
    }

    const line = JSON.stringify({ ts: now.toISOString(), ...fields }) + '\n';
    const lineBytes = Buffer.byteLength(line);
    const bucket = pending || { lines: [], bytes: 0 };
    bucket.lines.push(line);
    bucket.bytes += lineBytes;
    pendingByFile.set(fileName, bucket);

    if (bucket.bytes >= FLUSH_BYTES_THRESHOLD) {
      flushFile(fileName);
    } else {
      scheduleFlush();
    }
  } catch (e) {
    console.error('[client-log-store] 寫入失敗:', e?.message);
  }
}

// B2(4)—— 盡力 flush,唔攔任何 signal(唔准加 SIGTERM handler,見上面
// module 註解)。
process.on('beforeExit', () => {
  try { flushAllSync_bestEffort(); } catch (_) {}
});
