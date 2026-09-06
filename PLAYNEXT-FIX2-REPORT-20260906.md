# PLAYNEXT-FIX2-REPORT-20260906 — Play Next 修補第二輪執行報告

執行者：Sonnet 5。對象：`PLAYNEXT-OPUS2-20260906.md` 驗收揪出嘅 B1（`autoRadioFrom` 語義衝突,電台尾巴死亡）、
B2（shuffle 開住插入仍丟歌）、P2-4（warmIds 講法收返）、P3-7 nit（catch 分支 reindex 基準）。
基準 `503a362`（Opus2 驗收嗰次）。全程只改 `frontend/hymn-app/App.js`、`frontend/hymn-app/src/insertNextCore.js`、
`frontend/hymn-app/tools/insertnext-harness/run.js` 三個檔案。
`git diff 503a362 --stat -- frontend/hymn-app/App.js frontend/hymn-app/src/insertNextCore.js frontend/hymn-app/tools/insertnext-harness/run.js`：
198 insertions / 40 deletions。

---

## 0. 紅線核對

```
git diff 503a362 -- frontend/hymn-app/App.js frontend/hymn-app/src/insertNextCore.js | grep -iE \
  "handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog|threshold|stall|giveup|swr|hlsFallback|prefetchAudio|nativeStall"
```

零命中。`playQueue()`/`playQueueImpl` 本體一行未動（`grep -n "^[+-].*function playQueue"` 冇輸出）。
全部改動集中喺 `insertNextCore.js` 嘅 `computeInsertNext()` 同 `App.js` 嘅 `insertNextImpl()`。

---

## 1. 逐條修法

### B1 — revert P3-6，改用「插播」概念畫線

**問題**：上輪 P3-6 個修法（尾巴期間插入就推 `autoRadioFrom`）同時改咗 `autoRadioFrom` 嘅「headLen」語義
（`playSingle`/`rebuildTail`/`applyAutoplayEnabled` 三個 caller 都靠佢分辨「用戶真係揀咗幾多首」vs「自動接續尾巴」），
推線 = 話俾呢三個 caller 知「頭幾首全部係用戶揀」，令 `playSingle()` 之後撳散歌行「插播」路（`isExplicitQueue=true`），
隊列得返 `[新歌, 插入嗰首]` 兩首、冇尾巴、播完就停。

**修法**（`src/insertNextCore.js` `computeInsertNext()`）：
1. `autoRadioFrom` 完全唔再被 override，淨係跟正常 `adjustBoundary()` shift（同 P0-1 去重搬位的邊界調整一致）。
2. 尾巴期間插入（`adjustedAutoRadioFrom != null && adjustedAutoRadioFrom <= insertAt`）改為推 **`insertBoundary`**
   （= `insertAt + 1`），用現有「插播」機制畫「即將播放」分隔線，唔郁 `autoRadioFrom`。
3. 呢條線行過（App.js:1128 `PlaybackActiveTrackChanged` 嗰段既有邏輯：`if (insertBoundaryRef.current != null && idx >= insertBoundaryRef.current) { 清 }`）就自動清，唔會變成永久鬼影線。

**`App.js insertNextImpl()` 配合改動**：
- 寫 `insertBoundary` 嗰句由 `if (insertBoundaryRef.current != null) {...}` 改成 `if (plan.insertBoundary !== ib0) {...}`——
  舊 guard 淨係喺「原本已經有 boundary」先至同步，會擋死呢次 B1 需要嘅「null→number」新情況（尾巴期間插入前冇插播線，
  插入之後要由 null 變成有值），改用「同 ib0 唔同就寫」嘅比較，null→null 個 case 仍然係 no-op（安全）。

**驗證**：
- Harness scenario (m) 重寫：斷言 `plan.autoRadioFrom` 喺尾巴期間插入後**維持 1 唔變**（唔再推去 `insertAt+1`），
  `plan.insertBoundary` 就推去 `insertAt+1`；再模擬 App.js `playSingle()` 頭嗰段（`headLen = autoRadioFrom`,
  `isExplicitQueue = headLen>1`），證明 `headLen` 冇變（仍然 1）→ `isExplicitQueue=false` → 唔會行「插播剩餘清單」
  嗰條路 → 電台尾巴會照舊起返，隊列唔會跌落 2 首。
