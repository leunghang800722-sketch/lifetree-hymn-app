# PLAYNEXT-OPUS-20260906 — Play Next（下一首播放）獨立驗收

驗收者：Opus 5（獨立，唔係執行者）。對象：`5334279`（App.js insertNext + `src/insertNextCore.js` + `src/playerBridge.js`）、`ad5c164`（AddToPlaylistSheet 一行）、`f6d4d0a`（harness + 報告）。
基準 `6e71cc1`（SheetShell 已含 Opus 修補）。執行單 `PLAYNEXT-EXEC-20260906.md`，執行報告 `PLAYNEXT-REPORT-20260906.md`。

**冇改一行 source、冇 commit、冇部署／OTA／eas／restart／launchctl。** `git status --short frontend/` 全程為空，HEAD 全程 `f6d4d0a`。
截圖：`ops/perf/audit-20260906/playnext-opus/`（iOS 36 張 + Android 29 張）。
Scratch：`<scratchpad>/playnext-opus/`（我自己嘅 harness、build log、APK/bundle 產物）。

---

## 0. 結論

> **🔴 要修先 OTA。**

紅線**全部守住**、邊界運算**數學上正確**（我做咗 910 個 case 嘅窮舉 ground-truth 對數，零 mismatch）、
兩平台主線場景（插入位置、播緊唔斷、分隔線、⏭、去重搬位、toast、鎖屏/通知、背景播放、返回鍵）**全部通過**。

但有 **兩個 P0** 喺兩部機都實測重現，兩個都係「用戶做一個好自然嘅動作 → queue 出事」：

1. **P0-1 重複 id**：插一首**頭先啱啱播過**嘅歌做下一首播放 → 隊列出現兩行一樣嘅歌，兩行同時高亮，撳新嗰行會**向後跳**去舊嗰個位。
   （Play Next 最典型嘅用法就係「頭先嗰首想再聽一次」。）
2. **P0-2 shuffle 開→關 令插入嘅歌全部消失**：Android 實測 34 首 → **31 首**，三首插入嘅歌無聲無息冇咗。

再加一個 **P1**（下架佔位項冇 filter，會重演 2026-08-22「連續飛歌」事故）。

三個修都喺 `insertNext()` / `insertNextCore.js` 入面，唔使掂 playQueue／watchdog；
P0-1 我已經**寫咗原型並窮舉驗證過**（§6.1，910/910 通過），可以直接照做。

---

## 1. 紅線逐 hunk 核對（全部 ✅）

`git diff 6e71cc1..f6d4d0a -- frontend/hymn-app/App.js` = **6 個 hunk**：

| # | hunk | 內容 | 判 |
|---|---|---|---|
| 1 | `@@ -29,6 +29,12` | import `insertNextCore` / `setPlayerBridge` | ✅ 純新增 |
| 2 | `@@ -659,8 +665,17` | `onPrefetchComplete` 熱換加 guard | ✅ 見 §1.3 |
| 3 | `@@ -2487,6 +2502,71` | 新函式 `insertNext()` | ✅ 純新增 |
| 4 | `@@ -2829,6 +2909,11` | render body `setPlayerBridge({...})` | ⚠️ 見 §1.4 |
| 5 | `@@ -2836,7 +2921,7` | context value 加 `insertNext` 一個名 | ✅ 一個 token |
| 6 | `@@ -4534,6 +4619,15` | provider tree **只加註解**，零 code 改動 | ✅ |

### 1.1 起播／stall／watchdog／nudge／rescue／threshold — 零改動 ✅

```
$ git diff 6e71cc1..f6d4d0a -- frontend/hymn-app/App.js | grep -E "^[+-]" \
    | grep -iE "handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog|threshold|stall|giveup|swr|hlsFallback"
+  // 播放、唔掂起播/watchdog 任何邏輯(§0 紅線)。queueRef/setQueue/native
```
**唯一命中係執行者自己加嘅一行註解。** 我獨立擴闊咗關鍵字（多咗 `threshold|stall|giveup|swr|hlsFallback`），結果一樣。
Sonnet 報告呢一條**屬實，冇報大**。

### 1.2 `playQueue()` 語義 — 一行未動 ✅

diff 入面 `playQueue` 只出現喺三行註解 + context value 嗰行（`playQueue, playSingle, insertNext, ...`）。
`playQueueImpl` 本體、`playQueueChainRef` 排隊機制全部零 diff。`insertNext` 唔 call `playQueue`、唔 `TrackPlayer.reset()`、唔中斷播放 —— 真機截圖 `ios-08-fullplayer.png` 實錘（插入前 0:07 → 插入後 1:17 連續行）。

### 1.3 queueRef / setQueue / native 三同步 + 先 ref 後 state ✅

```js
queueRef.current = plan.newQ;   // ref 先
setQueue(plan.newQ);            // state 後
```
`autoRadioFromRef` / `insertBoundaryRef` 同樣「先 ref 後 state」，同 `playQueue()` 一致。
native 側：`TrackPlayer.remove(plan.removedIdx)` → `TrackPlayer.add(toTrack(hymn), plan.insertAt)`。
**次序核過**：`insertAt = curIdx+1 ≤ dupIdx = removedIdx`，所以先 remove 唔會令 insertAt 位移 —— 正確。
`currentQueueIndexRef` 唔郁（插入位永遠喺 current 之後）—— 現行實作正確；**但呢個前設會被 P0-1 嘅修法打破，見 §6.1**。

