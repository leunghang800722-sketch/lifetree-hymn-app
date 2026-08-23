// backend/lib/opsMetrics.js — 純觀測計數器(THIRD-PASS-REVIEW-20260822.md §5 Batch D-2 / D-4)
//
// ⚠️ 呢個模組**唔准**改任何現有行為。佢淨係數數 + 定時寫一份 JSON 落
// backend/logs/metrics/(gitignored),等之後有乾淨數據判斷兩件事:
//
//   D-2(P2-5):warm cache 命中率 —— `CACHE_SIZE_CEILING=1800` 而家細過庫存
//       6,053 首,但「未即時咬到」。落刀改個上限之前要知:真實播放請求入面,
//       幾多次係食住暖好嘅 URL(mode=warm),幾多次要現場 resolve(mode=cold)。
//       ⚠️ 逐個 HTTP request 數會嚴重高估 —— ExoPlayer/AVFoundation 一首歌會開
//       十幾廿條 range 連線,第一條之後全部必然 warm。所以另外分開數
//       **「開一首歌」(track start)**:同一條 youtube_id 隔咗 TRACK_GAP_MS
//       先再嚟嘅第一個 request 先算一次 track start。判斷 warm 策略要睇呢個數。
//       另外數埋 keep-warm 追落後 timer 每個 tick 因為咩理由收工(ceiling /
//       每日上限 / 有人聽緊 / 真係暖咗一首),`ceiling` 一路升就代表個上限
//       真係喺度攔住,唔使靠估。
//
//   D-4:yt-dlp resolve 三招(default / tv / default-any)邊招真係救到嘢。
//       舊統計溝埋咗「舊 binary 壞年代」(2026-08-22 yt-dlp 統一之前),唔準。
//       呢度由統一之後重新收:每招試咗幾多次、成功幾多、用咗幾耐,同埋最緊要
//       嗰個 `rescued`(第一招 default 死咗、靠後面兩招執返身彩)嘅次數。
//
// 單一寫手紀律:resolveAudio.js 俾好多 script(growLibrary / checkDeadLinks /
// refetchKids …)import,如果每個 process 都寫同一個檔就會互相蓋。所以 **淨係
// backend server process** 會 call `enablePersistence()`;其他 process 照數落
// memory(零成本),行完就散,唔會掂個檔。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_DIR = path.join(__dirname, '..', 'logs', 'metrics');
const METRICS_FILE = path.join(METRICS_DIR, 'ops-metrics.json');
const METRICS_TMP = METRICS_FILE + '.tmp';
const METRICS_BAK = METRICS_FILE + '.bak';

const TRACK_GAP_MS = 60 * 1000;   // 同一首歌隔幾耐先當「另一次開歌」
const MAX_LASTSEEN = 4000;        // lastSeen map 上限,防長期運行漏記憶
// ⚠️ 2026-08-23 實測改細(15s→4s):`launchctl bootout` 係 SIGTERM 即殺,冇得
// graceful flush(server.js 冇 SIGTERM handler,而**唔可以加** —— 一加就覆蓋咗
// node 預設嘅「收到 SIGTERM 就死」,bootout 會殺唔死佢,要等 SIGKILL timeout,
// 直接拖冧 backend-restart.sh)。所以只可以縮短「未寫落碟」嘅窗口:最壞情況
// 蝕 4 秒計數,唔會蝕成份數據。
const FLUSH_DEBOUNCE_MS = 4000;
const SUMMARY_EVERY_MS = 30 * 60 * 1000;
const MAX_HOURLY = 24 * 4;        // 保留 4 日逐個鐘嘅 bucket

function blankBucket() {
  return {
    stream: {
      req: 0, warm: 0, cold: 0,               // 逐個 HTTP request(含每條 range)
      startReq: 0, startWarm: 0, startCold: 0, // 逐次「開一首歌」——睇呢個
    },
    keepWarm: { tick: 0, ceiling: 0, dailyCap: 0, streaming: 0, offHours: 0, warmed: 0, failed: 0 },
    resolve: {
      total: 0, ok: 0, fail: 0, rescued: 0,
      okMsSum: 0, okMsMax: 0,
      winner: {},    // strategy name -> 幾多次係佢贏
      attempts: {},  // strategy name -> { tries, ok, fail, msSum, msMax }
    },
    cacheSize: { last: null, min: null, max: null },
  };
}

function freshState() {
  return { since: new Date().toISOString(), total: blankBucket(), hourly: {} };
}

let state = freshState();
let persist = false;
let flushTimer = null;
let sampler = null;
const lastSeen = new Map(); // youtubeId -> ts(最後一次 stream request)

function hourKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

// 每次記數都寫返 total 同「今個鐘」個 bucket,咁樣就算得出「最近 24 小時」嘅率,
// 唔使等成個窗口完先睇到嘢。
function buckets() {
  const k = hourKey();
  if (!state.hourly[k]) {
    state.hourly[k] = blankBucket();
    const keys = Object.keys(state.hourly).sort();
    while (keys.length > MAX_HOURLY) delete state.hourly[keys.shift()];
  }
  return [state.total, state.hourly[k]];
}

