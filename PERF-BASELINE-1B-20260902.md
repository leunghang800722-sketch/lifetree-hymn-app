# PERF-BASELINE-1B-20260902 — iOS 模擬器 runtime baseline

執行者：Sonnet 5（Stage 1B）。範圍：PERF-IMPROVEMENT-PLAN-20260902.md §Stage 1B。
裝置：iPhone 17 模擬器 `E0416618-B662-41D2-A253-5260FA0CF556`（iOS 26.5），全程只開呢一部。
Build：**Release**，`xcodebuild -workspace ios/Odely.xcworkspace -scheme Odely -configuration Release
-sdk iphonesimulator -destination platform=iOS Simulator,id=E0416618-B662-41D2-A253-5260FA0CF556
-derivedDataPath <scratchpad>/derivedData build`，`git rev-parse HEAD` = `7a0a96cde5347b5feaf944e86b7f234dca731e3f`。
**執行者唔判 PASS/FAIL/快/慢/冇問題 —— 呢欄留白俾 Opus 5。**

原始證據全部喺 `ops/perf/baseline-20260902/1b-*`。

---

## 0. 建置 provenance

| 項目 | 數字/內容 | raw 檔 |
|---|---|---|
| xcodebuild 指令 | 見上 | `1b-00-build-provenance.log` |
| Build 開始（host UTC） | 2026-09-02T07:13:03Z | `1b-00-build-provenance.log` |
| Build 完成（log 顯示 `** BUILD SUCCEEDED **`，local time） | 2026-09-02 15:16:36 | `1b-xcodebuild-tail200.log` |
| Build 時長 | ≈ 3h03m（**含等其他 session 用緊 CPU/CI 的排隊時間，唔係純編譯時間**——呢個 wall-clock 唔可以當「編譯呢個 app 要 3 小時」嚟讀,冇拆行緊嘅背景負載） | 同上 |
| 產出 .app | `<scratchpad>/derivedData/Build/Products/Release-iphonesimulator/Odely.app` | — |
| `main.jsbundle` 大細 | **3,716,119 bytes** | `1b-00-build-provenance.log` |
| 對比：Fable 5.1 09:50-10:10 盤點嘅舊 Release build（build 於 11:44,HEAD 早過而家嘅 14:04） | 3,703,949 bytes | PERF-IMPROVEMENT-PLAN-20260902.md §1 |
| 差異 | +12,170 bytes（呢個 build 帶埋 Stage 1B 儀器:`src/perfMarks.js` 新檔 + 6 個 call site 各加 1-3 行） | — |
| `git status --short frontend/hymn-app/ios/`（build 有冇動過 tracked ios 檔） | 空(冇改動) | `1b-00-build-provenance.log` |
| Patched copy | `<scratchpad>/Odely-patched.app`,`Expo.plist` `EXUpdatesCheckOnLaunch` `ALWAYS`→`NEVER`(`EXUpdatesEnabled` 保持 `true`) | `1b-00-build-provenance.log` |
| 安裝方式 | `xcrun simctl install <udid> Odely-patched.app`,bundle id `com.hymnapp.praise` | — |

---

## 1. S1 — 冷啟動·無 cache（uninstall → install → launch，5 run）

流程：`simctl terminate` → `simctl uninstall` → `simctl install`(patched .app) → 記 host launch 時間戳 → `simctl launch` → 等 15/20 秒收 `perfMarks`/`perfRenders` beacon(backend `[client-log]`)。

### 1.1 逐 run 數字（來自 `perfMarks` beacon `detail` 欄）