- **iOS sim 真機驗證**（§3 smoke (a)）：尾巴期間插入 → 「即將播放」線出現喺新歌下面、「自動播放：全部」線位置
  完全不變（仍然企喺播緊嗰首前面）→ 再撳一首散歌 → 全屏播放器「播放清單 (31)」（唔係 2）、新開嘅電台尾巴
  完整（自動播放線在新歌之後）。

### B2 — shuffle 開住插入，`originalQueueRef` 同步（照 Opus 附嘅 patch）

**問題**：上輪 P0-2 個修法淨係覆蓋咗 `!isShuffledRef.current`（冇開 shuffle）嗰條路，`toggleShuffle` 開 shuffle 嗰刻
本身唔會寫 `originalQueueRef`（佢本來就係要留住 pre-shuffle 次序），所以「shuffle 開住插入」嗰個情況下
`originalQueueRef` 由頭到尾都冇見過新插入嘅歌，關返 shuffle 用佢重砌就無聲無息消失。

**修法**（`App.js insertNextImpl()`，逐字照 Opus 附嘅 patch）：
```js
if (!isShuffledRef.current) {
  originalQueueRef.current = plan.newQ;
} else {
  const o = originalQueueRef.current || [];
  const without = o.filter((x) => String(x && x.id) !== String(hymn.id));   // 順手做埋去重
  const anchor = cur[curIdx];                                              // 播緊嗰首
  const oi = without.findIndex((x) => String(x && x.id) === String(anchor && anchor.id));
  originalQueueRef.current = oi >= 0
    ? [...without.slice(0, oi + 1), hymn, ...without.slice(oi + 1)]
    : [...without, hymn];
}
```
開住 shuffle 嗰陣，喺 `originalQueueRef`（pre-shuffle 次序）度獨立做一次「去重（用 `hymn.id` 濾走舊位，防止兄弟片
兩份）+ 插入（錨定播緊嗰首喺 `originalQueueRef` 入面嘅位置，插喺佢後面）」——同 `queueRef`/native queue 嗰個插入位
無關，因為 pre-shuffle 次序入面播緊嗰首未必喺同一個 index。

**核實 `toggleShuffle` 開 shuffle 嗰刻冇寫 `originalQueueRef`**：讀 App.js:444-501 `toggleShuffle()`——開 shuffle
分支（`!isShuffledRef.current`）只做 Fisher-Yates 洗牌寫 `newQ`/`queueRef`/`setQueue`，全程冇碰 `originalQueueRef`；
`originalQueueRef` 只喺**熄** shuffle 嗰刻被讀（`orig = originalQueueRef.current?.length ? ... : q`）。呢個確認咗
B2 個 bug 嘅根源：`originalQueueRef` 由開 shuffle 果一刻開始就凍結喺「開之前嗰個 snapshot」，之後所有喺 shuffle
開住期間發生嘅 mutation（包括 Play Next）都要靠 caller 自己手動同步落去，冇第二條路。

**驗證**：
- Harness scenario (p)（新增）：模擬 shuffle ON → 插兩首全新歌（X、Y）→ 插一首本身已經喺 `originalQueueRef`
  度嘅歌（13，行 dedupe 搬位路）→ 熄 shuffle 用 `originalQueueRef` 重砌。斷言：`originalQueueRef` 冇重複 id、
  長度精準 `+2`（第三次插入係 move 唔係 net-new）、restored 隊列長度不變、X/Y 兩首都喺度、restored 冇重複 id。
- **iOS sim 真機驗證**（§3 smoke (b)）：shuffle 開（「已隨機排序」chip 出現，31 首）→ 用 ≡+ 插兩首（都係
  dedupe-搬位路，一首「我要順服」、一首「信」）→ 熄 shuffle → 「播放清單 (31)」**不變**，兩首插入嘅歌喺
  restored 隊列度都仲喺，順序正正係「聖靈來風（播緊嗰首）、信、我要順服」——同插入次序一致（後插先播）。

