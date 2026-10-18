# Odely 優化 報告 2026-10-18

基準 HEAD `d74c483`（plan）；執行 branch feature/player-rebuild。只出證據，唔判 PASS/FAIL。

## §0 基準：react-harness 紅 → 綠

**紅（修前，`node run.js`）**
```
Error: prepareSource: 搵唔到預期嘅 MMKV import 行,sed 冇得做。source=.../src/hooks/useCachedHymns.js
```
成因：`useCachedHymns.js` 已改為 `getStorage` from `../storage`、另有 `../perfMarks`、`react-native`（InteractionManager）import，唔再直接 `import { MMKV } from 'react-native-mmkv'`。

**修法（commit b6b98e3，只改 harness）**
- `lib/prepareSource.js`：改為 RULES 表（MMKV 舊版 / storage / perfMarks / react-native / config），diff 行數必須 = 實際命中規則數（assertion 保留）。
- 新 `mocks/storageStub.js`、`mocks/perfMarksStub.js`、`mocks/reactNativeStub.js`。
- `lib/testEnv.js` `makeFetchMock` 同 `scenarios/notifyHymnsChanged.js` 內嘅 inline fetch mock：補 `text()`（現行 hook 用 `r.text()`，mock 原本只有 `json()`）。**斷言一字未改**；`useCachedHymns.js` 未改。

**綠（修後，對住基準 HEAD 嘅 useCachedHymns.js）**
```
[prepareSource] sed diff 行號: 2, 3, 4, 6
✅ PASS killerPath / coldBootNoCache / versionChanged / notifyHymnsChanged / unmountNoWarning
結果:全部 5 個場景過
```
中途證據：只修 import 未補 `text()` 時 2/5 → 補 testEnv 後 4/5 → 補 notify 場景 mock 後 5/5。
舊版負控（`HARNESS_SOURCE_DIR`=c9bd715 checkout）：killerPath FAIL（硬性驗收要求嘅紅）；versionChanged 亦 FAIL（舊版行為/mock 差異，未深究，非本任務範圍）。

## §① 1a outbox lost-update + 1b outbox length store（commit 0c4fab4）

**1a** `src/sync/userSync.js` `flush()`：`runOp` 成功後 `latest = collapse(readOutbox()); next = latest.filter(x => !sameOp(x, op)); writeOutbox(next); queue = next;`。`sameOp` = `op.op` + `ts` + key（fav_*→hymn_id；pl_upsert→playlist.id；pl_delete→id）。`break` fail 路徑、`_flushing/_pendingFlush`、`checkAuth`/`reportUnauthorized` 一字未改（diff 內只有 import 區 hunk header 出現 reportUnauthorized 字樣作 context）。
**1b** `outboxStore = createExternalStore({ length: readOutbox().length })`（export）；`writeOutbox()` 後長度有變先 `setState`；`getOutboxLength()` 保留；`useOutboxLength` 改 `outboxStore.useStore().length`（externalStore 內部已係 useSyncExternalStore），移除 setInterval。
Diff：userSync.js +28/-3；useOutboxLength.js +5/-9。

**usersync-harness**（`frontend/hymn-app/tools/usersync-harness/run.js`，babel 真 module 記憶體載入、唔寫 .tmp；mock MMKV/fetch 可控延遲；OLD = `git show d74c483:…userSync.js`）

| 場景 | NEW | OLD（負控） |
|---|---|---|
| (a) flush 中 enqueue fav_add → 被推 | PASS pushed [POST 1, POST 2] | FAIL pushed [POST 1]（op2 丟） |
| (a2) op1 完成後 outbox 仍含 fav_add:2 | PASS | FAIL after=[] |
| (b) 連撳（再 enqueue add 3 + remove 1）四個 op 全推 | PASS [P1,P2,P3,D1] | FAIL 只推 [P1,P2] |
| (c) pl_upsert 飛緊中更新 ts → 新嗰個保留並推 | PASS 3 項 | FAIL 2 項（after=[]、只 PUT 一次） |
| (d) runOp fail 中途 enqueue → queue 原封 + 新 op 保留、fail 即停 | PASS 3 項 | PASS 3 項（fail 路徑兩版一致，符合「原封不動」） |
| (e) outbox length store 隨 write 即時變 [0,1,2,3,3,0,0]、=getOutboxLength | PASS 2 項 | FAIL（冇 outboxStore） |

