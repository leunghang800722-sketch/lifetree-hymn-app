# 播放隊列 UX 四項修正 — 規劃書 (QUEUE-UX-4FIXES-PLAN)

> 撰寫日期:2026-07-29
> 撰寫:Claude (Fable 5,規劃層)
> 執行:Sonnet 5(照呢份文件落手)→ Opus 5 驗收
> 來源:Eric 2026-07-29 四項要求(經 Dispatch)
> 性質:純規劃,呢個 session 冇改過任何 code。

---

## 目錄

0. 一頁總覽
1. 第 1 項:自訂清單「播全部」唔好加自動播放尾巴
2. 第 2 項:「改清單名」sheet 卡半開、俾鍵盤遮住
3. 第 3 項:插播歌要有清楚視覺分隔
4. 第 4 項:重開 App 唔好恢復上次播放隊列
5. 四項之間 + 同歷史 browseTap 邏輯嘅交互(regression 風險總表)
6. 建議執行次序同驗收清單
7. 需要 Eric 拍板 / 留意嘅位

---

# 0. 一頁總覽

| # | Eric 原話 | 一句話做法 | 改動範圍 | 風險 |
|---|-----------|-----------|---------|------|
| 1 | 「如果我按清單就唔好加其他野」 | `PlaylistDetailSheet.js` 唔再傳 `appendAutoplayTail: true`(一行) | 極細 | 低,但要標明係**推翻舊決定 BUG3(b)** |
| 2 | 改名 sheet 卡半開、同鍵盤疊埋 | 先喺 emulator 重現診斷;首選修法係 rename/create mode 改做**置中 dialog**,唔再靠鍵盤高度計算 | 細 | 低-中(鍵盤行為跨機差異) |
| 3 | 「單點歌曲清楚分隔,唔好插入清單當中」 | 加一個 `insertBoundary` state(照抄 `autoRadioFrom` 條分隔線做法),隊列 sheet 喺插播歌之後畫「接返原本清單」分隔線 | 中 | **中——直接掂 browseTap/headLen 嗰段歷史邏輯,係四項入面最危險** |
| 4 | 「退出 app 後唔好記住上次播緊清單」 | 冷啟動時 `resyncFromNative()` 只喺 native **真係播緊**先恢復;唔係播緊就 reset 清走 | 細-中 | 中(唔可以誤殺「背景播緊歌返前台」呢個正常場景) |

四項全部集中喺 frontend,**唔使掂 backend、唔使掂 native code**。核心檔案係
`frontend/hymn-app/App.js`(第 1/3/4 項)同
`frontend/hymn-app/src/components/AddToPlaylistSheet.js`(第 2 項)。

---

# 1. 第 1 項:自訂清單「播全部」唔好加自動播放尾巴

## 1.1 現況(點解 8 首會變 37 首)

- 自動播放尾巴長度係 `RADIO_LEN = 30`(`src/utils/autoplay.js:12`)。
- `App.js` 嘅 `playQueue()` 只會喺 caller 傳 `opts.appendAutoplayTail` **而且**自動播放
  toggle 開住嗰陣先加尾巴(`App.js:901`)。
- 而家**全 App 得一個 caller** 傳呢個 flag:自訂清單詳情頁
  `src/screens/PlaylistDetailSheet.js:77`:

  ```js
  onPlayHymn && onPlayHymn(hymn, { explicit: true, playlist: songs, appendAutoplayTail: true });
  ```

  「播全部」(`playAll`,同檔 :81)行嘅都係呢個 `play()`。
- 尾巴會 filter 走同清單重複嘅歌(`App.js:906`),所以 Eric 8 首清單 + ~29 首尾巴
  ≈ 37 首,同佢見到嘅完全脗合。
- 其他入口(「我的」最愛「播全部」`MineScreen.js:137`、首頁、睇晒、隨心聽)**本身就冇**
  傳呢個 flag,唔會加尾巴——所以唔使掂。

## 1.2 ⚠️ 呢個係推翻舊決定,唔係普通 bug

`appendAutoplayTail` 係之前 **BUG3(b) P0** 加落去嘅——當時 Eric 實測投訴「清單播完
就死死哋停、⏭ 變死掣」,先至加咗尾巴(見 `PlaylistDetailSheet.js:72-75` 同
`App.js:893-898` 兩段註解)。而家 Eric 明確話返轉頭:「按清單就唔好加其他野」。

