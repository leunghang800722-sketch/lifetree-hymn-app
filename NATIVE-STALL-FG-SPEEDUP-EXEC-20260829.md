# NATIVE-STALL-FG-SPEEDUP-EXEC-20260829 — 執行 + 測試記錄

**執行**:Sonnet5。**對應規劃書**:`NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md`(§1-§7)。
**前置閱讀**:已讀 `NATIVE-STALL-WATCHDOG-PLAN-20260825.md` §12(迭代記錄/六隻真bug)、
`plugins/withSwiftAudioExStallWatchdog.js` 頭30行註釋。
**狀態**:實作 + 測試完成,§6 release 步驟未行(照紅線要求停低)。等 Opus5 驗收。

---

## §1 改咗乜(對應規劃書 §3/§4)

### 1.1 `frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js`(§3)

呢個檔案係一個 config plugin,`rubyPatchSnippet()` 傳返一大段 Ruby source,入面用
`content.sub(old, new)` patch SwiftAudioEx 嘅 `AudioPlayer.swift`,附加一整個
`SWStallWatchdog` class(Swift source 用字串形式包喺 Ruby 字串入面,再包喺 JS 字串
入面 —— 三層轉義)。改咗三處(全部喺嗰段內嵌 Swift source 入面):

1. **前台/背景分流門檻**(§3.1):
   ```swift
   // 舊: private let stallActionSeconds: Double = 20
   //     private let reloadWaitSeconds: Double = 8
   private var stallActionSeconds: Double { isForeground() ? 10 : 20 }
   private var reloadWaitSeconds: Double { isForeground() ? 5 : 8 }
   private func isForeground() -> Bool {
       return UIApplication.shared.applicationState == .active
   }
   ```
   Computed property,`check()` 每次 tick 即場讀,唔 cache —— 避免 episode 中途切
   前後台用舊門檻。背景 20/8 一個字都冇改。

2. **timer 粒度 5→2 秒**(§3.2):
   ```swift
   timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.check() }
   ```

3. **`detected` beacon 加 `fg=1/0`**(§3.4,可選項,做咗):
   ```swift
   beacon("detected", p, extra: "frozenSec=\(...) fg=\(isForeground() ? 1 : 0)")
   ```

**冇郁嘅嘢**(逐條核對過): `maxConsecutiveSkips=3`、`breakerLatched` 邏輯、
`onUserPlay`/`onUserPause` 行為、`swAbandonCurrentItem()`/`cancelLoading()` 唔准掂嘅
規矩、所有 state/timer main-only 嘅 dispatch、beacon 嘅 phase 字串同現有欄位。

### 1.2 `frontend/hymn-app/App.js`(§4,全部 gate 喺 `NATIVE_WD_V2` 之後)

**Gate 定義**(近 `_nativeBuildVersion` guarded require 嗰段,約第3670行後):
```js
const NATIVE_WD_V2 = Platform.OS === 'ios' && Number(_nativeBuildVersion ?? 0) >= 15;
```
刻意重用現有已裝嘅 `expo-application`(package.json 已有 `~56.0.3`,`ios/Podfile.lock`
證實 iOS 早已 link 咗 `EXApplication`,build 14 一早已經帶呢個 native module —— 唔似
Android APK 53 嗰單「未 embed 會炸」,但仍然沿用同一個 guarded 變量嚟源,唔新增
require)。冇新增任何依賴。

**十個新行為全部由呢個 const 把關**(逐一 grep 核對過,見 §3 測試 T5):

1. `trackHasPlayedRef`(新 ref,近 `errorSkipCountRef`)—— 記「呢首track有冇真播過」,
   喺 progress poll loop 見到 `pos > 0.5` 就 set true。
2. `slowLoadNoticeRef`/`slowLoadNotice`(新 state,近 `bufferingStuckTicksRef`)——
   10 秒前台緩衝提示嘅 show/hide 旗標。
