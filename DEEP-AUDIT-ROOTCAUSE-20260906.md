# Phase 2 根源分類 + 修復波次計劃 — 2026-09-06

負責：Opus 5。輸入：`DEEP-AUDIT-1A-FRONTEND-20260906.md`（66 條）、`DEEP-AUDIT-1D-BACKEND-20260906.md`（~25 條）、
`DEEP-AUDIT-1E-TELEMETRY-20260906.md`（真機數據）、`DEEP-AUDIT-1C-IOS-20260906.md`（iOS 運行時 baseline）。
基準 HEAD `75f8f95`。09-02 效能工程（`PERF-FINAL-REPORT-20260902.md`）已部署，本文全部「改前」以**部署後**為準，唔重複嗰輪已做嘅嘢。

**本 session 冇改任何 source、冇 commit、冇 restart、冇部署。** 除本文件外零檔案改動。

Eric 原話：「唔要頭痛醫頭腳痛醫腳」。所以本文嘅組織原則係：**一個根源 = 一個 cluster = 一波**，而唔係一個檔案一波、一條 finding 一個 ticket。

---

## 0. 我自己核實嘅嘢（對前置報告嘅更正 / 新證據）

呢節係本次新做嘅覆核，唔係轉述。以下五項改變咗分類結論：

| # | 事實 | 出處（我實跑） | 對分類嘅影響 |
|---|---|---|---|
| **V-1** | `backend/public/app-version.json` 現值 `hlsEnabled: true`，但 `hlsDeviceIds: ["e1b6dc8a6948c3018036565007ad87d4"]`（= 1E 認證嘅 Eric 真機）。`server.js:325` 用 `computeEffectiveHlsEnabled(manifest, req.query.d)` 逐機覆寫 | `cat backend/public/app-version.json`、`sed -n 305,330p backend/server.js`、`App.js:4164` | **1A INF-004「HLS 樹係死碼候選」判定推翻**——HLS 樹係**現役單機 staged rollout**，一個字都唔准當死碼刪。改列做「政策待決」，見 §2 拍板 D-2 |
| **V-2** | native stall watchdog 嘅 beacon **寫死 `https://api.god-music.com/api/client-log`**（舊域），而 `src/config.js` 嘅 `API_BASE` 係 `https://api.odemusics.com` | `grep -n "client-log" ios/Podfile`（SWStallWatchdog.beacon()） | 1E 只講「nativeStall 冇 platform/deviceId」，漏咗呢個。舊域今日仲答（server.js 雙域 host middleware），但**舊域一收，20 次 breakerTripped 呢類最痛嘅訊號會靜靜消失，冇任何告警**。列入 C1，屬 native build 波 |
| **V-3** | `frontend/hymn-app/android/app/build.gradle:100-115`：`debug` 同 `release` 兩個 buildType 嘅 `signingConfig` **同樣指向 `signingConfigs.debug`**（`storeFile file('debug.keystore')`） | `grep -n "signingConfig\|storeFile" android/app/build.gradle` | 佐證 memory「release APK 用 debug keystore 簽」。同時 `eas.json` **完全冇 android build profile**（只有 ios），即官方 APK 唔經 EAS、純本機 gradle 出。列入 C11，屬 Eric 拍板（換 keystore = 換 app 身份） |
| **V-4** | `@expo/config-plugins` 俾 `plugins/withSwiftAudioExStallFix.js:19` 同 `withSwiftAudioExStallWatchdog.js:39` `require()`，但**唔喺 `dependencies` 亦唔喺 `devDependencies`**（靠 expo 嘅傳遞依賴）。caret 依賴唔止 RNTP 一個：`@gorhom/bottom-sheet ^5.2.14`、`react-native-draggable-flatlist ^4.0.3`、`react-native-gesture-handler ^2.31.2`、`react-native-mmkv ^3.3.3`、`react-native-track-player ^4.1.2` | `python3 -c` 讀 package.json + `grep config-plugins plugins/*.js` | 1A §1 統計表提過 `DEP-002`/`DEP-004` 但**正文從來冇逐條列出**（連同 1A 自認漏讀 `eas.json`，屬 1A 交付缺口）。我用實證補返，令 C11 有完整證據 |
| **V-5** | `ops-metrics.json` 硬數：`youtube:player_client=tv` 策略 **tries=1087 / ok=0 / fail=1087 / msSum=40,806,109ms**（平均 37.5s/次）；`default-any` **tries=1079 / ok=59**（平均 38.3s/次）；`resolveAudio.js:228` 確認係**串行** fallback（`RESOLVE_PARALLEL` 預設 off） | `python3` dump `backend/logs/metrics/ops-metrics.json` + `awk` 讀 resolve loop | 呢個唔係「一條 P3 dead strategy」，而係**backend 失敗路徑結構上要 76+ 秒，而 client 任何死線都係 10-20 秒級**——直接解釋 memory 記錄嘅「404 要 86 秒先拋 PlaybackError 但 giveup 7 秒就跳」。升做獨立 cluster C9 |

另記一個**方法論陷阱**（會影響波次排序）：`PERF_MARKS_ENABLED = true` 現時**係出街值**（`src/perfMarks.js:27`），而 `/api/client-log` **零節流 + 每 request 同步 `mkdirSync`+`chmodSync`+`statSync`+`appendFileSync`**（1D CLOG-1）。即係話「加多啲儀器」同「收貨端未加固」係互相放大嘅——所以 CLOG-1 唔可以排喺第二波，要同儀器波一齊落（見 W1）。

---

## 1. 根源 cluster 表

### 1.0 總覽

| ID | Cluster | 根源一句 | 平台 | 嚴重度 | 1E 真機支持 | 波次 |
|---|---|---|---|---|---|---|
| **C1** | 遙測儀器碎片化 | 四套獨立 beacon 實作各自演化，只有兩套帶 platform/deviceId，收貨端零節流 | both | **P1** | ✅ 直接（1E 全份報告嘅限制都源自呢度） | W1 + W8(native) |
| **C2** | async 生命週期無統一機制 | 冇 `useIsMounted()`/generation-token 嘅共用抽象，逐個 handler 各自決定加唔加護欄 | both | **P1** | ⚠️ 間接 | W5 |
| **C3** | fetch 層三分裂 → 401 無人管、錯誤狀態無規格 | 冇單一 `fetchJson()`，三套 helper 錯誤形狀唔同，冇一個位可以掛 401 攔截 | both | **P1** | ⚠️ 間接 | W4 |
| **C4** | 衍生值/Provider value 冇 memo | 「render 期間即場計」係預設寫法，memo 係例外 | both | P2 | ✅ 有 before 數（1C S2/S3） | W6 |
| **C5** | UI 原子件重複實作 | 冇共用 presentational 層，Cover ×6 / Heart ×3 各自演化 | both | P2 | ➖ | W6 |
| **C6** | 公開寫入面 × 節流靠手抄 | 節流係逐條 route 抄過去，抄漏就冇 | both（backend） | **P1** | ✅ 部分（access log） | W1(CLOG) + W2 |
| **C7** | 「修過一次冇推廣」嘅無上限增長 | bufferCache 加咗 LRU，姊妹結構（三個 Map、12 個 log、outbox、lyricsMapStore）一個都冇跟 | both | P2 | ✅ 部分（cacheSize 672→1252） | W3 |
| **C8** | 子進程／跨進程共享狀態冇協議 | `exec` 經 shell 殺唔到真 pid；三個 cache 檔無鎖全檔覆寫 | backend | **P1** | ⚠️ 間接 | W3 |
| **C9** | resolve 失敗路徑 76 秒 vs client 死線 10-20 秒 | 串行三策略從未按實測收割，`tv` 策略 0/1087 仍然每次白蝕 37.5 秒 | both（用戶可見） | **P1** | ✅ **最硬**（ops-metrics 累計） | W2 |
| **C10** | 死碼／做咗未接線 | 刪嘢刪剩 + 設計咗嘅成功態從來冇駁上去 | both | P2 | ➖ | W7 |
| **C11** | 依賴／建置／部署治理不一致 | 版本鎖定政策、簽名、部署 guard 三樣都係「個別做過，冇統一」 | both | P2 | ➖ | W8 |
| **C12** | Android 專項 | 三件事各自獨立：①詩歌庫畫面 mount 一次 +170MB／+2,576 View（native heap 唔還）②外來權限對話框凍住全部 JS timer（beacon 遲到冇痕跡）③FGS/通知/manifest 全部合規、Android OTA 一直有落地（推翻「Android 零遙測＝OTA 冇到」嘅假設） | Android | **P2**（②降到 P3-user / P2-儀器） | ✅ 首次有 Android 真數（1B + Opus 重量） | W9（②嘅儀器部分併入 W1） |
| **C13** | 孤立正確性缺陷（**刻意唔當根源**） | 冇共同根源，純粹係七條各自獨立嘅細 bug | both | P2/P3 | ➖ | W7 |

**13 個 cluster，9 波**（W9 喺 2026-09-06 收到 1B 之後定咗範圍，見 §6）。

---

### C1 — 遙測儀器碎片化 【P1，第一波】

**根源一句**：呢個 codebase 有**四套**互不相干嘅 client-log 送信實作，各自喺唔同時間長出嚟，冇一套係另外三套嘅來源；收貨端（`/api/client-log`）又係全 codebase 唯一一條零節流嘅公開寫入 route。

**四套實作（我逐個核實）**：

| # | 位置 | 帶 platform | 帶 deviceId | 打邊個域 | 受 DIAG_ENABLED 閘 | 涉及 event |
|---|---|---|---|---|---|---|
| 1 | `App.js:275 logDiag()` | ✅ | ✅ | `API_BASE`（新域） | ✅（`always:true` 例外） | nextTrackMs、hlsStartupKick、nativeSkipAttributed、midStallNudge、*_giveup、PlaybackError、hlsFallback |
| 2 | `src/perfMarks.js:153` | ✅ | ✅ | `API_BASE` | 獨立 `PERF_MARKS_ENABLED` | perfMarks / perfHome / perfNav / perfRenders |
| 3 | `src/track-player-service.js:9` | ❌ | ❌ | `API_BASE` | ❌ **無條件送** | RemoteDuck |
| 4 | `src/audioPrefetch.js:181` | ❌ | ❌ | `API_BASE` | ❌ | prefetchFail |
| 5 | `ios/Podfile` SWStallWatchdog.beacon() | ❌ | ❌ | **`api.god-music.com` 寫死（舊域，V-2）** | ❌ | nativeStall（8 個 phase，含 breakerTripped） |

**包含 finding**：1E §2.3 / §4.1 / §4.4 / §6-2（三種 event 冇 platform/deviceId）、1E §1（44 個測試 deviceId 要人手剔）、1E §3.2（A-6 前後對比結構性做唔到）、1C 限制#6（`perfMarks.js:280` `navBeaconsSent >= 10` 硬 cap，15 次 tap 靜靜丟 5 次）、1C 限制#13（多 session 共寫同一份 log）、1D **CLOG-1**（P1，零節流 + 同步 fs I/O）、1D **DEAD-2**（`[deprecated-route]` 只 `console.log`，`/tmp` 會俾 macOS 清，刪檔證據不可驗）、1A INF-010（userSync 未知 op 靜默 drop，建議加 beacon）、1A INF-002（prefetch `MIN_BYTES` 拒收同錯誤頁 log 上分唔開）、V-2。

**用戶可見症狀**：直接冇。**但**呢個 cluster 唔修，之後每一波嘅「可量測改善」都係假嘅——尤其 1E 已經證實 `nativeStall breakerTripped` 14 日內 **20 次**（= 用戶聽歌途中被熔斷 pause 20 次）呢個最痛嘅訊號，**結構上唔知集中喺幾多部機**。

**證據強度**：最高。1E 成份報告嘅 §6「已知限制」四條入面有三條係呢個 cluster 造成。

