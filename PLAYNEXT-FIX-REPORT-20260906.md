# PLAYNEXT-FIX-REPORT-20260906 — Play Next 修復執行報告

執行者：Sonnet 5。對象：`PLAYNEXT-OPUS-20260906.md` 驗收揪出嘅 P0-1、P0-2、P1-3、P2-4、P2-5、P3-6、P3-7、P3-8 八條。
基準 `f6d4d0a`（Opus 驗收嗰次 harness + 報告）。全程只改 `frontend/hymn-app/App.js`、`frontend/hymn-app/src/insertNextCore.js`、
`frontend/hymn-app/src/components/AddToPlaylistSheet.js`、`frontend/hymn-app/tools/insertnext-harness/run.js` 四個檔案。
`git diff f6d4d0a --stat` 只列呢四個檔案，444 insertions / 45 deletions。

---

## 0. 紅線核對

```
git diff f6d4d0a -- frontend/hymn-app/App.js | grep -iE \
  "handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog|threshold|stall|giveup|swr|hlsFallback"
```
**唯一命中係一句註解改字**（「播放、唔掂起播/watchdog」→「reset/唔中斷播放、唔掂起播/watchdog」，純文字，非 code）。
零 watchdog/stall/nudge/rescue 邏輯改動。`playQueue()`/`playQueueImpl` 本體一行未動。

---

## 1. 逐條修法

### P0-1 — 去重窗口太窄 → queue 出現重複 id

`src/insertNextCore.js` `computeInsertNext()`：去重搜尋由「淨係 `curIdx` 之後」改成「成個 queue（除咗播緊嗰個位）」。
搵到嘅舊位如果喺 `curIdx` 前面（`dupIdx < safeIdx`），播緊嗰首自己嘅 index 會跟住郁一格 → 新增 `newCurIdx` 返俾 caller。

`App.js insertNextImpl()`：`plan.newCurIdx !== curIdx` 就同步 `currentQueueIndexRef.current`（先 ref）→ `setCurrentQueueIndex()`（後 state），
同 `playQueue()` 一致嘅次序。native 側 `TrackPlayer.remove(plan.removedIdx)` 已經跟返 `plan.removedIdx`，唔使額外改次序。

驗證：harness scenario (h) 直接重現 Eric 個真實案例（播 A→行到 B→對 A 撳下一首播放），斷言零重複 id、`newCurIdx` 正確指返播緊嗰首、
插入位喺 `newCurIdx+1`；scenario (j) 用**真源碼**（唔係 Opus 嗰份獨立原型）跑 910 個 case，零不變式失敗。
**iOS sim 真機驗證**：見 §3 smoke 1，重複 id 消失、`moved=1`、播放冇斷。

### P0-2 — `originalQueueRef` 冇同步 → shuffle 開→關插入嘅歌消失

`App.js insertNextImpl()` 插入成功之後加一行，抄 `reorderQueue()`（App.js 現成做法）：
```js
if (!isShuffledRef.current) originalQueueRef.current = plan.newQ;
```
只覆蓋「插入嗰陣冇開 shuffle」呢條主線（Android 實測嗰個 case 正正係呢種）。「插入嗰陣已經開咗 shuffle」嘅完整修復
（要 splice 入 `originalQueueRef` 內部）Opus 都話「唔使做到完美」，冇喺呢次範圍。

驗證：harness scenario (k) 模擬 `!isShuffled` 主線，確認插入嘅歌喺 shuffle 開→關之後仍然喺 `originalQueueRef` 度。

### P1-3 — `unavailable` 完全冇 filter

兩層防線：
1. `insertNextCore.js computeInsertNext()` 最頭一句 —— `hymn.unavailable` 就回 `{ blocked: true, reason: 'unavailable' }`，
   唔理有冇 queue/idle，冚晒所有分支（純函式層面可測試）。
2. `App.js insertNext()` 入口即刻檢查 `hymn.unavailable`，`showNotice('呢首歌已經下架，播唔到')` 並 return（唔理有冇 queue，喺
   `playQueueChainRef` 掛鏈之前就截死，抄 `playQueueImpl` 現成文案）。
3. `AddToPlaylistSheet.js` `canPlayNext` 加 `&& !target.unavailable` —— 令行根本唔顯示（`insertNext()` 入面嗰道閘先係硬防線）。

驗證：harness scenario (l)。

### P2-4 — 插入嘅歌結構上永遠係冷歌

`App.js insertNextImpl()` 插入成功、toast 之後加 `warmIds([hymn.id])`（模組層現有 function，`POST /api/stream/warm`，
fire-and-forget）。純 backend warm，冇擴大本地音訊副本、冇碰 `prefetchAudio`，唔違反「唔另加預載」紅線嘅精神（Opus 建議放寬，本次採納）。

### P2-5 — 入口不可達（死 code / 規格自相矛盾）