**新指示贏。**但執行時必須:

1. 更新 `PlaylistDetailSheet.js` 同 `App.js:893` 嗰兩段 BUG3(b) 註解,寫明
   「2026-07-29 Eric 決定:自訂清單唔加尾巴,推翻 BUG3(b)」——唔係第時邊個(包括
   Opus 5 驗收)睇到舊註解會以為係 regression 又「修返」佢。
2. 接受一個已知後果:8 首清單播到第 8 首,播完就停,最後一首嘅 ⏭ 冇嘢跳
   (`hasNext` 邏輯會令佢 disabled/冇反應)。呢個係 Eric 揀嘅行為,驗收時唔算 bug。

## 1.3 做法

- `PlaylistDetailSheet.js:77`:刪走 `appendAutoplayTail: true`(得返
  `{ explicit: true, playlist: songs }`)。
- **保留** `App.js` `playQueue()` 入面成個 `opts.appendAutoplayTail` 分支同
  `handlePlayHymn` 嘅 pass-through(`App.js:2101`)——冇 caller 傳,分支自然唔行,
  diff 最細、regression 面最細。唔好順手剷走成段(第時如果 Eric 想俾「隨心聽」之類
  用返,呢個機關仲喺度)。
- 更新兩處註解(見 1.2)。

## 1.4 對現有 headLen 邏輯嘅影響(好消息)

`playSingle()`(`App.js:791`)同 `playQueue()` browseTap 分支(`App.js:881`)嘅
`headLen = autoRadioFrom != null ? autoRadioFrom : curQ.length` 呢句,本來就係為咗
應付「清單後面拖住條尾巴」嘅情況(P1,Opus 驗收揪出嗰單)。改完之後,自訂清單播放
`autoRadioFrom` 會係 `null`,`headLen` 行返 `curQ.length` 嗰個 fallback——即係
**返返去 W2 之前一直運作正常嘅語義**,兩段 headLen 邏輯唔使改、亦唔應該改
(`playSingle` 嘅隨機接續隊列仍然會有 `autoRadioFrom`,嗰啲場景繼續靠佢)。

## 1.5 驗收

1. 開一個 8 首嘅自訂清單 →「播全部」→ 隊列 sheet 得 8 首,冇「自動播放：」分隔線。
2. 播到第 8 首播完 → 停(唔會接落隨機歌)。
3. 自動播放 toggle 開/關兩個狀態都試——兩個都應該係 8 首。
4. 迴歸:詩歌庫/搜尋/首頁撳散歌 → 仍然有隨機接續尾巴 +「自動播放：」分隔線(playSingle 路徑唔受影響)。
5. 迴歸:播緊自訂清單時去詩歌庫撳一首歌 → 仍然係插播(接第 3 項驗收)。

---

# 2. 第 2 項:「改清單名」sheet 卡半開、俾鍵盤遮住

## 2.1 現況

改名 UI 係 `src/components/AddToPlaylistSheet.js` 嘅 `'rename'` mode(同「加入到清單」
「新播放清單」三個 mode 共用一個 native `<Modal>`,檔頭註解講明唔准分叉)。鍵盤避讓
係**手動**做:聽 `keyboardDidShow` 攞高度,俾個 card `marginBottom: kbHeight + 12`
(`AddToPlaylistSheet.js:70-74, 166`),仲有塊 `keyboardScrim` 補罅。呢套嘢已經修過
兩輪(52→12 嘅雙重補償 bug、navigationBarTranslucent 玻璃海 bug,見檔內註解)。

Eric 截圖見到:sheet 開咗一半,輸入框同「改名」掣俾鍵盤局部遮住——即係
`kbHeight` 冇生效(多數係 0 或者 stale)。

## 2.2 最可能成因(要 emulator 重現先落實)

入口有兩個:`MineScreen.js:60` 同 `PlaylistDetailSheet.js:57`——**兩個都係由
`Alert.alert` 選單撳「改名」開出嚟**。可疑點按可能性排:

1. **`autoFocus` 同 Modal slide 動畫/Alert 收埋嘅 race**:`TextInput autoFocus` 喺
   Modal 未完成 layout/未攞到 focus 之前開鍵盤,`keyboardDidShow` 事件同新 Modal
   window 嘅時序喺部分 Android 機會亂,`setKbHeight` 冇跑到或者跑咗但 card 未
   re-layout。