### P2-4 — warmIds 講法收返（唔再嘗試解）

保留上輪落地嘅 `warmIds([hymn.id])`（純 backend warm，冇改動）。報告明文收窄講法：插入之後即刻撳 ⏭ 仍可能撞冷歌
（同任何未預熱嘅下一首一樣，warm 一個 HTTP round-trip嘅時間唔夠喺「插入 → 即刻撳下一首」之間完成），**呢個唔係
regression**，係結構性限制（Opus2 §1 P2-4 已經量過：itemNil 16 秒對比對照組（隔 93 秒先播到）冇 itemNil，warm
有時間先有用），唔屬於呢次範圍，另外開單處理。

### P3-7 nit — catch 分支 reindex 基準改用掛鏈快照

**問題**：`insertNextImpl()` 嘅 `catch` 分支用 `autoRadioFromRef.current`/`insertBoundaryRef.current` 做
`reindexBoundaryById(cur, ..., rebuiltQ)` 嘅基準，但 `cur` 係「掛鏈嗰刻」嘅舊 index 空間快照；如果 throw 發生喺
success path 嘅 step 6（邊界調整）之後，嗰兩個 ref 已經俾寫咗做 `plan.autoRadioFrom`/`plan.insertBoundary`——
**newQ 空間**嘅 index，同 `cur`（oldCur 空間）對唔上位，`reindexBoundaryById` 會用錯位嘅 index 去 `cur` 度攞
marker，指錯歌。step 6 之後淨返 `setQueue`/`originalQueueRef` 同步/`warmIds`/`sendClientLog`（都唔會 throw），
所以呢個窗口係理論性，冇實測到。

**修法**（一行變數，`App.js insertNextImpl()` 開頭）：
```js
const arf0 = autoRadioFromRef.current;
const ib0 = insertBoundaryRef.current;
```
喺 `computeInsertNext()` 呼叫同 catch 分支嘅 `reindexBoundaryById` 都改用 `arf0`/`ib0`（同 `cur` 同一個
index 空間，唔會俾 success path 嘅 step 6 寫壞），success path 嘅寫回判斷（`if (arf0 != null)` / `if (plan.insertBoundary !== ib0)`）
都跟住改用呢兩個快照變數。

**驗證**：純邏輯改動（變數改名+改讀取來源），冇改變任何 harness 斷言嘅輸出（原有 scenario (n) 四個子 case 全過，
證明 `reindexBoundaryById` 本身邏輯不變，只係基準嚟源改咗）。

---

## 2. Harness / 儀器數

| 跑咩 | 結果 |
|---|---|
| `node tools/insertnext-harness/run.js` | **66 passed, 0 failed**（原 54 + scenario (m) 改寫 + 新增 scenario (p)；(j) 仍然 910-case 窮舉、(o) 20 次並發，全過） |
| `node ops/perf/audit-20260906/playnext-opus/opus-fixproposal.js` | `tested=910 invariantFails=0 duplicateIdFails=0`（Opus 獨立原型，唔 touch repo，冇改） |
| `node ops/perf/audit-20260906/playnext-opus2/opus2-check.js`（Opus2 上輪 14/15） | **13 passed, 2 failed** —— 見下段解釋 |

### opus2-check.js 重跑結果解讀（重要）

呢支係 Opus2 自己寫嘅獨立覆核 script（`ops/perf/` 底下，唔屬於本次交付範圍，冇改佢）。上輪跑出 14/15，
唯一失敗嘅 `C2`（「插入之後撳一首散歌，仲應該起返電台尾巴」）就係**專門設計嚟捉 B1 呢個 regression**。

