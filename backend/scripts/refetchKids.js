#!/usr/bin/env node
// backend/scripts/refetchKids.js — TAXONOMY-5D-PLAN.md §3.4/§8 C3
//
// Eric 拍板(§3.4/§7):兒童分類現存 619 首 lang='兒童' 全部唔要 lang 值,
// 由源頭重攞一次,攞嗰陣即場判斷真語言。呢個 script 只做 K-A(快照)+ K-B
// (staging 重攞)+ K-C(對數報告)—— **唔郁 hymns_all 任何 row**,K-D 原子
// 對換係 C4,要 Eric 簽走漏清單先做,唔喺呢個 script 範圍。
//
// ── 紅線(TAXONOMY-5D-PLAN §8 C3)──────────────────────────────────
//   * 唔准 DELETE/UPDATE hymns_all 任何 row —— 呢個 script 淨係 SELECT 佢,
//     寫入目標永遠係新表 kids_refetch(staging)。
//   * dedup 對照成個 hymns_all,但要排除「而家嘅兒童 cohort」(即將被
//     delete+重攞嘅 471 首 curated 兒童歌)—— 唔係就乜都攞唔返,佢哋而家
//     全部仲喺 hymns_all 入面。148 首 status='rejected' 嘅墓碑**唔喺**呢個
//     排除範圍,佢哋留喺 dedup blocklist 入面攔住垃圾翻生(§3.4.1,設計唔係
//     bug)。見 `buildDedupBlocklist()`。
//   * 雙值 kidsLang 守衛(C1 驗收觀察④):INSERT 前 lang 必須 ∈
//     {粵語,國語,英文};611 Kids Worship 呢類「粵語/國語」雙值團體(而家
//     channel:null,呢個 script 行唔到佢,但邏輯要頂得住第日補返 channel)
//     逐首憑粵語書面虛詞判斷,判唔到就唔 insert,記落 K-C 報告嘅 flag 清單,
//     唔准亂寫一個估嚟嘅值。見 `resolveKidsLang()`。
//   * DB 寫入用返項目嘅 acquireDbLock/releaseDbLock(hymnDb.js),鎖內零
//     網絡操作 —— resolveAudioUrl 呢類慢工序响鎖之前做完(跟 fetchLyrics.js
//     嘅「即攞即放」模式,唔好似 growLibrary.js 咁揸住鎖成個 run)。
//
// Usage:
//   node scripts/refetchKids.js --status         # 淨係睇 staging 現有幾多首
//   node scripts/refetchKids.js --dry             # 唔寫 DB,睇吓會揀啲乜
//   node scripts/refetchKids.js                   # 正式行晒 8 個頻道 + allowlist,完咗出報告
//   node scripts/refetchKids.js --group Yancy      # 淨係行一個團體(分幾轆/斷點續跑用)
//   node scripts/refetchKids.js --skip-allowlist   # 跳過 KotM/Saddleback allowlist 分支
//   node scripts/refetchKids.js --report-only      # 唔跑網絡,淨係用返而家嘅 staging+tracking 重出報告

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock, formatDuration,
} from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { GROUPS } from '../data/worshipGroups.js';
import { scanChannelListing, channelLanguageSanityCheck, validateChannelCandidates } from '../lib/channelScan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'kids-refetch');
const SNAPSHOT_JSON = path.join(DATA_DIR, 'old-snapshot.json');
const SNAPSHOT_SQL = path.join(DATA_DIR, 'old-snapshot.sql');
const REPORT_PATH = path.join(DATA_DIR, 'K-C-report.md');
const TRACKING_PATH = path.join(DATA_DIR, 'run-tracking.json');

const VALID_LANGS = new Set(['粵語', '國語', '英文']);
// §3.4.2:8 個有官方 channel/playlist 嘅兒童團體。
const KIDS_CHANNEL_GROUPS = GROUPS.filter((g) => g.lang === '兒童' && g.priority === 4 && g.channel);
// §3.4.2:channel 已拆嘅 2 個團體(KotM 4 首 + Saddleback 1 首),由
// old-snapshot 讀返 youtube_id,逐條 allowlist 重驗。
const ALLOWLIST_GROUP_NAMES = ['Kids on the Move', 'Saddleback Kids'];

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const DELAY_MS = Number(arg('--delay', 5000));
const ONLY_GROUP = arg('--group', null);
const REPORT_ONLY = process.argv.includes('--report-only');
const SKIP_ALLOWLIST = process.argv.includes('--skip-allowlist');
const STATUS_ONLY = process.argv.includes('--status');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

