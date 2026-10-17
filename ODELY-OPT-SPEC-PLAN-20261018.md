# Odely 現行架構優化規格（Gemini 第二版）—— 逐項核對 + 計劃書 2026-10-18

> 狀態：**純計劃，未動 code**。等 Eric 審批先執行。
> 核對基準：branch `feature/player-rebuild` HEAD `af41a1e`（2026-10-17）。逐項讀過 `src/sync/userSync.js`、`src/hooks/useOutboxLength.js`、`App.js`（insertNextImpl / PlaybackActiveTrackChanged / pollState / liveHymn / resyncFromNative）、`src/perfMarks.js`、`src/hooks/useCachedHymns.js`、6 個 screen 嘅 `Cover`/`Heart`、`react-native.config.js`。
> 紅線（Eric 強調）：**唔改** gorhom inline `<BottomSheet>` 結構、OdeIcon 系統、`designSystem.js` 色板、HLS／Native／JS watchdog 計時門檻與保護邏輯。下面每項都標明有冇踩親。

## 0. 總結

今次規格**係對住現行 code 寫嘅**（檔名、行為、變數名全部對得上），質素明顯好過上次。14 個細點：

| 判定 | 項目 |
|---|---|
| ✅ 屬實，建議方案恰當 | 1a outbox lost-update（真 bug）、1b outbox length 輪詢、2 insertNext 漏 HLS 預檢、3b O(N) 查找、4a Cover/Heart 重複、4b fetchWithTimeout 重複、4c-i `DEVICE_ID` 死碼、4c-ii `react-native.config.js` 殘留、4d 更新兩份舊鐵律文件 |
| ⚠️ 屬實但唔建議照做（踩紅線／刻意設計） | **3a 移除 pollState**（watchdog 保護區，安全網）、**3c 關 perf beacon**（刻意常開嘅儀器，仲有量度未收爐） |
| 嚴重度 | 1a 係唯一「會蝕用戶資料同步」嘅真 bug（P0 合理）；2 係 iOS HLS 用戶（Eric/Joy）邊緣情況（P1）；其餘係效能／整潔（P1–P2） |

**冇一項需要 native build；全部純 JS → 一次 OTA。** 唔掂 gorhom／OdeIcon／色板。踩紅線嘅只有 3a（watchdog 保護邏輯）同 2 嘅實作位置（PlaybackActiveTrackChanged handler 旁邊，要小心抽離）。

---

## 1. 逐項核對

### 1a `userSync.js` outbox 並發覆寫（Lost Update）—— ✅ 屬實，P0 合理
- **證據**（`src/sync/userSync.js`）：`enqueue()`（:71）= `writeOutbox(collapse([...readOutbox(), op]))` 即時落 MMKV 再 `flush()`；`flush()`（:127）開頭 `queue = collapse(readOutbox())` 攞一次快照，`while` 入面 `await runOp(op)` 成功後 `queue = rest; writeOutbox(queue)`（:142–143）——用閉包舊快照**覆寫** MMKV。期間 UI 撳心心／改歌單嘅 `enqueue()` 會先寫入 MMKV，然後被 :143 蓋走；`_pendingFlush` 補跑嗰次 `readOutbox()` 已經冇咗新 op。**規格描述完全準確。**
- **影響面**：`fav_add/fav_remove`、`pl_upsert`、`pl_delete`（`FavoritesContext.js:49`、`PlaylistsContext.js:56/132`）。本地 state 已更新（用戶睇落正常），但該 op 永遠唔會上 server，直到下次登入合併 `pushSync` 全量推——即係**跨裝置同步靜靜漏一次**。`pl_upsert` 下次任何改動會帶整個 playlist 再推，自癒；`fav_*` 唔會自癒。觸發條件要「正有 op 喺網絡飛緊」同時用戶再操作——真機蜂窩網 300–1000ms 窗口，連撳兩個心心就中。**判 P0 合理**（資料同步正確性）。
- **方案評估**：規格建議「成功後重讀 `readOutbox()`，按身份剔走啱啱成功嗰個 op，兼容 collapse」**恰當**。細節：
  - op 身份用 `op.ts`（`enqueue` 已加）+ `op.op` + key（`hymn_id` / `playlist.id` / `id`）三合一比對；唔好只用 `ts`（同一毫秒兩個 op 可能）。
  - collapse 兼容：如果重讀後同一 playlist 嘅 `pl_upsert` 已經係更新 `ts`（即 enqueue 嗰邊 collapse 已剷走飛緊嗰個），`filter` 自然搵唔到舊 op → 零刪除，新嗰個保留——規格講嘅正確。
  - `break`（fail 即停）嗰條路照舊唔寫（原封不動）。
  - 另加一個 harness（babel 真 module + mock MMKV + 可控 `runOp` 延遲）重現：flush 中 enqueue → 修前丟 op／修後保留；連撳兩心心；pl_upsert 連續兩次；fail 中途 enqueue。
