# Ode 改名 + 重新設計 — 落地規劃(ODE-REBRAND-PLAN)

> 狀態:**已拍板,執行中**(2026-08-07)。Q1-Q5 全部有答案(見 §8),交 Sonnet 5 落地,Opus 5 獨立驗收。
> 定稿 handoff 檔案(icon 已補齊至 45 個,第二個 zip 版本)已入 repo:`docs/design-ode/`(ODE-HANDOFF.md + odeTheme.js + odeIcons.js + ode-logo-source.jpeg)——執行以呢份為準,唔好用 Desktop 第一版 zip(得 24 icon)。
> 來源:Claude Design 交付包 `/Users/macbookpro/Desktop/ode-design-package/Ode音樂詩歌應用設計.zip`
> (內含 `ODE-HANDOFF.md` + `odeTheme.js` + `odeIcons.js`,已解壓核對全文)。
> 上次 rebrand 參考:BRAND-GODMUSIC-PLAN.md(生命樹→God Music,2026-07-24 執行,只改顯示名+icon+文案,package id 冇郁——今次跟同一原則)。

---

## 0. 一句話

App 由 **God Music** 改名 **Ode**(因為 God Music 撞名)。版面結構/導航唔變;換品牌名、logo(Eric 嘅日蝕環)、色板(深林綠→靛紫+暖光)、字體、質感、全套 icon。**影響範圍大過上次 rebrand**:上次只係換皮+改名,今次仲要換 icon 系統(要新 native 依賴)、換字體、掂到啱啱上線嘅 Phase3 分享/Phase4 邀請鏈路。

---

## 1. 交付包實際有咩(實地核對過,唔係靠截圖估)

| 檔案 | 內容 | 狀態 |
|---|---|---|
| `ODE-HANDOFF.md` | 改名清單、色板/質感新舊對照、畫面對應(2a/5a-5f/8a)、icon 規格、驗收清單、未拍板事項 | ✅ 齊 |
| `odeTheme.js` | colors/typography/radii/spacing/header/effects/iconState 七組 token | ✅ 齊 |
| `odeIcons.js` | 24 個 icon 嘅 SVG path(24×24 viewBox、stroke 1.75) | ✅ 齊,但唔夠數(見 §3.2) |
| `ode logo/ode logo.jpeg` | Eric 原設計日蝕環 1024×1024(**JPEG,冇透明底**) | ✅ 有 |
| `Ode Home Design.dc.html` | Handoff 講嘅「唯一 source of truth」設計檔 | ❌ **唔喺包入面**(仲留喺 Claude Design app 專案內,要 Eric 匯出) |
| App icon/splash PNG 切圖 | foreground/background/monochrome/notification/splash/favicon | ❌ **冇提供**,handoff §6 明言「要重出」= 我哋自己由 logo 原圖裁 |
| `APP-INFO.md` / `DESIGN-CONSTRAINTS.md` / `icons/` / `screenshots/` | 之前我哋打包俾 Claude Design 嘅**舊參考資料**(God Music 現狀),唔係新交付 | (照舊) |

**兩個缺口**:(1) 設計檔 HTML 未攞到,驗收「對得上 2a/5a-5f」冇圖對——要 Eric 由 Claude Design 匯出放入資料夾;(2) 所有 PNG 切圖係我哋嘅工作,而且 logo 原圖係 JPEG,Android adaptive foreground 要透明底——要由原圖抽環退地(環同深底對比清晰,可以做到,但要 Eric 過目效果)。

---

## 2. 現有 codebase 結構(同 handoff 講法嘅出入)

### 2.1 主題

