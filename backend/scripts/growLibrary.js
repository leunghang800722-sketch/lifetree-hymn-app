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

import fs from 'fs';
import {
  openDb, saveDb, query, sleep, isCompilation, isNonWorship, dedupeByYoutubeId,
  acquireDbLock, releaseDbLock, formatDuration,
  isChannelCoolingDown, recordChannelYield, clearChannelCooldown,
} from '../lib/hymnDb.js';
import { resolveAudioUrl } from '../lib/resolveAudio.js';
import { ACTIVE_GROUPS } from '../data/worshipGroups.js';
import { cleanDisplayTitle } from '../lib/displayTitle.js';
import { backfillGroupFromList } from '../lib/backfillCore.js';
import { reconcileGroupIncremental, loadMissingCache, saveMissingCache, MISSING_CACHE_PATH } from '../lib/reconcileCore.js';
// TAXONOMY-5D-PLAN.md §8 C3 Commit A:頻道掃描 + 收錄關卡①②③搬去
// lib/channelScan.js,同 refetchKids.js 共用同一份 pipeline,唔好
// copy-paste 兩份。呢度淨係留返 discover 專屬嘅④(INSERT hymns_all)。
import { scanChannelListing, channelLanguageSanityCheck, validateChannelCandidates } from '../lib/channelScan.js';

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

// ⚠️ 2026-07-28 Eric 拍板:兒童詩歌**依家多數係英文**,想暫停攞英文兒童、
// 主力集中粵語/國語兒童。⚠️ 呢個唔可以撈埋上面嗰個 `PAUSED_LANGUAGES` 用 ——
// 個一係「頂層語言」(粵語/國語/英文/兒童,對應 group.lang),兒童本身**已經
// 係獨立一個頂層語言桶**,同粵語/國語成人桶完全分開分 budget(見
// `runDiscoverAll` 嘅 `langCandidates`)。淨係想暫停「兒童入面嘅英文」呢個
// 更幼細嘅維度(對應 group.kidsLang,唔係 group.lang),要獨立一個 set,
// 唔可以加 '英文' 落 PAUSED_LANGUAGES(嗰個已經喺度,係管緊成人英文桶)。
// 用喺 `runDiscoverAll` 揀「兒童」呢個語言桶嘅候選團體嗰步:淨係過濾走
// kidsLang 喺呢個 set 入面嘅團體,粵語/國語兒童團體、同埋粵語/國語**成人**
// 桶嘅 budget 完全唔受影響(兩個桶本身已經獨立)。**暫停唔係刪除**:淨係
// 唔會揀佢哋做新候選,已收錄嘅英文兒童歌唔郁;想恢復淨係刪走 '英文' 就得。
const PAUSED_KIDS_LANGUAGES = new Set(['英文']);

const today = () => new Date().toISOString().slice(0, 10);
// 2026-08-04:舊版用 toISOString()(UTC),同本機 HKT 差 8 個鐘,睇 log 好易
// 誤判做「stall咗成8個鐘」。改用本機時區,寫法跟 todayLocal()。純改
// log 顯示格式,唔影響 today() 呢啲寫落 DB 嘅邏輯(唔郁佢)。
const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const log = (...a) => console.log(`[${stamp()}]`, ...a);

