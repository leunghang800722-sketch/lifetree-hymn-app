# 「聽聽下自己停」—— Opus 5 獨立覆查(2026-08-13)

> 覆查範圍:Sonnet5(session local_c03c7829)喺 2026-08-13 下午做嘅一輪調查。
> Eric 要求 Opus 5 接手查清楚,唔准照抄、唔准砌一個「聽落合理但冇證據」嘅解釋。
>
> **重要規矩提示:寫呢份報告嗰陣 Eric 仲喺度聽緊歌(最後一個 stream request
> 16:59:43)。跟 `feedback-no-deploy-during-live-qa`,我冇 restart backend、冇推
> OTA、冇改任何 runtime 代碼。下面所有「建議」都係交返 Dispatch/Eric 決定幾時做。**

---

## 零、TL;DR

1. **Sonnet5 講嘅「三次凍結(36 分鐘 / 15 分鐘 / 25 分 33 秒)」係量度方法錯咗整出嚟嘅。**
   佢係量「同一個 song id 兩次出現之間隔咗幾耐」,但中間其實有 4-6 首**其他歌**
   正常播緊、有成百個 request。三個數字我逐個對返算術,全部對得絲毫不差(見 §2),
   所以呢個唔係「大概估錯」,係一個可以百分百指認嘅量度 artifact。
2. **真正嘅完全靜音只有一次:15:04:42 → 15:26:47,22 分 05 秒,零個 request。**
   呢個係實錘嘅。
3. **另外有一種一直冇人講過、但今日重複咗三次嘅異常:同一首歌喺播到一半嗰陣
   由 0:00 重新載入一次**(id=6 15:50、id=27 16:27、id=5 16:47)。
   Eric 16:28:04 開 App 見到「進度飛返 0:00」,對正 16:27:45 嗰次 —— 即係話
   **Eric 親眼見到嗰單,係呢個「重載」,唔係「凍結」。**
4. 機制上最硬嘅一條:**iOS 對 background app 唔係「將 JS 節流」,係直接
   suspend 成個 process**。我喺本機 React Native 0.85.3 原始碼
   (`RCTTiming.mm`)逐行核實過 —— RN 喺入 background 嗰陣係將 CADisplayLink
   換成 NSTimer,**timer 照跑**;真正停係 iOS suspend 咗個 process 之後。
   而 iOS 對 `UIBackgroundModes: audio` 嘅 app 嘅規則正正係:**一停止出聲就
   suspend**。即係話 —— **一旦冇咗聲,所有 JS watchdog 都同時冇咗命,永遠救唔返。
   我哋今日加緊嘅第四個 JS watchdog,喺呢個場景結構上就係無效嘅。**
5. **老實講:22 分鐘嗰單嘅觸發原因,我攞唔到 100% 實錘。** 我可以收窄到兩個
   都同現有證據 100% 相容嘅假說(§5),但分辨兩者需要 client 端嘅證據,
   而 client 端診斷鏈**而家係壞嘅**(§7)—— 下次再撞到,一樣係飛盲。
6. 唔使等下次都攞得到答案嘅路,有一條(§6):Eric 部 iPhone 插返上部 Mac,
   `log collect` 撈返今日嘅系統 log,`runningboardd` 會逐條寫住個 app 幾時
   俾 suspend、幾時 resume。呢個係**回溯**得到今日 15:04 嗰單嘅。

---

## 一、我核實咗嘅原始數據

資料源:`/private/tmp/hymn_backend.log`(現正跑緊嗰個 backend process 嘅 live log)、
`~/.hymn-deploy/deploy.log`、`~/Library/Logs/com.cloudflare.cloudflared.err.log`、
`backend/users.db`、`backend/hymns.db`、本機 `node_modules` 同 `ios/Pods` 原始碼。
**log 時間係 UTC,HKT = UTC + 8**(已用 `date`/`date -u` 對過)。

### 1.1 先搞清楚一件事:log 入面「靜」唔等於「冇播緊」

