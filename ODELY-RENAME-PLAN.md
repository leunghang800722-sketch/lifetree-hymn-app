# Ode → Odely 改名 — 落地規劃(ODELY-RENAME-PLAN)

> 狀態:**規劃完成,等 Eric 過目**(2026-08-10,Fable 5 出稿)。批准後交 Sonnet 5 執行、Opus 5 獨立驗收(標準三層流程)。
> 來源:Desktop `~/Desktop/ode-design-package/Ode音樂詩歌應用設計v4.zip`(handoff 已解壓核對全文,唔係靠二手摘要)。
> 上次 rebrand 參考:ODE-REBRAND-PLAN.md(God Music→Ode)。**今次規模細好多**:logo 圖形、色板、icon、字體、間距全部唔變,純粹改字——係「換字唔換皮」,唔係再嚟一次 rebrand。

---

## 0. 一句話

App 由 **Ode** 改名 **Odely**(Ode 撞名,Eric 已查過 Odely 冇撞)。Logo 圖形不變;字標由「ode」改「odely」,因為長咗一個字母,header 字標由 32px/letterSpacing 1.5 收窄做 **30px/letterSpacing 1.2**。分兩步:先 OTA(app 內全部文字)+ backend restart(分享頁/APK 檔名),再出一隻新 APK(裝機 icon 下面個 app 名)。

---

## 1. v3 / v4 交付包實際內容(已解壓 diff 過)

兩個 zip 都係淨係 `handoff/` 三份檔(ODE-HANDOFF.md + odeTheme.js + odeIcons.js),冇圖片切圖。

**v3(logo 環 bug fix)**:話 header logo 環「得 28dp、用 View 自己畫假環」係錯,要由 `assets/ode-logo.jpeg` 原圖裁 52dp,並新增 `logoRing()`/`logoRingImage()` helper + `LOGO_SIZES = {header:52, player:22, splash:156}`。

**v4(改名)**:喺 v3 基礎上淨係改咗——
- 所有「ode」字標 →「odely」,logo 圖形/色板/間距/質感**全部唔變**
- header 字標:Sora 200 / **32px→30px** / letterSpacing **1.5→1.2**(色 `#EDE7FA` 不變)
- 播放器頂:logo 環 22dp + `odely` **17px**(size 不變,淨係改字)
- splash 字標:44→**40**、letterSpacing 5→**4**
- odeTheme.js 唯一 token 改動:`wordmarkSize: 32→30`
- odeIcons.js:除咗第一行 comment「Ode→Odely」,**icon 內容零改動**
- 驗收要求:全 repo 冇殘留面向用戶嘅單獨「ode」字標字串

### ⚠️ v3 唔使做 — 已經落咗地

實查 repo:v3 講嘅「假環 bug」喺 commit `efe1655` 已修——而家全 app 四個位(header 52dp、播放器頂 22dp、AuthScreen 88dp、PhoneLogin 72dp)全部用 **pre-cropped 真圖 asset** `assets/logo-ring.png`(156px=52dp@3x,連 @2x/@3x),唔係 View 畫假環。做法同 v3 建議嘅「runtime 裁切 helper」唔同機制,但視覺結果一樣(真圖、52dp)。

**結論:唔好照搬 v3 嘅 `logoRing()` helper 去重構**——現有 pre-cropped PNG 做法效果相同、仲慳 runtime 計算,冇理由為對齊文件而改動四個穩定用位。v3 淨係當「驗收對照」用:Opus 驗收時實測 header 環係 52dp 真圖就得。v4 嘅 `wordmarkSize:30` 直接跟。

---

## 2. 現況盤點(全部 grep 實數,2026-08-10)

### 2.1 OTA 層(純 JS/asset,改完 `eas update` 即到所有 runtime-4 用戶)