// ── K-A:快照現存 619 首 lang='兒童'(rollback 材料,§3.4.3)────────────
function ensureSnapshot(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SNAPSHOT_JSON)) {
    log(`K-A 快照已存在(${SNAPSHOT_JSON}),唔重新 dump(想重做要人手刪咗個檔先)`);
    return JSON.parse(fs.readFileSync(SNAPSHOT_JSON, 'utf8'));
  }
  const rows = query(db, `SELECT id, youtube_id, title, artist, org, curated, status, duration
                          FROM hymns_all WHERE lang='兒童' ORDER BY id`);
  fs.writeFileSync(SNAPSHOT_JSON, JSON.stringify(rows, null, 2), 'utf8');
  const esc = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
  const sqlLines = rows.map((r) => (
    `INSERT INTO hymns_all (id, youtube_id, title, artist, org, curated, status, duration, lang, kids, category) ` +
    `VALUES (${r.id}, ${esc(r.youtube_id)}, ${esc(r.title)}, ${esc(r.artist)}, ${esc(r.org)}, ${Number(r.curated) || 0}, ${esc(r.status)}, ${esc(r.duration)}, '兒童', 1, '兒童');`
  ));
  fs.writeFileSync(SNAPSHOT_SQL, `${sqlLines.join('\n')}\n`, 'utf8');
  log(`K-A 快照完成:${rows.length} 首 → ${SNAPSHOT_JSON}(對數用)+ ${SNAPSHOT_SQL}(rollback 用)`);
  return rows;
}

function loadSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_JSON, 'utf8'));
}

// ── kids_refetch staging table ───────────────────────────────────────
// 欄位對齊 hymns_all 主欄位(TAXONOMY-5D-PLAN §3.4.3)。flag/source_group
// 係 staging 專屬嘅審計欄(K-C 報告用),唔會帶入 hymns_all(K-D 換血嗰陣
// 由 caller 揀返 hymns_all 需要嘅欄位)。
function ensureStagingTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS kids_refetch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    display_title TEXT DEFAULT '',
    artist TEXT,
    category TEXT DEFAULT '兒童',
    youtube_id TEXT NOT NULL UNIQUE,
    duration TEXT,
    lang TEXT DEFAULT '',
    org TEXT DEFAULT '',
    kids INTEGER DEFAULT 1,
    status TEXT DEFAULT 'ok',
    curated INTEGER DEFAULT 1,
    flag TEXT DEFAULT '',
    source_group TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// ── dedup:對照成個 hymns_all,但要排除「而家嘅兒童 cohort」──────────────
// 唔排除就乜都攞唔返(呢 471 首而家全部仲喺 hymns_all,C4 先會 delete)。
// 148 首 rejected 墓碑刻意**唔**喺排除範圍入面 —— 留喺 blocklist 攔住垃圾
// 翻生(§3.4.1,設計唔係 bug)。
function buildDedupBlocklist(db) {
  const rows = query(db, `SELECT youtube_id FROM hymns_all WHERE NOT (lang='兒童' AND status != 'rejected')`);
  return new Set(rows.map((r) => r.youtube_id));
}
function stagingYoutubeIds(db) {
  // --dry 第一次跑嗰陣個表可能仲未建(Step 0 喺 DRY 模式唔會 CREATE TABLE,
  // 見 main()),回空集合就得,唔係就會炸。
  if (!tableExists(db, 'kids_refetch')) return new Set();
  return new Set(query(db, `SELECT youtube_id FROM kids_refetch`).map((r) => r.youtube_id));
}

