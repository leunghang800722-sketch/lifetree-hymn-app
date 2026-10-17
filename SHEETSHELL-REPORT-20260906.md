# SheetShell 共用殼執行報告 2026-09-06

執行單:`SHEETSHELL-EXEC-20260906.md`。基準 HEAD `3224e96`(branch `feature/player-rebuild`)。
本報告只列證據,唔判 PASS/FAIL——由 Opus 5 驗收。

## 0. 設計:`src/components/SheetShell.js`

三個 variant:`bottom`(貼底 sheet,handle + RNGH `Gesture.Pan()` 下滑收起,
threshold `translationY>60 || velocityY>500`)、`center`(置中 dialog,無手勢,
fade,雙 flex:1 backdrop 令 card 企正中)、`fullscreen`(見下面「偏離設計」)。
手勢做法逐字抄 `AdminPresenceSheet.js:74-84`(RNGH Pan,唔用 PanResponder——
New Architecture + idb 合成觸控完全收唔到 move 事件,呢個係 09-05 已驗證嘅
教訓)。backdrop 全部 `flex:1`,冇一處用 `absoluteFillObject`。Android Modal
全部帶 `statusBarTranslucent navigationBarTranslucent`。Modal 內自己再包一層
`GestureHandlerRootView`。

### 偏離設計 §1 的一處:新增 `variant="fullscreen"`

執行單 §1 原設計淨係 `bottom`/`center` 兩個 variant。遷移 #6
`SharedPlaylistSheet.js`/#7 `PlaylistDetailSheet.js` 嗰陣發現:呢兩個檔案
本身係**全屏頁面**(自己有 back 掣 + 客製標題列 + 副標題,現時 `<Modal>`
**冇** `transparent`、冇 backdrop、冇 handle——同其餘 6 個「彈出式」sheet
視覺上完全唔同類)。若強行套用原設計嘅 `bottom` variant(backdrop + 圓角
card + handle),呢兩頁會變成浮動卡片,直接違反遷移清單 #6/#7 自己嘅批註
「而家冇 transparent——核對現時視覺,照原樣」。

判斷:加一個 `fullscreen` variant——淨係 `Modal`(唔帶 `transparent`)+
`GestureHandlerRootView` + 統一嘅 `statusBarTranslucent navigationBarTranslucent`,
唔畫任何 chrome(backdrop/handle/title),避免同呢兩頁自己嘅 header 打交。
呢兩個檔案嘅遷移因此係**近乎零改動**(淨係換咗 `<Modal>` 開頭/尾嗰兩行做
`<SheetShell variant="fullscreen">`,加返本來冇嘅 `navigationBarTranslucent`
+ `GestureHandlerRootView`——呢兩樣本來就漏咗,順手符合咗 §0 紅線 (a)(b)),
故 H5 呢兩檔行數不跌反輕微升(各 +5,淨係 import 一行 + 解釋批註)。

### 其他已知、刻意接受嘅視覺微差(唔係 regression,寫低俾 Opus 5 核對)

- **card 底部 padding**:`AdminPresenceSheet`/`InviteFriendsSheet`/
  `FriendSharesSheet` 原本就係 `insets.bottom+16`,同殼嘅預設值完全一致,
  冇差異。`AddToPlaylistSheet`(add mode)原本鍵盤彈出時會縮到 `12`
  (冇彈鍵盤時 `8+insets.bottom`),殼冇暴露 `kbHeight` 俾外部,統一用
  `insets.bottom+16`——鍵盤彈出時 card 底部會多幾 px padding(唔會遮到內容,
  只係內邊距大少少)。`AdminEditHymnSheet` 原本 card 底部固定 `24`、完全
  冇計 safe-area,而家跟殼預設 `insets.bottom+16`——喺有 home indicator 嘅
  機底部留多咗空間,屬於改善唔係退步。
