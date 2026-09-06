# PLAYNEXT-OPUS2-20260906 — Play Next 修補第二輪獨立驗收

驗收者：Opus 5（獨立，唔改 source、唔 commit、唔部署）。
對象：`97ba0f7`（code）+ `c7eb156`（harness/報告），對應 `PLAYNEXT-OPUS-20260906.md` 八條。
基準 diff：`git diff 6453558..c7eb156 -- frontend tools`（4 檔，444+/45−）。

---

## 0. 結論

🔴 **要修先，唔好 OTA。** 八條入面 6 條做得啱，但有 **兩個實測紅**：

| # | 問題 | 級別 | 證據 |
|---|---|---|---|
| **B1** | **P3-6 個修法整死咗電台尾巴**：插入之後撳任何一首散歌 → 隊列變 2 首、冇自動接續、播完就停 | 🔴 P1（用戶睇到 = 「聽兩首就停」） | 純函式 + iOS 實測「播放清單 (2)」 |
| **B2** | **P0-2 只修咗一半**：shuffle **開住**嗰陣插入嘅歌，關返 shuffle 仍然無聲無息消失 | 🔴 P1（data loss，同上輪同一個病） | iOS 實測 33 → 31 |

另外 **P2-4（warmIds）實測救唔到**「插完即刻撳 ⏭」——插入嗰首照樣 `itemNil=1` 16 秒俾 native watchdog 斬。
唔係 regression，但唔可以寫「冷歌問題已解決」。

紅線覆核：`git diff 6453558..c7eb156 -- frontend` 對 `nudge|rescue|watchdog|stall|giveup|swr|hlsFallback|threshold|prefetchAudio` 只有 **3 個命中，全部係註解文字**，零邏輯改動。`playQueue()/playQueueImpl` 本體一行未郁。✅

---

## 1. 逐條核

### P0-1 去重全 queue + `newCurIdx` — ✅ 過

* 純函式：我自己寫嘅 `opus2-check.js`（唔用 Sonnet 個 harness）窮舉 **1400 case**（len 1-7 × curIdx × 「插新歌/插已在 queue 任何位置」× 5 種 autoRadioFrom × 2 種 insertBoundary），四條不變式（零重複 id / `newQ[newCurIdx]` 仍係播緊嗰首 / `newQ[insertAt]` 係插入嗰首 / 長度對）**零失敗**。
* **native 語義我自己去讀返源碼核實**（唔靠報告講）：
  `SwiftAudioEx/QueueManager.swift:271-290` —— `index < currentIndex` → `currentIndex -= 1`、**唔會** emit `onCurrentItemChanged`。即係 `TrackPlayer.remove(dupIdx)` 打前面嗰個位**唔會斷歌**，而且 native 個 currentIndex 郁法同 `plan.newCurIdx` 完全一致。
  Android 側 `MusicModule.remove → MusicService.remove → player.remove(indexes)`（ExoPlayer `removeMediaItem`），語義相同，但**呢輪冇喺 Android 實機驗**（見 §3 環境）。
* iOS 實測（screenshot `06`→`09`）：播緊第 5 首，對 index 0（頭先播過嘅「祢是唯一」）撳「下一首播放」→
  beacon `playNext id=1865 moved=1 at=4 qlen=31`；隊列由 31 → **31**（唔係 32），「祢是唯一」只出現一次、企咗喺播緊嗰首後面；
  同一時間全屏播放器 **1:26 / 5:53 繼續行、⏸ 狀態**，播放冇斷、冇重新載入。上輪嗰個 `ios-21-DUP` 重複行消失。

### P0-2 `originalQueueRef` — 🔴 **未過（B2）**

