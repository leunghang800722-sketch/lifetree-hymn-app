# W1 執行單 — 儀器缺口根治（C1 JS+backend + CLOG-1）2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。驗收：Opus 5（獨立）。部署：Fable 5.1 經 gate（**執行者唔部署**）。
根源文件：`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C1、§C6（CLOG 部分）、§W1、§4 N-6/N-7。Phase 1 證據：`DEEP-AUDIT-1E-TELEMETRY-20260906.md`、`DEEP-AUDIT-1D-BACKEND-20260906.md` CLOG-1/DEAD-2、`DEEP-AUDIT-1C-IOS-20260906.md` 限制#6。基準 HEAD `2a9959e`。

## 0. 點解係第一波
四套 client-log 送信實作各自演化（App.js `logDiag`、`src/perfMarks.js`、`src/track-player-service.js:11`、`src/audioPrefetch.js:183`），只有頭兩套帶 platform/deviceId；收貨端 `/api/client-log` 零節流 + 每 request 同步 fs I/O。**之後每一波嘅 before/after 都靠呢套儀器**，所以先修佢。

## 1. 範圍（做齊，唔准縮）

### 1.1 前端（`frontend/hymn-app`）
| # | 項 | 具體 |
|---|---|---|
| F1 | 新 `src/clientLog.js` | 單一 `sendClientLog(event, fields = {}, opts = {})`。**強制注入**：`platform`（Platform.OS）、`deviceId`（`src/deviceId.js` 現有 getter）、`appVersion`（expo-constants / app.json version）、`updateId`（`Updates.updateId ?? 'embedded'`，`__DEV__`/無 updates config 時 `'dev'`）、`sessionId`（module load 時生成一次嘅 uuid/隨機 16 hex，每次冷開一個新）。fire-and-forget，全部 try/catch，永不 throw，永不 await 阻塞 caller。keepalive 沿用現有 sendBeacon 做法 |
| F2 | 三套實作改用 F1 | `App.js:275 logDiag()` 內部送信改 call `sendClientLog`（**保留 logDiag 嘅 DIAG_ENABLED / always 閘邏輯原封不動**，只換送信層）；`track-player-service.js:11` 嗰個裸 fetch 改用 F1；`audioPrefetch.js:183` prefetchFail 改用 F1 |
| F3 | perfMarks 共用送信 | `src/perfMarks.js:146 sendBeacon` 改為 call F1（保留自己嘅排程/detail 組裝）。`navBeaconsSent` cap `10` → 常量 `NAV_BEACON_CAP = 40`；撞 cap 時送一次 `navBeaconCapped`（detail 含 cap 值），之後先靜音 |
| F4 | prefetchFail 加分辨欄位（N-6） | detail 加 `bytes=<實收>`、`min=<MIN_BYTES>`、`dur=<hymn duration 秒或 ->`、`ct=<content-type 或 ->`，令「真短歌」同「錯誤頁」事後分得開。**唔改任何拒收判斷邏輯** |
| F5 | wallClockDrift 加欄位（N-7） | `App.js:2102` 嗰條加 `appState=<AppState.currentState>`、`bgMs=<上次 background→active 相隔 ms 或 ->`。唔改觸發條件 |
| F6 | userSync 未知 op beacon（INF-010） | `src/sync/userSync.js` 未知 op drop 位加 `sendClientLog('syncUnknownOp', {detail: op})`；flush 時如果 outbox 長度 ≥ 50 送一次 `outboxLong`（detail 長度），每個 session 最多一次 |

### 1.2 backend
| # | 項 | 具體 |
|---|---|---|
| B1 | `routes/clientLog.js` 白名單擴欄 | 加 `appVersion`(≤20)、`updateId`(≤48)、`sessionId`(≤32)。其他欄同 slice 上限**一個都唔改**（detail 維持 400） |
| B2 | `lib/clientLogStore.js` I/O | `mkdirSync`+`chmodSync` 搬去 module load 一次（失敗 console.error 唔 throw）；per-request `statSync`+`appendFileSync` 改成**記憶體 buffer + 定時（≤1s）或滿 64KB 就 `fs.appendFile`（async）批量 flush**；size cap 用 buffer 內自己累計嘅 bytes（開機時 stat 一次），唔好每次 stat；process `beforeExit`/SIGTERM 時盡力 flush 一次（**唔准加會改變 restart 行為嘅 SIGTERM handler**——memory：Batch D 紅線。做法：只用 `process.on('beforeExit')` + flush timer，唔攔 SIGTERM） |
| B3 | `/api/client-log` per-IP 節流 | 抄 `routes/invites.js:63-83` 嘅 sweep-on-threshold pattern。窗 60s，`CLIENT_LOG_RATE_MAX` env，預設 **120/分鐘/IP**（理據：一部機正常峰值 perfMarks+perfNav+diag 一分鐘唔過 30 條；同一 NAT 後幾部機都夠）。超額回 429 + 唔寫 store；Map 上限 5000 同 presence.js 一樣 |
| B4 | `lib/opsMetrics.js` | (a) 持久 `deprecatedRouteHits` counter（4 個 410 stub route 各 call 一次 `recordDeprecatedRouteHit(path)`，保留現有 console.log）；(b) `resolve.failMs` 直方圖：`recordResolveOutcome` 失敗路徑記 `failCount`/`failMsSum`/`failMsMax` + bucket（<10s/10-30s/30-60s/60-120s/≥120s）——**只加記帳，唔改 resolve 邏輯/策略/次序**；(c) gauge：`resolveAudio.js` `cache.size`/`failCache.size`、`routes/hls.js` `playlistCache.size`、`routes/clientLog.js` 節流 Map size，每次 flush 時取值 |
| B5 | 剔除規則 code 化 | 新 `ops/perf/classify-devices.mjs`：讀 `backend/logs/client-log/*.jsonl`，輸出 deviceId → {platform, rows, firstSeen, lastSeen, class: real/sim/unknown, reason}。規則以 1E §1 用過嘅為準（模擬器 UA/deviceId 名單、密集 burst 等）——**要喺檔頭寫低每條規則同出處**，1E 得出「iOS 真機 1 部 = e1b6dc8a…」呢個結果要可以重跑重現 |

### 1.3 唔包（紅線）
- 🔴 唔掂 `ios/Podfile` SWStallWatchdog native beacon（W8）。
- 🔴 唔改 PlayerProvider 起播/stall/watchdog 任何邏輯或 threshold；唔改 prefetch 拒收邏輯；只加欄位、只換送信層。
- 🔴 唔部署、唔 restart、唔 OTA、唔掂 Cloudflare/DNS/cert/token。
- 🔴 唔開模擬器/AVD（1B Android 線仲用緊 AVD `hymntest`）。運行時 after 量度係部署後另一步，唔喺呢張單。
- 唔改其他 route 嘅節流（W2）。

## 2. 驗證（執行者只出證據表，唔判 PASS/FAIL）

### 2.1 前端 harness（babel 轉真 module 餵 shim，memory 慣例；放 scratchpad 或 `ops/perf/harness/`，**唔准放 backend/**）
| 項 | 要出嘅證據 |
|---|---|
| H-F1 | 對 `clientLog.js` mock fetch：每種 event 一條，逐條 dump payload，證明 5 個注入欄位齊 + 原有欄位無改 |
| H-F2 | logDiag 閘：DIAG_ENABLED=false 時非 always event **唔送**（負控），always event 照送（正控） |
| H-F3 | navBeacon：連續 45 次 recordNav → 收到 40 條 perfNav + 1 條 navBeaconCapped + 之後零條 |
| H-F4 | prefetchFail / wallClockDrift / syncUnknownOp / outboxLong 各 fire 一次，dump detail |
| H-F5 | `sendClientLog` 內 fetch throw / reject → caller 唔會 throw、唔會 unhandled rejection |

### 2.2 backend harness（用 express 起 router 喺隨機 port，**唔准起第二個完整 server 打 prod 歌庫**）
| 項 | 要出嘅證據 |
|---|---|
| H-B1 | 寫入耗時 **before vs after**：同一 harness 對舊 `clientLogStore`（git stash / 讀 HEAD 版本）同新版各打 1000 條，記 request handler 內耗時 p50/p90/max + 總 wall；after 要證明 handler 內冇 sync fs call（例如 `--cpu-prof` 或 `fs.*Sync` spy 計 0 次） |
| H-B2 | 批量 flush 後 jsonl 行數 = 送入條數（1000/1000），順序保持，每行 JSON 合法，含新三欄 |
| H-B3 | 節流正控：同一 IP 打 121 條 → 第 121 條 429，store 只有 120 行；負控：20 個唔同 IP 各 10 條全 200 |
| H-B4 | size cap：把 MAX_FILE_BYTES 臨時調細（env 或 harness 注入），證明到頂停寫但 response 照 200 |
| H-B5 | opsMetrics：call 4 個 stub route 各 3 次 → `deprecatedRouteHits` 對得上；mock 一次失敗 resolve outcome → failMs bucket 對得上；gauge 三個 size 有數 |
| H-B6 | `classify-devices.mjs` 跑現有 `backend/logs/client-log/`：輸出 iOS real 部數 + deviceId 前 8 位，同 1E §1 對數（要一致，唔一致要解釋邊條規則唔同） |
| H-B7 | `node --check` 全部改動檔；backend 用 `node -e "import('./server.js')"` 唔准（會起 server）——改用逐個 lib/route module import 檢查 |

### 2.3 環境入帳
每個 harness 記：HEAD sha、node 版本、跑嘅時間、命令原文、原始輸出檔路徑（scratchpad）。

## 3. 交付
1. Commit（**pathspec，只夾自己改嘅檔**）：前端一個 commit、backend 一個 commit、harness/ops 一個 commit。訊息尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
2. 報告 `DEEP-AUDIT-W1-REPORT-20260906.md`：每項範圍 → 檔:行 → 證據表（§2 逐項，原始數字）；未做/做唔到嘅逐條寫原因；改動總 diffstat。
3. 唔准 `git add -A`、唔准 `git clean`；commit 前 `git status` 核對只有自己嘅檔。有 `.git/*.lock` 殘留先確認冇 git process 再清。
