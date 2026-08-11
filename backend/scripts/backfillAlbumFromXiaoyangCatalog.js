#!/usr/bin/env node
// backfillAlbumFromXiaoyangCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md 加碼,
// 小羊詩歌版。食 `data/album-backfill/xiaoyang-catalog.json`(scrape 自官網
// w247.net「小羊詩歌靈修網」/songs/ 全 21 頁、250 首歌嘅事實資料:歌名
// +所屬專輯),對 org='小羊詩歌' 冇 album 嘅 row 做歌名 match,match 到先寫。
//
// ── DB 標題嘅特殊之處 ──────────────────────────────────────────────────
//   小羊 DB 嘅 title/display_title 唔似約書亞咁用【】包歌名,而係用 " | "
//   分隔多個欄位,規律係「歌名 | 調性/bpm | 《專輯名》專輯」或者「歌名 |
//   (譯自 xxx)」——第一截(第一個 " | " 之前)幾乎必然係歌名本身,所以呢
//   度**攞第一截做候選**;冇 " | " 嘅就用成句做候選(去尾隨嘅「(譯自...)」
//   括號)。
//
//   實測發現 266 首冇 album 嘅 row 入面,209 首標題本身已經帶
//   「《專輯名》專輯」字面——呢個訊號比歌名 match catalog 更直接可靠
//   (唔會撞多隻專輯嘅歧義,因為係上載者自己寫低邊隻專輯)。所以呢度做
//   兩層匹配:
//     Tier 1 ── 由標題攞出《...》專輯 字面,normalize(cn→tw、全半形逗號、
//               袮/祢 異體字統一)之後同 catalog 嘅 canonical 專輯名集合
//               比對,撞到得一個就直接用(唔使理會歌名 index)。
//     Tier 2 ── Tier 1 冇撞到先跌落嚟做原有嘅歌名 candidate match
//               (同 joshua 版一樣嘅邏輯)。
//
// ── 匹配規則(寧空莫錯,跟 backfillAlbumFromJoshuaCatalog.js 同一套)────
//   · normalize 後嘅候選(專輯名字面或歌名)撞唔到 canonical/catalog → 唔寫
//   · Tier 2 撞到但對應多過一隻唔同專輯(同名歌喺唔同專輯出現)→ 唔寫,
//     flag 落 report 人手覆核
//   · catalog 入面 album="尚未正式出版"(未正式出版,唔係真專輯名)→ 當
//     冇 album,唔計入 index/canonical 集合
//   · 撞到得一隻專輯,而且 DB 呢個 row album 本身空、album_source 唔係
//     manual/legacy → 寫 `album=<catalog 專輯名>, album_source='website'`
//
// Usage:
//   node scripts/backfillAlbumFromXiaoyangCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromXiaoyangCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'xiaoyang-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'xiaoyang-catalog-report.md');
const DRY = process.argv.includes('--dry');

const TARGET_ORGS = ['小羊詩歌'];
const NON_ALBUM_NAMES = new Set(['尚未正式出版']);

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

const toTraditional = Converter({ from: 'cn', to: 'tw' });
const hasCJK = (s) => /[㐀-鿿豈-﫿]/.test(s || '');

function fullwidthToHalfwidth(s) {
  return (s || '').replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
}

// 同 backfillAlbumFromJoshuaCatalog.js 一樣嘅中文 normalize(cn→tw、全半形、
// 去括號副題、剝走尾隨純英文、去空白)。
function normalizeZh(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = toTraditional(s);
  s = fullwidthToHalfwidth(s);
  s = s.replace(/[袮禰]/g, '祢');
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '');
  const m = s.match(/^([^\x00-\x7F][\s\S]*?)\s+[\x00-\x7F]+$/);
  if (m && m[1].trim()) s = m[1].trim();
  s = s.replace(/\s+/g, '');
  return s;
}

function normalizeEn(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = fullwidthToHalfwidth(s);
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return s;
}

