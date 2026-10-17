# iOS 做到同 Android 一樣 —— 根本性方案(Fable 5,2026-08-14)

> 俾 Eric 睇嘅一句總結:**iOS 轉歌要等、聽聽下自己停,根源係 iOS 播放引擎「播到嗰首先去攞嗰首」,而 Android 引擎「播緊呢首已經偷偷攞定下一首」。我哋之前所有優化都係令「攞」快啲,但冇改變「要等攞完先有聲」呢件事。今次方案係:App 喺播緊呢首歌嗰陣,預先將下一兩首成首歌落載落你部 iPhone 度,轉歌嗰刻直接播機入面嘅檔案——網絡完全唔喺條路度,同 Android 一樣即刻有聲,而且「冇聲→iOS 熄咗成個 App」呢條死亡鏈都一併斬斷。唔使換引擎、唔使俾年費、唔使 fork native code。**

---

## 1. 先答 Eric 兩條核心問題

### 1.1 「你話暖咗,點解第 2、3、4 首都仲要 load?」—— 因為暖嘅係伺服器,唔係你部電話

「暖」呢家嘢一直只係做咗一半:

- **暖咗嘅部分**:首歌成個 audio file(cap 12MB,絕大部分詩歌 3–8MB 即係成首)已經預先擺咗喺 Mac backend 嘅記憶體度。你部電話一問,backend 即刻答,唔使等 YouTube。呢部分係真係生效緊——backend log 見到 cache hit 時 TTFB 得幾百 ms,冇呃你。
- **冇暖到嘅部分**:你部 iPhone 本身。iOS 個播放器(AVFoundation)係「轉歌嗰刻」先開始做嘢:開新連線(經 Cloudflare tunnel 返香港部 Mac)、先攞檔頭、再另開一條連線攞檔尾(佢一定要讀埋檔尾先知首歌幾長)、再逐截攞內容、buffer 夠先出聲。呢串嘢係**幾個「一問一答」串住做**,經 tunnel 每個來回幾百 ms,再加 4G/5G 抖動,加埋就係你感受到嗰幾秒。**backend 幾快都慳唔到呢啲來回。**

之前份「16.24 秒 → 2.84 秒(改善 82%)」係喺 Mac 本機用探針量,冇經 tunnel、冇行手機網絡、更加冇鎖屏——所以你部電話嘅實際感受同個數字對唔上,**你嘅體感先係啱**。今次方案入面第一步就係喺你部 iPhone 度量真數字(見 §4),以後唔會再用 Mac 度自己量自己爽嘅數字同你交代。

### 1.2 「點解 Android 完全冇呢啲問題?」—— 因為兩個引擎係根本性唔同

| | Android(ExoPlayer) | iOS(SwiftAudioEx / AVFoundation) |
|---|---|---|
| 下一首幾時開始攞 | **播緊呢首嗰陣已經預先 buffer 下一首**,轉歌零等待 | **轉歌嗰刻先開始攞**,由零起步 |
| 播放中斷網絡差 | 引擎自己重試,foreground service 令 App 一直活住 | 一停聲,**iOS 直接 suspend 成個 App process**,連補救 code 都凍埋,要你自己解鎖先醒返 |
| 首歌長度讀法 | 跟標準讀 moov,一次搞掂 | 要另開連線讀檔尾,仲有 fMP4 雙倍 duration 呢啲怪病(已修) |

「聽聽下自己停」已經實錘係第二行嗰樣嘢:8 月 13/14 兩日嘅 drift 探針(D1)錄到 JS 成個凍結 1 分 19 秒、5 分半鐘、22 分鐘、93 分鐘——即係 **App 真係俾 iOS suspend 咗**,唔係 App 內部卡死。而 suspend 嘅觸發點永遠係「唔知咩原因停咗聲」:轉歌 load 得慢、中途 stall、403、playWhenReady 俾 native 熄咗。我哋加嘅所有 JS watchdog 喺呢個場景**結構上冇用**——App 凍咗,watchdog 都凍埋。

