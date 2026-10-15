# 串流警報手機推送 + 10-14 事故四項改善 — 執行報告 2026-10-15

執行單 `STREAM-PHONE-NOTIFY-EXEC-20261015.md`,基準 HEAD `6e4c433`。只出證據,唔判 PASS/FAIL;冇部署、冇 restart、冇真發 Telegram。
測試輸出全文喺 scratch `.../scratchpad/notify/`(`t14.out`、`reg/*.out`);下面摘錄關鍵行。🔴 `PHONE_TARGET` 值全程冇印過(P3 log 內以 `<target>` 出現,並以 `grep -cF` 機械核對原值出現 0 次)。

## 1. Telegram 推送 — 接線(`stream-watch.sh` + `stream-watch-lib.sh`)
| 事件 | 觸發點 | 訊息(<=400 字) |
|---|---|---|
| 本 incident 首次升級 | `do_escalate`(僅 `escalatedFor != incidentId` 時) | `🔴 Odely 串流中斷 <MM-DD HH:MM> 起，形態 <status.form>，診斷動作 <diagActions>／selfheal <lastAction>，需要你：<建議>` |
| 持續未恢復 | `RENOTIFY` action(同 Mac 通知共用 `lastNotifyAt` 計時;間隔 env `WATCH_RENOTIFY_SEC` > conf `PHONE_RENOTIFY_SEC`(>=600) > 21600) | `🔴 Odely 串流仍未恢復（<時間> 起，已 N 小時）…` |
| 恢復 | `RECOVER` 且曾升級(自己好返冇升級 = 唔發) | `✅ Odely 串流已恢復 <時間>（停咗 N 小時）` |
| 出口 IP 變 | healthcheck 寫 `stream-health-state.json` `ipChanged` 旗 → watch 每 tick 讀 | `ℹ️ Odely 出口 IP 由 A 變 B（Mac 重啟/VPN 重連？），下個 tick 會驗串流` |

建議句按形態:④/reason 含 bot-check →「換 NordVPN server（連去唔同城市嘅 US server）；換 yt-dlp 無用」;①→睇 yt-dlp;②→backend restart(可能撞 gate);其餘→睇 STREAM-ALERT.md + 可試換 VPN。
`wlib_notify_phone <kind> <text>`:conf(`$WATCH_DIR/stream-notify.conf`)只 grep 白名單 key(唔 source),缺檔/缺欄靜靜 `return 1`;文字先 strip 控制/bidi/零寬 + `wlib_filter` + 截 400 字元;`openclaw message send --channel/--account/--target -m`(argv 傳,唔經 shell 展開);`wlib_capped_pg 30`;rc≠0 只寫 `stream-notify.log`(時間/類型/rc/耗時/cap;輸出遮 target + filter);永不 exit。測試模式冇 `WATCH_PHONE_CMD` = 結構上唔發。Mac 通知、警報檔、SUPERVISION-LOG 邏輯冇郁。README 已加「手機推送」節(conf 格式、點停 = 刪 conf)。

## 2. 四項改善
- **R1**:`stream-selfheal.sh` 判形態前 `stream-botcheck-count.py` 數 backend log 近 30 分鐘證據行(>=3 且 `healthy_b==0`)⇒ 形態④「出口IP被bot-check」:唔 apply/swap/restart、swapsToday/restartsToday 不變,alert 寫「換 yt-dlp 無用…要人手換 VPN server」;`stream-diagnose-rules.sh` 加 `BOTCHECK_RECENT>=3` ⇒ `escalate`(`stream-diagnose.sh` 寫 facts + bundle 一句)。
- **R3**:`stream-healthcheck.sh` 每 tick `curl -s -m 5 https://ifconfig.me`(測試用 `HC_IP_CMD`),`ip=` 尾欄、state `exitIp`(`?` 唔覆蓋)、`ipChanged`、SUPERVISION ℹ️。
- **R5**:(a) 上一 tick `consecutiveFail>=2` ⇒ A/B 先各探 1 首;(b) `resolveAudio.js` 冷卻 `min(30s×2^(n-1),30min)`,log `冷卻 <秒>（第 n 次）`,`opsMetrics.botCheck` 計數(**要 backend gate restart 先生效**)。
- **R7**:新 `ops/ytdlp/canary-note.sh`(`update-ytdlp.sh` canary-FAIL 時呼叫):`consecutiveFail>=2` ⇒「⚠️ 而家串流健康檢查正在失敗」。