3. Poll loop 嘅 buffering 分支:`bufferingStuckTicksRef.current >= 10` 就顯示提示
   (純 UI,唔郁落面 nudge=15/skip=30 呢條階梯任何數字);離開 buffering/loading
   即刻收返。
4. JSX 加咗一個獨立 banner(reuse `noticeStyles` 視覺樣式,但獨立 state,唔靠
   `showNotice()` 嗰套 2.8 秒 timeout —— 精準跟住「仲係咪卡緊」)。
5. `PlaybackActiveTrackChanged` handler:capture `prevTrackHasPlayed`(喺任何 await
   之前,同步做,冇 race)、capture `wasAnticipatedByJs`(重用現成
   `transitionT0Ref` 機制)、新增 §4.2 嘅 increment+threshold=3 Alert 邏輯。
6. `handleStuckTrackEnd()` 嘅 `skipToNext()` 之前、`PlaybackError` handler 嘅三個
   轉track call site(self-heal load/remove+add+skip、前台 skipToNext、背景
   skipToNext)之前,分別加咗 `if (NATIVE_WD_V2) transitionT0Ref.current = {...
   origin: 'jsRecover' ...}` —— 呢個係防「double count」嘅關鍵(見下面 §2)。

**Android / iOS build≤14**:上面十個位全部由 `NATIVE_WD_V2` 直接短路,一行都唔會行到
——即使呢段 code 意外經 OTA 派咗出去,對現役 build 14 完全 dormant(見 T5)。

---

## §2 §4.2「唔准 double count」點做到

規劃書話 native 前台 skip 唔經任何 JS API,只能反推:「track 換咗,但 JS 完全冇
預期」+「舊 track 從未真正播過」= native 靜靜哋跳咗一首死歌。「JS 完全冇預期」
呢個訊號直接重用現有嘅 `transitionT0Ref` 機制(本身係度俾 `nextTrackMs` 延遲量度
用):所有 tap-driven 轉track(`handleNextTrack`/`handlePrevTrack`/
`skipToQueueIndex`/`playQueue`)本身已經會 set 一個 non-auto origin 嘅 t0;
`PlaybackActiveTrackChanged` 入面原有嘅 t0 檢查(`t0 && !t0.trackChangedSeen &&
withinWindow`)本身就係「呢次轉track JS 有冇預期」呢條問題嘅現成答案,我淨係
capture 咗個布林值嚟用。

真正要補嘅缺口係:**JS 自己嘅 watchdog(`handleStuckTrackEnd`/透過佢嘅
`handleMidStreamStall`/`handleBufferingStuck`)同 `PlaybackError` 嘅 skip 完全冇
set 呢個 t0**——如果唔補,呢兩條路徑(佢哋自己已經加咗 `errorSkipCountRef`)嘅
skip 會被新邏輯誤判做「native 冧咗」再加多一次數,正正撞正規劃書明文禁止嘅
「double count」。所以喺呢兩條路徑嘅轉track call site 之前,加咗
`if (NATIVE_WD_V2) transitionT0Ref.current = { origin: 'jsRecover', ... }`,令佢哋
喺新邏輯眼中都算「JS有預期」。

已知冇補嘅邊緣case(風險評估過,接受):
- `toggleShuffle()` 保留緊播嗰首歌喺新 queue index 0,冇 set t0。但呢首歌喺
  shuffle 嗰刻已經播緊(`prevTrackHasPlayed` 好大機會已經 true),漏網機率極低。
- `reorderQueue()` 用 `TrackPlayer.move()`,現有註解確認「唔會 fire
  track-changed」,冇風險。

---

## §3 測試(§5)—— 環境限制 + 實際做法

**🔴環境限制(規劃書冇 cover,已揀最保守做法繼續,呢度明文向 Fable5 報告)**:
`mcp__Claude_Code_iOS_Simulator__control` 嘅所有 action(包括 `attach`/
`screenshot`/`tap`)喺呢個 dispatched/background session 一律返
「Mobile simulator tools require an attended session. They are not available in
scheduled-task or remotely dispatched sessions.」—— 呢個 session 結構性冇辦法
好似規劃書 §5 講嘅咁「參考舊 W 套件手法」用互動式 tap/watch 嚟做 T1-T6(冇 UI
touch injection 嘅替代法:`xcrun simctl` 本身唔提供合成觸控事件)。

