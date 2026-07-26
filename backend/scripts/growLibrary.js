#!/usr/bin/env node
// 慢速擴充歌庫 —— Eric 2026-07 要求:一首一首咁慢慢加,唔好一次過爆量撞 YouTube。
//
// 精神同 Phase 2 嘅 checkDeadLinks.js 一樣:**慢、穩、唔好再撞返 YouTube block**。
// Eric 部 Mac 嘅住宅 IP 係而家唯一仲行得通嘅 IP(Zeabur 個 IP 已經封死),
// 所以呢個 script 由頭到尾 concurrency = 1,而且每首之間有隨機延遲。
//
// ⚠️ 2026-07-21 Eric 拍板:轉 24 小時運行,唔再限死 00:00-09:00(見下面
// `ENFORCE_TIME_WINDOW`)。原因:而家得 Eric 一個人用 App,冇真實用戶撞
// yt-dlp/backend 資源嘅風險,可以進取啲。排程由 launchd 每 15 分鐘一次
// (`ops/launchd/com.hymnapp.growlibrary.plist` 嘅 `StartInterval`),
// 但單次請求節奏(concurrency 1、jitter、斷路器)完全冇變 —— 淨係
// **check-in 密咗**,唔係「一次過攞多好多」。
//
// ── 兩個 mode ──────────────────────────────────────────────────
//  --mode curate   (預設)  由**已經喺 hymns_all 入面**嘅可用歌度,
//                          驗證 + 升級做 curated=1。**唔會搜尋 YouTube**,
//                          只係 resolve 驗證,風險同 checkDeadLinks 一模一樣。
//  --mode discover          搵歌庫完全冇嘅團體(GROUPS 入面 inPool:false),
//                          用官方頻道 flat-playlist 攞候選 → 插入 hymns_all → curated。
//                          呢個先係真.爬蟲,風險最高,所以每次額度細好多。
//
// ── 收錄關卡:攞歌唔等於收錄(Eric 2026-07-20 要求)──────────────────
// 兩個 mode 都一定要順序捱晒:① 搜尋候選 → ② 分類/品質篩選(合輯/世俗歌,
// 平嘅一關做先) → ③ 死鏈驗證(resolveAudioUrl,貴嘅一關留俾已經睇落啱嘅候選)
// → ④ 全部過晒先寫入 DB。攞到個 YouTube ID 唔算完成,任何一關唔過都唔會落 DB。
// 實作見下面 `passesQuality()` / `verifyPlayable()`,同 `runCurate` / `runDiscover`
// 入面逐關嘅註解。
//
// ── 安全掣 ────────────────────────────────────────────────────
//  * --budget 限死每次行幾多首
//  * 每首之間 sleep(base + 隨機 jitter),唔會有固定節奏俾人 fingerprint
//  * 連續失敗 3 次就當 YouTube 開始擋,即刻收工(唔好死撐)
//  * 全程沿用 Phase 2 嘅品質篩選:去重 / 合輯 / 世俗歌 / 死鏈
//  * DB 寫入鎖(見 hymnDb.js `acquireDbLock`),同 checkDeadLinks.js 唔會撞埋手
//  * 「有真人聽緊就縮」開關(`THROTTLE_FOR_LISTENERS`),而家未開,見下面說明
//
// Usage:
//   node scripts/growLibrary.js --mode curate --budget 6 --delay 4000
//   node scripts/growLibrary.js --mode discover --budget 2 --delay 8000
//   node scripts/growLibrary.js --status          # 淨係報告進度,唔改嘢
//   node scripts/growLibrary.js --ignore-window   # 手動測試用,繞過時段檢查(而家預設已經冇時段限制)

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { openDb, saveDb, query, sleep, isCompilation, isNonWorship, dedupeByYoutubeId, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { ACTIVE_GROUPS } from '../data/worshipGroups.js';

const exec = promisify(execCb);

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MODE = arg('--mode', 'curate');
const BUDGET = Number(arg('--budget', 6));
const DELAY_MS = Number(arg('--delay', 4000));
// ⚠️ 2026-07-24 Eric 要求查證加快:`DISCOVER_BUDGET` 原本係 3(每語言 1),
// 查過**冇任何實測/硬性限制支持呢個數**——純粹係 2026-07-23 寫呢個功能
// 嗰陣揀嘅保守估計。真正嘅安全掣係下面呢幾樣(冇改過):concurrency 1、
// 每首之間 jitter 延遲、連續 3 次失敗嘅斷路器 + 對照探測。discover 嘅
// resolve 步驟同 curate 用緊**同一個** `resolveAudioUrl()`,冇理由話
// discover 嘅 resolve 特別高風險 —— 高風險嘅其實係「搜尋」呢步
// (`listChannelVideos`,但呢步本身平好多,一個 tick 淨係揸一次,唔跟
// budget 定貴)。
//
// 而且而家有件事之前冇諗到:粵/國/兒童 curate backlog **已經見底**(見
// HANDOFF「見底」條目),即係話每個 tick curate 實際上做緊 0 次 resolve
// (即刻「冇更多合資格候選」退出)。之前 curate(6)+discover(3)=最多 9
// 次 resolve/tick 跑咗成日都零事故,而家 curate 嗰 6 個額度完全冧咗出嚟
// 冇用 —— 將 discover 拉到 9(3 per 語言),總 resolve 量都仲喺返嗰個
// **已經證明穩陣咗幾日**嘅上限之內,唔係新嘅冒險。
const DISCOVER_BUDGET = Number(arg('--discover-budget', 9));
const STATUS_ONLY = process.argv.includes('--status');
const IGNORE_WINDOW = process.argv.includes('--ignore-window');
const IGNORE_OFFICE_HOURS = process.argv.includes('--ignore-office-hours');
const DRY = process.argv.includes('--dry');

// Eric 原本指定嘅時段(2026-07-18)。2026-07-21 Eric 拍板轉 24 小時運行,
// 呢個 gate 而家**預設關咗**(`ENFORCE_TIME_WINDOW = false`)。冇刪 WINDOW_*
// / `inWindow()` —— 淨係想返轉頭夜間限時嘅話,呢兩個常數同判斷式已經喺度,
// 改返 `true` 就得,唔使重新設計。
const WINDOW_START = 0;   // 00:00
const WINDOW_END = 9;     // 09:00(唔包 9 點)
const ENFORCE_TIME_WINDOW = false;

// ── 「有真人聽緊就縮」開關(2026-07-21 Eric 拍板,而家未開)────────────
// 而家得 Eric 一個人用 App,冇真實用戶撞資源嘅風險,所以先可以轉 24 小時、
// 加密到 15 分鐘一次。但呢個唔會永遠咁進取 —— 將來真係有用戶,攞歌撞正
// 播放中會爭 yt-dlp/backend 資源(同之前「攞歌搶咗播放中資源引致斷續」
// 個 bug 屬同一類風險,見 resolveAudio.js `anyStreaming()` 個 keep-warm
// 止血邏輯)。呢個開關轉做 true 就會每次行動作之前,問返 backend「而家
// 有冇人聽緊歌」(經 `/api/internal/activity`,底層直接讀 `anyStreaming()`
// 個 refcount,唔係另起一份新狀態),有嘅話就成輪跳過,唔同真實播放爭資源。
// **啟動方法:得一行改 `THROTTLE_FOR_LISTENERS = true`,唔使再寫過邏輯。**
const THROTTLE_FOR_LISTENERS = false;
const BACKEND_BASE = process.env.BACKEND_BASE || 'http://localhost:3001';

async function detectActiveListeners() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${BACKEND_BASE}/api/internal/activity`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return false; // backend 有事都好過令排程死鎖 —— fail open
    const { streaming } = await res.json();
    return !!streaming;
  } catch (_) {
    return false; // backend 冇行 / timeout,一律當冇人聽,唔好因為呢個掣拖累成個排程
  }
}

// ⚠️ 2026-07-20 Eric 追加拍板:歌庫**擴充**唔好俾固定語言比例綁住。
// 150 首試版庫嗰陣 粵30/國50/英20(加埋兒童做第4分類)係刻意揀出嚟嘅初始
// 組合,但夜晚擴充呢個機制唔應該死跟住呢條數 —— 唔好因為某個語言「已經夠
// 原定比例」就特登唔畀佢再郁,亦唔使逼另一個語言一定要追到某個數先罷休。
// 而家淨係跟「歌手多樣性」揀(邊個歌手已收錄最少就優先佢),各分類自然
// 按實際搵到幾多優質(過得晒四關)嘅歌自己增長,長成點就點。
//
// ⚠️ 2026-07-23 Eric 追加拍板:ARTIST_CAP(每個歌手上限)同上面嗰個已經
// 取消嘅語言 quota **係同一種精神嘅限制**(數字夠咗就唔畀個 bucket 再郁),
// 只係維度由「語言」換做「歌手」。2026-07-22 全日觀察到粵語/國語凌晨 04:19
// 起全部撞「配額/歌手上限都滿咗」停晒手,正正就係呢個 cap(舊值 12)造成。
// 跟返「唔好俾數字困住」呢個原則,cap 拉到 9999(等於冇上限)。得返一樣
// 仍然生效嘅多樣性槓桿:「邊個歌手已收錄最少就優先佢」嗰條 sort —— 依然
// 會平均咁揀晒 8 個粵語 / 12 個國語歌手,唔會齋做一個歌手,但唔會再有
// 一個死硬上限阻住個歌手仲有好歌但唔畀再收。想手動測試限死多樣性
// 用返 `--cap N` override 就得。
const ARTIST_CAP = Number(arg('--cap', 9999));

// ⚠️ 2026-07-21 Eric 拍板:英文**暫停主動擴充**。
// 移除固定語言比例(見上面)之後嗰一晚(07-20 → 07-21),英文歌手多(19個)
// 又幾乎冇失敗,自然增長跑贏晒 —— 48 首新歌入面 45 首(94%)係英文,
// 粵語得 3、國語 0。Eric 話夜晚攞歌要集中火力落**粵語、國語、兒童詩歌**,
// 英文而家已收錄嗰 75 首**唔郁**(唔刪、唔隱藏),淨係唔再揀佢做新候選。
// 淨係加個名落嚟就會即刻重新畀英文郁 —— 想恢復嘅話刪走 '英文' 就得。
const PAUSED_LANGUAGES = new Set(['英文']);

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);

function inWindow() {
  const h = new Date().getHours();
  return h >= WINDOW_START && h < WINDOW_END;
}

// ⚠️ 2026-07-23 Eric 拍板:平日(星期一至六)10:30-18:30 唔好行 —— 部 Mac
// 擺喺 Eric 公司,呢段時間辦公,背景 job 撞正會拖慢公司網絡。星期日
// 全日冇限制。
//
// 呢個同上面嘅 `ENFORCE_TIME_WINDOW`/`inWindow()` 唔係同一種嘢,冇改嗰set:
//   · 舊嗰個 —— 淨係「一日入面邊段鐘」,日日一樣,而且係「限死喺窗入面
//     先做嘢」(allow-window)。
//   · 呢個 —— 多咗「星期幾」呢個維度(星期日豁免),而且係反過嚟嘅
//     「窗入面唔做嘢」(block-window)。兩個語義唔同,夾埋一個 flag/
//     function 會令 condition 好難讀,所以獨立開一個。
// 兩個掣理論上可以同時開(唔會衝突,main() 入面兩個 if 各自獨立 check),
// 但而家淨係呢個新嘅生效(`ENFORCE_TIME_WINDOW` 仍然係 false)。
const OFFICE_HOURS_BLOCK = {
  enforce: true,
  blockedDays: [1, 2, 3, 4, 5, 6], // JS getDay():0=日 1=一...6=六。淨係唔包星期日。
  startHour: 10, startMinute: 30,  // 10:30 —— 呢一刻起計入封鎖(inclusive)
  endHour: 18, endMinute: 30,      // 18:30 —— 呢一刻起計解封(exclusive,即 18:30 本身已經唔封鎖)
};

// 抽出嚟做 pure function、食一個 Date 做參數,方便手動 pass 唔同日子/時間嘅
// Date 落去測試,唔使等真實時鐘行到嗰個時間先驗證到邏輯啱唔啱。
// 用本機時區(呢部 Mac 已經係 HKT)嘅 getDay()/getHours()/getMinutes()。
function isBlockedByOfficeHours(now = new Date()) {
  if (!OFFICE_HOURS_BLOCK.enforce) return false;
  const day = now.getDay();
  if (!OFFICE_HOURS_BLOCK.blockedDays.includes(day)) return false; // 星期日,唔封
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMin = OFFICE_HOURS_BLOCK.startHour * 60 + OFFICE_HOURS_BLOCK.startMinute;
  const endMin = OFFICE_HOURS_BLOCK.endHour * 60 + OFFICE_HOURS_BLOCK.endMinute;
  return minutesNow >= startMin && minutesNow < endMin;
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
    const share = cur.length ? ((v.curated / cur.length) * 100).toFixed(0) : 0;
    const paused = PAUSED_LANGUAGES.has(l) ? ',暫停擴充' : '';
    log(`   ${l}  ${String(v.curated).padStart(3)} 首(佔庫 ${share}%,冇綁定目標${paused})  仲有 ${v.usable - v.curated} 首可揀  ${v.artists.size} 個歌手`);
  }
  return { pool, cur, byLang };
}

// 揀下一首要收錄嘅歌:唔跟語言配額,淨係揀「已收錄最少嗰個歌手」,
// 保持多樣性(同 curateLibrary.js 嘅 round-robin 精神一致)。全部未暫停嘅
// 語言撈埋一齊揀,邊個語言最終有幾多首係實際搵到嘅優質候選自然決定,
// 唔會因為某個語言撞正一個「目標比例」就特登唔畀佢再郁 ——
// 但 PAUSED_LANGUAGES 入面嘅語言(而家係英文)一定唔會揀,唔理歌手幾少。
function pickNextCandidate(pool, skip = new Set(), benched = new Set()) {
  const cur = pool.filter((r) => r.curated);
  const artistCount = new Map();
  for (const r of cur) artistCount.set(r.artist, (artistCount.get(r.artist) || 0) + 1);

  const candidates = pool
    .filter((r) => !r.curated && !skip.has(r.id) && !benched.has(r.artist))
    .filter((r) => !PAUSED_LANGUAGES.has(r.lang))
    .filter((r) => (artistCount.get(r.artist) || 0) < ARTIST_CAP)
    // ⚠️ 唔可以用 `a.id - b.id` 做次序(實測踩過):低 id = 最早爬返嚟嗰批,
    // 佢哋啲片死亡率高好多 —— 連試基恩敬拜同角聲使團各 3 首全部拎唔到,
    // 但隨機抽樣 13 首(當中都有基恩敬拜)就 13/13 全部生還。
    // 即係「死」係集中喺舊 id,唔係集中喺某個團體。所以次序用隨機,
    // 唔好次次都由最舊嗰批開始鏟。
    .sort((a, b) => (artistCount.get(a.artist) || 0) - (artistCount.get(b.artist) || 0) || Math.random() - 0.5);
  return candidates[0] || null;
}

// ── 收錄關卡(Eric 2026-07-20 要求)──────────────────────────────
// 「攞到個 YouTube ID」唔算完成。任何一首歌,唔理係 curate 定 discover 搵返嚟,
// 一定要順序捱晒以下幾關先可以寫入 DB 做正式歌庫嘅一部份,缺一不可:
//   1. 搜尋 —— 搵到候選(curate:已經喺 hymns_all;discover:官方頻道 flat-playlist)
//   2. 分類 / 品質篩選 —— isCompilation / isNonWorship,唔啱嘅**唔使嘥錢驗死鏈**直接鏟
//   3. 死鏈驗證 —— resolveAudioUrl 真係攞到音訊 URL 先算生
//   4. 寫入 —— 淨係四關都過咗嘅先 UPDATE curated=1(curate)或者 INSERT(discover)
// 分類擺喺死鏈驗證之前:純字串判斷唔使成本,死鏈驗證要行 yt-dlp、要撞 YouTube,
// 應該留俾已經睇落似啱嘅候選先用。
function passesQuality(title, artist) {
  return !isCompilation(title) && !isNonWorship(title, artist);
}

async function verifyPlayable(youtubeId) {
  try {
    return !!(await resolveAudioUrl(youtubeId));
  } catch (_) {
    return false;
  }
}

// discover mode 專用:用官方頻道 handle 列片(flat-playlist,唔落載、唔逐條resolve,
// 好平),**唔好用關鍵字搜尋** —— 撳正官方頻道先準,又慳 request。
async function listChannelVideos(channelHandle, limit) {
  const url = `https://www.youtube.com/${channelHandle}/videos`;
  const { stdout } = await exec(
    `yt-dlp --flat-playlist --playlist-end ${limit} --print "%(id)s|%(title)s" "${url}"`,
    { timeout: 30000 }
  );
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf('|');
    return { id: line.slice(0, i), title: line.slice(i + 1) };
  });
}