// 專輯名 normalize(唔同於歌名 normalize)——只做 cn→tw、全半形、袮/祢
// 異體字統一、去逗號空白,唔剝尾隨英文(專輯名成隻字都要保留)。
function normalizeAlbumName(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = toTraditional(s);
  s = fullwidthToHalfwidth(s);
  // opencc cn→tw 會將「祢」轉做「禰」,同原始「袮」呢個異體字三個字形要
  // 統一做同一個 key,先可以互相 match(順序要喺 toTraditional 之後)。
  s = s.replace(/[袮禰]/g, '祢');
  s = s.replace(/[,、\s]+/g, '');
  return s;
}

// 由 DB 標題攞出字面「《專輯名》專輯」——上載者自己寫低嘅所屬專輯,比
// 歌名 match catalog 更直接可靠(唔會有同名歌撞多隻專輯嘅歧義)。
function extractBracketAlbum(rawTitle) {
  const m = (rawTitle || '').match(/《([^》]+)》\s*專輯/);
  return m ? m[1].trim() : null;
}

// 由原始 DB 標題攞出「候選歌名」——小羊 DB 標題規律用 " | " 分隔欄位,
// 第一截幾乎必然係歌名(第二截起係調性/bpm/專輯名/簡體拼音版等標記)。
// 冇 " | " 就用成句,但去掉尾隨「(譯自 xxx)」呢類副題括號。
function extractCandidate(rawTitle) {
  const raw = (rawTitle || '').trim();
  if (!raw) return '';
  const pipeIdx = raw.indexOf('|');
  if (pipeIdx > 0) return raw.slice(0, pipeIdx).trim();
  return raw.replace(/[（(][^）)]*[）)]\s*$/, '').trim();
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH}`);
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalog.length} 行`);

  const zhIndex = new Map(); // normalized zh -> Set(album)
  const enIndex = new Map(); // normalized en -> Set(album)
  for (const entry of catalog) {
    if (!entry.album || NON_ALBUM_NAMES.has(entry.album)) continue;
    const album = entry.album;
    if (entry.title_zh) {
      const key = normalizeZh(entry.title_zh);
      if (key) {
        if (!zhIndex.has(key)) zhIndex.set(key, new Set());
        zhIndex.get(key).add(album);
      }
    }
    if (entry.title_en) {
      const key = normalizeEn(entry.title_en);
      if (key) {
        if (!enIndex.has(key)) enIndex.set(key, new Set());
        enIndex.get(key).add(album);
      }
    }
  }
  log(`catalog normalize 後 distinct 中文歌名:${zhIndex.size},distinct 英文歌名:${enIndex.size}`);

  // canonical 專輯名集合(normalize 後 key -> 原始 catalog 專輯名),畀
  // Tier 1(標題字面《...》專輯)比對用。
  const canonicalAlbums = new Map();
  for (const entry of catalog) {
    if (!entry.album || NON_ALBUM_NAMES.has(entry.album)) continue;
    const key = normalizeAlbumName(entry.album);
    if (key && !canonicalAlbums.has(key)) canonicalAlbums.set(key, entry.album);
  }
  log(`canonical 專輯名(Tier 1 用):${canonicalAlbums.size} 個`);

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN ${TARGET_ORGS.join('/')}):${rows.length} 首`);

  const matched = []; // { row, album, matchedOn }
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];

  let tier1Count = 0;
  let tier2Count = 0;
  for (const row of rows) {
    const nameForMatch = (row.display_title && row.display_title.trim()) || row.title || '';

    let hitAlbums = null;
    let matchedOn = null;

    // Tier 1:標題字面《...》專輯,對 canonical 專輯名集合。
    const bracketAlbum = extractBracketAlbum(nameForMatch);
    if (bracketAlbum) {
      const key = normalizeAlbumName(bracketAlbum);
      const canonical = key ? canonicalAlbums.get(key) : null;
      if (canonical) {
        hitAlbums = new Set([canonical]);
        matchedOn = `《${bracketAlbum}》專輯(標題字面)`;
        tier1Count++;
      }
    }

    // Tier 2:歌名 candidate match catalog index。
    if (!hitAlbums) {
      const candidate = extractCandidate(nameForMatch);
      if (candidate) {
        if (hasCJK(candidate)) {
          const key = normalizeZh(candidate);
          const hit = key ? zhIndex.get(key) : null;
          if (hit) { hitAlbums = hit; matchedOn = candidate; tier2Count++; }
        } else {
          const key = normalizeEn(candidate);
          const hit = key ? enIndex.get(key) : null;
          if (hit) { hitAlbums = hit; matchedOn = candidate; tier2Count++; }
        }
      }
    }

    if (!hitAlbums) { notFound.push(row); continue; }
    if (hitAlbums.size > 1) { conflicts.push({ row, matchedOn, albums: [...hitAlbums] }); continue; }
    const album = [...hitAlbums][0];
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, catalogAlbum: album }); continue; }
    if (row.album && row.album.trim()) { alreadyHasAlbum.push({ row, catalogAlbum: album }); continue; }
    matched.push({ row, album, matchedOn });
  }
  log(`Tier 1(標題字面《...》專輯)命中:${tier1Count},Tier 2(歌名 catalog match)命中:${tier2Count}`);

  log(`match 到單一專輯且可寫(album 本身空):${matched.length}`);
  log(`match 到但衝突(撞多隻專輯,唔寫):${conflicts.length}`);
  log(`match 到但 DB 已經有 album(保護規則,唔覆寫):${alreadyHasAlbum.length}`);
  log(`match 到但 album_source=manual/legacy(受保護,唔覆寫):${protectedRows.length}`);
  log(`喺 catalog 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromXiaoyangCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT org, album, album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.org !== '小羊詩歌') continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'website' WHERE id = ? AND org = '小羊詩歌'", [album, row.id]);
        written++;
      }
      saveDb(freshDb);
      log(`已寫入 hymns.db:${written} 首`);
    } finally {
      releaseDbLock(token);
    }
  } else if (DRY) {
    log('--dry:未寫 DB(以上為模擬計數)');
  } else {
    log('冇可寫嘅候選,冇碰 DB');
  }

  writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, dry: DRY });
}