2. `PlaylistDetailSheet` 本身係另一個 full-screen `<Modal>`,rename Modal 疊喺佢
   上面——兩層 Modal + Alert 三個 window 交接,`keyboardDidShow` 喺邊個 window
   context 派發,跨 Android 版本有差異。
3. 冷門:個別 IME(Eric 部真機嘅輸入法)`endCoordinates.height` 報細咗。

註:app 嘅 `MainActivity` 已經係 `windowSoftInputMode="adjustResize"`
(`android/app/src/main/AndroidManifest.xml:22`),但 RN 嘅 `<Modal>` 係獨立 window,
呢個設定唔一定跟過去,所以先至有成套手動 kbHeight 機關。

## 2.3 做法(兩步)

**Step A — 診斷**:emulator 行兩條入口(MineScreen 長按改名 / PlaylistDetailSheet ⋯
選單改名),log `kbHeight`,睇邊條路重現到「卡半開」。

**Step B — 修法,首選 (a)**:

- **(a) 首選:`rename` / `create` 兩個 mode 改做置中 dialog。**呢兩個 mode 內容
  只係「標題 + 一行輸入框」,根本唔需要 bottom sheet。card 置中(`justifyContent:
  'center'`)之後,鍵盤喺畫面下半部,常規手機螢幕唔會遮到置中嘅 dialog——成套
  kbHeight/keyboardScrim 計算對呢兩個 mode 唔再係生死攸關,跨機穩定性大增。
  `'add'` mode(有 FlatList,真係 sheet)維持原狀貼底。**唔算違反「唔准分叉」鐵律**:
  仍然係同一個 component、同一個輸入列 `nameInputRow`、同一套 confirm 邏輯,
  純粹 container 對齊方式按 mode 唔同。
- (b) 次選(如果 Eric 堅持要貼底 sheet 外觀):保持貼底,但修 race——`autoFocus`
  改為 Modal `onShow` callback 先 focus(用 ref + `setTimeout(…, 50)` 級數),
  確保鍵盤喺 Modal window 就緒後先彈;`keyboardDidShow` listener 照舊。
- 修邊個 mode 都好,`'add'` mode 嘅行為同外觀**一 pixel 都唔准變**(檔頭鐵律)。

## 2.4 Touch 檔案

- `src/components/AddToPlaylistSheet.js`(主要:styles + Modal 內 layout,按 mode 分支)
- 唔使掂 `MineScreen.js` / `PlaylistDetailSheet.js`(入口唔變)

## 2.5 驗收

1. MineScreen 長按清單 → 改名:dialog 完整見到,輸入框同「改名」掣完全喺鍵盤之上。
2. PlaylistDetailSheet ⋯ → 改名:同上。
3. 改名成功、取消、撳 scrim 閂——三條路都正常。
4. 迴歸:「加入到清單」sheet(add mode)外觀行為完全冇變,包括入面「＋新播放清單」
   展開輸入框嗰下嘅鍵盤避讓(呢個仍然行 kbHeight 機關)。
5. 迴歸:「我的」頁「＋」開新清單(create mode)正常。
6. 真機(Eric 部機)最終確認——emulator 鍵盤同真機 IME 唔完全一樣。

---

# 3. 第 3 項:插播歌要有清楚視覺分隔

## 3.1 現況

插播(browseTap)而家喺**兩個位**發生,兩個都係「砌一條新隊列 `[插播歌, ...原清單
餘下]` 再 `playQueue()`」:

- `App.js:779-799` `playSingle()`:播緊明確清單時,喺**冇 browseTap flag 嘅入口**
  (例:繼續收聽)撳散歌。
- `App.js:872-892` `playQueue()` browseTap 分支:詩歌庫/搜尋/首頁(53006b2、
  7d1ee17、94acb23 三單修出嚟嘅入口)撳散歌。

兩個位砌完隊列都係 `autoRadioFrom: null`——隊列 sheet 見到嘅就係一條平平無奇嘅
list,插播歌同原清單餘下嘅歌完全溝埋,Eric 分唔出邊首係佢清單本身嘅歌。

## 3.2 做法:照抄 `autoRadioFrom` 分隔線嘅機關

而家「自動播放：全部」條分隔線係咁做:state `autoRadioFrom`(`App.js:776`)記住
「隊列由邊個 index 開始係自動尾巴」,隊列 sheet render 時
`index === player.autoRadioFrom` 就喺嗰行**前面**畫一條 `radioDivider`
(`App.js:1662-1669`,styles :1840-1842)。

