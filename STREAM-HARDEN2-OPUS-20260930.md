# STREAM-HARDEN2 Opus 驗收 2026-09-30(healthcheck + selfheal 三層防呆)

對象:`6c0ed09`(script+README)、`d39fe0c`(t13/t7/testlib+報告)。基準 `2bbd80a`。
驗收員只讀 + scratch(`scratchpad/opus12/`),唯一寫入 repo 檔 = 本文件。

## 判詞:**有條件過**

- 真 launchd tick 冇被改壞(00:09 樣本全項過;第二樣本見 §0)。
- diff 只係 guard / 路徑 / 測試模式;探測判斷、修復梯、配額、節流冇郁(逐行核 + 假 repo 新舊版並排跑,輸出逐字一樣)。
- 條件(唔係 blocker,但要記低/跟進):
  1. **我冇喺真 repo 重跑攻擊 / t7 / t13**:第一次喺真 repo 跑 healthcheck 攻擊時,auto-mode classifier 以「Production Deploy」拒絕。之後冇再喺真 repo 跑 healthcheck/selfheal。改用**逐字相同**嘅 scratch 假 repo 副本(healthcheck `cmp` 一樣;selfheal 只換咗 dscl 攞 HOME 嗰一行)。如果要喺真 repo 重跑,要 Eric 批權限。
  2. Medium-low:t13 (b) 喺真 repo 用 `env -i`(冇 CLAUDECODE)跑真 selfheal,保護只靠「冇真 tick 同時行」。`SKIPREAL` 只喺開頭檢查一次,而 README/testlib 寫嘅「:07/:37」唔準(StartInterval 會漂移,今晚係 00:09)。見 F2。

## 0. 真 launchd tick 核實(blocker 級)

**tick 1:00:09:18–00:09:35**(唔係 :07,StartInterval 1800 漂移咗:22:08→22:38→23:09→23:39→00:09)。我用唯讀 poller 每 0.2 秒捕捉:

| 項目 | 結果 |
|---|---|
| `.tick-ctx` tick 期間 | 存在 00:09:18–00:09:35,`-rw-------`(umask 077 生效),內容 `pid=34862 ts=1790698158`;34862 就係 launchd 起嘅 `/bin/bash …/stream-healthcheck.sh` 主 pid |
| `.tick-ctx` tick 後 | 已消失(`ls -la ~/.hymn-deploy` 冇) |
| `stream-health-state.json` | lastCheck `2026-09-30T00:09:35`,consecutiveFail=0,ok=3 mid=3,欄位同舊一樣 |
| `stream-health.log` 新行 | `2026-09-30 00:09 ok=3 fail=0 mid=3 midfail=0 ver=2026.09.27.232945 consecutiveFail=0`,格式同 23:39 行一樣 |
| `~/.hymn-deploy/stream-watch-state.json` | mtime 00:09:35,同 health state 同一秒;status=ok,badTicks=0 |
| watch 有冇被叫 | poller 00:09:35 見到 `bash …/stream-watch.sh`(ppid 鏈喺 healthcheck 下面) |
| `/tmp/hymn_stream_watch.log` | 6 行不變,REFUSED=0(健康 tick 本來就唔寫) |
| alert / SUPERVISION-LOG | 冇 🔴;md5 由 tick 前到 tick 後冇變(之後 00:12:44 有 keeper「P線時報」寫入,同本改動無關) |
| `stream-selfheal-state.json` | md5 `fdcaec2b…`、mtime 19:36:49 不變(健康 + prev_fail=0 ⇒ selfheal 本來就唔會被叫) |
| backend pid | 91265 不變 |
| `/tmp/hymn_streamhealth.log`(plist stdout/stderr) | 0 byte,冇 stderr |