**修法（一次過根治，唔逐條補）**：
1. 抽一個 `src/clientLog.js`：單一 `sendClientLog(event, fields, opts)`，強制注入 `platform` / `deviceId` / `appVersion` / `updateId`（expo-updates `Updates.updateId`——令 OTA 前後可以按 updateId 切數，直接解 1E §3.2 嘅「冇 before」）/ `sessionId`（每次冷開一個 uuid，令「同一次開機」嘅 event 可以歸組）。實作 1/3/4 全部改成呼叫佢；perfMarks（實作 2）維持自己嘅排程但共用同一個送信函式。
2. `navBeaconsSent` 硬 cap 由 10 提到可配置（建議 40）；cap 撞到要出一條 `navBeaconCapped` beacon，唔准靜靜丟。
3. backend `routes/clientLog.js` 白名單加 `appVersion`/`updateId`/`sessionId`；`lib/clientLogStore.js` 嘅 `mkdirSync`/`chmodSync` 搬去 module load 一次過；`appendFileSync` → 批量 async writer（CLOG-1 (2)(3)）。
4. `/api/client-log` 加 per-IP sweep-on-threshold 節流（抄 `invites.js` 嗰個已核實範本）（CLOG-1 (1)）。
5. `opsMetrics` 加持久 `deprecatedRouteHits` counter（DEAD-2）——刪 410 stub 之前要有呢個。
6. `userSync.js` 未知 op drop 加一條 beacon（INF-010）。
7. **native 部分（要 iOS build，排 W8）**：SWStallWatchdog.beacon() 加 platform/deviceId、domain 由寫死改成同 `API_BASE` 對齊（V-2）。
8. **剔除規則 code 化**：1E 用嘅「44 個測試 deviceId」剔除法係人手判斷。寫成 `ops/perf/classify-devices.mjs` 可重跑腳本，否則 after 再做一次會用另一把尺（呢個係 memory「衍生數字要第二個人重算」嘅同一課）。

**量度指標**：
- before（已有）：1E §7 全表；`[access]` `POST /api/client-log` 現時冇單獨列（1E §5 表無此行 = 觀察窗內零 client-log request 落 access log，要核）。
- after（要新加）：`clientLogStore` 寫入耗時 p50/p90（本機 harness 1000 次 append，唔准喺 prod 洗版）；帶齊 platform/deviceId 嘅 row 佔比由 **37%（970/2649）→ 目標 100%**；`nativeStall` 帶 deviceId 佔比 0% → 100%（W8 後）。

**風險／紅線**：
- 🔴 **唔准喺呢一波順手改 PlayerProvider 起播/stall/watchdog 邏輯**——只加欄位、只換送信函式，一個 threshold 都唔准郁。
- 🔴 native beacon 改動 = 改 `ios/Podfile` 嘅 patch payload。1A PLG-002 已警告：冪等閘用固定字串 `'SWStallWatchdog'`，**改 payload 唔改閘名 + 舊 Pods 目錄會靜靜出舊 Swift**。改 payload 一定要同時改閘名。
- ⚠️ 加咗 sessionId/updateId 令每條 beacon 大咗；`perfMarks` detail 已經因為截斷問題由 300 改到 400（b7eb419），要重核唔好再截尾。

---

### C2 — async 生命週期無統一機制 【P1】

**根源一句**：專案冇一個「async handler 完成時點算」嘅共用抽象，所以有啲 handler 加咗 seq guard、有啲加咗 mounted guard、大部分乜都冇——連同一個檔案內部都唔一致。

**包含 finding**：SCR-001（P1，AddFriendSheet `handleRequest`/`handleRedeem` 冇護欄，同檔 `handleLookup` 有）、SCR-002、SCR-003（AdminAddHymnScreen 真 unmount 三個 handler）、SCR-007（AuthScreen）、SCR-017（PhoneLoginScreen 六個 handler 全冇）、SCR-018（分享中返回掣未鎖）、AUTH-003（login/loginPhone/registerPhone/resetPassword/logout 全冇 in-flight guard，後 resolve 者贏）、AUTH-004（restore token 期間 guest op 入隊）、CACHE-001（lite→lyrics merge 冚走 admin 改歌嘅 fresh setState）、PL-001（`setStalePlaylistHandler` 冇反註冊）。**10 條**。

**用戶可見症狀**：sheet 喺唔應該關嘅時候關咗；下次開 sheet 見到上次嘅舊錯誤；登入途中撳 × 之後彈一個屬於上一個畫面嘅 Alert；admin 改咗歌之後 8-15 秒後被舊 merge 冚返轉頭（CACHE-001 —— 呢條係唯一一條會令**用戶睇到已經改咗嘅資料變返舊**嘅）。

**證據強度**：1E 冇對應 event（呢類 bug 冇儀器）。⚠️ 屬「靜態證據強、真機證據零」——所以驗收唔可以靠 telemetry，要靠 harness 正控。

**修法**：
1. 一個 `src/hooks/useAsyncLifecycle.js`，export 兩件嘢：`useIsMounted()`（return 一個 ref-based getter）同 `useSeqGuard()`（generation counter，`begin()` 回一個 `isCurrent()`）。
2. 逐檔鋪：AddFriendSheet（3 handler）、AdminAddHymnScreen（3）、AuthScreen（1）、PhoneLoginScreen（6）、PlaylistDetailSheet（1）、AuthContext（5）、PlaylistsContext（cleanup）、useCachedHymns（refresh generation token）。
3. 驗收唔准淨係「讀返段 code」——用 memory 記低嗰招：**babel 轉真 module + hook shim render**，每個 guard 要有**負控**（拆走 guard 就要重現舊行為）。冇負控嘅 guard 一律當未驗。

**量度指標**：冇秒數指標。用 harness 通過率（每檔一個正控一個負控）+ 1C S3 導航 render 次數唔准倒退。

**風險／紅線**：🔴 `useCachedHymns.js` 嘅 generation token 會掂到冷開 lite→lyrics 分階段載入，呢條路徑係 09-02 A-6 嘅核心成果（開機 wire bytes −74.8%）。改動要有「lite 先畫 / lyrics 背景補 / merged=1」三個 mark 嘅前後對照（1C S1 已有 before：`merged=1` 5/5、`lyrMs` 1453-2537ms）。

---

### C3 — fetch 層三分裂 → 401 無人管、錯誤狀態無規格 【P1】

**根源一句**：三套 fetch-or-throw helper 各自演化（`api.js` 入面兩套逐字相同 + `services/homeApi.js` 第三套連錯誤形狀都唔同），所以「收到 401 就登出」冇一個位可以掛，而每個 catch 塊各自決定錯誤點顯示。

**包含 finding**：AUTH-001（P1，AuthContext 全檔無 401/token 失效處理，`grep 401|expired|clearAuth|logout` 零自動觸發路徑）、INF-001（`adminJson`/`meJson` 逐字相同）、INF-011（homeApi 第三套，錯誤無 `.code`）、SCR-004 / SCR-008 / SCR-012 / SCR-013（四個「fetch 失敗 → 同『本來就冇資料』一模一樣嘅空狀態」）、SCR-005（**反向**：手動刷新失敗令全屏「讀取失敗」冚走仲喺畫面嘅舊資料）、HOME-001（動態 import 外層 promise 無 catch）、APP-004（`runLoginSync` 只有 try/finally 無 catch，異常變 unhandled rejection 零痕跡）。**10 條**。

**用戶可見症狀**：token 過期／被 revoke 之後 app 仍然顯示已登入，但所有同步靜靜失敗（**呢個係最嚴重嗰個**）；網絡差嗰陣「好友」「已下架」「邀請碼」三個列表變空，用戶以為自己冇嘢；反過來 admin 在線頁一 refresh 失敗就成頁變錯誤畫面。

**證據強度**：1E 冇 401 相關 event（因為冇人 log）。1E §5 access 表見到 `/api/admin/presence` 有 **401×1**——即係 401 真係會發生，只係前端當佢係普通錯誤。

**修法**：
1. `src/api/fetchJson.js` 單一實作：統一錯誤形狀 `{ status, code, message, body }`；`api.js` 兩套 + `homeApi.js` 一套全部改成薄 wrapper。
2. 401 攔截**擺喺 `fetchJson` 入面**（唔係擺喺 `api.js`，否則覆蓋唔到 homeApi——1A §6.4 已經指出呢點）：收到 401 → 呼叫一個由 AuthContext 註冊嘅 `onUnauthorized()`。
3. 錯誤狀態統一規格：**`err && !data` 先全屏錯誤；有 data 就保留舊資料 + 頂部提示條**。五個 catch 塊（SCR-004/005/008/012/013）全部套呢條規格。
4. `runLoginSync` 加 catch + beacon。

**量度指標**：before 冇數字（呢個 cluster 係正確性唔係效能）。after：harness 用一個 401 mock server 驗五條 authed 路徑全部觸發 `onUnauthorized`（正控）+ 一條 200 路徑唔觸發（負控）；client-log 加 `authExpired` event 睇真機有冇 fire。

**風險／紅線**：🔴 401 之後嘅 UX **要 Eric 拍板**（見 §2 D-1）——「即刻踢返去登入頁」對一個正喺度聽歌嘅用戶好粗暴。工程上先做「攔截 + 記 beacon + 標記 token 失效」，UI 行為留一個 flag 等拍板。

---

### C4 — 衍生值 / Provider value 冇 memo 【P2】

**根源一句**：呢個 codebase 嘅預設寫法係「render 期間即場計」，`useMemo` 係例外唔係常規——所以邊個檔案有邊個檔案冇，純粹睇當時邊個寫。

**包含 finding**：AUTH-002（AuthContext value 每 render 新 object，16 個檔用緊 `useAuth()`；同 repo 內 Favorites/Playlists 兩個 Context **已經有** useMemo——即係範本存在但冇推廣）、ADD2PL-001、ADMIN-001（同一款 Provider value）、APP-002（`(player.hymns||[]).find()` 對 6,000+ 首全庫每 render 行一次）、SCR-010（org chip FlatList data 每 render 新 array）、SCR-011（LibraryScreen queryInput 每鍵 re-render 成個 screen + renderItem inline 新閉包 × 6,000 首）、SCR-014（好友列表三個 map 展平）、SCR-006（onClose inline arrow 令 gesture useMemo 每 render 重建）、HOME-002（~38 個 Heart 各自訂閱 FavoritesContext 未 memo）、APP-001（第三套獨立 2 秒無條件輪詢 `getPlaybackState()`，同時已有 PlaybackState listener + 主 poll 嘅 idle backoff）。**10 條**。

**用戶可見症狀**：詩歌庫打字有黏滯感；撳一個心心令成頁 38 個心心一齊 re-render；播放期間背景不必要嘅 CPU（APP-001 每 2 秒一次無條件 native 過橋）。

**證據強度**：✅ **有 before 數字**——1C S2 `lib`（Library 首次真資料 render）197-217ms、S3 `tapToPaint` 59-116ms、S1/S2 `perfRenders`（15s）`Home=8 Library=6 Mine=8 Mini=8 TabBar=8 AppContent=8 PlayerProvider=5`，**5 run 完全一致**（呢個高重現性令佢係本次最好用嘅 after 指標）。1E 真機 `perfRenders` `Library` 有一次 25→29（其餘 3-10），標咗做觀察點。

**修法**：AuthContext / AddToPlaylistSheet / AdminEditHymnSheet 三個 Provider value 加 `useMemo`；LibraryScreen / MineScreen 嘅 FlatList `data` + `renderItem` 加 `useMemo`/`useCallback` + row `React.memo`；`player.hymns` 起一份 `id → hymn` 嘅 Map（一次過解 APP-002 同其他所有查表）；Heart/Cover 喺 C5 抽走之後喺共用組件度做一次 `React.memo`（一次過收 HOME-002 + SCR-020）。

**量度指標**：1C 同一儀器重跑 S2/S3 + `perfRenders`。**必須交錯量**（memory：prod 秒數同時段浮動 55-106%），A/B 各 5 run 交錯。同時要 uninstall + `get_app_container` 核 bytes（memory：同 bundle id `simctl install` 唔會真換二進制）。

