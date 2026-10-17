# iOS「下一首」延遲修復方案

**狀態**：規劃階段,未落地。呢份文件淨係研究+方案,冇改過任何code。
**背景**：iOS TestFlight真機QA,撳「下一首」要等幾秒先出聲,Android即刻。之前一個debug session(local_42d6d9eb)判斷「結構性限制,改唔到」,Eric唔收貨,要求再諗。

---

## 1. 現況確認(讀code實測到嘅事實)

- **RNTP版本**:`react-native-track-player@4.1.2`,底層iOS engine係`SwiftAudioEx@1.1.0`(`Podfile.lock:1612,2371`,由RNTP自己嘅podspec硬pin死,唔係range)。
- **`patches/react-native-track-player+4.1.2.patch`**:淨係改咗兩個**Android** Kotlin檔(`MusicModule.kt`/`MusicService.kt`,ANR workaround),**冇碰過任何iOS檔案**。
- **`ios/`冇任何自訂native code**:成個app用緊stock嘅RNTP iOS pod + stock SwiftAudioEx pod,冇一行自己寫嘅Swift/Obj-C audio層。
- **SwiftAudioEx內部**(`ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/`):
  - 用嘅係**單一`AVPlayer`**(`replaceCurrentItem`模式),**唔係`AVQueuePlayer`**(成個pod搜"AVQueuePlayer"零match)。
  - `AVPlayerItem`淨係喺`AVPlayerWrapper.load()`(`AVPlayerWrapper.swift:230-311`)先起,而呢個method**淨係喺你真正切track嗰刻**先被`onCurrentItemChanged()`叫到——即係冇任何機制會喺你聽緊而家首歌嗰陣,提前幫下一首起好個`AVPlayerItem`。
  - JS/native冇任何`preload`/`prepare`字眼嘅API暴露俾你插手(`RNTrackPlayer.swift`924行搜晒都冇)。
  - 另外發現埋一個相關bug:`skipToNext()`→`player.next()`(`QueuedAudioPlayer.swift:107-114`)冇傳`playWhenReady:true`,依家係靠`App.js:1283-1294`嘅comment講嘅方式——撳next之後手動再call多次`.play()`嚟補。**呢個做法已經反映事實:呢個repo已經有半隻腳踏咗入去「靠JS補native缺口」呢條路。**
- **依家嘅「warm/preload」機制**(`App.js:warmIds`、`backend/routes/stream.js`嘅`POST /api/stream/warm`):
  - 淨係fire-and-forget叫backend用`yt-dlp`提前resolve YouTube CDN URL,cache喺backend記憶體(`resolveAudio.js`嘅`Map`,TTL幾個鐘)。
  - **呢層warm完全冇掂過RNTP嘅queue**——`playQueue()`一開始就已經成個list `TrackPlayer.add()`晒,每首track嘅`url`永遠係穩定嘅`/api/stream/:id` proxy URL(`App.js:112`)。
  - Backend resolve完URL之後**唔會推俾app**——app永遠唔知道CDN URL已經ready,佢淨係喺你真正發`GET /api/stream/:id`嗰刻,backend proxy先幫你轉去嗰條(可能已warm、可能未warm)嘅CDN URL。
  - 換句話講:依家個warm機制淨係幫到「backend→CDN」呢一截網絡,完全冇幫到「AVFoundation起AVPlayerItem→接AVPlayer→開始出聲」呢一截,而呢截先係真正delay嘅未知因素。

**結論**:之前個debug session話「結構性限制」冇講錯呢個現象(SwiftAudioEx v1.1.0/RNTP v4冇原生preload API),但「改唔到」係錯嘅結論——只係代表「唔可以淨喺JS層改」,唔代表冇得改。

---

## 2. 四個方向逐一評估

### 方向1:手動預起下一首player(fork/patch native)

**可行,但要分清兩層,唔可以混為一談:**

| 要改嘅嘢 | patch-package搞唔搞得掂? |
|---|---|
| RNTP自己嘅`RNTrackPlayer.swift`(bridge層) | ✅ 得。`patches/`機制對`node_modules/react-native-track-player`成個目錄都生效,包括`ios/`嘅Swift檔,唔止Android。 |
| SwiftAudioEx嘅`AVPlayerWrapper.swift`/`QueuedAudioPlayer.swift`(真正起AVPlayerItem嗰層) | ❌ 唔得。SwiftAudioEx係獨立CocoaPods依賴(唔喺node_modules,`Podfile.lock`直接pin版本),patch-package掂唔到佢。 |

