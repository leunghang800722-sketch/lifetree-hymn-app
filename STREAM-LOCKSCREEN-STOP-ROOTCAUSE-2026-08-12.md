# 鎖屏播放中途完全停止(Now Playing widget 消失)—— 根因調查 2026-08-12

## 事發時序(Eric 三張截圖)

- 15:08 HKT — 播緊「深深愛你」(讚美之泉),進度 0:05,鎖屏 widget 正常
- 15:12 HKT — 播緊「永恆的讚美」(ACM),鎖屏 widget 正常
- 15:56 HKT — 鎖屏**完全冇 Now Playing widget**(唔係停頓/凍結,係成個消失)

版本:Eric 裝緊嘅係 TestFlight **build 3**(EAS 確認 `gitCommitHash = c7697756…`,
即係 `fix(ios): AVPlayer stalling-minimization retry storm` 嗰個 commit,喺
2026-08-12 11:16 起build、11:20 completed——build 4 遲到 15:59 先開始起,喺
Eric 呢單報告之後,可以排除)。

## 確認咗嘅事實

### 1. Build 3 已經包含 SwiftAudioEx 嘅 retry-storm patch

EAS build metadata 逐行核實 build 3 嘅 `gitCommitHash` 同
`fix(ios): AVPlayer stalling-minimization retry storm behind 30s VPN-slow playback`
(commit `c769775`)完全對得上。本機 `ios/Pods/SwiftAudioEx/.../AVPlayerWrapper.swift`
亦確認咗 patch 已落地(`_automaticallyWaitsToMinimizeStalling` 快取 + `setupAVPlayer()`
重新 apply)。**即係話:呢個之前診斷嘅 native 修復,Eric 而家部機上面係有嘅**——
下面觀察到嘅現象唔可以再歸咎「呢個 fix 未上線」。

### 2. Backend stream log 顯示:15:56:29–15:56:54 有典型「retry storm」訊號,之後完全靜晒

`/private/tmp/hymn_backend.log`(仍然係現正運行緊嗰個 backend process 嘅 live log,
process 由 15:14 開始跑到而家):

- 15:56:29–15:56:40(id=7916「野地的花」):11 秒內 12 個請求,大約每 750-950ms 一個
- 15:56:39–15:56:54(id=6649「神的光中」):**15.2 秒內 37 個請求**,大部分間距
  200-500ms,response 喺 0-2ms(記憶體 buffer 命中)同 ~500-1400ms(真正打去
  googlevideo)之間反覆彈——即係同 2026-08-12 較早 fix 嗰單「AVPlayer
  automaticallyWaitsToMinimizeStalling 令單次慢 response 變成幾十個 buffering
  循環」*完全同一種訊號*
- 15:56:54.790 之後:**backend 完全冇再收到呢部機任何 `/api/stream/*` request**,
  一路到而家(16:12,已經 16 分鐘)。冇 502、冇 error、backend 本身健康
  (啱啱 curl 咗 `/api/hymns` 返 200)——即係話**唔係伺服器炒咗**,係部機自己
  唔再打嘢過嚟。

### 3. 呢個時段,backend 正正喺度部署緊全新、未經呢類真機 QA 驗證過嘅 stream 代碼

四個 commit 全部喺 Eric 呢次真機測試*進行緊嗰陣*落地(佢 15:08 已經播緊歌):

| 時間 | commit | 內容 |
|---|---|---|
| 15:02 | `2735d4c` | warm-buffer fast path 開始應付 iOS 嘅 Range request(之前淨係 Android 用) |
| 15:06 | `d6578f8` | 修 Content-Range 要報成個 response 嘅完整邏輯長度 |
| 15:09 | `aa89e80` | prebuffer 256KB → 1.5MB |
| 15:14 | `5aeee4a` | prebuffer 1.5MB → 4MB,**backend process 重啟**(`ps aux` 確認
  `server.js` 由 15:14 開始跑) |

