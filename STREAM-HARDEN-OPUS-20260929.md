# STREAM-HARDEN 獨立驗收(Opus)2026-09-29 晚

對象:`9219662`(script+README)、`d9f0d4d`(testlib/t1–t12+報告)、`e8bebfb`(t7 sed 根治)。執行單 `STREAM-HARDEN-EXEC-20260929.md`。
方法:冇信執行者報告,全部重新讀 code、重新跑。scratch:`…/scratchpad/opus10/`(`attack.sh`、`snap*.txt`、`reg/t*.out`、`tl/`、`sym/`、`fb/`)。
測試時間窗:21:38:10 真 tick 完之後開始,21:44 完,冇撞 22:07 tick。

## 判詞:**有條件過**

- remedy / diagnose「**完全唔設 env**」→ 一定 REFUSED、exit 2、零寫入:**成立**。58 次攻擊全部被拒,前後快照逐字一致。
- 但係「**測試唔設 env 就冇可能寫 prod**」呢句,**唔係對所有路徑都成立**。仲有兩條中度嘅路(M1、M2)同幾條低度嘅路,見下面。
- 過嘅條件:修 M1 同 M2(兩個都係細改動),或者 Eric 明文接受呢兩條路係剩餘風險。

## 「唔設 env 冇可能寫 prod」逐條路徑

| 路徑 | 冇 env | 部分 env | 結論 |
|---|---|---|---|
| `stream-remedy.sh`(全部 7 個 action、冇 action、亂 action) | REFUSED(`env -i` 同 CLAUDECODE=1 兩種都係) | **會寫 prod**:設咗 `STREAM_WATCH_TEST=1`+tmp `REMEDY_STATE`,但冇設 `REMEDY_LOG`/`WATCH_DIR` → log 同 `stream-escalate.request` 寫落 `$HOME/.hymn-deploy`(M1) | 冇 env:成立;部分 env:唔成立 |
| `stream-diagnose.sh` | REFUSED | 測試模式要 `WATCH_DIR`(同 `DIAG_DIR`)喺 tmp;子 remedy 冇 tmp state 就跌返 prod → 拒 | 成立 |
| `stream-watch.sh` | **冇 guard**。直接跑會寫真 lock/ctx/state;status 壞嘅話:Claude shell 下 diagnose 被拒 → 升級 → 真 `STREAM-ALERT.md` + `SUPERVISION-LOG` 🔴 行 + macOS 通知;`env -i` 下 diagnose 過到 guard(ctx 係佢自己嘅)→ 真 AI call(`ai-on` 存在)+ 真 remedy(M2) | — | **唔成立**(我冇跑,淨係讀 code) |
| `ops/lyrics/stream-healthcheck.sh` / `stream-selfheal.sh` | 冇 guard(紅線唔准改,範圍外) | — | 唔成立(已知,範圍外) |
| 有效嘅真 tick 進行中 + 冇 CLAUDECODE | remedy 過到 guard | — | 低風險窗口(L2) |
| 測試 harness(source testlib) | testlib 會 export 晒 remedy 用嘅路徑 → 安全 | watch 類測試冇設 `WATCH_LOG_MD`/`WATCH_NOTIFY_CMD` 就會寫真 SUPERVISION-LOG + 彈真通知。快照只可以**事後**捉到個檔,捉唔到通知(M3) | 偵測有,預防冇 |

## 1–7 證據

**1. code 逐行(`9219662`)**
- remedy:guard 喺 `cd $REPO` 同 `. lib` 之後(兩樣都唔寫嘢)、任何 `mkdir`/log/state 之前。prod 模式先 unset override env,再用 dscl 重設 HOME(F6),然後 guard 由真 HOME 計 ctx 路徑。
- diagnose:`. lib` 之後、`mkdir -p "$DIR"` 之前行 guard,ctx 路徑用 `wlib_real_home`(dscl)。lib 本身 source 嗰陣唔寫嘢。
- watch:攞到 lock 之後先寫 ctx(`umask 077`);EXIT trap 刪 ctx,`trap 'exit 143' TERM INT HUP` 令呢三個信號都會行 EXIT。`kill -9` 會殘留,但 pid 已死 → 失效(t12 (c) 驗過)。
- `wlib_ctx_valid` 會檢查:係普通檔、唔係 symlink、mtime 少過 1800 秒、`pid=` 仲生存。`kill -0` **唔會核**個 pid 係咪 stream-watch,所以 pid 被重用就會當有效(L3)。
- `CLAUDECODE` 非空而冇 MANUAL → 就算有有效 ctx 都拒。`REMEDY_DRY_RUN` 唔算憑證(t12 同我嘅 (d) 都驗過)。`REMEDY_MANUAL` 只認字面 `1`(`yes`/`0` 都拒)。
- 測試模式判斷 `_sw_tmpok` 係**純字面**比較:有 `..` 就拒(`/tmp/../Users` 同 `/private/tmp/../../Users` 都拒),`/tmpfoo` 都拒;但**唔解析 symlink**,所以 `/tmp/.../lnk → ~/.hymn-deploy` 會被當測試模式(L1,已實證)。`/tmp` 同 `/private/tmp` 兩種寫法都認。