// 2026-07-31 Fable 5 結構性修復:每日一次自動 reconcile 嘅「今日做過未」marker,
// 存喺 cache 旁邊一個純文字檔(格式 YYYY-MM-DD,本機時區)。
const LAST_RECONCILE_MARKER = MISSING_CACHE_PATH.replace(/reconcile-missing\.json$/, 'last-reconcile-date.txt');
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    // ⚠️ 2026-07-27 22:30 P0(SUPERVISION-LOG 條目):`curated=0` 喺呢個 pool
    // 眼中一直冧曬做「未上架 backlog 候選」,冇任何「內容已判死刑」嘅終態 ——
    // 之前用嘅 delist(Kids on the Move 節目片、Redsea Music/SingforGod薪火
    // 敬拜壞 handle 全 artist)全部俾 curate mode 逐首 re-verify 翻生返(KotM
    // 4→74,Redsea/SingforGod 100% 全數翻生)。`status='rejected'` 先係真.
    // 終態 —— 同 `status='dead'`(死鏈)分開,呢個係「內容性質判死」,一樣
    // 一定要喺呢度過濾,唔畀 curate/discover 兩個 mode 再摸到。
    .filter((r) => r.status !== 'rejected')
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
// discover mode 嘅②③兩關(分類/品質 + 死鏈)搬咗去 lib/channelScan.js 嘅
// `validateChannelCandidates()`(TAXONOMY-5D-PLAN §8 C3 Commit A,同
// refetchKids.js 共用),呢度唔再需要 `passesQuality()`/`verifyPlayable()`
// 呢兩個 wrapper。

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

  // 1. 搜尋:攞多過 budget 幾倍嘅候選,因為之後仲有幾關會刷走一批(見
  // lib/channelScan.js `scanChannelListing()` 嘅淺層/深層 fallback 註解)。
  const existing = new Set(query(db, `SELECT youtube_id FROM hymns_all`).map((r) => r.youtube_id));
  const { listing, fresh } = await scanChannelListing(group.channel, budget, existing, { log });
  if (!listing.length) return { added: 0, tried: 0 };
  log(`    頻道列出 ${listing.length} 條,${fresh.length} 條未收錄過`);

  // 2. channel-level 語言 sanity check(lib/channelScan.js `channelLanguageSanityCheck()`)。
  if (!channelLanguageSanityCheck(group, listing, { log })) return { added: 0, tried: 0 };

  // ⚠️ 2026-07-27 Fable 5 方案(SUPERVISION-LOG 10:40 條目)Q1:順手用呢次
  // 已經攞緊嘅 listing 幫「已收錄但 duration 仲空白」嘅舊歌 backfill duration
  // —— 唔加額外 request,flat-playlist 本身就帶埋呢個欄位,之前淨係揀
  // fresh 果批嚟用,`existing` 嗰批嘅 duration 一直冚埋喺度冇用過。呢個係
  // hymns_all 專屬嘅順手優化,唔屬於「頻道掃描 + 收錄關卡」嘅共用部分,
  // 留喺呢度(refetchKids.js 冇對應需要 —— 兒童歌全部即將 delete+重攞)。
  if (!DRY) {
    let backfilled = 0;
    for (const v of listing) {
      if (!v.id || !existing.has(v.id) || v.duration == null) continue;
      const fmt = formatDuration(v.duration);
      if (!fmt) continue;
      db.run(`UPDATE hymns_all SET duration=? WHERE youtube_id=? AND (duration IS NULL OR duration='')`, [fmt, v.id]);
      backfilled++;
    }
    if (backfilled > 0) { saveDb(db); log(`    ⏪ 順手 backfill duration ${backfilled} 首(免額外 request)`); }
  }

  // 3. 分類/品質篩選 + 死鏈驗證(lib/channelScan.js `validateChannelCandidates()`)。
  const { candidates, tried } = await validateChannelCandidates(group, fresh, budget, { delayMs: DELAY_MS, log });

  // 4. 四關全過,先至寫入 —— 呢一步先真正成為歌庫一部份。
  // display_title 喺插入嗰刻就計埋(唔使再靠人手隔幾耐先補一次 batch),
  // 新歌一入庫 UI 即刻見到乾淨嘅版本。
  let added = 0;
  for (const v of candidates) {
    if (!DRY) {
      // TAXONOMY-5D-PLAN.md §3.5:org/kids 即時填,兒童團體(有 kidsLang)寫
      // 真語言落 lang 唔准再寫「兒童」(category 保留 group.lang 原封不動,
      // 歷史遺留欄唔郁,見 §2.3)。611 Kids Worship 嘅 kidsLang 係「粵語/國語」
      // 雙值——channel:null 永遠去唔到呢度,暫時唔使特殊處理(§8 C1 註明)。
      db.run(
        `INSERT INTO hymns_all (title, display_title, artist, category, youtube_id, lang, curated, status, last_checked, fail_streak, duration, org, kids)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', ?, 0, ?, ?, ?)`,
        [v.title, cleanDisplayTitle(v.title, group.name), group.name, group.lang, v.id, group.kidsLang || group.lang, today(), formatDuration(v.duration), group.org ?? group.name, group.priority === 4 ? 1 : 0]
      );
      saveDb(db);
    }
    added++;
    log(`      ✓ 收錄 (累計 +${added})`);
  }

  log(`    今次(discover,${group.name}):頻道有 ${fresh.length} 條新片,試咗 ${tried} 條,收錄 ${added} 首`);
  return { added, tried };
}

