# STREAM-DRILL-OPUS-20260929 — Part B 演習入口獨立驗收(c16df80 + 211605d)

驗收員:Opus(獨立;冇信執行者報告,全部重跑 + 自己設計 case)。Scratch:`scratchpad/opus7/`(`adv.sh`/`adv.out`、`prod.sh`/`prod.out`、`t*.out`)。

## 判詞:有條件可以做真演習

入口本身安全:授權只靠 `~/.hymn-deploy/stream-drill.inflight`,而呢個檔只可能由 watch 將人手建立嘅 request `mv` 出嚟。drill 只行一次 `backend-restart.sh --same-code`,gate 攔住或者失敗都唔會重試、唔會繞過。prod 模式下所有 remedy 側 env override 都被忽略,演習唔會寫 SUPERVISION-LOG、唔會發通知、唔會觸發診斷。

**做之前一定要滿足以下條件**(第 1、2 條唔做,演習會白白嘥咗,但唔會有危險):

1. **先完成 Part A 嘅 approve + 部署。** 而家 `backend-restart.sh --same-code --dry-run` 會 abort:daef720 改咗 backend code,HEAD 211605d 唔等於 approved 0521d6b。gate 攔住嘅話 drill 只會記 GATE-BLOCKED,**而且照樣食咗當日 `drills` 配額**(t9 B-3:gate-blocked 之後 `drills:1`),當日唔可以再試。
2. **request 要喺 tick 前 ≤8 分鐘先 touch**,或者 touch 完即刻由 Terminal `launchctl kickstart gui/$(id -u)/com.hymnstream.healthcheck`(呢一步由協調者決定,我冇行)。原因:`mv` 會保留 mtime,remedy 量 inflight 年齡其實量緊 request 幾時被 touch。tick 每 1800 秒一次,近期 tick 時間大約係 :04–:05 同 :34–:35。README 寫「touch 完等下一個 tick(≤30 分鐘)」,照做有大約三分之二機會被 `過期 exit 2` 拒絕(A4:touch 咗 20 分鐘 → `age=1201s` 被拒;touch 咗 9 分鐘 → 行到)。被拒唔會消耗配額,可以下個 tick 再試。
3. **要有人喺 Terminal 當場睇住**,演習之後 1 分鐘內獨立驗一次 health 同 pid。**唔好信 drill.log 嘅 `pid_after`**(見 F2)。
4. 時機:Eric 冇做真機 QA、stream 健康(`consecutiveFail=0`)、冇其他部署進行緊。restart 會清走 in-memory 狀態(presence、warm buffer),之後頭幾首歌會慢啲,呢個係預期。

## 演習風險同恢復

### 靜態推演:prod 模式、launchd、cwd=/
1. launchd `com.hymnstream.healthcheck`(StartInterval 1800,RunAtLoad false,冇 WorkingDirectory,冇 AbandonProcessGroup,冇 EnvironmentVariables.PATH)行 `stream-healthcheck.sh`。
2. healthcheck 行 Layer A(3 下 curl backend)同 Layer B(yt-dlp + googlevideo),寫 `backend/data/stream-health-state.json`、`stream-health.log`,有需要先寫 SUPERVISION-LOG,唔健康先叫 selfheal。**以上全部喺 watch 之前做完**,所以同一個 tick 嘅探測冇可能撞正 restart。
3. `~/.hymn-deploy/stream-watch.on` 存在(已確認),healthcheck 就用 perl alarm 1500s 同步叫 `stream-watch.sh`,stdout 寫落 `/tmp/hymn_stream_watch.log`。
4. watch 檢查 `.off`(而家唔存在)→ 攞 lock(`stream-watch.lock` 目錄)→ 第 0.5 節將 `mv -f stream-drill.request stream-drill.inflight` → `REMEDY_ENGINE=drill wlib_capped_pg 240 stream-remedy.sh drill-restart`。
5. remedy 先 `cd $REPO`,prod 模式會 unset 危險 env,將 WATCH_DIR 設返 `~/.hymn-deploy`。之後檢查 ENGINE=drill、inflight 係普通檔而且屬自己、年齡 <600s,然後 **`rm` inflight**,預檢 node,用 flock 處理配額(`stream-remedy-state.json` 寫 `drills:1`,唔掂 `restarts`),`pgrep` 讀 backend pid 同 lstart。
6. `wlib_capped_pg 200 backend-restart.sh --same-code`:gate(git、approved.json)→ `launchctl bootout gui/501/com.hymnapp.backend` → `sleep 1` → `launchctl bootstrap gui/501 <plist>` → 最多 10 次 curl health → `deploy.log` append 一行。**backend 會斷大約 2–5 秒。**
7. remedy 等 10 秒 → `GET 127.0.0.1:3001/api/health` → 再 pgrep 一次 → `stream-remedy.log` 寫一行 → exit。
8. watch 將一行寫落 `~/.hymn-deploy/stream-drill.log`,`rm -f` inflight,之後行 status。status 讀嘅係第 2 步寫低嘅 health state,**唔係**即時探測,所以今個 tick 一定判 ok→ok,冇 incident、冇通知、冇 SUPERVISION-LOG。

