# Odely iOS 版 — 落地規劃(IOS-LAUNCH-PLAN)

> 狀態:**Eric 已拍板「正式開始搞 iOS」(2026-08-11)——規劃內容 2026-08-10 出稿,今日(2026-08-11)覆核過 repo 現況冇變,原班內容照用,更新狀態並落地。**純規劃文件,呢份文件本身未郁任何 App code。
> 落地順序:**Phase 0(§5)今日可以即刻開波**,唔使等 Eric 任何嘢;跟住等 §4/§7 嗰幾條 Eric 親自決定/操作嘅位。標準三層流程:Sonnet 執行、Opus 獨立驗收。
> 前提背景:App 而家係 Expo(SDK 56)寫,得 Android 版,側載 APK 分發俾 Eric 同幾個朋友;JS 層用 EAS Update OTA。品牌啱改名 Odely(ODELY-RENAME-PLAN,D1 OTA+backend 已上線、D2 native 層已 commit 未 build——iOS 第一隻 build 會順手帶埋 D2)。

---

## 0. 一句話

Code 層面**九成九已經 cross-platform**,iOS 版技術上冇大山要爬——真正要決定嘅係**分發方式**(建議:TestFlight,唔好一步衝正式上架)同**每年 US$99 嘅 Apple Developer 帳號**。由拍板到 Eric 部 iPhone 裝到第一個 TestFlight build,順利嘅話大約 **1–2 星期**(其中最花時間嘅係 Apple 帳號審批同排隊,唔係寫 code)。

---

## 1. 技術可行性盤點(全部實查 repo,2026-08-10)

### 1.1 好消息:架構本身已經係 iOS-ready

| 項目 | 實查結果 |
|---|---|
| Expo 模式 | CNG(`ios/`、`android/` 都喺 `.gitignore`,由 `expo prebuild` 生成)。`frontend/hymn-app/ios/` 本機已經 prebuild 過一次,有 Podfile + Xcode project,即係 Expo 一早當你係雙平台 app |
| `app.json` | 已有 `ios.bundleIdentifier: com.hymnapp.praise`、`supportsTablet: true` |
| 所有 native dependency | 逐個查過,**全部官方支援 iOS**:react-native-track-player、react-native-video、mmkv、gesture-handler、reanimated、worklets、screens、svg、webview、bottom-sheet、draggable-flatlist、youtube-iframe(webview 底)、expo-updates/application/font/web-browser |
| RNTP patch(`patches/react-native-track-player+4.1.2.patch`) | 淨係改 Android Kotlin 檔(MusicModule.kt ANR workaround),**iOS 唔使等效 patch**——嗰隻 FGS crash(STREAM-403-FGS-CRASH-PLAN)係 Android foreground service 機制,iOS 根本冇呢樣嘢 |
| 串流路徑 | App 淨係同自己 backend 講嘢(`/api/stream/<id>`,backend `routes/stream.js:276` 係 `body.pipe(res)` 全 proxy,唔係 redirect 去 googlevideo)——iOS 端零特殊處理,NordVPN 403 問題同 iOS 無關 |
| OTA(EAS Update) | `runtimeVersion: "4"` 係固定字串,雙平台共用;`eas update` 預設一次過出 iOS+Android bundle。Apple 政策(3.3.2)容許 JS 層 OTA,同而家做法完全兼容 |
| 通知權限 | Android 13 POST_NOTIFICATIONS 嗰段(App.js:505)已經 `Platform.OS === 'android'` gate 咗;iOS 鎖屏/控制中心媒體控制係行 Now Playing Info,**唔使**通知權限 |
| App icon | `assets/icon.png` 1024×1024,啱 iOS 要求 |
| 鍵盤/safe area | 成個 codebase 一直有寫 `Platform.OS === 'ios'` 分支(KeyboardAvoidingView、insets),唔係 Android-only 思維寫出嚟 |
| 開發機 | 呢部 Mac 已裝 Xcode 26.5(`/Applications/Xcode.app`),EAS CLI 19.0.8 都喺度——**本機 build iOS 係得嘅,唔一定要俾錢用雲端 build** |

