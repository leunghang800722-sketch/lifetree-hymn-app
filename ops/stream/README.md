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
| `stream-diagnose.sh` | 砌診斷包 `~/.hymn-deploy/stream-incident-<id>/bundle.md`(全部過密鑰/URL 簽名過濾)→ headless `claude -p`(`--tools Read,Grep,Glob,Bash` + `--allowedTools "Read,Grep,Glob,Bash(ops/stream/stream-remedy.sh:*)"`,prompt 寫死,冇自由 shell)→ 冇 claude / 未登入 / timeout / 冇 VERDICT 就行 `stream-diagnose-rules.sh`(`engine=rules`)。結果 `diagnosis.md`。 |
| `stream-diagnose-rules.sh` | 規則診斷 fallback:backend 死/health≠200→`restart-backend`;resolve 全 fail 且閒置 slot yt-dlp 較新→`swap-ytdlp`;403 率高→`wait`;其餘→`escalate`。 |
| `stream-remedy.sh <action>` | AI 同規則共用嘅**唯一**修復入口:`status` / `probe <id>` / `swap-ytdlp` / `restart-backend` / `wait` / `escalate "<reason>"`。其他 exit 2。配額(每日 swap≤1 連 selfheal 合共≤2、restart≤1 連 selfheal 合共≤3、probe 每 incident≤6)記 `~/.hymn-deploy/stream-remedy-state.json`,每次呼叫記 `~/.hymn-deploy/stream-remedy.log`。`REMEDY_DRY_RUN=1` 側效應歸零。**冇 `bust-resolve-cache`**(`bustCache()` 只係 backend process 內部函數,冇安全 HTTP 入口)。 |
| `stream-watch-lib.sh` | 共用:密鑰/URL 過濾 `wlib_filter`、perl alarm timeout。 |

### 人手操作
```bash
touch ~/.hymn-deploy/stream-watch.on      # 啟用(接線已喺 stream-healthcheck.sh 尾);rm 即停用
touch ~/.hymn-deploy/stream-watch.off     # 成層停(watch 即刻 exit 0)
touch ~/.hymn-deploy/stream-watch.no-ai   # 只行規則診斷,唔起 headless claude
# 人手清 incident(警報一直唔走/想重來):
rm -f ~/.hymn-deploy/stream-watch-state.json ~/.hymn-deploy/STREAM-ALERT.md ~/.hymn-deploy/stream-escalate.request
rmdir ~/.hymn-deploy/stream-watch.lock 2>/dev/null     # 卡住嘅 lock(>20 分鐘會自動清)
tail -f /tmp/hymn_stream_watch.log ~/.hymn-deploy/stream-remedy.log
```
測試腳本 + stub + fixtures 喺 `ops/stream/test/`(全部 env override 去 scratch,唔掂 prod);詳見 `STREAM-WATCH-REPORT-20260929.md`。
⚠️ headless claude 要有效登入(launchd context 都要);`claude auth status` 顯示 loggedIn=false 時會自動落規則診斷,不會靜靜失效。