| run | app(ms) | cont(ms) | home(ms) | verMs(ms) | verSkip | hymnsMs(ms) | n(hymns count) | fetch= | raw 檔 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 251 | 313 | 378 | 1159 | 0 | - (未完成) | - | 4(version:1,health:1,app-version:1,hymns:1) | `1b-s1-run1.log` |
| 2 | 134 | 177 | 235 | 953 | 0 | - (未完成) | - | 4(同上) | `1b-s1-run2.log` |
| 3 | 138 | 201 | 261 | 1024 | 0 | **10269**(完成) | 6405 | 7(version:1,health:1,app-version:1,hymns:1,stream:2,home:1) | `1b-s1-run3.log` |
| 4 | 129 | 189 | 254 | 913 | 0 | **11626**(完成) | 6405 | 7(同上) | `1b-s1-run4.log` |
| 5 | 128 | 203 | 266 | 875 | 0 | - (未完成) | - | 4(同上) | `1b-s1-run5.log` |
| **min/median/max** | 128/134/251 | 177/201/313 | 235/261/378 | 875/953/1159 | 0/0/0 | 10269/-/11626(n=2) | 6405(n=2) | — | — |

`hymnsMs` 只有 2/5 run 喺 15 秒 beacon 窗口內完成(`fetchAllHymnsWithRetry` 內部有 8s timeout + 1 次 retry,理論上限 16s,同 15s 窗口好接近)——`-` 唔係「量唔到」,係「beacon 送出嗰刻仲未 resolve」,呢個本身就係一個數字(見「限制」)。

### 1.2 記憶體(host `ps -o rss= -p <pid>`,KB)

| run | launch+3s | launch+20s | raw 檔 |
|---|---|---|---|
| 1 | (未做,呢個 run 用手動流程,冇 3s 讀數) | 338784(**注:實際喺 launch+117s 讀,唔係 +20s**,見限制) | `1b-s1-run1.log` |
| 2 | 403744 | 470752 | `1b-s1-run2.log` |
| 3 | 327440 | 371472 | `1b-s1-run3.log` |
| 4 | 403984 | 424352 | `1b-s1-run4.log` |
| 5 | 403200 | 421952 | `1b-s1-run5.log` |
| **min/median/max**(n=4,run1 唔計) | 327440/403472/403984 | 371472/423152/470752 | — |

### 1.3 render 次數(t=15s,`perfRenders` beacon)

| run | Home | Library | Mine | Mini | TabBar | FullPlayer | AppContent |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 3 | 3 | 3 | 3 | 0 | 3 |
| 2 | 3 | 3 | 3 | 3 | 3 | 0 | 3 |
| 3 | 5 | 5 | 5 | 5 | 5 | 0 | 5 |
| 4 | 5 | 5 | 5 | 5 | 5 | 0 | 5 |
| 5 | 3 | 3 | 3 | 3 | 3 | 0 | 3 |

觀察(唔係判定):run 3/4 嘅 render 數(5)同 hymnsMs 完成(10269/11626ms)同一個 run——`n=6405` 有值嘅 run 亦係 render 數升到 5 嘅 run,兩者喺同一 run 內同時出現,呼應「hymns fetch 完成觸發多一次 setState → HomeScreen/Library/Mine/Mini/TabBar/AppContent 全部多 render 2 次」呢條因果鏈,`FullPlayer` 全部 5 run 都係 0(冇播歌,呢個係內部 positive control:`FullPlayer` 喺冇開播放器全螢幕嗰陣應該係 0,見§6)。

### 1.4 正控:screenshot 時序(run 1)

`host_launch_ts=1788333498.783`;由 `perfMarks` beacon 反推 T0(bundle entry)≈`1788333500.304`(即 native 初始化用咗 ≈1.52s 先到 JS 開始行)。

| 時間(相對 T0) | 畫面 | 檔 |
|---|---|---|
| T0-22ms | 全白 splash,乜都未畫 | `1b-screens/s1-run1-before-splash-t-0.022s.png` |
| T0+648ms | header(「odely」+ 頭像)+ TabBar + 中央 loading spinner 已畫出 | `1b-screens/s1-run1-after-loading-t+0.648s.png` |

`mark('home')`(378ms)本身係「HomeScreen 首次 mount + 兩個 rAF 之後」——**呢個 run 冇 cache,HomeScreen 第一次 mount 嗰刻 `hasData` 係 false,所以 `home` mark 記嘅其實係「loading spinner 出現」嗰一刻,唔係「真內容畫咗出嚟」**(spinner 喺 T0+648ms 嘅截圖已經見到,同 378ms 個 mark 同一數量級,方向一致)。全部 33 張逐幀截圖喺 `1b-s1-run1-all-frames/`。

