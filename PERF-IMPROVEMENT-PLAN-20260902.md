# Odely 效能改善總規劃 2026-09-02

負責：Fable 5.1（規劃/監督）→ Sonnet 5 執行 → Opus 5 獨立驗收。
Eric 原話：先建立效能基準 → 搵瓶頸 → 可量測改善/優化/debug → 清走無用 code → 改前改後報告。

## 0. 邊啲唔做（已經做完/另有 session 做緊）
- HLS 起播（f509c3b v2 kick）— 另一 session 跟緊 Eric 真機 confirm，`HLS-EXEC-STARTUP-GRACE-20260902.md` 有人改緊。**本工程唔掂 PlayerProvider 起播/stall/watchdog 邏輯。**
- backend `[stream]` buffer cache 128MB 調優、escalationVetoed dead code（build 17 已剷）。
- 唔准擴大用戶可觸及嘅本地音訊副本（版權紅線）。

## 1. 盤點結果（Fable 5.1 2026-09-02 09:50–10:10 親手量）

| 項目 | 數字 | 出處 |
|---|---|---|
| `/api/hymns` raw payload | 5,567,646 B（6,405 首） | `curl localhost:3001/api/hymns` |
| 其中 lyrics 欄 | ~1,240 KB（server.js 註解仲寫住「只有 ~10 首有歌詞,cost negligible」— 已過時） | 逐欄計 |
| `/api/hymns` local | 200 / 0.136–0.146 s | curl |
| `/api/hymns` prod (api.odemusics.com) | 200 / 2.13–3.21 s，gzip 後 1,469,185 B，壓縮由 Cloudflare edge 做，origin→edge 仍係 5.5MB 原文（Express 冇 compression） | curl -D |
| 前端開機 | MMKV `allHymns` 存成個 5.5MB JSON string，每次冷開 `JSON.parse` 一次（主 JS thread） | useCachedHymns.js |
| App.js | 4,530 行單檔；`PlayerProvider` 一個 component 420–2958 行 | grep |
| src/ 總量 | 45 檔 7,386 行 | wc |
| iOS Hermes bundle | 3,703,949 B（Release sim build 2026-09-02 11:44 `main.jsbundle`）；dist/ 舊 export 3,031,752 B | ls |
| backend RSS | 360 MB（uptime 15h） | ps |
| backend DB 層 | sql.js 全庫 61 MB 讀入記憶體（WASM） | db.js |
| backend root 垃圾 | `hymns.db.bak-*` + `*.webm` 共 **11 GB**（gitignored，淨係食碟）；`hymns.db.bak`/`hymns.db.backup-week1` **仲 tracked 喺 git** | du / git ls-files |
| 前端 tracked 備份檔 | `App.js.fullbak` `App.js.trackplayer-backup` `App.js.v134-expo-av` `App.js.v135-youtube` `App.js.v138-bak` `index.js.bak`（4,435 行） | git ls-files |
| backend root 舊 script | 14 個 1,561 行（e2_*.cjs / expand_* / fix_missing …）——**2026-09-02 Stage 3 已全部移除（5baf3e1）** | grep / Opus 驗收更正 |
| 冷啟動儀器 | **零**——App.js 冇任何 startup timing 記錄 | grep |

## 2. 階段

### Stage 1 Baseline（兩個 Sonnet 5 並行）
- **1A backend / bundle / 靜態盤點**（唔使模擬器）
- **1B iOS 模擬器 runtime**：冷啟動、首屏、記憶體、request 數、re-render
- 產出：`PERF-BASELINE-20260902.md` + raw 證據 `ops/perf/baseline-20260902/`
- Opus 5 驗收 baseline 方法論（positive control 有冇做、數字有冇出處）

### Stage 2 優化（逐項，每項改前改後同一儀器再量）
候選（按盤點結果排，Stage 1 數字出咗再定次序）：
1. backend Express `compression`（排除 /api/stream /api/hls /api/audio）— origin→edge 5.5MB→~1.5MB
2. `/api/hymns` 瘦身：lyrics 拆出（`/api/hymns/lyrics` 或 per-id lazy），或 ETag/304 + 欄位精簡
3. 前端開機 JSON.parse 5.5MB → 拆 lyrics 之後自然細；再睇 MMKV 讀取策略
4. bundle：unused deps/imports、大 module
5. re-render 熱點（Stage 1B 數據話事）
6. backend：sql.js 全量讀取/saveDb 全檔寫；record startup time

### Stage 3 Dead code cleanup
- 前端 tracked 備份檔、backend root 舊 script、tracked DB 備份、unused exports/deps
- 每刪一樣：全 repo grep 證明零引用 → 刪 → build/run 回歸（播放/搜尋/首頁/會員）
- 11GB 碟上備份：唔喺 git，刪唔刪要 Eric 拍板（Dispatch 轉達）

### Stage 4 驗收 + 報告
- Opus 5 用同一儀器獨立重量「改後」
- 報告：改前→改後對比表 + 瓶頸清單 + 改動清單 + dead code 行數/檔數

## 3. 規範（全部 session 必守）
- 共用 worktree：開工前 `git status`，commit 一律 `git commit -- <pathspec>`，唔准 `git add -A`
- 唔准部署（backend restart / OTA）——Eric 真機 HLS QA 進行緊（feedback-no-deploy-during-live-qa）；Stage 2 出街時機由 Fable 5.1 同 Dispatch 協調
- 唔准掂 `PlayerProvider` 內起播/stall/nudge/watchdog 邏輯
- 證據表：每個數字要有 timestamp + raw log 路徑 + 指令；「零 X」要 positive control
- 執行者唔判 PASS/FAIL，留白俾 Opus 5
- 模擬器：只開一部（client-log 冇 deviceId，兩部會污染）；用 Release build（Debug Hermes segfault）；收工 `simctl shutdown`
