# Phase 2.5「開 App 第一首」預載 —— 完整執行規劃

**狀態**:規劃(零代碼改動),等 Eric 拍板 §10 四件事後交 Sonnet 5 執行
**執行**:Fable 5(2026-08-23 清晨,接 THIRD-PASS-REVIEW-20260822 Batch D-1)
**對照文件**:`THIRD-PASS-REVIEW-20260822.md` §3/§5、`IOS-ANDROID-PARITY-PLAN.md` §5、`IOS-NEXT-TRACK-PRELOAD-PLAN.md`
**對照 commit**:`56795a9`(Phase 2.5 初版,2026-08-15)、`23104fd`(S4+O5 補強)、`cb67e87`(Caches 合規)

---

## §0 TL;DR

1. **Phase 2.5 唔係由零開始——佢一半已經上咗線。** 8-15 `56795a9` 已落地「開 App 預載今日頭 2 首 + 聽日頭 2 首」,昨晚實測實錘佢有正常行(23:12:57 開機即落載咗當日頭 2 首 6615/7055)。但測試撳嘅 4897 唔喺嗰 2 首之內,照樣行串流 9.6–14.8 秒。**問題係覆蓋面同命中率,唔係機制壞。**
2. **命中率最大嘅隱形殺手係「日更抽選唔穩定」**:`featured=1` 得 **0 首**,「今日為你預備」個抽選池係成個 6,043 首全庫;庫日日增長,而 seeded shuffle 對池內容極敏感——**加一首新歌,成副牌重洗,6 首完全換晒**。開機顯示 MMKV 舊庫嘅抽選、幾秒後 background refresh 換咗新庫,啲卡靜靜哋換歌,預載嗰 2 首即刻脫靶;「聽日頭 2 首」跨日更加冇得靠。呢個唔修,加幾多首預載都係嘥流量。
3. 方案四件套:**W1 抽選穩定化**(per-song hash rank,池變動唔再全體重洗)→ **W2 預載名單擴闊**(今日頭2 + 「即刻揀歌」現用 chip 頭1 + 聽日頭2,開機串行落載)→ **W3 隨心聽第一首偏向已快取歌**(零流量成本,即撳即出聲)→ **W4/W5 量度+驗證**(用返昨晚模擬器 harness 同 9.6–14.8s 基準做 before/after)。
4. 全部係 **JS-only、iOS OTA(runtime 5)即到,零 native build、零 backend 改動、零 restart**。Android 唔啟用預載(§7),但 W1 會令兩平台首頁抽選一齊變穩定(係好事,但要講明)。
5. 預期效果:首頁推薦位(今日為你預備/即刻揀歌/隨心聽)開 App 第一撳由 9.6–14.8s → **~0.2s**(命中時);未冚到嘅入口(詩歌庫/搜尋/我的)維持現狀,唔會衰過而家。

---

## §1 現況(必讀,唔好當呢個 feature 未存在)

### 1.1 已上線嘅機制(`56795a9` + `23104fd` + `cb67e87`)

| 部件 | 位置 | 行為 |
|---|---|---|
| 本地快取層 | `src/audioPrefetch.js` | iOS-only;`Library/Caches/audio-cache/`(版權合規,Eric 8-15 要求);LRU 300MB/60 檔;`.part`→`.m4a` 兩段式寫入;90s 半死連線 timeout;串行落載(同一時間 1 條) |
| 播本地檔 | `App.js` `toTrack()`:128 | 建隊列嗰刻有本地檔就用 `file://`,冇就 stream URL |
| 隊列熱換 | `App.js`:500-529 | 落載完成 → 換走隊列入面未播嗰首嘅 stream URL(唔掂播緊/尾15秒嗰首) |
| 滾動預載 | `App.js` trackChanged:924-941 | 播緊第 N 首自動落載 N+1/N+2(**昨晚實測 0.17s 出聲,就係呢條路**) |
| **Phase 2.5① 開機預載** | `App.js`:3196-3202 | 歌單一 load 好即刻排「今日為你預備」頭 2 首落載 |
| **Phase 2.5② 聽日預載** | `App.js`:3186-3193 + 936-941 | 開機計低「聽日」頭 2 首 id;用戶真係聽緊歌先排隊落載 |
| 讓路機制 | `audioPrefetch.js` `cancelIfDownloading()` | 用戶撳嘅歌啱啱好落載緊 → abort 落載,讓路俾即場串流(playQueue/skipToQueueIndex/handleNextTrack 三個口都接咗) |

