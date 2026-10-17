#!/usr/bin/env node
// One-off migration: add the columns dead-link detection + curation need.
//
// IMPORTANT: sql.js is an in-memory DB. The running server loads hymns.db once
// at boot and NEVER writes back, so any script that mutates data must export()
// and write the file itself — that's what this does. The server only picks the
// changes up on restart.
//
// Safe to run repeatedly: each ALTER is guarded, so re-running is a no-op.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'hymns.db');

const COLUMNS = [
  // 'ok' = verified resolvable, 'dead' = failed 3 separate days, 'unchecked' = never tested
  ["status", "TEXT DEFAULT 'unchecked'"],
  ["last_checked", "TEXT"],
  // consecutive failed checks; reset to 0 on any success. Only 3+ marks dead —
  // a single failure is NOT trustworthy (the old "2.3% playable" report was
  // 592 self-inflicted timeouts, and it misled the project for weeks).
  ["fail_streak", "INTEGER DEFAULT 0"],
  // 1 = part of the curated trial library the app actually serves
  ["curated", "INTEGER DEFAULT 0"],
];

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // back up before touching anything
  const backup = `${DB_PATH}.bak-${new Date().toISOString().slice(0, 10)}`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(DB_PATH, backup);
    console.log(`📦 backup -> ${path.basename(backup)}`);
  }

  const existing = new Set();
  const info = db.prepare("PRAGMA table_info(hymns)");
  while (info.step()) existing.add(info.getAsObject().name);
  info.free();

  let added = 0;
  for (const [name, def] of COLUMNS) {
    if (existing.has(name)) { console.log(`   = ${name} (already there)`); continue; }
    db.run(`ALTER TABLE hymns ADD COLUMN ${name} ${def}`);
    console.log(`   + ${name}`);
    added++;
  }

  if (added > 0) {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`✅ wrote ${added} new column(s) to hymns.db`);
  } else {
    console.log('✅ nothing to do');
  }
  db.close();
}

main().catch((e) => { console.error('❌ migration failed:', e.message); process.exit(1); });
