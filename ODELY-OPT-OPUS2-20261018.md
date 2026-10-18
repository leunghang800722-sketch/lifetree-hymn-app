# ODELY-OPT 獨立驗收 #2 —— 階段①修正 + 階段②（2026-10-18）

驗收對象：①修正 `24e520a`（userSync.js）+ `34e3014`（harness/報告）；② `c72b455`。
方法：唔信執行者報告，逐行讀 diff + 自己重跑 harness + 自寫對抗測試（scratch `opus-opt2/adv2.js`，承 `opus-opt1/adv.js` 加 7 個新 case，跑真 `src/sync/userSync.js` 並對 OLD `d74c483` 做負控）。

## 判詞

- **①修正：過**（M1/M2/L1 全部醫好，冇新 regression；兩個低嚴重度殘留，都係舊版已有，唔擋 OTA）
- **②：過**（行為等價，紅線零接觸）

## 1. ①修正逐項

| 項 | 核實 |
|---|---|
| M1 `done` 清單 | 重讀後 `collapse(raw).filter(x => !done.some(d => sameOp(x,d)))`；MMKV set 持續 throw 時每個 op 只推一次就終止（adv `setThrow` calls=3/3 op） |
| M1 硬上限 `initialLen+50` | 只會喺「一輪 flush 期間新 enqueue 超過 50 個」先觸發；觸發 = `break` + `outboxLoopGuard` beacon + drained=false，剩餘 op 已逐輪寫入持久化，冇丟（adv `limit`：1 op 飛行中 enqueue 70 → 推 51 停、outbox 剩 20、首個=51、beacon 1 條）。所有 enqueue caller（Favorites:49 / Playlists:56,132）都係撳一下一個 op 兼即刻 `flush()` → `_pendingFlush` 會喺 finally 自動接力，實際唔會卡 |
| M2 null 語義 | `readOutbox` 讀錯/非 array → null；`getOutboxLength`/`enqueue`/store 初始/flush 起手全部經 `readOutboxOrEmpty`；只有 flush 重讀分辨 null → `queue.slice(1)`。已推 op 唔會重推（slice 走咗），未推 op 唔會被 `[]` 蓋走（adv `getThrowMid` left=[2,3]） |
| L1 seq | 每次 enqueue 掃 outbox max seq（O(n)，同一函數本身已經 JSON.parse 全隊，可忽略）；重新載入 module 後延續（adv `restartSeq` seq=[1,2,3]）；`sameOp` 任一邊冇 seq 退返 ts（adv `legacyMix`：兩個舊格式 op + 新 op + 飛行中新 op，次序 POST1,DELETE1,POST1,DELETE2，outbox 清空）；seq 唔會送上 server（runOp 只用 hymn_id/playlist/id） |
| 零改動 | `checkAuth`/`reportUnauthorized`/`if (!ok) break`/`_flushing`/`_pendingFlush` diff 內冇出現 |

OPUS1 之前 NEW FAIL 嘅四個 case 而家：plSameMs PASS、favSameMs PASS、setThrow PASS、getThrowMid PASS。adv2 NEW 17/17 正式 case PASS；OLD 負控 fail 7（成立）。

## 2. ②逐項

- `hymnsStore = {..._hymnsStoreBase, setState}`：`createExternalStore` 全部係 closure（冇 `this`），spread 抄 `getSnapshot`/`useStore`（入面用返 base 嘅 `subscribe`），冇嘢漏轉交。7 處 setState 全部係 object partial，hymns 全部係 array（`fresh`/`parsed`/`primary.hymns`/`merged`），冇 `hymns:null` 寫法 → Map 唔會 stale。
- `getHymnById`：自己跑 harness 版真 module —— 未 load 回 undefined、null/undefined id 回 undefined、number/string id 同一首、`notifyHymnsChanged` 之後舊 id 消失新 id 命中。
- liveHymn：`player.hymns` 唯一來源係 `setHymns(allSongs)`（App.js:4464，allSongs = 同一個 store），所以同源；Map 喺 store setState 前更新，overlay 仍靠 context 嘅 `hymns` 變化 re-render。唯一差異：store 已有但 `player.hymns` 未經 effect 傳落嚟嗰一拍，新版搵到 live 版、舊版用 snapshot（只會更好）。重複 id 時 Map 取最後、find 取第一（id 係 DB PK，唔會重複）。
- `resyncFromNative`：只改 lookup 一行，`lib = hymnsRef.current || []` 同 `lib.length === 0 → buildMinimal` 保留；同上，lib 空但 store 已有時新版會直接用 store 嘅完整 hymn（比舊版好，唔會多 fetch）。
- `DEVICE_ID`：`git grep -nw DEVICE_ID`（排除 md）零命中；`getOrCreateDeviceId` import 仍被 app-version effect（App.js:4488）用。`/api/app-version` effect 喺 d74c483→HEAD diff 冇任何 +/- 行，`HLS_ENABLED` 設值路徑原封。
- `fetchWithTimeout`：api.js 版本同舊兩份逐字一樣；api.js 依賴 `./config` + `./authSession`（authSession 冇 import，零循環依賴）。
- `react-native.config.js`：`react-native-vector-icons` 根本冇裝（package.json/node_modules 都冇），刪 dependency override 對 autolinking 零影響；刪 `node_modules/.../Fonts` asset 路徑 = 本身不存在嘅路徑；Info.plist UIAppFonts 只有 Sora/NotoSerifTC（`./assets/fonts` 保留）。純 native build 設定，唔入 JS bundle，OTA 唔受影響。
- perfMarks：只加一行 TODO 註解，`PERF_MARKS_ENABLED = true` 不變。

