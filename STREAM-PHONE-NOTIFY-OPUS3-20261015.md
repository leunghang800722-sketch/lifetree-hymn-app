# STREAM-PHONE-NOTIFY 第三輪獨立驗收(Opus,聚焦)— 2026-10-15

對象:backend `1a204ff`、ops `c102d27`、test `0094556`(背景:`STREAM-PHONE-NOTIFY-OPUS2-20261015.md` 嘅 B1/B2/O1/🟡)。
驗收員冇改 code、冇 git 寫、冇 restart/launchctl/approve/OTA/swap/真發/YouTube。只寫 scratch(`…/scratchpad/opus-notify3/`)同本檔。

## 判詞
- **backend `1a204ff`(連 `e428dcf`+`6a23d3a`):可部署 🟢。** B1/B2 用自建 harness 驗過,同一個 harness 對舊 code(`68cc824`)會 FAIL 9 項,證明個儀器分得出新舊 code。部署條件同時機見 §4。
- **ops `c102d27`:可繼續 live 🟢。** 16:42 真 tick 用新文案端到端發咗 ✅ 恢復訊息(rc=0)。狀態機冇改。有兩個 🟡 唔阻 live(見「發現」F1、F2)。

## 最近真 tick 實況(16:42,`c102d27` live 之後第一個 tick)
| 項 | 實測 |
|---|---|
| stream-health.log | `16:42 ok=3 fail=0 mid=3 midfail=0 consecutiveFail=0 light=1 ip=194.88.100.117` ⇒ **事故已自己恢復,而且出口 IP 冇變**(同 15:42/16:12 一樣) |
| health state | `botcheckB=0 bResolveFail=0 b403=0 healthyB=1 consecutiveFail=0` |
| watch state | `status=ok badTicks=0 escalated=false notifyCount=1`(冇重複升級、冇重發;incidentId 保留 `20261015-154206`) |
| `/tmp/hymn_stream_watch.log` | `16:43 RECOVER(escalated) incident=20261015-154206 notify rc=0 phone=sent`;冇 REFUSED/error/Traceback |
| stream-notify.log | 加咗一行 `16:43:03 kind=recover rc=0 dur=5s len=91`。91 byte 同新 ✅ 模板(「停咗大約 1.0 小時」)嘅 UTF-8 長度吻合 ⇒ **Eric 收到嘅係新白話文案** |
| selfheal / SUPERVISION-LOG | `16:42 RECOVERED 之前形態=④`;✅ 恢復兩行(自動修復梯 + 監察)。`STREAM-ALERT.md` 已清走 |
| 暫存檔 | `/tmp/hc-berr.*`、`/tmp/phonenotify.*` 都冇殘留 |

呢度唯一要留意嘅係**事實本身**:IP 冇換都好返咗。即係呢次 bot-check 自己過咗。驗收員睇唔到 Eric 有冇喺 16:12 之後郁過 VPN(換咗 server 但出口 IP 一樣嘅可能性好細)。協調者要問 Eric,答案會影響記憶「只有 Eric 換 NordVPN server 先救到」嗰條結論。

