# 前端 Code Review — 2026-08-19

範圍:`frontend/hymn-app/`(App.js + src/ 全部,共 14,401 行)+ `index.js`、`app.json`、`android/app/src/main/AndroidManifest.xml`、`ios/App/Info.plist`、`ios/App/App.entitlements`、`package.json`、`plugins/`。

**呢輪淨係睇 + 規劃,冇改過任何一行 code。** 冇 build、冇跑 emulator/simulator、冇 gradle/pod、冇碰 git(共用 worktree)。所有結論都係靜態閱讀 + 可達性分析 + 一次 read-only 嘅 `sqlite3 -readonly hymns.db` 查歌庫規模(6,232 首、歌詞總長 733KB)。

---

## 0. 摘要數字

| 項目 | 數字 |
|---|---|
| src + App.js 總行數 | 14,401 |
| **完全 unreachable 嘅檔案** | **24 個,~3,970 行(27.6%)** |
| App.js 單一檔案 | 3,348 行(全 repo 最大) |
| 高危 bug(P0) | 6 項 |
| 明顯死碼(P1) | 8 組 |
| 效能/優化(P2) | 12 項 |
| iOS/Android 分歧 | 8 項(其中 1 項係真功能缺失) |

---

## 1. P0 — 高危 bug(會有用戶可見後果)

### H1. 鎖屏撳「播放」之後,D2 守衛永久失效

- **檔案**:[App.js:1012-1040](frontend/hymn-app/App.js:1012)(`PlaybackPlayWhenReadyChanged` listener)、[track-player-service.js:20](frontend/hymn-app/src/track-player-service.js:20)(`RemotePlay`)
- **問題**:`expectPlayingRef` 一共有 12 個寫入點,全部喺 App.js 入面(in-app 撳掣、watchdog、playQueue…),加上 `RemotePause`/`RemoteStop` 經 `playback-intent.js` 傳過嚟嗰條「設 false」嘅路。**冇任何一條路會因為鎖屏/耳機/Control Center 撳「播放」而將佢撥返 `true`** —— `RemotePlay` handler 淨係 `TrackPlayer.play()`,`RemoteNext`/`RemotePrevious` 同理。
- **後果**:用戶喺鎖屏撳一次暫停,再撳返播放 → `expectPlayingRef` 一路卡喺 `false`,直到佢開返 app 撳 in-app 播放掣為止。呢段時間 **D2 守衛(native 靜靜熄咗 playWhenReady → 自動 `play()` 救返)完全唔會出手**。而呢個正正就係 D2 本身要 cover 嘅場景(鎖屏 + 背景)。即係話 8-17 修好「撳暫停彈返播」之後,代價係「鎖屏 resume 之後失去自動救援」,而且用戶完全冇感知。
- **平台**:兩邊都中。
- **建議**:同一個 listener 加一行 —— `if (event?.playWhenReady === true) expectPlayingRef.current = true;`。一句過覆蓋 RemotePlay / RemoteNext / RemoteDuck resume / native 自己 resume 全部路徑,唔使逐個 call site 補。
- **風險**:極低。呢個賦值只會令守衛「更加會出手」,唔會令佢誤 pause。

### H2. RemoteDuck(電話 / 其他 app 搶 audio focus)會同 D2 打交,音樂會喺唔應該響嘅時候響返

- **檔案**:[track-player-service.js:45-52](frontend/hymn-app/src/track-player-service.js:45)、[App.js:1033](frontend/hymn-app/App.js:1033)
- **問題**:電話打入 / Siri / 另一個 app 攞走 audio focus 嗰陣,native 會 pause → `playWhenReady=false`。呢條路**冇** call `markRemotePauseExpected()`,所以 `expectPlayingRef` 仲係 `true` → D2 見到「未預期嘅 playWhenReady=false」→ 即刻 `TrackPlayer.play()`。結果:**講緊電話 / 開緊 YouTube 嗰陣,詩歌自己響返**。
- App.js:1005-1011 個註解自己已經寫低咗呢個缺口(「理論上可能被誤判…呢個 race 未實測過」)。靜態上睇,佢唔止係理論 —— 三條分支(`permanent:true`、`paused:true & permanent:false`、以及 `autoHandleInterruptions` native 自己 pause)全部都會走入 D2 個 `play()`。
- **平台**:兩邊都中,但 **Android 更易撞** —— AUDIOFOCUS_LOSS(用戶開第二個播放器)係日常操作,唔使打電話。
- **建議**:`RemoteDuck` handler 喺 `event.paused === true` 嗰下 call `markRemotePauseExpected()`(`permanent:true` 尤其要),等 D2 唔好干預 interruption。要同 H3 一齊做(consume-once 語義)。
- **風險**:低。做完之後 interruption 結束嘅恢復照樣行返現有嘅 `paused===false && !permanent → play()` 路。

### H3. `consumeRemotePauseExpected()` 喺 `playWhenReady=true` 嗰啲 event 一樣會燒咗支旗

- **檔案**:[App.js:1024](frontend/hymn-app/App.js:1024)
- **問題**:而家係無條件先 `consume`,之後先睇 `event.playWhenReady === false` 決定用唔用。如果 `markRemotePauseExpected()` 之後、對應嗰個 `false` event 到之前有一個 `playWhenReady=true` event 插隊(例如 RemotePause 撞正 watchdog 嘅 `play()`、或者 native 連發兩個 event),支旗會俾嗰個 true event 食咗 → 真正嗰個 false event 見到 `false` → D2 又會幫用戶 `play()` 返。**即係 8-17 修嗰個「撳暫停即刻彈返播」嘅 bug 會喺 race 之下復發。**
- **建議**:改成 short-circuit,`false` event 先 consume:
  `if (event?.playWhenReady === false && consumeRemotePauseExpected()) expectPlayingRef.current = false;`
- **風險**:極低,純粹收窄 consume 條件。

### H4. `resyncFromNative` 可以一次過打幾百個 `/api/hymns/:id` request

