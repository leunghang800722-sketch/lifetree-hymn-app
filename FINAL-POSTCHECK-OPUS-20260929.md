# 最終部署後驗收 — 三條線一次過(Opus 獨立)2026-09-29

驗收時間:20:39–21:10 HKT。scratch:`scratchpad/opus9/`(`t2.out`、`t7.out`、`t*.out`、`snap-*.txt`、`chain.sh`、`cdp.sh`、`santest.sh`)。
冇信協調者/執行者報告,以下全部係自己量。

## 總判詞(Eric 版)

| 線 | 判詞 | 一句講晒 |
|---|---|---|
| ① 改密碼即踢走舊 token(`daef720`) | **過** | 部署咗嘅 code 同驗過嗰版一模一樣;本機+公開 smoke 全過;restart 之後冇 error。資料庫新欄位係「第一次有人登入/用有效 token 先加」,**而家仲未加**(見發現 M2),唔影響任何人。 |
| ② 串流演習(真排程下 restart 一次) | **過** | 20:37 由真 launchd 排程 tick 觸發,backend 真係重啟咗(新 PID 91265,由 launchd 起,health 200,deploy.log 有紀錄),冇誤報、冇通知。drill.log 入面「重啟後 PID」寫錯咗,係**量度 bug**,唔影響 restart 本身(見 M1)。 |
| ③ AI 診斷 + `abbadcd` 尾巴修正 | **有條件過** | AI 開關邏輯啱(而家會行 AI;冇事故時零 call)。`abbadcd` 四項修正方向啱、測試全過,但有兩個細尾巴:t7 仍然會**加**假行落 prod watch log(只係唔再清空);新 strip 遇到被 `cut` 切爛嘅中文會令 remedy.log 嗰格變空白(見 L1/L2)。唔阻用。 |

**自動 restart 最終判詞:通。** 「launchd 排程入面 `launchctl bootout/bootstrap gui/` 做唔做到」呢個之前唯一冇實證嘅位,今次有真證據。剩返嘅係設計上嘅閘(gate、配額),唔係環境問題(見 §3)。

---

## 1. 部署正確性 ✅

| 項 | 證據 |
|---|---|
| approved.json | `backend.sha=5fc8f6b…`,`approvedAt 12:16:47Z` |
| HEAD | `5fc8f6b342fd…`(= approved) |
| deploy.log | `12:16:47Z approve 5fc8f6b` → `12:16:50Z backend-restart … health=OK mode=normal` → `12:37:26Z backend-restart … health=OK mode=normal`(演習)。HEAD==approved 所以 `--same-code` 記 `mode=normal`,屬正確(`backend-restart.sh:70-96`)。 |
| 現行 process | `91265 PPID=1 lstart=Tue Sep 29 20:37:25`,`/opt/homebrew/bin/node …/backend/server.js`,`XPC_SERVICE_NAME=com.hymnapp.backend`(即 launchd 起嘅),`lsof :3001 LISTEN` = 91265。舊 85362 已唔存在。 |
| code 對齊 | `daef720` 係 HEAD 祖先;`git diff daef720 HEAD -- backend`(豁免 hymns.db/data/public/logs)**空**;`backend/data/*.js` diff **空**;唯一差異 `backend/hymns.db`(每晚備份)。 |
| backend log(`/tmp/hymn_backend.log`) | 20:16 boot 至今:唯一 error 係 `THZQ-KifvV8: Private video`(YouTube 內容問題,同今次無關)。20:37 boot 之後零 error。 |
| smoke 本機 | health 200、app-version 200、`/api/hymns` 200(5,791,753 B)、`POST /api/auth/renew` 冇 token → 401、`/api/auth/me` 亂碼 token → 401、`GET /api/auth/renew` → 404、app-version 有 `hlsDeviceIds`(list,2 個)。 |
| smoke 公開 | `https://api.odemusics.com/api/health` 200(0.96s)、`/api/hymns` 200(br 1,514,473 B)。 |
| migration | **未落,屬預期**。冇開 users.db;證據:`backend/users.db` mtime = **09-28 17:22**,今日三次 boot 都冇改過。`getUserDb()` 係 lazy(`userDb.js:133-146`),第一次 call 先會 `ALTER … token_valid_after` + `saveUserDb`。`requireAuth`/`/me` 對冇 token 或 `jwt.verify` 失敗會喺碰 DB 之前 401,所以 smoke 唔會觸發。⇒ 由 15:17 至今冇任何有效 token 請求到過 backend(同記憶「Eric token 已過期」一致)。 |