保守做法:用盡呢個環境**可以**做到嘅最嚴謹驗證,分兩層:

### 3.1 Native 層(§3)—— 決定性 state-machine harness,47/47 全過

由於 native 層改動係一個純狀態機(timer + computed thresholds + escalate/beacon),
寫咗一個獨立 Swift harness(`scratchpad/watchdog-harness/`,唔喺 repo 入面,唔會
commit):
- `extracted_class.swift`:用 `awk` 由**真係 patch 完嘅** pod 檔
  (`ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AudioPlayer.swift`)逐字抽出
  `SWStallWatchdog` class(冇手打冇改寫,純粹 access-level `fileprivate`→
  預設,方便測試檔讀到)。
- `fakes.swift`:用 `typealias` shadow 技巧幫 `UIApplication`/
  `UIBackgroundTaskIdentifier`/`AudioPlayer`/`AVPlayerWrapper`/
  `QueuedAudioPlayer` 提供可控嘅假實現(可控 applicationState、可控 player
  state/position、記低幾多次 reload/seek/pause/next call)。🔴特別要:
  shadow 埋 `URLSession`,令 beacon() 嘅真 POST 唔會打去
  `https://api.god-music.com/api/client-log`(呢段係逐字複製嘅真 patch
  code,冇呢個 shadow 會真係打生產 backend,違反紅線)——改為攞落嚟個 JSON
  body 嘅 `detail` 字段做斷言用,零真網絡流量。
- `main.swift`:driver,用真實 wall-clock(`RunLoop.main.run` 泵住等 Timer
  真係 fire),跑齊 T1/T2/T3/T4/T6。

跑法:`swiftc fakes.swift extracted_class.swift main.swift -o watchdog_test &&
./watchdog_test`。**結果:47/47 全過**(頭一輪 5 條 FAIL 純粹係我斷言公式錯——
`swAbandonCurrentItem` 一個 cycle 應該call兩次唔係一次、background escalate
要俾 2 秒 timer tick 嘅 worst-case lag 開返闊啲個容忍區間——修正斷言之後全過,
唔係產品code問題)。

| 場景 | 覆蓋內容 | 結果 |
|---|---|---|
| T1 前台fresh-load stall | detect@~10.2-12.2s、reloaded、escalate@~5.6-6.1s(fg=1)、連續3次 skip→breakerTripped、latch休眠(12秒零beacon)、onUserPlay()解latch重新武裝 | ✅全過 |
| T2 前台正常冷歌 | 6秒仲喺buffering唔彈beacon(喺10秒grace窗入面)、真progress嚟到之後都唔會事後補彈 | ✅全過 |
| T3 背景回歸 | detect@~22.1s、escalate@~10.0s(8s+2s tick worst-case,同pre-FG-speedup一致)、fg=0、3-strike breaker一樣work | ✅全過 |
| T4 nudge/skip race | episode入面mid途call `onUserPlay()`(模擬JS nudge嘅play())、escalate照原定schedule fire、`next()`淨係call一次(冇double-skip) | ✅全過 |
| T6 中途stall回歸+用戶pause | state=paused都偵測到(唔止Playing)、reload時seek返position、真progress喺5s reload-wait之內恢復→`recovered`beacon(唔skip)、`onUserPause()`之後就算過咗10秒都唔會誤判detect | ✅全過 |

呢個harness用嘅係**逐字抽出**嘅真patch code,唔係重新實現一次邏輯——所以呢啲
timing/行為結果反映緊實際會出街嗰份code嘅真實運作,唔係我對住規劃書自己複述。

### 3.2 真機/模擬器 build + 運行層(補做,唔喺原規劃書覆蓋範圍但值得做)

