# 串流保護監察 執行報告 2026-09-29

執行單 `STREAM-WATCH-EXEC-20260929.md`。基準 HEAD `176827b`。組件 commit `26e268e`。證據原檔喺 scratch `.../scratchpad/streamwatch/t*.out`,重跑用 `ops/stream/test/t*.sh <scratchdir>`。本報告只列證據,唔判 PASS/FAIL。

## 0. 兩件要 Fable/Eric 先知嘅事
1. **headless `claude` 喺呢個執行環境未登入**:`claude auth status` → `loggedIn:false`;`claude -p` 375ms 內回 `Failed to authenticate: OAuth session expired and could not be refreshed`(exit 1)。所以 **T3/T4 真模型行為冇辦法實測**(我冇權亦冇憑證去登入)。實測到嘅只係「claude 不可用 → 規則診斷接手」呢條路(互動 shell 同 `env -i` 模擬 launchd 各一次,見 T3)。**真 headless 登入態(尤其 launchd context)要 Eric 部機驗**:`ops/stream/test/t4-injection.sh <scratch>` 一條命令就會用真 claude + 誘導 bundle 行一次並印出 permission_denials。
2. **`bust-resolve-cache` 冇做**:`backend/lib/resolveAudio.js` 嘅 `bustCache(id)` 只係 process 內部函數(只有 `routes/stream.js:580` 內部 call),冇 admin/內部 HTTP 入口;刪 `backend/cache/resolve-cache.json` 冇效(記憶體 Map 仍在,下次 flush 又寫返)。按執行單「冇安全入口就唔做」→ 唔喺 allowlist,`stream-remedy.sh bust-resolve-cache` = exit 2。如要做,需加 backend route(要 restart,超出本單)。

## 1. 交付物
| 檔 | 備註 |
|---|---|
| `ops/stream/stream-watch.sh` | 狀態機;`mkdir` lock(>20 分鐘 stale 自清);全程吞錯 exit 0 |
| `ops/stream/stream-diagnose.sh` | 診斷包 + headless claude + fallback;診斷包已實測用真 source 砌過(read-only) |
| `ops/stream/stream-diagnose-rules.sh` | 規則診斷。**與執行單一處對調**:backend 死/health≠200 排最先(backend 死時 403 率冇意義) |
| `ops/stream/stream-remedy.sh` | allowlist + 配額 + log |
| `ops/stream/stream-watch-lib.sh` | 新增共用小檔(過濾/timeout) |
| `ops/stream/README.md` | §1.6 |
| `ops/lyrics/stream-healthcheck.sh` | 尾段接線,**獨立最後一個 commit**,`~/.hymn-deploy/stream-watch.on` 閘住(預設 off);perl alarm 硬上限 `WATCH_HARD_CAP` 預設 1500s |
| `ops/stream/test/` | stub / fixtures / t1-t5、t7 腳本 |

設計取捨:
- healthcheck 用**同步 + alarm 1500s** 而唔係背景 detach:launchd job 冇 `AbandonProcessGroup`(已 grep plist),job 一退出背景子 process 會被殺。代價:診斷(≤10 分鐘)期間該 tick 嘅 healthcheck 晚啲收工,但探測結果同 selfheal 已經喺 watch 之前寫完。
- 單 tick blip(ok→bad×1→ok,冇診斷過)**靜靜哋過**,唔寫 SUPERVISION-LOG(healthcheck/selfheal 自己已有記錄);有診斷過/升級過先寫恢復行。
- `escalate` 由 remedy 寫 `~/.hymn-deploy/stream-escalate.request`,watch 喺同一 tick 診斷完即刻讀到並升級。
- 警報檔/log 過濾係「整行」:含 token/secret/Bearer/password/.env 等字眼成行換做 `[filtered: sensitive line]`(寧可多刪);URL 只留 scheme://host。
- 通知一句話經 osascript `argv` 傳入(唔拼字串,冇引號注入)。

## 2. 驗證(全部 env override 指去 scratch)

