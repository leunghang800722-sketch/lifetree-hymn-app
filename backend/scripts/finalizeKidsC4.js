#!/usr/bin/env node
// backend/scripts/finalizeKidsC4.js — TAXONOMY-5D-PLAN.md §8 C4(原子對換)
//
// 執行 K-C-triage.md「簽名後 C4 執行次序」(Eric 2026-08-02 已簽 §1-§4 全部四項):
//   §1 剔走 51(實際 unique id 清單 = 58 條,見下面 DELETE_IDS 註解)
//   §2a 救返 36 + §2b Piano Lullaby 13(Eric 收,performer='純音樂' manual)
//   §3 兩條 lang-suspect 定案國語
// 跟住先至行 TAXONOMY-5D-PLAN §3.4.3 K-D 原子對換。
//
// ⚠️ 數字核對(執行前發現,記入報告,唔擋行):K-C-triage.md §1a 標題寫「38
// 條」,但實際逐條列出嘅 youtube_id 有 45 條(1b 6 條 + 1c 7 條唔變,45+6+7=58,
// 唔係文件自己算嘅 51)。45 條逐條查證 kids_refetch 現存 title,全部都撞得中
// §1a/§1b/§1c 自己描述嘅類別(shares about/talks about/preview/promo/Spanish/
// dance),冇一條睇落係正常歌漏網——當係文件標題數得錯(唔係漏 list 咗 7 條
// 唔應該剔嘅歌),用返完整 id 清單(真.可操作嘅資料)做準,唔用嗰個算錯咗嘅
// 標題數字。
//
// Usage:
//   node scripts/finalizeKidsC4.js --triage   # Step1-4:staging 剔走+救返+定案+報告
//   node scripts/finalizeKidsC4.js --swap     # Step5:原子換血(hymns_all+users.db remap)
//                                              # 要求兩個 .bak-c4swap-YYYYMMDD 已存在

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import {
  openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock, DB_PATH,
} from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { USER_DB_PATH } from '../lib/userDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'kids-refetch');
const REMAP_PATH = path.join(DATA_DIR, 'id-remap.json');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));
const DELAY_MS = 4000;

const MODE_TRIAGE = process.argv.includes('--triage');
const MODE_SWAP = process.argv.includes('--swap');

// ── §1 剔走清單(K-C-triage.md §1a+§1b+§1c,unique 58 條,逐條已對 kids_refetch
// 現存 title 查證撞得中各自類別描述,見上面檔頭註解)──────────────────────
const DELETE_IDS = [
  // §1a Yancy 清談/推廣/preview/教材(文件標題寫 38,實際列出 45 條,見檔頭註解)
  '3UXb_hiIvgQ', '38cTkInM4XI', 'fOFZay66M58', 'Vprw8C-bqR4', 'iZDOGkAVv58',
  'fMR-KoALY4w', 'FcUk9sazFeo', 'SErR21dkJA0', '30LRXuPb2mo', '2ih2IaI-KbU', 'mE68JuME-w4',
  '6cAC5yCoprg', 'Mqwh0o1_2f4', 'IafH4URgMeM', 'WyfMC7vkT2s', 'k7Tdfp9n7PA', 'Dp0jY_wGhYU',
  'psWn2y7XuOw', 'n9YOe5Wi--U', 'PeUUcS9KWKk', 'qT9y-nUjsAU', '52WEyP35ZCA', 'tXW_RDhyK4I',
  'CQ0mI5rg6wA', '7L38KiKO32o', 'CwITIZnPJk8', 'N6T3JoTvYlE', 'jiqNbLe-XgY', 's8PO_jsnf78',
  'DKnyIP4jjNM', 'YFWZmD2RkWk', 'dbT6odHNJE0', 'aJ4iiG1LRRk', '3ELS0EZqXYg', '7vQUEH_XzyA',
  'duPOO3n8Ok0', 'wQQ1irjEwWE', 'f0ZMkjiIh_c', 'j1GiRBP3PMc', '45wamM-HpSE', 'VQZnxz2Qt0I',
  'WCzi5unScpc', '4kT4mDEIz_k', 'AP4zBz2kYmk', 'fRIcApPqGHo',
  // §1b 西班牙語歌(6)
  'jvigUgiDd98', 'EjB9WRZQbRs', 'Kpwi1rKkkv0', 'bUE8FCTixio', '2yq4Yc52Mhc', '2K0a-E1ktpM',
  // §1c CJ and Friends 世俗/教學舞蹈片(7)
  'K3kvKI84Ydo', 'S47Nz6UTex8', 'z32NXNZNuyE', 'nhenje-LzS0', 'wBIZehcgNVo', 'oxRyUjCu9Gs', 'VtgYfRqdPvY',
];