會寫嘅檔只有:`~/.hymn-deploy/{stream-drill.log, stream-remedy-state.json(+.lock), stream-remedy.log, deploy.log}`、`/tmp/hymn_stream_watch.log`,以及 healthcheck 平時本身就會寫嘅檔。**演習本身唔會寫 SUPERVISION-LOG、唔會發 Mac 通知、唔會觸發診斷。**

### 演習失敗:最大風險係 bootout 成功但 bootstrap 失敗
- `backend-restart.sh` 開咗 `set -e`,bootstrap 失敗會即刻 exit(唔會寫 deploy.log)。backend 已經被 bootout,**job 已經卸載,plist 入面 `KeepAlive=true` 唔會再生效**,冇 launchd 機制會救。
- drill.log 會記 `restart_rc≠0 health=skipped`,但 `pid_after` 會照抄 `pid_before`(F2),**睇落會似 backend 仲生存**。
- 之後會發生嘅事(假設 selfheal 路徑喺 agent context 一樣失敗):
  - **下一個 tick(+30 分鐘)**:Layer A fail → `consecutiveFail=1` → SUPERVISION-LOG 寫 🔴。selfheal 唔郁手(<2)。watch ok→bad,`badTicks=1`,唔通知。
  - **再下一個 tick(+60 分鐘)**:`consecutiveFail=2` → selfheal ② 行**同一條** `backend-restart.sh --same-code`(`restartsToday` 0<2)。如果 bootstrap 喺 agent context 係結構性失敗,呢次都會失敗。watch `badTicks=2` → 規則診斷 → remedy `restart-backend`,今日 `restarts` 已經係 1(13:24 手動嗰次被 gate 攔),所以配額拒絕 → escalate → `STREAM-ALERT.md` + Mac 通知。
  - 即係**最壞情況:backend 死最少 60 分鐘先有 Mac 通知,自動機制救唔返**。
- 如果係另一種失敗(bootstrap 成功,但 10 秒內 health 未 200):job 已經 load 咗,有 KeepAlive(ThrottleInterval 10),通常會自己起返。

### 人手恢復指令(只係寫出嚟,我冇執行;喺 Eric 部 Mac 嘅 Terminal 行)
```bash
# 1. 判斷
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/health
pgrep -fl 'backend/server\.js'
tail -3 ~/.hymn-deploy/stream-drill.log; tail -2 ~/.hymn-deploy/deploy.log
# 2a. job 未 load(bootout 咗、bootstrap 失敗)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnapp.backend.plist
# 2b. bootstrap 報 5/37(仲卸載緊 / already loaded)
launchctl bootout gui/$(id -u)/com.hymnapp.backend; sleep 3; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnapp.backend.plist
# 2c. 已 load 但冇行
launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend
# 或者用正規路徑(gate 會照查):ops/deploy/backend-restart.sh --same-code
# 3. 清走殘留
rm -f ~/.hymn-deploy/stream-drill.request ~/.hymn-deploy/stream-drill.inflight
```

### 建議做法
演習前:
- `ls -la ~/.hymn-deploy/ | grep drill`,應該乜都冇;尤其唔可以有 inflight **目錄**(F4)。
- `.on` 存在,`.off` 唔存在。
- `ops/deploy/backend-restart.sh --same-code --dry-run` 要見到「✅ 檢查全過」。
- `ops/stream/stream-status.sh` 要係 healthy。

