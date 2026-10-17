// backend/lib/hotIds.js — FIRST-TRACK-STEP01-EXEC-20260907 §2 N3
//
// 滾動 24 小時串流計數,俾 `/api/stream/warm` 用嚟補位「今日為你預備 6 首」
// 名單以外嘅真實熱門 id(1E 實測:92.6% 起播 surface≠今日精選,warm 名單
// 同「隨心聽」/「chip」/「最近加入」入口完全脫靶)。
//
// ⚠️ 紅線:純觀測 + 補位 warm 名單,唔改任何 resolve 策略/揀歌邏輯。呢個
// 檔案完全唔掂 `resolveAudio.js`/`stream.js` proxy 主邏輯一個字,淨係俾
// `/warm` route 攞一份「最近邊啲歌真係有人聽」嘅名單。
//
// 單一寫手紀律(同 2026-08-25 project-catalog-gap-ingest 事故教訓一致):
// 呢個檔淨係俾 backend server process 寫,`HOT_IDS_FILE` env 俾 harness
// 指去隔離 scratch 路徑,production 冇設呢個 env 就寫真身 `backend/cache/
// hot-ids.json`(呢個目錄成個 gitignore 咗,唔會入 repo)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOT_IDS_FILE = path.join(__dirname, '..', 'cache', 'hot-ids.json');
const HOT_IDS_FILE = process.env.HOT_IDS_FILE || DEFAULT_HOT_IDS_FILE;
const HOT_IDS_DIR = path.dirname(HOT_IDS_FILE);

const WINDOW_MS = 24 * 60 * 60 * 1000; // 滾動 24 小時
const MAX_TRACKED_IDS = 5000; // 上限,防長期運行漏記憶體(執行單原文數字)
// FIRST-TRACK-STEP01-FIX-20260907 #5(Opus P2-5 修正)——舊版「同一 DB hymn
// id 隔咗呢個窗口先再嚟嘅第一個 request 先算一次」有個隱藏假設:`recentHitAt`
// 淨係喺真係計咗數嗰陣先更新(唔計嗰陣唔更新)。呢個寫法同 opsMetrics.js
// `recordStreamRequest` 個 `TRACK_GAP_MS`(**每個** request 都更新
// lastSeen,所以持續播一首歌 = 1 次)睇落一樣,實際完全唔同:呢度變咗
// 「每隔一個窗口就 +1」,持續播放 N 分鐘就計 N/窗口 次(實測:40 分鐘純
// 音樂 ≈ 40 分,4 分鐘詩歌得 4 分,長檔洗版熱門榜,而長檔正正係最唔應該
// pin 嘅——pin 佢哋只 warm 4MB head 都仲要嘥 4MB×N)。
//
// 真正修法唔淨係「改返 opsMetrics 嗰句」(照抄嗰個 window 都撞唔正:AVPlayer
// 每個 HLS segment 都打一次 `/api/stream/:id`,segment 唔會由 byte 0 開始,
// 逐個 request 計都一樣會高估)——而係改埋「計乜嘢」:淨係「呢個 request
// 係起播」(冇 Range,或者 Range 由 byte 0 開始)先算一次「開一首歌」,中段
// 續播 range 一律唔計(見 caller `routes/stream.js` 嘅 `isStart` 判斷)。
// 呢個窗口而家嘅語意變咗「同一 id 同一 client 幾耐內嘅另一個『起播』當係
// 同一次播放(例如 native reload/seek 返 byte 0)」,唔再係「持續播放攞幾多
// 分」,執行單原文數字由 60 秒放寬做 5 分鐘。env 可覆蓋(純測試用途——
// harness 可以用細窗口喺幾毫秒內製造多個「唔同次播放」嚟驗排序)。
const HIT_DEDUP_MS = Number(process.env.HOT_IDS_DEDUP_MS) > 0 ? Number(process.env.HOT_IDS_DEDUP_MS) : 5 * 60 * 1000;

// FIRST-TRACK-STEP01-FIX-20260907 §細項 —— 持久化格式版本號。計法由「串流
// 分鐘」改做「開歌次數」之後,舊碟(v1,或者根本冇 `v` 呢個欄嘅更舊格式)
// 記錄嘅係完全唔同語意嘅數字,冇得直接沿用(唔係「小」咗,係「錯」咗)。
// version 唔夾就當冇檔,清零重計——寧願啱 0 分都好過將舊嘅分鐘數當做新
// 嘅「次數」用。
const HOT_IDS_FORMAT_VERSION = 2;

// UA 判斷(執行單原文:「非 curl、非 warm burst」)——用排除法,唔白名單:
// 已知嘅合成流量(健康檢查/curl/監控探針)先擋,寧濫勿缺(呢度係「揀熱門
// 候選」用途,唔係安全閘,漏咗少少合成流量都唔會累到播放路徑,但白名單
// 漏咗一種真實 client UA 就會誤刪真實熱門訊號)。
const SYNTHETIC_UA_RE = /curl|wget|python-requests|node-fetch|okhttp.*(health|monitor)|uptime|statuscake|pingdom/i;
export function isSyntheticUa(ua) {
  if (!ua || ua === '-') return false; // 冇 UA 都當真實
  return SYNTHETIC_UA_RE.test(ua);
}

const hits = new Map(); // hymnId(DB id,字串) -> [hitTsMs, ...](升序,淨係窗口內先保留)
const recentHitAt = new Map(); // hymnId -> 上次計落 hits 嘅 ts,做「開一首歌」去重

function pruneOld(arr, now) {
  let i = 0;
  while (i < arr.length && now - arr[i] > WINDOW_MS) i++;
  return i > 0 ? arr.slice(i) : arr;
}