**結論:兩個病其實係同一個根:iOS 播歌條路上面有網絡。網絡一喘氣就停聲,一停聲就俾 iOS 處死。所以根治唔係「令網絡快啲」,係「令轉歌同播放中途完全唔使網絡」。**

---

## 2. 我嘅判斷:方案 A——App 預先落載,播本地檔案

唔係選項清單,呢個係我嘅判斷,理由喺後面。後備方案(B/C)只喺方案 A 撞板先需要,見 §6。

### 2.1 做法(一段講完)

App 播緊第 N 首嗰陣,背景靜靜哋將第 N+1、N+2 首**成個 audio file**(3–8MB)由 backend 落載落 iPhone 本地儲存;落載完,將隊列入面嗰首歌嘅網址換成本地檔案路徑。轉歌嗰刻,AVFoundation 打開嘅係機入面嘅檔案:冇連線、冇來回、冇 403、冇 stall——**即刻有聲**。落載唔切(例如你狂撳跳歌)就自動用返而家嘅串流方式,唔會衰過而家。已落載嘅歌保留喺機度(上限約 300MB,自動汰舊),重複聽嗰啲歌以後永遠即開。

### 2.2 點解呢條路啱(而且係唯一同時醫好兩個病嘅路)

1. **轉歌延遲**:本地檔案開波係毫秒級。呢個唔係「快幾多 %」,係同 Android 一樣「根本冇 load 呢回事」。
2. **聽聽下自己停**:中途 stall 嘅前提係「播緊網絡串流」。播本地檔案,條 audio pipeline 入面冇網絡,聲唔會斷,iOS 就冇藉口 suspend 個 App。403、VPN 抖動、tunnel 慢——全部搬咗去背景落載嗰條路,喺嗰度重試幾多次都冇人感覺到。
3. **技術上全部係已證實嘅事實,冇賭博成分**:
   - App 播緊歌嗰陣 JS 係全速行(已逐行核實 RN 0.85 RCTTiming 冇 background 節流)→ 背景落載可行;
   - backend 本身已經將成首歌暖咗喺 RAM(cap 12MB)→ 落載一首暖咗嘅歌只需幾秒;
   - RNTP v4 支援播 `file://` 本地檔案(標準功能);
   - fMP4 duration 修正喺 backend serve 嗰刻已經做咗,落載落嚟嘅檔案係修好版;
   - 本地檔案 moov 即讀 → 鎖屏進度 bar/時間即刻有,連早排嗰單病都順手醫埋。
4. **零額外成本**:唔使 RNTP v5 年費(€999/年),唔使 fork native code 長期供養,Android 嗰邊一行 code 都唔郁(零 regression 風險)。
5. **數據用量冇增加**:本身串流都係下載緊成首歌嚟聽,而家只係早幾分鐘落載+落載得完整。唯一浪費係「落載咗但你跳過冇聽」,所以只預載下 2 首,唔預載成個隊列。

### 2.3 老實講埋啲乜嘢醫唔到

- **每次開 App 第一首歌**仍然要串流開波(冇嘢可以預知你幾時開 App 想聽邊首)——但呢個同 Android 行為一樣,Android 第一首都係要 load 嘅。backend warm(開 App 自動暖「今日為你預備」6 首)繼續幫手令呢下盡量快。
- 你**狂撳跳歌跳到落載未完成嘅位置**,嗰下會用返串流(即係而家嘅體驗)。正常聽法(一首聽完接一首)永遠係本地。
- 接電話/Siri 搶聲道呢類 interruption 係另一條線,之前已經修咗(autoHandleInterruptions),唔喺今次範圍。

---

## 3. Eric 做完之後會感受到咩(驗收就係呢四樣)

1. **轉歌即刻有聲**——第 2、3、4…首,撳「下一首」或者自動接落去,同 Android 一樣冇「load 緊」嘅感覺。
2. **鎖屏聽成晚都唔會自己停**——連續聽幾個鐘,唔會再出現「靜咗要解鎖先醒」。
3. **鎖屏進度 bar 同時間即刻出現**,唔會遲遲先跳出嚟。
4. **聽過嘅歌再聽,秒開**(連第一首都係,如果嗰首之前聽過)。

