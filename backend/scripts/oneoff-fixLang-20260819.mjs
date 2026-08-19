#!/usr/bin/env node
// 一次性:修正三首歌嘅 lang 分類(Eric 2026-08-19 拍板,由 R1 國語線 17:39 提出)。
//
//   5619 Come Away with Me(讚美之泉)國語 → 英文
//        剷走經文卡之後純英文零中文,係讚美之泉嘅英文 track 但一直標咗國語。
//   7872 投靠者的謳咾(天韻合唱團)國語 → 台語
//        實錘台語(「叼一位君王親像祢」「祢佇寶座頂作王」),而且 R1 喺 7704
//        揾到佢嘅國語版逐句對得返 = 同一首歌兩個語言版本。
//   8084 耶穌的手 —— **唔郁**,見下面。
//
// ⚠️ 台語呢個值係全新嘅:`backend/routes/category.js` 六處硬編咗
// lang IN ('國語','粵語') / = '國語' / = '粵語' / = '英文',所以單淨改 DB
// **會令首歌由所有分類頁消失**(只剩搜尋揾得返)。所以呢個 script 要**連同
// category.js 加入 '台語' 一齊上**(已改:中文名分類同「全部中文」兩處),
// 咁 7872 就會照樣出現喺中文名分類,但唔會混入「國語詩歌」——分類先至啱。
//
// 用法:node scripts/oneoff-fixLang-20260819.mjs [--dry]

import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const DRY = process.argv.includes('--dry');
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const CHANGES = [
  { id: 5619, from: '國語', to: '英文', why: '剷走經文卡後純英文零中文(讚美之泉英文 track)' },
  { id: 7872, from: '國語', to: '台語', why: '實錘台語;國語版係 7704,兩個語言版本' },
];

const token = await acquireDbLock('oneoff-fixLang');
if (!token) { log('⛔ 攞唔到 DB 鎖'); process.exit(1); }
try {
  const db = await openDb();
  for (const c of CHANGES) {
    const r = query(db, `SELECT id, title, lang, lyrics_status FROM hymns_all WHERE id=?`, [c.id])[0];
    if (!r) { log(`✗ ${c.id} 揾唔到`); continue; }
    if (r.lang !== c.from) { log(`· skip ${c.id}:而家 lang=${r.lang} 唔係預期嘅 ${c.from}(可能有人改咗)`); continue; }
    if (!DRY) db.run(`UPDATE hymns_all SET lang=? WHERE id=?`, [c.to, c.id]);
    log(`${DRY ? '[dry] 會改' : '✓ 改咗'} ${c.id} ${String(r.title).slice(0, 30)}:${c.from} → ${c.to}(${c.why})`);
  }
  if (!DRY) saveDb(db);
  log(`${DRY ? '[dry] ' : ''}完成`);
} finally { releaseDbLock(token); }