- 實際路徑係 `frontend/hymn-app/src/theme/designSystem.js`(handoff 寫 `src/theme/designSystem.js`,方向啱)。
- 但佢唔係孤島:`src/constants/theme.js` 係一個**相容層**,將舊 key(`bg`/`cardBg`/`accent`…)指返 designSystem。兩層合共 **20 個檔案 import、約 430 個 token reference**,另外仲有 **218 個寫死 hex** 散喺各檔案(包括舊綠 `#3DB389`×14、舊底 `#0B0F0E`×13、`#121A17`×6、金 `#E8B86D`×4、Spotify 綠 `#1ED760`×3)。
- **「直接取代」唔成立**,兩個原因:
  1. **Key 名完全唔同**:舊 `background/card/cardLight/accent/gold/...` vs 新 `bg/surface/surface2/primary/glow/...`。直接換檔案 = 20 個檔案即刻爆 undefined。
  2. **一對多映射**:舊色板一個 `accent`(生命綠)包晒「播放掣、進度條、心心、選中狀態、連結」,Ode 拆咗做兩個角色——**暖光 `glow #EFE4D2`**(播放/進度/選中 tab/主 CTA)同**主色 `primary #B9A6F2`**(已收藏/選中 chip/連結)。75 個 `COLORS.accent` 用位**冇得機械式替換,要逐個判斷**係「光」定「紫」。
- **做法**:改寫 `designSystem.js` 內容做 Ode token(保留舊 export 名做過渡 alias + 新增 ode 完整 export),`constants/theme.js` 相容層照留;然後逐檔清 75 個 accent 用位 + 218 個寫死 hex。呢個係細心工夫,唔係大風險。

### 2.2 Icon

- 現況**冇** `src/icons/`。19 個檔案全部用 `@expo/vector-icons` 嘅 **MaterialIcons**,合共 **43 個唔同 icon 名**。
- `odeIcons.js` 用法要 `react-native-svg`——**package.json 冇裝呢個 native 依賴** → **必須出新 APK**,OTA 推唔到。
- **24 個 Ode icon 對唔晒 43 個現用 icon**:對到嘅約 20+(heart/queue/shuffle/repeat/play/pause/prev/next/search/more/share/lyrics/addToList/home/library/me/invite/logout/about/synced…);**冇 Ode 版嘅約 20 個**:close、arrow-back、chevron-right、add、music-note(用咗10次做封面佔位)、check-circle、delete-outline、drag-handle、history、wifi-off、cloud-off、email、lock-outline、visibility-off、person-add、group、north-east、system-update、cancel、keyboard-arrow-down 等(主要喺 admin 畫面、好友/邀請 sheet、登入頁、錯誤狀態)。
- Handoff 驗收條「所有 icon 由 OdeIcon 出,冇混用」**照現有交付係達唔到嘅**,要 §8 Q3 拍板點補。

### 2.3 字體

- 現況零自訂字體(全系統字)。Ode 要 **Sora 200**(拉丁字標+數字)、**Noto Sans TC**(中文 UI)、**Noto Serif TC**(金句+歌詞)。
- `expo-font` native 部分已喺 binary(vector-icons 靠佢載字),所以字體檔理論上 OTA 都推到;但 **Noto Serif TC 全字重 8MB+ 級**,建議跟新 APK 出,唔好谷爆 OTA。Noto Sans TC 可以先用系統字(Android 中文預設本身就係 Noto Sans CJK,肉眼幾乎冇分別),慳一隻大檔。Sora 得幾十 KB,冇問題。

### 2.4 改名相關寫死位(全部實數,grep 過)

**前端顯示「God Music」(OTA 改到)**:`App.js`(header 1462、播放器頂 1674、分享文案 1725)、`AccountScreen.js`(73 alert、127「關於 God Music」)、`AuthScreen.js:81`、`AddFriendSheet.js:71`、`InviteFriendsSheet.js:15` 邀請文案;另有兩個**已死畫面** `LoginScreen.js` / `SettingsScreen.js`(App.js 冇 import,順手改或者剷)。

**Native / 出新 APK 先改到**:
- `app.json`:`"name": "God Music"`、`scheme: "godmusic"`、adaptive icon 四件 + `backgroundColor #E3E8EE`、intent filter host `api.god-music.com`
- `android/app/src/main/res/values/strings.xml`:`app_name` = God Music
- `android/app/build.gradle`:`namespace`/`applicationId` = `com.hymnapp.praise`
- splash 係 native drawable(`drawable-*/splashscreen_logo.png` + styles.xml)

