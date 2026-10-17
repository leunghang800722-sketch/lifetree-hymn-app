# PERF-BASELINE-1A-20260902 — backend / bundle / 靜態盤點

執行者：Sonnet 5（Stage 1A，唔用模擬器）。範圍：PERF-IMPROVEMENT-PLAN-20260902.md §Stage 1A。
本檔淨係列數字同觀察，唔判 PASS/FAIL——「Opus5判定」一欄留白。

Raw 證據全部喺 `ops/perf/baseline-20260902/`（檔名與下表「raw 檔」對應，路徑省咗前綴）。

**⚠️ 共用 worktree 聲明**：執行期間 `git status` 見到 `frontend/hymn-app/App.js`、`index.js`、
`src/components/home/HomeScreen.js`、`src/hooks/useCachedHymns.js`、`src/screens/LibraryScreen.js`、
`src/screens/MineScreen.js` 已被改動（+56/-1 行）,以及新增未 track 嘅 `src/perfMarks.js`——呢啲
改動全部帶 `PERF-BASELINE-1B-20260902` comment tag,確認係並行嘅 Stage 1B（iOS 模擬器 runtime）
session 做嘅,**唔係本次 1A 工作**。1A 全程冇寫過任何 repo source file(下面 A2 用嘅 DB 係複製
去 scratchpad 先讀,A1/A3/A4 全部係 curl/grep/depcheck/node 讀取)。收工前 `git status --short |
grep -v '^??'` 結果同開工時對比,新增嘅 M 行全部係上述六個 1B 檔案,冇其他。

---

## A1. Backend endpoint 延遲 / payload

指令：`curl -s -o /dev/null -D - -w 'code=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}\n' <url>`（stream 加 `-r 0-1023`；prod_gzip 加 `-H 'Accept-Encoding: gzip'`），每個 endpoint × 每個 target 跑 5 次。
Timestamp：2026-09-02T07:11:14Z – 07:24:23Z。
Raw：`1a-a1-endpoint-latency.log`（原始 curl 輸出）、`1a-a1-parsed.json`（結構化）、parser：scratchpad `parse_a1.py`。
Warm HLS/stream 用 id=42（youtube_id=PG_J_0gsMXA，喺 `backend/cache/resolve-cache.json` 已有 URL cache，喺 `backend/data/warm-daily.json` keepWarm 名單內，做正控保證量到「warm」情境而非 cold resolve）。

| endpoint | target | code | ttfb min/med/max (s) | total min/med/max (s) | size (B, run1) | content-encoding | cache-control | cf-cache-status |
|---|---|---|---|---|---|---|---|---|
| /api/health | local | 200 | 0.001/0.001/0.001 | 0.001/0.001/0.001 | 15 | - | - | - |
| /api/health | prod | 200 | 0.765/0.776/0.957 | 0.766/0.776/0.957 | 15 | - | - | DYNAMIC |
| /api/health | prod+gzip | 200 | 0.754/0.772/0.779 | 0.754/0.772/0.780 | 15 | - | - | DYNAMIC |
| /api/version | local | 200 | 0.001/0.001/0.001 | 0.001/0.001/0.002 | 43 | - | - | - |
| /api/version | prod | 200 | 0.750/0.772/0.801 | 0.751/0.772/0.801 | 43 | - | - | DYNAMIC |
| /api/hymns | local | 200 | 0.083/0.087/0.138 | 0.085/0.089/0.140 | 5,567,646 | - | - | - |
| /api/hymns | prod | 200 | 0.893/0.906/0.918 | 2.526/2.837/3.039 | 5,567,646 | - | - | DYNAMIC |
| /api/hymns | prod+gzip | 200 | 0.879/0.890/0.962 | 2.159/2.333/2.736 | 1,471,654 | gzip | - | DYNAMIC |
| /api/home/daily-quote | local | 200 | 0.012/0.014/0.017 | 0.012/0.014/0.017 | 40 | - | - | - |
| /api/home/daily-quote | prod | 200 | 0.777/0.785/0.807 | 0.777/0.785/0.808 | 40 | - | - | DYNAMIC |
| /api/home/daily-verse | local | 200 | 0.001/0.001/0.003 | 0.001/0.001/0.003 | 185 | - | - | - |
| /api/home/daily-verse | prod | 200 | 0.750/0.766/0.802 | 0.750/0.767/0.802 | 185 | - | - | DYNAMIC |
| /api/home/featured-artist | local | 200 | 0.008/0.014/0.036 | 0.008/0.014/0.036 | 3,040* | - | - | - |
| /api/home/featured-artist | prod | 200 | 0.798/0.803/0.808 | 0.799/1.359/1.528 | 119,876* | - | - | DYNAMIC |
| /api/home/new-releases | local | 200 | 0.030/0.031/0.048 | 0.030/0.031/0.048 | 36,077 | - | - | - |
| /api/home/new-releases | prod | 200 | 0.808/0.874/0.913 | 1.069/1.145/1.170 | 36,077 | - | - | DYNAMIC |
| /api/home/genre-recommendation | local | 200 | 0.008/0.017/0.018 | 0.008/0.017/0.018 | 82,495* | - | - | - |
| /api/home/genre-recommendation | prod | 200 | 0.778/0.782/0.788 | 1.160/1.216/1.314 | 69,042* | - | - | DYNAMIC |
| /api/home/based-on-taste | local | 200 | 0.011/0.016/0.018 | 0.011/0.016/0.019 | 86,252* | - | - | - |
| /api/home/based-on-taste | prod | 200 | 0.759/0.793/0.829 | 1.188/1.190/1.426 | 148,937* | - | - | DYNAMIC |
| /api/home/resonating | local/prod | 200 | 0.007-0.022 | 0.007-0.022 (local) / 0.80-0.84 (prod) | 10,007 | - | - | DYNAMIC |
| /api/home/top-verses | local/prod | 200 | 0.011-0.013 | 同上量級 | 10,007 | - | - | DYNAMIC |
| /api/home/folk-sharing | local/prod | 200 | 0.012-0.014 | 同上量級 | 2 (空陣列) | - | - | DYNAMIC |
| /api/home/combined-charts | local/prod | 200 | 0.008-0.095 | 同上量級 | 10,007 | - | - | DYNAMIC |
| /api/search/all?q=恩典 | local | 200 | 0.129/0.161/0.249 | 0.136/0.164/0.253 | 465,985 | - | - | - |
| /api/search/all?q=恩典 | prod | 200 | 0.851/0.921/1.077 | 1.827/1.852/1.998 | 465,985 | - | - | DYNAMIC |
| /api/search/all?q=grace | local | 200 | 0.113/0.149/0.317 | 0.114/0.150/0.318 | 498,995 | - | - | - |
| /api/search/all?q=grace | prod | 200 | 0.913/0.965/0.995 | 1.921/1.941/2.071 | 498,995 | - | - | DYNAMIC |
| **/api/category/mandarin** | local | 200 | 2.179/2.394/2.953 | 2.440/2.524/3.179 | **35,145,812** | - | - | - |
| **/api/category/mandarin** | prod | 200 | 1.236/3.797/6.814 | **21.045/21.673/32.989** | 35,145,812 | - | - | DYNAMIC |
| /api/category/mandarin | prod+gzip | 200 | 1.102/1.113/1.696 | 19.163/38.322/73.580 | 5,680,020 | gzip | - | DYNAMIC |
| **/api/category/cantonese** | local | 200 | 0.136/0.139/0.218 | 0.143/0.146/0.223 | **15,971,383** | - | - | - |
| **/api/category/cantonese** | prod | 200 | 0.933/0.975/1.062 | **16.418/23.956/29.462** | 15,971,383 | - | - | DYNAMIC |
| /api/hls/42.m3u8 (warm) | local | 200 | 0.001/0.001/0.002 | 0.001/0.001/0.002 | 2,301 | - | no-store | - |
| /api/hls/42.m3u8 (warm) | prod | 200 | 0.752/0.767/0.985 | 0.752/0.768/0.985 | 2,301 | - | no-store | DYNAMIC |
| /api/stream/42 (range 0-1023, warm) | local | 206 | 0.184/0.192/0.602 | 0.184/0.192/0.602 | 1,024 | - | - | - |
| /api/stream/42 (range 0-1023, warm) | prod | 206 | 0.930/0.941/1.095 | 0.930/0.942/1.095 | 1,024 | - | - | DYNAMIC |

