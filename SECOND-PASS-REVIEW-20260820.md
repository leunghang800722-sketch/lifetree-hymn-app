# 第二輪全面 Review + iOS 模擬器實測(2026-08-20,Fable 5)

> 背景:8/19 第一輪 review(`FRONTEND-CODE-REVIEW-20260819.md`)之後,Batch1-6 共 23 個
> commit(F1-F11 + D1-D8 + O1/O2 + S1-S7 + storage + B1-B4 + 搜尋修補 + C1-C6)全部落地並經
> Opus5 code 層驗收,但一直未上過裝置。今次 Eric 拍板開 Xcode + iOS 模擬器做**真實測**,
> 加一輪針對 23 個 commit 嘅 code review。歌詞 OCR pipeline 全程維持暫停。
>
> ⚠️ 全程**冇改過任何 production code**(斷症用嘅 4 行 console.log 已 `git checkout` 還原,
> working tree 乾淨)。所有要改嘅嘢歸入 §5 BATCH7 清單等 Eric 拍板。

---

## 0. TL;DR

- **模擬器 build 成功**:`npx expo run:ios`(iPhone 17 Pro / iOS 26.5 / Xcode 26.5),app 正常起、
  首頁/詩歌庫/我的全部正常載入 —— **O2(uSES singleton)嘅 killer path 冇重現**,冷開機讀 cache
  即刻有歌、冇永久轉圈。
- **實測 15 項:9 pass、2 fail(揪到真 bug)、4 項 blocked**(見 §2 總表)。
- **最大發現(P1)**:全屏播放器開/收動畫嘅 completion callback 有陣時永遠唔 fire,
  `isAnimatingRef` 卡死 `true` 之後 **showPlayer/hidePlayer 永久 no-op,用戶被困(或者永久開唔返)
  播放器,只能重啟 app**。有 log 實錘,重現咗三次。係 v233 老 code 嘅潛在炸彈,唔係 23 個 commit
  引入,但今次先俾實測曝光(§3.1)。
- **第二大發現(P1)**:Universal Links **喺任何而家嘅 build 都唔可能 work** ——
  `6f98bb3` 只改咗 `app.json`,但呢個係 bare workflow,`ios/App/App.entitlements` 係空嘅,
  associated domains 從來冇入過 native project;加埋分享頁「喺 App 開啟」個掣用緊 Android-only
  嘅 `intent://` URL,iOS Safari 撳落去零反應(§3.2)。
- **播放類 smoke(O1/O2 嗰 5 項)全部 blocked**:測試期間 googlevideo upstream 對本機出口 IP
  **全面 403**(~16:57 開始持續成個測試 session,連 curl 全量拉都 403),即係已知嘅
  NordVPN 出口 IP 問題,**唔係 23 個 commit 嘅鑊**。呢 5 項要等 upstream 恢復先測到(§2.2)。
  副產品:今次 403 風暴**實地印證**咗後端 review 揪出嘅「buffered fast-path 冇 self-heal」
  問題(§3.3)。
- 第二輪 code review(兩個獨立 agent:前端+後端)結論:23 個 commit 嘅主體(ref 鏡像、uSES、
  O1-B2 拔 state、D1-D8 剷檔、storage singleton、seq guards、tee 生命週期、C1-C6)**全部檢過乾淨**,
  剩低嘅係 1 個 P2 + 一批 P3(§3.3-§3.4)。
- 建議 BATCH7 清單見 §5,**未動手,等拍板**。

---

## 1. 測試環境同方法

| 項 | 內容 |
|---|---|
| 機器 | iPhone 17 Pro 模擬器(有 Dynamic Island),iOS 26.5,Xcode 26.5 |
| Build | `npx expo run:ios` debug build(dev client + Metro),commit `208fbe4`(=23 個 commit 全落齊) |
| Backend | 用返行緊嗰個 prod instance(port 3001 經 `api.odemusics.com` tunnel),**冇開第二個 instance、冇 restart** |
| 操控 | headless:`idb`(HID tap/swipe/text)+ `simctl`(screenshot/openurl/pbcopy)。呢個 session 係 dispatched(非 attended),模擬器 live panel 開唔到,但 Simulator window 本身喺 Mac 螢幕有得睇 |
| 首次 build 障礙 | ① CocoaPods 死於 shell 冇 UTF-8 locale(`LANG=en_US.UTF-8` 解決);② fb-idb 同 Python 3.14 唔夾(patch 咗一行 site-packages);記錄喺度俾下次直接用 |