| # | 檔案:行 | 現況 | 改成 |
|---|---|---|---|
| 1 | `frontend/hymn-app/App.js:1474` | header 字標 `<Text>ode</Text>` | `odely` |
| 2 | `App.js:1513-1520` `brandTitle` style | fontSize **32** / letterSpacing **1.5**(寫死,唔係用 token) | **30 / 1.2** |
| 3 | `App.js:1691` | 播放器頂 `<Text>ode</Text>`(17px) | `odely`(size 不變) |
| 4 | `App.js:1743` | 分享文案 `（Ode 詩歌）` | `（Odely 詩歌）` |
| 5 | `src/screens/AuthScreen.js:81` | 登入頁字標 `ode`(26px/ls1.2) | `odely`(size 不變,ls 已係 1.2) |
| 6 | `src/screens/AccountScreen.js:73` | `Alert.alert('Ode', …)` build 資訊彈窗標題 | `'Odely'` |
| 7 | `src/screens/AccountScreen.js:127` | 「關於 Ode」 | 「關於 Odely」 |
| 8 | `src/screens/AddFriendSheet.js:71` | 「一齊用 Ode 詩歌 App」 | 「Odely 詩歌 App」 |
| 9 | `src/screens/InviteFriendsSheet.js:15` | 邀請文案「我邀請你用 Ode 詩歌 App」 | 「Odely 詩歌 App」 |
| 10 | `src/theme/designSystem.js:73-75` | `brand.letterSpacing:1.5`、`brandHeader:32`、`brandSplash:44` | **1.2 / 30 / 40**(對齊 v4;注意 App.js 用位係寫死數字,token 改咗都要改埋用位,見 #2) |

**執漏(順手做,同用戶無關)**:
- `src/screens/LoginScreen.js:53`、`src/screens/SettingsScreen.js:24` 兩個**死畫面**(App.js 冇 import,grep 證實)仲寫住「God Music」——上次 rebrand 已漏咗一次。建議今次直接**剷檔案**,一了百了;唔想剷就改字。
- `assets/wordmark.png`(744×376,舊「ode」字圖)——grep 證實**全 repo 冇引用**,係死 asset,剷。

### 2.2 Backend 層(改完 restart 即生效,要行 deploy gate)

| # | 檔案:行 | 現況 | 改成 |
|---|---|---|---|
| 11 | `backend/routes/share.js:159` | 分享 SSR 頁 `title: 'Ode 詩歌'` | `'Odely 詩歌'` |
| 12 | `backend/routes/share.js:167` | og 描述「喺 Ode 同你分享咗一個詩歌清單」×2 | 「喺 Odely 同你分享」 |
| 13 | `backend/routes/share.js:186` | 頁面 brand 字「Ode 詩歌」 | 「Odely 詩歌」 |
| 14 | `backend/server.js:77,81` | APK 下載檔名 `Ode-v{版本}.apk` / fallback `Ode.apk` | `Odely-v{版本}.apk` / `Odely.apk` |

### 2.3 Native 層(一定要新 APK 先生效)

| # | 檔案 | 現況 | 改成 | 影響 |
|---|---|---|---|---|
| 15 | `frontend/hymn-app/app.json:3` | `"name": "Ode"` | `"Odely"` | expo config 層 app 名 |
| 16 | `android/.../values/strings.xml` | `<string name="app_name">Ode</string>` | `Odely` | **裝機 icon 下面個名 + 媒體通知度顯示嘅 app 名**——呢個先係出新 APK 嘅真正理由 |

**Splash 唔使郁**:native splash(`splashscreen_logo.png` + styles.xml layer-list)係**淨環冇字樣**(styles.xml comment 白紙黑字寫明),app 內亦冇畫過 splash 字標(`brandSplash` token 從來冇用位)。即係 splash 本身冇「ode」字,改名對佢零影響。v4 嘅「splash 字標 40/ls4」規格只喺將來真係加 splash 字標時先適用——今次唔好順手加(跟 handoff 一貫原則:唔好加設計檔冇拍板嘅嘢)。

**App icon 唔使郁**:上次 R2 已定案裝機 icon「只留環、冇字樣」(24dp 根本讀唔到字),adaptive icon 四件都係環,冇 ode 字。Opus 驗收時肉眼覆核一次 `assets/icon.png`/foreground 確實冇字就得,有字先要重出。

### 2.4 明確唔郁(紅線,同 Eric 交代咗嘅排除範圍)

| 項目 | 現值 | 點解唔郁 |
|---|---|---|
| Android package id / iOS bundle id | `com.hymnapp.praise` | 改咗=另一隻 app,舊用戶升唔到級,極高風險 |
| deep link scheme | `godmusic` | 燒咗入已出街 APK;改咗會斷分享/邀請深連結。用戶睇唔到呢個字串 |
| intent filter hosts | `api.god-music.com` + `api.odemusics.com` | 雙域運作中,同改名無關 |
| domain | `odemusics.com`(先兩日上線) | Eric 冇要求;今次唔碰 DNS/cert(亦係 subagent 紅線) |
| EAS `slug`/`owner`/`projectId` | `hymn-app` / `god-music-team` | 改咗會斷 OTA 鏈路,用戶睇唔到 |
| app store listing | 未上架 | 未有嘢可改 |
| `runtimeVersion` | `4`(app.json + strings.xml 兩處) | **今次冇任何 native 依賴改動,唔准 bump**——bump 咗現有 vc54 用戶即刻收唔到 OTA。呢個係今次最緊要嘅「唔好做」 |
| 內部代號(`OdeIcon`/`odeIcons.js`/`odeTheme`/`docs/design-ode/`/ODE-REBRAND comment) | — | 用戶睇唔到,rename 係純 churn 兼容易搞出 import 錯。v4「全 repo 冇殘留 ode」理解做**面向用戶字串**;內部代號保留(§6 有問 Eric 確認) |

---

## 3. 執行計劃:兩個 Phase(交 Sonnet 5)

### Phase D0 — 文件入 repo(執行前提)

1. 將 v4 handoff 三份檔覆蓋入 `docs/design-ode/`(而家repo版本係 v1,連 v3 個 logo fix 都未有)。`ode-logo-source.jpeg` 照留。
2. Commit message 註明「v4 handoff(Odely 改名版),v3 已由 efe1655 pre-cropped asset 等效落地」。

### Phase D1 — OTA + Backend(一次過,低風險)

1. §2.1 十項 JS 改動 + 剷兩個死畫面檔 + 剷 `assets/wordmark.png`。
2. §2.2 四項 backend 改動。
3. Emulator 驗:header「odely」30px 冇被裁/冇擠開頭像、播放器頂、登入頁、關於頁、分享/邀請文案、分享 SSR 頁(curl 睇 title/og/brand)、APK 下載檔名 headers。⚠️ 開波先驗 emulator 裝住嘅係 debug build(`DEBUGGABLE` check,見 emulator 共用環境陷阱)。
4. Backend restart —— **行 deploy gate**。
5. `eas update`(production channel,runtime 4)—— **行 deploy gate**;publish 前照 EAS-UPDATE 清場紅線:`git stash` 只限自己 file,核對 working tree 冇夾雜其他 session 未 commit 嘢(而家 working tree 有大量其他 session 嘅嘢,見 §4-a)。eas 命令用 `zsh -ilc` 包住先攞到 EXPO_TOKEN。
6. OTA 後舊裝置過渡狀態:app 入面全部「odely」,但裝機 icon 下面仲叫「Ode」——同上次 rebrand 一樣嘅接受咗嘅過渡(§6 Q2 俾 Eric 再確認一次)。

### Phase D2 — 新 APK(vc55)

1. 改 §2.3 兩處:app.json `name` + strings.xml `app_name`。**runtimeVersion 兩處都唔郁,versionCode 54→55,versionName 建議 1.6.0**(改名值得行個 minor;Eric 有偏好可改)。
2. 同一條 debug keystore 簽(⚠️ 已知風險:keystore 冧就全部用戶升唔到級——今次唔加深呢個風險,但都唔解決佢;解決係另一個獨立議題,唔好夾喺呢度做)。
3. Clean build 前核對 working tree(§4-a);build 完 emulator 裝真 APK 驗:裝機名「Odely」、媒體通知 app 名「Odely」、升級安裝(唔係 fresh install)冇爆、深連結 `godmusic://`+`https://api.odemusics.com/p/…` 照開。
4. 上載 `backend/public/app.apk`(先 `.bak` 舊隻,跟現有慣例)+ 改 `backend/public/app-version.json` → `{versionCode:55, versionName:"1.6.0", url不變}` —— **行 deploy gate**。改完 vc54 用戶會見到「有新版本」banner,下載到嘅檔名已經係 `Odely-v1.6.0.apk`(D1 改咗 server.js)。
5. D2 之後**唔使**再出一次 OTA:D1 嗰個 update 係 runtime 4,新 APK 一樣食到。

**次序**:D0→D1→D2 順住嚟,D1 同 D2 之間唔使等(但 D1 嘅 emulator 驗收要過咗先起 D2 build,避免帶住錯字入 APK)。

---

## 4. 風險 & 已知教訓對照

- **(a) 共用 worktree**:而家 working tree 有十幾份其他 session 嘅 modified/untracked 檔(hymns.db、run.log、各種 plan md…)。**唔准 `git add -A`**;每個 commit 逐個 file add,deploy gate 前核對 diff 只包含本計劃列明嘅檔案。
- **(b) runtimeVersion**:上次教訓係「bump 要連 strings.xml 一齊改」;今次教訓反轉——**兩處都唔准掂**。驗收加一條:diff 入面唔准出現 runtimeVersion/expo_runtime_version 改動。
- **(c) debug keystore**:照舊同一條 key 簽,升級路徑先保得住。build 前確認 `~/.android/debug.keystore`(或 gradle 指定嗰條)存在且 hash 同 vc54 一致(`keytool -list` 對指紋)。
- **(d) 媒體通知 regression**:之前有 OTA 推完媒體通知消失嘅前科(updateOptions 一次失敗永久冇通知)。D1 OTA 後驗收要包「播歌→通知欄有 media notification」呢一條。
- **(e) 分享鏈路啱啱上線**:share.js 係 Phase3/4 鏈路核心,改字唔改邏輯;驗收要 curl 一條真 share token 確認頁面照 render + intent fallback 照跳。
- **(f) 唔好順手執嘢**:v4 handoff 有幾條驗收(icon 全部 OdeIcon 出、emoji 清零、宋體金句…)係上次 rebrand 嘅遺留清單,**唔屬於今次改名範圍**,Sonnet 唔好見到就順手做。

---

## 5. Opus 5 驗收清單(D1+D2 完成後)

- [ ] `grep -rnw 'Ode' frontend/hymn-app/App.js frontend/hymn-app/src backend/routes backend/server.js` 冇任何面向用戶字串(內部代號/comment 除外)
- [ ] `grep -n ">ode<\|'ode'" App.js src/` 冇單獨「ode」字標殘留
- [ ] Header:「odely」Sora 200 / 30px / ls 1.2,logo 環 52dp 真圖(v3 驗收條),字標冇迫爆同頭像之間空位
- [ ] 播放器頂:環 22dp + odely 17px;登入頁 odely;關於頁「關於 Odely」;build 彈窗標題 Odely
- [ ] 分享/邀請文案「Odely 詩歌 App」;分享 SSR 頁 title/og/brand 三處 Odely(curl 真 token)
- [ ] APK 下載 Content-Disposition 檔名 `Odely-v1.6.0.apk`
- [ ] 新 APK:裝機名 Odely、媒體通知 app 名 Odely、**升級安裝**(vc54→55)資料無損、深連結兩款照開
- [ ] 播歌媒體通知存在(教訓 d)
- [ ] diff 冇 runtimeVersion 改動、冇 package id/scheme/intent filter/EAS 欄位改動、冇夾雜其他 session 檔案
- [ ] vc54 舊機收 OTA 後 app 內全部 odely(過渡狀態確認)+ update banner 見到 v1.6.0

---

## 6. 要 Eric 拍板(有 default,唔答就照 default 行)

1. **Q1 內部代號**:`OdeIcon`/`odeIcons.js`/`odeTheme`/`docs/design-ode/` 等代碼內部名保唔保留?**Default:保留**(用戶睇唔到,rename 純風險零收益)。
2. **Q2 過渡狀態**:D1 OTA 後、用戶未裝 vc55 前,「app 入面 odely、裝機 icon 名仲係 Ode」呢個過渡接唔接受?**Default:接受**(同上次 rebrand 一樣,而且 update banner 會催佢哋裝新 APK)。
3. **Q3 版本號**:新 APK 用 1.6.0 定 1.5.2?**Default:1.6.0**。
4. **Q4 死畫面**:LoginScreen.js/SettingsScreen.js(兩個冇人 import 嘅舊檔,仲寫住 God Music)剷唔剷?**Default:剷**。
5. **⚠️ 發現嘅另一件事(唔喺今次範圍,淨係報俾你知)**:而家 APK 下載 URL、intent filter 已經行緊 `odemusics.com`——如果將來連 domain 都想跟「Odely」改(例如 odely 相關域名),嗰個係獨立工程(DNS/cert/tunnel/雙域過渡),今次完全冇掂。