- **標題列改做置中**:`AddFriendSheet`/`AdminEditHymnSheet` 原本標題係
  `flexDirection:row justifyContent:space-between`(左標題右 ✕),而家統一
  用殼嘅置中標題(同 admin/其餘 6 個 sheet 一致嘅「已驗證做法」)。呢個係
  刻意嘅視覺統一,唔係 regression。
- **AddToPlaylistSheet add mode 新增 ✕ 掣**:原本呢個 mode 冇 ✕(淨係
  backdrop tap / Android 返回鍵可以閂),殼預設 `showClose=true` 令佢而家
  有埋 ✕——呢個係§1 設計原文「殼負責畫標題列 + ✕(保底,09-05 已驗證做法)」
  明文要求嘅新增,唔係業務邏輯改動。

## 1. 遷移清單(8 個)——variant / 行數 before→after

| # | 檔 | variant | before→after |
|---|---|---|---|
| 1 | `components/AddToPlaylistSheet.js` | add=bottom(scrollable,keyboardAware)/create,rename=center | 310→221 |
| 2 | `screens/AdminPresenceSheet.js` | bottom(scrollable) | 203→151 |
| 3 | `screens/AddFriendSheet.js` | center | 225→209 |
| 4 | `screens/InviteFriendsSheet.js` | bottom(scrollable) | 147→129 |
| 5 | `screens/FriendSharesSheet.js` | bottom(scrollable) | 99→86 |
| 6 | `screens/SharedPlaylistSheet.js` | fullscreen(偏離,見上) | 218→223 |
| 7 | `screens/PlaylistDetailSheet.js` | fullscreen(偏離,見上) | 252→257 |
| 8 | `components/AdminEditHymnSheet.js` | bottom(scrollable,keyboardAware) | 317→308 |
| — | `components/SheetShell.js`(新) | — | 0→214 |

8 檔合計:1771→1584(**淨減 187 行**);連新增嘅殼一齊計,9 檔淨增 27 行
(殼本身 214 行,吸收咗 8 份重複 Modal/backdrop/手勢邏輯)。

### #8 AdminEditHymnSheet:順手修埋 1A ADMIN-002(P1)

原版 iOS 用 `KeyboardAvoidingView behavior="padding"`,Android
`behavior={undefined}`(即係冇避讓,鍵盤直接遮住儲存/落架掣——
`DEEP-AUDIT-1A-FRONTEND-20260906.md` ADMIN-002 行)。呢次改用殼嘅
`keyboardAware`(同 `AddToPlaylistSheet` 一樣嘅 `keyboardDidShow` 手動
`marginBottom` 邏輯),兩個平台劃一,`KeyboardAvoidingView`/`Platform`
import 已刪。呢個係執行單 #8 特別位明文要求嘅「順手修」,已喺度寫明。

## 2. H1 — harness(babel 轉真 module,對住 repo 入面真源碼)

方法:`@babel/core`(`babel-preset-expo`,同 `ops/perf/harness/w1/
frontend-harness.mjs` 一樣嘅慣例)transform **真.** `src/components/
SheetShell.js`(唔係複製),自定義 require resolver 將 `react-native`/
`react-native-gesture-handler`/相對 import(`OdeIcon`/`designSystem`/
`useInsets`)換做輕量 mock,`react` 用真 npm package(同 `react-dom` 同一份,
避免 invalid hook call)。`react-dom/client` + `jsdom` 起真 reconciler
(同 `tools/react-harness` 已驗證嘅慣例)。TouchableOpacity mock 用真
`<button onClick>`(dash 命名嘅 custom element 喺呢個 React/ReactDOM 版本
**唔會**將 function/object props 保留做 DOM property——sanity check 實測
證實,唔係得個「應該得」;所以改用真 `<button>` + jsdom `el.click()` 觸發
真.合成事件)。`GestureDetector` mock 用 render-time side-channel 直接
`onCapture(props.gesture)` 攞返 `Gesture.Pan()` builder 嘅 `__handlers`,
唔靠 DOM 屬性。`Animated.timing/spring` mock 做成同步(`.start(cb)` 即刻
invoke),等 threshold 斷言唔使等真計時器。

