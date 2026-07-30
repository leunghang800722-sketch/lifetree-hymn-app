#!/usr/bin/env node
// 按對帳清單 backfill —— 2026-07-30 Fable 5「逐頻道三數核對」方案配套 script。
// 食 `reconcileChannels.js` 出嘅 `cache/reconcile-missing.json`(每個頻道嘅
// 「欠收-帶內非junk」id 清單,有 title/duration),逐條行四關 pipeline:
//   ① 搜尋 = 清單本身已經有(唔使再問 YouTube 攞 listing)
//   ② 分類/品質篩選 = 重新行多次(防禦性 —— 清單可能係之前跑對帳嗰陣生成,
//      之後 blocklist 加咗新關鍵字,唔可以盲信舊分類)
//   ③ 死鏈驗證 = resolveAudioUrl,同 discover 用一樣嘅斷路器+negative cache
//   ④ 寫入 = 淨係四關都過咗先 INSERT curated=1
// 完全唔依賴 listing window(discoverFromGroup 嗰個「淺層/200條深層」邏輯),
// 淨係食清單,所以唔會再有「頻道歷史片困喺深度上限之下」嘅假枯竭問題。
//
// Usage:
//   node scripts/backfillFromList.js --group "Milk&Honey" --budget 15
//   node scripts/backfillFromList.js --all --budget 15 [--order "CantonHymn,同心圓,新心音樂事工"]
//   node scripts/backfillFromList.js --group X --dry            # 唔寫 DB,睇會做咩
//   node scripts/backfillFromList.js --group X --ignore-office-hours

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  openDb, saveDb, query, sleep, isCompilation, isNonWorship, isInSongDurationBand,
  formatDuration, acquireDbLock, releaseDbLock, isDiscoverCoolingDown,
  recordDiscoverFailure, clearDiscoverFailure,
} from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { GROUPS } from '../data/worshipGroups.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MISSING_CACHE_PATH = path.join(__dirname, '..', 'cache', 'reconcile-missing.json');

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('--budget', 15));
const DELAY_MS = Number(arg('--delay', 4000));
const DRY = process.argv.includes('--dry');
const IGNORE_OFFICE_HOURS = process.argv.includes('--ignore-office-hours');

const OFFICE_HOURS_BLOCK = {
  enforce: true,
  blockedDays: [1, 2, 3, 4, 5, 6],
  startHour: 10, startMinute: 30,
  endHour: 18, endMinute: 30,
};
function isBlockedByOfficeHours(now = new Date()) {
  if (!OFFICE_HOURS_BLOCK.enforce) return false;
  const day = now.getDay();
  if (!OFFICE_HOURS_BLOCK.blockedDays.includes(day)) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMin = OFFICE_HOURS_BLOCK.startHour * 60 + OFFICE_HOURS_BLOCK.startMinute;
  const endMin = OFFICE_HOURS_BLOCK.endHour * 60 + OFFICE_HOURS_BLOCK.endMinute;
  return minutesNow >= startMin && minutesNow < endMin;
}

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

async function backfillGroup(db, group, list, budget) {
  const existing = new Set(query(db, `SELECT youtube_id FROM hymns_all`).map((r) => r.youtube_id));
  let added = 0, tried = 0, skipped = 0, streak = 0;

  for (const v of list) {
    if (tried >= budget) break;
    if (!v.id || existing.has(v.id)) { skipped++; continue; } // discover/curate 可能啱啱先收咗
    if (isDiscoverCoolingDown(v.id)) { skipped++; continue; }

    // 防禦性重新分類 —— 清單可能舊咗(見檔頭註解)。
    if (v.duration != null && !isInSongDurationBand(v.duration, group.durationCapSec)) { skipped++; continue; }
    if (isCompilation(v.title) || isNonWorship(v.title, group.name)) { skipped++; continue; }

    tried++;
    log(`  驗證中 [${group.lang}] ${group.name} — ${v.title}`);
    let alive = false;
    try { alive = !!(await resolveAudioUrl(v.id)); } catch (_) {}

    if (!alive) {
      streak++;
      recordDiscoverFailure(v.id);
      log(`    ✗ 拎唔到音訊,跳過 (連續失敗 ${streak})`);
      if (streak >= 3) {
        log('  連續 3 次失敗 —— 呢個頻道今次 backfill 收工唔博。');
        break;
      }
      if (tried < budget) await sleep(jitter(DELAY_MS));
      continue;
    }
    streak = 0;
    clearDiscoverFailure(v.id);

    if (!DRY) {
      db.run(
        `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak, duration)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?)`,
        [v.title, cleanDisplayTitle(v.title, group.name), group.name, group.lang, v.id, group.lang, today(), formatDuration(v.duration)]
      );
      saveDb(db);
    }
    added++;
    log(`    ✓ 收錄 (累計 +${added})`);
    if (tried < budget) await sleep(jitter(DELAY_MS));
  }

  log(`  ${group.name}:清單 ${list.length} 條,試咗 ${tried} 條(跳過 ${skipped} 條已存在/冷卻/唔啱格式),收錄 ${added} 首`);
  return { added, tried, skipped };
}

async function main() {
  if (isBlockedByOfficeHours() && !IGNORE_OFFICE_HOURS) {
    log('喺辦公時間封鎖窗(平日 10:30-18:30)入面,唔做嘢。');
    return;
  }

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(MISSING_CACHE_PATH, 'utf8'));
  } catch (e) {
    console.error(`讀唔到 ${MISSING_CACHE_PATH} —— 先行 reconcileChannels.js`);
    process.exit(1);
  }

  const groupArg = arg('--group', null);
  const all = process.argv.includes('--all');
  const orderArg = arg('--order', null);

  let names;
  if (groupArg) names = [groupArg];
  else if (all) names = orderArg ? orderArg.split(',') : Object.keys(cache);
  else { console.error('用法:--group "團體名" | --all [--order "A,B,C"]'); process.exit(1); }

  let lockToken = null;
  try {
    lockToken = await acquireDbLock('backfillFromList');
    if (!lockToken) { log('攞唔到 DB 鎖,今次跳過。'); return; }
    const db = await openDb();

    let totalAdded = 0;
    for (const name of names) {
      const entry = cache[name];
      if (!entry) { log(`⚠ cache 入面搵唔到「${name}」,先行 reconcileChannels.js --group "${name}"`); continue; }
      const group = GROUPS.find((g) => g.name === name);
      if (!group) { log(`⚠ worshipGroups.js 搵唔到「${name}」`); continue; }
      log(`backfill:${name}(欠收清單 ${entry.missing.length} 條),額度 ${BUDGET}`);
      const r = await backfillGroup(db, group, entry.missing, BUDGET);
      totalAdded += r.added;
    }
    log(`--- 總共收錄 ${totalAdded} 首 ---`);
  } finally {
    releaseDbLock(lockToken);
  }
}

main().catch((e) => { console.error('backfillFromList 出錯:', e); process.exit(1); });
