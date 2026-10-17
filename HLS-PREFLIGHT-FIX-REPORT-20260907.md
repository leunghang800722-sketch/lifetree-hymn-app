# HLS 起播預檢 —— 修復報告 2026-09-07

修復對象:`HLS-PREFLIGHT-OPUS-20260907.md` 揪出嘅 #1/#2/#3/#4/#5/#6/#7 七條(#4 淨係「唔好照講數字」,#8 唔阻出街)。
基準:`f4bcb2d`(Opus 驗收 commit)。Fable 拍板嘅修法逐條落地,細節見下面「逐條修復」。

**執行者唔判 PASS/FAIL,以下純列證據。**

---

## 0. 逐條修復

### #1 + #4(backend 快失敗改做「唔重試」+ App 淨信明確 HTTP status)

**backend `routes/hls.js`**:`resolveStructureInner()` 撞 403/410 之前會 backoff 800ms → bustCache → 重新 yt-dlp resolve → 再試一次 head-fetch。而家改做:一見到 403/410 即刻 `bustCache(youtubeId)`(令下次 resolve 攞新 URL)+ 即刻回 404,唔喺呢個 request 入面再等/再重新 resolve。`backoffMsFor()`/`HLS_RETRY_BACKOFF_MS` 已刪(死 code)。3 秒檔頭 timeout 保留(`HEAD_FETCH_TIMEOUT_MS` 一個字冇改)。真正嘅重試留俾兩條已經存在嘅路:(a) client 側 hlsPreflight 熱換去 progressive,(b) progressive 本身喺 `routes/stream.js` 嘅 403 重試邏輯(呢個 session 一個字冇改)。

**App `src/hlsPreflight.js`**:新增 `isExplicitHttpFailure(pre)` 純函式,俾 `App.js` 兩個 call site(§1.2/§1.3)共用——淨係 `pre.status` 係明確 4xx/5xx 先算「值得降級」;`timeout`/`network`/`not-m3u8` 一律唔郁,維持今日行為(冇實質證據就唔降級,同 `handleStuckTrackEnd` 嘅 HLS 分支 R4 紅線一致)。`timeoutMs` 預設 5000 → **9000**。

### #2(RN abort 語義)

`preflightHls()` 唔再靠 `e.name === 'AbortError'` / message 含 `abort` 分辨 timeout(React Native `XMLHttpRequest.abort()` 唔會 dispatch abort event,`whatwg-fetch` 最後由 `onerror` reject `TypeError('Network request failed')`,呢個形狀真機一律錯判做 `network`)。改用 timer callback 自己 set 嘅 `didTimeout` flag,唔理 error 形狀。

### #3(假 nativeSkipAttributed)