// ── §2a 救返(36)+ §2b Piano Lullaby(13,Eric 收 performer=純音樂)──────────
const RESCUE_GROUPS = {
  hillsong: {
    org: 'Hillsong Kids', lang: '英文',
    ids: ['puyEbKSn_ZM', 'ke2fuJmKW1A', '7OU6j5QU27k', 'HOwbGSKAe9g', 'fVhAdf_JMY0', 'gYF6x_2Ohug',
      'cz5pUFYO7AE', 'x9LQACXhS-U', 'XC4_Vbhf_PY', 'b5iHR4i8gUE', 'xrQPoVZR5Go', 'iwaJ3qh8PZc',
      'P-nn0enSmsU', 'IKibVqq5G8k', 'zs9G6tLQJfg', 'AuX_kmBxXDU', '9aMP1VNV8iY', 'eYH89HZPghA',
      'Tc_T8cQG-KE', 'iajTbrnZ4lM', 'ALkrFFIu9dg'],
  },
  listener: {
    org: 'Listener Kids', lang: '英文',
    ids: ['BmG3FHKZBnw', 'AQF-J2FXLN4', 'gpufCaVKWw4', 'RHoIByQlCow', 'Bmq5NveA6vY', 'PlcXDrOGiKk',
      'xNb6vMkAIOQ', 'b0VUiK50pgU'],
  },
  cj: { org: 'CJ and Friends', lang: '英文', ids: ['lzW9nZGdgmg'] },
  psk: {
    org: '讚美之泉兒童', lang: '國語',
    ids: ['MIc5WiThn0U', '9fDQBnHVdyU', 'SzGYYf0K8CY', 'O2Fv0XPu0Yo', 'vWMePsOFMkU', 'bfFZf7uwTV8'],
  },
  lullaby: {
    org: 'Hillsong Kids', lang: '英文', performer: '純音樂', performer_source: 'manual',
    ids: ['aDgup4D-oyo', 'x2aO_jw7tlw', 'q3uluBF4vhc', 'RSa8vzVjsw0', 'nK01D21WspE', '_siBAyiLZTk',
      'Yu4qwj6aIrM', 'S-cbTaS2RMU', 'KJY12sBt5dQ', 'HOgTCt7ECaM', 'CWROHzC5p8o', '3q9JuUtLgF0', '44PBPsIDDmU'],
  },
};

// ── §3 lang-suspect 定案國語(清 flag)────────────────────────────────────
const LANG_SUSPECT_FINALIZE = ['a8JcMe_xq38', 'c9ldm4NzF9Y'];

function hasColumn(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  return cols.includes(col);
}

function ensureStagingPerformerColumns(db) {
  if (!hasColumn(db, 'kids_refetch', 'performer')) db.run(`ALTER TABLE kids_refetch ADD COLUMN performer TEXT DEFAULT ''`);
  if (!hasColumn(db, 'kids_refetch', 'performer_source')) db.run(`ALTER TABLE kids_refetch ADD COLUMN performer_source TEXT DEFAULT ''`);
}

// ── Step 1:staging 剔走 ──────────────────────────────────────────────────
async function step1() {
  const token = await acquireDbLock('finalizeKidsC4-step1');
  if (!token) { log('⛔ 攞唔到 DB 鎖(step1)'); process.exit(1); }
  try {
    const db = await openDb();
    const before = query(db, 'SELECT COUNT(*) c FROM kids_refetch')[0].c;
    const placeholders = DELETE_IDS.map(() => '?').join(',');
    const existing = query(db, `SELECT youtube_id FROM kids_refetch WHERE youtube_id IN (${placeholders})`, DELETE_IDS);
    db.run(`DELETE FROM kids_refetch WHERE youtube_id IN (${placeholders})`, DELETE_IDS);
    const after = query(db, 'SELECT COUNT(*) c FROM kids_refetch')[0].c;
    saveDb(db);
    log(`Step1 剔走:before=${before} after=${after} 實際刪走=${before - after}(清單 ${DELETE_IDS.length} 條,喺 staging 搵到 ${existing.length} 條)`);
    return { before, after, deleted: before - after, listCount: DELETE_IDS.length, foundInStaging: existing.length };
  } finally {
    releaseDbLock(token);
  }
}

