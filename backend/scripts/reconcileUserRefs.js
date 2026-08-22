#!/usr/bin/env node
// backend/scripts/reconcileUserRefs.js
// DELISTED-FAVORITES-ROOTCAUSE-20260822.md §G3-2 —— 一次性 reconcile。
//
// 掃 users.db 全部 favorites / playlists.songs_json,清走所有指唔到 `hymns`
// view 嘅 hymn_id。「指唔到」涵蓋三種:
//   (a) 行喺 hymns_all 都冇咗        —— hard delete(例:kids C4 原子換血)
//   (b) status='dead' / 'rejected'   —— dl:dead 落架、非歌內容 delist
//   (c) curated=0                    —— 未收錄
// 三種喺 /api/stream 都一律 404(routes/stream.js 查嘅就係 `hymns` view),
// 所以判準直接用「喺唔喺 hymns view 度」,唔使逐種 case 分開寫。
//
// Usage:
//   node scripts/reconcileUserRefs.js              # dry-run,只列清單唔改嘢
//   node scripts/reconcileUserRefs.js --apply      # 真係寫(會先 backup)
//   node scripts/reconcileUserRefs.js --apply --user 2   # 只做某一個 user(即時止血用)
//
// ⚠️ 一定要喺 backend **停咗** 嘅時候行。
//    server 對 users.db 係「開機讀一次入記憶體,之後每次寫完成份 export 覆蓋落碟」
//    (lib/userDb.js saveUserDb),即係你喺佢跑緊嗰陣改隻檔,佢下一次任何寫操作
//    都會用佢手上嗰份舊 in-memory 副本靜靜哋冚返轉頭。呢個同 hymns.db 嗰條
//    「raw sqlite3 UPDATE 會俾並行 job saveDb() 覆寫」教訓係同一個坑。
//    下面有 guard 會自己 check,除非俾 --force。

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DB_PATH = path.join(__dirname, '..', 'users.db');
const HYMN_DB_PATH = path.join(__dirname, '..', 'hymns.db');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const userArgIdx = args.indexOf('--user');
const ONLY_USER = userArgIdx >= 0 ? parseInt(args[userArgIdx + 1], 10) : null;

function backendRunning() {
  try {
    const out = execSync("ps -Ao pid,command | grep -v grep | grep 'hymn-app/backend/server.js' || true", {
      encoding: 'utf8',
    });
    return out.trim().length > 0 ? out.trim() : null;
  } catch (_) {
    return null;
  }
}