NEW 14/14；OLD 7 pass / 6 fail（負控成立）。

**四個 harness 尾段（階段①完成後）**
```
insertnext-harness: 66 passed, 0 failed
H-A: 14 pass / 0 fail
H-B: 26 pass / 0 fail
react-harness: 結果:全部 5 個場景過
usersync-harness: NEW 14/14;負控 OLD fail 6
```

## §0 紅線逐條核（階段①）
- gorhom BottomSheet / OdeIcon·odeIcons / designSystem / watchdog 函數與門檻：未碰（本階段只改 userSync.js、useOutboxLength.js + tools/）。
- 3a pollState、3c PERF_MARKS：未做。
- 唔部署/OTA/eas/restart；未掂 backend/；未讀 secret；git 只 pathspec commit。

## 偏離 / 側效應
- 偏離：react-harness 除 prepareSource.js 外亦改 testEnv.js mock 同 notifyHymnsChanged.js 場景內嘅 fetch mock（只補 `text()`，斷言不變）；新增 3 個 mocks stub。
- 側效應：`useOutboxLength` 不再輪詢；`userSync` 新增對 `hooks/externalStore.js` 嘅 import（純依賴 react）。flush 成功後 loop 會喺同一次 flush 內直接推飛行期間新加嘅 op（`_pendingFlush` 補跑隨後見空 outbox）。
- 未做：useOutboxLength hook 嘅 React render 層測試（store 層已測，hook 僅一行 `useStore()`）；真機/模擬器未驗。

## §①-修正（Opus 驗收 M1/M2/L1 補修）

只改 `frontend/hymn-app/src/sync/userSync.js`（+34/-9）；`checkAuth`/`reportUnauthorized`/`break`/`_flushing`/`_pendingFlush` 一字未改。
- **M1**：flush 維持本輪 `done` 清單，重讀後 `collapse(raw).filter(x => !done.some(d => sameOp(x,d)))`；另加硬上限 `initialLen + 50`，超過 `break` + `sendClientLog('outboxLoopGuard', …)`。
- **M2**：`readOutbox()` 讀錯（getString throw / JSON 壞 / 非 array）回 `null`；flush 重讀遇 `null` → `queue.slice(1)`（舊版行為），不寫 `[]`。其他 caller（`getOutboxLength`、`enqueue`、store 初始值、flush 起手）經 `readOutboxOrEmpty()` 當 `[]`。
- **L1**：`enqueue` 加 module-level 單調 `seq`（每次 enqueue 先由現有 outbox max seq 校正再 +1，重啟後延續）；`sameOp` = op + key + ts + seq，任一邊冇 seq（舊格式）退返 ts 比對。

新增 harness 場景（`tools/usersync-harness/run.js`，+ mock 加 `setThrows`/`getThrowOnce`、`PREV_SHA` 額外負控）：

| 場景 | NEW | OLD d74c483 | PREV 0c4fab4（修前） |
|---|---|---|---|
| (f) set 持續 throw + 2 op：推 ≤ 52、outbox 保留 | PASS（fetch=2） | PASS | FAIL（fetch=301 被安全閘截停＝無限重推） |
| (g) 飛行中 getString throw 一次：op2 仍推、fail 後 outbox=[fav_add:2] | PASS 2 項 | PASS | FAIL（op2 被 `[]` 蓋走，從未推） |
| (h) 同毫秒同 id pl_upsert 兩個／fav add→remove→add 全保留次序 | PASS 2 項 | FAIL 2 項 | FAIL 2 項 |
| (i) 舊格式（冇 seq）op 照推＋飛行中新 op 保留 | PASS | FAIL | PASS |

NEW 21/21；OLD 11 pass / 9 fail（負控成立）；PREV 16 pass / 4 fail。

四個 harness 尾段：
```
insertnext-harness: 66 passed, 0 failed
H-A: 14 pass / 0 fail
H-B: 26 pass / 0 fail
react-harness: 結果:全部 5 個場景過
usersync-harness: NEW 21/21;負控 OLD fail 9
```
側效應：outbox op 多一個 `seq` 欄位（伺服器 push 只用 op 內容欄位，runOp 不送 seq）；L2 未處理（Opus 評為低、只影響顯示）。未部署/OTA/eas/restart，未掂 backend。

## §② 3b hymnsById + 4b fetchWithTimeout 合一 + 4c-i DEVICE_ID + 4c-ii rn config + 3c TODO