**2. 攻擊 / 事故重演**(真 repo、cwd=/、`env -i` 同 CLAUDECODE=1 兩種;restart/swap/drill/probe/escalate 加咗 `REMEDY_DRY_RUN=1` 做安全帶。guard 喺讀 DRY 之前行,所以唔影響判斷)
- (a) V4 事故 1:t2-D1 原樣(本身已帶 DRY)同第二輪 D2 形態;事故 2:zsh `env $E` 跑 wait/status。**全部 rc=2 REFUSED**。
- (b) remedy wait/status/probe/escalate/swap-ytdlp/restart-backend/drill-restart(兩種 ENGINE)/冇 action/亂 action:全部 rc=2。
- (c) diagnose 冇參數、有 id、淨係設 `DIAG_DIR`:全部 rc=2。
- (d) `REMEDY_DRY_RUN=1` 冇 MANUAL、`REMEDY_MANUAL=0`、`=yes`:全部 rc=2。
- (e) `/tmp/../Users/…`、`/private/tmp/../../Users/…`、`/tmpfoo`、`STREAM_WATCH_TEST=true`、diagnose `WATCH_DIR=/tmp/../Users/…`:全部 rc=2。**symlink → 真 home**:測試模式被接受(rc=0,stub status 有輸出)。因為我將 log 同 WATCH_DIR 指咗去 scratch,而 status 唔寫 state,所以冇寫到真 home;但證明咗字面檢查擋唔到 symlink(L1)。
- (f) `HOME=/tmp/x` + 偽造 ctx(pid 係我自己起嘅活 sleep),remedy(有冇加 `WATCH_DIR` 都試過)同 diagnose:全部 rc=2。F6 同 `wlib_real_home` 有效。
- **部分 env(M1 實證,用假 HOME 代替真 HOME)**:`env -i HOME=<scratch> STREAM_WATCH_TEST=1 REMEDY_STATE=<tmp>` 跑 wait 同 escalate → rc=0,`$HOME/.hymn-deploy/stream-remedy.log` 同 `stream-escalate.request` 都寫咗出嚟。如果 HOME 係真 HOME,呢兩個檔就會落 prod,下一個 tick 仲會觸發真升級。
- (g) watch:讀完 code,發現**冇 guard**,所以**冇跑**(見 M2)。
- 快照(`~/.hymn-deploy` 全部檔包括隱藏檔、watch log 行數+md5、SUPERVISION-LOG md5、`backend/data/stream-*` md5):攻擊、回歸、canary 全部做完之後,**前後逐字一致**。

**3. testlib**
- source 時做快照,EXIT 時比對:正常結束、`exit 2`、SIGTERM(rc=143)、SIGINT(rc=130)、`set -e` 死都會行比對(我自己寫 script 驗過)。SIGKILL 行唔到(呢個係 bash 本身做唔到)。
- 冇傳參數、scratch 唔喺 tmp、scratch 係 symlink 指去真 home(會用 `pwd -P` 解析):全部 exit 2。`tl-*` 預設目錄每次都 wipe。
- **負控 canary(我做咗,即刻刪咗)**:21:40 寫 `~/.hymn-deploy/zz-opus10-canary` 同隱藏檔 `.zz-opus10-hidden` → rc=1,兩個檔都印 `PROD-WRITE DETECTED`,證明隱藏檔有覆蓋。之後即刻 `rm -f`,`ls` 確認已經冇咗。
- 覆蓋:`/tmp/hymn_stream_watch.log`(**只睇行數**)、`stream-selfheal-state.json`(會中 `stream-*.json` 個 glob)、`.watch-ctx`(`find -mindepth 1` 會包埋隱藏檔)。**冇覆蓋**:`backend/data/stream-health.log`、`stream-selfheal.log`(係 `.log` 唔係 `.json`)、`backend/tools/yt-dlp` symlink 指去邊(即係有冇 swap)、backend pid/lstart(即係有冇 restart)、macOS 通知(M3/L4)。
- testlib 冇預設 `WATCH_LOG_MD`/`WATCH_NOTIFY_CMD`/`WATCH_ALERT_FILE`。而家啲測試係每支自己設,但將來嘅新測試一漏咗就會寫真 SUPERVISION-LOG(M3)。
- t12 如果見到真 ctx 存在,會 SKIP (a)(e)(g),但 rc 仍然係 0,即係靜靜咁當過咗(Info)。

