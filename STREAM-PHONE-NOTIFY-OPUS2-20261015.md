# STREAM-PHONE-NOTIFY 第二輪獨立驗收(Opus)— 2026-10-15

對象:backend `6a23d3a`、ops `70e6aaf`、test `0a631b2`。驗收員冇改 code、冇 git 寫、冇 restart/launchctl/真模型/YouTube。

## 判詞
- **ops `70e6aaf`:可繼續 live。** 16:12 真 tick 端到端走啱:形態④、規則/AI 都判 escalate、冇 swap、冇食配額、Telegram 真發 rc=0。
- **backend `6a23d3a`:可部署(🟢 有條件)。** 兩個 🔴 已修好,我自己用 harness 重驗過。剩低兩個 🟡 唔阻部署(見 B1/B2)。部署時機見 §4。
- 冇 blocker:冇 crash、冇 REFUSED、state JSON 完整、tick 跑完冇殘留暫存檔。

## 16:12 tick 實況(真事故)
| 項 | 實測 |
|---|---|
| stream-health.log | `16:12 ok=3 fail=0 mid=0 midfail=3 consecutiveFail=2`,B 三首全部 resolve-fail,`ip=194.88.100.117`;冇 light=1(prev cf=1,同預期一樣) |
| health state 新欄 | `botcheckB=3 bResolveFail=3 b403=0 healthyB=0`(Layer B stderr 計數喺 launchd 下真係 work) |
| selfheal | `alert-ip-botcheck botcheckLines=14`(backend log 11 + Layer B 3)、`due=1`、swapsToday=0 / restartsToday=0 冇郁 |
| SUPERVISION-LOG | 新行「🔴 自動修復梯:形態④出口 IP 被 bot-check,要人手換 VPN server 16:12」+「🔴 串流監察升級 16:12」。冇「1MiB 病」字眼 |
| 診斷 | `stream-incident-20261015-154206/`:engine=ai、VERDICT escalate、ACTIONS escalate(rc=0)、cost $0.029。facts:`BOTCHECK_RECENT=11 BOTCHECK_B=3 B_RESOLVE_FAIL=3 B_403=0 HEALTHY_B=0` |
| 升級 | `~/.hymn-deploy/STREAM-ALERT.md` 已建立;watch state 變 escalated=true、notifyCount=1 |
| Telegram | `stream-notify.log`:`16:12:38 kind=escalate rc=0 dur=5s len=233` ⇒ **Eric 真係收到第一條**。log 本身冇記 target/內容 |
| 暫存檔 | `/tmp`、`/var/folders` 都冇 `hc-berr.*` 殘留 |

推返出嚟嘅訊息原文(重組出嚟嘅字串 UTF-8 長度啱啱好 233 byte,同 log 嘅 `len=` 對得上):
「🔴 Odely 串流中斷 10-15 15:42 起，形態 ④出口IP被bot-check，診斷動作 escalate(rc=0) (ignored=0)／selfheal alert-ip-botcheck，需要你：換 NordVPN server（連去唔同城市嘅 US server）；換 yt-dlp 無用」
- 清楚嗎:行動指示清楚,冇誤導去 yt-dlp。🟡 中段「診斷動作 escalate(rc=0) (ignored=0)／selfheal alert-ip-botcheck」係內部術語,Eric 睇唔明但唔礙事。
- 有冇外洩:冇 IP、冇 path、冇 token、冇 target。
- 注意:15:42 嗰條 SUPERVISION-LOG(ops 未 live 時寫嘅)仍然係舊文「1MiB 病/第一件事查 yt-dlp」,下游讀 log 嘅人要知道已經被 16:12 ④ 取代。