## 3. 驗證證據
**P1**(`t14`,stub openclaw,verdict=escalate,每 tick=30 分鐘模擬時間):
```
ok×3 後:phone=0 mac=0 | bad#1:0/0 | bad#2(首次升級):phone=1 mac=1
再 11 tick(5.5h):phone=1 mac=1 | 再 1 tick(滿 6h):phone=2 mac=2 | 恢復:phone=3 mac=3
watch rc 全部=0(18 次)
P1b fixed-pending-verify 後下一 tick ok:phone=0 mac=0
P1c conf 缺:phone=0 mac=1 alert=yes notify.log=無 watch rc=0 | P1d 缺 PHONE_TARGET:phone=0 mac=1 rc=0
P1e status 帶形態④:訊息 = 「🔴 … 形態 ④出口IP被bot-check，診斷動作 none／selfheal alert-ip-botcheck，需要你：換 NordVPN server（連去唔同城市嘅 US server）；換 yt-dlp 無用」,6 小時後重發 phone=2
```
（P1 訊息 1/2 嘅「形態 ?」係因 `stub-status.sh` 冇 form 欄;真 `stream-status.sh` 有。）
**P2**:stub exit 1 → `phone 嘗試=1 mac=1 alert=yes SUPERVISION 🔴 行=1 rc 全 0`,notify.log:`kind=escalate rc=1 dur=0s cap=30s` + `out: gateway unreachable (to=<target> token=[REDACTED]`;原 target/token 出現次數 0。stub hang 61s → 升級 tick 總耗時 33s(notify.log `rc=124 dur=32s cap=30s`),mac=1 alert=yes rc 全 0,殘留 `sleep 61` process=0。
**P3**(`t16`,`cd / && env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`,真 `/opt/homebrew/bin/openclaw`,真 conf,`--dry-run --json`):`wlib_notify_phone rc=0`,耗時 3s,payload `{"action":"send","channel":"telegram","dryRun":true,"handledBy":"core","payload":{"channel":"telegram","to":"telegram:<target>","via":"direct",…}}`;log 內 target 原值 0 次。(payload JSON 唔含 account/message 文字,呢兩樣靠 argv 組裝 + stub 測試驗。)
**P4**:輸入含 JWT、`$(touch …)`、反引號、U+202E、`Authorization: Bearer …`、換行、900 字 → stub 收到 -m:長度=400;`[REDACTED-JWT]`=True、原 JWT 片段=False、U+202E=False、換行=False、Bearer 值=False;`$(touch` 字面保留(冇展開),PWNED 檔=0。watch 路徑(diagnose reason 帶 JWT + RLO):訊息只用 state 內已 filter 嘅欄位,JWT 片段 0、U+202E 0。
**P5**(selfheal 測試模式,`SELFHEAL_BACKEND_LOG` fixture,時間錨相對現在生成;stub apply/restart):
```
計數器:近期×3 事件(6 行)=6 | 錨 3 小時前=0 | 冇 bot-check 行=0 | 真 /tmp/hymn_backend.log 30 分鐘窗=0
案1 近期 bot-check:lastAction=alert-ip-botcheck form=④出口IP被bot-check swaps=0 restarts=0,apply/restart 被 call=0,message 含「VPN」「換 yt-dlp 無用」,SUPERVISION 含④
案2 負控(無 bot-check 行,同輸入):ytdlp-no-candidate swaps=1,apply 被 call=1(形態①照舊)
案3 負控(舊事故殘留行):同案2(①)
案4 負控(近期行但 healthy_b=1):backend-restart… restarts=1,restart 被 call=1(形態②照舊)
規則診斷:BOTCHECK_RECENT=5 → VERDICT escalate「出口 IP 被 YouTube bot-check…要人手換 VPN server」,remedy stub 被 call=0;BOTCHECK_RECENT=0(同 facts)→ fixed-pending-verify swap-ytdlp,remedy stub 被 call=1
diagnose.sh 寫 facts:BOTCHECK_RECENT=6,bundle 含 bot-check 證據行一句
```
**P6**(healthcheck 測試模式 + watch + 手機 stub;`HC_IP_CMD` 序列):
```
203.0.113.10(首次)  exitIp=203.0.113.10 ipChanged=None ℹ️=0 phone=0
203.0.113.10(同)    ipChanged=None ℹ️=0 phone=0
198.51.100.7(變)    ipChanged={from 203.0.113.10,to 198.51.100.7} log ip=198.51.100.7 ℹ️=1 phone=1
?(失敗)             exitIp 保持 198.51.100.7 ipChanged=None phone=1
198.51.100.7(復)    ipChanged=None phone=1
203.0.113.99(變)    ipChanged={198.51.100.7→203.0.113.99} ℹ️=2 phone=2
```
手機訊息:`ℹ️ Odely 出口 IP 由 203.0.113.10 變 198.51.100.7（Mac 重啟/VPN 重連？），下個 tick 會驗串流`。
**P7**:(a) `--verbose` 數探測行(prev=上一 tick consecutiveFail):
```
prev=0 全探健康 A3 B3 | prev=1 A死 A3 B3 cf=2
prev=2 A死B死 → A1 B1 cf=3 (log light=1) | A死B過 → A1 B3(B 過即補探) | A過B死 → A3 B1
A過B過(恢復) → A3 B3 cf=0(如實:B 首探 id 7UkwavM5L1E 健康時都有約 12% 間歇 403〔Opus:10 月 684 tick 入面 80 次〕⇒ 恢復約 12% 機會遲一個 tick;原寫「冇慢一個 tick」講大咗)
prev=7 A死B死 → A1 B1 | prev=13(新=14,selfheal due) → A3 B3 | prev=1(新=2) → A3 B3
```
(b) `t15`(真 module 複製去 scratch,stub yt-dlp 出真 `Sign in to confirm you’re not a bot`,假時鐘):連續 n=1..9 冷卻秒數 `30,60,120,240,480,960,1800,1800,1800`(MATCH 預期);冷卻中背景 caller fail-fast(streak 9→9,until 不變);真人 `playbackRetry` 過 base 30s 後可試且成功 → streak=0;背景喺冷卻窗內仍被擋;歸零後再撞 = 30s(streak=1);`opsMetrics.total.botCheck={"cooldowns":10,"maxStreak":9,"maxSecs":1800,…}`。
**P8**:`canary-note.sh` fixture:consecutiveFail=0/1 → 舊句「唔使急住做嘢:呢個唔代表而家播歌有事…」;=2/5 →「⚠️ 而家串流健康檢查正在失敗(連續 N 次 unhealthy)…」;state 壞/唔存在 → 舊句。(`update-ytdlp.sh` 本身會 pip + 打 YouTube,冇行,只 `bash -n`。)
**P9**:`t1–t13` 全部 rc=0 且各自 `PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0(t1 14s、t2 10s、t3 14s、t4 3s、t5 2s、t6 50s、t7 13s、t8 4s、t9 17s、t10 2s、t11 3s、t12 4s、t13 12s,t13 `FAILS=0`);新測試 t14/t15/t16 亦 `PROD-SNAPSHOT OK`。`bash -n` 全部改動 shell OK;`node --check resolveAudio.js opsMetrics.js` OK;`py_compile` OK。`ops/deploy/backend-restart.sh --dry-run` → exit 1,`abort:HEAD (6e4c433…) 唔等於已批准嘅 backend.sha (5fc8f6b…)`(預期 gate 攔;deploy.log 冇變)。測試避開 :11/:41 tick 窗。

## 4. 偏離執行單(請 Opus 留意)
1. 發送用 `wlib_capped_pg 30`(殺成個 process group)而非 `wlib_capped`;hang 時多 2 秒 TERM→KILL 寬限 ⇒ 實測 32s/總 33s,即 **略超 30s cap**。
2. R1 regex 用 `you.{1,3}re` 而非 `you.re`:yt-dlp 撇號係 U+2019(3 byte),launchd 的 C locale 下 `.` 只食 1 byte,`you.re` 會漏。
3. R1 形態④多一個條件 `healthy_b==0`(Layer B 直打 resolve 都死):避免舊 bot-check 尾巴令真 backend 故障(②)被誤吞。
4. backend log 的 bot-check 行冇時間戳,「近 30 分鐘」靠同檔 `[tag] <ISO-Z>` 錨行保守估(行時間 >= 前一錨;只數前一錨在窗內者)。寧少數:log 係累積檔,10-14 殘留行唔可以觸發今日。真實事故期 healthcheck 每 30 分鐘打 `/api/stream` 會產生錨。
5. R5(a):少探取 id 77 / 7UkwavM5L1E;1 首過 ⇒ 即補探其餘(否則 `ok>=2` 結構上過唔到,恢復會被卡死);selfheal due tick(連續 fail=2、14、26…)照舊全探,修復梯/節流不變。1 首失敗 ⇒ 該層判 unhealthy(B 個別間歇 403 會令事故多拖一個 tick)。
6. R5(b):真人播放(`playbackRetry`)只受舊 30s base 冷卻管,否則 Eric 換 VPN 後 backend 仍 fail-fast 到 30 分鐘;成功只令 n 歸零,背景冷卻窗自然到期先放行(冇提早解除)。
7. 重發間隔 conf 值同 Mac 通知共用(執行單「共用計時」);已升級後「診斷員登記升級」再入 `do_escalate` 唔重發手機(避免洗版)。
8. IP 變更手機句要求 `stream-watch.on` + conf;SUPERVISION ℹ️ 由 healthcheck 寫(watch 唔重寫)。
9. dry-run 時額外加 `--json` 先見 payload。`canary-note.sh` 舊句順手將過時嘅「每 3 個鐘」改「每 30 分鐘」。
10. `ops/stream/stream-status.sh` 工作樹有他人未 commit 改動(OPS_METRICS 欄位),**冇掂、冇 commit**。

## 5. 側效應(如實)
- 寫入:repo 內改動/新檔(見 commit);scratch 測試檔。prod 零寫入(testlib 快照每支 OK)。冇建/改 `~/.hymn-deploy` 任何檔。
- 讀取:`~/.hymn-deploy/stream-notify.conf`(t16 讀;只印 key 名同權限 600;target 只用於 `grep -cF` 核對 log 冇漏);`/tmp/hymn_backend.log` 唯讀(計數器+睇行格式);`~/.openclaw/` 冇讀冇寫。
- 執行真 `openclaw`:`message send --help` 一次 + t16 `--dry-run --json` 兩次(第二次係加 `--json` 後)。**冇真發訊息**;openclaw 自己進程可能寫它自己嘅 state/log(我冇檢查、亦唔准睇 `~/.openclaw`)。
- 冇打 ifconfig.me(`HC_IP_CMD` stub);冇 YouTube/googlevideo;測試起過一個 127.0.0.1 隨機 port 嘅 python 小 server(已 kill);`backend-restart.sh --dry-run` 一次(gate 攔,冇 restart)。t1–t13 本身會做佢哋一向做嘅唯讀 localhost 探測。
- 冇 restart/launchctl/approve/OTA/swap/drill/真模型;唔掂 VPN/網絡/Cloudflare。

## 6. 冇做到 / 待 Opus、Fable
- 冇測「真 gateway 死咗」(唔准殺 gateway;以 stub exit 1 / hang 代);冇真 launchd tick 驗證(要部署後睇 `stream-health.log` 出現 `ip=`)。
- R5(b) 要 backend gate restart 先生效(需 approve);healthcheck/watch/selfheal 係 script,下個 tick 即生效。
- 真發一條測試訊息由 Fable 喺 Opus 驗收後做;發之前 `PHONE_RENOTIFY_SEC`、`PHONE_ACCOUNT` 值由 conf 提供(我冇睇值)。

## 7. 第二輪(Opus 驗收 `STREAM-PHONE-NOTIFY-OPUS-20261015.md` 修正;2026-10-15)

commit:backend `6a23d3a`、ops `70e6aaf`、test+本節(下一個 commit)。backend 仍**未 restart**(要等 IP 回復 + gate)。

| # | 項 | 狀態 | 證據 |
|---|---|---|---|
| 1 | `routes/hls.js:387` 加 `{ playbackRetry: true }` | ✅ | t15 靜態核對命中行數=1;行為:harness「playbackRetry @31s」於長冷卻(剩 ~1469s)內成功。副作用(如實):playbackRetry 同時令 HLS 失敗只入 60s 短視野 failCache(同 stream.js);原註釋刻意唔傳,已改寫 |
| 2 | 並發每冷卻窗只加一次 | ✅ | harness:5 個並發背景 resolve 同撞 bot-check → streak=1、冷卻 30s、`botCheck.cooldowns` 記帳增量=1;窗過後再撞 → streak=2、60s。窗內再撞只刷新 base(真人 30s 閘),不加 streak、不延長 until |
| 3 | 成功即解除冷卻 | ✅ | harness:長冷卻中 playbackRetry 成功 → streak=0、until=0;緊接背景 caller → ok(舊:仲被擋 440s) |
| 4 | `botCheck` 入 `blankBucket`/`normalizeBucket` | ✅ | harness:新 process 未撞過 `total.botCheck` 已有欄位;normalize 對舊碟補齊 |
| 5 | harness | ✅ | `ops/stream/test/t15-resolve-backoff.sh`(真 module 複製去 scratch、假時鐘):序列 `30,60,120,240,480,960,1800,1800,1800` MATCH(不變);並發/成功解除/hls 靜態如上。PROD-SNAPSHOT OK |
| 6 | R3 `curl -4` | ✅ | t17:`curl -4 -s -m 5 https://ifconfig.me` 命中 1 行(測試模式不打網絡) |
| 7 | rules 1b 加 `healthy_b==0` | ✅ | rules 讀新 fact `HEALTHY_B`(diagnose 由 state.healthyB 寫);缺/空=不判④(fail-safe)。t14:HEALTHY_B=1 / 空 → 走 swap(負控),HEALTHY_B=0 → ④ escalate、零 remedy |
| 8 | R1 盲點:Layer B stderr 計數 | ✅ | healthcheck probe_b 把 yt-dlp stderr 落暫存檔(`mktemp`,EXIT trap 清),resolve-fail 時 grep `(^|[^0-9])429([^0-9]|$)|Sign in to confirm|LOGIN_REQUIRED` → state 新欄 `botcheckB`/`bResolveFail`/`b403`/`healthyB`。selfheal:證據=backend log 計數+`state.botcheckB`(閾值仍 3),並要求 `resolve-fail>=1 且 >= 403 數`(從 `--detail` 數)。t17 C1–C3 三種 stderr 全計、backend log 檔不存在時 selfheal 單靠 state 判④;C4 stderr 含 14291/24290 數字不誤中、C5 resolve 得+403 → 非④(判①) |
| 9 | 警報文字 | ✅ | 僅「A 過 B 死」分支:`midfail>0 && resolve-fail==midfail && mid==0 && botcheckB>=1` → 寫「⚠️ 出口 IP 疑被 YouTube bot-check/429(換 yt-dlp 無用,要換 VPN server)」且不含「1MiB 病」「第一件事查 yt-dlp」;其餘照舊(t17 C4/C5 仍出舊文字)。探測/判定邏輯一字未改;「兩層都失敗」「backend 側」分支文字未改 |
| 10 | §P7「冇慢一個 tick」 | ✅ | 已改如實(約 12% 機會遲一個 tick),見 §3 P7 |