## 2. 演習判讀 ✅(一個量度 bug)

**時間線**:20:37:23 healthcheck 寫 `stream-health-state.json`(Layer A 3/3、mid 3/3)→ watch 將 request mv 成 inflight → remedy drill → 20:37:25 新 backend 起 → 20:37:26Z deploy.log → 20:37:37 health=200、drill.log/remedy.log 寫一行 → watch ok→ok(只 touch state)→ `/tmp/hymn_stream_watch.log` 一行 `DRILL rc=0`。`stream-remedy-state.json` = `drills:1, restarts:1, swaps:1`(restarts 冇被演習食)。inflight/request 已清。

**(a) 係咪真 launchd context — 係,但唔係靠 `xpc=0` 證明。**
- script 寫法係 `xpc=${XPC_SERVICE_NAME:-unset}`(`stream-remedy.sh:278`),`xpc=0` 即係環境變數值係字面 `"0"`,**唔係**「有 label」。本機 launchd 長駐 job 全部帶 label(backend=`com.hymnapp.backend`、cloudflared、tinyproxy);`"0"` 喺本機只見到喺 Claude.app 啲子 process。所以 `xpc` 呢格分唔到 launchd 定 Terminal。
- 真證據係**節奏**:`stream-health.log` 今日 41 個 tick 全部每 30 分鐘 + 約 10 秒漂移(… 19:36、20:07、**20:37**),20:37 只得一行,而 healthcheck 冇 lock。如果有人喺 Terminal 手動行,就會多一行或者唔喺節奏上。⇒ 20:37 嗰次就係 launchd `com.hymnstream.healthcheck` 自己嘅 tick。
- 推論:launchd 對呢個 StartInterval job 設嘅 `XPC_SERVICE_NAME` 係 `"0"`(冇 launchctl 就核實唔到點解)。建議 drill 改記祖先鏈(例如逐層 `ps -o ppid=` 直到 PID 1)。

**(b) `launchctl bootout/bootstrap gui/` 喺 agent context 成功 — 係。** 證據:deploy.log 12:37:26Z 一行 `health=OK`(`backend-restart.sh` 行 `set -e`,bootstrap 失敗就唔會寫到呢行);新 PID 91265 嘅 PPID=1、`XPC_SERVICE_NAME=com.hymnapp.backend`、lstart 20:37:25 同 deploy.log 吻合;`restart_rc=0 dur=2s health=200`。

**(c) 誤報 — 冇。** SUPERVISION-LOG 最後一次寫係 20:12(keeper 時報),20:37 之後冇 🔴;今日 19:06 🔴 有 19:36 ✅ 恢復配對,係演習之前嘅事。`~/.hymn-deploy` 冇 `STREAM-ALERT.md`、冇 `stream-incident-*`;watch state `status=ok badTicks=0 notifyCount=0 diagnosed=false`。下一個 tick 見 §2b。

**(d) `pid_after=85497` 異常 — 確認係量度 bug,唔影響 restart。**
- 寫法:`d_pat='backend/server\.js'`、`d_pid() { pgrep -f "$d_pat" | head -1; }`(`stream-remedy.sh:261-262`)。`pgrep -f` 對**成條命令行**做子字串 match,macOS 輸出按 PID 由細到大排,`head -1` 攞最細嗰個。
- 當時有兩個 match:協調者監察 shell 85497(20:17:22 起,命令行含 `backend/server.js`)同真 backend 91265。85497 < 91265 ⇒ 揀錯。restart 前嗰次啱,只係因為真 backend 85362 啱啱好細過 85497(彩數)。
- 自己重現(我自己起、已 kill 嘅 decoy `bash -c 'sleep 30; : watch backend/server.js'`):原 pattern match 到 **2 個**(91265 + decoy)。
- **協調者建議嘅 `pgrep -f "^node .*backend/server.js"` 係錯嘅**:真命令行係 `/opt/homebrew/bin/node …`(絕對路徑),呢個 pattern 會 match **0 個**(實測 `NONE`),之後每次演習都會記 `pid_after=none`,睇落似 backend 死咗。
- 實測可用:`pgrep -f '^[^ ]*/node [^ ]*/backend/server\.js$'` → 只有 91265;或者 `/usr/sbin/lsof -nP -t -iTCP:3001 -sTCP:LISTEN` → 91265(量「邊個真係 listen 緊 3001」,最貼題,而且 launchd PATH 有 `/usr/sbin`)。建議用 lsof 為主,再用 `ps -o command= -p` 核一下命令行含 `backend/server.js`。(冇改 code。)

