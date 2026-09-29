# STREAM-HARDEN 報告(小瑕疵收尾 + 測試防呆)2026-09-29 晚

基準 HEAD `fa16c5a`。執行:Sonnet(只出證據,唔判 PASS/FAIL,Opus 驗收要用「唔設任何 env 直接跑」做負控)。
scratch:`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/harden/`(`t*.final2.out` 係最後一輪 t1–t12 全輸出、`v3.result`、`v3.sh`、`v2-neg.sh`)。

## 2.1 根因(俾 Eric 睇)
兩次事故(Opus 第二輪 t2 section D;Opus 最終驗收 20:47 zsh `env $E …`)同 Fable 中午誤觸,共同點:**remedy/diagnose 預設就係 prod 模式**,測試模式要靠 caller 記得設 `STREAM_WATCH_TEST=1` + tmp 路徑。一個 shell 拆字差異(zsh 唔拆 `$E`,整串變成一個 env 賦值)、一次 edit 出錯,就靜靜跌落 prod。設計上「忘記 = 寫 prod」係錯嘅方向。今次改成「忘記 = 拒絕」:prod 模式要 watch tick 內先有嘅憑證(或者人手明示 MANUAL),否則 exit 2、零寫入;測試 harness 再加一道 prod 快照斷言做最後防線。

## Part 1 四個小瑕疵
| # | 狀態 |
|---|---|
| 1a t7 寫 prod watch log | t7 尾加行數 assert(跑前後不變,否則 stderr `PROD-WRITE` + exit 1);testlib 快照亦覆蓋該檔。**測試過程中真係抓到一次**(見「偏差/側效應」)。 |
| 1b `san()` 切爛變空 | `76dca5e` 已改 byte 模式;新 `test/t11-san.sh`:正控 `✅ 串流監察恢復` byte 不變;U+202E/2028/0085/200B/2066/BOM 全剷;`a\xe4\xb8` 原樣保留、stderr 零輸出;`LANG` 全 unset / `LC_ALL=C` / UTF-8 三種 locale + 150 個「串」→ 非空、result 整格 ≤200(C:byte;UTF-8:字元);escalate 端到端 request 檔有寫;`stream-diagnose.sh` 解析器 `ctl` regex 由原檔抽出實跑。 |
| 1c drill pid 量度 | `stream-remedy.sh` `d_pid()` 改 `/usr/sbin/lsof -nP -t -iTCP:<port> -sTCP:LISTEN`(port 由 `$BASE` 解析,預設 3001),攞到 pid 後 `ps -o command= -p` 核含 `backend/server.js`,唔含記 `<pid>?`,冇 listener 空(顯示 none)。`d_lst` 剝 `?`。**保留** `DRILL_PGREP_PAT`,但只測試模式認、只作 override(t9 B-6 嘅 scratch 假 backend 唔 listen port);prod 模式唔認。真機驗:`lsof :3001` → 91265,命令行含 `backend/server.js`。 |
| 1d ZWJ 組合 emoji | remedy `san()` 早已剔走 U+200D(t11 正控 👨‍👩‍👧 byte 不變 PASS)。**發現 `stream-diagnose.sh` 嘅 `ctl` 用 `​-‏` 範圍其實包咗 U+200D**,改為 `​‌‎‏`(同 remedy 同一名單),t11 實跑核對 ZWJ 保留、其餘剷走。 |

## 2.2 / 2.3 實裝摘要
- `stream-watch-lib.sh`:新 `wlib_ctx_valid`(普通檔非 symlink、mtime<1800s、`pid=` 存活)、`wlib_prod_guard`(MANUAL=1 → 過;`CLAUDECODE` 非空 → 拒;ctx 有效 → 過;否則 stderr `REFUSED: prod 模式只准由 stream-watch tick 內呼叫;人手用請設 <VAR>=1`、exit 2)、`wlib_real_home`(dscl)。
- `stream-watch.sh`:攞到 lock 後寫 `$WATCH_DIR/.watch-ctx`(`pid=$$ ts=`,umask 077),EXIT trap 刪;另 `trap 'exit 143' TERM INT HUP` 令信號都行到 EXIT trap;`kill -9` 會殘留(pid 死 → 失效)。
- `stream-remedy.sh`:`TESTMODE=0` 時喺 `. lib` 之後、任何 log/state 寫入之前 call guard(ctx 路徑由真 HOME 計);`REMEDY_MANUAL=1` 明示。`REMEDY_DRY_RUN=1` 唔算憑證。
- `stream-diagnose.sh`:測試模式 = `STREAM_WATCH_TEST=1` 且 `WATCH_DIR`(及 `DIAG_DIR`)喺 tmp;否則 prod → guard(ctx 用 `wlib_real_home`),`DIAG_MANUAL=1` 會代子 remedy 一併 `REMEDY_MANUAL=1`。guard 喺 `mkdir` 之前。
- `test/testlib.sh`:見檔頭。全部 t1–t10 已改 source;t2 D 全部改驗 REFUSED;t9 B-7 加 `REMEDY_MANUAL=1`;t7 加 assert + 明確 `WATCH_DIR`;新 `t11-san.sh`、`t12-guard.sh`。
- README 已加「點解會 REFUSED / 人手點用 / 測試點寫」。

