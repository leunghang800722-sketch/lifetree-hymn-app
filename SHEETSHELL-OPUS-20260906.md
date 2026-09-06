# SheetShell 共用殼 —— Opus 5 獨立驗收 2026-09-06

驗收對象:`956ecf6`(SheetShell.js)+ `c5a40ca`(8 個 sheet 遷移)+ `ce3af1c`(報告),base `4fc8278`。
執行單 `SHEETSHELL-EXEC-20260906.md`,執行者報告 `SHEETSHELL-REPORT-20260906.md`。
截圖:`ops/perf/audit-20260906/sheetshell-opus/`(51 張,iOS 34 + Android 17)。

---

## 0. 結論

**🟢 可以 OTA**,但有 **一個 P2 要先修**(`SheetShell` keyboardAware + maxHeight 會令 card 頂爆出畫面外,
兩個平台都實測重現咗)。P2 之外全部通過:8 個 sheet × 4 個動作 × 兩個平台全綠,
對外介面零改動,紅線全守,原始 bug(Android「加入到清單」滑唔到收起)**兩個平台都實測修好**。

判斷理由:P2 只影響 `AdminEditHymnSheet`(admin-only,`maxHeight="85%"` 呢一個 caller),
而且喺 Android 上仍然係**淨改善**(修好咗 ADMIN-002 —— 儲存/落架掣本來完全俾鍵盤遮死);
喺 iOS 上係**輕微退步**(原本 `KeyboardAvoidingView` 處理得啱)。可以揀:
(a) 先修 P2 再一齊 OTA(建議,改動細,見 §2 P2 修法);(b) 照 OTA 再補一個 follow-up。
**Eric 只用 admin 帳號改歌,呢個 sheet 佢自己會撞到,建議揀 (a)。**

### 🔴 OTA 前必看:worktree 有另一個 session 嘅未完成改動

驗收期間有另一個 session(`PLAYNEXT-EXEC-20260906`「下一首播放」)喺同一個 worktree 開工:

| 時間 | 事件 |
|---|---|
| 17:11 | 我 iOS Release build 出 `main.jsbundle`(工作樹 = `ce3af1c`,frontend 乾淨,實測過 `git status --porcelain -- frontend` 空) |
| 17:30 | 我 Android `expo export:embed` 出 bundle(同上,frontend 仍乾淨) |
| 17:41 | 另一 session commit `8c2894b`(純 docs) |
| 17:49 / 17:51 | 另一 session **改咗** `frontend/hymn-app/App.js`(+110 行)同 `src/components/AddToPlaylistSheet.js`(+37 行),未 commit |

- ✅ 我兩個平台嘅實測**全部喺呢兩個改動之前 build**,證據對 `ce3af1c` 有效,冇被污染。
- 🔴 但係 **`ops/deploy/ota-publish.sh` 前一定要清場**:而家推 OTA 會夾帶「下一首播放」半成品,
  而嗰個改動**掉轉咗 `AddToPlaylistProvider` / `PlayerProvider` 嘅巢狀次序**(App.js),
  屬於高風險、未經驗收嘅改動。跟返 memory `project-eas-update-rollout` 嘅紅線:
  stash 指定 file、只推 SheetShell 嗰 3 個 commit 嘅內容。

---

## 1. 逐條問題

嚴重度:P1 = 必須修先可以出街;P2 = 建議修先;P3 = 可以 OTA 後補;P4 = 記錄用,唔使郁。

### P2-1 `keyboardAware` 抬高 card 但 `maxHeight` 唔跟住縮 → card 頂(handle/標題/✕)爆出畫面外

- **檔:行** `frontend/hymn-app/src/components/SheetShell.js:174-185`
- **機制**:`maxHeight`(prop,預設 `'80%'`)係相對**成個畫面**計嘅百分比,
  而 `marginBottom: kbHeight + KB_SAFETY_BUFFER` 又將 card 向上推鍵盤咁高。
  `AdminEditHymnSheet` 用 `maxHeight="85%"`,鍵盤大約佔 38-42%,
  `85% + 40% = 125% > 100%` → 上面嗰塊 `flex:1` backdrop 縮到 0 之後,card 頂直接推出畫面外。
