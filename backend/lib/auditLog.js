// lib/auditLog.js — admin audit log(抽自 routes/admin.js 嘅 appendAudit
// pattern,MEMBERSHIP-PHASE2-ADMIN-PLAN §3.5)。
//
// MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §5-7 講明「邀請碼生成/使用/revoke
// 寫 admin audit log(用 routes/admin.js 現成 appendAudit pattern,可以抽共用
// 或者照抄)」——呢度揀抽出嚟做獨立 lib,俾 routes/invites.js 同
// routes/otpAuth.js(register-phone 消費碼嗰下)共用,唔郁 routes/admin.js
// 本身(避免同其他 session 撞同一個檔)。
//
// 逐個操作一行 JSON,寫入失敗淨係 console.error,唔 fail 個 request
// (得 Eric 一個 admin,audit 係追溯用,可用性行先)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUDIT_LOG_PATH = path.join(__dirname, '..', 'logs', 'admin-audit.log');

// logs/ 開出嚟預設 755,要 700(同 backupUsersDb.js 一致做法)—— mkdirSync
// 帶 mode 淨係對「新建」有效,已經存在嘅目錄要額外 chmodSync 先保證到 700。
export function appendAudit(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(AUDIT_LOG_PATH), 0o700);
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('admin-audit 寫入失敗:', e?.message);
  }
}

export function whoOf(user) {
  return user.email || user.phone || `#${user.id}`;
}
