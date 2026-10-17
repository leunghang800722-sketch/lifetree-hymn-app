# PERF Stage 2 執行單 2026-09-02（Fable 5.1 出，Sonnet 5 執行，Opus 5 驗收）

Baseline：`PERF-BASELINE-1A-20260902.md`、`PERF-BASELINE-1B-20260902.md`，raw `ops/perf/baseline-20260902/`。
儀器：`frontend/hymn-app/src/perfMarks.js`（commit 0ad1a3f），改前改後**同一儀器**。

## 0. 共同鐵律
- 共用 worktree：每次改檔前 `git status --short <file>`；commit 一律 `git commit -m … -- <paths>`（`--` 放最後）；撞 `.git/*.lock` 先 `pgrep -x git`，冇 process 而 lock 舊過 10 分鐘先可刪。
- **唔准部署**（backend restart / OTA）——Eric 真機 HLS QA 進行緊。所有 backend 驗證用本機方法（見 2A）。
- **唔准掂 PlayerProvider 入面起播/stall/nudge/watchdog/HLS 邏輯**；2B 唯一准掂 PlayerProvider 嘅位係 return 嗰個 `<PlayerCtx.Provider value={{…}}>`（加 useMemo）。
- 證據表制：每項改動要「改前數字 → 改後數字」同一指令/同一儀器，附 raw 檔（`ops/perf/stage2-20260902/`）。執行者唔判 PASS/FAIL。「零 X」要 positive control。
- 唔准擴大用戶可觸及嘅本地音訊副本。
- 模擬器：只有 2B 用，一部 iPhone 17（E0416618-…），開工 touch `/tmp/claude-ios-cleanup.hold`，收工 rm + shutdown。Release build，Expo.plist `EXUpdatesCheckOnLaunch=NEVER` patched copy。

## 1. Baseline 講咗乜（排優先次序嘅依據）
| # | 數字 | 出處 |
|---|---|---|
| B1 | 冷開無 cache：全量 /api/hymns 喺模擬器 10.3–11.6s，5 次有 3 次撞 8s timeout→retry（理論最差 16s+） | 1B S1 |
| B2 | 熱開：MMKV 讀 18ms + parse 19ms（唔係瓶頸）；首頁有內容 mount 938ms vs spinner 261ms | 1B S2 |
| B3 | 三個 tab 開機全 mount；播歌 1 分鐘 Home/Library/Mine/Mini/TabBar/AppContent 同步 4→8 次 render | 1B S5 |
| B4 | prod 每個 request 地板 ~0.75s（/api/health ttfb 0.77s，tunnel RTT） | 1A A1 |
| B5 | /api/hymns 5.57MB（lyrics 1.33MB=24%），origin 冇 compression，CF edge 先 gzip 到 1.47MB；server 側 SELECT+getAsObject 129ms/req | 1A A1/A2 |
| B6 | /api/search、/api/category 前端零引用，每 request 重開 61MB DB；/api/category/mandarin 35MB/21–33s；1A curl 5 次令 backend RSS 360→736MB（之後 GC 返 94MB） | 1A A2/A4 |
| B7 | backend 冇 access log，/api/version /health /app-version 完全冇 log | 1B S6 |

## 2A backend（Sonnet 5，唔使模擬器）
**驗證環境**：讀 `backend/server.js` 搵有冇 env 可以關 precache / keep-warm / 背景 job（例如 `URL_KEEPWARM=0`、precache 相關 flag）。**只有**全部背景 burst 都關得掉先可以喺 port 3002 起第二個 instance 做量度（`PORT=3002 URL_KEEPWARM=0 … node server.js`，收工必殺）；否則用 supertest/直接 import route handler 嘅方式量。唔准動 3001 嗰個 live process。

| 項 | 改動 | 量度（改前→改後） |
|---|---|---|
| A-1 | `/api/hymns` response cache：以 `getDataVersion()` 做 key，快取 `JSON.stringify` 完嘅 string（同 kids/real_lang 墊一齊算），`reloadDb()` 時清；`res.set('Content-Type','application/json')` 直出 string | local total ms ×5（1A 係 85–140ms）；正控：admin 寫入 / reloadDb 後 dataVersion 變、cache miss 一次 |
| A-2 | Express `compression`（加入 backend/package.json，`npm i compression`）；只對 JSON route 生效：用 `filter` 排除 `/api/stream`、`/api/hls`、`/api/audio`、`/app.apk`、`/downloads`；threshold 1KB | 本機 `curl -H 'Accept-Encoding: gzip'` /api/hymns size（5.57MB→?）+ total ms；確認 /api/stream/42 -r 0-1023 仍 206 無 content-encoding、/api/hls/42.m3u8 header 不變 |
| A-3 | 輕量 access log middleware：只記 `/api/*` 但排除 `/api/stream`、`/api/hls`、`/api/client-log`（呢三條已有自己 log）；一行 `[access] ts method path status ms bytes`；寫 stdout（launchd 已導去 /tmp/hymn_backend.log） | 正控：本機打 /api/version 見到一行；打 /api/stream 唔見 |
| A-4 | `/api/search` `/api/category` `/api/audio` `/api/home` 除 daily-verse 外 9 條：**唔刪檔**（Stage 3 做），先將 route handler 改成 `410 Gone` + `[deprecated-route]` log 一行，並且**唔再**每 request 重開 DB（search/category 嘅 inline queryDb 整段唔再執行） | 本機 `/api/category/mandarin` 改前 35MB/秒級 → 改後 410/ms 級；node RSS 打 5 次前後對比（改前 1A 見 +400MB） |
| A-5 | `Cache-Control`：`/api/hymns` `private, max-age=0, must-revalidate` + 保留 ETag；`/api/version` `no-cache`；純記錄唔期望 CF HIT | header diff |
| A-6 | （設計，唔實作）`/api/hymns?lite=1`（無 lyrics）+ `/api/hymns/lyrics`：寫成 §A-6 提案，估算 bytes（1A 欄位表已有），等 2B 診斷結果先決定做唔做 | — |

