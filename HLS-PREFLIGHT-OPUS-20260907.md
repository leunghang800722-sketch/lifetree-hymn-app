# HLS 起播預檢 —— Opus 獨立驗收 2026-09-07

驗收對象:`fab61b7`(App)、`00c9fc9`(backend)、`ef20395`(harness/報告),base `a10fcef`。
執行單 `HLS-PREFLIGHT-EXEC-20260907.md`(**§6 修訂 A 並行版**為最終設計)。
執行者報告 `HLS-PREFLIGHT-REPORT-20260907.md`。

---

## 0. 結論

🔴 **要修先,唔可以照 OTA。**

三件事分開講:

| 面向 | 結論 |
|---|---|
| **Eric 最擔心嗰條(正常起播會唔會慢咗)** | ✅ **暖歌零影響**。iOS 交錯 A/B 各 12 次,中位 **after 171ms vs before 164ms**(Δ+7ms,遠細過 run 間離散度)。並行設計成立,預檢喺 `play()` 之後先 fire。 |
| **403 情境(呢張單嘅初衷)** | ✅ **真係唔跳歌**。after:預檢 3,597ms 攞到 404 → 熱換 progressive → 4,044ms 出聲,同一首歌播到 1:06。before 對照組:幻影 Playing(duration=0)→ 22 秒後 native watchdog 跳咗去第二首。 |
| **但係** | 🔴 **冷歌會被誤殺**。5 秒預檢限額**低過正常冷 resolve 嘅耗時**。本機 loopback(零 tunnel)實測 15 次冷預檢有 **4 次撞 5 秒 abort**,其中 **3 次係完全健康嘅歌**(backend 之後照回 200)。Eric 部機仲要加 tunnel RTT,只會更差。呢個直接違反 `HLS-EXEC-STARTUP-GRACE-20260902` R4「起播期唔准降級去 progressive」嗰條已拍板紅線。 |

修好下面 #1/#2/#3 三條,呢個 feature 就可以出街;#4 淨係「唔好照抄個數字俾 Eric」;#5-#8 建議一併執。

---

## 1. 問題清單(8 條)

### 🔴 #1 5 秒預檢限額低過冷 resolve 正常耗時 → 健康歌被誤降級

**證據(iOS Simulator + 隔離 backend,loopback,零 tunnel):**

冷歌 `hlsPreflight` 耗時分佈(全部健康歌,無 403):

```
ok  : 3703 3971 3983 4057 4188 4227 4411 4417 4626 4729 4993  ms
abort: 5009 5014 5020 5022                                     ms   ← 全部 ms≈timeoutMs
```

四次 abort 之中:

| hymnId | 預檢結果 | backend `[hls]` 實際結果 | 判斷 |
|---|---|---|---|
| 1849 | abort @5009ms → **降級** | `result=ok ms=5896` | ❌ 誤降級 |
| 4109 | abort @5014ms → **降級** | `result=ok ms=5838` | ❌ 誤降級 |
| 7097 | abort @5022ms → **降級** | `result=ok ms=6031` | ❌ 誤降級 |
| 4803 | abort @5020ms → **降級** | `404-headfetch-failed(status=403) ms=12428` | ✅ 真 403 |

即係**降級觸發嘅精確度 1/4 = 25%**。另外兩次 `ctx=start` 冷預檢 `ms=4729` / `ms=4993` —— 分別淨係差 271ms / **7ms** 就撞閘,而嗰兩首歌都係健康嘅(其中 id=1 喺 5,015ms 正常出咗聲)。

**點解要緊:** 誤降級唔係「白做」,係**主動掟走一個就快成功嘅 HLS item,由 0 重新行 progressive**。memory `project-ios-vs-android-startup-threshold` 記低咗 progressive 起播喺 Eric 條線要 ~10.6 秒(AVFoundation 要成個檔)。即係「冷歌起播 ~6 秒」有機會變成「5 秒 + progressive 全程」,**正正就係 Eric 問嗰條「會唔會慢咗」,而且係喺最痛嗰個 case(冷歌 = HLS 唯一用得着嘅場景,見 memory `project-hls-window-source-local-trap`)**。