### 1.2 昨晚實測話俾我哋知啲乜(backend log 逐條對過)

- 23:12:57 app 開機,預載器即刻落載當日頭 2 首:6615(cold,6.5s)→ 7055(warm,3.8s)。**機制有行。**
- 23:13:12 測試撳 4897 —— **唔喺頭 2 首名單** → 串流路徑,`origin=start source=stream ms=14803`;暖 URL 重測 9,551ms。
- 之後 tapNext ×4 全部 `source=local` 163–172ms —— 本地檔路徑實錘就係目標體驗。
- 拆數:backend(resolve+TTFB)只佔 1–4s,**AVPlayer 對網絡 source 起 asset/probe/buffer 佔 ~8–9s**——呢舊嘢只有 `file://` 先跳得過,所以「預載成首落本地」係唯一正解,方向唔使再議。

### 1.3 點解已上線嘅版本未解決問題——三個缺口

1. **覆蓋面窄**:得「今日為你預備」頭 2 首。首屏仲有隨心聽(第一撳大戶)、「即刻揀歌」chip 頭 4 首、最近加入、6 首今日入面另外 4 首——全部 miss。
2. **Race window**:開機後要先等歌單 load(~1-2s)再串行落載(每首經 tunnel 4–7s)。用戶開 App 10 秒內撳歌,幾乎必定未落載完 → cancel 讓路 → 串流 9.6s。「聽日預載」本來就係為咗殺呢個 window(琴晚落載定,今朝開機零等待)——但被下面第 3 點廢咗武功。
3. **抽選唔穩定(最傷)**:見 §3。「聽日頭 2 首」係用今晚個庫算嘅;聽朝 background refresh 一換庫,真正顯示嘅 6 首成套換晒,琴晚落載嗰 2 首同今日張卡完全唔對應。同日之內 morning/evening 開 App 都可以唔同歌。**Phase 2.5② 而家接近空轉。**

---

## §2 「第一首」係邊首?——入口盤點同分級策略

App 冇「續播上次」(Eric 2026-07-29 拍板剷咗「繼續收聽」,關 App 冇記憶,QUEUE-UX-4FIXES §4)。所以「第一首」冇單一答案,只有一張入口地圖:

| 首屏入口(由上到下) | 第一首可預知? | 策略 |
|---|---|---|
| 每日金句 | 唔播歌 | 唔使理 |
| **隨心聽**(shuffle 全庫) | ❌ 真隨機 | **W3:第一首偏向已快取歌**(改我哋自己控制嘅洗牌,零流量) |
| **即刻揀歌**(記住上次 chip,首頁 4 首) | ✅ 日期+chipId 種子,saved chip 開機同步讀到 | **W2:預載現用 chip 頭 1 首** |
| **今日為你預備**(6 首) | ✅ 日期種子 | 已預載頭 2(維持);其餘 4 首等 W4 數據先決定加唔加 |
| 最近加入(12 首) | ✅(id 最大) | 暫唔預載——head 日日換=日日白落載,等 W4 數據 |
| 詩歌庫 / 搜尋 / 我的 / 清單 | ❌ 6,043 首任撳 | 唔預載(冇得預知);toTrack() 撞正 LRU 快取入面 60 首之一就自動命中,常聽歌自然愈嚟愈快 |

**冇人知用戶第一撳實際分佈**——昨晚係測試員撳,真用戶數據未收過(P1-1 嗰三個 beacon 由 commit 到而家一條真機數據都冇)。所以 W4 要加一個好平嘅 `firstTapSurface` 分類(origin=start 嗰刻判斷撳嘅 id 屬於邊個 surface),收 1–2 星期真數據,先再決定要唔要加碼(6 首全預載/最近加入)。**呢份 plan 嘅預載名單係按「確定性+位置當眼度」落注,唔係假裝知道分佈。**

---

## §3 核心障礙:日更抽選穩定化(W1,成敗關鍵)

### 3.1 病理

