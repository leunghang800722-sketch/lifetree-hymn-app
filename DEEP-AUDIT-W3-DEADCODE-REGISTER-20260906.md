# W3 死碼證據冊 — 第一段 2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。**本文件唔改任何 source，唔刪任何檔，唔 commit source。**
輸入：`DEEP-AUDIT-W3-DEADCODE-EXEC-20260906.md`、1A §4、1D §3、ROOTCAUSE §C10/§W7/§4 N-2、
PERF-FINAL-REPORT-20260902.md（09-02 已刪 29 檔 6,101 行——本冊唔重數呢批）。

九個掃描器全部放 `ops/perf/deadcode/s1-*.mjs`…`s9-*.mjs`，各自帶正控，輸出存
`ops/perf/deadcode/output/*.json`。全部 `node --check` 過、逐個跑完 exit 0（正控通過）。

---

## 0. 掃描器清單 + 正控結果（§1.1）

| # | 掃描器 | 檔案 | 正控 | 結果 |
|---|---|---|---|---|
| S1 | 前端 import graph reachability | `ops/perf/deadcode/s1-import-graph.mjs` | 揀 `AuthContext.js`/`LogoRing.js`/`OdeIcon.js` 三個已知被引用嘅檔 | ✅ 三個都 `reachable:true` |
| S2 | 前端 unused export | `ops/perf/deadcode/s2-unused-exports.mjs` | `elapsedSinceT0`（已知零引用）要判 ZERO_REFERENCE；`useAuth`（已知廣泛引用）要判 USED | ✅ 兩者皆中 |
| S3 | icon/asset 引用 | `ops/perf/deadcode/s3-icon-asset.mjs` | icon `close` 要判 USED | ✅ 命中 |
| S4 | 依賴引用（含 app.json plugins/babel/metro/config-plugin） | `ops/perf/deadcode/s4-dependency.mjs` | `expo-font` 要判「有用」（透過 app.json plugins，唔係 JS import） | ✅ `USED_CONFIG_PLUGIN_ONLY` |
| S5 | backend route 三方交叉（掛載表 × 前端 grep × `deprecatedRouteHits`） | `ops/perf/deadcode/s5-backend-route.mjs` | `/api/hymns` 要三方都命中且非 stub | ✅ frontendHitCount=11、stubCandidate=false |
| S6 | backend lib export | `ops/perf/deadcode/s6-backend-lib-exports.mjs` | `requireAuth.js` default export 要判 USED | ✅ 命中 |
| S7 | backend scripts / ops 入口（排程 plist + cross-script + package.json + `.claude/settings.json` hook） | `ops/perf/deadcode/s7-scripts-entrypoint.mjs` | `growLibrary.js` 要判「排程」 | ✅ 命中 |
| S8 | 死分支（引 caller 行號） | `ops/perf/deadcode/s8-dead-branch.mjs` | 每個候選要搵到 ≥1 個真實 caller | ✅ browseTap caller=8、appendAutoplayTail caller=8、useAuth fallback site=8 |
| S9 | 資料/產物檔（只列唔刪） | `ops/perf/deadcode/s9-data-artifacts.mjs` | 冇傳統正控，改用「F5 重新驗證 0 bytes + 零引用」自證 | ✅ `confirmedZeroBytesZeroRef: true` |

**開發期間搵到嘅掃描器自身 bug（如實記錄，唔淨係報靚結果）**：
1. S1：`logo-ring@2x/@3x.png` 一開始報零引用——實情係 Metro pixel-density 命名慣例（`logo-ring.png` 被 require，`@2x/@3x` 由 bundler 自動配對，冇任何一行 code 字面 require 佢哋）。已喺輸出加 `USED_VIA_DENSITY_CONVENTION` 分類。
2. S2：`generateDeviceId` 一開始被判 `USED`——因為 `clientLog.js` 有一行 comment 提及個名。加咗「comment-only hit」偵測先解決（見 s2 腳本 `commentOnlyHits`）。
3. S3：icon `pause`/`chevronUp` 一開始報零引用——實情用喺 ternary `name={isPlaying ? 'pause' : 'play'}`，唔係 `name="pause"` 呢種直接字面。擴闊 regex 涵蓋 `name={...}` 入面嘅任何分支後解決。
4. S5：兩個真 bug——(a) 檔案層面 `goneCount>0` 會令 `home.js` 全部 9 條死 route + 1 條活 route（`/daily-verse`）一齊被標 stub；改做逐條 route 用 bare-handler-reference（`router.get('/x', gone)`）精確匹配後解決。(b) `admin.js` 嘅真實掛載前綴（`/api/admin`）响 admin.js 檔案*內部*先 `app.use()`，唔喺 server.js，一開始攞唔到 prefix；加咗「檔案內部 in-file mount」偵測。
5. S5：`/api/p/:token` 一開始被誤判做 stub——因為 handler 入面有條件式 `res.status(410).json({error:'gone'})`（單一 token 過期先觸發，正常運作），加上檔案有 CSS class `.gone`，兩者都撞中舊嘅 loose `\bgone\b` regex。改用「handler 係咪 bare `gone` function reference」嚴格判斷後消除呢個假陽性。
6. S7：`ops/deploy/session-cleanup-ios.sh` 一開始被判「零入口」——實情佢係 `.claude/settings.json` 嘅 `SessionEnd` hook（CLAUDE.md 有記錄），呢個係 plist/cross-script/package.json 以外嘅第 4 種真入口。加咗 `.claude/settings.json` 檢查後解決。
7. S9：F5（`backend/data/hymns.db`）一開始 `referencedBy` 命中咗 `ops/perf/deadcode/s9-data-artifacts.mjs` 自己（腳本 comment 提到個路徑字串）——已排除自身目錄。另外，第一版對成個 27GB repo 做 grep（含 15GB 嘅原始片源 `.mkv`/`.mp4`），120 秒跑唔完；改做只喺會出現「真引用」嘅程式碼/文件目錄搵，唔掃媒體檔。