## 1. backend `1a204ff`
逐行睇過 diff,總共 2 檔、38 行。Harness 嘅做法:將 `backend/lib` 複製去 scratch,真 import 真 module;stub yt-dlp 有 ok/bot/dead 三個 mode,並記低 call 次數;用假時鐘。**新 code 16/16 PASS**,`RESOLVE_PARALLEL=1` 路徑都係 16/16。**正控:同一個 harness 跑舊 code `68cc824` 有 9 項 FAIL**(B1 base 冇清、B2 failCache.has=true / Known-bad、hits=NaN)。
- **B1** ✅ 背景成功之後 `streak/until/baseUntil` 全部變 0,真人播放即刻去到 yt-dlp。負控:如果冇成功,真人照樣被 base 擋,而且 yt-dlp 零 call。
- **B2** ✅ 冷卻期內背景 skip、`refreshAudioUrl` skip、真人被 base 擋嘅 skip,三種都**唔寫** failCache,亦都冇 call yt-dlp。過咗 base 之後真人播同一首 ⇒ ok(舊 code 會出 Known-bad)。**控制組**:死鏈、真係撞到 bot-check(試過 YouTube)、refresh 真失敗,三種都**照寫** failCache;第二次背景 call 出 `Known-bad`。舊 failCache 嘅優先次序喺冷卻閘之前,冇變。
- **`rateLimitedSkip` 漏網檢查** ✅ `resolveViaYtDlp` 得兩個 caller(`resolveAudioUrl`、`refreshAudioUrl`),兩個都改咗。全 backend 寫 failCache 嘅地方只有呢兩個 catch 加 `bustCache`/delete。`server.js` keep-warm 同 daily warm、`hls.js`、`stream.js` 冇自己嘅負面快取。backend log 計數器(`stream-botcheck-count.py`,認 `Sign in…|LOGIN_REQUIRED|bot-check 偵測到`)唔會數到 skip 行「冷卻中(仲有 Ns)」。
  - 側效應(中性):keep-warm 追落後喺冷卻期間會每 90 秒重揀同一個 head id,同時 `usedToday++`。舊 code 都係每 tick 燒一格額度,所以燒額度嘅速度一樣,冇多咗 yt-dlp call。skip 嘅 warn 行會比以前多,因為以前有部分被 Known-bad 截咗。
- **`cooldownWindows`/`hits`** ✅ 5 個並發 ⇒ hits +5、windows +1、streak=1;窗內 skip 兩樣都唔計;hourly bucket 同步。
- **blankBucket / normalizeBucket / 遷移** ✅ 舊碟 `{cooldowns:7,…}` 會變做 `cooldownWindows=7, hits=0`,冇咗 `cooldowns`(total 同 hourly 一樣);冇 botCheck 欄 ⇒ 補齊做 0;兩個欄都有 ⇒ 保留 `cooldownWindows`。prod `ops-metrics.json` 而家根本冇 `botCheck`(pid 962 係 10-14 10:27 開嘅),所以遷移路徑喺 prod 實際上唔會行。全 repo 冇其他地方讀 `cooldowns`。
- `node --check`:resolveAudio.js / opsMetrics.js / hls.js / server.js 全過。
- 儀器限制(如實):我嘅「playback 有冇被擋」斷言靠 `rateLimitedSkip` 旗判斷,舊 code 冇呢個旗,所以對舊 code 嗰兩條唔算數。B1 嘅分辨力靠「base==0」嗰條斷言(舊 code FAIL)。

## 2. ops `c102d27`
逐 hunk 睇過 diff。`stream-watch.sh` 只改咗 `phone_plain`/`phone_msg_down`、ipchange 文字、recover 文字三處。**狀態機(badTicks/escalated/notifyCount/lastNotifyAt)、重發計時、`phone_send`、selfheal 形態判定同節流:零改動** ✅。selfheal 只加咗 `botL` 同改 alert_msg 字串;`botN` 判④嘅算式冇變 ✅。
- **sanitize adversarial**(自己寫嘅 16 個 case):
  - ✅ JWT 單獨一行、跨行(header 留低,payload+sig 被剷,同舊版一樣)、`\r`→空格、ANSI ESC/BEL、bidi U+202E/U+2066、U+2028、NEL、VT/FF 全部剷走;`\n{3,}` 壓做兩個;400 字元上限準(500 個 CJK ⇒ 400 字元)。
  - 🟡 **F1 迴歸(只係防禦縱深)**:`wlib_filter` 係 `perl -pe` 逐行處理。換行唔再轉空格之後,「鍵名同值中間隔一個換行」就過唔到 filter:`Authorization:\n<值>`、`Bearer\n<值>`、`password=\n<值>` 嘅值會原文漏出去。我用舊版 sanitize(`1a204ff:stream-watch-lib.sh`)做控制組,三個都係 `[REDACTED]`。**而家冇實際風險**,因為四款訊息全部係固定模板,只係插時間同時數,唔再帶 escalateReason/AI 文字。但係將來有人將自由文字塞返入訊息,呢個洞就會變真。建議:sanitize 入面 filter 改用 slurp(`perl -0777`,令 `\s` 跨行),或者先將 `\n` 換成 sentinel 過 filter 再換返。
  - 舊有(唔係今輪引入):`Bearer<U+2028>tok` 剷走 U+2028 之後變 `Bearertok`,`Bearer\s+` 唔中。
  - 多行偽 log 行注入只會去到 Telegram 正文。notify.log 只記 `len=`,唔受影響。
