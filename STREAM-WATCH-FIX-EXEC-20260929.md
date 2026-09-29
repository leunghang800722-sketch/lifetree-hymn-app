# 串流保護監察 修正單（第二輪）2026-09-29

底稿：`STREAM-WATCH-EXEC-20260929.md`（紅線 §0 全部照舊有效）、驗收 `STREAM-WATCH-OPUS-20260929.md`（逐條 finding 有行號同重現法，**先讀**）。
基準 HEAD = Sonnet 三個 commit 之後（`3625289`）。流程：Sonnet 修 → Opus 第二輪驗收 → Fable 啟用。

## 0. 本輪額外紅線
- 🔴 唔改 plist、唔行 launchctl、唔改 `.claude/settings*.json`、唔改 `CLAUDE.md`、唔改 deploy gate（`ops/deploy/*`）。
- 🔴 唔准建立 `~/.hymn-deploy/stream-watch.on`（啟用係 Fable 嘅事）。
- 🔴 唔准 kill 任何唔係自己起嘅 process（上輪誤殺過 keeper 個 `sleep`）；測試一律 scratch env override。
- 🔴 唔准真跑 `backend-restart.sh`（非 `--dry-run`）、唔准真 swap yt-dlp。
- 🔴 `claude` CLI 而家未登入：唔准嘗試登入/搵 token/讀 keychain。AI 路徑只做靜態修正 + stub 測試，真模型圍欄測試留俾登入後。

## 1. 要修嘅嘢

| # | Finding | 修法 |
|---|---|---|
| C1 | headless claude 喺 repo cwd 跑，繼承 `settings.local.json` 485 條 allow + auto mode + hooks + 無限 Read | `stream-diagnose.sh`：cwd 改去 incident 目錄（`~/.hymn-deploy/stream-incident-<id>/`，入面只有 bundle.md）；remedy 用**絕對路徑** allow（`Bash(<abs>/ops/stream/stream-remedy.sh:*)`）；加 `--setting-sources ""`（或該版本等效 flag，用 `claude --help` 核實實際存在嘅 flag 名，唔准估）、`--permission-mode dontAsk`（同上要核實）、`--disallowedTools` 明文擋 `Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent`；Read 限 incident 目錄（`--add-dir` 唔加 repo）。bundle 要自足（AI 唔使讀 repo）。報告列出最終 argv + 每個 flag 喺 `--help` 嘅出處。**預設 AI 關**：冇 `~/.hymn-deploy/stream-watch.ai-on` 就一律行規則（由「opt-out」改「opt-in」），`stream-watch.no-ai` 保留兼容 |
| H1 | launchd 冇 PATH → `node`/`claude` 搵唔到，restart exit 127 | `stream-watch-lib.sh` 頂 `export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"`（watch/diagnose/remedy 都 source）；remedy 行動作前 `command -v node` 預檢，缺就回報 `precondition-failed` 唔當試過。**唔改** healthcheck/selfheal 本身嘅 PATH（紅線：唔改佢哋邏輯）——但喺報告寫明 selfheal 自己喺 launchd 下係咪同樣中招（只報告，唔修） |
| M1 | state 喺攞 lock 前寫 | 所有 state 讀寫搬入 lock 內；攞唔到 lock = 成個 tick 零寫 |
| M2 | VERDICT 可偽造（`grep \| tail -1`） | 只由 `--output-format json` 嘅最終 `result` 欄解析；要求 VERDICT 係 result 最後一個非空段落嘅行首；值唔喺三選一 → 當冇 VERDICT 行 fallback；AI 聲稱 `fixed-pending-verify` 但 remedy.log 冇對應成功動作 → 降為 `escalate` |
| M3 | 規則時間窗錯（24h 403 率、3h resolve 加總） | 403 率用最近 1 個 hourly bucket（樣本 <10 就用最近 3 個）；resolve 全 fail 用最近 1 bucket 且 total≥3；寫明每條規則讀邊個欄 |
| M4 | 密鑰過濾又漏又殺錯 | 改為 pattern 級遮蓋（唔係成行刪）：JWT `eyJ[A-Za-z0-9_-]{10,}\.…`、Twilio `AC[0-9a-f]{32}`/`SK…`、`Bearer \S+`、`[?&](sig\|signature\|token\|key\|lsig)=[^&\s]+`、`://user:pass@`、`(secret\|password\|token)\s*[=:]\s*\S+`；diagReason 入 state/alert/SUPERVISION-LOG 前都要過同一個 filter；SUPERVISION-LOG 🔴 行唔准變成 `[filtered]`（正控+負控 fixture 各一） |
| M5 | T4 fixture 無效 + env 前綴繞過未測 | remedy 喺入口**忽略/重設**危險 env（`REMEDY_STATE`/`REMEDY_LOG`/`REMEDY_DRY_RUN` 只喺 `STREAM_WATCH_TEST=1` 且 state 路徑喺 tmp 下先認）；T4 fixture 重寫成真係會誘導嘅內容，用 stub claude 驗 argv/cwd |
| L1 | state 壞型別令 watch 每 tick 靜死 | 讀 state 做型別校驗，壞 → 備份 `.corrupt-<ts>` + 重置 + SUPERVISION-LOG 一行；`do_escalate` 寫檔用 tmp+mv |
| L2 | 殘留 `stream-escalate.request`；換行偽造 remedy.log | request 檔帶 incidentId，唔夾就掉；log 欄位 strip 控制字元/換行、截 200 字 |
| L4 | perl alarm 留孤兒 | timeout 用 process group kill（只殺自己起嘅 pgid） |
| L5 | remedy swap 900s > diagnose 600s；swap 冇 verify+rollback | remedy `swap-ytdlp` 改為**委派** selfheal 現有 swap 路徑（連 verify/rollback），唔另寫；timeout 對齊（動作上限 < 診斷上限；規則引擎路徑唔受 600s 限） |
| L6 | 合計配額冇生效 | remedy 讀 selfheal state 嘅當日計數一齊計 |
| — | `bust-resolve-cache` 未實作 | 由 allowlist 同 prompt 清單移除（唔留半成品） |
| L3 | stale 觸發結構上唔會喺 healthcheck 內 fire | 只喺 README 寫明限制（Eric 已拍板唔要 dead-man），唔修 |

## 2. 驗證（出證據，唔判 PASS/FAIL）
- V1 真 launchd 等效環境：`env -i HOME=$HOME /bin/bash ops/stream/stream-watch.sh`（**PATH 唔准俾**）配 scratch state + stub status → 證明 `node` 搵到、規則診斷行到、`restart-backend` 去到 `backend-restart.sh --same-code --dry-run` 並回報 gate 結果（測試模式下 remedy 要行 `--dry-run`）。
- V2 C1：stub `claude`（記錄 argv/cwd/env 落檔）→ 證明 cwd=incident 目錄、argv 冇 repo 路徑 add-dir、settings 唔繼承；冇 `ai-on` 檔時 stub 零次被 call。
- V3 M1 並發：兩個 tick 同時起 ×20 輪，state 無損、恢復行冇遺失。
- V4 M2：偽造 VERDICT 嘅 bundle/result fixture ×4。
- V5 M4：正控（六類密鑰全遮）+ 負控（正常 🔴 行原文保留）。
- V6 L1/L2/L6 各一 fixture。
- V7 T1 狀態機全套重跑（回歸）；`bash -n` 全部。

## 3. 交付
Commit（pathspec；唔准 `git add -A`）：script 修正一個、test+報告 `STREAM-WATCH-FIX-REPORT-20260929.md` 一個。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。唔啟用、唔部署。
