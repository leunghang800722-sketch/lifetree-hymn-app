# STREAM-DRILL-REPORT-20260929(Part B:演習入口)

只出證據,唔判 PASS/FAIL。完整輸出:`ops/stream/test/t9-drill.sh <scratch>`(本次輸出存 scratchpad drillB/t9.out)。

## 改動
- `stream-remedy.sh`:新 action `drill-restart`(+ quota kind `drill`,state 新欄 `drills`)。
- `stream-watch.sh`:第 0.5 節(lock 後、status 前)處理 `stream-drill.request`。
- `README.md`:「點做演習」。
- `test/t9-drill.sh`、`test/stub-drill-fail.sh`。

## 設計要點 / 偏離執行單
1. 授權=WATCH_DIR 內 inflight(prod 下 remedy 已重設 WATCH_DIR=~/.hymn-deploy,env 唔能改),另加:必須 `REMEDY_ENGINE=drill`、inflight 要係自己嘅普通檔非 symlink。**偏離/加碼**:執行單只講 ai 拒;`REMEDY_ENGINE` 只係標籤(N1 下 caller 可偽造),所以唔靠佢做安全,只當一層額外拒(AI 若用 env 前綴偽造 drill 標籤,仍需要 ~/.hymn-deploy 內 <10 分鐘嘅 inflight,而 prod 模式 WATCH_DIR 唔受 env 影響;N1 本身「STREAM_WATCH_TEST=1+tmp REMEDY_STATE」測試模式路徑會令 restart 變 --dry-run,但 SELFHEAL_RESTART_CMD 仍可換——呢個係既有 N1 面,drill-restart 冇擴大佢,亦冇加新 env)。冇加新 prod 可 override 嘅 env。
2. 測試專用 env(只 TESTMODE 認):`DRILL_HEALTH_WAIT`(預設 10)。watch 端 `WATCH_DRILL_CMD`/`WATCH_DRILL_CAP` 同既有 `WATCH_DIAGNOSE_CMD` 一樣係 watch 層 override(watch 由 launchd 起,唔經 AI)。
3. `REMEDY_DRY_RUN=1` 時 drill-restart 唔消耗 inflight、唔記配額(零側效應),只印計劃。
4. remedy 內 restart 上限 200 秒(+10 秒 health wait),watch 外層 240 秒。
5. 冇 node 時 exit 4(inflight 已被消耗=一次性)。
6. 用 `pgrep -f 'backend/server\.js'` 取 backend pid;冇 launchctl 呼叫。launchd 判別=`XPC_SERVICE_NAME`、PPID + `ps -o comm=`(唔用 launchctl managername)。

## B-1 至 B-6 證據(摘要,見 t9.out)
- B-1:touch request → watch 一 tick(exit 0)→ request/inflight 都冇殘留;remedy 行 `.../ops/deploy/backend-restart.sh --same-code --dry-run`(真 script,dry-run)→ 被部署 gate 攔(HEAD≠已批准 sha;輸出 `GATE-BLOCKED`,rc=1,冇重試);stream-drill.log 一行含 cwd=repo、uid=501、xpc=unset、ppid、restart_rc=1、dur、health=skipped、pid_before/after(6270 不變)、lstart、path(watch 補咗 /opt/homebrew/bin)。B-1b:restart 換 stub 成功路徑 → rc=0、health=200(scratch 本地 http server)、stub 被 call 一次。**測試環境 xpc=unset 係因為由 Bash 起,唔係 launchd——launchd 值只可以真演習先見到。**
- B-2:冇 inflight / mtime 11 分鐘前(age=660s)/ symlink / ENGINE 非 drill / 帶參數 → 全部 exit 2、rs.json 不變、無 restart;remedy.log 逐個記 rejected。
- B-3:同日第 1 次跑咗;第 2 次 `QUOTA: drill-restart 今日已用 1/1` exit 3(inflight 已被消耗);selfheal restartsToday=3 令 restart-backend exit 3 之際 drill 仍跑到 restart;restart-backend 跑 1 次後 rs.json = restarts:1,drills:1(獨立);drill 冇令 restarts +1(第一輪 rs.json restarts:0 drills:1)。
- B-4:REMEDY_ENGINE=ai + 新鮮 inflight → exit 2,inflight 仍在(未被消耗);grep drill 於 stream-diagnose.sh / stream-diagnose-rules.sh = 0/0。
- B-5:stub exit 1 → watch exit 0,狀態機照行(ok→bad,badTicks=1);stub hang + WATCH_DRILL_CAP=3 → watch-rc=124、共 ~5 秒、exit 0,狀態機第 2 個 bad tick 照觸發 DIAGNOSE;hang 嘅 sleep 600 冇殘留;stream-watch.off → stub 0 次 call,request 保留;冇 request → 無 drill.log。
- B-6:t1,t2,t3,t5,t6,t8 全部 rc=0(跑法:cd / + env -i + 絕對路徑,scratch 目錄第一參數);同 HEAD 版本輸出 diff:t1/t5/t8 無差異;t2/t3/t6 只有路徑前綴/秒數差(HEAD 副本喺 scratch 跑,repo 路徑不同;t6 一行 exit=127 係因 scratch 副本冇 ops/deploy)。`bash -n`:remedy/watch/lib/t9/stub 全過。

## 冇做到 / 注意
- 冇喺真 launchd context 行過(禁止);真 bootout/bootstrap 未驗,係演習本身目的。
- 演習前提:backend gate 要先 approve(否則得 GATE-BLOCKED)。
- 冇跑 t4/t7(執行單冇要求)。