// ── 語言判斷(收錄嗰刻定 lang,§3.4.3)+ 雙值守衛(C1 驗收觀察④)────────
// 粵語書面特有虛詞 —— 純粹用嚟喺「雙值 kidsLang」團體度判斷邊首係粵語,
// 唔係通用嘅語言偵測(國語/英文歌名冇呢啲字先算,唔係「有就一定粵語」)。
const CANTONESE_PARTICLES = /嘅|咗|喺|喇|嚟|嘢|佢|唔該|冇喇|傾偈|依家|噉樣|㗎啦|邊度|點解|返嚟|畀你/;

function resolveKidsLang(group, title) {
  const kidsLang = group.kidsLang || '';
  if (!kidsLang.includes('/')) {
    // 單語言團體:sanity check(§3.4.3)—— 英文團體撞到全 CJK / 中文團體撞到
    // 明顯英文歌名,唔阻收錄,但標 flag='lang-suspect' 俾人手覆核,唔算定案。
    const hasCJK = /[一-鿿㐀-䶿]/.test(title);
    const hasLatinWord = /[A-Za-z]{3,}/.test(title);
    let flag = '';
    if (kidsLang === '英文' && hasCJK && !hasLatinWord) flag = 'lang-suspect';
    if ((kidsLang === '粵語' || kidsLang === '國語') && hasLatinWord && !hasCJK) flag = 'lang-suspect';
    return { lang: kidsLang, flag };
  }
  // 雙值團體(觀察④:611 Kids Worship 係「粵語/國語」,而家 channel:null
  // 呢個 script 行唔到佢,但邏輯要頂得住第日補返 channel)—— 逐首憑粵語
  // 書面虛詞判斷,判唔到就唔准亂寫,回 lang=null 令 caller 唔 insert。
  const options = kidsLang.split('/');
  if (options.includes('粵語') && CANTONESE_PARTICLES.test(title)) {
    return { lang: '粵語', flag: '' };
  }
  return { lang: null, flag: 'lang-unresolved' };
}

// ── 寫入 staging(鎖內零網絡操作,即攞即放 —— 跟 fetchLyrics.js 同一套協議)──
async function insertStagingRow(fields) {
  if (DRY) {
    log(`    [DRY] 會 insert:${fields.title}(${fields.lang}${fields.flag ? ` flag=${fields.flag}` : ''})`);
    return true;
  }
  const token = await acquireDbLock('refetchKids');
  if (!token) {
    log('    ⚠ 攞唔到 DB 鎖,今次呢首 skip(未入 staging,下次 rerun 會再試)');
    return false;
  }
  try {
    const freshDb = await openDb();
    ensureStagingTable(freshDb);
    const exists = query(freshDb, `SELECT 1 FROM kids_refetch WHERE youtube_id=?`, [fields.youtube_id])[0];
    if (exists) { log('    (已經喺 staging,skip)'); return true; }
    freshDb.run(
      `INSERT INTO kids_refetch (title, display_title, artist, category, youtube_id, duration, lang, org, kids, status, curated, flag, source_group)
       VALUES (?, ?, ?, '兒童', ?, ?, ?, ?, 1, 'ok', 1, ?, ?)`,
      [fields.title, cleanDisplayTitle(fields.title, fields.org), fields.org, fields.youtube_id,
        fields.duration || null, fields.lang, fields.org, fields.flag || '', fields.source_group]
    );
    saveDb(freshDb);
    log(`    ✓ staging 收錄 [${fields.lang}]${fields.flag ? ` (flag=${fields.flag})` : ''} — ${fields.title}`);
    return true;
  } finally {
    releaseDbLock(token);
  }
}

// 對照探測:成個頻道斷路器跳咗嘅時候,攞一首已知生存(非兒童)嘅歌驗證,
// 分清「真係俾 YouTube 擋」定「呢個頻道呢批片啱啱好死咗」(同 growLibrary.js
// runCurate() 嘅探測邏輯同一個精神)。
async function probeKnownGood(db) {
  const probe = query(db, `SELECT youtube_id, title FROM hymns_all
                           WHERE curated=1 AND status='ok' AND lang != '兒童'
                           ORDER BY RANDOM() LIMIT 1`)[0];
  if (!probe) return true; // 冇得驗,fail open,唔好因為呢個掣拖累成個 script
  await sleep(jitter(DELAY_MS));
  try { return !!(await resolveAudioUrl(probe.youtube_id)); } catch (_) { return false; }
}