**tick 2:00:39:35–00:39:51**:全項同 tick 1 一樣。
- ctx 權限 600,內容 `pid=86303`,就係 healthcheck 主 pid。tick 後 ctx 消失。
- lastCheck `00:39:51`;health.log 新行 `2026-09-30 00:39 ok=3 fail=0 mid=3 midfail=0 ver=… consecutiveFail=0`,格式一樣。
- watch-state mtime 00:39:51,同 health state 同一秒,status ok;期間見到 `stream-watch.sh` 有行。
- watch log 6 行,REFUSED 0;冇 alert、冇 ctx 殘留。
- SUPERVISION-LOG mtime 仍然係 00:12:44(keeper 寫嘅,同本改動無關)。
- selfheal state md5 不變;pid 91265 不變;plist stderr 0 byte。

⚠️ 健康 tick 唔會行 selfheal,所以真 tick 證明唔到 selfheal 嘅 prod guard 喺 launchd 入面行唔行到。補證:用假 repo 副本(同一份 code)+ launchd 同款 env(`env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`,冇 CLAUDECODE,cwd=/)跑成條鏈:
- 形態②(Layer A 死 port、Layer B 本機 206 server,health state 種 consecutiveFail=2):selfheal 過到 guard;restart stub 收到 `--same-code`(prod **冇**加 `--dry-run`,啱);被 call 嗰刻 ctx=`pid=<healthcheck pid>`;PATH 已被 selfheal 補成 `/opt/homebrew/bin:…`;cwd=repo;等足 15 秒 recheck 後先寫 `backend-restart-recheck-fail restartsToday=1/2`;tick 完 ctx 消失;rc=0。
- 用 `2bbd80a` 舊版 healthcheck+selfheal 放喺第二個假 repo 跑同一場景:`stream-health.log`、`stream-selfheal.log`、SUPERVISION-LOG、`stream-selfheal-state.json`(扣走時間戳)**逐字一樣**;「剛恢復」場景(prev_fail>0 → healthy,selfheal 清 alert)亦逐字一樣。
- `dscl` 喺 `env -i` 行到(`/Users/macbookpro`)。remedy 用同一段 code,20:37 drill 已經證明 launchd 入面行得。

## 1. diff 逐行(`git diff 2bbd80a HEAD`)

範圍:healthcheck、selfheal、`ops/stream/README.md`、t7、t13、testlib、兩份 STREAM-HARDEN2 文件。冇掂 plist/deploy/backend/frontend/`.claude`/`stream-status.sh`。

被刪行其實係 **6 行**(報告寫 5 行,因為將 selfheal 兩行註解當一行計):
- HC `# 手動試:` 註解 → 同一句加 HC_MANUAL 說明(註解)
- HC `if [[ -f "$HOME/.hymn-deploy/stream-watch.on" …` → `HC_WATCH_ON=` 同值 + 測試模式覆蓋(路徑)
- HC `>> /tmp/hymn_stream_watch.log` → `>> "$HC_WATCH_LOG"`,預設同值(路徑)
- SH 兩行「手動試」註解(註解)
- SH `YTDLP_LINK="${YTDLP_LINK:-$REPO/backend/tools/yt-dlp}"` → `else` 分支原句照搬(路徑)

新增行:逐行核過,全部屬於 guard 函數/分支、`$HC_TEST`/`$SH_TEST` 前綴嘅路徑或 stub、`.tick-ctx` 寫/刪/trap。**冇一行**動到下面呢啲:Layer A/B 條件、healthy 判定、consecutiveFail、警報節流(`new_fail==1 || %12`、cfg-err `%8`)、SUPERVISION 寫法;selfheal 嘅形態判定、swapsToday/restartsToday、due 節流、rollback。Layer B 嗰個 `if HC_TEST … else <原 curl> fi`,else 分支係原句(縮排都冇改)。

prod 預設值,舊值同新值逐個對(真 tick 冇 `STREAM_WATCH_TEST`/`CLAUDECODE` ⇒ `HC_TEST=0`、`SH_TEST=0`):HC `LOG/STATE/HISTORY/BASE/YTDLP/TIMEOUT/IDS/YT_IDS/watch.on/watch log` 全部同值;SH `LOG/STATE/HEALTH_STATE/HISTORY/YTDLP_LINK/APPLY_CMD/RESTART_CMD/BASE/RECHECK_SLEEP` 全部同值。唯一分別:`HC_WATCH_LOG` 喺 prod 都會認 env(launchd 冇設,Info)。