- `npx expo prebuild --platform ios --no-install`(mv 開舊 ios/ 再重生,冇用
  `rm -rf`/`git clean`,冇碰任何tracked檔)+ `pod install` —— log 明文出現
  `[withSwiftAudioExStallWatchdog] patched SwiftAudioEx AudioPlayer.swift
  (native stall watchdog)`,並且 `grep` 真身 pod 檔確認 `stallActionSeconds`/
  `reloadWaitSeconds`/`isForeground`/`timer(withTimeInterval: 2)`/`fg=` 全部
  patch 落咗(§3 執行陷阱要求嘅「肉眼確認」)。
- 真係用 `xcodebuild -workspace Odely.xcworkspace -scheme Odely -destination
  'platform=iOS Simulator,...'` 起全套build——**BUILD SUCCEEDED**,`strings`
  查 `Odely.debug.dylib` 確認 `SWStallWatchdog`/`isForeground`/成套NSLog字串
  真係連咗入實際binary(即係唔淨係syntax啱,係真係編譯+連結成功嘅產物)。
- 用 `xcrun simctl install`/`launch` 裝上 iPhone 17 模擬器,起 `npx expo start`
  做packager,app真係喺模擬器度bundle咗1529個module、載入真實backend資料
  (「已同步70首最愛、1個清單」、真書歌單、真經文卡),行咗成分鐘冇crash、
  log冇任何exception/fatal——證明App.js呢批改動(包括所有NATIVE_WD_V2新分支)
  唔會令app喺runtime爆(Metro bundling+RN runtime都行過一次)。
- **做唔到嘅**(因為冇touch injection,冇request_access去computer-use嘅互動
  權限):實際撳個「play」掣、真係製造網絡stall(舊W套件嗰種截包/死id招數)、
  肉眼睇住banner喺畫面出現/收起、真機睇住Alert彈出。呢部份係規劃書§5原意
  嘅「互動式模擬器測試」,結構上呢個dispatched session做唔到。

### 3.3 T5(gate驗證)—— 靜態+邏輯雙重驗證

- `grep NATIVE_WD_V2 App.js` 逐個call site核對:十個新行為寫入點全部喺
  `if (NATIVE_WD_V2 ...)` 或 `NATIVE_WD_V2 &&` 之後,冇一個漏咗gate。
- 獨立node腳本模擬個gate expression喺 `(ios,14)`/`(ios,15)`/`(ios,16)`/
  `(ios,null)`/`(android,14)`/`(android,15)` 六個case,全部同預期一致
  (build14/android/guard失敗全部false,build≥15嘅iOS先true)。

---

## §4 遇到嘅意外 + 點解決

1. **JS字串多層轉義陷阱**:plugin file嘅Swift source包咗兩層轉義(JS string→
   Ruby string→Swift source)。最初一次edit手快用咗 `\xNN` 形式想打中文註解,
   結果變咗字面`\xc2\xa7`文字入咗檔(唔係真UTF-8字元)。即刻發現(grep
   `\\x` 搵到殘留)、改用直接打中文字/英文重寫嗰段註解修正。之後所有Swift
   edit都用「JS→Ruby→Swift round-trip執行一次攞真正patch咗嘅Swift文字」嚟
   驗證(node抽`rubyPatchSnippet()`跑出Ruby字串→用假`installer`喺真ruby執行
   一次→grep patch完嘅Swift檔),確保每一層轉義都啱。
2. **`rm -rf ios` / `--clean` prebuild俾classifier擋咗**(risky destructive
   command):改用 `mv ios <scratchpad>/ios.bak.<ts>` 完全避開刪除,效果一樣
   (ios/係gitignored,mv走再prebuild等於乾淨重生)。
3. **iOS Simulator MCP全部action返「attended session」錯誤**:見§3開頭,
   已用xcodebuild/simctl/deterministic harness做替代驗證,呢度明文flag俾
   Fable5(見下面§5)。