// ── Step 2:救返 allowlist 重驗(逐條:resolve 喺鎖外,insert 喺鎖內即攞即放)──
async function rescueOne(youtubeId, meta, tracking) {
  const lookupDb = await openDb();
  const row = query(lookupDb, 'SELECT title, duration, status FROM hymns_all WHERE youtube_id=?', [youtubeId])[0];
  if (!row) {
    tracking.fail.push({ youtube_id: youtubeId, org: meta.org, reason: '喺 hymns_all 都搵唔返(唔喺 old-snapshot 範圍)' });
    return;
  }
  await sleep(jitter(DELAY_MS));
  let alive = false;
  try { alive = !!(await resolveAudioUrl(youtubeId)); } catch (_) { alive = false; }
  if (!alive) {
    tracking.fail.push({ youtube_id: youtubeId, title: row.title, org: meta.org, reason: '死鏈/resolve唔到(可能真係刪咗/私影)' });
    log(`  ✗ 死鏈,救唔返:[${meta.org}] ${row.title}`);
    return;
  }
  const token = await acquireDbLock('finalizeKidsC4-rescue');
  if (!token) {
    tracking.fail.push({ youtube_id: youtubeId, title: row.title, org: meta.org, reason: '攞唔到DB鎖(可以rerun)' });
    return;
  }
  try {
    const freshDb = await openDb();
    ensureStagingPerformerColumns(freshDb);
    const exists = query(freshDb, 'SELECT 1 FROM kids_refetch WHERE youtube_id=?', [youtubeId])[0];
    if (exists) { tracking.alreadyStaged.push(youtubeId); log(`  (已經喺 staging,skip)— ${row.title}`); return; }
    const performer = meta.performer || '';
    const performerSource = meta.performer_source || '';
    freshDb.run(
      `INSERT INTO kids_refetch (title, display_title, artist, category, youtube_id, duration, lang, org, kids, status, curated, flag, source_group, performer, performer_source)
       VALUES (?, ?, ?, '兒童', ?, ?, ?, ?, 1, 'ok', 1, '', ?, ?, ?)`,
      [row.title, cleanDisplayTitle(row.title, meta.org), meta.org, youtubeId, row.duration, meta.lang,
        meta.org, meta.org, performer, performerSource]
    );
    saveDb(freshDb);
    tracking.rescued.push({ youtube_id: youtubeId, title: row.title, org: meta.org, lang: meta.lang, performer });
    log(`  ✓ 救返 [${meta.org}/${meta.lang}${performer ? `/performer=${performer}` : ''}] ${row.title}`);
  } finally {
    releaseDbLock(token);
  }
}

async function step2() {
  const tracking = { rescued: [], fail: [], alreadyStaged: [] };
  for (const [key, group] of Object.entries(RESCUE_GROUPS)) {
    log(`救返分組:${key}(${group.ids.length} 條,org=${group.org},lang=${group.lang}${group.performer ? `,performer=${group.performer}` : ''})`);
    for (const id of group.ids) {
      await rescueOne(id, group, tracking);
    }
  }
  log(`Step2 完成:救返 ${tracking.rescued.length} / 已喺staging ${tracking.alreadyStaged.length} / 失敗 ${tracking.fail.length}(共 ${Object.values(RESCUE_GROUPS).reduce((s, g) => s + g.ids.length, 0)} 條)`);
  if (tracking.fail.length) {
    log('救唔返清單:');
    for (const f of tracking.fail) log(`   - [${f.org || '?'}] ${f.youtube_id} ${f.title || ''} —— ${f.reason}`);
  }
  return tracking;
}