另外核實咗 **native queue 同 JS queue 係 1:1**（`playQueueImpl` 一次過 `TrackPlayer.add(finalList.map(toTrack))`，冇窗口化），所以索引對位嘅假設成立。
`PlaybackActiveTrackChanged`（App.js:1053）用 `event.index` 查 `queueRef.current[idx]` —— **index-based，唔係 id-based**，所以標題／封面同步唔受 P0-1 影響（兩平台實測都正確）。

### 1.4 `onPrefetchComplete` guard —— 只加 guard、冇改熱換行為 ✅

| | 舊 | 新 |
|---|---|---|
| 換邊個 | `TrackPlayer.remove(idx)` / `add(track, idx)`，`idx` = await 之前嘅 JS 快照 | `getQueue()` 之後用 `songId` 喺 **native 真實 queue** 搵 `nativeIdx` |
| 搵唔到 | （唔會發生，直接用快照）| `return` —— 唔換 |

- 熱換本體（`toTrack(song)` 攞本地 URI、`remove`+`add` 一對）**完全冇改**。
- JS/native 同步嗰陣 `nativeIdx === idx`，行為**完全等價**；唔同步先會分岔，而新版跟 native 真相，**嚴格更安全**。
- 前面 `if (idx <= curIdx) return;`（唔掂播緊嗰首）冇改。
- ⚠️（**pre-existing，唔係本次引入**）呢個 guard 唔覆蓋「await 期間 track 自然行咗去下一首」嗰種情況 —— 舊碼一樣中招，新碼多咗一個 `await getQueue()` 令窗口闊咗少少。建議日後補一句 `nativeIdx <= await TrackPlayer.getActiveTrackIndex() → return`。**唔算今次 blocker。**

其餘三處 native 換 URL（App.js:1256 / 1299 / 1880）我獨立覆核過 Sonnet 嘅結論：三個都係用「而家播緊嗰首」嘅 index（`getActiveTrackIndex()` 或者函式頭同步攞嘅 `idx0`），而 `insertNext` 插入位恆為 `curIdx+1`，結構上唔會令「播緊嗰首」個 index 移位 —— **結論成立，唔使加 guard**。

### 1.5 `autoRadioFrom` / `insertBoundary` 邊界 ±1 —— 窮舉證明正確 ✅

```js
if (removedIdx >= 0 && removedIdx < v) v -= 1;   // 刪走嘅舊位喺 boundary 之前
if (v >= insertAt) v += 1;                        // 插入位喺 boundary 或之前
```

我冇淨係「推一次」，而係寫咗一個**獨立 ground-truth 對數**：boundary 語義 = 「指住原本 `cur[b]` 嗰個元素」，
所以正確答案 = `newQ.findIndex(x => x === cur[b])`（`b === len` → `newQ.length`；`b === dupIdx`（boundary 元素自己俾搬走）→ 指住下一個元素）。
窮舉 `len 3..7 × curIdx × b 0..len × dupIdx ∈ {-1, 0..len-1}`：

```
N7 adjustBoundary 窮舉 910 個 case 全部同「跟住 boundary 元素」嘅 ground truth 一致  (bad=0)
```

逐個 case 類別對返執行單：

| case | 例 | 結果 |
|---|---|---|
| 插入位 < boundary | curIdx=2, b=4 → insertAt=3 | `4→5` ✅ |
| 插入位 ≥ boundary（播緊嗰首已經喺尾巴入面）| curIdx=3, b=1 → insertAt=4 | `1→1`（唔郁）✅ 但 UX 有 §5.6 |
| 搬位：舊位喺 boundary 之前 | dupIdx=4, b=5 | `−1` 再 `+1` = 5 ✅（抵消）|
| 搬位：舊位喺 boundary 之後 | dupIdx=6, b=5 | 只 `+1` → 6 ✅ |
| 搬位：舊位**就係** boundary | dupIdx=b=4 | boundary 指去下一個元素 ✅ |
| boundary = null | — | `adjustBoundary` 唔郁 ✅ |
| boundary = queue 長度（尾巴空）| b=len | 跟住變 `newQ.length` ✅ |

**呢一段係整個 PR 質素最高嘅部分。** 註解「removedIdx 結構上一定 ≥ insertAt」亦屬實（搜尋由 `safeIdx+1` 開始）。

### 1.6 `playerBridge.js` —— 判斷「合理，但係技術債」⚠️（唔係 blocker）

Sonnet 話「兩個 provider 次序互相排斥」。**我獨立核實過，佢講嘅事實全部啱**：

- App.js:4628 `<AddToPlaylistProvider><PlayerProvider>` —— AddToPlaylist 喺外。
- App.js:2946 `{(overlayExpanded) && <FullScreenPlayerOverlay />}` —— 由 **PlayerProvider 自己 return**，唔喺 `{children}` 之內。
- App.js:3243 `const { open: openAddToPlaylist } = useAddToPlaylist();` —— 就係喺 `FullScreenPlayerOverlay()`（3222 行）入面。

所以掉轉次序**真係會整爛一個現有用法**，唔係藉口。

