#!/usr/bin/env node
// One-off (re-runnable) batch job: fills `hymns_all.display_title` from the
// raw YouTube `title` using lib/displayTitle.js's cleanDisplayTitle(). Doesn't
// touch `title` itself — that stays the raw scrape for search/matching.
//
// Fast + no network calls (pure string regex), so unlike checkDeadLinks /
// growLibrary this doesn't need the "probe without the lock, then reopen
// fresh" dance from hymnDb.js — the whole run is milliseconds, well under
// any stale-lock window.
//
// Usage: node scripts/regenerateDisplayTitles.js [--dry-run]

import { openDb, saveDb, query, DB_PATH, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const lockToken = await acquireDbLock('regenerateDisplayTitles');
  if (!lockToken) {
    console.log('攞唔到 DB 鎖,聽日/手動再試');
    process.exitCode = 1;
    return;
  }
  try {
    await run();
  } finally {
    releaseDbLock(lockToken);
  }
}

async function run() {
  const db = await openDb();

  const cols = query(db, `PRAGMA table_info(hymns_all)`);
  if (!cols.some((c) => c.name === 'display_title')) {
    console.log('adding hymns_all.display_title column');
    db.run(`ALTER TABLE hymns_all ADD COLUMN display_title TEXT DEFAULT ''`);
  }

  const rows = query(db, `SELECT id, title, artist FROM hymns_all`);
  let changed = 0;
  for (const r of rows) {
    const dt = cleanDisplayTitle(r.title, r.artist);
    if (!DRY_RUN) db.run(`UPDATE hymns_all SET display_title=? WHERE id=?`, [dt, r.id]);
    if (dt !== r.title) changed++;
  }

  console.log(`${rows.length} rows processed, ${changed} shortened${DRY_RUN ? ' (dry run — nothing written)' : ''}`);

  if (!DRY_RUN) {
    saveDb(db);
    console.log(`wrote ${DB_PATH}`);
  }
  db.close();
}

main();