⚠️ **環境因素:googlevideo 全面 403**。由 16:57 起(backend log:`stream upstream bad status ... 403`)
所有 stream 嘅 upstream 拉取都 403 → backend 回 502,持續成個測試時段(>45 分鐘,冇間斷)。
`stream-health.log` 顯示今日 13:13 仲係 `ok=3 fail=0`,即係風暴喺下晝某刻開始。查過 `utun4`
(10.5.0.2)確認 VPN 行緊 —— 同 `STREAM-403-FGS-CRASH-PLAN` 嘅「NordVPN 出口 IP 被 googlevideo
封」假說完全吻合。**我冇掂 Eric 嘅 VPN/網絡設定**。所有依賴真播放嘅測試項因此 blocked。

---

## 2. 實測結果逐項

### 2.1 總表

| # | 項目 | 結果 |
|---|------|------|
| 1 | App 起機、首頁/詩歌庫/我的載入(O2 killer path) | ✅ PASS |
| 2 | O1/O2 ①進度條每秒郁 | ✅ PASS(2026-08-21 種 cache 補測,見 §8) |
| 3 | O1/O2 ②progress bar seek | ✅ PASS(§8) |
| 4 | O1/O2 ③mini player 顯示 + 掣有反應 | ✅ PASS(icon 即時反應嗰半 2026-08-21 補齊,見 §8) |
| 5 | O1/O2 ④自動轉歌更新標題/封面/總長 | ✅ PASS(§8,連插播回歸路徑都驗埋) |
| 6 | O1/O2 ⑤shuffle 唔彈 0:00(B14 guard) | ✅ PASS(§8,requeue 窗口總長全程冇彈 0:00) |
| 7 | 分享連結 universal link(https)| ❌ FAIL —— entitlement 根本唔喺 native project 度,詳見 §3.2 |
| 8 | 分享 SSR 頁 + `godmusic://` scheme 深連結(warm + cold start) | ✅ PASS(SSR 頁正常、scheme 兩種啟動方式都直入 SharedPlaylistSheet) |
| 9 | 搜尋(9a5db4c):英文 "shaken" | ✅ PASS(16 結果,標題 match 排先、歌詞/專輯 match 跟後,chips 即時更新,debounce 順) |
| 10 | 搜尋:中文「恩典」(pbcopy 貼入) | ✅ PASS(819 結果,標題優先,scroll 流暢,第二輪歌詞 match 正確排後) |
| 11 | Dynamic Island notice pill(3c9f127) | ✅ PASS(實拍到「呢首歌暫時載入唔到,跳去下一首」pill 完整喺 DI 下面,冇被遮) |
| 12 | FavoritesContext 連環撳心心(fb2ba23) | ✅ PASS(首頁 hitSlop 位 + 詩歌庫行尾,多次 toggle 狀態一致,「我的」count 同步啱) |
| 13 | PlaylistsContext(8d81efe):開清單 + 加歌 | ✅ PASS(Test7 建立→加歌→重啟 app 後 MMKV persist 正確「1 首」;double-add 由「加完即閂 sheet」呢個 UI 結構天然擋住) |
| 14 | AuthScreen 鍵盤(e4fb570) | ✅ PASS(iOS:成個 form 升起,email/密碼/登入掣全部喺鍵盤上面;**C5 改動本身係 Android-only,iOS 條 code path 冇郁過**,Android 嗰半今次測唔到) |
| 15 | slowHint 分階段文案(272d6b1/e130c12) | ✅ PASS(8 秒後由「正在載入音訊...」轉「網絡較慢,仲努力緊…」實拍到;「轉歌 reset」半項因為冇得成功轉歌,未完整驗) |

### 2.2 O1/O2 五項點解測唔到 + 點補

呢 5 項全部要**真係有聲、有 duration**先測到。今次 upstream 403 令每一次 load 都
`PlaybackError`,duration 永遠 0。**唔係 code 問題**(curl 直接打 backend、backend 直接打
googlevideo 都 403,同 app 無關)。

補測方法(upstream 恢復之後,~10 分鐘):模擬器 build 仲裝喺度,Metro 我留咗做運行(見 §6),
開 app → 播任何一首 → 五項照單執:①睇進度條郁 ②tap bar seek ③mini player icon
④等自動轉歌 ⑤撳 shuffle 睇總長。用 `idb` 都做到,或者 Eric 直接喺 Simulator window 手動兩分鐘。