## 3. react-harness

c72b455 只改 `prepareSource.js` RULES +1 條、新增 `mocks/apiStub.js`（同源實作）、README 一行；`scenarios/`、`run.js` 喺 c72b455 零改動（`notifyHymnsChanged.js` 嘅 mock `text()` 係更早 b6b98e3，唔改斷言）。重跑 prepareSource：changedLines `[2,3,4,6,7]` = 5 條命中規則，assertion 成立。

## 4. 五個 harness 重跑（自己跑）

```
react-harness: 結果:全部 5 個場景過
insertnext-harness: 66 passed, 0 failed
H-A: 14 pass / 0 fail
H-B: 26 pass / 0 fail
usersync-harness: NEW 21/21;負控 OLD fail 9
```

## 5. 紅線

`git diff d74c483 HEAD --stat -- . ':!*.md'`：只有 App.js / react-native.config.js / api.js / useCachedHymns.js / useOutboxLength.js(①) / perfMarks.js / userSync.js(①) / react-harness lib+mocks / notifyHymnsChanged.js(b6b98e3 mock) / usersync-harness —— 全部預期檔。gorhom / OdeIcon / designSystem 冇出現。App.js 非註解 diff 只有：2 行 import、刪 `let DEVICE_ID`、刪本地 `fetchWithTimeout`（4b 預期）、2 處 lookup、刪 DEVICE_ID effect；watchdog 函數（handleStuckTrackEnd / handleMidStreamStall / handleBufferingStuck / sleepPollInterval / pollState / nudge / rescue / hlsStartupKick）零 diff。

## 發現（按嚴重度）

1. **低（舊版已有，非 regression）** flush 重讀遇 null 時 `writeOutbox(queue.slice(1))` 會蓋走**飛行期間 enqueue** 嘅新 op（adv `getThrowRereadWithInflightEnq`：op9 丟；OLD d74c483 同樣丟）。所以「null 退路唔會丟 op」只對本輪起手已有嘅 op 成立。更穩寫法：null 時**唔寫**，只 `queue = queue.slice(1)`（持久化保留已推 op，下次成功重讀靠 `done` 剔走）。需要 getString 啱啱喺嗰一刻 throw，機率極低。
2. **低（舊版已有）** `enqueue` 遇讀錯當 `[]` 再寫 → 蓋走整個持久化 outbox（adv `getThrowDuringEnqueue`：[1,2]→[3]；OLD 一樣）。即係 M2 同一類問題喺 enqueue 仲存在，修正範圍冇包。
3. **低** `outboxLoopGuard` 喺正常但極端用法（一輪 flush 期間連撳 >50 下）都會 fire，beacon 會被誤讀成「無限迴圈」；冇丟資料，`_pendingFlush` 自動接力。睇 beacon 時要知呢點。
4. **資訊** liveHymn / resyncFromNative 喺「store 已有、React state 未到」嗰一拍行為比舊版好（用 live 版），唔係等價但只會更好。

## 側效應

- outbox op 多一個 `seq` 欄位（只喺本機，唔送 server）。
- 驗收期間我為咗跑真 module 嘅 getHymnById，喺 gitignored 嘅 `tools/react-harness/.tmp/` 臨時放咗一個測試檔，跑完已刪；`prepareSource` 重寫咗 `.tmp/hooks/useCachedHymns.harness.js`（harness 本身每次跑都會寫）。git working tree 冇變。
- 冇改 code、冇 git 寫、冇部署/OTA/restart、冇掂 backend、冇 kill process。