今日 `1e8fede`/`8d2ed4a` 上咗 warm-buffer 全首歌 cache(`WARM_CAP_BYTES = 12MB`,
大部分詩歌 3-8MB)。實際行為變成:**每首歌開頭 10-40 秒之內,client 一次過
攞晒成首歌,之後成首歌播嗰 4-5 分鐘完全冇任何 request。**

所以 backend log 而家係一連串「爆發 + 長時間全靜」。**每個 3-5 分鐘嘅空白係正常
播放,唔係停頓。** 呢個係整個誤判嘅源頭。

### 1.2 用 song id 重建返成個 session(HKT)

```
15:00:26 → 15:04:42   id=44  奔跑不放棄        n=15  ← Eric 插播
15:04:42 → 15:26:47   ★★ 零 request,22 分 05 秒 ★★
15:26:47 → 15:27:05   id=1   恩典太美麗  5:01  n=6   (mode=cold)
15:31:55 → 15:32:08   id=3   我要向高山舉目 3:45
15:35:26 → 15:35:38   id=4   主禱文      4:32
15:39:02              [backend restart, sha=8d2ed4a]
15:40:17 → 15:40:27   id=5   深深愛你    4:45
15:40:37 → 15:43:46   id=49  有一天            ← Eric 插播(播咗 20 秒就切走 id=5)
15:44:28 → 15:44:53   id=6   永恆的讚美  4:50   (15:44:29 upstream 403 → retried)
15:45:09/15:45:41     [OTA publish android/ios, sha=8d2ed4a]
15:50:49 → 15:50:53   id=6   ⚠ 同一首歌再由頭載一次
15:53:53 → 15:54:09   id=7   榮耀神羔羊  5:30
15:58:26 → 15:59:40   id=27  盡情的敬拜
15:59:55 → 16:00:11   id=1   ← 回到清單第一首(第二輪)
16:05:00  id=3 / 16:08:29 id=4 / 16:13:18 id=5 / 16:17:29 id=6 / 16:20:40 id=7
16:25:13 → 16:25:55   id=27
16:27:45 → 16:27:54   id=27  ⚠ 同一首歌再由頭載一次  ← Eric 16:28:04 見到 0:00
16:31:52 → 16:32:12   id=1   ← 第三輪
16:36:59 id=3 / 16:40:29 id=4 / 16:45:19 id=5
16:47:38 → 16:47:46   id=5   ⚠ 同一首歌再由頭載一次
16:51:38 id=6 / 16:54:51 id=7 / 16:59:24 id=27  ← 寫報告時仲播緊
```

歌與歌之間嘅間距同 DB 入面嘅歌長對得上(略短,因為新版會提早 preload 下一首),
即係話**由 15:26 到而家(1 個半鐘),播放係順暢嘅**。

---

## 二、推翻:「三次凍結」係量度 artifact

Sonnet5 報上去嘅三個數字,我逐個還原到佢係點量出嚟嘅:

| 報告講法 | 實際係量緊乜 | 中間其實發生咗乜 |
|---|---|---|
| id=44 之後**靜咗 36 分鐘** | 15:04:42(id=44 最後)→ **15:40:37(id=49)**= 35 分 55 秒 | 中間 id=1、3、4、5 **四首歌正常播晒**,36 個 request |
| id=49 之後**靜咗 15 分鐘** | 15:43:46(id=49 最後)→ **15:58:26(id=27)**= 14 分 40 秒 | 中間 id=6(兩次)、id=7,53 個 request |
| id=27 之後**靜咗 25 分 33 秒** | 15:59:40(id=27 最後)→ **16:25:13(id=27 再出現)**= **25 分 33 秒(一秒不差)** | 中間 id=1、3、4、5、6、7 **六首歌**,約 150 個 request |

第三行嗰個「一秒不差」就係鐵證:**個量度係「同一個 song id 兩次出現之間」,
唔係「有冇 traffic」。** 三次都係咁,唔係巧合。

**結論:今日只有一次真正嘅完全靜音,就係 15:04:42 → 15:26:47(22 分 05 秒)。**
另外兩次「凍結」唔存在。

> 我唔係話 Eric 感覺錯 —— 見 §3.1,佢真係撞到嘢,只不過唔係「靜咗廿幾分鐘」嗰種。