> **→ 2026-08-20 晚已試過補測一次,upstream 仲係 403,詳見 §7。**

---

## 3. 發現(按優次)

### 3.1 P1 —— 播放器開/收動畫卡死:`isAnimatingRef` 永久鎖死,用戶被困要重啟 app

**位置**:[App.js:719-749](frontend/hymn-app/App.js:719)(`showPlayer`/`hidePlayer`,v233 `e28e81c` 引入,**唔係今次 23 個 commit**)

**實錘過程**(落咗 4 行臨時 console.log,已還原):
1. 17:13 —— tap mini player,log 出 `showPlayer expanded=false animating=false`(guard 過咗、
   動畫開始),但 2 秒後 overlay **冇出現**;再 tap 一次,log 出
   `showPlayer expanded=true animating=true` → **上次個 `Animated.timing(...).start(callback)`
   嘅 callback 從來冇 fire**,`isAnimatingRef` 卡死 `true`、`overlayExpanded` 卡死 `true`
   但 overlay 實際隱形(native translateY 冇郁)。之後 mini player 撳極都開唔返播放器。
2. 17:29 —— 相反方向再現:overlay 開住,tap 收埋掣,log 出
   `hidePlayer expanded=true animating=false`(guard 過咗、close 動畫開始),畫面紋風不動;
   再 tap 出 `hidePlayer expanded=true animating=true` → 又卡死,**用戶被困喺播放器入面**,
   收埋掣/mini player 全部永久 no-op,唯一出路係 kill app。
3. 最初 16:57 嗰輪(未有 log 前)都撞過同一形態:transport 掣+收埋掣全部冇反應,而 pills 行
   (最愛/歌詞/分享/清單)一直正常 —— 事後對返,同呢個 wedge 完全吻合。

**根因結構**:`useNativeDriver:true` 嘅 overlay translateY 動畫間中**唔行/唔完成**
(觸發時機同 PlaybackError 風暴 + LogBox 高頻 render 相關;dev client 嘅 JS 重載可能加劇,
但 §1 第 2 次重現係喺同一個新鮮 JS instance 入面,唔可以齋賴 dev 環境)。而
`showPlayer`/`hidePlayer` 個 `isAnimatingRef` guard **100% 信個 callback 會嚟**:冇 timeout、
冇 `{finished}` 分支、`setOverlayExpanded(false)` 仲要擺埋喺 callback 入面 —— callback 一失蹤
就成個狀態機鎖死,冇任何自癒路徑。

**點解係 P1**:一撞即係「成個播放器 UI 廢咗直到重啟」。就算 release build 冇 LogBox、
觸發率低好多,呢個 guard 設計係零容錯,而 iOS 真機都有 PlaybackError 風暴場景
(飛行模式/斷網聽歌)。修法方向見 BATCH7-1。

### 3.2 P1 —— Universal Links 成條鏈斷咗(entitlement 冇入 native project + 分享頁 iOS 掣係死嘅)

**實測**:`simctl openurl https://api.odemusics.com/p/<token>` → 開咗 **Safari**(唔係 app)。

**根因 A —— `6f98bb3` 係半成品**:佢淨係加咗 `app.json` 嘅 `ios.associatedDomains`,但呢個
repo 係 bare workflow(`ios/` 成個 commit 咗),`app.json` 呢個 field **只有跑 `expo prebuild`
先會生效**,而 [ios/App/App.entitlements](frontend/hymn-app/ios/App/App.entitlements) 而家係
**空 dict**。即係:模擬器 build、將來由呢個 `ios/` 砌出嚟嘅 TestFlight build,**全部冇
associated domains entitlement,universal link 冇可能 work**。(仲要記得 Apple Developer
portal 個 App ID 都要開 Associated Domains capability。)

**根因 B —— 分享頁「喺 App 開啟」係 Android-only**:`backend/routes/share.js` 個
`intentUrl()` 出嘅係 `intent://p/<token>#Intent;scheme=godmusic;package=...`,iOS Safari
完全唔識呢種 URL —— 實測撳落去**零反應**。iOS 用戶裝咗 app 都冇路由入 app。