- **檔案**:[App.js:1091-1100](frontend/hymn-app/App.js:1091)
- **問題**:`toHymn()` 喺 `hymnsRef.current` 搵唔到就 `safeFetchHymnDetail()`,再 `await Promise.all(q.map(toHymn))` —— **冇任何並發上限**。冷啟動嗰個 800ms timer 行嗰陣,歌庫多數仲未 load 好(要 MMKV `JSON.parse` 幾 MB + 網絡),所以 `lib` 會係空。native queue 如果係「兒童 476 首」或者「隨心聽 6,232 首」,就係 476–6,232 個並發 HTTP request,每個 8 秒 timeout。
- **後果**:(a) 手機自己塞死;(b) backend 係 Eric 部 Mac,而家仲要同 PaddleOCR 爭 CPU —— **呢種 request storm 正正係之前 403 / stream stall 嗰類資源爭奪嘅成因**;(c) 離線嗰陣一樣會 fire 晒,再等 8 秒 ×N。
- **建議**:① `hymnsRef.current` 為空就直接唔好 fetch detail,用 track 砌最低限度 object 就算 —— 反正 `useCachedHymns` 一 load 好,`FullScreenPlayerOverlay` 個 `liveHymn` lookup([App.js:2372-2380](frontend/hymn-app/App.js:2372))就會自動補返最新版(呢個機制係 dataVersion cache-bust 事故之後加嘅,本身就係為咗解決同一類問題);② 真係要 fetch 都要限流(最多 3-5 個並發)+ 只補 current index 前後幾首。
- **風險**:中(要改 resync 路徑),但收益最大。

### H5. 「上一首」冇跟「下一首」嗰個 iOS 修復

- **檔案**:[App.js:1783 `handleNextTrack`](frontend/hymn-app/App.js:1783) vs [App.js:1804 `handlePrevTrack`](frontend/hymn-app/App.js:1804)
- **問題**:`handleNextTrack` 因為 SwiftAudioEx `next()` 唔傳 `playWhenReady:true`(註解 1770-1782 有完整分析),所以明文再 `play()` 一次 + 設 `expectPlayingRef = true`。**`handlePrevTrack` 兩句都冇。** 但 SwiftAudioEx `previous()` 同 `next()` 係同一套實現(都係 `queue.previous()/next()` → `onCurrentItemChanged()` → `super.load(item:)`,一樣冇傳 playWhenReady),所以「撳上一首要再撳多次 play 先出聲」呢個 iOS bug 邏輯上一模一樣存在,只係未有人特登試過。
- **平台**:iOS 影響;Android 加咗都係 no-op(同 next 一樣)。
- **建議**:`handlePrevTrack` 兩條路徑(`skipToPrevious()` 成功、同 catch 到嘅 `seekTo(0)`)後面照抄 next 嗰兩句。
- **風險**:極低。

### H6. `playQueue()` 冇並發保護

- **檔案**:[App.js:1683-1710](frontend/hymn-app/App.js:1683)
- **問題**:`playQueue` 係 async,入面連續四個 await:`lazyEnsurePlayer() → reset() → add() → skip() → play()`。用戶快速撳兩首歌(或者撳完一首即刻撳「播全部」)會有兩條 playQueue 交錯行:第二條嘅 `reset()` 可能夾喺第一條嘅 `add()` 同 `play()` 中間 → `queueRef`/`setQueue` 係第二個 list,但 native queue 係第一個 list 嘅殘留 → index 對唔上、播錯歌或者空隊列。
- 呢個係 UI 層面最易重現嘅 race(首頁一行歌撳兩下就得)。
- **建議**:同 `lazyEnsurePlayer` 嗰個 `initInFlightRef` 一樣做法 —— 用 in-flight promise 排隊;或者用 generation counter,舊嗰條發現自己過期就唔好再寫 state。
- **風險**:低-中。

---

## 2. P1 — 明顯死碼

### D1. 24 個檔案、~3,970 行完全 unreachable(佔 src+App.js 嘅 27.6%)

由 `index.js` 開始做傳遞式 import 可達性分析,以下檔案冇任何一條路徑掂得到:

```
src/screens/WebPlayerScreen.js          517 行
src/screens/FullScreenPlayerScreen.js   491
src/screens/SearchScreen.js             395
src/screens/PlayerScreen.js             389
src/screens/PlaylistScreen.js           300
src/screens/CategoriesScreen.js         259
src/screens/CategoryScreen.js           222
src/screens/FavoritesScreen.js           52
src/screens/HomeScreen.js                55   ← 注意:唔係現役嗰個 components/home/HomeScreen.js
src/components/MiniPlayer.js             81   ← 現役 MiniPlayer 喺 App.js 入面
src/components/home/HotSongCarousel.js  212
src/components/home/TestimonyCarousel.js 176
src/components/home/PlaylistCardRow.js  176
src/components/home/DailyQuoteCard.js   153
src/components/home/SectionRow.js       123
src/components/home/SongListSection.js  108
src/components/home/AlbumCardRow.js      87
src/context/PlayerContext.js             28
src/context/AudioContext.js              13   ← 檔頭自己寫「已停用」
src/hooks/usePlayer.js                    2
src/services/categoryApi.js              54
src/services/searchApi.js                36
src/utils/openYoutube.js                 27
src/utils/albumCover.js                  13
```

呢批係舊 react-navigation 版 UI 嘅遺物。**入面有一個真陷阱**:`src/context/PlayerContext.js` export `usePlayer`、`src/context/PlaylistContext.js` export `usePlaylists`,同現役嗰套(`App.js` 嘅 `usePlayer`、`PlaylistsContext` 嘅 `usePlaylists`)**撞名**。MineScreen.js 個註解已經記錄咗中過一次招(「寫咗 `item.hymns`(舊 PlaylistContext 形狀)搞到首數永遠顯示 0、撳極冇反應」)。留住呢批檔案 = 留住下次再中招嘅機會。

### D2. 舊 `PlaylistProvider` 仲 mount 緊,但零消費者

- [App.js:3306](frontend/hymn-app/App.js:3306) 個 provider 樹入面有 `<PlaylistProvider>`(來自 `src/context/PlaylistContext.js`)。
- 全部現役檔案(MineScreen / PlaylistDetailSheet / AddToPlaylistSheet / SharedPlaylistSheet)都係 import `PlaylistsContext`(有 s 嗰個)。冇一個 live 檔案 call 過舊嗰個 `usePlaylists`。
- 但佢照樣:每次 `user` 變就 `AsyncStorage.getItem()`、揸住一份永遠冇人睇嘅 state、包多一層 Provider。
- **建議**:連同 D1 一齊剷,provider 樹少一層。

### D3. App.js 入面嘅死碼

