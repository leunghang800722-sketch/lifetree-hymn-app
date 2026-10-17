# HLS-EXEC-STARTUP-KICK-20260902 — 先重現「HLS 起播 rate 卡 0」機制,再驗「kick」修

**派工**:Sonnet 5 執行 → Opus 5 獨立驗收 → Fable 5.1 判斷 + commit + OTA
**上游**:`HLS-EXEC-STARTUP-GRACE-20260902.md` §8(aefcd58 出街即 native 斬、已 rollback);Eric 已授權自主推進
**狀態**:✅ 出街(04:2x UTC)。R0 機制重現 9/9(avRate=0、playWhenReady=true、loadedSec 長大、native 10s+6s 斬);R1 慢網 5/5、R2 快網 3/3 靠 kick 開聲零 native skip;R3 progressive 零 kick;R4 暫停後零 kick。Opus5 驗收 GO + 加 `expectPlayingRef` gate(擋撳暫停後一 tick 競態)。真機睇 hlsStartupKick n 值、nativeStall skipped/breakerTripped 應為 0
**範圍**:本機 iOS 模擬器 + 慢網 proxy 重現 → 驗證修法。正式改動只有 `frontend/hymn-app/App.js`(純 JS,OTA)。**唔准 commit、唔准 OTA/push、唔准 restart backend、唔准掂 live `backend/public/app-version.json`。** 模擬器用嘅 TEMP 改動(JS 三處 + `src/config.js` + Pods 兩個 Swift 檔)收工必須全部 revert。

---

## §0 機制假說(Fable 5.1 由 SwiftAudioEx 源碼 + 真機 log 推出,呢張單第一件事係證實/推翻佢)

真機 hid=28 @02:20:01Z:HLS playlist 一出,native 即報 `state=playing`;之後 17 秒 `pos=0.0`、`loadedSec=99.8`、`likelyKeepUp=1`、`itemNil=0`,冇任何 `stallNotification`;native watchdog 10s detect + 5s reload → skip。歷史上每一次 HLS 起播(sim 10/10、真機 5/5)都係 JS `midStallNudge`(seekTo(pos+0.3) + play())之後先開聲,零個「冇 nudge 自己開聲」樣本。

源碼鏈(`ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift`):

1. `setupPlayer({ waitForBuffer: false })` → `avPlayer.automaticallyWaitsToMinimizeStalling = false`(:476)。
2. `play()` → `playWhenReady = true` → `applyAVPlayerRate()` → `avPlayer.rate = 1`(:489)。HLS 嘅 asset(幾百 byte playlist)即刻 ready,所以 rate=1 落喺**零 media data** 嗰刻 → `timeControlStatus=.playing` → state=.playing(JS 見到「Playing 早報」)。
3. 冇 data → AVPlayer 喺 automaticallyWaits=false 之下 stall → rate 跌返 0 → `timeControlStatus=.paused`。
4. `player(didChangeTimeControlStatus: .paused)`(:498-512):`playWhenReady` 仍係 true → 入 `if (self.currentTime > 0 && self.currentTime < self.duration)` —— **currentTime==0,條件唔成立,乜都唔做**:state 唔改(停喺 .playing)、playWhenReady 唔改(仍 true)、rate 冇人再 set 返 1。
5. 之後 segment 一段段落(loadedSec 長到 100 秒、likelyKeepUp=1),但 **`avPlayer.rate` 一直係 0,冇人再叫 play()**。JS nudge 嘅 `play()` → `playWhenReady = true`(值冇變但 Swift `didSet` 照行)→ `applyAVPlayerRate()` → rate=1 → 開聲。native watchdog 嘅 T0 nudge 都係 `playWhenReady = true`,但佢 gate 咗 `playerState != .playing`,state 卡喺 .playing 所以永遠唔 fire。

**如果假說啱**:修法係「起播期每隔 2 秒 `setPlayWhenReady(true)`」(App.js 已有 `swNudgePlay()`,唔經 `play()` 所以唔驚動 native breaker),唔使 seek,唔使改 native,純 OTA。
**如果假說錯**(例如 rate 一直係 1 而 timeControlStatus=.playing 但 position 唔郁):停手,將 §3 R0 嘅 raw 交返,唔准自己改方向。

## §1 環境 + TEMP 改動(全部打 `TEMP-EXEC-KICK-20260902` 標記,收工 `git diff --stat -- frontend/` 只准淨低 App.js 正式改動)