- **證據**(兩個平台都重現,唔係單一機):
  - iOS:`ops/perf/audit-20260906/sheetshell-opus/ISSUE-ios-adminedit-header-offscreen.png`
    —— 「編輯詩歌」標題、✕、handle 全部唔見咗,「原始 YouTube 標題」直接疊住狀態列時鐘。
  - Android:`ISSUE-and-adminedit-header-offscreen.png` —— 同樣症狀。
  - Harness 量到嘅實數(`h1b-opus.mjs` D3/D4):鍵盤 300 → `marginBottom=312`,
    但 `maxHeight` 一路維持 `'85%'`,證實兩個數冇互相約束。
- **後果**:鍵盤彈起期間**冇得撳 ✕、冇得下滑收起**(handle 唔見咗)。
  Android 仲有返回鍵可以走,iOS 就要先收鍵盤先閂到 sheet。
  內容本身冇損失(ScrollView 捲得到,儲存/落架掣正常喺鍵盤上面 —— 見 `ios-B12` / `and-B4-adminedit-kb-scroll2`)。
- **iOS 係退步**:舊版 `AdminEditHymnSheet` 用 `KeyboardAvoidingView behavior="padding"` 包住 scrim,
  容器高度先縮咗,`85%` 係計「剩返嗰截」的 85%,結構上唔會爆。
  **Android 唔算退步**(舊版 `behavior={undefined}` = 完全冇避讓,掣直接俾鍵盤遮死 = 1A ADMIN-002),
  今次 ADMIN-002 確實修好咗,只係順手帶咗呢個新副作用。
- **建議修法**(殼入面一個地方,唔使郁 8 個 caller):
  ```js
  const win = useWindowDimensions();
  // 鍵盤彈出時,card 嘅可用高度 = 畫面高 − 鍵盤 − buffer,取同 maxHeight 之間細嗰個
  const effMaxHeight = keyboardAware && kbHeight > 0
    ? Math.max(0, win.height - kbHeight - KB_SAFETY_BUFFER)
    : maxHeight;
  ```
  然後 card style 用 `effMaxHeight` 取代 `maxHeight`。
  (`AddToPlaylistSheet` add mode `maxHeight="65%"`,65%+40%≈105%,實測**冇**爆(iOS/Android 都試過鍵盤場景冇問題),
  但同一個修法會一齊保住佢。)

### P3-1 `AdminPresenceSheet` 嘅下滑手感區縮細咗(09-05 已驗證嗰個範圍冇保住)

- **檔:行** `SheetShell.js:155-171`(手勢只包 handle + header)vs 舊 `AdminPresenceSheet.js`(base `4fc8278`)
  嗰段註解明文寫「頂部(**手柄+標題+三個數**)掛 PanResponder」。
- **證據**:兩個平台實測「喺三個數字磚(總在線/會員/訪客)嗰行向下拖」→ **sheet 唔會收起**
  (iOS:`node ax.mjs 總在線` 拖完仍在;Android:`OPEN`)。喺標題行拖就照收起。
- **影響**:可下拉區由大約 120pt 縮到大約 55pt。功能上冇壞(執行單 §1 本身寫「手勢只掛喺 handle+title 區」),
  但呢個係 **Eric 09-05 已經簽收過嗰個 sheet 嘅手感退步**,佢真機一撳好可能會即刻感覺到「difficult 咗」。
- **建議**:殼加一個 `headerExtra`(render 喺 header 之下、仍然喺 `GestureDetector` 入面)prop,
  `AdminPresenceSheet` 將 statsRow 由 children 搬入 `headerExtra`。純加法,唔影響其餘 7 個。

### P3-2 兩個 provider sheet 冇咗「收起動畫」(code-level 推論,冇逐格量度)

- **檔:行** `SheetShell.js:109` `if (!visible) return null;`
- **機制**:遷移前 `AddToPlaylistSheet` / `AdminEditHymnSheet` 係 `<Modal visible={visible}>`(**一直掛住**),
  RN Modal 自己做 slide-out;而家殼喺 `visible=false` 就成個 return null,`<Modal>` 直接 unmount,
  冇 exit 動畫。下滑收起嗰條路唔受影響(殼自己 `Animated.timing` 落底先 call `onClose`)。
- **另外 6 個 sheet 冇分別**(佢哋 base 版本本身就係 `if (!visible) return null` 再 `<Modal visible>`)。
- **誠實聲明**:我冇用逐格錄影量度過「舊版有動畫 / 新版冇」,呢條係讀 code 推出嚟;
  兩個平台肉眼睇截圖分唔到。列 P3 係因為影響純視覺,而且方向明確。

### P3-3 標題行嘅 ✕ 唔佔寬度,長標題會爬入 ✕ 底下

