#!/usr/bin/env node
// 一般詩歌「官方目錄對比」P3 —— CATALOG-GAP-PLAN-20260824.md §3 P3
//
// 攞 P2 認到嘅片入庫。**唔用自己寫嘅 INSERT** —— 直接行 `lib/backfillCore.js`
// 個 `backfillGroupFromList()`,即係 growLibrary 自動線同 backfillFromList
// 人手工具共用嗰條 code path(收錄四關:分類/品質篩選 → 死鏈驗證 →
// curated=1 INSERT)。呢條路已經行過無數次,唔好再開第二條。
//
// 入完之後第二 pass 補 `album`(backfillGroupFromList 唔收 album 參數)。
//
// Eric 2026-08-24 拍板:Q3 唔收另一版本 · Q4 非敬拜唔收 · Q5 官方頻道冇上載唔收
//
// 用法:node scripts/catalogGapApply.mjs [--dry] [--limit N]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { backfillGroupFromList } from '../lib/backfillCore.js';
import { GROUPS } from '../data/worshipGroups.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'catalog-gap');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const SRC = arg('--src', path.join(DATA_DIR, 'p3-final.json'));

const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const items = JSON.parse(fs.readFileSync(SRC, 'utf8'));
log(`輸入 ${items.length} 條`);

const byOrg = new Map();
for (const it of items) { if (!byOrg.has(it.org)) byOrg.set(it.org, []); byOrg.get(it.org).push(it); }

const db = await openDb();
const before = query(db, "SELECT COUNT(*) n FROM hymns_all WHERE curated=1 AND status='ok'")[0].n;
log(`入庫前 curated ok:${before}`);

const applied = [];
for (const [org, list] of byOrg) {
  const group = GROUPS.find((g) => g.name === org || (g.aliases || []).includes(org));
  if (!group) { log(`⚠ ${org}:worshipGroups.js 搵唔到,skip ${list.length} 條`); continue; }
  const slice = list.slice(0, Math.min(list.length, LIMIT === Infinity ? list.length : LIMIT));
  log(`▶ ${org}:${slice.length} 條`);
  // backfillGroupFromList 要 {id,title,duration}
  const payload = slice.map((x) => ({ id: x.id, title: x.title, duration: x.duration }));
  const r = await backfillGroupFromList(db, group, payload, payload.length, { dry: DRY, delayMs: 2500, log: (m) => log(m) });
  log(`  ${org}:收錄 ${r.added} / 試 ${r.tried} / 跳過 ${r.skipped}`);
  if (!DRY) for (const x of slice) applied.push(x);
}

// ── 第二 pass:補 album(鎖內零網絡)────────────────────────────────
if (!DRY && applied.length) {
  const token = await acquireDbLock('catalogGapApply-album');
  if (token) {
    try {
      const d2 = await openDb();
      let n = 0;
      for (const x of applied) {
        if (!x.album) continue;
        const rows = query(d2, 'SELECT id, album FROM hymns_all WHERE youtube_id = ?', [x.id]);
        for (const row of rows) {
          if (row.album && row.album.trim()) continue;   // 唔覆寫已有 album
          d2.run('UPDATE hymns_all SET album = ?, album_source = ? WHERE id = ?', [x.album, 'itunes-catalog', row.id]);
          n++;
        }
      }
      if (n) { saveDb(d2); log(`album 補咗 ${n} 條`); }
    } finally { releaseDbLock(token); }
  } else log('⚠ 攞唔到鎖,album 補唔到(唔影響已入庫嘅歌)');
}

const db3 = await openDb();
const after = query(db3, "SELECT COUNT(*) n FROM hymns_all WHERE curated=1 AND status='ok'")[0].n;
log(`入庫後 curated ok:${after}(淨增 ${after - before})`);
if (!DRY) {
  fs.writeFileSync(path.join(DATA_DIR, `applied-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`),
    JSON.stringify(applied, null, 2), 'utf8');
}