// ⚠️ 2026-07-23 Eric 拍板:粵語/國語/兒童**一齊**開始收,唔好排隊逐個攻。
// 之前一個 run 淨係做「優先度最高」嗰一個未吸納團體(通常長期係粵語,
// 因為粵語有 17 個未吸納團體排喺前面),兒童 13 個團體會排到好後,一直冇
// 機會郁。而家逐個未暫停語言都揀返「該語言優先度最高嗰一個未吸納團體」,
// 平均分 budget,一個 run 入面粵/國/兒童一齊有進度。
//
// ⚠️ 2026-07-31 Fable 5 結構性修復(SUPERVISION-LOG「選台邏輯+自動循環」
// 條目)—— 承接 Eric 質疑「成晚冇攞到歌」查證出嚟嘅根因:「已收錄最少優先」
// 淨係睇 count 做選台訊號,喺 backfill 時代已經失效:count 高 ≠ 冇嘢收
// (CantonHymn backfill 完 293 首,但 `cache/reconcile-missing.json` 仲有
// 幾百首欠收);count 低 ≠ 有嘢收(flow music/Asia for JESUS/基恩敬拜祈禱仔
// 啲剩餘候選結構性過唔到片長/分類關,永遠 0 收穫但因為 count 最細永遠贏中
// 選)。**修訊號,唔係修排序**——兩級制:
//   Tier 1:呢個頻道喺 reconcile-missing.json 有非空欠收清單 → 直接用
//     `backfillGroupFromList()`(同 `backfillFromList.js` 呢個人手工具**同一份**
//     code,見 `lib/backfillCore.js`)食清單,唔理 count 幾多。清單多者先
//     (貼近 Eric「攞齊」目標)。
//   Tier 2:冇 reconcile 數據(未 reconcile 過/新頻道)嘅頻道 → fallback 用返
//     舊「已收錄最少優先」邏輯,搵 listing window 之內嘅新片(`discoverFromGroup`)。
async function runDiscoverAll(db, totalBudget) {
  const langs = [...new Set(ACTIVE_GROUPS.map((g) => g.lang))].filter((l) => !PAUSED_LANGUAGES.has(l));
  const missingCache = loadMissingCache();

  const artistCounts = new Map();
  for (const r of query(db, `SELECT artist, COUNT(*) c FROM hymns_all WHERE curated=1 GROUP BY artist`)) {
    artistCounts.set(r.artist, r.c);
  }

  const langCandidates = [];
  for (const lang of langs) {
    let candidates = ACTIVE_GROUPS.filter((g) => g.lang === lang && !g.inPool && g.channel);
    if (lang === '兒童') {
      candidates = candidates.filter((g) => !PAUSED_KIDS_LANGUAGES.has(g.kidsLang));
    }
    // 零收穫冷卻(見 hymnDb.js `isChannelCoolingDown` 註解)—— 連續 8 個 tick
    // 都試唔到、收唔到嘅頻道,24 小時內唔再入選,唔畀佢哋夜夜燒晒個 slot。
    candidates = candidates.filter((g) => !isChannelCoolingDown(g.name));
    // ⚠️ 2026-07-31 18:05 緊急(Fable 5):`tier1Exclude:true`(worshipGroups.js)
    // ——內容太雜(研習會/見證/工作坊,題目式標題冇固定 pattern)嘅頻道,四關
    // pipeline 都會偶爾漏網。Tier1 選台一解凍呢類頻道(Asia for JESUS)就即刻
    // 用「清單多者先」揀中佢(全庫最大戶,612 條),一晚滲咗 4 條 junk。加呢個
    // flag 令佢完全唔入 Tier1**同**Tier2 嘅自動候選(唔止 Tier1——Tier2 嘅
    // `discoverFromGroup` 用緊同一套四關,對呢類雜頻道一樣冇免疫力),留返
    // 俾人手/未來語義層逐條覆核先收。
    candidates = candidates.filter((g) => !g.tier1Exclude);
    if (!candidates.length) continue;

    const tier1 = candidates.filter((g) => missingCache[g.name]?.missing?.length > 0);
    const tier2 = candidates.filter((g) => !(missingCache[g.name]?.missing?.length > 0));
    // Tier 1 內部:欠收清單多者先。Tier 2 內部:沿用返舊邏輯(已收錄最少優先
    // + 隨機 tiebreak——打和唔可以用固定次序,見底下歷史教訓)。
    tier1.sort((a, b) => missingCache[b.name].missing.length - missingCache[a.name].missing.length);
    tier2.sort((a, b) => (artistCounts.get(a.name) || 0) - (artistCounts.get(b.name) || 0)
      || Math.random() - 0.5);

    langCandidates.push({ lang, tier1, tier2 });
  }
  if (!langCandidates.length) { log('冇未吸納、又有官方頻道、又未暫停、又未冷卻嘅團體'); return 0; }

  const perGroup = Math.max(1, Math.floor(totalBudget / langCandidates.length));
  log(`mode=discover(all-languages) 未吸納語言 ${langCandidates.length} 個,每個 budget=${perGroup}:` +
      langCandidates.map(({ lang, tier1, tier2 }) => `${lang}(Tier1×${tier1.length}/Tier2×${tier2.length})`).join('、'));

  // ⚠️ 2026-07-24 修(Tier 2 沿用):「已收錄最少優先」對永遠零產出嘅頻道
  // 冇免疫力,一個頻道連「試」都試唔到一條就即場跳去同語言下一個候選,
  // 唔會加大對 YouTube 嘅實際請求量。2026-07-26 追加修:唔設「最多試 N 個」
  // 上限,呢個語言有幾多候選就試幾多,確保唔會漏低仲有嘢俾嘅團體。
  let added = 0;
  for (const { tier1, tier2 } of langCandidates) {
    let doneThisTick = false;

    for (const group of tier1) {
      const entry = missingCache[group.name];
      log(`  Tier1 backfill:${group.name}(${group.lang},欠收${entry.missing.length}條),額度 ${perGroup}`);
      const r = await backfillGroupFromList(db, group, entry.missing, perGroup, { delayMs: DELAY_MS, dry: DRY, log });
      added += r.added;
      recordChannelYield(group.name, r.added, r.tried);
      if (r.tried > 0) { doneThisTick = true; break; }
      log(`    「${group.name}」Tier1 今次一條都試唔到,跳去下一個候選`);
    }
    if (doneThisTick) continue;

    for (const group of tier2) {
      const r = await discoverFromGroup(db, group, perGroup);
      added += r.added;
      recordChannelYield(group.name, r.added, r.tried);
      if (r.tried > 0) break;
      log(`    「${group.name}」Tier2 今次一條都試唔到,budget 原封不動,跳去同語言下一個團體`);
    }
  }
  return added;
}