冇 source `stream-watch-lib.sh`,改為 inline:合理。lib 會 export PATH/USER,會改變 healthcheck 喺 prod 嘅環境;inline 嘅 `_hc_tmpok`/`_sh_tmpok` 同 lib 嘅 `tl_tmpok` 邏輯一樣(絕對路徑、冇 `..`、python realpath、4 個 tmp 前綴)。selfheal 09-29 加嘅 `export PATH` 同 `cd "$REPO"` 仍然喺 guard 之前,冇受影響(假 repo 實測 restart stub 見到補咗嘅 PATH 同 repo cwd)。

## 2. prod 新行為,逐項睇風險

1. **`.tick-ctx` 寫/刪 + `mkdir -p ~/.hymn-deploy`**:目錄本身已經存在;真 tick 實測寫咗、刪咗,權限 600。**Low**:寫入會跟 symlink——假 repo 實測,如果 `.tick-ctx` 預先係一條 symlink 指去 victim 檔,healthcheck 會覆寫 victim 嘅內容(變成 `pid=… ts=…`),然後 trap 只會 rm 條 symlink,victim 保持被改咗嘅樣。前提係有人可以喺 `~/.hymn-deploy` 放 symlink(咁佢本身已經寫得到 home);selfheal 端就有 `! -L` 擋住。建議:寫之前 `[[ -L $HC_CTX ]] && rm -f`,或者寫 tmp 再 `mv`。
2. **`trap 'exit 143' TERM INT HUP`**:假 repo 新舊版對照(yt-dlp stub sleep 6 秒,1.5 秒時 TERM):舊版 0.0 秒就死 rc=143,仲留低孤兒 yt-dlp;新版要等前景 child 完先跑 trap(4.6 秒),rc=143,ctx 已刪,冇孤兒。兩個版本都冇寫到 health.log。launchd 淨係 bootout/登出/關機先會 TERM 呢個 job(plist 冇 timeout);最差情況係等到 ExitTimeOut(預設 20 秒)被 SIGKILL,ctx 殘留,但因為 pid 已死,ctx 自動失效。**Info/Low**,報告冇寫出呢個延遲。額外好處:selfheal 行緊嗰陣,ctx 唔會被提早刪。
3. **selfheal 多幾個 fork + HOME 重設**:dscl、id、awk、stat、kill -0。launchd HOME=真 home,所以重設後值一樣;下游 `backend-restart.sh` 用 `~/.hymn-deploy` 冇影響。**冇風險**。
4. **selfheal 冇 ctx 就 REFUSED**:(ii) 讀 code:healthcheck L255–261 係**同步前景**呼叫 selfheal(冇 `&`、冇 `exec`),之後先同步 perl→watch。ctx 嘅 pid 係 healthcheck `$$`,喺 selfheal 成個生命期入面都生存,trap 只會喺 healthcheck EXIT 先刪。假 repo 實測 15 秒 recheck 期間 ctx 一直喺度。全 repo 冇其他地方 call selfheal(status.sh 淨係讀 state)。ctx mtime 只喺 selfheal 入口檢查一次;HC 最長大約 45×6 秒 + selfheal,遠少過 30 分鐘。**冇時序問題**。(iii) dscl:見 §0。

## 3. 攻擊重演(假 repo 副本,cwd=/,bash;prod 快照前後比對)

真 repo 嘅攻擊批次被 classifier 拒咗(條件 1)。以下全部喺逐字相同嘅副本度跑;HOME=假 home;「非 tmp」目標用 `/nonexistent-opus12`/`/usr/bin/true`/TEST-NET `192.0.2.1:3001` 代替,所以就算 guard 失守都寫唔到 prod。每批前後 prod 快照(`~/.hymn-deploy/*` 含隱藏檔 md5、watch log 行數+md5、SUPERVISION-LOG、`backend/data/stream-*`、yt-dlp readlink、:3001 pid)**不變**。