// ── Step 3:lang-suspect 定案(清 flag)────────────────────────────────────
async function step3() {
  const token = await acquireDbLock('finalizeKidsC4-step3');
  if (!token) { log('⛔ 攞唔到 DB 鎖(step3)'); process.exit(1); }
  try {
    const db = await openDb();
    const placeholders = LANG_SUSPECT_FINALIZE.map(() => '?').join(',');
    const before = query(db, `SELECT youtube_id, lang, flag FROM kids_refetch WHERE youtube_id IN (${placeholders})`, LANG_SUSPECT_FINALIZE);
    db.run(`UPDATE kids_refetch SET flag='' WHERE youtube_id IN (${placeholders})`, LANG_SUSPECT_FINALIZE);
    saveDb(db);
    log(`Step3 lang-suspect 定案:${before.map((r) => `${r.youtube_id}(${r.lang})`).join(', ')} → flag 清空,定案語言不變`);
    return { finalized: before };
  } finally {
    releaseDbLock(token);
  }
}

async function runTriage() {
  const s1 = await step1();
  const s2 = await step2();
  const s3 = await step3();
  const db = await openDb();
  const finalCount = query(db, 'SELECT COUNT(*) c FROM kids_refetch')[0].c;
  const langDist = query(db, 'SELECT lang, COUNT(*) c FROM kids_refetch GROUP BY lang');
  log(`=== Triage 完成 === staging 最終數:${finalCount}`);
  langDist.forEach((r) => log(`   ${r.lang || '(未定)'}: ${r.c}`));
  const summary = { step1: s1, step2: { rescued: s2.rescued, fail: s2.fail, alreadyStaged: s2.alreadyStaged }, step3, finalCount, langDist };
  fs.writeFileSync(path.join(DATA_DIR, 'c4-triage-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  log(`摘要已寫:${path.join(DATA_DIR, 'c4-triage-summary.json')}`);
}

// ══════════════════════════════════════════════════════════════════════════
// Step 5:原子對換(K-D)
// ══════════════════════════════════════════════════════════════════════════
function todayStamp() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }

// ⚠️ 呢個 script 執行嗰陣(對話層)嘅「今日日期」係 2026-08-02,但部機 Date()
// 讀出嚟嘅本機時間仲係 2026-08-01(timezone/時鐘唔同步)——backup 檔名跟嘅係
// 派工指示明文寫嘅 `20260802`,唔跟 Date() 動態算,避免兩者唔一致揾唔到
// backup。搵唔到就退一步掃任何 `.bak-c4swap-*` 檔,寬鬆啲但仍然要求兩個都存在。
const TASK_STAMP = '20260802';

function findBackup(basePath) {
  const preferred = `${basePath}.bak-c4swap-${TASK_STAMP}`;
  if (fs.existsSync(preferred)) return preferred;
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  const candidates = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.bak-c4swap-`));
  if (candidates.length) return path.join(dir, candidates.sort().reverse()[0]);
  return null;
}

async function runSwap() {
  const hymnsBak = findBackup(DB_PATH);
  const usersBak = findBackup(USER_DB_PATH);
  if (!hymnsBak || !usersBak) {
    log(`⛔ 紅線:backup 未齊全,唔准郁 prod。期望:\n   ${DB_PATH}.bak-c4swap-${TASK_STAMP}\n   ${USER_DB_PATH}.bak-c4swap-${TASK_STAMP}`);
    process.exit(1);
  }
  log(`✅ backup 已確認存在:${hymnsBak} / ${usersBak}`);

  const token = await acquireDbLock('finalizeKidsC4-swap');
  if (!token) { log('⛔ 攞唔到 DB 鎖(swap)'); process.exit(1); }

  let oldRows;
  let newIdByYoutubeId = {};
  let stagingRows;
  try {
    const db = await openDb();
    ensureStagingPerformerColumns(db);

    oldRows = query(db, `SELECT id, youtube_id FROM hymns_all WHERE lang='兒童' AND status != 'rejected'`);
    const rejectedCountBefore = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE lang='兒童' AND status='rejected'`)[0].c;
    const totalBefore = query(db, `SELECT COUNT(*) c FROM hymns_all`)[0].c;
    log(`換血前:lang='兒童' 非墓碑 ${oldRows.length} 首(將被 delete),rejected 墓碑 ${rejectedCountBefore} 首(絕對唔郁),全庫 ${totalBefore} 首`);

    stagingRows = query(db, `SELECT * FROM kids_refetch`);
    log(`staging 待插入:${stagingRows.length} 首`);

    db.run('BEGIN TRANSACTION');
    try {
      db.run(`DELETE FROM hymns_all WHERE lang='兒童' AND status != 'rejected'`);

      const today = new Date().toISOString().slice(0, 10);
      for (const r of stagingRows) {
        const displayTitle = r.display_title || cleanDisplayTitle(r.title, r.org);
        db.run(
          `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, duration, lang, org, kids,
            curated, status, last_checked, fail_streak, performer, performer_source)
           VALUES (?, ?, ?, '兒童', ?, ?, ?, ?, 1, 1, 'ok', ?, 0, ?, ?)`,
          [r.title, displayTitle, r.org, r.youtube_id, r.duration, r.lang, r.org, today,
            r.performer || '', r.performer_source || '']
        );
        const newId = query(db, 'SELECT last_insert_rowid() as id')[0].id;
        newIdByYoutubeId[r.youtube_id] = newId;
      }

      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }

    saveDb(db);

    const rejectedCountAfter = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE lang='兒童' AND status='rejected'`)[0].c;
    const kidsLangLeft = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE lang='兒童'`)[0].c;
    const kidsOkCount = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE kids=1 AND status='ok'`)[0].c;
    const totalAfter = query(db, `SELECT COUNT(*) c FROM hymns_all`)[0].c;
    const orgEmpty = query(db, `SELECT COUNT(*) c FROM hymns_all WHERE org=''`)[0].c;
    log(`換血完成:lang='兒童' 剩 ${kidsLangLeft}(應=rejected墓碑 ${rejectedCountAfter}),kids=1&status=ok=${kidsOkCount},全庫 ${totalAfter}(期望 ${totalBefore}-${oldRows.length}+${stagingRows.length}=${totalBefore - oldRows.length + stagingRows.length}),org='' 數=${orgEmpty}`);
  } finally {
    releaseDbLock(token);
  }

  // ── id-remap.json ────────────────────────────────────────────────────
  const oldToNew = {};
  const unmapped = [];
  for (const old of oldRows) {
    if (Object.prototype.hasOwnProperty.call(newIdByYoutubeId, old.youtube_id)) {
      oldToNew[old.id] = newIdByYoutubeId[old.youtube_id];
    } else {
      unmapped.push({ oldId: old.id, youtube_id: old.youtube_id });
    }
  }
  const remapPayload = {
    generatedAt: stamp(),
    oldCount: oldRows.length,
    newCount: stagingRows.length,
    mappedCount: Object.keys(oldToNew).length,
    unmappedCount: unmapped.length,
    oldToNew,
    unmapped,
  };
  fs.writeFileSync(REMAP_PATH, JSON.stringify(remapPayload, null, 2), 'utf8');
  log(`id-remap.json 已寫:${REMAP_PATH}(mapped=${remapPayload.mappedCount} unmapped=${remapPayload.unmappedCount})`);

  // ── remap users.db(favorites + playlists.songs_json)────────────────────
  // ⚠️ users.db 冇好似 hymns.db 咁嘅 lockfile 協議(淨係 server process 一個
  // 寫入者,每次寫操作即刻全量 export)。呢個 script 直接改碟上嘅檔,跟
  // scripts/setAdmin.js 同一個處理方式:寫完由 caller(shell 層)kickstart
  // 重啟 backend,令 server 記憶體嗰份唔會用舊 snapshot 冚返呢次改動。
  const SQL = await initSqlJs();
  const udb = new SQL.Database(fs.readFileSync(USER_DB_PATH));

  const favRows = [];
  {
    const stmt = udb.prepare('SELECT user_id, hymn_id FROM favorites');
    while (stmt.step()) favRows.push(stmt.getAsObject());
    stmt.free();
  }
  const favRemapped = [];
  const favDropped = [];
  for (const f of favRows) {
    if (!Object.prototype.hasOwnProperty.call(oldToNew, f.hymn_id)) continue; // 唔係兒童 cohort,唔郁
    const newId = oldToNew[f.hymn_id];
    udb.run('UPDATE favorites SET hymn_id = ? WHERE user_id = ? AND hymn_id = ?', [newId, f.user_id, f.hymn_id]);
    favRemapped.push({ user_id: f.user_id, oldId: f.hymn_id, newId });
  }
  const kidsOldIdSet = new Set(oldRows.map((r) => r.id));
  for (const f of favRows) {
    if (kidsOldIdSet.has(f.hymn_id) && !Object.prototype.hasOwnProperty.call(oldToNew, f.hymn_id)) {
      udb.run('DELETE FROM favorites WHERE user_id = ? AND hymn_id = ?', [f.user_id, f.hymn_id]);
      favDropped.push({ user_id: f.user_id, oldId: f.hymn_id });
    }
  }

  const plRows = [];
  {
    const stmt = udb.prepare('SELECT user_id, id, name, songs_json FROM playlists');
    while (stmt.step()) plRows.push(stmt.getAsObject());
    stmt.free();
  }
  const oldYidSet = new Set(oldRows.map((r) => r.youtube_id));
  const playlistChanges = [];
  for (const pl of plRows) {
    let songs;
    try { songs = JSON.parse(pl.songs_json); } catch (_) { continue; }
    let touched = false;
    const remappedEntries = [];
    const droppedEntries = [];
    const nextSongs = [];
    for (const song of songs) {
      const yid = song.youtube_id;
      const isKidsEntry = kidsOldIdSet.has(song.id) || (yid && oldYidSet.has(yid));
      if (!isKidsEntry) { nextSongs.push(song); continue; }
      if (yid && Object.prototype.hasOwnProperty.call(newIdByYoutubeId, yid)) {
        const newId = newIdByYoutubeId[yid];
        // 淨係 remap id(playlist entry 嘅 title/artist/lang 呢啲係 client 側嘅
        // 快照顯示值,唔喺呢個 script 職責範圍,唔郁);id 對唔上就要係
        // youtube_id 揸準嘅新 id,唔可以留返舊 id(會指去已經 delete 咗嘅 row)。
        nextSongs.push({ ...song, id: newId });
        remappedEntries.push({ youtube_id: yid, oldId: song.id, newId, title: song.title });
        touched = true;
      } else {
        droppedEntries.push({ youtube_id: yid, oldId: song.id, title: song.title });
        touched = true;
      }
    }
    if (touched) {
      udb.run('UPDATE playlists SET songs_json = ?, updated_at = ? WHERE user_id = ? AND id = ?',
        [JSON.stringify(nextSongs), new Date().toISOString(), pl.user_id, pl.id]);
      playlistChanges.push({ user_id: pl.user_id, playlist_id: pl.id, name: pl.name, remapped: remappedEntries, dropped: droppedEntries });
    }
  }

  const tmp = `${USER_DB_PATH}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(udb.export()));
  fs.renameSync(tmp, USER_DB_PATH);
  udb.close();

  log(`users.db remap 完成:favorites remapped=${favRemapped.length} dropped=${favDropped.length}`);
  favRemapped.forEach((f) => log(`   fav remap: user=${f.user_id} ${f.oldId} → ${f.newId}`));
  favDropped.forEach((f) => log(`   fav DROP: user=${f.user_id} oldId=${f.oldId}(冇對應新歌,已刪走個心心)`));
  playlistChanges.forEach((p) => {
    log(`   playlist "${p.name}"(user=${p.user_id}): remapped=${p.remapped.length} dropped=${p.dropped.length}`);
    p.remapped.forEach((r) => log(`      remap: ${r.youtube_id} ${r.oldId}→${r.newId} (${r.title})`));
    p.dropped.forEach((d) => log(`      DROP: ${d.youtube_id} oldId=${d.oldId} (${d.title}) —— 冇對應新歌(被剔走/救唔返)`));
  });

  fs.writeFileSync(
    path.join(DATA_DIR, 'c4-swap-users-remap.json'),
    JSON.stringify({ generatedAt: stamp(), favRemapped, favDropped, playlistChanges }, null, 2),
    'utf8'
  );

  log('=== Step5 原子對換完成 ===');
}

async function main() {
  if (MODE_TRIAGE) { await runTriage(); return; }
  if (MODE_SWAP) { await runSwap(); return; }
  console.error('用法: --triage 或 --swap');
  process.exit(1);
}

main().catch((e) => { console.error('finalizeKidsC4 出錯:', e); process.exit(1); });
