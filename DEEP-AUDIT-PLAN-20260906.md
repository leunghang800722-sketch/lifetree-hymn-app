# Odely iOS + Android 深度體檢總規劃 2026-09-06

Eric 原話：「改善這個 App 嘅效能。先建立效能基準，找出瓶頸，進行可量測的改善，最後回報改善前後的結果。咁多錯漏叫 fable5.1 重新將 2 個系統 iOS 同 Android 深度檢查一次，錯漏、debug、優化同把無用嘅 code 拎走，我唔鐘意頭痛醫頭腳痛醫腳。」

負責：Fable 5.1 規劃/監督 → Sonnet 5 執行 → Opus 5 獨立驗收。原則：**由根源分類，唔逐個症狀補**；每項改動有 before/after 數字；兩個平台分開量、分開驗，唔假設一致。

## 0. 同 09-02 效能工程嘅關係
09-02 嗰輪（PERF-FINAL-REPORT-20260902.md）做咗：歌庫 lite/歌詞拆分、origin 壓縮、server cache、Library lazy-mount、死 route、dead code 6,101 行。**已部署**。呢輪 baseline 要以「部署後」為改前，並補返嗰輪嘅缺口：Android 完全未量、真機 tunnel 數字未量、bug 層面未系統審過。

## 1. 階段
### Phase 1 體檢（並行，只出 findings register，唔改 code）
| 線 | 範圍 | 產出 |
|---|---|---|
| 1A 前端靜態深審 | App.js（4.5k 行）+ src 全部：邏輯錯漏、race、error handling、Platform.OS 分支、重複/矛盾邏輯、hook deps、memory leak、dead code、依賴 | `DEEP-AUDIT-1A-FRONTEND-20260906.md` findings register |
| 1D backend 深審 | server.js/routes/lib：錯誤處理、unhandled rejection、資源洩漏、timer、DB lock/saveDb 全檔寫、resolve/HLS 路徑、無 auth endpoint、rate limit、dead code（410 stub 48h 後）、scripts 引用 | `DEEP-AUDIT-1D-BACKEND-20260906.md` |
| 1E 真機 telemetry | client-log 最近 7–14 日：按 platform（ios / android / ?）× event 拆：起播 nextTrackMs 分佈、stall/giveup/hlsFallback 率、perfMarks（首屏/hymns/lite/lyrics）、錯誤 event；`[access]` restart 後統計；`[deprecated-route]` 命中；backend 錯誤 log 分類 | `DEEP-AUDIT-1E-TELEMETRY-20260906.md`（真用戶 baseline） |
| 1C iOS 運行時 baseline | perfMarks 同一儀器，**經 prod tunnel**（唔係 loopback）：冷開/熱開/導航/播放/記憶體；HLS 起播路徑 | `DEEP-AUDIT-1C-IOS-20260906.md` |
| 1B Android 運行時 baseline | AVD hymntest + release APK（OTA 最新 JS）：同一儀器 + Android 專項（FGS/通知、返回鍵、鍵盤、TrackPlayer service、debug keystore 風險、ANR） | `DEEP-AUDIT-1B-ANDROID-20260906.md` |

### Phase 2 根源分類（Opus 5）
將 1A–1E 全部 findings 合併去重 → 按**根源 cluster**（唔係症狀）分組，每 cluster：影響平台、嚴重度、證據、修法方向、要唔要 Eric 拍板（UX/產品）。產出 `DEEP-AUDIT-ROOTCAUSE-20260906.md` + 修復波次計劃。

### Phase 3 修復波次（Sonnet 5 執行，每波 Opus 5 驗收）
每波：改前數字（Phase 1）→ 改動 → 改後同儀器 → 兩平台各驗 → commit（pathspec）。部署按波：backend restart（gate）/ OTA；**要 native build 嘅（Android APK / iOS TestFlight）另列，含 debug keystore 風險，要 Eric 拍板**。

### Phase 4 總報告
`DEEP-AUDIT-FINAL-20260906.md`：兩平台改前→改後表、修咗嘅根源 cluster、剷走幾多 code、未做/要拍板。

## 2. 鐵律（全部 session）
共用 worktree（pathspec commit、唔夾帶）；唔掂 PlayerProvider 起播/stall/watchdog 邏輯除非 Opus 根源分析明確要求並經 Fable 5.1 批；唔部署未驗收嘅嘢；證據表制、正控、唔判 PASS/FAIL；模擬器/AVD 一次一部、hold 檔、收工清；唔擴大本地音訊副本；scratch 放 session scratchpad。
