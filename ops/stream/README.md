# ops/stream/ — 串流自動修復梯

`STREAM-SELFHEAL-PLAN-20260905.md` 落地(Eric 拍板 Q1(a) 只喺壞咗先自動換 yt-dlp、
Q3 准自動重開 backend)。由 `ops/lyrics/stream-healthcheck.sh`(每 30 分鐘一 tick,
2026-09-05 由 3 小時加密)每次判斷完尾段呼叫,連續 unhealthy≥2 次先郁手,一日內
最多自動換 yt-dlp 1 次、自動重開 backend 2 次,唔會嘗試繞過部署 gate。

| 檔案 | 做乜 |
|---|---|
| `stream-selfheal.sh` | 收 healthcheck 傳嚟嘅七個數(healthy_a/healthy_b/mid/midfail/ok/fail/detail),判形態(①yt-dlp/②backend/③YouTube側)、決定郁唔郁手、寫 `backend/data/stream-selfheal-state.json` + `backend/data/stream-selfheal.log` + `docs/SUPERVISION-LOG.md`。`SELFHEAL_DRY_RUN=1` 全部側效應歸零,淨係印。 |
| `stream-status.sh` | 合併健康檢查 state + selfheal state + 現役 yt-dlp 版本 + backend pid,印一行 JSON,俾 Dispatch 排程 check-in(exit 0=健康/1=唔健康/2=stale,即偵測本身都死咗)。 |

手動查現況(唔會郁任何嘢):

```bash
ops/stream/stream-status.sh
```

要測自動修復梯本身,全部參數(`SELFHEAL_STATE`/`HEALTH_STATE`/`YTDLP_LINK`/
`SELFHEAL_APPLY_CMD`/`SELFHEAL_RESTART_CMD`/`HYMN_STREAM_BASE` 等)都可以 env
override 指去 scratch 目錄,唔會掂 production 檔案 —— 詳細案例見
`STREAM-SELFHEAL-EXEC-20260905.md`。

## 串流保護監察層(STREAM-WATCH-EXEC-20260929)

Eric 09-29 拍板:唔要手機推送、唔要 dead-man;出事**自動即刻診斷 + 盡量自動修**,修唔到先用警報檔 + Mac 通知。
掛喺 healthcheck tick 尾(selfheal 之後),**預設 OFF**:`~/.hymn-deploy/stream-watch.on` 存在先行。日常(健康)零 Claude session、零通知、零寫檔(只 touch state 檔 mtime)。