演習:喺 tick 前大約 5 分鐘 `touch ~/.hymn-deploy/stream-drill.request`(或者 touch 完即刻 kickstart healthcheck)。之後約 1 分鐘內:
- 睇 `stream-drill.log`,入面應該有 `xpc=com.hymnstream.healthcheck`、`restart_rc=0`、`health=200`,而 `pid_after` 應該同 `pid_before` 唔同。
- **另外自己獨立 curl health + pgrep lstart**。
- 睇 `deploy.log` 有冇新一行 `health=OK mode=...`。
- 如果 `restart_rc≠0`,即刻行上面嘅恢復指令。

## 1–6 證據摘要
1. **逐行讀 `git show c16df80`**:drill-restart 做嘅嘢正正係 ENGINE=drill → inflight 檢查(`-L`/`-f`/`-O`/age<600)→ DRY 分支 → rm inflight → node 預檢 → `quota drill` → 一次 `wlib_capped_pg 200 $RESTART_CMD`(同 restart-backend 用同一個變數,prod 模式 = `--same-code`)→ 成功先 sleep 10 + health → log。冇 loop、冇 retry,gate abort 只 echo 一句。唯一分別:restart-backend 嘅 cap 係 240,drill 係 200。
2. **授權**:
   - diagnose、rules、selfheal、healthcheck 嘅 `grep -c drill` 全部 = 0。AI prompt 列出嘅動作唔包 drill。
   - prod 模式:冇 inflight → exit 2;`ENGINE=ai`/manual 加新鮮 inflight → exit 2(P4)。
   - symlink、目錄、fifo、11 分鐘前 → exit 2(t9、A8)。
   - prod 模式注入 `DRILL_HEALTH_WAIT=0`/`SELFHEAL_RESTART_CMD=evil`/`REMEDY_STATE`/`HYMN_STREAM_BASE`,全部被忽略:stub 收到嘅 args 只係 `[--same-code]`,evil 0 次,總共用 11s,即係 10s 等待照行(P1)。
   - watch 用 `WATCH_DIR=alt` 都冇用,remedy 照睇 `$HOME/.hymn-deploy`,結果 exit 2(P2)。
   - **`WATCH_DRILL_CMD`/`WATCH_DRILL_CAP` 喺 prod 模式會被 watch 接受**(P3:evil 被 call 1 次),詳見 F5。
3. 見上面「靜態推演」。
4. **測試**:
   - t9 重跑:B-1 至 B-5 同執行者描述一致。
   - 我自己嘅 case(全部喺 `adv.out`、`prod.out`):
     - A1 request 係目錄 → 見 F4。
     - A2 symlink / dangling symlink → exit 2,target 冇被掂。
     - A3 有殘留 inflight 但冇 request → watch 唔會叫 drill。
     - A4 mtime → 見 F1。
     - A5 兩個 tick 並發:lock 令第二個 skip;第二個 request 留到下個 tick,被配額 exit 3 拒,restart 冇再 call。
     - A6 有 `.off` → 唔行,request 保留。
     - A7 配額 state 損毀 → 見 F7。
     - A9 DRY → 唔消耗 inflight、唔記配額。
     - P3b `WATCH_DRILL_CAP=2` → watch rc=124,但 backend-restart 喺另一個 pgid 繼續行(N3)。
5. **回歸**:t1、t2、t3、t5、t6、t8、t9 用 `cd /` + scratch 目錄跑,rc 全部 = 0。`bash -n ops/stream/*.sh ops/stream/test/*.sh` 全部過。
6. **diff 範圍**:`git diff --name-only c29b0c1 HEAD -- ops/` 只有 `ops/auth/test/token-revoke-harness.mjs` 同 `ops/stream/{README.md, stream-remedy.sh, stream-watch.sh, test/stub-drill-fail.sh, test/t9-drill.sh}`。deploy gate、healthcheck、selfheal 零改動。兩個 plist 嘅 mtime 分別係 09-05 同 08-10,冇被郁過。

