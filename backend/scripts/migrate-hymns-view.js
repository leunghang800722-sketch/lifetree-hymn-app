#!/usr/bin/env node
// Makes the API serve ONLY the curated, non-dead library — without touching the
// ~20 scattered `SELECT ... FROM hymns` queries across server.js, home.js,
// category.js and search.js.
//
// HOW: rename the real table to `hymns_all`, then create a VIEW named `hymns`
// that filters it. Every existing query keeps working verbatim and is filtered
// automatically.
//
// WHY a view instead of editing each query: there are ~20 read sites. Missing
// even one leaks a dead/non-curated song to the app — and that's worse than it
// sounds: the app's handlePlayHymn does
//     list.findIndex(s => s.id === h.id)  ->  Math.max(0, idx)
// against /api/hymns, so a song that shows on Home but ISN'T in /api/hymns
// resolves to -1 -> index 0 and silently PLAYS THE WRONG SONG. A view makes
// that class of inconsistency impossible.
//
// NOTE FOR FUTURE WORK:
//   * reads  -> `hymns`      (filtered view: curated=1 AND status!='dead')
//   * writes -> `hymns_all`  (the real table; views aren't writable)
//   The maintenance scripts (checkDeadLinks / curateLibrary) target hymns_all.
//   The server only ever reads, so it's unaffected.
//
// Safe to re-run.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'hymns.db');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const backup = `${DB_PATH}.bak-view-${Date.now()}`;
  fs.copyFileSync(DB_PATH, backup);
  console.log(`📦 backup -> ${path.basename(backup)}`);

  const objs = [];
  const st = db.prepare("SELECT type,name FROM sqlite_master WHERE name IN ('hymns','hymns_all')");
  while (st.step()) objs.push(st.getAsObject());
  st.free();
  const has = (n, t) => objs.some((o) => o.name === n && o.type === t);

  if (has('hymns', 'view') && has('hymns_all', 'table')) {
    console.log('✅ already migrated (hymns is a view over hymns_all)');
    db.close();
    return;
  }

  if (!has('hymns_all', 'table')) {
    db.run('ALTER TABLE hymns RENAME TO hymns_all');
    console.log('   renamed table hymns -> hymns_all');
  }
  db.run('DROP VIEW IF EXISTS hymns');
  db.run(`CREATE VIEW hymns AS SELECT * FROM hymns_all WHERE curated = 1 AND status != 'dead'`);
  console.log("   created view hymns = hymns_all WHERE curated=1 AND status!='dead'");

  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, DB_PATH);
  db.close();

  // verify against a fresh read
  const db2 = new SQL.Database(fs.readFileSync(DB_PATH));
  const one = (s) => { const q = db2.prepare(s); q.step(); const v = Object.values(q.getAsObject())[0]; q.free(); return v; };
  console.log(`\n✅ verify: hymns_all=${one('SELECT COUNT(*) FROM hymns_all')} rows, hymns(view)=${one('SELECT COUNT(*) FROM hymns')} rows`);
  db2.close();
}

main().catch((e) => { console.error('❌ failed:', e.message); process.exit(1); });
