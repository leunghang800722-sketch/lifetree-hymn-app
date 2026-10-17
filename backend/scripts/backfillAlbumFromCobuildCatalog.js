#!/usr/bin/env node
// backfillAlbumFromCobuildCatalog.js —— CantonHymn「恢復粵語敬拜共建專輯」系列。
//
// ── 點解要獨立一個 script ────────────────────────────────────────────
// 2026-08-11 個 cantonhymn attempt report 結論係「CantonHymn 冇 discography」
// ——**呢個結論冇錯**,但漏咗一樣嘢:佢個共建專輯系列係**合輯**,每首歌
// 掛喺**唔同機構/堂會**名下(角聲使團/HKACM/Milk&Honey/原始和聲/鹹蛋/
// Son Music/小羊詩歌…)。即係話呢批 album 資料唔應該淨係對 org='CantonHymn'
// 去搵,要**跨 org 對全庫**。
//
// 資料源:CantonHymn 官方 YouTube「全碟試聽」片嘅 description 逐曲清單
// (共建專輯四 44eHkhXUrZQ 14 首、五 j8HDqpqTlTM 12 首;二 GCRn3-3Ti-8 同
// 一 aD-VS0eaxSs 只攞到部分,catalog 入面標 partial:true)。
// 專輯(三)「愛濤」搵唔到任何逐曲清單,冇收錄。
//
// ── 匹配規則(寧空莫錯)────────────────────────────────────────────
//   · 呢啲歌名好多係好通用嘅詞(「一」「使命」「尋找」「呼喚」「傾倒」),
//     **唔可以用 substring**,否則「一」會撞中 514 首。所以只接受:
//     normalize 後**完全相等**,或者歌名喺標題**開頭**,或者緊跟住
//     `|` / `｜` / `[` / `【` 呢類分隔符(YouTube 標題慣用格式)。
//   · 撞到多過一隻專輯 → 唔寫。
//   · DB 已有 album / album_source=manual|legacy → 唔覆寫。
//   · 寫入 album_source='description'(證據係 YouTube description 逐曲清單)。
//
// Usage:
//   node scripts/backfillAlbumFromCobuildCatalog.js --dry
//   node scripts/backfillAlbumFromCobuildCatalog.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'cantonhymn-cobuild-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'cantonhymn-cobuild-report.md');
const DRY = process.argv.includes('--dry');

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const norm = (s) => String(s || '')
  .replace(/[\s　（）()【】\[\]｜|｛｝{}、,，。.:：!！?？'"“”‘’~～\-—_·・\/]/g, '')
  .toLowerCase();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ⚠️ 2026-08-17 教訓:呢個合輯好多歌名係極通用嘅詞(「一」「使命」「尋找」
// 「呼喚」「傾倒」「憐憫」)。第一版用 `title.startsWith(歌名)` 出咗 28 個
// 候選,人手一睇 22 個係垃圾(「一」撞中「一生奉獻」「一公分的心跳」
// 「一位母親的付出」…)。所以而家收緊兩重:
//   ① 歌名要係**完整 token**——前後都要係開頭/結尾或者分隔符,唔可以做
//      另一個詞嘅前綴;歌名短過 3 個字就**淨准全標題完全相等**。
//   ② 仲要**演出單位對得上**——合輯逐首歌掛唔同機構名下,catalog 有
//      performer 欄,要同 DB 個 row 嘅 org 對得上先算數。冇咗呢重,
//      KEC 自己 cover 嘅〈傾倒〉會被當成專輯(二)嗰首讚美之泉授權版。
const DELIM = '\\s|\\[|\\]|【|】|\\(|\\)|（|）|｜|\\||／|\\/|、|,|，|。|:|：|-|—|_|·|・';

function titleMatches(rowTitle, trackTitle) {
  const t = norm(rowTitle);
  const k = norm(trackTitle);
  if (!t || !k) return false;
  if (t === k) return true;
  if (k.length < 3) return false;            // 「一」呢類淨准完全相等
  const raw = String(rowTitle || '');
  const re = new RegExp(`(^|${DELIM})${esc(trackTitle)}($|${DELIM})`, 'i');
  return re.test(raw);
}

// performer 字串(可能係「原始和聲 Raw Harmony / 孵化箱事工」)同 DB org 對照。
// 雙向 normalize 後互相包含就當對得上。
function performerMatchesOrg(performer, org) {
  if (!performer || !org) return false;
  const o = norm(org);
  if (!o) return false;
  for (const part of String(performer).split(/[\/、,，]/)) {
    const p = norm(part);
    if (!p) continue;
    if (p === o || p.includes(o) || o.includes(p)) return true;
  }
  return false;
}

function writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, catalog, dry }) {
  const L = [];
  L.push('# backfillAlbumFromCobuildCatalog 報告 —— CantonHymn 恢復粵語敬拜共建專輯系列');
  L.push('');
  L.push(`> 生成時間:${stamp()}${dry ? ' (--dry,冇寫 DB)' : ''}`);
  L.push('');
  L.push(`- catalog 曲目:${catalog.length}(4 隻專輯,其中(一)(二)只有部分曲目)`);
  L.push(`- 掃描 row(全庫 curated 生存 row):${rows.length}`);
  L.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  L.push(`- match 到但撞多隻專輯(冇寫):${conflicts.length}`);
  L.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  L.push(`- match 到但 album_source=manual/legacy(受保護):${protectedRows.length}`);
  L.push('');
  L.push('## 已寫(或 --dry 模擬)');
  L.push('');
  L.push('| id | org | title | matched_on | album |');
  L.push('|---|---|---|---|---|');
  for (const m of matched) L.push(`| ${m.row.id} | ${m.row.org} | ${String(m.row.title).replace(/\|/g, '\\|')} | ${m.matchedOn} | ${m.album} |`);
  L.push('');
  L.push('## DB 已有 album(冇覆寫,可用嚟核對 catalog 啱唔啱)');
  L.push('');
  L.push('| id | org | title | matched_on | DB album | catalog album |');
  L.push('|---|---|---|---|---|---|');
  for (const m of alreadyHasAlbum) L.push(`| ${m.row.id} | ${m.row.org} | ${String(m.row.title).slice(0, 60).replace(/\|/g, '\\|')} | ${m.matchedOn} | ${m.row.album} | ${m.album} |`);
  L.push('');
  fs.writeFileSync(REPORT_PATH, L.join('\n'), 'utf8');
  log('報告已寫:', REPORT_PATH);
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const db = await openDb();
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id
                          FROM hymns_all WHERE curated = 1 AND status NOT IN ('dead','rejected')`);
  log(`catalog 曲目:${catalog.length};掃描 row:${rows.length}`);

  const matched = [], conflicts = [], alreadyHasAlbum = [], protectedRows = [];
  for (const row of rows) {
    const hits = new Map(); // album -> matchedOn
    for (const t of catalog) {
      if (!titleMatches(row.display_title || row.title, t.title_zh)) continue;
      if (!performerMatchesOrg(t.performer, row.org)) continue;   // 第二重:演出單位要對得上
      hits.set(t.album, t.title_zh);
    }
    if (!hits.size) continue;
    if (hits.size > 1) { conflicts.push({ row, albums: [...hits.keys()] }); continue; }
    const album = [...hits.keys()][0];
    const matchedOn = hits.get(album);
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, album, matchedOn }); continue; }
    if (row.album && String(row.album).trim()) { alreadyHasAlbum.push({ row, album, matchedOn }); continue; }
    matched.push({ row, album, matchedOn });
  }

  log(`可寫:${matched.length} / 撞多隻碟:${conflicts.length} / 已有 album:${alreadyHasAlbum.length} / 受保護:${protectedRows.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromCobuildCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && String(fresh.album).trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'description' WHERE id = ?", [album, row.id]);
        written++;
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${written} 首`);
    } finally { releaseDbLock(token); }
  } else if (DRY) { log('--dry:未寫 DB'); }
  else { log('冇可寫候選,冇碰 DB'); }

  writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, catalog, dry: DRY });
}

main().catch((e) => { console.error(e); process.exit(1); });