* code 只加咗 `if (!isShuffledRef.current) originalQueueRef.current = plan.newQ;`。
* 但 `toggleShuffle`（App.js:466-480）開 shuffle 嗰陣**根本唔會寫** `originalQueueRef`（佢就係要留住 pre-shuffle 次序），所以「shuffle 開住插入」→ `originalQueueRef` 由頭到尾冇見過插入嗰兩首 → 關 shuffle 用 `originalQueueRef` 重砌 → 兩首消失，而且 `toggleShuffle` 跟住 `TrackPlayer.reset()+add(newQ)`，native 都一齊冇埋。
* **iOS 實測**（screenshot `24`→`29`）：shuffle ON（「已隨機排序」，31 首）→ 由詩歌庫插入兩首新歌（beacon `id=3 moved=0 at=10 qlen=32`、`id=5 moved=0 at=10 qlen=33`，播放清單顯示 **33**）→ 撳返 shuffle OFF → **播放清單 (31)**。兩首插入嘅歌無聲無息消失。
* 修復報告寫「Android 實測嗰個 case 正正係『插入嗰陣冇開 shuffle』」——可能係，但**執行單同 Eric 嘅用法都會撞到 shuffle 開住嗰種**，而呢種就係上輪嗰個 34→31 嘅同款 data loss。
* 建議修法（一段，唔使拆結構）：

```js
if (!isShuffledRef.current) {
  originalQueueRef.current = plan.newQ;
} else {
  const o = originalQueueRef.current || [];
  const without = o.filter((x) => String(x.id) !== String(hymn.id));   // 順手做埋去重
  const anchor = cur[curIdx];                                          // 播緊嗰首
  const oi = without.findIndex((x) => String(x.id) === String(anchor && anchor.id));
  originalQueueRef.current = oi >= 0
    ? [...without.slice(0, oi + 1), hymn, ...without.slice(oi + 1)]
    : [...without, hymn];
}
```

### P1-3 `unavailable` — ✅ 過（未做實機，純函式 + 入口讀碼）

* 三層防線次序啱：`insertNext()` 入口（掛鏈之前）→ `computeInsertNext()` 第一句（喺 `idle`/空 queue 判斷**之前**，所以冚晒所有分支）→ `AddToPlaylistSheet.canPlayNext` 唔顯示行。
* 我自己重驗三種輸入（有 queue / 空 queue / idle=true）全部 `blocked:true` 兼 `newQ === undefined`。
* 負控翻案：`opus-negctl.js` N3a（上輪用嚟證實「完全冇 filter」）而家喺 `plan.newQ.length` 拋 TypeError —— 呢個係**負控應該翻轉**嘅表現，等於實錘 P1-3 落咗地。
* `FavoritesContext.js:64` 確認個 flag 就係 `{ unavailable: true }`，欄名對得上。

### P2-4 `warmIds` — ⚠️ 落咗地但**實測救唔到主場景**

* code 冇問題：`warmIds()` 係 module-level 現成 function，內部 try/catch + `.catch(()=>{})`，唔會 throw、唔會擴大本地副本。
* **實測（iOS，最典型用法「插完即刻撳 ⏭」）**：
  `12:01:28` `playNext id=153 moved=1 at=1 qlen=31` → 約 5 秒後撳 ⏭ →
  `12:01:43` `nativeStall phase=detected itemNil=1 sinceItemChange=10` → `12:01:45/47/49 stage=reload` →
  `12:01:49` `nativeStall phase=skipped skips=1`（**插入嗰首俾 watchdog 斬咗**）→ 落咗去下一首 `ms=85 source=local`。
  即係 **itemNil 16 秒**，同上輪嗰個 17 秒同一個病，warm 完全嚟唔切。
* 對照（同一 session，插入後隔 93 秒先播到）：`nextTrackMs id=1865 ms=4918 origin=auto source=stream`，冇 itemNil —— warm 有時間就有用。
* 結論：P2-4 方向啱、無害，但**唔可以寫「插入嘅歌唔再係冷」**。真正要治「插完即刻⏭」要靠 backend warm 之外嘅嘢（唔屬於呢次範圍）。

### P2-5 入口永遠顯示 + idle→playSingle — ✅ 過