### 1.2 要做嘅 iOS 適配(全部係細嘢,冇一件係大工程)

| # | 位置 | 問題 | 做法 |
|---|---|---|---|
| A1 | `app.json` | 背景播放:iOS 一定要 `UIBackgroundModes: ["audio"]`,而家冇——唔加嘅話熄芒/switch app 歌就停 | `ios.infoPlist.UIBackgroundModes = ["audio"]`,一行 |
| A2 | `app.json` + backend | 分享 deep link:Android 版 `intentFilters` 收 `https://…/p/<token>`;iOS 等效係 **Universal Links** = `ios.associatedDomains`(`applinks:api.god-music.com` + `applinks:api.odemusics.com`)+ backend 喺 `/.well-known/apple-app-site-association` serve 一個 JSON(要填 Apple Team ID,所以呢步一定要等 Apple 帳號開通先做得)。custom scheme `godmusic://` 就咁用得,唔使加嘢 | app.json 兩行 + backend 一條靜態 route(要行 deploy gate) |
| A3 | `PlayerScreen.js:71`、`WebPlayerScreen.js:53`、`TestimonyCarousel.js:77` | 「開 YouTube App」用咗 Android-only 嘅 `intent://…#Intent;package=…` URL,iOS 開唔到 | 加 iOS 分支用 `youtube://watch?v=`(或者直接 https fallback);iOS 上 `canOpenURL('youtube://')` 要喺 `ios.infoPlist.LSApplicationQueriesSchemes` 宣告 `youtube` 先查到 |
| A4 | `App.js` ApkUpdateBanner(~2630) | 「落新 APK」banner 冇 platform gate——iOS 上會攞 iOS build number 同 Android versionCode 亂比,仲可能叫 iPhone 用戶去落 APK | 開頭加 `if (Platform.OS !== 'android') return null;`(iOS 嘅 native 更新行 TestFlight 自己嘅更新機制,唔使 app 內提) |
| A5 | `app.json` | iOS 冇 `buildNumber`(Android 嘅 versionCode 等效) | 加 `ios.buildNumber`,或者用 EAS `autoIncrement`;每次交 TestFlight 要遞增 |
| A6 | `frontend/hymn-app/` | 冇 `eas.json`(而家 Android 係本機 gradle build,唔經 EAS Build) | 新增 `eas.json`,定義 iOS build profile(TestFlight 用 `distribution: store`) |
| A7 | 全 app UI | 冇任何 iOS 真機/模擬器跑過,實際 rendering(字體、insets、bottom sheet、gesture)要肉眼過一次 | Phase 0 模擬器煙test 清單,見 §5 |

**唔使做嘅嘢(易被誤會)**:`adaptiveIcon`/`allowBackup`/`intentFilters` 係 Android-only key,iOS 自動無視;MMKV 資料唔會跨平台遷移(iOS 用戶係全新開始,登入會員之後靠 server 同步拉返心心/清單——呢個正正係會員系統嘅價值);自建電話 OTP 登入係第一方帳號系統,**唔會**觸發 Apple 嘅「Sign in with Apple 強制」條款(嗰條淨係管第三方社交登入)。

---

## 2. 分發方式抉擇(核心決策 — Eric 要揀)

iOS 冇 Android 咁樣嘅 APK 側載。三條路,**全部都要先有 Apple Developer Program 帳號(US$99/年)**,分別在於審查同派發體驗:

### 選項 (a) 正式上架 App Store