### 2b. 下一個 tick(約 21:07)
見文末「補記」。

## 3. 自動 restart 最終判詞:**通**

三條路最後都係行同一條 `ops/deploy/backend-restart.sh --same-code`:
- 演習:healthcheck → watch → `stream-remedy.sh drill-restart`(cap 200s)
- 規則/AI remedy:healthcheck → watch → diagnose → `stream-remedy.sh restart-backend`(cap 240s,同一個 `$RESTART_CMD`)
- selfheal 形態②:healthcheck → `stream-selfheal.sh`(自己補 PATH + `cd $REPO`,09-29 已喺 launchd 等效環境 dry-run 驗過)

之前三份報告都寫住「`launchctl` 喺 agent context 得唔得」係推論;今次演習喺**同一個 launchd job(`com.hymnstream.healthcheck`)** 入面真行咗,成功。remedy 兩條路同演習嘅分別只係 cap 同配額計數;selfheal 同演習係同一個 job,只係包裝 script 唔同。

剩返嘅條件(全部係設計上嘅閘,唔係「未知得唔得」):
1. **gate**:backend code 要等於已批准 sha(或者只差 hymns.db/data/public/logs),而且 `backend/` 冇非運行時髒檔。多 session 共用 worktree,有人留低未 commit 嘅 `backend/*.js` 就會 abort(除咗 `backend/data/`,呢個目錄係豁免嘅)。而家 dry-run 係「✅ 檢查全過」。
2. **配額(今日)**:remedy `restarts` 已經係 **1/1**(`stream-remedy-state.json`),所以**今日**規則/AI 嘅 `restart-backend` 會被拒;selfheal `restartsToday=0/2` 仲用得。聽日自動 reset。
3. **AI 路**:`claude` 喺真 launchd 下能唔能夠攞到登入,仍然只係用 `env -i` 模擬過;失敗會自動跌返規則引擎,規則見 backend 死一樣會揀 `restart-backend`。
4. **樣本數 = 1**:bootout 同 bootstrap 中間只 `sleep 1`,今次冇撞 race(`dur=2s`)。萬一 bootstrap 失敗,job 會停留喺卸載狀態,冇任何自動機制救得返(STREAM-DRILL 報告已寫恢復指令)。
5. 失敗嘅 restart 都會食配額(DEPLOY-POSTCHECK2 F1),未改。

## 4. `abbadcd` 覆核 — 有條件過

逐行睇完 5 個檔(+11/−8)。