**Backend(Mac 上跑,改完 restart 即生效)**:
- `backend/routes/share.js`:SSR 分享預覽頁成頁 God Music 品牌(title 156、brand 183、og 描述 164)+ `API_BASE = api.god-music.com` + intent fallback(scheme=godmusic、package=com.hymnapp.praise)
- `backend/server.js`:`/downloads/app.apk` 路由(APK 檔名 `hymn-app.apk`)

**Domain `god-music.com` 寫死喺**:前端 `src/config.js:13`(API_BASE)、`InviteFriendsSheet.js:12`(APK 下載 link)、`App.js` 深連結 parser(2160-2163)、`app.json` intent filter(**呢個燒咗入已出街 APK,OTA 改唔到**)、backend `share.js`。

---

## 3. 落地方案:三個 Phase

### Phase R1 — OTA 皮層(runtime 2,低風險,可以先行)

舊 APK 用戶都收到嘅部分:

1. `designSystem.js` 改寫做 Ode token(§2.1 做法),`constants/theme.js` 映射跟住執。
2. 75 個 `accent` 用位逐個判 glow/primary;218 個寫死 hex 清走(驗收:grep 唔再有 `#3DB389 #00C9A7 #E8B86D #0B0F0E #121A17 #E3E8EE #1ED760`)。
3. 質感 token:圓角 8→18、間距、分區標題 12px/勻距 2.5、封面 1px 內描邊、CTA 外發光、每日金句去金線改宋體樣式(字體未到位前先用系統 serif fallback)。
4. 前端顯示文字 God Music→Ode 七處 + header 字標「ode」+ logo 環細圖(圖片 asset OTA 推到)。
5. 邀請/分享文案改「Ode 詩歌 App」(APK link 照舊 god-music.com,見 §8 Q5)。
6. Backend `share.js` SSR 頁改 Ode 品牌 + Ode 色(backend restart,行 deploy gate)。

**注意**:R1 推咗之後,舊 APK 用戶會出現「app 入面係 Ode、launcher icon 仲係 God Music」嘅過渡狀態,直至佢裝 R2 新 APK——§8 Q4 要 Eric 揀接唔接受。

### Phase R2 — 新 APK(v1.5.0 / versionCode 53 / **runtimeVersion 2→3**)

1. 裝 `react-native-svg`,起 `src/icons/OdeIcon.js`(讀 `ODE_ICONS`,props name/size/color/filled,規格照 handoff §5)。
2. 43 個 icon 用位遷移(對到嘅 24 個 + Q3 拍板嘅補齊方案)。
3. 字體:Sora 200 + Noto Serif TC 入 assets,`useFonts` 載入;中文 UI 用系統字。
4. App icon 全套由 `ode logo.jpeg` 重裁:foreground 只環透明底(66dp 安全區)、background 純色 `#0B0913`、monochrome 加粗 1.3×、notification、favicon;裝機 icon 只留環(24dp 字樣讀唔到),store 版保留字樣。
5. Splash native drawable 換:只環 + 底 `#0B0913`,「ode」字標 app 內畫。
6. `app.json` name→Ode、strings.xml app_name→Ode。
7. **唔郁**:`package` / `bundleIdentifier` = `com.hymnapp.praise`、`scheme` = `godmusic`、intent filter host、EAS projectId/owner。同一簽名 key 出 APK(唔同 key 舊用戶裝唔到升級版!),上載 `backend/public/app.apk`。
8. runtimeVersion 升 3:R2 之後嘅 OTA 只落新 APK;舊 APK 用戶停留喺 R1 最後一個 runtime-2 update,唔會爆(native 依賴唔對嘅 update 唔會推落去,呢個正正係要升 runtime 嘅原因)。

