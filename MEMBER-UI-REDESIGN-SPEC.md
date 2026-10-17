# 會員版面視覺重整規格(交 Sonnet 落地)

> 2026-07-29 Fable 5 出稿。Eric 要求:會員/帳戶版面「靚啲、專業啲」。
> 參考風格:Spotify 個人檔案頁(大頭像+層次分明)+ YouTube Music 帳戶頁(分組設定 list)。
> 呢個 app 冇社交功能,粉絲/關注數字嗰啲**唔跟**;跟嘅係「帳戶卡 + 分組 list item 配 icon」呢套骨架。

## 0. 範圍同鐵律

改三個 surface,全部係視覺/結構重整,**唔郁任何 auth / sync 邏輯**:

| Surface | 檔案 | 現況 |
|---|---|---|
| A. 登入後帳戶頁 | `frontend/hymn-app/src/screens/AuthScreen.js`(`if (user)` 嗰段,拆出新檔) | 得個頭像+名+一個登出掣,好齋 |
| B. 「我的」tab 帳戶卡 | `frontend/hymn-app/src/screens/MineScreen.js`(`account` 嗰段) | 通用 person icon;登入後撳落去彈 Alert |
| C. 登入頁 polish | `AuthScreen.js`(email form)+ `PhoneLoginScreen.js` | 功能齊,細節未執 |

鐵律(嚟自 `src/theme/designSystem.js` 同 REDESIGN-PLAN §5.2):

1. **只准用 `COLORS` token,唔准寫死 hex。** AuthScreen 而家有一堆寫死(`#0B0F0E`/`#121A17`/`#3DB389`/`#F5F7F4`/`#9AA696`/`#888`/`#666`/`#1F2925`),今次順手全部換做 token。唯一例外:錯誤/破壞性動作紅 `#E8896D`(PhoneLoginScreen 已用緊),可以加落 designSystem 做 `COLORS.danger` 再引用。
2. **金色 `COLORS.gold` 唔准出現喺帳戶版面** ——只限金句/精選。
3. 字級跟 `TYPOGRAPHY`;正文最少 16。
4. 品牌:名叫 God Music;logo 用 `assets/android-icon-foreground.png`(同 home header / 登入頁一致);十字/音符 icon 唔好自己另畫。
5. 所有頂部元素用 `useInsets()`,唔好寫死 top。
6. **共用 worktree**:commit 只 add 指定檔案,唔准 `git add -A`。

## 1. Surface A — 登入後帳戶頁(重頭戲)

### 1.1 結構

新檔 `src/screens/AccountScreen.js`。`AuthScreen.js` 入面 `if (user) return <AccountScreen onClose={onClose} />`,原本嗰段 profile JSX 刪走。AuthScreen 檔案本身繼續做「未登入 → email form / PhoneLoginScreen」嘅分流,呢部分唔郁。

版面由上至下(成頁 `COLORS.background`,可 ScrollView,`paddingHorizontal: 20`):

```
[X 關閉掣]                          ← 右上,insets.top + 8,同而家一樣
────────────────────────────
        ◯ 大頭像 84px             ← 置中
        用戶名 / 尾號 XXXX          ← 24pt / 800
        +852 XXXX XXXX             ← 14pt textSecondary
     [☁ 已同步] 狀態 pill          ← 細 pill,置中
────────────────────────────
帳戶                                ← 組標題
┌──────────────────────────┐
│ ♡  我的最愛           23 ›│      ← 分組卡片,rows 逐行
│ ≡♪ 我嘅清單            4 ›│
│ ☁  同步狀態        已同步 │
└──────────────────────────┘
一般
┌──────────────────────────┐
│ ⓘ  關於 God Music   v1.x ›│
└──────────────────────────┘
┌──────────────────────────┐
│ ⎋  登出                   │      ← danger 色
└──────────────────────────┘

        v1.x · OTA 07-29 · abc123   ← VersionTag,置中,bottom padding 24+insets.bottom
```

### 1.2 帳戶 header 區