| 檔案 | 做乜 |
|---|---|
| `stream-watch.sh` | 邊緣觸發狀態機(state:`~/.hymn-deploy/stream-watch-state.json`)。ok→bad 只記 incident;bad 連續 2 tick 觸發**一次**診斷;診斷後仲未好再過 2 tick(或診斷員/規則要求 escalate)→ 升級:`~/.hymn-deploy/STREAM-ALERT.md` + `docs/SUPERVISION-LOG.md` 🔴 行 + macOS 通知;已升級每 6 小時重發通知;恢復時只有升級過先發「已恢復」通知(自動修好嘅唔煩人)。 |
| `stream-diagnose.sh` | 砌診斷包 `~/.hymn-deploy/stream-incident-<id>/bundle.md`(pattern 級遮蓋密鑰/URL 簽名;包自足)→ **AI 預設關**:`~/.hymn-deploy/stream-watch.ai-on` 存在(且冇 `stream-watch.no-ai`)先起 headless `claude -p`。**AI 完全冇 shell**:`--tools "Read,Grep,Glob"`(+`--disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Task` 雙重擋)`--restricted --setting-sources "" --permission-mode dontAsk --permission-prompts none --strict-mcp-config --disable-slash-commands --no-session-persistence`,cwd=`stream-incident-<id>/ai/`(只有 bundle.md/probes.md),唔加 `--add-dir`,冇任何 `--allowedTools Bash(...)`。**兩回合**(各 `--max-turns 6`,`DIAG_MAX_TURNS`):回合 1 讀包,出 `PROBES:`(≤3,`status`/`probe <id>`)或直接最終判詞;`stream-diagnose.sh`(唔係 AI)代行探測(`REMEDY_ENGINE=ai`)寫 `ai/probes.md`;回合 2 出 `VERDICT/REASON/ACTIONS:`(每行一個動作,≤2:`wait`/`escalate "<≤200字>"`/`swap-ytdlp`/`restart-backend`)。解析只信 json `result` 欄最後一個非空段落;動作行 regex 全匹配 allowlist,其他行忽略並記 `ignored=<n>`;由 script 逐個 call remedy,remedy exit code 決定實際結果;AI 話 `fixed-pending-verify` 但冇任何修復動作成功 → 降 `escalate`。冇 ai-on / 冇 claude / 未登入 / timeout / 冇有效 VERDICT → `stream-diagnose-rules.sh`(`engine=rules`)。結果 `diagnosis.md`(含 `ai_cost_usd`),`ai/actions.md`、`ai/probes.md`、`diagnosis-r1.json`。**成本**:每回合 ≈ US$0.013–0.03(sonnet);每宗事故 ≤2 回合 ≈ US$0.03–0.06,冇修復重試迴圈。launchd 冇 `USER` → `stream-watch-lib.sh` 自動 `export USER=$(id -un)`(冇會報 Not logged in)。 |
| `stream-diagnose-rules.sh` | 規則診斷:backend 死/health≠200→`restart-backend`;最近 1 個鐘 resolve 全 fail(total≥3)且閒置 slot yt-dlp 較新→`swap-ytdlp`;最近 1 個鐘(樣本<10 用 3 個鐘)403 率高→`wait`;其餘→`escalate`。讀邊個欄見檔頭。 |
| `stream-remedy.sh <action>` | AI 同規則共用嘅**唯一**修復入口:`status` / `probe <id>` / `swap-ytdlp` / `restart-backend` / `wait` / `escalate "<reason>"`(另有 `drill-restart`,只供演習,見下節;`REMEDY_ENGINE=ai` 只准 status/probe/wait/escalate/swap-ytdlp/restart-backend,其餘 exit 2)。其他 exit 2;precondition(node/python3 缺)exit 4 且唔消耗配額。`swap-ytdlp`=行 selfheal 同一 apply 指令 + 換咗即重驗 Layer B + 唔過 rollback(每日 remedy≤1,selfheal 今日換過就唔准)。`restart-backend`=`backend-restart.sh --same-code`(每日 remedy≤1,連 selfheal 合共≤3;gate 唔過唔重試)。配額用 flock,記 `~/.hymn-deploy/stream-remedy-state.json`;每次呼叫記 `stream-remedy.log`(控制字元已 strip、截 200 字)。shebang `#!/bin/bash -p`(`BASH_ENV`/`ENV`/`SHELLOPTS`/`BASHOPTS` 忽略、唔 import exported function;`CDPATH`/`GLOBIGNORE`/`BASH_ENV` 另外喺 script 頂顯式 unset,因為 -p 擋唔晒);prod 模式 `HOME` 一律重設做本 uid 真 home(dscl)。**危險 env(`REMEDY_STATE`/`REMEDY_LOG`/`REMEDY_DRY_RUN`/`SELFHEAL_*_CMD`/`WATCH_DIR` 等)一律忽略**,只有 `STREAM_WATCH_TEST=1` 且 `REMEDY_STATE` 喺 tmp 下先認(測試用;測試模式下預設 restart 自動加 `--dry-run`、預設 swap 唔真行)。**冇 `bust-resolve-cache`**(冇安全入口,已由 allowlist 同 prompt 移除)。 |
| `stream-watch-lib.sh` | 共用:補 launchd 缺嘅 PATH(`/opt/homebrew/bin` 等)、密鑰過濾 `wlib_filter`(JWT/Twilio/Bearer/URL sig/userinfo/`secret|password|token=` 遮值)、perl alarm timeout(`wlib_capped_pg` 殺自己起嘅 process group)。 |

### 人手操作
```bash
touch ~/.hymn-deploy/stream-watch.on      # 啟用(接線已喺 stream-healthcheck.sh 尾);rm 即停用
touch ~/.hymn-deploy/stream-watch.off     # 成層停(watch 即刻 exit 0)
touch ~/.hymn-deploy/stream-watch.ai-on   # 啟用 AI 診斷(預設關=只行規則;要 claude 已登入;rm 即關;no-ai 優先)
touch ~/.hymn-deploy/stream-watch.no-ai   # 強制只行規則診斷(優先於 ai-on)
# 人手清 incident(警報一直唔走/想重來):
rm -f ~/.hymn-deploy/stream-watch-state.json ~/.hymn-deploy/STREAM-ALERT.md ~/.hymn-deploy/stream-escalate.request
rmdir ~/.hymn-deploy/stream-watch.lock 2>/dev/null     # 卡住嘅 lock(>20 分鐘會自動清)
tail -f /tmp/hymn_stream_watch.log ~/.hymn-deploy/stream-remedy.log
```
測試腳本 + stub + fixtures 喺 `ops/stream/test/`(**每支必 source `testlib.sh`**,見下節「測試點寫」;t1 狀態機、t2 remedy、t3 診斷管道+偽造 VERDICT、t4 誘導、t5 密鑰、t6 launchd 等效/並發/state 損毀/stale request、t7 healthcheck 隔離、t9 演習、t10 `-p` shebang、t11 `san()`/`ctl` 剷字元、t12 prod 守衛;全部 env override 去 scratch,唔掂 prod);詳見 `STREAM-WATCH-REPORT-20260929.md` 同 `STREAM-WATCH-FIX-REPORT-20260929.md`。
⚠️ headless claude 要有效登入(launchd context 都要);`claude auth status` 顯示 loggedIn=false 時會自動落規則診斷,不會靜靜失效。