**風險／紅線**：
- 🔴 **APP-001（刪第三套 poll）唔准喺呢一波做**。佢喺 `App.js:2388-2409`，同 `TPEvent.PlaybackState` listener（944）同 `sleepPollInterval()`（2066）三套並存。雖然佢表面上唔屬「起播/stall/watchdog」，但佢**餵緊 player state**，而 09-02 之前有太多「睇落無關嘅 poll 其實係某個 rescue 嘅隱性依賴」嘅前科。要刪就要獨立一張執行單 + 明確論證邊個 consumer 讀緊佢 + Fable 5.1 批。**本計劃將佢由 W6 抽出，改列做 §2 拍板 D-7。**
- ⚠️ `React.memo` 加喺 row 上要小心 `player.currentId` 呢類「全 list 一齊變」嘅 prop，否則 memo 白做。

---

### C5 — UI 原子件重複實作 【P2】

**根源一句**：冇共用 presentational 層，所以同一個「封面 fallback」邏輯抄咗 6 份、「心心」3 份，各自獨立演化。

**包含 finding**：SCR-019（Cover ×6：AdminAddHymnScreen:51-62、HymnListScreen:35-54、LibraryScreen:71-85、MineScreen:29-42、PlaylistDetailSheet:25-38、SharedPlaylistSheet:20-33）、SCR-020（Heart ×2）+ HOME-002（第三個 Heart）、SCR-015（rename/delete Alert 兩套，Android 三掣上限只註喺其中一份）、APP-005（`formatLyrics`/`formatLyricsStanzas` 各自 split）、HEARTBEAT-001（evaluate/ensureInterval 喺兩個 effect 各寫一次）。**6 條**。

**用戶可見症狀**：今日冇；風險係「改一邊唔改另一邊」——SCR-015 已經係現成例子（Android Alert 三掣上限嘅知識只存喺其中一份）。

**證據強度**：➖（純結構）。

**修法**：抽 `src/components/HymnCover.js`、`src/components/HymnHeart.js`（內置 `React.memo`，一次過收 HOME-002 嘅 perf）、`src/utils/playlistActions.js`（Alert helper）、`src/utils/lyricsText.js`（`splitLyricLines`）。

**量度指標**：淨減行數（before：6+3+2 份重複實作）；1C S2 `lib` render 唔准倒退。

**風險**：⚠️ 六個 Cover 睇落一樣但可能有微細差異（尺寸、fallback 次序）。抽之前要逐個 diff，唔准「睇落一樣就當一樣」。

---

### C6 — 公開寫入面 × 節流靠手抄 【P1】

**根源一句**：`invites.js`/`share.js` 有一個**寫得啱**嘅 per-IP sweep-on-threshold 節流範本，但佢係手抄擴散嘅——抄漏咗嘅 route 就完全冇節流。

**包含 finding**：**CLOG-1**（P1，`/api/client-log` 全 codebase 唯一零節流公開寫入 route——已移去 W1）、**OTP-1**（P1，`/otp/verify` + `/otp/verify-ticket` 完全冇本地 attempt 節流，4-8 位數字驗證碼淨靠 Twilio 自己嗰個未知配置）、LOGIN-P2（`clientIp()` 信 `x-forwarded-for` 但 `grep "trust proxy"` = 0 hit，即任何人自報 IP 就繞到限速；`otpAuth.js` 嘅 `perIp` Map 連 lazy expiry 都冇）、SRV-2（`app.use(cors())` 無 allowlist）、SRV-5（`GET /api/internal/activity` 無 auth）、ADM-1/FRIENDS-1/ME-1（三個 per-user Map 冇 eviction，寫法同已有範本唔一致）。

**用戶可見症狀**：今日冇（未撞過）。但 OTP-1 係一條**可以爆帳戶**嘅路：4-8 位碼 + backend 零鎖死。

**證據強度**：1E §5 access 表：觀察窗（9 小時）內冇任何濫用跡象——即係「未爆」唔係「唔會爆」。

**修法**：
1. 抽 `backend/lib/rateLimit.js`：一個 `makeLimiter({ keyOf, max, windowMs, sweepAt })`，內置 sweep-on-threshold + bounded。**六個現存節流全部改用佢**（invites/share/login/otp-request/presence/stream），呢樣本身唔改行為，只係令之後加嘅 route 冇得抄漏。
2. `/otp/verify` + `/otp/verify-ticket` 掛上去（建議 10 分鐘 5 次錯，錯滿鎖 phone）。
3. `app.set('trust proxy', 1)` + `clientIp()` 只喺確定經 CF 嘅路先信 `x-forwarded-for`。
4. `cors()` 改 allowlist（RN app 根本唔需要 CORS header）。
5. `/api/internal/activity` 加 localhost-only（⚠️ 要先核夜晚 script 係咪由同一部機 loopback 打——見 §2 拍板 D-8）。

**量度指標**：before：`[access]` 現有 p50/p90（1E §5 表）。after：同一表重量，加一個 harness「同一 IP 連打 20 次 `/otp/verify`」要見 429（正控）+「20 個唔同 IP 各打 1 次」唔准 429（負控）；`app.set('trust proxy')` 之後用假 `X-Forwarded-For` 打 20 次登入，429 要仍然生效（呢個係 LOGIN-P2 嘅正控）。

**風險／紅線**：
- 🔴 抽共用 limiter = 掂到登入/OTP 路徑。**唔准喺同一個 commit 又抽 helper 又改 threshold**。第一步純機械抽取（threshold 一個數字都唔准變，用 harness 證前後行為一致），第二步先加新 route。
- 🔴 `trust proxy` 設錯會令**所有** IP 節流失效（全部變成 CF 嘅 IP 或者變成 client 自報）。要有明確正控。
- ⚠️ cors allowlist 收窄要核 `/p/:token` 分享頁（有 SSR web 頁）唔會撻。

---

### C7 — 「修過一次冇推廣」嘅無上限增長 【P2】

**根源一句**：`bufferCache` 因為出過事故所以加咗 `MAX_BUFFER_ENTRIES=40` + `128MB` LRU，但**同一份修法冇搬去任何一個姊妹結構**。

**包含 finding**：RESOLVE-P2b（`cache`/`failCache` 兩個 Map 完全冇上限；實測 `cacheSize.last=672`、`max=1252`）、HLS-1（`playlistCache` 冇 eviction，而**同一個檔案入面** `recentHeadFetchFail` 有 `size>200` sweep——抄漏得最明顯嘅一個）、RESOLVE-P2a 嘅記憶體面、otpAuth `perIp`、ADM/FRIENDS/ME 三個 Map（同 C6 重疊，喺 C6 一齊修）、**F6**（12 個 `/tmp/hymn_*.log` 完全冇 rotation，而 `clientLogStore.js` **已經有** `RETENTION_DAYS=14` + `MAX_FILE_BYTES=50MB` 嘅完整實作）、INF-009（`userSync.collapse()` 只合併連續 `pl_upsert`，`fav_add`/`fav_remove` 唔合併 → 離線 outbox 無上限）、CACHE-002（`Object.assign(lyricsMapStore, ...)` 只加唔刪 → backend 清咗歌詞嘅歌喺 process 生命週期內仍顯示舊詞）。

**用戶可見症狀**：CACHE-002 會令用戶睇到**已經刪咗嘅歌詞**；INF-009 會令長期離線嘅用戶一上線 flush 幾百條逐條打。其餘係 server 側慢性。

**證據強度**：✅ 部分。`cacheSize` 已有 metric（672/1252）。⚠️ **RSS 曲線唔可以用嚟證有冇洩漏**——1E §5 明講：呢 96 小時 backend restart 太頻密（工程期常態），RSS 每次歸零，睇唔到跨 restart 趨勢。所以呢個 cluster 嘅 before/after **唔准用 RSS**，要用 `.size` counter。

**修法**：
1. `backend/lib/boundedMap.js`：一個 `BoundedMap(max, { onEvict })`，`resolveAudio.cache`/`failCache`、`hls.playlistCache`、`otpAuth.perIp` 全部換佢。
2. `opsMetrics` 加 `resolveCacheSize` / `failCacheSize` / `playlistCacheSize` 三個 gauge（否則 after 量唔到）。
3. `/tmp/hymn_*.log`：加一個輕量 size-based truncate（或者統一搬去 `clientLogStore.js` 同款按日 rotation）。⚠️ 順帶解決 1E §6-1 嘅限制（backend stdout 得一個 restart 窗）。
4. `lyricsMapStore` 由 `Object.assign` 改整份替換。
5. `userSync.collapse()` 加「同一 hymn_id 嘅 fav_add/fav_remove 取淨效果」。

**量度指標**：before：`cacheSize.last=672 / max=1252`；`/tmp/hymn_backend.log` 260K、`hymn_fetchlyrics.log` 196K、`hymn_growlibrary.log` 176K；outbox 長度（`useOutboxLength` 已有 hook，但冇 beacon → W1 加）。after：三個 gauge 有上限（要見到 evict 發生 = 正控）；log 檔停喺 cap。

**風險**：⚠️ `resolve cache` 加上限會令熱門歌被 evict 之後要重新 resolve（多 3.5 秒）。上限唔可以定得太細——建議 2000（現時 max 1252），即係「防無限」唔係「積極回收」。

---

### C8 — 子進程／跨進程共享狀態冇協議 【P1】

**根源一句**：兩個獨立症狀同一個根：**「呢個 process 以為自己控制得到嘅嘢，其實控制唔到」**——`exec` 以為 timeout 殺到 yt-dlp（實際只殺到 shell wrapper），`writeFileSync` 以為自己係唯一寫手（實際有 4-5 個 process 同寫）。

**包含 finding**：**RESOLVE-P1**（P1，`promisify(exec)(cmd,{timeout})` × 4 檔；1D 已用 harness 實測 `exec("sleep 30",{timeout:1000})` 之後 `pgrep` 仍見孤兒 pid，reparent 去 launchd；亦冇 yt-dlp `--socket-timeout`，`grep` = 0 hit）、RESOLVE-P2a（`resolve-cache.json` / `discover-fail-cache.json` / `channel-cooldown.json` 三份檔，backend + growLibrary + checkDeadLinks + refetchKids 各有一份私有 Map，`scheduleFlush()` 整份 `writeFileSync` 覆蓋，冇鎖冇 merge——**而 hymns.db 已經因為完全一樣嘅原因出過「9 首無故跌咗」嘅事故，加咗 `acquireDbLock`；呢個教訓冇搬過嚟**）、F1（`checkDeadLinks.js` 整個 10 分鐘 run 只頭尾各鎖一次，令 growLibrary 每日 04:00-04:10 有一個可預期空窗）、USERDB-P2（`saveUserDb` 全同步全檔覆寫，每次單一 favorite add/remove 都寫一次——同 hymns.db 已經特登修過（C-7）嘅係同一種 pattern）。

**用戶可見症狀**：孤兒 yt-dlp/whisper 進程長期食 CPU → 同 backend 爭資源 → 起播變慢（間接但真實，同 CLAUDE.md 記錄嘅模擬器殘留事故係同一類病）；cache 互蓋 → 已經 resolve 好嘅 URL 無故消失 → 用戶撞多一次 3.5 秒冷 resolve。

**證據強度**：RESOLVE-P1 有 1D 嘅**本機 harness 實測**（最硬嘅一類）。RESOLVE-P2a 係推論 + hymns.db 嘅歷史事故做類比。

**修法**：
1. `exec` → `spawn`（唔經 shell）令 kill 直接指向真 pid，或者 `{detached:true}` + `process.kill(-pid,'SIGKILL')` 殺成個 process group；加 yt-dlp `--socket-timeout`。四個檔（`resolveAudio.js:166`、`hymnDb.js:375`、`reconcileCore.js:45/68/89`、`whisperTranscribe.js:61`）一次過。
2. 三個 cache 檔行 read-merge-write（或者直接用 `acquireDbLock` 同款 lockfile 協議）。
3. `checkDeadLinks.js` 改逐行 acquire→寫→release（同其餘四個寫手一致）。
4. USERDB-P2 **唔喺呢波做**（見 §4 唔做清單 N-1），只加一個 `saveUserDb` 耗時 gauge。