- **紅線**：唔涉。**風險**：低（純 JS、邏輯細、有 harness）。但 `userSync` 係 `401=登出` 路徑所在（`checkAuth`），改動唔准掂 `checkAuth`／`reportUnauthorized`。

### 1b `useOutboxLength` 每 2 秒輪詢 —— ✅ 屬實，低優先，方案恰當
- **證據**：`src/hooks/useOutboxLength.js` `setInterval(..., 2000)` 讀 MMKV + `JSON.parse`，檔頭自己都寫「冇專用事件通知，poll 一下夠用」。只喺 Mine／Account 頁 mount 時行。
- **方案**：`userSync.js` 用 `createExternalStore`（`src/hooks/externalStore.js` 已有，`useCachedHymns`／`progressStore` 都用）暴露 `outboxLength`，`writeOutbox()` 時 `setState`；hook 改 `useSyncExternalStore`。**恰當**，順手做。
- **風險**：零（UI 顯示用）。

### 2 `insertNextImpl` 漏 HLS `preflightHls` —— ✅ 屬實，建議降為 P1
- **證據**：`App.js:1156–1200` `PlaybackActiveTrackChanged` 對 `idx+1` 做非阻塞預檢 + `isExplicitHttpFailure` + 對位 native queue 熱換（有 race guard、近尾 15 秒唔換、`hlsDowngradedTrackRef` 去重）；`insertNextImpl`（:2630–2725）插入後只 `warmIds([hymn.id])`（:2720）+ beacon。插入嗰首變成 `idx+1`，但預檢只喺「上一次轉歌嗰刻」做過一次（嗰時 `idx+1` 仲係另一首），所以**漏咗**。規格準確。
- **影響面**：只係 `Platform.OS==='ios' && HLS_ENABLED`（而家 `hlsDeviceIds` 名單 = Eric + Joy 兩部機），而且要撞正嗰首歌 playlist 404/403（googlevideo 窗，~1–2%）。後果：播到嗰首先撞 `PlaybackError`→現有 `hlsFallback` 分支降級（慢 4–5 秒）或極端情況被 16 秒 native watchdog 跳歌。**唔係冇保護，係少咗「早一步」**——建議 **P1**，唔係 P0。
- **方案評估**：抽共用 helper（`preflightAndSwapNext(song)`）**恰當**，但要注意：
  - helper 必須**一字不改**現有 guard 鏈（去重 Map 封頂 200、`hlsDowngradedTrackRef`、native 對位、`nativeIdx <= curIdxNow` 唔換、近尾 15 秒唔換、`isExplicitHttpFailure`）——呢段係 HLS-PREFLIGHT Opus 兩輪驗收嘅平衡位。
  - **紅線接觸**：helper 住喺 `PlaybackActiveTrackChanged` handler 隔籬（watchdog／stall 保護區）。純「抽出 + 多一個 call site」唔改任何門檻，但要 Opus 逐行核 diff 證明 trackChanged 路徑行為 byte-for-byte 不變。
  - `insertNextImpl` 嗰邊：插入成功、`queueRef` 已更新之後先 call；只喺插入位 === `curIdx+1`（即真係「下一首」）先預檢；搬位（`moved=1`）同樣適用。
- **風險**：中（紅線區抽離）；收益：細但真實。

### 3a 移除 2 秒 `pollState` —— ⚠️ 屬實但**唔建議**（踩 watchdog 紅線、安全網）
- **證據**：`App.js:2493–2512` 獨立 `useEffect`，每 2 秒 `getPlaybackState()` → `setTrackState`。同時存在：`TPEvent.PlaybackState` listener（:968）同主 `poll()` loop（:2164 `sleepPollInterval`，1s/2.5s 自適應，亦會 `setTrackState` :1026）。表面上係第三條重複路。
- **點解唔刪**：`:1652–1668` 註解記錄 08-11/08-12 Eric 真機兩單事故（SwiftAudioEx 卡死 state、唔 fire event），整套 stall/watchdog 設計係「多條獨立讀取路徑互相補位」；pollState 係 `queueReady` 後唔受主 loop 邏輯分支影響嘅最簡單 state 鏡像。主 `poll()` 同 PlaybackState listener 曾經各自失效過（memory：`project-stream-lockscreen-stop-rootcause`、`project-ios-midtrack-stall-fix`）。**呢段屬 Eric 強調嘅「JS Watchdog 保護邏輯」紅線**，09 月起規定「唔准掂，除非 Opus 論證 + Fable 批」。
- **收益評估**：每 2 秒一個 bridge call（`getPlaybackState` 係讀 native 內存，<1ms），耗電增量可忽略；規格講「無條件喚醒」係對嘅，但 JS 線程本身已經因主 `poll()` 每 1–2.5 秒醒一次，拆呢條唔會令 CPU 真正進入長 idle。
- **建議**：**唔做**。如果日後要瘦身，先由 Opus 寫一份「三條 state 讀取路徑各自覆蓋邊種失效」嘅論證，再決定合併邊兩條。
- **風險（如果照做）**：中–高——重現 08 月嗰類「App 顯示播放緊但已停」而冇人知。