## 發現
- **F1(Medium,影響演習做唔做得成,但會安全咁拒絕)**:`mv` 保留 mtime,10 分鐘期限實際上係由 touch 嗰刻計,唔係由 tick 計。README 教嘅「等下一個 tick(≤30 分鐘)」大多數情況會被拒。解決:touch 時間要貼近 tick,或者 kickstart;長遠修法係 mv 之後 watch 自己 `touch` 一下 inflight,或者用 request mtime ≤ 35 分鐘做判準。
- **F2(Medium,可觀測性)**:`rc≠0` 時 `pid1="$pid0"; lst1="$lst0"` 冇重新量,health 記 `skipped`。**正正喺最需要知 backend 死咗未嘅時候,log 會顯示舊 pid,睇落好似仲生存。**
- **F3(Low)**:gate 攔住或者失敗一樣會食咗當日 drill 配額。係一次性嘅設計,但要知道先 approve 先 touch。
- **F4(Low)**:如果 request 係目錄,`mv` 之後 inflight 變咗目錄,`rm -f` 刪唔走。之後每個 request 都會被 `mv` 入呢個目錄,每次都 exit 2,直到有人手 `rmdir`。要人刻意 mkdir 先會中。
- **F5(Low,同 N1 同一類,冇擴大實際攻擊面)**:watch 喺 prod 模式接受 `WATCH_DRILL_CMD`/`WATCH_DRILL_CAP`,同原本已經有嘅 `WATCH_STATUS_CMD`/`WATCH_DIAGNOSE_CMD` 同一類。launchd plist 冇 set 佢哋;watch 唔喺 AI allowlist;控制到 watch env 嘅人本身已經可以經 `WATCH_DIAGNOSE_CMD` 執行任意指令。remedy 側授權唔受影響(P2)。建議日後同 N1 一齊收緊(只喺 `STREAM_WATCH_TEST=1` 先認)。
- **F6(Low,N1 同一類,原本已經存在)**:`HOME` 唔喺 remedy 嘅 unset 名單,`HOME=<dir>` 前綴可以將 WATCH_DIR 同配額 state 搬走(P5)。drill 要配合攻擊者自己放嘅 inflight 檔;restart-backend 就連配額都可以繞過。AI 冇寫檔工具,而 N1 本身已經可以用 env 前綴執行任意命令,所以冇新增風險。建議加入 N1 修正清單。
- **F7(Low,要人手改壞檔先會中)**:
  - 配額 state 係垃圾或者 list → 當成新一日,重置晒,連 `restarts`/`swaps` 都歸零(原本已經係咁)。
  - `drills` 係負數 → 一日可以行幾次。
  - 型別錯 → 會拒絕(fail-closed)。
  - inflight mtime 喺未來 → 會接受。
- **F8(Info)**:backend 加載 `backend/data/worshipGroups.js`(經 `hymnDb.js`)。呢個檔自 09-05 起有未 commit 嘅改動,gate 第 2 步豁免咗 `backend/data/`,所以唔會攔。現役 backend(15:17 起)已經行緊呢份,restart 只係加載返同一份,冇新風險;不過呢個 gate 漏洞本身已經存在。

## 側效應(如實)
- 對真 backend 發咗 2 次 `GET http://127.0.0.1:3001/api/health`(prod 模式假 repo 測試 P1/P5,drill 成功路徑必經),另外有幾次 `pgrep`/`ps` 讀 pid 6270。
- 行咗 3 次真 repo 嘅 `backend-restart.sh --same-code --dry-run`(1 次我自己手動,2 次經 t9 測試模式),全部停喺 gate abort,冇寫任何檔。
- 用 `node -e require()` 讀咗一次 `worshipGroups.js`。
- t9 自己起咗一個 http.server,測試尾已經自己殺咗(已核 pid 同 lstart)。
- `~/.hymn-deploy`、SUPERVISION-LOG、selfheal 同 health state:測試前後 snapshot 對比冇改變,只有 `$HOME` 目錄本身嘅 mtime 變咗,唔係 `~/.hymn-deploy`。
- 冇行 launchctl、冇建立 drill request/inflight、冇改 code、冇做任何 git 寫操作。
- `plutil` 只讀咗 Label/StartInterval/KeepAlive/RunAtLoad/WorkingDirectory/ThrottleInterval/Std*Path/ProgramArguments 同 backend 嘅 `EnvironmentVariables.PATH`。