- **檔:行** `SheetShell.js:211-213` —— `titleRow` 係 `justifyContent:'center'`,
  `closeBtn` 係 `position:'absolute', right:0`(絕對定位 = 唔貢獻寬度),
  `title` 得 `numberOfLines={1}` 但冇 `maxWidth`/`flex`。
- **風險 caller**:`FriendSharesSheet` 標題係 `` `${friend.username} 分享緊嘅清單` ``,username 長就會撞。
  實測嗰個 friend(`phase4-verify-a`)標題 frame x=82→319(402 寬),仲未撞到 ✕(x=370)。
- **建議**:`title` 加 `maxWidth: '78%'`(或者 titleRow 兩邊留 `paddingHorizontal: 52`)。潛在,未實地失敗。

### P4-1 `showClose` 而冇 `title` 會出一個零高度 header(潛在,冇 caller 中招)

`SheetShell.js:111-120`:header 只得一個絕對定位嘅 ✕ 嘅話,`titleRow` 高度會係 0,
再加 `bottomCard` 有 `overflow:'hidden'` → ✕ 會俾裁走。
而家 6 個非 fullscreen 嘅 sheet 全部有傳 `title`,所以**冇實際中招**。將來加新 sheet 要小心。

### P4-2 兩個 provider 嘅鍵盤 listener 成世掛住

`SheetShell.js:78-83` 個 effect 冇 `visible` 依賴,而 `AddToPlaylistProvider`/`AdminEditHymnProvider`
係 App 全程掛住 → 全 App 任何地方彈鍵盤都會 `setKbHeight` 一次(component 當時 render null)。
`AddToPlaylistSheet` 遷移前一樣有呢個行為(冇退步);`AdminEditHymnSheet` 係新增一個。
成本可以忽略,記錄用。

### P4-3 三個 prop 係 dead code

`scrollable={false}` 分支(`SheetShell.js:192-196`)、`dismissOnBackdrop`、`cardStyle` —— 8 個 caller 一個都冇傳。
唔係缺陷(執行單 §1 有寫),但 W3 dead-code register 可以記一筆。

---

## 2. 紅線 / 介面 / 靜態檢查(全部過)

| 項 | 結果 | 證據 |
|---|---|---|
| 8 個 sheet `<Modal` 數 | 全部 **0** | 逐檔 `grep -c '<Modal'`;`SheetShell.js` 4 個(3 個真 + 1 個喺註解) |
| `absoluteFillObject` | **0 次真用** | `SheetShell.js` 5 個 hit 全部喺註解(行 13/14/18/32/140,逐行核過);8 檔全 0 |
| `statusBarTranslucent navigationBarTranslucent` | 三個 variant **全部有** | `SheetShell.js:126 / 136 / 188` |
| Android `KeyboardAvoidingView` | **0**(已完全移除) | `grep KeyboardAvoidingView` 9 檔只剩 2 行註解 |
| 新增 `keyboardShouldPersistTaps` | **冇新增** | before/after 都係 AddToPlaylist=1、AdminEdit=1、其餘 6 檔=0 |
| Modal 內 `GestureHandlerRootView` | 三個 variant 全部有 | `SheetShell.js:127 / 137 / 189` |
| gorhom 播放清單 sheet | **冇掂** | `git diff 4fc8278..ce3af1c -- frontend/hymn-app/App.js` 零輸出 |
| caller 零改動 | **確認** | `git diff --stat 4fc8278..ce3af1c -- MineScreen/LibraryScreen/HymnListScreen/App.js` 零輸出;整個 frontend 只改咗 9 個檔 |
| 對外 export 簽名 | **8/8 一模一樣** | 逐檔 before/after 比 `export (default )?function` / `export const` 行 |
| 業務邏輯/資料流 | **冇順手改** | 逐 diff 讀:API call、state、hook、`useAddToPlaylist()`/`useAdminEditHymn()` 形狀、`nameInputRow`、`row()`、sync 邏輯全部原封;搬動全部係「Modal/backdrop/handle/手勢/鍵盤抬高」呢層殼 |
| H5 行數 | **報告數字啱** | 8 檔 1771 → 1584(淨 −187);殼 214 行。(⚠️ 用 `git show ce3af1c:` 對,唔可以對工作樹 —— 工作樹已被另一 session 改咗) |

### 手勢參數(對照 `AdminPresenceSheet` 09-05 已驗證值)—— 逐個對到