function writeReport({ rows, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, dry }) {
  const lines = [];
  lines.push('# backfillAlbumFromXiaoyangCatalog 報告 —— 小羊詩歌(w247.net 官網 catalog)');
  lines.push('');
  lines.push(`> org=${TARGET_ORGS.join('/')}。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- catalog 搵唔到:${notFound.length}`);
  lines.push(`- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):${(((matched.length + conflicts.length + alreadyHasAlbum.length + protectedRows.length) / rows.length) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單(頭 200 條)');
  lines.push('');
  lines.push('| id | youtube_id | title | matched_on | album |');
  lines.push('|---|---|---|---|---|');
  for (const { row, album, matchedOn } of matched.slice(0, 200)) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.display_title || row.title)} | ${mdEscape(matchedOn)} | ${mdEscape(album)} |`);
  }
  lines.push('');
  lines.push('## 衝突清單(撞多隻專輯,人手覆核)');
  lines.push('');
  lines.push('| id | youtube_id | title | matched_on | 撞中嘅專輯 |');
  lines.push('|---|---|---|---|---|');
  for (const c of conflicts) {
    lines.push(`| ${c.row.id} | ${c.row.youtube_id} | ${mdEscape(c.row.display_title || c.row.title)} | ${mdEscape(c.matchedOn)} | ${mdEscape(c.albums.join(' / '))} |`);
  }
  lines.push('');
  lines.push('## catalog 搵唔到嘅清單(頭 200 條,方便覆核候選抽取邏輯)');
  lines.push('');
  lines.push('| id | youtube_id | title |');
  lines.push('|---|---|---|');
  for (const row of notFound.slice(0, 200)) {
    lines.push(`| ${row.id} | ${row.youtube_id} | ${mdEscape(row.display_title || row.title)} |`);
  }
  lines.push('');
  lines.push(`(DB 已有 album 冇覆寫嘅 ${alreadyHasAlbum.length} 首、album_source=manual/legacy 受保護嘅 `);
  lines.push(`${protectedRows.length} 首,唔逐條列,見上面統計數字。)`);
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumFromXiaoyangCatalog 出錯:', e); process.exit(1); });