**量度指標**：before：`ps -eo pid,etime,command | grep -E 'yt-dlp|whisper-cli'` 現時孤兒數（要喺改前量一次，1D 冇量 prod 現場）；`grep -c "攞唔到 DB 鎖" /tmp/hymn_growlibrary.log` 喺 04:00-04:15 窗。after：同樣兩條指令；加一個 harness：`spawn` 一條 `sleep 30` timeout 1s，之後 `pgrep` 要**零命中**（正控），對照舊 `exec` 版要有命中（負控）。

**風險／紅線**：
- 🔴 `exec` → `spawn` 要拆 shell 字串成 argv 陣列。`resolveAudio.js` 嘅 `extra` 欄現時係 `--extractor-args "youtube:player_client=tv"` 呢種**帶引號嘅 shell 字串**，拆錯就會靜靜傳一個帶引號嘅參數落 yt-dlp。要逐條策略對 argv 做 harness 驗證。
- 🔴 呢波掂到 `resolveAudio.js` = 掂到全部起播路徑嘅上游。**唔准同 C9 喺同一個 commit**（否則 resolve 失敗率變咗都唔知係邊個造成）。

---

### C9 — resolve 失敗路徑 76 秒 vs client 死線 10-20 秒 【P1，最高 ROI】

**根源一句**：三個 yt-dlp 策略串行 fallback，從來冇按實測收割過——`tv` 策略 **14 日 1087 次 0 成功**，每次白蝕 37.5 秒，令一條注定失敗嘅 resolve 結構上要 76+ 秒先返，而 client 側任何 watchdog 死線都係 10-20 秒級。

**證據（V-5，全部我實跑）**：

| 策略 | tries | ok | fail | msSum | 平均/次 |
|---|---|---|---|---|---|
| `default` | 23,633 | 22,401 | 1,232 | 120,462,921ms | — |
| `youtube:player_client=tv` | **1,087** | **0** | **1,087** | 40,806,109ms | **37,540ms** |
| `default-any` | 1,079 | 59 | 1,020 | 41,276,112ms | 38,254ms |

累計 `resolve.total=23,626 / ok=22,460 / fail=1,166`（**失敗率 4.93%**）；`rescued=59`。
`resolveAudio.js:228` 確認串行（`RESOLVE_PARALLEL` 預設 off）。

**推導**：一次注定失敗嘅 resolve = default 失敗時間 + 37.5s（tv）+ 38.3s（default-any）≈ **76 秒 + default**。呢個數字**獨立佐證咗 memory 記錄嘅「404 要 86 秒先拋 PlaybackError 但 giveup 7 秒就跳」**——嗰 86 秒唔係神秘數字，係呢三條策略嘅串行總和。

**用戶可見症狀**：**呢個 cluster 係目前最直接嘅用戶痛點來源。** 因為 backend 要 76 秒先講「攞唔到」，而 client 10-20 秒就已經 nudge → reload → skip，所以**所有 resolve 慢路徑喺用戶眼中 100% 表現為「跳歌／冇聲」，冇一次表現為「等耐咗」**。1E 記錄 14 日 `nativeStall breakerTripped` 20 次、`All yt-dlp strategies failed` 單日 31 次，兩邊對得上。

**證據強度**：✅ **本次最硬**（backend 累計 counter，唔受 restart 影響，唔受 deviceId 污染影響）。

**修法**：
1. `tv` 策略**用 env flag 關掉（`RESOLVE_TV=1` 先開），唔好直接刪 code**。理由：0/1087 係**呢 14 日**嘅事實，佢當初加入係有原因嘅（YouTube 隨時再變）。留返 code + 一個開關 = 有得一鍵回滾。
2. 加一個 `resolve.failMs` 直方圖落 opsMetrics（現時只有 `okMsSum`/`okMsMax`，**失敗路徑嘅時間完全冇記**——呢個本身係儀器缺口，屬 C1 但喺呢波順手補）。
3. `default-any` 保留（59 次真係救返），但要問一個未答嘅問題（§2 拍板 D-9）：38 秒先返嘅 rescue，用戶老早跳咗歌，佢實際救緊嘅係「下一次同一首歌嘅 cache」——值唔值 38 秒 × 1,020 次白蝕？

**量度指標**：
- before（已有，唔使新加）：`ops-metrics.json` `attempts.*`（上表）+ `resolve.fail=1166`。
- after：關 tv 之後跑 7 日，比較 (a) `resolve.fail` 率會唔會由 4.93% 升（升 = tv 其實有隱性價值，要回滾）、(b) **失敗路徑總時長要由 ~76s 跌到 ~38s**（要靠新加嘅 `failMs` 直方圖先量到）、(c) `nativeStall breakerTripped` 同 `All yt-dlp strategies failed` 嘅日均次數。
- ⚠️ (c) 呢條要等 W1 native beacon（W8）先分得到機——所以 W2 落地嗰陣只可以量 (a)(b)。

**風險／紅線**：
- 🔴 **絕對唔准同時改 client 側嘅任何 watchdog 死線去「配合」呢個改動**。呢波只改 backend。client 側死線係 PlayerProvider 紅線區。
- ⚠️ 回滾條件要寫死：7 日內 `resolve.fail` 率升穿 6%（現 4.93%，留 1 個百分點餘裕）→ `RESOLVE_TV=1` 開返。

---

### C10 — 死碼 / 做咗未接線 【P2】

**根源一句**：兩種相反嘅「碼同現實脫節」——刪嘢刪剩（死分支/死 export），同埋做咗但從來冇駁上去（`addedToList`）。

**包含 finding**：APP-003 ×2（`opts.browseTap` / `opts.appendAutoplayTail`，唯一 caller `HymnListScreen.js:111` 唔傳 opts）、AVATAR-001（`useAuth() || {}`，`useAuth` 冇 ctx 會 throw，fallback 永不觸發）、icon `playSmall`/`chevronLeft`/`nowPlaying`/`bell`/`volume`（5 個零引用）、**icon `addedToList`**（P2 用戶可見：設計咗「加入清單成功 1.2 秒再淡返」嘅成功態，5 處 addToList 呼叫全部冇用到）、`DEVICE_ID_KEY`/`generateDeviceId`/`elapsedSinceT0`/`MAX_AUTOPLAY_TRACK_SECONDS`/`CHIP_DEFS`/`PERF_MARKS_ENABLED` 等 export-but-internal、**F5**（`backend/data/hymns.db` 0 bytes 零引用）、410 stub 四檔（`category.js`/`search.js`/`audio.js`/`home.js` 9 條）、F8（11 檔 album backfill 重複 → 見 §4 唔做）。

**❌ 唔屬呢個 cluster**：**INF-004（HLS 樹）**。V-1 實測 `hlsEnabled: true` + 單機 gate 開緊 → **現役程式碼，唔係死碼**。改列 §2 拍板 D-2。

**用戶可見症狀**：`addedToList` —— 加歌入清單冇成功回饋（設計本來有）。其餘冇。

**修法**：分兩批。(a) 純刪：死分支、死 export、零引用 icon、F5。(b) 410 stub 四檔：**要先有 C1 嘅 `deprecatedRouteHits` 持久計數跑滿一輪先刪**（1D DEAD-2 明確建議「不建議直接刪檔而未先補計數」）。(c) `addedToList` 接線 = 新功能，要 Eric 拍板（§2 D-3）。

**量度指標**：淨減行數；`deprecatedRouteHits` 一輪（建議 7 日）零命中先刪 stub。

**風險**：⚠️ memory 記過「`git clean -fdx` 唔准用」、「scratch script 唔准放 backend/」。刪檔用 `git rm` + pathspec commit，唔准夾帶其他 session 嘅檔。

---

### C11 — 依賴／建置／部署治理不一致 【P2，要 native build + 拍板】

**根源一句**：三件唔同嘅事（版本鎖定、APK 簽名、部署 guard）有同一個根：**每樣都個別做啱過一次，但冇變成統一規矩**。

**包含 finding**：
- **DEP-001**（P1）：`react-native-track-player: "^4.1.2"` caret + 592 行手工 Kotlin patch；同 repo 內 reanimated/svg/worklets 三個都係 exact pin。**V-4 補充**：caret 依賴實際有 5 個（`@gorhom/bottom-sheet`、`react-native-draggable-flatlist`、`react-native-gesture-handler`、`react-native-mmkv`、RNTP），其中 **`react-native-mmkv ^3.3.3` 係 MMKV（app 全部本地資料嘅存儲層）**——caret 撞正 3.x 新版行為改變就係全用戶資料層風險。
- **V-4**：`@expo/config-plugins` 俾兩個 plugin `require()` 但**未宣告**（靠 expo 傳遞依賴）。
- **PLG-002**：`withSwiftAudioExStallWatchdog.js:33-38` 冪等閘用固定字串 `'SWStallWatchdog'`，改 payload 唔改閘名 + 舊 Pods 目錄 → 靜靜出舊 Swift。**呢條同 C1 嘅 native beacon 改動直接相撞，W8 一定要一齊處理。**
- **PATCH-001**：RNTP patch 冇 README（SwiftAudioEx 有）。
- **V-3**：`android/app/build.gradle` release buildType 用 `signingConfigs.debug`；`eas.json` 冇 android profile。
- **F2**（P1，ops）：「唔准喺 Eric 真機 QA 進行緊嗰陣部署」淨係文檔約定，四個部署 script `grep` 零 guard——**而同一部機嘅 iOS 模擬器清理已經有一個真嘅 `session-cleanup-guard.py` 並發 guard**。呢個唔對稱本身就係根源。
- **F4**（P2）：`com.hymnapp.backend.plist` 嘅 `EnvironmentVariables` 明文存 `JWT_SECRET`/Twilio 三個密鑰。

**用戶可見症狀**：冇（全部係流程風險）。但 F2 撞正 = 污染 Eric 真機 QA 嘅根因分析（memory `feedback-no-deploy-during-live-qa` 記錄 08-12 撞過一次）。

**修法**：
1. 五個 caret 全部改 exact pin；`@expo/config-plugins` 明文加入 `devDependencies`。純 `package.json` 改動，`npm ls` 核。
2. RNTP patch 加 README（照 SwiftAudioEx 個格式）。
3. PLG-002：閘名由固定字串改成「payload 內容 hash」——改 payload 自動換閘名，結構上唔可能再出舊 Swift。
4. **F2 —— 呢個係本 cluster 最抵做嘅一項**：仿 `session-cleanup-ios.sh` 嘅 `HOLD_FILE`，加 `/tmp/hymn-qa.hold`，四個部署 script（`backend-restart.sh`/`ota-publish.sh`/`ota-rollback.sh`/`apk-publish.sh`）一齊查，有檔就 refuse + 講點解。**零風險、半小時、即刻消除一個已經撞過一次嘅事故**。
5. F4：密鑰搬去 `chmod 600` 嘅獨立 `.env`（要改 launchd plist + restart）——要 Eric 拍板（D-10）。
6. V-3 keystore：**要 Eric 拍板（D-4），影響最大**。

**量度指標**：`npm ls` 鎖定版本；`npm install` 後 `git status` 確認 patch 冇被改寫；F2 guard 加一個正控（`touch /tmp/hymn-qa.hold` 之後跑 `backend-restart.sh --dry-run` 要 refuse）+ 負控（冇檔要照跑）。

**風險／紅線**：🔴 exact pin 之後要重跑一次 `npm install` + iOS/Android build 驗證冇 regression（呢個本身就要 W8 嘅 build）。🔴 **subagent 唔准掂 Cloudflare API / DNS / cert.pem / token**（memory 硬紅線），呢波唔涉及但派工單要照抄。

---

### C12 — Android 專項 【P2，1B 已出，見 §6】

**根源一句**：呢個「cluster」出咗 1B 之後，**同 C13 一樣唔係一個真根源** —— 三條 finding 冇共同上游（一條係 Library 畫面嘅記憶體足印、一條係 Android 平台生命週期對 JS timer 嘅影響、一條係「本來以為有問題結果冇問題」嘅核實）。老實標明佢係「平台專項清單」，一波（W9）過完算。明細、嚴重度、證據強度、修法方向見 §6。

