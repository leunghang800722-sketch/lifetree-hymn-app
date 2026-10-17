# W3 執行單 — 死碼清理（C10 提前，兩段式）2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。驗收：Opus 5。Eric 原話：「把無用嘅 code 拎走」。原則：**每一項刪除要有證據，唔可以靠估**；第一段只出證據冊，Fable 批咗先入第二段刪。
輸入：`DEEP-AUDIT-1A-FRONTEND-20260906.md` §dead code（12 項）+ 三份子報告嘅 dead 表（scratch 已併入 1A）、`DEEP-AUDIT-1D-BACKEND-20260906.md` §3 dead code（F5/F8/410 stub/DEAD-2）、`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C10/§W7/§4 N-2、`PERF-FINAL-REPORT-20260902.md`（09-02 已刪 29 檔 6,101 行——唔好重覆數）。

## 0. 紅線
- 🔴 HLS 樹（`HLS_ENABLED`/`isHlsUrl`/`hlsFallback`/`hlsDowngradedTrackRef`/`routes/hls.js`/`lib/hlsPlaylist.js`）**一個字唔准刪**（ROOTCAUSE V-1：現役單機 gate）。
- 🔴 `addedToList` icon 係「設計咗未接線」（D-3 等 Eric），唔係死碼，唔准刪。
- 🔴 410 stub 四檔（`routes/category.js`/`search.js`/`audio.js`/`home.js`）要 `deprecatedRouteHits` 由 09-06 02:43 起 7 日零命中先刪 → **本波唔刪**，只入證據冊標「等 09-13」。
- 🔴 唔掂 PlayerProvider 起播/stall/watchdog 邏輯；「未 fire 過嘅 beacon/handler」唔等於死碼（要分「路徑存在但未觸發」vs「無人引用」）。
- 🔴 N-2：11 個 `backfillAlbumFrom*Catalog.js` 係一次性 CLI，**唔抽共用亦唔刪**（除非證明檔案本身冇任何入口）。
- 🔴 `git rm` + pathspec commit；唔准 `git clean`、`git add -A`；唔夾帶其他 session 髒檔；唔部署。

## 1. 第一段：證據冊（唔改任何 source）
產出 `DEEP-AUDIT-W3-DEADCODE-REGISTER-20260906.md`，每項一行：

| ID | 檔:行 / 檔案 | 類型 | 靜態證據 | 運行時證據 | 歷史（git log -S / blame：幾時變死、點解） | 風險 | 建議（刪 / 留 / 等） |

### 1.1 掃描器（要自己寫，放 `ops/perf/deadcode/`，每個都要正控）
| # | 掃描器 | 範圍 | 正控 |
|---|---|---|---|
| S1 | 前端 import graph：由 `frontend/hymn-app/index.js` + `App.js` 起 resolve 所有 `import`/`require`（含 `.js/.jsx/.ts`、`Platform` 檔名後綴、asset），輸出 **unreachable 檔** | `frontend/hymn-app/src/**`、`assets/**`、`plugins/**`（plugin 入口係 `app.json` plugins，要另計） | 隨機揀 3 個已知被引用嘅檔，證明 graph 見到佢哋 |
| S2 | 前端 unused export：每個 module 嘅 named/default export，全 repo（排除 node_modules）grep import 位置；「export 但只內部用」同「零引用」分開標 | `src/**` | 揀 1A 已列嘅 `elapsedSinceT0`（已知零引用）+ 一個已知有用嘅 export |
| S3 | icon/asset：`odeIcons.js` 每個 key 嘅 `<OdeIcon name=`/`icon:` 引用；`assets/` 每個檔嘅 require 引用 | | 已知有用 icon（例如 `close`）要命中 |
| S4 | 依賴：`package.json` 每個 dependency 嘅 import/require 命中 + `app.json` plugins + `babel.config`/`metro.config` + config plugin `require`；**逐個** depcheck 假陽性人手核（1A DEP-003 expo-font 係假陽性範本） | `frontend/hymn-app/package.json` | expo-font 要被判「有用」 |
| S5 | backend route/handler：`server.js` mount 表 × 前端 `API_BASE` 打嘅 path（grep `/api/` 字串）× `[access]` log 7 日命中（`/tmp/hymn_backend.log` 只有 restart 後，另用 `backend/logs/` 有嘅）× `deprecatedRouteHits` | `backend/routes/**`、`server.js` inline route | 一個已知熱路（`/api/hymns`）要三方都命中 |
| S6 | backend lib export：同 S2 | `backend/lib/**` | |
| S7 | backend scripts 入口：每個 `backend/scripts/*.js`/`ops/**/*.{sh,mjs,py}` 有冇被 (a) 12 個 `~/Library/LaunchAgents/com.hymn*.plist` (b) 其他 script (c) `package.json` scripts (d) 文件（`*.md` 只算「有記錄」唔算入口）引用；標「排程」「人手 CLI」「零入口」 | | growLibrary.js 要被判「排程」 |
| S8 | 死分支：1A APP-003（`opts.browseTap`/`appendAutoplayTail` 唯一 caller 唔傳 opts）、AVATAR-001、`useAuth() \|\| {}` 類——每個要引 caller 行號證明 | | |
| S9 | 資料/產物檔：`backend/data/hymns.db`（F5 0 bytes）、`backend/public/**` 未被 route/前端引用嘅檔、`ops/perf/**` 舊 baseline 目錄（**呢類只列唔刪**，Fable 決定） | | |

### 1.2 每項要答嘅三個問題
1. 靜態：邊個掃描器、零引用定「export 但只內部用」（後者唔係死碼，只係 export 多咗——標 P3 收窄 export，唔算刪碼）。
2. 運行時：route → log 命中；script → plist/入口；beacon/handler → 「有 caller 但條件永遠 false」要引 code 證明（例如 W1/W2 memory 記過 native ETA veto 永遠 false）。
3. 歷史：`git log -S'<symbol>' --oneline | tail -3` 搵最後一次有引用嘅 commit，寫一句點解變死（刪剩 / 改用新實作 / 從未接線）。

### 1.3 統計
每類（前端檔 / export / icon / 依賴 / backend route / lib / script / 資料）：候選數、建議刪數、估計行數。09-02 已刪嘅唔准重數。

## 2. 第二段（Fable 批證據冊後先開）
- 按證據冊「刪」項逐項 `git rm` / 刪 code，**每類一個 commit**（前端檔、前端 export/icon、依賴、backend）。
- before/after：`git diff --shortstat` 行數；前端 bundle（`npx expo export --platform ios --dev false` 出 `main.jsbundle` bytes，1C before = 3,740,962 B；Android Hermes bytecode 1B before = 3,704,740 B）；`node --check` + module import 全過；前端 harness（W1 嘅 `ops/perf/harness/w1/frontend-harness.mjs`）重跑要過；backend harness（W1/W2）重跑要過。
- 報告 `DEEP-AUDIT-W3-DEADCODE-REPORT-20260906.md`。