### Phase R3 — Domain 遷移(新 domain **已買**:`odemusics.com`,2026-08-07 已喺同一個 Cloudflare 帳戶生效;照 §3.5 清單執行,唔卡 R1/R2 時間表)

- **唔係 blocker**:R1/R2 唔等 domain 切換都出得貨;但因為 domain 已經買咗、又趕得切喺 R2 出 APK 之前,**§3.5 第 1-3 步應該喺 R2 前做埋**,咁 R2 嗰隻 APK 就可以一次過帶埋 `api.odemusics.com` 嘅 intent filter,慳返一次全體用戶側載(唔使再有 R3 專屬 APK)。
- 遷移期間 `god-music.com` **必須留住並繼續應答**(雙域並行,舊域唔剪):已出街 APK 嘅 intent filter 燒死咗 `api.god-music.com`,流通中嘅 Phase3 分享連結/Phase4 邀請/APK 下載 link 全部指佢。舊域幾時先退役 = 等舊 APK 用戶基本上全部升晒級之後,獨立再決定(可能係永遠唔剪,一年幾十蚊續費買個保險)。

### 3.5 Domain 更換 change list(新 domain = `odemusics.com`,API host = `api.odemusics.com`;已全 repo grep 過,唔使再搵)

**第 1 步|基建(先令新 domain 生效,舊域照行)**
1. DNS route(同一 Cloudflare 帳戶,一條命令搞掂,會自動開 proxied CNAME 指去 tunnel):
   ```
   cloudflared tunnel route dns hymn-api api.odemusics.com
   ```
   (tunnel id `d662c971-6a08-48e7-b97b-0448fc76dea8`,cert.pem 已喺 `~/.cloudflared/`,唔使再 login。)
2. `~/.cloudflared/config.yml`:ingress 喺 404 catch-all **之前加一條**(係「加」唔係「換」,現有 `api.god-music.com` 嗰條保留):
   ```yaml
   - hostname: api.odemusics.com
     service: http://localhost:3001
   ```
3. Restart launchd job(`ops/launchd/com.cloudflare.cloudflared.plist`,label `com.cloudflare.cloudflared`;⚠️ README 講明 args 一定要有 `tunnel run hymn-api`,唔好郁 plist 本身)。驗:`api.god-music.com` 同 `api.odemusics.com` curl 都 200 先落下一步。

**第 2 步|Backend(改完 restart,行 deploy gate)**
4. [share.js:21](backend/routes/share.js) — `API_BASE` 換新 domain(影響 SSR 分享頁入面所有連結 + intent fallback URL)。
5. 加一條 host-based 301:收到 `api.god-music.com` 嘅 `/p/*` 同 `/downloads/*` 請求 301 去新 domain(等舊連結自動着陸新域;API 請求就唔好 redirect,舊 APK 嘅 `config.js` 仲會直接打舊域)。

**第 3 步|前端 JS(OTA 推得到)**
6. [config.js:13](frontend/hymn-app/src/config.js) — `API_BASE` 換新 domain。
7. [InviteFriendsSheet.js:12](frontend/hymn-app/src/screens/InviteFriendsSheet.js) — `APK_URL` 換新 domain。
8. [App.js:2160-2161](frontend/hymn-app/App.js) — 深連結 parser 改成**兩條 https 前綴都認**(舊域連結會流通好耐,唔可以剷舊嗰條);2150 註釋順手更新。

**第 4 步|Native(要出 APK——domain 已買,**直接夾入 R2 嗰隻 APK**,唔使另出)**
9. [app.json:29](frontend/hymn-app/app.json) — intent filter `data` array **加一條** `{ "scheme": "https", "host": "api.odemusics.com", "pathPrefix": "/p/" }`(舊嗰條保留,兩條並列)。
10. `app.json:46` `"owner": "god-music-team"` — Expo 帳戶名,用戶睇唔到,**唔使改**(改反而會整斷 EAS project 連結)。

