# DEEP-AUDIT-1C-IOS-20260906 — iOS 運行時 baseline（09-02 效能工程部署後，經 prod tunnel）

執行者：Sonnet 5。範圍：`DEEP-AUDIT-PLAN-20260906.md` Phase 1C。**唔改 source、未 commit、未部署。**
**執行者唔判 PASS/FAIL/快/慢/冇問題 —— 呢欄留白俾 Opus 5。**

裝置：iPhone 17 模擬器 `E0416618-B662-41D2-A253-5260FA0CF556`（iOS 26.5），全程只開呢一部。
`API_BASE` 全程未改，維持 `frontend/hymn-app/src/config.js` 原文 `https://api.odemusics.com`（production Cloudflare named tunnel，非 loopback）——本報告全部真機量度都經呢條 tunnel 打到同一部 Mac 嘅 `backend/server.js`（localhost:3001，經 `cloudflared` 轉發）。

原始證據全部喺 `ops/perf/audit-20260906/1c-*`（`1c-raw/`、`1c-screens/`、build provenance/log）。

---

## 0. 建置 provenance

| 項目 | 數字/內容 |
|---|---|
| `git rev-parse HEAD` | `75f8f950618373495f74e8e8d7050c2da4581935` |
| xcodebuild 指令 | `xcodebuild -workspace frontend/hymn-app/ios/Odely.xcworkspace -scheme Odely -configuration Release -sdk iphonesimulator -destination platform=iOS Simulator,id=E0416618-B662-41D2-A253-5260FA0CF556 -derivedDataPath <scratchpad>/1c-derivedData build` |
| Build 開始／完成（UTC） | 2026-09-05T16:56:17Z → 2026-09-05T16:59:55Z（**≈3m38s**，全新 `-derivedDataPath`，冇重用任何舊 derivedData——同 1B/2B 一樣快，未撞到「排隊等 CPU」個舊教訓） |
| Exit code | 0（BUILD SUCCEEDED） |
| `main.jsbundle` 大細 | **3,740,962 bytes** |
| 對比 1B baseline（09-02，7a0a96c） | 3,716,119 B → **+24,843 B** |
| 對比 2B AFTER build（09-02，8a2e729） | 3,720,516 B → **+20,446 B** |
| `git status --short frontend/hymn-app/ios/`（build 有冇動過 tracked ios 檔） | 空（冇改動） |
| Patched copy | `<scratchpad>/1c-Odely-patched.app`，`Expo.plist` `EXUpdatesCheckOnLaunch` `ALWAYS`→`NEVER`（`EXUpdatesEnabled` 保持 `true`） |
| 安裝方式 | `xcrun simctl install <udid> 1c-Odely-patched.app`，bundle id `com.hymnapp.praise` |
| 儀器 | `frontend/hymn-app/src/perfMarks.js`（`PERF_MARKS_ENABLED = true`）**已喺 HEAD 上係已落地/已 commit 嘅程式碼**（commit b7eb419 前後累積），唔使本次再加任何 call site——全程冇改一行 source |

**環境備註**：backend catalog 喺量度過程中中途長咗（S1 run1 `n=6531` → run2-5 `n=6543`，S2/S5 全部 `n=6543`），呢個係另一個背景 job（例如夜間自動入庫/複核，見 CLAUDE.md 以外嘅 memory 記錄）喺量度視窗內寫入 DB，**唔係量度方法造成嘅誤差**，但令 S1 run1 同其餘 run 唔可以逐位比大細,只可以睇分佈。

---

## 1. S1 — 冷啟動·無 cache（uninstall → install → launch，5 run）

流程：`simctl terminate` → `simctl uninstall` → `simctl install`(patched .app，`deviceId` 每次重新生成) → 記 host launch 時間戳（`date +%s.%N`，經 `simctl launch` 輸出取 PID）→ 等 30 秒（perfMarks beacon 現時排程 25s，非 1B 嗰陣嘅 15s——2B course-correction 改咗，見 `perfMarks.js` L228）收 beacon。