| 改動 | 結論 | 證據 |
|---|---|---|
| diagnose 解析器 `ctl` 加 `\x85     ​-‏ ‪-‮ ⁦-⁩ ﻿` | ✅ | 套用喺 REASON 同 `escalate "…"` 參數;t3/t4 全過 |
| remedy `san()` 加 `perl -CS` 同一組字元 | ✅,有尾巴(L2) | 正控:`✅ 串流監察恢復 — incident x 已恢復` byte-for-byte 原樣;emoji `🎵 👍🏽` 保留。負控:U+202E、U+2028、U+0085、U+200B、BOM、U+2066 全部剷走。`env -i`(launchd 冇 LANG)同樣結果。 |
| remedy `unset CDPATH GLOBIGNORE BASH_ENV ENV SHELLOPTS` | ✅ | 位置啱:第 29 行 `set -u` → **第 30 行 unset** → 第 31 行 `REPO=$(cd …)` → 第 62 行 source lib。`SHELLOPTS` 係 readonly,unset 會靜靜失敗,但因為佢排最後,前面四個都照 unset。實測(測試模式,scratch):`BASH_ENV=evil` 行 `status` → 新版子 script **冇**觸發;負控 `abbadcd^` 副本**有**觸發。`CDPATH=fake` → 新版正常行完;舊版 `cd` 撞 CDPATH 之後 exit 1(fail-closed,冇 source 到假 lib)。 |
| t2 D2 改 `REMEDY_DRY_RUN=1` | ✅ | 跑 t2 前後:`stream-remedy.log`、`stream-remedy-state.json`(+.lock)md5/mtime/size 全部不變;`/tmp/hymn_stream_watch.log` 行數 3→3。D1/D2 prod 模式讀到真配額 → `QUOTA 1/1 exit 3`(dry 唔寫)。 |
| t7 唔再 `: >` truncate | ⚠️ 只改咗一半(L1) | 唔再清空,但**仍然會 append**:跑 t7 前後 `/tmp/hymn_stream_watch.log` 由 3 行變 4 行,多咗 `watch failing on purpose`。檔入面本身已經有兩行同樣嘅嘢,係之前跑 t7 留低。~/.hymn-deploy 同 SUPERVISION-LOG 不變。 |
| README / shebang 註解 | ✅ | 改啱咗:`-p` 唔擋 CDPATH/GLOBIGNORE,BASH_ENV 會傳落子 script |

**回歸 t1–t10**(`cd /`,第一個參數 = scratch):10 個全部 rc=0,輸出逐項對過:
- t1 狀態機三劇本
- t2 A–F
- t3:冇 ai-on/有 no-ai 零 call、偽造判詞降級、canary 2/2 唔存在
- t4 canary 4/4 唔存在
- t5 密鑰遮蓋
- t6 V1–V3
- t8 三案
- t9 B-1..B-7,B-6 `pid_after=none`、B-7 HOME 重設
- t10:新 shebang marker 兩個 ABSENT、舊副本兩個 PRESENT、`engine=ai` 拒 drill-restart/bogus

除咗 t7 嗰一行,t1、t3–t6、t8–t10 前後 prod snapshot 完全一樣。

## 5. AI 模式現況 ✅

- 開關邏輯(`stream-diagnose.sh:276-279`):`(ai-on 存在 或 DIAG_AI_FORCE_ON=1) 且 no-ai 唔存在 且 冇 DIAG_FORCE_RULES` → AI_ON=1;之後仲要 `command -v claude` 搵到。
- 真環境:`~/.hymn-deploy/stream-watch.ai-on` 存在(17:44)、`no-ai` 唔存在 ⇒ 會行 AI。launchd PATH(lib 補咗)下 `claude` = `/opt/homebrew/bin/claude`。
- 冇事故 = 零 call:watch state `ok`、`diagEngine=""`,`~/.hymn-deploy` 冇任何 `stream-incident-*`。19:06 嗰次 bad 只係單 tick blip(19:36 已恢復),冇觸發診斷。
- 自己寫嘅全鏈(`chain.sh`):真 `stream-watch.sh` → 真 `stream-diagnose.sh` → mock claude → remedy(測試模式 + DRY),`env -i` + `cd /`,WATCH_DIR 喺 scratch:

| 場景 | ticks | mock call | engine |
|---|---|---|---|
| S1 照抄 prod(on + ai-on) | ok bad bad | 2(兩回合) | **ai** |
| S2 ai-on + no-ai | ok bad bad | 0 | rules |
| S3 淨係 on | ok bad bad | 0 | rules |
| S4 淨係 on + `DIAG_AI_FORCE_ON=1` | ok bad bad | 2 | ai |
| S5 on + ai-on,一直健康 | ok×4 | **0** | (冇診斷) |

冇製造真事故、冇真模型 call。

## 6. worktree 衛生 ✅(冇新嘢)

`git status --porcelain -- backend ops`:
- 已知:`backend/data/worshipGroups.js`(09-05)、`ops/stream/stream-status.sh`(09-07,+30/−2)
- 運行時資料:`backend/hymns.db`(20:18)、`backend/data/lyrics-*.json`(最新 19:10)、`backend/data/instrumental/*`、`backend/data/suspected-nonsong.md`、untracked `backend/data/hymns.db`
- 舊嘅 ops 檔:`ops/lyrics/*`(已改嘅 4 個 + 約 269 個 untracked,最新 09-06)、`ops/perf/*` 截圖、`ops/deploy/session-cleanup-*`(同 session 開始時嘅 snapshot 一樣)

