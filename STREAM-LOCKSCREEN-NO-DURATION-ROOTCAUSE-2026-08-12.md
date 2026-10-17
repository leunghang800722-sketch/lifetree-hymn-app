# 鎖屏冇時間/進度bar 根因 — 2026-08-12

## 症狀
Eric 18:23 截圖:鎖屏 Now Playing widget 有歌名「奔跑不放棄」、歌手「讚美之泉」、
pause/skip 掣,但成條 scrubber(進度bar + elapsed/duration 時間)完全冇顯示,
得返兩邊虛線佔位符。

## 真憑證(唔係靠估)

1. `sqlite3 backend/hymns.db` 查到 id=44「奔跑不放棄」/讚美之泉,youtube_id=WC6bCBSgNtQ。
2. `curl -r 0-65535 http://localhost:3001/api/stream/44` 攞返 header
   `content-type: audio/mp4`,total `content-length: 6448554`。
3. 用 node 手動 parse 返回嘅 fMP4 box 樹,實測見到:
   - `moov` 入面有 `mvex`(即係 fragmented mp4,同
     [[project-stream-midtrack-silence-fix]] 講嘅結構一致)
   - `mvhd`/`tkhd`/`mdhd` 嘅 duration 欄位全部 = **0**
   —— 即係 backend `lib/fixFragmentedMp4Duration.js` 嗰個
   `zeroFragmentedMp4Durations()` 補丁已經即場生效咗喺呢首歌嘅串流上
   (今日較早 commit 14557ee 上嘅)。
4. 睇 `frontend/hymn-app/node_modules/react-native-track-player/ios/RNTrackPlayer/RNTrackPlayer.swift`
   —— 佢喺 init() 淨係 listen 呢幾個 event:
   `receiveChapterMetadata / receiveTimedMetadata / receiveCommonMetadata /
   stateChange / fail / currentItem / secondElapse / playWhenReadyChange`,
   **冇 listen `player.event.updateDuration`**。
5. 睇 `ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AudioPlayer.swift`:
   - `updateNowPlayingPlaybackValues()`(推 duration/elapsed/rate 上
     MPNowPlayingInfoCenter)淨係喺 `AVWrapper(didChangeState:)` 命中
     `.ready / .loading / .playing / .paused` 先會call(第387-393行),
     **`.buffering` 唔喺入面**。
   - `AVWrapper(didUpdateDuration:)`(第413-414行,AVPlayerItem duration
     KVO 真正resolve嗰陣觸發)**淨係 emit 個 event,冇call
     updateNowPlayingPlaybackValues()**——即係話就算 duration 之後解到,
     都冇路徑推翻返去 lock screen。
   - `AVPlayerWrapper.duration`(get埋 `asset.duration` / `item.duration` /
     `seekableTimeRanges`,全部 NaN 就 fallback `0.0`)。

## 根因鏈(三件事夾埋先中招)

1. **呢首歌嘅串流係 fragmented mp4**,而且**啱啱)套咗今日嘅 fMP4 duration
   雙計補丁**——mvhd/tkhd/mdhd 嘅 duration 欄位被特登清零(因為呢三個
   fMP4 標準下本身就唔應該讀,清零先啱)。
2. 清零咗之後,AVFoundation 攞唔到「上場即知」嘅 duration,一定要靠
   AVPlayerItem 事後(async)KVO 先resolve到真duration。喺 `.playing`
   呢個 state 轉變當刻(SwiftAudioEx 推一次 Now Playing duration)嗰陣,
   duration 好大機會仲係 unresolved → 推咗個 `0` 上去。
3. **RNTrackPlayer.swift 冇 listen `updateDuration` event**,之後真正
   resolve 到嘅 duration 永遠冇機會再推上 lock screen——除非中途再撞正
   一次 `.ready/.loading/.playing/.paused` 轉態(例如 rebuffer),先會
   夾啱時機順便帶埋啱嘅 duration。單純順利播完全程嘅track,就會由頭到
   尾冇 scrubber。

即係話:今日較早嗰單「fMP4 duration 雙計」修復本身冇錯(佢解決咗
「播到尾冇聲」嗰單更嚴重嘅bug),但佢令呢首(同所有 fragmented mp4)
歌變成一定要行 async duration resolve 嗰條路,先踢爆咗 RNTP 呢個原本
就一直存在、但之前少中招嘅缺口。同 [[project-stream-lockscreen-stop-rootcause-2026-08-12]]
(Buffering watchdog gap,今日16:27已修)係**獨立唔同機制**嘅bug,唔好
撈埋一齊。

## 修復

`frontend/hymn-app/node_modules/react-native-track-player/ios/RNTrackPlayer/RNTrackPlayer.swift`
加一個 `player.event.updateDuration` listener,duration resolve到就即刻
自己攞 `player.nowPlayingInfoController.set(keyValue: MediaItemProperty.duration(duration))`
補返上 lock screen(唔使等落一次 state 轉變)。已經用 patch-package
regenerate 咗 `frontend/hymn-app/patches/react-native-track-player+4.1.2.patch`
(揀 `--include '\.(swift|kt|java|m|h)$' --exclude '/build/'`,避免本地
node_modules 裡面已編譯嘅 build 產物污染個 patch)。

**呢個係 native Swift 層嘅改動,冇得用 OTA(JS bundle)推,一定要出新
一個 iOS build 先生效。**

## 未做/等拍板

- 未 commit(patches/ 檔已經改咗,working tree 有 diff)。
- 未 bump buildNumber / 未起 EAS build ——今日仲喺iOS Phase 2真機QA度,
  跟 [[feedback-no-deploy-during-live-qa]] 呢條規矩,呢類會產生新build
  嘅動作要等 Eric 話俾我知而家係咪好時機先做。