- ✅ 任何人搜到就裝到,最正路;更新體驗最好
- ❌ 要過完整 App Review。**最大風險係 Guideline 5.2.3**(第三方音視頻來源要有授權文件):個 app 嘅內容底層係 YouTube 串流,冇官方授權。Backend 全 proxy 令 reviewer 表面上見到嘅係「自家 API 出音頻」,但如果被問到內容來源/被認出係 YouTube 內容,冇文件答佢,**有被拒甚至封號嘅可能**。宗教詩歌內容本身零問題,問題純粹喺串流授權
- ❌ 上架仲觸發其他合規要求:app 內要有「刪除帳號」功能(5.1.1(v),而家冇)、要交 privacy policy URL、要俾 reviewer 一個 demo 帳號登入
- 📌 判斷:**而家唔建議行呢條路**。用戶群係 Eric 同幾個朋友,承受審查風險換嚟嘅「公開可搜尋」根本用唔著

### 選項 (b) TestFlight(建議)⭐

- ✅ 唔使正式上架;**Internal Testing**(將測試者加入 App Store Connect team,上限 100 人)連 Beta 審查都唔使,build 上傳完處理好即裝——Eric + 幾個朋友呢個規模完美命中
- ✅ 如果將來想擴到朋友嘅朋友:**External Testing** 用 email/公開連結邀請,上限 1 萬人,要過一次較寬鬆嘅 Beta App Review(通常 24–48 小時,之後同一版本線嘅 build 多數自動過)——5.2.3 風險喺 Beta Review 都存在,但實務上 Beta 審查寬鬆好多
- ⚠️ 每個 build **90 日過期**,即係每三個月要交一隻新 build 續命(JS 層照舊 OTA 唔受影響,呢個純粹係 native 殼嘅賞味期限)。以呢個 project 嘅節奏(APK 都成日出新版)唔算負擔
- ⚠️ 測試者部 iPhone 要裝 TestFlight app(App Store 免費),跟邀請連結撳一下就裝到——比「落 APK→俾權限→側載」仲簡單
- 📌 判斷:**預設建議**。先 Internal(唔使任何審查),人多咗先開 External

### 選項 (c) 其他側載(簡述,唔建議)

- **Ad Hoc / EAS internal distribution**:同 TestFlight 一樣要 $99 帳號,逐部 iPhone 登記 UDID(每年上限 100 部),之後派個安裝連結,零審查——係最似「APK 側載」嘅做法。但要收集每部機 UDID、證書一年過期要重簽,體驗反而差過 TestFlight,冇著數
- **AltStore / Sideloadly(免費 Apple ID)**:七日過期要重簽,靠部電腦定期插機,完全唔適合派俾朋友
- **企業證書**:違反 Apple 條款(企業證書唔准派俾外部人士),會被 revoke,唔考慮
- **歐盟式 web 側載**:得歐盟地區 iPhone 先開放,香港用戶無份
- 📌 判斷:全部劣於 TestFlight,列出嚟純粹俾 Eric 知道冇遺漏

### OTA 喺 iOS 嘅位置(同 Android 對照)

| 更新層 | Android(而家) | iOS(之後) |
|---|---|---|
| JS bundle(日常改動) | EAS Update OTA | **一模一樣**,同一條 `eas update` 命令一齊出 |
| Native 殼(裝新 module/大改) | 出新 APK,自己網站俾人落 | **一定要**經 TestFlight 交新 build(冇自由側載);好在 TestFlight 有內置更新提示,唔使自己整 banner |

---

## 3. 成本同時間

### 3.1 錢

| 項目 | 費用 | 備註 |
|---|---|---|
| Apple Developer Program | **US$99/年**(約 HK$775) | 唯一必要開支。TestFlight/上架/Ad Hoc 三條路都要 |
| EAS Build(雲端) | **$0 起步** | 免費 plan 每月有限額 build(iOS 計入內),呢個 project 一個月出唔到幾隻 native build,免費額度極大機會夠;真係唔夠都唔使升 plan——部 Mac 有 Xcode 26.5,`eas build --local`(或 Xcode archive)本機 build 免費無上限 |
| EAS Update | $0(用緊) | iOS 加入唔會加錢,免費額度按 MAU 計,呢個用戶規模差好遠先到 cap |
| 測試機 | $0(假設 Eric 本身有 iPhone) | 冇嘅話模擬器都驗到九成,但派俾朋友前應該至少一部真機行過背景播放/鎖屏控制 |

