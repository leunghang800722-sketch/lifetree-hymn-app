# NATIVE-STALL-FG-SPEEDUP-PLAN-20260829 — 前台stall反應由25秒縮到10/15秒

**狀態**:老闆已拍板(2026-08-29)。執行:Sonnet5;驗收:Opus5;總負責:Fable5。
**前置閱讀**:`NATIVE-STALL-WATCHDOG-PLAN-20260825.md`(尤其§12迭代記錄)、`frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js` 頭30行註釋。

## §1 背景+根因(已診斷,唔使重查)

2026-08-29 09:51 老闆真機(build 14)前台連續3首歌 pos=0 buffering stall。watchdog照設計運作
(detect→reload→skip),但節奏係為**背景30秒bg-task窗**校準:20s detect + 5s timer粒度 =
實測 `frozenSec=25` 先有第一下反應,35秒先跳走一首壞歌。前台冇30秒窗約束,卻共用同一套
保守數字;且成個過程UI零反饋,老闆感受=「load唔到歌」。

log實據(backend/logs/client-log/client-log-2026-08-29.jsonl,09:51-09:52,全部bg=0):
- 三個循環全部 `detected frozenSec=25 pos=0.0 state=buffering` → reloaded(冇用)→ +10s skipped
- 每次 detected 時 `skips=0`:JS層15s buffering nudge嘅`play()`經`onUserPlay`重置咗native
  `consecutiveSkips` → **native 3-strike前台結構上永遠唔會trip**;同時native skip唔經JS
  `handleStuckTrackEnd`,JS自己個熔斷(`errorSkipCountRef`)亦都唔會加數 → 網絡全死時前台
  會無限每35秒跳一首,永冇熔斷永冇提示。
- 09:58 背景mid-track(pos=211.5)單:detect→reload→5秒recovered — 背景場景work,唔准掂。

硬地板:native載`/api/stream/:id`,backend冷resolve正常最壞~11s、死鏈retry最壞36s
(`RESOLVE_TIMEOUT_MS=12000`×3 strategy,backend/lib/resolveAudio.js)。backend有`inFlight`
Map去重(resolveAudio.js:19),reload重打同一id會join返in-flight promise,唔會重開resolve
→ 10s detect嘅誤傷成本≈零(最多遲兩三秒起播)。

## §2 老闆拍板

1. 前台:**10秒出UI提示、~15秒跳歌**。
2. **一次過出**:JS改動 + native改動同一個build cycle(build 15)完成、一齊測試、一齊推。
   **🔴唔准提前OTA出JS嗰半** — 為防其他session嘅OTA push夾帶,全部JS新行為必須gate喺
   「iOS && native buildNumber ≥ 15」之後(見§4),咁就算code俾人夾帶OTA出咗街,
   喺build 14上亦係完全dormant。

## §3 Native改動(plugins/withSwiftAudioExStallWatchdog.js 內嵌Swift)

改 `SWStallWatchdog`,全部係前台/背景分流,**背景數字一個都唔准郁**:

1. 門檻由常數改做computed(每次`check()`即場讀`UIApplication.shared.applicationState`,
   timer喺main thread行,讀law合規):
   - 前台(.active):`stallActionSeconds=10`、`reloadWaitSeconds=5`
   - 背景/inactive:維持 `20` / `8`(30秒bg窗約束,唔准改)
2. timer interval `5`→`2` 秒(granularity;背景detect變20-22s+8=最壞30s,而bg-task喺
   detected嗰刻先`beginBgTask`,只需容納8s reload wait,窗夠用 — 保持呢個分析喺code註釋)。
3. `maxConsecutiveSkips=3`、breaker latch、`onUserPlay`重置行為:**全部不變**(前台熔斷
   改由JS層負責,見§4.2;native breaker繼續守背景場景)。
4. beacon照舊(phase字串不變,方便同build 14 log對比);`detected` extra加多個`fg=1/0`
   方便日後分流統計(可選,唔好改動現有字段)。

⚠️執行陷阱(§12血淚,唔准重蹈):
- 改嘅係ruby string入面嘅Swift source,anchor全部exact-string;改完必須清`ios/`重行
  prebuild+pod install,肉眼確認patched後嘅`Pods/SwiftAudioEx/.../AudioPlayer.swift`
  真係有新數字先好開始測。