function scheduleFlush() {
  if (!persist || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
      // ⚠️ 2026-08-23 實測揪出嘅真風險:原本直接 writeFileSync 落正式檔 —— 唔係
      // atomic。restart 用 `launchctl bootout`(SIGTERM 即殺),如果啱啱撞正寫到
      // 一半,個檔就變半截 JSON,下次開機 parse 唔到 → **靜靜哋由零開始數**,
      // 收咗一日嘅數就咁冇咗。實測模擬過:半截檔 restart 之後 resolve.total
      // 由 60 變返 0。
      // 修法:①寫去 .tmp 再 rename(同一個 filesystem,rename 係 atomic —— 讀嗰邊
      // 唔係見到舊檔就係見到新檔,冇「半截」呢個狀態)②rename 之前保住上一份
      // 做 .bak,連 rename 都出事都仲有得救(下面 load 會 fallback)。
      fs.writeFileSync(METRICS_TMP, JSON.stringify(state), 'utf8');
      // ⚠️ 第二輪實測補漏(2026-08-23):
      // ① .tmp 自己都可能寫到一半(碟滿 / process 俾殺),rename 之後主檔一樣係
      //    爛檔。所以 rename 之前**一定要 parse 返 .tmp 確認佢完整**,唔完整就
      //    咩都唔做 —— 寧願主檔停留喺舊版本(蝕幾秒),都好過換咗個爛檔入去。
      // ② 備份唔可以無條件 copy 主檔 —— 實測撞到:主檔壞咗、程式由 .bak 救返之後,
      //    第一次 flush 就用嗰個爛主檔蓋走咗好嘅 .bak(親眼見到 .bak 變 400 bytes)。
      //    所以只有主檔自己 parse 得到先准備份。
      JSON.parse(fs.readFileSync(METRICS_TMP, 'utf8')); // 唔完整就會喺呢度拋,唔會 rename
      try {
        if (fs.existsSync(METRICS_FILE)) {
          JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
          fs.copyFileSync(METRICS_FILE, METRICS_BAK);
        }
      } catch (_) { /* 主檔壞 = 唔好用佢蓋 .bak,留返上一份好嘅 */ }
      fs.renameSync(METRICS_TMP, METRICS_FILE);
    } catch (e) {
      console.warn('ops-metrics flush failed:', e?.message);
    }
  }, FLUSH_DEBOUNCE_MS);
  if (flushTimer.unref) flushTimer.unref();
}

// ── D-2:每個 /api/stream request ────────────────────────────────
// warm = 行呢個 request 之前 resolve cache 已經有條未過期 URL(routes/stream.js
// 本來就計咗呢個數落 log 行,呢度淨係順手數多份可以攞嚟做統計嘅)。
export function recordStreamRequest(youtubeId, warm) {
  try {
    const now = Date.now();
    const prev = youtubeId ? lastSeen.get(youtubeId) : null;
    const isStart = !prev || (now - prev) > TRACK_GAP_MS;
    if (youtubeId) {
      lastSeen.set(youtubeId, now);
      if (lastSeen.size > MAX_LASTSEEN) {
        for (const [k, t] of lastSeen) {
          if (now - t > TRACK_GAP_MS * 5) lastSeen.delete(k);
          if (lastSeen.size <= MAX_LASTSEEN) break;
        }
      }
    }
    for (const b of buckets()) {
      b.stream.req++;
      if (warm) b.stream.warm++; else b.stream.cold++;
      if (isStart) {
        b.stream.startReq++;
        if (warm) b.stream.startWarm++; else b.stream.startCold++;
      }
    }
    scheduleFlush();
  } catch (_) { /* 觀測代碼永遠唔可以拖冧播放路徑 */ }
}

// ── D-2:keep-warm 追落後 timer 每個 tick 嘅結局 ──────────────────
// reason ∈ ceiling | dailyCap | streaming | offHours | warmed | failed
export function recordKeepWarmTick(reason) {
  try {
    for (const b of buckets()) {
      b.keepWarm.tick++;
      if (b.keepWarm[reason] != null) b.keepWarm[reason]++;
    }
    scheduleFlush();
  } catch (_) {}
}

// ── D-4:每一次單招 yt-dlp 嘗試 ───────────────────────────────────
export function recordResolveAttempt(strategy, ok, ms) {
  try {
    for (const b of buckets()) {
      const a = (b.resolve.attempts[strategy] ||= { tries: 0, ok: 0, fail: 0, msSum: 0, msMax: 0 });
      a.tries++;
      if (ok) a.ok++; else a.fail++;
      a.msSum += ms;
      if (ms > a.msMax) a.msMax = ms;
    }
    scheduleFlush();
  } catch (_) {}
}