## 1. backend `6a23d3a`(逐行 + 自建 harness)
Harness 做法:將 `backend/lib` 複製去 scratch,直接 ESM import 真 module(唔係 mock);YTDLP_BIN 指去 stub,用 mode 檔控制;`Date.now` 換成假時鐘;resolve-cache 寫去 scratch。**14/14 PASS**,`node --check` 三檔全過。
- A 序列 30,60,120,240,480,960,1800,1800,1800 ✅
- B 5 個並發背景 resolve 同時撞:真係打咗 5 次 yt-dlp,但 streak=1、冷卻 30s、`botCheck.cooldowns` 只 +1 ✅;窗過咗再撞先去到 streak=2 ✅
- C 長冷卻(streak 6、剩 1800s):背景零 yt-dlp call 即 fail-fast ✅;playbackRetry 過咗 base 之後真係去試,窗內再撞唔加 streak、唔延長 until,只刷新 base ✅
- D 成功之後即刻 streak=0、until=0,背景緊接就放行 ✅
- G inFlight 合併:背景同 playback 同一首歌只會打 1 次 yt-dlp ✅
- H 新 process 一開始 `total.botCheck` 已經有欄位;normalizeBucket 會補齊舊碟上嘅 bucket ✅
- hls.js `playbackRetry:true`:m3u8 只喺 active track(真人)先請求,前端冇預取 m3u8;segment 行 /api/stream,本身已經係 playbackRetry。HLS 路徑冇其他地方假設「長 failCache」。failCache 60s 短視野同 stream.js 一致 ✅
- **B1 🟡 `baseUntil` 喺成功時冇清**:窗內撞(例如 in-flight 嘅背景 straggler)會將 base 推到超過 until(實測 base−until=25s)。之後如果背景先成功,until=0 但 base 仲剩 ~25s,呢段時間真人播放反而仲被擋(`yt-dlp:cd`),即係背景閘比真人閘鬆。窗口 ≤30s。建議成功時一齊設 `ytRateLimitedBaseUntil = 0`,或者背景閘改用 `max(until, base)`。
- **B2 🟡(舊有,R5b 放大咗)冷卻 skip 都會寫 failCache**:背景(預取 /warm、keep-warm)喺冷卻期內 fail-fast,但都會寫 15 分鐘 failCache。真人 60s 內撳同一首歌就即刻食 Known-bad,完全冇去試 YouTube(實測 `bg=cd → playback=Known-bad`)。冷卻變長之後,呢個情況喺 Eric 換完 VPN 之後最常撞到。建議 rate-limit skip 唔好寫 failCache。
- 🟡 細節:`cooldowns` 而家數嘅係「冷卻窗」,唔係「撞嘅次數」,睇 metrics 嗰陣要知。

## 2. ops `70e6aaf`(逐行)
- Layer B stderr:`mktemp "${TMPDIR:-/tmp}/hc-berr.XXXXXX"`,失敗就變 `""`,stderr 落 /dev/null,botcheckB=0(fail-safe,即係行返舊行為)。EXIT trap 會清;launchd 下真 tick 已證明 mktemp work、冇殘留。只有 kill -9 會留低殘檔(細事)。stderr 由 /dev/null 改落檔案,兩者都唔係 tty,yt-dlp 行為同效能都冇變。
- grep `(^|[^0-9])429([^0-9]|$)|Sign in to confirm|LOGIN_REQUIRED`:只會喺 resolve-fail 時先數。t17 C4 證明 14291/24290 呢類數字唔會誤中。極少數情況下 stderr 出現 `/429x` 都會中,但仲要同時 resolve-fail 先算,風險可以接受。
- state 新欄 `botcheckB/bResolveFail/b403/healthyB` 喺 selfheal 之前就寫好,同一個 tick 讀到 ✅。`curl -4` ✅
- 形態④條件(`healthy_b==0`、`rfN>=1 && rfN>=f403N`、backend+B ≥3):
  - 10-14 fixture(B 三首 resolve-fail、0 個 403)⇒ 判④ ✅
  - 今日真數據(11+3、3 個 resolve-fail、0 個 403)⇒ 判④ ✅(真 tick 已證實)
  - 真 yt-dlp 過舊形(resolve 得、403)⇒ 非④ ✅(t17 C5)