\* home 嘅 5 條 `ORDER BY RANDOM()` route（featured-artist/genre-recommendation/based-on-taste）每次真係隨機揀唔同 artist/10 首,local 同 prod 跑嘅唔係同一批隨機結果,size 唔可比,純粹反映「呢類 route 每次 payload 大細會浮動」。完整 raw 逐 run 數字見 `1a-a1-parsed.json`。

**Cache 觀察**：57 個 (endpoint×target) 組合入面，`cf-cache-status` 全部係 `DYNAMIC`，冇一個 `HIT`；除 `/api/hls/*.m3u8`(`no-store`) 外，其餘全部冇 `cache-control` header；`content-encoding: gzip` 只喺 client 帶 `Accept-Encoding: gzip` 先出現（Cloudflare edge 按 request 動態壓，origin 本身冇 compression middleware）。

**/api/hymns 欄位級 byte 拆解**（單次 fetch，local，2026-09-02T07:26:58Z，raw：`1a-a1-hymns-column-breakdown.log`）：

| 欄位 | bytes（近似，含 JSON escaping） | % of payload |
|---|---|---|
| lyrics | 1,327,724 | 23.85% |
| title | 347,057 | 6.23% |
| display_title | 311,080 | 5.59% |
| created_at | 217,770 | 3.91% |
| youtube_id | 166,530 | 2.99% |
| performer | 120,473 | 2.16% |
| artist | 108,323 | 1.95% |
| duration | 108,179 | 1.94% |
| album | 105,373 | 1.89% |
| instrumental | 102,480 | 1.84% |
| real_lang | 102,480 | 1.84% |
| view_count | 89,670 | 1.61% |
| org | 89,083 | 1.60% |
| title_en | 84,093 | 1.51% |
| lang / tags | 各 70,455 | 各 1.27% |
| id | 57,115 | 1.03% |
| kids | 51,240 | 0.92% |

總 6,405 首，5,387 首（84.1%）有非空 lyrics，平均長度 214.5 字元（server.js 註解寫「只有 ~10 首有歌詞」——已核實過時）。最長 10 首 lyrics 見 raw log（最長 1,812 字元，id=1512）。

---

## A2. Backend process / DB 載入成本

指令：`ps -o pid,rss,vsz,etime,%cpu -p <pid>`。Timestamp：2026-09-02T07:14:45Z。
Raw：`1a-a2-process-snapshot.log`。

| 項目 | 數字 |
|---|---|
| PID | 14704 |
| RSS | 753,696 KB（≈736 MB） |
| VSZ | 453,853,760 KB |
| ELAPSED（uptime） | 15:34:45（約 15.6 小時） |
| %CPU（瞬時） | 0.0 |