// ── D-4:一次完整 resolve 嘅結局(邊招贏 / 全死)──────────────────
// rescued = 唔係第一招(default)贏 = 後備招真係救到呢一次。
export function recordResolveOutcome(strategy, ms, firstStrategy) {
  try {
    for (const b of buckets()) {
      b.resolve.total++;
      if (strategy) {
        b.resolve.ok++;
        b.resolve.winner[strategy] = (b.resolve.winner[strategy] || 0) + 1;
        b.resolve.okMsSum += ms;
        if (ms > b.resolve.okMsMax) b.resolve.okMsMax = ms;
        if (firstStrategy && strategy !== firstStrategy) b.resolve.rescued++;
      } else {
        b.resolve.fail++;
      }
    }
    scheduleFlush();
  } catch (_) {}
}

export function getOpsMetrics() {
  const out = JSON.parse(JSON.stringify(state));
  const rate = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const derive = (b) => ({
    streamWarmRatePct: rate(b.stream.warm, b.stream.req),
    trackStartWarmRatePct: rate(b.stream.startWarm, b.stream.startReq),
    resolveRescuedRatePct: rate(b.resolve.rescued, b.resolve.ok),
    resolveOkAvgMs: b.resolve.ok > 0 ? Math.round(b.resolve.okMsSum / b.resolve.ok) : null,
  });
  out.derived = derive(state.total);
  out.derivedHourly = Object.fromEntries(
    Object.entries(state.hourly).map(([k, b]) => [k, derive(b)])
  );
  out.persisting = persist;
  return out;
}

function summaryLine() {
  const b = state.total;
  const d = getOpsMetrics().derived;
  console.log(
    `[opsmetrics] since=${state.since} stream_req=${b.stream.req} warm_rate=${d.streamWarmRatePct}% ` +
    `track_starts=${b.stream.startReq} start_warm_rate=${d.trackStartWarmRatePct}% ` +
    `cache_size=${b.cacheSize.last} kw_tick=${b.keepWarm.tick} kw_ceiling=${b.keepWarm.ceiling} ` +
    `kw_warmed=${b.keepWarm.warmed} kw_streaming=${b.keepWarm.streaming} ` +
    `resolve_ok=${b.resolve.ok} resolve_fail=${b.resolve.fail} rescued=${b.resolve.rescued} ` +
    `winner=${JSON.stringify(b.resolve.winner)} avg_ok_ms=${d.resolveOkAvgMs}`
  );
}

// 淨係 backend server process 會 call —— 見上面「單一寫手紀律」。
// opts.sampler:定期抽 backend 現場數字(而家淨係 cache.size),用 callback 避免
// 呢個模組反過來 import resolveAudio.js(會整出循環 import)。
export function enablePersistence(opts = {}) {
  persist = true;
  sampler = opts.sampler || null;
  // 載返舊數:主檔 → .bak → 先至當新開始。⚠️ 唔可以好似以前咁 `catch (_)` 靜吞:
  // 壞檔 = 已經蝕咗數據,一定要大聲嘈,否則睇 endpoint 嗰陣淨係見到個細數,
  // 完全唔知係「真係咁少」定係「shape 壞咗重新數過」。
  let loaded = false;
  for (const [f, label] of [[METRICS_FILE, '主檔'], [METRICS_BAK, '.bak 後備']]) {
    try {
      const prev = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (prev && prev.total && prev.hourly) {
        // restart 唔想清零(要收 24-48 鐘頭數據),但舊檔 shape 唔啱就當冇。
        state = { since: prev.since || state.since, total: { ...blankBucket(), ...prev.total }, hourly: prev.hourly };
        console.log(`📊 ops-metrics:由碟載返${label === '主檔' ? '' : '(' + label + ')'}(since=${state.since})`);
        loaded = true;
        break;
      }
    } catch (e) {
      if (fs.existsSync(f)) {
        console.warn(`⚠️ ops-metrics:${label}讀唔到/壞咗(${e?.message}) —— 呢部分數據已經蝕咗`);
      }
    }
  }
  if (!loaded && fs.existsSync(METRICS_FILE)) {
    console.warn('🚨 ops-metrics:主檔同 .bak 都救唔返,由零開始數。');
  }

  const t = setInterval(() => {
    try {
      if (sampler) {
        const s = sampler() || {};
        if (typeof s.cacheSize === 'number') {
          for (const b of buckets()) {
            b.cacheSize.last = s.cacheSize;
            if (b.cacheSize.min == null || s.cacheSize < b.cacheSize.min) b.cacheSize.min = s.cacheSize;
            if (b.cacheSize.max == null || s.cacheSize > b.cacheSize.max) b.cacheSize.max = s.cacheSize;
          }
        }
      }
      summaryLine();
      scheduleFlush();
    } catch (_) {}
  }, SUMMARY_EVERY_MS);
  if (t.unref) t.unref();
}