- **文案**:長度 ④首發 129 字/254B、④重發 139、①102、②100、③121、✅47、ℹ️80,全部 ≤400。冇 IP、冇 path、冇 token(ℹ️ 冇 IP 數字,t14 斷言 0)。watch.log 本地仍然記 `IPCHANGE a -> b`,屬本機 log,可以接受。
  - 🟡 **F2 措辭會誤導**:手機訊息只喺**升級**(即自動修復已經失敗或者做唔到)先發。但係 ①②③ 嘅「要你做」寫「暫時唔使做——系統會自動試換/重開」。10-14 嗰單係 ① 類加 swap 額度用晒,如果用呢個文案,Eric 會以為唔使理。建議 ①②③ 改做:「要你做：系統試過自動修但未好，請叫 Claude 跟進（你唔使自己郁）」。t14 P9 而家將「暫時唔使做」釘死咗做斷言,要一齊改。
  - 修辭建議(Eric 唔識 code):「VPN 出口 IP 被 YouTube 當機械人擋住」可以改「VPN 而家用緊嘅網絡位置被 YouTube 當咗機械人擋住」;「已判斷換 yt-dlp 無用，未自動修」可以改「呢種情況系統自己修唔到」(唔好出現 yt-dlp);① 原因可以改「下載工具版本太舊」;② 「backend 死咗」可以改「後台伺服器停咗」。✅ 恢復可以加一句「如果你未換 VPN，都唔使換喇」(今次正正係冇換都好返)。
- **O1** ✅ 測試模式 `HEALTH_STATE` 唔喺 `$WATCH_DIR/*` 就會改寫(t8 斷言 D:指去 prod 路徑照樣讀 fixture ⇒ swap)。測試模式本身要求 WATCH_DIR 喺 tmp(realpath、冇 `..`)。細節:`$WATCH_DIR/../x` 會過到個 case pattern,但只係讀,而且 WATCH_DIR 已經限死喺 tmp,可以接受。
- **rules 1c** ✅ `HEALTHY_B` 由 diagnose 正規化做 `0|1|''`(healthcheck 只寫 0/1)。缺欄而且規則 2 成立 ⇒ escalate、冇 swap(t8 斷言 C)。其他規則冇郁。
- **selfheal ④ 訊息** ✅ `backend log N 條 + Layer B M 條(合共 K)`,t14 案1=6+0、案5=0+3。

