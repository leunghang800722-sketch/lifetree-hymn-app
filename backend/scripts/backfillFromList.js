#!/usr/bin/env node
// 按對帳清單 backfill —— 2026-07-30 Fable 5「逐頻道三數核對」方案配套 script。
// 食 `reconcileChannels.js` 出嘅 `cache/reconcile-missing.json`(每個頻道嘅
// 「欠收-帶內非junk」id 清單,有 title/duration),逐條行四關 pipeline。
// 完全唔依賴 listing window(discoverFromGroup 嗰個「淺層/200條深層」邏輯),
// 淨係食清單,所以唔會再有「頻道歷史片困喺深度上限之下」嘅假枯竭問題。
//
// ⚠️ 2026-07-31 Fable 5 結構性修復:實際嘅四關邏輯搬咗去 `lib/backfillCore.js`
// (`backfillGroupFromList`),同 `growLibrary.js` 嘅自動 Tier 1 共用**同一份**
// code path,唔好維護兩套。呢個 script 而家淨係做 CLI 包裝(讀清單/揀頻道/
// 攞鎖/report),人手驗證/一次性大額度 backfill 用。
//
// Usage:
//   node scripts/backfillFromList.js --group "Milk&Honey" --budget 15
//   node scripts/backfillFromList.js --all --budget 15 [--order "CantonHymn,同心圓,新心音樂事工"]
//   node scripts/backfillFromList.js --group X --dry            # 唔寫 DB,睇會做咩
//   node scripts/backfillFromList.js --group X --ignore-office-hours

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { backfillGroupFromList } from '../lib/backfillCore.js';
import { GROUPS } from '../data/worshipGroups.js';

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

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

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
      const r = await backfillGroupFromList(db, group, entry.missing, BUDGET, { delayMs: DELAY_MS, dry: DRY, log });
      totalAdded += r.added;
    }
    log(`--- 總共收錄 ${totalAdded} 首 ---`);
  } finally {
    releaseDbLock(lockToken);
  }
}

main().catch((e) => { console.error('backfillFromList 出錯:', e); process.exit(1); });