- 唔准掂`cancelLoading()`路徑、唔准信`wrapper.playWhenReady`、所有state/timer main-only
  — 呢啲已解決咗嘅地雷唔好倒返轉頭。

## §4 JS改動(frontend/hymn-app/App.js,iOS-only + build gate)

統一gate:`const NATIVE_WD_V2 = Platform.OS === 'ios' && Number(Application.nativeBuildVersion ?? 0) >= 15;`
(用`expo-application`;如project未裝,查`expo-constants`有冇等價欄位,揀已有依賴,唔好
新增native dependency — 新增會迫更多native改動。兩個都攞唔到就同Fable5講,唔好自己作)。
Android同build≤14 iOS:行為零改變。

1. **10秒提示**:前台 + `NATIVE_WD_V2` + 聲稱Buffering + 從未有真progress,連續~10 tick
   → 顯示「載入緩慢,重試緊…」非阻斷提示(搵App.js現有嘅notice/toast機制重用,例如
   `pendingPlaybackNoticeRef`嗰套嘅前台等價物;冇就用最簡單嘅Animated banner,唔准用
   Alert)。起播成功/轉track即自動收起。
2. **熔斷修復(native skip指紋計數)**:維護「呢首track有冇試過真播放」flag(position>0.5
   或state=Playing且pos郁);`PlaybackActiveTrackChanged`時,如果舊track從未真播放、且
   唔係JS自己發起嘅轉track(用戶點歌/手動next/JS watchdog skip都係JS發起,要有flag標記)、
   且`NATIVE_WD_V2` → `errorSkipCountRef.current += 1`。現有前台threshold=3彈Alert嗰套
   照用,**唔准double count**(bufferingStuck/PlaybackError已加數嘅路徑唔好再加)。
3. **JS buffering ladder唔郁**(nudge 15 tick/skip 45 tick維持):native前台15s會行先,
   JS 45s skip降級做backstop;JS nudge同native skip喺~15s撞正嘅race,原設計已分析benign
   (nudge play()落喺新item上無害),但要入測試場景(§5 T4)實證。

## §5 測試(iOS模擬器,參考舊W套件手法;⚠️模擬器可能裝住release APK/其他session殘留,先驗環境)

- T1 前台fresh-load stall:種一個必卡嘅stream(舊W套件招數:改hosts/攔截/用死id),驗
  timeline:~10s提示出現+detected+reloaded beacon,~15s skipped,3首後JS Alert彈出+pause。
- T2 前台正常冷歌:冷resolve(~5-11s)唔准彈提示以外嘅嘢、唔准跳歌;10s reload若觸發,
  歌照起播(驗inFlight join)。
- T3 背景行為回歸:模擬背景stall,驗detect仍係20-22s、reload wait 8s、breaker 3-strike
  照舊(對比build 14 log節奏)。
- T4 nudge/skip撞秒race:15s前後JS nudge同native skip同時發生,冇double-skip、冇卡死。
- T5 gate驗證:模擬`nativeBuildVersion=14`(臨時hardcode)→ JS新行為完全dormant。
- T6 中途stall回歸:前台mid-track stall 10s reload救返(對齊09:58嗰單嘅recovered路徑);
  用戶手動pause 10秒+唔准誤判。
- 每個T記低beacon/console實據落工作記錄,交Opus5驗收用。

## §6 Release步驟(**Sonnet5唔准自己行,實作+測試完停低**)

Opus5驗收過→Fable5判斷→先至:bump `app.json` ios buildNumber 14→15、EAS build、
`eas submit`(要`zsh -ilc`包住攞EXPO_TOKEN)。呢啲由Fable5批准後另行派工。

## §7 紅線(逐條硬性)

- 🔴唔准`eas update`/任何OTA publish;唔准掂Cloudflare API/DNS/cert.pem/token。
- 🔴共用worktree:唔准`git add -A`/`git clean`;commit必須`git commit -- <pathspec>`只夾
  自己改嘅檔;開工前`git status`核對唔好掂其他session嘅嘢。
