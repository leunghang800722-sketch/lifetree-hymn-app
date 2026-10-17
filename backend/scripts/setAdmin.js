#!/usr/bin/env node
// scripts/setAdmin.js — 標/褫奪 admin 角色(MEMBERSHIP-PHASE2-ADMIN-PLAN §2.2)
//
// 用法:
//   node scripts/setAdmin.js <email 或 E.164 電話>            # 標做 admin
//   node scripts/setAdmin.js <email 或 E.164 電話> --revoke   # 褫奪返做 member
//   加 --no-restart 唔自動重啟 backend(留返自己手動)
//
// ⚠️ 單一寫入者陷阱(母 plan §0 核實過):users.db 淨係 server process 一個
// 寫入者,每個寫操作即刻全量 export 落碟。呢個 script 直接改碟上嘅檔,server
// 記憶體嗰份唔知情——佢下一次任何寫操作(邊個登入/撳個心心)就會用舊記憶體
// 冚返落碟,呢度改嘅 role 即刻消失。所以收尾預設自動重啟 backend
// (launchctl kickstart -k),令 server 由碟重讀。

import initSqlJs from 'sql.js';
import fs from 'fs';
import { execSync } from 'child_process';
import { USER_DB_PATH } from '../lib/userDb.js';

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const noRestart = args.includes('--no-restart');
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('用法: node scripts/setAdmin.js <email 或 E.164 電話> [--revoke] [--no-restart]');
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(USER_DB_PATH)) {
    console.error(`❌ users.db 唔存在(${USER_DB_PATH})`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(USER_DB_PATH));

  const sel = db.prepare('SELECT id, username, email, phone, role FROM users WHERE email = ? OR phone = ?');
  sel.bind([target, target]);
  const found = sel.step();
  const user = found ? sel.getAsObject() : null;
  sel.free();

  if (!user) {
    console.error(`❌ 搵唔到用戶「${target}」。現有用戶:`);
    const all = db.prepare('SELECT id, email, phone, role FROM users ORDER BY id');
    while (all.step()) {
      const r = all.getAsObject();
      console.error(`  #${r.id}  ${r.email || '(冇 email)'}  ${r.phone || '(冇電話)'}  role=${r.role || 'member'}`);
    }
    all.free();
    db.close();
    process.exit(1);
  }

  const before = user.role || 'member';
  const after = revoke ? 'member' : 'admin';

  db.run('UPDATE users SET role = ? WHERE id = ?', [after, user.id]);
  const tmp = `${USER_DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, USER_DB_PATH);
  db.close();

  console.log(`✅ 用戶 #${user.id}(${user.email || user.phone}):role ${before} → ${after}`);

  if (noRestart) {
    console.log('⚠️ --no-restart:backend 記憶體嗰份仲未同步,而家改動一觸即失(下次任何寫操作就會俾舊記憶體冚返落碟)——記得自己手動重啟。');
    return;
  }

  try {
    execSync(`launchctl kickstart -k gui/${process.getuid()}/com.hymnapp.backend`, { stdio: 'inherit' });
    console.log('✅ backend 已重啟,role 改動即時生效');
  } catch (e) {
    console.error(`⚠️ backend 重啟失敗(${e.message})—— role 改動已寫落碟,但要手動重啟 backend 先生效,否則下次寫操作會冚走呢次改動。`);
  }
}

main();
