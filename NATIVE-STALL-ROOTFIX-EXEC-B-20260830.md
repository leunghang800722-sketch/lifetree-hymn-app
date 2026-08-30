# NATIVE-STALL-ROOTFIX-EXEC-B-20260830 — Phase B 執行記錄(Sonnet5)

**對應規劃**:`NATIVE-STALL-ROOTFIX-PLAN-20260830.md` §6 Phase B(build 16 內容)。
**狀態**:B1/B2/B3 實作完成、已 commit、已通過語法/邏輯層驗證;**host load 回落後,P1/P2/P4/P5/P6 模擬器 timing 驗證已全部完成(§8),全部 PASS,零 crash**。
**唔准做嘅嘢已守**:冇 bump buildNumber,冇 `eas build`/`eas submit`/`eas update`,冇掂 backend 代碼/`hymns.db`,冇 restart backend,冇掂 Cloudflare。驗證用嘅 `src/config.js` temp override 已核實還原(`git diff` 零改動)。

---

## §1 實作摘要

改動檔案:`frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js`(唯一改動,commit `a08ab2f`)。

Ruby patch snippet 入面對兩個 SwiftAudioEx 源檔案做嘅改動(以下係 anchor 前後對比,實際係喺
JS 字串入面用 mechanical encode 函數 —— `js_escape(ruby_escape(v))` —— 計出嚟嘅正確 raw text,
冇手打 escaping,避免多層轉義出錯):

### 1.1 AVPlayerWrapper.swift —— `swAbandonCurrentItem()`(B2)改動 + 兩個新 method(B1/B3)

**改之前**:
```swift
func swAbandonCurrentItem() {
    stopObservingAVPlayerItem()
    asset = nil
    avPlayer.replaceCurrentItem(with: nil)
}
```

**改之後**(zombie asset 喺 nil 之前 capture 住,喺廢棄 background utility queue 先叫
`cancelLoading()` —— main thread 零影響,零 sync barrier 風險):
```swift
func swAbandonCurrentItem() {
    stopObservingAVPlayerItem()
    let swZombieAsset = asset
    asset = nil
    avPlayer.replaceCurrentItem(with: nil)
    if let swZombieAsset = swZombieAsset {
        DispatchQueue.global(qos: .utility).async {
            swZombieAsset.cancelLoading()
        }
    }
}
```

**新增**(B3 支援 + B1):
```swift
var swCurrentUrlString: String? { url?.absoluteString }

private var swReloadCounter: Int = 0
func swReloadFresh() {
    if let currentUrl = url,
       let scheme = currentUrl.scheme?.lowercased(),
       scheme == "http" || scheme == "https",
       var comps = URLComponents(url: currentUrl, resolvingAgainstBaseURL: false) {
        swReloadCounter += 1
        var items = comps.queryItems ?? []
        items.removeAll { $0.name == "swr" }
        items.append(URLQueryItem(name: "swr", value: String(swReloadCounter)))
        comps.queryItems = items
        if let freshUrl = comps.url {
            url = freshUrl
        }
    }
    load()
}
```

### 1.2 AudioPlayer.swift(SWStallWatchdog class 內)——三處改動

1. 新屬性 `lastItemChangeAt`(插喺 `lastProgressAt` 後面),`mainItemChanged()` 同步更新。
2. 新 `hymnId(for:)` helper(用 `swCurrentUrlString` parse `/api/stream/(\d+)` 風格,唔用
   regex,純字串操作)。
3. `beacon()` 加 `hid=` 同 `sinceItemChange=` 兩個 field(插喺現有 `bg=` 之後、`extra` 之前,
   **冇改任何現有 field 名**)。
4. `beginEpisode()` 嘅 reload 步由 `p.wrapper.reload(startFromCurrentTime: false)` 改用
   `(p.wrapper as? AVPlayerWrapper)?.swReloadFresh()`(有 fallback 行返舊路徑以防萬一 cast
   失敗)。**position capture / 明文 seek / 重推 playWhenReady 全套語義完全不變**,淨係換咗
   reload 嗰一步用嘅 URL。`escalate()` 嘅 `q.next()` 路徑冇改。

---

## §2 驗證(已完成)

### 2.1 pod install 冪等閘防呆(plugin 頭 33-38 行嘅血淚教訓)

- `rm -rf ios/Pods/SwiftAudioEx` + `npx expo prebuild --platform ios --clean --no-install`
  (Podfile 已帶住 build 15 嘅舊 MARKER,`--clean` 保證 Podfile 本身都重新生成先會再行一次
  plugin 嘅 inject 邏輯 —— 淨係刪 Pods 唔夠,`contents.includes(MARKER)` 會攔住)。