| 位置 | 嘢 | 點解係死 |
|---|---|---|
| [296-312](frontend/hymn-app/App.js:296) | `FALLBACK_HYMNS`(15 首硬寫歌) | 唯一用位係 `playSingle(h, allSongs \|\| FALLBACK_HYMNS)`([3053](frontend/hymn-app/App.js:3053)),但 `useCachedHymns` 回 `hymns \|\| []` —— **空 array 都係 truthy**,所以呢條 fallback 永遠行唔到。而且入面啲 youtube_id 有重複、係舊測試資料。 |
| [335](frontend/hymn-app/App.js:335) | `safeFetchAllHymns()` | 零 caller |
| [97](frontend/hymn-app/App.js:97) | `VIDEO_HEIGHT` | 零 caller |
| [759-764](frontend/hymn-app/App.js:759) | `playerInitRef` + 下面個空 `useEffect`(`return () => {}`) | 零作用 |
| [1470](frontend/hymn-app/App.js:1470) | `getPlayMode()` + `handlePlayHymn` 個 `opts.mode === 'video'` 分支([2995](frontend/hymn-app/App.js:2995)) | 冇 caller 傳過 `mode`;data model 亦冇 `mode` 欄 |
| [351-352, 1817](frontend/hymn-app/App.js:351) | `isSeeking` / `seekPercent` / `setIsSeeking` / `setSeekPercent` / `handleSeekRelease` | 拖動 seek 嗰套已經俾 `handleProgressBarPress`(撳一下 seek)取代。5 樣嘢全部 export 咗落 context,零消費者。 |
| [2, 4](frontend/hymn-app/App.js:2) | `import { SPACING }`、`import Skeleton` | import 咗完全冇用 |
| fsStyles / pageStyles / hs | **26 條 style key 零引用** | `pillButton` `dismissIcon` `coverFallbackIcon` `songTitle` `songArtist` `ctrlIconShuffle` `ctrlIconPrev` `ctrlIconNext` `ctrlIconActive` `playBtnIcon` `handleBar` `sheetHandleRow` `sheetTitle` `sheetScrim` `sheetCard` `sheetHandle` `sheetCount` `queueDragIcon` `queuePlayingIcon` `lyricsContainer` `lyricsHeader` `lyricsTitle` `lyricsClose` `lyricsScroll` `lyricsBody` `fsStyles.center` `pageStyles.center` `pageStyles.loadingText`([3348](frontend/hymn-app/App.js:3348)) `hs.brandIcon` |

⚠️ **保留唔好剷**:`playQueue()` 入面嘅 `opts.browseTap`([1631](frontend/hymn-app/App.js:1631))同 `opts.appendAutoplayTail`([1656](frontend/hymn-app/App.js:1656))兩個分支 —— 註解明文寫咗係 Eric 推翻決定之後**刻意保留嘅機關**,唔算誤留死碼。呢兩個唔喺清理範圍。

### D4. `src/api.js` 上半橛(1-150 行)係另一套已死嘅 auth/API 層

`getToken` / `setToken` / `clearToken` / `authHeaders` / `fetchHymns` / `fetchHymnDetail` / `fetchCategories` / `register` / `login` / `fetchMe` / `createPlaylist` / `fetchPlaylists` / `deletePlaylist` / `addHymnToPlaylist` / `fetchPlaylistHymns` / `removeHymnFromPlaylist` —— **全部只有 D1 嗰批死檔案 import 過**。

而且佢用嘅 `@hymn_app_token` AsyncStorage key 同真正登入流程(AuthContext 個 `@hymn…uth`)係兩份唔同存儲 —— 檔案入面 152-156 行自己個註解都寫咗。留住等於留一個「名字啱、但永遠攞唔到 token」嘅陷阱俾將來嘅自己。

下半橛(`admin*` / `friends*` / `invite*` / `adminErrorMessage` / `friendsErrorMessage`)全部現役,**唔可以剷**。

### D5. `homeApi` 10 個 method 得 1 個用緊

[src/services/homeApi.js](frontend/hymn-app/src/services/homeApi.js) —— 只有 `getDailyVerse()` 有 caller(`components/home/HomeScreen.js:375` 個 dynamic import)。其餘 9 個(`getDailyQuote` / `getFeaturedArtist` / `getNewReleases` / `getGenreRecommendation` / `getBasedOnTaste` / `getResonating` / `getTopVerses` / `getFolkSharing` / `getCombinedCharts`)對應舊十區塊首頁,UI 已經冇。

### D6. AuthScreen 個「註冊」分支永遠行唔到

[src/screens/AuthScreen.js:31](frontend/hymn-app/src/screens/AuthScreen.js:31) —— `setMode` 一次都冇 call 過,`mode` 恆等於 `'login'`。即係:register 表單([87-102](frontend/hymn-app/src/screens/AuthScreen.js:87))、`username` state、`useAuth().register`、三處 `mode === 'register'` 條件全部係死碼。檔案入面 138-142 行已經寫低咗 email 註冊永久封咗側門。

### D7. 4 個完全冇 import 過嘅 native 依賴仲喺 package.json

```
react-native-youtube-iframe     ← 全 codebase(連死檔案)零 import
react-native-video              ← 同上,大 native 依賴
react-native-webview            ← 同上,大 native 依賴
react-native-modal              ← 同上(現役全部用 RN 內置 <Modal>)
```

另外呢幾個**只俾死檔案 import**,D1 剷完就一齊可以剷:
`@react-navigation/native`、`@react-navigation/bottom-tabs`、`@react-navigation/native-stack`、`react-native-screens`(只係俾 react-navigation 用)、`@expo/vector-icons`(現役全部行 `OdeIcon` + `react-native-svg`)。

⚠️ **呢項要出新 build 先生效**(要重新 prebuild + `pod install`),唔屬於 OTA 範圍。收益係 APK/IPA size + build 時間,建議排喺 OCR 唔忙嗰個時段連同其他 native 改動一齊做。

### D8. `PlaylistsContext.isPlaylistFull`

Export 咗,零 caller(`AddToPlaylistSheet` 自己用 `count >= MAX_PLAYLIST_SONGS` 判斷)。

---

## 3. P2 — 效能同優化

### O1.(最大杠杆)播放緊嗰陣,成個 app tree 每秒 re-render 一次

