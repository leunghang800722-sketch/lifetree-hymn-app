# W1 獨立驗收 — Opus 5（2026-09-06）

驗收對象：`7ae5532`（前端）、`6a7f086`（backend）、`b672b61`（harness/ops）。
執行單：`DEEP-AUDIT-W1-EXEC-20260906.md`。執行報告：`DEEP-AUDIT-W1-REPORT-20260906.md`。
根源：`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C1/§W1/§4 N-6/N-7；`DEEP-AUDIT-1D-BACKEND-20260906.md` CLOG-1/DEAD-2/LOGIN-P2。

環境入帳：HEAD `b672b6104b76e4ed584d04cc1ec30d1631bdfa65`，node `v26.0.0`，
跑嘅時間 2026-09-06 HKT 凌晨。原始輸出全部喺
`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/w1-opus/`
（`frontend-harness.json`、`backend-harness.json`、`classify.txt`、`trueold-run.json`、
`truenew-run.json`、`nc-backend.json`、`nc-frontend.json`、`opsm-test` stdout）。
本次驗收**冇改任何 source、冇 commit、冇 restart/OTA/eas/launchctl、冇掂 Cloudflare、
冇開模擬器/AVD**；對 live backend 只做過三次唯讀 GET/一條 beacon POST（見 §5）。

---

## 1. 結論

# ✅ 可部署（restart 先於 OTA），冇 blocker。

範圍 F1-F6 / B1-B5 全部做齊，冇超範圍，§1.3 五條紅線全部守到（逐條核見 §2.4）。
我獨立重跑 harness，**除咗 H-B1 一項之外全部數字同報告逐位對得上**（H-B1 唔對嘅原因
係 harness 自己嘅可重現性 bug，唔係數字造假——我用 pre-W1 sha 手動重跑證實報告嗰組
before 數字係真嘅，見 §3）。

**兩件事要喺「after 量度」開始之前處理**（唔阻部署，但唔做嘅話 after 數字唔可信）：

1. 加一個 429 計數器（問題 #2）；**或者**
2. 量度期間用 `CLIENT_LOG_RATE_MAX=2000` env 開大節流（問題 #3，唔使改 code）。

兩者做其中一個就夠，兩個一齊做最穩。

---

## 2. 逐條問題

嚴重度：🔴=要修先 / 🟠=中高，建議同一波順手 / 🟡=中，可排下一波 / ⚪=記帳用

### 🟠 #1 — H-B1「before」對照組已經唔可重現（harness bug，唔係 code bug）

- **檔案:行**：`ops/perf/harness/w1/backend-harness.mjs:56`
  ```js
  const oldSrc = spawnSync('git', ['show', 'HEAD:backend/lib/clientLogStore.js'], …);
  ```
- **證據**：三個 commit 落地之後 `HEAD` 就係 W1 之後嘅版本。我原封不動重跑
  `node ops/perf/harness/w1/backend-harness.mjs`，「old」欄出嚟係：
  `p50=0.00275ms p90=0.003875ms max=1.003ms wall=5.27ms`、
  `duringLoop: {mkdirSync:0, chmodSync:0, statSync:1, appendFileSync:0, appendFile_async:1}`
  ——即係**新版嘅指紋**（舊版一定係 mkdir/chmod/stat/appendSync 各 1000 次）。
  換句話講而家跑呢個 harness 係「新 vs 新」，成個 H-B1 before/after 對比蒸發咗。
- **我做嘅補救（證明報告數字係真）**：用 pre-W1 sha 手動餵同一個 worker——
  ```bash
  git show 17ed1bc:backend/lib/clientLogStore.js > <scratch>/trueold/lib/clientLogStore.js
  HARNESS_VARIANT=old HARNESS_STORE_PATH=<scratch>/trueold/lib/clientLogStore.js \
    HARNESS_REQUEST_COUNT=1000 node ops/perf/harness/w1/backend-store-timing-worker.mjs
  ```
  結果 `p50=0.048833 p90=0.064 max=1.7675 wall=55.05ms`、
  `duringLoop:{mkdirSync:1000, chmodSync:1000, statSync:1000, appendFileSync:1000, appendFile_async:0}`
  —— 同報告嘅 `0.047 / 0.063 / 1.938 / 54.30` 喺量測噪音內完全一致。**報告冇作假。**
- **修法**：`backend-harness.mjs:56` 嘅 ref 改成可傳 env，預設指去 pre-W1 sha：
  `const OLD_REF = process.env.HARNESS_OLD_REF || '17ed1bc';` → `git show ${OLD_REF}:backend/…`。
  （`HEAD~3` 都得，但 sha 硬寫更穩，日後多幾個 commit 唔會飄。）
- **點解重要**：W1 成波嘅賣點就係「以後量得返」。一個量度工具第二日就量唔返自己
  嗰組 before，係方法論問題唔係美觀問題。

---

### 🟠 #2 — 429 掉咗嘅 beacon 完全冇儀器（一個「儀器根治」波引入咗新嘅靜默丟數路徑）

- **檔案:行**：`backend/routes/clientLog.js:68-72`
  ```js
  const ip = clientIp(req);
  if (isRateLimited(ip)) { res.status(429).end(); return; }
  ```
  對面 client：`frontend/hymn-app/src/clientLog.js:110-114` `fetch(...).catch(() => {})`
  ——**429 係一個成功 resolve 嘅 response，`.catch` 接唔到，client 完全唔知**。
- **證據（我加嘅負控 NC-3）**：同一個 IP 打 150 條 →
  `{"sent":150,"status204":120,"status429":30,"storeRowsForThatIp":120}`。
  30 條 beacon 靜靜哋消失，backend 冇 counter、冇 console.warn、`opsMetrics` 冇欄，
  client 亦冇任何記錄。事後淨係見到「呢分鐘得 120 條」，分唔開係「本來就得咁多」
  定係「打爆咗」。
  （順帶：執行單 §2.2 H-B3 要求「store 只有 120 行」，但
  `ops/perf/harness/w1/backend-http-worker.mjs:56-79` 由頭到尾**淨係數 HTTP status，
  完全冇數過 store 行數**，報告 §2.2 H-B3 亦冇呢個數。上面 `storeRowsForThatIp:120`
  係我補做嘅，結論係對嘅，但呢項證據原本係缺嘅。）
- **修法（backend-only，純 restart，唔使 OTA）**：`lib/opsMetrics.js` 加一個
  `recordClientLogRateLimited()` 累計器（同 `recordDeprecatedRouteHit` 一模一樣嘅形狀，
  落 `blankBucket()` 就會自動經 `normalizeBucket` 補齊），喺 `clientLog.js:70` 個
  429 分支 call 一次。成本 5 行。
- **嚴重度理由**：以今日流量（2795 行 / 13 日 ≈ 每分鐘 0.15 條）prod 永遠撞唔到
  120/min，所以**唔係 prod 風險**；但 after 量度期間（見 #3）好可能撞到，撞到之後
  after 嘅分母就係假嘅。所以係「量度完整性」嘅 blocker，唔係部署 blocker。

---

### 🟠 #3 — 同一個出口 IP 嘅所有裝置共用一個 120/min bucket，而 §W1「after 量法」正正要求兩部機同時跑

- **檔案:行**：`backend/routes/clientLog.js:38-58`（`RATE_MAX=120`、per-IP Map）；
  key 來源 `backend/lib/loginRateLimit.js:46` `clientIp()`。
- **證據（NC-3c）**：完全唔帶 proxy header（= 直連 `localhost:3001`，即模擬器/AVD 指
  住本機 backend 嗰種）打 150 條 → `{"status204":120,"nonZero204":30}`。所有 request
  撞同一個 `::1` key。經 Cloudflare 出去嘅情況同樣：`CF-Connecting-IP` = 用戶**公網
  IP**，Eric 部 Mac 上面兩部模擬器 + 佢部真機 + 同一 WiFi 嘅任何嘢，全部係同一個公網
  IP → **同一個 bucket**。
- **點解今次特別容易撞**：`perfMarks.js:263` 個 nav cap 由 10 升到 `NAV_BEACON_CAP = 40`，
  一輪連續 tap 嘅 burst 上限直接大咗 4 倍；1C 方法要 S1×3 + S3、iOS + Android 兩條線
  同時做。三部裝置 × burst 好現實會摸到 120/min。撞到之後（見 #2）冇任何訊號。
- **修法（零 code 改動）**：量度期間喺 backend 環境開 `CLIENT_LOG_RATE_MAX=2000`
  （呢個 env 執行者已經做咗，`clientLog.js:36`），量完除返。
- **注意**：`CLIENT_LOG_RATE_MAX` 係 module load 讀一次 → 改咗要 restart 先生效。
  即係「量度前 restart 開大 → 量完 restart 收返」，兩次 restart 都要經 gate。
  或者接受預設 120 + 加 #2 個 counter 做監察。

---

### 🟡 #4 — XFF 可以完全繞過呢個節流（既有 LOGIN-P2 缺陷，W1 冇引入亦冇修）

- **檔案:行**：`backend/lib/loginRateLimit.js:46`
  ```js
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  ```
  `grep "trust proxy" backend/server.js` = 0 hit（只有 `node_modules/express` 自己嘅）。
- **證據（NC-3b）**：同一條 TCP socket、每個 request 換一個 `X-Forwarded-For` →
  `{"sent":150,"status204":150}`，**零 429，節流形同虛設**。
- **實際風險評估（唔好報大）**：
  - 經 Cloudflare 正路入嚟：CF 邊緣會**覆寫** `CF-Connecting-IP`，client 自己塞嗰個
    會被冚，而 `clientIp()` 優先攞呢個 header → **prod 正路 key 係真用戶 IP，繞唔到**。
  - 繞得到嘅係：(a) 直連 `localhost:3001` / 同一 LAN；(b) 萬一 `CF-Connecting-IP`
    因為改 tunnel/走第二條路而唔見咗，XFF 就變成唯一 key，而佢係 client 全控。
- **結論**：**可接受**，因為 (1) 呢條係 1D 已經記低嘅 LOGIN-P2，唔係 W1 引入；
  (2) W2 明文要統一 trust proxy。但**唔可以喺任何報告寫「/api/client-log 已經有
  per-IP 節流」而唔跟埋呢句 caveat**——CLOG-1 只係關咗一半。建議 W2 執行單明文
  接手：`app.set('trust proxy', <cloudflared hop 數>)` + `clientIp()` 改攞 XFF 嘅
  **最後**一個 element。

---

### 🟡 #5 — F5 個 `bgMs` 解決唔到 N-7 想解嘅歧義，而且個值有 race

- **檔案:行**：`frontend/hymn-app/App.js:1534-1541`（寫 `lastForegroundResumeAtRef`）、
  `App.js:2109-2117`（讀）：
  ```js
  const bgMs = lastForegroundResumeAtRef.current != null
    ? (nowTs - lastForegroundResumeAtRef.current) : '-';
  ```
- **問題 (a) — 量錯咗個量**：ROOTCAUSE §4 N-7 原文要嘅係 **`bgDurationMs`**
  （「app 背景咗一晚」= 背景**時長**）。落地嘅係「距離返前台幾耐」。兩個唔同嘢。
- **問題 (b) — race**：個 drift 探測住喺 `poll()` 嘅 await-sleep loop 入面
  （`App.js:2099-2117`），佢同 `AppState` listener 兩樣嘢喺返前台嗰刻**邊個先 resume
  冇保證**：
  - listener 先行 → `lastForegroundResumeAtRef` 啱啱更新 → `bgMs ≈ 0`；
  - poll 先行 → `lastForegroundResumeAtRef` 仲係**上一次**返前台 → `bgMs` 可以係幾個鐘。

  **同一個情境（背景咗一晚返嚟）可以出兩個意思完全相反嘅數**，而讀數嗰個人冇任何
  辦法知邊次係邊種。N-7 嗰句「如果加咗之後仍然分唔開，下一波直接剷」就係為咗呢種
  情況寫嘅——依家嘅版本大機會會導致「剷」呢個誤判。
  （memory `project-admin-presence-page-20260905` 已經有一條「🧰 `AppState.currentState`
  喺 listener 前已更新」嘅同類教訓，係同一族陷阱。）
- **修法（純 OTA、唔改任何 threshold、唔改觸發條件）**：喺同一個 listener 加
  `if (s !== 'active') lastBackgroundAtRef.current = Date.now();`，返 active 嗰刻計
  `bgDurMs = resumeAt - lastBackgroundAt`，`detail` 兩個欄一齊出：
  `driftMs=… bgDurMs=… sinceResumeMs=…`。`bgDurMs` 答「背景咗幾耐」，`sinceResumeMs`
  答「係咪啱啱返前台」，兩個一齊先真係分得開。
- **注意**：呢條嘅責任一半喺執行單——§1.1 F5 寫「bgMs=<上次 background→active 相隔
  ms>」本身就係一句有兩種讀法嘅描述，執行者跟足字面做咗。

---

### 🟡 #6 — `classify-devices.mjs` 冇時間窗、冇 `--dir`、壞行唔計數 →「同一把尺」只做到一半

- **檔案:行**：`ops/perf/classify-devices.mjs:57`（`CLIENT_LOG_DIR` 硬寫，冇認
  `CLIENT_LOG_DIR_OVERRIDE`）、`:110-113`（壞行 `catch (_) {}` 靜靜 skip，冇 counter）、
  全檔冇 `--since/--until`（`process.argv` 只認 `--json`，`:234`）。
- **證據**：報告 §2.2 H-B6 自己就撞到咗——1E 報「iOS 45 個（1 real + 44 sim）」，
  重跑變「iOS 51 個（1 real + 17 sim + 33 unknown）」。報告解釋係「資料窗口延後」，
  **呢個解釋係啱嘅**（我重跑逐字一樣：`ios:real 1 / ios:sim 17 / ios:unknown 33 /
  android:unverified 12`，真機 `e1b6dc8a` 258 行跨 4 日同 1E 逐字對得上），但同時亦
  正正證明咗：**規則一樣，窗口唔一樣，兩次數字就對唔到。** 呢個工具嘅目的（§1.2 B5:
  「下次 after 可以用同一把尺重跑」）因此只達成咗一半。
- **附帶新風險**：B2 改咗批量 async writer 之後，「寫到一半嘅半截行」比舊嘅
  `appendFileSync(單行)` 更加有可能出現，而偵測器（`:110-113`）係**靜音**嘅。
- **我做嘅 robustness 負控（執行者冇做）**：copy 一份去 scratch 改 root 測——
  - 空目錄 → 印空表 + 空 summary，唔炸 ✅
  - 摻入 `{not json at all`、半截行 `{"ts":"…","event":"nextTr`、空行、`ts` 係
    `"bogus-ts"` → 照跑，得出 1 個 device 2 行，唔中斷 ✅（但**冇講跳過咗 3 行**）
  - 刪走 `app-version.json` → stderr 出警告 + R1 全部當唔中，唔炸 ✅
- **修法**：加 `--since=YYYY-MM-DD` / `--until=` （用 `row.ts`，`dateKeyOf()` 已經有）、
  `--dir=`、同埋喺 summary 尾印 `skippedBadLines=N`。三樣都係純 ops script，
  零部署風險。

---

### ⚪ #7 — `sessionId` 實際係 16 hex，唔係文件講嘅 32 hex

- `frontend/hymn-app/src/clientLog.js:32` 註解寫「module load(= 一次冷開)生成一次嘅
  **32-hex** 隨機 id」；`:45-48` `genSessionId()` 只拼**兩段** 8 hex = 16 hex。
  （對比 `src/deviceId.js:26-29` `generateDeviceId()` 拼四段 = 真 32 hex。）
  報告 §1.1 F1 表亦寫「32-hex」（§2.1 H-F1 又寫「16-hex」，自己前後唔一致）。
- **實測**：`nc-frontend.json` 八個情境全部 `sessionIdLen: 16`。
- **影響**：64-bit 隨機，碰撞風險可忽略；backend `slice(0, 32)` 亦夠位。**純文件錯**，
  但呢個 codebase 靠註解做交接，改一個字就係。

### ⚪ #8 — `App.js` 嘅 `DEVICE_ID` 變咗死碼，註解變咗錯

- `frontend/hymn-app/App.js:152` `let DEVICE_ID = null;` + `:4154` boot effect 填佢，
  但 `logDiag` 改咗用 `sendClientLog` 之後，**全 App.js 冇任何地方再讀 `DEVICE_ID`**
  （`grep -n "DEVICE_ID" App.js` 得宣告同賦值兩處）。
- `App.js:148-151` 嗰段註解仲寫住「logDiag() 用嚟俾每條 client-log 帶」——已經唔啱。
- 無害（個 effect 順便令 deviceId 早啲 warm 咗 promise cache）。記落 W7 死碼波。

### ⚪ #9 — `clientTs` 格式靜靜由 epoch 數字變咗 ISO 字串（perfMarks 嗰路）

- 舊 `perfMarks.js` sendBeacon 送 `clientTs: Date.now()`（實證：
  `ops/perf/audit-20260906/1c-raw/1c-s2-run4.log:9` `"clientTs":"1788626105613"`）；
  新 `src/clientLog.js:97` 統一 `new Date().toISOString()`。
- 我 grep 過全 repo（排除 node_modules/logs/raw），**冇任何 script 拆 `clientTs` 做
  數字**，所以冇 consumer 會爆。
- 但 OTA 出咗之後 jsonl 會兩種格式**混住**（未收 OTA 嘅舊 build 仲係送數字）。
  寫 after 分析嘅時候要知；`classify-devices.mjs:88` 已經正確地優先用 backend 嘅
  `row.ts` 唔信 `clientTs`，冇中招。

### ⚪ #10 — 送信由「同步 dispatch」變成「等 deviceId promise」

- `src/clientLog.js:100-116`：每條 beacon 都行 `resolveDeviceId().then(...)`，
  `clientTs` 亦係喺 `.then` 入面先計。
- 影響：(a) 第一條 beacon 嘅 `clientTs` 會偏 AsyncStorage 一次讀嘅時間（冷開幾十 ms），
  之後嗰啲得一個 microtask；(b) app 俾殺 / crash 之前最後嗰條 beacon，由「已經交咗
  俾網絡層」變成「可能仲喺 promise queue」——`nativeStall`/`wallClockDrift` 呢類
  「最後一口氣」訊號嘅到達率理論上跌咗少少。
- 另外 `src/track-player-service.js` 個 headless `registerPlaybackService` context
  而家會經 `clientLog.js` → `deviceId.js` 拉埋 AsyncStorage 入嚟（新增模組依賴）。
- **我實測八種降級情境全部安全**（`nc-frontend.json`）：
  | 情境 | 結果 |
  |---|---|
  | 正常 prod | `updateId="abc-123"` |
  | `__DEV__=true` | `updateId="dev"` ✅ 合 F1 spec |
  | `require('expo-updates')` throw | `updateId="dev"`，唔炸 |
  | `Updates.updateId` undefined | `updateId="embedded"` ✅ 合 F1 spec |
  | `require('expo-constants')` throw | `appVersion="unknown"`，唔炸 |
  | `Constants.expoConfig` 冇 | `appVersion="unknown"` |
  | AsyncStorage getItem/setItem 全部 throw | 照生成 in-memory deviceId，beacon 照出 |
  | 冇 `global.fetch` | `callerThrew=false`，`unhandledRejection=0` |
  `expo-updates ~56.0.24` / `expo-constants ~56.0.15` 兩個都真係喺
  `frontend/hymn-app/package.json:10,13`，`app.json` 有 `updates.url` + `runtimeVersion: 4`
  → prod OTA 之後 `updateId` 會係真 UUID，**§W1 想要嘅 before/after 切分維度成立**。
- **可接受**，記帳用。

### ⚪ #11 — size cap 有一個 in-flight batch 盲點

- `backend/lib/clientLogStore.js:165-176`：`flushFile()` 一開始就
  `pendingByFile.delete(fileName)`，而 `diskBytesByFile` 要等 `fs.appendFile` callback
  成功先加返。喺呢個 in-flight 窗口，`appendClientLog` 睇到嘅
  `diskBytes + queuedBytes` **少計咗成個 in-flight batch**，最壞情況多寫 64KB。
- H-B4 見到嘅 `finalFileBytes=3312 > cap 3000` 就係呢個（我重跑一樣係 3312）。
- 對 50MB 預設 cap 嚟講 = 0.13% 超額，**無關痛癢**。記帳用。

### ⚪ #12 — SIGTERM 蝕數窗口 = 最多 1 秒 / 64KB（可接受，唔違紅線嘅改善有限）

- `backend/lib/clientLogStore.js:159` `FLUSH_INTERVAL_MS = 1000`、`:195`
  `process.on('beforeExit', …)`。
- **實測**（我做，執行者冇做）：起一個模擬 server 嘅 process，入 50 條落 buffer，
  - 0.3 秒後 `kill -TERM` → **jsonl 檔完全冇建立，50 條全蝕**
  - 1.5 秒後（> FLUSH_INTERVAL_MS）`kill -TERM` → 50 行齊
- 即係 `beforeExit` 喺 SIGTERM 之下**確認唔會 fire**（node 預設 SIGTERM 直接殺，
  唔行 `exit`/`beforeExit` handler）——`clientLogStore.js:29-33` 個註解講得啱。
- **評估：可接受。** 以今日流量（2795 行 / 13 日 ≈ 每分鐘 0.15 條）一次 restart 實際
  蝕 0-1 條。唔違反「唔准加 SIGTERM handler」紅線嘅唯一改善係調細
  `FLUSH_INTERVAL_MS`（例如 250ms，代價係每秒 4 次 async `appendFile`，一樣唔阻
  event loop）。**唔建議為咗呢個延後部署**；如果 after 量度期間流量高（每分鐘幾百條）
  就順手調細。

---

## 2.4 §1.3 紅線逐條核

| 紅線 | 核法 | 結果 |
|---|---|---|
| 唔掂 `ios/Podfile` SWStallWatchdog | `git diff --name-only 17ed1bc..b672b61 \| grep -E "ios/\|android/\|patches/\|Podfile"` | 零 hit ✅ |
| 唔改 PlayerProvider 起播/stall/watchdog 邏輯或 threshold | 逐行讀 `git show 7ae5532` 嘅 App.js 部分 | 只有三處：`:543` 加一個 ref；`:1534-1541` 喺 `if (s !== 'active') return;` **之前**加一個純寫 ref 嘅 branch（`prevState` 喺覆寫前先抄低，行為中性）；`:2109-2117` 加 `bgMs` 落 detail 字串。`drift > 5000`、`NATIVE_WD_V2`、任何 threshold 一個字冇改 ✅ |
| 唔改 prefetch 拒收邏輯 | `audioPrefetch.js:362` 個 `if (!buf \|\| buf.byteLength < MIN_BYTES)` 逐字對比 | 條件式一個 byte 冇改，`MIN_BYTES = 200*1024` 冇改，只係 block 入面由一條 `diagFail` 變咗四個欄嘅 `diagFail`。`badType` 分支（`:357-359`）都冇郁 ✅ |
| 唔加 SIGTERM handler | `grep -rn "SIGTERM" backend/lib backend/routes backend/server.js` | 只有註解，零 handler ✅（`beforeExit` 一個，`:195`，唔攔 signal、唔 keep-alive；`flushTimer` 有 `unref()`，`:163`）✅ |
| 唔部署/restart/OTA/Cloudflare | `deploy.log` 冇新 entry；live backend 仍然係舊 code（`/api/audio/cache/warm-stats` 個 `total.resolve` 冇 `failMs` 欄）| ✅ |
| 唔開模擬器/AVD | 本次驗收零 simctl/adb | ✅ |

**超範圍嘅嘢**：只有兩個 env override（`CLIENT_LOG_DIR_OVERRIDE`、
`CLIENT_LOG_MAX_FILE_BYTES`，`clientLogStore.js:44,56`）。兩者預設值/預設行為
完全不變，係為咗隔離 harness 唔污染 `backend/logs/client-log/`（嗰度仲要俾
`classify-devices.mjs` 讀住做 1E 對數）。**判定：合理，批准。** 冇呢兩個 seam，
H-B1/B2/B4 唔可能喺唔寫爛生產數據嘅前提下做。

**`ops/perf/harness/` 位置**：冇任何檔喺 `backend/` 底下 ✅
（memory `feedback-scratch-scripts-block-deploy-gate` 紅線守到）。

---

## 3. 我重跑嘅數字 vs 報告

跑法（命令原文）：
```bash
node ops/perf/harness/w1/frontend-harness.mjs   # → w1-opus/frontend-harness.json
node ops/perf/harness/w1/backend-harness.mjs    # → w1-opus/backend-harness.json
node ops/perf/classify-devices.mjs              # → w1-opus/classify.txt
```

| 項 | 報告數字 | 我重跑 | 對唔對得上 |
|---|---|---|---|
| H-F1 | 6 條 event 齊 5 個注入欄 | 6 條齊，`platform=ios`、`deviceId` 32-hex、`appVersion=9.9.9-harness`、`updateId=harness-update-abc123`、`sessionId` 同一 session 內 6 條全同 | ✅（`sessionId` 長度係 16 唔係報告 §1.1 寫嘅 32，見 #7）|
| H-F2 | 負控 0 條 / 正控 1 條 | `diagEnabledFalse_calls` = 1 條，只有 `always:true` 嗰條入到 | ✅ |
| H-F3 | perfNav 40 / capped 1（`cap=40`）/ 之後 0 | `perfNavCount:40, navBeaconCappedCount:1, cappedDetail:["cap=40"], afterCapNewRequests:0` | ✅ |
| H-F4 prefetchFail | `tooSmall=1024 bytes=1024 min=204800 dur=45 ct=text/html; charset=utf-8` | 逐字一樣 | ✅ |
| H-F4 wallClockDrift | `driftMs=6000 bgMs=-` / `driftMs=6000 bgMs=1000`，`opts.always=true` | 逐字一樣 | ✅ |
| H-F4 sync | `drained:true`、`favAddNetworkCalls:55`、unknownOp 1 條(`pl_rename`)、outboxLong 1 條(`56`) | 逐字一樣 | ✅ |
| H-F5 | `callerThrew:false`、`unhandledRejectionCount:0` | 一樣 | ✅ |
| **H-B1 old** | p50 **0.047** / p90 0.063 / max 1.938 / wall **54.30**；sync mkdir·chmod·stat·appendSync 各 **1000** | 原封不動跑 harness → **0.00275 / 0.0039 / 1.003 / 5.27，sync 全 0**（= 新版指紋，harness bug #1）；**我用 `17ed1bc` 手動重跑 → 0.0488 / 0.064 / 1.7675 / 55.05，sync 各 1000** | ⚠️ harness 唔可重現，但**手動重跑證實報告數字係真** |
| H-B1 new | p50 0.0028 / p90 0.0041 / max 1.111 / wall 5.28；`statSync=1, appendFile_async=1` | 0.00271 / 0.00396 / 1.091 / 5.07；`statSync=1, appendFile_async=1` | ✅ |
| H-B2 | 1000/1000，`allLinesValid`、`orderPreserved` 皆 true，含三個新欄 | 1000/1000，兩個都 true | ✅ |
| H-B3 | 正控 204×120 + 429×1（第 121 條）；負控 20 IP × 10 全 204 | 完全一樣 | ✅ |
| H-B3 store 行數 | **報告冇量**（執行單有要求）| 我補：`storeRowsForThatIp = 120` | ➕ 補齊，結論成立 |
| H-B4 | 全 204，`finalFileBytes=3312`（cap 3000）| 一樣 3312 | ✅ |
| H-B5 | `deprecatedRouteHits` 四條各 3；`failMs {count:5, sum:285000, max:130000, buckets 各 1}`；gauges 三個 key | 完全一樣 | ✅ |
| H-B6 | real 1（`e1b6dc8a`，258 行，跨 4 日）/ sim 17 / unknown 33 / android 12 | 逐字一樣 | ✅（同 1E「258 行 / 4 曆日」對得上）|
| H-B7 | 9 個 `node --check` 全 status 0；8 個 module import 全 ok | 一樣 | ✅ |

### 3.1 我補做嘅正控/負控（執行者冇做嘅）

| # | 測試 | 結果 | 判讀 |
|---|---|---|---|
| NC-1 | **舊格式 beacon**：`{event, clientTs: <epoch number>, platform, deviceId}`（舊 perfMarks 格式）| **204**，落 store，三個新欄 = `""` | ✅ 向後相容，舊 app 打新 backend 唔會炸 |
| NC-1b | **完全裸格式**：`{event, clientTs, position, duration}`（舊 track-player-service，零識別欄）| **204**，落 store | ✅ |
| NC-2 | 畸形 body：`null` / 純字串 / 壞 JSON | **400**（`express.json()` strict，**既有行為，唔係 W1 引入**；route handler 根本冇行到）| ⚪ 唔係 regression |
| NC-2 | `[]` / `{}` / 惡意型別（`event` 係 object、`detail` 5000 字、`sessionId` 200 字）| **204**，`detail` 截 400、`sessionId` 截 32、`event` 變 `"[object Object]"` | ✅ 白名單守得住 |
| NC-3 | 節流 + **store 行數** | 150 送 → 204×120 / 429×30 / store 120 行 | ✅ 但見 #2 |
| NC-3b | **XFF spoof 繞過** | 150/150 全 204，零 429 | 🟡 見 #4 |
| NC-3c | **冇 proxy header（直連）** | 全部撞同一 bucket，30 條被斬 | 🟠 見 #3 |
| NC-4 | store 整體完整性（395 行混住上面所有畸形輸入）| `unparseableRows: 0` | ✅ 新 writer 冇整爛行 |
| NC-5 | 前端 8 種降級（見 #10 個表）| 全部唔 throw、冇 unhandled rejection、值合 F1 spec | ✅ |
| NC-6 | `classify-devices.mjs` 空目錄 / 壞行 / 冇 `app-version.json` | 三種都 graceful，唔中斷 | ✅（但壞行冇 counter，見 #6）|
| **NC-7** | **restart merge 正控（最重要，執行者只做咗 code review）**：copy 真生產 `backend/logs/metrics/ops-metrics.json`（52KB、96 個 hourly bucket、`total.resolve` **冇** `failMs`、冇 `gauges`、冇 `deprecatedRouteHits`）落隔離目錄，行真 `enablePersistence()` 再即刻 call 三種新記帳 | `resolve.total = 23651`（**冇清零**）；`deprecatedRouteHits={"/api/audio":2}`；`failMs={count:1,sum:76000,max:76000,buckets.60to120s:1}`；`total` 同**每個** hourly bucket 都補齊 `failMs`/`gauges`/`deprecatedRouteHits` | ✅ **B4 個 `normalizeBucket` 深層 merge 係啱嘅，restart 唔會清零、sampler 賦值唔會 TypeError** |
| NC-8 | SIGTERM flush 蝕數窗口 | 0.3s → 50/50 全蝕；1.5s → 50/50 齊 | ⚪ 窗口 ≤1s，見 #12 |

> NC-7 特別重要：`opsMetrics.js:349` 個 sampler tick 同 `recordDeprecatedRouteHit`
> 全部包住 `try { … } catch (_) {}`，即係如果 `normalizeBucket` 補唔齊
> `b.gauges` / `b.deprecatedRouteHits` / `b.resolve.failMs`，會係**靜靜失敗**——
> 唔會炸 server，但三個新指標永遠係 0/null 而冇人知。用真生產檔測過就冚咗呢個窿。
> （執行者報告 §2.2 H-B5 對呢部分寫「代碼核對，冇 runtime 執行證明」，我補咗 runtime 證明。）

---

## 4. 部署風險評估

部署次序（同 ROOTCAUSE §W1 拍板一致）：**① backend restart（gate approve → dry-run
→ 真 restart → 15 分鐘 smoke）② OTA（同 sha）。restart 一定要行喺 OTA 之前。**

### 4.1 舊版 app（未收 OTA）打新 backend — 會唔會出錯？

**唔會。** 實證 NC-1 / NC-1b：三種舊格式 body（有 platform/deviceId 冇新三欄、
`clientTs` 係 epoch 數字、完全裸格式）全部 **204**，三個新欄寫 `""` 落 store。
429 對舊 app 一樣安全——舊 `logDiag`/`sendBeacon` 全部係 `fetch(...).catch(() => {})`，
429 係成功 resolve，唔會觸發任何重試或者錯誤路徑。

**反方向（如果次序搞錯，OTA 先於 restart）**：新前端打舊 backend →
舊白名單冇 `appVersion/updateId/sessionId` → 呢三個欄會被**靜靜丟掉**，request 照 204
唔會炸。即係唔會出事故，但**會蝕晒 W1 最核心嗰三個欄**，after 量度變空炮。
所以「restart 先」唔止係習慣，係實質要求。

### 4.2 restart 後 15 分鐘 smoke（具體 curl/grep）

```bash
cd /Users/macbookpro/.openclaw/workspace/hymn-app
TODAY=$(date -u +%F)

# ── S0（restart 之前先記低,做 S6 嘅對照）─────────────────────────
curl -s http://localhost:3001/api/audio/cache/warm-stats \
 | python3 -c "import json,sys;d=json.load(sys.stdin);print('BEFORE resolve.total =',d['total']['resolve']['total'])"

# ── S1 health ───────────────────────────────────────────────────
curl -s -o /dev/null -w 'health=%{http_code}\n' --max-time 5 http://localhost:3001/api/health   # 期望 200

# ── S2 白名單三個新欄真係收到（等 ≥2 秒先 grep：新版係 1 秒批量 flush,唔再係同步寫）──
curl -s -o /dev/null -w 'clientlog=%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d "{\"event\":\"smokeW1\",\"clientTs\":\"$(date -u +%FT%TZ)\",\"platform\":\"ios\",\"deviceId\":\"smokedev\",\"appVersion\":\"1.5.1\",\"updateId\":\"smoke-update\",\"sessionId\":\"smokesession01\"}" \
  http://localhost:3001/api/client-log      # 期望 204
sleep 2
grep -c '"sessionId":"smokesession01"' backend/logs/client-log/client-log-$TODAY.jsonl   # 期望 1

# ── S3 舊格式向後相容（模擬未收 OTA 嘅 build）────────────────────
curl -s -o /dev/null -w 'oldfmt=%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d "{\"event\":\"smokeOld\",\"clientTs\":$(date +%s)000}" http://localhost:3001/api/client-log   # 期望 204
sleep 2; grep -c '"event":"smokeOld"' backend/logs/client-log/client-log-$TODAY.jsonl    # 期望 1

# ── S4 節流正控（用假 XFF,唔會食到真用戶配額）──────────────────
for i in $(seq 1 125); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'Content-Type: application/json' \
    -H 'X-Forwarded-For: 203.0.113.77' \
    -d '{"event":"smokeRate","clientTs":"x","detail":"smoke"}' http://localhost:3001/api/client-log
done; echo
# 期望：頭 120 個 204,之後全部 429

# ── S5 410 stub 持久計數（DEAD-2）────────────────────────────────
curl -s -o /dev/null -w 'gone=%{http_code}\n' http://localhost:3001/api/search/all     # 期望 410
curl -s http://localhost:3001/api/audio/cache/warm-stats \
 | python3 -c "import json,sys;print('deprecatedRouteHits =',json.load(sys.stdin)['total']['deprecatedRouteHits'])"
# 期望 {"/api/search": 1}

# ── S6 ⚠️ 最重要：舊數冇清零(normalizeBucket 深層 merge)──────────
curl -s http://localhost:3001/api/audio/cache/warm-stats | python3 -c "
import json,sys; d=json.load(sys.stdin); t=d['total']
print('resolve.total =', t['resolve']['total'], '(要 >= S0 嗰個數,唔可以係 0)')
print('failMs key    =', 'failMs' in t['resolve'])          # 期望 True
print('gauges keys   =', list(t.get('gauges',{}).keys()))   # 期望 3 個 key(值 15 分鐘時仍然係 null = 正常)
print('deprecated    =', 'deprecatedRouteHits' in t)        # 期望 True
h=list(d['hourly'].values())[-1]
print('hourly 亦要補齊 =', 'gauges' in h and 'failMs' in h['resolve'])   # 期望 True
"

# ── S7 冇新錯誤 ─────────────────────────────────────────────────
grep -c '\[client-log-store\] 批量寫入失敗' /tmp/hymn_backend.log    # 期望 0
grep -c '\[client-log-store\] 初始化目錄失敗' /tmp/hymn_backend.log  # 期望 0
grep -c 'ops-metrics:主檔同 .bak 都救唔返' /tmp/hymn_backend.log     # 期望 0

# ── S8 播放線冇被 restart 整親（呢波唔應該掂到,但 restart 本身有風險）──
curl -s -o /dev/null -w 'stream=%{http_code} t=%{time_total}\n' -r 0-1023 \
  http://localhost:3001/api/stream/<一首熱歌 id>     # 期望 206
```

**S6 係唯一一條唔過就要即刻 rollback 嘅**：如果 `resolve.total` 變返 0，代表
`normalizeBucket` 出事，一日嘅 ops 數會靜靜哋冚。我已經用**真生產檔副本**驗過
（NC-7，23651 完整保留），所以預期會過。

**⚠️ 唔好誤判**：`total.gauges` 三個值喺 15 分鐘 smoke 嗰陣**一定仲係 `null`**——
`opsMetrics.js:44 SUMMARY_EVERY_MS = 30 * 60 * 1000`，sampler 30 分鐘先 tick 一次。
要 **restart 後 35 分鐘**再 check 一次 S6，嗰陣先應該見到
`{failCacheSize: <n>, playlistCacheSize: <n>, clientLogRateMapSize: <n>}` 有數。
呢條要寫入 smoke 清單，唔係「15 分鐘見到 null 就當 fail」。

### 4.3 OTA 之後嘅 after 量度（對照 ROOTCAUSE §W1「after 量法」）

**開始之前必做（二選一，見問題 #2/#3）**：加 429 counter，或者
`CLIENT_LOG_RATE_MAX=2000` restart 一次。**唔做嘅話，兩部模擬器 + Eric 真機共用同一個
公網 IP 撞 120/min，被斬走嘅 beacon 冇任何訊號，after 分母係假嘅。**

**iOS sim（1C 方法，S1×3 + S3）** — 要量：

| 指標 | before | after 要求 |
|---|---|---|
| 15 次 tab tap 收到幾多條 `perfNav` | **10**（1C 限制#6,舊 cap）| **15**（cap 已升 40）+ 撞唔到 cap 所以**唔應該**見到 `navBeaconCapped` |
| 逐種 event 五欄齊唔齊 | `nextTrackMs`/`prefetchFail`/native 系列冇 platform/deviceId | **每一種 event 逐條核**（§W1 明文「唔准抽樣」）：`platform`+`deviceId`+`appVersion`+`updateId`+`sessionId` 五欄全部非空 |
| `sessionId` 分組 | 唔存在 | 同一次冷開嘅所有 event `sessionId` 一致；重開 app 換新值 |
| `updateId` | 唔存在 | 非 `"dev"`/`"embedded"`，係真 UUID → **呢個就係之後每一波嘅 before/after 切分維度** |
| `prefetchFail`（N-6） | 淨 `tooSmall=<n>` | 要見到 `bytes=/min=/dur=/ct=` 四個欄；驗一次「真短歌」同一次「錯誤頁」分得開 |
| `wallClockDrift`（N-7） | 只有 `driftMs=` | 有 `bgMs=`；**但見問題 #5**——量到嘅數要當「未定論」，唔好即刻拿去做 N-7 嘅結論 |
| `syncUnknownOp`/`outboxLong` | 零 | 至少人工造一次驗 fire 到（harness 已驗，真機補一次）|

**Android AVD** 同一套（**由 1B 嗰條線嘅 agent 做，唔好撞**——AVD `hymntest` 而家有人用緊）。

**24 小時之後**：
```bash
python3 - <<'PY'
import json,glob
rows=[json.loads(l) for f in glob.glob('backend/logs/client-log/client-log-2026-09-0[6-9].jsonl')
      for l in open(f) if l.strip()]
n=len(rows)
print('rows', n)
for k in ('platform','deviceId','sessionId','appVersion','updateId'):
    print(k, sum(1 for r in rows if r.get(k)), '/', n)
PY
```
before = `platform` 970/2649（37%，1E §1）。**after 只可以睇 09-06 之後嘅新檔**
（舊檔嗰批結構上就冇呢個欄，撈埋一齊計會永遠拉低分母 → 就係報告 H-B6 撞到嗰種
窗口混淆）。目標：新檔五個欄全部接近 100%。

**`classify-devices.mjs` 重跑**：要先修問題 #6 加 `--since` 先有可比性；
否則會好似 H-B6 咁再一次「規則一樣、窗口唔一樣、數字對唔到」。

### 4.4 Rollback

- backend：`ops/deploy/approve.sh backend 17ed1bc --confirm` + restart 返舊 sha。
  兩個新 env override 冇設就等於冇存在過,`clientLogStore.js` 舊版會照讀返同一個目錄
  ——**jsonl 檔格式向前向後都相容**（多咗三個欄嘅舊行,舊 code 一樣讀得）。
- 前端：`ops/deploy/ota-rollback.sh`（memory `project-ota-rollback-plan`,publish 有記
  group id）。
- **兩邊獨立**：新 backend + 舊 app = 安全（§4.1 實證）；舊 backend + 新 app = 蝕三個欄
  但唔會炸。即係 rollback 任何一邊都唔會出事故。

---

## 5. 我對 live 系統做過嘅嘢（完整披露）

只有四次唯讀/無害 call，冇 restart、冇寫任何生產檔：

```bash
curl -s -m 5 http://localhost:3001/api/health                          # 200
curl -s -m 5 http://localhost:3001/api/audio/cache/warm-stats          # 讀 ops-metrics(確認 live 仍然係舊 code)
curl -s -m 5 -X POST … -d '{"event":"opusVerifyProbe",…}' /api/client-log   # 204,一條 beacon
```
（`opusVerifyProbe` 呢條 beacon 會出現喺 `backend/logs/client-log/client-log-2026-09-05.jsonl`,
`detail="opus-w1-verify readonly probe"`,**做 after 分析嗰陣要剔走**。）

`backend/logs/metrics/ops-metrics.json` 我只 `cp` 咗一份出 scratch,原檔 mtime/size
前後一樣（52432 bytes）。NC-7 個 `enablePersistence()` 係喺 scratch 副本嘅
`opsMetrics.js` 上面跑（`__dirname/../logs/metrics` 天然指返 scratch）,冇寫過真檔。