// ── K-B:逐團體重攞 ───────────────────────────────────────────────────
// budget=40 傳落 scanChannelListing 令佢第一輪就用 depth=200
// (Math.max(40*5,30)=200)—— 呢個係一次過重攞(唔係夜晚 incremental),
// 想一次過掃盡個頻道,唔使淺層/深層兩級 fallback 嗰種「慳返request」邏輯
// (8 個頻道最大 est ~135,200 depth 綽綽有餘)。
const LISTING_BUDGET_HINT = 40;

async function processGroup(group, tracking) {
  log(`頻道:${group.name}(kidsLang=${group.kidsLang}${group.contentGate ? `,contentGate=${group.contentGate}` : ''})`);
  const db = await openDb(); // 讀唔使鎖,每個團體開波前攞返最新一份判 dedup
  const blocklist = buildDedupBlocklist(db);
  const existingIds = new Set([...blocklist, ...stagingYoutubeIds(db)]);

  const { listing, fresh } = await scanChannelListing(group.channel, LISTING_BUDGET_HINT, existingIds, { log });
  tracking.listingByGroup[group.name] = listing.map((v) => ({ id: v.id, title: v.title }));
  if (!listing.length) { log('  頻道搵唔到片,skip'); return; }
  log(`  頻道列出 ${listing.length} 條,${fresh.length} 條未收錄過(dedup 已排除而家嘅兒童cohort+staging已有)`);

  if (!channelLanguageSanityCheck(group, listing, { log })) {
    if (!tracking.langSanityFail.includes(group.name)) tracking.langSanityFail.push(group.name);
    return;
  }

  const budget = Math.max(fresh.length, 1);
  const { candidates, tried, outcomes, circuitBroken } = await validateChannelCandidates(
    group, fresh, budget, { delayMs: DELAY_MS, log }
  );
  tracking.outcomesByGroup[group.name] = Object.fromEntries(outcomes);

  if (circuitBroken) {
    log('  斷路器觸發(連續 3 次死鏈)—— 對照探測緊,分清係俾擋定係呢批片本身死咗…');
    const probeOk = await probeKnownGood(db);
    if (!probeOk) {
      log('  ⛔ 對照探測都拎唔到 —— 懷疑真係俾 YouTube 擋緊,成個 script 收工(唔再試下一個團體)。');
      tracking.blocked = true;
      return 'ABORT';
    }
    log('  對照探測拎到音訊 → 唔係俾擋,係呢個頻道呢批片本身死咗,繼續下一個團體。');
  }

  let inserted = 0;
  for (const v of candidates) {
    const { lang, flag } = resolveKidsLang(group, v.title);
    if (!VALID_LANGS.has(lang)) {
      log(`    ⚠ [語言守衛] 「${v.title}」雙值團體判唔到真語言,唔 insert,留返俾人手斷(flag=lang-unresolved)`);
      tracking.unresolvedLang.push({ group: group.name, id: v.id, title: v.title });
      continue;
    }
    const ok = await insertStagingRow({
      title: v.title, youtube_id: v.id, duration: formatDuration(v.duration),
      lang, org: group.name, source_group: group.name, flag,
    });
    if (ok) inserted++;
  }
  log(`  ${group.name}:試咗 ${tried} 條,驗證通過 ${candidates.length} 條,實際入 staging ${inserted} 條`);
  return 'OK';
}