- **檔案**:[App.js:1342-1440](frontend/hymn-app/App.js:1342)(1 秒 poll → `setCurrentTime`)、[App.js:1850](frontend/hymn-app/App.js:1850)(`<PlayerCtx.Provider value={{...}}>` 係 inline object)
- **鏈條**:每秒 `setCurrentTime(pos)` → PlayerProvider re-render → context value 係全新 object(冇 `useMemo`)→ **所有 `usePlayer()` 消費者一齊 re-render**。消費者入面有 `AppContent`([2795](frontend/hymn-app/App.js:2795)),而 AppContent render 咗 HomeScreen / LibraryScreen / MineScreen 三個 tab —— 三個都係 keep mount(靠 `display:'none'` 收埋,見 [3086-3098](frontend/hymn-app/App.js:3086))。
- **即係**:一播歌,三個 tab 嘅成個 VDOM 每秒 reconcile 一次,連埋 6,232 行嘅 FlatList windowing 計算。持續耗 CPU + 食電。
- **建議**(按影響排):
  1. **拆 context**:`currentTime` / `duration` 呢啲每秒變嘅嘢搬去獨立 `PlayerProgressCtx`,只有進度條同時間 label 訂閱。其餘(`currentHymn`/`isPlaying`/隊列/action)留喺 `PlayerCtx`,個 value 用 `useMemo` 包住。
  2. 三個 screen 包 `React.memo`。
  3. poll loop 喺 `trackState` 唔係 Playing/Buffering 嗰陣減慢到 2-3 秒一 tick(而家永遠 1 秒,連冇嘢播都照 poll)。
- **風險**:中(要小心拆乾淨),但呢個係全份 code 最大嘅效能改善。

### O2. `useCachedHymns` 被 mount 兩次 → 開機做兩次幾 MB JSON parse、`/api/hymns` 最多攞四次

- **檔案**:[App.js:2799](frontend/hymn-app/App.js:2799) 同 [src/screens/MineScreen.js:57](frontend/hymn-app/src/screens/MineScreen.js:57)
- 實測庫存 6,232 首、歌詞總長 733KB,全量 JSON 估 2-4MB。**每個 hook instance 有自己嗰個 `useEffect`,獨立行足一次 `refresh()`**:MMKV `getString` + `JSON.parse`(幾 MB)+ `/api/version` + 可能 `/api/hymns` 全量(而 `fetchAllHymnsWithRetry` 失敗仲會再拉多一次)+ `JSON.stringify` 寫返 MMKV。兩個 instance = 全部 ×2,兩邊仲會互相覆寫同一個 MMKV key。
- MineScreen 其實只係想要「歌庫改咗」呢個**訊號**去 refetch「已下架」列表。
- **建議**:`useCachedHymns` 改成 module-level singleton(一份 state + 一次 refresh,hook 淨係做訂閱);或者最少 export 一個輕量 `useHymnsVersion()` 俾 MineScreen 用。
- **風險**:低-中。

### O3. LibraryScreen 每次歌庫更新都複製成個庫 + 起 ~1MB 搜尋 blob

- **檔案**:[src/screens/LibraryScreen.js:76-84](frontend/hymn-app/src/screens/LibraryScreen.js:76)
- `hymns.map(h => ({...h, _searchBlob: norm(×7 欄,包括**全首歌詞**)}))` = 6,232 個 object shallow clone + ~43,000 次 unicode regex(`/[^\p{L}\p{N}]/gu`),結果多咗 ~1MB 字串常駐記憶體。
- 呢個係喺 **render 期間同步**行,開機同每次 background refresh 都撞一次。而且 LibraryScreen 由開機就 mount(三 tab keep mount),即係用戶淨係喺首頁都要俾呢個成本。
- **建議**:
  - (a) blob 唔好夾歌詞全文(或者 cap 頭 200 字);歌詞搜尋改做**第二輪 fallback**(先搵標題/歌手/專輯,冇結果先掃歌詞)。
  - (b) 唔好 clone 個 object,改用 `Map<id, blob>` side index,原本 hymn object 唔郁。
  - (c) 個 index 分批起(`InteractionManager.runAfterInteractions` 或者每 500 首一 chunk),唔好一次過塞喺 render。

### O4. 搜尋每一個 keystroke 都掃 6,232 首 + 重建團體 chip

- **檔案**:[LibraryScreen.js:118-137](frontend/hymn-app/src/screens/LibraryScreen.js:118)、[187](frontend/hymn-app/src/screens/LibraryScreen.js:187)
- `searched`(filter 6,232 × 對長 blob 做 `includes`)同 `orgs`(`Object.entries` + `sort`)每一下打字都行足一次。
- **建議**:`query` 加 150-200ms debounce(state 拆做 `queryInput` / `queryDebounced`),`orgs` 只喺 debounce 完先重算。

### O5. audioPrefetch:`touchedThisSession` 令 LRU prune 長遠失效(iOS)

- **檔案**:[src/audioPrefetch.js:174](frontend/hymn-app/src/audioPrefetch.js:174)、180、237、[327](frontend/hymn-app/src/audioPrefetch.js:327)
- 每次 `getLocalUri()` 命中或者落載完都會將 id 加入 `touchedThisSession`,而 `prune()` 見到喺呢個 set 入面就 `continue` 跳過。**呢個 set 冇上限、冇淘汰。**
- 聽足一晚就會累積遠超 60 個 id → 300MB / 60 檔嘅 cap 等於失效,cache 會一直大落去(最後靠 iOS 自己清 Caches 收科)。註解入面寫嘅「最壞情況係 cache 短暫超 cap」低估咗:唔係短暫,係單向增長。
- **建議**:改成 bounded LRU(例如只留最近 10 個),或者只保護「而家播緊 + 隊列下 2 首」呢幾個 id(呢個資訊 App.js 有,`prefetch`/`cancelIfDownloading` 個 call site 可以順手傳入)。

### O6. audioPrefetch 用 `arrayBuffer()` 一次過讀成首歌入 JS heap

- **檔案**:[src/audioPrefetch.js:224](frontend/hymn-app/src/audioPrefetch.js:224)
- 一首 5-10MB(全碟片可以 50MB+)嘅音訊完整存喺 JS memory,跟住 `new Uint8Array(buf)` 再複製多一份先寫落檔 —— **峰值係檔案大細嘅兩倍,而且係喺播緊歌嗰陣發生**。舊 iPhone 容易撞 OOM。
- **建議**:改用 expo-file-system 嘅 streaming download API 直接寫落 `.part`,唔經 JS heap。(要重做 abort 語義,所以唔算細改動。)