**Gate(照 CONFIRM 單 §1)**:`xcrun simctl list devices booted | grep -c Booted`=0、`pgrep -x xcodebuild | wc -l`=0、`pgrep -x idb_companion | wc -l`=0、`uptime` 1-min load <3.0 先開波;每 run 前再記。用 **iPhone 17(E0416618-B662-41D2-A253-5260FA0CF556)**,Release build(`xcodebuild -workspace Odely.xcworkspace -scheme Odely -configuration Release -sdk iphonesimulator ARCHS=arm64 EXCLUDED_ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES`),Debug 撞 Hermes segfault。backend pid 開跑收工一致;唔准起第二個 `node server.js`。

**慢網 proxy**(已寫好、已用 curl 驗過通):`scratchpad/throttle-proxy.mjs`(Fable 5.1 scratchpad:`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/11f1d458-e0c1-4ca0-8843-87ef0adf42ee/scratchpad/`,複製一份去你自己 scratchpad 用)。
```
node throttle-proxy.mjs 9099 190 500     # 127.0.0.1:9099 → https://api.odemusics.com,ttfb +190ms,~500KB/s(對應 Eric 真機 segment ttfb 185–590ms / 段 0.3–1.2s)
node throttle-proxy.mjs 9098 0 100000    # 「快網」對照
```
用 `nohup … &` 兼 `disown`,開跑前 `curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}\n' http://127.0.0.1:9099/api/stream/4423.m3u8` 貼證(要 200)。proxy log 每條 request 一行,係「backend 見到乜」嘅本機替身,唔使再靠 `/tmp/hymn_backend.log` 同 Eric 部機分。

**TEMP JS**(App.js / src/config.js):
- T1 `src/config.js` `API_BASE = 'http://127.0.0.1:9099'`(對照 run 用 9098)。⚠️ iOS ATS:如果 app 打唔通 http 本機,喺 raw 寫低錯誤原文,用 `ios/Odely/Info.plist` 加 `NSAllowsLocalNetworking`(TEMP,收工 revert)。
- T2 `HLS_ENABLED = true` + boot effect(App.js ~4073)提早 return(唔俾 live app-version 覆寫)。
- T3 本地檔命中判斷加 force-stream 旁路(`toTrack` 入面 `getLocalAudioUri` 一律當 null)。
- T4 **`TEMP_NO_JS_NUDGE`**:`handleMidStreamStall` 頭一句 `if (TEMP_NO_JS_NUDGE) return;`(R0 用;其他 run 設 false)。

**TEMP native 儀器**(Pods 唔入 git,`pod install` 會由 plugin 重新 patch 一次,所以**改完 Pods 之後唔准再跑 pod install**):
- `AVPlayerWrapper.swift` 加 `var swDebugAV: String { "avRate=\(avPlayer.rate) tcs=\(avPlayer.timeControlStatus.rawValue) reason=\(avPlayer.reasonForWaitingToPlay?.rawValue ?? "-") pwr=\(playWhenReady)" }`。
- `AudioPlayer.swift` `SWStallWatchdog.beacon()` 個 `detail` 尾加 `\((p.wrapper as? AVPlayerWrapper)?.swDebugAV ?? "")`,並且**新加一條每 2s tick 都出嘅 NSLog**(唔上傳 beacon,純 `NSLog("[sw-watchdog] tick %@", detail)`)——`check()` 入面 `updateS1Sample(p)` 之後即刻。
- 讀法(device-scoped,唔會撞 Eric 部機):`xcrun simctl spawn E0416618-… log stream --style compact --predicate 'eventMessage CONTAINS "[sw-watchdog]"' > scratchpad/swlog-<run>.txt &`。**正控**:每個 run 開跑前貼一條 `tick` 行證明 stream 活住。

**正式改動(V2 kick)**,只喺 `Platform.OS==='ios'` && active URL `.m3u8` && `pos < 1` && `trackStateRef.current === TPState.Playing` 先生效:
- K1 poll loop:上述條件成立而且 `posFrozenThisTick`,由第 2 個凍 tick 起每隔 2 tick 叫一次 `swNudgePlay()`(即 `TrackPlayer.setPlayWhenReady(true)`),每 track 上限 8 次;出 `logDiag('hlsStartupKick', { hymnId, position, detail: \`n=${k} frozenTicks=${t} buffered=${bufferedNow}\` }, { always: true })`。position ≥1 或換歌就歸零(track-change effect 加 reset)。
- K2 起播期(同一條件)JS 嘅 stalled watchdog(seek-nudge → giveup → handleStuckTrackEnd)**唔准行**:`midStallTicksRef`/`stuckEndTicksRef` 歸零。native 16s 係最後防線,JS 唔再喺起播期 giveup。
- K3 保留 GRACE 單 R4:`handleStuckTrackEnd` hlsFallback 分支要 `Number.isFinite(position) && position >= 1` 先准降級,起播期出 `hlsFallbackSuppressed`(呢個 bufferingStuck 45s giveup 嗰條路仲會行到)。
- 唔做 GRACE 單嘅 R1/R2/R3(已被真機推翻)。active URL 攞法照 GRACE 單:只喺 `iOS && posFrozenThisTick && pos<1` 先 `await getActiveTrack()`。
- 非起播期(progressive iOS、HLS pos≥1、Android)逐 tick 零改動。