// ── allowlist 分支:Kids on the Move(4)+ Saddleback Kids(1)───────────
// channel 已拆(REJECT 級,§3.4.2),唔可以再經頻道掃描 —— 由 old-snapshot
// 讀返呢 5 條真歌嘅 youtube_id,逐條直接 resolveAudioUrl 驗證,唔行 gate②
// (呢批片當日已經人手逐條驗過先留低,係真歌,唔使再過分類篩)。lang 固定
// 「英文」(§3.4.2 kidsLang 兩個都係英文)。
async function processAllowlist(snapshot, tracking) {
  for (const groupName of ALLOWLIST_GROUP_NAMES) {
    const group = GROUPS.find((g) => g.name === groupName);
    if (!group) { log(`  ⚠ worshipGroups.js 搵唔到「${groupName}」,skip allowlist`); continue; }
    const ids = snapshot.filter((r) => r.artist === groupName && r.status !== 'rejected');
    log(`allowlist:${groupName},${ids.length} 首(來自 old-snapshot,channel 已拆,逐條驗證)`);
    let inserted = 0;
    for (const row of ids) {
      const db = await openDb();
      if (stagingYoutubeIds(db).has(row.youtube_id)) { log(`  (已經喺 staging,skip)— ${row.title}`); continue; }
      let alive = false;
      try { alive = !!(await resolveAudioUrl(row.youtube_id)); } catch (_) {}
      if (!alive) {
        log(`  ✗ 死鏈,跳過:${row.title}`);
        tracking.outcomesByGroup[groupName] = tracking.outcomesByGroup[groupName] || {};
        tracking.outcomesByGroup[groupName][row.youtube_id] = 'skip-dead-link';
        await sleep(jitter(DELAY_MS));
        continue;
      }
      const ok = await insertStagingRow({
        title: row.title, youtube_id: row.youtube_id, duration: row.duration,
        lang: '英文', org: groupName, source_group: groupName, flag: '',
      });
      if (ok) inserted++;
      await sleep(jitter(DELAY_MS));
    }
    log(`  ${groupName}:allowlist 入 staging ${inserted} 首`);
  }
}

// ── tracking 持久化(俾分幾轆跑嘅 run 之間累積診斷資料,report 用)──────
function loadTracking() {
  try {
    return JSON.parse(fs.readFileSync(TRACKING_PATH, 'utf8'));
  } catch (_) {
    return { listingByGroup: {}, outcomesByGroup: {}, langSanityFail: [], unresolvedLang: [], blocked: false };
  }
}
function saveTracking(tracking) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TRACKING_PATH, JSON.stringify(tracking, null, 2), 'utf8');
}

// ── K-C:對數報告 ─────────────────────────────────────────────────────
const REASON_LABELS = {
  'skip-duration': '片長唔喺 75-600s 帶',
  'skip-quality': '分類/品質篩選(疑似合輯或非敬拜內容)',
  'skip-title-signal': '標題冇撞到歌訊號(contentGate,英文團體專用)',
  'skip-dead-link': '死鏈(resolveAudioUrl 攞唔到音訊)',
  'not-reached-budget': '未試到(理論上唔會發生,budget=fresh.length)',
  'not-reached-circuit-broken': '未試到(斷路器提早收工,下轆重跑會繼續)',
};