重跑之後：
- ✅ **`C2` 而家過**（`resumeRemainder.length === 0`）——證實 B1 修好，`playSingle()` 之後仲會起返電台尾巴。
- 🆕 **`B1`（窮舉不變式）同 `C1` 而家轉為 FAIL**——但呢兩條斷言本身就係**專門驗證舊 P3-6 機制**嘅：
  - `B1` 嘅 `abovLine` 不變式斷言「插入嘅歌一定唔可以喺自動播放線（`autoRadioFrom`）下面」——呢個係 P3-6
    個「推 `autoRadioFrom`」機制嘅直接產物，B1 revert 咗個機制之後，`autoRadioFrom` 唔再被推，呢條斷言
    結構上一定唔成立（我哋而家改用 `insertBoundary` 畫線，唔係推 `autoRadioFrom`）。
  - `C1` 直接斷言 `p.autoRadioFrom === p.insertAt + 1`——即係斷言 P3-6 個 override 有生效，B1 revert 之後
    呢個斷言本身就係斷言錯咗嘅嘢（`autoRadioFrom` 而家維持 1 唔變）。

  兩條都係「斷言緊已經被拍板 revert 嘅舊機制」，**唔係新 regression**，係 B1 revert 呢個刻意設計決定嘅
  預期後果。任務要求嘅「嗰條故意捉 B1 嘅而家應該過」已經確認（`C2` PASS）。冇改呢支 script（唔屬於交付範圍）。

---

## 3. iOS sim smoke（真機驗證，模擬器 `E0416618-B662-41D2-A253-5260FA0CF556` iPhone 17，Release bundle）

**做法**：`npx expo export:embed --platform ios --dev false --minify true --bytecode` 由乾淨 working tree
（`git status --porcelain` 對三個 source 檔非空——已改咗嘅 working tree，即係本次修復後嘅代碼）產生新 bundle
（md5 `455c1ceebb74129e1ec13fa128ad91be`，同 Opus2 驗收嗰份 `67714693e53d38b813e324fe69211a1f` 唔同，
證實新 bundle 真係帶住呢輪改動），換入 Opus2 已裝嘅 `Odely-patched.app/main.jsbundle`，清走
`Library/Application Support/.expo-internal`（EXUpdates 內部快取，唔清會鎖住舊 bundle），`codesign -f -s -` 重簽。

導航工具：`idb ui tap/describe-all` + `xcrun simctl io screenshot`（`Claude_Code_iOS_Simulator` MCP 喺呢個
non-interactive/dispatched session 唔可用，改用 idb 直接駛）。⚠️ 踩過嘅陷阱：`idb ui describe-all` 喺
React Native `Modal`（AddToPlaylistSheet/bottom sheet）開關之後，有幾次讀返嚟嘅係前一層畫面嘅 accessibility
tree（唔係即時視覺畫面），要靠 `xcrun simctl io screenshot` + pixel 掃描對位先可靠；純靠 AX frame 拍嘅座標
試過兩次撞唔中（一次撳中「最愛」心心唔係播放三角、一次撳穿咗底層 queue row）。

**Smoke (a)（B1，尾巴期間插入 + 之後撳散歌仍有尾巴）**：
1. 冷啟動 → 撳「同心圓」歌名 → `playSingle()` 起電台（`autoRadioFrom=1`），播放清單 (31)。
2. 撳 ⏭ 一次 → 進入尾巴（curIdx=1 ≥ autoRadioFrom=1），播「611見證｜黎杰豐弟兄」。
3. 開播放清單 → 見「自動播放：全部」線企喺「同心圓」（index0）之後、播緊嗰首（611見證）之前。
4. 對「Books of the Bible - Song」（喺尾巴入面，非播緊嗰首）撳 ≡+ →「下一首播放」→ toast「已加到下一首播放」。
5. **結果**：「Books of the Bible」搬到「611見證」（播緊嗰首）正下面，**新出現「即將播放」線畫喺呢首下面**；
   **「自動播放：全部」線位置完全不變**（仍然企喺「同心圓」之後，唔係俾推去插入位之後）。播放清單仍然 (31)。
6. 收返 sheet，撳詩歌庫另一首散歌「祢是唯一 (國)」→ **播放清單即刻顯示 (31)**（唔係 2！），打開清單見
   `playSingle()` 重新起咗一個完整新電台尾巴（「自動播放：全部」線企喺「祢是唯一」之後）。