**但「冇一個線性次序可以滿足」呢句唔完全準確** —— 標準嘅 React 解法唔係掉轉 provider，而係**拆開**：
`AddToPlaylistProvider` 保留（只出 context + state），將佢自己嗰截 `<SheetShell>` UI 抽做 `<AddToPlaylistSheetHost/>`，
render 落 `PlayerProvider` 嘅 subtree（例如 `AppContent` 隔籬）。
`SheetShell` 用嘅係 **native `<Modal>`**（獨立 window），所以搬 render 位置對 z-order／視覺**基本零風險**，同檔頭警告嗰個「inline BottomSheet + zIndex」陷阱唔同一件事。

**我嘅判斷：** 呢次唔要求改（bridge 行為上正確、真機兩平台都 work、風險細）。
但要**寫低做技術債**，因為 module-level bridge 有兩個實質代價：
- render body 寫 module 級 side effect（React 18 concurrent／StrictMode 唔保證只行一次）—— 雖然同 codebase 現有 `queueRef.current = queue` 慣例一致；
- **冇 reactivity**：`canPlayNext` 只喺 `AddToPlaylistProvider` 自己 re-render 嗰刻重算（開 sheet 嗰刻）。Sonnet 已經自報咗呢個限制，影響細，我同意唔修。

---

## 2. 獨立重跑 harness + 我自己加嘅負控／邊界

### 2.1 原 harness（我獨立重跑兩次）

```
$ node frontend/hymn-app/tools/insertnext-harness/run.js
insertnext-harness: 22 passed, 0 failed          (exit 0)
```
7 個情境 (a)–(g) 覆蓋屬實，`require('../../src/insertNextCore.js')` 確係 App.js 用緊嗰份源碼（唔係抄本）。

### 2.2 我加嘅 18 條（`<scratchpad>/playnext-opus/opus-negctl.js`，18 passed / 0 failed）

| # | 負控／邊界 | 結果 |
|---|---|---|
| **N1** | **repeat-one 模式下插入** | ✅ `computeInsertNext` 同 `repeatMode` **零耦合**（畀個假 `repeatMode:2` 落 opts，plan 一模一樣）；照插第二位。<br>Runtime：`repeatMode===2` → App.js:2904 `setRepeatMode(TPRepeatMode.Track)` → native 永遠 loop 播緊嗰首，**插入嗰首唔會自動輪到**，用戶要自己撳 ⏭（memory 已實錘 repeat-one 照跳得下一首）。queue sheet 照顯示喺第二位。**符合執行單「照插（用戶主動）」，行為可接受，寫低。** |
| **N2** | **shuffle 開住插入之後 `toggleShuffle`（關返）** | 🔴 **失敗（真 bug）** —— 見 §3.2 |
| **N3** | **插入嘅歌 `unavailable`（已下架）** | 🔴 **失敗（真 bug）** —— 見 §3.3 |
| N4 | 插一首已經喺 curIdx **之前**嘅歌 | 🔴 **失敗（真 bug）** —— 見 §3.1 |
| N5 | 播緊最後一首 → append 隊尾 / curIdx 越界 fallback / id 字串vs數字混合去重 / `id=null` | ✅ 四條全過（`id=null` 靠 App.js `if (!hymn?.id) return` 攔住，core 本身唔攔 —— 可接受但要記住） |
| N6 | 播緊嗰首已經喺自動尾巴入面（curIdx ≥ autoRadioFrom）| ✅ 運算正確，但 UX 有問題 —— 見 §5.6 |
| N7 | `adjustBoundary` 910 case 窮舉 ground-truth | ✅ 0 mismatch |

---

## 3. 問題清單

### 🔴 P0-1 — 去重窗口太窄 → queue 出現重複 id（**兩平台實測重現**）

**位置**：`src/insertNextCore.js:60-66`
```js
for (let i = safeIdx + 1; i < cur.length; i++) {   // ← 只搜「播緊之後」
```

**觸發**：播 A（index 0）→ 自動／⏭ 行到 B（curIdx=1）→ 對 A 撳「下一首播放」。
A 喺 index 0（curIdx 之前），搜尋範圍搵唔到 → **當佢係新歌插多一次** → queue = `[A, B, A, ...]`。

**點解嚴重 —— 佢打破咗 codebase 一路刻意維持嘅不變式**：
- `playSingle`（App.js:2481）：`resumeRemainder ... .filter((s) => String(s.id) !== String(hymn.id))`
- `rebuildTail`（App.js:2626）：`const headIds = new Set(head.map(...))`，尾巴要 `.filter(s => !headIds.has(...))`，
  註解白紙黑字寫住後果：*「重複 id 會令 React 出 two children with the same key warning，『而家播緊』個高亮同時著兩行，而且撳第二行嗰陣 queue.findIndex() 會跳返第一行嗰個 index、skip 去錯歌（2026-07-30 實測 logcat 見到 warning）」*

`insertNext` 係**第一個打破呢個不變式嘅 queue mutator**。