---

## 1. 證據冊主表

### 1.1 前端死分支（S8）

| ID | 檔:行 | 類型 | 靜態證據 | 運行時證據 | 歷史 | 風險 | 建議 |
|---|---|---|---|---|---|---|---|
| APP-003a | `App.js:2639` `if (opts.browseTap)` | 死分支 | `opts.browseTap` 分支喺 `handlePlayHymn()` 入面 | **全 8 個 `onPlayHymn(...)` call site**（MineScreen×2、SharedPlaylistSheet、LibraryScreen、PlaylistDetailSheet、HymnListScreen、HomeScreen×2）**冇一個傳 `browseTap`**——比 1A 原引用嘅「唯一 caller HymnListScreen.js:111」更完整：HymnListScreen 其實有自己嘅本地 `handlePlayHymn` shadow，call 嘅係 `onPlayHymn` prop（App.js:4401 嘅獨立 inline closure，直接 `playQueue()`，完全繞過 App.js 嘅 `handlePlayHymn`）；真正用到 App.js `handlePlayHymn` 嘅係 Home/Library/Mine/SharedPlaylistSheet 四個 `onPlayHymn={handlePlayHymn}` prop assignment | 分支本身喺初次寫 `playQueue`/`handlePlayHymn` 插播邏輯時已經冇 caller 傳呢個 flag（非「刪剩」，屬「設計咗個 flag 但冇接落 caller」） | 低（純刪一個恆假 `if` block，唔改行為） | 刪 |
| APP-003b | `App.js:2675` `if (opts.appendAutoplayTail && ...)` | 死分支 | 同上 handler | 同上 8 個 call site 都冇傳 `appendAutoplayTail`；`App.js:4257` comment 自認「PlaylistDetailSheet.js 刪咗」 | `git log -S'appendAutoplayTail' -- PlaylistDetailSheet.js` 尾 2 commit：`e4162c8`「自訂清單播放唔再加自動播放尾巴(推翻 BUG3(b))」、`796e3ea` 更早嘅原始寫入——證實曾經有 caller 傳，後來刪咗（屬「刪剩」，同 1A 判斷一致） | 低 | 刪 |
| AVATAR-001（擴大範圍） | `useAuth() \|\| {}` 共 **8 處**：`AvatarButton.js:19`、`InviteFriendsSheet.js:21`、`FriendSharesSheet.js:14`、`MineScreen.js:50`、`AddFriendSheet.js:14`、`LibraryScreen.js:268`、`PlaylistDetailSheet.js:47`、`HymnListScreen.js:80` | 死 fallback（重複模式） | `AuthContext.js` 嘅 `useAuth()`：`if (!ctx) throw new Error(...)`，冇 ctx 一定 throw，唔會走到 `\|\| {}` | 8 個 call site 全部喺 fallback 前後冇任何 try/catch 攔截呢個 throw，證實真係冇機會行到 fallback；`AuthProvider` 已經包晒成個 app tree（App.js top level），實務上 `useAuth()` 永遠有 ctx | 呢個 pattern 由 phone-password-auth 時期（`AvatarButton.js` header comment 引 PHONE-PASSWORD-AUTH-PLAN §5.4）到而家跨 7 個檔逐個抄落嚟，同一個防禦性 idiom 抄咗 8 次 | 低（`\|\| {}` 淨係心理安全感，刪咗行為完全一樣） | 刪（8 處一次過）；⚠️ 比 1A 原文淨列 `AvatarButton.js:19` 一項嘅範圍大，建議 W3 第二段一次過清 8 個 |

**§1.2 三問**：①靜態＝S8 逐個引 caller 行號證明（見上）；②運行時＝逐一列晒全部 call site（唔止 1A 引嗰一個），無一傳咗令分支變真嘅 key；③歷史＝`appendAutoplayTail` 屬「刪剩」（PlaylistDetailSheet 曾傳過，`e4162c8` 撤走）；`browseTap` 同 `useAuth||{}` 屬「設計咗但由頭到尾未駁通」。

