#!/usr/bin/env node
// 逐頻道三數核對(人手 CLI)—— 2026-07-30 Fable 5「逐頻道三數核對」方案(docs/
// SUPERVISION-LOG.md 07-30「📐」條目)。之前嘅「假枯竭審計」只掃 /videos 分頁,
// 漏咗 /streams、/shorts,亦冇跟官方數對過(枚舉幾多就信幾多)。呢個 script
// 三數互相核對,冇一個數係估。實際邏輯喺 `lib/reconcileCore.js`(同
// `growLibrary.js` 嘅自動每日 incremental reconcile 共用)。
//
// 輸出:per-channel 對帳表 + 「欠收-帶內非junk」id 清單(有 title/duration),
// 寫入 cache/reconcile-missing.json 俾 backfillFromList.js/growLibrary.js Tier 1 食;
// 人睇嘅摘要 print 出嚟,執行 session 自己 append 落 SUPERVISION-LOG.md。
//
// Usage:
//   node scripts/reconcileChannels.js --group "CantonHymn"
//   node scripts/reconcileChannels.js --all [--only-lang 粵語]

import { openDb } from '../lib/hymnDb.js';
import { reconcileGroup, loadMissingCache, saveMissingCache, MISSING_CACHE_PATH } from '../lib/reconcileCore.js';
import { GROUPS } from '../data/worshipGroups.js';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

function printReport(r) {
  const tabStr = Object.entries(r.byTab).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  官方數:${r.official ?? '?'}  枚舉:${r.enumerated}(${tabStr})  差:${r.diff ?? '?'} ${r.tolOk ? '✓' : '⚠️ 超容差'}`);
  console.log(`  curated✓${r.counts.curated} / rejected${r.counts.rejected} / dead${r.counts.dead} / 已喺backlog${r.counts['unchecked-inDB']} / 欠收-帶內${r.counts['missing-inband']} / 欠收-帶外或junk${r.counts['missing-outband-or-junk']}`);
}

async function main() {
  const db = await openDb();
  const groupArg = arg('--group', null);
  const onlyLang = arg('--only-lang', null);
  const all = process.argv.includes('--all');

  let targets;
  if (groupArg) {
    const g = GROUPS.find((x) => x.name === groupArg);
    if (!g || !g.channel) { console.error(`揾唔到「${groupArg}」或者佢冇 channel`); process.exit(1); }
    targets = [g];
  } else if (all) {
    targets = GROUPS.filter((g) => g.priority <= 4 && g.channel && g.lang !== '英文'
      && !(g.lang === '兒童' && g.kidsLang === '英文'));
    if (onlyLang) targets = targets.filter((g) => g.lang === onlyLang);
  } else {
    console.error('用法:--group "團體名" | --all [--only-lang 粵語]');
    process.exit(1);
  }

  const reports = [];
  for (const g of targets) {
    console.log(`\n[核對中] ${g.name} …`);
    try {
      const r = await reconcileGroup(db, g);
      reports.push(r);
      printReport(r);
    } catch (e) {
      console.log(`  ⚠ 出錯:${e?.message || e}`);
      reports.push({ name: g.name, channel: g.channel, error: e?.message || String(e) });
    }
  }

  console.log('\n\n========== 對帳表總覽 ==========');
  console.log('頻道'.padEnd(16), '官方', '枚舉', '差', 'curated', 'rejected', 'dead', 'backlog', '欠收帶內', '欠收帶外/junk');
  for (const r of reports) {
    if (r.error) { console.log(`${r.name}: ⚠ ${r.error}`); continue; }
    console.log(
      r.name.padEnd(16),
      String(r.official ?? '?').padStart(4),
      String(r.enumerated).padStart(4),
      String(r.diff ?? '?').padStart(4),
      String(r.counts.curated).padStart(7),
      String(r.counts.rejected).padStart(8),
      String(r.counts.dead).padStart(4),
      String(r.counts['unchecked-inDB']).padStart(7),
      String(r.counts['missing-inband']).padStart(8),
      String(r.counts['missing-outband-or-junk']).padStart(10),
    );
  }

  // 寫低「欠收-帶內非junk」清單俾 backfillFromList.js/growLibrary.js Tier 1 食,
  // 順手記低 officialCount 俾自動 incremental reconcile 做平嘅「有冇變」對比。
  const existing = loadMissingCache();
  for (const r of reports) {
    if (r.error) continue;
    existing[r.name] = {
      updatedAt: new Date().toISOString(),
      channel: r.channel,
      lang: r.lang,
      officialCount: r.official,
      missing: r.missing.map((v) => ({ id: v.id, title: v.title, duration: v.duration })),
    };
  }
  saveMissingCache(existing);
  console.log(`\n已寫入 ${MISSING_CACHE_PATH}`);
}

main().catch((e) => { console.error('reconcileChannels 出錯:', e); process.exit(1); });