**受害 call site（我逐個查過）**：
| 位置 | 代碼 | 後果 |
|---|---|---|
| App.js:3678 | `player.skipToQueueIndex(queue.findIndex(h => h.id === item.id))` | 撳新插入嗰行 → 跳去**第一個**同 id 嘅位（**向後跳**）|
| App.js:3677 | `item.id === cur.id && fsStyles.queueItemActive` | **兩行同時高亮** |
| App.js:3573 | `keyExtractor={(item) => String(item.id)}` | DraggableFlatList **重複 key**（拖曳排序更危險）|
| App.js:2818 | `reorderQueue`：`newData.findIndex(s => s.id === playing.id)` | 拖完之後 `currentQueueIndexRef` 可能指錯 → §3.5 嗰種「顯示錯歌名」|

**實測證據**：
- 純函式：`N4b newQ = [10,11,10,12,13]`；`N4c` 撳 index 2 嗰行 → `findIndex` 回 **0**。
- iOS：`ios-21-DUP.png`（播放清單 34，同心圓喺 index 0 同 index 2）→ `ios-22-DUP-tap-wrong.png`（撳 index 2 → 跳咗去 index 0，`nextTrackMs hid=3422 origin=tapQueue`）→ `ios-23-DUP-double-highlight.png`（**兩行同時高亮**）。
- Android：`and-27-DUP.png`（播放清單 34，同心圓喺 index 0 同 index 3）。

**修法**：見 §6.1（已窮舉驗證）。

---

### 🔴 P0-2 — `originalQueueRef` 冇同步 → shuffle 開→關，插入嘅歌全部消失（**Android 實測**）

**位置**：`App.js insertNext()` —— 全函式冇一句寫 `originalQueueRef`。

**機制**：
- `playQueueImpl`（2723）寫 `originalQueueRef.current = finalList`。
- `reorderQueue`（2815）**有**補寫：`if (!isShuffledRef.current) originalQueueRef.current = newData;`
- `toggleShuffle` 關 shuffle（477-479）用 `originalQueueRef.current` 重砌 → 之後 `TrackPlayer.reset()` + `add(newQ)`，**JS 同 native 一齊冇咗**。
- `insertNext` 冇補寫 → 插入嘅歌唔喺 `originalQueueRef` → 關 shuffle 即刻蒸發。

**實測（Android，決定性 before/after）**：

| 步驟 | 播放清單 | 截圖 |
|---|---|---|
| 三次 Play Next 之後 | **34** | `and-27-DUP.png` |
| shuffle **ON** | **34**（插入嘅歌仲喺度）| `and-28-shuffle-on.png` |
| shuffle **OFF** | **31** ← 跌返落原本 playQueue 嗰個 list | `and-29-shuffle-off.png` |

31 = 起播嗰陣個 list 長度。**三首插入嘅歌無聲無息冇晒**，播放位置亦跳返去 同心圓 1:12。

**公平講**：`rebuildTail` / `applyAutoplayEnabled(false)` 都有同一個漏（pre-existing）。
**但**：① `insertNext` 係新加嘅 mutator，② `reorderQueue` 已經示範咗一行嘅正確做法，③ Play Next 嘅語義就係「我要即刻聽呢首」——冇咗特別明顯。

**修法**：§6.2。

---

### 🔴 P1-3 — `unavailable`（已下架佔位）完全冇 filter，重演 2026-08-22 事故

**位置**：`insertNextCore.js` / `insertNext()` —— 零 `unavailable` 判斷。

**對照**：`playQueueImpl`（App.js:2684-2707）有成 30 行專門處理，包括 `showNotice('呢首歌已經下架，播唔到')`、
`showNotice('呢首歌已經下架，跳去下一首')`、同埋 `autoRadioFrom`/`insertBoundary` 嘅 `shift()` 重新對位。
（嗰段註解就係 `DELISTED-FAVORITES-ROOTCAUSE-20260822` 嗰單：*「實測 id=2015 喺 17:12:02–17:13:27 俾 ExoPlayer 用退避重試撞咗 21 次 404、燒咗 86 秒死寂」*。）

**入口實錘可達**（我逐條追過）：
`FavoritesContext.js:64` 對「server 有呢個 hymn_id、但全庫同本地 cache 都揾唔到」嘅 id 留 `{ id, title:'(已下架)', unavailable:true }` 佔位
→ `MineScreen.js:307` 最愛 list **每一行**（包括呢啲佔位行）都 render `≡+`
→ `openAddToPlaylist(item)` → AddToPlaylistSheet
→ `canPlayNext` 只睇 `mode==='add' && target && queue.length>0 && currentHymn?.id != null`，**唔睇 target.unavailable**
→ 「下一首播放」照出 → `insertNext(佔位項)` → `toTrack()` 砌 `/api/stream/2015` → 404。

**證據**：純函式 N3a/N3b（`plan.newQ[1].unavailable === true`，完全冇 filter）。
**做唔到**：真機冇重現到 —— opus-verify 個 9 首最愛全部 resolve 得返，冇 `(已下架)` 佔位行（見 `ios-31-mine-admin.png`）。**呢條係 code-path 證明，唔係真機證明。**

**修法**：§6.3（三行）。

---

### 🟠 P2-4 — 插入嘅歌**結構上永遠係冷歌**；iOS 實測第一次 ⏭ 過去俾 native watchdog 斬咗