**改動**
- 3b `src/hooks/useCachedHymns.js`：`createExternalStore` 結果包成 `_hymnsStoreBase`，`hymnsStore.setState` 薄包裝：partial 帶 hymns array 就先重建 module-level `hymnsById`（key `String(id)`）再轉交 base.setState。**所有 call site（7 處 setState）一字未動**，次序/內容不變。新 export `getHymnById(id)`（null→undefined）。`App.js` liveHymn（原 :3636）改 `getHymnById(snapshotHymn.id)`；`resyncFromNative` toHymn（原 :1600）只改 lookup 一行為 `getHymnById(t.id)`，`lib.length === 0` 判斷（lib=hymnsRef.current）保留。`hymnsRef` 保留。
- 4b `fetchWithTimeout` 搬 `src/api.js`（export，邏輯一字不差）；`App.js`（刪本地定義 + `import { fetchWithTimeout } from './src/api'`）、`useCachedHymns.js`（刪本地定義 + `import … from '../api'`）。
- 4c-i App.js 刪 `let DEVICE_ID`（含孤兒註解）+ 填值 effect；`/api/app-version` effect 保留；`getOrCreateDeviceId` import 仍被 app-version effect 用，保留。
- 4c-ii `react-native.config.js`：刪 vector-icons dependency 段與 Fonts asset，保留 `./assets/fonts`。
- 3c `src/perfMarks.js` `PERF_MARKS_ENABLED` 上加 TODO 一行，值仍 true。
- react-harness：`lib/prepareSource.js` RULES 加 `api(fetchWithTimeout)`（`../api` → `mocks/apiStub.js`）；新增 `mocks/apiStub.js`（fetchWithTimeout 同源實作）；README 維護紀律加 `../api`。場景斷言零改動。sed diff 行號 2,3,4,6,7（= 5 條命中規則，assertion 過）。

**grep 證據（git grep DEVICE_ID\b，排除 md）**：App.js 零命中；餘下只有 backend/routes/presence.js 的 `DEVICE_ID_RE`（另一標識）、src/deviceId.js `DEVICE_ID_KEY`（不同符號）。`fetchWithTimeout` 全 repo 現僅 api.js 定義 + 兩處 import。
**getHymnById 實測**（patched module 臨時 export store）：set [1,'2'] → getHymnById('1')/(2) 命中、(3) undefined；`setState({loading:false})` 不重建 Map；換 hymns 後舊 id 消失、新 id 命中。
**parse**：@babel/parser（jsx）App.js / api.js / useCachedHymns.js / perfMarks.js 全 OK。

**四個 harness 尾段**
```
insertnext-harness: 66 passed, 0 failed
H-A: 14 pass / 0 fail
H-B: 26 pass / 0 fail
react-harness: 結果:全部 5 個場景過
usersync-harness: NEW 21/21;負控 OLD fail 9
```

**§0 紅線核**：gorhom / OdeIcon·odeIcons / designSystem / watchdog 函數與門檻未碰；`resyncFromNative` 只改 lookup 一行；PERF_MARKS 值不變、pollState 未動；未部署/OTA/eas/restart、未掂 backend、git 只 pathspec。
**側效應**：(1) liveHymn 由 `player.hymns.find` 改查 store 的 Map，兩者同源（hook 讀 hymnsStore），Map 於 setState 前更新，僅比 React render 早一拍；(2) 重複 id 時 Map 取最後一個、舊 find 取第一個（庫內 id 唯一，未見重複）；(3) App.js 現新增對 src/api.js 的 import（api.js 本已被各 screen 使用）。

---
## §⑤ 重寫 BLUEPRINT.md + HYMN-APP-IRON-RULES.md（v2，純文件）

- `BLUEPRINT.md` 目錄：一播放器佔位結構／二 Sheet 層／三 Icon 與設計系統／四 資料流與 store／五 播放路徑／六 Watchdog 三層／七 部署與監察／八 仍然有效舊規（共約 60 行）。
- `HYMN-APP-IRON-RULES.md` 目錄：一 UI 與動畫／二 Sheet／三 Watchdog／HLS 紅線／四 Store 與資料／五 Build／部署／六 環境與私隱（每條：乜嘢／點解／改動程序）。
- 頂部均標「v2（2026-10-18）取代 v117（git `0de3b6c`）」+ 舊版雙電梯／Spotify 綠／MaterialIcons 已取代一句。
- 引用行號（App.js）：gorhom 禁 portal 72–99、SheetTouchable 91–95、BottomSheet 3848、HLS_ENABLED 158、progressStore 405、預檢 ~1137–1200、`BUFFERED_ADVANCING_CAP_TICKS` 1778、pollState ~2480 / 理據 ~1640、sleepPollInterval 2147、NATIVE_WD_V2 4805、前台 10 秒提示 1708。
- 未寫入任何密鑰／內網 IP／電話／chat id／device id；未改任何 code。