**Smoke (b)（B2，shuffle 開→插兩首→關 → 數量不變）**：
1. 保持播緊（curIdx=1，autoRadioFrom=1）狀態，撳 shuffle 掣 → icon 變 cream 色+底部圓點、「已隨機排序」
   chip 出現，播放清單仍然 (31)，播放冇斷。
2. 對「一心一意來頌讚」撳 ≡+ →「下一首播放」→ toast → 隊列不變 (31)，佢搬到「聖靈來風」（播緊嗰首）之後。
3. 對「信 | 朱肇階」撳 ≡+ →「下一首播放」→ 隊列不變 (31)，佢搬到「聖靈來風」之後、「一心一意」之前
   （後插先播）。
4. 撳 shuffle 掣（icon 變返灰色、冇底部圓點、「已隨機排序」chip 消失）——**播放清單仍然顯示 (31)**。
5. 打開播放清單：restored（shuffle-off）次序 = `[打那美好的仗(現正播放), 因祂活著, 靠著祢寶血, 聖靈來風,
   信, 我要順服, 一心一意, ...]`——「信」同「我要順服」兩首插入嘅歌**都喺度**，仲原封不動企喺「聖靈來風」
   （插入嗰陣播緊嗰首）後面、次序同插入順序一致（後插先播：信喺「我要順服」前面）。冇任何一首消失。

截圖存喺 `<scratchpad>/playnext-opus2-fix/shots/`（42 張，session-local，未搬入 repo）。

---

## 4. Android 真機（環境備忘，唔開機）

任務指示唔使開 AVD，留俾下一輪 Opus。**Opus2 上輪搵錯路**（報告話 `~/Library/Android/sdk` 唔存在、
`which emulator` = not found）——實情係 emulator binary 喺呢部機嘅另一個路徑：

```
/Users/macbookpro/android-sdk/emulator/emulator
```
（已核實 `-rwxr-xr-x`、`Mach-O 64-bit executable arm64`，唔係空殼；`adb devices` 現時空、`hymntest` AVD
定義仍然喺 `~/.android/avd/hymntest.avd`，冇 AVD booted。）下一輪要驗 (b) shuffle/(a) 尾巴 喺 Android
嘅重演，可以直接用呢個路徑起 AVD，唔使再搵。

---

## 5. 已知限制 / 未做

1. P2-4（warmIds）維持上輪落地嘅狀態，冇再加碼——結構性限制（單一 HTTP round-trip 時間唔夠）已經喺 §1 講明,
   另開單處理。
2. `opus2-check.js`（Opus2 產物）嘅 `B1`/`C1` 兩條斷言而家斷言緊已 revert 嘅舊機制，冇改佢（唔屬於交付範圍），
   已喺 §2 詳細解釋點解呢個轉變係預期。
3. Android 冇重跑（跟任務指示，AVD 留俾 Opus）；下一輪可以直接用 `/Users/macbookpro/android-sdk/emulator/emulator`。
4. iOS sim 測試過程中意外幫兩首歌（「同心圓」、「祢是唯一」）撳咗最愛（heart 圖示座標判斷失手嘅副作用）——
   純測試帳號（opus-verify）數據污染，唔影響代碼邏輯驗證，冇特登還原（低風險，QA 帳號）。
5. 冇部署、冇 OTA、冇 commit 之外嘅改動；backend/hymns.db 冇碰。

---

## 6. 交付

Commit（pathspec，兩個）：
- code：`frontend/hymn-app/App.js` + `frontend/hymn-app/src/insertNextCore.js`
- harness + 報告：`frontend/hymn-app/tools/insertnext-harness/run.js` + `PLAYNEXT-FIX2-REPORT-20260906.md`

## 7. 收工

模擬器：`idb disconnect` → `pkill -x idb_companion` → `simctl terminate` → `simctl shutdown` →
`pkill -x Simulator` → 刪 `/tmp/claude-ios-cleanup.hold`。
核實：`booted:0 idb:0 sim:0 devtools:0 hold:0`。