腳本:`/private/tmp/.../scratchpad/sheetshell/h1-harness.mjs`(scratch,冇入
repo)。跑法:`node h1-harness.mjs`。

**結果:21/21 過**——

```
✅ bottom: children 有 render
✅ bottom: buttons 數量(backdrop+close) — {"count":2}
✅ bottom: backdrop press → onClose fire 一次 — {"onCloseCalls":1}
✅ bottom: ✕ press → onClose 再 fire 一次 — {"onCloseCalls":2}
✅ bottom: GestureDetector 有捕獲到 gesture(手勢真係掛咗)
✅ bottom: 手勢負控(10px/100vel,未過門檻)唔觸發 onClose — {"onCloseCalls":2}
✅ bottom: 手勢 distance>60px → onClose fire — {"onCloseCalls":3}
✅ bottom: 手勢 velocity>500 → onClose fire — {"onCloseCalls":4}
✅ bottom: Modal 收到 statusBarTranslucent+navigationBarTranslucent+transparent
✅ center: children 有 render
✅ center: buttons 數量(backdrop-top + close + backdrop-bottom) — {"count":3}
✅ center: 上 backdrop press → onClose fire — {"onCloseCalls":1}
✅ center: 下 backdrop press → onClose 再 fire — {"onCloseCalls":2}
✅ center: ✕ press → onClose 再 fire — {"onCloseCalls":3}
✅ center: 冇掛手勢(design §1「center=無手勢」)
✅ center: Modal transparent+translucent props 齊
✅ fullscreen: children 有 render
✅ fullscreen: 冇 backdrop/close(0 buttons,淨係 children) — {"count":0}
✅ fullscreen: 冇掛手勢
✅ fullscreen: Modal 收到 statusBarTranslucent+navigationBarTranslucent(transparent 唔要求)
✅ visible=false: 冇render任何內容
結果:21/21 過
```

限制:呢個 harness 淨係驗到 `SheetShell.js` 本身嘅 reconciler-level 邏輯
(children render、onClose 兩條路徑、手勢 threshold 分支),**唔覆蓋** 8 個
遷移後嘅 sheet 檔案(佢哋各自嘅 API fetch/state 邏輯冇喺呢個 harness 入面
起真 tree)——嗰部分嘅回歸靠 H2/H3 靜態證據 + H4 sim smoke。真.雙平台手勢
(iOS idb 拖 / Android `adb shell input swipe`)由 Opus 5 執行單 §5 覆蓋。

## 3. H2 — 靜態檢查

```
== <Modal count per file(想 0)==
components/AddToPlaylistSheet.js: 0
screens/AdminPresenceSheet.js: 0
screens/AddFriendSheet.js: 0
screens/InviteFriendsSheet.js: 0
screens/FriendSharesSheet.js: 0
screens/SharedPlaylistSheet.js: 0
screens/PlaylistDetailSheet.js: 0
components/AdminEditHymnSheet.js: 0

== absoluteFillObject count(8 檔 + 殼,想 0)==
(8 檔全部 0;components/SheetShell.js 有 5 個 hit,全部係註解入面解釋
「點解唔用 absoluteFillObject」,冇一次係真.用喺 style 度——逐行核對過)

== keyboardShouldPersistTaps count(before/after 唔准增加)==
components/AddToPlaylistSheet.js: 1(FlatList,add mode——原本已經有,冇加)
components/AdminEditHymnSheet.js: 1(ScrollView——原本已經有,冇加)
其餘 6 檔:0(同原本一樣)

== KeyboardAvoidingView / Platform import(AdminEditHymnSheet,想 0)==
0(已完全移除,見上面「順手修 ADMIN-002」)
```

