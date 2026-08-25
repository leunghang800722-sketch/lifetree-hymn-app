# 背景播放 native 層 stall watchdog —— 規劃(2026-08-25)

> 狀態:✅ **已拍板(§11 五條全跟建議)、已實作、模擬器 W 套件收爐**(§12 執行記錄);等出 build 14 + TestFlight + Eric 真機 QA
> 源起:D3-D5 尾巴(STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13.md)+ 2026-08-25 04:07Z 背景停播事故
> 性質:**native 改動(Podfile post_install source patch),唔可以 OTA,要出 iOS build 14 + TestFlight**

---

## §0 TL;DR

背景播放最後一類未封嘅停播:**串流 stall 時 JS 已俾 iOS suspend,成個 JS 層 watchdog 體系
(D2/load-stall/背景熔斷)一個都郁唔到,native AVPlayer 自己無限 retry,用戶聽到嘅就係
「播播下靜咗」。** 2026-08-25 04:07Z 實錄:35 分鐘長檔背景冷 stream,AVPlayer 每 5-10 秒
一個 Range 請求、全部半途 abort、loop 咗 3 分鐘以上,期間 client-log 零事件(JS 凍結)。

根治 = 喺 **native 層**(SwiftAudioEx)起一個 stall watchdog:

| 層 | 內容 |
|---|---|
| 檢測 | 三個**現成**訊號:`AVPlayerItemPlaybackStalled`(SwiftAudioEx 收咗但 handler 係**空函數**,一行都冇)、`timeControlStatus` KVO(現成 observer)、periodic time observer(現成,攞嚟做 progress heartbeat) |
| 行動階梯 | stall 判定成立 → ①即開 `beginBackgroundTask`(30 秒保命窗)+ native beacon → ②reload 一次(自己 capture position,避開 D4 嗰個「飛返 0:00」陷阱)→ ③再唔得 → native 自己 `next()` 跳歌 → ④熔斷:連續 3 次 native skip 都救唔返 → pause 停手 |
| 診斷 | native 直接 POST `/api/client-log`(JS 死咗都 report 到)——呢個亦係答「app process 喺 storm 期間有冇被 suspend」呢個未知數嘅儀器 |

JS 層一行都唔使改;Android 零改動;runtime 5 不變(JS↔native 介面零改動,新舊 JS/native 任意配搭都相容)。

---

## §1 要封嘅洞:點解 JS watchdog 結構上唔夠

已有嘅防線同佢哋嘅覆蓋:

- **D2(playWhenReady 守衛)/ load-stall watchdog / 背景熔斷(前台3/背景6)/ RemoteDuck listener** —— 全部係 JS,
  cover 咗「JS 仲行得郁」嘅場景 ✅
- **08-24 root fix(pin + 自癒)** —— cover 咗「本地檔被剷/爛」成個 family ✅
- **08-25 長檔閘(c09b6b3)** —— 剷走咗「隨機池抽中長檔→必定背景冷 stream」呢個最大觸發器 ✅

剩低嘅洞:**背景 + 串流 stall + JS suspend 三者疊加**。08-25 04:07Z 實錄時間線:

```
04:02:08  nextTrackMs id=2342 source=local(正常)
04:02:57  RemoteDuck resume —— 之後 JS 零事件(suspend)
04:07:22  2342 播完,native 自動接續 id=1722(35 分鐘長檔,冇本地檔)
04:07:52 起  [stream] id=1722 每 5-10 秒一個 206,全部 aborted=true,loop 3 分鐘+
          期間:零 PlaybackError、零 localFallback、零任何 JS 事件
```

關鍵觀察:**啲 Range 請求繼續出,唔代表 app process 醒緊**——AVPlayer 遠端 URL 嘅
media loading 係喺 `mediaserverd`(系統 process)度做,app 本身可以已經 suspend。
所以任何「JS 補洞」(原 D3)都醫唔到呢個場景,文檔當年自己都寫明:
「呢兩項喺假說 A(JS 已凍結)之下係救唔到嘅,唔好當呢個係根治」。

原 D3-D5 現況盤點:
- **D3**(JS watchdog 矩陣補洞)——上面講咗,對呢個場景結構性無效;有幾項細嘢可以順手做,見 §9。
- **D4**(native reload 飛返 0:00)——當年等 PlaybackError beacon 實錘先做;beacon 而家有成個月數據,
  佢提出嘅陷阱(`reload(startFromCurrentTime:)` 喺 duration indefinite 時唔還原 position)直接影響
  本 watchdog 嘅 reload 一步,喺 §4.3 正面處理。