* iOS 實測（screenshot `20`→`22`）：冷啟動、乜都冇播（冇 mini player）→ 詩歌庫第一行 ≡+ → **「下一首播放」行有出現**（舊碼呢個狀態下唔顯示）→ 撳落 → mini player 即刻出現、⏸（播緊）。
* ⚠️ watch item（唔係 blocker）：idle 判斷係 `trackStateRef.current === TPState.None`。而家個行永遠顯示，所以理論上「`queueRef` 有嘢但 state 係 None」會令 `playSingle` 洗走成個 queue。我行過 App.js 唯一寫 `TPState.None` 嘅位（`resyncFromNative` 冷啟動殘留隊列）——嗰條路同時 `TrackPlayer.reset()` 而 JS `queueRef` 本身係空，所以呢個窗口實際封閉。將來如果加咗「restore queue 但唔播」嘅功能就要重新睇呢句。

### P3-6 `autoRadioFrom = insertAt + 1` — 🔴 **要 revert / 重做（B1）**

* 「表面目標」達到：iOS 實測 screenshot `09` —— 插入嗰首（祢是唯一）確實企咗喺「自動播放：全部」線**上面**。
* **但個線同時係 `headLen` 語義**（`playSingle` / `rebuildTail` / `applyAutoplayEnabled` 三個地方都用 `autoRadioFrom` 當「用戶真係揀咗幾多首」），推咗條線 = 話俾 App 知「頭 5 首全部係用戶揀」，而嗰 4 首其實係系統隨機抽嘅。後果：

  1. **電台尾巴死亡（主要傷害）**：`playSingle()` 個 `isExplicitQueue = headLen > 1` 由 false 變 true → 之後撳任何一首散歌行「插播」路 →
     `playQueue([新歌, 插入嗰首], 0, { autoRadioFrom: null })` → **隊列得 2 首、冇尾巴、播完就停**。
     - 純函式證據：`opus2-check.js` C2 FAIL（`headLen=5 → resumeRemainder=[99] → playQueue(['777',99], {autoRadioFrom:null})`）。
     - **iOS 實測**：插入之後撳詩歌庫「恩典太美麗」→ 全屏播放器顯示 **播放清單 (2)**，隊列淨係兩首、自動播放 toggle 仍然開住但冇尾巴、冇分隔線（screenshot `11`/`12`）。
     - 對照組（同一部機、冇做 Play Next）：撳散歌 → **播放清單 (31)**、有「自動播放：全部」線（screenshot `14`/`16`）。
  2. 顯示上換咗另一個呃人法：線之上而家混住一批系統隨機揀嘅歌，睇落好似用戶自己揀。
  3. `applyAutoplayEnabled(false)` / `rebuildTail()` 會將嗰批隨機歌當 explicit head 永久保留。
* 觸發頻率高：`playSingle` 開嘅電台 `autoRadioFrom = 1`，只要用戶聽到第二首（`curIdx >= 1`）先做 Play Next 就會踩中，係常態唔係邊角。
* 建議：**revert P3-6**（原本嗰個「插入嘅歌顯示喺線下面」係純顯示問題，可以接受、可以另外開單），或者另設一個獨立嘅 `userPickedIds` Set 專門畫線，唔准郁 `autoRadioFrom`（因為佢係 headLen）。

### P3-7 掛鏈 + idle 分支唔入鏈 — ✅ 判斷合理（有一個更好嘅解，非 blocker）