| 參數 | 09-05 已驗證 | SheetShell | 我 harness 實測 |
|---|---|---|---|
| `activeOffsetY` | 8 | 8 | ✅ `8` |
| `failOffsetX` | `[-20,20]` | `[-20,20]` | ✅ `[-20,20]` |
| `runOnJS` | `true` | `true` | ✅ `true` |
| 收起門檻 | `translationY>60 \|\| velocityY>500` | 同 | ✅ 90px→閂 / 30px+100vel→唔閂 |
| 落底距離/時間 | 600 / 160ms | 600 / 160ms | ✅ `animLog=[600]` 先 fire `onClose` |
| `Animated.Value` reset | 落底 callback 內 `setValue(0)` 再 `onClose` | 同 | ✅ `onClose` 前 `dragY=0`(第二次開位置正常) |

### `fullscreen` 第三個 variant —— 判斷:**合理,唔算超範圍**

執行單 §1 個 enum 的確只寫 bottom/center,但 §2 遷移清單 #6/#7 自己嘅批註寫「而家冇 `transparent`
——核對現時視覺,照原樣」。用 bottom variant 會將兩個**全屏頁**變成浮動卡片,直接違反嗰句。
`fullscreen` 淨係 `Modal + GestureHandlerRootView + 兩個 translucent prop`,唔畫任何 chrome,
係「最細改動達成 §2 要求」嘅做法。而且新加嘅 `navigationBarTranslucent` **修好咗一個舊 bug**:
兩個檔嘅 list `contentContainerStyle` 本來已經加 `insets.bottom`
(`PlaylistDetailSheet.js:182` / `SharedPlaylistSheet.js:153`),mini player 亦有 `paddingBottom: bottomInset`
(`App.js:4337`),但 Modal window 之前**冇** edge-to-edge,即係雙重讓位。今次對齊咗。
兩個平台實測視覺同遷移前一致(`ios-F1` / `and-F1` / `ios-K2` / `and-K1`)。
⚠️ 未測:3-鍵導航 Android(AVD 係手勢導航)。

---

## 3. Harness

### H1(執行者嗰份,我原地重跑)—— 21/21 過

`/private/tmp/.../scratchpad/sheetshell/h1-harness.mjs`,`node h1-harness.mjs`,
loader 讀嘅係 repo 真檔 `src/components/SheetShell.js`。結果同報告一字不差。

### H1b(我自己補寫,補 H1 冇覆蓋嘅四樣)—— 21/21 過 + 儀器正控成功

`/private/tmp/.../scratchpad/sheetshell-opus/h1b-opus.mjs`。補嘅係:

- **A. Pan 參數真值** —— H1 個 `Pan()` mock 將 `activeOffsetY/failOffsetX/runOnJS` 嘅參數**掉咗**
  (`() => builder`),所以 H1 **量唔到** 8 / ±20 / true 呢三個數。我改咗 mock 記低參數,三條全對。
- **B. `Animated.Value` reset** —— 拖 90px→`dragY=90`;過門檻→先行到 600、`onClose` 前 reset 0;
  負控 30px/100vel 唔閂兼彈返 0;向上拖 −50 `dragY` 唔郁。
- **C. 手勢有冇搶 FlatList** —— `scrollable=true` 時 children **唔喺** `GestureDetector` 入面(只有 handle+title);
  `scrollable=false` 時整張 card 先入手勢區。
- **D. keyboardAware** —— 真係掛 `keyboardDidShow/Hide`;300 → `marginBottom=312`;收鍵盤消失;
  `center` variant 唔掛 listener;**D4 順手量到 P2-1 嗰個 `maxHeight` 唔跟住縮**。
- **E. 儀器正控** —— 故意寫一條「center 有手勢」嘅錯斷言,harness 如實報 ❌(即係佢分辨得到真假)。

---

## 4. 兩平台 8 × 4 矩陣

**建置 provenance**