async function main() {
  const running = backendRunning();
  if (running && APPLY && !FORCE) {
    console.error('❌ abort:backend 仲跑緊,而家寫 users.db 會俾佢嘅 in-memory 副本覆寫。');
    console.error(running);
    console.error('\n請先 launchctl bootout com.hymnapp.backend(或行 ops/deploy/backend-restart.sh 嘅停機步驟),');
    console.error('reconcile 完再 bootstrap 返。真係知自己做緊乜先加 --force。');
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const hymnDb = new SQL.Database(fs.readFileSync(HYMN_DB_PATH));
  const userDb = new SQL.Database(fs.readFileSync(USER_DB_PATH));

  // 「播得到」= 喺 hymns view 度。一次過拉曬入 Set,唔逐條 query。
  const live = new Set();
  {
    const stmt = hymnDb.prepare('SELECT id FROM hymns');
    while (stmt.step()) live.add(stmt.getAsObject().id);
    stmt.free();
  }
  // 順手分類死因,report 好睇啲(唔影響判準)。
  const inAll = new Set();
  {
    const stmt = hymnDb.prepare('SELECT id FROM hymns_all');
    while (stmt.step()) inAll.add(stmt.getAsObject().id);
    stmt.free();
  }
  const why = (id) => {
    if (!inAll.has(id)) return 'hard-deleted(行都冇咗)';
    const stmt = hymnDb.prepare('SELECT status, curated, title FROM hymns_all WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) return 'hard-deleted(行都冇咗)';
    return `status=${row.status} curated=${row.curated} | ${String(row.title).slice(0, 40)}`;
  };

  console.log(`hymns view 現有 ${live.size} 首;users.db = ${USER_DB_PATH}`);
  if (ONLY_USER != null) console.log(`⚠️ 只處理 user_id = ${ONLY_USER}`);
  console.log(APPLY ? '模式:APPLY(會寫入)' : '模式:DRY-RUN(唔會寫入)');
  console.log('');

  // ── favorites ──────────────────────────────────────────────────────────
  const deadFavs = [];
  {
    const stmt = userDb.prepare(
      ONLY_USER != null
        ? 'SELECT user_id, hymn_id FROM favorites WHERE user_id = ? ORDER BY user_id, hymn_id'
        : 'SELECT user_id, hymn_id FROM favorites ORDER BY user_id, hymn_id'
    );
    if (ONLY_USER != null) stmt.bind([ONLY_USER]);
    while (stmt.step()) {
      const r = stmt.getAsObject();
      if (!live.has(r.hymn_id)) deadFavs.push(r);
    }
    stmt.free();
  }
  console.log(`=== favorites:${deadFavs.length} 個死 reference ===`);
  for (const f of deadFavs) console.log(`  user ${f.user_id} -> ${f.hymn_id}  ${why(f.hymn_id)}`);

  // ── playlists ──────────────────────────────────────────────────────────
  const deadPl = [];
  {
    const stmt = userDb.prepare(
      ONLY_USER != null
        ? 'SELECT user_id, id, name, songs_json FROM playlists WHERE deleted = 0 AND user_id = ?'
        : 'SELECT user_id, id, name, songs_json FROM playlists WHERE deleted = 0'
    );
    if (ONLY_USER != null) stmt.bind([ONLY_USER]);
    while (stmt.step()) {
      const r = stmt.getAsObject();
      let songs = [];
      try { songs = JSON.parse(r.songs_json || '[]'); } catch (_) { songs = []; }
      const kept = songs.filter((s) => live.has(parseInt(s?.id, 10)));
      if (kept.length !== songs.length) {
        deadPl.push({
          ...r,
          songs,
          kept,
          removed: songs.filter((s) => !live.has(parseInt(s?.id, 10))),
        });
      }
    }
    stmt.free();
  }
  console.log(`\n=== playlists:${deadPl.length} 個清單有死 reference ===`);
  for (const p of deadPl) {
    console.log(`  user ${p.user_id} 「${p.name}」(${p.id}):${p.songs.length} → ${p.kept.length}`);
    for (const s of p.removed) console.log(`     - ${s?.id}  ${String(s?.title || '').slice(0, 40)}  ${why(parseInt(s?.id, 10))}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run,乜都冇改。加 --apply 先會真係寫入)');
    return;
  }
  if (deadFavs.length === 0 && deadPl.length === 0) {
    console.log('\n✅ 冇嘢要清,users.db 原封不動。');
    return;
  }

  // ── 寫入(先 backup)────────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backup = `${USER_DB_PATH}.bak-reconcile-${stamp}`;
  fs.copyFileSync(USER_DB_PATH, backup);
  console.log(`\n📦 已備份:${backup}`);

  for (const f of deadFavs) {
    userDb.run('DELETE FROM favorites WHERE user_id = ? AND hymn_id = ?', [f.user_id, f.hymn_id]);
  }
  for (const p of deadPl) {
    // ⚠️ 唔郁 updated_at:呢個係 LWW 嘅比較欄。推前咗會令 client 手上真.較新
    // 嘅版本被判做 stale 冚走;維持原值,client 下次 pull 就會攞到剪乾淨嘅版本,
    // 而 client 自己之後嘅真改動(updated_at 更新)照樣贏得返。
    userDb.run('UPDATE playlists SET songs_json = ? WHERE user_id = ? AND id = ?', [
      JSON.stringify(p.kept), p.user_id, p.id,
    ]);
  }

  const tmp = `${USER_DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(userDb.export()));
  fs.renameSync(tmp, USER_DB_PATH);
  console.log(`✅ 已清走 ${deadFavs.length} 個死最愛、${deadPl.length} 個清單嘅死歌,並寫返 users.db`);
}

main().catch((e) => { console.error('reconcile 失敗:', e); process.exit(1); });