---

## 4. 真數字點量(唔再喺 Mac 自嗨)

而家 App 已經有 client-log beacon 打返 backend(D1 落地嗰套,證實收到緊數據)。加一個埋點就得:

- **量咩**:由「轉歌事件發生」(`PlaybackActiveTrackChanged` / 用戶撳掣)到「真係開始出聲」(state=Playing 而且 position 開始行)嘅毫秒數,連同「今次係本地檔案定串流」、前台定鎖屏。
- **邊度量**:Eric 部 iPhone,日常真實聽歌,唔使做任何嘢,數據自動打返 backend log。
- **點用**:
  - **Phase 1(改動前)先推呢個埋點**,收 1–2 日 baseline——呢個就係「Eric 而家實際感受緊嘅真數字」,一次過對清楚之前「2.84 秒」同真機現實差幾遠。
  - Phase 2 上咗之後對比:**驗收標準 = 本地檔案轉歌 p95 < 1 秒(預期 0.2–0.5 秒);連續 3 日日常聽歌,零「自己停」事件(backend 冇再收到大 drift beacon、Eric 冇再遇到)。**

---

## 5. 實施規格(交 Sonnet 5,夠細唔使 Eric 逐步確認)

### Phase 1 — 真機量度埋點(JS-only,可以即刻 OTA)

1. `App.js`:喺 `PlaybackActiveTrackChanged` 記 `t0` + 觸發源;喺其後第一次「state=Playing 且 position>0.2s」記 `t1`;`logDiag('nextTrackMs', { ms: t1-t0, source: 'stream'|'local', appState })`。手動撳「下一首」用撳掣嗰刻做 `t0`(蓋過 event 嗰個)。
2. 推 OTA(iOS channel),同 Eric 講聽歌照舊就得。收 1–2 日。
3. 產出:baseline p50/p95 寫入本 plan §7。

### Phase 2 — 本地預載(要新 TestFlight build,因為加 native module)

**新增 dependency**:`expo-file-system`(Expo SDK 配套版本;注意 SDK 54 新 API,如用舊 API 要由 `expo-file-system/legacy` import)。Android 唔啟用任何新行為(全部邏輯 `Platform.OS === 'ios'` gate 住),Android 零改動零風險。

**新檔 `src/audioPrefetch.js`**,職責:
- `ensureCacheDir()`:`FileSystem.documentDirectory + 'audio-cache/'`。
- `getLocalUri(songId)`:同步查記憶體 index(boot 時 scan 一次目錄建立 `Map<songId, uri>`)。
- `prefetch(songId)`:
  - 已有本地檔或落載中就 skip;
  - 落載去 `{songId}.part`,成功先 `moveAsync` 做 `{songId}.m4a`(**半成品永遠唔准俾播放器見到**);
  - 來源 URL 用而家同一條 `${API_BASE}/api/stream/${songId}`;
  - 驗收:HTTP 200、size ≥ 200KB、response `content-type` 唔係 webm/opus(係就棄檔,呢首唔 cache——backend 對 AppleCoreMedia UA 已有 502 攔截,但 JS fetch UA 唔同,要自己驗);
  - 失敗:靜靜哋放棄,唔 retry loop(下次轉歌事件自然再觸發),`logDiag('prefetchFail')` 記錄。
- `prune()`:boot 時行,按 mtime LRU,cap **300MB 或 60 個檔**(先到先算)。
- 併發:同一時間最多 1 條落載(照跟 backend `withWarmLock` 嘅精神,唔好同播緊嗰首爭頻寬)。