---

### C13 — 孤立正確性缺陷（**刻意標明「唔係根源 cluster」**）【P2/P3】

**點解單獨列**：呢七條我搵唔到共同根源。夾硬砌一個「編碼疏忽」cluster 係自欺——所以老實標明佢哋係孤立缺陷，一波過修完算。

| ID | 檔:行 | 平台 | 內容 |
|---|---|---|---|
| INSET-001 | `useInsets.js:32` | both | `raw?.top \|\| fallback` 令合法 `top=0` 被當冇值 → 硬套 44/24。改 `??` |
| SCR-016 | `PhoneLoginScreen.js:349` | both | 重發驗證碼掣只 disable cooldown 唔 disable busy → 雙擊燒兩次 OTP（**同 C6 OTP-1 相關但唔同根**：呢個係前端，OTP-1 係後端） |
| HOME-1 | `routes/home.js:36-38` | backend | `dayOfYear` 混用 UTC（`new Date(isoString)`）同本機時區（`new Date(y,0,0)`）→ 香港 UTC+8 每日 00:00-08:00 UTC 有機會揀錯日金句 |
| REQAUTH-P3 | `lib/requireAuth.js` | backend | `next()` 擺咗喺 try 入面 → 下游同步拋錯會被錯誤歸類做 401。地雷，今日冇 handler 會踩 |
| SRV-3 | `server.js:174-180` | backend | `/api/me` 前綴匹配令 share/invites 行多次 `requireAuth`（2× DB SELECT+UPDATE）兼佔 60/min 額；share.js 註解聲稱唔使——註解同實際不符 |
| STR-1 | `routes/stream.js:576-587` | iOS | iOS webm/opus 攔截靠 `/AppleCoreMedia/i.test(UA)`；建議改 `X-Client-Platform` header（app 已有 platform 概念）。**同 C1 統一儀器同一個哲學**（唔好靠第三方字串反推平台），但改動獨立 |
| INF-002 | `audioPrefetch.js:371` | iOS | `MIN_BYTES=200KB` 拒收，<200KB 真短歌永遠唔入本地 cache，log 同錯誤頁無分別 → 見 §4 唔做（只加 beacon 分辨） |

---

## 2. 要 Eric 拍板嘅項

| # | 項 | 點解要佢決定 | 我嘅建議 | 卡住邊一波 |
|---|---|---|---|---|
| **D-1** | **401 之後嘅 UX**：即刻踢返登入頁 / 靜靜標記失效 + 下次做需要登入嘅動作先提示 / 頂部提示條 | 純產品體驗。一個正喺度聽歌嘅人被踢出去係好差嘅體驗；但唔踢佢又唔知自己嘅收藏冇同步緊 | **靜靜標記 + 頂部提示條 + 下次 authed 動作先 block**。工程上先做攔截同 beacon，UI 行為擺喺一個 flag 後面 | W4 |
| **D-2** | **HLS 政策**：現時 `hlsEnabled: true` 但 `hlsDeviceIds` 只得 Eric 一部機。要 (a) 維持單機、(b) 擴到更多機、(c) 收返 false 兼刪成棵樹？ | memory 記錄 HLS 一度判 NO-GO，後來「flag 保持開 + 起播期降級修（f509c3b）」。呢個係產品/風險決定唔係工程決定 | **維持 (a) 單機，唔郁**。C9（resolve 76 秒）先修——如果 C9 修完起播痛點大幅減，HLS 可能根本唔使擴 | W7（決定咗先知刪唔刪） |
| **D-3** | **`addedToList` 成功態動效接唔接線**（設計稿有：加入成功顯示 1.2 秒再淡回） | 新增用戶可見行為 | **接**。5 處 addToList，成本細，係目前唯一一條「設計咗但用戶收唔到回饋」嘅缺口 | W7 |
| **D-4** | **Android release keystore**：由 debug keystore 換真 keystore | 🔴 **換簽名 = 換 app 身份**。現有裝咗 APK 嘅用戶**唔可以 in-place update**，要人手解除安裝再裝（所有本地資料照計 `allowBackup:false` 會冇咗）。呢個係用戶影響決定 | 建議做，但要配一個「舊版 banner 講清楚要重裝」嘅過渡期。**呢個決定嘅代價會隨用戶數增長而變大——愈遲做愈貴** | W8 |
| **D-5** | **iOS 邀請文案**（SCR-009：分享文案只有 Android APK 連結，iOS 收件人冇安裝路徑） | 要決定 iOS 點分發（TestFlight 公開連結？App Store 上架？） | 短期：文案加一句「iOS 版籌備中，請聯絡 Eric」；長期跟 App Store 計劃 | W7 |
| **D-6** | **要唔要出 native build**（iOS TestFlight build 18 + Android APK vc56） | 出 build 有成本（EAS 額度、TestFlight 審核、Eric 要裝）。W8 全部項目（native beacon、PLG-002、exact pin、keystore）都要出 build 先生效 | **要**。C1 嘅 native 部分唔出 build 就永遠唔知 20 次 `breakerTripped` 集中喺邊 | W8 |
| **D-7** | **APP-001：刪唔刪第三套 2 秒無條件 player state 輪詢** | 掂到 player state 供應鏈。紅線區邊緣 | **獨立一張執行單**：先只做「列出所有 consumer + 加一條 beacon 記佢實際改變咗乜」，證實真係冗餘先刪。唔准喺 W6 順手做 | 獨立 |
| **D-8** | **`/api/internal/activity` 加 localhost-only** | 要先確認夜晚 script（growLibrary/checkDeadLinks）係咪由同一部機 loopback 打——如果經 tunnel 打就會斷 | 先查再改（查係工程嘢，改動風險要 Eric 知） | W2 |
| **D-9** | **`default-any` 策略值唔值**：1,079 次白蝕 38 秒換 59 次成功，而成功時用戶老早已經跳咗歌 | 要決定「救緊嘅係下次嘅 cache」值唔值 | **暫時保留**，等 C9 加咗 `failMs` 直方圖有數據先決定。唔好一次過改兩個策略 | W2 之後 |
| **D-10** | **F4 密鑰由 plist 搬去 `chmod 600` 的 `.env`** | 要改 launchd plist + backend restart | 做，排喺任何一次已計劃嘅 restart 順手 | W2 或 W3 |
| **D-11** | **`PERF_MARKS_ENABLED` 幾時關返 false** | 09-02 報告已列做「收爐後」待辦，但呢輪體檢又要用 | **維持 true 直到 Phase 4 總報告出咗**；同時 W1 一定要修 CLOG-1（否則儀器量放大一個未加固嘅同步 I/O 樽頸） | W1 起 |
| **D-12** | **Eric 部 Android 真機開一晚** | 呢個係**唯一**可以令 Android 真用戶樣本由 0 變 1 嘅動作，冇替代品 | 排喺 W1 OTA 之後嘅第一晚（beacon 帶齊 platform/deviceId 先有意義） | W1 之後 |

---

## 3. 修復波次計劃

原則：**一波 = 一個 cluster 根治**（唔係一波一個檔案）。每波：Sonnet 5 執行 → Opus 5 獨立驗收 → Fable 5.1 拍板部署。
每波交付要有：before 數字出處、after 同儀器數字、**兩個平台各自量**、正控 + 負控、pathspec commit。

### 通用量度紅線（每一波都適用）

1. **iOS**：照 1C 方法——Release build、`-derivedDataPath` 全新、`Expo.plist` `EXUpdatesCheckOnLaunch=NEVER`、經 **prod tunnel**（唔准 loopback）、`simctl uninstall` 再 install（memory：同 bundle id install 唔會真換二進制，要 `get_app_container` 核 bytes）、A/B **交錯** 5 run。
2. **Android**：照 **`DEEP-AUDIT-1B-OPUS-20260906.md` §8 + §10** 嘅方法（唔係 1B 原文）。AVD `hymntest` + release APK；**`pm clear` 嘅 run 每次都會重新落一次 OTA bundle，`lyrMs`/`a1b` 要標明含並行下載**；**每次都要確認 `~/.hymn-deploy/ota-groups.log` 最後一條 android sha = 量緊嗰個 commit**（唔好再重蹈「OTA commit 查唔到」—— `eas update*` 系列俾 gate 擋，唔代表冇答案，本地 publish log 先係權威）；記憶體要出 `dumpsys meminfo` 嘅 `App Summary` 分項 **+ `Objects.Views`**，唔可以淨係抄 TOTAL PSS；**播放線同詩歌庫線要分開量**（兩者混埋會將 Library 成本當成播放洩漏）。
3. 一次只開一部機；`/tmp/claude-ios-cleanup.hold`；收工清（CLAUDE.md）。
4. **wall-clock 秒數浮動 55-106%**（memory）→ 唔准用非交錯嘅前後對比落判斷；bytes / server ms / render 次數先係穩定指標。
5. 唔准喺 Eric 真機 QA 進行緊嗰陣部署（W8 之後就有 code guard，之前靠人手）。
6. **restart 一定排喺 OTA 之前**（memory 紅線）。

---

### W1 — 儀器缺口根治（C1 JS+backend 部分 + CLOG-1）🔴 **必須第一波**

| | |
|---|---|
| **範圍** | 新 `src/clientLog.js` 統一送信（platform/deviceId/appVersion/updateId/sessionId）；三套實作（App.js logDiag / track-player-service / audioPrefetch）改用佢；`navBeaconsSent` cap 10→40 + capped beacon；**每條 beacon 加 `sinceLaunchMs = Date.now() - T0`（`perfMarks.js:29` `T0` 現成）**（1B/C12-2：外來對話框可以令 `t=15`/`t=60`/`perfMarks@25s` 遲 132 秒到達而 beacon 本身零痕跡，呢啲 label 而家係名義值唔係實測值。**唔使加 `dialogBlockedMs`** —— `sinceLaunchMs − 名義 delay` 就係）；backend `clientLog.js` 白名單擴欄；`clientLogStore.js` mkdir/chmod 搬 module load + async writer；`/api/client-log` per-IP 節流；`opsMetrics` 加 `deprecatedRouteHits` + `resolve.failMs` 直方圖 + 三個 cache size gauge；`userSync` 未知 op beacon；outbox 長度 beacon；`ops/perf/classify-devices.mjs` 剔除規則 code 化 |
| **唔包** | native SWStallWatchdog beacon（要 build → W8）；任何 threshold 改動 |
| **before** | 1E §1（帶 platform 嘅 row 37% = 970/2649；iOS 認證真機 1 部、Android 0 部）；1E §5 `[access]` 表；1C 限制#6（15 tap 得 10 條）；`ops-metrics.json` 現值 |
| **after 量法** | iOS sim（1C 方法）跑 S1×3 + S3（15 tap 要收足 15 條 perfNav）；Android AVD 同樣；本機 harness 量 1000 次 clientLog append 耗時（唔准 prod 洗版）；跑 24 小時後數 `platform` 覆蓋率 |
| **部署** | ① backend restart（gate approve → dry-run → 真 restart → 15 分鐘 smoke）② OTA（同 sha）。**restart 先於 OTA** |
| **工時** | 1.5 日（backend 0.5 + 前端 0.5 + 驗收/量度 0.5） |
| **依賴** | 冇。**所有其他波嘅 before/after 都依賴呢波** |
| **驗收正控** | 每一種 event 都要見到帶 platform+deviceId+sessionId 嘅新 row（逐種 event 逐條核，唔准抽樣）；cap beacon 要 fire 過一次 |
| **驗收負控** | 舊格式 row 唔准再出現；`/api/client-log` 打爆節流要見 429，正常量唔准 429 |

---

### W2 — resolve 失敗路徑 + 公開寫入面（C9 + C6）