- **D5**(最愛得 7 首)——**已過時**:W2 outbox 修復後 favorites 同步已驗證(08-24 實測 70 首全同步),剷出清單。

---

## §2 設計原則

1. **native 係最後防線,唔係取代 JS**:JS 醒嘅時候,現有 JS 邏輯行先(門檻設計上 native 出手
   慢過 JS——JS 前台 8s timeout+retry 嗰套會早過 native 20 秒閘);native 只喺 JS 幫唔到手時接管。
2. **寧願跳歌,唔准靜音**:靜音 3 分鐘嘅用戶體驗差過跳一首歌(08-25 事故 Eric 感知=「停咗」)。
   但要有熔斷,網絡真斷咗唔准靜靜燒晒成條隊列(對齊 JS 層背景熔斷嘅哲學)。
3. **只用現成訊號同現成機制**:唔加 timer 空轉、唔起新 thread;patch 載體用已驗證嘅
   config-plugin post_install source patch(`withSwiftAudioExStallFix.js` 同款,行咗成個月)。
4. **每一步都有 beacon**:呢個 watchdog 同時係「§5 未知數」嘅測量儀器。

---

## §3 方案比較

| 方案 | 內容 | 判 |
|---|---|---|
| A. 原 D3(JS 補洞) | Playing 分支拆 pos>0、加 Loading 入 buffering watchdog | **唔夠**(JS 凍結時無效);低成本項目併入 §9 順手做 |
| B. native stall watchdog | 本規劃 | **採納** |
| C. 再調 AVPlayer 參數 | `preferredForwardBufferDuration` 等 | 已有 stall-fix patch 處理咗最大嗰個(automaticallyWaits...);再調係盲調,冇證據邊個參數醫到 VPN 級 jitter,而且救唔到「真係斷咗」嘅 case |
| D. 唔做,靠長檔閘+內容清理 | 08-25 已剷主觸發器 | 觸發器少咗但洞仲喺度:普通 4 分鐘歌背景冷 stream 撞正網絡差一樣入 storm(08-12/08-13 嗰堆事故全部係短歌) |

---

## §4 詳細設計

### 4.1 檢測層(全部現成訊號,patch 只係「開始聽」)

錨點實證(讀 pod 源碼):
- [AVPlayerItemNotificationObserver.swift:59-60](frontend/hymn-app/ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/Observer/AVPlayerItemNotificationObserver.swift):**已經**訂閱 `AVPlayerItemPlaybackStalled`,一路送到
  [AudioPlayer.swift:442](frontend/hymn-app/ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AudioPlayer.swift) `AVWrapperItemPlaybackStalled()` —— **函數體係空嘅**。
- `AVPlayerObserver` 現成 KVO `timeControlStatus`(`.waitingToPlayAtSpecifiedRate` = 等緊 buffer)。
- `AVPlayerTimeObserver` 現成 periodic time observer —— 攞嚟維護 `lastProgressAt`(position 有真前進先更新)。

**stall 判定**:`playWhenReady == true` 而且(收到 PlaybackStalled 通知 或
timeControlStatus 停留喺 waiting)而且 `now - lastProgressAt ≥ STALL_ACTION_SECONDS`。
起播卡死(loading 好耐都未有第一下 progress)都計:`lastProgressAt` 喺 load 開始嗰刻初始化。

### 4.2 行動階梯

```
T0(判定成立):
  ① UIApplication.beginBackgroundTask —— 攞 30 秒保命窗(process 就算被排隊 suspend 都頂住)
  ② beacon: nativeStall phase=detected(position/URL類型/timeControlStatus)
T0+0s:  reload —— 見 4.3
T0+RELOAD_WAIT(15s):仲係冇 progress →
  ③ beacon: phase=reloadFailed
  ④ queuedAudioPlayer.next()(native 跳歌,行 SwiftAudioEx 自己嘅隊列機制,
     同用戶撳 ⏭ 落到 native 嗰下係同一條路)
  ⑤ 連續計數 +1;beacon: phase=skipped
新 track 有真 progress → 連續計數歸零;beacon: phase=recovered
連續 MAX_NATIVE_SKIPS(3)首都係咁 → pause + beacon: phase=breakerTripped,唔再出手
  (JS 幾時醒返,現有 JS 熔斷/notice 邏輯自然接手)
用戶主動 pause(playWhenReady=false)→ watchdog 全程唔出手,計時器清零
```

### 4.3 reload 一步:正面處理 D4 陷阱