- `dailyPickBalanced()`(`src/utils/dailyShuffle.js:67`)= seeded Fisher-Yates 洗**成個池**再攞頭 6。種子日內固定,但**輸入池一變(多一首/少一首/次序變),整個 shuffle 結果完全唔同**——唔係「換一首」,係「6 首全換」。
- 池 = `featured=1` 夠 6 首先用精選,否則全庫。**而家 featured=1 係 0 首** → 池就係全庫 6,043 首,而 growLibrary 每 15 分鐘跑緊、lyrics 線日日 delist——庫幾乎日日唔同。
- 開機:HomeScreen 用 MMKV 快取庫 render(琴日嘅庫)→ 幾秒後 `useCachedHymns` background refresh 換新庫 → `todayPicks` useMemo 重算 → **啲卡喺用戶眼前靜靜哋換咗另外 6 首**。開機預載嗰 2 首(按舊庫算)即刻對唔上畫面。
- 副作用唔止預載:同一日朝早/夜晚開 App「今日為你預備」都可以係兩套歌,「日更」承諾其實一直冇兌現緊。「即刻揀歌」`dailyPick()` 同病。

### 3.2 修法(建議):per-song hash rank 取代整池 shuffle

`dailyPickBalanced`/`dailyPick` 內部改成:每首歌獨立計分 `score = hashString(todayKey + '|' + salt + '|' + song.id)`,按分排序攞頭 n(語言保底邏輯照舊:先每語言攞分數最高嗰首,再補夠數;最後次序都用 hash 排,唔用池序)。

- **穩定性**:每首歌嘅分只同自己 id 同日期有關。庫加 100 首新歌,舊歌分數全部不變——新歌打入頭 6 嘅機率係 6/6043≈0.1%/首,即係換池通常**一首都唔換**,最多換一首。
- 「聽日頭 2 首」今晚算 = 聽日開機所見,**Phase 2.5② 由空轉變成主力**:琴晚聽歌時已落載定,今朝開機零 race window,第一撳即出聲。
- 對用戶嘅唯一可見改變:「今日為你預備」同「即刻揀歌」真正做到日內穩定(本來設計就係咁諗);日與日之間照樣全套輪換(todayKey 變 = 全部分數重計)。
- 介面唔變(pure function 換內部算法),caller 零改動;**Android 同一份 JS,首頁抽選一齊變穩定**——屬於順手修正,但 QA 要冚(§8)。

保守 fallback(如果 Eric 唔想郁抽選算法):session-pin——每個 app session 第一次算完 picks 就 ref 鎖死,refresh 唔重算,過零點先重算。改動最細,但只解決 session 內漂移,「聽日預載」照舊唔可靠,我唔建議。

---

## §4 執行規格(交 Sonnet 5;全部 JS-only,iOS OTA runtime 5)

### W1 抽選穩定化(先行,其他 workstream 嘅地基)

