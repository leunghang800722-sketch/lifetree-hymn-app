#!/usr/bin/env node
// scripts/backupUsersDb.js — users.db 每日備份(MEMBERSHIP-PHASE2-ADMIN-PLAN §1)
//
// 用戶數據(帳戶/最愛/清單)冇得重建 —— 歌庫爛咗可以重 scrape,users.db 爛咗
// 就真係冧晒。server 寫入係 tmp+rename(atomic),所以任何時刻碟上嗰份 users.db
// 都係完整 snapshot,直接 copy 唔使停 server、唔使鎖。
//
// 流程:copy → sql.js 開返份 backup 驗 SELECT COUNT(*) FROM users(爛咗就
// exit 1、唔 prune)→ prune 14 日以上嘅舊 backup(用檔名日期,唔用 mtime)。

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { USER_DB_PATH } from '../lib/userDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const RETENTION_DAYS = 14;

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function main() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(BACKUPS_DIR, 0o700); } catch (_) {}

  if (!fs.existsSync(USER_DB_PATH)) {
    console.error(`❌ users.db 唔存在(${USER_DB_PATH}),冇嘢好備份`);
    process.exit(1);
  }

  const stamp = today();
  const dest = path.join(BACKUPS_DIR, `users-${stamp}.db`);
  const tmp = `${dest}.tmp`;
  fs.copyFileSync(USER_DB_PATH, tmp);

  // 完整性 sanity check 喺 .tmp 度做,通過先 rename 落正式檔名 —— 咁樣萬一
  // 同一日重複行(手動測試/重試)撞到源頭爛咗,唔會用爛 copy 冚走今日已經
  // 存在嘅好 backup(先寫 tmp 先驗證先 rename,呢個 window 之前正式檔名完全
  // 冇被掂過)。
  let userCount;
  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(tmp));
    const stmt = db.prepare('SELECT COUNT(*) as n FROM users');
    stmt.step();
    userCount = stmt.getAsObject().n;
    stmt.free();
    db.close();
    if (!Number.isFinite(userCount)) throw new Error('count 讀唔到');
  } catch (e) {
    console.error(`❌ backup 完整性檢查失敗(${tmp}):${e.message}`);
    try { fs.unlinkSync(tmp); } catch (_) {}
    process.exit(1);
  }

  fs.renameSync(tmp, dest);
  const bytes = fs.statSync(dest).size;

  // Prune:剷走超過 RETENTION_DAYS 日嘅 users-*.db(按檔名日期,唔用 mtime——
  // mtime 會俾 Time Machine/copy 搞亂)。
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const name of fs.readdirSync(BACKUPS_DIR)) {
    const m = name.match(/^users-(\d{8})\.db$/);
    if (!m) continue;
    const y = m[1].slice(0, 4), mo = m[1].slice(4, 6), d = m[1].slice(6, 8);
    const fileDate = new Date(`${y}-${mo}-${d}T00:00:00Z`).getTime();
    if (Number.isFinite(fileDate) && fileDate < cutoff) {
      fs.unlinkSync(path.join(BACKUPS_DIR, name));
      pruned++;
    }
  }

  console.log(`✅ backup users-${stamp}.db (${userCount} users, ${bytes} bytes), pruned ${pruned}`);
}

main().catch((e) => {
  console.error('❌ backupUsersDb 失敗:', e.message);
  process.exit(1);
});
