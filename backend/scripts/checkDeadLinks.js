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

import { openDb, saveDb, query, sleep, DB_PATH, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
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
  // growLibrary.js 而家 24 小時、每 15-20 分鐘行一次(2026-07-21 起),同呢個
  // job 撞埋嘅機會大好多 —— 兩個 script 都係「讀成個 DB 落記憶體、跑完先寫」,
  // 冇鎖嘅話遲寫嗰個會靜靜哋蓋咗早寫嗰個嘅嘢。攞唔到鎖就跳過呢次,留返俾
  // 下一次排程,唔好死等做成排程塞車。
  const lockToken = await acquireDbLock('checkDeadLinks');
  if (!lockToken) {
    console.log(`[${today()}] 攞唔到 DB 鎖(俾 growLibrary 用緊),今次跳過,聽日/下次再嚟`);
    return;
  }
  try {
    await runCheck();
  } finally {
    // 2026-07-23:releaseDbLock 而家要 token 校對啱先真係刪(見 hymnDb.js),
    // 防止唔小心刪走第二個 process 合法持有嘅鎖。
    releaseDbLock(lockToken);
  }
}

async function runCheck() {
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

    // ⚠️ 2026-08-01 Opus 5 驗收 MEMBERSHIP-PHASE2-ADMIN-PLAN 揪出嘅範圍性問題:
    // 呢個 job 每晚 4 點行、按 last_checked 由舊到新輪替全庫,之前完全冇理
    // status='rejected'——成功分支硬寫 'ok'、失敗分支硬寫 'unchecked'/'dead',
    // 兩條路都會將 admin 落架 / 內容清理判死嘅歌洗走翻生(同 growLibrary.js
    // usablePool() 嗰單一樣嘅根因,但呢度影響全庫現有 213 行 rejected——
    // 7/27+7/30 兩輪 Eric 叫人做嘅內容清理成果,唔淨係 Phase2 新落架嘅歌)。
    // 'rejected' 係內容判死嘅終態,同「條鏈生唔生」係兩件獨立事,checkDeadLinks
    // 淨係負責後者——條鏈生死點都好,rejected 都要維持 rejected。
    const preserveRejected = t.status === 'rejected';
    if (alive) {
      ok++;
      if (t.status === 'dead') { revived++; console.log(`  ♻️  revived: ${t.id} ${t.title}`); }
      // One success is enough — clear the streak and mark alive(rejected 除外)。
      db.run(`UPDATE hymns_all SET status=?, fail_streak=0, last_checked=? WHERE id=?`,
             [preserveRejected ? 'rejected' : 'ok', today(), t.id]);
    } else {
      failed++;
      const streak = (t.fail_streak || 0) + 1;
      const dead = streak >= DEAD_AFTER;
      if (dead && t.status !== 'dead' && !preserveRejected) { newlyDead++; console.log(`  ☠️  dead (${streak} strikes): ${t.id} ${t.title}`); }
      const newStatus = preserveRejected ? 'rejected' : (dead ? 'dead' : (t.status === 'dead' ? 'dead' : 'unchecked'));
      db.run(`UPDATE hymns_all SET status=?, fail_streak=?, last_checked=? WHERE id=?`,
             [newStatus, streak, today(), t.id]);
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