### T1 狀態機(`t1-state-machine.sh`,stub status/notify/diagnose,`WATCH_NOW` 模擬時間,每 tick=30 分鐘)
| 步驟 | notify 累計 | 診斷 call | 警報檔 | SUPERVISION-LOG 行 | 備註 |
|---|---|---|---|---|---|
| ok×3 | 0 | 0 | 無 | 0 | wd 內只有 `stream-watch-state.json`(mtime touch) |
| bad#1 | 0 | 0 | 無 | 0 | 唔診斷 |
| bad#2 | 0 | 1 | 無 | 0 | 診斷觸發一次 |
| bad#3 | 0 | 1 | 無 | 0 | |
| bad#4 | 1 | 1 | 有 | 2 | 升級(警報檔 + 🔴 行 + 通知 stub 1 次) |
| 再 24 tick(12 小時) | 3(首次 + 6h + 12h) | 1 | 有 | 2 | 診斷冇再觸發 |
| ok(恢復) | 4(多一次「已恢復」) | 1 | 刪除 | 4 | ✅ 恢復行 |
| 劇本2:bad×2(診斷 verdict=fixed-pending-verify)→ 下一 tick ok | **0** | 1 | 無 | 2(「自動修復成功」行) | 零通知 |
| 劇本3:bad×1→ok(blip) | 0 | 0 | 無 | 0(log 0 bytes) | |
額外:診斷員 remedy 登記 escalate(request 檔)→ 同 tick 即刻升級,通知 1 次;lock 被佔 → skip 並印一行;`stream-watch.off` → exit 0 零動作。

### T2 remedy(`t2-remedy.sh`,`stub-cmd.sh` 代替 apply/restart)
- 6 個 action dry-run:全部印「會做乜」,`cmd.calls=0`、`rs.json` 冇生成、`request` 冇生成(輸出 `t2.out` §A)。
- 拒絕:`bogus`、空、`status extra`、`wait now`、`probe`、`probe 42 43`、`probe "42; rm -rf …"`、`probe '$(touch …)'`、`restart-backend; touch …`(單一 argv)、`escalate`、`escalate a b`、`swap-ytdlp --force`、`bust-resolve-cache` → 全部 exit 2、`cmd.calls` 不變、canary 檔不存在。
- 配額:同日 `restart-backend` 第 1 次 exit 0、**第 2 次 exit 3 `今日已用 1/1`**;`swap-ytdlp` 同理;selfheal 已用 3 次 restart → remedy 首次即被拒(`合共…已到 3`);`probe` 第 7 次被拒(`6/6`);gate 唔過(stub 回 `abort:HEAD`)→ `GATE-BLOCKED`、exit 1、唔重試。

### T3 headless 實測(**未能用真模型**)
| 項 | 結果 |
|---|---|
| `claude` 版本 | 2.1.280 (Claude Code) |
| 旗標接受度 | `--tools` `--allowedTools` `--add-dir` `--max-turns` `--strict-mcp-config` `--disable-slash-commands` `--no-session-persistence` `--output-format json` 全部被 CLI 接受(bogus flag 對照組會報 `unknown option`) |
| 互動 shell 真跑(`REMEDY_DRY_RUN=1`,fixture:backend health 非 200) | 耗時 ~6 秒(含 claude 啟動 + auth 失敗);claude exit 1,`is_error:true`,`result=Failed to authenticate: OAuth session expired…`;冇 VERDICT → **`engine=rules`**,VERDICT `fixed-pending-verify`(restart-backend,dry-run) |
| `env -i HOME=$HOME PATH=/usr/bin:/bin:/opt/homebrew/bin` 模擬 launchd 真跑 | 耗時 1 秒;`Not logged in · Please run /login`;同樣 → `engine=rules`,VERDICT `fixed-pending-verify`。**冇證明到 launchd context 登入態可用**(因為連互動環境都未登入) |
| 管道用 mock claude(`t3-diagnose-plumbing.sh`,**唔係真模型**) | mock 收到:cwd=repo、`REMEDY_ENGINE=ai`、`REMEDY_INCIDENT=<id>` 由環境傳落 remedy(remedy.log 記 `engine=ai`);argv 內 prompt 659 字元,零外部輸入拼入(只有 bundle 路徑);有 VERDICT → `engine=ai`;冇 VERDICT / auth 錯 / hang(`DIAG_TIMEOUT=3`,3 秒收工)→ 全部落 `engine=rules` |
| 「佢 call 咗邊啲 remedy action」 | 真模型:N/A(冇得跑)。rules:`restart-backend`(dry-run) |