- 頂部留 `insets.top + 64`,再擺頭像。
- **頭像**:84px 圓形,`backgroundColor: COLORS.accent`,中間一隻大寫首字母(38pt / 800 / `COLORS.background` 色)。首字母來源沿用而家 AuthScreen 嘅 fallback 鏈:`user.username → user.phone 尾四位 → '?'` 嘅第一個字元。**唔好**用通用 person icon —— 首字母頭像先似 Spotify/Google 嗰種「有身份」嘅感覺。
- **顯示名**(marginTop 14):`user.username`,冇就 `尾號 ${user.phone.slice(-4)}`,再冇就「未命名帳戶」。24pt / 800 / textPrimary。
- **副標題**(marginTop 4):真 email(非 `@placeholder.local`)顯示 email,否則顯示完整電話。14pt textSecondary。
- **同步狀態 pill**(marginTop 12,置中,自適應闊度):
  - 已同步:icon `cloud-done` 16px + 「已同步」,兩者 `COLORS.accent`,底 `COLORS.card`,borderRadius 999,padding 6/12。
  - 有嘢等緊:icon `cloud-queue` + 「N 項等緊同步」,文字 `COLORS.textSecondary`。
  - 數字用 MineScreen 現成嘅 `useOutboxLength()` 做法(`getOutboxLength` from `../sync/userSync`,2 秒 poll)——直接搬個 hook 過嚟或者抽去 shared 檔都得。

### 1.3 分組 list(YouTube Music 款)

通用規格:

- **組標題**:13pt / 600 / textSecondary,`marginTop 28, marginBottom 10, marginLeft 4`。
- **組卡片**:`backgroundColor: COLORS.card`,`borderRadius: 16`,rows 直排,row 之間分隔線 `COLORS.border` 1px、左邊 inset 56(避開 icon 區)。
- **Row**:高 56,`flexDirection: row`,`paddingHorizontal: 16`。左邊 icon 22px `COLORS.accent`(擺喺 32px 闊嘅位置置中);中間 label 16pt textPrimary;右邊(可選)value 文字 14pt textSecondary + chevron-right 20px textSecondary。有 onPress 嘅 row 用 `TouchableOpacity activeOpacity={0.6}`,冇嘅用 View。

組同 rows:

**「帳戶」組**
| Row | icon | value | 撳落去 |
|---|---|---|---|
| 我的最愛 | `favorite` | 最愛數目(`useFavorites`) | `onClose()` 關 modal(背後就係我的 tab)※ |
| 我嘅清單 | `queue-music` | 清單數目(`usePlaylists`) | 同上 ※ |
| 同步狀態 | `cloud-done`/`cloud-queue` | 已同步 / N 項等緊同步 | 冇動作,冇 chevron |

※ P1 加強(可留 TODO 唔做):App.js 傳 `onNavigate(tab, segment)` 落嚟直接跳去我的 tab 對應 segment。MVP 淨係 `onClose()` 已經合理,因為個 modal 大多數時候由我的 tab 開。

**「一般」組**
| Row | icon | value | 撳落去 |
|---|---|---|---|
| 關於 God Music | `info-outline` | `v${Constants.expoConfig?.version}` | `Alert.alert('God Music', <VersionTag 同款 label 字串>)`——可以將 VersionTag 嘅 `buildLabel()` export 出嚟重用 |