| | |
|---|---|
| **範圍** | `RESOLVE_TV` env flag（預設 off，關掉 0/1087 嘅 tv 策略）；`backend/lib/rateLimit.js` 抽共用（**第一個 commit 純機械抽取，threshold 一個數字都唔准變**）；`/otp/verify` + `/otp/verify-ticket` 掛節流；`app.set('trust proxy')` + `clientIp()` 收緊；`cors()` allowlist；`/api/internal/activity`（D-8 查完先改）；F4 密鑰搬 `.env`（D-10） |
| **before** | V-5 全表（`attempts.*`、`resolve.fail=1166`、4.93%）；1E §4.6（`All yt-dlp strategies failed` 單日 31 次）；1E §5 `[access]` p50/p90 |
| **after 量法** | 7 日 `ops-metrics.json`：`resolve.fail` 率（門檻：唔准升穿 6%）、`failMs` p50（目標 ~76s → ~38s）、`winner.*` 分佈；harness 正控（同 IP 打 20 次 `/otp/verify` 見 429）+ 負控（20 個唔同 IP 唔准 429）+ 假 `X-Forwarded-For` 正控 |
| **部署** | backend restart × 1（全部 backend 改動一次過） |
| **工時** | 1.5 日 + 7 日觀察窗 |
| **依賴** | W1（要 `failMs` 直方圖先量到 (b)）|
| **回滾** | `RESOLVE_TV=1` 一個 env 開返；rate limit 用 approve 前一個 sha restart |
| **紅線** | 🔴 唔准同時改任何 client 側 watchdog 死線；🔴 抽 limiter 同加新 route 分兩個 commit |

---

### W3 — 無上限增長 + 子進程／跨進程狀態（C7 + C8）

| | |
|---|---|
| **範圍** | `backend/lib/boundedMap.js` + 四個 Map 換佢；`/tmp/hymn_*.log` ×12 加 rotation；`exec`→`spawn`(+process group kill + `--socket-timeout`) × 4 檔；三個 cache 檔 read-merge-write；`checkDeadLinks.js` 改逐行鎖；前端 `lyricsMapStore` 整份替換 + `userSync.collapse()` 合併 fav 淨效果 |
| **before** | `cacheSize.last=672 / max=1252`；12 個 log 現時大細（backend 260K / fetchlyrics 196K / growlibrary 176K）；`ps -eo pid,etime` 孤兒數（**要喺改前補量一次，1D 冇量 prod 現場**）；`grep -c "攞唔到 DB 鎖"` 04:00-04:15 |
| **after 量法** | 三個新 gauge 見到 evict 發生（正控）；harness：`spawn` `sleep 30` timeout 1s 之後 `pgrep` **零命中**（正控）vs 舊 `exec` 版有命中（負控）；log 檔停喺 cap；⚠️ **唔准用 RSS 做證據**（1E §5：restart 太頻密，RSS 曲線不可靠） |
| **部署** | backend restart × 1 + OTA（前端兩項） |
| **工時** | 2 日 |
| **依賴** | W2（同樣掂 `resolveAudio.js`，唔可以同一個 restart 窗，否則歸因唔到） |
| **紅線** | 🔴 `exec`→`spawn` 要逐條策略對 argv 做 harness（`--extractor-args "..."` 帶引號會拆錯）；🔴 resolve cache 上限唔可以太細（建議 2000，現 max 1252） |

---

### W4 — fetch 層統一 + 401 + 錯誤狀態規格（C3）

| | |
|---|---|
| **範圍** | `src/api/fetchJson.js` 單一實作 + 統一錯誤形狀；`api.js` 兩套 + `homeApi.js` 一套改薄 wrapper；401 攔截 → `onUnauthorized()`（UI 行為擺 flag 後面等 D-1）；五個 catch 塊套「`err && !data` 先全屏錯誤」規格；`runLoginSync` 加 catch + beacon；HOME-001 動態 import 加 catch |
| **before** | 冇秒數指標（正確性 cluster）。1E §5 見到 `/api/admin/presence` 401×1 = 401 真係會發生 |
| **after 量法** | harness：401 mock server → 五條 authed 路徑全部觸發 `onUnauthorized`（正控）+ 一條 200 路徑唔觸發（負控）；五個錯誤狀態各一個「有 data + 有 err」同「冇 data + 有 err」場景截圖；client-log `authExpired` event 真機有冇 fire |
| **部署** | OTA |
| **工時** | 1.5 日 |
| **依賴** | W1（beacon）；D-1 拍板（UI 行為） |
| **紅線** | 🔴 統一 helper 唔准改任何現有 request 嘅 URL/method/header——用 harness 逐條對前後 request 一致 |

---

### W5 — async 生命週期共用 hook（C2）

| | |
|---|---|
| **範圍** | `src/hooks/useAsyncLifecycle.js`（`useIsMounted` + `useSeqGuard`）；鋪落 AddFriendSheet(3)、AdminAddHymnScreen(3)、AuthScreen(1)、PhoneLoginScreen(6)、PlaylistDetailSheet(1)、AuthContext(5)、PlaylistsContext(cleanup)、useCachedHymns(generation token) |
| **before** | 冇數字。1C S1 `merged=1` 5/5、`lyrMs` 1453-2537ms（俾 useCachedHymns 改動做對照） |
| **after 量法** | 每檔一個正控 + **一個負控**（拆走 guard 要重現舊行為，冇負控嘅一律當未驗）；1C S1 重跑，`merged=1` 要維持 5/5、`lyrMs` 唔准倒退；1C S3 render 次數唔准升 |
| **部署** | OTA |
| **工時** | 2 日 |
| **依賴** | W4（新 handler 用統一 fetch，唔好改兩次） |
| **紅線** | 🔴 `useCachedHymns` generation token 掂到 09-02 A-6 嘅冷開分階段載入核心路徑，要獨立前後對照 |

---

### W6 — render/memo + 共用 UI 組件（C4 + C5）

| | |
|---|---|
| **範圍** | 三個 Provider value `useMemo`；`player.hymns` 建 id→hymn Map（收 APP-002）；LibraryScreen/MineScreen FlatList data+renderItem memo + row `React.memo`；抽 `HymnCover.js`（收 6 份）、`HymnHeart.js`（收 3 份，內置 memo 順帶收 HOME-002）、`playlistActions.js`、`lyricsText.js`；HEARTBEAT-001 提升 useCallback |
| **唔包** | **APP-001（D-7 獨立執行單）** |
| **before** | **本次最好嘅 before**：1C S2 `lib` 197-217ms、S3 `tapToMount` 37-93 / `tapToPaint` 59-116ms、S1/S2 `perfRenders` 15s = `Home=8 Library=6 Mine=8 Mini=8 TabBar=8 AppContent=8 PlayerProvider=5`（5 run 完全一致）、S5 `perfRenders` t=60 = `Home=13 Library=10 ... PlayerProvider=15` |
| **after 量法** | 同儀器 1C S2/S3/S5 交錯 5 run；`perfRenders` 係最穩定指標（5 run 一致）→ 用佢做主判準；Android AVD 同一套 |
| **部署** | OTA |
| **工時** | 2 日 |
| **依賴** | W5（同樣掂六個 screen，順序做避免衝突） |
| **紅線** | 🔴 抽 Cover 之前要逐個 diff 六份實作（唔准「睇落一樣就當一樣」）；⚠️ row `React.memo` 要核 `currentId` 呢類全 list 一齊變嘅 prop |

---

### W7 — 死碼清理 + 孤立正確性（C10 + C13）

| | |
|---|---|
| **範圍** | 刪：APP-003 兩個死分支、AVATAR-001 fallback、5 個零引用 icon、6 個 export-but-internal、`backend/data/hymns.db`（F5）；410 stub 四檔（**要 W1 嘅 `deprecatedRouteHits` 跑滿 7 日零命中先刪**）；接線 `addedToList`（D-3）；修 INSET-001、SCR-016、HOME-1、REQAUTH-P3、SRV-3（改註解對正實際）、STR-1（加 `X-Client-Platform` header）；SCR-009 文案（D-5） |
| **before** | 行數；`deprecatedRouteHits` 7 日計數 |
| **after 量法** | 淨減行數；bundle 大細（1C：`main.jsbundle` 3,740,962 B）；`deprecatedRouteHits` = 0 先刪；STR-1 加 header 之後 backend 要見到 header 命中（正控）同 UA fallback 仍然 work（負控） |
| **部署** | OTA + backend restart（stub 刪檔 + STR-1 + HOME-1 + REQAUTH-P3 + SRV-3） |
| **工時** | 1 日 |
| **依賴** | W1（deprecatedRouteHits）；D-2/D-3/D-5 拍板 |
| **紅線** | 🔴 **HLS 樹一個字都唔准刪**（V-1：現役單機 gate）；🔴 用 `git rm` + pathspec commit，唔准 `git clean -fdx`，唔准夾帶其他 session |

---

### W8 — native build 波（C11 + C1 native 部分）

| | |
|---|---|
| **範圍** | SWStallWatchdog beacon 加 platform/deviceId + domain 對齊 `API_BASE`（V-2）；**同時**改 PLG-002 冪等閘名（payload hash）；五個 caret → exact pin + `@expo/config-plugins` 宣告；RNTP patch README；F2 `/tmp/hymn-qa.hold` guard（呢項唔使 build，可以提早落）；Android keystore（D-4 拍板咗先） |
| **before** | 1E §2.3：`nativeStall` n=1025，**100% 冇 platform/deviceId**；`breakerTripped` 20 次無歸屬；1C `main.jsbundle` 3,740,962 B |
| **after 量法** | iOS TestFlight build 18 + Eric 真機一晚：`nativeStall` 帶 deviceId 佔比 0%→100%；`breakerTripped` 終於歸得到機。Android APK vc56 + AVD 驗證。**`npm install` 後 `git status` 確認 patch 冇被改寫**（DEP-001 驗收法） |
| **部署** | iOS EAS build + submit ASC；Android APK（keystore 決定咗先）。⚠️ memory：唔准手動 bump buildNumber（autoIncrement 自己做）；eas 命令要 `zsh -ilc` 包住先攞到 EXPO_TOKEN |
| **工時** | 1 日 + build/審核等候 |
| **依賴** | W1（JS 側統一格式，native 要對齊同一份 schema）；D-4/D-6 拍板 |
| **紅線** | 🔴 **改 native beacon payload 一定要同時改 PLG-002 閘名**，否則靜靜出舊 Swift；🔴 唔准改 SWStallWatchdog 任何 threshold（`stallActionSeconds`/`nudgeSeconds`/`maxConsecutiveSkips`/`reloadWaitSeconds`）——只加 beacon 欄位 |

---

### W9 — Android 專項（C12）【1B 已出，可排期】

