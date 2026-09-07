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
// 同一首歌一次播放,AVPlayer/ExoPlayer 會開十幾廿條 range 連線——如果逐個
// HTTP request 都計一次會嚴重高估(同 opsMetrics.js `recordStreamRequest`
// 個 `TRACK_GAP_MS` 一樣嘅教訓)。呢度用相同嘅「開一首歌」去重手法:同一
// DB hymn id(即 /api/stream/:id 嗰個 id,唔係 youtube_id)隔咗呢個窗口先再嚟嘅第一個 request 先算一次「真播放」。
// env 可覆蓋(純測試用途——harness 可以用細窗口喺幾毫秒內製造多個「唔同次
// 播放」嚟驗排序,唔使真係等 60 秒;production 冇設呢個 env 就用返 60 秒)。
const HIT_DEDUP_MS = Number(process.env.HOT_IDS_DEDUP_MS) > 0 ? Number(process.env.HOT_IDS_DEDUP_MS) : 60 * 1000;

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
      fs.writeFileSync(HOT_IDS_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) {
      console.warn('hot-ids flush failed:', e?.message);
    }
  }, 5000);
  if (flushTimer.unref) flushTimer.unref();
}

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(HOT_IDS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    let n = 0;
    for (const [id, arr] of Object.entries(obj)) {
      if (!Array.isArray(arr)) continue;
      const pruned = pruneOld(arr, now);
      if (pruned.length) { hits.set(id, pruned); n++; }
    }
    if (n) console.log(`🗃️  hot-ids:由碟載返 ${n} 首歌嘅 24h 串流記錄`);
  } catch (_) { /* 第一次冇檔,正常 */ }
}
loadFromDisk();

// 每個真播放 request call 一次(routes/stream.js GET handler)。`ua` 用嚟
// 過濾合成流量;`hymnId`(DB id)假嘅/冇嘅一律 no-op。
export function recordStreamHit(hymnId, ua) {
  if (!hymnId) return;
  if (isSyntheticUa(ua)) return;
  const now = Date.now();
  const last = recentHitAt.get(hymnId);
  if (last && now - last < HIT_DEDUP_MS) return; // 同一次播放嘅另一條 range 連線
  recentHitAt.set(hymnId, now);
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
