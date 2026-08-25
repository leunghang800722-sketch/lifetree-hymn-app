# STREAM-403 + FGS-CRASH 規劃(2026-07-29,Fable 5 規劃層出稿)

> 兩單嘢一齊排隊:①YouTube 間歇性 403 令新歌載入十幾秒/卡死;②App 閒置切走再打開彈
> "God Music keeps stopping"。本文件係規劃,**唔係實作**;交 Sonnet 5 執行,Opus 5 驗收。
> 執行前先睇 §5「需要 Eric 拍板嘅位」——問題一嘅根治方案有一項一定要 Eric 決定先郁得。

---

## 0. TL;DR

| | 根因判斷 | 建議做法 | 改邊度 | 出貨方式 |
|---|---|---|---|---|
| ①403 | **部 backend Mac 成部機行緊 NordVPN**,YouTube 對 datacenter/VPN IP 間歇性節流;VPN 換 server 仲會令成個 URL cache 即場作廢 | 診斷實證 → 止血(backoff+cache 上限修正)→ 根治(出口 IP,等 Eric 拍板) | 只係 backend | backend 重啟即生效,唔使出 app |
| ②crash | RNTP 4.1.2 `MusicService` 有一個**冇 try/catch 嘅 `startForeground`**,背景重啟服務時撞 Android 12+ 限制即 crash | patch-package 堵上游 bug(catch + 唔再 STICKY) | app native 層 | **要出新 APK,OTA 推唔到** |

建議次序:**②先做**(細、獨立、可即驗,而且要行 APK build 流程,lead time 長啲),
①嘅診斷同止血跟住做(純 backend,隨時上)。①嘅根治卡喺 Eric 拍板,唔阻前面。

---

## 1. 問題一:YouTube 間歇性 403

### 1.1 已知事實(Opus 5 喺 c6951b6 嘅實測,唔使重新驗證)

- 主流失敗係 googlevideo CDN 間歇性 403:URL 未過期、幾分鐘後同一條 URL 又會通,
  係上游當時唔畀,唔係死鏈。
- c6951b6 已上線:fetch 失敗(任何非 200/206 或連線拋錯)→ log + bust + 重 resolve +
  再試一次。有用但唔夠:**即刻重試多數撞返同一個節流窗口**(prod log 7 次失敗入面
  5 次重試都係 403)。
- `warmColdBacklog` 喺 prod 恆常唔行:開機 disk cache 已 312 條、cache.size 324,
  永遠 ≥ `CACHE_SIZE_CEILING=300`,直接 return,實際暖 0 首。
- 冷 resolve 本身 2.5–6s(yt-dlp 佔大頭),ExoPlayer 每次嘗試 8s timeout;
  app 端已有「同一首歌 retry 一次」機制(App.js PlaybackError handler)。

### 1.2 本 session 新診斷發現(2026-07-29 實測,規劃層做咗讀-only 檢查)

1. **backend Mac 全程行緊 NordVPN**:`ps` 見到 NordVPN.app + helper + Shield system
   extension 由 7 月 17 日起一直跑緊;default route 行 `utun4`(gateway 10.5.0.2)。
2. **出口 IP = 185.219.141.201**,RDAP 查證係 **Packethub S.A.**(NordVPN 一系商用
   VPN 基建嘅 ASN)。即係喺 YouTube 眼中,我哋所有 resolve + 串流請求都嚟自一個
   出晒名嘅 VPN datacenter IP——呢類 IP 俾 googlevideo 間歇性 403/節流係社群公認
   現象,同「間歇性、過陣又好返」嘅病徵完全吻合。
3. **googlevideo URL 係綁 IP 嘅**:resolve-cache.json 全部 338 條 URL 個 `ip=` 參數
   清一色係 185.219.141.201。推論:**NordVPN 一換 server / 重連,出口 IP 一轉,
   成個 cache 338 條 URL 即場全部變 403**,要逐條撞先逐條 bust+重 resolve——
   呢個係「403 爆發式出現」嘅一個好具體嘅候選機制,Phase 0 要證實。
4. `backend/cookies.txt` 有一個 **Google 帳號嘅 LOGIN_INFO cookie,而且 commit 咗
   落 git**(`git ls-files` 確認 tracked),但 `resolveAudio.js` 完全冇用佢
   (`yt-dlp` 冇 `--cookies` 參數)。即係:風險已經擺咗喺 repo 度,好處就一啲都
   未攞到。見 §1.5 同 §5。
5. 詩歌庫有 **1744 首**,cache 得 338 條——`CACHE_SIZE_CEILING=300` 呢個上限根本
   訂到細過現存 cache,亦遠細過個庫,warmColdBacklog 永冇機會做嘢。