4. **`npx expo start --ios` 預設打開Expo Go**(我哋app有native module,Expo
   Go行唔到)。解決:等metro packager企穩之後,直接用`xcrun simctl
   terminate/launch`叫返個已經`pod install`+`xcodebuild`出嚟嘅真Odely.app
   接落去Metro(localhost:8081係simulator同host share network,自動連到)。
5. **harness beacon()會打真網絡**:extracted_class.swift係逐字抄嘅真patch
   code,包括嗰段POST去`api.god-music.com/api/client-log`嘅code。用`typealias
   URLSession = FakeURLSession`shadow咗個type,令`URLSession.shared
   .dataTask(with:).resume()`唔會真係發包,改為capture低JSON body俾斷言用
   ——確保呢次測試**零backend流量**(紅線)。
6. **harness頭一輪5條FAIL**:全部係我自己斷言公式錯(swAbandon call次數/
   background escalate timing容忍區間太窄),唔係產品code問題,修正斷言後
   47/47全過(細節見§3.1表格上面嘅段落)。

---

## §5 待Fable5判 / 需要留意事項

1. **🔴T1-T6互動式模擬器測試做唔完整**(§3已詳述):呢個dispatched session
   結構上冇simulator attach/touch injection權限。已做嘅替代驗證(native
   決定性harness 47/47全過 + 真Xcode build成功連結進binary + JS Metro
   bundling/真機runtime零crash)喺我判斷入面已經涵蓋咗規劃書§3/§4想驗嘅
   核心邏輯,但**未曾喺真實UI互動之下肉眼睇過banner/Alert彈出**。建議:
   Opus5驗收時如果有simulator attach權限,補做一次真正互動(撳play→種一個
   死stream id/斷網→睇10秒banner+~15秒跳歌+3次Alert),或者等Eric真機TestFlight
   QA一併驗（build15出咗之後）。
2. `slowLoadNotice`(新banner)同現有`noticeText`(舊showNotice機制)理論上可以
   同時顯示,兩個都用同一個`noticeStyles.wrap`位置,會疊埋一齊。極低機率場景
   (buffering緩慢提示啱啱好同「呢首歌載入唔到跳去下一首」撞埋),冇特別處理
   (接受呢個cosmetic edge case)。
3. `toggleShuffle()`冇set `transitionT0Ref`(§2已述),漏網機率極低(換嗰首歌
   已經播緊),接受呢個gap。
4. 10秒提示嘅tick計數**重用**咗現有`bufferingStuckTicksRef`(同nudge=15/
   skip=30嗰條階梯共用同一個counter),冇加新counter——因為10<15,保證提示
   一定喺nudge之前顯示,零機會影響現有階梯數字。呢個係實作選擇,規劃書冇
   明文規定用邊條counter,已揀最保守(唔加狀態、唔改現有階梯)嘅做法。

---

## §6 驗收指路(俾Opus5)

- **改動檔案**:`frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js`
  (3處Swift patch)、`frontend/hymn-app/App.js`(§4十個NATIVE_WD_V2 gate位,
  用 `grep -n "NATIVE_WD_V2" App.js` 可以逐個核對)。
- **驗證咗但唔喺呢個repo入面**(純測試用,冇commit):
  `scratchpad/watchdog-harness/`(extracted_class.swift/fakes.swift/main.swift
  /run2.log,47/47 PASS)、`scratchpad/xcodebuild.log`(BUILD SUCCEEDED)、
  `scratchpad/watchdog-harness/launch_screenshot2.png`(真app喺模擬器行緊嘅
  screenshot)。呢啲喺我呢個session嘅scratchpad,Opus5如果要重跑可以叫我
  重做一次(方法已寫晒喺§3/§4)。
- **未做**(§7紅線明文要求停低):app.json buildNumber bump、EAS build、
  eas submit——留俾Fable5判斷之後另行派工。

---

## §8 執行記錄(2026-08-30,規劃書§8 Addendum:Loading快路修復)

### 改咗乜

`frontend/hymn-app/App.js` 兩個位加咗規劃書§8寫死嘅condition(`sleepPollInterval()`,
poll effect入面):