**第 5 步|文檔/ops**
11. `ops/launchd/README.md`、HANDOFF.md、memory 入面嘅 domain 引用順手更新。

**驗收**:§4 四條鏈路用**新舊兩條 domain 各行一次**;一條 R3 之前生成嘅舊分享 token 連結實測可以着陸。

---

## 4. Phase3/4 鏈路保護(今次最要小心嘅位)

改動期間以下四條鏈**每個 phase 出貨前都要行一次**:

1. 分享連結:`https://api.god-music.com/p/<token>` → 裝咗 app 開 app;冇裝 → SSR 預覽頁 → APK 下載。
2. Deep link:`godmusic://p/<token>` 照開(scheme 唔改所以應該冇事,驗證用)。
3. 邀請碼:已登入輸碼自動加好友(35f4192 嗰條 flow)。
4. `/downloads/app.apk` 下載到、裝到、**能夠覆蓋安裝**喺現有 God Music APK 之上(同 package + 同簽名)。

---

## 5. Risk 分級

| 改動 | 級別 | 點解 |
|---|---|---|
| 換色/圓角/間距/文案(R1) | 🟢 低 | 純 JS,OTA 可回滾(republish 舊 update) |
| accent 一拆二(75 位) | 🟡 中 | 判錯只係樣衰,唔會爆;要 emulator 逐屏驗 |
| Backend share 頁改版 | 🟢 低 | 唔掂 token 邏輯只掂 HTML;deploy gate + 實測一條舊 token |
| 字體(R2) | 🟡 中 | 得 binary 體積+載入時序問題;fallback 係系統字 |
| react-native-svg + OdeIcon(R2) | 🟡 中 | 新 native 依賴要新 APK + runtime bump;錯咗係 build 期爆,唔係用戶手上爆 |
| App icon/splash 重裁 | 🟡 中 | JPEG 抽環退地效果要 Eric 過目;Android 三款 mask 要逐款驗環冇被切 |
| runtimeVersion 2→3 | 🟡 中 | 操作紀律問題:R2 之後任何 OTA 都唔會再落舊 APK,要記住舊用戶靠裝新 APK 升級 |
| **改 Android package name** | 🔴 高,**唔做** | 變咗第二隻 app:舊用戶收唔到升級、要重新側載+重新登入,Phase3/4 intent fallback 嘅 `package=` 全部失效。Handoff 都寫明不變 |
| Domain 遷移(R3,雙域並行) | 🟡 中 | 有 §3.5 清單照做;風險位係漏咗雙域並行、太早剪舊域 |
| **改 scheme / 即剪 god-music.com** | 🔴 高,**唔做** | scheme 同舊域燒咗入已出街 APK,一改/一剪即斷流通中嘅分享/邀請連結;遷移一定係「加新留舊」 |

---

## 6. 驗收清單(承 handoff §7,按實況修訂)

- [ ] grep 全 repo 冇 `#3DB389 #00C9A7 #E8B86D #0B0F0E #121A17 #E3E8EE`(**加埋 `#1ED760`**,handoff 漏咗)
- [ ] 冇面向用戶嘅「God Music」字串(package id / domain / 歷史文檔除外)
- [ ] 首頁/詩歌庫/播放器/歌詞/我的 對齊設計檔 2a/5a-5d(**要 Eric 先匯出 dc.html**)
- [ ] icon 按 Q3 拍板結果驗(全 OdeIcon 或 過渡混用界線清晰)
- [ ] 封面 1px 內描邊、點擊區 ≥44dp、正文 ≥15、歌詞行高 1.95
- [ ] Android 圓/方/水滴 mask 環冇被切
- [ ] 淺色模式**唔做**(唔好順手加)
- [ ] §4 四條 Phase3/4 鏈路全通
- [ ] 新 APK 覆蓋安裝實測(同簽名)+ 舊 runtime-2 用戶收 R1 OTA 正常

---

## 7. 唔喺今次範圍

情境分類(4a 提案)、淺色模式、播放清單 sheet 等未設計畫面新樣、iOS 出貨、domain 遷移實作(R3 另開)。