## §2 證據規則(承前兩張單)

1. 唔准寫 PASS/FAIL/達標;判詞欄留空;空欄=未做。
2. 每個儀器(swlog stream、proxy log、client-log deviceId 篩)每 run 貼一條「活住」證明先准報零命中。
3. 統計 client-log 用 `json.loads` 逐行 + 篩你部模擬器嘅 deviceId(開 app 後由 client-log 搵,貼出嚟);唔准 grep pattern。
4. harness(K1–K3 gate)照 `exec-b123-fix-raw.md` slice 真 code + cmp;舊 code(HEAD)正控先行。
5. 做唔到照直寫「未做+原因」。

## §3 模擬器 run(每 run:terminate app、`rm -rf <container>/Library/Caches/audio-cache`、記環境欄、UI 撳歌、等 40 秒)

歌單(預先登記,唔准換):**795、2737、3576、3062、8363**(全部 itag=140 有 sidx;開跑前 `curl` proxy 嘅 `.m3u8` 逐首 200 貼證)。

| run | 設定 | 歌 | 想答嘅問題 |
|---|---|---|---|
| **R0 重現 hid=28** | 慢網 9099、`TEMP_NO_JS_NUDGE=true`、**未加 V2**(HEAD 嘅 App.js + T1–T4) | 795、2737、3576 | 假說 §0 步驟 3–5:tick 行係咪 `state=playing avRate=0 tcs=paused(=0) pwr=true pos=0` 而 loadedSec 一路長大;native 10s detect/16s skip 有冇嚟 |
| **R0b 手動 kick 正控** | R0 同設定,喺 pos=0 卡住第 6 秒用 **UI 撳一下 pause 再撳 play**(即 `play()`) | 795 | 假說步驟 5:rate 由 0 變 1、pos 開始郁 |
| **R1 V2 慢網** | 9099、`TEMP_NO_JS_NUDGE=false`、V2 已加 | 5 首各 1 次 | 每首:第一個 kick ts、pos>0.5 ts、kick 總數、native skipped 有冇、JS giveup/hlsFallback 有冇 |
| **R2 V2 快網** | 9098、其餘同 R1 | 795、2737、3576 | 快網之下 kick 幾多次先開聲(sim 歷史 3–4s 起播係咪都係靠 kick) |
| **R3 progressive 回歸** | 9099、`HLS_ENABLED=false`、V2 已加 | 795、2737 | `hlsStartupKick` 必須 0(貼空 grep + 同 run 內 R1 有 kick 做正控);nativeStall 行為照舊記錄 |
| **R4 暫停唔准 kick** | 9099、V2、撳歌後 1 秒內撳 pause,等 30 秒 | 795 | `hlsStartupKick`=0、冇 skip、pos 停喺撳 pause 嗰刻 |

每 run 證據欄:歌 id | tap ts | load/booted/xcodebuild | swlog tick 行 t+2/4/6/8/10/12/16(原文,含 avRate/tcs/pwr/pos/loadedSec)| proxy log 頭 3 條 + 段落數 | client-log 該 deviceId 該 hid 40s 內全部 event 原文(空就貼指令) | pos>0.5 首見 ts | native skipped ts | 判詞(留空)。

## §4 收工

1. TEMP 全 revert:JS 四處、config.js、Info.plist(如改)、Pods 兩檔(`git diff --stat -- frontend/` 只見 App.js;Pods 用 `cd ios && pod install` 令 plugin 重 patch,貼 `grep -c swDebugAV` = 0 證明)。
2. proxy 全部 kill(`pgrep -f throttle-proxy`=0)、模擬器 shutdown、四項殘留全 0、backend pid 一致、live flag curl(帶/唔帶 `?d=`)同開跑一樣。
3. raw 寫 `scratchpad/exec-startup-kick-raw.md`:§0 假說裁決所需嘅 R0/R0b 原文、§3 全部 run 證據表、harness 輸出、清場證據、未做清單。**唔准有 PASS/FAIL。**

## §5 紅線

唔准 commit/OTA/push/EAS build;唔准 restart backend;唔准掂 live app-version.json / hlsEnabled / hlsDeviceIds;唔准掂 Android、`audioPrefetch.js`、`/api/stream/:id` route、四個 WARM 常數、native watchdog 正式源碼(plugins/*.js);唔准起第二個 node server;唔准掂 Cloudflare/DNS/cert/token;唔准用 AskUserQuestion;Pods 嘅 TEMP 儀器唔准以任何形式入 git。
