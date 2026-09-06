# 共用 SheetShell 執行單 — 8 個底部面板統一下滑收起 2026-09-06

Eric 拍板（09-06）：方案 A——抽共用 `SheetShell`，8 個 Modal 面板全部換用。觸發 bug：Android「加入到清單」sheet 滑唔到收起（09-05 admin「在線」sheet 同一病，只修咗一個）。根源：ROOTCAUSE §C5（UI 原子件重複實作）。
流程：Fable 5.1 規劃 → Sonnet 5 執行 → Opus 5 驗收 → Fable gate 部署（純 JS，OTA）。基準 HEAD `3224e96`。

## 0. 紅線
- 🔴 唔掂 gorhom 播放清單 sheet（App.js `<BottomSheet>`）——佢有真手勢，唔喺範圍。
- 🔴 唔改任何 sheet 嘅業務邏輯 / 資料流 / props 介面（`visible`/`onClose`/`open()` hook 呢啲對外形狀不變）；只換「殼」。
- 🔴 唔改 PlayerProvider。唔加依賴（RNGH 2.31.2 已有；`GestureHandlerRootView` App.js 最外層已包，但 **native `<Modal>` 係獨立 window，Modal 內要自己再包一個 `GestureHandlerRootView`**——09-05 admin sheet 已證實）。
- 🔴 已知陷阱必守：(a) backdrop 唔可以用 `absoluteFillObject`（07-29 實測收唔到 touch，要 `flex:1`）；(b) Android Modal 要 `statusBarTranslucent navigationBarTranslucent`（否則同 activity 座標系錯位）；(c) Modal + Android `KeyboardAvoidingView` 唔穩，用 `keyboardDidShow` 手動抬高（AddToPlaylistSheet 現有做法）；(d) `keyboardShouldPersistTaps="handled"` 本身係鍵盤收唔返嘅病因（memory 08-22/09-01），唔好新增。
- 唔部署；唔開模擬器做「驗收」（執行者只做 harness + 一次 sim smoke，正式驗收由 Opus 做）。

## 1. 設計：`src/components/SheetShell.js`

```
<SheetShell
  visible            // boolean（AdminPresence/Invite/FriendShares/SharedPlaylist/PlaylistDetail 現時用 conditional mount，改成 visible 或保留 mount 都得，但殼要兩種都撐）
  onClose            // 必填
  variant="bottom" | "center"   // bottom = 貼底 sheet（有 handle + 下滑手勢）；center = 置中 dialog（無手勢，fade）
  title              // 可選，殼負責畫標題列 + ✕
  showClose={true}   // ✕ 掣（保底，09-05 已驗證做法）
  keyboardAware      // bottom variant：用 keyboardDidShow 手動 marginBottom（沿用 AddToPlaylistSheet 嘅 KB_SAFETY_BUFFER 邏輯）
  maxHeight="80%"
  dismissOnBackdrop={true}
  scrollable         // 內容係 FlatList/ScrollView：手勢只掛喺 handle+title 區（同 admin sheet 做法），唔搶捲動
  children
/>
```
- 手勢：照 `AdminPresenceSheet.js:74-84` 嘅 RNGH `Gesture.Pan().activeOffsetY(8).failOffsetX([-20,20]).runOnJS(true)`，`translationY > 60 || velocityY > 500` → 動畫落底再 `onClose`；否則彈返。`Animated.Value` translateY 跟手。
- `scrollable=false` 且內容唔捲動（例如 AddFriendSheet、center dialog）：手勢可以掛成張 card。
- Android 返回鍵 `onRequestClose={onClose}` 保留。
- 唔用 `absoluteFillObject`；backdrop `TouchableOpacity flex:1 activeOpacity={1}`。
- 殼內最外層 `GestureHandlerRootView style={{flex:1}}`。