// curate mode 嘅四關對應:① 搜尋 = usablePool()(候選已經喺 hymns_all);
// ② 分類/品質篩選 = usablePool() 入面嘅 isCompilation/isNonWorship(呢批歌原始
// import 嗰陣已經分咗 lang,呢度淨係再篩多次質素);③ 死鏈驗證 = 下面嘅
// resolveAudioUrl();④ 寫入 = 淨係 alive 先 UPDATE curated=1。四關缺一不可,
// 跳咗 ③ 或者驗證失敗都唔會落到 ④。
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

// 幫**一個**團體攞新歌(discover 嘅核心邏輯)。抽出嚟做獨立 function 係
// 因為 2026-07-23 Eric 拍板:粵語/國語/兒童**一齊**開始收,唔好淨係揀
// 「優先度最高嗰一個」團體 —— 所以 `runDiscoverAll()` 會逐個語言都攞一次。
async function discoverFromGroup(db, group, budget) {
  log(`  discover:${group.name}(${group.lang},${group.channel}),額度 ${budget}`);

  // 1. 搜尋:攞多過 budget 幾倍嘅候選,因為之後仲有幾關會刷走一批。
  // ⚠️ 唔可以淨係 budget*5(budget 細嗰陣得 5 條)—— `--playlist-end` 每次
  // 都係由頭攞嗰個頻道**最新**嗰幾條,budget 細嘅話,dedup 幾次之後
  // 呢幾條片就會全部見過,之後永遠 fresh.length=0,睇落好似個團體「攞晒」
  // 但其實個頻道仲有排片喺後面攞唔到。攞多啲(至少 30)確保有得揀好幾晚。
  let listing;
  try {
    listing = await listChannelVideos(group.channel, Math.max(budget * 5, 30));
  } catch (e) {
    log(`    頻道列表攞唔到:${e?.message || e}`);
    return { added: 0, tried: 0 };
  }
  if (!listing.length) { log('    呢個頻道搵唔到片,可能 handle 舊咗'); return { added: 0, tried: 0 }; }

  const existing = new Set(query(db, `SELECT youtube_id FROM hymns_all`).map((r) => r.youtube_id));
  const fresh = listing.filter((v) => v.id && !existing.has(v.id));
  log(`    頻道列出 ${listing.length} 條,${fresh.length} 條未收錄過`);

  let added = 0, tried = 0, streak = 0;
  for (const v of fresh) {
    if (tried >= budget) break;

    // 2. 分類 / 品質篩選 —— 平嘅一關,喺呢度做完先至值得使錢做第 3 關。
    if (!passesQuality(v.title, group.name)) {
      log(`    ⏭ [分類] 「${v.title}」睇個標題係合輯/世俗歌,唔驗證直接跳過`);
      continue;
    }

    tried++;
    log(`    驗證中 [${group.lang}] ${group.name} — ${v.title}`);

    // 3. 死鏈驗證。
    const alive = await verifyPlayable(v.id);
    if (!alive) {
      streak++;
      log(`      ✗ 拎唔到音訊,跳過 (連續失敗 ${streak})`);
      if (streak >= 3) {
        log('    連續 3 次失敗 —— discover 風險本身已經比 curate 高,呢個團體今次收工唔博。');
        break;
      }
      if (tried < budget) await sleep(jitter(DELAY_MS));
      continue;
    }
    streak = 0;

    // 4. 四關全過,先至寫入 —— 呢一步先真正成為歌庫一部份。
    if (!DRY) {
      db.run(
        `INSERT INTO hymns_all (title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak)
         VALUES (?, ?, ?, ?, ?, 1, 'ok', ?, 0)`,
        [v.title, group.name, group.lang, v.id, group.lang, today()]
      );
      saveDb(db);
    }
    added++;
    log(`      ✓ 收錄 (累計 +${added})`);
    if (tried < budget) await sleep(jitter(DELAY_MS));
  }

  log(`    今次(discover,${group.name}):頻道有 ${fresh.length} 條新片,試咗 ${tried} 條,收錄 ${added} 首`);
  return { added, tried };
}