* 掛鏈做法同 `playQueue()` 一模一樣（`playQueueChainRef.current.then(run, run)`），`cur`/`curIdx` 喺 `insertNextImpl` 執行嗰刻先重讀 —— 啱。
* **死鎖講法我獨立核實成立**：`playQueue()`（App.js:2740-2751）自己就係 `next = chain.then(run); chain = next; return next`。如果 `insertNextImpl` 喺鏈入面 `await playSingle→playQueue`，`playQueue` 會掛喺「自己嗰個仲未 settle 嘅 next」後面，而 `next` 又等緊佢 —— 真循環，永遠 resolve 唔到。所以 Sonnet 唔入鏈嘅決定**合理**。
* 但「冇第二個解」唔成立：`playQueue` 已經拆咗 `playQueue`/`playQueueImpl`，同樣拆一個 `playSingleImpl`（內部 call `playQueueImpl`）就可以連 idle 分支都納入鏈。列作可選改善——實際風險細，因為 idle 分支唯一嘅 mutation 都係經 `playSingle→playQueue`，而佢自己有排隊。
* 🐞 順手揪一個 nit（理論窗口）：`catch` 入面用 `cur`（掛鏈快照）做 `reindexBoundaryById` 基準；如果 throw 發生喺 step 6 之後（`autoRadioFromRef` 已經寫咗 `plan.autoRadioFrom`，係 `newQ` 空間嘅 index），就會攞 `cur[newQ 空間嘅 index]` 對錯位。step 6 之後淨返 `setQueue`/`warmIds`/`sendClientLog`（都唔會 throw），所以係理論性。修法一行：喺 `insertNextImpl` 開頭讀低 `const arf0 = autoRadioFromRef.current, ib0 = insertBoundaryRef.current`，`catch` 用返嗰兩個做基準。

### P3-8 `reindexBoundaryById` — ✅ 過

* 我自己重驗四個子 case：元素搬咗位（用 id 搵返）、元素本身俾去重刪走（跌落 `newQ.length`）、`boundary === oldCur.length`（「尾巴之後」→ `newQ.length`）、`null` 直通 —— 全過。
* 語義同 `§1.1-6` 個 ground truth（boundary 指住「原本 `oldCur[boundary]` 嗰個元素」）一致。
* `currentQueueIndexRef` 嗰段用 `cur[curIdx]` 做 anchor，用嘅係原始快照，啱。

---

## 2. 儀器 / 測試數

| 跑咩 | 結果 |
|---|---|
| `node tools/insertnext-harness/run.js` | **54 passed, 0 failed**（含 (j) 910 case、(o) 20 次並發） |
| `ops/perf/audit-20260906/playnext-opus/opus-fixproposal.js` | `tested=910 invariantFails=0 duplicateIdFails=0` |
| `opus-negctl.js`（上輪負控） | N3a 拋 TypeError = **負控翻轉**（P1-3 已修）；N4 之後冇跑到 |
| **`opus2-check.js`（本輪新寫，獨立）** | **14 passed, 1 failed** —— 唯一 FAIL 就係 C2（P3-6 引入嘅 regression），係故意設計嚟捉佢 |

`opus2-check.js` 已複製去 `ops/perf/audit-20260906/playnext-opus2/`。

Bundle provenance：唔用 Sonnet 嗰份，我自己由乾淨 working tree（`git status --porcelain` 對三個 source 檔全空 = 等於 `c7eb156`）行
`npx expo export:embed --platform ios --dev false --minify true --bytecode` 出新 bundle（md5 `67714693e53d38b813e324fe69211a1f`，3,745,704 B），
換入模擬器已裝嗰個 `Odely-patched.app`、清走 `Library/Application Support/.expo-internal`、`codesign -f -s -` 重簽，換前換後 md5 有對過。

---

## 3. 實機矩陣

平台：iOS 模擬器 iPhone 17 `E0416618-…`（iOS 26.5），Release bundle，登住 opus-verify（本機 mint token，冇印 secret）。
**Android 呢輪冇做**：呢部機而家淨係有 `adb` + `~/.android/avd/hymntest.avd` 個定義，**冇裝 emulator binary**（`~/Library/Android/sdk` 唔存在、`which emulator` = not found、`adb devices` 空），開唔到機。唔當佢 PASS。