### 1.3 三個候選方向嘅評估(Opus 5 提出嗰三個 + 排序)

**A. 出口 IP(首選,最大機會係根治)** — 診斷成本近零,唔使寫 code。
如果 NordVPN 可以熄(或者可以令 backend 嘅 YouTube 流量唔行 VPN),403 大概率
斷崖式下降,連 cache 大規模作廢嘅機制都一併消失。留意:
- NordVPN **macOS 版冇 split tunneling**(Windows/Android 先有),所以「淨係 backend
  唔行 VPN」喺呢部 Mac 上冇官方開關,選項只有:成部機熄 VPN / 得閒先開 /
  backend 搬去另一部唔行 VPN 嘅機或網絡。呢個係 Eric 嘅使用習慣問題,一定要佢拍板(§5)。
- 風險:近乎零。熄 VPN 唔會令情況變差(住宅 ISP IP 對 YouTube 嚟講乾淨得多)。

**B. 重試前加退避(backoff)+ cache 上限修正(止血,無論如何都值得做)** — 細改動、
低風險、backend 重啟即生效。淨係做 B 唔會根治(節流窗口可以長過任何合理 backoff),
但可以將「即刻重試 5/7 一樣衰」改善返一部分,而且係純賺。

**C. resolve 帶 cookies / PO token(繞節流)** — 放最後,只喺 A 做完仲唔夠先郁。
- **PO token 路線**(bgutil-ytdlp-pot-provider 一類 provider + yt-dlp plugin):唔使
  Google 帳號,冇帳號被封風險,係 yt-dlp 社群對呢類 403 嘅主流解法;但要多養一隻
  service(provider 係獨立 process),而且 YouTube 個機制成日變,維護成本唔低。
- **cookies 路線**:效果直接但風險最高——用邊個帳號,邊個帳號就有被 YouTube
  停權嘅實質風險(server-side 自動化串流係 YouTube 明文唔畀嘅用法)。
  **絕對唔可以用 Eric 私人帳號**;如果行呢條路,只可以用可棄嘅專用帳號。
- **ToS/法律灰色地帶(要同 Eric 講清楚)**:成個「backend 代理 YouTube 音源」架構
  本身已經係 YouTube ToS 唔容許嘅用法(繞過廣告、非官方 client 存取);帶 cookies
  / PO token 唔會令法律風險質變,但係「主動偽裝正常用戶繞過技術措施」多咗一步,
  灰色程度加深。呢啲係商業/法律取態問題,唔係技術問題,Claude 只負責擺事實,
  Eric 決定(§5)。

### 1.4 執行步驟(交 Sonnet 5)

**Phase 0 — 診斷實證(半日內,先行,唔使等拍板)**
1. 喺 stream.js 失敗 log 加一項:失敗嗰刻嘅出口 IP(可以 cache 住每 5 分鐘查一次
   `api.ipify.org`,唔好每個 request 查)。目的:證實/推翻「VPN 換 IP → cache 爆發式
   403」呢個機制——對返 log 裏面 403 burst 同 IP 轉變嘅時間戳。
2. 寫個一次性 soak script(放 `backend/tools/`):抽 50 首冷歌,resolve + 1-byte
   preVerify + 完整 fetch 頭 1MB,記錄逐首成敗同耗時。**VPN 開 vs 熄各行一次**
   (熄 VPN 嗰次要同 Eric 夾時間,因為影響成部機),出對比數字。呢組數字直接決定
   Phase 2 值唔值得做。
3. 順手記低:NordVPN 而家連緊邊個 server、幾耐重連一次(NordVPN app 有 log)。

**Phase 1 — 止血(唔使等 Phase 0 結果,可以並行)**
1. `routes/stream.js`:retry 路徑(第一次 attemptFetch 失敗之後)加 **2 秒 backoff**
   先至 bust+重 resolve+再試。要點:
   - backoff 前先檢查 `controller.signal.aborted`,客戶端已走就唔好嘥氣;
   - 淨係加一層(唔好無限重試);總 retry 路徑控制喺 ~6s 內——就算超出 ExoPlayer
     8s 而客戶端 abort 咗,`resolveAudioUrl` 唔綁 controller,resolve 結果照落 cache,
     app 端嗰下 `TrackPlayer.retry()` 返嚟就食到 warm cache,呢個接力係而家架構
     本身嘅優點,唔好破壞(即係:client abort 之後唔好 short-circuit 個 resolve)。
   - **鐵律:唔准改 resolve strategy 次序/唔准喺 retry 時轉用另一個 player_client**
     ——format 一致性 invariant(resolveAudio.js 檔頭註釋,轉 client 可能轉 itag,
     中途換 format 會播下停下)。
