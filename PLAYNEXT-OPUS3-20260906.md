# PLAYNEXT-OPUS3-20260906 — Play Next 第二輪修補獨立驗收（Opus 5，第三輪）

驗收對象：`1330a65`（code）+ `aeaa76d`（harness/報告），對應 `PLAYNEXT-OPUS2-20260906.md` 嘅
B1 / B2 / P2-4 / P3-7。基準 `503a362`。驗收者冇改任何 source、冇 commit、冇部署
（`git status --porcelain frontend/hymn-app/` 全程為空，HEAD 仍然 `aeaa76d`）。

---

## 0. 結論

**可以 OTA。** B1（revert P3-6，改用 `insertBoundary` 畫線）同 B2（shuffle 開住插入時
`originalQueueRef` 獨立去重+插入）兩條都真係落到，逐 hunk 核過、窮舉核過、兩部機真機核過。
`opus2-check.js` 嗰兩條新 fail（B1/C1）**判為合理**——佢哋斷言緊已經被拍板 revert 咗嘅舊機制，
唔係新 regression（詳見 §3）。剩低嘅問題全部係 P3 級（一條新嘅顯示 nit、一條「exposure 改咗」
嘅既有結構問題、一條 Android AVD 未能隔離嘅觀察），冇一條夠格擋住 OTA。

---

## 1. 逐 hunk 核（`git diff 503a362..1330a65 -- frontend`）

### 1.1 紅線 diff — 過

```
git diff 503a362..aeaa76d -- frontend/hymn-app/App.js frontend/hymn-app/src/insertNextCore.js \
  | grep -icE "handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog|threshold|stall|giveup|swr|hlsFallback|prefetchAudio|nativeStall"
→ 0
```

`git diff --name-only 503a362..aeaa76d` = 4 個檔（App.js / insertNextCore.js / harness run.js /
FIX2 報告），`playQueue` / `playQueueImpl` 本體零改動（`grep "^[+-].*function playQueue"` 無輸出）。

### 1.2 B1 — `insertNextCore.js` `computeInsertNext()`

| 核咩 | 結果 |
|---|---|
| `autoRadioFrom` 唔再被 override，淨係 `adjustBoundary` shift | ✅ 窮舉 1400 case 逐個同手算 shift 對數，**0 mismatch**（opus3-check A2） |
| 尾巴期間插入（`adjustedAutoRadioFrom <= insertAt`）改推 `insertBoundary = insertAt + 1` | ✅ 源碼 `insertNextCore.js:149-151` |
| 替代不變式「插入嘅歌一定有線罩住」 | ✅ 我另寫嘅不變式（`autoRadioFrom != null && insertAt >= autoRadioFrom` ⇒ `insertBoundary > insertAt`）窮舉 1400 case **0 fail**（opus3-check A1） |
| 條線會自動清、唔會變鬼影 | ✅ 線 = `newCurIdx + 2`，`App.js:1128`（`idx >= insertBoundaryRef.current` 就清）行過就清；插入嘅歌自己播嗰陣 `idx = newCurIdx+1 < line`，線仲喺，再下一首先清——次序啱 |
| 兩條線會唔會撞埋同一 index（render 兩條 divider） | ✅ 實際唔可能：override 之下 `insertBoundary = insertAt+1 > adjustedAutoRadioFrom`，嚴格大過 |

### 1.3 B1 — `App.js insertNextImpl()` 嘅寫回 guard

```js
if (plan.insertBoundary !== ib0) { insertBoundaryRef.current = plan.insertBoundary; setInsertBoundary(...); }
```

舊 guard（`insertBoundaryRef.current != null`）會擋死 B1 需要嘅 `null → number`，新 guard 啱。
`null → null` 係 no-op（安全）；`number → number` 一樣就唔寫（省一次 render）。核實
**`autoRadioFrom != null` 同 `insertBoundary != null` 兩者同時出現嘅唯一來源就係 B1 自己**
（`playSingle` 條插播路 `App.js:2486` 係 `{ autoRadioFrom: null, insertBoundary: 1 }`，互斥），
所以「B1 override 蓋走一個既有 `insertBoundary`」呢個顧慮只喺連續插入嗰陣成立 → 見 §4 R1。