---

## 三、真正嘅兩個異常

### 3.1 P1 —— 同一首歌播到一半由 0:00 重新載入(今日出現 3 次)

| 時間 | 歌 | 第一次開始 | 重載 | 距離開波 |
|---|---|---|---|---|
| 15:50:49 | id=6 永恆的讚美(4:50) | 15:44:28 | 15:50:49 | +6:21 |
| 16:27:45 | id=27 盡情的敬拜 | 16:25:13 | 16:27:45 | +2:32 |
| 16:47:38 | id=5 深深愛你(4:45) | 16:45:19 | 16:47:38 | +2:19 |

三次之後,「呢首歌 → 下一首」嘅間距都比歌長多咗 2-4 分鐘,即係**成首歌真係由頭
再播一次**,唔係單純補 buffer。

**Eric 16:28:04 開 App 見到進度飛返 0:00,對正 16:27:45 嗰次(相差 19 秒)。**
即係 Eric 親身撞到、親眼影到嗰單,係 P1,唔係 22 分鐘嗰種凍結。

P1 嘅機制我喺原始碼度搵到一個非常對版嘅候選(§4.5):SwiftAudioEx 嘅
`reload(startFromCurrentTime: true)` 喺 `currentItem.duration.isIndefinite` 為真
嗰陣**唔會保留位置**,直接由 0 開始。Sonnet5 提出嘅假說 (b) 喺呢度係啱嘅方向 ——
但佢用嚟解釋錯咗嘅目標(22 分鐘凍結),真正對得上嘅係 P1。

### 3.2 P2 —— 15:04:42 → 15:26:47,22 分 05 秒完全零 request

- id=44 最後一條 log:`15:04:42.461 total_ms=387 status=0 aborted=true`
  (headers 都未出就俾 client cut 咗),之後**乜都冇**。
- 冇 502、冇 error、冇 hang 住嘅連線(hang 住嘅話收線嗰陣一定會補一條 log)。
- id=44 係 15:00:26 開波,佢個 request 係一路每 1-2.5 分鐘補一次
  (15:00:26 / 15:03:01 / 15:04:01 / 15:04:39-42)—— 即係**逐段補 buffer**,
  最後一次補完就冇咗。以歌長推,首歌大約 15:06 播完,
  **即係「靜」係由轉歌嗰刻開始**,同 Eric「轉歌之後」嘅描述對得上。
- 22 分鐘之後嘅第一個 request 係 **id=1(清單第一首)、`mode=cold`**,
  即係由清單頂重新開始,唔係接住 id=44 落去。

---

## 四、機制分析

### 4.1 「iOS background JS throttling」—— 呢個講法係錯嘅,但真相更嚴重

Sonnet5 假說 (a) 講「iOS 將 JS 執行(poll loop/setTimeout)大幅節流」。
我去本機 React Native 0.85.3 原始碼核實:
`node_modules/react-native/React/CoreModules/RCTTiming.mm`

```objc
- (void)appDidMoveToBackground
{
  // Deactivate the CADisplayLink while in the background.
  [self stopTimers];
  _inBackground = YES;
  // Issue one final timer callback, which will schedule a
  // background NSTimer, if needed.
  [self didUpdateFrame:nil];
}
```

再落去 `didUpdateFrame` / `createTimer`:

```objc
if (_inBackground) {
    if (timerCount) { [self scheduleSleepTimer:nextScheduledTarget]; }
}
...
if (_inBackground) { [self scheduleSleepTimer:timer.target]; }
```

**即係話:RN 入 background 唔係停 timer,係由 CADisplayLink 轉去 NSTimer 繼續行。
冇任何「節流」邏輯 —— 冇 browser 嗰種 1 秒 clamp,冇降頻。** 我哋個
`await new Promise(r => setTimeout(r, 1000))` poll loop 喺鎖屏但 process
仲活住嗰陣,係**全速照跑**嘅。

**真正令佢停嘅唔係節流,係 iOS suspend 咗成個 process。** Apple 對
`UIBackgroundModes: audio` 嘅規則寫得好白:

> When the UIBackgroundModes key contains the audio value, the system's media
> frameworks automatically prevent the app from being suspended when it moves to
> the background. **As long as it is playing audio** … the app continues to run in
> the background. **However, if … playback stops, the system suspends the app.**

即係:**背景執行權嘅前提係「真係出緊聲」。一停聲,iOS 就 suspend。**
Suspend 之後 NSTimer 唔會 fire、fetch 唔會出、event listener 唔會行 ——
**成個 JS 層凍結。**

### 4.2 由 4.1 推出嚟嘅結構性結論(呢個係今日最重要嘅一句)

> **一旦聲停咗,JS 層就冇能力救返自己。**

因為:聲停 → iOS suspend → JS 凍結 → watchdog 唔會行 → 冇人 nudge/skip →
一路停到有外力(用戶攞起電話 / 解鎖 / 撳鎖屏個掣 / 系統 event)
令 process resume 為止。resume 之後 JS 一恢復,watchdog 即刻補做返
「跳去下一首 / 重載」—— **呢個正正就係 Eric 描述嘅「凍結十幾廿幾分鐘先自己醒返」。**

Sonnet5 個直覺(「攞起電話畀翻少少 CPU 時間先追落去觸發」)方向啱,
但機制唔係「節流」係「suspend」,而呢個分別好重要:節流嘅話加 watchdog 有用,
**suspend 嘅話加幾多個 JS watchdog 都係零效**。今日已經加咗三個
(track-end / mid-stall / buffering),再加第四個都唔會 cover 到呢種場景。

真正有用嘅方向係:**唔好等「已經停咗」先救,要令佢一開始就唔停**
(即係要喺 native / 事件層攔截,唔係喺 poll loop 度攔截)。見 §8。

### 4.3 Watchdog 覆蓋矩陣有洞(呢個唔使等重現,審 code 即刻見到)

`App.js` 個 poll loop 只 cover 兩種 state:

| RNTP state | 有冇 watchdog |
|---|---|
| `Playing` + position 連續 3 秒唔郁 | ✅ mid-stall / track-end |
| `Buffering` 連續 15/30 秒 | ✅ buffering watchdog(+熔斷器) |
| **`Paused`** | ❌ 完全冇 |
| **`Ready`** | ❌ 完全冇 |
| **`Loading`** | ❌ 完全冇(注意:RNTP 有 `loading` **同** `buffering` 兩個唔同 state,見 `ios/RNTrackPlayer/Models/State.swift`;`AVPlayerWrapper.load()` 入面 `state = .loading`,轉歌一定經呢個 state) |
| **`Ended` / `None` / `Stopped`** | ❌ 完全冇 |

另外 `Playing` 分支仲有一個窄位:條件係 `pos > 0`。**啱啱轉歌、position 仲係 0
嗰陣卡死,永遠唔會觸發。** 而 Eric 講嘅正正係「轉歌之後」。

### 4.4 最強嫌疑:`playWhenReady` 俾 native 靜靜哋熄咗,而冇人聽住

`ios/Pods/SwiftAudioEx/.../AVPlayerWrapper.swift`:

```swift
func player(didChangeTimeControlStatus status: AVPlayer.TimeControlStatus) {
    case .paused:
        ...
        // Playback may have become paused externally for example due to a
        // bluetooth device disconnecting:
        if (self.playWhenReady) {
            if (self.currentTime > 0 && self.currentTime < self.duration) {
                self.playWhenReady = false;      // ← 靜靜哋熄咗
            }
        } else {
            self.state = .paused
        }
```

留意:行呢條路嗰陣**唔會改 `state`**。即係 JS 見到嘅 state 仲係
`Playing`(過時嘅),但 AVPlayer 實際 rate = 0、冇聲。之後冇聲 →
iOS suspend → JS 凍結 → mid-stall watchdog 就算理論上 cover 到,實際上都冇機會行。

**而 RNTP 係有 fire 一個 event 出嚟嘅**:
`RNTrackPlayer.swift:44 player.event.playWhenReadyChange.addListener(...)`
→ JS 側 `Event.PlaybackPlayWhenReadyChanged`(`lib/src/constants/Event.js:31`)。

