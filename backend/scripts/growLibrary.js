#!/usr/bin/env node
// 夜晚慢速擴充歌庫 —— Eric 2026-07 要求:凌晨 12 點到早上 9 點,一首一首咁慢慢加。
//
// 精神同 Phase 2 嘅 checkDeadLinks.js 一樣:**慢、穩、唔好再撞返 YouTube block**。
// Eric 部 Mac 嘅住宅 IP 係而家唯一仲行得通嘅 IP(Zeabur 個 IP 已經封死),
// 所以呢個 script 由頭到尾 concurrency = 1,而且每首之間有隨機延遲。
//
// ── 兩個 mode ──────────────────────────────────────────────────
//  --mode curate   (預設)  由**已經喺 hymns_all 入面**嘅 1153 首可用歌度,
//                          驗證 + 升級做 curated=1。**唔會搜尋 YouTube**,
//                          只係 resolve 驗證,風險同 checkDeadLinks 一模一樣。
//                          歌庫由 150 首擴到 ~588 首都唔使爬新歌(見 PLAN §1)。
//  --mode discover          搵歌庫完全冇嘅團體(GROUPS 入面 inPool:false),
//                          用 yt-dlp 搜尋 → 插入 hymns_all → 驗證 → curated。
//                          呢個先係真.爬蟲,風險最高,所以每晚額度細好多。
//
// ── 安全掣 ────────────────────────────────────────────────────
//  * 唔喺 00:00-09:00 就即刻退出(就算 launchd 出錯 misfire 都唔會日頭爬)
//  * --budget 限死每次行幾多首
//  * 每首之間 sleep(base + 隨機 jitter),唔會有固定節奏俾人 fingerprint
//  * 連續失敗 3 次就當 YouTube 開始擋,即刻收工(唔好死撐)
//  * 全程沿用 Phase 2 嘅品質篩選:去重 / 合輯 / 世俗歌 / 死鏈
//
// Usage:
//   node scripts/growLibrary.js --mode curate --budget 6 --delay 4000
//   node scripts/growLibrary.js --mode discover --budget 2 --delay 8000
//   node scripts/growLibrary.js --status          # 淨係報告進度,唔改嘢
//   node scripts/growLibrary.js --ignore-window   # 手動測試用,繞過時段檢查

import { openDb, saveDb, query, sleep, isCompilation, isNonWorship, dedupeByYoutubeId } from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { ACTIVE_GROUPS } from '../data/worshipGroups.js';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MODE = arg('--mode', 'curate');
const BUDGET = Number(arg('--budget', 6));
const DELAY_MS = Number(arg('--delay', 4000));
const STATUS_ONLY = process.argv.includes('--status');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const DRY = process.argv.includes('--dry');

// Eric 指定嘅時段
const WINDOW_START = 0;   // 00:00
const WINDOW_END = 9;     // 09:00(唔包 9 點)

// 目標歌庫比例 —— Eric 2026-07 拍板 粵30/國50/英20;2026-07-20 追加拍板:
// 兒童詩歌做第4個獨立分類,原三語言比例(3:5:2)按比例縮10%讓位:27/45/18/10。
const QUOTA = { '粵語': 0.27, '國語': 0.45, '英文': 0.18, '兒童': 0.10 };
// 每個歌手最多幾多首。低 cap = 高多樣性;歌庫大咗先慢慢放寬。
const ARTIST_CAP = Number(arg('--cap', 12));

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function inWindow() {
  const h = new Date().getHours();
  return h >= WINDOW_START && h < WINDOW_END;
}

// 隨機化延遲:固定節奏最似機械人
function jitter(base) {
  return Math.round(base * (0.7 + Math.random() * 0.9)); // base 0.7x ~ 1.6x
}

function usablePool(db) {
  const all = query(db, `SELECT id,title,artist,youtube_id,lang,status,curated,fail_streak
                         FROM hymns_all WHERE youtube_id IS NOT NULL AND youtube_id != ''`);
  return dedupeByYoutubeId(all)
    .filter((r) => !isCompilation(r.title))
    .filter((r) => !isNonWorship(r.title, r.artist))
    .filter((r) => r.status !== 'dead')
    // 試咗 3 次都拎唔到音訊 = 當佢死,唔好次次夜晚都攞返出嚟阻住條隊。
    // (真正標 'dead' 係 checkDeadLinks.js 嘅職責,呢度淨係唔揀佢。)
    .filter((r) => (r.fail_streak || 0) < 3);
}