### 已知限制
- **L3**:watch 掛喺 healthcheck 尾;healthcheck 自己死咗/唔行,watch 都唔會行(Eric 已拍板唔要 dead-man)。`stale` 觸發喺 healthcheck 內結構上幾乎唔會 fire。**偵測本身死咗,呢層唔會知。**
- 每個 tick(連健康 tick)都會短暫 `mkdir`/`rmdir` `~/.hymn-deploy/stream-watch.lock`(M1:所有 state 讀寫喺 lock 內);攞唔到 lock=成個 tick 零寫。
- state 損毀(JSON 壞/型別錯)會備份 `stream-watch-state.json.corrupt-<ts>` 並重置,SUPERVISION-LOG 記一行。
- launchd 下 healthcheck/selfheal 本身冇補 PATH(本層已補,selfheal 未改):見 `STREAM-WATCH-FIX-REPORT-20260929.md`。

### 點做演習(自動 restart 真演習;TOKEN-REVOKE-DRILL-EXEC-20260929 Part B)
目的:喺真 launchd context(healthcheck tick 內)行一次真 `backend-restart.sh --same-code`,驗最後 `launchctl bootout/bootstrap gui/$UID` 喺 agent context 得唔得。
```bash
touch ~/.hymn-deploy/stream-drill.request     # 然後等下一個 healthcheck tick(≤30 分鐘)
cat ~/.hymn-deploy/stream-drill.log           # 一行:時間 | watch-rc | 總用時 | DRILL-RESULT cwd/uid/xpc/ppid/restart_rc/dur/health/pid_before/pid_after/lstart_after/path
```
- `stream-watch.sh` tick 開頭(攞到 lock 後、狀態機前)見到 request → `mv` 成 `stream-drill.inflight` → `REMEDY_ENGINE=drill stream-remedy.sh drill-restart`(上限 240 秒)→ 結果 append `stream-drill.log`。**一次性**;`stream-watch.off` 存在時唔行;演習失敗/逾時唔影響狀態機同 exit 0。
- `drill-restart` 前置:`REMEDY_ENGINE=drill`(AI/手動/其他標籤 exit 2)、inflight 係自己嘅普通檔(唔准 symlink)且 <10 分鐘,否則 exit 2 零側效應;一開始就刪 inflight;自己每日 ≤1 配額(`drills`,同 `restarts` 互不影響),用晒 exit 3。
- gate 唔過(HEAD 未 approve)=回報 `GATE-BLOCKED`,唔重試唔繞過——**演習前要先由人 approve + 部署**。成功後等 10 秒打 `/api/health`,記 http code + backend pid/lstart 前後。
- 測試:`test/t9-drill.sh <scratchdir>`(`STREAM_WATCH_TEST=1`,自動 `--dry-run`,唔會真 restart)。

### 點解會 REFUSED / 人手點用 / 測試點寫(STREAM-HARDEN-EXEC-20260929)
**點解**:三次事故——(1) Opus 第二輪 t2 D:case **故意**模擬 prod,靠假 HOME 引開寫入,F6 之後 HOME 引唔開;(2) 最終驗收 zsh `env $E`(zsh 唔拆字);(3) 執行者跑 t7 時 watch/healthcheck 本身冇測試模式又寫死路徑,寫咗 2 行真 watch log——加上 Fable 中午誤觸。方向改為「忘記 = 拒絕」,覆蓋 remedy / diagnose / watch;**healthcheck / selfheal 唔包**(範圍外,紅線唔准改)。
- `stream-watch.sh` 每個 tick 攞到 lock 後寫 `$WATCH_DIR/.watch-ctx`(`pid=<watch pid> ts=<epoch>`,umask 077),任何 exit 路徑(含 TERM/INT/HUP)trap 刪走;`kill -9` 會殘留,但 pid 死咗 / mtime ≥30 分鐘即失效。
- **「測試模式」定義**:`stream-remedy.sh` = `STREAM_WATCH_TEST=1` **且** `REMEDY_STATE`、`REMEDY_LOG`、`WATCH_DIR` **三個都設咗**,而且都喺 tmp 下(`/tmp`、`/private/tmp`、`/var/folders`、`/private/var/folders`;要絕對路徑、冇 `..`、**解析 symlink 後**仍喺 tmp)。缺任何一個 / 有一個唔喺 tmp = 當 prod 模式 → 無憑證 REFUSED 零寫入。測試模式下 `SELFHEAL_STATE` 未設就指去 `$WATCH_DIR/selfheal-state.json`(唔 fallback 去 `backend/data/`)。`stream-diagnose.sh` = `STREAM_WATCH_TEST=1` 且 `WATCH_DIR`(及 `DIAG_DIR` 如有)喺 tmp(同樣解析 symlink)。
- `stream-remedy.sh` / `stream-diagnose.sh` **prod 模式**(即非上面測試模式)必須滿足其一,否則 stderr 印 `REFUSED: prod 模式只准由 stream-watch tick 內呼叫;人手用請設 REMEDY_MANUAL=1`(diagnose 係 `DIAG_MANUAL=1`)、exit 2、**零寫入**(連 remedy.log 都唔寫):
  1. `.watch-ctx` 存在(普通檔、唔係 symlink)、mtime <30 分鐘、pid 仍生存(prod 一律由真 HOME 計路徑,env 搬唔走);
  2. 人手明示 `REMEDY_MANUAL=1`(diagnose:`DIAG_MANUAL=1`,並代子 remedy 一併明示)。