**回歸**:t1–t17 全部 rc=0,每支 `PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0(t13 FAILS=0)。測試改動:t14 規則診斷改為帶 `HEALTHY_B/B_RESOLVE_FAIL/B_403/BOTCHECK_B` facts(原 `BOTCHECK_RECENT` 單欄已不足以判④,屬規格改變);加案5/案6(selfheal 用 state、403 為主)、規則 4 個新案;diagnose facts 案 pin `HEALTH_STATE` fixture。新增 `t17-second-round.sh`。

**過程中自己揪出嘅 bug**:改 `stream-diagnose.sh` 時把 heredoc 結束符 `PY` 後面接咗註釋 ⇒ heredoc 不終止(`bash -n` 唔報),t14 的「diagnose 寫 facts」案顯示「冇 facts 檔」先發現,已修(註釋搬返 echo 行)。

**偏離/注意**
- 窗內再撞冷卻:唔延長 `until`(只刷新 base)。若要「窗內再撞延長」需另議。
- 成功只清 `ytRateLimitedUntil`,`ytRateLimitedBaseUntil`(≤30s)任其自然過。
- selfheal 的 resolve-fail/403 比例由 `--detail` 字串計(light 模式只探 1 首 ⇒ 樣本 1;④ 閾值 backend log + botcheckB >= 3 仍需 backend log 補足)。
- healthcheck 現在每 tick 多一個 `mktemp`(`$TMPDIR`,失敗則退回 /dev/null),**ops 改動於 commit 後下一個真 tick(16:07)即 live**;本輪測試全部避開 :07±2 與 :12。
- backend 三檔仍未 restart/部署。

## 8. 第三輪(Opus 第二輪驗收 `STREAM-PHONE-NOTIFY-OPUS2-20261015.md` 細修;2026-10-15)
| # | 項 | 狀態 | 改動 / 證據 |
|---|---|---|---|
| 1 | B1 成功連 `baseUntil` 歸零 | ✅ | `resolveAudio.js` runStrategy 成功時 `ytRateLimitedBaseUntil=0`。t15:until 已過、base 仲剩 25s → 背景成功後 base=0、緊接 playbackRetry 即 ok |
| 2 | B2 冷卻 skip 唔寫 failCache | ✅ | skip error 帶 `rateLimitedSkip`,`resolveAudioUrl`/`refreshAudioUrl` 兩個 catch 只喺非 skip 先寫。t15:冷卻期背景 failCache.has=false;60s 內真人播放同一首 ok(唔係 Known-bad);控制組真失敗 failCache.has=true |
| 3 | botCheck 語義 | ✅ | `cooldowns` → `cooldownWindows`(每窗一次)+ 新 `hits`(每次撞都計,`recordBotCheckHit`);blankBucket/normalizeBucket 同步,舊碟 `cooldowns` 轉入 `cooldownWindows`。t15:並發 ×5 → hits +5、cooldownWindows +1 |
| 4 | harness | ✅ | t15 擴充(B1/B2/控制組/hits),全部符預期 |
| 5 | O1 | ✅ | `stream-diagnose.sh` 測試模式 `HEALTH_STATE` 強制喺 `$WATCH_DIR/` 內(指去 prod 路徑都被改寫);t8 釘 fixture(含 healthyB/botcheckB/bResolveFail/b403)+斷言:案3 swap-ytdlp、④ escalate、缺欄 fail-safe、prod 路徑隔離,FAILS=0 |
| 6 | HEALTHY_B 空 fail-safe | ✅ | rules 新 1c:HEALTHY_B 缺/空且本來會落 swap → escalate(只收窄 swap 路徑,其他規則不變)。t8 斷言 C |
| 7 | ④訊息 | ✅ | 「backend log 近 30 分鐘 N 條 + 健康檢查 Layer B M 條 bot-check 證據(合共 K)」;t14 P5 案1=6+0、案5=0+3 |
| 8 | 手機白話化 | ✅ | 見下;sanitize 改為保留換行(其餘控制字元/bidi/零寬照剷、過濾不變、≤400);t14 P9 斷言四款×形態 + 禁用內部字眼(rc= ignored selfheal alert- verdict escalate 形態 Layer) |
| 9 | 回歸 | ✅ | t1–t17 全 rc=0、`PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0;t13 FAILS=0;t14 P9 FAIL=0;bash -n 全部 ops/stream 與 test、node --check 兩檔過 |