function report(db) {
  const pool = usablePool(db);
  const cur = pool.filter((r) => r.curated);
  const byLang = {};
  for (const r of pool) {
    byLang[r.lang] ??= { usable: 0, curated: 0, artists: new Set() };
    byLang[r.lang].usable++;
    if (r.curated) byLang[r.lang].curated++;
    byLang[r.lang].artists.add(r.artist);
  }
  log(`歌庫進度:${cur.length} 首已收錄 / ${pool.length} 首可用`);
  for (const [l, v] of Object.entries(byLang)) {
    const pct = cur.length ? ((v.curated / cur.length) * 100).toFixed(0) : 0;
    log(`   ${l}  ${String(v.curated).padStart(3)} 首 (${pct}%)  仲有 ${v.usable - v.curated} 首可揀  ${v.artists.size} 個歌手`);
  }
  return { pool, cur, byLang };
}

// 揀下一首要收錄嘅歌:跟配額搵最落後嗰個語言,再喺入面揀「歌手最少歌」嗰個,
// 保持多樣性(同 curateLibrary.js 嘅 round-robin 精神一致)。
function pickNextCandidate(pool, skip = new Set(), benched = new Set()) {
  const cur = pool.filter((r) => r.curated);
  const total = cur.length || 1;

  const countBy = (lang) => cur.filter((r) => r.lang === lang).length;
  const artistCount = new Map();
  for (const r of cur) artistCount.set(r.artist, (artistCount.get(r.artist) || 0) + 1);

  // 邊個語言最落後於配額
  const deficits = Object.entries(QUOTA)
    .map(([lang, pct]) => ({ lang, deficit: pct - countBy(lang) / total }))
    .sort((a, b) => b.deficit - a.deficit);

  for (const { lang } of deficits) {
    const candidates = pool
      .filter((r) => !r.curated && r.lang === lang && !skip.has(r.id) && !benched.has(r.artist))
      .filter((r) => (artistCount.get(r.artist) || 0) < ARTIST_CAP)
      // ⚠️ 唔可以用 `a.id - b.id` 做次序(實測踩過):低 id = 最早爬返嚟嗰批,
      // 佢哋啲片死亡率高好多 —— 連試基恩敬拜同角聲使團各 3 首全部拎唔到,
      // 但隨機抽樣 13 首(當中都有基恩敬拜)就 13/13 全部生還。
      // 即係「死」係集中喺舊 id,唔係集中喺某個團體。所以次序用隨機,
      // 唔好次次都由最舊嗰批開始鏟。
      .sort((a, b) => (artistCount.get(a.artist) || 0) - (artistCount.get(b.artist) || 0) || Math.random() - 0.5);
    if (candidates.length) return candidates[0];
  }
  return null;
}

