#!/usr/bin/env node
// Builds the curated trial library (Phase 2, target 100-200 songs).
//
// SELECTION LOGIC
//  exclude  dead links (status='dead')
//  exclude  duplicate youtube_ids  (208 groups — same video under many ids)
//  exclude  compilations / full albums (109 — "全碟", "Top 100", 54MB 1.5h files)
//  quota    粵語 30% / 國語 50% / 英文 20%   (Eric's call — HK/TW audience)
//  cap      max N songs per artist (pool is lopsided: Hillsong alone has 116)
//  order    ROUND-ROBIN across artists, not by popularity — because
//           like_count / view_count / featured are ALL ZERO for all 1518 rows,
//           so there is no popularity signal in this DB to rank on. Round-robin
//           maximises artist variety, which is the only quality lever available.
//  verify   every candidate is actually resolved before being curated. A song
//           only makes the library if it PROVED playable. This is what makes
//           the "random 20, all 20 play" acceptance hold.
//
// Verification crawls (concurrency 1, seconds apart): the Mac's residential IP
// is the only IP YouTube still serves, so this must never look like a scraper.
//
// Usage: node scripts/curateLibrary.js [--target 150] [--cap 6] [--delay 3000] [--dry]

import { openDb, saveDb, query, sleep, isCompilation, isNonWorship, dedupeByYoutubeId } from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TARGET = Number(arg('--target', 150));
const CAP = Number(arg('--cap', 6));
const DELAY_MS = Number(arg('--delay', 3000));
const DRY = process.argv.includes('--dry');

const QUOTA = { '粵語': 0.30, '國語': 0.50, '英文': 0.20 };
const today = () => new Date().toISOString().slice(0, 10);

// Round-robin across artists so no single artist dominates and variety is high.
function roundRobinByArtist(rows, cap) {
  const byArtist = new Map();
  for (const r of rows) {
    const a = r.artist || '(unknown)';
    if (!byArtist.has(a)) byArtist.set(a, []);
    byArtist.get(a).push(r);
  }
  for (const list of byArtist.values()) list.sort((a, b) => a.id - b.id);
  const artists = [...byArtist.keys()].sort();
  const out = [];
  for (let round = 0; round < cap; round++) {
    for (const a of artists) {
      const list = byArtist.get(a);
      if (list[round]) out.push(list[round]);
    }
  }
  return out;
}

async function main() {
  const db = await openDb();

  const all = query(db, `SELECT id,title,artist,youtube_id,lang,status FROM hymns_all
                         WHERE youtube_id IS NOT NULL AND youtube_id != ''`);
  const pool = dedupeByYoutubeId(all)
    .filter((r) => !isCompilation(r.title))
    .filter((r) => !isNonWorship(r.title, r.artist))
    .filter((r) => r.status !== 'dead');

  console.log(`pool after exclusions: ${pool.length} (from ${all.length})`);
  console.log(`target ${TARGET}, artist cap ${CAP}, quota ${JSON.stringify(QUOTA)}\n`);

  const picked = [];
  const stats = {};

  for (const [lang, pct] of Object.entries(QUOTA)) {
    const want = Math.round(TARGET * pct);
    const candidates = roundRobinByArtist(pool.filter((r) => r.lang === lang), CAP);
    console.log(`${lang}: want ${want}, ${candidates.length} candidates (after artist cap ${CAP})`);

    let got = 0, tried = 0, failed = 0;
    for (const c of candidates) {
      if (got >= want) break;
      tried++;
      let alive = false;
      try {
        const url = await resolveAudioUrl(c.youtube_id);
        alive = !!(url && url.startsWith('http'));
      } catch (_) { alive = false; }

      if (alive) {
        picked.push(c); got++;
        if (!DRY) db.run(`UPDATE hymns_all SET status='ok', fail_streak=0, last_checked=?, curated=1 WHERE id=?`, [today(), c.id]);
      } else {
        failed++;
        // Don't mark dead here — one failure isn't proof (see checkDeadLinks).
        // Just record the strike and move on; the nightly job settles it.
        if (!DRY) db.run(`UPDATE hymns_all SET fail_streak=fail_streak+1, last_checked=? WHERE id=?`, [today(), c.id]);
      }
      await sleep(DELAY_MS);
    }
    stats[lang] = { want, got, tried, failed };
    console.log(`  -> ${got}/${want} verified (tried ${tried}, ${failed} failed)\n`);
  }

  if (!DRY) {
    saveDb(db);
    console.log('💾 saved hymns.db');
  } else {
    console.log('(dry run — nothing written)');
  }

  console.log('\n=== RESULT ===');
  console.log(`curated: ${picked.length} songs`);
  for (const [l, s] of Object.entries(stats)) {
    const pass = s.tried ? Math.round((s.got / s.tried) * 100) : 0;
    console.log(`  ${l}: ${s.got}/${s.want}  (verify pass rate ${pass}%)`);
  }
  const artistCount = new Set(picked.map((p) => p.artist)).size;
  console.log(`distinct artists: ${artistCount}`);
  db.close();
}

main().catch((e) => { console.error('❌ curation failed:', e.message); process.exit(1); });
