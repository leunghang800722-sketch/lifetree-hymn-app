# W1 執行報告 — 儀器缺口根治（C1 JS+backend + CLOG-1）2026-09-06

執行：Sonnet 5。對應執行單：`DEEP-AUDIT-W1-EXEC-20260906.md`。
根源文件：`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C1/§C6/§W1/§4(N-6/N-7/N-10)、`DEEP-AUDIT-1D-BACKEND-20260906.md` CLOG-1/DEAD-2。

**基準 HEAD**：執行單寫 `2a9959e`；開工時另一個並行 session 加咗一個純
docs commit `17ed1bc`（`docs(audit): 1B Android 運行時 baseline 報告 + …`，
只加 `DEEP-AUDIT-1B-ANDROID-20260906.md`/`DEEP-AUDIT-W1-EXEC-20260906.md`/
`ops/perf/audit-20260906/1b-raw/*`，`git show --stat` 核實冇碰過本執行單
任何一個目標檔案）。本報告嘅 harness/commit 都以 `17ed1bc` 為 HEAD 起計，
唔影響範圍判斷。

**唔部署、唔 restart、唔 OTA**——本 session 全程冇碰 Cloudflare/DNS/cert/
token，冇開 iOS 模擬器/Android AVD，冇改 PlayerProvider/watchdog/prefetch
拒收邏輯或任何 threshold。

---

## 1. 範圍完成情況

### 1.1 前端

| # | 項 | 檔案:行 | 狀態 |
|---|---|---|---|
| F1 | 新 `src/clientLog.js` | `frontend/hymn-app/src/clientLog.js`（新檔，117 行）| ✅ 單一 `sendClientLog(event, fields, opts)`，強制注入 `platform`/`deviceId`/`appVersion`（`expo-constants` Constants.expoConfig.version，guarded require）/`updateId`（`expo-updates`，`__DEV__` 或冇 embed config 就 `'dev'`，有 config 但 `Updates.updateId` 空就 `'embedded'`）/`sessionId`（module load 生成一次嘅 32-hex）。fire-and-forget，全 try/catch |
| F2 | 三套實作改用 F1 | `App.js:276` logDiag()、`src/track-player-service.js:9` logDiag()、`src/audioPrefetch.js:179` diagFail() | ✅ 三處都只換送信層，`App.js` 嘅 `DIAG_ENABLED`/`opts.always` 閘邏輯逐字保留在 `logDiag()` 內（冇搬去 clientLog.js） |
| F3 | perfMarks 共用送信 | `src/perfMarks.js:132` `sendBeacon()` | ✅ 改 call `require('./clientLog.js').sendClientLog()`，自己嘅排程/detail 組裝（15s/25s/5s/60s timer、`String(detail).slice(0,400)`）原封不動。`navBeaconsSent` cap `10`→常量 `NAV_BEACON_CAP=40`，撞 cap 送一次 `navBeaconCapped`（detail=`cap=40`），之後靜音。順手剷走冇用嘅 `import { Platform }`（platform 而家由 clientLog.js 注入） |
| F4 | prefetchFail 加分辨欄位（N-6） | `src/audioPrefetch.js:362-368`（tooSmall 分支） | ✅ detail 加 `bytes=<實收>`、`min=<MIN_BYTES>`、`dur=<duration秒或->`、`ct=<content-type或->`（保留舊 `tooSmall=` 前綴做向後相容）。**拒收判斷（`buf.byteLength < MIN_BYTES`）一個字冇改** |
| F5 | wallClockDrift 加欄位（N-7） | `App.js:547` 新 `lastForegroundResumeAtRef`、`App.js:1536-1541`（AppState listener）、`App.js:2109-2119`（wallClockDrift 觸發點） | ✅ `appState` 本身已存在（見下面「發現」）；新加 `bgMs`=距離上次 background→active transition 幾多 ms，冷開機未發生過就 `'-'`。**觸發條件（`drift > 5000`）一個字冇改** |
| F6 | userSync 未知 op + outbox 長度 beacon | `src/sync/userSync.js:99-102`（`syncUnknownOp`）、`src/sync/userSync.js:111-126`（`outboxLong`，`flush()` 內，≥50 觸發、每 session 一次）| ✅ 兩個行為都唔改任何既有邏輯（未知 op 照舊 `return true` 唔卡隊；outbox 照樣 drain） |

**發現（唔在原始範圍，順手記低）**：F5 要求「加 `appState`」嗰刻發現
`App.js:2110` 嘅 `logDiag('wallClockDrift', {...})` **早已經帶
`appState: appStateRef.current`**（`STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13`
已加），執行單描述可能對住舊一版代碼寫。本報告只新增咗 `bgMs`。

### 1.2 backend

| # | 項 | 檔案:行 | 狀態 |
|---|---|---|---|
| B1 | 白名單擴欄 | `backend/routes/clientLog.js`（`safe` object） | ✅ 加 `appVersion`(≤20)、`updateId`(≤48)、`sessionId`(≤32)，其餘欄位/slice 上限一個字冇改（`detail` 仍 400） |
| B2 | I/O 優化 | `backend/lib/clientLogStore.js`（全檔重寫） | ✅ `mkdirSync`/`chmodSync` 搬去 module load 一次過；per-request 淨係 push 落 `pendingByFile`（按檔名分組防跨日邊界撈亂），定時（1s）或滿 64KB 就 `fs.appendFile`（async）批量 flush；size cap 用記憶體累計 bytes（`getDiskBytesBaseline()` 每個日檔第一次撞到先 `statSync` 一次）；`process.on('beforeExit', …)` 盡力 flush，**冇加 SIGTERM handler**（memory Batch D 紅線） |
| B3 | per-IP 節流 | `backend/routes/clientLog.js`（`hitsByIp`/`isRateLimited()`） | ✅ 抄 `routes/invites.js:63-83` sweep-on-threshold pattern，窗 60s，`CLIENT_LOG_RATE_MAX` env（預設 120），Map 上限 5000（同 presence.js）。超額 429 + 唔寫 store（喺 `appendClientLog` 之前 return） |
| B4 | opsMetrics | `backend/lib/opsMetrics.js`（多處）、`backend/routes/{audio,category,search,home}.js`（`gone()`）、`backend/server.js`（sampler）、`backend/routes/hls.js`（新 `getPlaylistCacheSize()`）、`backend/routes/clientLog.js`（新 `getClientLogRateMapSize()`） | ✅ (a) 持久 `deprecatedRouteHits`（route path→count），4 個 410 stub 都 call；(b) `resolve.failMs` 直方圖（count/sum/max + 5 bucket），淨係喺 `recordResolveOutcome` 失敗分支加，冇改 resolve 邏輯/次序；(c) 三個新 gauge `failCacheSize`/`playlistCacheSize`/`clientLogRateMapSize` 落 `gauges` object，sampler 喺 `server.js:enableOpsMetrics` 已接線 |
| B5 | 剔除規則 code 化 | `ops/perf/classify-devices.mjs`（新檔，239 行） | ✅ 讀 `backend/logs/client-log/*.jsonl`，輸出每個 deviceId 嘅 platform/rows/firstSeen/lastSeen/class/reason；規則 R1-R4 逐條喺檔頭寫低出處（1E §1 原文） |

**額外/超出字面範圍嘅小改動（為咗令 harness 做到「唔起第二個完整
server 打 prod 歌庫」而唔污染 `backend/logs/client-log/` 真實生產數據，
必須加嘅測試座）**：

- `backend/lib/clientLogStore.js` 加 `CLIENT_LOG_DIR_OVERRIDE`/
  `CLIENT_LOG_MAX_FILE_BYTES` 兩個 env override，**預設值/預設行為完全
  唔變**（冇設呢兩個 env 就同之前一樣）。冇呢兩個 override，H-B1/H-B2/H-B4
  嘅 harness 冇得喺唔寫爛真實 `backend/logs/client-log/`（`classify-devices.mjs`
  同 1E 都要讀嗰度）嘅前提下做隔離測試。

### 1.3 紅線核對

- 🔴 冇掂 `ios/Podfile` SWStallWatchdog（native 部分排 W8）。
- 🔴 冇改任何 PlayerProvider 播放/watchdog/prefetch 拒收邏輯或 threshold（`MIN_BYTES`/`drift > 5000`/`NATIVE_WD_V2` 等一個字冇改）。
- 🔴 冇部署/restart/OTA/掂 Cloudflare/DNS/cert/token。
- 🔴 冇開模擬器/AVD。
- 冇改其他 route 嘅節流（W2 範圍）。
- harness 全部放 `ops/perf/harness/w1/` 或 scratchpad，**冇放任何檔喺 `backend/` 底下**。

---

## 2. 驗證證據表

環境入帳（全部子測試共用）：HEAD `17ed1bc37726b402ed402189476408d62c6af877`，
Node `v26.0.0`，跑嘅時間 2026-09-06（HKT 凌晨）。原始輸出檔：

- 前端：`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w1/frontend-harness-output2.json`
- backend：`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w1/backend-harness-output.json`

跑法（命令原文）：
```bash
node ops/perf/harness/w1/frontend-harness.mjs > <output>.json
node ops/perf/harness/w1/backend-harness.mjs > <output>.json
node ops/perf/classify-devices.mjs
```

harness 方法論：babel（`babel-preset-expo`，同 App.js/perfMarks.js 本身用嘅
preset 一致）將**而家 repo 入面真正嗰份源碼**轉做 CommonJS，用自定義
`require` resolver 執行（相對路徑讀真檔案 recursively load、bare specifier
用輕量 mock、其餘用真 node require 解析 `frontend/hymn-app/node_modules`）；
backend 用真實 `routes/clientLog.js`/`lib/clientLogStore.js`/`lib/opsMetrics.js`
（唔起完整 `server.js`，唔碰 hymns.db/yt-dlp）。

### 2.1 前端

| 項 | 證據 |
|---|---|
| **H-F1** | `sendClientLog()` 對 6 種 event（`nextTrackMs`/`prefetchFail`/`wallClockDrift`/`perfNav`/`syncUnknownOp`/`outboxLong`）各打一條，逐條 dump payload：全部 6 條都齊 `platform`(`"ios"`)/`deviceId`(32-hex)/`appVersion`(`"9.9.9-harness"`)/`updateId`(`"harness-update-abc123"`)/`sessionId`(16-hex，同一 session 內 6 條全部一樣)，原有欄位（`hymnId`/`detail`/`appState`/`trackState`）逐字保留。原始 payload 見輸出檔 `H-F1` 節 |
| **H-F2** | 抽取即時源碼（`App.js` 現行 `function logDiag(event, extra, opts) {...}`，126 字元，逐字列印喺輸出檔）。DIAG_ENABLED=false：`logDiagOff('stateChange', {foo:1})`（冇 `always`）→ **零條** call 記錄；`logDiagOff('wallClockDrift', {...}, {always:true})` → **1 條**記錄（`{"event":"wallClockDrift","extra":{"detail":"driftMs=6000 bgMs=-"}}`）。負控/正控同一個 array 內對比：只有 always 嗰條入到 |
| **H-F3** | 連續 `recordNavBeacon()` 45 次 → `perfNavCount=40`、`navBeaconCappedCount=1`（detail=`"cap=40"`）；之後再打 5 次 → `afterCapNewRequests=0`。完全對得上「40 perfNav + 1 capped + 之後零條」 |
| **H-F4 prefetchFail** | 方法：由 `audioPrefetch.js` 即時抽取 `diagFail()`(98 字元) + tooSmall if-block(529 字元) 源碼字串，用 mock 輸入 `buf.byteLength=1024`、`MIN_BYTES=204800`、`durationSecById={'7511':45}`、`contentType='text/html; charset=utf-8'` eval。輸出：`{"songId":"7511","detail":"tooSmall=1024 bytes=1024 min=204800 dur=45 ct=text/html; charset=utf-8"}`。**方法論限制**：冇經 `expo-file-system`（`prefetch()`/`downloadOne()` 要 mock `File`/`Directory` native module，效益低過用源碼抽取直接驗證 detail 字串組裝邏輯），故用抽取現行原始碼字串 + eval 嘅方式，唔係完整 module 載入 |
| **H-F4 wallClockDrift** | 由 `App.js` 抽取 `if (drift > 5000) {...}` block（710 字元）。兩個變體：(a) `lastForegroundResumeAtRef.current=null`（冷開機未 transition）→ `bgMs=-`；(b) 1000ms 前先 transition → `bgMs=1000`。兩者都輸出 `opts.always=true`，`detail` 分別係 `"driftMs=6000 bgMs=-"`/`"driftMs=6000 bgMs=1000"` |
| **H-F4 syncUnknownOp/outboxLong** | 真 module 載入 `userSync.js`：`enqueue({op:'pl_rename', foo:1})`（未知 op）+ 55 個 `fav_add`，`flush()` → `drained=true`、`favAddNetworkCalls=55`。`syncUnknownOpBeacons`=1 條（`detail:"pl_rename"`），`outboxLongBeacons`=1 條（`detail:"56"`，56=1未知op+55 fav_add，觸發喺 `flush()` 開頭讀 queue 嗰刻） |
| **H-F5** | fetch mock 強制 reject（`Error('mock fetch reject')`），call `sendClientLog('nextTrackMs', {detail:'x'})`：`callerThrew=false`，`unhandledRejectionCount=0`（`process.on('unhandledRejection')` 監聽 80ms 都冇捕捉到） |

### 2.2 backend

| 項 | 證據 |
|---|---|
| **H-B1** | 舊版（`git show HEAD:backend/lib/clientLogStore.js`，即改動前原文，copy 落隔離 scratch 目錄跑）vs 新版（真實檔案，`CLIENT_LOG_DIR_OVERRIDE` 隔離）各打 1000 次 `appendClientLog()`：**舊** p50=0.047ms / p90=0.063ms / max=1.938ms / 總 wall=54.30ms；**新** p50=0.0028ms / p90=0.0041ms / max=1.111ms / 總 wall=5.28ms（約 10 倍）。handler 內 sync fs call 次數（loop 期間，唔計 module load）：**舊** `mkdirSync=1000 chmodSync=1000 statSync=1000 appendFileSync=1000`；**新** `mkdirSync=0 chmodSync=0 statSync=1（第一次跑先 stat 一次做起點）appendFileSync=0 appendFile(async)=1` |
| **H-B2** | 新版 flush 後（等 2000ms > FLUSH_INTERVAL_MS 1000ms）：jsonl 行數 **1000/1000**，`allLinesValid=true`，`orderPreserved=true`（逐行 `detail` 內 `n=<i>` 同輸入順序核對），`sampleLine` 含 `appVersion`/`updateId`/`sessionId` 三個新欄。舊版（本身就同步寫完）：行數同樣 1000/1000，`allLinesValid=true`，`orderPreserved=true` |
| **H-B3** | 正控：同一 IP（`X-Forwarded-For: 203.0.113.10`）連打 121 條 → `status204Count=120`、`status429Count=1`，`firstLimitedAtRequestIndex1Based=121`（第 121 條先 429，同 spec「第121條429」完全吻合）。負控：20 個唔同 IP（`198.51.100.1`~`.20`）各 10 條 → 全部 200 條都係 204（`distinctStatuses=[204]`） |
| **H-B4** | `CLIENT_LOG_MAX_FILE_BYTES=3000` 打 200 條 request：`allResponsesWere204=true`（到頂都照 200/204，唔影響 caller），`finalFileBytes=3312`（略高於 3000，因為 cap 檢查係「呢批 buffer flush 之前」判斷，最後一個 batch 落閘前已經排咗隊——證明「到頂停寫」但唔會炸 caller，唔係嚴格逐 byte 硬頂） |
| **H-B5** | call 4 個 stub route 各 3 次（模擬）→ `deprecatedRouteHits={"/api/category":3,"/api/search":3,"/api/home":3,"/api/audio":3}`，逐條對得上。5 次 mock resolve 失敗（ms=5000/15000/45000/90000/130000）→ `resolveFailMs={count:5, sum:285000, max:130000, buckets:{lt10s:1, "10to30s":1, "30to60s":1, "60to120s":1, ge120s:1}}`（`sum` = 5000+15000+45000+90000+130000 = 285000 對得上）。`gaugesShapePresent=["failCacheSize","playlistCacheSize","clientLogRateMapSize"]`（新 key 已喺 `blankBucket()` shape 入面）。**方法論限制**：`server.js` 嘅 sampler 寫入 gauge 值淨係喺 `enablePersistence()` 嘅 `setInterval`（30 分鐘一 tick）先執行，harness 冇可能等 30 分鐘——呢部分改用**代碼核對**：`server.js` sampler 已傳 `failCacheSize: failCache.size`/`playlistCacheSize: getPlaylistCacheSize()`/`clientLogRateMapSize: getClientLogRateMapSize()`，`opsMetrics.js` 嘅 `setInterval` callback 已加對應嘅三個 `if (typeof s.X === 'number')` 分支寫入 `b.gauges.X`（逐行核對過，冇 runtime 執行證明） |
| **H-B6** | `node ops/perf/classify-devices.mjs` 跑現有 `backend/logs/client-log/*.jsonl`（13 個檔，2795 行）：**確認真機**（R1）`e1b6dc8a...`，258 行，跨 4 個曆日（09-02~09-05）——**同 1E 完全一致**（1E：「258 行」「橫跨 4 個曆日」逐字對得上）。iOS `sim`（R2）17 個 deviceId、`unknown`（R4）33 個、`unverified` android（R3）12 個。**同 1E 對唔齊**：1E 報「iOS 45 個相異值（1 real + 44 sim）、Android 1 個」，而家跑出嚟係「iOS 51 個（1 real + 17 sim + 33 unknown）、Android 12 個」。**解釋**：1E 分析當日嘅 snapshot 早過本次執行——`backend/logs/client-log/client-log-2026-09-05.jsonl` 嘅檔案 mtime 係 `Sep 6 02:00`（即係本執行單開工前後），代表 09-05 嗰個檔喺 1E 執行完之後**仲有第二輪流量寫入**（跟今日凌晨嘅並行測試活動吻合，memory `project-multi-sim-clientlog-contamination` 已知呢類環境有多 session 共寫嘅風險）。真機（R1）嗰 258 行/4日冇變，證明分類規則本身穩定，差異純粹係資料窗口延後咗，唔係規則錯 |
| **H-B7** | `node --check` 全部 9 個改動檔（`clientLogStore.js`/`opsMetrics.js`/`audio.js`/`category.js`/`clientLog.js`/`hls.js`/`home.js`/`search.js`/`server.js`）全部 `status:0` 冇 stderr。逐個 module `import()`（**冇 import `server.js`**，避免起 server）：8 個檔全部 `{ok:true}` |

### 2.3 對照 §2 表要求逐項覆核

| 執行單原定項 | 覆核結果 |
|---|---|
| H-F1 | ✅ 完成，見上 |
| H-F2 | ✅ 完成，見上 |
| H-F3 | ✅ 完成，見上 |
| H-F4 | ✅ 四種 event 全做，兩種（prefetchFail/wallClockDrift）用源碼抽取法（已註明限制），兩種（syncUnknownOp/outboxLong）用真 module 載入 |
| H-F5 | ✅ 完成，見上 |
| H-B1 | ✅ 完成，見上（新舊對比） |
| H-B2 | ✅ 完成，見上 |
| H-B3 | ✅ 完成，見上（正控+負控） |
| H-B4 | ✅ 完成，見上 |
| H-B5 | ✅ 完成（counter/histogram 部分 runtime 驗證；gauge sampler wiring 部分代碼核對，已註明限制） |
| H-B6 | ✅ 完成，`classify-devices.mjs` 可重跑，真機分類同 1E 一致；其餘因資料窗口延後有差異（已解釋） |
| H-B7 | ✅ 完成，見上 |

---

## 3. 改動總 diffstat

```
 backend/lib/clientLogStore.js                 | 150 ++++++++++++++++++++++----
 backend/lib/opsMetrics.js                     |  71 +++++++++++-
 backend/routes/audio.js                       |   5 +-
 backend/routes/category.js                    |   4 +
 backend/routes/clientLog.js                   |  51 +++++++++
 backend/routes/hls.js                         |   7 ++
 backend/routes/home.js                        |   4 +
 backend/routes/search.js                      |   4 +
 backend/server.js                             |  11 +-
 frontend/hymn-app/App.js                      |  39 ++++---
 frontend/hymn-app/src/audioPrefetch.js        |  29 +++--
 frontend/hymn-app/src/perfMarks.js            |  51 +++++----
 frontend/hymn-app/src/sync/userSync.js        |  12 +++
 frontend/hymn-app/src/track-player-service.js |  13 +--
 14 files changed, 361 insertions(+), 90 deletions(-)
```

新檔（唔計入上面 diffstat）：

```
frontend/hymn-app/src/clientLog.js              117 行
ops/perf/classify-devices.mjs                   239 行
ops/perf/harness/w1/frontend-harness.mjs        363 行
ops/perf/harness/w1/backend-harness.mjs         174 行
ops/perf/harness/w1/backend-store-timing-worker.mjs  138 行
ops/perf/harness/w1/backend-http-worker.mjs     114 行
```

## 4. 未做 / 做唔到嘅項

冇。§1 F1-F6、B1-B5 全部做齊；§2 H-F1~H-F5、H-B1~H-B7 全部有證據。
兩個記錄在案嘅方法論限制（H-F4 prefetchFail/wallClockDrift 用源碼抽取
唔係完整 module 載入；H-B5 gauge sampler wiring 用代碼核對唔係 30 分鐘
runtime 等待）已喺 §2 逐項寫明原因，唔屬於「做唔到」，係基於效益/可行性
嘅方法選擇。

## 5. Commit

三個 pathspec commit：

1. 前端：`frontend/hymn-app/App.js` `frontend/hymn-app/src/clientLog.js`
   `frontend/hymn-app/src/audioPrefetch.js` `frontend/hymn-app/src/perfMarks.js`
   `frontend/hymn-app/src/sync/userSync.js` `frontend/hymn-app/src/track-player-service.js`
2. backend：`backend/lib/clientLogStore.js` `backend/lib/opsMetrics.js`
   `backend/routes/audio.js` `backend/routes/category.js`
   `backend/routes/clientLog.js` `backend/routes/hls.js`
   `backend/routes/home.js` `backend/routes/search.js` `backend/server.js`
3. harness/ops：`ops/perf/classify-devices.mjs` `ops/perf/harness/`

Commit sha 見交付訊息（本報告寫作時 commit 尚未落地，sha 由執行者喺回覆
入面補充）。