**總計:US$99/年,冇其他。**

### 3.2 時間(由 Eric 拍板起計)

| 階段 | 估時 | 卡喺邊 |
|---|---|---|
| Phase 0 模擬器跑通 + iOS 適配(§1.2 A1–A7) | 1–2 日工作 | 純技術,唔使 Apple 帳號;呢部 Mac 要先落 iOS simulator runtime(~8GB,Xcode 內一鍵) |
| Apple Developer 帳號申請 | 提交半個鐘;**審批通常 24–48 小時**(間中要覆核身份,拖到幾日) | Eric 本人操作(見 §4) |
| 第一隻 TestFlight build:證書/簽名(EAS 自動化)→ build → 上傳 → App Store Connect 處理 | 1 日工作 + 排隊 | 第一次總有啲簽名/名額設定要磨合 |
| Internal testers 裝機 | 即日 | 加 email → 對方裝 TestFlight → 撳連結 |
| (如揀 External)Beta App Review | +24–48 小時 | 得第一次先要等 |

**現實估算:順風 1 星期,穩陣講 2 星期,就有 Eric 部 iPhone 裝到嘅版本。**

---

## 4. 需要 Eric 提供嘅嘢

1. **Apple ID**(建議用返日常嗰個,或者開個專用嘅都得)+ 開埋雙重認證——Developer Program 一定要
2. **信用卡俾 US$99/年**——申請時即扣
3. **帳號類型決定**:Individual(個人)定 Organization(公司)?個人快好多、唔使公司文件;代價係 TestFlight/App Store 上開發者名顯示係個人真名。**預設建議:Individual**(TestFlight 內部圈子根本冇人在意)
4. **一部 iPhone** 做真機驗收(iOS 16.4 或以上,即 iPhone 8 之後基本都得)
5. **朋友名單**:每人一個 email(佢哋 Apple ID 嗰個),用嚟發 TestFlight 邀請
6. ⚠️ Apple 帳號申請同付款屬於「輸入個人/財務資料」,**一定係 Eric 本人喺 developer.apple.com 操作**,Claude 唔會代辦;去到嗰步會出一份逐步指示(似 ERIC-TODO-PHONE-AUTH.md 咁)

---

## 5. 分階段路線圖

### Phase 0 — 模擬器跑通(唔使錢、唔使 Apple 帳號、今日可以開波)

做嘢:§1.2 嘅 A1(背景 audio)、A3(YouTube link iOS 分支)、A4(APK banner gate)、A5(buildNumber)、A6(eas.json);跟住 `expo prebuild -p ios` + `pod install` + 模擬器起 app。
煙test 清單:起機→首頁→搜歌→播歌→mini player→全屏 player→隊列操作→心心/清單→電話密碼登入→同步→分享連結 parse(`godmusic://` scheme 層面)→OTA banner 唔誤彈。模擬器**驗唔到**:真背景播放熄芒行為、鎖屏控制、TestFlight 安裝——留到 Phase 2 真機。
產出:一份「iOS 煙test 結果」清單,邊啲過邊啲有 iOS-only 甩漏(預咗會執到幾件 UI 細節,例如 insets/字體 rendering)。
**Eric 決定位:冇。**呢 phase 全部可以用預設值自行判斷。

### Phase 1 — Apple Developer 帳號(Eric 本人操作)

出一份逐步 TODO 俾 Eric(申請→付款→2FA→等審批)。等批期間 Phase 0 收尾照行,零浪費。
**Eric 決定位:①肯唔肯俾 US$99/年;②Individual 定 Organization(預設 Individual)。**