### 四款訊息文案
- 🔴 首發④:`🔴 Odely 播歌出問題（由 10-15 15:42 起）` / `原因：VPN 出口 IP 被 YouTube 當機械人擋住` / `自動修復：已判斷換 yt-dlp 無用，未自動修` / `要你做：換 NordVPN server（揀另一個城市），換完等 30 分鐘會自動確認`
- 🔴 重發:標題改 `🔴 Odely 播歌仍未恢復（由 10-15 15:42 起，已 6.5 小時）`,其餘三行同形態
- ① 原因「yt-dlp 版本過舊，YouTube 唔收」/ 自動修復「系統會自動試換新版」/ 要你做「暫時唔使做——yt-dlp 版本過舊，系統會自動試換」
- ② 原因「backend 死咗」/「系統會自動重開」/「暫時唔使做——backend 死咗，系統會自動重開（如果重開唔到會再通知你）」
- ③ 原因「YouTube 側問題」/「冇得自動修，系統每 30 分鐘會自動重試」/「暫時唔使做——YouTube 側問題，通常等 1–2 次檢查（約 30–60 分鐘）自己好」
- 形態不明:原因「未能確定（可能係 VPN 出口 IP 被 YouTube 擋）」,要你做「試換 NordVPN server…」
- ✅ 恢復:`✅ Odely 播歌已恢復（10-15 18:12）` / `停咗大約 2.5 小時` / `要你做：唔使做嘢`
- ℹ️ IP 變:`ℹ️ Odely 網絡出口 IP 變咗（可能係 VPN 重連或者 Mac 重啟）` / `系統下一次檢查（約 30 分鐘內）會自動確認播歌有冇受影響` / `要你做：暫時唔使做`(不再帶 IP 數字)

### 側效應 / 事故中安全
- ops 已 live:只改訊息字串、sanitize、diagnose 測試模式、rules 的缺欄分支、selfheal 的 alert_msg 文字。watch state 機(escalated/notifyCount/lastNotifyAt)、重發計時、selfheal 形態判定與節流全部未改 → 唔會重複升級/重發;進行中 incident 22:12 重發會用新白話文案。
- backend 改動(1a204ff)要 gate restart 先生效,未 restart。
- 只寫 scratch;prod 零寫入(PROD-SNAPSHOT OK);冇真發 Telegram、冇 restart/launchctl/swap/YouTube。