## 3. 回歸
16:45–16:49 喺 `cd /`、`env -u CLAUDECODE`、`TMPDIR=scratch`、每支用獨立 scratch 跑 t1–t17:**17/17 rc=0、全部 `PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0**。t8 第三輪斷言 FAILS=0;t13 FAILS=0;t14 P9 七款 PASS、FAIL=0;t15 SEQ MATCH;t17 hc-berr 殘留=0。`bash -n`:ops/stream/*.sh、test/*.sh、stream-healthcheck.sh 全過。diff 範圍 `68cc824..0094556` = 13 檔,同 commit 訊息一致,冇夾帶其他嘢。
- 註:working tree 有一個未 commit 嘅 `ops/stream/stream-status.sh`(mtime 09-07,HLS-PREFLIGHT 嘅 403 欄),同今輪無關,但佢係 live 緊嘅未 commit 改動,知會一聲。

## 4. 部署(backend `e428dcf`+`6a23d3a`+`1a204ff` 一次過 gate restart)
- 而家 pid 962(10-14 10:27 起)三個 commit 都未 live。待生效嘅只有 `resolveAudio.js`/`opsMetrics.js`/`routes/hls.js`,冇掂 auth(requireAuth/userDb/JWT)⇒ 401 風險低,但都照 `feedback-401` 做檢查。
- **時機**:事故 16:42 已經恢復 ⇒「恢復後」嘅條件已經達到。建議等多一個健康 tick(17:12)確認唔係一次過嘅好轉,之後揀安靜窗口(避開 :12/:42 ±3 分鐘,例如 17:16–17:38)。另外要:deploy.log 最近 15 分鐘冇 `ota-publish`(最後一次係 10-02);Eric 唔係做緊真機 QA;Eric approve gate。如果 17:12 又再 bad,就照第二輪講法處理:事故中 restart 都可以接受,但唔會令串流恢復。
- **restart 前 smoke**:`node --check` 三檔;`git status` backend/ 冇 scratch script(gate 要求);確認 `HEAD` 包含 1a204ff;記低 restart 前嘅 `/api/health` 同 `failCacheSize`。
- **restart 後 10 分鐘**:
  1. `ps -o lstart -p <新pid>`(唔好靠 deploy.log)、`/api/health` 200。
  2. backend log 有 `🗃️ resolve-cache:由碟載返 N 條`,同埋有 `[resolve] ok strategy=`。
  3. `ops-metrics` 嘅 `total.botCheck` 有 `cooldownWindows/hits` 欄,冇 `cooldowns`;如果有撞,`hits ≥ cooldownWindows`。
  4. 開機 pre-cache 冇連環 bot-check(`bot-check 偵測到` 行 ≤ 少量,`冷卻` 秒數係 30→60… 遞增,唔係固定 30)。
  5. **401 分佈**:`/tmp/hymn_backend.log` 嘅 `[access]` 401,>5 條而且多過一條路徑 ⇒ 即刻回滾 backend(唔係 OTA)。
  6. 下一個真 tick 嘅 `stream-health.log` 要 ok,watch 冇開新 incident。
  7. 留意 restart 會清 presence Map/warm buffer/in-memory failCache(預期之內,唔好當 regression)。

## 發現(總表)
| # | 級 | 內容 |
|---|---|---|
| F1 | 🟡 | sanitize 保留換行之後,逐行 filter 擋唔住「鍵名\n值」型密鑰(Authorization/Bearer/password)。舊版會擋。而家冇自由文字輸入,所以只影響防禦縱深 |
| F2 | 🟡 | ①②③ 升級訊息寫「暫時唔使做」,同「升級=自動修唔掂」矛盾,會令 Eric 唔理;t14 P9 鎖死咗呢句 |
| F3 | ℹ️ | 16:42 冇換 IP 都自己恢復咗:要問 Eric 有冇郁過 VPN;✅ 文案可以加「未換就唔使換」 |
| F4 | ℹ️ | 冷卻期間 keep-warm 追落後重揀同一個 id、每 tick 燒一格 `usedToday`(同舊 code 一樣嘅速度),skip warn 行會多咗 |
| F5 | ℹ️ | `stream-status.sh` 有未 commit 嘅 live 改動(09-07,無關今輪) |

## 側效應(如實)
- 只寫咗 scratch 同本檔;回歸 17 支 PROD-SNAPSHOT OK;harness 嘅 metrics/resolve-cache 寫落 scratch 副本(之後已刪 metrics)。
- 讀過嘅 prod 檔(只讀):`~/.hymn-deploy/stream-watch-state.json`(印嘅時候已經剔走 target/phone 欄)、`stream-notify.log`、`stream-remedy.log`、`/tmp/hymn_stream_watch.log`、`backend/data/stream-health*.{log,json}`、`stream-selfheal.log`、`SUPERVISION-LOG.md` 尾、`ops-metrics.json`(grep)、`deploy.log` 尾。冇讀 `stream-notify.conf`,冇印 PHONE_TARGET。
- 冇讀寫 `~/.openclaw/*`(測試全部設 `TMPDIR=scratch`,避開 shell 預設 `~/.openclaw/tmp`)。sanitize 測試有 source `stream-watch-lib.sh`(只係 export PATH/USER,冇副作用)。
- 冇 restart/launchctl/approve/OTA/swap/drill/真模型/YouTube/真發;冇殺 process;等 tick 用嘅背景 job 已經自己退出。所有測試都喺 16:34–16:38 同 16:45–16:50 做,避開咗 16:42 ±2 分鐘。