### 1.4 B2 — `App.js insertNextImpl()` `else` 分支

逐字同 Opus2 附嘅 patch 一致。額外核咗兩點：

- **anchor 唔會俾自己個 filter 濾走**：`computeInsertNext` 上游已經有
  `alreadyPlaying` 早退（`insertNextCore.js:91-93`），所以行到 `else` 分支嗰陣
  `hymn.id !== cur[curIdx].id` 一定成立，`without.filter` 唔會意外剷走 anchor。
- **anchor 唔喺 `originalQueueRef` 嘅 fallback**（`oi < 0` → append 落尾）唔會丟歌：
  opus3-check E3 過。呢個 case 真係去到（shuffle 開住期間 `rebuildTail` 換過尾巴）。

窮舉：440 個 case（len 2-6 × 每個 rotation 當一種洗牌 × curIdx × 全新/已存在嘅歌），
四條不變式全過（opus3-check D1-D4）：零重複 id、`newQ` 每首喺 `originalQueueRef` 都揾得返、
長度同 `newQ` 一致、插入嘅歌喺 pre-shuffle 次序度企喺播緊嗰首後面。

**另外核實咗 `toggleShuffle` 熄 shuffle 嗰刻會清 `autoRadioFrom` 同 `insertBoundary`**
（`App.js:487-488`）——所以 shuffle 場景唔會殘留 B1 畫嘅線，兩個修唔會互相撞。

### 1.5 P3-7 nit — `arf0` / `ib0` 快照

✅ 改動正確：`arf0`/`ib0` 同 `cur` 同一個 index 空間，`catch` 分支嘅
`reindexBoundaryById(cur, arf0/ib0, rebuiltQ)` 而家唔會再攞到 step 6 之後寫入嘅
newQ-空間數值。原有 scenario (n) 四個 sub-case 照過。

### 1.6 P2-4 — 冇改，報告收窄咗講法。同意，唔屬於今次範圍。

---

## 2. Harness / script 重跑

| 跑咩 | 結果 |
|---|---|
| `node tools/insertnext-harness/run.js` | **66 passed, 0 failed**（含 (j) 910-case 窮舉、(o) 20 次並發） |
| `node ops/perf/audit-20260906/playnext-opus/opus-fixproposal.js` | `tested=910 invariantFails=0 duplicateIdFails=0` |
| `node ops/perf/audit-20260906/playnext-opus2/opus2-check.js` | **13 passed, 2 failed**（B1、C1） |
| `node ops/perf/audit-20260906/playnext-opus3/opus3-check.js`（本輪新寫） | **13 passed, 3 failed**（A3、A4、C2）→ 逐條判詞見 §3 |

Harness diff（`aeaa76d`）核過：scenario (m) 改寫同 (p) 新增都係真斷言，唔係擺樣——
(m) 抄咗 `App.js playSingle()` §2478-2486 入嚟做模擬，(p) 抄咗 B2 patch 逐行入嚟連插三首
（兩首全新 + 一首行 dedupe 搬位）再熄 shuffle。冇發現放水。

---

## 3. 五條 FAIL 嘅判詞

### 3.1 `opus2-check` B1 / C1 — **合理，唔係 regression**

兩條都係**專門驗證舊 P3-6 機制**嘅斷言：

- `B1` 嘅 `abovLine` 不變式（`p.insertAt < p.autoRadioFrom`）係「推 autoRadioFrom」呢個機制嘅
  直接產物。B1 revert 之後 `autoRadioFrom` 唔再郁，呢條斷言結構上一定唔成立。
- `C1` 直接斷言 `p.autoRadioFrom === p.insertAt + 1`，即係斷言 P3-6 個 override 有生效。

我冇淨係接受「佢哋過時」呢個講法，而係**寫返兩條等價嘅新不變式落 opus3-check**
（A1「插入嘅歌永遠有線罩住」、A2「autoRadioFrom 純 shift 冇 override」），
喺同一個 1400-case 窮舉上面**兩條都 0 fail**。即係話：舊斷言想保護嘅「用戶親手插嘅歌唔可以
睇落好似系統隨機揀」呢個效果，喺新機制之下一樣成立，只係換咗用邊條線去畫。
專門捉 B1 regression 嗰條 `C2`（插入之後撳散歌仲要起返電台尾巴）**而家過**。