**我 grep 過成個 App.js 同 track-player-service.js:呢個 event 一個地方都冇聽。**
即係話 —— 「native 靜靜哋熄咗播放意圖」呢件事,係有訊號送出嚟嘅,我哋一直冇接。
呢個係目前為止**唯一一條唔使估、可以喺聲停之前就收到通知**嘅路。

(2026-08-12 `1dde53d` 已經修咗 audio interruption 嗰條特定路徑
`autoHandleInterruptions: true` + `RemoteDuck` listener。但上面呢條
`.paused` 路徑係**另一條**,唔經 interruption,`autoHandleInterruptions` 唔 cover。)

### 4.5 P1(飛返 0:00)嘅對版機制

同一個檔:

```swift
func reload(startFromCurrentTime: Bool) {
    var time : Double? = nil
    if (startFromCurrentTime) {
        if let currentItem = currentItem {
            if (!currentItem.duration.isIndefinite) {   // ← 只有 duration 確定先保留位置
                time = currentItem.currentTime().seconds
            }
        }
    }
    load()
    if let time = time { seek(to: time) }
}
```

而 `reload(startFromCurrentTime:)` 喺 `playWhenReady` setter 度會被自動叫:

```swift
if (playWhenReady == true && (state == .failed || state == .stopped)) {
    reload(startFromCurrentTime: state == .failed)
}
```

即係:**只要 item 曾經 `.failed`,而重載嗰刻 `duration.isIndefinite` 為真
(冷 load / moov 未讀到 / 換咗 URL),個位置就會靜靜哋丟失,由 0:00 重新播。**
呢個同 P1 三次觀察(重播成首歌、時間表對得上)完全一致,亦解釋到
Eric 16:28:04 影到嘅 0:00。

15:44:29 id=6 嗰次有 **upstream 403 → retried**,而 id=6 正正係 P1 三次之一 ——
403 → PlaybackError/failed → retry → reload 丟位置,呢條鏈係通嘅。
**但我要老實講:我冇 client 端 log 證實個 retry 真係行咗呢條路,呢個仲係推論。**

---

## 五、我攞唔到 100% 實錘嘅係咩

**P2(22 分鐘)嘅觸發原因,現有證據分唔到以下兩個假說** —— 兩個同「零 request」
呢個觀察都 100% 相容:

- **假說 A:process 俾 iOS suspend 咗。**
  聲因為某個原因停咗 → iOS 收返背景執行權 → JS 全凍 → 22 分鐘後 Eric 攞起電話
  → resume → 由清單頂重新開始。
- **假說 B:app 仲活住,但 player 跌咗落一個冇 watchdog 管嘅 state**
  (`Paused` / `Ready` / `Ended` / `Loading`,見 §4.3)→ JS 照跑但乜都唔做。

而且**兩者好可能係接連發生**(B 先,冇聲之後變成 A)。

**點解 backend log 分唔到:** A 同 B 都係「零 request」。而喺 A 之下,連
`logDiag` beacon 都出唔到。呢個唔係我查得唔夠深 —— 係呢層證據本質上封頂。

**要分辨,需要嘅係以下任何一樣:**

1. **JS wall-clock 斷層探測**(最平、最決定性):喺個 1 秒 poll loop 度記低
   `Date.now()`,下一 tick 計 `drift`。如果 resume 之後見到 `drift ≈ 22 分鐘`
   → **假說 A 實錘**;如果成段時間都係 1 秒一 tick、state 卡住唔郁
   → **假說 B 實錘**。一個數字就分到,唔使 Xcode。
2. **device 系統 log**(見 §6)—— `runningboardd` 會直接寫住幾時 suspend。
3. **Xcode Console 駁住部機**(最貴,要 Eric 一路揸住部機等佢撞)。

**我唔會砌一個「應該係 A」嘅結論交數。** 兩個假說之下,§8 嘅緩解措施有部分係共通嘅,
可以照做;但根因報告要等上面任何一樣證據先可以落實。

---

## 六、唔使等下次都攞得到嘅路(回溯今日 15:04 嗰單)