**Work 嘅部分**(實測過):
- AASA endpoint ✅(`application/json`、appID `3W5QC3PLSD.com.hymnapp.praise`、paths `/p/*`)
- SSR 分享頁 render ✅
- `godmusic://p/<token>` scheme 深連結 ✅ —— warm start 同 cold start 都正確打開
  SharedPlaylistSheet(cold start 直入,零問題)
- 順帶一提:warm start 時如果 AuthScreen 之類 modal 開住,share sheet 會開喺佢**下面**
  (我撞到一次:sheet 其實開咗,俾 AuthScreen 冚住,似冇反應)。細 UX 位,列 P3。

修法見 BATCH7-2。

### 3.3 P2 —— backend:buffered fast-path 續播失敗冇 self-heal(今次 403 風暴實地印證)

**位置**:[stream.js:307-315](backend/routes/stream.js:307)(§7.5 `5753fff` 嗰個 `res.destroy()` 修法)

後端 review agent 靜態揪出:fast-path 續播 fetch 失敗時淨係 `res.destroy()`,**冇 evict 個
bufferCache entry、冇 bust resolve cache** —— client retry 必然行返同一條死路(同一 cached URL、
同一個 buffered head、同一個 403),而冷路徑嗰套 backoff→bustCache→re-resolve 自癒機制永遠
唔會著。要等 25 分鐘 TTL 過期先甩身。

**今日 backend log 就係現場**:403 風暴期間一堆
`mode=warm resolve_ms=0 ... status=206`(頭截由 buffer 出,秒回)夾住
`mode=warm ... status=502`(過咗 buffer 就撞 403)——完美示範「buffered head 遮住條死 URL」。
修法一行起兩行止:失敗分支加 `bufferCache.delete(youtubeId)`(或 bust),俾 retry 跌返落
冷路徑行自癒。→ BATCH7-3

### 3.4 P3 批(兩個 review agent + 實測綜合,全部驗證過先入表)

**後端**(範圍 `1596a3a..7c6dd07`,B1-B4 已上 prod 所以改完要過 deploy gate):

| # | 位置 | 問題 |
|---|------|------|
| b1 | [resolveAudio.js:467](backend/lib/resolveAudio.js:467) | `adoptStreamedHead` 嘅「有 entry 就唔蓋」guard 令**最快完成嗰條 tee 永久贏**:AVPlayer 冷開常見 1MB probe 先完→ 佢個 1MB stub 霸住 25 分鐘,後面完整 12MB head 被丟棄,§7.3-A 效果打折。修:`buf.length > existing.buf.length` 先准蓋 |
| b2 | [resolveAudio.js:382](backend/lib/resolveAudio.js:382) | `fetchTailBuf`/`fetchHeadWithRetry` 冇 timeout/AbortSignal:一條 hang 住嘅 googlevideo 連線會塞住成個 `withWarmLock` 隊(每個排隊 closure 揸住 ~12MB headBuf)。修:`AbortSignal.timeout(15000)` |
| b3 | [stream.js:100](backend/routes/stream.js:100) | `isStreaming(yt) \|\| anyStreaming()` —— 前者被後者完全包含,死 code 一粒 |
| b4 | [server.js:98](backend/server.js:98) | AASA 淨係掛咗 `/.well-known/` 路徑,root fallback `/apple-app-site-association` 404。舊 iOS/驗證器會 fallback 去 root,一行加多個 alias |
| b5 | [warmLog.js:44](backend/lib/warmLog.js:44) | `recordWarmIds` 冇 normalize id 型別(`123` vs `"123"` 當兩個),加 `Number.isInteger` filter |

**前端**:

| # | 位置 | 問題 |
|---|------|------|
| f1 | [AuthContext.js:51](frontend/hymn-app/src/context/AuthContext.js:51) | `register`(email 註冊)最後一個 caller 俾 D6 剷咗,成個 callback + `/api/auth/register` fetch + context field 係孤兒 code |
| f2 | [AddFriendSheet.js:30](frontend/hymn-app/src/components/AddFriendSheet.js:30) | S7c 淨係修咗「閂 sheet reset」,`handleLookup` 冇 in-flight seq 失效:慢網撳搵→閂 sheet→response 返嚟照 `setResult`,下次開 sheet 見到上次嘅殘留 relation card。隔籬檔(InviteFriendsSheet S7b)嗰套 seq pattern 搬過嚟就得 |
| f3 | [api.js:5](frontend/hymn-app/src/api.js:5) | 檔頭註解仲講緊 D4 已剷走嘅 `authHeaders()/getToken()`,誤導後人 |
| f4 | [App.js:999](frontend/hymn-app/App.js:999) | D2-guard 註解話 RemoteDuck permanent 分支「冇 set flag」——H2(9f078d0)已經修咗,註解過時,會令人低估 H2 覆蓋面 |
| f5 | [LibraryScreen.js:97](frontend/hymn-app/src/screens/LibraryScreen.js:97) | 歌詞 side index 喺**第一下搜尋鍵入嘅 render 入面**同步起(~6k 首全歌詞 norm()),主線程一次過 stall。模擬器上感覺唔到卡,真機低端機可能有感。如果 Eric 真機覺得第一下搜尋窒,搬去 effect/idle 起 |
| f6 | [App.js:1656](frontend/hymn-app/App.js:1656) | H6 playQueue 串行鏈冇 supersede:連環快撳 N 首歌會逐個做完 N 次 reset+add(全隊)+play,中間每首都響一下先到最後嗰首。加 generation counter 跳過已過時嘅隊員(polish) |
| f7 | share warm-start(§3.2 尾)| modal 開住時深連結個 share sheet 開咗喺 modal 下面,似冇反應 |

**檢過乾淨(冇發現,零 action)**:FavoritesContext/PlaylistsContext ref 鏡像全套、O1-B2 拔
state 零殘留(grep 實證冇人再讀 `player.currentTime`、冇殘留雙寫)、O2 uSES 訂閱時序、O10 七檔
換 storage singleton、D1-D8 剷檔零殘留 import、App.js 九個 StyleSheet 零死 key、C4 slowHint
reset 正確、C6 manifest `tools:node="remove"` + debug overlay 分析正確、tee 生命週期三條路都清
`teeChunks`、bufferCache LRU 上限不變、daily cron 冇 stampede、C3 時區 record/pick 一致、
withWarmLock 唔會 deadlock。

### 3.5 觀察(唔係 bug,記低)

- **RNTP sleep-timer WARN ×4**:`getSleepTimerProgress` 等四個 JS method 喺 iOS native module
  搵唔到簽名 —— RNTP fork/patch 版本嘅上游噪音,一直存在,唔影響播放,唔使理。
- **Dev client 期間見過幾次 JS 重載**(部分係我自己 reload/重啟,至少一次自發)。3.1 嗰個
  wedge 喺重載後嘅新鮮 instance 都重現到,所以唔可以用「dev 環境」完全解釋,但 release build
  嘅實際觸發率未知。
- **PlaybackError 前台三連跳邏輯**:實測見到 notice pill 有出、有跳,但喺 wedge 狀態下
  skip 都會靜靜哋失效(native queue 未起好時 `skipToNext` 掉入 silent catch)。呢個同 3.1
  綁埋一齊睇。
- 模擬器留低咗少少測試數據(本地 Test7 清單一個、最愛一首),全部係模擬器本地 MMKV,
  唔影響任何真實數據;順手仲驗埋 mmkv persist 重啟後正確。

---

## 4. 已知限制 / 冇嘢好做

| 項 | 點解 |
|---|---|
| Universal link「app 直開」喺模擬器 | 就算 entitlement 修好,模擬器 AASA 驗證都要 CDN/developer mode 配合;真正驗收要 TestFlight 真機。今次已經確定咗**更早嘅斷點**(entitlement 空),所以模擬器測唔到反而唔係樽頸 |
| C5(AuthScreen KAV)Android 半 | 改動係 Android-only,今次 iOS 模擬器;iOS 半(padding 行為)已 PASS。§9 Android 專項照舊等有 Android 測試能力 |
| O1/O2 五項 | 環境 blocked(§2.2),唔係冇得測,係今日 upstream 唔俾面 |
| 403 風暴本身 | 根因係出口 IP 被 googlevideo 封(已知 NordVPN 問題,`STREAM-403-FGS-CRASH-PLAN` 範疇),唔係今次 scope,我冇掂 VPN |

---

## 5. BATCH7 建議清單(未動手,等 Eric 拍板)

> 跟返 Fable5 規劃 → Sonnet5 執行 → Opus5 驗收嗰套。每項獨立 commit、pathspec 紀律照舊。
> 後端項改完要過 deploy gate 先生效;B7-2 有 native build 成分。