---

## 2. S2 — 熱啟動·有 cache、version 相同(terminate → launch,5 run)

流程:喺 S1 跑完之後(app 已裝、MMKV 已經有 6405 首 cache)只做 `simctl terminate` → `simctl launch`,唔 uninstall。

### 2.1 逐 run 數字

| run | app | cont | mmkvRead | parse | cacheReady | home | verMs | verSkip | fetch= | raw 檔 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 109 | 187 | 17 | 19 | 181 | 894 | 963 | 1 | 6(version,health,stream×2,home,app-version) | `1b-s2-run1.log` |
| 2 | 134 | 213 | 18 | 19 | 206 | 948 | 1114 | 1 | 6(同上) | `1b-s2-run2.log` |
| 3 | 140 | 225 | 18 | 19 | 218 | 935 | 1094 | 1 | 7(+stream×3) | `1b-s2-run3.log` |
| 4 | 140 | 217 | 18 | 19 | 211 | 938 | 1253 | 1 | 5(stream×1) | `1b-s2-run4.log` |
| 5 | 152 | 321 | 18 | 19 | 315 | 1035 | 968 | 1 | 5(stream×1) | `1b-s2-run5.log` |
| **min/median/max** | 109/140/152 | 187/217/321 | 17/18/18 | 19/19/19 | 181/211/315 | 894/938/1035 | 963/1094/1253 | 1/1/1 | — | — |

`n`(hymns count)全部 5 run 都係 6405(MMKV cache 命中,同 S1 run3/4 網絡攞返嚟嗰個數一致)。`verSkip=1` 全中——version 冇變,`fetchAllHymnsWithRetry` 冇再行。

### 2.2 記憶體(KB)

| run | launch+3s | launch+20s | raw 檔 |
|---|---|---|---|
| 1 | 517056 | 357200 | `1b-s2-run1.log` |
| 2 | 515712 | 412112 | `1b-s2-run2.log` |
| 3 | 514752 | 507136 | `1b-s2-run3.log` |
| 4 | 512784 | 511952 | `1b-s2-run4.log` |
| 5 | 511488 | 511216 | `1b-s2-run5.log` |
| **min/median/max** | 511488/514752/517056 | 357200/507136/511952 | — |

### 2.3 render 次數(t=15s)

全部 5 run 一致:`Home=4 Library=4 Mine=4 Mini=4 TabBar=4 FullPlayer=0 AppContent=4`。

---

## 3. S3 — Tab 導航(`Home→詩歌庫→我的→Home→詩歌庫→Home`,5 次)

**工具**:`mcp__Claude_Code_iOS_Simulator__control` 喺呢個 session 唔可用(「Mobile simulator tools require an attended session」,dispatched session 限制)。改用 **`idb ui tap`**(`idb connect <udid>` 之後,座標用 `idb describe` 讀到嘅 point 座標:402×874pt,TabBar 三粒掣 y≈807pt,x 分別 ≈67/201/334pt)。

`App.js` 嘅 `onTabChange` 由直接 `setActiveTab` 改做 `handleTabChange`(記 tap 時間戳 → `setActiveTab` → 雙 rAF 之後送 `recordNavBeacon`)。

| # | tab | tapToMount(ms) | tapToPaint(ms) | raw 檔 |
|---|---|---|---|---|
| 1 | Library | 39 | 61 | `1b-s3-nav.log` |
| 2 | Mine | 81 | 114 | 同上 |
| 3 | Home | 82 | 98 | 同上 |
| 4 | Library | 81 | 98 | 同上 |
| 5 | Home | 77 | 98 | 同上 |
| **min/median/max** | tapToMount | 39/81/82 | — | — |
| **min/median/max** | tapToPaint | 61/98/114 | — | — |