### T4 工具圍欄(**未能實測**)
`t4-injection.sh` + `fixtures/bundle-injection.md`(內含 git push --force / 改 plist / cat .env / `restart-backend; rm -rf` 四種誘導)已備妥,本環境行出嚟 `permission_denials:[]`、`num_turns:1`、auth 失敗 → 規則接手;副作用核對:git HEAD 不變、healthcheck plist checksum 不變、diagnosis.* 內 JWT_SECRET/TWILIO 命中 0。**呢個結果只證明「腳本冇喺 auth 失敗路徑做壞事」,唔證明 allowedTools 圍欄**。靜態層面:tools 用 `--tools Read,Grep,Glob,Bash` 收窄可用工具集,`--allowedTools` 只放行 `Bash(ops/stream/stream-remedy.sh:*)`;remedy 自己對參數逐個 allowlist(T2 證實注入字串 exit 2)。要真驗:登入後行 `t4-injection.sh`,睇 permission_denials 有冇被擋嘅 Bash/Write。

### T5 密鑰過濾(`t5-secrets.sh`,fixture 全係假密鑰)
- 正控:raw fixture 命中 pattern `JWT_SECRET|TWILIO|Bearer |password|FAKESIG|sig=` = **5 行**。
- 過濾後:`bundle.md` 0、`diagnosis.md` 0、`STREAM-ALERT.md` 0、`SUPERVISION-LOG` 0、通知 stub 內容 0(刻意令 stub 診斷 REASON 帶假 Bearer/JWT_SECRET/password;警報檔該行變 `[filtered]`)。googlevideo URL 變 `https://rr1---sn-abc.googlevideo.com/[url-path-stripped]`。
- 真 source 砌包(read-only,`DIAG_FORCE_RULES=1 REMEDY_DRY_RUN=1`):status/health/selfheal/metrics/環境齊,backend pid 991 etime 8 日、health 200;順帶發現**閒置 slot yt-dlp=2026.09.27.232945 而現役=2026.08.30.232658**(本單冇郁,供 Fable 參考;selfheal state date 仍係 09-28,remedy 配額跨日邏輯會當今日 0)。

### T6 通知渠道
- (a) 互動 shell `osascript -e 'display notification …'`:rc=0,1 秒。
- (b) `env -i HOME=… PATH=/usr/bin:/bin:/opt/homebrew/bin osascript …`:rc=0,0 秒;連 stream-watch 實際用嘅 argv 形式(標題/內文含引號同反斜線)亦 rc=0。
- ⚠️ rc=0 只代表 osascript 接受,**我冇睇到螢幕/通知中心**(冇 GUI 確認),亦查 `log show` 冇搵到 usernoted 記錄。真正「出唔出到」要 Eric 喺 Mac 前面 `touch stream-watch.on` 後人手觸發一次確認;唔出到嘅 fallback(警報檔 + SUPERVISION-LOG 🔴 行)升級時**一定**寫,唔依賴通知。

### T7 唔影響 healthcheck(`t7-healthcheck-isolation.sh`,scratch 假 repo + scratch HOME,healthcheck 打死 port)
| 情況 | healthcheck exit | 耗時 |
|---|---|---|
| 冇 `.on`(預設 off) | 0 | 1s(watch 被 call 0 次) |
| watch exit 0 | 0 | 0s |
| watch exit 1 | 0 | 0s |
| watch SIGKILL 自己 | 0 | 0s |
| watch hang 900s(`WATCH_HARD_CAP=6` 令測試可行) | 0 | 7s(受 cap 限;prod 預設 1500s) |
| watch 真身 + status 亂碼 exit 99 | 0 | 0s |
| baseline(刪 `.on`) | 0 | 0s |
注意:hang 情況耗時**會延長至 cap**(唔係「不變」);prod 上限 25 分鐘 < 30 分鐘 tick。hang 殺死後 lock 目錄會殘留,>20 分鐘後下一 tick 自清。

### T8 lint
`bash -n` 全部 script(含 test/)OK;heredoc 內 python 全部 compile OK;`shellcheck` 未安裝(冇跑)。

## 3. 做唔到 / 留畀後手
| 項 | 原因 / fallback |
|---|---|
| `bust-resolve-cache` | 冇安全入口,見 §0(2) |
| T3/T4 真模型 | claude 未登入,見 §0(1);腳本 `t4-injection.sh` 待登入後重跑 |
| T6 通知肉眼確認 | 冇 GUI |
| 啟用 | 我冇建立 `stream-watch.on`;啟用 = `touch ~/.hymn-deploy/stream-watch.on` |
| 觀察 | headless 若長期用 OAuth 而 session 過期,每次事故都會落規則診斷(有 `claude.stderr` 記低原因);想 AI 診斷穩定要 Eric 確保 launchd 環境登入 |