新增一個平行 state:

```
const [insertBoundary, setInsertBoundary] = useState(null); // 隊列頭幾多首係插播歌;null = 冇插播
const insertBoundaryRef = useRef(null);
```

- **設置**:`playSingle()` 嘅 resumeRemainder 分支(:797)同 `playQueue()` browseTap
  分支(:888-891)砌完 `[tapped, ...resumeRemainder]` 之後,經 opts 傳落去
  (例 `opts.insertBoundary = 1`),`playQueue()` 度同 `setAutoRadioFrom` 一齊
  `setInsertBoundary`。
- **清除(關鍵,漏一個位就會出鬼影分隔線)**:`playQueue()` 所有**唔係**插播嘅呼叫
  都要重設返 `null`——最穩陣做法係喺 `playQueue()` 入面同 `setAutoRadioFrom(...)`
  嗰句(:912)並排,一律 `setInsertBoundary(opts.insertBoundary ?? null)`,
  咁樣正常換 queue 自動清零,唔使逐個 caller 執。另外:
  - shuffle(`toggleShuffle`)→ 清 `null`(次序都亂晒,分隔線冇意義);
  - 隊列 sheet 拖曳排序(DraggableFlatList `onDragEnd`)→ 清 `null`(同理);
  - `rebuildTail()` / `applyAutoplayEnabled(off)` 唔郁隊列頭部,可以唔清,但要
    肉眼過一次呢兩個函數確認佢哋 set queue 嗰陣冇意外影響。
- **render**:隊列 sheet `renderItem` 加多一塊,樣式直接重用 `radioDivider` 三件套:

  ```
  index === player.insertBoundary → 分隔線「▶ 接返原本清單」
  ```

  文案建議:「插播完・接返原本清單」或者簡單「原本清單」(icon 用
  `playlist-play` 之類,同 shuffle icon 區分)。最終字眼俾 Eric 睇實物再執。
- **connectedValue**:`player` context value(`App.js:1056` 附近)加返
  `insertBoundary` 出去俾 UI 讀。

## 3.3 點解係 boundary=1 就夠(而唔使做「多首插播」)

插播永遠係**一首**:再插第二首時,browseTap 分支會用而家隊列重新砌
`[新插播歌, ...explicitHead 餘下]`——上一首插播歌(當時 index 0,`curIdx=0`,
`slice(curIdx+1)` 由 1 開始)自然唔會帶落新隊列。所以 boundary 恆等於 1,
唔使做動態 boundary 數值,但 state 用數字(唔用 boolean)留返彈性,成本一樣。

## 3.4 同歷史 browseTap 邏輯嘅相容(⚠️ 本項最大風險位)

鐵律:**本項只准「加 state + 加 UI」,唔准改動以下任何一段嘅判斷邏輯**——

- `playSingle()` 嘅 headLen/isExplicitQueue/resumeRemainder(:786-799)
- `playQueue()` browseTap 嘅 headLen/explicitHead/isDifferentExplicitQueue(:872-892)
- 三個 call site 嘅 flag(53006b2 Library/搜尋、7d1ee17 清單詳情、94acb23 首頁)

呢啲係三單 P0/P1 逐滴血修出嚟嘅,任何「順手重構」都當 regression 論。
`insertBoundary` 只係喺呢啲分支**已經決定咗插播之後**,多記一個數字落 state,
read-only 反映喺 UI——插播行為本身零改動。

同第 1 項嘅交互:第 1 項落地後,播自訂清單 `autoRadioFrom = null`,所以
「插播分隔線」同「自動播放分隔線」喺自訂清單場景**唔會同場出現**,唔使處理
兩條線疊埋嘅視覺。惟一同場可能:插播隊列播晒之後 Eric 又手動開自動播放
(`applyAutoplayEnabled(on)` → `rebuildTail`)——嗰陣隊列尾會加尾巴,兩條線並存
(插播線喺 index 1,自動播放線喺尾)。呢個係合理畫面,唔使特別處理,但驗收要
睇一眼唔好爆版。

## 3.5 Touch 檔案

- `App.js`(全部改動都喺呢一個檔:state、playQueue/playSingle 傳值、隊列 sheet
  render、player context value、toggleShuffle/onDragEnd 清 state)

## 3.6 驗收

