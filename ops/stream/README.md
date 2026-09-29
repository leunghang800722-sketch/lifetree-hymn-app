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
| `stream-diagnose.sh` | 砌診斷包 `~/.hymn-deploy/stream-incident-<id>/bundle.md`(pattern 級遮蓋密鑰/URL 簽名;包自足,AI 唔使讀 repo)→ **AI 預設關**:`~/.hymn-deploy/stream-watch.ai-on` 存在(且冇 `stream-watch.no-ai`)先起 headless `claude -p`,cwd=`stream-incident-<id>/ai/`(只有 bundle.md),`--restricted --setting-sources "" --permission-mode dontAsk --permission-prompts none --tools Read,Grep,Glob,Bash --allowedTools "Read,Grep,Glob,Bash(<絕對路徑>/ops/stream/stream-remedy.sh:*)" --disallowedTools "Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent"`(唔加 `--add-dir`)。VERDICT 只由 `--output-format json` 嘅 `result` 欄最後一個非空段落行首解析;AI 聲稱 `fixed-pending-verify` 但 `stream-remedy.log` 冇本 incident 成功動作 → 降為 escalate。冇 ai-on / 冇 claude / 未登入 / timeout / VERDICT 唔合格 → 行 `stream-diagnose-rules.sh`(`engine=rules`)。結果 `diagnosis.md`。 |
| `stream-diagnose-rules.sh` | 規則診斷:backend 死/health≠200→`restart-backend`;最近 1 個鐘 resolve 全 fail(total≥3)且閒置 slot yt-dlp 較新→`swap-ytdlp`;最近 1 個鐘(樣本<10 用 3 個鐘)403 率高→`wait`;其餘→`escalate`。讀邊個欄見檔頭。 |
| `stream-remedy.sh <action>` | AI 同規則共用嘅**唯一**修復入口:`status` / `probe <id>` / `swap-ytdlp` / `restart-backend` / `wait` / `escalate "<reason>"`。其他 exit 2;precondition(node/python3 缺)exit 4 且唔消耗配額。`swap-ytdlp`=行 selfheal 同一 apply 指令 + 換咗即重驗 Layer B + 唔過 rollback(每日 remedy≤1,selfheal 今日換過就唔准)。`restart-backend`=`backend-restart.sh --same-code`(每日 remedy≤1,連 selfheal 合共≤3;gate 唔過唔重試)。配額用 flock,記 `~/.hymn-deploy/stream-remedy-state.json`;每次呼叫記 `stream-remedy.log`(控制字元已 strip、截 200 字)。**危險 env(`REMEDY_STATE`/`REMEDY_LOG`/`REMEDY_DRY_RUN`/`SELFHEAL_*_CMD`/`WATCH_DIR` 等)一律忽略**,只有 `STREAM_WATCH_TEST=1` 且 `REMEDY_STATE` 喺 tmp 下先認(測試用;測試模式下預設 restart 自動加 `--dry-run`、預設 swap 唔真行)。**冇 `bust-resolve-cache`**(冇安全入口,已由 allowlist 同 prompt 移除)。 |
| `stream-watch-lib.sh` | 共用:補 launchd 缺嘅 PATH(`/opt/homebrew/bin` 等)、密鑰過濾 `wlib_filter`(JWT/Twilio/Bearer/URL sig/userinfo/`secret|password|token=` 遮值)、perl alarm timeout(`wlib_capped_pg` 殺自己起嘅 process group)。 |

### 人手操作
```bash
touch ~/.hymn-deploy/stream-watch.on      # 啟用(接線已喺 stream-healthcheck.sh 尾);rm 即停用
touch ~/.hymn-deploy/stream-watch.off     # 成層停(watch 即刻 exit 0)
touch ~/.hymn-deploy/stream-watch.ai-on   # 啟用 AI 診斷(預設關=只行規則;要 claude 已登入 + 真模型圍欄測試通過先好開)
touch ~/.hymn-deploy/stream-watch.no-ai   # 強制只行規則診斷(優先於 ai-on)
# 人手清 incident(警報一直唔走/想重來):
rm -f ~/.hymn-deploy/stream-watch-state.json ~/.hymn-deploy/STREAM-ALERT.md ~/.hymn-deploy/stream-escalate.request
rmdir ~/.hymn-deploy/stream-watch.lock 2>/dev/null     # 卡住嘅 lock(>20 分鐘會自動清)
tail -f /tmp/hymn_stream_watch.log ~/.hymn-deploy/stream-remedy.log
```
測試腳本 + stub + fixtures 喺 `ops/stream/test/`(t1 狀態機、t2 remedy、t3 診斷管道+偽造 VERDICT、t4 誘導、t5 密鑰、t6 launchd 等效/並發/state 損毀/stale request、t7 healthcheck 隔離;全部 env override 去 scratch,唔掂 prod);詳見 `STREAM-WATCH-REPORT-20260929.md` 同 `STREAM-WATCH-FIX-REPORT-20260929.md`。
⚠️ headless claude 要有效登入(launchd context 都要);`claude auth status` 顯示 loggedIn=false 時會自動落規則診斷,不會靜靜失效。

### 已知限制
- **L3**:watch 掛喺 healthcheck 尾;healthcheck 自己死咗/唔行,watch 都唔會行(Eric 已拍板唔要 dead-man)。`stale` 觸發喺 healthcheck 內結構上幾乎唔會 fire。**偵測本身死咗,呢層唔會知。**
- 每個 tick(連健康 tick)都會短暫 `mkdir`/`rmdir` `~/.hymn-deploy/stream-watch.lock`(M1:所有 state 讀寫喺 lock 內);攞唔到 lock=成個 tick 零寫。
- state 損毀(JSON 壞/型別錯)會備份 `stream-watch-state.json.corrupt-<ts>` 並重置,SUPERVISION-LOG 記一行。
- launchd 下 healthcheck/selfheal 本身冇補 PATH(本層已補,selfheal 未改):見 `STREAM-WATCH-FIX-REPORT-20260929.md`。