SwiftAudioEx `reload(startFromCurrentTime: true)` 只喺 `currentItem.duration` **唔係 indefinite**
先會攞 position 返嚟 seek(AVPlayerWrapper.swift:363-370 實讀)。串流 stall 嗰陣 duration
好多時就係 indefinite → 舊行為 = 飛返 0:00(D4/P1 現場嘅嫌疑機制)。所以 watchdog **唔用**
嗰個入口:自己喺 reload 前 capture `currentTime`,reload 完等 ready 再明文 `seek(to:)`。
一個 patch 順手封埋 D4 嘅主嫌疑路徑。

### 4.4 native beacon

`URLSession.shared.dataTask` POST `API_BASE/api/client-log`,event=`nativeStall`,
detail 帶 phase/position/連續計數。fire-and-forget,唔 retry,失敗唔准影響播放(照抄
JS logDiag 哲學)。API_BASE 喺 patch 度寫死做 production URL——同 backend 嘅
`/api/client-log` 係公開 diag endpoint 一致。**呢個 beacon 同時答咗 §5 個未知數**:
如果真機 storm 期間收到 `phase=detected` 但冇後續 phase,就實錘「process 喺行動窗內被 suspend」,
下一步先至考慮更重嘅保活手段。

### 4.5 邊界情況

- **本地 file:// stall**:理論上唔應該發生(零網絡),真發生就係 IO 病,ladder 一樣適用。
- **duck/interruption(電話/Siri)**:iOS 會將 rate 降 0 但 playWhenReady 唔變……呢類
  期間 `timeControlStatus` 係 paused 唔係 waiting,唔會誤判;RELOAD_WAIT 期間收到
  interruption 就直接棄權(計時器清零)。
- **35 分鐘長檔 mid-stream stall**:position capture + 明文 seek(4.3)保證唔會由頭嚟過。
- **同 JS 層碰撞**:JS 醒嘅話,JS 嘅 retry/skip 會早過 native 20 秒閘出手,native 見到
  progress/track 轉咗就自動歸零——兩層唔會搶。

---

## §5 已知未知數(誠實申報)

**app process 喺 storm 期間到底醒唔醒?** 08-25 證據只證明 mediaserverd 醒(佢代 AVPlayer
發請求),證明唔到 app process 狀態。兩個可能:
- process 醒(audio session 仲 active,iOS 通常唔 suspend)→ watchdog 全程有效,perfect;
- process 喺 stall 後好快被 suspend → **所以 ① 一定要喺「啱啱 stall 嗰刻」**(嗰刻 process
  必定仲醒,PlaybackStalled 通知先派得到)**就開 background task**,30 秒窗足夠行晒
  reload(15s)+判定+skip;
- 最壞:連 stall 通知都派唔到(process 已死)→ beacon 會零記錄,我哋由 4.4 嘅數據知道,
  嗰陣先研究 plan B(呢個 case 今日冇證據存在,唔預先過度設計)。

## §6 常數(等拍板)

| 常數 | 建議值 | 理由 |
|---|---|---|
| `STALL_ACTION_SECONDS` | 20s | 慢過 JS 前台嗰套(8s timeout+retry),JS 醒就輪唔到 native;快過用戶忍耐極限(08-25 靜咗 3 分鐘+) |
| `RELOAD_WAIT` | 15s | 30 秒 background 窗內要容納 reload 判定+skip |
| `MAX_NATIVE_SKIPS` | 連續 3 | 對齊 JS 前台熔斷門檻(Eric 2026-07-29 拍板嗰個 3) |

## §7 實作載體同影響面

- 新 config plugin `plugins/withSwiftAudioExStallWatchdog.js`(post_install source patch,
  同現有 `withSwiftAudioExStallFix.js` 同款、同樣冪等 guard),改兩個 pod 檔:
  `AudioPlayer.swift`(空 hook 填肉 + ladder/熔斷 state)、`AVPlayerWrapper.swift`(暴露
  `lastProgressAt` 更新點——就喺現有 periodic observer callback 度加一行)。
- **JS 零改動;RNTP JS API 零改動;Android 零改動;runtimeVersion 5 不變**
  (新舊 JS × 新舊 native 四種組合全部相容——watchdog 係純加法)。
- ⚠️ patch 對象係 pod 源碼,SwiftAudioEx 版本係 RNTP podspec 硬 pin(1.1.0),唔會自己升版;
  第日升 RNTP 先至要重新對 patch(plugin 有 marker 驗證,對唔上會 build fail 唔會靜靜跳過)。

## §8 驗收