Fable 拍板：顯示 → 冇嘢播就即刻播（同 YT Music 一致），§1.1-1 唔係死 code。
`AddToPlaylistSheet.js` `canPlayNext` 由 `mode==='add' && !!target && queue.length>0 && currentHymn?.id!=null`
改做 `mode==='add' && !!target && !target.unavailable` —— 行永遠顯示（下架歌除外）。
`App.js insertNext()` 冇 queue/冇 current track（`idle0`）→ `showNotice('即刻播放')` + `await playSingle(hymn)`。

驗證：iOS sim smoke 2（見 §3）——冷開冇歌播緊，「我的」最愛第一行撳 ≡+ →「下一首播放」行現形 → 撳落 → toast「即刻播放」
→ mini player 即刻出現並播放緊。

### P3-6 — 播到自動尾巴之後，插入嘅歌顯示喺線下面

`insertNextCore.js`：邊界調整完（`adjustBoundary`）之後，如果 `autoRadioFrom` 仲係 `<= insertAt`（即插入位喺線上或之前，
= 插入嗰首落咗喺自動尾巴入面），將佢推去 `insertAt + 1`，令插入嗰首算「用戶揀」，唔再顯示喺線下面。
插入位喺線之前（用戶未播到尾巴）嗰種正常情況唔受影響（override 條件唔會觸發）。

驗證：harness scenario (m)，兩個 case（觸發 + 對照組不觸發）。

### P3-7 — `insertNext` 冇並發保護

`App.js`：`insertNext()` 拆做兩截 —— 入口做「唔可能失敗、唔會觸碰鏈」嘅快速判斷（`hymn.unavailable`、`idle`/空 queue
→ `playSingle`），真正會 mutate `queueRef`/native queue 嗰截（去重/插入/native TrackPlayer 呼叫）搬去 `insertNextImpl()`，
掛入 `playQueueChainRef.current.then(run, run)`，同 `playQueue()` 一樣嘅排隊機制。`cur`/`curIdx` 喺 `insertNextImpl` 執行嗰一刻
（即真正輪到自己）先重讀，唔用掛鏈之前嘅快照。

**⚠️ 一個重要設計偏離，寫低喺度**：`idle`/空 queue 嗰個分支（`fallbackToSingle`，會 call `playSingle()` → `playQueue()`）
**刻意冇**掛入 `playQueueChainRef`。原因：`playQueue()` 自己都掛喺同一條鏈，如果 `insertNext` 都要掛鏈先至喺自己嘅
`run()` 入面 call `playQueue()`，會形成「`insertNext` 嘅 `next`」等「`playQueue` 嘅 `next2`」、`next2` 又要等 `next` 先
`settle` 嘅循環 promise —— 呢個唔係「行得慢」，係**真死鎖**，永遠 resolve 唔到。所以呢個分支保持喺鏈之外即刻執行，
同原本（PLAYNEXT-EXEC 版本、Opus 驗收過）一致嘅結構。真正需要鏈保護嘅（`TrackPlayer.remove`/`add` 之間嘅 mutation
窗口）已經落哂喺 `insertNextImpl`。

驗證：harness scenario (o) —— 模擬 `playQueueChainRef.current.then(run, run)` 呢套機制（用真嘅 `computeInsertNext` +
一條 Promise 鏈 + 隨機延遲製造 race 窗口），20 次連續 run 兩個「唔 await 就即刻撳第二個」嘅 insertNext，全部序列化正確，
冇一次互相覆寫（`[0,B,A,1,2]` 次序穩定）。

### P3-8 — 失敗路徑邊界唔一致

`insertNextCore.js` 新增 `reindexBoundaryById(oldCur, boundary, newQ)`：用 id 喺 `newQ`（`reconcileFromNativeQueue` 嘅結果）
搵返 `oldCur[boundary]` 呢個元素而家喺邊，搵唔到就跌落 `newQ.length`。`App.js` catch 分支喺 reconcile 完 `queueRef`/`setQueue`
之後，用呢個 function 重算 `autoRadioFrom`/`insertBoundary`，同埋用 id 重新搵返 `currentQueueIndexRef`（P0-1 之後去重刪位
可能喺播緊嗰首前面，失敗 rollback 都要跟同一套邏輯對位）。

驗證：harness scenario (n)，四個子case（正常重新對位、boundary 元素本身被刪走、boundary 指住尾巴、null 直通）。

---

## 2. Harness 數

`node tools/insertnext-harness/run.js`：**54 passed, 0 failed**（原 22 case (a)-(g) + 新 8 組 (h)-(o)，(j) 同 (o) 內部
分別再包 910 個窮舉 case 同 20 次並發模擬，連續跑 3 次結果一致，`(o)` 冇 flaky）。