### 3b O(1) 歌曲查找 Map —— ✅ 屬實，方案恰當，低風險
- **證據**：`FullScreenPlayerOverlay` 每次 render `player.hymns.find(...)`（:3636，N≈6,700）；`resyncFromNative` 每首 `lib.find`（:1600，queue 長度 × N）。前者 render 頻率已經由 `progressStore` 拆開（唔會每秒），所以實際每次 find ~0.3–0.6ms；後者冷啟 resync 一次 queue×N（例如 50×6,700 = 33 萬次比對，~5–15ms）。**真但細**。
- **方案**：喺 `useCachedHymns.js` 嘅 `hymnsStore` 旁邊維持 `hymnsById: Map`（`setState` 時重建一次），export `getHymnById(id)`；`App.js` 兩處改用。比規格講「`App.js` `useMemo`」更好——store 層一次建，所有 consumer 共享，而且 `resyncFromNative` 用 `hymnsRef`（非 hook）都用得。
- **風險**：零–低。注意 id 型別（string/number 混用，現有 code 全部 `String()` 比對，Map key 統一 `String(id)`）。

### 3c 關掉 `PERF_MARKS_ENABLED` —— ⚠️ 部分屬實，**建議暫時唔關**
- **證據**：`src/perfMarks.js:29` `= true`；檔頭 E-4 註解明寫「效能工程期間保持開……收爐之後應該關返 false」。每次開機 4 條 beacon + ≤10 perfNav（封頂 40），fetch 包一層只數首 30 秒 request 數（唔改行為，100% try/catch）。
- **點解仲唔關**：(i) 第一首歌 step 0+1（09-10 部署）嘅 **after 量度一直欠真機數據**（memory `project-first-track-step01`），`perfHome`/`perfMarks`（`mmkvRead/parse/hymnsMs`）係對照指標之一；(ii) 10-03 OTA 真機落地覆核就係靠 `perfHome/perfRenders/perfMarks` 證明新 bundle 冇回歸；(iii) 成本：每次開機幾 KB 上行 + backend client-log 幾行，Eric/Joy 兩部機每日幾次開機——可忽略。
- **建議**：**保留**，改為一行 TODO：「第一首歌 after 量度收爐後 flip false」。如 Eric 堅持關，改為綁 `DIAG_ENABLED`（規格嘅第二選項）係對嘅做法，唔要直接 `false`。
- **風險**：關咗 = 失去真機回歸證據來源；開住 = 零風險。

### 4a 抽共用 `<CoverImage>` / `<FavHeart>` —— ✅ 屬實，P2，方案恰當
- **證據**：`Cover` ×6（`MineScreen/LibraryScreen/HymnListScreen/PlaylistDetailSheet/SharedPlaylistSheet` size 52、`AdminAddHymnScreen` size 48 + `videoId` prop），5 個係**逐字相同**（含 S6 `useEffect(() => setFailed(false), [youtubeId])`）；`App.js:309` 另有 `CoverImage({youtubeId, style})`（播放器用，API 唔同）。`Heart` ×3（`LibraryScreen/HymnListScreen/HomeScreen`）逐字相同；`App.js:367` `FavHeart` 係播放器版。
- **方案**：抽 `src/components/CoverImage.js`（支援 `size` + `style` 兩種用法）同 `src/components/FavHeart.js`，6+3 處引用；**保留 S6 修復**；AdminAddHymn 嗰個 `videoId` 命名要對齊。`App.js` 兩個播放器版可以一齊併（視覺要逐個對）。
- **紅線**：唔涉（OdeIcon 照用、色板照用）。**風險**：低–中（純 UI 搬遷，但 9 個畫面要截圖對照；LibraryScreen FlatList 行內組件改動要睇滑動效能）。