function buildReport(db, snapshot, tracking) {
  const stagingRows = tableExists(db, 'kids_refetch') ? query(db, `SELECT * FROM kids_refetch`) : [];
  const stagingByYid = new Map(stagingRows.map((r) => [r.youtube_id, r]));
  const oldByYid = new Map(snapshot.map((r) => [r.youtube_id, r]));

  const recollected = [];
  const missing = [];
  for (const old of snapshot) {
    if (old.status === 'rejected') continue; // 墓碑唔算「應該重攞」
    if (stagingByYid.has(old.youtube_id)) {
      recollected.push({ ...old, newLang: stagingByYid.get(old.youtube_id).lang });
      continue;
    }
    const groupName = old.artist;
    let reason = '呢個團體今次未輪到跑(未跑呢個團體,或者 --group 分轆跑緊)';
    if (tracking.langSanityFail.includes(groupName)) {
      reason = '頻道語言 sanity check 唔過(疑似錯 handle,成個團體今次冇試)';
    } else if (tracking.listingByGroup[groupName]) {
      const listing = tracking.listingByGroup[groupName];
      const inListing = listing.find((v) => v.id === old.youtube_id);
      if (!inListing) {
        reason = '頻道搵唔到條片(可能刪咗/私影/depth 200 都摞唔到)';
      } else {
        const outcomes = tracking.outcomesByGroup[groupName] || {};
        const o = outcomes[old.youtube_id];
        reason = o ? (REASON_LABELS[o] || o) : '有喺 listing 但未行到驗證(可能斷路器提早收工)';
      }
    }
    missing.push({ ...old, reason });
  }

  const newlyFound = stagingRows.filter((r) => !oldByYid.has(r.youtube_id));
  const flagged = stagingRows.filter((r) => r.flag);
  const unresolvedLang = tracking.unresolvedLang || [];

  const langDist = {};
  for (const r of stagingRows) langDist[r.lang] = (langDist[r.lang] || 0) + 1;

  const expectedLangByGroup = Object.fromEntries(KIDS_CHANNEL_GROUPS.map((g) => [g.name, g.kidsLang]));

  const lines = [];
  lines.push('# K-C 對數報告 —— 兒童詩歌 staging 重攞(TAXONOMY-5D-PLAN §3.4.3)');
  lines.push('');
  lines.push('> ⚠️ **走漏清單要 Eric 過目簽名先可以行 C4(原子對換)**。呢份報告可以隨住');
  lines.push('> `refetchKids.js` 分幾轆跑(`--group` / 斷點續跑)重新生成,每次都係最新狀態。');
  lines.push('');
  lines.push(`生成時間:${stamp()}`);
  lines.push(`舊庫(lang='兒童',唔計 148 首 rejected 墓碑):${snapshot.filter((r) => r.status !== 'rejected').length} 首`);
  lines.push(`staging(kids_refetch)現有:${stagingRows.length} 首`);
  lines.push(`✅ 重攞返:${recollected.length} 首  ➕ 新收:${newlyFound.length} 首  ⚠️ 走漏:${missing.length} 首`);
  lines.push('');

  lines.push('## Lang 分佈 vs §3.4.2 預期');
  lines.push('');
  lines.push('| 語言 | staging 首數 |');
  lines.push('|---|---|');
  for (const [l, n] of Object.entries(langDist)) lines.push(`| ${l || '(未定)'} | ${n} |`);
  lines.push('');
  lines.push('各團體預期 kidsLang(§3.4.2):' + Object.entries(expectedLangByGroup).map(([g, l]) => `${g}=${l}`).join('、'));
  lines.push('');

  lines.push(`## ⚠️ 走漏清單(${missing.length} 首)—— 要 Eric 過目`);
  lines.push('');
  if (!missing.length) {
    lines.push('(暫時冇走漏,或者跑未完 —— 睇返上面「舊庫」同「staging」數係咪已經夾埋)');
  } else {
    lines.push('| id | 團體 | 標題 | 原因 |');
    lines.push('|---|---|---|---|');
    for (const m of missing) lines.push(`| ${m.id} | ${m.artist} | ${(m.title || '').replace(/\|/g, '/')} | ${m.reason} |`);
  }
  lines.push('');

  lines.push(`## ➕ 新收(${newlyFound.length} 首,頻道有新片/上次漏)`);
  lines.push('');
  if (newlyFound.length) {
    lines.push('| 團體 | 語言 | 標題 |');
    lines.push('|---|---|---|');
    for (const n of newlyFound) lines.push(`| ${n.org} | ${n.lang} | ${(n.title || '').replace(/\|/g, '/')} |`);
  } else {
    lines.push('(暫時冇)');
  }
  lines.push('');

  lines.push(`## Flag 清單`);
  lines.push('');
  lines.push(`### lang-suspect(照入 staging,但唔算定案,${flagged.length} 首)`);
  if (flagged.length) {
    lines.push('| 團體 | 語言 | 標題 |');
    lines.push('|---|---|---|');
    for (const f of flagged) lines.push(`| ${f.org} | ${f.lang} | ${(f.title || '').replace(/\|/g, '/')} |`);
  } else {
    lines.push('(暫時冇)');
  }
  lines.push('');
  lines.push(`### lang-unresolved(雙值團體判唔到,冇 insert,${unresolvedLang.length} 首)`);
  if (unresolvedLang.length) {
    lines.push('| 團體 | 標題 |');
    lines.push('|---|---|');
    for (const u of unresolvedLang) lines.push(`| ${u.group} | ${(u.title || '').replace(/\|/g, '/')} |`);
  } else {
    lines.push('(暫時冇 —— 而家 8 個有 channel 嘅團體都係單一 kidsLang,雙值嘅 611 Kids Worship channel:null 行唔到呢個 script)');
  }
  lines.push('');

  lines.push(`## ✅ 重攞返(${recollected.length} 首,抽樣列頭 30 條)`);
  lines.push('');
  if (recollected.length) {
    lines.push('| 團體 | 新語言 | 標題 |');
    lines.push('|---|---|---|');
    for (const r of recollected.slice(0, 30)) lines.push(`| ${r.artist} | ${r.newLang} | ${(r.title || '').replace(/\|/g, '/')} |`);
    if (recollected.length > 30) lines.push(`| … | … | (仲有 ${recollected.length - 30} 首,見 kids_refetch table) |`);
  } else {
    lines.push('(暫時冇)');
  }
  lines.push('');

  if (tracking.blocked) {
    lines.push('## ⛔ 注意:script 曾經因為對照探測都失敗而中止(懷疑俾 YouTube 擋),睇返 run.log 確認');
    lines.push('');
  }

  return lines.join('\n');
}