產出：commit（pathspec-only，一項一 commit）、`PERF-STAGE2-2A-20260902.md` 證據表、raw 喺 `ops/perf/stage2-20260902/2a-*`。`ops/deploy/backend-restart.sh --dry-run` 走一次證明 gate 過得（唔真推）。

## 2B frontend（Sonnet 5，獨佔模擬器）
**次序：先診斷再改，每輪 Release build 一次（約 4 分鐘）。**

| 項 | 改動 | 量度 |
|---|---|---|
| D-1 診斷 | perfMarks 加細 mark：`/api/hymns` fetch 分 `hymnsTtfb`（headers 到）、`hymnsBody`（`r.text()` 完）、`hymnsParse`（`JSON.parse` 完）——注意要改 useCachedHymns 由 `r.json()` 變 `r.text()`+`JSON.parse`（行為不變）；HomeScreen 每個 section 嘅 compute 用 `span()`（dailyPick / chips / hasAlbum filter 等）記時長 | S1 冷開 3 run：三段各佔幾多；S2 熱開 3 run：section 時長表 |
| F-1 | `fetchWithTimeout` 對全量 `/api/hymns` 用 30s（/api/version 保持 8s）；retry 邏輯不變 | S1 冷開 5 run：hymnsMs 完成率（改前 2/5）同 median |
| F-2 | `PlayerCtx.Provider value` 用 `useMemo`，deps 列齊所有 value 入面嘅 state/函數（函數用 useCallback 或者 ref 穩定化——**只准包裝，唔准改函數內容**）；改前先 `git diff --stat -- App.js` 確認冇其他 session 未 commit 改動 | S5 播歌 60s perfRenders：六個 component 各自次數（改前全部 8）；S2 熱開 t=15 次數 |
| F-3 | 首頁 warm mount 938ms：按 D-1 section 時長表，對 compute-bound 嘅 section 加 `useMemo`（deps=hymns）/ 對純展示 section 加 `React.memo`；**唔改任何抽歌邏輯/結果** | S2 熱開 5 run `home` mark（改前 median 938ms）；正控：改後首頁截圖同改前同一日嘅「今日為你預備」內容一樣（dailyPick seeded） |
| F-4 | Library / Mine lazy mount：首次撳先 mount，之後 keep-mount（保留現有 display:none 切換行為）；**如果 D-1 顯示兩個 hidden tab 嘅開機 render 成本 <50ms 就唔做，寫明** | S2 `home`/`cont` mark；S3 首次撳 Library/Mine tapToPaint（改前 ~98ms，預期會升，要如實記） |
| F-5 | 只喺 A-6 拍板後做：lite + lyrics 拆 fetch | — |

產出：commit（pathspec-only，一項一 commit）、`PERF-STAGE2-2B-20260902.md` 證據表（每項改前→改後）、raw `ops/perf/stage2-20260902/2b-*`、screenshots。每次 build 記 `git rev-parse HEAD`。

## 3. Opus 5 驗收（baseline + Stage 2）
- Baseline 驗收先行（桌面覆核 + backend 數字 spot re-run，唔用模擬器）：`PERF-BASELINE-OPUS-20260902.md`。
- Stage 2 每份 2A/2B 證據表出咗即驗。

## 4. Addendum（Opus 5 baseline 驗收後，Fable 5.1 2026-09-02 16:05）
- §1 B1 更正：10.3–11.6s = 8s timeout 白燒 + 真 fetch 2.3–3.6s；第一次嘗試 5/5 撞 timeout。B6 更正：RSS 736MB 係 search+category 壓測尖峰，非穩態。
- F-1 改法：headers 8s 內未到照 abort（保留斷網偵測），headers 到咗 body 另俾 30s；D-1 mark 逐次嘗試記；beacon 窗口 25s。指標=第一次嘗試成功率（改前 0/5）。
- F-2 降級診斷：批准 PlayerProvider 第一行加 `useRenderCount('PlayerProvider')`；AppContent>PlayerProvider 就改 React.memo 包 screens，唔做 useMemo。排最後。
- F-4 只做 Library（hidden 首 render 174–178ms；Mine 1ms）。
- 量度紀律：wall-clock 對比一律 A/B 交錯量、報時段；穩定指標=bytes / server ms / render 次數 / mark 相對差。
- A-4 部署保留：410 stub 已 commit（ebe29ba），但 Opus 建議 access log 跑滿一日真流量先出街；部署次序由 Fable 5.1 喺 restart 窗口決定。
- **16:40 再更正**：Opus §4c「第一次嘗試 5/5 撞 8s timeout」被 2B 實測推翻（見 PERF-BASELINE-OPUS 尾段附註）；baseline 10.3/11.6s 係真單次 fetch，瓶頸=傳輸 bytes，F-1 屬安全修正。