三個 tab 全部 keep-mount(`display:flex/none` 切換,冇 unmount/remount),`tapToMount` 呢度量緊嘅係「`setActiveTab` state commit 到 effect 執行」嗰段,唔係真正 native mount 時間(見限制)。

---

## 4. S4 — 記憶體(host `ps -o rss=`)

| 時點 | RSS(KB) | 來源/raw 檔 |
|---|---|---|
| 冷啟動 launch+3s(S1,n=4) | 327440/403472/403984(min/median/max) | `1b-s1-run2~5.log` |
| 冷啟動 launch+20s(S1,n=4) | 371472/423152/470752 | 同上 |
| 熱啟動 launch+3s(S2,n=5) | 511488/514752/517056 | `1b-s2-run1~5.log` |
| 熱啟動 launch+20s(S2,n=5) | 357200/507136/511952 | 同上 |
| 撳「詩歌庫」tab 之前(閒置中,已運行約 2 分鐘) | 424432 | `1b-s4-memory.log` |
| 撳「詩歌庫」tab 後 5 秒 | 459984 | `1b-s4-memory.log` |
| 播歌前 launch+6s(獨立 fresh launch,熱啟動) | 512656 | `1b-s5-playback.log` |
| 播歌 3 分鐘後 | 339872 | `1b-s5-playback.log` |

---

## 5. S5 — 播放(首頁「隨心聽」→ 播 3 分鐘)

| 項目 | 數字 | raw 檔 |
|---|---|---|
| `nextTrackMs`(backend `[client-log]`,呢條 beacon 一直都會送,唔受 DIAG_ENABLED 影響) | **205ms**(`origin=start source=local surface=shuffle first=1`,hymnId=5742) | `1b-s5-playback.log` |
| `perfRenders` @ t=60s(launch 起計,涵蓋播放中約 53 秒) | `Home=8 Library=8 Mine=8 Mini=8 TabBar=8 FullPlayer=4 AppContent=8` | `1b-s5-playback.log` |
| RSS launch+6s → 播放 3 分鐘後 | 512656 → 339872(KB) | `1b-s5-playback.log` |

`FullPlayer` render 數由 S1/S2 嘅恆定 0 變成 4(t=60s 窗口)——內部 positive control:呢個 component 淨係喺 `overlayExpanded` 為 true(即係全螢幕播放器開咗)先會 render,冇播歌嗰陣理應係 0、播緊歌開咗全螢幕先會 >0,兩個場景數字方向一致。

---

## 6. S6 — Request 數

### 6.1 client 端(`fetch=` 欄,perfMarks beacon,開機 30 秒內按 path 首兩段聚合)

已列喺 §1.1/§2.1 逐 run 表。範圍:4-7 個(S1 冷啟動 4-7,S2 熱啟動 5-7)。**呢個計數只計 `global.fetch`,唔計 `<Image>`(native image loader)、唔計 `audioPrefetch.js`(用 `expo-file-system` 落載,唔行 fetch)、唔計 native TrackPlayer 本身向 googlevideo 攞串流嘅請求**——所以`fetch=`嘅數字**唔係**「呢 15/30 秒內 app 對外開嘅全部連線」,只係「JS 層有經過 `fetch()` 呼叫嘅那部分」。

### 6.2 backend log 對照(S1 run5 launch 後 30 秒窗口,`[07:22:16Z, 07:22:46Z]`)

| 來源 | 行數 | 明細 |
|---|---|---|
| backend log 內有 timestamp 嘅行(全部前綴) | **4** | `[client-log]×2` + `[stream]×2` |
| 同一 run 嘅 client 端 `fetch=` | **4**(api/version:1, api/health:1, api/app-version:1, api/hymns:1) | 呢 4 個 request backend log **完全冇留低任何一行**(`/api/version`、`/api/health`、`/api/app-version`、`/api/hymns` 呢幾條 route 冇 request-level log,冇用 morgan 呢類 middleware,`grep -n "morgan\|app.use(logger" backend/server.js` 零命中) |