**模擬器(先行)**:用本機 proxy 節流/斷流重現 storm(對 api.god-music.com 條路人工加
延遲/斬 body——工具喺執行時定,mitmproxy 或 backend 加個臨時 debug flag 都得,唔郁 production 行為):
- W1 stall→20s→reload 救返(position 冇飛 0:00,長檔+短歌各一)
- W2 reload 唔得→15s→native skip→下一首正常播
- W3 連續 3 首都死→熔斷 pause,冇再郁;網絡恢復後用戶撳 play 正常
- W4 用戶自己 pause / 電話 interruption →watchdog 零出手
- W5 正常播放(本地+串流)零 regression,beacon 零噪音
- W6 JS 醒嘅場景:JS retry 行先,native 唔搶(觀察 beacon 冇 phase=detected)

**真機(TestFlight build 14,Eric 配合)**:VPN 慢網背景聽歌,等自然 stall;驗收指標 =
client-log 見 `nativeStall detected→(recovered|skipped)` 而唔再有「3 分鐘靜音零事件」窗口。
⚠️ 老規矩:Eric QA 進行緊嗰陣唔准 deploy 任何嘢。

## §9 順手項(同一個 build 車埋,各自獨立可剷)

- D3 嘅兩項 JS 細補(Playing 分支拆 pos>0、Loading 入 buffering watchdog)——JS 醒嗰陣
  多一層早期攔截,半日內做完,唔影響本 plan 任何部分。
- D5 正式閂單(文檔標記過時)。

## §10 時間表(拍板後起計)

| 階段 | 時長 |
|---|---|
| patch 實作 + 模擬器 W1-W6 | ~1 日 |
| iOS build 14 + TestFlight 送審 + Eric 真機 QA | 1-2 日(送審通常即日,QA 睇 Eric 檔期) |
| **合計 elapsed** | **~2-3 個工作日** |

## §11 等拍板

1. **行動階梯**照 §4.2:20 秒→reload 一次→15 秒→native 自動跳歌——OK?定係保守啲「只 reload 唔自動跳」(跳歌交返俾 JS 醒返先做;代價=JS 唔醒嗰陣一首死歌會靜音企喺度)?
2. **熔斷門檻**連續 3 首(對齊 JS 前台嗰個 3)——OK?
3. **beacon 寫死 production URL** 落 native patch(§4.4)——OK?(另一選擇係由 JS 傳入,多咗一段 RNTP 介面改動,唔建議)
4. **§9 兩個順手項**車唔車埋落同一個 build?(建議車,獨立可剷)
5. 出 build 14 嘅時機:patch 完模擬器全綠就即出,定等埋你下一批其他 native 改動一齊?(建議即出,呢個 build 冇其他嘢夾)

---

## §12 執行 + 驗收記錄(2026-08-25,同一 session 落地)

### 12.1 最終形態(對比 §4 初稿嘅實測修正)

行動階梯最終版(v8):
```
stall 判定(intent=想播 && state∈{loading,buffering,playing,ready,paused} && 20s 冇 position 前進)
  → beginBackgroundTask + beacon(detected)
  → swAbandonCurrentItem()(棄置死 asset —— 見 12.2 #2/#3)
  → reload + 明文 seek 保 position + 重推 playWhenReady(見 12.2 #5)
  → 8s 冇進展 → 棄置 + next() + 重推 playWhenReady → 連續計數+1
  → 連續 3 首全無進展 → pause 熔斷 + latch 休眠(真進展/用戶明文撳播先復位)
```
同 §6 初稿嘅偏差(全部係實測逼出嚟,結構不變):RELOAD_WAIT 15s→8s(成條階梯要塞入
30 秒 background 窗);eligible state 加 `.paused`;guard 由 `playWhenReady` 轉做自家
user-intent;「JS 行先」修正為「JS 醒=process 醒,兩層並行但互不相害」(W6 實證)。

### 12.2 模擬器迭代捉到嘅六隻真 bug(規劃紙上一隻都睇唔到)