function tableExists(db, name) {
  return query(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]).length > 0;
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  if (STATUS_ONLY) {
    const db = await openDb();
    if (!tableExists(db, 'kids_refetch')) { log('kids_refetch 表未建立(未跑過正式 run,--dry 唔會建表)'); return; }
    const n = query(db, `SELECT COUNT(*) c FROM kids_refetch`)[0]?.c || 0;
    log(`kids_refetch 現有 ${n} 首`);
    const byLang = query(db, `SELECT lang, COUNT(*) c FROM kids_refetch GROUP BY lang`);
    byLang.forEach((r) => log(`  ${r.lang || '(未定)'}: ${r.c}`));
    const byGroup = query(db, `SELECT source_group, COUNT(*) c FROM kids_refetch GROUP BY source_group ORDER BY c DESC`);
    byGroup.forEach((r) => log(`  ${r.source_group}: ${r.c}`));
    return;
  }

  // Step 0:K-A 快照 + staging table(idempotent,已存在就跳過)。
  let snapshot;
  {
    const lockToken = await acquireDbLock('refetchKids-init');
    if (!lockToken) { log('攞唔到 DB 鎖做初始化,收工'); process.exit(1); }
    try {
      const db = await openDb();
      // ensureSnapshot 淨係 SELECT + 寫檔案(唔碰 hymns.db 本身),--dry 都照做
      // 方便睇報告。CREATE TABLE + saveDb 先係真.寫 hymns.db,跟返 migrateTaxonomy.js
      // 嘅慣例,--dry 唔郁 DB 檔。
      snapshot = ensureSnapshot(db);
      if (!DRY) {
        ensureStagingTable(db);
        saveDb(db);
      }
    } finally {
      releaseDbLock(lockToken);
    }
  }

  const tracking = loadTracking();

  if (!REPORT_ONLY) {
    let groups = KIDS_CHANNEL_GROUPS;
    if (ONLY_GROUP) {
      groups = groups.filter((g) => g.name === ONLY_GROUP);
      if (!groups.length) { log(`⚠ 搵唔到團體「${ONLY_GROUP}」(要係下面其中一個):`); KIDS_CHANNEL_GROUPS.forEach((g) => log(`   - ${g.name}`)); process.exit(1); }
    }

    for (const group of groups) {
      const result = await processGroup(group, tracking);
      saveTracking(tracking); // 每個團體跑完即刻存,俾之後斷咗都留得低進度
      if (result === 'ABORT') { log('⛔ 因為疑似俾 YouTube 擋,唔再試下一個團體,收工。'); break; }
      await sleep(jitter(DELAY_MS));
    }

    if (!SKIP_ALLOWLIST && !tracking.blocked && !ONLY_GROUP) {
      await processAllowlist(snapshot, tracking);
      saveTracking(tracking);
    }
  }

  // K-C 報告 —— 每次跑完(唔理係全跑定 --group 分轆)都重新生成,反映最新狀態。
  const db = await openDb();
  const reportMd = buildReport(db, snapshot, tracking);
  fs.writeFileSync(REPORT_PATH, reportMd, 'utf8');
  log(`K-C 報告已出:${REPORT_PATH}`);
}

main().catch((e) => { console.error('refetchKids 出錯:', e); process.exit(1); });