- rules 1b 要 `HEALTHY_B==0`。🟡 `HEALTHY_B` 空(舊 state)嗰陣唔判④,會跌落 swap 規則。舊版係 botn≥3 就直接 escalate,所以「未知」情況下其實比舊版激進。而家 prod state 已經有呢欄,影響好細。
- 新警報文字分支只喺 `healthy_a==1 && healthy_b==0 && rfailB==midfail && mid==0 && botcheckB>=1` 先出;兩層都死/backend 側嗰兩個分支冇改。探測判斷 diff 逐行睇過:冇改到任何 ok/mid/healthy 判定。
- 🟡 selfheal ④ 訊息寫「backend log 近 30 分鐘有 14 條」,但 14 其實係 backend 11 + Layer B 3,措辭唔準。
- heredoc 全部重新掃過(healthcheck/diagnose/selfheal/rules/watch/watch-lib + test/*.sh):開同收全部配對,冇終止符後面跟住註釋或者縮排錯 ✅
- **O1 🟡 測試隔離洞(新揪出)**:`stream-diagnose.sh` 測試模式下 `HEALTH_STATE` 冇強制落 `$WATCH_DIR`,預設會讀 prod 嘅 `backend/data/stream-health-state.json`(只讀)。16:12 之後 prod state 有咗 `botcheckB=3/healthyB=0`,**t8 三個案全部被污染成「出口 IP 被 bot-check」**(案3 本來預期 swap)。t8 冇 assert,所以 rc 仲係 0。執行者喺 16:12 前跑嘅時候 prod 冇呢啲欄,所以冇發現。prod 行為冇受影響。建議:測試模式加 `HEALTH_STATE="${HEALTH_STATE:-$WATCH_DIR/stream-health-state.json}"`,t8 釘 fixture。

## 3. 回歸
16:14–16:17 喺 `cd /`、scratch 參數、`env -u CLAUDECODE` 下跑 t1–t17:**17/17 rc=0、全部 `PROD-SNAPSHOT OK`、`PROD-WRITE DETECTED`=0**,t13 FAILS=0。例外係 t8 輸出被 O1 污染(見上)。`bash -n` 全部 ops/test 腳本過;`node --check` 三檔過。

## 4. 部署建議(backend `6a23d3a`)
- 而家 backend pid 962 由 10-14 10:27 開始行,即係**第一輪 R5b 同第二輪都未 live**,現役仍然係固定 30s 冷卻,背景會繼續大約 60-80 次/小時咁撞 bot-check。
- restart 會點:in-memory 冷卻/failCache 清零;resolve-cache 喺碟上,會載返(現有 URL 照用,Layer A 應該照過);warm buffer 同 presence Map 會冇咗。開機 pre-cache(並發 2、上限 200)遇到未 cache 嘅歌即刻撞 bot-check:新 code 下 streak=1,之後成條隊 fail-fast,仲會寫 15 分鐘 failCache(B2)。即係 restart 唔會令 YouTube 被打得更密,只會有一次細嘅爆發,之後退避反而比現役少打。
- **最穩:等 Eric 換咗 VPN server、有一個健康 tick 確認恢復之後,揀安靜窗口行 gate restart**(deploy.log 最近 15 分鐘冇 ota-publish、Eric 冇喺度做 QA),之後 10 分鐘睇 `[resolve] ok` 同 botCheck metrics。
- 例外:如果預計 Eric 幾個鐘都換唔到 server,事故中 restart 都可以接受(好處係即刻減少背景撞擊),但要 Eric approve gate,而且唔會令串流恢復。
- 建議 B1/B2 一齊修完先 restart,一次過(兩個都係細改)。

## 5. 測試訊息
16:12 已經真發咗一條 escalate(rc=0),第一條訊息已經證實送到,**唔使再發測試訊息**。建議協調者直接問 Eric 有冇收到。之後如果一定要補發,做法如下(驗收員冇執行):
```
cd /Users/macbookpro/.openclaw/workspace/hymn-app && env -u CLAUDECODE bash -c '. ops/stream/stream-watch-lib.sh; WATCH_DIR="$HOME/.hymn-deploy" PHONE_DRY_RUN=1 wlib_notify_phone test "【測試】Odely 串流通知測試,請忽略"'
```
先用 `PHONE_DRY_RUN=1` 睇 notify.log 嘅 payload(target 已遮)。確認冇問題先拎走 `PHONE_DRY_RUN` 真發。會寫一行 prod `stream-notify.log`(kind=test)。要先核實 lib 被 source 時冇副作用。

## 側效應(如實)
- 只寫咗 scratch(`…/scratchpad/opus-notify2/`)同本檔。prod 冇寫入:測試 17 支 PROD-SNAPSHOT OK;harness 嘅 resolve-cache 寫落 scratch。
- 一次 `ls ${TMPDIR}/hc-berr.*`,而我 shell 嘅 TMPDIR 係 `~/.openclaw/tmp`,即係無意中 glob 咗一次嗰個目錄(冇 match、冇讀內容)。
- 冇 restart/launchctl/真發/YouTube/googlevideo;冇殺任何 process。我開嘅 monitor/背景 job 已經自己停咗或者退出。