## §①-尾巴(Opus2 發現 1–3)

只改 `frontend/hymn-app/src/sync/userSync.js` + `tools/usersync-harness/run.js`。§0 紅線(`checkAuth`/`reportUnauthorized`/`break`/`_flushing`/`_pendingFlush`)未動。

1. **flush 重讀 null**:只 `queue = queue.slice(1); continue`,**唔寫 MMKV**。持久化保留已推 op,下次成功重讀靠 `done` 剔走。取捨:已推 op 暫留在 MMKV,下次 flush 可能重推一次(op 對 server 冪等:fav_add/remove、pl_upsert PUT、pl_delete)。(g) 斷言因此由「== [2]」放寬為「含 fav_add:2」。
2. **enqueue 讀錯**:揀 **side buffer**(`sync.outbox.pending.v1`)。理由:冇丟用戶動作、冇覆寫持久化主隊;複雜度可控(一個 reader + 一個 merge helper,enqueue/flush 起手都經 `readOutboxMerged`)。分兩種讀錯:`throw`(getString 本身 throw,暫時性)→ 新 op 入 side buffer,下次主隊讀成功併返並清走;`corrupt`(JSON 壞/非 array,永久性,否則 side buffer 永遠併唔返)→ 原文備份去 `sync.outbox.corrupt-<ts>` 再當空繼續。`outboxReadError`(detail=throw|corrupt)每 session 報一次。`getOutboxLength` 加埋 side buffer 長度。
3. **outboxLoopGuard detail** 改為 JSON 字串 `{initialLen, pushed, enqueuedDuring}`(`enqueuedDuring`= flush 期間 enqueue 次數)。上限值不變。`enqueuedDuring≈pushed` = 用戶狂撳;`enqueuedDuring≈0` 而 pushed 撞頂 = 真迴圈。⚠️ 下游若原本當 detail 係純數字,要改解析。

### Harness
(j)(k)(l) 新增。NEW 26/26;OLD(d74c483)負控 fail 13;`PREV_SHA=24e520a` 負控:(j)(k×2)(l) 四項 FAIL,其餘 pass。

---
## §③ 4a CoverImage / FavHeart 抽離

**新組件**：`src/components/CoverImage.js`（`youtubeId,size=52,iconScale=0.5,style`；含 S6 `useEffect(()=>setFailed(false),[youtubeId])`；fallback `<OdeIcon name="musicNote">`）、`src/components/FavHeart.js`（`hymn,style,size=20`；`useFavorites`、`stopPropagation`、hitSlop 10、`<OdeIcon>`）。
**合併**：`Cover` ×6（Mine ×2 處、Library、HymnList、PlaylistDetail、SharedPlaylist、AdminAddHymn size={48}；Admin 原 prop 已係 `youtubeId`，非 `videoId`）；`Heart` ×3（Library/HymnList 傳 `styles.heart`、Home 傳 `cardHeart`/`rowHeart`）。順手刪 3 個因而冇用嘅 `useFavorites` import。
**保留 App.js 播放器版**（App.js 零改動）：`CoverImage`(:309) 用 `getAlbumCoverUrl`、`StyleSheet.flatten(style)` 推 size、無 S6 effect、背景色 `DesignColors.cardLight`／`TEXT_SECONDARY`；`FavHeart`(:367) hitSlop 12、`paddingLeft14+paddingVertical2`、舊色常數 → props／視覺非完全可對齊，按執行單保留。
**偏離**：(1) HymnList 原 fallback 圖標係 `size*0.42`（其餘 0.5）→ 加 `iconScale` prop 保持逐像素一致；(2) AdminAddHymn 原無 S6 effect，現經共用組件獲得（行為只增 reset，無視覺差）。
**截圖**（iOS 模擬器 iPhone 17，Release build，`xcodebuild … -derivedDataPath scratch`；訪客；`ops/perf/screens-20261018/before|after/`；比對：去除頂部 160px 狀態列後逐像素 diff 閾值 16）：