// ⚠️ 2026-07-23 Eric 拍板:粵語/國語/兒童**一齊**開始收,唔好排隊逐個攻。
// 之前一個 run 淨係做「優先度最高」嗰一個未吸納團體(通常長期係粵語,
// 因為粵語有 17 個未吸納團體排喺前面),兒童 13 個團體會排到好後,一直冇
// 機會郁。而家逐個未暫停語言都揀返「該語言優先度最高嗰一個未吸納團體」,
// 平均分 budget,一個 run 入面粵/國/兒童一齊有進度。
async function runDiscoverAll(db, totalBudget) {
  const langs = [...new Set(ACTIVE_GROUPS.map((g) => g.lang))].filter((l) => !PAUSED_LANGUAGES.has(l));

  // ⚠️ 2026-07-23 Eric 拍板:「所有團體/歌手都唔設上限,淨係用『邊個收錄
  // 最少就優先』做多樣性」—— discover mode 揀邊個未吸納團體都跟返呢條原則,
  // 唔係死跟 priority。原因:一個語言入面通常有成十幾個未吸納團體(兒童
  // 13 個入面 7 個有 channel),死跟 priority 會令永遠都係嗰一個團體攞晒
  // budget,個 channel 攞晒先會輪到第二個,13 個團體實際上會變成「得一個
  // 郁」。而家逐次都揀返「已經幫佢收錄最少」嗰個,自然輪流晒。
  const artistCounts = new Map();
  for (const r of query(db, `SELECT artist, COUNT(*) c FROM hymns_all WHERE curated=1 GROUP BY artist`)) {
    artistCounts.set(r.artist, r.c);
  }
  // ⚠️ 2026-07-24 修:打和(例如兒童 4 個團體啱啱好全部 1 首)嗰陣,`.sort()`
  // 係 stable sort,而 `a.priority - b.priority` 喺**同一語言**入面永遠係
  // 0(同語言嘅團體 priority 值全部一樣,呢個 tiebreak 從來冇真正生效過)
  // —— 結果打和永遠揀返陣列排第一嗰個。實測踩過:Saddleback Kids 排
  // 兒童組第一,4 個團體打和 1 首之後,佢個頻道現有 listing 已經攞晒
  // (試極都 0 條),但因為「打和揀第一」佢仍然每次贏,其他 3 個永遠冚
  // 唔到棚。同 curate mode 嗰個「唔可以用固定次序,要隨機」(見
  // `pickNextCandidate`)係同一個坑。改用隨機 tiebreak,打和嗰陣每個
  // 團體機會均等,唔會再被同一個(尤其係已經攞晒嘅)團體長開霸位。
  const langCandidates = [];
  for (const lang of langs) {
    const candidates = ACTIVE_GROUPS.filter((g) => g.lang === lang && !g.inPool && g.channel);
    if (!candidates.length) continue;
    candidates.sort((a, b) => (artistCounts.get(a.name) || 0) - (artistCounts.get(b.name) || 0)
      || Math.random() - 0.5);
    langCandidates.push(candidates);
  }
  if (!langCandidates.length) { log('冇未吸納、又有官方頻道、又未暫停嘅團體'); return 0; }

  const perGroup = Math.max(1, Math.floor(totalBudget / langCandidates.length));
  log(`mode=discover(all-languages) 未吸納語言 ${langCandidates.length} 個,每個 budget=${perGroup}:` +
      langCandidates.map((cs) => `${cs[0].name}(${cs[0].lang},已收錄${artistCounts.get(cs[0].name) || 0})`).join('、'));

  // ⚠️ 2026-07-24 修:「已收錄最少優先」對**永遠零產出**嘅頻道冇免疫力 ——
  // 404 handle、全講道頻道(台北611靈糧堂/Saddleback Kids 實測)、現有
  // listing 攞晒,呢啲頻道乜都收唔到,個 count 永遠最細,永遠贏個 slot,
  // 成個語言嘅 discover 就咁卡死(2026-07-23 夜晚實測:三個語言 slot
  // 全部卡晒,由 23:24 到朝早成晚 0 首)。而家一個頻道連「試」都試唔到
  // 一條(listing 失敗/冇新片/全部俾分類篩走)—— 即係 budget 一啖都未
  // 使過 —— 就即場跳去同語言下一個團體。有真.試過(唔理收唔收到)先算
  // 用咗個 slot,唔會加大對 YouTube 嘅實際請求量。
  // ⚠️ 2026-07-26 追加修:原本硬寫死「最多試 3 個」,但國語得 5 個候選、
  // 兒童得 4 個 ——實測 Eric 問「點解全日 0 增長」揪出嚟:粵/國/兒童三個
  // 語言嘅「已收錄最少」bottom-3 剛好全部係持續低產嘅頻道(611靈糧堂/
  // Asia for JESUS/台北復興堂;Saddleback/Listener/Hillsong Kids),
  // 3 個試晒都仲係 0,但 3 已經係國語/兒童成個候選名單嘅六成幾,冚唔到
  // 剩低嗰 1-2 個健康候選(611 Worship/新心音樂事工;Kids on the Move)。
  // 改做「呢個語言有幾多候選就試幾多」(冇上限跳過任何一個),確保一定
  // 唔會漏低仲有嘢俾嘅團體。粵語 15 個團體全試都係 15 次列表 call,
  // 一樣平,唔會加大 resolve 呼叫量(淨係試唔到嘅唔算 resolve)。
  let added = 0;
  for (const candidates of langCandidates) {
    for (const group of candidates) {
      const r = await discoverFromGroup(db, group, perGroup);
      added += r.added;
      if (r.tried > 0) break;
      log(`    「${group.name}」今次一條都試唔到,budget 原封不動,跳去同語言下一個團體`);
    }
  }
  return added;
}

