#!/usr/bin/env node
// backfillAlbumFromMusicBrainzCatalog.js — ALBUM-BACKFILL-ACCEL-PLAN.md §6
// 追加決策(2026-08-11 Eric 拍板):國際主流英文敬拜歌手/樂隊反過來用
// MusicBrainz API 做資料源。食 fetchMusicBrainzCatalog.js 出嘅
// `data/album-backfill/musicbrainz-catalog.json`(每行 {org,title,album,
// year,mbid}),對 DB 呢批 org 冇 album 嘅 row 做歌名 match,match 到先寫
// `album_source='musicbrainz'`。
//
// ── DB 標題嘅特殊之處 ──────────────────────────────────────────────────
// 呢批英文 org 嘅 YouTube 標題好雜(唔似中文 org 咁多【】做界線):有直接
// 乾淨歌名(CityAlight 呢類),但更多係「歌名 - 藝人名」「藝人名 - 歌名」
// 「歌名 (Live) - 藝人名, feat. XXX」混雜 emoji/口號/description 式長句
// (CJ and Friends/Listener Kids 呢類兒童頻道)。呢度唔逐 org 寫 parser,
// 改用**token 子序列**比對:MB 官方歌名 normalize 做 token 陣列,check
// 係咪 DB 標題 normalize 後 token 陣列嘅「連續子序列」(順序連續一樣先算
// 撞中)。歌名通常會完整噉嵌喺 YouTube 標題入面,呢個做法夠寧空莫錯,
// 又唔使為每個 org 度 parser。
//
// ── 匹配規則(寧空莫錯)────────────────────────────────────────────────
//   · MB 歌名 token 數 <2 個字 且淨一個字長度 <6 嘅唔收(避免「One」
//     「God」「Yes」呢類短字撞啱雜訊)
//   · 撞中但呢個 org 入面撞到多過一隻唔同專輯(同名歌喺唔同專輯出現)
//     → 唔寫,flag 落 report 人手覆核
//   · 一個 DB 標題撞中多個唔同長度嘅 MB 歌名 → 揀 token 數最多(最specific)
//     嗰個;若最長嗰批之中出現唔同專輯 → 當衝突,唔寫
//   · album_source=manual/legacy 受保護,永不覆寫;album 本身已有值都唔覆寫
//
// Usage:
//   node scripts/backfillAlbumFromMusicBrainzCatalog.js --dry   # 出 report,唔寫 DB
//   node scripts/backfillAlbumFromMusicBrainzCatalog.js         # 真寫

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, acquireDbLock, releaseDbLock, isCompilation } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'musicbrainz-catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'album-backfill', 'musicbrainz-catalog-report.md');
const DRY = process.argv.includes('--dry');
// --no-resolve-earliest:關掉「同名歌撞多隻碟時揀最早發行嗰隻(=原碟)」嘅解衝突規則
const RESOLVE_EARLIEST = !process.argv.includes('--no-resolve-earliest');