### 1.1 逐 run 數字（`perfMarks` beacon `detail` 欄，按各自 deviceId 過濾）

| run | deviceId(尾6) | app(ms) | cont(ms) | home(ms) | verMs(ms) | hymnsMs(ms) | att/ok1 | a1t(ttfb) | a1b(body) | a1p(parse) | byt | lyrMs | fetch= |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | b7b3c4 | 163 | 232 | 286 | 907 | 1359 | 1/1 | 549 | 790 | 20 | 2,371,796 | 2537 | 14 |
| 2 | ae759d | 113 | 150 | 206 | 930 | 1389 | 1/1 | 542 | 828 | 19 | 2,376,336 | 2380 | 14 |
| 3 | 2c10cb | 217 | 289 | 339 | 878 | 1189 | 1/1 | 388 | 781 | 20 | 2,376,336 | 1965 | 14 |
| 4 | 280bec | 197 | 277 | 325 | 858 | 1220 | 1/1 | 408 | 792 | 20 | 2,376,336 | 1770 | 15 |
| 5 | 921b86 | 117 | 160 | 212 | 897 | 1256 | 1/1 | 400 | 841 | 15 | 2,376,336 | 1453 | 15 |
| **min/median/max** | — | **113/163/217** | **150/232/289** | **206/286/339** | **858/897/930** | **1189/1256/1389** | **5/5 · 5/5** | **388/408/549** | **781/792/841** | **15/20/20** | — | **1453/1965/2537** | **14/14/15** |

`ok1=1` 全中 5/5（第一次嘗試就攞到全部 hymns，冇觸發 8s timeout retry——呢個係 2B F-1 course-correction 喺 prod tunnel 上嘅首次真機驗證，同 2B 模擬器本機測試嘅結論方向一致）。`byt≈2.37MB`（`lite=1` 版本，已經係 09-02 效能工程「歌庫拆 lite/lyrics」落地後嘅細檔——對比 2B D-1 舊碼未拆分嗰陣嘅 3.66MB,細咗 35%）。`merged=1` 全中(lyrics 背景 fetch 喺 15-30 秒窗口內都完成埋)。

### 1.2 記憶體（host `ps -o rss= -p <pid>`，KB）

