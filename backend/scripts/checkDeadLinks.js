#!/usr/bin/env node
// Nightly dead-link checker.
//
// WHY IT CRAWLS: the Mac's residential IP is the only IP left that YouTube
// still serves (Zeabur's is IP-banned — verified across 8 player_clients, it's
// reputation-based, not rate-based). If this job gets that IP flagged, the
// whole app dies with no fallback. So: concurrency 1, seconds between songs,
// a small slice per night. ~10 min/night, invisible next to normal traffic.
//
// WHY 3 STRIKES: the old hymn-check-report claimed 650/665 songs were broken
// ("2.3% playable") and steered the project for weeks — but 592 of those were
// Timeouts, i.e. the checker rate-limiting itself. One failure means nothing.
// A song is only marked dead after failing 3 checks on 3 DIFFERENT days.
// Success is asymmetric: one success is proof of life and clears the streak.
//
// Usage: node scripts/checkDeadLinks.js [--limit N] [--delay MS] [--ids 1,2,3]

import { openDb, saveDb, query, sleep, DB_PATH } from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const LIMIT = Number(arg('--limit', 150));
const DELAY_MS = Number(arg('--delay', 3000));
const ONLY_IDS = arg('--ids', null);
const DEAD_AFTER = 3; // consecutive failures, each on a different day

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const db = await openDb();

  let targets;
  if (ONLY_IDS) {
    const ids = ONLY_IDS.split(',').map((s) => Number(s.trim())).filter(Boolean);
    targets = query(db, `SELECT id, youtube_id, title, status, fail_streak, last_checked
                         FROM hymns_all WHERE id IN (${ids.join(',')})`);
  } else {
    // Least-recently-checked first, so the whole library rotates on its own
    // (~10 nights for 1518 songs at 150/night). Never-checked sorts first
    // because NULL is lowest.
    targets = query(db, `SELECT id, youtube_id, title, status, fail_streak, last_checked
                         FROM hymns_all
                         WHERE youtube_id IS NOT NULL AND youtube_id != ''
                           AND (last_checked IS NULL OR last_checked != ?)
                         ORDER BY last_checked ASC NULLS FIRST, id ASC
                         LIMIT ?`, [today(), LIMIT]);
  }

  if (!targets.length) {
    console.log(`[${today()}] nothing to check (all done today)`);
    db.close();
    return;
  }

  console.log(`[${today()}] checking ${targets.length} songs @ ${DELAY_MS}ms apart, concurrency 1`);
  let ok = 0, failed = 0, newlyDead = 0, revived = 0;

  for (const t of targets) {
    let alive = false;
    try {
      const url = await resolveAudioUrl(t.youtube_id);
      alive = !!(url && url.startsWith('http'));
    } catch (_) {
      alive = false;
    }

    if (alive) {
      ok++;
      if (t.status === 'dead') { revived++; console.log(`  ♻️  revived: ${t.id} ${t.title}`); }
      // One success is enough — clear the streak and mark alive.
      db.run(`UPDATE hymns_all SET status='ok', fail_streak=0, last_checked=? WHERE id=?`, [today(), t.id]);
    } else {
      failed++;
      const streak = (t.fail_streak || 0) + 1;
      const dead = streak >= DEAD_AFTER;
      if (dead && t.status !== 'dead') { newlyDead++; console.log(`  ☠️  dead (${streak} strikes): ${t.id} ${t.title}`); }
      db.run(`UPDATE hymns_all SET status=?, fail_streak=?, last_checked=? WHERE id=?`,
             [dead ? 'dead' : (t.status === 'dead' ? 'dead' : 'unchecked'), streak, today(), t.id]);
    }

    await sleep(DELAY_MS);
  }

  saveDb(db);

  const tot = query(db, `SELECT status, COUNT(*) c FROM hymns_all GROUP BY status`);
  console.log(`[${today()}] done: ${ok} ok, ${failed} failed, ${newlyDead} newly dead, ${revived} revived`);
  console.log(`[${today()}] library: ${JSON.stringify(tot)}`);
  console.log(`[${today()}] wrote ${DB_PATH}`);
  db.close();
}

main().catch((e) => { console.error('❌ checker failed:', e.message); process.exit(1); });
