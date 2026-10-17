#!/usr/bin/env node
// oneoff-scan611RAW-20260905.mjs — ORG-611-RAW-LANG-REPORT T1:針對性 scan
// @611RAW(entry 見 worshipGroups.js「611 RAW」),budget<=80,sequential
// (concurrency<=2 政策,呢度單一 process 順序行,冇平行)。
//
// Usage: node backend/scripts/oneoff-scan611RAW-20260905.mjs --dry
//        node backend/scripts/oneoff-scan611RAW-20260905.mjs

import { openDb, saveDb, acquireDbLock, releaseDbLock, query } from '../lib/hymnDb.js';
import { scanChannelListing, channelLanguageSanityCheck, validateChannelCandidates } from '../lib/channelScan.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { formatDuration } from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';

const DRY = process.argv.includes('--dry');
const BUDGET = 80;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const group = GROUPS.find((g) => g.name === '611 RAW');
  if (!group) { console.error('worshipGroups.js 搵唔到「611 RAW」entry'); process.exit(1); }

  let token = null;
  if (!DRY) {
    token = await acquireDbLock('scan-611raw');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
  }
  try {
    const db = await openDb();
    const existingIds = new Set(query(db, 'SELECT youtube_id FROM hymns_all').map((r) => r.youtube_id));
    log(`existingIds size=${existingIds.size}`);

    const { listing, fresh } = await scanChannelListing(group.channel, BUDGET, existingIds, { log });
    log(`listing=${listing.length} fresh=${fresh.length}`);
    if (!listing.length) { log('搵唔到 listing,收工'); return; }

    if (!channelLanguageSanityCheck(group, listing, { log })) { log('語言 sanity check 唔過,收工'); return; }

    const { candidates, tried, outcomes, circuitBroken } = await validateChannelCandidates(group, fresh, BUDGET, { log });

    // outcomes breakdown
    const counts = {};
    for (const reason of outcomes.values()) counts[reason] = (counts[reason] || 0) + 1;
    log('outcomes breakdown:', JSON.stringify(counts));
    log(`candidates=${candidates.length} tried=${tried} circuitBroken=${circuitBroken}`);

    let added = 0;
    for (const v of candidates) {
      log(`  ${DRY ? '(--dry,唔寫)' : '寫入'} ${v.id} ${v.title} (${v.duration}s)`);
      if (!DRY) {
        const today = new Date().toISOString().slice(0, 10);
        db.run(
          `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak, duration, org, kids, instrumental)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, 0, 0)`,
          [v.title, cleanDisplayTitle(v.title, group.name), group.name, group.lang, v.id, group.lang, today, formatDuration(v.duration), group.org ?? group.name]
        );
        saveDb(db);
      }
      added++;
    }
    log(`\n總計:candidates=${candidates.length} added(dry=${DRY})=${added}`);
  } finally {
    if (token) releaseDbLock(token);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