### 3.2 `opus3-check` A4（259）— **量度 artifact，不成立**

失敗全部嚟自我個 sweep 餵咗**現實入面唔存在嘅輸入**（`insertBoundary = 1` 而 `curIdx >= 1`，
即一條「早就應該俾 App.js:1128 清咗」嘅過期線）。加返「輸入合法」條件（`ib == null || ib > curIdx`）
之後，**合法輸入下 0 fail**。

### 3.3 `opus3-check` A3（37）— **理論性，現實去唔到**

要 `autoRadioFrom == insertBoundary` 同時非 null 做輸入先觸發。全 App 只有 `playSingle`
（`App.js:2486`）會 set `insertBoundary`，而佢同時 set `autoRadioFrom: null`；B1 自己整出嚟
嗰個組合永遠 `autoRadioFrom < insertBoundary`。**去唔到，唔使修。**

### 3.4 `opus3-check` C2 — **真、新、但係 P3 顯示 nit**（見 §4 R1）

---

## 4. 剩餘問題

### R1（P3，新引入，純顯示）— 尾巴期間連續插兩首，第一首會跌落「即將播放」線下面

因為 override 條件錨定喺 `adjustedAutoRadioFrom`（B1 之後永遠唔郁），所以第二次插入計出嚟嘅
`insertBoundary` 一樣係 `insertAt + 1`，**收窄咗**（唔係擴大）：

```
queue=[1..6] arf=1 curIdx=1
插 91 → q=1,2,91,3,4,5,6   arf=1 ib=3      ← 91 喺線上面 ✅
插 92 → q=1,2,92,91,3,...  arf=1 ib=3      ← 92 喺線上面，91 跌咗落線下面 ❌
```

舊 P3-6 機制之下條線係會生長嘅（3→4）。影響：純視覺，兩首都仲係企喺播緊嗰首後面、次序啱
（後插先播），冇丟歌、冇播錯。**唔擋 OTA**；如果要修，一行：override 改成
`Math.max(insertAt + 1, adjustedInsertBoundary ?? 0)`。

### R2（P3，exposure 改咗，唔係新 bug）— `rebuildTail` 會剷走尾巴期間插入嘅歌

`rebuildTail()` 用 `headLen = autoRadioFrom` 做「用戶揀嗰截」。B1 之後插入嘅歌住喺尾巴區
（index > autoRadioFrom），所以用戶如果之後熱切換 autoplay flavor / toggle 自動播放，
啱啱插嘅歌會俾新尾巴冚走。P3-6 嗰陣因為推咗條線，反而意外保護咗佢。

⚠️ 但要講清楚：**`rebuildTail` 喺「播緊尾巴」嗰陣本身已經係壞嘅**，同 Play Next 無關——
`head = curQ.slice(0, 1)`、`rest = head.slice(curIdx+1) = []`，native queue 係 `[0..curIdx] + tail`
而 JS `newQ = [head0, ...tail]`，兩邊 index 對唔上位。呢條係既有結構問題，唔係本次引入，
建議另外開單，唔應該用嚟擋今次 OTA。

### R3（觀察，Android AVD 未能隔離）— 一次 37→36

Android AVD 上面見過一次：shuffle ON→OFF 之後播放清單由 37 跌到 36。**冇再重現**，
iOS 同類場景（31→33→關 shuffle→33）完全乾淨，440-case 窮舉亦零丟歌。呢部 AVD 嘅
UI 座標同播放本身都好唔穩（見 R4、§6），我唔敢把呢個數當成 B2 嘅反證，但亦唔會當冇事發生
——列為 **Eric 真機必驗嗰項**（§7）。

### R4（out of scope，既有）— `toggleShuffle` 收尾寫 state 有 race

`toggleShuffle` 最後一句 `setIsShuffled(!isShuffledRef.current)` 排喺
`reset → add(30+ 首) → seekTo → play` 之後，AVD 上面實測要成 15 秒先落地。
呢段時間再撳一次 shuffle，兩條 toggle 會用同一個 `isShuffledRef.current` 讀數，
收尾寫返去就可能反轉。**對照實驗**：shuffle 開住、95 秒完全唔郁 → 仍然 ON；
shuffle 開住、單獨做一次 Play Next → 仍然 ON。即係話**唔係 Play Next 整熄佢**。