| 測項 | 平台 | 結果 | 證據 |
|---|---|---|---|
| (a) 插「啱啱播過」嘅歌 → 零重複、播緊唔斷 | iOS | ✅ **PASS** | `06`-`09`；beacon `moved=1 at=4 qlen=31`；隊列 31（唔係 32），插入嗰刻播緊嗰首 **1:26/5:53 繼續行** |
| (b) shuffle 開→插兩首→關 → 數量唔跌 | iOS | 🔴 **FAIL** | `24`-`29`；33 → **31**，兩首消失（beacon `qlen=32`、`qlen=33` 證實插入成功） |
| (c) 自動尾巴播緊期間插入 → 新歌喺線上面 | iOS | ⚠️ **PASS 但有副作用** | `09` 新歌確實喺線上面；但條線由 1 推到 5 → 觸發 B1（見 `11`/`12`：之後撳散歌 → 播放清單 **(2)**） |
| (d) 冷開冇歌撳 → 即刻播 | iOS | ✅ **PASS** | `20`（冇 mini player 但「下一首播放」行有出）→ `22`（mini player 播緊） |
| (e) 插入後 ⏭ → 新歌唔再係冷 | iOS | 🟠 **冇改善** | `itemNil=1` 連續 16 秒 → `nativeStall phase=skipped` 斬咗插入嗰首；對照上輪 17 秒 = 一樣 |
| (f) Android `TrackPlayer.remove(前面 track)` 通知/背景播放 | Android | ⬜ **未測**（環境冇 emulator） | 只有源碼層證據：`MusicModule.remove → player.remove` = ExoPlayer `removeMediaItem`，改嘅係 index < current，唔郁 current item |

---

## 4. 剩餘問題（按優先）

1. 🔴 **B1 / P3-6**：`autoRadioFrom` 兼任「分隔線」同「headLen」兩個語義，推線 = 改 headLen = 殺電台尾巴。**建議 revert P3-6**，或者用獨立 `userPickedIds` 畫線。
2. 🔴 **B2 / P0-2**：shuffle **開住**插入仍然丟歌（33→31）。上面 §1 有現成 patch 段落。
3. 🟠 **P2-4**：warm 救唔到「插完即刻⏭」。唔使 block OTA，但報告/交付講法要收返，另外開單。
4. 🟡 **P3-7 nit**：`catch` 分支應該用「掛鏈嗰刻嘅 boundary 快照」做 `reindexBoundaryById` 基準（一行）。
5. 🟡 **P3-7 可選**：拆 `playSingleImpl` 令 idle 分支都入鏈（真正封死最後嗰個窄窗口）。
6. 🟡 **P2-5 watch item**：`idle = trackState === None` 而個入口而家永遠可撳；今日封閉，將來加「restore queue 唔播」就會開窿。
7. ⬜ **Android 未驗**：(f) 通知/背景播放，同埋 (a)(b) 喺 Android 嘅重演。下一輪要喺有 emulator / 真機嘅環境補。

---

## 5. OTA 之後 Eric 真機最少一項檢查

（**前提：B1 + B2 修好、再驗一次先好 OTA**。真出咗街之後，Eric 至少要做呢一項：）

> **「插一首，再撳返首頁隨便一首歌」**——
> 播緊一首歌、聽到第二三首嗰陣，對任何一首歌撳 ≡+ →「下一首播放」，
> 跟住返首頁／詩歌庫**隨便撳另一首歌**，打開全屏播放器睇「播放清單 (N)」個數字。
> **要見到 30 幾首（有「自動播放：全部」分隔線），唔可以係 2 首。**
> 如果係 2 首 = B1 未修好／又翻發，即刻話我知，唔好繼續聽（會播兩首就停）。

（次選第二項，如果 Eric 有用 shuffle：shuffle 開住插一首歌 → 關返 shuffle → 睇隊列數字有冇跌。）

---

## 6. 收工

* 模擬器：`terminate` → `idb disconnect` → `pkill -x idb_companion` → `simctl shutdown` → `pkill -x Simulator` → 刪 `/tmp/claude-ios-cleanup.hold`。
  核實：`booted:0 idb:0 sim:0 devtools:0 hold:0`。
* 冇改 source、冇 commit、冇部署、冇碰 backend/hymns.db。截圖（29 張）+ `opus2-check.js` 放咗喺
  `ops/perf/audit-20260906/playnext-opus2/`（未 git add）。