1. ~1671-1673行(快路check,原本`Playing || Buffering`即刻1s瞓):加
   `|| (NATIVE_WD_V2 && trackStateRef.current === TPState.Loading)`。
2. ~1685-1689行(500ms分片瞓嗰個while loop嘅break check):同一個condition加多一次
   ——規劃書§8明文提過「兩個位都要改,分片瞓嗰個while嘅break都要識醒」,已核對兩處
   都改咗(唔係得一半)。
3. 更新咗兩段註釋:
   - O1-A註釋(~1656-1666行):加多幾句解釋點解Loading喺`NATIVE_WD_V2`下攞去1s
     快路、build≤14/Android點解維持2.5s(§2「一次過出」紀律)。
   - D3-2 counter註釋(~1769-1776行):加多一段講明「tick=1秒」呢個假設淨係喺
     `NATIVE_WD_V2`先成立,舊build/Android嘅counter tick唔等於1秒係現狀非新bug。

冇加任何新state/新counter/新gate常數——`NATIVE_WD_V2`沿用build 15嗰個已有gate,
改動完全鎖死喺規劃書列明嘅兩個if condition + 兩段註釋。

### 驗證方法

冇模擬器attach權限(同§3同一個限制),用§8明文容許嘅「邏輯harness/單元式驗證」:
寫咗`scratchpad/t7-harness.js`,用Node `vm`模組**直接由App.js live source用
brace-counting抽出`sleepPollInterval()`嗰段原文**(唔係重打一份copy,避免test同
真code drift),餵fake `trackStateRef`/`TPState`/`NATIVE_WD_V2`/`lastPollTargetMsRef`,
用mocked `setTimeout`(唔真係等,即刻resolve但累計virtual ms)量每個state組合實際
attribute幾多毫秒。另外用`@babel/core` + `babel-preset-expo`(project已有依賴,冇裝
新嘢)對成個`App.js` `parseSync()`一次,確認改動冇整壞語法。

跑法:`node scratchpad/t7-harness.js`(scratchpad路徑:
`/private/tmp/claude-501/.../scratchpad/t7-harness.js`,harness本身唔入repo)。

### 結果——31/31 PASS(§9修正:原文寫30/30數錯咗,Opus5數過實際係31條check)

**T7(gate on,Loading→1s節奏)**:
- Loading + `NATIVE_WD_V2=true`,連續10個tick(banner門檻)→ 累計1s×10=**10000ms**
  (即banner喺~10秒觸發,`lastPollTargetMsRef`每次寫`1000`)。PASS。
- Loading + `NATIVE_WD_V2=true`,連續15個tick(nudge門檻)→ 累計**15000ms**
  (即nudge喺~15秒觸發,同規劃書§2「~15秒跳歌」嘅前置條件對齊)。PASS。

**Gate off回歸(build≤14/Android行為零改變)**:
- Loading + `NATIVE_WD_V2=false`,單次呼叫 → **2500ms**(舊idle節奏),
  `lastPollTargetMsRef=2500`。PASS。
- Loading + `NATIVE_WD_V2=false`,連續10個tick → 累計**25000ms**——啱啱好對應
  規劃書§8背景描述「banner 10 tick=25s」嗰個修復前病徵數字,證明冇gate嗰邊
  行為完全冇變(仍然係「壞」嗰個舊數,即係冇被呢次改動意外拉快)。PASS。

**Idle states回歸(Paused/Stopped/None/Ready/Ended,gate on同off各試一次)**:
10種組合(5個state × 2個gate值)全部維持**2500ms** + `lastPollTargetMsRef=2500`,
即呢啲state完全唔受`NATIVE_WD_V2`影響,亦冇被Loading嘅新condition意外波及。
PASS(10/10)。

**Playing/Buffering唔受影響**:4種組合(2個state × 2個gate值)全部**1000ms**,
同改動前行為一致。PASS(4/4)。