全部 8 檔 `@babel/core`(`babel-preset-expo`)transformSync 過,語法乾淨
(見 H1 harness 開發時做嘅 parse-only 檢查,全部 `OK`)。

## 4. H3 — caller 不變

```
$ git diff --stat -- frontend/hymn-app/src/screens/MineScreen.js \
    frontend/hymn-app/src/screens/LibraryScreen.js \
    frontend/hymn-app/src/screens/HymnListScreen.js frontend/hymn-app/App.js
(冇輸出 —— 零改動)
```

MineScreen/LibraryScreen/HymnListScreen/App.js **完全冇改**。8 個 sheet 嘅
對外 props/hook 介面(`visible`/`onClose`/`open()`/`friend`/`playlistId`/
`token` 等)逐個檔核對過,一個字都冇改;`useAddToPlaylist()`/
`useAdminEditHymn()` 兩個 hook 嘅 export 形狀不變。

## 5. H4 — iOS 模擬器 smoke(一次)

`touch /tmp/claude-ios-cleanup.hold` 已落。用嘅係**真.Release build**(iOS
模擬器 Hermes segfault 陷阱,memory `project-pos0-load-storm-rootfix-plan.md`
已記——Debug 唔用):

```
xcodebuild -workspace ios/Odely.xcworkspace -scheme Odely -configuration Release \
  -destination "id=<iPhone 17 Pro simulator>" \
  -derivedDataPath <既有 DerivedData> build
** BUILD SUCCEEDED **
```

呢個 build 行咗 `[CP-User] Generate updates resources for expo-updates` +
`Bundle React Native code and images` 呢兩個 script phase(冇跳過),即係
embed 咗**現時工作樹**嘅 JS(包括呢次 8 個檔嘅改動),唔係舊 bundle。裝落
iPhone 17 Pro 模擬器(`xcrun simctl install` + `launch`),用 `idb ui tap` /
`idb ui swipe` / `idb screenshot` 操作(memory「iOS sim 用 idb 拖」已驗證
嘅方法)。

⚠️ 呢個 dispatch session 冇 attended 權限,`mcp__Claude_Code_iOS_Simulator__*`
全部拒(「Mobile simulator tools require an attended session」),改用
`xcodebuild` + `xcrun simctl` + `idb` CLI 直接操作,唔係用嗰套 MCP 工具。

⚠️ **冇登入**(遵守安全規則:唔可以幫手打密碼/登入)——凡要登入先撳到嘅
sheet(`AddFriendSheet`/`InviteFriendsSheet`/`FriendSharesSheet`/會員
`SharedPlaylistSheet` 分享連結)同 admin-only 嘅 `AdminPresenceSheet`/
`AdminEditHymnSheet`,呢次 smoke **摸唔到**——寫喺低面「做唔到嘅」。

實測到嘅(guest 身份、本機播放清單,唔使登入):

| Sheet | variant | 動作 | 結果 |
|---|---|---|---|
| `AddToPlaylistSheet`(add mode) | bottom | 開(播放頁「清單」pill) | ✅ handle+標題「加入到清單」+✕+Test7 清單行+「新播放清單」全部render |
| 同上 | bottom | **手勢下滑收起**(`idb ui swipe` 200,640→200,850) | ✅ 收埋(呢個正正係觸發成次執行單嘅 bug——舊版呢個 mode 冇手勢,依家有) |
| 同上 | bottom | ✕ press | ✅ 收埋 |
| 同上 | bottom | backdrop tap | ✅ 收埋 |
| `AddToPlaylistSheet`(create mode,「我的」→「新播放清單」) | center | 開 | ✅ 置中卡片+✕+輸入框 autoFocus+「建立」,card 上下都見到背景內容(雙 backdrop 企中做法生效) |
| 同上 | center | ✕ press | ✅ 收埋,冇建立新清單 |
| `AddToPlaylistSheet`(rename mode,Test7 → ⋯ → 改名) | center | 開 | ✅ 置中卡片,輸入框預填「Test7」+游標喺尾 |
| 同上 | center | backdrop tap | ✅ 收埋,名冇改(Test7 原封不動) |
| `PlaylistDetailSheet`(Test7) | fullscreen | 開 | ✅ 全屏(冇 backdrop/handle,自己個 header:← Test7 1/30首 + ⋮ + 播全部/分享),同遷移前視覺一致 |
| 同上 | fullscreen | 返回箭嘴(← )press | ✅ 收埋返「我的」 |