執行單 §0 紅線寫明「唔另加預載，prefetch 照舊滾動窗口自然會暖到新歌」。
**「自然會暖到」呢個假設唔成立**：`warmIds(queueRef.current.slice(idx+1, idx+4))` 只喺 **`PlaybackActiveTrackChanged`**（App.js:1088）先跑。
插入發生喺**兩次轉歌之間**，冇 track change → 插入嗰首**由頭到尾冇 warm 過、iOS 亦冇 prefetch 過**，
但佢又即刻變成「下一首」→ **Play Next 結構上保證咗下一首係最冷嗰種**。

**iOS 實測（`ios-16` / `ios-17` + backend jsonl）**：
```
10:41:55 playNext  hid=2 moved=1 at=1 qlen=33
10:42:45 nativeStall phase=nudge       pos=0.0 hid=2 sinceItemChange=7  itemNil=1 bytesXfer=0 rate=0.000
10:42:49 nativeStall phase=detected    ... frozenSec=12 fg=1
10:42:49 nativeStall phase=reloaded    ...
10:42:55 nativeStall phase=skipped     pos=0.0 hid=2 sinceItemChange=17 itemNil=1 bytesXfer=0 skips=1
10:42:55 nativeSkipAttributed idx=2
```
→ 用戶主動揀嘅「下一首播放」嗰首（hid=2）**完全冇播到，俾 native stall watchdog 斬咗**（畫面見「載入緩慢，重試緊…」→ 直接跳去第三首）。
對照：同一秒接落去嘅 hid=3 係 `source=local`（暖）→ `ms=0`。
再對照：手動由 queue 撳返 hid=2 → `ms=8137 source=stream` —— **8.1 秒冷起播**，同 `itemNil=1 / bytesXfer=0` 一齊睇，
係 memory 已記錄嘅 iOS pos=0 / pre-item window 舊病（`project-pos0-load-storm-rootfix-plan`、`project-build16-fg-watchdog-false-positive`），
**唔係 insertNext 整出嚟嘅新病** —— 但 Play Next **結構上令用戶最想聽嗰首歌，撞正呢個舊病嘅機率最高**。

**建議**（要 Eric／Fable 拍板算唔算破紅線）：`insertNext` 成功之後補一句 `warmIds([hymn.id])`。
呢個係**純 backend warm**（`POST /warm`），唔落本地音訊副本、唔碰 `prefetchAudio`，我讀返紅線原文「唔擴大本地音訊副本」——
`warmIds` 唔違反嗰句，違反嘅只係「唔另加預載」嗰句嘅字面。**建議放寬呢一句。**
（樣本 n=1，Eric 真機要覆核，見 §7。）

---

### 🟠 P2-5 — 「冇歌播緊撳 → 當即刻播」由唯一入口**不可達**（死 code / 規格自相矛盾）

執行單 §1.1-1 要求「冇 queue／冇 current track → `return playSingle(hymn)`」，
但 §1.2 又要求「只喺 `queue.length > 0 && 有 current track` 先顯示」。**兩條互相取消。**

實作跟咗 §1.2：`AddToPlaylistSheet.js:91-92` `canPlayNext = ... && (bridge.queue?.length > 0) && bridge.currentHymn?.id != null`。

**實測負控（iOS 冷開，冇播過任何歌）**：`ios-36-emptyqueue-row-hidden.png` —— 「加入到清單」sheet **完全冇「下一首播放」行**。
所以 `plan.fallbackToSingle` 呢條路由 UI **行唔到**（除非撞到「通知列 swipe 走 → `resyncFromNative` 冷開 reset → trackState=None 但 queue state 未清」嗰個窄窗）。

**唔算 bug，但要拍板**：要就放寬顯示條件（冇嘢播都顯示，撳=即刻播，同 YT Music 一致），要就承認 §1.1-1 係 dead code 並喺報告寫低。
**Sonnet 兩邊都跟足執行單，唔係佢嘅錯 —— 係執行單本身矛盾。**

---

### 🟡 P3-6 — 播到自動尾巴之後，插入嘅歌會顯示喺「自動播放：全部」分隔線**下面**

`curIdx ≥ autoRadioFrom` 嗰陣（= 第一首播完之後嘅**常態**），`insertAt > autoRadioFrom`，`adjustBoundary` 唔郁 boundary，
所以用戶親手插嘅歌會坐喺「自動播放：全部」線下面，**睇落好似係系統隨機揀嘅**。

運算冇錯（N6a/N6b 驗證過），係**語義／UX 問題**。
Sonnet 真機只截到 `curIdx=0 < autoRadioFrom=1` 嗰個靚 case（`13-queue-open.png`）；
佢自己第二次插入 `at=7`（curIdx=6）就正正係呢個 case，**冇截圖、冇提**。

---

### 🟡 P3-7 — `insertNext` 冇並發保護

`playQueue` 有 `playQueueChainRef` 排隊（H6 修，就係為咗「兩條 queue 改動交錯 → queueRef 同 native 對唔上」）。
`insertNext` 直接 call `TrackPlayer.*`，而 `cur = queueRef.current` 個快照**跨咗兩個 await**。
撳完「下一首播放」（sheet 即刻閂）之後即刻喺詩歌庫撳另一首歌 → `playQueue` 開始 → `insertNext` 個 await resolve →
`queueRef.current = plan.newQ` **覆寫**咗新 list。窗口只有幾十 ms，但係同 §3.5 同一類病。
建議：`insertNext` 都行返 `playQueueChainRef` 條鏈，或者 resolve 之後比對 `queueRef.current === cur` 先寫。