| # | 優次 | 項目 | 檔案 | 出街方式 |
|---|------|------|------|----------|
| B7-1 | **P1** | 播放器開/收動畫 wedge 自癒:`isAnimatingRef` 加 timeout fallback(duration+300ms 必清)、`hidePlayer` 將 `setOverlayExpanded(false)` 移出 callback(或加 JS-driven fallback)、處理 `{finished:false}`;順手令 show/hide 可重入 | `frontend/hymn-app/App.js` | OTA 得 |
| B7-2 | **P1** | Universal Links 補完:①`ios/App/App.entitlements` 加 `com.apple.developer.associated-domains: applinks:api.odemusics.com`(+Xcode project capability,+Apple Developer App ID 開 capability——呢步要 Eric 或有 portal 權限嘅人);②share.js SSR 頁按 UA 分流:iOS 出 `godmusic://p/<token>` href(scheme 已實測 work),Android 照舊 intent:// | `ios/` + `backend/routes/share.js` | ①要 **native build**(順 Batch4/iOS 專項);②backend restart |
| B7-3 | **P2** | buffered fast-path 續播失敗 → evict bufferCache entry(+bust),俾 retry 行冷路徑自癒 | `backend/routes/stream.js` | backend restart |
| B7-4 | P3 | adoptStreamedHead:新 head 長過現有 entry 先准蓋(1MB probe stub 問題) | `backend/lib/resolveAudio.js` | backend restart |
| B7-5 | P3 | warm-lock fetch 全部加 `AbortSignal.timeout(15s)` | `backend/lib/resolveAudio.js` | backend restart |
| B7-6 | P3 | AASA 加 root path alias | `backend/server.js` | backend restart |
| B7-7 | P3 | `recordWarmIds` id normalize | `backend/lib/warmLog.js` | backend restart |
| B7-8 | P3 | AddFriendSheet lookup 加 seq guard(照抄 S7b pattern) | `src/components/AddFriendSheet.js` | OTA |
| B7-9 | P3 | 死 code / 過時註解清理:AuthContext.register、api.js 檔頭、App.js D2 註解、stream.js `isStreaming\|\|anyStreaming` | 四檔 | OTA + backend restart 順車 |
| B7-10 | P3 | (條件項)LibraryScreen 歌詞 index 搬離 render —— **先等 Eric 真機試搜尋有冇窒,有先做** | `src/screens/LibraryScreen.js` | OTA |
| B7-11 | P3 | playQueue 加 generation supersede(連環撳歌 polish) | `frontend/hymn-app/App.js` | OTA |

另外兩件唔入 BATCH7 但要記錄:
- **O1/O2 五項裝置 smoke 未完成**——upstream 恢復後補測(~10 分鐘,可以我做或者 Eric 手動)。
- **B7-1 修完之後**,今次三個「掣冇反應」現場(transport 死掣、困喺 overlay、mini player 開唔返)
  應該一併消失;驗收嗰陣要專登喺 PlaybackError 風暴下(飛行模式)開收播放器十次過先算數。

---

## 6. 環境留低咗啲乜(俾下一手)

- 模擬器 iPhone 17 Pro(UDID `FF770D48`)booted,app `com.hymnapp.praise`(debug dev client)
  裝咗;**Metro 仲行緊**(背景 process,log 喺 scratchpad `expo-build.log`)。想執走:
  `pkill -f "expo run:ios"` + `xcrun simctl shutdown FF770D48-...`。留住嘅話 Eric 可以即刻
  喺 Simulator window 手動玩。
- 模擬器 `ConnectHardwareKeyboard` 已較做 false(軟鍵盤會彈,測 KAV 用)。
- 裝咗兩件工具:`cliclick`(brew,最後冇用到)、`idb`(brew idb-companion + pip fb-idb,
  **有用**,fb-idb 喺 Python 3.14 要 patch `/opt/homebrew/lib/python3.14/site-packages/idb/cli/main.py`
  嗰行 `get_event_loop`——已 patch,下次直接用得)。
- `git status`:working tree 對比開工前**零新改動**(App.js 臨時 log 已還原)。

---

## 7. 補測第一次嘗試(2026-08-20 19:13–19:25,Fable 5)