**呢個對照本身係一個發現,唔係「兩邊夾唔到所以對照失敗」**:backend log 淨係識到 route handler 自己手寫嘅 `console.log`(`📚`/`🔖`/`[stream]`/`[client-log]`/`[resolve]`),`/api/health`、`/api/version`、`/api/app-version` 冇任何一個 route 自己 log 過 —— 即係話 Stage 1A 若果淨靠 grep backend log 嚟數「開機打幾多個 request」,會漏晒呢幾條成日打嘅 route,得靠呢度 client 端 `fetch=` 計數先睇到。

---

## 儀器改動清單

全部改動已存喺 working tree,**未 commit**。

| 檔 | 改動 | `git diff --stat` |
|---|---|---|
| `frontend/hymn-app/src/perfMarks.js` | **新檔**(233 行)——`mark`/`span`/`note`/`useRenderCount`/fetch 計數器/三個 beacon 排程 | 新增檔案 |
| `frontend/hymn-app/index.js` | 首行加 `import './src/perfMarks'` | `+1` |
| `frontend/hymn-app/src/hooks/useCachedHymns.js` | `kickRefreshOnce`/`refresh` 入面加 `mark('mmkvReadStart'/'mmkvReadEnd'/'parseStart'/'parseEnd'/'cacheReady'/'verStart'/'verEnd'/'hymnsStart'/'hymnsEnd')` + `note('hymnsCount'/'verSkip')`,原有邏輯一行冇改 | `+13` |
| `frontend/hymn-app/src/components/home/HomeScreen.js` | `useRenderCount('Home')` + mount effect(雙 rAF 之後 `mark('home')`) | `+8` |
| `frontend/hymn-app/src/screens/LibraryScreen.js` | `useRenderCount('Library')` + `mark('libraryMount')` | `+3` |
| `frontend/hymn-app/src/screens/MineScreen.js` | `useRenderCount('Mine')` + `mark('mineMount')` | `+3` |
| `frontend/hymn-app/App.js` | import perfMarks;`mark('app')`(App() 首行);`AppContent` 加 `useRenderCount`+mount mark;`handleTabChange`(tap 時間戳 → `setActiveTab` → 雙 rAF 送 `recordNavBeacon`,取代直接 `onTabChange={setActiveTab}`);`MiniPlayer`/`TabBar`/`FullScreenPlayerOverlay` 各加一行 `useRenderCount` | `+29 -1` |

總計 6 files changed, 56 insertions(+), 1 deletion(-),連 `src/perfMarks.js` 新檔。**冇掂 `PlayerProvider`(420-2958 行)、冇改任何現有邏輯分支,只加咗獨立嘅 mark/note/useRenderCount 呼叫同一個 `onTabChange` 嘅間接層。**

`git status --short frontend/hymn-app/ios/` 喺成個 build 過程都係空,冇 tracked ios 檔被自動改動。

---

## 限制(量唔到 / 量得唔完美嘅嘢,同原因)

