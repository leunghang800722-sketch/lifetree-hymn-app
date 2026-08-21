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
// Usage:
//   node scripts/regenerateDisplayTitles.js [--dry-run] [--diff-csv=<path>]
//
// --diff-csv writes id,artist,before,after for every row whose display_title
// would change (before = the CURRENTLY STORED display_title, not the raw
// title) — the before/after evidence trail for a rule-change review, works
// the same whether combined with --dry-run or a real run.
//
// Rows an admin has hand-edited (per logs/admin-audit.log) are protected from
// being overwritten by this regen — see ADMIN_EDITED_IDS below.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, DB_PATH, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const diffCsvArg = process.argv.find((a) => a.startsWith('--diff-csv='));
const DIFF_CSV_PATH = diffCsvArg ? diffCsvArg.slice('--diff-csv='.length) : null;

// Built from `grep '"action":"edit"' logs/admin-audit.log` filtered to entries
// that touch `display_title` (2026-08-21 audit ahead of the title-normalization
// A-level cleanup — see TITLE-NORMALIZATION-PLAN-20260821.md §5 R1). Regen must
// never clobber a value a human deliberately typed in over the machine-cleaned
// one. Re-derive this list (see scripts/README or the plan doc for the one-
// liner) if regenerating long after new admin edits have landed.
const ADMIN_EDITED_IDS = new Set([1, 434, 716, 740]);

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  const rows = query(db, `SELECT id, title, artist, display_title FROM hymns_all`);
  let shortened = 0;
  let changedFromStored = 0;
  let skippedAdminEdited = 0;
  const diffRows = [];

  for (const r of rows) {
    if (ADMIN_EDITED_IDS.has(r.id)) {
      skippedAdminEdited++;
      continue;
    }
    const dt = cleanDisplayTitle(r.title, r.artist);
    if (dt !== r.title) shortened++;
    if (dt !== r.display_title) {
      changedFromStored++;
      diffRows.push({ id: r.id, artist: r.artist, before: r.display_title, after: dt });
      if (!DRY_RUN) db.run(`UPDATE hymns_all SET display_title=? WHERE id=?`, [dt, r.id]);
    }
  }

  console.log(`${rows.length} rows scanned, ${skippedAdminEdited} skipped (admin-edited, protected), ${shortened} shortened from raw title, ${changedFromStored} changed from currently-stored display_title${DRY_RUN ? ' (dry run — nothing written)' : ''}`);

  if (DIFF_CSV_PATH) {
    const outPath = path.isAbsolute(DIFF_CSV_PATH) ? DIFF_CSV_PATH : path.join(__dirname, '..', DIFF_CSV_PATH);
    const lines = ['id,artist,before,after', ...diffRows.map((d) => [d.id, csvField(d.artist), csvField(d.before), csvField(d.after)].join(','))];
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
    console.log(`wrote diff CSV (${diffRows.length} rows) to ${outPath}`);
  }

  if (!DRY_RUN) {
    saveDb(db);
    console.log(`wrote ${DB_PATH}`);
  }
  db.close();
}

main();