| | |
|---|---|
| **範圍** | ① **C12-1 詩歌庫記憶體足印**：讀 `LibraryScreen` 嘅 FlatList props（`windowSize` / `initialNumToRender` / `maxToRenderPerBatch` / `removeClippedSubviews` / `getItemLayout`），收窄 render window；封面圖 `Image` 加明確 `resizeMode` + 尺寸上限。② **C12-7 三條 1B 冇測嘅**：`ADMIN-002`（`AdminEditHymnSheet.js:166` Android 冇 KAV，照 `AddToPlaylistSheet.js:69-76` 嘅手動 Keyboard listener 做）、`INF-008`（headless service handler）、`INF-007`（六個 Remote handler 加 catch）。③ **C12-6 media notification churn**：只加量度，唔改行為。④ 補做 1B 三行冇 archive 嘅 Android 專項量度（logcat ANR/FATAL 全程存檔、返回鍵、鍵盤 dismiss 撳「歌曲行」） |
| **唔包** | `native heap 唔還`嗰 140MB 嘅修法（要先確認係咪 Fresco bitmap pool，未確認唔准郁）；C12-2 嘅機制追查（另開單）；C12-4 debug keystore（C11/W8）；C12-5 test `<queries>`（C11/W8）；任何掂 PlayerProvider 起播/stall/watchdog 嘅嘢 |
| **before** | `DEEP-AUDIT-1B-OPUS-20260906.md` §8 全表。記憶體專用：播歌留首頁 PSS 320,655 / 459,293 / 468,825（+6/66/181s）、Views 755/858/858；撳詩歌庫 10 秒 → PSS 639,774、native heap 409,720、**Views 3,434**；離開詩歌庫 → Views 858、native heap 401,048 |
| **after 量法** | AVD `hymntest`，同一部、同一 commit、同一 tunnel。**四段式，逐段量，唔准合併**：(a) `pm clear`+`pm grant` 冷開 ×5；(b) `force-stop` 熱 data ×5；(c) 播歌 3 分鐘**唔撳詩歌庫**，`dumpsys meminfo` 取 `App Summary` 分項 + `Objects.Views`，+6/+66/+181s；(d) 撳詩歌庫，+10/+30/+60/+120s 同一組數；(e) 撳返首頁 +25s。**成功線：撳詩歌庫嘅 `Views` 增量由 +2,576 減到 <800，PSS 增量 <60MB，`lib` render 時間唔准劣化過 219.23ms（S2 max）**。C12-2 嘅 after 靠 W1 嘅 `sinceLaunchMs`（見下） |
| **正控** | 每段都要有「唔播放留首頁 30 秒」呢個負控（S1 raw 已知答案：Views 758→763→763、PSS 283-313k→344-346k）；logcat 段一定要有一個「grep 得到嘅良性字串」計數證明 filter 有效**而且要存檔** |
| **負控** | 改完之後詩歌庫要照樣滾得到最尾一首（6.5k 首）、搜尋照樣出到結果 —— 收窄 render window 最易整爛呢兩樣 |
| **部署** | 純 OTA（如果只改 JS）。`ADMIN-002` / `INF-007` / `INF-008` 全部係 JS |
| **工時** | 1 日（前端 0.5 + AVD 量度/驗收 0.5） |
| **依賴** | **W1**（`sinceLaunchMs` 出咗先量到 C12-2 嘅 after；`navBeaconsSent` cap 出咗先收得足 15 條 perfNav）。同 W6 有重疊（都掂 Library render），**排喺 W6 之後或者同 W6 一齊做**，唔好兩波各改一次同一個 FlatList |
| **紅線** | 每一項 Android 專項結論**必須有 raw 入 `ops/perf/` 存檔**（1B 呢一節最大嘅失分就係冇存檔）；弱網一律要有獨立吞吐正控，冇正控唔准落「限流有效／無效」嘅判詞 |

---

### 波次依賴圖

```
W1 (儀器) ──┬─► W2 (resolve+節流, backend restart)
            │        │
            │        └─► W3 (無上限+子進程, backend restart)
            │
            ├─► W4 (fetch+401, OTA) ─► W5 (lifecycle, OTA) ─► W6 (memo+組件, OTA)
            │
            ├─► W7 (死碼+孤立, 需 deprecatedRouteHits 7日)
            │
            ├─► W8 (native build)
            │
            └─► W6 ─► W9 (Android 專項 C12；同 W6 都掂 Library FlatList,
                          唔好兩波各改一次 —— 一齊做或者緊接住做)
```
總工時估算：**約 13 個工作日**（Sonnet 執行）+ 7 日 W2 觀察窗 + build 等候。

---

## 4. 唔做清單

| # | Finding | 唔做嘅理由 |
|---|---|---|
| **N-1** | **USERDB-P2**（`saveUserDb` 全檔同步寫） | `users.db` 現時 **64KB**，每次寫 <5ms。加 debounce 引入嘅新風險（debounce 窗內 crash = 丟用戶收藏）**大過**現時嘅收益。**改做：加一個 `saveUserDb` 耗時 gauge，定一條線（>50ms 或 db >1MB）先重開呢張單**。呢個係「唔好為咗一致性去改一個未痛嘅嘢」 |
| **N-2** | **F8**（11 檔 `backfillAlbumFrom*Catalog.js` 重複 60-100 行 × 9） | 全部係一次性／人手 CLI 工具，唔喺任何排程，**跑完就唔再跑**。抽共用嘅 regression 風險（每檔嘅標題解析規則其實有微妙差異）大過維護收益。**條件**：如果再開新來源，第 12 個檔之前先抽 |
| **N-3** | **F3**（albumsearch 每小時 :15，一日 24 次） | 全部寫手共用 `acquireDbLock`，撞鐘只會令較慢嗰個**優雅跳過**，唔會爛資料。1D 自己都判「非急切」。唔值得為咗「睇落整齊」去郁一個 work 緊嘅排程 |
| **N-4** | **SRV-3**（`/api/me` 前綴令 share/invites 行多次 requireAuth） | Fail-safe（多做一次驗證，唔係少做）。真實成本 = 2× DB SELECT+UPDATE，喺現時用戶量下係雜訊。**只改註解對正實際**（已放 W7），唔改掛載結構 |
| **N-5** | **CACHE-003**（全量 refresh 失敗時靜默用舊 cache，冇「舊資料」提示） | 1A 自己標「資訊/設計決定」。加提示條有機會令正常用戶頻繁見到唔關佢事嘅警告。**除非 D-1 拍板咗要做全局錯誤提示條，否則唔郁** |
| **N-6** | **INF-002**（`MIN_BYTES=200KB` 拒收真短歌） | 修法要「用 duration 交叉核」= 改 prefetch 判斷邏輯 = 掂到 iOS 本地 cache 路徑（memory 紅線：唔擴大本地音訊副本）。真短歌喺呢個庫罕見。**只喺 W1 加一個能分辨「真短歌」定「錯誤頁」嘅 beacon 欄位**，收咗數先講 |
| **N-7** | **`wallClockDrift` event 本身** | 1E §4.2 已證：呢個 event 結構上分唔開「真時鐘飄移」同「app 背景咗一晚」（max 13.3 小時）。**現狀係一個永遠解讀唔到嘅 event**。W1 加 `appState`/`bgDurationMs` 欄位；如果加咗之後仍然分唔開，下一波直接剷 <br>**🔴 2026-09-06 1B 後放寬（`DEEP-AUDIT-1B-OPUS` §2.4）**：「永遠解讀唔到」講得太死。①該日 6 條 android drift **全部 `trackState="none"`** —— `trackState` 已經係一個現成嘅第一層判別欄，唔使等 W1。②喺「前台被外來 Activity 阻塞」呢類個案，`driftMs` 係一個**準確**嘅阻塞時長計（實測 `driftMs=131162` vs 對話框在頂 132 秒；1B 另一次 `driftMs=103998`）。**改為：加 `appState`/`bgMs` 之外保留 `trackState` 做分流，唔准剷。** |
| **N-8** | **S6 弱網量度（1C 最大缺口）** | 呢部 Mac 冇 passwordless sudo、冇 Network Link Conditioner、repo 內冇 throttle 工具（1C §5 三條原因逐條實證）。**唔好為咗補呢個缺口去裝系統級工具或者攞 sudo**。替代：靠 Eric 真機蜂窩網 beacon（D-12）+ backend `[stream]` cold/warm 分佈（1E 已有：cold ttfb p50 4059ms vs warm 182ms） <br>**⚠️ 2026-09-06 1B 後補充**：呢條「唔做」嘅理由（Mac 冇 sudo / 冇 NLC）**對 iOS 仍然成立**，但 **Android emulator 唔同** —— `adb emu network speed 3g` + `delay edge` 做到而且**部分生效**（S1→S6-S1 四個網絡欄方向一致上升：`a1t` 1.0-1.6×、`a1b` 1.2-1.8×、`lyrMs` 1.8-2.6×，體積愈大升幅愈大＝頻寬限流指紋）。問題唔係「做唔到」係「**做咗冇儀器正控**」：1B 由頭到尾冇獨立量過 shaping 開住嗰陣嘅實際吞吐，所以佢個「限流無效」判詞唔可以引。**Android 側改為：可以做，但一定要有獨立吞吐正控（shaping 期間計時下載一個已知大細嘅檔），冇正控唔准落「限流有效／無效」嘅判詞。** |
| **N-9** | **RSS 做記憶體洩漏證據** | 1E §5 明證：呢 96 小時 backend restart 太頻密，RSS 每次歸零，鋸齒形，**用佢判洩漏唔可靠**。改用 `.size` gauge（W3）。呢條唔係「唔做」係「唔准用呢個方法」 |
| **N-10** | **靠 UA / 時間相近反推平台** | memory `project-multi-sim-clientlog-contamination` 明文記錄呢招會出錯。W1 之前，`nativeStall`/`prefetchFail`/`RemoteDuck` 三種 event 嘅任何「幾多次」數字**一律唔可以做 before**。呢條係硬禁令唔係取捨 |

---

## 5. 對 1E 真機數據嘅解讀（限制同補救）

### 5.1 現實

| | iOS | Android |
|---|---|---|
| 認證真機 | **1 部**（`e1b6dc8a...` = Eric，由 `app-version.json` 嘅 `hlsDeviceIds` 獨立佐證——**唯一有第二個來源確認嘅 deviceId**） | **0 部** |
| 其餘 deviceId | 44 個，全部單日出現 + 同日 ≥2 條 `perfMarks`，或者完全冇生命週期 beacon 淨得播放 event 連環爆（例：`df3e6a93...` 09-02 單日 84 行全部播放 event）→ 判測試殘留 | 1 個（`d03463c3...`）橫跨 3 日 33 行，**冇任何獨立來源確認**係真機定 AVD `hymntest` |
| 樣本量 | 258 行 / 4 曆日 | 33 行 / 3 曆日（未證實） |

### 5.2 呢個對「可量測改善」嘅三個硬限制

1. **統計上做唔到 A/B。** n=1 部機、4 日。任何「改善咗 X%」嘅真用戶宣稱都係假嘅。真用戶數據喺呢個項目**只能做「有冇新增 regression」嘅粗篩**，唔可以做效果量化。
2. **結構上冇 before。** 1E §3.2 實證：Eric 真機喺 client-log 嘅第一條記錄就已經係 09-02 11:06Z（OTA 之後 3 分鐘）。呢個唔係「數字唔靚」，係**冇 before 樣本存在**。同一個陷阱會喺每一波重演——除非 W1 加 `updateId`。
3. **三種最痛嘅 event 冇歸屬。** `nativeStall`（含 20 次 `breakerTripped`）/`prefetchFail`（149 次）/`RemoteDuck`（39 次）全部冇 platform/deviceId。而 `breakerTripped` 正正就係「用戶聽歌途中俾熔斷 pause」——**最痛嘅訊號係最冇歸屬嗰個**。

### 5.3 補救（按 ROI 排）

| 優先 | 做法 | 收益 | 限制 |
|---|---|---|---|
| **1** | **W1 加 `updateId` + `sessionId` + `appVersion`** | 一次過解決 §5.2-2：之後每一波 OTA 都自動有 before/after 切分維度，唔使再靠時間戳夾 | 只對 W1 之後嘅波有效，W1 本身仍然冇 before |
| **2** | **D-12：Eric 部 Android 機開一晚**（W1 OTA 之後） | **唯一**可以令 Android 真用戶樣本由 0 變 1 嘅動作。冇替代品 | 要 Eric 配合；n 仍然 = 1 |
| **3** | **AVD `hymntest` 做 Android 代理**（1B 方法） | 可重現、可交錯、可做真 A/B。係 Android 側**唯一**可以做效果量化嘅途徑 | 🔴 **AVD ≠ 真機**：冇真蜂窩網、CPU/GPU 模型唔同、冇真 ANR 壓力。所有 AVD 數字要明文標「代理量度」，唔准當真機 baseline 報 |
| **4** | **iOS sim 經 prod tunnel**（1C 方法，已驗證可行） | 已經係本次唯一有完整 5-run 分佈嘅數據源；`perfRenders` 5 run 完全一致 = 極高重現性 | 同樣係代理；1C §7 已逐項標明邊啲同 09-02 baseline 可比邊啲唔可比 |
| **5** | **剔除規則 code 化**（W1 第 8 項） | 1E 嘅 44-deviceId 剔除係人手判斷。唔 code 化，after 再做一次會用另一把尺 → 「改善」可能純粹係剔除標準變咗 | — |
| **6** | **backend 累計 counter 做主指標** | `ops-metrics.json` 唔受 restart 影響、唔受 deviceId 污染影響、兩平台共用。**C9 嘅 1087/0 就係喺呢度攞到嘅**——本次最硬嘅證據 | 唔分平台 |