`ops/stream` 除咗 `stream-status.sh` 冇其他未 commit 改動,即係 launchd 行緊嘅 remedy/watch/diagnose 同 HEAD 一致。冇新嘅 `backend/*.js` 髒檔,所以 gate 唔會被卡。

## 發現(按嚴重度)

- **M1(Medium,可觀測性)drill 嘅 pgrep 會認錯 PID。** 任何命令行含 `backend/server.js` 嘅 process(監察 shell、`tail -f`、grep、編輯器)都可能被當成 backend,`pid_before` 同 `pid_after` 都受影響。今次 `pid_after` 錯咗,`pid_before` 啱只係彩數。restart 本身、`restart_rc`、`health` 唔受影響。修法用 lsof listener 或者錨定絕對 node 路徑嘅 regex(§2d)。**唔好用 `^node …`**,會永遠 match 唔到。
- **M2(Medium,認知)token 撤銷欄位嘅 migration 仲未落。** 要等第一個有效 token 請求或者登入先會加。之前報告寫「boot 時會 save 一次」唔啱,應該係「第一次 `getUserDb()` 先 save」。影響:
  - 零功能影響,Opus A 已經驗過舊 schema 升級。
  - 加欄嘅時刻係「Eric/Joy 下次登入嗰下」,唔係部署嗰下。
  - `requireAuth` 會 SELECT `token_valid_after`;萬一 ALTER 靜靜失敗(`try{}catch{}`),**所有**登入用戶都會 401(fail-closed)。機會極低,但係全面影響。建議下次有人登入之後睇 `users.db` mtime 有冇郁,同埋睇 log 有冇 401 暴增。
- **L1(Low,測試衛生)t7 仍然會 append 落 prod `/tmp/hymn_stream_watch.log`**(每次跑加 1 行 `watch failing on purpose`)。原因係 healthcheck 將路徑寫死咗。後果係人手 `tail` 時會誤導,冇任何程式讀佢。修法:testcase 2 嘅 stub 唔好 echo,或者 healthcheck 將 watch log 路徑改成可以 override。
- **L2(Low,新引入)`san()` 遇到唔完整 UTF-8 會令成格變空白。** `perl -CS` 遇到壞 byte 會 fatal,`san` 輸出空字串,仲會喺 stderr 噴 `Malformed UTF-8`。實際會中嘅路徑:`escalate` 嘅 reason 先 `cut -c1-300`,喺 launchd(冇 LANG)係按 byte 切,中文長 reason 會被切開一半 → remedy.log 嗰行 `requested reason=` 成段冇咗。實測:`"a"+150 個「串」` → remedy.log 最後一格空白。request 檔本身照寫,所以警報內容冇蝕;只係 remedy.log 少咗 reason。修法(已喺 scratch 實測):唔用 `-CS`,改用 byte 模式 regex,`perl -pe 's/\xc2\x85|\xe2\x80[\xa8\xa9\x8b-\x8f\xaa-\xae]|\xe2\x81[\xa6-\xa9]|\xef\xbb\xbf//g'`。效果:
  - 正控 `✅ 串流監察恢復` byte 不變。
  - 負控全部剷走。
  - 切爛咗嘅 `a\xe4\xb8` 原樣保留,唔會 fatal。
  - 順手唔再剷 ZWJ(見 L3)。
- **L3(Low,外觀)** `​-‏` 包咗 U+200D(ZWJ),組合 emoji 會拆開(👨‍👩‍👧 → 👨👩👧)。對 log 冇實際影響。
- **L4(Low)** remedy `escalate` 寫入 request 檔嘅 reason 冇經 `san`:U+202E 會原樣入 request 檔,再落 SUPERVISION-LOG/ALERT。AI 路徑已經喺解析器 strip 咗,所以唔可以被 AI 利用;只剩人手或規則 caller。唔使即修。
- **Info** `drill.log` 嘅 `xpc=` 分唔到 launchd 同 Terminal:launchd 對呢個 job 設 `"0"`,Terminal 通常都係 `"0"`。建議改記祖先鏈或 PPID==1 嘅祖先。
- **Info** t2 D1/D2 而家讀嘅係真配額。今日 `restarts=1/1`,所以 D2 輸出 QUOTA 已經證明 `LIMIT=99` 被忽略;但係喺配額 0 嘅日子,D2 只會輸出 `DRY-RUN`,證明力會弱啲。唔寫檔,所以冇害。