1. **RNTP method queue ≠ main**:load/事件由 RNTP 自己 queue 叫入,timer 喺錯 thread 掛 → 亂 fire(v1 實測 70s 錯位)。修:所有入口 dispatch main。
2. **`AVURLAsset.cancelLoading()` 喺「load 卡死」嘅 asset 上會 synchronous barrier 卡 caller ~50 秒**(v3 實錘)——而 SwiftAudioEx 所有換 item 路徑(`clearCurrentItem`/`recreateAVPlayer`)全部彙流入佢(v2/v4 實錘 reload/recreate 一樣堵)。
3. **破局法「棄置唔 cancel」**:斷 asset 參照 + `replaceCurrentItem(nil)`,跟住嘅 `clearCurrentItem` 見 asset==nil 即時早退;舊 load 嘅 completion 有 `pendingAsset != self.asset` 護欄(v5,reload 由 50s → **24ms**)。
4. **mid-stream stall 嘅 state 係 `paused` 唔係 `buffering`**(AVPlayer 跌 rate=0),v6 對此全盲(Run A 實錘 pos=5.9 企咗喺度)。
5. **🏆 D2 家族病嘅上游源頭搵到**:[AVPlayerWrapper.swift 458-464](frontend/hymn-app/ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift)——mid-track 外部 pause(藍牙斷開、**stall 跌 rate**)時 SwiftAudioEx **自己靜靜熄咗 `playWhenReady`**。呢行解釋咗 8 月成個「鎖屏靜咗/widget 消失」family 點解 JS 層見到「playWhenReady 無故變 false」。Watchdog 因此唔可以信 playWhenReady,改揸自家 intent(AudioPlayer.play/pause/stop hook)。
6. **native 熔斷 pause 會同 JS D2 守衛打交**(W3 v6 實測 skips 衝到 7):D2 見「無故熄」就自動 resume → 熔斷被打返開。修兩邊:native 熔斷加 latch(休眠到真進展/用戶撳播);JS D2 加 anti-fight(60 秒內第二次 unexpected-off 就接受,`playWhenReadyOffAccepted` beacon)。

### 12.3 W 套件結果

| 場景 | 結果 |
|---|---|
| W1 stall→rescue | **前半全實證**:load-stall 同 mid-stream(pos=5.9,state=paused,rogue-off 環境下)兩種 flavor 嘅 detected→reloaded(帶 targetPos)都有 live timeline;**`recovered` 六行結案分支模擬器冇決定性製造到**(64KB 斬件對唔同檔案會走 fail 路定 hang 路,唔受控),留真機 QA 由 beacon 自然實證 —— 風險評估:直線代碼,行唔到嘅後果只係 episode 唔閂,冇破壞性 |
| W2 rescue 唔得→跳歌 | ✅(兩次獨立:skip 落到健康下一首,連鎖即停) |
| W3 連鎖→熔斷 | ✅ detected(20-25s)/reload(24ms)/skip(8s 閘)三連 → `breakerTripped skips=3` → **67 秒零事件**(latch 休眠)→ UI 誠實顯示 paused |
| W4 用戶 pause 壓制 | ✅ stall 後 3 秒內用戶 pause → 50 秒零 beacon |
| W5 正常播放零誤報 | ✅ 2 分鐘+(含手動跳歌)零 beacon,播放正常 |
| W6 JS 全開互動 | ✅ 全 stall 下兩層並行:anti-fight 正好出手一次(`playWhenReadyOffAccepted`),之後 native 主導,~35s/track 有序推進,**零 fight loop、零 double-skip**;仲順手實證咗「stall→state=paused」場景係 JS 三個 watchdog 嘅結構盲區(08-12 文檔嗰個洞),native 係唯一防線 |

另:熔斷「連續」語義實測=「連續 N 首**全無進展**」;一首歌播到幾秒先死會 reset 計數
——同 JS 層「真係播到聲先 reset 熔斷」(App.js:938)完全同一哲學,係 feature 唔係 bug。

### 12.4 最終交付形態

- [plugins/withSwiftAudioExStallWatchdog.js](frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js):8 個錨點 patch AudioPlayer.swift(imports/空 hook/秒針/load/play/pause/stop/append class)+ 1 個錨點 patch AVPlayerWrapper.swift(swAbandonCurrentItem);全部 assert-or-raise。**plugin 產物同模擬器實測通過嗰份源碼 diff 全等**(逐 byte 核過)。
- [withSwiftAudioExStallFix.js](frontend/hymn-app/plugins/withSwiftAudioExStallFix.js):順手修咗 Podfile 注入嘅 lazy-regex bug(兩個 plugin 並存會互相嵌套令後者永不執行——今次實蹺),改縮排對齊搵收尾 end。
- [App.js](frontend/hymn-app/App.js):§9 順手項 D3-1(拆 `pos>0`)/D3-2(Loading 入 buffering watchdog)+ D2 anti-fight(12.2 #6)。
- app.json 加 plugin 註冊。JS bundle/Android/runtimeVersion 5 全部不變(Android 零觸碰)。

### 12.5 真機 QA 指引(TestFlight build 14)

- 驗收主指標:VPN 慢網背景聽歌,client-log 唔再出現「幾分鐘靜音零事件」窗口,
  取而代之 `nativeStall detected→(recovered|skipped)` 序列;`recovered` 首次喺真機
  出現即補齊 W1 後半實證。
- `bg=` 欄位答 §5 未知數(行動窗內 process 有冇被 suspend)。
- 老規矩:Eric QA 進行緊嗰陣唔准 deploy。