- 🔴scratch script唔准放backend/(會塞deploy gate);放scratchpad。
- 🔴backend/hymns.db絕對唔准掂;唔准restart backend(呢單嘢完全唔使掂backend)。
- 🔴唔准用AskUserQuestion(non-interactive會卡死);有問題寫低留返俾Fable5判。
- 背景watchdog數字(20/8/3-strike/latch)唔准改;Android零改動;runtimeVersion唔准郁。

## §8 Addendum(2026-08-30 老闆拍板):Loading快路修復,同build 15一齊出

背景:Opus5驗收D-note1。App.js `sleepPollInterval()`(~1661-1676行)嘅1秒快路只認
`Playing || Buffering`;`Loading`跌入2.5s idle節奏,令1769行個counter(D3-2已包Loading)
嘅「tick=1秒」假設失效:banner 10 tick=25s、nudge 15 tick=37.5s、skip累計=112s。
build 15前台後果:Loading型死鏈stall,native 15-19s跳歌,banner永遠嚟唔切出=零反饋。

修法(**就咁兩個位,唔准擴大**):
1. 1662行同1673行嘅state check各加一個條件:`|| (NATIVE_WD_V2 && trackStateRef.current === TPState.Loading)`
   (或等價寫法;兩個位都要改,唔可以只改一個——分片瞓嗰個while嘅break都要識醒)。
2. 更新1656-1660嗰段O1-A註釋+1765-1768 D3-2註釋,講明Loading喺NATIVE_WD_V2下行1s節奏、
   build≤14/Android維持舊2.5s(status quo,係有意gate,唔係漏)。

點解gate:唔gate會令Android+iOS build14嘅JS ladder實際時序改變(37.5/112→15/45),
OTA一推就提前出行為改動,違反§2「一次過出」紀律。Android同款問題留返日後專登拍板。

驗證要求:
- T7:模擬Loading型stall(trackState釘死Loading),證counter節奏=1s:banner~10 tick、
  nudge~15 tick;NATIVE_WD_V2=false時維持2.5s節奏(用邏輯harness/單元式驗證,唔使模擬器)。
- 回歸:idle states(Paused/Stopped/None/Ready/Ended)仍然2.5s分片瞓;drift探測
  (lastPollTargetMsRef)喺兩條路都寫啱目標值。
- 現有T1-T6結論唔受影響(呢個改動唔掂native、唔掂counter門檻)。

紅線同§7一樣;完成後照舊停低等Opus5驗收,唔准行§6 release步驟。

## §9 Addendum(2026-08-30,Opus5 §8驗收D-note):Loading快路收窄返前台限定

§8有一個spec錯述(Fable5責任):規劃書同comment都寫「前台+build≥15」,但`NATIVE_WD_V2`
本身冇appState項→§8喺背景都生效。後果(Opus5離散事件模擬實證):背景Loading死鏈,
JS nudge由~37.5s提前到~15s,行喺native背景detect(20-22s)之前,每cycle經onUserPlay
撳返0 native `consecutiveSkips`→背景3-strike熔斷失效(build 14燒2首84s停;唔修就一直
燒落去)。Buffering型呢個洞build 14已存在,§8唔應該擴闊佢。

修法(**兩個token級,唔准擴大**):
1. §8改嘅兩個condition(App.js ~1671-1674快路、~1685-1689分片break),Loading項各加
   `appStateRef.current === 'active'`,即:
   `(NATIVE_WD_V2 && appStateRef.current === 'active' && trackStateRef.current === TPState.Loading)`
   兩個位必須逐字一致。
2. 修正兩段comment(~1663-1665、~1785-1786):而家先真係「前台+iOS build≥15」;背景
   一律維持build 14現狀(Buffering 1s係build 14既有行為,唔喺今次範圍)。
3. exec檔§8節嗰句「30/30」順手改做「31/31」(Opus5數過係31條)。

驗證要求:重跑§8 harness加appState維度——(a)gate on+active+Loading=1s;(b)gate on+
background+Loading=2.5s(還原build 14);(c)gate on+active+Loading中途appState轉
background,下一個tick跌返2.5s;(d)gate off全部照舊;(e)idle五態/Playing/Buffering/
drift target全部回歸。harness要餵埋appStateRef。

紅線同§7;完成停低等Opus5快速覆核。