| run | launch+3s | launch+20s | launch+30s |
|---|---|---|---|
| 1 | 488592(★見限制#1) | 535968 | 542064 |
| 2 | 408000 | 538992 | 546656 |
| 3 | 405536 | 539776 | 554064 |
| 4 | 405728 | 536544 | 550640 |
| 5 | 409440 | 550528 | 553184 |
| **min/median/max**(全 5 run) | 405536/408000/488592 | 535968/538992/550528 | 542064/550640/554064 |
| **min/median/max**(run1 剔除，見限制#1) | 405536/407864/409440 | 536544/538992/550528 | 546656/550640/554064 |

### 1.3 render 次數（t=15s，`perfRenders` beacon）—— 5 run 全部一致

`Home=8 Library=6 Mine=8 Mini=8 TabBar=8 FullPlayer=0 AppContent=8 PlayerProvider=5`——5 run 數字完全一致(冷開首 15 秒嘅 render 次數對呢個環境嚟講高度可重現)。`FullPlayer` 全部 5 run 皆 0(冇播歌,同 1B 一樣嘅 positive control——見 §5 播歌後變 >0)。呢個場景下 `perfRenders`(15s/60s)、`perfMarks`(25s)三個 beacon 都喺同一個 30s 窗口內收齊,冇 1B 嗰陣「hymnsMs 3/5 run 未完成」嘅問題(見 §1.1,呢次全部 `ok1=1`)。

### 1.4 正控：screenshot 時序（run 1）

`host_launch_ts=1788627655.163235`；由 `perfMarks` beacon 反推 T0(bundle entry)≈`1788627656.509`（即 native 初始化 ≈**1.35s** 先到 JS 開始行,T0 反推法見 §6）。

| 時間(相對 host launch) | 畫面 | 檔 |
|---|---|---|
| +0.26s ~ +0.50s(frame0-1) | 全白 splash,乜都未畫 | `1c-screens/s1-run1-f0.png`/`f1.png` |
| +0.66s(frame2) 起穩定 | 仍然全白(只有狀態列+home indicator,冇 header/content——比 1B 嗰陣「T0+648ms 已見 spinner」更慢見到嘢) | `1c-screens/s1-run1-f2.png`~`f8.png` |
| +3s | **已經係完整內容**(header「odely」+每日金句卡+隨心聽按鈕+語言 chips+歌曲列表+TabBar,全部已渲染,冇 loading spinner 畫面) | `1c-screens/s1-run1-t3s.png` |

**呢個發現同 1B 唔一樣**:1B(09-02 改前)嘅 T0+648ms 已經見到「header+TabBar+loading spinner」,但本次(09-02 改後)+0.66s 仲係全白、要到 +3s 先見到完整內容——並唔代表退步,因為兩次量嘅唔係同一件事:1B 果張圖影嘅係「spinner 出現」,本次冇影到 spinner 出現嘅精確時間點(冇喺 0.7s-3s 之間補幀),`home` mark(286ms)本身已經證明 UI tree 好早就 mount 咗,只係我哋冇截到中間張過渡圖,唔可以講「變慢咗」。

---

## 2. S2 — 熱啟動·有 cache、version 相同（terminate → launch，5 run）

流程：喺 S1 跑完之後,app 已裝、MMKV 已有 6543 首 cache,只做 `simctl terminate` → `simctl launch`。

### 2.1 逐 run 數字

| run | app | cont | mmkvRead | parse | cacheReady | home | verMs | verSkip |
|---|---|---|---|---|---|---|---|---|
| 1 | 112 | 185 | 16 | 18 | 180 | 382 | 1181 | 1 |
| 2 | 146 | 230 | 16 | 19 | 225 | 414 | 912 | 1 |
| 3 | 108 | 181 | 17 | 18 | 176 | 382 | 1180 | 1 |
| 4 | 111 | 185 | 16 | 18 | 180 | 375 | 1198 | 1 |
| 5 | 139 | 218 | 17 | 20 | 212 | 440 | 1240 | 1 |
| **min/median/max** | 108/112/146 | 181/185/230 | 16/16/17 | 18/18/20 | 176/180/225 | 375/382/440 | 912/1180/1240 | 5/5=1 |

`verSkip=1` 全中——version 冇變,`fetchAllHymnsWithRetry` 冇再行(呢個係 S2 嘅定義:同版本 warm 開機)。

### 2.2 perfHome（首頁 section useMemo 耗時 + Library 首次真資料 render，ms，`performance.now()`）

| run | chips | pages | today | recent | lib(Library render) | libIdle |
|---|---|---|---|---|---|---|
| 1 | 2.48 | 3.06 | 15.29 | 5.31 | 197.03 | 849 |
| 2 | 2.45 | 2.98 | 15.20 | 5.28 | 208.86 | 881 |
| 3 | 2.70 | 3.04 | 15.28 | 5.22 | 199.47 | 831 |
| 4 | 2.57 | 3.12 | 15.59 | 5.18 | 209.92 | 842 |
| 5 | 2.91 | 3.35 | 17.32 | 5.44 | 216.53 | 889 |
| **min/median/max** | 2.45/2.57/2.91 | 2.98/3.06/3.35 | 15.20/15.28/17.32 | 5.18/5.28/5.44 | 197.03/208.86/216.53 | 831/849/889 |

四個 `useMemo` 加埋 <30ms(同 2B D-1 嘅 26-27ms 同一數量級,一致)。`lib`(Library 首次真資料 render)197-217ms,同 2B D-1 嘅 174-186ms 同一數量級但略高——呢個差異幅度細過 run-to-run 雜訊,唔可以講「變慢咗」。

### 2.3 記憶體(KB)

| run | launch+3s | launch+20s | launch+30s |
|---|---|---|---|
| 1 | 508928 | 508432 | 508720 |
| 2 | 507728 | 507424 | 507648 |
| 3 | 508272 | 507728 | 508000 |
| 4 | 508368 | 448464(★見限制#5) | 341440(★見限制#5) |
| 5 | 509024 | 508352 | 508656 |
| **min/median/max**(全 5) | 507728/508368/509024 | 448464/507728/508432 | 341440/508000/508720 |

---

## 3. S3 — Tab 導航（Home→詩歌庫→我的→Home→詩歌庫→Home，3 cycle）

**座標校驗**：本次用 `idb ui describe-all` 直接讀 accessibility frame(唔靠截圖手動量度),確認 `首頁`(x=0-134,y=780-828,中心 67,804)、`詩歌庫`(x=134-268,中心 201,804)、`我的`(x=268-402,中心 335,804)——同 1B 手動量出嘅 y≈807 幾乎完全一致,交叉驗證咗 1B 座標法冇錯。

### 3.1 逐 tap 數字（`perfNav` beacon）

| # | tab | tapToMount(ms) | tapToPaint(ms) |
|---|---|---|---|
| 1 | Library | 37 | 59 |
| 2 | Mine | 86 | 115 |
| 3 | Home | 79 | 99 |
| 4 | Library | 87 | 116 |
| 5 | Home | 83 | 98 |
| 6 | Library | 85 | 115 |
| 7 | Mine | 80 | 98 |
| 8 | Home | 80 | 98 |
| 9 | Library | 93 | 116 |
| 10 | Home | 77 | 100 |
| **min/median/max** | — | **37/82/93** | **59/99/116** |

**⚠️只有 10 條 perfNav 到達 backend**——`perfMarks.js` L280 硬 cap `navBeaconsSent >= 10`,本次 3 cycle × 5 tap = 15 次 tap,第 11-15 次(cycle 3 嘅 Mine/Home/Library-2nd/Home-2nd 其中之後幾下)靜靜被丟棄,冇報錯。表入面只列到嘅係頭 10 條,唔係全部 15 次 tap 嘅數。同 1B 嘅 5 次(未撞 cap)唔同,本次因為 cycle 數(3)×tap 數(5)較多先撞到呢個上限——呢個係本次執行單設計(3 cycle)自己撞出嚟嘅儀器上限,並非新發現嘅 bug。

---

## 4. S5 — 播放（首頁「隨心聽」撳播 → 撳「下一首」兩次 → 播足 3 分鐘，1 個連續 session）

流程：`terminate` → `launch`(warm,cache 已有) → +6s 撳「隨心聽」(idb 座標經 accessibility frame 確認:x=20-382,y=337-394,中心 201,365) → +20s 撳「下一首」→ +20s 再撳「下一首」→ +15s 撳「詩歌庫」tab → 等到 launch+180s(3 分鐘)。

### 4.1 `nextTrackMs`(3 首)

| # | origin | source | surface | ms | hymnId |
|---|---|---|---|---|---|
| 1(shuffle 起播) | start | local | shuffle | **190** | 6761 |
| 2(撳下一首) | tapNext | local | — | **42** | 8238 |
| 3(撳下一首) | tapNext | local | — | **41** | 4377 |

**三首全部 `source=local`**——冇一首行到 HLS/progressive streaming 路徑,所以本次 S5 完全冇捕捉到 `hlsStartupKick`/`hlsFallback`/`midStallNudge`/`handleMidStreamStall_giveup`/`PlaybackError` 呢批 beacon(全部 0 條,`grep` 全日 log 淨係搵到較早前其他 session 遺留嘅 android/ios 舊記錄,唔屬於本次 run)。呢個唔係量度失敗——`HomeScreen.js` W3 註解明文設計「隨心聽第一首偏向已經落載咗喺機入面嘅歌」,加上「下一首」喺 shuffle 隊列入面繼續抽,呢部模擬器經之前多輪 S1/S2 已經落載咗好多歌,3/3 中本機命中係預期內嘅結果,唔係隨機幸運。**要覆蓋 HLS 起播路徑,要揀一首確定未落載嘅歌,或者用 1E telemetry(真用戶 7-14 日數據)睇 HLS 相關 beacon 嘅實際觸發率**——呢個係本報告冇做到嘅缺口,已記錄入限制。

⚠️同 §0 一樣,執行單提到嘅「`nativeStall`」呢個 beacon 名喺 `App.js` 搜唔到任何一個實際 call site(淨係喺註解出現過一次,描述現象唔係 event 名)——真正低頻高價值嘅 stall/giveup 訊號係 `handleMidStreamStall_giveup`/`handleBufferingStuck_giveup`/`PlaybackError`,呢幾條都係 `always:true`,本次 S5 冇一條 fire(同上面「3/3 local 冇撞任何 stall」一致)。

### 4.2 `perfRenders`(t=15/t=60,涵蓋播放中嘅窗口)

| t | Home | Library | Mine | Mini | TabBar | FullPlayer | AppContent | PlayerProvider |
|---|---|---|---|---|---|---|---|---|
| 15 | 9 | 6 | 9 | 9 | 9 | **4** | 9 | 9 |
| 60 | 13 | 10 | 13 | 13 | 13 | **8** | 13 | 15 |

`FullPlayer` 由 S1/S2 恆常 0 變成 4→8——內部 positive control:呢個 component 淨係喺 `overlayExpanded=true`(全螢幕播放器開咗)先會 render,本次撳咗「隨心聽」之後全螢幕播放器自動彈出(見 §4.4 截圖),兩個時間點都 >0,方向一致。

### 4.3 記憶體(KB)

| 時點 | RSS |
|---|---|
| launch+6s(播放前) | 512000 |
| 撳「詩歌庫」tab 後(launch+~50s) | 428976 |
| 播 3 分鐘後(launch+180s) | **222224** |

RSS 喺播放期間下跌(512000→222224),同 1B S5(512656→339872)方向一致——本次跌幅更大,但兩次量度環境(catalog 大細、cache 狀態)已經有差異,唔宜直接比大細,只可以講「兩次都觀察到播放中 RSS 下跌」呢個方向一致嘅現象。

### 4.4 撳「隨心聽」後截圖(佐證 FullPlayer 即開)

`1c-screens/s5-after-shuffle-tap.png`——撳咗之後 2 秒,全螢幕播放器已經打開、播放中(0:00/5:05,pause icon 顯示緊即係正在播放),歌名/封面/進度條/隨機-上一首-播放-下一首-循環 五個控制鈕全部已渲染。`1c-screens/s5-after-3min.png` 為 3 分鐘後截圖。

---

## 5. S6 — 弱網（1Mbps/200ms 模擬）

**未做。** 原因:
1. 本 session 冇 passwordless sudo(`sudo -n true` 要求密碼),`dnctl`/`pfctl` 都要 root 先可以寫 pf 規則,非互動 session 冇辦法輸入密碼。
2. 呢部 Mac 未裝 Network Link Conditioner(`/Library/PreferencePanes/` 搜唔到,`find / -iname "*Network Link Conditioner*"` 零命中)。
3. Repo 入面搜唔到任何現成 throttle-proxy 腳本可以借用(`find . -iname "*throttle*"` 零命中——memory 提過嘅「throttle-proxy」工具唔喺呢個 repo/呢個環境入面)。

執行單本身容許「如可用；唔可用就記『未做』」,依此處理。**呢個係本報告最大嘅缺口**——Eric 真機蜂窩網環境嘅代理量度完全冇做到,S1/S5 弱網版本嘅數字要留返俾 1E 真機 telemetry(7-14 日蜂窩網真數據)或者另外搵一部有 root/有 Network Link Conditioner 嘅機先可以補。

---

## 6. Bundle 大細 + Native 冷開段（host launch → T0）

| 項目 | 數字 |
|---|---|
| `main.jsbundle` | 3,740,962 B(見 §0) |
| Native 冷開段(host launch ts → JS bundle entry T0,由 `perfMarks` beacon 25000ms 固定 setTimeout 反推,5 run) | run1 1.346s / run2 1.239s / run3 1.243s / run4 1.239s / run5 1.256s → **min 1.239s / median 1.243s / max 1.346s** |

反推法:`T0_abs ≈ (perfMarks beacon 嘅 clientTs) − 25000ms`,`native段 = T0_abs − host_launch_ts`。呢個係近似值(見限制#4),但 5 run 高度一致(1.24-1.35s,標準差 <50ms),可信度高過單次量度。

---

## 7. 對照表(同 09-02 baseline / 2B AFTER)

| 指標 | 1B baseline(09-02,loopback 模擬器) | 2B AFTER(09-02,loopback,interleaved) | **1C(本報告,prod tunnel,09-02 工程部署後)** | 可比性 |
|---|---|---|---|---|
| main.jsbundle | 3,716,119 B | 3,720,516 B | **3,740,962 B**(+20,446 B) | 可比——純大細,唔受網絡影響 |
| S1 hymnsMs(冷開,首次嘗試) | 10,269-11,626ms(冇`att`/`ok1`儀器,且係 3/5 run 未完成) | median 4,562ms(F-1 AFTER,本機 loopback) | **median 1,256ms**(1,189-1,389ms,5/5`ok1=1`) | **不可直接比**——1B/2B 都係 localhost:3001 loopback,本報告係 prod tunnel;但 hymns payload 本身喺 09-02 已經拆細(lite,2.37MB vs 舊 3.66MB),bytes 分母唔同,唔可以單憑呈現嘅 ms 數講「tunnel 反而快過 loopback」 |
| S1 home mark(冷開) | 235-378ms(median 261) | — | **206-339ms(median 286)** | 同一儀器、同一定義(spinner 出現時間,見 1B 限制#2),可比:同一數量級,方向上冇睇到明顯退步 |
| S2 home mark(warm) | 894-1035ms(median 938) | 856ms(D-1 BEFORE,獨立量) | **375-440ms(median 382)** | **明顯快咗**——但要留意 2B/1B 都係 loopback,本次係 tunnel;呢個差幅(938→382,幾乎減半)已經遠超網絡類型差異可以解釋嘅範圍,較大機會反映緊 09-02 之後其他前端改動(F-3/F-4 等)嘅累積效果,但冇獨立 A/B 隔離,只能講方向 |
| S2 Library render(perfHome `lib`) | — | 174-186ms(D-1) | **197-217ms** | 同一數量級,差異細過 run-to-run 雜訊 |
| S3 tapToMount/tapToPaint | 39-82/61-114ms | 40/72ms(F-4 BEFORE),237/539ms(F-4 AFTER,lazy-mount 代價) | **37-93/59-116ms** | 本次數字close to「F-4 BEFORE」(即 lazy-mount 生效前)嘅範圍,**唔係**F-4 AFTER 嗰個 237/539ms——即係話本次 3 個 tab 好可能冇行到 F-4 嘅 lazy-mount 路徑(可能 Library 已經 keep-mount 咗,或者 F-4 呢項改動喺 HEAD 現狀已經改咗設計),呢點淨係觀察,冇追查 source 去確認原因(超出「唔改 source」範圍嘅只讀審查亦冇做,留返 Phase 1A/1D) |
| S5 nextTrackMs(shuffle 起播) | 205ms(local,shuffle,first=1) | — | **190ms**(local,shuffle,first=1) | 同一儀器同一定義,高度一致 |
| S5 RSS(播放前→3分鐘後) | 512656→339872 | — | **512000→222224** | 方向一致(都跌),絕對值唔可比(見 §4.3) |

---

## 限制(量唔到 / 量得唔完美嘅嘢，同原因)

1. **S1 run1 嘅 RSS+3s(488,592KB)係本報告內唯一嘅高位離群值**——嗰個 run 額外做咗 9 張連續 screenshot(`xcrun simctl io screenshot`)做正控,呢個 host-side I/O 本身可能拉高咗量度嗰刻嘅 memory 快照,run2-5(冇額外 screenshot)嘅 RSS+3s 集中喺 405-409K,差距明顯。已喺 §1.2 表入面獨立列「剔除 run1」嘅 median。
2. **`home` mark 喺冷開(S1)嗰陣量緊「loading spinner 出現」定「真內容出現」冇再驗證**——沿用 1B 限制#2 嘅結論(early return 邏輯冇睇 source 覆核,冇改 source 前提下唔應該去讀 HomeScreen.js 嘅目前邏輯做二次確認,超出「只量度」範圍)。
3. **native 冷開段(host launch→T0)係反推值,唔係直接量度**——用 `perfMarks` beacon 固定 25000ms setTimeout 反推 T0,實際 setTimeout 喺 CPU 忙嘅開機頭幾秒有排程 jitter(通常 <50ms),5 run 標準差細(<50ms)提供咗信心,但呢個唔係 Xcode Instruments 級別嘅精確量度。
4. **S1 screenshot 正控(run1)冇做到「T0+0.7s 到 T0+3s 之間」嘅補幀**——只喺 +0.66s(白畫面)同 +3s(完整內容)兩點各有一張,中間冇畫面可以睇到「spinner 出現」定「內容漸進」呢個過渡係邊種形態,呢個係執行時間預算取捨(密集截圖只喺頭 1.2 秒做,之後改做疏落嘅 3/20/30 秒讀數)。
5. **S2 run4 嘅 RSS+20s/+30s(448,464/341,440KB)明顯低過同批其餘 4 run(~508K)**——冇獨立解釋(冇用 Instruments memory graph 分層),可能係模擬器背景 GC/image cache 清理喺嗰一刻啱啱發生,亦可能係量度雜訊,已如實記錄,唔判斷。
6. **S3 撞到 `navBeaconsSent>=10` 嘅儀器上限**——3 cycle×5 tap=15 次 tap 入面得 10 條到達 backend,cycle 3 尾段幾下 tap 嘅 tapToMount/tapToPaint 數字結構上量唔到(唔係「量壞咗」,係 perfMarks.js 本身嘅設計上限)。
7. **S5 三首歌全部 `source=local`,完全冇覆蓋 HLS/progressive streaming 起播路徑**——`hlsStartupKick`/`hlsFallback`/`midStallNudge`/`*_giveup`/`PlaybackError` 呢批 beacon 本報告全部 0 條,唔係「呢批功能冇問題」,只係「呢次 3 首歌啱啱好都揀咗本機已落載嘅歌」,結構上冇機會觸發。執行單提到嘅事件名「`nativeStall`」喺現有 source 搵唔到任何 call site,只喺 comment 出現過,呢個名唔對應任何實際 beacon。
8. **S6 弱網完全未做**——冇 root/Network Link Conditioner/repo 內冇 throttle 工具,已喺 §5 詳列原因。呢個係本報告最大缺口。
9. **backend catalog 喺量度視窗內中途變大**(`n`:6531→6543,S1 run1 vs run2-5)——另一個背景 job 寫緊 DB,唔係本次方法造成,但令 S1 run1 同其餘 4 run 唔應該逐位比大小,只可以睇群體分佈(已喺 §0 註明)。
10. **同 09-02 baseline(1B/2B)嘅絕對數字對比(§7)大部分「唔可直接比」**——1B/2B 全部經 localhost:3001 loopback,本報告經 production Cloudflare tunnel,兩者網絡路徑本質唔同;同時 09-02 之後 hymns payload 本身結構已變(lite 拆分),bytes 分母都唔同。§7 表入面已經逐項標注邊啲可比、邊啲唔可比,唔可比嗰啲淨係列出嚟做背景參考,唔構成「進步咗/退步咗」嘅判斷依據(留返 Opus 5)。
11. **RSS 只讀 host `ps -o rss=`**,冇 Xcode Instruments memory graph 分層(同 1B 限制#4 一致)。
12. **`Date.now()` 1ms 解析度**(`app`/`cont`/`home`/`verMs`/`hymnsMs` 等沿用 legacy mark 嘅指標受此限制,`perfHome` 嘅 section 計時已改用 `performance.now()` 唔受影響——同 1B errata 一致)。
13. **量度期間(2026-09-05 17:00-17:15Z 左右)backend log 顯示同期仲有其他 deviceId(android `d0346..`、ios `e1b6d..`/`f39fb..`)寫緊 client-log**——全部已按本機專屬 deviceId(每次 uninstall 重新生成)過濾,交叉核對每條 beacon 嘅 deviceId 同對應 run 一致先寫入表格,但呢個仍然係「多 session 共用同一份 log 檔」嘅環境背景,同 09-01 memory 記錄嘅「兩部模擬器污染同一個 client-log」風險一致,已用 deviceId 過濾但值得留意。

---

## 儀器/程式碼改動清單

**冇。** `frontend/hymn-app/src/perfMarks.js` 同全部 call site(`index.js`/`App.js`/`HomeScreen.js`/`useCachedHymns.js`)已喺 HEAD(`75f8f95`)上係已落地嘅程式碼,本次執行冇加/改任何一行 source。`git status --short frontend/hymn-app/` 全程為空。

---

## 收工衛生

`/tmp/claude-ios-cleanup.hold` 已建立喺任務開始、任務完成後已刪除；simulator 已 `shutdown`；`idb`/`idb_companion` 已停；最終確認 `booted:0 idb:0 sim:0 devtools:0`（見任務結尾指令輸出）。

---
## Errata（Opus 5 驗收 DEEP-AUDIT-1C-OPUS-20260906.md，Fable 5.1 補 2026-09-06 01:36）
1. S1 run1 `byt` 抄錯（隔籬 session 數）→ 應為 **2,376,336**；五個 run 全部 `n=6543`，「catalog 中途變大」限制作廢，S1 五 run 可逐位比。
2. 「剔除 run1」RSS median 三個數應為 **406,864 / 539,384 / 551,912**（同一行唔准混用兩種 median 定義）。
3. native 段 1.239–1.346s 係上界（clientTs 喺 resolveDeviceId 之後取）；warm native ≈ 1.215s ⇒ **native 段同 cache 無關；冷/熱到 home mark 都 ~1.6s，82% 係 pre-JS**。
4. 可比項補返：S2 home 382ms vs 2B F-3 AFTER 376ms（同儀器同機 verSkip=1）= 零 regression；S3 tapToPaint 低係因 libIdle≈849ms 令 Library 已 mount。
5. `[access]` 交叉核：a1t − server_ms = 386–407ms（tunnel 固定開銷）；1.2–1.4s 內 backend 0.2% / parse 1.5% / **網絡 94%（432 KB/s）**；CF `cf-cache-status: DYNAMIC`（有 ETag 未用）。
6. 「nativeStall event 唔存在」係錯：由 native Swift（AudioPlayer.swift:824）發，14 日 816 條。
7. S5 全部 source=local 只覆蓋真機 7% 路徑（1E：stream:local = 87:7，stream p90 9.55s）→ **串流起播路徑零基準**，要清 prefetch cache 再量。
8. §1.4 同 1B 嘅 648ms/0.66s 對照係跨時鐘（T0 vs host），應剷。