1. 播自訂清單(例 8 首)→ 去詩歌庫撳一首歌 → 隊列 sheet:index 0 係插播歌,
   佢下面一條「接返原本清單」分隔線,再落係原清單餘下嘅歌。
2. 插播歌播完 → 自動接返原清單下一首(行為同以前一樣,冇變)。
3. 插播期間再插第二首 → 分隔線仍然正確(舊插播歌唔見咗,新歌喺 index 0)。
4. 正常「播全部」/睇晒/隨心聽 → **冇**呢條分隔線。
5. shuffle 或者拖曳排序之後 → 分隔線消失。
6. 迴歸:「自動播放：全部」條原有分隔線喺 playSingle 隨機接續場景照常出現。
7. 迴歸:三個歷史入口(Library/搜尋、清單詳情頁、首頁即刻揀歌)嘅插播行為逐個試,
   確保同 7d1ee17 驗收時一樣。

---

# 4. 第 4 項:重開 App 唔好恢復上次播放隊列

## 4.1 現況(隊列「恢復」其實係咩)

App 冇將 queue 寫落 disk。Eric 見到嘅「記住上次清單」來自:

- `setupOptions` 用 `AppKilledPlaybackBehavior.ContinuePlayback`(`App.js:431`)——
  Android 上 TrackPlayer 個 foreground service 喺 app 俾人 swipe 走/JS 被殺之後
  **繼續生存**,native queue 一直揸喺手。
- `resyncFromNative()`(`App.js:647-693`):開機 800ms 後 + 每次返前台,由 native
  讀返 queue/index/state 補落 JS UI。呢個係 §Eric #2 特登加嘅——當時係為咗修
  「背景播緊歌,返嚟 mini player 唔見咗」。

所以 Eric 重開 app 見到舊隊列,係 service 未死 + resync 照單全收嘅結果。

另外有個獨立機關 `lastPlayed`(MMKV,`src/lastPlayed.js`)——首頁「繼續收聽」卡
用嘅,只存**一首歌**,唔係 queue。**Eric 今次冇叫剷呢個**,唔准順手掂
(如果 Eric 想埋「繼續收聽」都清,要另外問,見 §7)。

## 4.2 做法:冷啟動「唔係播緊就清場」

