#!/usr/bin/env node
// 五維分類 P1:TAXONOMY-5D-PLAN.md §2/§3.1/§8 C1 —— 加 org/performer/
// performer_source/kids 欄(additive-only,artist/lang 原封不動),backfill
// org=artist,再將**已用逐條片uploader證據確認**嘅撞源 artist tag 收埋做同一
// 個 org;kids 欄一次過標返現存 lang='兒童' 嘅行(含 rejected 墓碑)。
//
// 2026-08-01 Eric 指示執行,org 合併範圍收窄至已驗證嘅 2 對(唔係原方案 §1.3/
// §3.1 文字列嘅 3 對 —— 另外「讚美之泉/讚美之泉粵語」「生命河靈糧堂/生命河
// 粵語」逐條片查證後發現**唔係**同一頻道,撤銷合併,詳見 SUPERVISION-LOG
// 2026-08-01「org/performer維度落地」條目 + worshipGroups.js 對應 entry 嘅
// note):
//   泥土音樂 / 盛曉玫        → 10/10 樣本片uploader = 泥土音樂Clay Music
//   天韻合唱團 / Heavenly Melody → 3/3 樣本片uploader = 天韻合唱團 Heavenly Melody
// 因為呢 2 對已經係當日驗證過嘅事實,唔跟返 §3.1 文字原句「三組撞源」逐字
// 執行(會將已推翻嘅誤判做返落庫)。
//
// kids 欄 backfill 呢步淨係加標記(現存 619 首 lang 仍然係「兒童」字面值,
// 唔郁——真語言 backfill 係 C3/C4 staging 重攞嘅事),server.js 嘅 real_lang
// 兼容墊令呢個唔一致變透明(§3.4 K-E)。
//
// Idempotent:欄位用 PRAGMA table_info 查完先 ALTER,backfill/merge/kids 標記
// 用 WHERE 條件天然 idempotent(重跑結果一樣)。
//
// §6.1:hymns.db 同 users.db 都要 backup(users.db 呢步其實未郁,但 C1 之後
// 嘅 C4 換血會改佢,一致喺呢個 script 一齊留底方便追蹤)。

import fs from 'fs';
import { openDb, saveDb, DB_PATH, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { USER_DB_PATH } from '../lib/userDb.js';

const DRY = process.argv.includes('--dry');

function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bak = `${DB_PATH}.bak-taxonomy-${stamp}`;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(DB_PATH, bak);
    console.log(`備份完成: ${bak}`);
  } else {
    console.log(`備份已存在,跳過: ${bak}`);
  }
  const usersBak = `${USER_DB_PATH}.bak-taxonomy-${stamp}`;
  if (!fs.existsSync(usersBak)) {
    fs.copyFileSync(USER_DB_PATH, usersBak);
    console.log(`備份完成: ${usersBak}`);
  } else {
    console.log(`備份已存在,跳過: ${usersBak}`);
  }

  const token = await acquireDbLock('migrateTaxonomy');
  if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }

  try {
    const db = await openDb();

    for (const [col, def] of [
      ['org', "TEXT DEFAULT ''"],
      ['performer', "TEXT DEFAULT ''"],
      ['performer_source', "TEXT DEFAULT ''"],
      ['kids', 'INTEGER DEFAULT 0'],
    ]) {
      if (!hasColumn(db, 'hymns_all', col)) {
        console.log(`ALTER TABLE hymns_all ADD COLUMN ${col} ${def}`);
        if (!DRY) db.run(`ALTER TABLE hymns_all ADD COLUMN ${col} ${def}`);
      } else {
        console.log(`欄位已存在,跳過: ${col}`);
      }
    }

    console.log("backfill org = artist WHERE org = ''");
    if (!DRY) db.run("UPDATE hymns_all SET org = artist WHERE org = ''");

    const merges = [
      ['泥土音樂', ['盛曉玫', '泥土音樂']],
      ['天韻合唱團', ['天韻合唱團', 'Heavenly Melody']],
    ];
    for (const [org, artists] of merges) {
      const placeholders = artists.map(() => '?').join(',');
      const before = db.exec(`SELECT COUNT(*) c FROM hymns_all WHERE artist IN (${placeholders})`, artists);
      const n = before[0]?.values[0][0] ?? 0;
      console.log(`org='${org}' WHERE artist IN (${artists.join(',')}) — ${n} 首`);
      if (!DRY) {
        const stmt = db.prepare(`UPDATE hymns_all SET org = ? WHERE artist IN (${placeholders})`);
        stmt.bind([org, ...artists]);
        stmt.step();
        stmt.free();
      }
    }

    console.log("kids = 1 WHERE lang = '兒童'(含 rejected 墓碑,§3.4.1)");
    if (!DRY) db.run("UPDATE hymns_all SET kids = 1 WHERE lang = '兒童'");

    if (!DRY) {
      saveDb(db);
      console.log('已寫入 hymns.db');
    } else {
      console.log('--dry:未寫入');
    }

    if (!DRY) {
      const check = db.exec("SELECT org, COUNT(*) c FROM hymns_all WHERE org IN ('泥土音樂','天韻合唱團') GROUP BY org");
      console.log('驗證:', JSON.stringify(check[0]?.values ?? []));
      const empty = db.exec("SELECT COUNT(*) c FROM hymns_all WHERE org = ''")[0].values[0][0];
      console.log(`org 仲係空嘅 row 數(應該=0): ${empty}`);
      const kidsCount = db.exec("SELECT COUNT(*) c FROM hymns_all WHERE kids = 1")[0].values[0][0];
      console.log(`kids=1 row 數(應該=619): ${kidsCount}`);
    }
  } finally {
    releaseDbLock(token);
  }
}

main();