- `src/utils/dailyShuffle.js`:`dailyPickBalanced()`/`dailyPick()` 改 hash-rank(§3.2)。`seededShuffle`/`randomShuffle` 唔郁(隨心聽/其他用途照舊)。
- 驗證:同一 list 同一日多次 call 結果一致;list append 100 個 dummy 後結果差異 ≤1 首;唔同日結果唔同;語言保底仍然三語各至少一首。寫個一次性 node scratch 驗(**放 session scratchpad,唔准放 backend/**,見 feedback-scratch-scripts-block-deploy-gate)。

### W2 開機預載名單擴闊 + 讓路加強

`App.js` §3b① effect(:3178-3203)改動:

1. 預載隊列(串行,順序就係優先序):
   `[今日頭1, 今日頭2, 現用chip頭1, 聽日頭1, 聽日頭2]`
   - 「現用 chip 頭 1」= `dailyPick(chipSongs, chipId, 1)[0]`,chipId 用 `getHomeChip()`(MMKV 同步讀,冇存過就用 CHIP_DEFS 第一個成立嘅 chip,同 HomeScreen fallback 邏輯一致——**要抽個共用 helper,唔准兩邊各自實現**,否則第日 drift)。
   - 聽日頭 2 首由「用戶聽緊歌先排隊」改成「開機隊列尾直接排埋」:W1 之後聽日名單先至可靠,而佢哋排最尾,唔會阻住今日嗰 3 首;經 W1 之後多數日子今日嗰 2 首琴晚已經喺 disk(`index.has()` 即 skip,零流量),實際開機通常淨係落載 chip頭1 + 聽日 2 首。
   - `tomorrowQueuedThisSession`/trackChanged 嗰段(936-941)照保留做後備(開機 effect 冇行到嘅 edge case)。
2. **讓路規則加強**:而家 `cancelIfDownloading(id)` 只 cancel「撳嗰首自己」。加一條:`playQueue()` 起播時如果目標歌**冇本地檔**(即將行串流),無條件 abort 當前背景落載、清空落載隊列,並將被踢嘅 id 記低,`trackChanged` 首次 fire 後(即出咗聲)先重新排隊。原則:**用戶聽得到嘅串流永遠大過背景落載**——弱網下背景搶 6MB 頻寬會令本來 9.6s 嘅串流更慢,呢條係防「做咗 Phase 2.5 反而令 miss case 衰咗」嘅保險。`audioPrefetch.js` 加 `pauseAllForStream()`/`resumeQueue()` 兩個 export(內部就係 abort + queue snapshot/restore)。
3. 落載實現照用現有 `prefetch()`(fetch→arrayBuffer→write)。**唔好**喺呢輪改用 `downloadFileAsync` 之類 native 落地 API——AGENTS.md 指明 Expo v56 API 有變,要查版本文檔,而現機制實測 work;呢個係將來優化項,唔係本輪範圍。

### W3 隨心聽第一首偏向已快取歌(等 §10-2 拍板)

- `HomeScreen.js` `playShuffleAll()`:`randomShuffle(hymns)` 之後,搵第一個 `getLocalUri(id)` 命中嘅 index(iOS only;`audioPrefetch.js` 本身 export 咗 `getLocalUri`,Android 恆 null 自動 no-op),同 index 0 對調。搵唔到就照舊。
- 語義:仍然係隨機——只係喺已洗好嘅牌入面,將「撳落去即刻有聲嗰隻」抽上第一位;第 2 首起完全唔郁。快取有 60 首 LRU(用戶自己聽開嘅歌+每日 picks),唔會日日同一首。
- 成本:零流量、~5 行 code;效益:首屏最當眼嘅「唔想揀」入口變即開。

### W4 量度補完(同 Batch B 夾埋,同一次 OTA)

- 前置:THIRD-PASS-REVIEW P2-1(`finishTransitionMeasure` 加 `bufferingSeen` 守衛,source=local 豁免)——唔修呢個,驗收數據會溝入 <500ms 假快數(昨晚實錘 382ms 假數)。P1-1(閂三處 `always:true`)都係同一批。
- 新增:`origin=start` 上報時加 `surface` 欄位——撳嗰刻判斷 hymnId ∈ 今日picks / chip首頁 / 最近加入頭12 / 其他,連同 `source=local|stream` 一齊落 `nextTrackMs` detail。judge 用嚟答兩條問題:(a) 真用戶第一撳分佈係點,(b) 命中率有幾高。得幾行 code,冇新 event 種類。

### W5 部署次序

1. W1–W4 一個 branch 做晒,Android 模擬器 + iOS 模擬器過 §8 smoke。
2. OTA 一次過推(iOS runtime 5 channel;Android runtime 4 會收到 W1 嘅首頁抽選變穩定 + W3/W2 嘅 no-op code,零行為風險但要 smoke)。**呢輪唔使 backend restart、唔使 native build、唔使過 deploy gate 嘅 backend 部分**;OTA 照 EAS-UPDATE-PLAN 紀律(publish 前清場,唔夾其他 session 未 commit 嘢)。
3. 紅線照舊:Eric 真機 QA 進行緊嗰陣唔准推(feedback-no-deploy-during-live-qa)。

---

## §5 「靜靜哋」點保證(開機體感零影響)

- **時機**:預載 effect 掛喺「歌單 load 完」之後(而家已係咁),即係首頁已 render 完先開波;唔喺 app 啟動 critical path 上面。
- **執行緒**:`fetch` 網絡部分喺 native thread;JS 端成本係 `arrayBuffer`(~5MB copy)+ `File.write`。呢個成本 8-15 上線至今冇引致任何開機 jank 報告,昨晚模擬器實測開機都順。如果 W5 smoke 見到首屏卡幀,補救係將 write 延到 `InteractionManager.runAfterInteractions`——寫入 plan 做 contingency,唔預先做。
- **同「下一首」預載爭資源?** 唔會撞:兩邊共用同一條 module-level 串行隊列(同一時間全 app 最多 1 條落載),trackChanged 嘅 next-2 同開機名單自然排隊;`index.has()` 去重,唔會重複落載。快取係同一個 LRU,300MB/60 檔上限一齊管。
- **同 backend warm 嘅關係**:開機 `warmIds(6首)` 照舊先 fire(fire-and-forget),令 prefetch 嘅 GET 大概率行 warm 路徑(昨晚實測:頭 1 首 cold 6.5s、第 2 首已經 warm 3.8s)。兩層係配合,唔剷任何一邊。

---

## §6 失敗處理(用戶撳落去嗰刻預載未完成/爆咗)

維持「**永遠唔衰過而家**」原則,三條 path 全部係現役機制,本輪只加第 4 條:

1. **落載中被撳**:`cancelIfDownloading()` abort → 即場串流(= 而家嘅 9.6s 體驗);播放頁 `isLoading` spinner 一直顯示到 state=Playing(§3.2 機制),**唔存在「撳咗冇反應」**——體感同今日完全一樣。
2. **落載失敗**(403/502/timeout/半死連線):靜靜哋放棄 + `prefetchFail` beacon,唔 retry loop;90s timeout 保證唔會卡死成條隊(BATCH5 S4 實錘修過)。下次自然時機(trackChanged/下次開機)再排。backend 嗰邊 yt-dlp 統一 + preVerify + canary 已經係另一條線嘅保障,唔喺本輪範圍。
3. **本地檔本身壞**:PlaybackError → 現有 retry/skip 路徑 + `invalidate()` 剷檔,跌返串流。
4. **新增(W2-2)**:串流起播嗰刻無條件讓路——防背景落載同弱網串流爭頻寬,令 miss case 唔會比 baseline 更慢。

殘留風險(接受,唔喺本輪修):快取 key 只係 song id——如果某 id 嘅 youtube 片被換(refetch/換源),LRU 入面嘅舊音訊會照播到佢被汰換為止。同一風險喺現役 next-2 預載已存在,冇新增。將來 hardening 選項:檔名帶 youtube_id(`{id}_{ytid}.m4a`),toTrack 對唔上就當 miss——記低做 P3,唔阻本輪。

---

## §7 Android 做唔做?

**唔做,理由三個**:

1. **數字唔支持**:Android 暖 URL 第一首 1.8–2.7s、tapNext 0.8–3.0s(ExoPlayer 本身有 buffer-ahead)——同 iOS 嗰 9s AVPlayer 稅完全唔同量級。花流量慳 2 秒,唔抵。
2. **技術上要出新 APK**:audioPrefetch 依賴 expo-file-system native module,Android 現行 APK(vc54,runtime 4)冇呢個 module——條 code 而家就係靠 iOS-gate 先冇冧 Android(audioPrefetch.js 檔頭寫到明)。開 Android = 新 native build + 側載更新鏈,成本大好多。
3. **W1(抽選穩定化)Android 自動受惠**——佢係本輪唯一應該落 Android 嘅部分,而佢經 OTA 自然到位,唔使做任何 Android 專項。

留一句:如果第日 Android 都想「零 load」,機制係現成嘅(剷 Platform gate + 出 APK),等 iOS 呢輪驗收完有數據先講。

---

## §8 驗證方法(用返 8-22 晚建立嘅 harness)

### 8.1 模擬器實測(改完 code,OTA 前)

環境照抄昨晚:iPhone 17 Pro 模擬器 + metro(main branch JS)、API 行正式 tunnel、`DIAG_ENABLED` 臨時開(**測完還原,昨晚流程**)、OCR pause/resume 協調照 SUPERVISION-LOG 做法、iOS 沙箱快取先清空(冇種子污染)。baseline 直接用 8-22 晚:**凍 14.8s / 暖 9.6s / 本地 0.17s**,唔使重測 before。

| # | 場景 | 步驟 | 通過標準 |
|---|---|---|---|
| A | 開機命中 | 冷 cache 開機 → 等 backend log 見到預載 200 完成 → 撳「今日為你預備」頭 1 | `origin=start source=local`,**<1s**(預期 ~0.2s) |
| B | 開機搶閘 | 開機 3 秒內即撳今日頭 1(落載未完) | cancel 讓路,行串流,spinner 正常,ms 同 baseline 同級(≤15s),`aborted-for-stream` beacon 有影 |
| C | chip 命中 | 等預載完 → 撳「即刻揀歌」現用 chip 第 1 首 | `source=local` <1s |
| D | 隨心聽 | 快取有 ≥3 首時撳隨心聽 | 第一首 `source=local` <1s;隊列其餘部分同快取無關(抽查第 2-5 首唔全係快取歌) |
| E | 未冚入口 | 撳詩歌庫一首凍歌 | 行為同 baseline 一致(唔准衰過 9.6-14.8s 區間;W2-2 讓路 log 有影) |
| F | 抽選穩定 | 開機 → 等 background refresh 完成(backend 有 /api/hymns 記錄)→ 對比「今日為你預備」6 首前後 | **一首都冇換**(W1 生效);同一模擬器即日重開 app 再對一次 |
| G | 聽日命中 | 播歌 session 完結後 `simctl` 睇沙箱 audio-cache 有聽日 2 首檔;(可行的話)模擬器日期 +1 開機撳頭 1 | 檔案存在;跨日場景做唔到就以 F + 檔案存在間接驗,真機 W4 數據補實 |
| H | Android 回歸 | Android 模擬器同一 JS:首頁正常、抽選穩定(F 縮水版)、播歌 smoke、零 prefetch 網絡請求 | 全過 |

### 8.2 真機驗收(OTA 後,Eric 唔使做嘢)

- P2-1 修咗先,`nextTrackMs` 分佈先可信(<500ms stream 樣本唔使再人手剔)。
- Eric 真機開 `DIAG_ENABLED`(或者直接用 W4 嘅 origin=start 上報——佢跟 P1-1 嘅開關策略)行 3–7 日日常。
- 驗收指標:(a) `origin=start` 且 surface∈{today,chip,shuffle} 嘅樣本,**source=local 比率 ≥60%**;(b) source=local 嘅 p95 <1s;(c) source=stream miss case p50 冇差過 baseline;(d) `firstTapSurface` 分佈表——攞嚟決定 §10-4 加唔加碼。
- 對照表寫返入呢份 plan §11(照 IOS-ANDROID-PARITY §7 慣例留空回填)。

---

## §9 風險同副作用(流量/電/儲存/後端)

- **流量(最大項,要同 Eric 講清楚)**:
  - 每首詩歌 3–8MB(backend cap 12MB)。穩定狀態下每日開機新落載 ≈ chip頭1 + 聽日2 = **~3 首 ≈ 9–18MB/日**(今日頭 2 首多數琴晚已落載,`index.has()` 零成本 skip);最壞情況(新裝/斷開幾日/W1 前)5 首 ≈ 15–30MB。用戶冇撳=白落載,呢個係固有代價。
  - **冇 Wi-Fi gate**:netinfo/expo-network 都冇裝,加=新 native module=新 build,本輪唔做。緩解:名單 cap 死 5 首、串行、去重、聽日複用。如果 Eric 覺得蜂窩數據敏感,可以將名單縮到 3 首(剷聽日 2 首,代價係 race window 返返嚟)——§10-3 拍板。
- **電量**:每日幾條 HTTP + 5MB 寫盤,前台進行,可忽略;冇任何背景常駐/定時器新增。
- **儲存**:現有 LRU 300MB/60 檔冚住,iOS 儲存緊張時 Caches 會被系統自動清(設計如此,boot scan 重建)。
- **Backend 負載**:每個 app-open 多 2–3 個完整檔 GET(全用戶計)。而家用戶量細,`withWarmLock`/429 冷卻現成;唔使改 CACHE_SIZE_CEILING(P2-5 另一條線)。
- **版權合規**:Caches 目錄方案 8-15 已過 Eric,本輪冇改存放方式,冇新增合規面。
- **行為風險**:W1 改抽選算法(兩平台)、W3 改隨心聽第一首——都係用戶可感知嘅行為變化,所以逐項擺咗喺 §10 攞拍板,唔會靜靜哋上。

---

## §10 等 Eric 拍板(四件,答咗就可以派工)

1. **W1 抽選穩定化用 hash-rank?**(建議:係)影響:「今日為你預備/即刻揀歌」日內真正穩定唔再半路換歌(Android 都會變穩定);日與日照樣全套輪換。唔拍板呢條,聽日預載繼續空轉,成個 Phase 2.5 命中率上唔到去。
2. **隨心聽第一首偏向已快取歌?**(建議:係)零流量、即撳即出聲;代價係第一首唔係純隨機(喺已洗好嘅牌入面提前咗一隻「即開」嘅)。
3. **流量預算**:開機預載名單 5 首(~9-18MB/日,建議)定縮水 3 首(剷聽日 2 首,race window 返返嚟)?
4. **加碼名單**(可以延後):今日為你預備其餘 4 首(+~20MB/日)、最近加入頭 1——建議**等 W4 嘅 firstTapSurface 真機數據(1-2 星期)先決定**,唔好而家盲加。

**本輪明確唔做**:Android 預載啟用(§7)、Wi-Fi gate(要 native build)、部分檔案邊載邊播、native AVAsset 預熱/RNTP v5(IOS-NEXT-TRACK-PRELOAD 方向 1/4,本地檔方案已經達到同樣效果)、快取檔名帶 youtube_id(P3)、`downloadFileAsync` 遷移(P3)。

**工作量估算**:W1-W4 code 半日至一日(Sonnet 5)+ §8.1 模擬器驗證半日 + OTA;真機數據收 3-7 日後回填 §11。同 Batch B(P1-1/P2-1/theme 收乾等)夾同一次 OTA 最抵。

## §11 驗收數據(2026-08-23 上午模擬器實測回填)

_(baseline:凍 14,803ms / 暖 9,551ms / tapNext 本地 163-172ms,2026-08-22 夜,詳見 THIRD-PASS-REVIEW §3.1)_

**狀態**:W1–W4 已落地並通過 §8.1 全部 8 個場景。**未 OTA、未 restart backend**(等下次「一齊出街」窗口)。

### 11.1 環境

iPhone 17 Pro 模擬器(iOS 26.5,debug build + metro,main branch 現碼)+ hymntest AVD(API 34)。API 行正式 `api.odemusics.com` tunnel。`DIAG_ENABLED` 臨時開,**測完已還原 false**。OCR 協調:47H session 冇 running、`ps` 掃勻零 OCR/whisper/paddle/yt-dlp process、`fetchlyrics` plist 仍 disabled;10:37 `launchctl unload growlibrary`,11:03 load 返(`launchctl list` 兩邊都核實過)。iOS 沙箱 `audio-cache` 開測前清空(16 個舊檔搬咗去 session scratchpad)。

### 11.2 開機預載名單(W2)—— 逐條對得返

開機 10:42:29 → 歌單 load 完即刻串行落載,backend log 次序**同規格一模一樣**:

| # | id | 角色 | mode | total_ms | status |
|---|---|---|---|---|---|
| 1 | 6838 | 今日頭 1 | cold | 6,582 | 200 |
| 2 | 5962 | 今日頭 2 | warm | 2,986 | 200 |
| 3 | 1775 | 現用 chip(粵語敬拜)頭 1 | cold | 5,925 | 200 |
| 4 | 2548 | 聽日頭 1 | cold | 6,480 | 200 |
| 5 | 3976 | 聽日頭 2 | cold | 8,372 | 200 |

31 秒落齊 5 首、**21.2 MB**(同 §9「最壞 15–30MB」估算吻合)。5 個 id 同用另一支 script 由 live `/api/hymns` 獨立計出嚟嘅完全一致;首頁真係 render 出嚟嗰 3 張今日卡(6838 / 5962 / 2140)同 chip 第一行(1775「被愛 - SEMM」)亦都對得返。

### 11.3 八個場景

| # | 場景 | 結果 | 實測 |
|---|---|---|---|
| A | 開機命中 | ✅ | `ms=417 origin=start source=local surface=today first=1`(修完 abort bug 再測 `ms=359`)。**baseline 凍 14,803ms / 暖 9,551ms → 0.4s,快 24–35 倍** |
| B | 開機搶閘 | ✅ | 開機 10s 撳未預載嘅 4216 → 落載緊嘅 2548 即刻 `aborted=true` + `prefetchFail detail="aborted-for-stream"` beacon → 串流 `ms=9,856`(baseline 區間內);出咗聲之後背景落載自動恢復,被踢嘅 2548/3976 排喺新隊列 next-2(197/4123)後面補返晒 |
| C | chip 命中 | ✅ | `ms=377 origin=start source=local surface=chip first=0` |
| D | 隨心聽 | ✅ | 第一首 5962(快取歌)`ms=391 source=local surface=shuffle`;隊列第 2/3 首係 7813/2923 —— **同快取無關**,證明只郁第一位 |
| E | 未冚入口 | ✅ | 詩歌庫撳 id=4 → `ms=8,844 source=stream surface=other`,**冇衰過 baseline**(暖 9,551ms) |
| F | 抽選穩定 | ✅ | 見 11.4 |
| G | 聽日命中 | ✅ | 沙箱有 `2548.m4a` + `3976.m4a`;跨日開機做唔到(模擬器改唔到日期),以 F 嘅 ablation + 檔案存在間接驗,真機 W4 數據補實 |
| H | Android 回歸 | ✅ | 首頁正常;chip(國語敬拜)頭 4 首 = 5237/5333/220/6385,同離線計出嚟嘅一模一樣;播歌 `ms=9,690 source=stream surface=chip`;隨心聽 `source=stream surface=shuffle`(W3 自動 no-op);**測試窗內只有 1 條 `/api/stream` 請求 = 播緊嗰首,零預載** |

### 11.4 W1 抽選穩定化 —— 新舊算法對照

實測窗內個庫真係變咗(`/api/hymns` 由 6,049 → 6,044,delist 5 首;dataVersion 換咗 5 次)。用真 live 庫做 ablation:

| 算法 | 琴日個庫(6,049)嘅今日 6 首 | 今日個庫(6,044)嘅今日 6 首 | 換走 |
|---|---|---|---|
| 舊 seededShuffle | 286,1847,5476,1503,125,4308 | 7243,6449,8397,1492,1522,7302 | **6/6** |
| 新 hash-rank | 6838,5962,2140,1913,2470,208 | 6838,5962,2140,1913,2470,208 | **0/6** |

200 次隨機 delist 5 首:舊算法平均換走 **6.00/6**,新算法 **0.00/6**。加 1–100 首新歌:舊 6.00/6、新 0.00/6。App 內同樣核實:4 次開機(每次都有 background refresh)首頁三張今日卡完全冇變過。

分佈冇退步(300 日:舊 distinct 1,503 / max 4,新 1,533 / max 5;1000 日:舊 3,616 / max 8,新 3,691 / max 8)。⚠️ 呢個係加咗 murmur3 finalizer 之後嘅數 —— 淨用 FNV-1a 做分數,英文池(389 首)嘅「攞 argmin」用法會放大偏差(1000 日有一首被抽 15 次),詳見 `dailyShuffle.js` 註解。

### 11.5 順手修到嘅兩個 bug(都係實測拍到)

1. **P2-1 假快數守衛**(規劃書要求前置修):已加 `bufferingSeen`。今次全部 stream 樣本都係真數(8,844 / 9,856 / 9,690ms),冇再出現 8-22 嗰種 382ms 假快數。
2. 🆕 **abort 之後 `downloadOne` 可以永遠唔 settle**(場景 B 第 3 次重跑實錘):Expo 個 fetch/arrayBuffer promise 被 abort 之後唔一定 reject → `currentDownloadId` 永遠唔清 → **成個 session 之後零預載**(90 秒 timeout 都救唔到)。呢個 hazard 喺 W2-2 之前就存在(`cancelIfDownloading()` 一樣係 abort),但 W2-2 令佢由「偶然」變成「用戶每次撳串流歌都會發生」。已加 `abortRace()` 修好,scratch harness 有 regression test(唔修就重現得到)。順手修埋 `aborted-for-stream` 個標籤(Expo 掟 `FetchRequestCanceledException`,舊條件認唔到,主動讓路一直被當成真失敗上報)。

### 11.6 殘留風險

- **W4 只係收數**:`surface`/`first` 已經上報,但要 OTA + 1–2 星期真機數據先答得到 §10-4「加唔加碼」。
- **stream 樣本可能少報**:P2-1 守衛要求 stream 樣本見過 buffering/loading 先上報。真係有「一 Playing 都冇 buffer 過」嘅極快 stream 個案就會漏計。實測四次 stream 全部都經過 buffering,可接受。
- **30 秒安全網**:讓路之後如果首歌永遠去唔到 Playing,最多要等 30 秒背景落載先恢復。
- 快取 key 只係 song id(§6 原有殘留風險,冇新增)。
- 場景 G 嘅跨日開機未真正做過(模擬器限制)。