iOS 部機自己保留住系統 log(通常夠幾個鐘到一兩日)。如果 **Eric 部 iPhone 用線插返
上部 Mac(要解鎖 + 信任)**,可以喺 Mac 度撈返今日嗰段:

```bash
xcrun devicectl list devices
```

配對好之後用 Console.app(左邊揀部 iPhone)或者 `log collect --device`,
篩以下幾樣就直接見到答案:

- `runningboardd` —— 邊個 process 幾時攞到/失去 `RBSAssertion`(即係
  幾時由 running 變 suspended、幾時 resume)。**呢條直接分到假說 A/B。**
- `mediaserverd` / `AVAudioSession` —— 幾時 deactivate、有冇 interruption。
- 我哋自己個 app bundle id 嘅 `console.warn`(watchdog 嗰幾句)。

**這是唯一一條可以回溯今日 15:04:42 嗰次事件嘅路**,其餘全部都要等下次重現。
我呢邊冇辦法自己做 —— 要部機喺手、要解鎖。

(iOS Simulator 呢邊試唔到:simulator 唔會照 device 嗰套背景 suspend 政策去
收回背景執行權,而家部 iPhone 17 sim booted 但根本冇裝住個 app。)

---

## 七、⚠️ 而家個診斷鏈係壞嘅 —— 下次撞到一樣飛盲

呢個係我覺得最緊要即刻講嘅一項:

1. **Sonnet5 啱啱 commit 咗 `9d1b577`(17:03:47)加咗 `logDiag()` beacon
   + backend `routes/clientLog.js`。方向啱,但兩頭都未接通:**
2. **backend 而家 404。** 現正跑緊嗰個 process 係 15:39:02 用 sha `8d2ed4a` 起嘅,
   嗰陣 `routes/clientLog.js` 仲未存在。我實測過:
   `POST http://127.0.0.1:3001/api/client-log` → **404**。
   backend log 由頭到尾**零條 `[client-log]`**。
3. **App 側最新只推到 15:45 嗰個 OTA(sha `8d2ed4a`),`9d1b577` 完全未出街。**
   而且 EAS Update 係下次 launch 先 apply —— Eric 部 App 由 15:00 一路開住播到
   而家,好大機會連 15:45 嗰個 OTA 都未 load 到。
4. **即係話:如果今晚再撞到,我哋一條 client 端 log 都收唔到。**

另外,就算接通咗,`9d1b577` 個 beacon 對上面兩個假說仲係分唔到,因為
**佢淨係喺 recovery path 真係行咗嗰陣先 fire**。假說 A 之下(process 凍結)
根本冇一條 recovery path 會行 → 零 beacon → 同「乜都冇發生」一模一樣。
差嘅係 §5 講嗰個 **wall-clock drift 數字**同一個 **`stateChange` 記錄**。

---

## 八、建議(全部交 Dispatch/Eric 決定,我冇落手)

排序:診斷 > 止血 > 修根因。

### D1(必做,最平)—— 補齊診斷,唔好再飛盲
- 喺個 1 秒 poll loop 加 wall-clock drift 探測:`drift = Date.now() - lastTickTs`,
  超過 5 秒就記低(本地 ring buffer),下次有機會就 beacon 出去。
  **一個數字就分到假說 A / B。**
- beacon 加 `Event.PlaybackState` 嘅 state 轉換記錄(而家完全冇記低 player
  最後停喺邊個 state —— 呢個係 §4.3 覆蓋矩陣缺口嘅直接證據)。
- 部署順序要夾:**backend restart(令 `/api/client-log` 唔再 404)→ OTA →
  同 Eric 講明要完全 quit App 再開兩次**,OTA 先真係 apply。
- ⚠️ 呢步涉及 restart + OTA,**唔可以喺 Eric 聽緊嗰陣做**。

### D2(低風險止血,建議做)—— 聽返 `PlaybackPlayWhenReadyChanged`
`Event.PlaybackPlayWhenReadyChanged` 而家一個地方都冇聽(§4.4)。加一個 listener:
如果 `playWhenReady` 變 false 但**唔係用戶自己撳暫停**(我哋自己有個 intent flag
可以對),就即刻 `play()` 返 + beacon 記低。