Opus 嗰支獨立 910-case 窮舉驗證（`ops/perf/audit-20260906/playnext-opus/opus-fixproposal.js`，測試佢自己嗰份獨立
`computeInsertNextFixed` 原型，唔 touch repo）：重跑結果 `fix-proposal: tested=910 invariantFails=0 duplicateIdFails=0`，
同之前一致。

`opus-negctl.js`（Opus 嗰支負控，專門用嚟**證實**修復前嘅 bug）重跑：N1/N7 依然全過；N2c/N4b/N4c 呢啲斷言（原本斷言
「重複 id 會出現」/「shuffle 關咗歌會消失」）而家唔再成立（因為 bug 已經修好），N3a 因為 `plan.newQ` 而家唔存在（`blocked:true`
攔咗）拋 TypeError 中止 —— 呢個係**預期行為**：呢支 script 本身係用嚟證實舊 bug 嘅負控，唔係本次驗收 gate，冇改佢（佢喺
`ops/perf/` 底下，屬於 Opus 嘅驗收產物）。

---

## 3. iOS sim smoke（真機驗證，模擬器 `E0416618-…` iPhone 17，Opus 原有 Release build 換咗 main.jsbundle）

**做法**：`npx expo export:embed --platform ios --dev false --minify true --bytecode` 產生新 Hermes bytecode bundle，
換入 Opus 已裝嘅 `Odely-patched.app/main.jsbundle`，`codesign -f -s -` 重簽。**踩過一個陷阱**：第一次換完冇即刻生效，
查到 `Library/Application Support/.expo-internal/`（EXUpdates 內部 SQLite `expo-v11.db` + 舊 `bundle-*.jsbundle`）鎖住咗
第一次（Opus 嗰次）import 嘅版本，之後幾次冷啟動都用返嗰份快取，唔會重新讀 `main.jsbundle`。清走 `.expo-internal` 整個
目錄先解決（同 memory 記錄嘅 Android 「bundle provenance 陷阱」同一類問題，換咗做法一樣受影響）。

**Smoke 1（P0-1，重複 id + 播放唔斷）**：
播「仍然相信祢」→ 撳 ⏭ 行到下一首 → 開播放清單，喺「仍然相信祢」（今次喺 curIdx 前面）撳 ≡+ →「下一首播放」。
結果：queue 保持 31（唔係 32），「仍然相信祢」只出現一次，移到播緊嗰首後面；backend beacon
`hymnId=104 moved=1 at=2 qlen=31`；插入前後播緊嗰首（截圖對比）冇跳出/冇重新載入，繼續喺 render。

**Smoke 2（P2-5，冷開即刻播）**：
`pm clear`級冷啟動（重新 launch，未播過任何歌）→「我的」最愛第一行撳 ≡+ →「下一首播放」行**現形**（P2-5 修復前呢行
喺呢個狀態下唔顯示）→ 撳落 → toast「即刻播放」→ mini player 即刻出現並開始播放（⏸ icon）。

截圖存喺 `<scratchpad>/playnext-sonnet-fix/`（session-local，未搬入 repo，跟 CLAUDE.md「唔准 git add -A」原則冇帶入 commit）。

模擬器收工：`terminate` → `idb disconnect` → `pkill idb_companion` → `simctl shutdown` → 刪走 `/tmp/claude-ios-cleanup.hold`。
收工核實：`booted:0 idb:0 sim:0 devtools:0`。

---

## 4. 未做 / 已知限制

1. **Android 未重跑**：任務要求淨係 iOS sim 一次 smoke，Android AVD 冇動（跟紅線「唔開 AVD」）。P0-2（shuffle）主要靠
   Android 實測（Opus 嗰邊），今次 iOS 冇特登再測一次 shuffle 開關（純函式層 harness scenario (k) 已覆蓋邏輯）。
2. **shuffle 開住嗰陣插入**仍然唔會完美同步 `originalQueueRef`（Opus 原話：呢個唔要求做到完美，主線已覆蓋）。
3. `insertNext()` 嘅 `idle`/空 queue 分支刻意唔入 `playQueueChainRef` 鏈（避免死鎖，見 §1 P3-7 段解釋）—— 呢個分支本身
   同 `playQueue()` 之間仲有一個極窄嘅並發窗口未完全封死（`playQueue()` 自己有排隊，`insertNext` 呢個分支只係讀
   `queueRef.current` 做判斷唔郁佢，實際 mutation 由 `playSingle→playQueue` 自己嘅鏈保護），寫低留意。
4. 冇部署、冇 OTA、冇 commit 之外嘅改動；backend/hymns.db 冇碰。

---

## 5. 交付

Commit（pathspec，兩個）：
- code：`frontend/hymn-app/App.js` + `frontend/hymn-app/src/insertNextCore.js` + `frontend/hymn-app/src/components/AddToPlaylistSheet.js`
- harness + 報告：`frontend/hymn-app/tools/insertnext-harness/run.js` + `PLAYNEXT-FIX-REPORT-20260906.md`