- 額外:`CLAUDECODE` 非空(Claude 工具 shell)而冇 MANUAL → 即使有 ctx 都 REFUSED。
- `REMEDY_DRY_RUN=1` **唔算**憑證(dry 都要 MANUAL)。
- **`stream-watch.sh` 入口 guard**(lock 之前、任何寫入之前):(a) 非測試模式而 `CLAUDECODE` 非空、冇 `WATCH_MANUAL=1` → `REFUSED` exit 2 零寫入(launchd tick 冇 CLAUDECODE、冇 `STREAM_WATCH_TEST`,唔受影響;人手喺 Claude shell 行真 tick 要 `WATCH_MANUAL=1`);(b) `STREAM_WATCH_TEST=1` 時 `WATCH_DIR`(同已設嘅 `WATCH_STATE`/`WATCH_LOG_MD`/`WATCH_ALERT_FILE`)必須喺 tmp,否則 exit 2;`WATCH_LOG_MD` 預設 `$WATCH_DIR/SUPERVISION-LOG.md`、`WATCH_ALERT_FILE` 預設 `$WATCH_DIR/STREAM-ALERT.md`、`WATCH_NOTIFY_CMD` 未設 = `/usr/bin/true`(唔發真通知)⇒ 測試模式結構上唔會掂 `docs/SUPERVISION-LOG.md`、真警報、真 osascript。
- watch 收尾 trap 只刪「內容 pid==自己」嘅 `.watch-ctx`(stale lock 被第二個 tick 清走後唔會拆佢嘅憑證)。

**人手用**(睇現況/試):`REMEDY_MANUAL=1 REMEDY_DRY_RUN=1 ops/stream/stream-remedy.sh wait`;真行 `REMEDY_MANUAL=1 ops/stream/stream-remedy.sh status`(配額照計、log 照寫 engine=manual)。診斷:`DIAG_MANUAL=1 ops/stream/stream-diagnose.sh <id>`(會寫 `~/.hymn-deploy/stream-incident-<id>/`)。

**測試點寫**:每支 `test/t*.sh` 開頭 `set -u` 之後必須 `. "$(dirname "$0")/testlib.sh" "$@"`(第一個參數 = tmp 下 scratch 目錄)。testlib 會:export `STREAM_WATCH_TEST=1`、預設 `WATCH_DIR/REMEDY_STATE/REMEDY_LOG/SELFHEAL_STATE/DIAG_DIR/WATCH_LOG_MD/STUB_DIR` 去 scratch、`WATCH_NOTIFY_CMD`=stub-notify(caller 預設值須過 tmp 檢查(解析 symlink 後),case 內覆蓋可用 `tl_require_tmp <path>`)、記 prod 快照(`~/.hymn-deploy/*` 檔名+md5、`/tmp/hymn_stream_watch.log` 行數+md5、`docs/SUPERVISION-LOG.md` md5、`backend/data/stream-*.json`/`*.log` md5、`backend/tools/yt-dlp` readlink 目標、`:3001` listener pid(唯讀 lsof)),EXIT 時再比,有差異 → 印 `PROD-WRITE DETECTED: <檔>`(pid 變咗另印 `PROD-RESTART DETECTED`)並 exit 1,無差異印 `PROD-SNAPSHOT OK`。⚠️ 真 launchd healthcheck tick(每小時 :07/:37)會合法更新 `stream-health-state.json` 等,跑測試避開呢啲時間窗,否則可能假紅。要測「prod 模式 + 可控 ctx」用 scratch 假 repo 副本(見 t12),唔准喺真 repo 用 prod 模式(`REMEDY_MANUAL=1`/`DIAG_MANUAL=1`)跑 remedy/diagnose——`grep -rn "REMEDY_MANUAL=1\|DIAG_MANUAL=1" ops/stream/test/` 只應該見到假 repo 副本嘅呼叫。