## 驗證
- **V1**:`cd /` + 絕對路徑 + scratch 參數,t1–t12 全部 rc=0,每支尾 `PROD-SNAPSHOT OK`(`*.final2.out`)。不傳 scratch / scratch 唔喺 tmp → testlib exit 2。
- **V2**:負控 `v2-neg.sh`(source testlib 後寫 `~/.hymn-deploy/zz-canary`,測試本身 `exit 0`)→ 輸出 `PROD-WRITE DETECTED: > e8bf…  /Users/macbookpro/.hymn-deploy/zz-canary`、rc=1。canary 即刻 `rm -f`,`ls` 確認唔存在,`md5 ~/.hymn-deploy/*` 同負控前基線逐行一致、檔名清單一致。
- **V3**(`v3.result`):`cd /` + `env -i HOME=<scratch 假 home> PATH=/usr/bin:/bin:/usr/sbin:/sbin`,真 `stream-watch.sh` 跑兩個 bad tick:tick 內 `.watch-ctx = pid=71055 ts=…  watch pid alive? yes`;包裝以 prod 模式(冇 STREAM_WATCH_TEST)行假 repo 嘅 diagnose(engine=rules)+ remedy wait 全部行到,remedy.log 寫落假 home;每個 tick 完 `ctx after tick: gone`。另 status stub `kill -9` watch → `.watch-ctx` 殘留、pid 已死 → prod 模式 remedy `wait` → REFUSED exit 2、remedy.log 冇建。(prod 模式 + 可控 ctx 用假 repo 副本,只 sed 換兩處「真 HOME」,守衛邏輯原封。)
- **V4**(真 repo、真 script、冇 ctx,前後 `md5 ~/.hymn-deploy/*`/檔名/watch log 行數不變):
  - 事故1 舊 t2 D 寫法 `env -u STREAM_WATCH_TEST HOME=… REMEDY_STATE=… REMEDY_LOG=… WATCH_DIR=… SELFHEAL_RESTART_CMD=… restart-backend`(Claude shell 原樣 CLAUDECODE=1,及 `-u CLAUDECODE` 兩種)→ exit 2 REFUSED。
  - 事故2 `zsh -c "E='STREAM_WATCH_TEST=1 REMEDY_STATE=… …'; env \$E remedy wait/status"`(兩種 CLAUDECODE)→ 4 次全部 exit 2 REFUSED。
  - Fable 類:冇 env `drill-restart`、`REMEDY_ENGINE=drill drill-restart`、`stream-diagnose.sh` → 全部 exit 2。
  - t12 (a)(e)(g) 亦做同類斷言(真 script、`env -i`)。
- **V5**:`bash -n` ops/stream/*.sh + test/*.sh 全部通過;`git diff --stat` 見 commit(只 `ops/stream/` + 本報告)。

## 偏差 / 側效應(如實)
1. **V3 跟執行單「tick 完 ctx 消失、diagnose/remedy 行到」用假 home + 假 repo 副本做**,唔係喺真 repo 用 prod 模式(硬性紅線禁止)。t12 (c)(d) 同理。
2. **testlib 測試模式唔檢查 ctx**(t1–t11 靠 STREAM_WATCH_TEST=1+tmp 路徑),所以執行單話「t1/t3 跑 watch 全鏈 remedy (i) 條件自然滿足」係冇被實際行到嘅路徑;ctx 行為只喺 t12/V3 驗。
3. **寫咗 2 行落 prod `/tmp/hymn_stream_watch.log`(行數 4→6)**:`2026-09-29 21:30 DIAGNOSE incident=20260929-212659` 同 `… DIAGNOSED verdict=wait engine=stub actions=none`。成因:我新加嘅 testlib 預設 `WATCH_DIR=$S/tl-wd` 跨 run 累積 state,t7 case 5 真 watch 第二次跑升到 DIAGNOSE,經 healthcheck 寫死路徑寫咗 prod log。t7 assert + testlib 快照即刻捉到(`PROD-WRITE DETECTED: < 4 / > 6`),已修(testlib 每次清自己 `tl-*` 預設目錄;t7 明確 `WATCH_DIR=$H/.hymn-deploy`),之後 t7 連跑 3 次 + 全套一次行數都係 6。冇刪嗰兩行(刪都係寫 prod)。
4. 唯一其他 prod 寫入:V2 canary(已刪,證據見上)。`~/.hymn-deploy/*` 內容前後一致;冇碰 `docs/SUPERVISION-LOG.md`、`backend/**`。
5. 測試期間有讀 `~/.hymn-deploy/*`(md5)、`/tmp/hymn_stream_watch.log`、真 backend `lsof :3001`(只讀)。真 launchd tick(:07/:37)會合法更新 `backend/data/stream-health-state.json` 令快照假紅——跑測試已避開時間窗,README 已註明。
6. 冇 restart/launchctl/approve/OTA/swap/drill.request;冇真模型 call(mock-claude);冇打 YouTube/googlevideo;冇讀 .env/secret/token。起過嘅 process 全部自己收:t9 http.server/假 backend(測試自收)、t12 `sleep 120`(核 PPID+命令行後 kill)。
7. `stream-selfheal.sh`、`stream-status.sh`(工作樹原有未 commit 改動)冇掂、冇入 commit。