2. `server.js`:`CACHE_SIZE_CEILING` 由 300 → **1800**(> 庫存 1744)。原本個 ceiling
   係想「唔好攤薄 refresh timer 800/day 續熱額度」,但真正做緊呢個保護嘅係
   `MAX_PER_DAY=150` 每日上限,ceiling 訂 300 純粹令成個機制死亡。改完之後
   1400 首冷歌會以每日 150 首嘅速度、~10 日內暖晒一次。
3. 上線方式:跟返 memory 入面「長期 process 一定要 detach + 驗證」嘅規矩重啟
   backend,重啟後睇 log 確認 warmColdBacklog 真係開始行(會見到每 90 秒一條暖歌 log)。

**Phase 2 — 根治(等 Eric 拍板 §5 先做)**
- 拍板熄 VPN / 搬機:改完環境之後,bust 晒成個 resolve cache(舊 URL 綁死 VPN IP,
  留住冇用),再行一次 Phase 0 個 soak script 出「後」數據做對比。
- 拍板行 PO token:起 provider service(要跟「長期 process 要 detach + 驗證」規矩)、
  yt-dlp 加 extractor-args,**用 env flag 包住**(似 RESOLVE_PARALLEL 咁,預設關),
  soak script 驗完先開。
- 無論行邊條路:**cookies.txt 要由 git 剷走**(加入 .gitignore + `git rm --cached`),
  同埋嗰個 Google 帳號要去 myaccount.google.com 登出所有 session(個 LOGIN_INFO
  已經留咗喺 git 歷史,當佢洩露咗處理)。呢步唔使拍板,直接做。

### 1.5 風險小結(問題一)

- Phase 1 全部係 backend 行為微調,最壞情況同而家一樣(403 照 502),冇 regression 面。
- backoff 會令「真死鏈」嘅 502 慢 2 秒先返——可接受,死鏈已有 failCache 15 分鐘記憶。
- ceiling 加大唔會多打 YouTube(每日上限 150 冇動),只係令本來設計好嘅暖庫真係行。
- C 路線嘅 ToS/帳號風險見 §1.3,唔拍板唔做。

### 1.6 同上輪隊列修復嘅關聯

**冇關聯。**403 係 backend ↔ googlevideo 之間嘅事,`resyncFromNative` /
`appKilledPlaybackBehavior` 全部係 app 端播放器生命週期嘅嘢,兩邊唔相交。
唯一要留意嘅交接位係 §1.4 Phase 1 講嗰個「backend retry 同 app 端
`TrackPlayer.retry()` 嘅時間 budget 接力」,照規劃做唔會衝突。

---

## 2. 問題二:"God Music keeps stopping"(ForegroundServiceStartNotAllowedException)

### 2.1 根因(已喺本 session 讀源碼定位,唔使再估)

RNTP 4.1.2 `MusicService.kt`(`node_modules/react-native-track-player/android/src/main/
java/com/doublesymmetry/trackplayer/service/MusicService.kt`):

- `onStartCommand()`(line 97–101)每次服務啟動都 call
  `startAndStopEmptyNotificationToAvoidANR()`,而入面 **line 124 嘅
  `startForeground(EMPTY_NOTIFICATION_ID, notification)` 冇任何 try/catch**。
  App 喺背景、又冇任何 FGS 豁免嘅時候行到呢句,Android 12+ 直接掟
  `ForegroundServiceStartNotAllowedException` → process crash → "keeps stopping"。
- 對比:同一個 file 另一條路 `startForegroundIfNecessary()`(line 502–536)係有
  catch 住呢個 exception 嘅(仲會 emit `android-foreground-service-start-not-allowed`
  event 俾 JS)。即係上游自己都知呢個 exception 要防,漏咗 line 124 呢個位。
- `onStartCommand` 回傳 **`START_STICKY`**(line 100):服務死咗(process 被殺)
  之後系統會喺**背景**自動重生佢 → 重生就行返 `onStartCommand` → 撞正上面粒雷。
  呢個就係「app 閒置切走(process 俾系統回收)再打開就見到 crash 對話框」嘅機制:
  crash 其實發生喺背景重生嗰刻,用戶開返 app 先見到個 dialog。