| # | 位置 | 結果 |
|---|---|---|
| 1 首頁一行歌 Heart | PASS（0 px 差） |
| 2 詩歌庫列 Cover+Heart | PASS（0 px 差） |
| 3 HymnList Cover+Heart | PASS（0 px 差） |
| 4 我的 Cover | PASS（0 px 差） |
| 5 清單詳情 Cover | 未截（需登入；opus-verify 密碼搵唔到） |
| 6 分享清單 Cover | 未截（需登入） |
| 7 admin 加歌 Cover | 未截（需 admin 登入） |
| 8 播放器封面 | DIFF：只差進度時間／進度條區（bbox y1619–1741，982 px）；封面區 0 差 |
| 9 播放器清單心心（queue sheet，用 App.js 保留版） | DIFF：隊列歌曲每次 launch 隨機（自動播放），第一行（當前歌+實心心）一致；該版本未改 |

5–7 對應組件同 1–4 共用同一 `CoverImage`，但無實機截圖證據。
**Harness**：insertnext 66/66、hls-preflight A 14/14、B 26/26、react 5/5 場景過、usersync NEW 26/26（OLD 負控 fail 13）；`@babel/parser` 解析 9 個改動檔 OK。
**模擬器收尾**：booted=0、idb_companion=0、Simulator=0、hold 檔已刪。

## §④ insertNextImpl HLS 預檢 helper（commit 1c5297f + harness-c commit）
- **改動**（App.js，只此一檔；`git diff -U0` 三個 hunk）：
  - `@@ -555,0 +556,70` 新增 `preflightAndSwapNext = useCallback((nextSong, ctx) => {...}, [])`（:558，緊接 `hlsPreflightSeenRef` 宣告；依賴 `[]`，只讀 refs／module 級 `toTrack/logDiag/preflightHls`，同原 trackChanged 閉包可見性一致）。
  - `@@ -1134,67 +1204,2` trackChanged：刪 67 行 inline 段（含註解、`const nextSong = queueRef.current[idx + 1];`），換成 1 行註解指引 + 1 行 `preflightAndSwapNext(queueRef.current[idx + 1], 'next');`（:1204–1205）。
  - `@@ -2703,0 +2709,6` insertNextImpl：`warmIds([hymn.id])` 之後、beacon 之前加 `if (plan.insertAt === curIdx + 1) { try { preflightAndSwapNext(hymn, 'insertNext'); } catch (_) {} }`（:2713；fire-and-forget，`curIdx` 即 insertNextImpl 開頭重讀嗰個）。
  - 總計 +78 / −67。helper body 同舊 inline 段逐行一致，只有三處差異：去咗 `const nextSong = ...` 行（改參數）、`{ hymnId, ctx: 'next' }`→`{ hymnId, ctx }`、beacon detail `ctx=next`→`ctx=${ctx}`；其餘縮排減 4 格。每條 guard／15 秒門檻／200 封頂／beacon 字段不變。
- **watchdog 零 diff 證據**：全部 diff 只有上述三個 hunk（行範圍 556–625、1204–1205 原 1134–1200、2709–2714）。`handleStuckTrackEnd/handleMidStreamStall/handleBufferingStuck/sleepPollInterval/pollState/hlsStartupKick/BUFFERED_ADVANCING_CAP_TICKS` 嘅定義與函數體全部喺 hunk 之外（hunk 以外行只因 helper 插入而整體位移 +70/−65，內容無 +/−）。diff 內 grep 到嘅關鍵字只係搬動註解入面嘅文字提及。
- **harness-c**（`frontend/hymn-app/tools/hls-preflight-harness/harness-c.js`）：用字元級 brace-matching 由 App.js 現版抽 helper 全段、`if (plan.insertAt === curIdx + 1) {...}` 守衛、trackChanged call 行；舊版由 `git show 6ade187:frontend/hymn-app/App.js` 抽 inline 段；babel 轉碼後 `new Function` 注入 mock（TrackPlayer／refs／toTrack／logDiag／fetch），preflightHls／isExplicitHttpFailure 係 `src/hlsPreflight.js` 真 module。新舊逐項對比時 `ms=<耗時>` 抹走（wall-clock 噪音），其餘逐字比。
  - 結果 **29/29**：(1) 新舊 url/hymnId/ctx='next' 一致（404/403/200/500 ×2 + 7 個邊界：seen／downgraded／近尾／已 current／非 iOS／HLS off／無 idx+1）；(2) 插 idx+1→預檢一次 ctx=insertNext、404→remove(1)+add(progressive,1)、beacon `via=preflight ctx=insertNext`、ref set，200 不換；(3) 插 idx+2 零預檢；(4) downgraded 零預檢；(5) seen 去重＋封頂 200；(6) 非 iOS／HLS off 零預檢；(7) 預檢期間用戶跳去（nativeIdx<=curIdxNow）不 swap；(8) 尾 14 秒不 swap／尾 16 秒正控照 swap。