### O7. `fetchWithTimeout` 唔會 abort 底層 fetch,個 timer 又唔清

- **檔案**:[App.js:322-330](frontend/hymn-app/App.js:322)、[src/hooks/useCachedHymns.js:14-18](frontend/hymn-app/src/hooks/useCachedHymns.js:14)
- `Promise.race` 逾時之後**原本嗰個 fetch 仲繼續落載**(幾 MB 全量歌單!),跟住 `fetchAllHymnsWithRetry` 再開多一個 —— 慢網之下等於同時拉兩份全量。而且 fetch 贏咗嗰邊個 `setTimeout` 冇 `clearTimeout`,每 call 一次就掛住一個 8 秒 timer。
- **建議**:用 `AbortController`(RN 有支援),`finally` 清 timer。

### O8. 重複邏輯:同一個封面 component 抄咗 8 份

- `Cover({youtubeId, size})` 幾乎一字不差咁抄咗 6 份:LibraryScreen / MineScreen / HymnListScreen / PlaylistDetailSheet / SharedPlaylistSheet / AdminAddHymnScreen。App.js 另有 `CoverImage`,`components/home/HomeScreen.js` 另有 `Thumb`。八份實作、三種 fallback icon 大細公式。
- 同樣情況:`Heart` / `FavHeart` 抄咗 4 份(App.js、LibraryScreen、HymnListScreen、home/HomeScreen)。
- `https://img.youtube.com/vi/${id}/mqdefault.jpg` 呢條 URL 硬寫咗 8 個地方 —— 明明 `src/utils/albumCover.js` 就係做呢件事,但佢淨係俾死檔案 import(見 D1)。
- **建議**:抽 `src/components/Cover.js` + `src/components/FavHeart.js`,URL 統一行 `albumCover.js`。純機械抽取、零行為改動,但之後改封面策略(換 maxres、加 CDN、改 fallback)就唔使再改 8 個地方。

### O9. FavoritesContext / PlaylistsContext 每次 render 都出新 context value

- **檔案**:[src/context/FavoritesContext.js](frontend/hymn-app/src/context/FavoritesContext.js)
- Provider value 係 inline object,`toggleFavorite` / `isFavorite` 冇 `useCallback` → favorites 一變,**所有 `useFavorites()` 消費者(即係每一行歌嘅心心)一齊 re-render**。
- 仲有一條副作用鏈:`replaceAllFavorites` 個 dep array 有 `favorites` → 佢每次都係新 function → 佢係 [App.js:2895-2901](frontend/hymn-app/App.js:2895) 兩個 AppState effect 嘅 dep → **撳一下心心就會拆晒再掛過 AppState listener**。
- **建議**:value 用 `useMemo`、mutator 用 `useCallback` + functional `setState`(唔好靠 closure 攞 `favorites`)。

### O10. MMKV 開咗 7 個 instance

7 個檔案各自 `new MMKV()`(useCachedHymns / FavoritesContext / PlaylistsContext / userSync / playLog / autoplayPrefs / homePrefs)。同一個 default instance,功能上冇問題,但可以抽一個 `src/storage.js` 統一(順便一個地方處理 JSI 掛咗嗰個 fallback,而家係抄咗 7 次同一段 try/catch)。

### O11. PhoneLoginScreen 兩個細問題

- [startCooldown() (70)](frontend/hymn-app/src/screens/PhoneLoginScreen.js:70):開新 `setInterval` 之前冇 `clearInterval` 舊嗰個 —— 重複觸發(返上一步再發碼)會洩漏一個一直行落去嘅 interval。
- [GenderChips (226)](frontend/hymn-app/src/screens/PhoneLoginScreen.js:226):喺 render function 入面定義嘅 component,每次 render 都係一個新 component type → React 每次都 unmount/remount 佢個 subtree。應該搬去 module scope 或者直接 inline JSX。

### O12. 診斷 beacon `logDiag` 冇任何節流,而且查完 bug 都仲喺度

- **檔案**:[App.js:216](frontend/hymn-app/App.js:216) + 各個 listener(`stateChange` / `trackChanged` / `playWhenReadyChanged` / `PlaybackError` / `wallClockDrift` / `handleStuckTrackEnd` …)
- 每一個 state transition 都 POST 一次去 `/api/client-log`。呢啲係查鎖屏 bug 嗰陣加嘅診斷,而家根因查完咗,但 code 仲全開。每個用戶每次轉歌起碼 3-5 個 POST,全部打去 Eric 部 Mac(即係同 OCR 爭同一部機嘅資源)。
- **建議**:加一個 `DIAG_ENABLED` flag 落 `config.js`(或者只喺 `__DEV__` 開),至少 `stateChange` 要 sample。留住 `PlaybackError` / watchdog giveup 呢啲低頻但高價值嘅。

---

## 4. iOS vs Android 逐項對照