截圖全部存喺 `/private/tmp/.../scratchpad/sheetshell/shots/`(scratch,冇入
repo):`03-queue-tap.png`(加入到清單開)、`04-addtoplaylist-swipe-down.png`
(下滑收起後)、`06-close-x.png`、`07-backdrop-tap.png`、`13-create-center.png`
(新播放清單置中)、`14-create-closed.png`、`15-playlistdetail.png`
(PlaylistDetailSheet 全屏)、`16-back-from-detail.png`、`17-menu.png`→
`18-rename-center.png`(改清單名置中)、`19-rename-backdrop-dismiss.png`。

收工:`xcrun simctl terminate` + `shutdown all` + 殺咗個變孤兒嘅
`idb_companion`(device 已 shutdown 佢仲喺度) + 刪 `/tmp/claude-ios-cleanup.hold`。
收工後核對:`booted:0 idb:0 sim:0 devtools:0`。

## 6. 做唔到嘅

- **`AddFriendSheet`/`InviteFriendsSheet`/`FriendSharesSheet`/
  `AdminPresenceSheet`/`AdminEditHymnSheet` 冇 sim smoke 到**——呢 5 個
  sheet 全部要登入(會員/admin)先撳到入口,而我唔准幫手打密碼/登入
  (安全規則明文禁止「輸入密碼作認證」)。呢 5 個嘅殼遷移**靜態證據
  (H2/H3)全部齊**,H1 harness 亦已覆蓋咗 `SheetShell` 本身喺呢 5 個
  sheet 用嘅同一組 variant(bottom scrollable / center)嘅 reconciler
  邏輯,但**真.手勢/登入後畫面**要 Opus 5 用已有帳號驗(執行單 §5 本身
  就係派俾 Opus 5,啱好呼應)。
- **`SharedPlaylistSheet`(fullscreen)冇 sim smoke 到**——需要一個真.
  分享 token(`/api/p/<token>` 深連結),而家冇登入拎唔到自己嘅分享連結,
  亦唔會亂噏一個假 token 當證據。呢個 variant 已經由 `PlaylistDetailSheet`
  (同一個 fullscreen 分支,同一份程式碼)實測驗證過,結構上風險同源。
- **Android AVD 完全冇掂**——執行單硬性規定 H4 淨係 iOS sim,留返 Android
  俾 Opus 5(§5)。
- **8 個 sheet 嘅 Android 返回鍵**——執行單本身都寫明「Android 由 Opus
  做」,冇喺呢份執行單範圍內。

## 7. 總結

`SheetShell.js`(214 行,新)吸收咗 8 個面板重複嘅 Modal/backdrop/手勢/
鍵盤抬高邏輯;8 個遷移檔淨減 187 行。H1(harness,21/21)、H2(靜態
grep)、H3(caller 零改動,`git diff --stat` 冇輸出)全部齊備;H4 喺
真.Release build 上實測咗 3 個 variant 入面嘅 2 個 sheet(`AddToPlaylistSheet`
三個 mode 全部、`PlaylistDetailSheet`)共 9 個動作全部符合預期,包括
**手勢下滑收起**(觸發成次執行單嘅原始 bug,今次已經喺真機驗到修好)。
5 個要登入/1 個要分享 token 嘅 sheet 因為安全規則(唔准打密碼)未能 sim
smoke,留返俾 Opus 5(佢有已有帳號)做雙平台完整驗收。