### 🟡 P3-8 — 失敗路徑嘅邊界唔一致

`insertNext` 步驟次序係：`remove` → `add` → **寫 boundary** → 寫 queue。
如果 `remove` 成功但 `add` 拋錯，`catch` 只用 `reconcileFromNativeQueue` 重砌 `queueRef`/`setQueue`，
**冇重算 `autoRadioFrom`/`insertBoundary`** —— native 少咗一首，但 boundary 停留喺舊值 → 分隔線差一格。
細問題（只喺 error path），但可以順手用 `plan` 算返。

---

## 4. 做啱咗嘅嘢（正面記錄）

- 邊界 ±1 運算 **910 case 窮舉零 mismatch** —— 呢部分寫得好過大部分現有 queue code。
- 抽 `insertNextCore.js` 做零依賴 CommonJS pure function + harness 直接 `require` 真源碼（**唔係抄本**）：呢個做法應該推廣到其他 queue mutator。
- 紅線守得乾淨（6 個 hunk，零 watchdog／stall／playQueue 改動）。
- `onPrefetchComplete` guard 係**最小、正確、嚴格更安全**嘅改法（搵唔到就唔換，寧缺勿錯）。
- Sonnet 自報咗兩個限制（`originalQueueRef`、`canPlayNext` reactivity）—— 誠實，冇藏。**但 `originalQueueRef` 嗰個被低估咗，佢寫「可能唔見咗」，實際係確定性 data loss（見 §3.2）。**
- H4 beacon 兩平台都齊：`playNext` + `hymnId` + `detail(moved/at/qlen)` + 強制注入五欄（`platform`/`deviceId`/`appVersion`/`updateId`/`sessionId`）。

---

## 5. 兩平台場景矩陣

iOS：iPhone 17 模擬器 `E0416618-…`（iOS 26.5），自 build Release（`xcodebuild -configuration Release -sdk iphonesimulator`，BUILD SUCCEEDED，`main.jsbundle` 3,743,505 B，Hermes bytecode 內見 `insertNext error:` 字串確認新碼已入 bundle），`Expo.plist EXUpdatesCheckOnLaunch ALWAYS→NEVER`。
Android：AVD `hymntest`，`expo export:embed` + `hermesc -w -emit-binary`（3,707,472 B）取代 vc55 APK 嘅 `assets/index.android.bundle`，`zipalign` + 同一條 debug.keystore 重簽（`fac61745…`）。
兩部機**一次只開一部**，全程 hold 檔在位，收工都已清（`booted:0 idb:0 sim:0 devtools:0 qemu:0`，原裝 vc55 APK 已 `adb install -r -d` 蓋返）。
登入：JWT_SECRET 本機 mint user 6（opus-verify，role=admin）注入 AsyncStorage（iOS `RCTAsyncLocalStorage_V1/manifest.json`；Android `RKStorage`）。**冇印過 secret、冇打過密碼。**

| # | 場景 | iOS | Android | 證據 |
|---|---|---|---|---|
| 1 | 播一首有自動尾巴嘅歌（queue 31，autoRadioFrom=1）| ✅ | ✅ | `ios-04` / `and-03` |
| 2 | 詩歌庫另一首 →「加入到清單」→ 見到「下一首播放」行（icon = ▶│ skip-next）| ✅ | ✅ | `ios-06` / `and-07` |
| 3 | 撳「下一首播放」→ toast「已加到下一首播放」| ✅ | ✅ | `ios-07` / `and-08` |
| 4 | **播緊嗰首 position 冇跳**（0:07 → 1:17 連續）| ✅ | ✅（mini player 持續播放）| `ios-08` |
| 5 | 播放清單 sheet：新歌**第二位**、總數 31→32 | ✅ | ✅ | `ios-09` / `and-09` |
| 6 | 「自動播放：全部」分隔線位置跟住 +1 | ✅ | ✅ | `ios-09` / `and-09` |
| 7 | 連插兩首 → 次序 `[cur, B, A]`、32→33、線 →index 3 | ✅ | ✅ | `ios-11` / `and-11` |
| 8 | **插已喺後面嘅歌 → 搬上嚟唔重複**（長度不變 33，`moved=1 at=1 qlen=33`）| ✅ | ✅ | `ios-13` / `and-13` |
| 9 | 播緊嗰首撳 → toast「播緊呢首」、queue 零改動 | ✅ | ✅（同一 code path）| `ios-14` |
| 10 | ⏭ 跳去插入嗰首 → 標題／封面／時長同步正確 | ✅ | ✅ | `ios-16` / `and-14` |
| 11 | 插入後等自然播完切歌 → 標題／封面同步（索引正控）| ✅（`hid=2 origin=auto ms=1`）| ✅ | `ios-25` |
| 12 | 鎖屏／通知顯示對正 | ✅（同一 `toTrack()`，結構等價）| ✅ **實錘** `metadata description=這一生最美的祝福` + 通知列截圖 | `and-15` + `dumpsys media_session` |
| 13 | 背景播放唔受影響 | n/a | ✅ `state=PLAYING position=108562` | `dumpsys` |
| 14 | Android 返回鍵（1 下收 queue sheet、2 下收播放器、唔殺 app、播放繼續）| n/a | ✅ | `and-16` / `and-17` |
| 15 | backend jsonl `playNext` 五欄齊 | ✅ 4 條 | ✅ 4 條 | 見下 |
| 16 | **冇歌播緊 → 撳** | ⚠️ **入口唔顯示**（P2-5）| 同上 | `ios-36` |
| 17 | **插一首 curIdx 之前嘅歌** | 🔴 **重複 id + 兩行高亮 + 撳新行跳錯** | 🔴 **重複 id** | `ios-21/22/23` / `and-27` |
| 18 | **shuffle 開→關** | 未測（code path 相同）| 🔴 **34 → 31，插入嘅歌消失** | `and-28` / `and-29` |
| 19 | repeat-one 下插入 | 純函式驗證 ✅（零耦合）；runtime 行為已寫低 | 同 | N1 |
| 20 | 插入 `unavailable` 歌 | 🔴 code path 確認冇 filter（真機冇樣本）| 同 | N3 |