| # | 項目 | 狀況 |
|---|---|---|
| 1 | **本地音訊快取(audioPrefetch)** | iOS only,係有意設計(IOS-ANDROID-PARITY-PLAN),Android 靠 backend warm + ExoPlayer。**冇問題**,但要記住 App.js 有 9 處 `Platform.OS === 'ios'` gate(132/508/857/927/1690/1729/1786/2996/3007);任何一處將來漏咗 gate,Android 就會去 `require('expo-file-system')`,而現役 APK vc54 冇呢個 native module → 即刻冧。`audioPrefetch.js` 每個 export 自己再 check 一次嘅防禦要保留。 |
| 2 | **鎖屏暫停鍵修復(2026-08-17)** | ✅ 兩邊都跟到 —— `track-player-service.js` 係共用檔案,`PlaybackPlayWhenReadyChanged` event 兩個平台都有。**但 H1/H2/H3 三個缺口一樣兩邊都中**,而 H2 反而 Android 更易撞(audio focus loss 比打電話頻密好多)。 |
| 3 | **深層連結(分享清單)** | ❌ **真功能缺失(iOS)**。Android manifest 有 https 雙域(`autoVerify="true"`)+ `godmusic://` 兩個 intent-filter。iOS 邊:`ios/App/App.entitlements` 係空 `<dict/>`,app.json 亦冇 `ios.associatedDomains` → **`https://api.odemusics.com/p/<token>` 喺 iPhone 撳落去只會開 Safari,唔會開 app**,只有 `godmusic://p/...` work。而 `parseSharedToken`([App.js:2777](frontend/hymn-app/App.js:2777))三款 URL 都認,即係 JS 側準備好晒、native 側冇配。<br>修法:app.json 加 `ios.associatedDomains: ["applinks:api.odemusics.com", "applinks:api.god-music.com"]` + backend 出 `/.well-known/apple-app-site-association` + 新 TestFlight build。 |
| 4 | **`noticeStyles.wrap` 個 top** | ⚠️ iOS 細問題。[App.js:1893](frontend/hymn-app/App.js:1893) 用 `(StatusBar.currentHeight \|\| 44) + 12` —— `StatusBar.currentHeight` 喺 iOS 永遠 `undefined`,所以恆用 44。iPhone 14 Pro 之後(Dynamic Island 區 ~59pt)個提示藥丸會撞落靈動島。改用 `useInsets().top` 就得。 |
| 5 | **`appKilledPlaybackBehavior`** | 只落 `android:`([App.js:583](frontend/hymn-app/App.js:583))。iOS 冇對應設定,但 iOS swipe 走 app 本身就殺 process,行為一致。**冇問題**。 |
| 6 | **KeyboardAvoidingView behavior** | ⚠️ 四套唔同做法:AuthScreen 用 `'height'`;AdminEditHymnSheet / AdminAddHymnScreen / PhoneLoginScreen 用 `undefined`;AddToPlaylistSheet 完全唔用 KAV,自己聽 `keyboardDidShow` 手動計高度。唔算 bug,但係將來出鍵盤問題嘅溫床,建議收斂做一套(AddToPlaylistSheet 嗰套經歷咗最多實測修正,可以做 baseline)。 |
| 7 | **iOS `CFBundleVersion` 同 app.json 唔同步** | `ios/App/Info.plist` 係 `2`,app.json `ios.buildNumber` 係 `9`。EAS build 會用 app.json + `autoIncrement` 覆蓋,所以現役 TestFlight build 冇事;但如果有人行 `expo run:ios` local build 就會整出一個 build 2 嘅 IPA。建議同步返,免得將來撞版本號混亂。 |
| 8 | **Android manifest 三個用唔著嘅權限** | `SYSTEM_ALERT_WINDOW`、`READ_EXTERNAL_STORAGE`、`WRITE_EXTERNAL_STORAGE` —— 全份 JS code 冇任何嘢用到(冇 overlay、冇讀寫外部儲存)。側載 APK 裝機時多列幾項權限會嚇親人。下次出 APK 之前確認冇 native lib 靠佢哋(RNTP / MMKV / svg 都唔需要)就可以剷。 |

**另外一個唔算分歧但值得留意嘅**:`index.js` 個 `registerPlaybackService` 每次 service 啟動都會行一次個 default function,入面 8 個 `addEventListener` 冇 unsubscribe。理論上 Android service 被殺再 START_STICKY 起返,如果 JS runtime 未死就有機會累積重複 listener(後果:撳一次「下一首」跳兩首)。呢個係 RNTP 上游行為,我未實測過,**列做「值得驗一驗」而唔係確認 bug**。

---

## 5. 建議落實次序

**第一批 — 可以 OTA,幾行 code,建議一次過做**
`H1` + `H3` + `H5` + `O12`。全部係加/改幾行,風險極低,直接補返鎖屏同「上一首」嘅可靠性,順手熄咗打去 backend 嘅診斷 POST 洪流。

**第二批 — 要諗清楚 + emulator/真機驗**
`H2`(要同 H3 一齊睇 consume 語義)、`H4`、`H6`、`O1`、`O2`。呢五項每項都值得單獨一個 commit + 驗收。`O1` 影響面最闊,建議最後做同埋單獨驗。

**第三批 — 死碼清理**
`D1`–`D8`。建議拆做:①剷 24 個 unreachable 檔案 + 舊 `PlaylistProvider`(一個 commit);②App.js 內部死碼 + style key(一個 commit);③api.js 上半橛 + homeApi 9 個 method(一個 commit);④package.json 依賴(**要出新 build,排喺 OCR 唔忙嗰陣**)。每個 commit 都唔好溝埋行為改動,方便出事時單獨 revert。