- healthcheck:`CLAUDECODE=1` 冇 MANUAL、`HC_MANUAL=yes`、`CLAUDECODE=0`(非空)、`STREAM_WATCH_TEST=0/2`、TEST=1 配 WATCH_DIR 非 tmp / 未設 / 空 / 相對 / `..` / tmp symlink→非 tmp / symlink 嘅子目錄、YTDLP_BIN 非 tmp / tmp symlink→非 tmp、BASE `:3001`:**全部 exit 2 REFUSED,零新檔**。
- 測試模式鏈 + 半設 `SELFHEAL_STATE=非 tmp`:healthcheck 只寫 WATCH_DIR;子 selfheal 跌去 prod 模式,之後 REFUSED(有 CLAUDECODE 同冇 CLAUDECODE 都係)。
- selfheal:冇 env(有/冇 CC)、淨係 DRY_RUN、TEST=1 三個 env 嘅 6 個半設子集 × 有/冇 CC、三個齊但冇 TEST、一個 symlink→非 tmp、`..`、偽造 HOME+有效 ctx(HOME 被重設,搵唔到 ctx)、ctx 係 symlink / pid 已死 / mtime 31 分鐘 / 內容壞 / ctx 係目錄 / `pid=1`(EPERM)/ 有效 ctx+CC=1 / 有效 ctx+`MANUAL=yes`、測試模式 YTDLP_LINK 非 tmp / symlink、BASE `:3001`:**全部 exit 2,零寫入**。
- 正控:有效 ctx + 冇 CC → 行到(rc=0,有寫);ctx pid 指去一個無關嘅 live process(我個 shell)→ 都行到(L3 同類,已知)。
- **RACE(新,Low)**:假 home 放一個有效 live ctx(模擬真 tick 行緊),喺冇 CLAUDECODE 嘅 shell 跑 healthcheck 測試模式 + 半設 `SELFHEAL_STATE=非 tmp` → 子 selfheal 跌去 prod,過到 ctx → 叫 prod restart 指令(假 repo 係 stub;真 repo 會係冇 `--dry-run` 嘅 `backend-restart.sh --same-code`),而且寫 prod SUPERVISION-LOG 同 selfheal.log。要同時滿足三個條件:冇 CC、明文設錯 SELFHEAL_STATE、同真 tick 撞正。同 L2(`.watch-ctx` 係全機通用憑證)屬同一類。

## 4. 測試

- `bash -n`:兩支 script + 全部 `test/*.sh` 過。
- 回歸:t1 t2 t3 t4 t5 t6 t8 t9 t10 t11 t12 全部 rc=0、`PROD-SNAPSHOT OK`(00:16:42–00:18:22)。
- **t7、t13 冇重跑**(兩支都會喺真 repo 行 healthcheck/selfheal,屬 classifier 拒絕嘅同一結果)。代替做法:讀 code 覆核 + 上面嘅副本實驗,覆蓋咗 t13 (a)(b)(c)(d) 同 kill/TERM。
- **F2(Medium-low,測試衛生)**:t13 (b) 用 `NOENV=(env -i … HOME=REALHOME)` 喺真 repo 跑真 selfheal。呢啲 case 唯一嘅保護係真 ctx 唔存在,而 `SKIPREAL` 只喺開頭 check 一次。t13 行到一半啱啱撞正真 tick 嘅話,「selfheal 冇 env」就會變成一次真 prod selfheal(healthy 參數 ⇒ 會寫 prod selfheal state/log;唔會 restart)。另外,README/testlib/報告寫嘅「tick 喺 :07/:37」唔準:StartInterval 會漂移(今晚 00:09)。建議:真 repo 嘅 refused case 保留 `CLAUDECODE=1`(雙重保護),或者每個 case 之前再 check 一次 ctx;文件改為「用 `stream-health-state.json` 嘅 lastCheck+30 分鐘估下一個 tick」。
- t7 改動讀過:刪 sed 副本合理(healthcheck 本身而家有測試模式),行數 assert 保留,case 6 用真 repo 測試模式。testlib 加咗 ctx 存在性快照(2 行),回歸冇受影響。