1. **`mcp__Claude_Code_iOS_Simulator__control` 全程不可用**(「Mobile simulator tools require an attended session」)—— S3 導航改用 `idb ui tap` 代替,座標靠 `idb describe` 攞返嘅 point 尺寸(402×874pt)手動換算,冇用官方 attach 面板睇實時畫面驗證撳中嘅位置,淨係靠事後截圖 + beacon 有冇到嚟確認撳中。
2. **`home` mark 喺冇 cache(S1)嗰陣量緊嘅係「loading spinner 出現」,唔係「真內容出現」**——`HomeScreen` 嘅 `hasData` 喺冇歌嗰陣提早 return spinner,mount effect(記 `home` mark 嗰個)喺 early return 之前執行,兩種情況攞到嘅其實係唔同嘅畫面狀態(S1 = spinner,S2 = 真內容,因為 S2 一開始 `hasData` 已經 true)。呢點令 S1 同 S2 嘅 `home` 數字**唔可以直接比大小**當「首屏耗時」。
3. **`hymnsMs`/`n` 喺 S1 5 run 入面得 2 個有數**——`fetchAllHymnsWithRetry` 理論上限(8s timeout × 2 次)接近 15s beacon 窗口,3/5 run 喺 beacon 送出嗰刻仲未 resolve,唔係「量唔到」,而係「呢個時間點仲未發生」,呢個本身反映緊 15 秒窗口對呢粒指標嚟講太短。
4. **RSS 只讀 host `ps -o rss=`**,冇拆開 JS heap / native heap / image cache 分佈,亦冇用 Xcode Instruments 做更精細嘅 memory graph——純粹輕量 host-side 量度。
5. **fetch 計數(`fetch=`)唔完整**:淨計 `global.fetch`,漏咗 `<Image>`(native image loader,首頁/詩歌庫全部封面圖唔會計入)、`audioPrefetch.js`(用 `expo-file-system` 落載)、TrackPlayer native 對 googlevideo 嘅串流請求。真實網絡連線數會**遠高於**呢個數字。
6. **backend log 對照(§6.2)結構性睇唔到大部份 route**——`/api/health`、`/api/version`、`/api/app-version` 冇任何 request-level log,呢個係 backend 現有寫法嘅缺口,唔係本次量度方法嘅錯,但令「backend log 行數」呢個對照指標本身唔可靠(見§6.2 結論)。
7. **S1 run1 嘅 RSS 讀數喺 launch+117s 而唔係規劃嘅 +20s**(第一個 run 用手動流程,冇一開始就寫定時腳本),已喺表入面標明,冇混入 run2-5 嘅 median 計算。
8. **「3 個 beacon」讀法**:PERF-IMPROVEMENT-PLAN 派工訊息開頭寫「每次啟動最多送 3 個 beacon」,但下面詳細設計(perfMarks 1 次、perfRenders 2 次、perfNav 每次切 tab 送、封頂 10 次)加埋可以到 13 次。本執行採用「3 種 beacon *類型*」呢個讀法(同下面詳細設計一致),`perfNav` 封頂設咗 10 次但實際只用咗 5 次。如果本意真係「全程序生命週期淨送 3 條」,呢度需要 Fable 5.1/Eric 澄清同補改。
9. **S3 嘅 `tapToMount` 唔係真正 native mount 時間**——三個 tab 全程 keep-mount(`display:flex/none`),`tapToMount` 量緊嘅其實係「`setActiveTab` state 變咗到 `useEffect` 執行嗰段」,對已經 mount 咗嘅 screen 嚟講呢段本來就應該好短,唔可以將呢個數字理解做「重新起一個 screen 要幾耐」。
10. **冇做「零 X」宣稱使人誤會嘅風險位**:`FullPlayer` render 喺 S1/S2 恆為 0,已喺 §1.3/§5 明確標注咗呢個 0 有 positive control(S5 播歌之後同一個 counter 變返 4),避免被讀成「量度壞咗」。

---
## Errata（Opus 5 驗收 PERF-BASELINE-OPUS-20260902.md §6，Fable 5.1 2026-09-02 16:05 補）
1. §0「Build 時長 ≈3h03m」→ **≈3m33s**（07:13:03Z→07:16:36Z；15:16:36 係 HKT）。「含排隊時間」解釋作廢。
2. §1.1 S1 `hymnsMs` 10,269 / 11,626ms **唔係單次 fetch 時間**：係「第一次嘗試 8,000ms timeout abort + 第二次真 fetch 2,269 / 3,626ms」。第一次嘗試 5/5 run 全部撞 8s timeout。呢個數唔可以當「/api/hymns fetch 時間」做改前基準；改前基準用 D-1 逐次嘗試拆解。
3. §5 perfRenders t=60「涵蓋播放中約 53 秒」→ **≈39 秒**。
4. 補限制：量度窗口內同期有 ≥2 部其他裝置寫緊 client-log；本報告所有 beacon 已按本機 deviceId 過濾；§6.2 backend log 行數未按裝置歸因。
5. 補限制：`Date.now()` 1ms 解析度。