### 5.4 一句話

> **呢個項目嘅「可量測改善」實際上係靠 backend 累計 counter（最硬）+ 模擬器/AVD 代理量度（可重現）兩條腿行路；真用戶 telemetry 喺 n=1 部機嘅現實下，只可以做 regression 粗篩，唔可以做效果量化。** 任何波次報告如果用真用戶數字宣稱百分比改善，一律當唔過。

---

## 6. C12 Android 專項（1B 已出，2026-09-06 增量 re-cluster）

來源：`DEEP-AUDIT-1B-ANDROID-20260906.md`（Sonnet 5 執行）+ `DEEP-AUDIT-1B-OPUS-20260906.md`（Opus 5 驗收，含喺 AVD `hymntest` 帶負控嘅兩次重現）。
**證據前提（每次引用都要一齊寫）**：commit `75f8f95`（S1 patched embedded bundle 同 S2-S6 生產 OTA **係同一個 commit** —— 由 `~/.hymn-deploy/ota-groups.log` `2026-09-05T16:53:28Z | platform=android | sha=75f8f950…` 對返 AVD 收到嘅 `createdAt=2026-09-05T16:53:27Z`）；AVD `hymntest` 1080×2400；經 production tunnel；**所有 `source=stream` 起播數都係 progressive，唔係 HLS**（`backend/public/app-version.json` `hlsDeviceIds` 單機閘，AVD 唔喺名單）。

### 6.1 C12 明細

| ID | Finding | 嚴重度 | 證據強度 | 修法方向 | 要 Eric 拍板？ |
|---|---|---|---|---|---|
| **C12-1** | **詩歌庫畫面 mount 一次 = +170.9MB PSS / +142.5MB native heap / +2,576 View**，10 秒內到頂，之後 110 秒零增長；離開 tab 之後 View 還原 858 但 **native heap 唔還**（401MB）。峰值 TOTAL PSS ≈ 646-649MB | **P2** | **強**：兩次獨立 session 都精確落喺 `Views=3,434`；有「播歌唔撳詩歌庫」正控（+46%，Views 858→858 平坦）同「唔播放留首頁」負控（S1 raw 15 個 meminfo，Views 758→763→763） | 唔係洩漏，係 FlatList 對 6.5k 首歌嘅 render window 太闊 + 每 row 封面圖。①先量 `windowSize`/`initialNumToRender`/`removeClippedSubviews` 實際值；②`native heap 唔還`嘅候選係 RN/Fresco bitmap pool，要用 Fresco counter 或 `dumpsys meminfo` 分項確認先郁 | ❌（純技術，唔改行為） |
| **C12-2** | **外來權限對話框（`GrantPermissionsActivity`）在頂期間，全部 JS `setTimeout` 停行** —— 132 秒內 `perfHome`/`perfRenders t=15`/`perfMarks`/`perfRenders t=60` 一條都冇出，撳走之後 382ms 內全部湧到，同時 `wallClockDrift driftMs=131162`（≈ 對話框在頂時間） | **P3（真用戶）/ P2（儀器）** | **現象=強**（重現 1/1，加 1B 自己 17:37:45Z `driftMs=103998` 呢條獨立觀測）；**機制=弱**（最直觀嗰個 `JavaTimerManager.onHostPause()→clearFrameCallback()` 被負控推翻：單純撳 HOME 背景 95 秒，`setTimeout(60000)` **準時 fire**、零 drift） | 用戶側：唔修（首次安裝一次；而且 mark **值**冇被污染，只係**送**遲咗）。儀器側：**每條 beacon 加 `sinceLaunchMs = Date.now() - T0`**（併入 W1，見 §3 W1）。機制唔准寫落任何文件當已知，要查就開獨立單 | ❌ |
| **C12-3** | **一批「本來以為有問題」嘅嘢核實咗冇問題** —— ①合併 manifest 有齊 `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` / `WAKE_LOCK`，`MusicService foregroundServiceType="0x2"`，同 dumpsys `types=00000002` 對得上 → **Android 14+ FGS 型別要求已滿足**；②`runtimeVersion` android=4 唔對稱**唔影響落地** —— AVD 實測收到並套用咗 09-05 16:53 嗰個 android OTA，`CheckCompleteUnavailable` 確認已最新；③MediaSession `active=true controllers=8`、Now Playing 通知 `category=transport actions=5` + 歌名 + `android.mediaSession` token、FGS 3 分 15 秒持續存活 | **關單** | 強（`apkanalyzer manifest print` + `dumpsys` 原文，`1b-s5.log` L205/246/305） | 唔使做嘢。**1E §7「Android 零 telemetry」嘅解讀要更正：唔係 OTA 冇落地，係真用戶側 Android 裝機量細／beacon 冇 platform 欄（C1）** | ❌ |
| **C12-4** | **debug keystore** `CN=Android Debug`，裝置上 v2-only（`FA:C6:17:45:…`） | P2 | 強 | **已經係 C11 / V-3 / D-4 覆蓋緊，唔喺 W9 重覆開單** | ✅（D-4，換 keystore 對現有用戶嘅影響） |
| **C12-5** | release 合併 manifest 嘅 `<queries>` 帶住 `androidx.test.orchestrator` / `androidx.test.services` / `com.google.android.apps.common.testing.services`（androidTest manifest 併入咗 release） | **P3** | 強（`apkanalyzer manifest print`） | 建置衛生，歸 **C11 / W8**（要 native build 先驗到），唔喺 W9 | ❌ |
| **C12-6** | media notification churn：3 分鐘 2 首歌 `numEnqueuedByApp=33 numPostedByApp=2 numUpdatedByApp=14 numRemovedByApp=17` | **P3** | **弱**（單次觀察、冇對照、冇正控） | **唔准做修法**。W9 加一次帶對照嘅量度（同一 3 分鐘、`repeatMode` 唔同、有／冇鎖屏）先講。同 memory `project-3dd0a28-verification-findings`「RNTP ANR workaround 剷媒體通知」同一區，唔好夾硬砌因果 | ❌ |
| **C12-7** | **仲未答**：§6 舊版列出過但 1B 完全冇測 —— `ADMIN-002`（Android `AdminEditHymnSheet` 冇 KAV）、`INF-008`（headless service 冇 handler，app swipe 走之後播完一首會點）、`INF-007`（六個 Remote handler 無 catch） | 沿用 1A 原判（ADMIN-002 = P1） | ➖ | **入 W9 範圍**（見 §3 W9），三項都係「開個 app 撳幾下就答到」，唔使 build | ❌ |

### 6.2 1B 令其他 cluster 要改嘅結論

| 目標 | 改動 |
|---|---|
| **C1 / W1** | ➕ **加 `sinceLaunchMs`**（見 §3 W1 範圍欄）。理由：C12-2 證實 `t=15`/`t=60`/`perfMarks@25s` 只係**名義** delay，實際到達可以遲 132 秒而且喺 beacon 本身冇任何痕跡。**唔使加 `dialogBlockedMs`** —— `sinceLaunchMs − 名義 delay` 就係。➕ `navBeaconsSent` cap 10→40 由「1 個平台撞到」變「兩個平台各撞一次」（1C + 1B S3 都係 15 tap 得 10 條），優先序不變 |
| **C4 / C6 / W6** | ⚠️ C12-1 落喺呢區。09-02 做嘅「Library idle pre-mount」（`libIdle` 840-871ms）**只 mount 個殼**：撳 tab 之前 `Views` 一直係 755-858，真代價全部集中喺撳 tab 嗰 10 秒。W6 郁 render/memo 嗰陣要連 FlatList window 一齊睇 |
| **N-7** | 🔴 **放寬**（見 §4 N-7）：唔好剷 |
| **N-8** | ⚠️ **補一句**（見 §4 N-8）：Android emulator shaping 部分生效但未校準 |
| **C9 / stall 線** | ➖ 冇改。1B 呢個 30 分鐘窗口零 stall／零救援訊號，但樣本得 4 首歌，**唔可以**當 Android stall 率 baseline |
| **1E §7** | 見 C12-3②：「Android 零 telemetry」唔可以解讀成「Android OTA 冇落地」 |

### 6.3 唔可以引用 1B 邊啲數字

見 `DEEP-AUDIT-1B-OPUS-20260906.md` §9（15 條）。最要緊嗰四條：①§4.2「播放期間 +103%」歸因錯（係詩歌庫）；②限制 #1「S1 同 S2-S6 唔同 commit」前提錯（同一個 commit）；③§4.3 logcat / 返回鍵 / 鍵盤三行冇任何 raw 入 archive（返回鍵嗰句仲引用咗一批唔存在嘅截圖）；④§5 弱網全節冇儀器正控。
Phase 3 嘅 Android 改前基準一律用 `DEEP-AUDIT-1B-OPUS-20260906.md` §8。

---

## 7. 附：finding → cluster 對照（去重後）

| Cluster | 1A | 1D | 1C | 1E |
|---|---|---|---|---|
| C1 | INF-010, INF-002(部分) | CLOG-1, DEAD-2 | 限制#6, #13 | §2.3, §4.1, §4.4, §1, §3.2, §6 全部 |
| C2 | SCR-001/002/003/007/017/018, AUTH-003/004, CACHE-001, PL-001 | — | — | — |
| C3 | AUTH-001, INF-001/011, SCR-004/005/008/012/013, HOME-001, APP-004 | — | — | §5（401×1） |
| C4 | AUTH-002, ADD2PL-001, ADMIN-001, APP-002, SCR-006/010/011/014, HOME-002, (APP-001→D-7) | — | S2/S3/S5 全表 | §3.1 perfRenders 觀察點 |
| C5 | SCR-015/019/020, APP-005, HEARTBEAT-001, HOME-002 | — | — | — |
| C6 | — | CLOG-1, OTP-1, LOGIN-P2, SRV-2, SRV-5, ADM-1/FRIENDS-1/ME-1 | — | §5 access 表 |
| C7 | CACHE-002, INF-009 | RESOLVE-P2b, HLS-1, F6 | — | §5（cacheSize、RSS caveat） |
| C8 | — | RESOLVE-P1, RESOLVE-P2a, F1, (USERDB-P2→N-1) | — | §4.6 |
| C9 | — | （1D 未列，本次 V-5 新發現） | — | §4.6（`All yt-dlp strategies failed` 31 次/日） |
| C10 | APP-003, AVATAR-001, icon ×6, dead export ×6, (INF-004→D-2) | F5, 410 stub ×4, (F8→N-2) | — | §5（deprecated-route 零命中） |
| C11 | DEP-001, DEP-002/004(V-4 補), PLG-002, PATCH-001, eas.json(1A 漏讀) | F2, F4 | §0 build provenance | — |
| C12 | ADMIN-002, INF-007, INF-008, SCR-009 | — | — | §7 Android 全零 |
| C13 | INSET-001, SCR-016, (INF-002→N-6) | HOME-1, REQAUTH-P3, SRV-3, STR-1 | — | — |

**1A 66 條**：61 條入 cluster、1 條升拍板（INF-004）、1 條升獨立單（APP-001）、3 條入唔做（INF-002、CACHE-003、+APP-003 已入 C10）。
**1D ~25 條**：21 條入 cluster、4 條入唔做（USERDB-P2、F8、F3、SRV-3 部分）。
**1C**：4 條限制轉成 cluster 輸入（#6 儀器 cap、#13 log 污染、#7 HLS 路徑未覆蓋 → D-2、#8 弱網 → N-8）；全部 baseline 數字成為 W6 主 before。
**1E**：全份報告嘅 6 條「已知限制」入面 3 條係 C1 造成、1 條係 N-9、1 條係 N-10、1 條（A-6 冇 before）由 W1 `updateId` 修。