---

### 1.2 前端 export（S2）

| ID | 檔:行 | 類型 | 靜態證據 | 運行時證據 | 歷史 | 風險 | 建議 |
|---|---|---|---|---|---|---|---|
| PERF-01 | `perfMarks.js:67` `elapsedSinceT0` | **零引用**（全 repo，連自己都冇再 call） | export function，全 repo grep `\belapsedSinceT0\b` 淨係定義行本身 | 冇任何 call site | `0ad1a3f`（PERF-BASELINE-1B-20260902 建立 perfMarks.js 一整批）——由建立嗰刻起就未被用過，非「刪剩」 | 低 | 刪 |
| DEV-01 | `deviceId.js:20` `DEVICE_ID_KEY` | export-but-internal | 只喺 `deviceId.js` 自己(`getOrCreateDeviceId`/`generateDeviceId`)用 | 冇第二個檔 import | `84f2e03`（單機 HLS gate 用 deviceId 一批） | 低 | P3 收窄 export（唔算刪碼，去 `export` 留 function） |
| DEV-02 | `deviceId.js:23` `generateDeviceId` | export-but-internal | 只喺同檔 `getOrCreateDeviceId:40` call | 冇第二個檔 import（`clientLog.js:33` 淨係 comment 提及，唔算真引用——已用 comment-only 偵測排除） | 同上 | 低 | P3 收窄 export |
| PERF-02 | `perfMarks.js` `installFetchCounter`/`schedulePerfMarksBeacon`/`schedulePerfHomeBeacon`/`scheduleRenderBeacons`/`PERF_MARKS_ENABLED`（5 個） | export-but-internal | 全部只喺 `perfMarks.js` 檔尾自己 call | 冇第二個檔 import | `0ad1a3f` 同一批建立 | 低 | P3 收窄 export（5 個一次過） |
| AUTO-01 | `autoplay.js:26` `MAX_AUTOPLAY_TRACK_SECONDS` | export-but-internal | 只喺同檔用嚟過濾 >10 分鐘長檔 | 冇第二個檔 import | `c09b6b3`（Eric 08-25 拍板隨心聽排除長檔） | 低 | P3 收窄 export |
| HOME-01 | `homeChips.js:42` `CHIP_DEFS` | export-but-internal | 只喺同檔用 | 冇第二個檔 import | `ddf2467`/`e43dde0`（home 五段式改版+Phase 2.5） | 低 | P3 收窄 export |
| AUTO-02（新，1A 未列） | `autoplay.js` `RADIO_LEN` | export-but-internal | 只喺同檔用；`2cadd66` 有 comment-only 提及排除後確認 | 冇第二個檔 import | `2cadd66`（phone-OTP + autoplay mix chips） | 低 | P3 收窄 export |

**§1.2 三問**：①S2 分「ZERO_REFERENCE」（全部零，含定義行以外）vs「INTERNAL_ONLY」（同檔用緊，但冇第二檔 import——呢類**唔係死碼**，只係 export 多咗）；②運行時＝grep 全 repo 冇 import site；③歷史全部「從未接線」（建立即係死），冇一個屬「刪剩」（除 APP-003b）。**PERF-01 係本批全前端唯一嘅真 export 零引用**，其餘 6 項全部係「export 但內部用緊」。

---

### 1.3 icon / asset（S3）