// ⚠️ 2026-07-31 Fable 5 結構性修復:每日一次自動 reconcile,「冇人手跟就
// 停產」嘅缺口正式閂埋——欠收清單自動生成+自動消化(Tier 1),唔使等人手
// 記得手動跑 reconcileChannels.js。Incremental:淨係攞官方數(平)同上次
// 已知嘅比,冇變就 skip,增量成本近零。淨係 00:xx 嗰個鐘做一次(避開
// checkDeadLinks 04:00),同一日內第二次 tick 見 marker 已經係今日就即刻
// return,唔會夜夜/次次都做。
async function maybeRunDailyReconcile(db) {
  const now = new Date();
  if (now.getHours() !== 0) return;
  let lastDate = '';
  try { lastDate = fs.readFileSync(LAST_RECONCILE_MARKER, 'utf8').trim(); } catch (_) {}
  if (lastDate === todayLocal()) return;

  log('每日自動 reconcile 開始(incremental,About 數冇變嘅頻道 skip)…');
  const targets = ACTIVE_GROUPS.filter((g) => g.priority <= 4 && g.channel && g.lang !== '英文'
    && !(g.lang === '兒童' && g.kidsLang === '英文'));
  const missingCache = loadMissingCache();
  let changed = 0, skipped = 0, errored = 0;
  for (const g of targets) {
    try {
      const cachedCount = missingCache[g.name]?.officialCount ?? null;
      const r = await reconcileGroupIncremental(db, g, cachedCount);
      if (!r) { skipped++; continue; }
      changed++;
      missingCache[g.name] = {
        updatedAt: new Date().toISOString(), channel: g.channel, lang: g.lang,
        officialCount: r.official, missing: r.missing.map((v) => ({ id: v.id, title: v.title, duration: v.duration })),
      };
      // 官方數變咗、有新欠收 = 真係有新片,即刻解凍(唔使等 24 小時 cooldown 過期)。
      if (r.missing.length > 0) clearChannelCooldown(g.name);
      log(`  reconcile:${g.name} 官方${r.official} 枚舉${r.enumerated} 欠收${r.missing.length}`);
    } catch (e) {
      errored++;
      log(`  ⚠ reconcile ${g.name} 出錯:${e?.message || e}`);
    }
    await sleep(jitter(1500));
  }
  saveMissingCache(missingCache);
  fs.writeFileSync(LAST_RECONCILE_MARKER, todayLocal(), 'utf8');
  log(`每日自動 reconcile 完成:${changed} 個頻道有變(已更新清單)、${skipped} 個冇變(skip)、${errored} 個出錯`);
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

    // ⚠️ 2026-07-31 Fable 5 結構性修復:排程正常路徑先做(手動 --mode discover
    // 測試唔做,唔想每次手動驗證都拖埋成個 reconcile)。淨係一日一次(00:xx),
    // incremental,冇變嘅頻道即刻 skip,唔會拖慢正常 tick。
    if (MODE !== 'discover') await maybeRunDailyReconcile(db);

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