**DB 載入/查詢/序列化計時**（用 hymns.db 嘅**複製**喺 scratchpad 度、獨立 node process 讀，唔經 backend/db.js，5 次跑），跟 server.js `/api/hymns` 嘅完全同一條 SELECT（含 ORDER BY id、17 個欄位）。指令/腳本：scratchpad `a2_dbload.mjs`。Timestamp：2026-09-02T07:15:31Z。Raw：`1a-a2-dbload-timing.log`。

| 步驟 | min (ms) | median (ms) | max (ms) |
|---|---|---|---|
| DB 檔讀入 + `new SQL.Database()`（wasm 已預熱後） | 6.93 | 7.56 | 21.28（第一次冷跑） |
| SELECT 17 欄 × 6,405 行 + `getAsObject()` | 97.34 | 129.10 | 157.88 |
| `JSON.stringify()` | 7.34 | 12.20 | 19.34 |

單獨一次 `initSqlJs()`（wasm 初始化）令 node process RSS 由 49.0MB → 53.2MB；5 輪 DB load+query+stringify 之後 RSS 升到 296.3MB（單一 node process、冇釋放，5,433,117 bytes 嘅 JSON 每輪都留喺記憶體）。

**DB 分層事實（讀 backend/db.js + lib/serverDb.js + server.js，唔跑）**：
- `backend/db.js`（舊，CommonJS）：`initDb()` 每次都無條件 call `saveDb()`（`db.export()` + `fs.writeFileSync` 寫返成個 61MB 檔），即係**呢個模組一初始化就寫一次全檔**——本次任務明文禁止跑呢個函數，冇實測寫入耗時。
- `backend/lib/serverDb.js`（現用，ESM singleton）：`getDb()` lazy-load、`dbPromise` 快取，一次 process 生命週期入面淨係讀一次碟（`reloadDb()` 俾 admin 寫入後手動清）。`/api/hymns`、`routes/home.js`、`routes/me.js`、`routes/admin.js`、`lib/adminHymns.js` 共用呢一份。
- `backend/routes/search.js` 同 `backend/routes/category.js` **各自有獨立嘅 `queryDb()`**，每次 request 都 `initSqlJs()` + `fs.readFileSync(DB_PATH)` + `new SQL.Database()`，完全冇快取，唔經 serverDb.js 嗰份 singleton——即係呢兩個 route 嘅每一個 GET 都重新開一次成個 61MB DB 檔。
- `server.js` 開機仲有第三個獨立讀 DB 位（precache 區塊，`initSqlJs()` + `fs.readFileSync(DB_PATH)`），一次性（開機跑一次），唔喺 request path。

**ops-metrics 24 小時 sample**（`backend/logs/metrics/ops-metrics.json`，since=2026-08-23T01:33:28Z，最近 24 個 hourly bucket：2026-08-29T16 – 2026-09-02T15）：

| 指標 | min | max |
|---|---|---|
| `bufferCache.rssKb`（`process.memoryUsage().rss/1024`，每 30 分鐘 sample 一次） | 29,712 KB（≈29MB） | 366,032 KB（≈358MB） |
| `bufferCache.totalBytes`（記憶體 warm buffer 實際佔用） | 0 | 133,910,223（≈128MB，貼近 128MB cap） |

（rssKb 係 live 計嘅，`server.js:314-318` `enableOpsMetrics({ sampler: ... rssKb: process.memoryUsage().rss/1024 })`，唔係死欄位；min 29MB 對應某次剛重啟後嘅低點，同而家實測嘅 736MB 唔係同一個 process 生命週期。）

---

## A3. JS bundle

### Export 方法

`npx expo export --platform ios --output-dir <scratch> --source-maps`（bytecode 版）同加 `--no-bytecode`（JS 版，俾 source-map-explorer 用）。兩次都用 metro 本地 bundler，冇用 EXPO_TOKEN。Timestamp：2026-09-02T07:17:59Z / 07:18:17Z。

| 版本 | 檔案 | 大細 |
|---|---|---|
| Hermes bytecode (`--source-maps`) | `index-*.hbc` | 3,040,452 B |
| 同上 | `.hbc.map` | 7,677,057 B |
| JS（`--no-bytecode`） | `index-*.js` | 2,654,414 B |
| 同上 | `.js.map` | 9,210,344 B |
| 對照：舊 export（`frontend/hymn-app/dist/`，今日 14:19 已存在，非本次產物） | `.hbc` | 3,031,752 B |
| 對照：Release sim build（Xcode DerivedData，2026-09-02 11:44） | `main.jsbundle` | 3,703,949 B |

Release sim `main.jsbundle`（3,703,949 B）比本次本地 export 嘅 hbc（3,040,452 B）大 663,497 B（+18.9%）——兩者 build 參數/時間點唔同，冇再拆差異來源，純記錄。

### Module-size 歸因

`npx source-map-explorer <js> <map> --json ...` **拋錯**：`Your source map refers to generated column Infinity on line 2, but the source only contains 2422 column(s) on that line.`——退出碼 1，冇產出 JSON。已排除快取問題（`--clear` 重出一次，content-hash 完全一樣）；map 本身係合法 v3 JSON（1,414 sources、`sourcesContent` 齊全、`mappings` 2,452,698 字元）。呢個係 source-map-explorer 同呢個 SDK56 Metro export 格式嘅 tool 相容性問題，唔係數據壞。

改用 scratchpad 腳本 `a3_manual_attr.cjs`（直接用 `source-map` package 嘅 `SourceMapConsumer.eachMapping()`，逐 generated-line 用同 source-map-explorer 一樣嘅「相鄰 mapping 之間嘅 column 範圍算俾較前嗰個 source」演算法，但跳過/夾住異常 segment 唔會爆）。歸因咗 2,542,693 / 2,654,414 bytes（95.8%）。Raw：`1a-a3-manual-module-attribution.json`。