// 自測:摸擬唔同「星期幾 + 幾點」組合,唔使等真實時鐘行到嗰個時間先驗證。
// `node scripts/growLibrary.js --test-office-hours`,唔開 DB、唔碰網絡。
function testOfficeHoursLogic() {
  const mkDate = (day, h, m) => {
    // 由今日開始搵返最近一個 getDay()===day 嘅日子,再set返個鐘數—— 用
    // 本機時區(new Date(y,m,d,h,m) 呢個 constructor 本身就係本機時區)。
    const base = new Date();
    const diff = (day - base.getDay() + 7) % 7;
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff, h, m, 0);
    return d;
  };
  const cases = [
    ['星期一 10:29(封鎖前一分鐘)', mkDate(1, 10, 29), false],
    ['星期一 10:30(啱啱開始封鎖)', mkDate(1, 10, 30), true],
    ['星期一 14:00(封鎖中)', mkDate(1, 14, 0), true],
    ['星期一 18:29(封鎖最後一分鐘)', mkDate(1, 18, 29), true],
    ['星期一 18:30(啱啱解封)', mkDate(1, 18, 30), false],
    ['星期一 09:00(未到封鎖)', mkDate(1, 9, 0), false],
    ['星期一 23:00(已經解封)', mkDate(1, 23, 0), false],
    ['星期六 14:00(六都封)', mkDate(6, 14, 0), true],
    ['星期日 14:00(日全日唔封)', mkDate(0, 14, 0), false],
    ['星期日 10:30(日全日唔封,連正常封鎖時段都唔封)', mkDate(0, 10, 30), false],
    ['星期日 00:01(日全日唔封)', mkDate(0, 0, 1), false],
    ['星期五 18:30(五啱啱解封)', mkDate(5, 18, 30), false],
  ];
  let pass = 0, fail = 0;
  for (const [name, date, expected] of cases) {
    const actual = isBlockedByOfficeHours(date);
    const ok = actual === expected;
    ok ? pass++ : fail++;
    log(`  ${ok ? '✓' : '✗ FAIL'} ${name} → blocked=${actual}(預期 ${expected})` +
        `  [${date.toString()}]`);
  }
  log(`自測完成:${pass} 過、${fail} 唔啱`);
  return fail === 0;
}