點解值得做:呢個係**唯一一個喺「聲停之前 / 啱啱停嗰刻」就收到嘅訊號**,
而嗰一刻 process 仲未俾 suspend,JS 仲行得郁。同 `1dde53d` 個
`RemoteDuck` listener 係同一路數(belt-and-suspenders),風險同樣低。

### D3(低風險,建議做)—— 補 watchdog 覆蓋矩陣嘅洞
- `Playing` 分支拆走 `pos > 0` 呢個條件(改成「有 track 而且 playWhenReady=true」
  就算 position 一路 0 都要計),先至 cover 到「轉歌之後卡喺 0:00」。
- 加 `Loading` 落 buffering watchdog 同一條分支(RNTP 嘅 `loading` 同
  `buffering` 係兩個唔同 state,而轉歌一定經 `loading`)。
- ⚠️ **要講清楚:呢兩項喺假說 A 之下係救唔到嘅**(JS 已經凍結)。
  佢哋只係封假說 B 同「聲未完全停、仲有幾秒窗口」嗰啲情況。
  **唔好當呢個係根治。**

### D4(要諗清楚,先唔好做)—— P1 飛返 0:00
最乾淨嘅修法要掂 SwiftAudioEx 個 `reload(startFromCurrentTime:)`(§4.5),
即係再多一個 Podfile post_install patch。但 P1 嘅**觸發鏈仲未實錘**
(403 → failed → retry → reload),建議等 D1 收到 `PlaybackError` beacon
確認咗先做。JS 側有一個更平嘅代替品:自己記住 position,見到同一首歌
position 由 >30s 跳返 0 就 seek 返去 —— 但呢個係補鑊唔係修根因,而且會同
repeat-one 打交,要諗清楚。

### D5(唔關今次事,但順手揪到)—— 「最愛」得 7 首?
`users.db` 入面 user id=21(Hang / +85262305552)嘅 favorites **有 29 首**:
`1,3,4,5,6,7,27,28,31,32,33,35,36,38,39,40,42,43,44,45,47,49,52,1528,1538,1886,2890,2892,1539`

但今日觀察到嘅播放,**三輪都係 `1,3,4,5,6,7,27` 播完就跳返 id=1**,
由頭到尾**冇掂過第 8 首(id=28)之後任何一首**。即係部機上面實際入到 queue
嗰個清單,好可能得個伺服器版本嘅**頭 7 首**(睇落似同步截斷),
而 repeat-all 令佢一直 loop 呢 7 首。

**呢個要 Eric 一句話確認:你部機「最愛」入面見到幾多首?** 如果見到 29 首
但播嚟播去得嗰 7 首,就係一個獨立嘅同步 bug。

---

## 九、附:我核實過但無關 / 已排除嘅嘢

- **15:39:02 backend restart 同 15:45 OTA 都喺 Eric 測試緊嗰陣發生**
  (deploy.log 有紀錄)。但 P2(15:04-15:26)喺呢兩件事**之前**,所以
  P2 唔可能係佢哋造成。P1 三次入面,15:50 嗰次喺 restart 之後、16:27 同
  16:47 都係 —— 唔排除有關,但 15:50 嗰次距離 restart 已經 11 分鐘,
  而且 restart 之後嘅播放整體係順暢嘅,冇證據指向 restart。
  (⚠️ 但呢個又一次違反咗 `feedback-no-deploy-during-live-qa`,
  令分析要花額外功夫去切割。)
- **唔係另一部機/emulator 撈亂咗**:booted 嗰部 iPhone 17 simulator **冇裝住個 app**
  (`ps` 揾唔到任何 app process),cloudflared 亦確認流量係由 tunnel
  (`api.odemusics.com`)入嚟。
- **唔係 backend 死**:P2 期間 backend 健康,冇 502、冇 error、冇 hang 住嘅連線。
- **唔係 retry storm**:retry storm 嘅指紋係「15 秒 30 幾個 request」。
  P2 期間係**零 request** —— 呢兩樣係相反嘅指紋,唔可以混淆。
  (2026-08-12 嗰單係 storm;今次唔係。)