| | iOS | Android |
|---|---|---|
| commit | `ce3af1c`(frontend 工作樹乾淨) | 同 |
| 方法 | `xcodebuild -configuration Release -derivedDataPath <新>`,`main.jsbundle` 3,737,835 B(Hermes,17:11 產生) | 1B 方法:`expo export:embed --dev false`(2,665,982 B)→ `hermesc -O -emit-binary -w`(3,702,004 B)→ 換 `assets/index.android.bundle` → `zipalign` → debug keystore 重簽(cert `fac61745…`,同 1B 同一條) |
| 機 | iPhone 17 Pro sim(iOS 26.5),uninstall + install | AVD `hymntest`(Android 14,1080×2400),`adb install -r -d` + `pm clear` |
| OTA 隔離 | `Expo.plist` 改 `EXUpdatesCheckOnLaunch=NEVER`、`EXUpdatesEnabled=false`;App 內顯示「v1.5.1 · 內置包」 | `pm clear` 清走已下載更新 → 行 APK 內嵌(即我 patch 落去嗰份);logcat 見 09-05 嗰個 production update 只係 `isUpdatePending=true`,**冇 relaunch 所以冇套用** |
| 正控(證明真係行緊新 JS) | 「加入到清單」sheet 有 ✕ **兼且**下滑收得起 —— 兩樣舊版都冇 | 同 |
| 登入 | 本機 mint `{id:6,username:'opus-verify'}` JWT 寫入 AsyncStorage(iOS `RCTAsyncLocalStorage_V1/manifest.json`、Android `databases/RKStorage` `catalystLocalStorage`),key `@hymn…uth`(U+2026)。**冇打過密碼,secret/token 冇 print 冇入檔** | 同 |

**矩陣**(✅ = 行為正確;`—` = 呢個 variant 冇呢個 affordance;`n/a` = 平台冇)

| # | Sheet | variant | 平台 | 下滑收起 | ✕ | 背景 | 返回鍵 |
|---|---|---|---|---|---|---|---|
| 1a | AddToPlaylist(add) | bottom | iOS | ✅ | ✅ | ✅ | n/a |
| 1a | AddToPlaylist(add) | bottom | Android | ✅ | ✅ | ✅ | ✅ |
| 1b | AddToPlaylist(create) | center | iOS | ✅ 唔收(設計) | ✅ | ✅ | n/a |
| 1b | AddToPlaylist(create) | center | Android | ✅ 唔收(設計) | ✅ | ✅ | ✅ |
| 1c | AddToPlaylist(rename) | center | iOS | ✅ 唔收(設計) | ✅ | ✅ | n/a |
| 1c | AddToPlaylist(rename) | center | Android | ✅ 唔收(設計) | ✅ | ✅ | ✅ |
| 2 | AdminPresence | bottom | iOS | ✅ | ✅ | ✅ | n/a |
| 2 | AdminPresence | bottom | Android | ✅ | ✅ | ✅ | ✅ |
| 3 | AddFriend | center | iOS | ✅ 唔收(設計) | ✅ | ✅ | n/a |
| 3 | AddFriend | center | Android | ✅ 唔收(設計) | ✅ | ✅ | ✅ |
| 4 | InviteFriends | bottom | iOS | ✅ | ✅ | ✅ | n/a |
| 4 | InviteFriends | bottom | Android | ✅ | ✅ | ✅ | ✅ |
| 5 | FriendShares | bottom | iOS | ✅ | ✅ | ✅ | n/a |
| 5 | FriendShares | bottom | Android | ✅ | ✅ | ✅ | ✅ |
| 6 | SharedPlaylist | fullscreen | iOS | ✅ 唔收(設計) | — (自己個 ←) ✅ | — | n/a |
| 6 | SharedPlaylist | fullscreen | Android | ✅ 唔收(設計) | — (自己個 ←) ✅ | — | ✅ |
| 7 | PlaylistDetail | fullscreen | iOS | ✅ 唔收(設計) | — (自己個 ←) ✅ | — | n/a |
| 7 | PlaylistDetail | fullscreen | Android | ✅ 唔收(設計) | — (自己個 ←) ✅ | — | ✅ |
| 8 | AdminEditHymn | bottom | iOS | ✅ | ✅ | ✅ | n/a |
| 8 | AdminEditHymn | bottom | Android | ✅ | ✅ | ✅ | ✅ |

**負控 / 附加場景**