即係話:Eric 一路開住個 app 度測緊,backend 邊度嘅 stream serving 邏輯(`routes/stream.js`
嗰截 `buffered` fast-path,同 `resolveAudio.js` 嘅 `warmBuffer()`)喺背景不斷改緊,
仲夾埋一次全 process 重啟。呢段代碼(`IOS-NEXT-TRACK-PRELOAD-PLAN.md` 方向3)係
**今日先第一次寫、第一次上真機**,之前完全冇經過呢類長時間鎖屏播放嘅驗證。

## 根因判斷

**最大機會嘅解釋**:今日新落地嘅 warm-buffer Range fast-path(`routes/stream.js`
191-255 行)喺某啲情況(例如 buffer 未夠、`wantsBeyondBuffer` 判斷同 AVFoundation
實際攞嘅 range 唔夾)令 AVFoundation 對個 response 唔信任,跌返入去 Eric 之前
已經撞過嘅「反覆 buffering 循環」——即使 native 層嘅 `automaticallyWaitsToMinimizeStalling`
patch 已經生效,呢個新後端行為都可以由**另一條路**觸發返同一種症狀(唔係
`automaticallyWaitsToMinimizeStalling` 本身失效,係新代碼引發咗一個外表一樣嘅
stall pattern)。

**點解個 widget 會成個消失(唔係停頓咁簡單)**:iOS 嘅 `UIBackgroundModes: audio`
背景執行權,前提係 app 要*真係喺度出緊聲*。一首歌卡喺「不斷 buffering、從來冇真正
播到嘢」嘅狀態,對 iOS 嚟講唔算「播緊歌」——維持唔到落去嘅背景權,一段時間後
iOS 會回收個 background session。個 session 一冇咗,`MPNowPlayingInfoCenter`
嘅資料會俾系統清埋,鎖屏 widget 就會**成個唔見**(唔係 paused 圖示、唔係凍結畫面)
——同 Eric 描述完全脗合,亦同之前已經修好嗰單「widget 留喺度但冇聲」係唔同機制。

## 順手查到嘅代碼缺口(獨立、必修)

`App.js` 入面兩個負責由「卡死」自動復原嘅 watchdog——`handleStuckTrackEnd`
(928行)、`handleMidStreamStall`(963行),由 989-1047 行嘅 poll effect 驅動——
**淨係喺 native state 聲稱 `Playing`(1015 行:`claimsActive = trackStateRef.current
=== TPState.Playing`)先會觸發**。

但「retry storm」呢種卡法,native state 老實報緊 `Buffering`(唔係假扮
`Playing`)。即係話:如果真係撞返呢個 retry storm,**現有兩個 watchdog 一個都唔會
出手**——冇 nudge、冇 skip、冇 pause,乜都唔做,一直卡到 iOS 自己收返個背景權為止。
呢個係一個獨立於「乜嘢觸發咗 storm」嘅缺口,而家審code就搵到,唔使等重現。

## 建議

1. **即刻**:唔好再喺 Eric 真機測試緊嗰陣改/重啟 stream 相關 backend 代碼——
   今日呢單就正正喺呢個窗口撞到,令根因好難百分百切割「native retry storm
   殘留」定係「今日新代碼嘅 bug」。
2. **補窿(唔難,建議做)**:poll watchdog 加返 `Buffering` 分支——「聲稱
   Buffering + position N 秒完全冇郁」都應該當 stall 處理(nudge/skip),
   唔淨係 `Playing` 先算。噉樣即使 retry storm 嘅根因未完全剷清,都唔會
   再出現「一直卡到 iOS 殺咗個 session」呢種最壞結局。
3. **想真正鎖定係咪今日嗰四個 commit 嘅 bug**:要嘛(a)暫時擋走
   `buffered` fast-path(revert 落返「淨係 resolve URL」嗰個舊行為)做
   對照組真機測試,或者(b)攞 Eric 部機接 Xcode Console 睇返嗰刻真實
   `AVAudioSession`/`mediaserverd` log——我呢邊冇辦法睇到手機端嘅 OS log,
   淨係做到 backend request pattern 呢層證據。