**beacon（兩平台，五欄齊）**
```
ios     10:39:54 playNext hid=2    moved=0 at=1 qlen=32   platform=ios     deviceId=3438… appVersion=1.5.1 updateId=… sessionId=…
ios     10:41:15 playNext hid=3    moved=0 at=1 qlen=33
ios     10:41:55 playNext hid=2    moved=1 at=1 qlen=33   ← 去重搬位，qlen 不變（同 H1 (d) 一致）
android 10:59:50 playNext hid=2    moved=0 at=1 qlen=32   platform=android deviceId=c3fb4f9e appVersion=1.5.1 …
android 11:00:46 playNext hid=3    moved=0 at=1 qlen=33
android 11:01:17 playNext hid=2    moved=1 at=1 qlen=33
android 11:06:32 playNext hid=3422 moved=0 at=3 qlen=34   ← P0-1 嗰次（moved=0 = 冇去重到）
```

### 5.1 ⚠️ Android 一個必須記低嘅測試陷阱

第一次喺 Android 開「加入到清單」，**「下一首播放」行冇出現**（`and-05-addsheet.png`）。
**唔係 Android bug** —— 係 `pm clear` → launch#1（embedded）→ 背景下載咗 production OTA 並標 pending → force-stop → launch#2 **套用咗嗰個舊 OTA bundle**。
分辨方法（唔使睇 logcat 都認得）：舊 bundle 嘅 sheet 標題係**左對齊、冇 ✕**；HEAD（SheetShell）係**置中 + ✕**。
解法：`rm -rf files/.expo-internal/* databases/updates.db*` 再 launch → 跌返 embedded（我哋 patch 嗰份）。之後行為同 iOS 完全一致。
**以後任何 Android bundle-patch 測試，第一步都要用一個「只有新 code 先有」嘅視覺特徵確認 bundle provenance。**

---

## 6. 建議修法

### 6.1 P0-1（我已寫原型 + 窮舉驗證：910/910 通過，零重複 id、零 index 錯位）

`insertNextCore.js`：
```js
// 搜尋整個 queue，唔止「播緊之後」（i === safeIdx 係「播緊嗰首」，上面已經處理）
let dupIdx = -1;
for (let i = 0; i < cur.length; i++) {
  if (i === safeIdx) continue;
  if (String(cur[i] && cur[i].id) === String(hymn && hymn.id)) { dupIdx = i; break; }
}
let workingQ = cur, removedIdx = -1, newCurIdx = safeIdx;
if (dupIdx >= 0) {
  workingQ = cur.slice(0, dupIdx).concat(cur.slice(dupIdx + 1));
  removedIdx = dupIdx;
  if (dupIdx < safeIdx) newCurIdx = safeIdx - 1;   // ★ 播緊嗰首前面少咗一個
}
const insertAt = newCurIdx + 1;                     // ★ 唔再係 safeIdx + 1
// adjustBoundary 兩條規則原封不動 —— 我已驗證喺新 insertAt 之下仍然正確
return { ..., newCurIdx };
```

`App.js insertNext()` 要**多做一件事**（呢個係最易漏嗰步）：
```js
if (plan.newCurIdx !== curIdx) {
  currentQueueIndexRef.current = plan.newCurIdx;   // 先 ref
  setCurrentQueueIndex(plan.newCurIdx);            // 後 state
}
```
native 側次序唔使改（`remove(removedIdx)` 一定行喺 `add(insertAt)` 之前；`removedIdx < safeIdx` 嗰陣 RNTP 移走播緊嗰首前面一個 track 唔會斷播，但**呢一點要真機驗**）。

harness 要補：`dupIdx < curIdx` 全家（我嘅 `opus-fixproposal.js` 已經有 910 case ground-truth 對數，可以直接搬入 repo harness）。

### 6.2 P0-2（一行，抄 `reorderQueue` 現成做法）
```js
queueRef.current = plan.newQ;
setQueue(plan.newQ);
if (!isShuffledRef.current) originalQueueRef.current = plan.newQ;   // ★ 同 App.js:2815 一致
```
（shuffle 開住嗰陣插入 → 關 shuffle 之後嗰首歌仍然會冇 —— 要完美就要 splice 入 `originalQueueRef`。
最少要做嘅係 `!isShuffled` 呢條主線，**佢已經冚咗實測嗰個 case**。）