**登出組**(獨立一張卡,同「一般」隔 12)
- 單一 row:icon `logout` + 「登出」,兩者 `COLORS.danger`(#E8896D),冇 chevron。
- 撳落去:`Alert.alert('登出', '本地嘅最愛同清單會保留喺呢部機。', [取消, 登出(destructive → logout(); onClose())])`——用返 MineScreen 而家嘅二次確認做法,唔好一撳即登出。

### 1.4 底部

`<VersionTag>` 置中,`marginTop 32`,`paddingBottom insets.bottom + 24`。私隱政策/服務條款連結**今次唔做**(未有頁面;上 store 前再補)。

## 2. Surface B — MineScreen 帳戶卡

改動最細,三件事:

1. **登入後個頭像顯示首字母**:40px accent 圓形 + 首字母(18pt / 800 / background 色),同 Surface A 同一條 fallback 鏈,兩邊視覺先扣到。未登入維持 `person-outline` icon(`cardLight` 底)。
2. **登入後撳帳戶卡 → `onOpenAuth()` 開帳戶頁**(AuthScreen 見到 user 就會 render AccountScreen),刪走而家嗰個「帳戶/登出」Alert。登出動作由帳戶頁負責,唔使兩個入口。
3. **未登入嘅卡執字眼**:標題「登入 / 註冊」(而家係「未登入」,太負面),副標題維持「登入後可以同步最愛同清單」。可以俾張卡加 1px `COLORS.border` 邊或者 icon 轉 accent 色令佢似個 CTA 啲,但唔好成塊變 accent 色(唔好嘈過內容)。

## 3. Surface C — 登入頁 polish(輕手)

功能同流程完全唔郁(OTP 兩步、cooldown、切 email 全部照舊),純視覺執:

兩頁共通:
- 寫死 hex 全部換 `COLORS` token(見 §0 鐵律 1)。
- 主 CTA 掣統一:高 52,`borderRadius: 26`(pill,同「播全部」pill 語言一致),`COLORS.accent` 底、`COLORS.background` 字 17pt/700。
- 輸入框統一:`COLORS.card` 底 + 1px `COLORS.border`,`borderRadius: 12`,高 52;**focus 時 border 轉 `COLORS.accent`**(用 state + onFocus/onBlur,呢個係「專業感」最抵買嘅一步)。
- 次要連結(切換模式/改電話/用電郵):14pt,accent 色,`paddingVertical 10` 確保有足夠 touch target。

AuthScreen(email form):
- 品牌區維持 icon(`android-icon-foreground.png` 88px)+「God Music」24pt/800 + 副題;副題同 form 之間留 36。
- 錯誤提示由 `Alert.alert` 改做 inline 紅字(13pt `COLORS.danger`,input 下面)——同 PhoneLoginScreen 已有嘅 `err` 做法拉齊。(Alert 留返俾 submit 網絡錯誤都得,inline 優先。)

PhoneLoginScreen:
- 頂部 `smartphone` icon 換做品牌 icon(`android-icon-foreground.png` 72px)——兩條登入路徑而家一條見品牌一條見通用 icon,唔統一。
- 驗證碼 input 維持大字 letterSpacing 做法,唔使搞六格分離輸入。

## 4. 唔做 / 冇呢樣嘢(同 Eric 確認過嘅背景)

- **社交數字**(粉絲/關注)——app 冇社交功能,唔跟 Spotify 呢部分。
- **Admin 功能 row**——前後端而家**冇任何 admin 角色概念**,唔好憑空整個入口;第日有 admin flag 先喺「一般」組上面加「管理」組。
- **通知設定**——app 未有任何通知偏好設定,冇嘢俾人較,唔擺空殼 row。
- **私隱政策/服務條款**——未有頁面,上 store 前補。
- **淺色模式** ——跟 §5.4,深色為主。
- `SettingsScreen.js` / `FavoritesScreen.js` / `LoginScreen.js` 係舊版遺留、App.js 冇引用,**唔好**攞嚟改;今次亦唔使孭埋刪舊檔(另開手尾單)。

## 5. 檔案改動清單(預期)

| 檔案 | 動作 |
|---|---|
| `src/screens/AccountScreen.js` | 新增(Surface A) |
| `src/screens/AuthScreen.js` | 刪 profile 段改引 AccountScreen;email form polish;換 token |
| `src/screens/PhoneLoginScreen.js` | polish;品牌 icon |
| `src/screens/MineScreen.js` | 帳戶卡三項改動 |
| `src/theme/designSystem.js` | 加 `danger: '#E8896D'` |
| `src/components/VersionTag.js` | export `buildLabel`(俾「關於」row 用) |

## 6. 驗收 checklist(emulator)

1. 未登入:我的 tab 帳戶卡顯示「登入 / 註冊」,撳開登入頁;email/電話兩條路 UI 統一,focus 時 input 邊框着燈。
2. 登入後:我的 tab 帳戶卡見首字母頭像;撳卡開帳戶頁(唔再彈 Alert)。
3. 帳戶頁:頭像/名/電話正確;最愛同清單數目啱數;飛行模式加一個最愛 → 同步 pill 變「1 項等緊同步」,恢復網絡後變返「已同步」。
4. 「關於」row 彈 version 資訊,同頁底 VersionTag 一致。
5. 登出:有二次確認;登出後帳戶頁自動變返登入頁(AuthScreen `user` 冇咗會自動 re-render,行為同而家一樣);本地最愛/清單保留。
6. 冇任何金色出現;grep 確認 AuthScreen/PhoneLoginScreen/AccountScreen 冇寫死品牌 hex。
7. OTP 新用戶(冇 username、placeholder email):帳戶頁顯示「尾號 XXXX」+ 完整電話,唔會出 `?` 或 placeholder email。