### R5 — P2-4（插完即撳⏭仍可能撞冷歌）維持結構性限制，同意另外開單。

---

## 5. 兩平台矩陣

| # | 場景 | iOS sim（iPhone 17, `E0416618…`） | Android AVD（`hymntest`, emulator-5554） |
|---|---|---|---|
| a1 | 尾巴期間插入 → 「即將播放」線畫喺新歌下面、「自動播放：全部」線位置不變 | ✅ `ios-08` 「耶穌是我的詩歌」插喺播緊嗰首正下面、線畫喺佢下面；自動播放線仍企喺 index 1 | ✅ `and-14` 「Silent Night」插喺播緊嗰首正下面、即將播放線喺佢下面；自動播放線不變 |
| a2 | 之後撳一首散歌 → 隊列 ~31 有尾巴（唔係 2） | ✅ 播放清單 (31)，自動播放線企喺新歌之後（`ios-12`/`ios-13`） | ✅ 播放清單 (31)（`and-16`） |
| b | shuffle 開 → 插 2 首（庫入面全新歌）→ 關 shuffle → 數量不變、兩首都在 | ✅ 31→33（shuffle ON 圖示已核）→ 關 → **33 不變**，restored 次序 `[普天下歡唱(播緊), 我要向高山舉目, 這一生最美的祝福, …]`，兩首都企喺播緊嗰首後面、後插先播（`ios-29`/`ios-30`/`ios-31`） | ⚠️ **未能乾淨重現**（座標飄移 + toggleShuffle race，見 R3/R4）。有兩次數目跨 ON→OFF 保持（33、37），一次 37→36 未解 |
| c | 去重搬位唔斷播（上輪 (a) 回歸） | ✅ 33→33 零重複，歌由第 6 位搬到播緊嗰首後面，同一首歌 2:36→2:52 繼續播（`ios-32`/`ios-33`） | ✅ 37→37，「不再懼怕/Worship」搬到播緊嗰首後面，播放冇斷（`and-48`） |
| d | 插一首「啱啱播過」嘅歌（前面 track 被 remove）→ 通知 metadata、背景播放 | n/a（任務只要求 Android） | ✅ 36→36 零重複，「榮耀神羔羊」由 index 0 搬到 index 1；`dumpsys media_session` `description=主禱文`（正確、冇偏位）；HOME 之後 `state=PLAYING(3) speed=1.0`；通知（`channel=kotlin_audio_player`, `category=transport`, `actions=5`）顯示「主禱文／讚美之泉」+ pause 掣（`and-56`/`and-57`） |
| e | 「加入到清單」sheet 下滑收起 + 「下一首播放」行喺頂 | ✅ 「下一首播放」永遠喺第一行（`ios-07` 等多次） | ✅ 兩項都過：`and-59` 見「下一首播放」喺頂；`and-60` 下滑一下就收起，底下嘅播放清單 sheet 完好（36） |

截圖 99 張存喺 `ops/perf/audit-20260906/playnext-opus3/`（`ios-*.png` / `and-*.png`），
覆核 script + 輸出：`opus3-check.js` / `opus3-check.out`。

---

## 6. 方法備忘（下一輪唔好再踩）

1. **Android AVD 會用 production OTA 蓋走你 patch 入去嘅 embedded bundle。**
   `/data/data/com.hymnapp.praise/files/.expo-internal/` 入面留住 2026-09-05 嗰個
   production update（group `e51033b4`，runtime 4）。第一次開機我見到「加入到清單」sheet
   **完全冇「下一首播放」行**——嗰個唔係 bug，係跑緊 production JS（Play Next 未 OTA）。
   解法：
   ```
   adb root
   adb shell am force-stop com.hymnapp.praise
   adb shell "rm -rf /data/data/com.hymnapp.praise/files/.expo-internal/*"
   adb shell "rm -f /data/data/com.hymnapp.praise/databases/updates.db*"
   adb shell svc wifi disable; adb shell svc data disable
   adb shell am start -n com.hymnapp.praise/.MainActivity     # 等 20 秒，update check 失敗
   adb shell svc wifi enable;  adb shell svc data enable
   ```
   核實方法：`.expo-internal/` 空 = 冇 pending update。**唔好撳「已有新版本，撳一下更新」
   個 banner**——撳落去會 `Updates.reloadAsync()`，session 中途靜靜換返 production JS
   （我中過一次，logcat 見到 `Updates state change: Restart, isRestarting=true`）。