const TARGET_ORGS = [
  'Yancy', 'Bethel Music', 'Hillsong Worship', 'Hillsong Kids', 'KEC Worship',
  'CJ and Friends', 'Cody Carnes', 'Milk&Honey', 'Giggles and Tunes',
  'Elevation Worship', 'Phil Wickham', 'Listener Kids', 'Chris Tomlin',
  'Mosaic MSC', 'Endless Worship', 'CityAlight', 'Worship Together',
  'Jesus Image', 'Hillsong UNITED', 'Passion',
];

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function tokenize(raw) {
  const s = (raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // 去 diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return s ? s.split(/\s+/) : [];
}

// 2026-08-11 dry-run 抽查揪出嘅風險詞:呢批字太廣義,單獨一個字撞中
// 就寫落去好容易做錯(例如「praise」撞中一條 playlist 片、「together」
// 撞中「Worship Together」呢個品牌詞唔係歌名本身)。呢批唔准做「單獨
// 一個 token 就收貨」嘅match key(多過一個 token 陪住先計,例如「be glad」
// 冇問題,但淨一個「praise」/「together」唔收)。
const GENERIC_SINGLE_TOKEN_BLOCKLIST = new Set([
  'praise', 'worship', 'together', 'forever', 'amen', 'songs', 'music',
  'breathe', 'heaven', 'blessed', 'center', 'grace', 'holy', 'glory',
  'faith', 'hope', 'love', 'alive', 'more', 'king', 'lord', 'jesus', 'god',
]);

function isEligibleMbTitle(tokens) {
  if (tokens.length >= 2) return true;
  if (tokens.length === 1 && tokens[0].length >= 8 && !GENERIC_SINGLE_TOKEN_BLOCKLIST.has(tokens[0])) return true;
  return false;
}

// 額外一批「呢條片本身係合輯/playlist/串連多首歌」嘅訊號詞,補
// hymnDb.js `isCompilation` 冇覆蓋到嘅英文變體(佢個 patterns 主要為
// 中文 org 度身訂造)。撞中就成條 row 唔做 match(唔止唔准單字,連
// 完整片名都當唔可靠)。
const EXTRA_COMPILATION_PATTERNS = [
  /\bbest\b.*\bsongs?\b/i, /\btop\b.*\bsongs?\b/i, /\bworship\s+set\b/i,
  /\bfull\s+concert\b/i, /\bmulticast\b/i, /\bnon[\s-]?stop\b/i,
  /\bmix\s?tape\b/i, /\bgreatest\s+hits\b/i, /\bhits\s+i\b/i,
];
function isExtraCompilation(title) {
  return EXTRA_COMPILATION_PATTERNS.some((re) => re.test(title || ''));
}

// 2026-08-11 人手抽查揪出嘅具體撞名個案:「Turn Your Eyes Upon Jesus」
// 係公共版權嘅經典聖詩,同 Hillsong Kids 自己嗰首叫「Your Eyes」嘅歌
// 完全唔同,但 token 子序列啱啱好撞中「your eyes」——加返一個具體
// denylist 擋呢種「經典聖詩片名包住咗一個撞啱嘅短詞」嘅假陽性。
const KNOWN_UNRELATED_PHRASES = [/turn your eyes upon jesus/i];
function hasKnownUnrelatedPhrase(title) {
  return KNOWN_UNRELATED_PHRASES.some((re) => re.test(title || ''));
}

// dbTokens 入面搵唔搵到 mbTokens 呢個連續子序列
function containsSubsequence(dbTokens, mbTokens) {
  if (!mbTokens.length || mbTokens.length > dbTokens.length) return false;
  outer: for (let i = 0; i <= dbTokens.length - mbTokens.length; i++) {
    for (let j = 0; j < mbTokens.length; j++) {
      if (dbTokens[i + j] !== mbTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error(`搵唔到 catalog:${CATALOG_PATH},請先跑 fetchMusicBrainzCatalog.js`);
    process.exit(1);
  }
  const catalogRaw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  log(`catalog 載入:${catalogRaw.length} 行`);

  // 每個 org 一個 index:normalized title(token 陣列 join 做 key) -> Set(album)
  const orgIndex = new Map(); // org -> Map(key -> { tokens, albums: Set })
  for (const entry of catalogRaw) {
    if (!entry.org || !entry.title || !entry.album) continue;
    const tokens = tokenize(entry.title);
    if (!isEligibleMbTitle(tokens)) continue;
    const key = tokens.join(' ');
    if (!orgIndex.has(entry.org)) orgIndex.set(entry.org, new Map());
    const idx = orgIndex.get(entry.org);
    if (!idx.has(key)) idx.set(key, { tokens, albums: new Set() });
    idx.get(key).albums.add(entry.album);
  }
  for (const [org, idx] of orgIndex) {
    log(`  ${org}:distinct 可用歌名 ${idx.size}`);
  }

  const db = await openDb();
  const placeholders = TARGET_ORGS.map(() => '?').join(',');
  const rows = query(db, `SELECT id, title, display_title, org, album, album_source, youtube_id FROM hymns_all WHERE org IN (${placeholders})`, TARGET_ORGS);
  log(`候選 row(org IN 目標 20 個):${rows.length} 首`);

  const matched = [];
  const conflicts = [];
  const notFound = [];
  const alreadyHasAlbum = [];
  const protectedRows = [];
  const noCatalog = []; // 呢個 org 喺 catalog 入面完全冇料(mbid=null 或 0 收成)

  const byOrg = {};
  // album → 發行年份;同一首歌撞多隻碟通常係「原碟 + 之後嘅精選/重編合輯」,
  // 有齊年份就可以揀最早嗰隻(原碟)去解衝突。
  const albumYear = new Map();
  for (const t of catalogRaw) {
    if (!t.album || t.year == null || albumYear.has(t.album)) continue;
    const y = Number(t.year);            // 有啲 catalog(MusicBrainz)嘅 year 係字串
    if (Number.isFinite(y)) albumYear.set(t.album, y);
  }
  const resolvedEarliest = [];

  for (const row of rows) {
    byOrg[row.org] = byOrg[row.org] || { total: 0, matched: 0 };
    byOrg[row.org].total++;

    const idx = orgIndex.get(row.org);
    if (!idx || idx.size === 0) { noCatalog.push(row); continue; }

    const nameForMatch = (row.display_title && row.display_title.trim()) || row.title || '';
    if (isCompilation(nameForMatch) || isCompilation(row.title || '') || isExtraCompilation(nameForMatch) || isExtraCompilation(row.title || '') || hasKnownUnrelatedPhrase(nameForMatch) || hasKnownUnrelatedPhrase(row.title || '')) {
      notFound.push(row);
      continue;
    }
    const dbTokens = tokenize(nameForMatch);

    let bestLen = 0;
    let bestAlbums = new Set();
    let bestKey = null;
    for (const [key, entry] of idx) {
      if (entry.tokens.length < bestLen) continue; // 只考慮 >= 目前最長嘅
      if (containsSubsequence(dbTokens, entry.tokens)) {
        if (entry.tokens.length > bestLen) {
          bestLen = entry.tokens.length;
          bestAlbums = new Set(entry.albums);
          bestKey = key;
        } else if (entry.tokens.length === bestLen) {
          for (const a of entry.albums) bestAlbums.add(a);
          bestKey = `${bestKey} / ${key}`;
        }
      }
    }

    if (bestLen === 0) { notFound.push(row); continue; }
    if (bestAlbums.size > 1) {
      const list = [...bestAlbums];
      const years = list.map((a) => albumYear.get(a));
      if (!RESOLVE_EARLIEST || years.some((y) => y == null)) {
        conflicts.push({ row, matchedOn: bestKey, albums: list, reason: RESOLVE_EARLIEST ? '有專輯欠年份' : '規則關咗' });
        continue;
      }
      const min = Math.min(...years);
      const winners = list.filter((a) => albumYear.get(a) === min);
      if (winners.length !== 1) {
        conflicts.push({ row, matchedOn: bestKey, albums: list, reason: `最早年份${min}平手` });
        continue;
      }
      bestAlbums = new Set([winners[0]]);
      resolvedEarliest.push({ row, album: winners[0], year: min, from: list.map((a) => `${a}(${albumYear.get(a)})`).join(' / ') });
    }
    const album = [...bestAlbums][0];
    if (row.album_source === 'manual' || row.album_source === 'legacy') { protectedRows.push({ row, catalogAlbum: album }); continue; }
    if (row.album && row.album.trim()) { alreadyHasAlbum.push({ row, catalogAlbum: album }); continue; }
    matched.push({ row, album, matchedOn: bestKey });
    byOrg[row.org].matched++;
  }

  log(`match 到單一專輯且可寫(album 本身空):${matched.length}`);
  log(`衝突靠「最早發行=原碟」解決咗:${resolvedEarliest.length}`);
  log(`match 到但衝突(撞多隻專輯,唔寫):${conflicts.length}`);
  log(`match 到但 DB 已經有 album(保護規則,唔覆寫):${alreadyHasAlbum.length}`);
  log(`match 到但 album_source=manual/legacy(受保護,唔覆寫):${protectedRows.length}`);
  log(`org 喺 catalog 完全冇料(mbid=null 或 0 收成):${noCatalog.length}`);
  log(`喺 catalog 搵唔到:${notFound.length}`);

  if (!DRY && matched.length) {
    const token = await acquireDbLock('backfillAlbumFromMusicBrainzCatalog');
    if (!token) { console.error('攞唔到 DB 鎖,收工'); process.exit(1); }
    try {
      const freshDb = await openDb();
      let written = 0;
      for (const { row, album } of matched) {
        const fresh = query(freshDb, 'SELECT album, album_source FROM hymns_all WHERE id = ?', [row.id])[0];
        if (!fresh) continue;
        if (fresh.album_source === 'manual' || fresh.album_source === 'legacy') continue;
        if (fresh.album && fresh.album.trim()) continue;
        freshDb.run("UPDATE hymns_all SET album = ?, album_source = 'musicbrainz' WHERE id = ?", [album, row.id]);
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

  writeReport({ rows, byOrg, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, noCatalog, dry: DRY });
}

function writeReport({ rows, byOrg, matched, conflicts, alreadyHasAlbum, protectedRows, notFound, noCatalog, dry }) {
  const lines = [];
  lines.push('# backfillAlbumFromMusicBrainzCatalog 報告 —— 國際英文 org 群(MusicBrainz API)');
  lines.push('');
  lines.push(`> 生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- 候選 row 總數:${rows.length}`);
  lines.push(`- match 到單一專輯且已寫(或 --dry 模擬):${matched.length}`);
  lines.push(`- match 到但撞多隻專輯(衝突,冇寫):${conflicts.length}`);
  lines.push(`- match 到但 DB 已有 album(冇覆寫):${alreadyHasAlbum.length}`);
  lines.push(`- match 到但 album_source=manual/legacy(受保護,冇覆寫):${protectedRows.length}`);
  lines.push(`- org 喺 catalog 完全冇料:${noCatalog.length}`);
  lines.push(`- catalog 有料但搵唔到:${notFound.length}`);
  const denom = rows.length || 1;
  lines.push(`- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):${(((matched.length + conflicts.length + alreadyHasAlbum.length + protectedRows.length) / denom) * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('## 逐 org 明細');
  lines.push('');
  lines.push('| org | 候選 row 數 | 本輪新寫(或模擬) |');
  lines.push('|---|---|---|');
  for (const [org, s] of Object.entries(byOrg).sort((a, b) => b[1].matched - a[1].matched)) {
    lines.push(`| ${mdEscape(org)} | ${s.total} | ${s.matched} |`);
  }
  lines.push('');
  lines.push('## 已寫(或 --dry 模擬)清單(頭 300 條)');
  lines.push('');
  lines.push('| id | org | title | matched_on | album |');
  lines.push('|---|---|---|---|---|');
  for (const { row, album, matchedOn } of matched.slice(0, 300)) {
    lines.push(`| ${row.id} | ${mdEscape(row.org)} | ${mdEscape(row.display_title || row.title)} | ${mdEscape(matchedOn)} | ${mdEscape(album)} |`);
  }
  lines.push('');
  lines.push('## 衝突清單(撞多隻專輯,人手覆核)');
  lines.push('');
  lines.push('| id | org | title | matched_on | 撞中嘅專輯 |');
  lines.push('|---|---|---|---|---|');
  for (const c of conflicts) {
    lines.push(`| ${c.row.id} | ${mdEscape(c.row.org)} | ${mdEscape(c.row.display_title || c.row.title)} | ${mdEscape(c.matchedOn)} | ${mdEscape(c.albums.join(' / '))} |`);
  }
  lines.push('');
  lines.push(`(catalog 完全冇料嘅 org 殘餘 ${noCatalog.length} 首、catalog 有料但搵唔到嘅 ${notFound.length} 首、`);
  lines.push(`DB 已有 album 冇覆寫嘅 ${alreadyHasAlbum.length} 首、album_source=manual/legacy 受保護嘅 ${protectedRows.length} 首,`);
  lines.push('唔逐條列,見上面統計數字。)');
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  log(`report 已寫:${REPORT_PATH}`);
}

main().catch((e) => { console.error('backfillAlbumFromMusicBrainzCatalog 出錯:', e); process.exit(1); });