§1.2 熱換前(`TrackPlayer.load()`/fallback 之前)補返其餘三條同款分支(file:// 分支 / PlaybackError-HLS 分支 / `handleStuckTrackEnd` 分支)都有嘅三行,逐字抄:

```js
if (NATIVE_WD_V2) {
  transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
}
```

⚠️ **一個修正**:呢三行落地之後,`nextTrackMs` 個 `origin` 唔係報 `start`,而係報 **`jsRecover`**(同其餘三條既有分支完全一致行為——`nextTrackMs` 嘅 `origin` 欄位直接讀 `transitionT0Ref.current.origin`,呢個 marker 本身就係寫 `'jsRecover'`)。iOS sim 實測(見 §2)證實:呢個修法令 `nativeSkipAttributed` 由「會出一條假嘅」變「零條」——呢個先係 #3 想解決嘅核心後果(避免呢個熱換被 `PlaybackActiveTrackChanged` 誤判做 native skip);`nextTrackMs.origin=jsRecover` 係「JS 主動發起嘅熱換」呢個已有分類嘅正常、預期值,唔係 `auto`(#3 原文正正指出未修之前會變成嘅誤導值)。

### #5(`hlsDowngradedTrackRef` set 時機)

§1.2 同 §1.3 兩個 call site 都改喺熱換**成功之後**(`load()` 成功,或者 `load()` 拋錯但 fallback `remove+add+skip` 成功)先 `hlsDowngradedTrackRef.current = id`。如果成條路(`load()` + fallback)都拋錯,唔 set——留返 `PlaybackError`/`handleStuckTrackEnd` 兩條現有 HLS 降級分支兜底,唔會閂死佢哋。

### #6(用戶暫停唔夾硬 play）

§1.2 熱換之後、`TrackPlayer.play()` 之前加一個檢查:`if (expectPlayingRef.current === false) return;`。`expectPlayingRef` 係全隊「用戶主動暫停」嘅權威信號(`cmd_pause()` 同步 set false)。用戶喺預檢窗口(0–9秒)自己撳咗暫停 → URL 照換(熱換唔跳過),但唔夾硬 `play()`。

### #7(§1.3 近尾唔換 guard)

§1.3(自動接播路徑,換 `idx+1`)加返同 `onPrefetchComplete` 熱換(App.js ~668)一致嘅「近尾唔換」guard:淨係換緊 `idx+1`(即係 native 就快 auto-advance 過去嗰首)先要驗,尾 15 秒內就唔換,避開 remove+add 中間窗口撞正 native auto-advance race。

---

## 1. Harness(全部重跑 + 新 case)

| Harness | 結果 |
|---|---|
| H-A `frontend/hymn-app/tools/hls-preflight-harness/harness-a.js` | **14 pass / 0 fail**(9 條原有 +5 條新:預設 timeoutMs=9000、RN abort TypeError 判 timeout、冷 resolve 6.2s 後 200 唔降級） |
| H-B `frontend/hymn-app/tools/hls-preflight-harness/harness-b.js` | **26 pass / 0 fail**(7 條原有 +19 條新:#1 timeout/network 唔降級、明確 404 正控、403 喺 0.5s 照降級、#3 transitionT0Ref=jsRecover marker、#5 load+fallback 都失敗唔 set 支旗、#6 用戶已暫停唔夾硬 play） |
| H-C `ops/perf/harness/hlspreflight/hc-backend-harness.mjs` | **19 pass / 0 fail**(改咗 (a):403 唔再重試,總耗時 ≤1s、mock googlevideo 淨打中 1 次、bustCache 真係 call 咗;新增 (a2) 403→404 三次耗時全部 ≤1s） |
| H-D `frontend/hymn-app/tools/hls-preflight-harness/harness-d-ios-realhttp.js` | **5 pass / 0 fail**(冇改,用預設 timeoutMs 9000 一樣過) |

**合計:64 pass / 0 fail。**

H-A 抽取自證:harness-b.js 對由 App.js 原文抽取嗰個 §1.2 block 加咗三條字串自證(`isExplicitHttpFailure(pre)`、`origin: 'jsRecover'`、`expectPlayingRef.current === false`),確保呢三個修復真係落咗喺原文入面,唔係得個「文檔話已改」。

---

## 2. 紅線覆核

```
git diff -- frontend/hymn-app/App.js | grep '^[+-]' | grep -v '^[+-][+-]' \
  | grep -vE '^\s*[+-]\s*//' | grep -iE 'watchdog|nudge|rescue|hlsStartupKick|handleMidStreamStall|handleBufferingStuck|handleStuckTrackEnd|threshold|GIVEUP|CAP_TICKS'
```
→ **零命中**(呢次改動入面加咗嘅 `if (NATIVE_WD_V2) {...}` marker 行,故意冇放入呢個 grep pattern——`NATIVE_WD_V2` 係已有 feature-detect flag,呢三行本身係逐字抄現有三條分支,唔係新邏輯)。

- `Platform.OS === 'android'`:App.js diff 零命中。
- `toTrack()`/`playQueue()`:diff 冇任何 `function`/`const` 簽名行改動。
- `backend/routes/stream.js`:呢個 session 一個字冇改(`git diff --stat` 空)。
- `hlsDeviceIds` / `app-version.json`:唔喺呢次改動嘅檔案入面。
- `frontend/hymn-app/ios/` `frontend/hymn-app/android/`:`git status --short` 空,零 diff。
- `ops/stream/stream-status.sh`:呢個 session 冇掂(佢喺呢次改動之前已經有 403 率行,屬於之前一個 session 嘅改動)。

---

## 3. iOS Simulator 驗證(一次,Release build + 隔離 backend 副本)

**方法**(照 Opus 報告 §8 做法):
- 隔離 backend 副本:`backend/` APFS clone(`cp -R -c`,近乎即時),port 3999,`app-version.json` 副本 `hlsDeviceIds: []`(全量開 HLS)。副本 `routes/hls.js` 加咗兩個 **env-gated、SIM-VERIFY-ONLY** 標記嘅 mock(逐段 comment 標注,prod `backend/routes/hls.js` 冇呢段):`HLS_FORCE_403_YT=<id列表>` 令指定 hymnId 嘅 `.m3u8` head-fetch 唔使真係打 googlevideo 就模擬 403(但**照樣 call 真身 `resolveAudioUrl()`**,即真 yt-dlp resolve 耗時計落總時間入面,先 `bustCache`+回 404,行嘅係真身 #1/#4 邏輯);`HLS_FORCE_SLOW_YT_MS=<id>:<ms>` 令指定 hymnId 嘅整條 request 前面加一個延遲,模擬「冷 resolve 幾秒先 200」。**prod backend、prod `app-version.json`、repo working tree 一個字冇改**(`git status --short` 已核實)。
- App 側:`frontend/hymn-app` APFS clone,只改 clone 入面嘅 `src/config.js`(`API_BASE`→`http://localhost:3999`、`DIAG_ENABLED`→true)——**呢個 session 已經做嘅三個修復檔(`App.js`/`hlsPreflight.js`/`routes/hls.js`)喺呢個 clone 入面同 repo working tree 完全一致**(clone 喺三個修復做完之後先起,唔係另一份分岔代碼)。因為呢個 sandbox 冇 attended session 可以撳掣操作模擬器 UI,喺 clone 嘅 `AppContent()` 加咗一個 **SIM-VERIFY-ONLY** 自動播放 effect(逐段 comment 標注,只喺 clone 入面):App 開機、歌庫 load 完之後 t+2s 自動播 id=1(隔離backend強制403),t+24s(接住)自動播 id=4(隔離backend模擬6.5s冷resolve)。呢個 effect 唔存在於 repo working tree 嘅 `App.js`。
- 用 `expo export:embed --platform ios --dev false` 出返個 JS bundle(Metro 6-7 秒搞掂),覆蓋一個已有嘅 Release-iphonesimulator native build(`Odely.app`,原生代碼一個字冇改——呢次改動 100% 係 JS,唔需要重新編譯原生層)嘅 `main.jsbundle`,`simctl install` 落 `iPhone 17` 模擬器(`E0416618`)。`Expo.plist` 嘅 `EXUpdatesCheckOnLaunch` 改 `NEVER`(clone 入面,防止背景 OTA check 干擾)。
- 觀測:隔離 backend 副本 stdout(`[client-log]`/`[hls]`/`[stream]` 逐行)+ `xcrun simctl spawn log stream` 收 device console(`console.log` 經 Hermes `nativeLoggingHook` 出 os_log)。

### (a) 403 情境:id=1(隔離backend強制403)

```
02:04:25.807  stateChange from=none to=buffering        ← HLS 起播
02:04:29.018  hlsPreflight ok=0 status=404 ms=3212 reason=status:404 ctx=start
02:04:29.019  hlsFallback via=preflight ctx=start reason=status:404 status=404 ms=3212
02:04:29.025  stateChange from=buffering to=loading      ← TrackPlayer.load() 熱換
02:04:29.073  trackChanged idx=0                          ← 仲係 idx=0,同一首歌
02:04:29.073  stateChange from=loading to=buffering
02:04:38.095  stateChange to=playing position=0 duration=290.9   ← 真出聲,同一首歌(id=1「恩典太美麗」)
02:04:38.095  nextTrackMs ms=9050 origin=jsRecover source=stream
```

- ✅ **唔跳歌**:全程 `idx=0`,`hymnId=1` 未變過,最終播嘅係同一首歌(`duration=290.9`,即「恩典太美麗」)。
- ✅ **零 `nativeSkipAttributed`**:成個 session log(python 逐行 count)`nativeSkipAttributed` 出現次數 = **0**。
- ⚠️ `nextTrackMs origin=jsRecover`(**唔係** `start`)——見上面 §0 #3 段解釋:呢個係 #3 修復落地之後嘅預期值,同其餘三條既有熱換分支一致行為,唔係 regression。核心指標(零假 skip)已達到。

### (b) 冷預檢情境:id=4(隔離backend模擬 6.5s 冷 resolve 先 200)

```
[hls][SIM-VERIFY-ONLY] id=4 模擬冷 resolve,延遲 6500ms   ← 兩次(JS preflight + AVPlayer 各自一個請求)
02:04:56.973  hlsPreflight ok=1 status=200 ms=7040 reason=ok ctx=start
02:04:56.992  nextTrackMs ms=7144 origin=start source=stream surface=other first=1
```

- ✅ **唔降級**:`hlsPreflight` beacon `ok=1`(唔係 0),全程搵唔到任何 `hlsFallback` 事件帶 `hymnId=4`。
- ✅ `nextTrackMs origin=start` 保持(因為冇觸發降級分支,`transitionT0Ref` 由頭到尾都係起播時嗰個原裝 `{origin:'start'}` 物件,冇被改寫過)——呢個同 (a) 情境嘅 `origin=jsRecover` 形成清晰對照,證明 origin 欄位嘅行為完全跟返「有冇熱換過」呢個事實,冇被錯誤污染。
- 6.5s 延遲 + 真 head-fetch/resolve 耗時,總共 7.04s,喺新 `timeoutMs=9000` 之內完成,唔會撞閘。

### 403→404 耗時三次(隔離backend副本,真 `resolveAudioUrl` 真 yt-dlp resolve)

| 次數 | 總耗時 | resolve 耗時 | 備註 |
|---|---|---|---|
| 1 | 12ms | 0ms | 上一次播放已暖過 cache(warm resolve) |
| 2 | 3040ms | 3039ms | `bustCache` 之後,真 yt-dlp 冷 resolve |
| 3 | 3266ms | 3265ms | 同上,再 bust 一次 |

`ms ≈ resolveMs`(總耗時幾乎全部係真 resolve 成本,`backend` 自己加嘅額外開銷 <2ms)——證實 #1/#4 「403→404 唔再等 backoff/重新 head-fetch」呢個目標達到:唯一嘅耗時來源係(冷路徑先有嘅)yt-dlp resolve 本身,唔係 backend 自創嘅重試延遲。

### 收工

`xcrun simctl terminate/uninstall` App、`pkill` log stream、殺咗隔離 backend 副本 process、`xcrun simctl shutdown`、刪咗 `/tmp/claude-ios-cleanup.hold`。收工後核實:`booted:0 idb:0 sim:0 devtools:0`,`lsof -i :3999` 空,`git status --short` 淨係得三個修復檔(`backend/routes/hls.js`/`frontend/hymn-app/App.js`/`frontend/hymn-app/src/hlsPreflight.js`)。冇 commit/部署/OTA/restart/eas/launchctl 喺 prod。

---

## 4. 做唔到 / 未覆蓋

1. **冇喺帶 tunnel RTT 嘅條件下驗證。** 同 Opus 報告一樣,全部數字都係本機 loopback,絕對值同 Eric 部機唔可比。
2. **iOS sim 用嘅係「自動播放 hook」代替真手指撳掣。** 呢個 sandbox 冇 attended session 可以做 UI tap/swipe,自動播放 effect 淨係存在喺 APFS clone(SIM-VERIFY-ONLY 標記,唔存在於 repo working tree),行為上同「用戶撳一首歌」等價(都係 call `playSingle()`→`playQueue()`),但冇經過真手指觸控嗰層。
3. **背景/鎖屏之下嘅預檢降級冇測。** 同 Opus 報告一樣未覆蓋。
4. **`TrackPlayer.load()` 拋錯嗰條 fallback 冇喺真機驗過**(#5 描述嘅失敗模式),淨係喺 H-B harness 層面驗過次序同支旗行為。

---

## 5. 交付

Commit(pathspec,逐個列喺 commit message):
1. App:`frontend/hymn-app/src/hlsPreflight.js` + `frontend/hymn-app/App.js`
2. backend:`backend/routes/hls.js`
3. harness + 報告:`frontend/hymn-app/tools/hls-preflight-harness/` + `ops/perf/harness/hlspreflight/` + `HLS-PREFLIGHT-FIX-REPORT-20260907.md`

**唔部署、唔 OTA、唔 restart backend、唔改 prod `app-version.json`。**