要真正做到「聽緊而家首歌,提前起好下一首個`AVPlayerItem`」,SwiftAudioEx呢層一定要改,標準做法:

1. **Fork SwiftAudioEx**(MIT licence,細個庫,`github.com/jorgenhenrichsen/SwiftAudioEx`)到自己嘅GitHub。
2. 喺fork度加一個公開方法,例如`QueuedAudioPlayer.preloadItem(at index: Int)`——內部起`AVPlayerItem(asset:)`,唔call`replaceCurrentItem`,淨係擺喺一個cache dict、用KVO觀察`.status == .readyToPlay`。
3. 改`next()`/`onCurrentItemChanged()`:如果目標index已經有preload好嘅item,直接attach嗰個現成instance,唔再由零起新嘅。
4. `Podfile`嘅`SwiftAudioEx` pod source改指去自己個fork(`:git => '...', :branch => '...'`)。
5. RNTP嘅`RNTrackPlayer.swift`(用patch-package)加多一個bridge method,例如`preloadNext()`,俾JS call。
6. `App.js`喺啱嘅時機(例如`PlaybackActiveTrackChanged`一fire就即刻)call呢個新method。

**工程量**:中大——要識寫Swift/AVFoundation,要處理AVPlayerItem生命週期(記憶體、KVO清理)、要諗清楚queue mutation(用戶手動跳歌/刪歌)嗰陣preload cache點樣invalidate、要同依家已經有嘅「撳next補play()」workaround、「track播完唔跳」嘅watchdog呢啲現存hack共存。粗略估:一個熟悉AVFoundation嘅人,3-6日先可以做到穩定(唔計QA)。

**風險**:中——呢個係maintain自己一個fork嘅pod,以後RNTP/SwiftAudioEx有安全更新或者bugfix,你要自己手動merge。如果Apple AVFoundation行為隨iOS版本變(例如`AVPlayerItem`喺backgrounded狀態嘅asset loading限制),要自己追。

**建議**:呢個係最貼近Eric原本設想「自己整多層prebuffer」嘅做法,技術上企得住。如果唔想俾錢用RNTP v5(見方向4),呢條係留喺v4嘅正路。

### 方向2:換用`AVQueuePlayer`

**唔建議做主力方向。**

- SwiftAudioEx本身**冇用**`AVQueuePlayer`,要換即係要**整個掉晒SwiftAudioEx,自己由零寫一個native audio module**——連帶remote control center、lock screen metadata、audio session interruption處理、CarPlay支援(iOS launch plan已經話會做)、背景播放呢啲SwiftAudioEx而家免費俾你嘅嘢,全部要自己重新砌過。
- `AVQueuePlayer`真正嘅gapless優勢係「本機已有嘅asset之間無縫接軌」,對我哋而家「先要resolve YouTube URL先有得播」呢種串流場景,核心難題(下一首個item要提前attach同prepare)其實同方向1係**同一件事**——但方向2要重寫成個native層先做到,方向1可以喺SwiftAudioEx呢層插針,細好多。
- 結論:方向2嘅「有用部分」已經包喺方向1入面,工程量卻大好多,冇必要揀。

### 方向3:backend提早resolve到「可以直接播」呢步(唔碰native)

**現有warm機制實測止步喺邊?**

`POST /api/stream/warm` → `resolveAudioUrl()`:淨係攞到googlevideo嘅CDN URL(用`yt-dlp --get-url`),再用`preVerifyUrl()`做1-byte驗證,cache落backend記憶體嘅`Map`。**呢步之後就完咗**——backend冇再開實際嘅串流連接、冇喺本機buffer任何音訊bytes。

即係話:即使warm好晒,`GET /api/stream/:hymnId`俾AVPlayer打嗰刻,backend都要重新對googlevideo開一條新TCP/TLS連接、攞header、開始pipe——呢段「backend↔Google」嘅網絡來回時間,warm完全冇慳到。

**可以做嘅加強(純backend,唔碰native,風險低)**:

- 將`/api/stream/warm`由「淨係resolve URL」升級做「resolve URL之後,即刻開始向googlevideo攞頭幾百KB/幾秒音訊,喺backend本機(記憶體or暫存檔)緩衝住」。噉樣真正`GET /api/stream/:id`打嚟嗰刻,backend可以即刻由本機buffer吐返啲bytes俾AVPlayer,唔使由零開新connection去Google。
- 呢個做法**唔會解決晒問題**——`AVPlayerItem`本身起asset、parse格式、等`.readyToPlay`呢層AVFoundation-side嘅開銷,同backend network layer係兩回事,backend點快都慳唔到呢層。但佢可以拆走「網絡RTT」呢部分delay,幫我哋量化返:拆完之後如果仲有幾秒delay,先可以確定係AVFoundation-side嘅開銷,先值博去做方向1或者方向4嗰啲大工程。

**工程量**:細——淨係backend node.js改動,唔使碰iOS native code,risk同開發時間都遠低於方向1/2/4。

**建議**:**呢個應該做第一步**,快、平、無風險,兼且可以幫手驗證診斷。

### 方向4:官方RNTP repo有冇現成方案?

**有,而且係大發現**:RNTP **v5**(2024年5月起穩定版)明文將「preloading」寫成主打功能之一——官網原文:「Preload upcoming tracks in the background so the next one is ready before the user ever asks for it.」呢個正正就係我哋想要嘅嘢,官方原生支援,唔使自己fork native code。

但有幾個要考慮嘅點:

- **v5係完全rewrite**,新package名`@rntp/player`(v4嘅`react-native-track-player`凍結喺Apache-2.0,唔會再有新功能),**冇自動遷移路徑**,官方講法係「API面細好多,跟Introduction/Installation/Quick Start重新砌」——即係`App.js`入面所有RNTP touchpoint(`setupPlayer`、`registerPlaybackService`、`playQueue`、`skipToNext`/`skipToPrevious`、成套event handler)要重寫。呢啲touchpoint呢排先啱啱經過好多輪QA先穩定(隊列3場景、背景播放停咗、W2同步outbox呢幾份規劃記錄都喺度),換v5即係要將呢啲成果全部推倒重驗,Android同iOS都要重新回歸測試。
- **v5要React Native New Architecture**。查過:呢個app而家用緊`react-native@0.85.3`——**RN 0.82開始New Architecture已經冇得停用**(bridge喺0.85完全剷走),即係我哋依家已經強制行緊New Arch,呢一項要求其實已經滿足,唔算額外阻力。
- **v5由免費轉商業授權**:個人/教育用免費,商業用要俾錢——`rntp.dev/pricing`列價:「RNTP Pro」單app每年€999(或每月€99);仲有一個invite-only嘅「免費6個月」launch credit(要apply審批,唔保證中)。呢個app已經上線,唔確定仲符唔符合「pre-launch」嗰個優惠資格。

**工程量**:大——全套RNTP整合層重寫+全平台回歸測試,估計以呢個repo規模嚟講要一個星期以上(未計QA)。
**成本**:每年€999(如果冇拎到免費credit)。
**風險**:中大——換咗底層之後,依家iOS/Android各自已知嘅native quirk(例如`App.js:877-891`講嘅track播完唔跳、`skipToNext`要補`play()`)行為可能改晒,要重新逐項驗證先知係咪修復咗定係換咗種新bug。

---

## 3. 建議路線圖(俾Sonnet5跟)

**第一步(即刻可做,低風險)**:方向3——backend `/api/stream/warm`升級做真正buffer住頭幾秒音訊,唔淨係resolve URL。改完部署,真機量度撳next到出聲嘅delay,同改之前做before/after對比。

**第二步(視乎第一步量到嘅殘餘delay有幾大,先決定使唔使做)**:
- 如果第一步已經將delay壓到用戶感覺唔到(例如<1秒):收工,唔使掂native。
- 如果仲有明顯delay(AVFoundation-side開銷主導):喺方向1(fork SwiftAudioEx手動prebuffer)同方向4(升級RNTP v5)之間二揀一——
  - 想留喺v4、唔想俾錢、可以接受自己維護一個fork:揀**方向1**。
  - 想要官方長遠支援、肯俾錢/申請免費credit、肯投入一次過大重寫+全回歸測試:揀**方向4**。
  - **方向2(AVQueuePlayer)唔建議揀**——冇額外著數,工程量卻最大。

**呢份文件淨係規劃,冇改過code。** 落地順序、要唔要做方向1/4,等Eric睇完呢份方案再拍板。