## 5. 報告準確度

大致準確,有以下幾點偏差:被刪行係 6 行唔係 5 行;TERM trap 會延遲 exit(要等前景 child 完)冇寫;`.tick-ctx` 寫入跟 symlink 冇寫;「:07/:37」同實際 tick 時間唔符;t13 真 repo `env -i` case 對 tick 並發嘅依賴冇寫。§2 講 prod 新增四項行為,準確;§3 t13 描述同 code 一致。

## 6. 逐支判詞:「唔設或半設 env 冇可能寫 prod」

| script | 判詞 |
|---|---|
| stream-watch.sh | 同上輪一樣:Claude shell 入面成立;非 Claude shell 唔設 env = 真 tick(設計取捨) |
| stream-diagnose.sh | 成立(本輪冇改) |
| stream-remedy.sh | 成立(本輪冇改);L2 並發例外照舊 |
| **stream-healthcheck.sh** | **Claude shell 入面成立**(CC 非空 + 冇 HC_MANUAL=1 ⇒ REFUSED;TEST=1 半設/非 tmp ⇒ REFUSED)。非 Claude shell(或者 `env -u CLAUDECODE`)唔設 env = 一個完整真 tick,同 watch 同款取捨。明文漏洞(唔屬「唔設/半設」):測試模式 BASE 寫 `:03001` 或者 tunnel 域名可以繞過 `*:3001*` 檢查;`HC_CDN_FETCH_CMD` 可以指去任何指令 |
| **stream-selfheal.sh** | **成立**,例外係並發:真 tick 行緊嗰段時間(健康 tick 大約 17 秒;唔健康嘅 tick 可以長到 watch 25 分鐘上限),非 Claude shell 嘅 process 唔設或半設 env 都過到 guard(同 L2 同類;ctx 冇綁 parent)。Claude shell 入面一律成立(CC 檢查係無條件) |
| testlib.sh | 預防同偵測都成立(加咗 ctx 存在性);t13 (b) 並發衛生見 F2 |

## 發現(按嚴重度)

- **F2 Medium-low**:t13 真 repo `env -i` selfheal case 依賴冇 tick 並發,加上「:07/:37」時間窗唔準(見 §4)。
- **F3 Low**:tick 期間 ctx 係全機通用憑證(RACE 實測,見 §3);L3 kill -0 冇核 pid 身份,照舊。
- **F4 Low**:healthcheck 寫 `.tick-ctx` 會跟 symlink(見 §2.1)。
- **F5 Info**:TERM trap 令 exit 延遲到前景 child 完成(最多等到 launchd SIGKILL);`HC_WATCH_LOG` 喺 prod 認 env;測試模式 BASE 可以用 `:03001`/域名繞過(curl 實測 `:00009` 會解析成 port 9)。
- **F1(條件)**:真 repo 攻擊 / t7 / t13 被 classifier 擋咗,冇重跑。

## 側效應(如實)

- 寫入:淨係 scratch + 本文件。prod 快照每批前後都不變。
- 起過嘅 process:唯讀 poller(`pgrep`/`ls`,到時自己結束);本機 206 測試 server `127.0.0.1:18206`(python,我自己起,收尾 kill);幾個 `/bin/sleep`(自己起,已 kill);假 repo healthcheck/selfheal(只打 127.0.0.1:9/18206 同 TEST-NET)。
- 冇 restart/launchctl/approve/OTA/swap/drill/真模型/YouTube/googlevideo;冇讀 secret;冇 kill 非自己起嘅 process;冇 git 寫。
- 有一次喺真 repo 嘗試跑 healthcheck 攻擊批次,被 classifier 喺執行前拒絕,冇行到。