async function main() {
  if (process.argv.includes('--test-office-hours')) {
    const ok = testOfficeHoursLogic();
    process.exit(ok ? 0 : 1);
  }

  // ⚠️ 2026-07-23 加:單一 try/finally 包住成個 function body,`lockToken`
  // 預設 null。淨係喺成功 `acquireDbLock()` 之後先會有值,`releaseDbLock()`
  // 而家會校 token 先真係刪 lockfile(見 hymnDb.js),所以呢個 finally
  // 就算喺**未攞到鎖**嗰啲 return(status/時段/聽眾檢查)都經過,都係安全
  // no-op —— 唔會誤刪第二個 process 合法持有嘅鎖。而任何一個「已經攞到鎖」
  // 之後先發生嘅 exit(包括 curate/discover 拋 exception),都保證會釋放。
  let lockToken = null;
  try {
    // status 淨係讀,唔使排隊攞鎖、唔理時段/聽眾開關 —— 隨時想睇就睇得到。
    if (STATUS_ONLY) { report(await openDb()); return; }

    if (ENFORCE_TIME_WINDOW && !inWindow() && !IGNORE_WINDOW) {
      log(`而家 ${new Date().getHours()} 點,唔喺 ${WINDOW_START}:00-${WINDOW_END}:00 時段,唔做嘢。`);
      return;
    }

    if (isBlockedByOfficeHours() && !IGNORE_OFFICE_HOURS) {
      const now = new Date();
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      log(`而家星期${dayNames[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')},` +
          `喺辦公時間封鎖窗(平日 10:30-18:30)入面,唔做嘢。`);
      return;
    }

    if (THROTTLE_FOR_LISTENERS && (await detectActiveListeners())) {
      log('偵測到而家有真人聽緊歌,呢一輪跳過,唔同播放爭 yt-dlp/backend 資源。');
      return;
    }

    lockToken = await acquireDbLock('growLibrary');
    if (!lockToken) {
      log('攞唔到 DB 鎖(俾 checkDeadLinks 用緊),今次跳過,留返下個排程。');
      return;
    }

    const db = await openDb();
    report(db);
    let added;
    if (MODE === 'discover') {
      // 手動測試/明確指定 discover:用返成個 --budget,唔使夾埋 curate。
      added = await runDiscoverAll(db, BUDGET);
    } else {
      // 排程正常路徑:curate 照做(食現有 backlog),之後**自動夾埋一細撮
      // discover**(2026-07-23 起),等粵/國/兒童嘅未吸納團體一齊有進度,
      // 唔使開多一個 launchd job 或者手動切 mode。
      added = await runCurate(db);
      added += await runDiscoverAll(db, DISCOVER_BUDGET);
    }
    log('---');
    if (added > 0) report(db);
  } finally {
    releaseDbLock(lockToken);
  }
}

main().catch((e) => { console.error('growLibrary 出錯:', e); process.exit(1); });