- 環境已排除嘅嘢:merged manifest 已有 `foregroundServiceType="mediaPlayback"` +
  `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 權限(targetSdk 36),
  唔係 manifest 缺嘢。

### 2.2 同上輪改動嘅關聯(Eric 問嘅)

**有關聯,但唔係上輪引入,係上輪令觸發面擴大。**粒雷本身係 RNTP 上游 bug,
Android 12+ 一直存在;上輪兩個改動令中雷機會大增:

1. **e087e7f 將 `appKilledPlaybackBehavior` 改做 `StopPlaybackAndRemoveNotification`**:
   swipe 走 app 嗰陣 `onTaskRemoved` 會行 `stopSelf()` 之後**即刻 `exitProcess(0)`**
   (上游 code,line 776–800)。process 硬死同 `stopSelf` 登記之間有 race——如果
   ActivityManager 未處理到個 stop 請求 process 就死咗,系統見到嘅係「一個 started
   sticky service 嘅 process 死咗」→ 排隊背景重生 → 中雷。
2. **`resyncFromNative(true)` 冷啟動 800ms 必行 `lazyEnsurePlayer()`**(App.js
   line 718–724)→ `setupPlayer` → `MusicModule.kt` line 239 `startForegroundService`。
   即係**每次開 app 都會 start 個 service**,就算用戶從來冇撳過播放——「lazy init」
   名存實亡。一個 started-but-never-foregrounded 嘅 sticky service 長期存在,
   俾系統殺完背景重生(=中雷)嘅機會自然大增。

**結論:唔使 revert 上輪任何行為**(嗰啲係 Eric 拍板嘅 UX 決定,而且 revert 都
醫唔好呢個上游 bug),喺 native 層直接堵。

### 2.3 修法(交 Sonnet 5)

**Phase 0 — 重現 + 留底(做 fix 之前)**
1. Emulator 重現矩陣(逐個場景記低有冇 crash + logcat):
   a. 播歌 → 撳 Home 去背景 → `adb shell am kill`(模擬系統回收)→ 等 10s → 開返 app;
   b. 播歌 → notification 撳暫停 → swipe 走 app → 等 30s → 開返 app;
   c. 開 app 完全唔播歌 → 去背景 → `am kill` → 開返;
   d. Opus 5 原本撞到嗰個流程(閒置、切走、再打開)。
   logcat filter:`AndroidRuntime|MusicService|ActivityManager.*god`。目的係攞到
   完整 stack trace 證實 crash 喺 line 124(規劃層係由源碼推斷,執行層要實證),
   同埋留低「修之前」嘅重現步驟俾 Opus 5 驗收用。
2. 快速 check 上游:npm 查 `react-native-track-player` 有冇 >4.1.2 release、GitHub
   main branch 呢兩個位(line 124 / START_STICKY)有冇已 merge 嘅 fix。有現成
   released fix 就升級優先;冇(截至規劃時認知,4.1.2 係最新 stable)就 patch-package。

**Phase 1 — patch-package 堵雷(預設路線)**
1. 加 `patch-package` devDependency + `"postinstall": "patch-package"`
   (frontend/hymn-app/package.json)。
2. Patch A:`startAndStopEmptyNotificationToAvoidANR()` 個 `startForeground`(line 124)
   包 try/catch——catch `ForegroundServiceStartNotAllowedException`(SDK ≥ S)就
   log 低算數,唔好 rethrow。照抄同 file `startForegroundIfNecessary` 個 catch 寫法。
   吞咗之後個 service 繼續以非 foreground 狀態行,冇任何後果(呢條 ANR workaround
   路徑本來就係 start 完即 stopForeground)。
3. Patch B:`onStartCommand` 由 `return START_STICKY` 改 `return START_NOT_STICKY`。
   理據:我哋而家用 `StopPlaybackAndRemoveNotification`,swipe 走 = 一切歸零,
   根本冇「系統自動背景復活服務」嘅正當場景;NOT_STICKY 直接消滅背景重生呢個
   觸發源頭(Patch A 係保險網,Patch B 係拆引信)。註釋要寫明:如果第日改返
   `ContinuePlayback`,呢個 patch 要重新檢視。
4. (可選,細)App.js 加 listener:`PlaybackError`/`PLAYER_ERROR` code 係
   `android-foreground-service-start-not-allowed` 嗰陣靜默處理,唔好彈「載入唔到」
   notice——嗰個唔係歌曲問題。
5. **出貨紅線:呢個係 native 改動,EAS Update OTA 推唔到,一定要出新 APK。**
   versionCode bump,build 跟 HYMN-APP-IRON-RULES.md 嘅 gradle command,build 完
   copy 去 `~/Desktop/詩歌App/`。同一個 APK 順便夾埋當時 main 上任何已 OTA 嘅 JS
   改動(publish 前跟返 EAS-Update memory 嘅清場規矩,核對 working tree,唔好夾到
   其他 session 嘅嘢)。
   ⚠️ **同一個 APK 要夾埋 Phase 3 分享清單嘅 deep link**(MEMBERSHIP-PHASE3-SHARE-PLAN
   §0.2 拍板):commit `cf62f59` 只改咗 `app.json`,AndroidManifest **未有** intent
   filter——**build 之前必須行 `npx expo prebuild -p android`**,唔行嘅話 APK 會靜靜哋
   冇 deep link、零錯誤提示(2026-08-03 Opus 驗收實測確認呢個陷阱)。prebuild 會剷走
   manifest 入面 `POST_NOTIFICATIONS` 嗰段中文註解(permission 保留),要手動加返。

**Phase 2 — 驗收(Opus 5)**
- Phase 0 個重現矩陣全部重走一次:四個場景都唔可以再 crash。
- Regression checklist(全部係上輪 QUEUE-UX-4FIXES 拍板行為,唔可以郁到):
  1. 播歌 → swipe 走 app:音樂即停、notification 消失(§4 行為);
  2. 播歌 → 撳 Home:背景繼續播,返前台 mini player 對得返數(§Eric #2);
  3. 冷啟動殘留隊列清場:notification 暫停 → swipe 走 → 開返 app,clean state;
  4. notification 三個掣(play/pause/next)正常;
  5. 正常播放、跳歌、插播分隔線行為不變。
- 驗收要喺 **Android 12+ emulator**(或 Eric 部真機)做——Android 11 或以下根本冇
  呢個限制,驗咗等於冇驗。

### 2.4 風險小結(問題二)

- Patch A 風險近零:得個 catch,行為唔變,只係唔 crash。
- Patch B 有一個要諗清楚嘅面:NOT_STICKY 之後,如果 process 喺**播緊歌途中**俾系統
  殺咗(理論上 foreground service 好少被殺),系統唔會自動重生服務,音樂唔會自己
  復活。舊行為(STICKY)其實都復活唔到播放(重生嘅服務係空嘅,仲會 crash),
  所以實際冇損失——但 Opus 5 驗收場景 (a) 要特登驗埋呢個:kill 完開返 app,
  app 要正常冷啟動,唔 crash、唔留鬼 notification。
- patch-package 嘅維護面:第日升級 RNTP 版本,patch 可能 apply 唔上——postinstall
  會嘈,唔會靜默失效;升級嗰陣重新檢視兩個 patch 仲需唔需要就得。

---

## 3. 建議執行次序(單一 Sonnet session 內)

1. **問題二 Phase 0 → 1**(重現、patch、build APK)——契機獨立、改動面細、驗證路徑清晰。
2. **問題一 Phase 0 + 1**(診斷 log + soak script + backoff + ceiling)——純 backend,
   唔使同 APK 排隊。
3. 兩邊各自交 Opus 5 驗收(問題二用 §2.3 Phase 2 checklist;問題一止血部分主要睇
   log + soak 數據,唔使 UI 驗收)。
4. 問題一 Phase 2(根治)等 Eric 拍板後另開工。

## 4. 明確唔准做嘅嘢(俾 Sonnet 5 嘅鐵律)

- 唔准改 `resolveAudio.js` 嘅 STRATEGIES 次序、唔准 retry 時轉 player_client(format
  一致性 invariant)。
- 唔准 revert `appKilledPlaybackBehavior` / `resyncFromNative` 嘅行為(Eric 拍板 UX)。
- 唔准將 native fix 當 OTA 推(EAS Update 只送 JS,推咗都冇效,仲會造成假驗收)。
- backend 重啟要 detach + 事後驗證(memory 規矩),唔可以 `&` 就算。
- 唔准用 Eric 私人 Google 帳號嘅 cookies 做任何嘢。

## 5. 需要 Eric 拍板嘅位

1. **NordVPN 部 Mac 係咪一定要開住?**(問題一根治嘅關鍵)佢由 7 月 17 號起一直
   行緊,backend 所有 YouTube 流量經佢出去。macOS 版 NordVPN 冇 split tunneling,
   所以選項係:(a) 成部機熄咗佢;(b) 保持現狀,改行 PO token 路線頂住;
   (c) backend 搬去第二部機/第二個網絡。想知 Eric 開 VPN 本身係為咗乜,先至知
   邊個選項可行。
2. **PO token / cookies 路線嘅 ToS 取態**(§1.3 C):要唔要行、行邊隻。如果 (a)
   熄 VPN 之後 soak 數據已經靚,呢條可以直接唔行。
3. cookies.txt 入面個 Google 帳號係邊個嘅?(決定登出 session 嗰步要通知邊個)