Eric 追問點解冇即刻補測,即場試咗一次。**結論:googlevideo 對本機出口 IP 仲係 403,五項照舊 BLOCKED**,但今次試出咗幾樣有價值嘅嘢。

### 7.1 做咗啲乜

1. **環境零重建**:模擬器(iPhone 17 Pro)由上輪一直 booted、Metro 一直行緊 8081,app 直接 `simctl launch` 開返 —— 冇 rebuild,冇同 OCR pipeline 爭資源。
2. **實播兩首**(播全部 → 恩典太美麗 id=1;搜尋 → 惟獨祢 Only You id=77):兩首都
   `正在載入音訊…` → `網絡較慢,仲努力緊…` → `[PlaybackError] Unknown error`,duration 全程 0:00。
3. **backend log 現場**(`/tmp/hymn_backend.log`):每次 load 都
   `stream upstream bad status … status=403` → 客戶端收 502,同上輪一模一樣。
4. **直接實錘出口 IP**:`yt-dlp -f 18 -g` 解到新鮮 googlevideo URL(resolve 冇事),
   跟手 `curl -r 0-1024` 打條 URL → **403**。即係唔關 backend/app 事,係 googlevideo 封緊呢個 IP。

### 7.2 陷阱:stream-health「ok=3」係假陽性

開波前 `stream-health.log` 一路 ok=3、我 curl health 三隻 id(42/77/5431)全部 206,一度以為通咗。
其實嗰三個 206 全部 `resolve_ms=0` —— **食緊 warm buffer 個 head,根本冇掂過 googlevideo**。
App 真播就要開放式 range,過咗 buffered head 就撞 403 → 502。呢個係 §3.3 P2
「buffered fast-path 遮住條死 URL」嘅又一實地印證:**而家個 health check 驗唔到呢類斷網,
403 風暴期間會照樣報 ok**。BATCH7 做 B7 backend 批嗰陣,health check 值得加一個
bust-cache/跳過 buffer 嘅 probe(可以掛喺 B7-2/B7-3 順車)。

順帶:試過用 warm 歌(id=77)行「buffer 頭幾十秒做部分 smoke」嘅變通位 —— 唔 work,
因為 AVPlayer 開放式 range 一定要 upstream 接力,一 403 成個 response 都完蛋,冇得淨播 head。

### 7.3 觀察:retry storm 期間 dismiss 滯後(唔算新 bug)

PlaybackError 風暴進行中,撳收埋 chevron / swipe down 收播放器,**當刻完全冇反應**,
約一兩分鐘後先突然收埋(app 冇 kill 過,自己返到清單頁)。特徵似 JS thread 俾
retry/prefetch 風暴塞住,touch 事件排隊晏咗先處理 —— 同 §3.1 B7-1 嗰批「掣冇反應」現場
係同一個生態。唔另開 bug,但 B7-1 驗收個「飛行模式開收十次」計劃(§5)可以順便冚埋呢個位。

### 7.4 403 時間規律 + 幾時再試

Backend log 入面 403 burst 嘅分佈(本地時間):

| 日期 | 403 時段(本地) | 之後幾時恢復 |
|------|----------------|--------------|
| 08-17 | 12:15–17:04 | 當晚恢復 |
| 08-19 | 13:xx、15:xx、16:57 起(review 嗰輪) | 當晚 ~01:13 前恢復(8-20 凌晨有 cold 206) |
| 08-20 | **16:57 起,19:25 仍未解**(最後一個 cold 206 係 16:57) | 未知 |

規律:**風暴多數午後開始、深夜前散**。建議今晚遲啲或者聽朝早再試(五項 smoke 全程 ~10 分鐘,
環境留晒喺度唔使 rebuild)。根治仍然係 NordVPN 出口 IP 嗰邊(`STREAM-403-FGS-CRASH-PLAN` 範疇),
我照舊冇掂 VPN/網絡設定。

### 7.5 執尾

- 測完即刻 `simctl terminate` 咗個 app,唔留佢喺度 retry storm 打backend(OCR pipeline 行緊,唔益佢)。
- 模擬器照舊 booted、Metro 照舊行緊,下次補測即開即用。
- Working tree 零改動(今次純測試 + 更新本文件)。

---

## 8. 五項播放 smoke 補測完成(2026-08-21 13:29–13:35,Fable 5)—— 全部 PASS

Eric 唔想再等 403 自然散,要求搵唔靠實時 YouTube 嘅測法。用咗**種 cache**方案,五項全過。