**Top 10 modules（by attributed bytes）**：

| bytes | source |
|---|---|
| 124,222 | node_modules/react-native/Libraries/Renderer/implementations/ReactNativeRenderer-prod.js |
| 119,643 | node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js |
| 62,513 | node_modules/expo/virtual/streams.js |
| 62,278 | App.js |
| 56,970 | (no source — 冇 mapping 嘅生成代碼，例如 Metro runtime/polyfill 頭) |
| 47,611 | node_modules/@gorhom/bottom-sheet/src/components/bottomSheet/BottomSheet.tsx |
| 26,542 | node_modules/@react-native/virtualized-lists/Lists/VirtualizedList.js |
| 21,638 | node_modules/react-native-reanimated/src/animation/util.ts |
| 20,169 | node_modules/react-native-reanimated/src/layoutReanimation/defaultAnimations/Zoom.ts |
| 19,371 | node_modules/react-native-reanimated/src/Colors.ts |

（top 40 全表喺 raw json）

**按 npm package 聚合（top 15）**：

| bytes | package | % of 2,654,414 |
|---|---|---|
| 704,946 | react-native-reanimated | 26.56% |
| 685,818 | react-native | 25.84% |
| 159,630 | @gorhom/bottom-sheet | 6.01% |
| 105,752 | react-native-gesture-handler | 3.98% |
| 104,264 | react-native-svg | 3.93% |
| 95,660 | expo | 3.60% |
| 77,138 | react-native-worklets | 2.91% |
| 63,120 | react-native-draggable-flatlist | 2.38% |
| 49,431 | @react-native/virtualized-lists | 1.86% |
| 20,687 | react-native-track-player | 0.78% |
| 20,482 | expo-file-system | 0.77% |
| 18,288 | whatwg-url-minimum | 0.69% |
| 17,782 | semver | 0.67% |
| 12,662 | expo-modules-core | 0.48% |
| 10,185 | expo-updates | 0.38% |

`App.js` 自身 62,278 bytes（2.3%）；`src/` 全部檔案合計 172,215 bytes（6.5%，含經 @gorhom/bottom-sheet 等 library 內部 `src/` 路徑誤入嘅極少量雜訊——見 raw json 逐檔）。react-native-reanimated + react-native 兩個合共 52.4% of bundle。

### Assets

`frontend/hymn-app/assets`（總 11MB，raw：ls -la 輸出見上方指令記錄）：

| 檔案 | 大細 | >200KB? |
|---|---|---|
| assets/fonts/NotoSerifTC-Regular.ttf | 9,929,552 B（9.5MB） | 是 |
| assets/icon.png | 499,869 B | 是 |
| assets/splash-icon.png | 297,750 B | 是 |
| assets/android-icon-foreground.png | 297,750 B | 是 |
| assets/logo-ring@3x.png | 113,594 B | 否 |
| assets/logo-ring@2x.png | 56,917 B | 否 |
| assets/fonts/Sora-ExtraLight.ttf | 46,296 B | 否 |
| 其餘（logo-ring.png/notification-icon.png/android-icon-monochrome.png/favicon.png/android-icon-background.png） | 各 <20KB | 否 |

NotoSerifTC-Regular.ttf 一個字體檔佔咗 assets 總量嘅 88%。

---

## A4. 靜態 dead-code 盤點

### depcheck

指令：`npx depcheck --json`。Timestamp：2026-09-02T07:21:42Z（frontend）/ 07:22:20Z（backend）。Raw：`1a-a4-depcheck-frontend.json`、`1a-a4-depcheck-backend.json`。

**Frontend**：
- unused dependency（depcheck 報）：`expo-font`——**人手覆核後係假陽性**：`app.json` 第 65 行 `plugins` array 有 `"expo-font"`（Expo config plugin,build 期靜態嵌入字體），App.js:4523 comment 亦確認呢個用法。depcheck 唔識 Expo config plugin 呢類用法。
- missing：`@expo/config-plugins`——人手 grep 確認真係有用（`plugins/withSwiftAudioExStallFix.js`、`plugins/withSwiftAudioExStallWatchdog.js` 兩個自訂 config plugin import 緊佢，淨係冇寫入 package.json dependencies，屬「隱式依賴」問題，唔係 dead code）。

**Backend**：unused dependency = 0；missing 幾個（`yt-search`、`meriyah`、`astring` 相關），冇再深挖，同 dead-code 冇直接關係。

### 前端 unused exports（name-based heuristic，正控已做）