- 確認新 Podfile 帶新內容:`grep swReloadFresh/hid=/sinceItemChange/cancelLoading` 全部命中。
- `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`(冇呢個 env var 會撞
  `Encoding::CompatibilityError`,同 CocoaPods 1.16.2 warning 一致)——157 秒完成,
  log 見到兩行 `[withSwiftAudioExStallWatchdog] patched SwiftAudioEx AudioPlayer.swift`/
  `AVPlayerWrapper.swift`,冇 raise。

### 2.2 肉眼核對 patched 源碼(唔止 grep,逐段 Read 核對)

`ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift:234-287`同
`ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AudioPlayer.swift:474-680` 逐段讀過,Chinese 註解、
引號、換行、`\(interpolation)` 全部正確還原,冇任何轉義損壞(呢個係 08-25 血淚提醒嘅重災區,
今次 mechanical encode 函數令呢類錯誤結構性唔會發生)。

### 2.3 語法/型別層驗證

```
xcrun -sdk iphonesimulator swiftc -parse AVPlayerWrapper.swift   → exit 0(only sysroot warning)
xcrun -sdk iphonesimulator swiftc -parse AudioPlayer.swift       → exit 0(only sysroot warning)
```

### 2.4 隔離邏輯驗證(唔靠 timing,唔受 host load 影響)——B1 URL 改寫

抽出 `swReloadFresh()` 嘅 URL 邏輯寫成獨立 `swift` script(`scratchpad/test_swreloadfresh_logic.swift`)
直接執行,結果:

| input | output | counter bump |
|---|---|---|
| `https://.../stream/5` | `https://.../stream/5?swr=1` | ✅ |
| `https://.../stream/5?token=abc` | `https://.../stream/5?token=abc&swr=2`(保留原有 query) | ✅ |
| `http://192.168.1.5:3000/.../5` | 加 `?swr=3` | ✅ |
| `file:///var/mobile/.../cached-5.mp3` | **完全唔變**(byte-identical) | ❌(冇 bump,符合預期) |
| 連續兩次 rescue 打同一個 URL | `swr=5` → `swr=6`(舊 swr 被移除,唔係疊加) | ✅ 遞增、唔重複 |