### Phase 2 — 第一隻 TestFlight build + Eric 真機

帳號批咗之後:EAS 自動管簽名證書 → build(預設先試雲端免費額度,唔得就本機)→ 上傳 App Store Connect → 開 Internal Testing → Eric 裝機。同步做 A2(Universal Links:app.json associatedDomains + backend AASA route,要 Team ID 所以排呢度;backend 改動行 deploy gate)。
真機驗收重點(模擬器驗唔到嗰啲):**背景播放熄芒續播、鎖屏/控制中心控制、耳機線控、分享連結由 WhatsApp 撳入 app、OTA 推一次實測 iOS 收到**。
**Eric 決定位:冇新決定**,係執行+真機驗收。

### Phase 3 — 擴俾朋友

Internal Testing 加朋友 email(上限 100,夠用好耐)。寫低「每 90 日續 build」入 HANDOFF 恆常事項(可以同平時出 APK 節奏夾埋做)。
**Eric 決定位:朋友名單;夠唔夠用 Internal 定要開 External(預設 Internal)。**

### Phase 4(選做,無限期擱置都得)— 正式上架

先補刪除帳號功能 + privacy policy 頁 + demo 帳號,先至好諗。5.2.3 串流授權風險要 Eric 知情先好撳掣。
**Eric 決定位:整個 phase 做唔做(預設:唔做,TestFlight 夠晒)。**

---

## 6. 風險同注意位

1. **5.2.3 串流授權**係成個 iOS 計劃唯一實質政策風險——TestFlight Internal 完全避開審查,External 風險低,正式上架風險真實存在。分發選擇基本上就係揀承受幾多呢個風險
2. **90 日 build 過期**:TestFlight 硬規則,唔續 build 朋友部機個 app 會開唔到(OTA 救唔到 native 殼過期)。要入恆常 checklist
3. **簽名資產保管**:Apple 證書/provisioning profile 交俾 EAS 託管(預設做法),就唔會重演 Android 「debug keystore 簽 release」嗰種計時炸彈(APP-UPDATE-CHECK-PLAN 已知問題);iOS 呢邊一開始就行正路
4. **多 session 共用 worktree**(老規矩):iOS build 前要清場核對 working tree,`eas update` 前跟 EAS-UPDATE-PLAN 嘅 stash 紅線;`ios/` 係 gitignored 生成物,任何 iOS 設定改動一定要落喺 `app.json`/config plugin,唔准直接改 `ios/` 底下嘅檔(prebuild 一 regen 就冇)
5. **ODELY-RENAME D2 夾位**:D2(native 改名)已 commit 未 build——iOS 第一隻 build 天然會包埋 D2,順手完成「Odely」native 層改名,唔使另外出 Android APK 先
6. **iOS 用戶數據**:第一次裝係白紙,靠登入會員同步拉返資料——朋友入門指示要寫明「裝完先登入,心心清單就返晒嚟」

---

## 7. 決策摘要(Eric 淨係要答呢幾條)

| # | 問題 | 預設建議 |
|---|---|---|
| D1 | 分發:TestFlight 定正式上架? | **TestFlight**(Internal 起步) |
| D2 | 肯唔肯俾 US$99/年開 Apple Developer? | 要俾先行得落去(唯一開支) |
| D3 | 帳號用 Individual 定 Organization? | **Individual** |
| D4 | 有冇 iPhone + Apple ID 可以用? | 需要 Eric 確認 |
| D5 | Phase 0(免費模擬器跑通)使唔使等 D1–D4 先開波? | **唔使,批咗個 plan 就可以即刻做**——零成本零風險,做完啲料仲可以幫手決定 D1 |

其餘全部(bundle ID 保留 `com.hymnapp.praise`、eas.json 寫法、buildNumber 策略、煙test 清單、AASA 格式)屬技術預設值,Claude 自行判斷,唔逐項問。