**同已拍板紅線衝突:** `App.js:1903` `handleStuckTrackEnd` 嘅 HLS 分支明文寫住「起播期(position<1)嘅 giveup **唔准**降級去 progressive,因為 progressive 本身正正係沉緊嗰隻船」,只出 `hlsFallbackSuppressed`。新預檢喺 `reason=timeout/network` 嗰陣做嘅,同 watchdog giveup 一樣**冇任何硬證據**,但佢照降。

**建議修法(兩件一齊做):**
1. **只喺攞到明確 HTTP status(4xx/5xx)先降級**;`timeout`/`network` 一律唔郁(= 維持今日行為,唔會變差)。
2. `timeoutMs` 由 5000 升到 **9000**,等 backend 403 快失敗嗰 4–6 秒(甚至 12 秒個別 case)有機會喺 abort 之前送到明確 404。9 秒降級距 native 16 秒死線仲有 7 秒,同 §6 點3 原意一致。

### 🔴 #2 React Native 上面 abort 被錯報做 `reason=network`

實測 5/5 次 abort(`ms` 5009–5022,即完全就係 5000ms 限額)嘅 beacon 全部係:

```
event="hlsPreflight" detail="ok=0 status=- ms=5009 reason=network ctx=next"
event="hlsFallback"  detail="via=preflight ctx=next reason=network status=- ms=5009"
```

**根因:** `src/hlsPreflight.js` 靠 `e.name === 'AbortError'` / message 含 `abort` 分辨 timeout。呢個係 Node/undici 語義。React Native 嘅 `XMLHttpRequest.abort()`(`node_modules/react-native/Libraries/Network/XMLHttpRequest.js`)**唔會 dispatch `abort` event**,所以 `whatwg-fetch` 個 `xhr.onabort`(唯一會 reject `DOMException('Aborted','AbortError')` 嗰條路)行唔到,最後由 `onerror` reject `TypeError: Network request failed` —— name 唔係 AbortError、message 冇 `abort`,直接跌落 `network`。

H-A 之所以「9 pass」,係因為佢喺 **Node** 度跑真身 module,undici 真係俾 AbortError。**呢個係「harness 通過但真機錯」嘅典型盲點**。