唔可以簡單剷走 `resyncFromNative`——佢喺「背景播緊歌、用戶返前台」場景係必需嘅
(唔係 mini player 會消失,§Eric #2 會 regression)。正確嘅切法係按**冷啟動 vs
返前台**同**native 係咪真係播緊**分流:

```
resyncFromNative(isColdStart):
  讀 native state
  if (isColdStart && state 唔係 Playing/Buffering):
      // 上次退出留低嘅殘留隊列(service 生存但冇聲)
      → TrackPlayer.reset()(清 native queue + 收走 notification)
      → 唔補任何 JS state,App 以 clean state 開始
      return
  // 其餘照舊:真係播緊(或者係返前台)→ 照 resync
```

- 開機嗰下(`App.js:690` 個 `setTimeout`)傳 `isColdStart=true`;
  `AppState 'active'` listener(:691)傳 `false`。
- 「播緊」定義:`State.Playing` 或 `State.Buffering`;`Paused`/`Ready`/`Stopped`/
  `None` 一律當殘留。**留意**:用戶「播緊歌 → swipe 走 app → 即刻重開」如果啱啱
  喺 notification 撳咗暫停,都會俾呢個邏輯清走——呢個係 Eric 要嘅語義(重開 =
  重新開始),接受。
- `TrackPlayer.reset()` 前要 `lazyEnsurePlayer()`(reset 需要 player 已 setup;
  而家 resync 本身已經先行 ensure,:649,維持呢個次序就得)。
- 如果 native 根本冇 queue(service 已死,`getQueue` 返空)→ 現有 early return
  (:657)已經係 clean state,唔使做嘢——即係大部分「隔咗好耐先開返 app」嘅情況
  本身就正確,今次修嘅係 service 未死嗰段窗口。

## 4.3 唔建議(但要喺文件度講清楚俾 Eric 知)嘅另一選項

改 `AppKilledPlaybackBehavior` 做 `StopPlaybackAndRemoveNotification`——swipe 走
app 音樂即停、queue 即清,最徹底符合「退出就重新開始」。**但副作用係「背景聽歌時
唔小心 swipe 走 app = 音樂突然停」**,對詩歌 app(好多人熄芒/做家務聽)風險大。
建議**唔改**,維持 ContinuePlayback + 上面冷啟動清場;除非 Eric 睇完話「swipe 走
都要停埋音樂」先至改(見 §7)。

## 4.4 Touch 檔案

- `App.js`(`resyncFromNative` + 個 useEffect,~15 行)

## 4.5 驗收

> ⚠️ 2026-07-29 更新(見 §7a-2):Eric 拍板要「swipe 走 app 音樂即停」,
> `appKilledPlaybackBehavior` 已改做 `StopPlaybackAndRemoveNotification`。
> 下面第 3 點已經按新決定改寫(原文係假設 `ContinuePlayback` 嘅舊版本,
> 唔再適用)。

1. 播緊清單 → 撳 notification 暫停 → swipe 走 app → 重開:冇 mini player、冇舊隊列、
   notification 收埋咗,App 全新狀態。
2. 播緊清單(有聲)→ Home 掣去背景 → 返前台:mini player 照舊喺度,歌冇斷
   (§Eric #2 迴歸——呢個係「撳 Home 去背景」,app process 未死,唔受
   `appKilledPlaybackBehavior` 改動影響)。
3. **(§7a-2 新版)** 播緊清單(有聲)→ swipe 走成個 app:音樂即刻停,mini
   player/notification 即刻消失;之後重開 app:全新狀態(冇 mini player、
   冇舊隊列)——同第 1 點結果一致,因為 service 已經俾 swipe 手勢直接殺咗,
   唔使再靠冷啟動清場邏輯。
4. 完全冇播過歌 → 開 app:同以前一樣(early return 路徑)。
5. ~~首頁「繼續收聽」卡照常運作~~ **(§7a-3 推翻)**:卡已剷,首頁「快速開播列」
   淨係得返「隨心聽」一個掣、成行闊。改驗:首頁冇「繼續收聽」呢張卡,冇論
   之前播過幾多次歌都係咁。

---

# 5. Regression 風險總表(俾 Sonnet 5 執行前必讀)

| 風險 | 嚟自 | 防呆 |
|------|------|------|
| 「修返」自動播放尾巴 | 第 1 項推翻 BUG3(b),舊註解仲喺 `App.js:893` / `PlaylistDetailSheet.js:72` | 兩處註解一定要同 code 一齊更新,寫明 2026-07-29 Eric 決定 |
| 插播邏輯 regression | 第 3 項掂 `playSingle`/`playQueue` 附近 | 鐵律:只加 state/UI,判斷邏輯一行都唔改(§3.4);驗收逐個歷史入口過一次 |
| 鬼影分隔線 | `insertBoundary` 漏清 | 統一喺 `playQueue()` 用 `opts.insertBoundary ?? null` 重設,另加 shuffle/drag 清理(§3.2) |
| mini player 消失(§Eric #2 翻發) | 第 4 項改 `resyncFromNative` | 只喺 `isColdStart && !playing` 先清場;返前台路徑一行都唔變;驗收 4.5-2/3 必做 |
| add mode sheet 俾人整壞 | 第 2 項改 `AddToPlaylistSheet` | `'add'` mode 外觀行為凍結,驗收 2.5-4 必做 |
| 多 session 夾 commit | 呢個 repo 有多個 session 共用 worktree | **唔准 `git add -A`**;只 add 明確改過嘅檔;commit 前 `git status` 核對 |

另:`frontend/hymn-app/AGENTS.md` 要求寫 code 前查 Expo v56 文檔——今次改動全部係
純 JS/RN 層,冇新 Expo API,但 Sonnet 開工前照規矩過一眼。

四項互相獨立、可以逐項 commit(建議四個獨立 commit,方便逐項驗收/回滾)。

---

# 6. 建議執行次序

1. **第 1 項**(一行 + 註解,最細)→ commit
2. **第 4 項**(獨立於隊列邏輯)→ commit
3. **第 3 項**(最危險,擺喺 1 之後做——因為 1 落地後自訂清單冇尾巴,測試矩陣簡單啲)→ commit
4. **第 2 項**(純 UI,獨立)→ commit
5. emulator 全套驗收(§1.5 / §2.5 / §3.6 / §4.5)→ 交 Opus 5 驗收 → Eric 真機試
   (第 2 項鍵盤問題真機必試)

---

# 7. 需要 Eric 拍板 / 留意嘅位(執行唔使等,但要話返俾 Eric 知)

1. **第 1 項後果**:清單播完就停,最後一首 ⏭ 冇嘢跳——呢個係「唔加其他嘢」嘅
   必然結果,如果 Eric 想「播完停,但 ⏭ 揿落去先至攞隨機歌」係另一個功能,要另開需求。
2. **第 4 項邊界**:而家方案係「重開 app 時冇聲先清場;背景仲播緊就唔郁」。如果
   Eric 想連「swipe 走 app 音樂即停」都要,先改 `AppKilledPlaybackBehavior`(§4.3)。
3. **「繼續收聽」卡**:今次冇剷。如果 Eric 覺得呢個都係「記住上次」要清,另開需求。
4. **第 3 項分隔線文案**:暫定「接返原本清單」,Eric 睇實物後可以再執字眼。

---

## 7a. Eric 拍板結果(2026-07-29,經 Dispatch 落實,已由 Sonnet 5 執行)

以下四點係 Eric 對上面 §7 四條開放問題嘅親口決定,**推翻咗本文件對應段落嘅原
建議/暫定寫法**——本文件上面 §1-§6 嘅敘述保留做「Fable 5 規劃時嘅原始構思」
存底參考,但實際落地嘅行為**以呢度為準**:

1. **⏭ 掣(對應 §7-1)**:清單播完(冇晒 autoplay 尾巴)之後撳 ⏭ = **無反應**,
   撳咗冇嘢發生,唔使特別提示、唔使 disable 樣式。維持 §1.5 原驗收標準,呢個
   已經係 §1 一行改動嘅自然結果,**冇額外 code 改動**。
2. **swipe 走 app(對應 §7-2 / §4.3)**:**推翻 §4.3「建議唔改」**——Eric 要求
   手指 swipe 走成個 app,音樂要即刻停,連出面嘅 mini player bar／通知欄都要
   一齊取消(唔係之前處理嗰個「背景繼續播」情境,嗰個係撳 Home 掣去背景、
   app process 未死,唔受呢個改動影響)。落實:`App.js`
   `TrackPlayer.updateOptions()` 嘅 `android.appKilledPlaybackBehavior` 由
   `ContinuePlayback` 改做 `StopPlaybackAndRemoveNotification`。§4.2 嘅
   「冷啟動冇播緊就清場」邏輯**照做唔變**(對付 service 未死嗰個殘留隊列窗口,
   兩者互補唔衝突)。
3. **「繼續收聽」卡(對應 §7-3)**:**推翻 §4.1「今次冇叫剷」**——Eric 原話
   「總之關 app 後播放頁的清單重新開始唔會有記憶」,呢張卡(靠 `lastPlayed.js`
   記低最後一首)同呢條新規矩正面衝突,**已剷**:
   - `src/components/home/HomeScreen.js`:刪走「繼續收聽」`TouchableOpacity`
     區塊(連 `getLastPlayed` import 同 `last` 變數),「隨心聽」自己撐晒成行
     (`quickBtnFull`),死碼 `quickBtnHalf` style 一併刪走。
   - `src/lastPlayed.js`:整個 module 刪咗(冇其他 consumer)。
   - `App.js`:刪走 `saveLastPlayed`/`getLastPlayed` import、`playQueue()`
     入面嗰句 `saveLastPlayed(...)` 寫入、開機預熱 `useEffect` 入面攞
     `getLastPlayed()` 嗰段(「今日為你預備」6 首嘅預熱唔受影響,照做)。
4. **第 3 項分隔線文案(對應 §7-4)**:**推翻暫定字眼**——最終文案定為
   **「即將播放」**(唔係 §3.2 暫定嗰句「接返原本清單」)。`App.js` 隊列 sheet
   `renderItem` 入面 `index === player.insertBoundary` 嗰塊 UI 已經改用呢句,
   icon 用 `playlist-play`(同自動播放分隔線嘅 `shuffle` icon 區分)。

四項 code 改動已完成(見對應檔案內嘅 2026-07-29 註解),等 Dispatch 轉俾
Opus 5 做獨立驗收,驗收清單照 §1.5/§2.5/§3.6/§4.5,**加多一條**:第 4 項驗收
要新增「swipe 走 app(唔係撳 Home)→ mini player/notification 即刻消失、音樂
即停」,同埋首頁確認「繼續收聽」卡已經完全唔見。