function evictOldestTrackedId() {
  let oldestId = null;
  let oldestTs = Infinity;
  for (const [id, arr] of hits) {
    const last = arr.length ? arr[arr.length - 1] : 0;
    if (last < oldestTs) { oldestTs = last; oldestId = id; }
  }
  if (oldestId != null) hits.delete(oldestId);
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(HOT_IDS_DIR, { recursive: true });
      const now = Date.now();
      const obj = {};
      for (const [id, arr] of hits) {
        const pruned = pruneOld(arr, now);
        if (pruned.length) obj[id] = pruned;
      }
      // §細項 —— 版本號包住 payload,俾 loadFromDisk() 分得出「舊語意嘅
      // 分鐘數」同「新語意嘅開歌次數」,唔會誤讀。
      fs.writeFileSync(HOT_IDS_FILE, JSON.stringify({ v: HOT_IDS_FORMAT_VERSION, hits: obj }), 'utf8');
    } catch (e) {
      console.warn('hot-ids flush failed:', e?.message);
    }
  }, 5000);
  if (flushTimer.unref) flushTimer.unref();
}

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(HOT_IDS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // 舊格式(v1 = 冇 `v` 呢個欄,payload 直接就係 `{id: [...]}`)語意係
    // 「串流分鐘」,同而家「開歌次數」唔相容——版本唔夾一律當冇檔,清零
    // 重計(§細項:寧願啱 0 分都好過將舊分鐘數當做新次數)。
    if (!parsed || parsed.v !== HOT_IDS_FORMAT_VERSION || typeof parsed.hits !== 'object' || parsed.hits === null) {
      console.log('🗃️  hot-ids:碟上格式版本唔夾(舊「串流分鐘」語意)或者冇檔,清零重計');
      return;
    }
    const now = Date.now();
    let n = 0;
    for (const [id, arr] of Object.entries(parsed.hits)) {
      if (!Array.isArray(arr)) continue;
      const pruned = pruneOld(arr, now);
      if (pruned.length) { hits.set(String(id), pruned); n++; }
    }
    if (n) console.log(`🗃️  hot-ids:由碟載返 ${n} 首歌嘅 24h 串流記錄(v${HOT_IDS_FORMAT_VERSION})`);
  } catch (_) { /* 第一次冇檔,正常 */ }
}
loadFromDisk();

// 每個真播放 request call 一次(routes/stream.js GET handler)。`ua` 用嚟
// 過濾合成流量;`hymnId`(DB id)假嘅/冇嘅一律 no-op。
//
// FIRST-TRACK-STEP01-FIX-20260907 #4/#5 —— 兩個修正:
//  (a) key 一律 `String(hymnId)`——caller 傳嘅係 `Number(req.params.hymnId)`,
//      但由碟載返嘅 entry key 一定係 string(JSON object key 冇第二種可能)。
//      舊版冧收兩種型別做 key,restart 之後同一首歌會分裂成 number/string
//      兩條獨立記錄(Opus P2-4 實測)。
//  (b) `opts.isStart` 決定計唔計數(caller 應該傳「呢個 request 係咪起播」;
//      唔傳就當 `true`,保留俾直接 unit test 呢個 module 嘅 call site 一個
//      冇 breaking change 嘅預設值)。`opts.clientKey` 用嚟做「同一 id 同
//      一 client」嘅去重(冇傳就跌返用 `ua` 做 key,同舊版行為一致)。
export function recordStreamHit(hymnId, ua, opts = {}) {
  if (!hymnId) return;
  if (isSyntheticUa(ua)) return;
  const { isStart = true, clientKey = null } = opts || {};
  if (!isStart) return; // 中段續播 range——唔算「開一首歌」(P2-5)
  hymnId = String(hymnId);
  const dedupKey = `${hymnId}::${clientKey || ua || '-'}`;
  const now = Date.now();
  const last = recentHitAt.get(dedupKey);
  if (last && now - last < HIT_DEDUP_MS) return; // 同一個 client 短時間內另一個「起播」(reload/seek返0)
  recentHitAt.set(dedupKey, now);
  // recentHitAt 本身都要有上限,防止長期運行漏記憶體——順手清走舊過
  // 5× dedup 窗口嘅 entry(呢個 map 純粹做短期去重,唔需要長期保留)。
  if (recentHitAt.size > MAX_TRACKED_IDS * 2) {
    for (const [k, t] of recentHitAt) {
      if (now - t > HIT_DEDUP_MS * 5) recentHitAt.delete(k);
      if (recentHitAt.size <= MAX_TRACKED_IDS) break;
    }
  }
  let arr = hits.get(hymnId);
  if (!arr) {
    if (hits.size >= MAX_TRACKED_IDS) evictOldestTrackedId();
    arr = [];
    hits.set(hymnId, arr);
  }
  arr.push(now);
  scheduleFlush();
}

// 出最近 24h 最多「真播放」次數嘅 n 個 hymnId(DB id,數字),由多到少排。純函數式讀取
// (順手掃走窗口外嘅舊 entry,唔改「計數」本身嘅語意)。
export function getHotIds(n) {
  const now = Date.now();
  const scored = [];
  for (const [id, arr] of hits) {
    const pruned = pruneOld(arr, now);
    if (pruned.length !== arr.length) hits.set(id, pruned);
    if (pruned.length > 0) scored.push([id, pruned.length]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, n).map(([id]) => id);
}

// 俾 opsMetrics sampler / debug 用嘅純觀測 gauge。
export function getHotIdsTrackedCount() {
  return hits.size;
}
