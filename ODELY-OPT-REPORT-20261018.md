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