### 6.3 P1-3（三行，抄 `playQueueImpl` 現成文案）
```js
async function insertNext(hymn) {
  if (!hymn?.id) return;
  if (hymn.unavailable) { showNotice('呢首歌已經下架，播唔到'); return; }   // ★
  ...
```
（順手可以喺 `AddToPlaylistSheet` 個 `canPlayNext` 加 `&& !target.unavailable`，令行根本唔顯示 —— 但 `insertNext` 自己嗰道閘先係硬防線。）

### 6.4 建議（唔阻 OTA）
- P2-4：`sendClientLog` 之後補 `warmIds([hymn.id])`（純 backend warm），要 Eric／Fable 拍板放寬紅線「唔另加預載」。
- P2-5：拍板「冇嘢播住撳點算」，兩邊都要改一句。
- P3-6：`insertAt > autoRadioFrom` 嗰陣考慮將 `autoRadioFrom` 推去 `insertAt+1`（即插入嘅歌永遠喺線上面）。
- P3-7 / P3-8：加入 `playQueueChainRef`；catch 入面用 `plan` 重算邊界。
- 技術債：`playerBridge` 日後拆做 `<AddToPlaylistSheetHost/>` render 落 PlayerProvider subtree（SheetShell 係 native Modal，搬位置零視覺風險）。

---

## 7. OTA 之後 Eric 真機**最少一項**檢查

> **修完 P0-1 之後**：開 app 播一首歌 → 撳 ⏭ 跳去下一首 → 對**啱啱播完嗰首**（即上一首）撳「加入到清單」→「下一首播放」
> → 開「播放清單」睇：**應該只見到嗰首歌一次**（由上面搬咗落嚟第二位），唔應該見到兩行一模一樣嘅歌、亦唔應該有兩行同時著高亮。
> 跟住撳嗰行，**應該由呢一首開始播**（唔可以跳返轉頭去舊嗰個位）。

（如果 P2-4 都修埋，順手留意撳完「下一首播放」之後撳 ⏭，隻歌係咪即刻出聲 —— 而家未修嘅話有機會轉圈幾秒甚至俾系統跳過。）

---

## 8. 做唔到 / 限制（唔准當做完）

1. **真機 = 模擬器／AVD**，唔係 Eric 部實體機。iOS 冇實體鎖屏測試（用 `toTrack()` 結構等價 + Android `dumpsys media_session` 補證）。
2. **P1-3 冇真機重現** —— opus-verify 個最愛冇 `(已下架)` 佔位樣本，只有 code-path 證明（`FavoritesContext.js:64` → `MineScreen.js:307` → `canPlayNext`）。
3. **P2-4 樣本 n=1**（一次 skip 事故 + 一次 8137ms 冷起播）。機制解釋得通（`itemNil=1 bytesXfer=0`＝已知 iOS 舊病），但**唔可以由一次就話「Play Next 一定跳歌」**。
4. **P0-2 只喺 Android 實測**（iOS 冇跑）—— `toggleShuffle` 兩平台同一份 JS，但寫報告時當「iOS 未驗」。
5. 我提議嘅 P0-1 修法**只驗證咗純函式層**（910 case）。`TrackPlayer.remove()` 一個喺播緊嗰首**前面**嘅 track 會唔會影響播放，**未喺真機驗過**，落實嗰陣一定要補。
6. **Android bundle provenance 陷阱**：見 §5.1。第一份 Android 觀察（`and-05`）作廢。
7. 我改咗一個 host 設定 `com.apple.iphonesimulator ConnectHardwareKeyboard`（為咗令模擬器彈到軟鍵盤驗 P2-1），**收工已經改返 true**。
8. 兩部測試機都仲**登住 opus-verify**（AsyncStorage 入面有一條本機 mint 嘅 30 日 JWT）。同以往驗收 session 嘅做法一致，冇特別清走；要清就 iOS `simctl uninstall` / Android `pm clear`。

---

## 附：§4 順帶回歸（SheetShell 6e71cc1，兩平台各一次）

| 項 | iOS | Android | 證據 |
|---|---|---|---|
| 「加入到清單」sheet **下滑收起** | ✅ | ✅（呢個就係 SheetShell 原本要修嗰單 Android bug）| `ios-26/27`、`and-19/20` |
| **P2-1 正控**：admin「編輯詩歌」面板鍵盤彈出時，handle／標題／✕ 仍然喺畫面內（`maxHeight="85%"` + `keyboardAware`）| ✅ | ✅ | `ios-30`、`and-22` |
| **P3-1 正控**：「在線」面板喺**三個數字磚**上面下拉，收得起 | ✅ | ✅ | `ios-33/34`、`and-24/25` |

⚠️ iOS 第一次試 P2-1 **量度失敗**（`ios-29`）：headless 模擬器預設「硬件鍵盤已連接」，軟鍵盤唔彈 → `keyboardDidShow` 唔 fire → **根本冇行到 P2-1 條 code path**。
要 `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false` + 開 Simulator.app 先量到（`ios-30`）。
**呢個係「儀器冇響 ≠ 冇問題」嘅典型 —— 以後 iOS 測鍵盤相關 UI 一定要先確認軟鍵盤真係彈咗出嚟。**