### 4b `fetchWithTimeout` 重複 —— ✅ 屬實，瑣碎
- `App.js:398` 同 `src/hooks/useCachedHymns.js:13` 逐字相同。搬去 `src/api.js`（或新 `src/net.js`），兩處 import。零風險。

### 4c-i `DEVICE_ID` 死碼 —— ✅ 屬實
- `App.js:161` `let DEVICE_ID = null;`、:4493–4496 獨立 `useEffect` 填值；全 repo **零讀取**（deviceId 已由 `src/deviceId.js` + `clientLog.js` 自行注入）。刪變數 + 該 effect（保留隔籬 `/api/app-version` effect）。零風險。

### 4c-ii `react-native.config.js` 殘留 —— ✅ 屬實，只影響 native build
- `assets: ['./node_modules/react-native-vector-icons/Fonts', './assets/fonts']` 而 `react-native-vector-icons` 已唔喺 `package.json`、`node_modules` 冇該目錄。OTA 唔受影響；下次 native build 時 asset linking 會 warning/skip。刪該項 + `dependencies['react-native-vector-icons']` 整段。零風險（純 build 設定）。

### 4d 更新 `BLUEPRINT.md` / `HYMN-APP-IRON-RULES.md` —— ✅ 屬實，強烈同意（上次計劃書已提）
- 兩份仍寫 v117 雙電梯／Spotify 綠／MaterialIcons，**正正係上次 Gemini 寫錯規格嘅根源**。
- 建議內容（規格列嘅齊晒）：inline gorhom `<BottomSheet>` + 禁 portal 原因（`App.js:72–99` 註解）；OdeIcon 單一來源；`designSystem.js` 暖光／主色；`externalStore` 進度隔離；HLS／Native／JS watchdog 紅線（含「唔准掂」清單同點解）；保留仍有效嘅兩條（禁 `onLayout` 驅動 native 動畫、APK build 指令）；頂部標明「v117 版本見 git `0de3b6c`」。
- **注意**：兩份文件寫明「未經恒恒明確允許不可違反」——改佢哋本身要 Eric 書面批准（呢份計劃書就係攞批准）。

---

## 2. 紅線核對總表

| 項 | gorhom sheet | OdeIcon | designSystem | HLS/Native/JS watchdog |
|---|---|---|---|---|
| 1a/1b | — | — | — | — |
| 2 | — | — | — | **接觸**（抽離 trackChanged 旁 helper；門檻零改動，要 Opus byte-level diff） |
| 3a | — | — | — | **踩**（移除安全網）→ 唔做 |
| 3b | — | — | — | — |
| 3c | — | — | — | — |
| 4a | — | 照用 | 照用 | — |
| 4b/4c | — | — | — | — |
| 4d | 文件 | 文件 | 文件 | 文件（寫入紅線） |

---

## 3. 建議執行順序（全部 Sonnet → Opus → 一次 OTA）

| 順序 | 項 | 理由 |
|---|---|---|
| ① | **1a outbox lost-update** + 1b external store | 唯一真資料 bug；harness 可重現；獨立 commit |
| ② | 3b `hymnsById` Map + 4b fetchWithTimeout 合一 + 4c-i `DEVICE_ID` 死碼 + 4c-ii config 殘留 | 低風險整潔，一個 commit |
| ③ | 4a CoverImage/FavHeart 抽離 | 9 畫面截圖對照（iOS sim 一次） |
| ④ | 2 insertNext HLS 預檢 helper | 紅線區，獨立 commit，Opus 逐行核 trackChanged 零改動 + harness（mock TrackPlayer）兩條路徑 |
| ⑤ | 4d 兩份鐵律文件重寫 | 要 Eric 批文字；同 OTA 無關 |
| ✗ | 3a pollState、3c perf beacon | 唔做（理由見上）；3c 留 TODO 等第一首歌 after 量度收爐 |

OTA 一次包 ①–④（+ 10-02 之後任何未推 App 端改動——目前冇）。OTA 前照舊：worktree 乾淨核對、Opus 推前驗收、gate 批准；推後監察 401／crash／`perfRenders` 對照。

## 4. 要 Eric 拍板
1. 批 ①–④ + ⑤？
2. 同意 **唔做 3a**（pollState）同 **暫時唔關 3c**（perf beacon）？如果堅持 3c，用「綁 `DIAG_ENABLED`」而唔係寫死 false。
3. 4d 文件重寫：批准改 `BLUEPRINT.md`／`IRON-RULES.md`（文件自己要求書面批准）。
