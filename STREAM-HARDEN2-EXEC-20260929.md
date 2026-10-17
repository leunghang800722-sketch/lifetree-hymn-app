# 執行單：healthcheck + selfheal 加同一套三層防呆 2026-09-29 晚

Eric 批准開紅線：`ops/lyrics/stream-healthcheck.sh`、`ops/stream/stream-selfheal.sh` 加「冇憑證拒絕 / Claude shell 拒絕 / 測試快照斷言」。背景：`STREAM-HARDEN-EXEC-20260929.md`、`STREAM-HARDEN-OPUS2-20260929.md` 第 7 點（呢兩支「唔成立（範圍外）」）。基準 HEAD `2bbd80a`。
流程：Sonnet 執行 → Opus 驗收（必須等一個真 tick 證明冇誤殺）→ Fable 收爐。

## 0. 紅線（本輪）
- **只准加 guard / 路徑 override / 測試模式；唔准改** healthcheck 嘅探測判斷（Layer A/B、consecutiveFail、節流、SUPERVISION-LOG 寫法）同 selfheal 嘅修復梯/配額/節流/形態判定。`git diff` 要逐行可以指出每行係 guard 或路徑。
- 真 launchd tick（冇 CLAUDECODE、冇 STREAM_WATCH_TEST）行為必須**完全不變**：同一啲檔、同一啲路徑、同一 exit code。
- 唔改 `ops/deploy/*`、plist、`.claude/`、`CLAUDE.md`、backend/、frontend/；唔掂 `stream-status.sh`。
- 唔寫 prod（canary 即刪除外）；唔 restart/launchctl/approve/OTA/swap/drill.request/真模型/YouTube/googlevideo（測試模式 Layer B 一律 stub）；唔讀 secret；唔 kill 非自己起嘅 process；git 只 pathspec；bash 唔用 zsh；改完即 `bash -n`。
- 派工/測試一律 source `ops/stream/test/testlib.sh`。

## 1. healthcheck（launchd 入口，本身係 tick）
1. 入口 guard（`set -u` 之後、任何寫入之前，source `stream-watch-lib.sh` 或自帶同一段）：
   - 非測試模式 + `${CLAUDECODE:-}` 非空 + 冇 `HC_MANUAL=1` → `REFUSED` exit 2 零寫入（連 `/tmp/hymn_stream_watch.log` 都唔寫）。
   - 測試模式 = `STREAM_WATCH_TEST=1` + `WATCH_DIR` realpath 喺 tmp；測試模式下 **所有**寫入路徑強制落 `$WATCH_DIR/`：`STATE`、`HISTORY`、`LOG`（SUPERVISION-LOG）、watch log（新 env `HC_WATCH_LOG`，預設維持 `/tmp/hymn_stream_watch.log`，測試模式強制 `$WATCH_DIR/watch.log`）；Layer B 嘅 yt-dlp 同 googlevideo 打法喺測試模式必須可 stub（`YTDLP_BIN` 已有；直打 CDN 嗰段加 `HC_CDN_FETCH_CMD` override，測試模式未設就用 stub-status 一類固定回 206；**prod 行為零改動**）。
   - 測試模式下 `SELFHEAL`、watch 嘅呼叫照舊（佢哋各自有測試模式）。
2. **tick 憑證**：healthcheck 開頭寫 `$WATCH_DIR/.tick-ctx`（`pid=$$ ts=`，umask 077），trap EXIT/TERM/INT/HUP 刪（只刪 pid==$$）。selfheal 靠佢；watch 照舊自己寫 `.watch-ctx`（唔改）。

## 2. selfheal
1. 測試模式 = `STREAM_WATCH_TEST=1` + `SELFHEAL_STATE`、`HEALTH_STATE`、`WATCH_DIR` 三個齊且 realpath 喺 tmp；缺一 = prod。測試模式下 SUPERVISION-LOG 寫入（`LOG`/hist）強制去 `$WATCH_DIR/`；`SELFHEAL_APPLY_CMD`/`SELFHEAL_RESTART_CMD` 未設就用 `--dry-run`/stub（照 remedy 做法：預設 restart 加 `--dry-run`、預設 swap 唔真行）。
2. prod 模式 guard（任何寫入/動作之前）：需要 `$WATCH_DIR/.tick-ctx`（普通檔、非 symlink、mtime<30min、pid 生存）或 `SELFHEAL_MANUAL=1`；`CLAUDECODE` 非空冇 MANUAL → REFUSED exit 2 零寫入。prod 模式 HOME 重設（F6 同款）。
3. `SELFHEAL_DRY_RUN`（現有）唔算憑證。

## 3. testlib / 測試
- testlib 快照已含 `backend/data/stream-*.json`/`.log`、SUPERVISION-LOG；補 `.tick-ctx` 隱藏檔。
- t7（用 healthcheck 副本）改為用**真** healthcheck（測試模式）——sed 副本嗰招可以刪，因為而家有 `HC_WATCH_LOG` + 測試模式強制 tmp；保留行數斷言。
- 新 `t13-hc-selfheal-guard.sh`：
  - (a) 真 repo `stream-healthcheck.sh` 喺 `CLAUDECODE=1` 冇 MANUAL → REFUSED exit 2，快照零變（**唔准 env -i 跑真 repo healthcheck**）；`STREAM_WATCH_TEST=1 WATCH_DIR=真 home` → exit 2。
  - (b) 真 repo `stream-selfheal.sh` 冇 env / 半設（缺任一）/ 有 CLAUDECODE / 偽造 `.tick-ctx`（HOME=/tmp/x）→ 全部 REFUSED 零寫入。
  - (c) 測試模式全鏈：healthcheck（stub base 死 port + stub CDN）→ `.tick-ctx` 出現 → selfheal 形態②（consecutiveFail 由 state 種 2）→ RESTART_CMD stub 被 call 帶 `--dry-run` → tick 完 `.tick-ctx` 消失；`kill -9` healthcheck → 殘留 ctx pid 死 → selfheal REFUSED。
  - (d) 假 repo 副本（sed 換 home）prod 模式：有效 `.tick-ctx` → selfheal 行到（stub restart）；冇 → REFUSED。
- 回歸 t1–t13 全 `PROD-SNAPSHOT OK`。

## 4. 驗證交付
- V1 `git diff 2bbd80a HEAD -- ops/lyrics/stream-healthcheck.sh ops/stream/stream-selfheal.sh` 逐行標註 guard/路徑（報告表）。
- V2 真 tick 不變證據：**唔准自己跑真 tick**；改為靜態：prod 路徑下所有新 code 係短路（`[[ -n CLAUDECODE ]]`/`[[ TEST ]]`）、預設值同舊一樣（列出每個變數舊值=新值）。真 tick 由 Opus 等 :07/:37 核。
- V3 t13 + 回歸 + `bash -n` + V5 diff 範圍（`ops/lyrics/stream-healthcheck.sh`、`ops/stream/`、報告）。
- Commit：script 一個；test+報告 `STREAM-HARDEN2-REPORT-20260929.md` 一個。