---

## 8. 決策記錄(Eric 全部拍板,2026-08-07)

**Q1|✅ 名照用「Ode」。** Eric 親自喺 Google Play 搜過:冇「ode music」精確撞名(唔似 God Music 嗰種直接撞),但「ODE」單字命名空間擠迫(社交/VPN/物流/購物幾個 app 用緊)。**落地要求:顯示名/store 描述/分享文案盡量帶「詩歌/hymn」字眼幫手分辨**(例:分享頁 title 用「Ode 詩歌」,邀請文案「Ode 詩歌 App」)。

**Q2|✅ package name + scheme 維持不變**(`com.hymnapp.praise` / `godmusic://`)。

**Q3|✅ icon 已補齊。** Claude Design 出咗第二版 zip(`Ode音樂詩歌應用設計icon.zip`),`odeIcons.js` 由 24 擴到 **45 個 key**(補咗 chevron×4/back/close/plus/check/trash/edit/sort/dragHandle/playlistTile/link/friends/nowPlaying/stop/clock/bell/volume/musicNote),theme 冇變,handoff 加咗「唔准用 emoji/文字符號當 icon」驗收條。對返 app 現用 43 個 MaterialIcons:**餘下約 8 個邊角狀態 icon 冇精確對應**(wifi-off/cloud-off/music-off/link-off/visibility-off/lock-outline/email/system-update,全部喺登入頁/錯誤/離線狀態)——處理:照 45 個 key 為主,呢 8 個由執行 session 照 24×24/stroke 1.75/round 規格自繪或用「基圖+斜線 overlay」補齊,風格一致即可,唔使回設計。

**Q4|✅ 一次過推(R1+R2 一齊出貨)。** 即係:**唔好**喺 runtime 2 推任何 rebrand OTA——舊 APK 用戶維持 God Music 舊樣,直到側載 v1.5.0 新 APK 一次過見到全套 Ode。R1+R2 做完、Opus 驗收過先出貨。

**Q5|~~新 domain~~ ✅ 已解決(2026-08-07)。** 新 domain `odemusics.com` 已買、已喺同一 Cloudflare 帳戶生效。照 §3.5 執行:第 1-3 步(tunnel/DNS)喺 R2 前做埋,intent filter 夾入 R2 APK,唔使另出。唯一提醒 Eric:過渡期 `god-music.com` 要繼續續費唔好剪(舊 APK/舊連結靠佢)。

**(另一項行動,唔係決策)** 請 Eric 由 Claude Design 匯出 `Ode Home Design.dc.html` 放入 `ode-design-package`,冇佢冇得逐屏對圖驗收。

---

## 8.6 icon fix(`b034a38`)隨 APK vc54 一次過出街(2026-08-08)

`b034a38`(play/prev/next icon 冇傳 filled 唔 render)之前已經用 OTA(runtime 3,
update group 6cb842b2)推咗出去,呢次唔使再做嘢——單純記錄:呢個 fix 自然
包含喺今次(APP-UPDATE-CHECK-PLAN §6)出嘅正式 APK vc54(commit 78a4d6f/
5c0dd7a,runtimeVersion 3→4)裡面,因為 vc54 係由呢條分支現時 HEAD build,
HEAD 早已包含 `b034a38`。冇額外改動,純交代版本追溯。

## 9. 建議執行次序(拍板後)

1. Eric 答 Q1-Q4 + 補 dc.html →(§3.5 第 1-3 步 tunnel/DNS 可以呢段時間先做,唔使等拍板)
2. R1(theme+改名+backend share 頁)喺 emulator 全屏驗 →
3. Q3 補圖到位 → R2(svg/icon/字體/app icon/splash/新 APK)→ Opus 5 驗收 §6 全清單 →
4. 同一簽名出 APK 上載 `/downloads/app.apk` + 推 OTA(按 Q4 拍板策略)→ Eric 真機覆蓋安裝實測。