| 場景 | iOS | Android | 備註 |
|---|---|---|---|
| 橫掃 handle/標題區唔會閂(`failOffsetX`) | ✅ | ✅ | AddToPlaylist add mode |
| 喺 FlatList/ScrollView 內容區向下拖 → **唔會閂** | ✅ AddToPlaylist / AdminEdit | ✅ AddToPlaylist / AdminEdit / AdminPresence | 手勢冇搶捲動 |
| FlatList 真係捲得到(內容多過一屏) | ✅ InviteFriends(`ios-J2`) | ✅ InviteFriends(`and-J2`) | 標題/handle 留喺原位 |
| 開→閂(下滑)→再開,位置正常 | ✅ | ✅(`and-A3`,連閂 4 次後) | `dragY` reset 生效 |
| 鍵盤:AddToPlaylist create | ✅ 輸入框+建立掣喺鍵盤上 | ✅ 同 | center 本來就冇 keyboardAware,同遷移前一樣 |
| 鍵盤:AddFriend(phone-pad 冇 return 掣) | ✅ 卡完整喺鍵盤上;撳卡空白位收到鍵盤、sheet 唔閂 | ✅ 同 | 08-22/09-01 個鍵盤 fix 過咗遷移 |
| 鍵盤:AdminEditHymn 儲存/落架掣 | ✅ 唔俾遮(要捲) | ✅ 唔俾遮(**ADMIN-002 修好**) | 但 card 頂爆出畫面 → **P2-1** |
| logcat FATAL/ANR | n/a | **0** | 全程 |
| ReactNativeJS error/exception | n/a | **0** | 全程 |

---

## 5. OTA 之後 Eric 真機最少一項檢查

**最少一項(必做):** Android 真機,詩歌庫任揀一首撳「≡+」開「加入到清單」,
**用手指喺標題「加入到清單」嗰行向下拉** —— 要收得起。
(呢個正正係 09-06 觸發成件事嘅 bug,亦係唯一一個「Eric 撞過、而且靜態證據證明唔到」嘅點。)

**如果仲有時間,順便兩項:**
1. admin long-press 一首歌開「編輯詩歌」→ 撳任何一個輸入框彈鍵盤 → 睇下**上面「編輯詩歌」個標題同 ✕ 仲喺唔喺度**。
   (P2-1;如果 OTA 前已經修咗,呢一項就係驗返個修。)
2. 「我的」→ 在線 sheet:試下**喺「總在線/會員/訪客」三個數字磚嗰行**向下拉。
   而家拉唔郁(P3-1),要拉標題嗰行先收得起 —— Eric 覺得唔順手就照 P3-1 修法加返。

---

## 6. 我做唔到 / 冇量到嘅

1. **P3-2「冇咗收起動畫」冇逐格量度** —— 純讀 code 推論(見上),兩個平台肉眼截圖分唔到。
2. **3-鍵導航 Android 冇測** —— AVD `hymntest` 係手勢導航。`fullscreen` variant 新加咗
   `navigationBarTranslucent`,理論上因為 list padding 同 mini player 都已經計咗 `insets.bottom`
   所以係改善,但冇喺 3-鍵導航實地睇過。
3. **iOS 軟鍵盤要開 Simulator.app 先出到** —— headless `simctl` boot 之下 focus 咗輸入框都唔彈軟鍵盤
   (期間有一個 `v` 由硬件鍵盤路徑入咗「顯示歌名」欄,**冇撳儲存**,已核對 `hymns.db` `display_title`
   仍然係「恩典太美麗」,冇寫入)。開咗 Simulator.app 之後正常,鍵盤場景全部喺嗰之後做。
4. **平板 / 細螢幕機冇測** —— center variant 冇 keyboard 避讓(遷移前後一樣),
   細螢幕機理論上鍵盤有機會遮到 center 卡底部。呢個唔係今次引入嘅,但都冇驗證過。
5. **`FriendSharesSheet` 長 username 撞 ✕(P3-3)冇實地重現** —— 測試帳號嘅好友只有
   `phase4-verify-a`(短),要人手改 DB 先撞得到,冇做。
6. **測試留低嘅狀態**:為咗開 `SharedPlaylistSheet`,用 `POST /api/me/playlists/pl_verify01/share`
   幫 **opus-verify 自己嘅**「驗收清單」生咗一條分享 token(永久有效、可以用
   `DELETE /api/me/playlists/pl_verify01/share` 撤銷)。除此之外:iOS 期間誤撳過一次「恩典太美麗」嘅
   心心,**已經即場撳返走**(最愛數返回 9);冇改過任何詩歌資料;冇 restart backend;冇掂 Cloudflare;
   Android AVD 上嘅 patched APK 測完已 `adb uninstall`(連注入嗰個 token 一齊清走)。
7. **收工衛生**:`booted:0 idb:0 sim:0 devtools:0 emu:0`(emulator + adb server 都收咗),
   測試期間落嘅 `/tmp/claude-ios-cleanup.hold` 已刪。所有 build artifact / patched APK / mint script
   淨係喺 scratchpad,冇一個入 repo(repo 只多咗呢份報告同 51 張截圖)。