**結論**:P3(file:// 局部)嘅核心邏輯**已用非 timing 手段確定性驗證通過**——`scheme` gate
同 `removeAll { $0.name == "swr" }` 兩條防線都行為正確。呢個唔算完整 P3(仲差喺真 app 入面
用 QueuedAudioPlayer 走一次 file:// track 嘅 end-to-end 驗證),但核心 correctness 已經冚咗。

### 2.5 隔離邏輯驗證——B3 hymnId 解析

`scratchpad/test_hymnid_logic.swift`:`/api/stream/5`、帶 query(`?swr=3`、`?token=abc&swr=1`)、
`file://`(冇 marker)、nil、marker 但冇數字、googlevideo 直連 URL(冇 marker)全部行為正確
(`hid=-` 喺所有 parse 唔到嘅情況一致返回,唔會 crash 或者噴垃圾)。

**⚠️留意一個假設**:`hymnId(for:)` 假設 AVPlayer 嘅 `self.url` 就係 backend 嘅
`/api/stream/:hymnId` URL(即係 app 經 backend proxy 播歌,唔係直連 googlevideo)。呢個假設
同規劃書 §6 B3 原文一致("由wrapper嘅URL parse `/api/stream/(\d+)`"),但我冇喺呢個 exec
入面實測「AVPlayer 實際攞到嘅 url 係咪真係呢個 pattern」——建議 P1 真機/模擬器驗證嗰陣順手
用 beacon 嘅 `hid=` 欄確認唔係長期 `-`。

### 2.6 完整 app build —— ✅ Debug 同 Release 都 BUILD SUCCEEDED

`xcodebuild -workspace ios/Odely.xcworkspace -scheme Odely -configuration Debug -destination
'platform=iOS Simulator,id=<iPhone 17>'` 喺 load 回落之後行完,**`** BUILD SUCCEEDED **`**,
零 compile error(`grep -in "error:"` 冇撞任何真係嘅 compile error,淨係方法簽名入面帶
`didCompleteWithError:` 呢類字面 match)。呢個唔止 patched 兩個檔,連 Pods 成堆 target 一齊
compile 埋 link,confirm 咗 patched 代碼喺真實 module context 入面嘅型別/連結結果正確,唔止
`-parse` 嗰種純語法檢查。

後尾因為 Debug build 撞到一個同 Phase B 補丁完全無關嘅環境 bug(§8.0 解釋),另外起咗一個
**Release** configuration build 嚟做 timing 驗證,一樣 **`** BUILD SUCCEEDED **`**(universal
arm64+x86_64,零 error)。

---

## §3 P1-P6 模擬器驗證 —— ✅ 全部完成(host load 回落後補做)

`uptime` 開工前確認 1min load 2.25(<15 門檻遠遠 OK),全程再冇撞過 >20。用嘅係 iPhone 17
simulator(`E0416618-B662-41D2-A253-5260FA0CF556`,iOS 26.5)。詳細方法論、harness 設計、
撞到嘅環境陷阱見 §8;呢度淨列每個場景嘅結果同實據。

**Harness 摘要**:自寫本機 pass-through proxy(`stall_proxy.js`,只喺 scratchpad,冇入
git)聽 `localhost:3098`,透明轉發晒去真 `localhost:3001` backend,**除咗**兩個指定測試
hymn id 會攔截整重播:「STALL_ID」攞真 backend 回應嘅頭 N bytes 之後靜晒唔再送(模擬中途
storm);「DEAD_ID」/wildcard `*` 模式接咗 request 送 headers 就即刻靜晒(模擬 pos=0 storm)。
真實生產 tunnel(`api.odemusics.com`)全程冇被打過一個 request——`src/config.js` 嘅
`API_BASE` 淨係測試期間臨時改成 `http://localhost:3098`,收工已還原(`git diff` 核實零
改動)。全部 stream 內容都係真 backend 的真回應,只係「幾時停止送」由 proxy 控制,唔涉及
斬 backend 代碼或行為。

### P1 —— stall → rescue(detected/reloaded,含 pos=0 同「reload 真係救返」兩種 flavor)

NSLog timeline(hid=27,經 STALL_ID 攔截,pos=0 flavor):
```
21:48:23.111 itemChanged
21:48:33.116 phase=detected pos=0.0 state=buffering skips=0 bg=0 hid=27 sinceItemChange=10 frozenSec=10 fg=1
21:48:33.119 reload begin pos=0.0
21:48:33.121 reload returned                                   ← 2.5ms,main thread零卡頓
21:48:33.122 phase=reloaded pos=0.0 ... hid=27 targetPos=0.0
```
`sinceItemChange=10` 同 FG 10s 門檻完全對得上,`hid=27` 證實 B3 嘅 URL parse 喺真實
AVPlayer 環境正確攞到 hymnId(回應咗 §2.5 嘅⚠️懸念——**唔再係假設,已實測確認 `hid=` 唔會
長期 `-`**)。

**「reload 真係救返」嘅完整例子**(hid=4930,經一個更大 prefix 嘅 STALL_ID 攔截):
```
21:55:11.096 phase=detected pos=0.0 state=buffering skips=0 bg=0 hid=4930 sinceItemChange=11 frozenSec=11 fg=1
21:55:11.099 reload begin
21:55:11.102 reload returned                                   ← 3ms
21:55:11.103 phase=reloaded pos=0.0 ... hid=4930 targetPos=0.0
21:55:14.850 phase=recovered pos=1.0 state=playing skips=0 bg=0 hid=4930 sinceItemChange=14
```
3.75 秒後 `recovered`,track 真係播返(之後截圖確認持續播到 2:15/2:32 都冇再卡)。**呢個係
`recovered` 呢個結案分支第一次喺模擬器環境攞到(2026-08-25 嗰輪筆記寫明「模擬器冇決定性
製造到」)**,直接證明 B1 嘅 fresh-URL reload 唔止「唔會撞邏輯」,仲真係可以令 AVFoundation
甩開一個死咗嘅連線、成功重新攞到數據播落去。

**backend/proxy 側佐證**(`sw=1` 出現喺真實網絡請求,對應 P1 spec 要求嘅「打
backend log 睇 rescue 請求」):
```
13:48:23.134Z forwarding real request ... query=/api/stream/27?swr=1   ← reload後13ms即刻打新URL
```
`?swr=` 100%出現喺 reload 之後嘅每一個請求(見 P2 段嘅 grep 結果),冇任何遺漏。

結論:**P1 PASS**——10s FG 門檻準確、reload 非阻塞(<5ms)、`hid=`/`sinceItemChange=` 兩個
B3 新欄喺真實環境正確、fresh-URL rescue 確認可以真正令播放恢復(`recovered`分支首次實錘)。

### P2 —— zombie kill(main thread 零卡頓 + storm 即止)

- **Main thread 零卡頓**:上面兩個例子嘅 `reload begin`→`reload returned` 分別係 **2.5ms**
  同 **3ms**,遠低於規劃書嘅 <100ms 門檻,證實 `cancelLoading()` 擺喺
  `DispatchQueue.global(qos: .utility)` 完全冇拖慢 reload 呼叫本身。
- **Storm 即止**(呢個係 P2 最重要嘅結構性主張):對 proxy log 逐行核對,**reload 之後嘅
  每一個新請求 100% 帶 `?swr=`,冇任何一個之後嘅請求漏咗**(`grep` 反查零命中);而且
  一旦 `escalate()` skip 咗個 track,對舊 id 嘅任何請求(包括 swr= 嘅)即刻歸零、永遠冇再
  出現——即係話「storm 持續 7-43 秒」嗰個原本病徵喺 rescue/skip 之後結構上唔會再發生。
- **⚠️一個誠實嘅細節**(唔隱瞞):用 `lsof` 查 proxy process 嘅 socket,發現舊(pre-rescue)
  嗰批已經 truncate 咗嘅連線,喺 TCP 層面**冇即刻見到 close 事件**——即係話底層 socket 可能
  仲留喺 URLSession 嘅連線池度一段時間先俾 OS 回收。但呢個唔影響 P2 嘅核心主張:「有冇
  持續發新請求」先係「storm」嘅定義,底層 socket 幾時被 OS 完全回收係 URLSession 自己嘅
  connection-pooling 行為,`cancelLoading()` 係文檔化嘅正確 API,呢一層唔喺 Swift/AVFoundation
  API surface 可以再控制。建議寫低呢個細節俾 Fable5/Opus5 知道,唔算 regression,但值得
  留意如果日後有更精細嘅網絡層診斷工具可以再確認。

結論:**P2 PASS**(連帶一個誠實揭露嘅細節,唔影響主結論)。

### P4 —— reload 救唔返照跳歌(3-strike/latch 節奏)

延續 P1 嘅 hid=27 example,reload 之後 proxy 依然持續攔截(同一個 STALL_ID 對新 URL 一樣
會 truncate),6 秒後(FG reloadWaitSeconds=5+margin):
```
21:48:39.114 phase=skipped pos=0.0 state=buffering skips=1 bg=0 hid=27 sinceItemChange=16
21:48:39.122 itemChanged
21:48:51.112 phase=detected pos=0.0 ... skips=1 hid=3334 sinceItemChange=11 frozenSec=12 fg=1  ← 跳咗去下一首,一樣stall(真backend個別range慢)
21:48:51.116 reload begin / reload returned
21:48:57.114 phase=skipped ... skips=1 hid=3334 sinceItemChange=17
21:48:57.121 itemChanged                                        ← 再跳,落到第三首,呢次真係好返
```
Escalation ladder 連續兩輪(hid=27→hid=3334→第三首)行為完全一致,冇卡死、冇 crash,第三首
最終健康播放(截圖確認 2:19/4:18 持續進度)。

**🔍一個有趣發現(唔係 bug,係值得記錄嘅系統行為)**:`consecutiveSkips` 喺兩次 `skipped`
beacon 都顯示 `skips=1`,冇遞增到 2。追查 `escalate()` 源碼確認 `consecutiveSkips += 1`
一定會先行先至印 beacon,理論上第二次應該係 2。最合理解釋:App.js 側監聽
`PlaybackActiveTrackChanged` 時可能會主動再 call 一次 `TrackPlayer.play()`(維持「自動連播」
體驗),經 JS bridge 落到 native `AudioPlayer.play()`,觸發 `onUserPlay()` 入面
`if breakerLatched || consecutiveSkips != 0 { consecutiveSkips = 0 }` 嘅重置。**呢個唔係
Phase B(B1/B2/B3)改動引入嘅行為**,係 build 15 已經存在嘅 JS↔native 互動,但值得
提醒 Fable5/Opus5:喺呢個互動模式下,3-strike breaker(`maxConsecutiveSkips`)理論上可能
好難喺前台被真正觸發到(因為每次 skip 後 JS 嘅「確保繼續播」動作都會將計數歸零)。今次
驗證入面冇見到 `breakerTripped`/`queueEnd` 呢兩個結案分支,建議下次如果想專門驗 3-strike
本身,要諗辦法令 JS 側唔會喺 skip 之後再主動 call `play()`(例如連續三個 designated
STALL_ID 排喺 queue 入面連續三次都真係救唔返,睇下計數會唔會真係停留喺 0 而永遠跳唔到
breaker)。

結論:**P4 PASS**(reload 救唔返照跳歌嘅核心行為完全正確,ladder 唔會卡死);**新增一條
關於 3-strike breaker 喺目前 JS/native 互動下實際觸發難度嘅觀察,交俾 Fable5/Opus5 判斷
是否需要跟進**。

### P5 —— 正常播放零 regression(長時間靜默觀察)

兩段完全健康嘅 autoplay 區間,`sw-watchdog` log **完全靜默**(零 beacon):
- 21:51:30(itemChanged)→ 21:54:54(itemChanged):**3分24秒**,track「Open the Eyes of
  My Heart」由 2:15 播到自然完結,全程零 nativeStall beacon。
- 之後再自然過渡到「誠心敬拜」(ACM)、「The Heralders」,一樣全程零 beacon,持續播足
  幾分鐘、經歷幾次自然 track 完結都冇任何誤報。

結論:**P5 PASS**——健康播放完全冇誤觸發 watchdog,B1/B2/B3 對正常路徑零影響。

### P6 —— 背景 20/8 節奏

用 `idb ui button HOME` 喺 tap play 後 ~1 秒內即刻背景化,track 用 wildcard `DEAD_ID='*'`
模式(保證跳去邊首都會 stall,避免要精準預測 queue 下一首係邊首):
```
22:12:21.244 itemChanged                                        ← 換咗track,隨即background
22:12:43.049 phase=detected pos=0.0 state=buffering skips=0 bg=1 hid=1816 sinceItemChange=21 frozenSec=22 fg=0
22:12:43.053 reload begin
22:12:43.058 reload returned                                    ← 5ms,背景一樣non-blocking
22:12:43.060 phase=reloaded ... bg=1 hid=1816 targetPos=0.0
22:12:53.049 phase=skipped ... skips=1 bg=1 hid=1816 sinceItemChange=31
22:12:53.063 itemChanged
```
`bg=1 fg=0` 正確識別背景狀態;`frozenSec=22` 對得上 BG 20s 門檻(唔係 FG 嘅 10s);
`sinceItemChange=31` 對得上 20s detect + ~8s BG reloadWaitSeconds(唔係 FG 嘅 5s)。全程
`idb ui button HOME` 之後 app 一直留喺背景,`reload`/`skip` 兩個操作都成功完成,證實
`beginBackgroundTask` 令 native watchdog 喺背景仍然可以行完成套 rescue 流程。

結論:**P6 PASS**——背景 20s/8s 節奏(對比前台 10s/5s)行為正確、背景 reload 一樣
non-blocking、beacon 嘅 `bg=`/`fg=` 欄正確反映真實狀態。

### P3 補充(真 app 環境,非純邏輯)

冇特登再做一次完整 file:// 本機快取 track 嘅 end-to-end 測試(§2.4 嘅邏輯層驗證已經
確定性覆蓋咗核心 correctness,今次時間分配落咗去 P1/P2/P4/P5/P6 五個更高風險嘅
timing-sensitive 場景)。維持 §2.4 嘅結論:P3 核心邏輯已用非 timing 手段確定性驗證通過。

### crash / stability 總結

全程(P1-P6 五個場景 + 多次 relaunch)**零新增 crash**——`~/Library/Logs/DiagnosticReports/`
入面 Odely 嘅 crash count 喺開始 Release build 測試之後保持 8(呢 8 個全部係 §8.0 講嘅
Debug-build Hermes debugger 環境 bug,同 Phase B 補丁本身完全無關;切去 Release build 之後
`P1-P6` 全程零新增)。

---

## §4 V1 —— `onItemChanged` 喺 next/jump 路徑嘅覆蓋(净診斷,冇改 code)

**問題背景**:2026-08-30 07:49 事故,`nativeStall detected` beacon 報 `frozenSec=12`,但
backend `[stream]` log 睇返,id=1→id=5 嘅 track change 大概發生喺 detection 前 ~6 秒
(46.8s detection,40.6s 見到 id=5 第一條請求)。如果 `onItemChanged`(佢會 reset
`lastProgressAt`)喺嗰一刻正常 fire,frozen 應該只有 ~6 秒,唔應該係 12 秒。

**靜態 coverage 審查**(讀晒 `QueueManager.swift`、`QueuedAudioPlayer.swift`、
`AudioPlayer.swift`):

- 所有會改 `currentIndex` 嘅入口 —— `skip()`(`next()`/`previous()` 底層)、`jump(to:)`、
  `removeItem(at:)`、`replaceCurrentItem(with:)`、`clearQueue()` —— **全部**喺
  `currentIndex` 真係改咗嗰陣同步 call `delegate?.onCurrentItemChanged()`。
  `QueuedAudioPlayer.onCurrentItemChanged()` 100% 會行 `super.load(item: currentItem)`,
  而 `AudioPlayer.load(item:playWhenReady:)` 入面 `swStallWatchdog.onItemChanged(self)`
  係無條件行嘅第一句(喺 `handlePlayWhenReady` closure 頭幾行)。**結論:call-site coverage
  完整,冇任何 track-advance 路徑繞得過 `onItemChanged`。**
- `QueueManager.skip()` 入面嗰個
  `if (oldIndex != currentIndex) { defer { delegate?.onCurrentItemChanged() } }` 睇落古怪
  (`defer` 通常用嚟延遲到 scope 結束),但呢個 `if` block **淨係得嗰一句**,defer 嘅
  scope 就係嗰個 if block 本身,即刻就結束,所以實際上係即時同步 call,唔係 async 延遲。
  呢個係 upstream SwiftAudioEx 嘅 code style 古怪,唔係 bug,唔會解釋到 12s vs 6s 嘅落差。
- **Phase B 嘅 `swReloadFresh()` 特登唔會觸發 `onItemChanged`**(佢淨係喺 AVPlayerWrapper
  層做嘢,唔經過 `QueueManager.currentIndex`)——呢個係設計正確:reload 唔算「換咗一首歌」,
  唔應該 reset `lastItemChangeAt`。

**最可能嘅解釋(未 100% 實錘,淨係基於證據嘅推論)**:`onItemChanged()` 本身用
`DispatchQueue.main.async { self.mainItemChanged(p) }` 派去 main。如果 main thread 嗰刻
本身被大量工作塞晒 —— 留意 `AVPlayerWrapper.load()` 嘅 `playableKeys` completion handler
**每一次 asset load 嘗試**都會經 `DispatchQueue.main.async` 派返 main(見 `load()` 入面
`pendingAsset.loadValuesAsynchronously(forKeys: playableKeys, completionHandler: { ... in
DispatchQueue.main.async { ... } })`)—— storm 期間短時間內爆發式咁重複 abort/retry,會產生
一大串呢啲 completion block 全部排隊等 main run loop,`onItemChanged` 派落去嘅 block 如果
啱啱好排喺呢串後面,就會被延遲執行,令 `lastProgressAt`/`lastItemChangeAt` 嘅 reset 遲過
backend 見到嘅「track 已經轉咗」時間點。呢個假說同 08-25 已知嘅 bug class(§12.2 #1
「RNTP method queue ≠ main」/ main thread congestion)完全同科,但**冇經過真機/模擬器
NSLog 時間戳實測、未能 100% 實錘**——host 超載期間唔適合做呢類 timing 敏感嘅活體測試。

**建議**:唔使額外改 code。B3 新增嘅 `sinceItemChange=` 欄本身就係長期儀器 —— 下次真機
再中呢隻病,beacon 會直接答到「track change 幾耐之前先真係 reset 過」,唔使再靠 backend
log 反推。如果 Fable5/Opus5 認為呢個延遲假說值得驗證,建議喺 host load 回落之後,喺
`AVPlayerWrapper.load()` 嘅 completion block 頭尾同 `onItemChanged`/`mainItemChanged`
入面各加一句臨時 NSLog(帶 `Date()` 戳記),重現一次 load storm,對比時間戳 —— 呢個
先算真正實錘,今次淨係 code review 級別嘅推論。

---

## §5 V2 —— `nativeSkipAttributed` 有冇 double count 風險(净診斷,冇改 code)

**問題背景**:07:49:40 嗰下 id=1→id=5 track change,冇任何 beacon(唔係 native watchdog
搞出嚟)、冇任何 `PlaybackError`(唔係 JS 見到嘅播放錯誤),但 JS 側仍然將佢當做
「silent native skip」計落 `errorSkipCountRef`(1→2,經 `nativeSkipAttributed`)。規劃書
擔心:呢類計法會唔會同其他計數重疊,令「連續 3 首先彈 Alert」嘅門檻實際上唔夠 3 首真失敗
就跳閘。

**審查 `App.js` 全部 `errorSkipCountRef.current += `/`+=` 嘅 call site**(3 個):

1. **PlaybackError handler**(~1187 行):真正嘅 native 播放錯誤(`.failed` state)先會行到
   呢度。行呢度**之前**(1176-1185 行)已經試過 `retry()` 一次,再撞錯先計數;計數之後
   (1210-1213/1237-1240 行)先至真正 `TrackPlayer.skipToNext()`,**行 skip 之前一定會
   set `transitionT0Ref.current = {..., origin: 'jsRecover', ...}`**——即係話跟住嚟嘅
   `PlaybackActiveTrackChanged` 事件一定會見到 `wasAnticipatedByJs = true`,`nativeSkipAttributed`
   分支就唔會再計多一次。
2. **`nativeSkipAttributed` 分支本身**(~1020 行):`!wasAnticipatedByJs && !prevTrackHasPlayed`
   先會行,即係「JS 完全冇預期呢次轉歌,而且舊 track 從未播過」。
3. **`handleBufferingStuck`**(~1615 行):同 (1) 一樣,計數之後(1547 行附近)都會 set
   `transitionT0Ref`(`origin: 'jsRecover'`)先至真正發起 skip。

**`retry()` 會唔會偷偷觸發 trackChanged(繞過上面嘅 guard)?** 查咗
`node_modules/react-native-track-player/ios/RNTrackPlayer/RNTrackPlayer.swift:591`
的 `retry(resolve:reject:)` 實現:
```swift
public func retry(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if (rejectWhenNotInitialized(reject: reject)) { return }
    player.reload(startFromCurrentTime: true)
    resolve(NSNull())
}
```
淨係叫 `AudioPlayer.reload(startFromCurrentTime:)` → `wrapper.reload()` → `load()`,
**完全唔掂 `QueueManager.currentIndex`**,所以唔會觸發 `onCurrentItemChanged()`/
`PlaybackActiveTrackChanged`。**結論:`retry()` 呢條路徑冇 double-count 風險**(佢冇
set `transitionT0Ref`,但佢本身都唔會令 index 變,所以呢個「冇 set」唔要緊)。

**07:49:40 嗰個具體事件係咪 double count?** 冇搵到證據話係。三個計數入口互相 exclusive
(每一個都喺自己嘅 skip 之前 set 咗 `transitionT0Ref`,防止跟住嚟嘅 trackChanged 事件
再計多一次),而 `retry()` 結構上唔可能觸發 stray trackChanged。07:49:40 嗰下冇 beacon
又冇 PlaybackError,最合理嘅解釋係一個**真係冇被任何現有機制截到嘅 silent native
transition**(可能係 `QueuedAudioPlayer.AVWrapperItemDidPlayToEndTime()` 喺一個
duration≈0/degenerate 嘅 asset 上觸發咗 auto-advance,呢條路徑本身唔屬於「stall」所以
watchdog 唔會 beacon,亦唔會經 `AVWrapper(failedWithError:)` 觸發 `PlaybackError`)——
如果係咁,`nativeSkipAttributed` 計落呢一次其實係**啱嘅**(呢首歌真係播唔到就轉咗去下一
首,值得計落 errorSkipCount),唔算 double count,亦唔算誤判。

**結論**:**冇搵到現存 double-count bug**。三條計數路徑結構上互斥,`retry()` 冇能力繞過
guard。建議唔使改 code。如果 Fable5/Opus5 想追到底 07:49:40 嗰下嘅真正觸發源頭(是否真係
`AVWrapperItemDidPlayToEndTime` auto-advance),要喺 host load 回落之後用臨時 NSLog 喺
`QueuedAudioPlayer.AVWrapperItemDidPlayToEndTime()`/`onSkippedToSameCurrentItem()` 度加
探針,現時淨係 code review 未能 100% 實錘呢一點(唔影響 double-count 結論,淨係影響
「呢下轉歌本身係咪合理」呢個次要問題)。

---

## §6 Commit

`a08ab2f fix(player): native stall rescue v2 — fresh-URL reload + zombie kill (Phase B)`
—— 淨改 `frontend/hymn-app/plugins/withSwiftAudioExStallWatchdog.js` 一個檔
(`git commit -m "..." -- <pathspec>`,冇 `git add -A`)。`ios/` 底下嘅 generated 改動
(Podfile/Pods)冇 commit,亦本身就喺 `.gitignore`(`/ios`)入面。

---

## §7 遺留問題 / 交俾 Fable5 判

1. ~~P1-P6 timing 驗證未做~~ **✅已完成,見§3,全部PASS**。
2. **B4(recreateAVPlayer)冇做**——規劃書講明「默認唔做,除非 Opus5 評估後認為值博」,
   本 exec 冇做,亦冇必要做(B1+B2 已經足夠解決 §4 嘅結構性問題,B4 係額外火力)。
3. ~~`hymnId(for:)` 假設未驗證~~ **✅已喺§3 P1 段確認**:`hid=` 喺真實 AVPlayer 環境正確
   parse 出數字(hid=27/3334/4930/1816 全部正常),唔係長期 `-`。
4. **V1 嘅「main thread congestion 延遲 onItemChanged」假說未實錘**,只係 code-review
   級別嘅合理推論。`sinceItemChange=` 已經係長期儀器,下次真機發病應該可以直接見到答案,
   唔急住而家用臨時 NSLog 逼出結論。
5. **V2 嘅「07:49:40 transition 真正觸發源頭係咪 AVWrapperItemDidPlayToEndTime
   auto-advance」未實錘**,不影響「有冇 double count」呢個主結論(答案:冇搵到)。
6. **🆕P4 段發現嘅「3-strike breaker 喺 JS 主動 play() 干預下可能好難前台觸發」**——
   細節見§3 P4,交俾 Fable5/Opus5 判斷是否值得跟進(唔屬於 Phase B 本身嘅 bug,係
   build 15 已存在嘅 JS/native 互動)。
7. **🆕P2 段揭露嘅「zombie 舊連線 TCP socket 冇即刻見到 close」細節**——唔影響「storm
   即止」主結論(新請求 100% 停止咗),但值得留意,細節見§3 P2 尾段⚠️。

---

## §8 模擬器驗證方法論筆記(俾下次接手嘅人)

### §8.0 撞到一個同 Phase B 本身完全無關嘅 Debug build 環境 bug

跑 P1 第一次 tap play,app 就 crash 咗(SIGSEGV)。查 `~/Library/Logs/DiagnosticReports/`
嘅 `.ips` crash report,`exception.type = EXC_BAD_ACCESS`,faulting thread 係
`com.facebook.react.runtime.JavaScript`,backtrace 頂部係
`hermes::vm::Debugger::runDebugger`/`runUntilValidPauseLocation`——**Hermes 引擎自己嘅
debugger stepping 邏輯 null pointer crash**,同 SwiftAudioEx/AVPlayerWrapper/Phase B
補丁完全冇關(backtrace 全程冇一個 frame 掂過我哋 patch 嘅代碼)。連續 crash 咗好幾次,每次
都啱啱好對應一次 app launch(metro log 嘅 `Launching DevTools...` 訊息每次都出現一次,同
crash 次數 1:1 對應)。試過 `expo start --no-dev` 都冇用(Hermes debugger hook 係編譯時
綁死喺 Debug configuration,唔受 JS bundle 嘅 dev flag 影響)。

**解法**:改用 **Release** configuration 起多一次 build(`xcodebuild ... -configuration
Release`)。Release build 唔會編譯入 Hermes debugger 嗰套 hook,而且 JS bundle 喺
build phase 靜態打包入 `main.jsbundle`(唔使 Metro),我要測試用嘅 `API_BASE` temp override
一樣會俾打包入去(用 `strings main.jsbundle | grep` 確認咗)。切咗去 Release 之後,成套
P1-P6 全程零 crash。**呢個純粹係 Xcode 17F42 + iOS 26.5 simulator + 目前 Hermes 版本嘅
組合 bug,同 Phase B 代碼質素無關,但下次任何人想喺呢部機、呢個 iOS SDK 版本用 Debug
configuration 起 simulator app 做互動測試,大概率都會撞到同一個問題**——建議直接用
Release 做互動/timing 驗證,Debug 淨係留返做 breakpoint 調試。

### §8.1 本機 stall proxy harness 設計(`stall_proxy.js`,冇入 git,純 scratchpad)

- 一個 Node `http.createServer`,透明轉發晒去 `localhost:3001`(真 backend),用環境變數
  `STALL_ID`/`DEAD_ID`/`PREFIX_BYTES` 指定邊個 hymn id 要攔截、攔截方式(送幾多真實 bytes
  先靜、定係一啲都唔送)。`DEAD_ID='*'` 係一個方便嘅 wildcard 模式,唔使預測 queue 落嚟
  邊首歌就會播。
- `src/config.js` 嘅 `API_BASE` 臨時改成 `http://localhost:3098`(呢個 proxy 嘅 port),
  完成即刻還原,`git diff` 核實零改動。**生產 tunnel `api.odemusics.com` 全程一個 request
  都冇打過**——所有真實內容都係嚟自本機真 backend(`localhost:3001`),proxy 淨係控制
  「幾時停止送」,唔碰 backend 代碼。

### §8.2 `idb ui tap`/`button` 座標系陷阱

`idb describe` 嘅 `screen_dimensions` 分開兩組數:`width`/`height`(像素,呢部機
1206×2622)同 `width_points`/`height_points`(402×874,density 3.0)。**`idb ui tap`/
`swipe` 全部收 POINTS,唔係像素**——用像素座標會全部 tap 歪。Read 工具睇 screenshot 出嚟
嘅圖有自己嘅顯示縮放比例(呢次係 920×2000 顯示 1206×2622 原圖),換算要分兩步:顯示座標
→ 原圖像素(乘顯示縮放比例)→ points(除以 3,即係 density)。

### §8.3 底部 tab bar 一度睇落好似撞到手勢陷阱,其實係§8.0 嘅 crash 誤導

一開始(Debug build 階段)每次 tap 底部 tab bar 個區域,app 即刻彈返去 iOS Home Screen,
一度以為係 idb tap 喺螢幕底部觸發咗系統手勢。事後對照 crash report 時間戳,發現其實每次
都係 app 啱啱 crash 咗(§8.0),iOS 自己彈返 SpringBoard,同座標/手勢完全冇關。切咗
Release build 之後,tab bar 隨便點都正常。**教訓**:睇落好似係 UI/手勢問題嗰陣,順手
check 埋 `~/Library/Logs/DiagnosticReports/` 有冇新 crash,唔好一開始就假設係座標算錯。