**後果:** `reason` 呢個欄由今日起講大話 —— 之後任何「只信明確 status」嘅收窄(即 #1 建議 1)都做唔到,亦分唔開「backend 慢」同「真係斷網」。

**建議修法:** 唔好靠 error 形狀,喺 timer callback 度 set 一支 `didTimeout = true`,catch 入面直接讀佢。

### 🔴 #3 §1.2 熱換前冇 mark `transitionT0Ref = jsRecover` → 每次預檢降級都製造一條假 `nativeSkipAttributed`

403 情境實測(after build)嘅完整時間軸:

```
01:12:52.051  stateChange from=none to=buffering        ← HLS 起播
01:12:55.649  hlsFallback via=preflight ctx=start reason=status:404 ms=3597
01:12:55.654  stateChange from=buffering to=loading     ← TrackPlayer.load() 熱換
01:12:55.726  nativeSkipAttributed hymnId=1 errorSkipCount=1 detail="idx=0"   ← ❌ 假嘢
01:12:59.776  stateChange to=playing position=0 duration=290.9
01:12:59.777  nextTrackMs ms=4044 origin=auto source=stream                   ← ❌ origin 應該係 start
```

現有兩條同款熱換分支(`App.js:1310` file:// / `App.js:1353` PlaybackError-HLS)同 `App.js:1935` `handleStuckTrackEnd`,**全部三條**喺 `load()` / `remove+add+skip` 之前都有:

```js
if (NATIVE_WD_V2) {
  transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
}
```

註釋寫得好白:「呢個熱換可能會令 active index 睇落好似『轉咗』,標記做 JS 自己發起,避免 PlaybackActiveTrackChanged 誤判做 native skip 加多一次計數」。新嘅 §1.2 分支**冇抄呢三行**(§1.3 remove+add 亦冇,不過佢郁嘅唔係 current,實測冇 fire)。已驗證 RNTP 4.1.2 `load()` 真係會出 `PlaybackActiveTrackChanged`(`RNTrackPlayer.swift:404 player.load(item:)` → `:895 emit(PlaybackActiveTrackChanged)`)。

**後果比睇落嚴重:** `nativeSkipAttributed` **就係全隊用嚟判斷「有冇跳歌」嗰支溫度計**(memory 多篇引用)。出街之後每一次預檢降級都會加一條假嘅,令呢個修復睇落好似**製造咗**跳歌;`errorSkipCount` 亦會 +1(雖然真出聲之後會 reset 返 0,所以彈 Alert 嘅風險有限);`nextTrackMs` 個 `origin` 由 `start` 變 `auto`,起播分佈直接漏數。

**建議修法:** 補返嗰三行。

### 🟠 #4 Backend 快失敗喺生產條件下接近 no-op;「14s → 817ms」唔可以照講俾 Eric 聽

用**隔離 backend 副本 + mock googlevideo 403 + 真 `resolveAudioUrl`(真 yt-dlp)**量:

| | 第一次撞 403 | 30 秒內第二次 |
|---|---|---|
| before(`a10fcef`) | 3.81 / 4.09 / 5.95 s | 5.02 / 4.92 s |
| after(`00c9fc9`) | 3.93 / 4.40 / 5.76 s | — |

**兩邊等同。** 因為主要成本係 `bustCache()` 之後嗰次 **fresh yt-dlp re-resolve(~3–5s)**,而執行單明文「唔改 resolve timeout」。800ms 固定 backoff 只喺「30 秒內第二次」慳返 1.2 秒。

更加要留意:iOS 實測期間有一次真 403(id=4803),新 code 之下 backend 用咗 **`ms=12428`** 先回 404 —— §2.1 個目標「≤4s(暖 resolve)/ ≤8s(冷 resolve)」**冇達到**。

H-C (a) 嗰個 **817ms 係 stub resolve 嘅產物**(harness 用 `resolve-audio-stub-loader.mjs` 換走真 resolver,回應係即時嘅),唔代表生產。

**判斷:** 呢部分冇害(退唔到後),但**呢張單嘅真正價值百分百嚟自 client 側預檢**,backend 快失敗基本上唔關事。報俾 Eric 嗰陣唔好用 817ms。

另外「快失敗令本來重試成功變失敗」呢條問題:**09-06 log 答唔到**。`result=ok` 嗰行根本冇印 `retried` 欄(只有 404 行有),所以 `retried=true && result=ok` 喺 log 上面**結構上數唔到**,唔係 0,係「量唔到」。可以講嘅係:(a) 重試本身一條都冇剷,(b) backoff 只係由 2000ms 縮到 800ms(第一次本來就係 800ms),(c) 我三次強制 403 實測,before/after 兩邊嘅重試都一樣救唔返。

### 🟠 #5 `hlsDowngradedTrackRef` 喺熱換**之前**就 set —— 熱換失敗會令呢首歌之後「唔准再降級」

`App.js:2996`(§1.2)同 `App.js:1188`(§1.3)都係先 `hlsDowngradedTrackRef.current = id`,之後先做 `load()` / `remove+add`。兩段外層都有一個食晒錯誤嘅 `catch (_) {}`。

如果熱換整條失敗(`load()` 拋錯 + fallback `remove/add/skip` 都拋錯),結果係:**隊列入面仲係嗰條 `.m3u8`,但支旗已經當佢降過級** → 之後 `PlaybackError` 嗰條 HLS 降級分支(`App.js:1341` 條件 `hlsDowngradedTrackRef.current !== curId`)同 `handleStuckTrackEnd` 嗰條(`:1911`)**兩條都會被閂死** → 直接跌返落 retry-once → skip,亦即係 D2 家族原病復發。

概率低(`load()` 好少拋錯),但失敗模式正正就係呢張單想醫嗰個。**建議:成功之後先 set。**

### 🟠 #6 熱換之後無條件 `play()`,冇睇用戶係咪喺預檢期間撳咗暫停

`App.js:3013-3014`:`expectPlayingRef.current = true; await TrackPlayer.play();`。

預檢窗口有 0–5 秒。用戶喺呢段時間撳暫停(position 仲係 0)嘅話,現有四個 guard 全部過得到(仍係 current、`transitionT0Ref` 未清、position<0.5),app 會**自己夾硬播返**。現有兩條熱換分支都有同樣寫法,但佢哋係由 `PlaybackError` 觸發(即係本來就冇聲),語義唔同 —— 呢度係「可能一直好地地、用戶主動叫停」。建議加一個 `trackStateRef`/`expectPlayingRef` 檢查。

### 🟡 #7 §1.3 用 `remove+add`,冇抄現有同位置 swap 嗰個「近尾唔換」guard

`onPrefetchComplete` 嗰個熱換(`App.js:658-690`)換 `idx+1` 之前明文擋住 native auto-advance race:

```js
if (idx === curIdx + 1) { ...if (prog.position > prog.duration - 15) return; }
```

§1.3 換嘅正正都係 `idx+1`,但冇呢個 guard;而且 `remove(nativeIdx)` 同 `add(freshTrack, nativeIdx)` 中間有一個窗口,如果啱啱好 native auto-advance,會跳去錯嘅一首。實際風險低(§1.3 喺轉歌嗰刻 fire,position 通常好細),但同一個 pattern 隔籬有 guard 呢度冇,係唔必要嘅分岔。實測 4 次 `ctx=next` 降級**零跳歌**,所以列 🟡。

### 🟡 #8 兩個細節(唔阻住出街)

- `hlsPreflight` beacon **唔受 `DIAG_ENABLED` 管**,每首歌起播 1 條 + 轉歌 1 條。實測量遠低過 `/api/client-log` 嘅 300/min 上限,冇問題;但要知呢係一條新嘅常開 beacon。
- `fetchHeadBytes` 嘅 catch path 都會 `recordUpstream403('hls', false)`,即係 network / timeout 失敗都入咗 `hlsTotal` 個分母 —— gauge 讀數會偏低少少,純觀測噪音。
- ✅ `resolveStructureShared` 嘅 in-flight Map **冇洩漏**:`.finally()` 喺 resolve 同 reject 兩條路都清,而且同一個 key 唔可能被覆蓋(第二個 caller 攞返 pending,唔會 set)。真機實測見到同一 request 兩條 `[hls]` log(`id=1 ms=4736` / `ms=4711`)但 head fetch 只做一次 —— §6 點 2 落地正確。

---

## 2. A/B 交錯對照表(核心)

**方法.** 兩個 Release build(before = `a10fcef` 源碼、after = `ef20395`),同一部 iPhone 17 模擬器(`E0416618`),`EXUpdatesCheckOnLaunch=NEVER`,每次 `terminate → uninstall → install → get_app_container` 核 `main.jsbundle` SHA-256(after `7336362e…`、before `4de14553…`,兩者只差 11,616 bytes,`hlsPreflight` 字串 after=有 / before=冇)。App 指去**隔離 backend 副本**(port 3999,`hlsDeviceIds: []` 全量開 HLS、precache/keep-warm 關咗、resolve cache 由 prod copy 過嚟),prod backend 同 prod `app-version.json` **一個字冇改**。交錯次序 A→B→A→B→A→B(每 block 重裝一次),每 block 4 次起播,固定用詩歌庫第 1 行(id=1)同第 4 行(id=4),兩首都預先暖過 → 每次都係 `origin=start source=stream`。

| 變體 | n | 中位數 | 全部樣本(ms) |
|---|---|---|---|
| **after**(`ef20395`) | 12 | **171 ms** | 151 153 164 165 167 167 175 195 198 208 242 247 |
| **before**(`a10fcef`) | 12 | **164 ms** | 156 156 160 161 162 163 165 168 182 190 191 217 |

Δ 中位 = **+7 ms(+4%)**。after 嘅 run 間離散度 96ms(151→247)、before 61ms(156→217),**差異完全喺噪音之內**,兩組範圍互相包住。

同期 `ctx=start` 預檢自己嘅耗時(暖歌):76 80 80 80 83 83 84 85 87 90 91 94 ms,中位 **84ms** —— 佢喺 `add/skip/play` 之後先 fire,所以呢 84ms 完全唔入起播路徑。H-B 嗰個「同步呼叫耗時 <5ms」嘅結構性證據,同呢度真機數對得上。

**負控:** 24 次暖歌起播,`ctx=start` 預檢 **24/24 `ok=1`,零 swap、零 `hlsFallback`、零 `nativeSkipAttributed`**。

**Android(AVD `hymntest`,vc55 原裝 APK + patch `assets/index.android.bundle`,debug keystore 重簽,`pm clear` 清 updates 狀態):**

| 變體 | `hlsPreflight` beacon | `nextTrackMs`(暖,ms) | 中位 |
|---|---|---|---|
| after | **0** | 1048 1059 1062 1142 | 1060.5 |
| before | **0** | 1030 1055 1059 1065 1076 | 1059 |

正控:同一日 iOS 出咗 20+ 條 `hlsPreflight`,Android 全 prod log 掃過 **0 條**。Android 零行為改變 ✅。
(Android 呢兩個 build 指住 prod backend —— release APK 冇 `usesCleartextTraffic`,連唔到本機 http 隔離副本;deviceId `fa6292bb…`=after / `e66d0f75…`=before,方便日後篩走呢批測試 beacon。)

---

## 3. 403 情境結果

隔離 backend 副本對指定 youtube_id 嘅 googlevideo 檔頭 fetch mock 成 403(`HLS_FORCE_403_YT`,只改副本,prod 零改動),行到完整重試鏈(bust + 真 yt-dlp re-resolve)。

| | after(`ef20395`) | before(`a10fcef`,對照) |
|---|---|---|
| 起播 → 偵測 | `hlsPreflight ok=0 status=404 ms=3597` | 冇預檢 |
| 反應 | `hlsFallback via=preflight ctx=start reason=status:404` → `TrackPlayer.load(progressive)` | 幻影 `to=playing` **duration=0 position=0**,`nextTrackMs ms=4236` 係假數 |
| 出唔出聲 | ✅ **4,044ms 真出聲**(duration=290.9,截圖 t+75s 播到 1:06/4:50,仲係 id=1 恩典太美麗) | ❌ 兩輪幻影 Playing 之後 |
| 跳唔跳歌 | ✅ **唔跳** | ❌ **22 秒後 `nativeSkipAttributed hymnId=6927 idx=1`,跳咗去下一首** |
| 副作用 | ⚠️ 熱換後 77ms 出咗一條**假** `nativeSkipAttributed`(見 #3) | — |

**自動接播(ctx=next)撞失敗:** A/B 期間共 4 次 `ctx=next` 降級(1 次真 403 id=4803、3 次誤判),全部**熱換成功、零跳歌、零 `nativeSkipAttributed`**。§1.3 條路本身行為正確。

**一句總結:** 403 情境嘅目標達到咗 —— 由「跳歌」變成「4 秒起播、同一首歌」;但實現方式順手製造咗一條假跳歌 beacon,同埋喺冷歌上面會誤觸發。

---

## 4. Harness 重跑(全部重現)

| Harness | 結果 |
|---|---|
| H-A `frontend/hymn-app/tools/hls-preflight-harness/harness-a.js` | **9 pass / 0 fail** |
| H-B `…/harness-b.js` | **14 pass / 0 fail**(含由 `App.js` 原文抽取 §1.2 block 嘅自證) |
| H-C `ops/perf/harness/hlspreflight/hc-backend-harness.mjs` | **17 pass / 0 fail**(403×2→404 817ms、hang→3003ms timeout、200 路徑 byte 一致、並發 de-dup 打中 1 次) |
| H-D `…/harness-d-ios-realhttp.js` | **5 pass / 0 fail** |

⚠️ H-A 全過但**冇捉到 #2**(RN abort 語義),H-C 個 817ms **唔代表生產**(#4)—— 兩個都係「跑喺 Node 就啱、跑喺真機/真 resolve 就唔啱」嘅盲點,值得記入方法論。

**紅線獨立覆核(我自己 grep,唔靠執行者):**

```
git diff a10fcef..ef20395 -- frontend/hymn-app/App.js | grep '^[+-]' | grep -v '^[+-][+-]' \
  | grep -vE '^\s*[+-]\s*//' | grep -iE 'watchdog|nudge|rescue|hlsStartupKick|handleMidStreamStall|handleBufferingStuck|handleStuckTrackEnd|threshold|GIVEUP|CAP_TICKS|NATIVE_WD'
```
→ 只命中兩行**行尾註釋**,零程式碼改動。`android` 零命中。`plugins/` `ios/` `android/` 零 diff。`stream.js` diff 淨係 import + `let lastBadStatus` + 兩處記帳 call,backoff/bust/重試/timing 一行冇改。`toTrack()`/`playQueue()` 簽名冇變,`hlsDeviceIds`/`app-version.json` 冇掂。✅

**backend 正常路徑量度(隔離副本,真 googlevideo,25 首暖 resolve):** 25/25 `result=ok`,`ms` 251–1202(中位 ~847)。3 秒 head-fetch timeout 有 ≥2.5 倍 headroom,**0/25 貼近**。冷 resolve 總耗時 3.74–5.24s,但嗰段主要係 yt-dlp,唔受 3 秒 timeout 管 → **3 秒 timeout 唔會誤殺正常慢網**,呢條 ✅。(順帶:呢個 3.7–5.2s 冷 m3u8 分佈,就係 #1 嘅成因。)

---

## 5. 建議嘅修復清單(最細集合)

1. `src/hlsPreflight.js`:用 timer 設嘅 `didTimeout` flag 判 timeout,唔好靠 error 形狀(#2)。
2. `App.js` §1.2/§1.3:只喺 `pre.status` 係明確 4xx/5xx 先降級;`timeout`/`network` 唔郁(#1)。
3. `timeoutMs` 5000 → 9000(#1)。
4. §1.2 熱換前補 `transitionT0Ref = { origin:'jsRecover' }`(#3)。
5. `hlsDowngradedTrackRef` 改喺熱換成功之後先 set(#5)。
6. (可選)§1.2 `play()` 之前檢查用戶有冇主動暫停(#6);§1.3 補「近尾唔換」guard(#7)。

修完之後應該補一個 harness case:**mock 一個「5 秒都唔答但最後 200」嘅 backend,斷言唔會降級**(呢個 case 而家冇人守)。

---

## 6. 出街之後嘅檢查(修完再 OTA)

**紅線次序(memory `project-hls-d-fixes-verified`):`backend restart` 一定要排喺 OTA 之前**,否則 app 送 `.m3u8` 落舊 `stream.js` 會出 400。

**Restart smoke(backend,5 項):**
1. `curl -s $API/api/health` → 200。
2. `curl -s $API/api/app-version | jq .hlsEnabled` → 同 restart 前一樣(**唔准趁機改 `hlsDeviceIds`**)。
3. 三首暖歌 `curl -o /dev/null -w '%{http_code} %{time_total}' $API/api/stream/<id>.m3u8` → 全 200,`time_total` < 2s;`grep '^\[hls\]'` 見到 `ms=` 新欄。
4. 一首歌 `curl -r 0-100000 $API/api/stream/<id>` → 206(progressive 後備路冇壞)。
5. `ops/stream/stream-status.sh` → exit code 同以前一樣,新增 `hls403Rate`/`stream403Rate` 有數出。

**OTA 之後,Eric 真機最少一項檢查(建議兩項):**

- **必做 ——「第一首冷歌」:** 開 App,喺詩歌庫撳一首**平時未聽過**嘅歌(唔好用首頁推薦,嗰啲已經預載),記低幾多秒出聲。**同今日感覺比較,唔可以變慢**。呢條就係 #1 嘅實地驗證。
- **建議 ——「403 窗口」:** 下次再撞到「撳落去冇聲」,睇下係咪變成「等 4–5 秒然後正常播返**同一首歌**」(而唔係自己跳咗去第二首)。

**出街後我哋要睇嘅 log(24 小時):**
```
grep hlsPreflight  backend/logs/client-log/*.jsonl | grep 'ok=0'      # 降級率 + reason 分佈
grep hlsFallback   backend/logs/client-log/*.jsonl | grep via=preflight
grep nativeSkipAttributed backend/logs/client-log/*.jsonl             # ⚠️ 未修 #3 之前呢個數會被污染
grep '^\[hls\]' /tmp/hymn_backend.log | grep -c 403                    # 403 率
```
`ok=0` 入面 `reason=status:*` 對 `reason=timeout/network` 嘅比例,就係 #1 嘅實地精確度。

---

## 7. 做唔到 / 未覆蓋

1. **冇喺帶 tunnel RTT 嘅條件下重跑 A/B。** 全部 iOS 數字都係 loopback(隔離 backend 喺同一部機)。所以 171ms/164ms 呢兩個絕對值同 Eric 部機嘅 ~5,000ms 完全唔可比 —— 有意義嘅係**兩者之差**。同樣,#1 嘅誤判率(loopback 已經 27%)喺真機**只會更高**,我冇量到高幾多。
2. **`retried=true && result=ok` 數唔到。** `[hls]` 個 `result=ok` log 行冇印 `retried` 欄,結構上冇得由 09-06 log 反查。已喺 #4 交代,冇砌數。
3. **Android 用咗 prod backend。** Release APK 冇 `usesCleartextTraffic`,連唔到本機 http 隔離副本。後果:(a) prod client-log 多咗兩個測試 deviceId 嘅 beacon(`fa6292bb…` / `e66d0f75…`,約 60 條,遠低過節流上限);(b) 嗰部 AVD 喺 prod `hlsDeviceIds` 白名單以外,所以 `HLS_ENABLED=false` —— 不過呢個正正就係 Android 嘅生產配置,而且 `toTrack()` 喺 Android 永遠唔會出 `.m3u8`,結構上兩重閘,`0 條 hlsPreflight` 呢個結論企得住。
4. **冇測背景 / 鎖屏之下嘅預檢降級。** 全部 iOS run 都係前台。`appState !== 'active'` 嗰陣熱換會唔會撞到 native 背景熔斷,未驗。
5. **冇量誤降級之後嗰首歌實際慢咗幾多。** 四次誤降級全部發生喺 `ctx=next`(下一首),唔會出現喺 `origin=start` 嘅 `nextTrackMs` 分佈,而嗰幾首之後又多數命中本地檔。#1 講嘅「冷歌起播可能變慢」係由 progressive 起播嘅已知數推論,唔係呢次直接量到。
6. **冇試 `TrackPlayer.load()` 拋錯嗰條 fallback 喺真機嘅行為**(#5 描述嘅失敗模式),只喺 harness 層面驗過次序。

---

## 8. 環境入帳

- Scratchpad:`/private/tmp/claude-501/…/scratchpad/hlspreflight-opus/`(隔離 backend 副本、兩個 `.app`、兩個 patched APK、`ab-marks.txt`、`backend-iso.log`、`backend-403.log`、截圖)。
- 隔離 backend 副本:`backend/` 嘅 APFS clone,port 3999,`ISO_TEST=1`(precache / keep-warm / daily-warm 全關)、`app-version.json` 副本 `hlsDeviceIds: []`、`routes/hls.js` 副本加咗一個 `HLS_FORCE_403_YT` mock。**prod backend、prod `app-version.json`、repo working tree 一個字冇改**(`git status --short frontend/hymn-app backend/routes backend/lib` 全程空)。
- 兩個 iOS build 由 `frontend/hymn-app` 嘅 APFS clone 出,只改 clone 入面嘅 `src/config.js`(`API_BASE` → `http://localhost:3999`、`DIAG_ENABLED` → true)同 before clone 嘅 `App.js`/`hlsPreflight.js`(`git show a10fcef:` 還原)。
- 收工:模擬器 `uninstall` + `shutdown`,`idb_companion` 殺咗,AVD 用原裝 vc55 APK(SHA-256 `ba87d8f8…`,bundle SHA `84178630…`)`install -r -d` 蓋返 + `pm clear` + `emu kill`。最終 `booted:0 idb:0 sim:0 devtools:0 qemu:0`,`adb devices` 空,prod backend 仍然行緊。`/tmp/claude-ios-cleanup.hold` 全程在,**收工要記得刪**。
- 冇 commit、冇部署、冇 OTA、冇 eas、冇 restart、冇 launchctl。