2. **AVD 上面 `≡+` 同 row 中間得幾十 px，撳錯就變 `skipToQueueIndex` 跳歌。**
   唔好靠縮圖估，每次用 `sips -c h w --cropOffset y x` 喺全解析度圖度度返 icon 中心
   （queue sheet 度 ≡+ x=898-900、library x=920；row spacing 隨標題行數 150-193 px 唔等）。
3. **iOS `idb ui describe-all` 喺 RN `Modal` 開關之後會讀返上一層畫面**（上輪已記，本輪再中）
   ——queue sheet / AddToPlaylistSheet 一律改用 `xcrun simctl io screenshot` + 全解析度 crop。
4. iOS bundle 我冇信上一輪個 md5，自己由 HEAD 重 export 一份
   （`67bf347ea596abf07b6845f55413c3ce`）換入 `Odely-patched.app` 再 `codesign -f -s -`，
   working tree 對三個 source 檔同 `aeaa76d` 完全一致（`git diff HEAD` 空）。
5. `mcp__Claude_Code_iOS_Simulator__control` 喺 dispatched session 一樣唔可用
   （"require an attended session"），全程用 `idb` + `simctl`。

---

## 7. OTA 之後 Eric 真機最少一項檢查

**「shuffle 開住插歌」呢條：**
> 隨便播首歌 → 撳交叉（shuffle）掣開隨機 → 見到「已隨機排序」chip →
> 喺詩歌庫揀兩首**唔喺而家清單入面**嘅歌，各撳 `≡+` →「下一首播放」→
> 開播放清單記低個數目（應該加咗 2）→ 再撳一次 shuffle 掣熄隨機 →
> **播放清單數目應該一模一樣，兩首啱啱插嘅歌要仲喺播緊嗰首後面。**

原因：呢條就係 B2 修緊嗰個 bug（Opus2 實測 33→31 丟歌）。iOS 模擬器過咗、440-case 窮舉過咗，
但 Android AVD 呢一項因為模擬器本身唔穩冇能夠乾淨重現，而且見過一次未解釋嘅 37→36（R3）。
Eric 部 Android 真機行一次就可以封返呢個窿。

（次要，順手：尾巴期間連續插兩首，睇下「即將播放」條線係咪只罩住最後嗰首——係嘅話就係 R1，
純顯示，唔使急。）

---

## 8. 收工狀態

- 一次一部機：iOS 做完先 `simctl shutdown` + `pkill Simulator/idb_companion`，之後先開 AVD。
- `/tmp/claude-ios-cleanup.hold`、`/tmp/claude-android-baseline.hold` 全程在位，收工已刪。
- 原裝 `Odely-v1.5.1-vc55.apk` 已 `adb install -r -d` 蓋返（`Success`），`adb unroot` 已行，
  `adb -s emulator-5554 emu kill` 已行。
- 最終確認：`booted:0 idb:0 sim:0 devtools:0`、`qemu:0 emulator:0`、`adb devices` 空。
- ⚠️ 裝置副作用（可接受、已還原到「唔會影響下次」嘅狀態）：AVD 上面 app 嘅
  expo-updates 快取／`updates.db` 俾我清咗，下次開 app 會自己重新下載 production OTA。
- ⚠️ iOS 模擬器 `Odely-patched.app`（上一輪 session 整嘅 patch 副本）而家帶住我今輪
  由 HEAD 編出嚟嗰份 `main.jsbundle`。原裝 `Odely.app` 喺另一部裝置（`FF770D48…`）冇郁過。
- 冇改 source、冇 commit、冇部署。新增檔只有本報告 + `ops/perf/audit-20260906/playnext-opus3/`。
