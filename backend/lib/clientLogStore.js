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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLIENT_LOG_DIR = path.join(__dirname, '..', 'logs', 'client-log');

// 保留幾多日嘅檔案——要求話「最少要撐到7日資料唔清」,呢度留寬鬆啲。
export const RETENTION_DAYS = 14;

// 單日檔案 size 安全閥:呢個 endpoint 冇認證,異常洗版時唔可以無限增長。
// 白名單後單行大約 <400 bytes,50MB 已經係好巨量嘅單日 beacon 數量,
// 到咗上限就淨係停寫呢份持久化底(stdout 同 response 照舊唔受影響)。
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

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
      }
    }
  } catch (e) {
    console.error('[client-log-store] prune 失敗:', e?.message);
  }
}

// 寫一行 client-log beacon 落持久化 JSONL 檔。fields 應該已經係 clientLog.js
// 白名單/截斷完嘅安全物件。呢個 function 保證唔會 throw 出去俾 caller。
export function appendClientLog(fields) {
  try {
    fs.mkdirSync(CLIENT_LOG_DIR, { recursive: true, mode: 0o700 });
    fs.chmodSync(CLIENT_LOG_DIR, 0o700);

    const now = new Date();
    const filePath = path.join(CLIENT_LOG_DIR, todayFileName(now));

    let existingSize = 0;
    try {
      existingSize = fs.statSync(filePath).size;
    } catch (_) {
      existingSize = 0; // 檔案未存在,當 0
    }

    if (existingSize >= MAX_FILE_BYTES) {
      console.error(`[client-log-store] 今日檔已達 ${MAX_FILE_BYTES} bytes 上限,停寫持久化底(stdout 唔受影響):${filePath}`);
    } else {
      const line = JSON.stringify({ ts: now.toISOString(), ...fields }) + '\n';
      fs.appendFileSync(filePath, line);
    }

    if (now.getTime() - lastPruneAt > PRUNE_INTERVAL_MS) {
      lastPruneAt = now.getTime();
      pruneOldFiles(now);
    }
  } catch (e) {
    console.error('[client-log-store] 寫入失敗:', e?.message);
  }
}