| ID | 檔:行 | 類型 | 靜態證據 | 運行時證據 | 歷史 | 風險 | 建議 |
|---|---|---|---|---|---|---|---|
| ICON-01 | `odeIcons.js` icon `playSmall` | 零引用 | grep `name="playSmall"`/`name={...playSmall...}`/`icon:"playSmall"` = 0（除定義） | 冇 UI 用到 | `5b12ce8`（ODE-REBRAND-PLAN 全新 icon 系統一次過建立 53 個 icon） | 低 | 刪 |
| ICON-02 | icon `addedToList` | 零引用，**但性質不同** | 同上 | `addToList` 5 處呼叫都未用到（1A 已標 P2 用戶可見缺口） | `5b12ce8` | 低（刪碼風險低，但**唔應該刪**——呢個係產品缺口） | **唔刪**，等 D-3（Eric 拍板要唔要接線做「加入清單成功」動畫） |
| ICON-03 | icon `chevronLeft` | 零引用 | 同上 | 冇 UI 用到 | `5b12ce8` | 低 | 刪 |
| ICON-04 | icon `nowPlaying` | 零引用 | 同上 | 冇 UI 用到 | `5b12ce8` | 低 | 刪 |
| ICON-05 | icon `bell` | 零引用 | 同上 | 冇 UI 用到（通知功能未做） | `5b12ce8` | 低 | 刪 |
| ICON-06 | icon `volume` | 零引用 | 同上 | 冇 UI 用到 | `5b12ce8` | 低 | 刪 |
| ICON-07（新，1A 未列） | icon `edit` | 零引用 | 全 repo grep `edit` 字面（連非 icon 用法）都搵唔到第二個相關命中 | 冇 UI 用到 | `5b12ce8` | 低 | 刪 |
| ICON-08（新，1A 未列） | icon `sort` | 零引用 | 同上 | 冇 UI 用到 | `5b12ce8` | 低 | 刪 |
| ICON-09（新，1A 未列） | icon `stop` | 零引用 | 同上 | 冇 UI 用到（播放控制用 `pause`/`play` 二態，冇獨立停止鍵） | `5b12ce8` | 低 | 刪 |
| ASSET-01（新，1A/1D 未列） | `assets/favicon.png` | 零引用 | app.json 冇 `web` config key，全 code grep 零引用 | N/A（web 平台冇 build，`platforms` 只有 ios/android） | `0de3b6c`（v1.0.0 baseline，Expo 腳手架預設檔，由第一個 commit 就冇用過） | 低 | 刪 |
| ASSET-02（新，1A/1D 未列） | `assets/splash-icon.png` | 零引用 | app.json 冇 `splash` config key | N/A | `0de3b6c` | 低 | 刪 |
| ASSET-03（false positive，記錄） | `assets/logo-ring@2x.png`/`@3x.png` | **唔係死碼** | 表面零字面 require，實情 Metro pixel-density 命名慣例自動配對 `logo-ring.png`（`LogoRing.js:10` `require('../../assets/logo-ring.png')`） | 有效（bundler 自動選高解析度版本） | — | — | 唔刪 |

**§1.2 三問**：①靜態 = odeIcons.js 53 個 icon 逐個 grep 三種用法（`name="X"`/`name={ternary}`/`icon:"X"`）；②運行時 = 冇 render 過（呢類 icon 冇 log 可查，純靠 import graph）；③歷史 = 全部「一次過建咗成套 icon system，部分由第一日就未駁線」，addedToList 例外（已知係產品缺口非刪碼對象）。

---

### 1.4 前端依賴（S4）

**結論：20 個依賴（18 dependencies + 2 devDependencies）全部有用**，冇候選。`expo-font` 係 config-plugin-only（app.json `plugins` 陣列配置字型，冇 JS import）——同 1A DEP-003 假陽性判斷一致；`react-native-reanimated`/`react-native-worklets` 只喺 `babel.config.js` 出現（babel plugin，非 JS import）；`react-dom` 只喺 `tools/react-harness/scenarios/*.js` 用 `await import('react-dom/client')`（W1 前端 harness 依賴，第一版 regex 漏咗 dynamic `import()` 語法，已修正）。**呢類冇項可寫入「刪」表**。

---

### 1.5 backend route（S5）

#### 410 stub 四檔（紅線：等 09-13，本波唔刪）

| ID | 檔案 | 條數 | 前端引用 | `deprecatedRouteHits` 持久計數 | 建議 |
|---|---|---|---|---|---|
| STUB-CAT | `routes/category.js` | 8 條全部 bare `gone` handler | 0 | 未見命中 | **等** 09-13（7 日零命中門檻） |
| STUB-SEARCH | `routes/search.js` | 5 條全部 bare `gone` handler | 0 | **`/api/search: 1` 次**，發生喺 hourly bucket `2026-09-06T02`（見下段時間校對） | **等** 09-13——⚠️呢個唔係「零命中」，要下一輪再確認 |
| STUB-AUDIO | `routes/audio.js` | 1 條（`/:youtubeId`）bare `gone`；`/cache/stats`、`/cache/warm-stats` 特意保留（1D 已核實，非死碼） | 0（`/:youtubeId`） | 未見命中 | **等** 09-13 |
| STUB-HOME | `routes/home.js` | 9 條全部 bare `gone`（`/daily-verse` 唔喺呢批——S5 開發期間曾誤判成 stub，已修正，見 §0 開發期 bug 記錄） | 0 | 未見命中 | **等** 09-13 |

**`deprecatedRouteHits` 時間校對（如實記錄，唔砌大個結論）**：`backend/logs/metrics/ops-metrics.json` 嘅 `total.deprecatedRouteHits` = `{"/api/search": 1}`，寫喺 hourly bucket `2026-09-06T02`（小時粒度，冇分鐘）。執行單 §0 紅線寫「由 09-06 02:43 起 7 日零命中先刪」；`02` 呢個小時桶橫跨 02:00-02:59，**冇辦法單靠小時粒度判斷呢 1 次命中發生喺 02:43 之前定之後**。本波唔刪，呢個唔確定性本身就係「唔刪」嘅理由之一，寫入建議欄，等下一輪（09-13）重新讀 metrics 時應該已經清楚（如果之後 7 日都 0，呢 1 次自然落喺窗口外）。