### 8.1 方法:host 直接種本地音檔入 app 嘅 prefetch cache(零 code 改動、零 backend 接觸)

原理:IOS-ANDROID-PARITY §5 Phase 2 嘅本地預載已實裝(`src/audioPrefetch.js`)——
`toTrack()` 建隊列嗰刻見到 cache 有 `<id>.m4a` 就直接用 `file://` URI,完全跳過網絡;
boot scan(`initCache()`)會自動 index cache 目錄入面所有 `.m4a`。所以唔使 stub、唔使改
任何 code:由 host 直接擺三個真音檔入模擬器沙箱嘅
`Library/Caches/audio-cache/`,app 重開即認得。

實際步驟:
1. repo root 本身有齊 lyrics pipeline 落載過嘅完整媒體檔,揀咗 youtube_id 對得返
   DB 嘅三首:**id=1 恩典太美麗 / id=2 這一生最美的祝福 / id=3 我要向高山舉目**
   (正好係詩歌庫 `ORDER BY id` 頭三行)。
2. `nice -n 19 ffmpeg` 抽 audio 轉 AAC m4a(opus→AAC,AVPlayer 食唔到 opus),
   低優先級避開 OCR pipeline。
3. `cp` 入 `<模擬器app沙箱>/Library/Caches/audio-cache/{1,2,3}.m4a`,
   `simctl launch` 開 app(模擬器/Metro 沿用 §6 留低嘅環境,零 rebuild)。
4. 播放時 duration 顯示 **4:50 = 本地檔實際長度**(DB 記 5:01,係另一剪接),
   實錘行緊 `file://` 本地檔,唔係網絡串流。

### 8.2 五項結果(全部 PASS,idb tap + 截圖實拍)

| # | 項目 | 結果 | 實證 |
|---|------|------|------|
| ① | 進度條每秒郁 | ✅ PASS | 0:01 → 0:37,thumb 同步前移 |
| ② | progress bar tap seek | ✅ PASS | tap 75% 位 → 0:37 跳 3:29,繼續播 |
| ③ | mini player icon 即時反應 | ✅ PASS | 撳 pause→0.7s 內變 ▶;再撳→0.7s 內變 ⏸(上輪「部分 PASS」嗰半而家補齊) |
| ④ | 自動轉歌更新標題/封面/總長 | ✅ PASS | id=1 播到自然完結,自動接落一首,標題/封面/總長(2:05)全部即時更新 |
| ⑤ | shuffle 唔彈 0:00(B14 guard) | ✅ PASS | 連拍 6 張:requeue 窗口 position 短暫歸 0 但**總長全程 keep 2:05 冇彈 0:00**,~0.6s 內 seek 返 0:57 繼續播 |

額外收穫:
- **④嗰下其實連「插播完接返原隊列」路徑都驗埋**:app boot restore 咗上次 session 嘅
  31 首隊列,喺詩歌庫撳 id=1 係插播;佢播完自動接返原隊列下一首(兒童歌,非本地檔)
  ——而且嗰首係**真串流成功播出**。即係 13:33 嗰刻 upstream 對本機出口 IP 係通嘅
  (吻合 §7.4「風暴午後先開始」規律;今次測試撞正上晝好時段,連 streaming 都順手驗埋)。
- §3.1 P1 動畫 wedge 今輪冇重現(開/收播放器各一次都順)。

### 8.3 執尾(100% 還原證明)

- 測完即刻 `simctl terminate` app。
- 我種嘅 `1.m4a/2.m4a/3.m4a` 已由 cache 目錄剷走(`ls` 核實)。目錄剩返一個
  `4808.m4a`——嗰個係測試期間 **app 自己嘅 prefetch 機制**正常落載嘅(嗰陣 upstream
  通緊),係 production 行為產物,唔係我種嘅,照留。
- Backend/DB/前端 code 零接觸零改動;冇起過任何新 server/instance;backend 期間
  只收過 app 正常嘅 metadata/warm/prefetch request,OCR pipeline 冇受影響。
- 呢個「種 cache」測法可以隨時重用:三個 m4a 響 ffmpeg 一分鐘內重生,唔使留檔。

**至此 §2 總表 15 項全部有終局結果:13 PASS、2 FAIL(§3.1/§3.2,已入 BATCH7 範疇),
O1/O2 verification 正式收爐。**