**4. Part 1**
- 1a:t7 跑咗 3 次(cd /),每次 rc=0,prod watch log 行數 6→6→6→6,每次都有 `PROD-SNAPSHOT OK`。副本 healthcheck 經 sed 之後再 grep 確認冇 prod 路徑;真 healthcheck 裏面只有嗰一個寫死嘅絕對路徑。t7 已經明確設 `WATCH_DIR=$H/.hymn-deploy`,而且每次都 `rm -rf`,所以累積嘅根因已經冇咗。副作用:t7 嗰欄「/tmp/hymn_stream_watch.log 新增」而家永遠係 0,冇咗證據價值(Info)。
- 1b/1d `san()`:我自己做嘅正負控全部 PASS:ZWJ 家庭 emoji byte 不變;RLO/LS/NEL/ZWSP/LRI/BOM/PDF/PDI 全部剷走;`\n\t ESC` 剷走;切爛嘅 `a\xe4\xb8`、單獨 continuation byte `\x80\x85`、U+2585、U+0105(`c4 85`)都保留(冇誤剷);`LC_ALL=C` 喺字中間切 → 200B 非空;150 個「串」:C locale 200B,UTF-8 locale 150 字(450B)。diagnose `ctl` 由原檔抽出嚟實跑:ZWJ 保留、11 種危險字元剷走、`` ` ``/`$` 剷走;**U+061C(ALM)兩邊都冇剷**(Info)。t11 全 PASS。
- 1c lsof:讀 code:port 由 `$BASE` 解析,冇 port 就用 3001;用絕對路徑 `/usr/sbin/lsof`;命令行唔含 `backend/server.js` 就標 `<pid>?`;`d_lst` 會剝走 `?`。stub 驗:scratch `backend/server.js`(node)→ 淨 pid;python http.server → `pid?`;冇 listener → none;`BASE` 尾有 `/`、`[::1]`、冇 port 全部解析啱。真機唯讀核咗一次:`:3001` → **91265** `/opt/homebrew/bin/node …/backend/server.js`,lstart 係 20:37:25。t9 B-6 用 `DRILL_PGREP_PAT`(只限測試模式),B-7 用 MANUAL+DRY,兩個都 PASS。

**5. 回歸**:`cd /`,t1–t12 全部 rc=0,每支最尾都係 `PROD-SNAPSHOT OK`,冇 FAIL 行。`bash -n` 所有 `ops/stream/*.sh` 同 `test/*.sh` 全過。

**6. diff 範圍**:`git diff fa16c5a HEAD --stat` 係 19 個檔,除咗 `STREAM-HARDEN-REPORT-20260929.md` 之外全部喺 `ops/stream/`。(`stream-status.sh` 有之前留低、未 commit 嘅改動,冇入呢幾個 commit。)

**7. 報告 §2.1**
- 大方向啱:remedy/diagnose 預設係 prod,而家改成「忘記 = 拒絕」。
- **唔準嘅地方**:
  - (i) 事故 1(t2 D)唔係「忘記設 env」:嗰個 case 係**故意**模擬 prod,靠 `HOME=假 home` 將寫入引開;F6 之後 HOME 引唔開,結果就寫咗落真 home。
  - (ii) 冇提第三次事故(執行者 21:30 寫咗 2 行 watch log)。嗰次嘅根因係 watch/healthcheck **本身冇測試模式**加寫死路徑,今次加嘅 remedy/diagnose guard 擋唔到;真正修好佢嘅係 t7 個 sed,快照只係事後捉到。
  - (iii)「忘記 = 拒絕」只適用於「全部都唔設」。「設咗一半」(M1)同 watch(M2)仍然係「忘記 = 寫 prod」。
- **Eric 睇唔睇得明**:術語太多(`STREAM_WATCH_TEST=1`、zsh `$E`、tmp 路徑)。建議加一句白話:「以前測試漏咗一個設定,就會當真咁寫入正式紀錄;而家淨係監察程式自己排程行嗰陣先准寫,其他情況一律拒絕。不過監察程式本身同埋『設咗一半』嘅情況仲未包到。」

## 發現(按嚴重度)

- **M1(中)remedy 測試模式淨係睇 `REMEDY_STATE`。** 只要 `STREAM_WATCH_TEST=1` 加一個 tmp `REMEDY_STATE`,就會入測試模式,但 `WATCH_DIR`/`REMEDY_LOG` 會跌返去 `$HOME/.hymn-deploy`:remedy.log 同 escalate.request 都會寫 prod,request 仲會觸發真升級。呢個同兩次事故係同一類「設少咗一個 env」。
  - 建議:測試模式要求 `REMEDY_LOG` 同 `WATCH_DIR` 都喺 tmp;或者測試模式下由 `dirname REMEDY_STATE` 推算其他路徑。
- **M2(中)`stream-watch.sh` 冇任何 guard,亦都冇測試模式概念。**
  - Claude shell 直接跑:如果 status 壞,會發真警報 + 寫 SUPERVISION-LOG + 彈 macOS 通知。
  - `env -i` 跑:等同一個完整嘅真 tick(真 AI call + 真 remedy)。
  - 建議:`CLAUDECODE` 非空而冇 `WATCH_MANUAL=1` 就拒(launchd 永遠唔會有 CLAUDECODE);`STREAM_WATCH_TEST=1` 時要求 `WATCH_DIR` 喺 tmp,而 `LOG_MD`/`ALERT`/notify 預設指去 scratch/stub。
- **M3(中低)testlib 係「事後偵測」唔係「預防」。** 冇預設 `WATCH_LOG_MD`/`WATCH_NOTIFY_CMD`;快照捉唔到通知、yt-dlp swap、backend restart、`stream-*.log`。
  - 建議:testlib export 呢幾個去 scratch/stub,快照加埋 `readlink backend/tools/yt-dlp`、backend pid+lstart、`backend/data/stream-*`(所有副檔名)。
- **L1(低)`_sw_tmpok` 係字面比較,symlink 繞得過**(已實證)。要刻意先做到,唔會意外發生。建議用 `cd -P "$(dirname p)" && pwd -P` 之後再檢查。
- **L2(低)真 tick 進行中,任何冇 CLAUDECODE 嘅 shell(包括 Claude 用 `env -i`)都過到 guard。** 窗口長度:正常 tick 幾秒,事故 tick 最長大約 11 分鐘。
- **L3(低)`kill -0` 唔核 pid 身份。** `kill -9` 殘留 + pid 30 分鐘內被重用 → 會當有效。建議加 `ps -o command= -p $pid` 核係咪 `stream-watch.sh`。
- **L4(低)t12 (b)(f) 同 t9 B-7 喺真 repo 用 prod 模式行 remedy/diagnose(MANUAL + DRY + FORCE_RULES)。**
  - 同 README「唔准喺真 repo 用 prod 模式跑」矛盾。
  - 安全只靠 `REMEDY_DRY_RUN=1` 同 `DIAG_FORCE_RULES=1`:改測試時漏咗 DRY → 真 restart(受配額限);漏咗 FORCE_RULES → 真 AI call(`ai-on` 存在)。
- **L5(低)邊界情況:stale lock 超過 20 分鐘被第二個 tick 清走,第一個 tick 嘅 EXIT trap 會刪咗第二個 tick 嘅 ctx。** 第二個 tick 嘅 diagnose 就會被拒,變成升級。
- **Info**
  - U+061C 兩邊都冇剷。
  - t7「新增」欄而家冇意義。
  - t12 SKIP 仍然回 rc=0。
  - `DIAG_MANUAL=1` prod diagnose 冇 F6(`WATCH_DIR` 跟 caller 嘅 HOME),只影響人手 incident 目錄放喺邊。

## 側效應(如實)

- **prod 寫入**:
  - 21:40 canary `~/.hymn-deploy/zz-opus10-canary` 同 `.zz-opus10-hidden`,即刻刪咗,已確認唔存在(`~/.hymn-deploy` 目錄 mtime 因此變咗)。
  - 21:43 我自己 `san` 測試 script 嘅 stderr 重定向寫錯,喺 **`~/.x-never`(真 home 根目錄,唔係 `.hymn-deploy`)** 建咗一個空檔,發現之後即刻刪咗。
  - 除此之外,`~/.hymn-deploy/*`、`/tmp/hymn_stream_watch.log`(6 行,md5 不變)、`docs/SUPERVISION-LOG.md`、`backend/data/stream-*` 前後快照逐字一致。冇寫 `backend/**`。
- **跑過嘅嘢**:t1–t12 一次,t7 另外三次(即係 t7 總共跑咗 4 次)。t12/t9 本身就會喺真 repo 用 MANUAL+DRY 跑 prod 模式 remedy/diagnose,讀真配額,零寫入。
- **起過嘅 process 全部已收**:我自己起嘅 `sleep 90`、node 同 python stub server。t9/t12 起嘅 process 由測試自己收。
- **唯讀**:`lsof :3001`、`ps` backend pid。
- **冇做**:restart、launchctl、approve、OTA、swap、drill.request、真模型 call、打 YouTube/googlevideo、讀 .env/secret、改 code、git 寫操作。
- **scratch 殘留**:`/tmp/x-t12*` 唔存在;scratch 入面嘅 symlink `sym/lnk → ~/.hymn-deploy` 已刪(只刪咗 link 本身;冇經佢寫過嘢)。