#### 零前端命中但非 stub（低信心候選，建議留）

| ID | 檔案 | 靜態證據 | 運行時證據 | 建議 |
|---|---|---|---|---|
| ADMIN-INV-01 | `GET /api/admin/invites` | 冇任何前端 UI 呼叫（App/screens 全 grep 零命中）；`backend/public/` 冇獨立 admin 網頁；`ops/`/`backend/scripts/` 都冇 script 呼叫 | 冇 log 佐證（呢類 admin 動作冇獨立 access log 分類） | **留**——好可能係 Eric 人手 curl/Postman 用嘅邀請碼管理工具，冇前端 UI 唔代表死，呢個係「有 admin route 但冇 admin 前端」嘅正常形狀（同 `/api/audio/cache/stats` 一樣屬故意保留嘅 ops-only 端點） |
| ADMIN-INV-02 | `POST /api/admin/invites/:code/revoke` | 同上 | 同上 | 同上，**留** |

（`/.well-known/apple-app-site-association`、`/apple-app-site-association`、`/.well-known/assetlinks.json` 三條零前端命中屬**預期**——呢啲係 iOS Universal Links / Android App Links 俾 OS 層直接讀嘅靜態驗證檔，唔會有任何 app JS 呼叫佢，唔係候選，唔入表。`GET /api/internal/activity` 一開始都零前端命中，但深查後搵到真 caller：`backend/scripts/growLibrary.js` + `ops/perf/harness/w2/hc4-internal-activity-harness.mjs`——loopback-only 設計本身就講明呢係同機工具用，唔係俾 app 打，**唔係候選**。)