async function runCurate(db) {
  log(`mode=curate budget=${BUDGET} delay=~${DELAY_MS}ms cap=${ARTIST_CAP}/歌手`);
  let added = 0, failed = 0, streak = 0;
  const tried = new Set();   // 同一 run 唔好重複試同一首
  // 有啲團體成批片都死晒(實測:基恩敬拜連試 5 首都拎唔到)。而候選排序係
  // 「揀已收錄最少嗰個歌手」,所以會一路死磕同一個團體,夜夜嘥晒額度。
  // 一個團體喺同一 run 內失敗夠 3 次,就當佢今晚唔得,跳去下一個團體。
  const artistFails = new Map();
  const benchedArtists = new Set();

  for (let i = 0; i < BUDGET; i++) {
    const pool = usablePool(db);
    const c = pickNextCandidate(pool, tried, benchedArtists);
    if (!c) { log('冇更多合資格候選(配額 / 歌手上限都滿咗)'); break; }

    tried.add(c.id);
    log(`  驗證中 [${c.lang}] ${c.artist} — ${c.title}`);
    let alive = false;
    try {
      const url = await resolveAudioUrl(c.youtube_id);
      alive = !!url;
    } catch (e) {
      log(`    resolve 出錯:${e?.message || e}`);
    }

    if (alive) {
      if (!DRY) {
        db.run(`UPDATE hymns_all SET curated=1, status='ok', last_checked=?, fail_streak=0 WHERE id=?`, [today(), c.id]);
        saveDb(db);
      }
      added++; streak = 0;
      log(`    ✓ 收錄 (累計 +${added})`);
    } else {
      if (!DRY) {
        db.run(`UPDATE hymns_all SET status='unchecked', last_checked=?, fail_streak=fail_streak+1 WHERE id=?`, [today(), c.id]);
        saveDb(db);
      }
      failed++; streak++;
      const af = (artistFails.get(c.artist) || 0) + 1;
      artistFails.set(c.artist, af);
      log(`    ✗ 拎唔到音訊,跳過 (連續失敗 ${streak})`);
      if (af >= 3 && !benchedArtists.has(c.artist)) {
        benchedArtists.add(c.artist);
        log(`    ⏭ 「${c.artist}」今晚已經失敗 ${af} 次,成個團體今晚跳過,試下一個`);
      }

      // 連續失敗有兩個好唔同嘅原因,唔可以撈埋一齊:
      //   (a) 真係俾 YouTube 擋 → 一定要即刻收工
      //   (b) 淨係啱啱撞到某個團體成批片都死咗(實測:基恩敬拜連續 3 首都拎唔到,
      //       但同一時間已收錄嘅歌 resolve 得一乾二淨)→ 收工就錯,會令進度
      //       永遠卡死喺 0。
      // 所以唔猜:直接攞一首**已收錄、驗過 work** 嘅歌做對照探測。
      // 對照拎到 = 唔關 block 事,重設 streak 繼續行;對照都拎唔到 = 真係俾擋。
      if (streak >= 3) {
        log('  連續 3 次失敗 —— 用已收錄嘅歌做對照探測,分清係俾擋定係啲片本身死咗…');
        await sleep(jitter(DELAY_MS));
        const probe = query(db, `SELECT youtube_id, title FROM hymns_all
                                 WHERE curated=1 AND status='ok' ORDER BY RANDOM() LIMIT 1`)[0];
        let probeOk = false;
        try { probeOk = !!(probe && await resolveAudioUrl(probe.youtube_id)); } catch (_) {}
        if (probeOk) {
          log(`  對照「${probe.title}」拎到音訊 → 唔係俾擋,係嗰批片本身死咗。繼續。`);
          streak = 0;
        } else {
          log('  對照都拎唔到 → 真係俾 YouTube 擋緊,今晚收工。');
          break;
        }
      }
    }

    if (i < BUDGET - 1) await sleep(jitter(DELAY_MS));
  }

  log(`今次:收錄 ${added} 首,失敗 ${failed} 首`);
  return added;
}

async function runDiscover(db) {
  // 只做歌庫完全冇嘅團體,粵語優先(priority 1)
  const missing = ACTIVE_GROUPS.filter((g) => !g.inPool).sort((a, b) => a.priority - b.priority);
  if (!missing.length) { log('冇未吸納嘅團體'); return 0; }
  log(`mode=discover budget=${BUDGET} —— 未吸納團體 ${missing.length} 個,今晚做:${missing[0].name}`);
  log('⚠️ discover 需要 yt-dlp 搜尋,係最高風險嘅動作。');
  log('   呢個 mode 而家係**預留**,未接搜尋邏輯 —— 因為 curate mode 仲有幾百首');
  log('   可以收錄,完全唔使爬。等 curate 見底(或者 Eric 話要新團體)先開。');
  log('   要落實請睇 LIBRARY-EXPANSION-PLAN.md §3。');
  return 0;
}

async function main() {
  const db = await openDb();

  if (STATUS_ONLY) { report(db); return; }

  if (!inWindow() && !IGNORE_WINDOW) {
    log(`而家 ${new Date().getHours()} 點,唔喺 ${WINDOW_START}:00-${WINDOW_END}:00 時段,唔做嘢。`);
    return;
  }

  report(db);
  const added = MODE === 'discover' ? await runDiscover(db) : await runCurate(db);
  log('---');
  if (added > 0) report(db);
}

main().catch((e) => { console.error('growLibrary 出錯:', e); process.exit(1); });