方法：scratchpad `a4_unused_exports.mjs`——regex 揾晒 `src/**/*.js` + `App.js` 嘅 top-level `export`，逐個 symbol name 喺全 frontend（撇除 node_modules/dist/*.bak*）做 `grep -rl -w` word-boundary 搜。**正控**：`resolveAudio`（comment 提及,2 個 file hit）、`useCachedHymns`（14 個 file hit，含 App.js）證實條 grep 搵得到真用法。

總共掃咗 129 個 export symbol，12 個「零 cross-file reference」。逐個人手覆核（睇是否喺同一檔案內部自用）：

| file :: symbol | 同檔內部有冇用 | 結論 |
|---|---|---|
| src/perfMarks.js :: PERF_MARKS_ENABLED | 有（module load 時 `if (PERF_MARKS_ENABLED) { ... }`） | 淨係唔跨檔，唔係死碼 |
| src/perfMarks.js :: installFetchCounter | 有（同上 if block 內 call） | 淨係唔跨檔 |
| src/perfMarks.js :: schedulePerfMarksBeacon | 有（同上） | 淨係唔跨檔 |
| src/perfMarks.js :: scheduleRenderBeacons | 有（同上） | 淨係唔跨檔 |
| **src/perfMarks.js :: span** | **冇，全檔案零呼叫** | **真.零引用** |
| **src/perfMarks.js :: elapsedSinceT0** | **冇，全檔案零呼叫** | **真.零引用** |
| src/utils/homeChips.js :: CHIP_DEFS | 有（`buildChips`/`resolveActiveChip` 內部用） | 淨係唔跨檔 |
| src/utils/autoplay.js :: MAX_AUTOPLAY_TRACK_SECONDS | 有（同檔 `isTrackTooLongForAutoplay` 用） | 淨係唔跨檔 |
| src/deviceId.js :: DEVICE_ID_KEY | 有（`getOrCreateDeviceId` 用） | 淨係唔跨檔 |
| src/deviceId.js :: generateDeviceId | 有（`getOrCreateDeviceId` 用） | 淨係唔跨檔 |
| **src/deviceId.js :: __resetForTest** | **冇，comment 話「淨係俾 harness 用」但全 repo grep 冇任何 harness/test file 真係 import 佢** | **真.零引用** |
| App.js :: usePlayer | 有（App.js 內 5 個call site：`MiniPlayer`/`TabBar`/`FullScreenPlayerOverlay`/`AppContent` 都直接喺同一檔案內 call `usePlayer()`） | 淨係唔跨檔（App.js 4,557 行單檔，`export` keyword 喺呢個場景冇實際作用） |

**淨結果：129 個 export 入面，真正「全 repo 零呼叫」淨係 3 個**（`span`、`elapsedSinceT0`、`__resetForTest`），其餘 9 個係「有 export keyword 但只曾喺同一檔案內部用」（唔係死碼，剷 `export` 唔會影響行為但都唔屬於「dead code cleanup」範疇）。
Raw：`1a-a4-unused-exports.json`（機器產出的原始 12 項清單，未經人手分類）。

**方法論已知缺口**：`src/services/homeApi.js` 用 `import('../../services/homeApi').then(...)` 動態 import（`src/components/home/HomeScreen.js:397`），呢類寫法本身喺檔案級 import 掃描（下面）漏檢過一次（第一版 regex 得返 0 refcount，人手覆核先發現係動態 import），已喺方法上記錄，唔屬於「零引用」清單。

### 前端檔案級 import 檢查

45 個 `src/**/*.js` 檔逐個確認被起碼一個非 backup 檔 import（`from '.../basename'` 或 `require(...)` 或人手覆核嘅動態 `import(...)`）。**全部 46 個檔（45 src + 冇計 App.js 本身）都有至少一個真實 importer，冇搵到零引用嘅整個檔案**。Raw：`1a-a4-file-level-imports.log`。

### git tracked 備份檔

指令：`git ls-files | grep -E '\.(bak|backup|fullbak)|v13[0-9]'`。Raw：`1a-a4-tracked-backups.log`。

| 檔案 | size | 「行數」(wc -l，DB 檔無意義) | 最後改動 commit |
|---|---|---|---|
| backend/hymns.db.backup-week1 | 126,976 B | 103 | `5d92304`（v211,SQLite 31 pages，遠細過現時 61MB 正式庫） |
| backend/hymns.db.bak | 40,960 B | 51 | `0de3b6c`（initial commit,SQLite 10 pages） |
| frontend/hymn-app/App.js.fullbak | 28,087 B | 622 |  |
| frontend/hymn-app/App.js.v134-expo-av | 28,602 B | 638 |  |
| frontend/hymn-app/App.js.v135-youtube | 45,713 B | 1,024 |  |
| frontend/hymn-app/App.js.v138-bak | 46,907 B | 1,078 |  |
| frontend/hymn-app/index.js.bak | 100 B | 4 |  |

兩個 `.db` 備份係好早期（極細）嘅版本，一早已經同現行 61MB 庫脫節；四個 App.js 備份都係遠細過現時 4,557 行嘅舊版本。

### backend root 11 個舊 script

指令：逐個 grep `backend/package.json`、`ops/`、`~/Library/LaunchAgents/com.hymn*.plist`、`HANDOFF.md`/`docs/`/根目錄 `*.md`、全 repo `*.js/*.cjs/*.mjs/*.sh/*.json`。Raw：`1a-a4-backend-root-scripts.log`。

| script | 行數 | 真執行引用（package.json/ops/plist/其他程式碼） | 純文檔提及 |
|---|---|---|---|
| bulk_insert_hymns.js | 125 | 無 | 無 |
| check_hymns.cjs | 176 | 無 | 無 |
| e2_cn_batch.cjs | 41 | 無 | 無 |
| e2_final.cjs | 53 | 無 | 無 |
| expand_batch.cjs | 132 | 無 | 無 |
| expand_hymns.cjs | 115 | 無 | 無 |
| expand_hymns_v2.cjs | 199 | 無 | 無 |
| fetch_songs.js | 225 | 無 | 無 |
| fix_dead_ytdlp.cjs | 94 | 無 | `YTDLP-UNIFY-PLAN-20260822.md` 提及 |
| fix_missing.js | 49 | 無 | 無 |
| generate_hymns.js | 80 | 無 | `THIRD-PASS-REVIEW-20260822.md`、`YTDLP-UNIFY-PLAN-20260822.md` 提及 |
| seed.js | 110 | 無 | 無 |
| update_db.js | 50 | 無 | 無 |
| update_hymn_link.js | 112 | 無（`backend/check_hymns.cjs:166` 有提及但淨係一句 console 輸出文字建議用戶手動跑，唔係 `require`/programmatic 呼叫） | 無 |

11 個全部：冇一個俾 `package.json` scripts、`ops/**/*.sh`、launchd plist 或其他程式碼 `require`/`import`；2 個喺舊規劃文件被提過名（純文字）。

### backend/lib 同 backend/scripts 使用情況

`backend/lib/*.js`（28 個檔）：逐個做 `from '.../basename'` / `require('.../basename')` 全 repo 掃描。**28 個全部至少有一個真實 referrer，冇零引用嘅 lib 檔**（`hymnDb.js` 最多，63 個 referrer；`ytdlpBin.js` 15 個）。Raw：`1a-a4-backend-lib-usage.log`。

`backend/scripts/*.{js,mjs}`（92 個檔）：同上掃描 + 額外查 `ops/`、launchd plist、`backend/package.json`、`HANDOFF.md`/`docs/`/根 `*.md` 有冇「提過個檔名」。92 個入面 **7 個三項都零**：

- `fetchKeenCatalog.js`、`fetchMusicBrainzCatalog.js`、`fetchSopCatalog.js`、`fetchTianyunCatalog.js`、`fetchXiaoyangCatalog.js`、`fetchXinxinCatalog.js`（六個一次性目錄爬蟲，各自對應嘅 `backfillAlbumFrom*Catalog.js` 姊妹腳本仍然俾 `hymnDb.js` 用緊，但呢啲「產生 catalog JSON」嘅爬蟲本身而家冇任何引用）
- `oneoff-retireParkedInstrumentals-20260823.mjs`（帶日期嘅一次性腳本，命名本身已表明係跑完即棄）

Raw：`1a-a4-backend-scripts-usage.log`（含 92 個檔逐一嘅 code/shell/doc reference count）。

### /api/search、/api/category、/api/audio、/api/home 前端呼叫盤點（回應 coordinator 補問）

**方法**：正控先用 `resolveAudio`（2 hit）、`api/hymns`（7 hit）證實 grep 搵得到真用法，先做「零」結論。

1. **`/api/search/*`**（`routes/search.js` 5 條子路由：/all /title /artist /lyrics /album）：全 frontend（`--include="*.js" --include="*.jsx"`，撇 node_modules）grep `api/search` **0 hit**。
2. **`/api/category/*`**（`routes/category.js` 8 條子路由）：同上 grep `api/category` **0 hit**。
3. **`/api/audio/*`**（`routes/audio.js`：`/:youtubeId` 主 route + 兩條 debug `/cache/stats` `/cache/warm-stats`）：frontend grep `api/audio` **0 hit**；`fetchAudioUrl`（audio.js comment 聲稱嘅「唯一 consumer」）喺 App.js/src 全 repo grep 都搵唔到——即係 comment 提到嘅 consumer 而家喺前端已經唔存在。**但全 repo（非 frontend）grep 搵到 `backend/check_hymns.cjs:70` 有真實 `fetch(`${SERVER_URL}/api/audio/${youtube_id}`)` 呼叫**——呢個係一個維運腳本（上面已列出，本身零引用、要人手執行），唔係 App 本身嘅路徑。
4. **`/api/home/*`**（`routes/home.js` 10 條子路由）：`src/services/homeApi.js` 係前端**唯一**打 `/api/home` 嘅模組，但佢個 `homeApi` object **淨係 export 一個 method**：`getDailyVerse: () => fetchJSON(\`${HOME_BASE}/daily-verse\`)`。`homeApi.js` 本身俾 `src/components/home/HomeScreen.js:397` 動態 `import()` 用緊（**唔係死檔**）。其餘 9 條子路由（daily-quote / featured-artist / new-releases / genre-recommendation / based-on-taste / resonating / top-verses / folk-sharing / combined-charts）喺 `homeApi.js` 度連個 client method 都冇寫過，全 repo grep 呢 9 個路徑字串都搵唔到第二個呼叫者。

**Backend 真實流量量度缺席聲明（唔准當「零」）**：
- `server.js` 冇任何通用 access log middleware（無 morgan/類似），淨係逐條 route 自己 console.log。
- `backend/routes/search.js`、`category.js`、`home.js` **全部三個檔完全冇 `console.*`**——冇任何 log 訊號可以查「呢個 route 幾時俾人打過」。可用嘅日誌窗口 `/tmp/hymn_backend.log`（覆蓋 2026-08-29T17:48 – 2026-09-02T04:51，約 4.9 日，backend process 本身喺 2026-09-01T23:40 先啟動，之前係舊 process 嘅 log）對呢三個 route **完全冇對應訊號可查**，唔係「冇打過」，係「呢個量度方法對呢三個 route 天生盲」。
- `routes/audio.js` **有** distinctive log（`console.log('📻 Proxying audio request...')`——但只喺 `AUDIO_PROXY_TARGET` env 設咗嘅 proxy mode 先會行到；本機冇設呢個 env，走 direct yt-dlp mode，成功呼叫完全靜默，只有失敗先 `console.error('❌ Resolve failed for...')`）。喺 4.9 日窗口內 grep `Proxying audio` 同 `Resolve failed for` 都係 **0**——呢個只能證明「冇失敗個案」同「冇行 proxy mode」，**唔能夠證明冇任何成功嘅直接呼叫**（成功路徑本身唔留痕）。

**4 個 route 檔 + 佢哋獨有 lib 依賴嘅總行數**：

| route 檔 | 行數 | 用到嘅 lib（是否共用） |
|---|---|---|
| routes/search.js | 117 | 自帶 inline DB loader（`initSqlJs`+`fs.readFileSync`，唔係獨立 lib 檔，同 category.js 重複同一段 code） |
| routes/category.js | 136 | 同上，自帶同款 inline DB loader（同 search.js 重複） |
| routes/audio.js | 114 | `lib/resolveAudio.js`（共用，`stream.js`/`hls.js` 都用緊）、`lib/opsMetrics.js`（共用） |
| routes/home.js | 160 | `lib/serverDb.js`（共用，`server.js`/`me.js`/`admin.js` 都用緊） |
| **4 檔合計** | **527** | 冇一個係「呢 4 個 route 專屬、其他地方完全唔用」嘅 lib 檔——`search.js`/`category.js` 反而各自複製咗一份唔經 singleton 快取嘅 DB 載入邏輯（見 A2） |

**額外發現（附帶量到，寫入盤點但屬 A1 payload 範疇）**：`category.js` 嘅 `queryDb()` 一律 `SELECT *`（唔似 `/api/hymns` 揀 17 個欄），`/api/category/mandarin`（3,967 行 lang='國語'）single response = 35,145,812 bytes，`lyrics_timeline` 一個欄喺呢 3,967 行入面就已經 13,561,801 bytes（見上面 A1 表同 sqlite 直查：`select sum(length(lyrics_timeline)) from hymns where lang='國語'` = 13561801）。呢條 route 同上面確認嘅「前端零呼叫」係同一條 route。

---

## 觀察（事實陳述，唔判斷）

1. `/api/category/mandarin`、`/api/category/cantonese` prod total time 分別去到 21-33 秒同 16-29 秒（uncompressed，5 次都係），payload 35MB / 16MB；呢兩條 route 喺前端源碼（App.js + src/，`--include` 排除 node_modules）搵唔到任何呼叫字串。
2. `routes/search.js`、`routes/category.js` 各自維護獨立、無快取嘅 `queryDb()`（每個 request 都重新 `fs.readFileSync` 61MB DB 檔 + 重新 `initSqlJs()`），冇經 `lib/serverDb.js` 嗰個 singleton；`/api/hymns`、`routes/home.js` 就有經。
3. 全部 57 個 (endpoint×target) curl 組合，`cf-cache-status` 全部 `DYNAMIC`，冇一個 `HIT`；除 `/api/hls/*` (`no-store`) 外全部冇 `cache-control` header。
4. backend process 現時 RSS = 736MB（uptime 15.6 小時），ops-metrics 24 小時 sample 顯示 `rssKb` 喺 29MB – 358MB 之間（不同時段唔同 process 生命週期）。
5. 獨立 node process 用同一條 SELECT 讀 6,405 行 × 17 欄，query 本身（`stmt.step()`+`getAsObject()` 迴圈）耗 97-158ms，比 DB 檔載入（7-21ms）同 JSON.stringify（7-19ms）都慢。
6. `App.js` 4,557 行，`PlayerProvider` 一個 function 佔 2,518 行（55.2%），`FullScreenPlayerOverlay` 佔 699 行（15.3%），呢兩個合共 70.5%。
7. App.js 冇任何 `console.log`（0 個），用自訂 `logDiag()` wrapper（23 次呼叫，經 `fetch` POST 去 `/api/client-log`，受 `DIAG_ENABLED` flag 閘住），另有 24 次 `console.warn`/`console.error`。`src/` 全部檔案合計 1 個 `console.log`（`PlaylistsContext.js`）。`babel.config.js` 冇 `transform-remove-console` 或類似 plugin。
8. App.js + src/（撇 `theme/designSystem.js`）合共 32 個 grep 命中 `#[hex]` pattern，人手逐條核實後：28 個喺 `//` comment 入面（設計筆記/GitHub issue 編號），實際 live style code 入面嘅硬編碼色值淨係 4 個，全部係 `shadowColor: '#000'`。
9. JS bundle（`--no-bytecode` export，2,654,414 B）用手寫 attribution 腳本歸因 95.8%；`react-native-reanimated`（704,946 B）同 `react-native`（685,818 B）合共 52.4% of bundle；`App.js` 自身 62,278 B（2.3%）。
10. `assets/fonts/NotoSerifTC-Regular.ttf` 9,929,552 B，佔 `frontend/hymn-app/assets` 總 11MB 嘅 88%。
11. depcheck 報 frontend 1 個 unused dependency（`expo-font`），人手覆核係假陽性（`app.json` config plugin 用緊）；backend 0 個 unused dependency。
12. 129 個前端 export symbol 掃描，12 個零 cross-file reference，人手覆核後其中 9 個係同檔內部自用（`export` keyword 冇實際跨檔作用），3 個（`span`、`elapsedSinceT0`、`__resetForTest`）全 repo 零呼叫（連自己檔案都冇）。
13. 45 個 `src/**/*.js` 檔全部至少一個真實 importer；28 個 `backend/lib/*.js` 全部至少一個真實 referrer；92 個 `backend/scripts/*.{js,mjs}` 入面 7 個（6 個一次性目錄爬蟲 + 1 個帶日期一次性腳本）喺 code/ops/doc 三個管道都搵唔到任何引用。
14. backend root 11 個舊 script（合共 1,461 行）全部冇被 `package.json`/`ops/`/launchd/其他程式碼引用；其中 2 個喺舊規劃 `.md` 被純文字提過名。
15. git tracked 住兩個舊 `hymns.db` 備份（126,976 B / 40,960 B，SQLite 31/10 頁，遠細過現行 61MB 庫）同四個舊 `App.js` 備份（28KB-47KB，622-1,078 行，遠細過現行 4,557 行）。

---

## 盤點清單（dead-code 候選，逐項附證據行）

| 候選 | 證據 | 備註 |
|---|---|---|
| `backend/routes/search.js` 全部 5 條 sub-route | 前端 grep `api/search` = 0（正控用 `resolveAudio`/`api/hymns` 已證 grep 有效） | 冇 console.log，backend log 天生量唔到「有冇人打過」 |
| `backend/routes/category.js` 全部 8 條 sub-route | 前端 grep `api/category` = 0，`/mandarin`/`cantonese` 實測 payload 35MB/16MB、prod 21-33秒 | 同上，天生量唔到流量 |
| `backend/routes/home.js` 9/10 條 sub-route（除 `/daily-verse`） | `homeApi.js` 淨係 export `getDailyVerse`，全 repo grep 呢 9 個路徑字串 = 0 | `home.js` 檔本身/`getDb()` 唔係死（`/daily-verse` 用緊） |
| `backend/routes/audio.js` `/:youtubeId` | 前端 grep `api/audio`/`fetchAudioUrl` = 0；comment 聲稱嘅 consumer 已消失；剩 `backend/check_hymns.cjs`（維運腳本）真係呼叫緊 | 4.9 日 log 窗口 0 次 proxy log，但成功路徑本身唔留痕（量度缺席） |
| `frontend/hymn-app/src/perfMarks.js :: span` | 全 repo grep 零呼叫（含自己檔案） | 檔案本身活躍（其餘 4 個 export 有人用） |
| `frontend/hymn-app/src/perfMarks.js :: elapsedSinceT0` | 同上 | 同上 |
| `frontend/hymn-app/src/deviceId.js :: __resetForTest` | 全 repo grep 零呼叫（comment 聲稱俾 harness 用但搵唔到任何 harness file import） | |
| backend root 11 個舊 script（bulk_insert_hymns.js 等，合共 1,461 行） | package.json/ops/plist/程式碼 grep 全部 0 | 2 個喺舊 .md 被提過名（純文字） |
| `backend/scripts/fetch{Keen,MusicBrainz,Sop,Tianyun,Xiaoyang,Xinxin}Catalog.js`（6 個） | code/ops/doc 三管道 grep 全 0 | 各自「產出」嘅 catalog JSON 仍俾對應 backfill 腳本用緊，呢啲爬蟲本身冇人再叫 |
| `backend/scripts/oneoff-retireParkedInstrumentals-20260823.mjs` | 同上 | 檔名本身已標示一次性 |
| git tracked `backend/hymns.db.backup-week1`、`backend/hymns.db.bak` | 126,976B/40,960B，SQLite 31/10 頁，遠細過現行 61MB db | |
| git tracked `frontend/hymn-app/App.js.{fullbak,v134-expo-av,v135-youtube,v138-bak}`、`index.js.bak` | 622-1,078 行，遠細過現行 App.js 4,557 行 | |
| `backend/routes/search.js` / `category.js` 嘅 inline `queryDb()` | 兩檔逐字重複同一段 `initSqlJs()+fs.readFileSync+new SQL.Database()`，唔經 `lib/serverDb.js` singleton | 屬「重複+低效」而非「零引用」類候選,同 dead-export 唔同類 |

---

## 做唔到 / 有缺口嘅項目

1. `npx source-map-explorer --json` 對呢個 SDK56 Metro export 直接拋錯（"generated column Infinity"），改用手寫 `source-map` consumer 腳本歸因 95.8%——唔係官方工具嘅標準輸出，數字屬近似值（同 source-map-explorer 用嘅演算法一致，但未經第二個工具交叉驗證）。
2. `npx react-native bundle`（規劃書提到嘅 fallback）喺呢個專案冇裝 `@react-native-community/cli`，一行 warning 就退出，冇產出任何檔案——最終冇用到呢條路徑，全靠 `expo export --no-bytecode`。
3. `/api/search`、`/api/category`、`/api/home`（9條）、`/api/audio` 四類「前端零引用」結論全部只覆蓋 **App.js + frontend/hymn-app/src** 呢個 client；冇檢查有冇獨立嘅 admin web / 第三方 client 打緊呢啲 route（本次盤點範圍冇搵到呢類 client 存在,但都冇正式排除）。
4. Backend 側「真實流量」結論全部受限於 `/tmp/hymn_backend.log` 呢個約 4.9 日嘅窗口 + 冇通用 access log 呢個先天限制——見上面「量度缺席聲明」,已明文唔當「零」處理。
5. Release sim `main.jsbundle` 同本次 export hbc 大細差 663KB 嘅原因未拆解（唔知係 minify 設定、瘦身 plugin、定 build 時間點所帶嘅代碼差異）。

---
## Errata（Opus 5 驗收 PERF-BASELINE-OPUS-20260902.md §6，Fable 5.1 2026-09-02 16:05 補）
1. A4「backend root 11 個舊 script 合共 1,461 行」→ **14 個，合共 1,561 行**（表本身正確，總數抄自規劃書 §1 冇覆核）。
2. A2 RSS 736MB **係尖峰唔係穩態**，唔可以做改前基準：快照喺 A1 壓測開波後 3m31s、約 35 個「重開 61MB DB」request（主要係 30 個 /api/search，category 嗰輪大部分未發生）之後攞；同 PID 30 分鐘 sample 從未超過 ~360MB，Opus 同日量到 246MB。機制（每 request 重開 DB → WASM heap 尖峰）成立，歸因對象改為 search+category 合計。
3. A4 unused-exports heuristic 只會多數 reference（refCount 含假 hit），零引用清單係保守嘅。
4. A3 export 產物已刪，大細數字不可覆核（下次要存 `ls -la`）。