**§1.2 三問**：①靜態＝server.js 掛載表 × routes/*.js 逐條 `router.METHOD`/`app.METHOD` 解析（含 admin.js 呢種「prefix 匿藏喺檔案內部 `app.use()`」寫法）；②運行時＝前端 grep（stripped-param 字面比對，對 template-literal 拼接嘅 path 有結構性盲點——`/api/friends/${userId}/accept` 呢類會假陽性報零命中，已人手覆核排除，見下段）+ `deprecatedRouteHits` 持久計數；③歷史＝410 stub 全部嚟自同一個 commit `ebe29ba`（Stage2 A-4）。

**人手覆核排除嘅假陽性（S5 methodology 局限，如實記錄）**：`/api/admin/hymns/:id/delist`、`/api/audio/cache/stats`、`/api/audio/cache/warm-stats`、`/api/friends/:userId/accept`、`/api/friends/:userId/shares`、`/api/me/playlists/:id/share`（POST/DELETE）呢 6 條一開始都因為 path 入面嘅 `:param` 喺前端係用 template literal（`${API_BASE}/api/friends/${userId}/accept`）拼出嚟、字面 grep 收窄後嘅字串（`/api/friends/accept`）根本唔存在於任何檔案，導致假陽性零命中。逐條人手喺 `frontend/hymn-app/src/api.js`／對應 screen 搵到真呼叫（`api.js:45,51,60,69,78,141,149,157,162,168,174`、`FriendSharesSheet.js`、`PlaylistDetailSheet.js:97`），**全部確認有用，唔係候選**。`/api/audio/cache/*` 兩條已喺 1D 確認係故意保留嘅 ops 端點。

---

### 1.6 backend lib export（S6）

| ID | 檔:行 | 類型 | 靜態證據 | 運行時證據 | 歷史 | 風險 | 建議 |
|---|---|---|---|---|---|---|---|
| LIB-01 | `hymnDb.js` `COMPILATION_PATTERNS` | 零引用 | 全 backend grep 淨係定義行 | 冇 caller | `756c72c`（Phase2 dead-link + curated library，呢批建立） | 低 | 刪（要人手覆核係咪打算俾將來嘅 script 用——建議刪前 `git log -p` 睇埋上下文用途，執行單第二段做） |
| LIB-02 | `presence.js` `_resetForTest` | 零引用 | 全 backend grep 淨係定義行 | 冇 harness call | `44e7e19`（ADMIN-PRESENCE-EXEC-20260905，2026-09-05——**新鮮死碼**，非舊嘢） | 低 | 刪（同 09-02 已刪嘅 `deviceId.js __resetForTest` 同一種案例：寫咗俾將來 test 用但 harness 從未接） |
| LIB-03 | `presence.js` `_sizeForTest` | 零引用 | 同上 | 同上 | `44e7e19` | 低 | 刪 |
| LIB-INTERNAL | `clientLogStore.js`（2）、`hymnDb.js`（10，扣走上面 COMPILATION_PATTERNS）、`instrumentalSilence.js`（5）、`lyricsLangCheck.js`（2）、`ocrMerge.js`（3）、`paddleAdapter.js`（2）、`reconcileCore.js`（3）、`textSimilarity.js`（1）、`warmLog.js`（2） | export-but-internal，共 **30 個 identifier**（regex 常數/內部 helper，全部只喺定義嗰檔自己用） | 逐個 grep 全 backend 冇第二檔 import | — | 各自屬對應功能建立嗰個 commit（instrumental/歌詞語言判斷/OCR 合併/reconcile 等分類邏輯陸續建立） | 低 | P3 收窄 export（**唔係死碼**，30 個一次過去 `export` keyword，留 code） |

**§1.2 三問**：①S6 分類同 S2 一致（ZERO_REFERENCE vs INTERNAL_ONLY）；②運行時＝1D §3.2 已用「檔案層面全部 ≥1 引用」判「lib/ 零死碼」——本掃描器做深一層 export-粒度，冇推翻 1D 嘅檔案層面結論（呢 3 個零引用 export 所在嘅 3 個檔案本身都仲有其他 export 俾人用，檔案唔死，只係呢幾個 identifier 死）；③歷史＝`presence.js` 兩個係 2026-09-05 先建立嘅新鮮死碼，`COMPILATION_PATTERNS` 較舊（Phase2）。

---

### 1.7 backend scripts / ops 入口（S7）

**方法論局限（如實記錄）**：S7 對 399 個檔案（`backend/scripts/*.js` 89 + `ops/**/*.{sh,mjs,py}` 310）做「排程 / Claude hook / 人手CLI或被其他script呼叫 / 零入口」四分類，258 個落入「零入口」。**呢個唔可以直接讀成「258 個死碼」**——絕大多數（188 個喺 `ops/lyrics/`）係歌詞複核產線嘅慣例做法：每班（R1/R2/R2b 等，見 memory 45+ 個 shift 記錄）人手寫新掃描器、人手直接 `python3 ops/lyrics/xxx.py` 執行，結構上**設計成冇 caller**（CLI 工具嘅本質就係俾人手打，唔係俾第二個 script call）。46 個喺 `backend/scripts/` 嘅零入口清單同 1D §3.3/§5.1(F9) 嘅判斷**完全吻合**（全部係 `oneoff-*`/`migrate-*` 已執行一次性腳本，或者 N-2 拍板明文保留嘅 11 個 `backfillAlbumFrom*Catalog.js` 之中嘅 6 個——其餘 5 個因為 basename 撞咗其他檔案嘅字串而假陽性判「被引用」，唔影響 N-2 嘅「唔做」結論）。23 個喺 `ops/perf/`，全部係前幾波（W1/W2/PERF Stage2）已經跑完嘅一次性驗收 harness，冇後續引用係預期（歷史證據，非死碼）。

**本掃描器對 backend/scripts 冇新增任何 1D 未報過嘅候選**——F5（`backend/data/hymns.db`）維持係呢個範圍**唯一**嘅真死碼，已喺 §1.8 S9 表重列。

**正面修正**：`ops/deploy/session-cleanup-ios.sh` 一開始假陽性做「零入口」，已證實係 `.claude/settings.json` SessionEnd hook（見 §0）。`ops/deploy/apk-publish.sh` 維持零入口——同 F2 finding 一致（人手部署工具，冇代碼呼叫係設計本身）。

**§1.2 三問**：①靜態＝plist ProgramArguments + cross-script text search + package.json scripts + `.claude/settings.json` hooks 四路；②運行時＝呢類 CLI 工具嘅「運行時證據」結構上就係「人手執行過一次記錄喺 git commit/memory」，唔會有程式化 caller；③歷史＝已喺 1D 逐檔核實，本冊唔重做。

---

### 1.8 資料/產物檔（S9，只列唔刪）

| ID | 檔案 | 大細 | 靜態證據 | 運行時證據 | 歷史 | 建議 |
|---|---|---|---|---|---|---|
| F5 | `backend/data/hymns.db` | 0 bytes | 全 repo（排除本掃描器自身）零引用 | N/A（0 bytes 讀唔到嘢） | mtime 2026-09-01，1D 已記錄「人手測試/打錯路徑遺留，真檔喺 backend/hymns.db」 | 列出，**等 Fable 決定**（1D 已判「可安全刪除」，本冊唔重複判，跟執行單 §1.1 S9「只列唔刪」） |
| APK-01（新，1D/1A 未列） | `backend/public/app.apk.bak-1.5.0-20260808-070853` | ~110.7MB | grep backend routes/frontend/ops 零引用 | — | mtime 2026-08-08 | 列出，**等 Fable 決定** |
| APK-02（新） | `backend/public/app.apk.bak-1.5.1-20260824-045442` | ~110.7MB | 同上 | — | mtime 2026-08-24 | 列出，**等 Fable 決定** |
| APK-03（新） | `backend/public/app.apk.bak-v1.1.0-20260808` | ~83.1MB | 同上 | — | mtime 2026-08-08 | 列出，**等 Fable 決定** |
| APK-04（新） | `backend/public/hymn-app-v212.apk` | ~84.8MB | 同上 | — | mtime 2026-07-13 | 列出，**等 Fable 決定** |
| APK-05（新） | `backend/public/hymn-app-v213.apk` | ~84.8MB | 同上 | — | mtime 2026-07-13 | 列出，**等 Fable 決定** |
| APK-06（新） | `backend/public/hymn-app-v214.apk` | ~84.8MB | 同上 | — | mtime 2026-07-13 | 列出，**等 Fable 決定** |
| APK-07（新） | `backend/public/hymn-app-v215.apk` | ~84.8MB | 同上 | — | mtime 2026-07-13 | 列出，**等 Fable 決定** |

**對照**：`backend/public/app.apk`（現役）、`hymn-app-v1.3.0-week2.apk`（`server.js` 有一條特定舊版相容 route 引用）都**有**引用，**唔喺**呢張表——證實 grep 方法本身有效（見 S9 正控）。7 個候選合共 **~653MB**，全部係歷史 APK 側載備份，同現役 `/downloads`/`app.apk` route 冇任何關係。

**§1.2 三問**：①靜態＝逐檔 basename grep backend/routes/lib/scripts + frontend/src + ops；②運行時＝呢類靜態產物檔冇「運行時」概念，只有「有冇被 route serve 過」（`app.apk`/`week2.apk` 有 route 引用，其餘冇）；③歷史＝mtime 分佈 07-13～08-24，全部係舊版本側載 APK 側載完之後嘅殘留備份，未再被引用過。

---

## 2. 統計總覽（§1.3）

| 類別 | 候選數 | 建議刪數 | 建議留（export收窄/false positive/產品缺口）數 | 建議等（09-13 stub / Fable 決定）數 | 估計行數（僅「建議刪」項） |
|---|---|---|---|---|---|
| 前端死分支（S8） | 3 組（合 8+8+1=17 個 site 涉及，其中 useAuth 擴大到 8 檔） | 3 組全刪（含 8 檔 `useAuth\|\|{}`） | 0 | 0 | ~20 行（2 個 if block + 8 處 `\|\| {}` 各 1 個 token） |
| 前端 export（S2） | 7 個 identifier | 1（`elapsedSinceT0`） | 6（export-but-internal，P3 收窄） | 0 | ~4 行（`elapsedSinceT0` function body） |
| 前端 icon（S3） | 9 個 | 8 | 1（`addedToList`，等 D-3） | 0 | ~72 行（9 個 icon 定義 × 平均 8 行 path/shapes） |
| 前端 asset（S3） | 2 個（+2 個 false positive 已排除） | 2（favicon.png/splash-icon.png） | 0 | 0 | 0 行 code（純刪二進位檔） |
| 前端依賴（S4） | 0 | 0 | 0 | 0 | 0 |
| backend route（S5） | 23 條 stub + 2 條低信心 | 0（紅線鎖死） | 2（`admin/invites` 兩條，建議留） | 23（410 stub，等 09-13） | 0（本波） |
| backend lib export（S6） | 33 個 identifier | 3（`presence.js` ×2 + `COMPILATION_PATTERNS`） | 30（export-but-internal，P3 收窄） | 0 | ~15 行（3 個小 function/常數） |
| backend scripts/ops（S7） | 258「零入口」（絕大多數係設計成人手CLI，非死碼候選） | 0（同 1D 結論一致，F5 已計入 S9） | — | — | 0 |
| 資料/產物檔（S9） | 8 個（F5 + 7 APK 備份） | 0（S9 規則：只列唔刪） | — | 8（等 Fable 決定） | 0（本波） |
| **合計** | **~342 個候選（含 258 個 S7 CLI 誤框）** | **14 個真「建議刪」項（前端 3 死分支類+1 export+8 icon+2 asset=14項覆蓋約 25 個獨立 symbol/檔）** | **37 個「export 收窄/留」** | **31 個「等」（23 stub + 8 資料檔——F5 併入資料檔count）** | **約 111 行**（唔含 09-02 已刪嗰 6,101 行，唔重數） |

**備註**：合計行唔可以簡單相加——S7 嘅 258 大多數係方法論本身框唔到「人手CLI冇caller係正常」呢個事實，唔係獨立死碼候選，已喺 §1.7 解釋點解唔計入「建議刪」。真正嘅「建議刪」清單只有 §2 尾三欄可執行嘅 14 項（前端死分支 3 組 + export 1 個 + icon 8 個 + asset 2 個 + backend lib 3 個 = **17 項**，另加 §1.3 表格首列已经拆細；為免重複算，第二段執行時應以 §1（逐項表格）嘅「建議＝刪」欄位為準，唔好用呢個總表嘅粗略加總）。

---

## 3. 唔喺呢份證據冊入面嘅嘢（刻意排除，附理由）

- **HLS 樹**（`HLS_ENABLED`/`isHlsUrl`/`hlsFallback`/`hlsDowngradedTrackRef`/`routes/hls.js`/`lib/hlsPlaylist.js`）——紅線，一個字冇掃、冇列。
- **`addedToList` icon** ——列咗喺 §1.3，但明確標「唔刪」，等 D-3。
- **410 stub 四檔**——列咗，標「等 09-13」，唔建議本波刪。
- **11 個 `backfillAlbumFrom*Catalog.js`**——N-2 已拍板唔抽唔刪，S7 只做確認（零入口分類同 1D 一致），冇再重新評估攞唔攞走。
- **09-02 已刪嘅 29 檔 6,101 行**——冇重數，`ops/perf/deadcode` 掃描器全部掃現存檔案，唔會掃到已刪嘅嘢。
- **PlayerProvider 起播/stall/watchdog 邏輯**——冇掃呢部分嘅任何分支存活性（紅線明文唔准掂）。

---

## 4. 做唔到 / 未做嘅嘢（如實交代）

- S5 嘅「前端命中」判斷對 template-literal 拼接嘅 path（`${API_BASE}/api/x/${id}/y`）有結構性盲點，逐條假陽性都已人手覆核排除（見 §1.5），但**冇時間寫一個更聰明嘅 AST-based 版本**去自動處理呢類 case——如果第二段要重跑呢個掃描器，呢個盲點仲會出現，要再人手覆核一次。
- S6 嘅 30 個「export-but-internal」identifier 冇逐個查 git blame 睇「係咪本身打算俾 test 用」——時間所限，只列咗建議「P3 收窄」而冇再深挖每一個嘅原始設計意圖。
- S9 冇量 `ops/perf/audit-20260906`（31.5MB）/`baseline-20260902`（7.6MB）/`stage2-20260902`（12.8MB）呢類歷史 baseline 目錄嘅個別檔案級死碼——執行單話呢類「只列唔刪」，本冊淨係喺 §0 掃描器輸出記低目錄大細，冇再細分。
- 冇跑 `deprecatedRouteHits` 嘅「7 日觀察窗」（今日先 09-06，門檻要 09-13）——呢個唔係「做唔到」，係執行單本身要求等。

---

## 5. Fable 5.1 批示（2026-09-06 04:00 HKT）

| 類 | 決定 | 理由 |
|---|---|---|
| S8 死分支 APP-003a/b、`useAuth() \|\| {}` ×8 | **刪** | 8 個 call site 逐個核過冇傳 flag；`useAuth` 冇 ctx 必 throw |
| S2 `elapsedSinceT0` | **刪** | 建立起零引用 |
| S2/S6 「export 但只內部用」共 36 個 | **唔郁** | 唔係死碼，收窄 export 冇效能/可讀性收益，純 churn |
| S3 icon ×8（唔含 `addedToList`） | **刪** | `5b12ce8` 一次過建套 icon，8 個由第一日未駁線 |
| S3 `favicon.png`/`splash-icon.png` | **刪** | app.json 零引用（已獨立 grep 核實）、平台只有 ios/android |
| S6 `presence.js _resetForTest/_sizeForTest` | **刪** | 09-05 新鮮死碼，harness 從未接 |
| S6 `hymnDb.js COMPILATION_PATTERNS` | **刪** | 已被 `isCompilation()` 內嵌清單取代（07-26 特登拎走 `%專輯%` 誤殺），舊常數留低反而誤導 |
| S5 410 stub 23 條 | **等 09-13** | `deprecatedRouteHits` 7 日窗；`/api/search` 嗰 1 次落喺 02 時桶要下輪再睇 |
| S5 `admin/invites` 2 條 | **留** | ops-only 端點 |
| S9 F5 `backend/data/hymns.db`（0 bytes） | **刪**（要人手：sandbox 擋住 rm） | 1D 已判安全 |
| S9 APK 備份 ×7 | **刪 6 個、留 1 個**（要人手：sandbox 擋住 rm） | 留 `app.apk.bak-1.5.1-20260824-045442`（最近一次 publish 前嘅 app.apk，做 rollback 用）；其餘 6 個（v212–v215 七月側載版、1.5.0/v1.1.0 .bak）冇引用、冇 rollback 價值，同 09-02 Eric「舊備份刪」決定同類；全部 untracked，只慳碟 ~558MB |
| S7 258「零入口」 | **唔郁** | 人手 CLI 設計如此 |

第二段範圍 = 上表「刪」項（唔含要人手嗰兩行）。

人手清理命令（Eric / Dispatch 喺 Terminal 行）：
```bash
rm -f backend/data/hymns.db backend/public/app.apk.bak-1.5.0-20260808-070853 backend/public/app.apk.bak-v1.1.0-20260808 backend/public/hymn-app-v212.apk backend/public/hymn-app-v213.apk backend/public/hymn-app-v214.apk backend/public/hymn-app-v215.apk
```