## 2. 遷移清單（8 個，逐個一個 commit 或分兩批）
| # | 檔 | variant | 特別位 |
|---|---|---|---|
| 1 | `components/AddToPlaylistSheet.js` | add mode → bottom（scrollable, keyboardAware）；create/rename mode → center | 三 mode 共用一個 Modal，殼要按 mode 切 variant；「上下兩塊 backdrop 置中」做法可由殼嘅 center variant 取代 |
| 2 | `screens/AdminPresenceSheet.js` | bottom（scrollable） | 已有手勢+✕，改為用殼（刪自己嗰套） |
| 3 | `screens/AddFriendSheet.js` | center 或 bottom（依現時視覺——fade 置中 → center；有 TextInput → keyboardAware） | 有 tab + TextInput；`TouchableWithoutFeedback` 收鍵盤邏輯保留 |
| 4 | `screens/InviteFriendsSheet.js` | bottom（scrollable） | |
| 5 | `screens/FriendSharesSheet.js` | bottom（scrollable） | |
| 6 | `screens/SharedPlaylistSheet.js` | bottom（scrollable） | 而家冇 `transparent`——核對現時視覺（全屏定貼底），照原樣 |
| 7 | `screens/PlaylistDetailSheet.js` | bottom（scrollable） | 同上；分享中鎖返回（SCR-018）唔喺範圍，唔改 |
| 8 | `components/AdminEditHymnSheet.js` | bottom（scrollable, keyboardAware） | 現時 iOS 用 KAV、Android `behavior=undefined`（1A ADMIN-002 P1：Android 鍵盤遮掣）——換殼嘅 keyboardAware 手動抬高後 ADMIN-002 順手修埋，要喺報告寫明 |

每個遷移後：檔案行數應該淨減（殼吸收咗 scrim/card/handle style）；對外 props / hook 介面不變（grep caller 零改動，MineScreen/Library/HymnList 唔使郁）。

## 3. 驗證（執行者出證據，唔判）
| 項 | 證據 |
|---|---|
| H1 harness | babel 轉真 module（W1 前端 harness 方法）render `SheetShell` 兩個 variant：children 有 render、`onClose` 喺 backdrop press / ✕ press 各 fire 一次；手勢 callback 用 mock `Gesture` 驗 threshold（60px / 500 velocity）分支 |
| H2 靜態 | 8 個檔 `grep -c "<Modal"` 全部 0（Modal 只喺 SheetShell）；`grep absoluteFillObject` 8 檔 + 殼 = 0；`grep keyboardShouldPersistTaps` 數量唔准多過 before |
| H3 caller 不變 | `git diff --stat` 顯示 MineScreen/LibraryScreen/HymnListScreen/App.js **零改動**（如有必須改，逐處解釋） |
| H4 sim smoke（一次，iOS sim Release build 或 dev build 都得，唔准掂 Android AVD——留俾 Opus）| 8 個 sheet 各開一次截圖：手勢下滑收起 ✅/❌、✕ 收起、背景收起、返回鍵（Android 由 Opus 做）；有 FlatList 嘅 sheet 捲動仍正常；AddToPlaylist create mode 鍵盤彈出時輸入框喺鍵盤上面 |
| H5 行數 | 8 檔 + 殼 淨行數 before/after |

## 4. 交付
Commit（pathspec）：殼一個、遷移可一個或分批、報告一個。報告 `SHEETSHELL-REPORT-20260906.md`：設計、每個 sheet 改咗乜、H1–H5 證據、做唔到嘅。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。

## 5. Opus 驗收要點（預告）
兩平台真手勢：iOS sim 用 idb 拖（09-05 已知 idb 可驗 RNGH Pan）、Android AVD `adb shell input swipe`——8 個 sheet × 下滑/✕/背景/返回鍵；FlatList 捲動唔被手勢搶；鍵盤場景（AddToPlaylist create、AddFriend、AdminEdit）Android 輸入框唔被遮；負控：橫掃唔會閂。