## 側效應(如實)

- ⚠️ **我寫咗 3 行落 prod `~/.hymn-deploy/stream-remedy.log`(違反「唔寫 ~/.hymn-deploy」)。**
  - 20:47:13–15,`engine=manual incident=20260929-190631`:`wait | noop`、`status | exit=0`、`status | exit=1`(舊版副本搵唔到 status script)。
  - 成因:第一次 CDPATH/BASH_ENV 測試喺 zsh 用咗 `env $E …`。zsh 唔會將 `$E` 拆字,`STREAM_WATCH_TEST` 冇設到,remedy 就行咗 prod 模式。
  - 行咗嘅只係 `wait`(乜都唔做)同 `status`(行真 `stream-status.sh`,唯讀,冇 curl)。**冇掂配額 state、冇 restart、冇 swap、冇 drill**。
  - 冇刪嗰 3 行(刪都係寫 prod)。之後嘅測試全部改用 bash script 加 tmp guard 重做,前後 snapshot 一致。
  - 下次事故如果 AI bundle 包埋 remedy.log,會見到呢 3 行 manual 紀錄,屬無害噪音。
- 跑 t7 令 `/tmp/hymn_stream_watch.log` 多咗 1 行 `watch failing on purpose`(即係 L1)。
- 對 backend 嘅請求:
  - 本機:`GET /api/health` ×2、`/api/app-version` ×2、`/api/hymns` ×1、`POST /api/auth/renew` ×1、`GET /api/auth/me`(亂碼)×1、`GET /api/auth/renew` ×1。
  - 公開:health ×1、hymns ×1。
  - 另外 t9 自帶 GET health。
- 行咗 1 次真 repo `backend-restart.sh --same-code --dry-run`(我自己行,`env -i` cwd=/),t6/t9 亦喺測試模式各行過 dry-run gate。全部冇寫 deploy.log(最後一行仍然係 12:37:26Z)。
- `ps eww` 淨係 grep `XPC_SERVICE_NAME=` 一個變數(backend、cloudflared、tinyproxy 等),冇印其他 env。
- 起過嘅 process:decoy `bash -c 'sleep 30…'`,已 kill;t9 自己起嘅 http.server 同假 backend,已由測試自己收尾。`/tmp/x-f6-home` 唔存在。
- 冇 restart、冇 launchctl、冇 approve、冇 OTA、冇 swap、冇 drill.request/inflight、冇打 YouTube/googlevideo、冇真模型 call、冇讀 .env/secret/keychain/users.db、冇改 code、冇 git 寫操作。
- `docs/SUPERVISION-LOG.md`、`backend/**` 冇寫(md5 前後不變)。唯一寫入 repo 嘅檔係本報告。

## 補記:下一個 tick(21:07)✅ 冇誤報
- `stream-health.log`:`21:07 ok=3 fail=0 mid=2 midfail=1 consecutiveFail=0 B:PG_J_0gsMXA:302`。Layer B 有一首 302,屬平時嘅間歇噪音,`consecutiveFail` 仍然係 0。
- watch state:`ok badTicks=0 diagnosed=False notifyCount=0`。
- SUPERVISION-LOG:20:12 之後冇新行。
- `~/.hymn-deploy`:冇 ALERT、冇 incident 目錄、冇 drill 殘留。
- deploy.log:冇新 restart。
- backend:仍然係 91265(20:37:25 起),health 200。
- 備註:`/tmp/hymn_stream_watch.log` 今個 tick 冇加行,因為 ok→ok 係靜音嘅。
- 更正:remedy.log 最後一行(我 20:47:15 誤寫嗰行)係 `status | exit=1`,唔係 `exit=127`。