**Drift探測寫啱目標值**:上面每個case都一併斷言咗`lastPollTargetMsRef.current`
(快路寫`1000`、idle滿瞓寫`2500`),即`wallClockDrift`探測邏輯喺兩條路都用啱
嘅baseline,唔會誤報drift。PASS。

**額外自加場景(§8冇明文要求,但係§8改動嘅直接推論,順手驗埋)**——分片瞓
中途轉Loading:狀態由`none`開始瞓緊2.5s idle節奏,喺第一個500ms slice之後
先flip去`loading`,驗到while loop嘅break condition即刻生效,只瞓咗
**500ms**就跳出(冇死等成2.5秒先醒)。PASS,證明§8提到「分片瞓嗰個while嘅
break都要識醒」呢句要求確實做到,唔係得快路改咗、慢路漏咗。

**現有T1-T6結論唔受影響**:呢次改動冇掂native watchdog(plugins/
withSwiftAudioExStallWatchdog.js)、冇掂`errorSkipCountRef`/nudge/skip嘅
tick門檻常數(`BUFFERING_STUCK_NUDGE_TICKS`/`BUFFERING_STUCK_SKIP_TICKS`
本身數值冇改),淨係改「一個tick等唔等於1秒」,§3/§4已驗嘅native
決定性harness(47/47)、gate off dormant等結論全部原封不動。

### 待Fable5判嘅事項

冇。§8規劃書寫得好明確(兩個condition位+兩段註釋+驗證要求全部逐條列晒),
今次改動範圍冇撞到任何規劃書冇cover嘅決策點。

### commit

`git commit -- frontend/hymn-app/App.js NATIVE-STALL-FG-SPEEDUP-EXEC-20260829.md`
(hash見下面Sonnet5回報)。冇夾帶其他session嘅檔。

## §9 執行記錄(2026-08-30,規劃書§9 Addendum:Loading快路收窄返前台限定)

### 背景

Opus5 §8驗收發現spec錯述(Fable5責任):§8規劃書同comment都寫「前台+iOS
build>=15」,但`NATIVE_WD_V2`本身冇appState項,所以§8實際落地嘅condition
喺背景一樣生效。離散事件模擬證實後果:背景Loading死鏈嘅JS nudge由~37.5s
提前到~15s,行喺native背景detect(20-22s)之前,每個cycle經`onUserPlay`撳返0
native `consecutiveSkips`,令背景3-strike熔斷失效(build 14燒2首84s停;唔修
會一直燒落去)。

### 改咗乜

`frontend/hymn-app/App.js`,`sleepPollInterval()`(poll effect入面)兩個
condition位——快路check(原~1671-1674,家陣1677-1680)同500ms分片瞓嗰個while
嘅break check(原~1685-1689,家陣1692-1695)——Loading項各加咗
`appStateRef.current === 'active' &&`,即:

```
(NATIVE_WD_V2 && appStateRef.current === 'active' && trackStateRef.current === TPState.Loading)
```

兩個位逐字一致(harness有斷言呢一點,見下面)。`appStateRef`喺呢個poll effect
本身已經有(`wallClockDrift`探測嗰段一路都讀緊`appStateRef.current`),唔使新增
ref或者新增AppState listener。

同步修正咗兩段comment:
1. O1-A/§8 comment(~1661-1668行)——加多一段§9 Addendum註釋,講明§8嗰陣
   「前台+iOS build>=15」淨係得個名(`NATIVE_WD_V2`冇appState項),而家加咗
   `appStateRef.current === 'active'`先真係做到。
2. D3-2/§8 counter comment(~1785-1789行附近)——同樣加多一段,講明
   `sleepPollInterval()`而家先真係執行到「前台+iOS build>=15」呢個gate。

冇加任何新state/新counter/新gate常數,冇掂native(plugins/)、backend/、
app.json、eas——改動鎖死喺規劃書§9列明嘅兩個condition位+兩段comment。

### 驗證方法