- **全部 harness**：insertnext 66/66、hls-preflight A 14/14、B 26/26、C 29/29、usersync NEW 26/26（負控 OLD 13 fail）、react-harness 5 場景全過。`@babel/parser` 解析 App.js OK。
- **偏離**：無。**側效應**：insertNext 現會對新插嘅 idx+1 歌做一次 HLS 預檢 fetch（iOS＋HLS_ENABLED 才有）；與 trackChanged 共用 `hlsPreflightSeenRef`，若該歌其後成為 idx+1 於 trackChanged 時不會重複預檢。

## §修正（Opus ④ F1/F2 + Opus3 M-1/M-2/D-1/L-6/L-8）
| 來源 | 修正 | commit |
|---|---|---|
| Opus④ F1 | insertNext 守衛 `plan.insertAt === curIdx + 1` → `plan.newCurIdx + 1`（去重刪位喺播緊前面時 curIdx 前移一格，舊守衛漏 35/91 plan，含「Play Next 啱啱播完嗰首」最典型用法） | `73e5b4f` |
| Opus④ F2 | harness-c (3b) 用真 `computeInsertNext` 移位 plan 做正控（新守衛預檢一次＋404 熱換）＋負控（舊守衛表達式喺該 plan 係 false）＋(3c) 冇移位真 plan＋(3d) 冇 newCurIdx 安全失敗；marker 跟新守衛（73e5b4f 嗰下 harness-c 其實 crash，tail -1 睇漏，fdd88db 修返） | `fdd88db` |
| Opus3 M-1 | `clearOutbox()` 連 side buffer `sync.outbox.pending.v1` 一齊 delete（登出後下一個帳戶唔會用自己 token 推上一個人嘅 op） | `c13808d` |
| Opus3 M-2 | corrupt 備份後即刻 `set(OUTBOX_KEY,'[]')`（否則每次 flush 增生一條 corrupt-<ts>） | `c13808d` |
| Opus3 L-6 | 5 個 `styles.cover`、4 個 `Image` import、HymnList `useState/useEffect`、4 個已無用 `effects` import 清走（Mine 嘅 cover 仍被 plCover 用，保留） | `cb30332` |
| Opus3 D-1 / L-8 | IRON-RULES §三.5 補 `plugins/withSwiftAudioExStallWatchdog.js`；native 死線註明前台 10s＋5s ≈16s／背景 20s＋8s（IRON-RULES ×2、BLUEPRINT ×1）；§一.4 補「overlay 用 bottom:0 唔用 height:SCREEN_HEIGHT」 | `8c05437` |

**唔修（記錄）**：L-1（全 store throw 時 pending 被覆寫只剩最後一個 op，兩種做法都 lossy）、L-2（pl_upsert 重推 stale → applyServerPlaylist 可能令本地已刪清單短暫復活，直到下次 pull）、L-3（合併半失敗次序倒轉，極罕）、L-4（舊有）、L-5（UI 長度唔計 pending，只影響顯示）、L-7（App.js 播放器版 Cover/Heart 撞名，保留理由成立）。

**Harness（全部喺 8c05437 worktree）**：insertnext 66/66、hls-preflight A 14/14、B 26/26、C **35/35**、usersync NEW **30/30**（負控 OLD fail 15；`PREV_SHA=9589f60` 恰好 fail 新加嘅 (m)(n) 4 條 = M-1/M-2 修正有效嘅負控）、react 5/5。`@babel/parser` 解析 8 個改動檔 OK。

**另：** Opus3 指出 memory 入面有 opus-verify 明文密碼——已由兩個 memory 檔清走，只留「密碼喺 repo `.claude/settings.local.json`」pointer（grep `Verify` 0 命中）。