**`App.js` 接駁位**:
- `toTrack(song)`:iOS 時先問 `getLocalUri(song.id)`,有就用 `file://` URI,冇就用返 stream URL(**建隊列嗰刻已經盡量用本地**)。
- `PlaybackActiveTrackChanged` listener(而家已有滾動 warm 嗰段)加:`prefetch(下一首)`、`prefetch(下下首)`(完成一首先開始下一首)。**保留而家嘅 `warmIds()` 唔剷**——backend warm 令 prefetch 快好多,兩層係配合唔係重複。
- **落載完成嘅隊列熱換**:prefetch 成功而嗰首歌喺隊列 current index 之後 → `TrackPlayer.remove(idx)` + `TrackPlayer.add(swappedTrack, idx)`。守衛:
  - 只換 `idx > currentIndex` 嘅(**永遠唔掂播緊嗰首**);
  - 如果嗰首係下一首而且 current position > duration−15s,**唔好換**(避開 native auto-advance 交接嘅 race);
  - 換失敗就算數,原本 stream URL 照行。
- 本地檔案 `PlaybackError`(理論上唔應該有):行現有 retry/skip 路徑,另外 `deleteAsync` 剷咗個檔 + 從 index 移除,令下次跌返串流。
- `nextTrackMs` 埋點加 `source: 'local'` 標記(睇 active track URL 係咪 file://)。

**backend 順手帶埋(同一次 deploy,經 deploy gate 攞 Eric go)**:
- format selector 改 `bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]`(剷走 webm/opus fallback——iOS 本身播唔到呢啲,-11828 實證 hymn 7511;呢個唔改,串流同落載都會間歇中招)。改完要覆核 Android 冇歌因此 resolve 唔到(有嘅話寧願保留舊 selector + 只喺落載驗 content-type)。

**Build/發佈**:
- iOS:`pod install`(SwiftAudioEx stall-fix plugin 會自動重打,搵唔到 pattern 會 fail loud——正常)→ TestFlight build + submit。
- Android:唔使出新 APK(冇行為改動;expo-file-system 入咗 dependency 但冇 call)。
- **紅線**:Eric 真機 QA 進行緊嗰陣,唔准 restart backend / 改 stream.js、resolveAudio.js(HANDOFF §2.3);deploy gate 未批嘅 backend commit 要攞 go 先郁。

### Phase 3 — 驗收

1. Opus/Fable 用 backend log 拉 `nextTrackMs` 分佈,對比 Phase 1 baseline,出對照表。
2. Eric 真機 3 日日常聽:四項體感(§3)逐項答「係/唔係」。
3. 三日內 backend 冇收過 `wallClockDrift`(iOS 器材)大 drift beacon。
4. 任何一項不達標 → 回到 §6 決定係咪起動方案 B。

**時間估算**:Phase 1 半日(OTA 即日到機)。Phase 2 code 1–2 日 + TestFlight 處理/審核約 1 日 → **Eric 手上見到新版:開工起計約 3–4 日**。Phase 3 驗收 3 日。

---

## 6. 後備方案(而家唔做,撞板先用)

| | 方案 B:升 RNTP v5 | 方案 C:fork SwiftAudioEx 自己加 preload |
|---|---|---|
| 係咩 | 官方新版,內置「預載下一首+audio cache」,連 iOS 都有 | 自己維護一個改裝版播放引擎 |
| 幾耐 | 成個 rewrite,App 所有播放接口重寫 + 兩平台全面回歸測試,**1 星期以上** | 3–6 日 native 工 + 以後永久自己 merge 上游更新 |
| 錢 | **€999/年**(Launch Credit 6 個月免費之後自動轉正價;已上線 app 未必合資格) | 免費但長期維護成本 |
| 幾時先考慮 | 方案 A 上線後真機數據仍然唔達標,或者將來要 CarPlay/Android Auto 呢類 v5 獨有功能 | 基本上唔會——方案 A 用 JS 達到同一效果,呢條路冇獨有優勢 |

方案 A 仲有個隱藏著數:就算第日真係要升 v5,本地檔案 cache 呢層一樣用得著(v5 都係播 URL),唔係白做。

## 7. Baseline 數據(Phase 1 收數後填)

_(留空,Sonnet 5 於 Phase 1 完成後回填 p50/p95 + 樣本數)_