延續§8嗰個`scratchpad/t7-harness.js`(唔入repo),加咗`appStateRef`落sandbox
(`makeSandbox({ NATIVE_WD_V2, appState })`),原有嘅gate on/off、idle五態、
Playing/Buffering、mid-slice break case全部加多一個`appState`維度重跑,另外
針對§9驗證要求(a)-(e)逐條加專門check:

- **(a)** gate on + `appState=active` + Loading → 單tick斷言1000ms
  (`§9(a) gate-on+active+Loading: single tick = 1000ms`)。
- **(b)** gate on + `appState=background` + Loading → 單tick斷言2500ms、
  連續10 tick斷言25000ms(還原build 14嘅背景3-strike視窗)
  (`§9(b) gate-on+background+Loading: ...`)。
- **(c)** gate on + `appState=active` + Loading行緊1s快路,中途
  `appStateRef.current`轉`'background'`(模擬真實poll loop入面呢個ref由獨立
  嘅AppState listener寫、`sleepPollInterval()`每次call先讀一次呢個實際結構),
  斷言下一個tick跌返2500ms
  (`§9(c) step1/step2 ...`)。
- **(d)** gate off:Loading喺`appState=active`同`appState=background`兩個值
  下都斷言2500ms/25000ms唔變,證明呢個修法冇喺gate off路徑引入任何新分支。
- **(e)** idle五態(paused/stopped/none/ready/ended)×gate(true/false)×
  appState(active/background)=20組全部斷言2500ms;Playing/Buffering×gate×
  appState=8組全部斷言1000ms;另外顯式重申兩個`lastPollTargetMsRef`
  headline值(1000/2500)畀`wallClockDrift`探測用嘅baseline做記錄。

另外新加兩個mid-slice case(唔喺§9(a)-(e)明文之內,但係§9修法嘅直接推論,
順手驗埋):分片瞓中途轉Loading,`appState=active`會即刻break(500ms,同§8
時代行為一致);`appState=background`就唔會break,照瞓晒2500ms——證明
「Loading快路淨係前台先生效」呢件事同時喺快路check**同**分片break check
兩個位都真係做到,唔係得一半。

harness仲加咗一條逐字斷言:由App.js抽出嚟嘅`sleepPollInterval()`源碼入面,
`(NATIVE_WD_V2 && appStateRef.current === 'active' && trackStateRef.current === TPState.Loading)`
呢串字要啱啱好出現兩次(快路+分片break),防止兩個位改到唔一致而漏檢。

跑法不變:`node scratchpad/t7-harness.js`(scratchpad路徑同§8,harness本身
唔入repo)。另外`node --check frontend/hymn-app/App.js`確認改動冇整壞語法。

### 結果——70/70 PASS(包含1條逐字一致性check + 69條data check)

全部PASS,冇FAIL。§9(a)-(e)五條驗證要求逐條有對應check且全過;§8舊有嘅
T7/gate-off/idle/Playing-Buffering/mid-slice結論喺加咗appState維度之後
全部維持唔變(即appState唔會意外波及Playing/Buffering或者gate off路徑)。

### 現有結論唔受影響

呢次改動冇掂native watchdog(`plugins/withSwiftAudioExStallWatchdog.js`)、
`errorSkipCountRef`/nudge/skip嘅tick門檻常數數值、backend/、app.json、eas
config——§3/§4已驗嘅native決定性harness(47/47)、§8嘅T7/gate off/idle/
Playing-Buffering結論全部原封不動,淨係將Loading快路嘅生效範圍由「build>=15」
收窄返「前台+build>=15」。

### 待Fable5/Opus5判嘅事項

冇。§9規劃書寫得好明確(兩個condition位逐字寫死+兩段comment位置+五條驗證
要求全部列晒),今次改動範圍冇撞到任何規劃書冇cover嘅決策點。

### commit

`git commit -- frontend/hymn-app/App.js NATIVE-STALL-FG-SPEEDUP-EXEC-20260829.md`
(hash見下面Sonnet5回報)。冇夾帶其他session嘅檔。