**第四批 — iOS 專項(要新 TestFlight build)**
iOS universal link(#3,呢個係真功能缺失)、`Info.plist` buildNumber 同步(#7)、`noticeStyles` 改用 inset(#4)。

**冇建議做嘅**
`O6`(streaming download)同 `O8`(抽公用 Cover/Heart)雖然係啱嘅方向,但一個要重做 abort 語義、一個要掂 8 個檔案 —— 喺共用 worktree 同多 session 並行嘅情況下,而家做 conflict 風險大過收益。等 code 靜啲先。

---

## 6. Commit 紀律提醒(共用 worktree)

呢份報告本身冇改任何 code。將來落實嗰陣,因為而家仲有歌詞複核 R1/R2/R3 三線 + OCR keeper/producer 同時喺呢個 worktree 度寫嘢:

- **一定要逐個檔案列 pathspec**,例:`git commit -- frontend/hymn-app/App.js frontend/hymn-app/src/track-player-service.js`
- 唔好用 `git add .` / `git add -A` / 用目錄做 pathspec
- 剷檔案要用 `git rm <逐個檔案>`,唔好 `git rm -r <目錄>`

---
---

# 第二輪覆核合併(另一 review pass,2026-08-19)

> 以下係另一輪獨立 review(主筆深讀 App.js + 播放核心 + **backend 串流鏈**,另派三個 subagent 做死碼掃描/screens 掃描/平台分歧 audit)嘅**獨有發現**——同上文重複嘅唔再列。兩輪結論冇衝突,互補。

## 7. 專項診斷:「iOS 開 App 第一首歌 load 太慢」worst-case(快取全 miss)

### 7.1 Worst-case 時間軸逐格拆(讀 routes/stream.js + lib/resolveAudio.js + server.js 得出)

前提:Phase 1 + 2.5 已冚大部分情況,剩返「用戶手快過背景落載」——尤其 OTA 後第一次開/好耐冇開,本地 cache 冇、backend resolve-cache 過咗期(URL 壽命 ~4.5h)。串行鏈:

| 段 | 內容 | 量級 |
|---|---|---|
| ① | 撳歌 → lazyEnsurePlayer + reset/add/play | ~0.1-0.5s |
| ② | AVFoundation 第一個 range request 到 backend | ~0.1s |
| ③ | backend 冷 resolve(yt-dlp process spawn) | **2-6.6s**(死鏈最壞 3×12s) |
| ④ | backend→googlevideo 冷 edge TLS+首 byte(經 VPN) | **0.6-10s**;403/爛 status 再 +0.8-2s backoff+重resolve+retry |
| ⑤ | AVFoundation probe 連環 request(見 7.2) | 每條冷 range 連線 ~0.6-2s,**串行疊加** |

③+④+⑤ 疊埋 = 6.9-20.8s 個分佈。

### 7.2 「試幾十條連線先肯出聲」個謎——答案已有一半,同冷路徑係同一件事

backend 註解入面嘅實測(probe_run5.log;[stream.js:209-236](backend/routes/stream.js:209))已確立:**AVFoundation 每個 request 都帶 Range**,而且判斷 asset 播唔播得唔係一條連線搞掂——(a) 頭截攞 moov;(b) **另開一條尾巴 range 連線**讀 duration/index(例 `bytes=4194304-5780700`);(c) 先開真正 data 連線,中間仲會 cancel 完再開。呢個係 AVFoundation 正常行為,唔係 bug。

分野在於:**warm 歌**呢啲 probe 全部由 backend 記憶體(bufferCache 頭截+尾截)秒答;**冷歌**每條 probe 都係全新 backend→googlevideo TCP+TLS(VPN 下每條 0.6-2s),而且 client 一 cancel,backend `controller.abort()` 殺埋 upstream 連線,下條 probe 由零嚟過。「幾十條」嘅極端版 = 呢個 probe 行為疊埋 AVPlayer stalling retry storm(App.js:1184 記錄過 15 秒 30+ requests;`waitForBuffer:false` 已醫好「自己估頻寬反覆重試」嗰半,剩返「冷歌每條 probe 都冷開」呢半)。

### 7.3 仲可以做啲乜(按性價比排)

**A.〔最高性價比〕冷路徑 tee-into-buffer:第一條冷 stream 開始 pipe 嗰刻,順手餵 bufferCache**
而家 bufferCache 淨係 `/warm` 先裝填;冷歌第一條連線拉緊嘅 bytes 同跟手幾條 probe 要嘅係同一啲,但 backend 一啲冇留低。做法:GET /api/stream 冷路徑 pipe 俾 client 同時 tee 頭 N MB 入 bufferCache,**並且即刻背景補攞條尾巴 512KB**(TAIL_BYTES 機制現成)——AVFoundation 第 2/3/4 條 probe 就好似 warm 歌咁秒答,⑤ 段基本消失。預期慳 2-6s;改動集中 stream.js,唔掂 client/native。風險中低(tee 只旁聽,唔郁 pipe backpressure;bufferCache 已有 url-match 防 format 錯配)。

**B.〔高性價比〕`/warm` 讓路 + boot 雙重落載去重**
開 App 一刻(iOS):client `prefetchAudio` 經 /api/stream 拉成首歌,同時 backend `/warm` 隊嘅 `warmBuffer` 又拉同一首入 RAM——**同一首歌 bytes 過兩次 VPN**;而且 [`/warm` 個 sequential loop](backend/routes/stream.js:83) 唔 check `isStreaming()`/`anyStreaming()`(keep-warm timer 有呢個 gate,/warm route 冇),用戶開始聽咗佢照逐首 12MB 扯埋剩低幾首,同正播緊嗰條 stream 爭 VPN 頻寬。修法:/warm 每個 iteration 前 check `anyStreaming()`,有人聽緊就剩低嘅只做 resolve+preVerify(平)唔做 warmBuffer(貴);`isStreaming(yt)` 嘅直接跳過 warmBuffer。風險低(純調度)。

**C.〔中性價比〕backend 每朝 cron 預 resolve「今日+聽日」精選**
boot precache 係「頭 200 首 by id」([server.js:224-252](backend/server.js:224)),同「今日為你預備」daily seed 完全冇關係。`dailyPickBalanced` 係日期種子(frontend utils/dailyShuffle.js)——backend port 一份同源算法,或者最簡單:App 每次 boot POST /warm 時 backend persist 埋嗰批 id,聽朝 cron 預熱——「當日第一個開 App 嘅用戶」都食 warm,③ 段喺呢批歌上消失。流量紀律 OK(每日十幾首、單線程、現有 429 冷卻罩住)。

**D.〔押後〕resolve 層擺脫 per-request yt-dlp spawn**
③ 段 2-6.6s 主要係 yt-dlp Python process 由零起身。youtubei.js 類 in-process resolver 可去到 0.3-0.8s,但噚日先為 403 換咗 yt-dlp nightly + DASH format,YouTube 反 bot 環境動盪,呢刻孭多個 resolver 係額外維護風險。**先食 A/B/C 甜頭再算。**

**E.〔UX 保底,零風險〕冷 start loading 提示分階段**
6-20 秒空轉 spinner 係體感最傷。「連接中→緩衝中」兩段文案,或 8 秒後出「網絡較慢,仲努力緊…」,純 client UI,OTA 就推到。

### 7.4 唔建議嘅方向
client 直連 googlevideo(失去 warm buffer/fMP4 修補/403 retry 成套機制);掂 native buffer 參數(啱啱穩定返,probe 行為亦唔受呢啲控制);prefetch 邊落邊播(打破「.part 唔准俾播放器見到」鐵律)。

### 7.5 順帶發現(backend,低危)
[stream.js:279-302](backend/routes/stream.js:279) buffered fast-path 個「續播」upstream fetch 失敗時 catch 完直接 `res.end()`——body 短過 Content-Range 應承嘅長度,AVFoundation 會當錯誤(同註解自述嘅 -12935 機制同源),而 log 仲報成功 206 誤導診斷。應改 `res.destroy()` 令 client 知係斷線。影響罕見,順手修就得。

## 8. 第二輪獨有 bug 發現(live 代碼,上文未列)

| # | 位置 | 問題 | 建議 | 風險 |
|---|---|---|---|---|
| S1〔高〕 | [FavoritesContext.js:27-50](frontend/hymn-app/src/context/FavoritesContext.js:27) | `toggleFavorite` 讀 stale closure(唔係 functional updater),double-tap 心心/兩個 Heart 同時觸發 → favorites 出兩條同 id 記錄 + outbox enqueue 兩次 `fav_add`;反向刪唔乾淨 | 改 `setFavorites(prev => ...)`,updater 內判斷 added(同上文 O9 一齊做) | 低 |
| S2〔高・私隱〕 | [MineScreen.js:83-93](frontend/hymn-app/src/screens/MineScreen.js:83) | `loadFriends` 冇 cancelled flag:登出/切帳戶時 in-flight response 返嚟照寫**上手帳戶**好友名單入 state(同檔 60-67 行 delisted effect 有正確 pattern,呢度冇跟) | 照抄 cancelled flag,或對返發 request 時嘅 user.id | 低 |
| S3〔中〕 | [AdminAddHymnScreen.js:117-183](frontend/hymn-app/src/screens/AdminAddHymnScreen.js:117) | preview 冇 in-flight 取消/stale check(後面係 yt-dlp 隨時幾秒):連貼兩條 URL,慢嗰個 A response 蓋咗 B → 縮圖顯示 B 但入庫係 A | setState 前對返發起時嘅 videoId(ref)或 AbortController | 低 |
| S4〔中〕 | [audioPrefetch.js:198-263](frontend/hymn-app/src/audioPrefetch.js:198) | `downloadOne` 個 fetch **冇 timeout**,而落載隊係「同時最多 1 條」串行鎖——VPN 半死連線(socket 開住零 bytes 又唔斷)會令 `currentDownloadId` 永遠唔清,成個 session 嘅預載(下 2 首+聽日 2 首)靜靜哋全滅;唯一解鎖係用戶啱好撳嗰首歌 | 加 60-90s AbortController timeout,timeout 當一般失敗(diagFail 通道現成) | 低 |
| S5〔中〕 | [PlaylistsContext.js:64,98](frontend/hymn-app/src/context/PlaylistsContext.js:64) | 清單 id 用 `pl_${Date.now()}`——同一毫秒 create/import 兩個會撞 id(改一個改兩個、刪一個刪兩個、server upsert 互蓋);另外 `addToPlaylist`/`removeFromPlaylist`/`renamePlaylist` 全部 closure 讀 `playlists`(檔內 `applyServerPlaylist` 自己註明要 functional setState,其餘冇跟) | id 加隨機尾綴(隔籬 PlaylistContext.js:45 有現成寫法);mutation 統一 functional updater | 低-中 |
| S6〔低〕 | MineScreen/PlaylistDetailSheet/SharedPlaylistSheet/HymnListScreen/LibraryScreen 五份 Cover copy | `failed` state 唔跟 youtubeId reset——FlatList row 重用時顯示錯 fallback。AdminAddHymnScreen 已有正確修法(`useEffect(() => setFailed(false), [videoId])`) | 併入 O8 抽公用 `<Cover>` 時一齊帶埋呢個 fix | 低 |
| S7〔低〕 | MineScreen handleAccept/Reject 冇 busy guard;InviteFriendsSheet load 冇 cancelled flag(FriendSharesSheet 有做,唔一致);AddFriendSheet 被外部 setVisible(false) 閂時唔 reset 舊 state | 抽 `useAuthedFetch` hook 統一 cancel/busy 語義,一次過封晒呢族問題 | 低 |

## 9. 平台分歧補充(第二輪 audit 獨有)

1. **〔高・疑似,未實測〕D2 guard 喺 Android 仲有一個上文未提嘅場景:拔耳機/藍牙斷開**。RNTP hardcode `handleAudioBecomingNoisy=true`,ExoPlayer 主動 pause(呢個係想要嘅 UX——唔好突然用喇叭大聲播)行 playWhenReady=false → D2 見 `expected=true` 即刻 play() 返 → **喇叭繼續播**。同上文 H2(audio focus)係同族但唔同觸發器。驗證方法同 H2 一齊:Android 真機試「播歌→拔耳機」;中招就 D2 個自動 play() 加 `Platform.OS === 'ios'` gate(佢本身係醫 iOS-only 病)。
2. **〔中〕1dde53d(`autoHandleInterruptions:true`)靜靜哋改埋 Android 行為**:commit 標題 `fix(ios)` 但呢個唔係 iOS-only option——Android 嗰邊 map 落 `handleAudioFocus=true`(MusicService.kt:189),即係嗰個 OTA 起 Android ExoPlayer 開始自己 handle audio focus,行為改變未聲明未驗證,同 #1/H2 複合。
3. **〔中・流程風險〕bare/CNG 混合陷阱**:`android/` 落咗 git(bare)、`ios/` gitignored(CNG prebuild)——**app.json 嘅 android 欄位大部分唔會自動生效**(manifest 註解自己記錄過 intentFilters 嗰單「寫咗當生效」事故)。Android config 改動一定要手改 manifest,iOS 就改 app.json 就得。將來最易再中招嘅唔對稱,建議喺 HANDOFF 度立返條規。
4. 細項:死檔 `HotSongCarousel.js:49-55` 有 Rules of Hooks 違規(early return 排喺 useCallback 之前),邊個復用邊個即刻爆——剷 D1 時佢係「一定要剷」名單頭位。patches/ 兩平台 hunks 共存一個 patch 檔全部 live 冇過時;RNTP library manifest 自動 merge FGS 權限,兩邊背景播放權限齊。

## 10. 兩輪合併後嘅落實次序建議(取代唔到上文 §5,係補充映射)

- 上文**第一批**(H1/H3/H5/O12)不變,可加入:S1、S2、S4(全部幾行 diff、OTA 推到)。
- 上文**第二批**驗證項(H2/H4/H6/O1/O2)加入:§9-1 拔耳機場景同 H2 一齊喺 Android 真機驗;S3、S5 排呢批尾。
- **Backend 串流批(新)**:§7.3-B(/warm 讓路)→ §7.3-A(tee-into-buffer)→ §7.3-E(loading UX,client 側)→ §7.3-C(daily cron)。全部唔掂 native;B/A 係 backend 改動,**要跟「唔喺 Eric 真機 QA 期間部署」規矩**,揀 OCR 唔忙時段。
- 上文**第三批**(死碼)、**第四批**(iOS 專項)不變;§7.3-D(resolver 換代)押後。
