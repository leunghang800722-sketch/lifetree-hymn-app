# PERF-STAGE2-2B-OPUS-20260902 — Opus 5 獨立驗收（2B frontend）

驗收者：Opus 5。對象：`PERF-STAGE2-2B-20260902.md`（Sonnet 5 出），raw `ops/perf/stage2-20260902/2b-*`，
commits `d51c3bc fcfb62e b9e0f64 d547279 4321f46 297bf52 8a2e729`，執行單 `PERF-STAGE2-EXEC-20260902.md` §2B/§4。

**本次驗收冇改任何 source、冇 commit、冇部署、冇 restart backend、冇掂 Cloudflare/hymns.db、冇開模擬器。**
動作只有：`git show`/`git diff`/`git log`、讀 repo 檔同 `node_modules/expo`（含 iOS Swift / Android Kotlin 原始碼）、
`grep`/`awk` 統計 raw log。臨時檔：無（全部直出 stdout）。

判定準則同 baseline 驗收一致：①數字有冇出處 ②方法有冇混淆變數 ③「零 X」有冇正控 ④結論有冇超出數據。

---

## 0. 總結（四句）

1. **數字轉錄全中。** §1.1、§1.2、§2.1、§4.2 我逐格對 raw，**一個錯都冇**（§8 有逐表核對記錄）。
2. **我（Opus 5）喺 baseline §4c 判錯咗，Fable 5.1 附註成立。** 我親自讀 `node_modules/expo` 原始碼確認：
   Expo SDK 56 native `global.fetch` **確實**係 streaming，`start()` 喺 `.responseReceived` 就 resolve。
   錯處同教訓見 §1。
3. **F-1 有一個報告同 commit 都冇發現嘅實質缺陷**：喺 expo/fetch（iOS 同 Android 都係）之下，
   **body 段嗰個 30s timeout 唔會令 `r.text()` 拋錯，而係令佢永遠唔 settle**。
   即係 F-1 宣稱嘅「第一次幫 body 加返逾時保護」**喺呢個 runtime 落唔到地**。詳見 §2。
4. **F-4 係 2B 唯一有真實、可重複、量級大嘅收益（480ms），值得出街**，但佢有一個報告冇提嘅副作用
   （歌詞索引預熱由開機推遲到首次撳詩歌庫），有平價折衷解。詳見 §4。

---

## 1. §4c 反轉 —— 我錯咗，錯喺「用假設嘅代碼語義蓋過手上嘅實測欄位」

### 1.1 判詞：我 §4c 三個結論之中，第 1 條（「第一次嘗試 5/5 撞 8s timeout」）**FAIL，正式撤回**

我獨立重做咗證據鏈，唔靠 Fable 附註：

**(a) 代碼層 —— Expo SDK 56 確實換走 `global.fetch`。**
`node_modules/expo/src/winter/runtime.native.ts:43-52`：

```
const useRnFetch = process.env.EXPO_PUBLIC_USE_RN_FETCH === '1' || ... === 'true';
if (!useRnFetch) { ... install('fetch', () => require('./fetch').fetch); }
```

我 grep 過成個 repo（除 node_modules）同 `frontend/hymn-app/` 目錄：**冇 `.env`、冇任何地方 set
`EXPO_PUBLIC_USE_RN_FETCH`** ⇒ 條件成立，`global.fetch` = `expo/src/winter/fetch/fetch.ts` 嘅 native fetch，
唔係 RN 嘅 whatwg-fetch（XHR 版，嗰個先係「body 讀完先 resolve」）。

**(b) 語義層 —— `fetch()` 喺 headers 到就 resolve，實錘喺 Swift。**
`node_modules/expo/ios/Fetch/ExpoFetchModule.swift:95-108`：

```
AsyncFunction("start") { ... 
  request.response.waitFor(states: [.responseReceived, .errorReceived]) { state in
    if state == .responseReceived { promise.resolve() } ...
```

`.responseReceived` 喺 `NativeResponse.swift` 嘅 `urlSession(_:didReceive response:)` 設定 —— **即係收到
HTTP header 嗰刻**，body 一個 byte 都未讀。Android（`ExpoFetchModule.kt:136-144`）同一寫法。
∴ 舊碼 `fetchWithTimeout` 個 `finally { clearTimeout(t) }` 喺 **headers 到嗰刻**就執行，
`r.json()` 係喺 timer 清咗之後先讀 body ⇒ **嗰個 8s AbortController 由頭到尾只保護緊 ttfb，從來冇 cover 過 body。**

**(c) 數據層 —— 我手上一早有一個決定性欄位，我冇用。**
`ops/perf/baseline-20260902/1b-s1-run3.log` / `run4.log` 兩行 `perfMarks` beacon：
`hymnsMs=10269` / `11626`，同一行 `fetch=7(...,api/hymns:1,...)`。
`perfMarks.js:82-96` 個 `perfPatchedFetch` 係**逐次 `fetch()` 呼叫**加一，唔係逐個 request 週期。
一旦 abort+retry，`fetchAllHymns()` 會行第二次 ⇒ 必定變 `api/hymns:2`。
**兩個 run 都係 `:1`** ⇒ 冇 retry ⇒ 冇 abort ⇒ 10.3/11.6s 係**真．單次 fetch**。

**(d) 2B 自己嘅拆時獨立印證。** `2b-d1-beacons-s1.log`：`ttfb=553 body=3170 pars=25`，
三者加埋 = 3748 = `hymnsMs`。ttfb 500ms 級、body 秒級，直接展示咗「headers 到 ≠ body 到」。

### 1.2 我錯喺邊（呢段係要入方法論嘅）

- **根本錯誤**：我由「`fetchWithTimeout` 包住 `await fetch()` + `finally clearTimeout`」推出「8s cover 成個 request」，
  呢個推論**只喺非 streaming fetch 成立**。我冇去核實呢個 runtime 邊個 fetch 當值，就當咗結論用。
- **更嚴重嘅一層**：我喺 **同一行 log** 逐欄轉錄核對過 `fetch=7(...api/hymns:1...)` 並判「全中」，
  **但我冇用呢個欄去反證自己嘅算術推論**。呢個唔係「冇數據」，係「有反證擺喺面前冇攞嚟用」。
- **第三層**：我仲為自己個假說補咗一個自洽解釋（「理論最差 16s > 有效預算 13.7s，所以 run1/2/5 一定截頓」）。
  嗰個解釋同「單次 body 下載超過 13.7s」對同一批 `-` 有**一模一樣**嘅預測力 —— 我揀咗複雜嗰個，
  而且冇去搵可以分辨兩者嘅判別式（判別式就係 `fetch=` 個計數）。
  **同 baseline §0 第 3 點我自己寫「1B 為一個唔存在嘅現象寫咗個合理解釋」係同一種失效模式，我自己踩返一次。**
- **教訓（建議入 MEMORY）**：*一個結論如果係由「假設嘅 library 語義」推出嚟，出結論之前一定要
  (i) 去 `node_modules` 讀返真身，同 (ii) 喺自己已經轉錄過嘅欄位入面搵一個可以推翻自己嘅判別式。*

### 1.3 §4c 有效嘅部分（唔撤回）

- 1B 原文「15s 窗口太短」係**正確**嘅近因，我當時判佢「冇錯」呢句企得穩；但我加嘅「根因係 8s timeout」要刪。
- 「beacon 窗口 15s→25s」、「逐 attempt 分開記 mark」、「唔好淨係加大 timeout」三條建議**仍然有效而且已執行**。
- 執行單 §1 B1 嘅更正方向要再改一次：10.3–11.6s **唔係**「8s 白燒 + 真 fetch」（我嗰版錯），
  而係**真單次 fetch，樽頸 = 3.66MB wire bytes**。∴ **A-2 origin gzip / A-6 lite 嘅預期效益反而係我低估咗**
  （我當時寫「compression 慳嘅係嗰 2.3–3.6s 嗰半」—— 呢句錯，慳嘅係成條 body 3.2–9.5s）。

---

## 2. F-1（`4321f46`）—— 判：**條件 PASS（實作無害、無 leak、語義相等），但宣稱嘅保護喺呢個 runtime 落唔到地**

### 2.1 Timer / controller 狀態（逐路徑窮舉）—— **PASS，冇 leak**

`useCachedHymns.js:34-63`（`fetchHymnsTwoStage`）五條退出路徑我逐條行過：

| 路徑 | `t` 當時係邊個 timer | 有冇被清 | 判 |
|---|---|---|---|
| `fetch()` reject（headers 8s abort / 網絡錯） | 8s | `catch` 內 `clearTimeout(t)`（已 fire，no-op） | 無 leak |
| `!r.ok` 提早 return | 8s | resolve 後即刻 `clearTimeout(t)`，30s timer 未 set | 無 leak |
| `r.text()` reject | 30s | 內層 `finally` 清，外層 `catch` 再清一次（no-op） | 無 leak |
| `JSON.parse` throw | 30s | 內層 `finally` 已清 | 無 leak |
| 正常 return | 30s | 內層 `finally` 已清 | 無 leak |

**controller 狀態冇跨 attempt 污染**：每次 `fetchHymnsTwoStage` 自己 `new AbortController()`，
attempt 2 唔會繼承 attempt 1 嘅 aborted signal。**正確。**

### 2.2 真斷網路徑 —— **PASS，行為不變**

headers 唔到 = `fetch()` 未 resolve ⇒ 8s abort ⇒ attempt 1 失敗 ⇒ retry ⇒ 再 8s ⇒ **總共 16s**，
同改前一模一樣。執行單原文「8s→30s」會令佢變 60s，course-correction 確實避開咗。**呢點成立。**

### 2.3 Retry 邏輯 —— **PASS，不變**

`fetchAllHymnsWithRetry` 仍然係「第一次 `hymns.length > 0` 就 return，否則再試一次」。
新增嘅淨係兩個 `note()` 同一個 `mark('hymns2Start')`。`note()` 係 write-once，
但 `hymnsAttempts` 兩條分支互斥（`=1` 嗰條即刻 return），**唔會出現 1 蓋住 2**。正確。
`hTtfb1/hBody1/hPars1` vs `hTtfb2/...` 分名，避開咗 `mark()` write-once —— 呢個係啱嘅設計。

### 2.4 `r.text()` + `JSON.parse` vs `r.json()` —— **PASS，byte 級相等（有硬證據）**

`node_modules/expo/src/winter/fetch/FetchResponse.ts`：

```
async json(): Promise<any> { this.checkBodyUsedError('json'); const text = await this.text(); return JSON.parse(text); }
```

**`json()` 本身就係 `JSON.parse(await this.text())`** —— 即係改動同原本**字面上同一條路徑**，
BOM/編碼問題唔存在（兩邊都行同一個 `super.text()` → Swift `String(decoding: data, as: UTF8.self)`）。
呢條擔心可以完全放低。

### 2.5 逐 attempt marks 對唔對 —— **PASS**

`a1t = durMark('hymnsStart','hTtfb1')`（`hymnsStart` 喺 `useCachedHymns.js:249`，包住成個 retry wrapper）、
`a1b = hTtfb1→hBody1`、`a1p = hBody1→hPars1`；attempt 2 用 `hymns2Start` 做起點（唔會被 attempt 1 嘅時間污染）。
raw 核對：`a1t+a1b+a1p = 511+6026+23 = 6560 = hymnsMs` ✅（run1）；`516+3851+22=4389` ✅；`518+4019+25=4562` ✅；
`526+3764+24=4314` ✅；`532+4879+23=5434` ✅。**5/5 內部一致。**

### 2.6 **保留①（重要，新發現）：30s body timeout 喺 expo/fetch 唔會拋錯，會令 promise 永遠掛住**

`ExpoFetchModule.swift:80-86`（iOS）：

```
AsyncFunction("text") { (response: NativeResponse, promise: Promise) in
  response.waitFor(states: [.bodyCompleted]) { _ in ... promise.resolve(text) }
}
```

**只等 `.bodyCompleted`，冇 `.errorReceived`。** 而 `controller.abort()` → `request.cancel()` →
`NativeRequest.swift:34-37` → `response.emitRequestCanceled()` → `NativeResponse.swift:63-68`
**`state = .errorReceived`**。`waitFor` 個 once-listener 只喺 state 命中先移除，
∴ **listener 永遠唔會 fire，`await r.text()` 永遠唔 settle**。
Android 一樣（`ExpoFetchModule.kt:115-116`：`waitForStates(listOf(ResponseState.BODY_COMPLETED))`）。

實際後果（headers 到咗、body 停咗 >30s 呢個場景）：
- 30s 一到，底層 URLSession task **確實被 cancel**（呢個係真收益：慳返上行/socket，唔會有殭屍下載）；
- 但 JS 側 `fetchHymnsTwoStage` **唔會 return**、`catch` 唔會行、`{hymns: []}` 唔會回、
  **retry 唔會觸發、`hymnsEnd` 唔會 mark、UI 唔會由 loading 轉去「網絡好似斷咗」** —— 永遠轉圈。

**呢個係咪 regression？唔係。** 舊碼冇 abort，body 死咗要等 URLSession 自己
（`ExpoURLSessionTask.swift:27` `request.timeoutInterval = 0` ⇒ 用 config 預設 60s 閒置逾時）先報錯，
而嗰個錯**一樣**係 `.errorReceived`，`text()` **一樣**掛死。∴ 舊碼喺同一場景都係永久掛住。
F-1 冇整衰，但**佢冇做到 commit message 同 §2 宣稱嘅「第一次幫 body 下載加返一個 30s 嘅逾時保護」**——
呢句要收窄成「30s 之後會 cancel 底層下載（省資源），但 JS 側仍然唔會 recover」。

**修法（純 JS，細）**：body 段唔好單靠 `controller.abort()`，要 race 一個會 reject 嘅 timer：

```
const bodyTimeout = new Promise((_, rej) => { t = setTimeout(() => { controller.abort(); rej(new Error('body-timeout')); }, 30000); });
text = await Promise.race([r.text(), bodyTimeout]);
```

咁樣 `catch` 先行得到、retry 先 fire 得到。**建議 Stage 2C/3 補，唔係 2B 出街嘅 blocker**（因為冇整衰現狀）。

### 2.7 保留②：**shipped source 入面嘅註解仍然講緊已被推翻嘅嘢**

`useCachedHymns.js:22-25` 同 commit `4321f46` message 都寫住
「1B baseline 5/5 run 第一次嘗試全部撞 8s」、「實際逾時拉到 16s」——
呢個就係我 §4c 嗰個已撤回嘅判詞。commit message 改唔到，**但源碼註解一定要改**，
否則下一手讀碼嘅人（人或 agent）會由呢段註解重新推出同一個錯結論。
**列為 OTA 前必修（P1）。**

### 2.8 §2.1 A/B 嘅結論 —— **執行者處理正確**

report §2.1 明文寫「median 5734→4562 較大機會係網絡波動而唔係代碼效果」、
「冇能夠重現 timeout 誤殺場景」、L3 明文交代「冇實測後果，只係代碼審查層面嘅發現」。
**呢個係啱嘅態度**（同 baseline 1A「量度缺席聲明」同級）。
執行單 §4 訂嘅指標「第一次嘗試成功率（改前 0/5）」而家已知**改前真值係 5/5**，
∴ 呢個指標由頭到尾量度唔到嘢 —— 唔係執行者嘅錯，係我上游訂錯，喺此更正。

---

## 3. F-3（`b9e0f64`）—— 判：**PASS（代碼審查安全）；「未量化」可以接受，唔要求補量**

### 3.1 行為等價 —— PASS

- 舊：`<SongCard hymn={h} onPress={() => play(h, todayPicks)} />`
  新：`<SongCard hymn={h} list={todayPicks} onSelect={play} />`，卡內 `onPress={() => onSelect(hymn, list)}`。
  `play` 簽名 `(hymn, list, explicit, surface)`（`HomeScreen.js:226-228`），
  舊 call `play(h, todayPicks)` = 新 call `onSelect(hymn, list)`，`explicit`/`surface` 兩邊都係 `undefined`。**完全等價。**
- `git diff fcfb62e 8a2e729 -- HomeScreen.js` 除咗 span/`now()` 之外**只有呢 5 行**，冇掂 `dailyPick`/`dailyPickBalanced`/`hasAlbum`。

### 3.2 Stale closure —— **冇風險**

`hymn`、`list`、`onSelect` **全部經 props 入**，`React.memo` 淺比較會喺任何一個 identity 變嗰陣重新 render，
∴ closure 永遠揸住當前值。舊版嗰個 inline arrow 反而係「每次 render 重造」——新版嘅捕獲面**細咗**唔係大咗。

### 3.3 memo 會唔會白做（即 `onSelect` 穩唔穩）—— 針對目標場景係穩嘅

`play` = `useCallback(..., [onPlayHymn])`。`onPlayHymn` 由 AppContent 傳落。
F-3 針對嘅係「HomeScreen **自己**嘅 state 變（切 chip / 拖 pager）」—— 嗰啲情況 `onPlayHymn` 唔會變 ⇒ `play` 穩定 ⇒
`todayPicks`/`recent`（`useMemo([hymns])`）穩定 ⇒ `hymn` object 穩定 ⇒ **18 張卡全部 memo hit**。設計成立。
（AppContent 自己 re-render 令 `onPlayHymn` 變嗰陣 memo 會 miss，但嗰個唔係 F-3 宣稱要治嘅場景。）

### 3.4 `React.memo` 包住之後 `SongCard` 由 function declaration 變 `const` —— 冇 TDZ 問題

宣告喺 module top-level（`HomeScreen.js:113`），使用喺 component function body（`:404`/`:416`），
執行次序上一定係先 module eval 後 render。`React` default import 喺 `:22` 已有。**安全。**

### 3.5 「量唔到獨立效果」點判

`perfRenders` 只數 7+1 個具名 component，唔數 `SongCard`。要量呢項最平嘅做法係
喺 `SongCard` 加 `useRenderCount('SongCard')`（累加式）然後做「切 5 次 chip」嘅腳本，改前應該 +90（18×5），改後應該 +0。
**但我唔要求做**：理由係 (a) 改動本身經審查證明行為等價、零風險；
(b) baseline 由頭到尾**冇任何 frame-drop / jank / 耗時數據**指出呢啲 re-render 造成過問題（同我 §4f 對 F-2 講嘅一樣）；
(c) 要為咗一個未證實存在嘅問題再燒一個 build + 一輪模擬器唔抵。
**判詞：標「未量化、代碼審查安全、風險為零、保留」，可以隨 2B 一齊出街。**

---

## 4. F-4（`d547279`）—— 判：**PASS（收益真實、實作正確）；有一個報告冇發現嘅副作用，附折衷方案**

### 4.1 實作正確性 —— PASS

- 「render 期間有條件 setState」係更新**自己**嘅 state（`libraryEverVisited`），係 React 官方認可寫法，
  唔會 update 其他 component；條件 `activeTab === 'Library' && !libraryEverVisited` 一次 flip 之後永遠 false，**冇 infinite loop**。
- keep-mount 行為保住：`<View style={{display: ...}}>` 外殼冇動，mount 之後 `LibraryScreen` 唔會 unmount ⇒
  **搜尋字串、`lang`/`org`/`kidsSubLang` chip、FlatList scroll 位跨 tab 全部保留**，同改前一致。**PASS。**
- `useCachedHymns` 訂閱：`LibraryScreen` **唔 call 呢個 hook**（`hymns` 係 prop `allSongs`），
  而 `refreshKicked` 保證全 app 生命週期只 kick 一次、AppContent 一早訂咗 ⇒ **F-4 對 fetch/refresh 零影響**。**PASS。**
- 深連結／分享清單：`App.js:4065-4082` 嘅 `Linking` 路徑只 set `sharedToken` 開 `SharedPlaylistSheet`，
  **唔會 set `activeTab='Library'`**；全 repo 只有兩個 `setActiveTab` 呼叫（`:4040` 返 Home、`:4235` `handleTabChange`）。
  ∴ **冇任何路徑可以繞過個 flag 而要求 Library 已 mount**。**PASS。**

### 4.2 **保留（報告完全冇提）：歌詞索引預熱由「開機背景」推遲到「首次撳詩歌庫之後」**

`src/screens/LibraryScreen.js:135-146`：

```
// BATCH7 B7-10:淨係靠 getLyricsIndex() 喺第一下搜尋嘅 render 入面先起,
// 會喺用戶打緊字嗰下主線程 stall 一下(norm() ~6k 首全歌詞,733KB)
useEffect(() => { if (!hymns.length) return; const task = InteractionManager.runAfterInteractions(() => { getLyricsIndex(hymns); }); ... }, [hymns]);
```

呢個 effect **只喺 LibraryScreen mount 之後先存在**。改前佢喺開機（hymns 一到）就排隊背景起；
改後**要等用戶第一次撳「詩歌庫」**先開始排。

- **正確性冇事**：`getLyricsIndex()` 個 lazy fallback 仲喺度，搜尋唔會漏歌。
- **latency 有風險**：如果用戶撳完詩歌庫**即刻**撳搜尋欄打字，`runAfterInteractions` 可能仲未跑
  （佢會等 interaction 完），咁 733KB 嘅 `norm()+foldHomophone()` 就會**喺 keystroke 嗰一 render 同步做** ——
  正正係 BATCH7 B7-10 當初寫呢段就係為咗避開嘅 stall。
- 呢個 stall 嘅實際 ms **冇人量過**（改前改後都冇）。

### 4.3 「Library 首次撳 tapToPaint 72→539ms」對用戶可唔可接受

- **開機 480ms 係全部人、每次開 app 都收到；539ms 係第一次撳詩歌庫嗰一次。**
  單論交換比例，方向合理（首屏係最貴嘅注意力）。
- 但 539ms 嘅 tap 反應**已經跌出「即時」區間**（>300ms 開始察覺，>500ms 明顯），
  而且撳落去嗰 237ms（tapToMount）期間**畫面完全冇反應**（冇 spinner、冇 skeleton），
  加埋 §4.2 嗰個未量化嘅歌詞索引風險 —— **我唔會就咁收貨呢個代價**。

**折衷（我建議採納，純 JS、細改、唔使新 build 概念）**：唔好等用戶撳，
喺**首屏畫完之後**用 idle 自動 pre-mount：

```
// AppContent，home 首幀之後
useEffect(() => {
  const task = InteractionManager.runAfterInteractions(() => setLibraryEverVisited(true));
  return () => task.cancel && task.cancel();
}, []);
```

- 保住 480ms：Library 唔再同 HomeScreen 首幀爭同一條 JS thread（`home` mark 喺首幀就記咗）。
- 攞返 72ms tapToPaint：用戶真係撳嗰陣多數已經 mount 好。
- 攞返歌詞索引開機預熱（因為 LibraryScreen 一 mount，`:141` 嗰個 effect 就照排隊）。
- 現有嘅 render 期間 setState 一定要**保留**做兜底（用戶喺 idle 未到就撳），兩者唔衝突。

**判詞：F-4 現狀可以出街（收益真、風險低、正確性我逐條驗過），但強烈建議同一輪 OTA 順手加上面個 idle pre-mount。**
如果 Fable 5.1 決定唔加，就要接受「第一次撳詩歌庫 ~0.5s 冇反應」同「首次歌詞搜尋可能 stall」兩件事，
並且要**量返個歌詞索引 build 要幾多 ms** 先算有數。

---

## 5. A/B 方法論

### 5.1 §L1「`simctl install` 唔換二進制」—— **判：發現正確、修正法足夠（有一個加強建議）**

- 發現本身係真嘢，而且執行者係**用數據自己揪出嚟**（10 個 run 有 9 個帶 AFTER 簽名），
  然後**主動作廢第一版、重做、留低廢版 raw**（`2b-s2s3-*` 11 個檔仲喺度）。
  **呢個處理係全份報告最好嘅一段**，同 baseline 1A 自曝 regex 漏 `import()` 同級。
- 修正法（uninstall + install + `get_app_container` 讀 `main.jsbundle` size 核對）**夠用**：
  兩個 build 差 2,423 B，size 係有效判別式。raw 核對：`grep -h match= 2b-s2s3v2-*.log | sort | uniq -c`
  → `5 label=after ... match=YES` + `5 label=before ... match=YES`，**10/10 屬實**。
- **加強建議（下次）**：用 `shasum -a 256` 而唔係 size。size 相等唔等於內容相等；
  將來如果兩個 build 啱啱好同 size（例如只改一個字串長度一樣），size 核對會靜靜地失效。
- **額外好消息**：呢次仲有一個**結構性**判別式擺咗喺 raw 度 —— BEFORE 嘅 perfMarks 帶 `ttfb=/body=/pars=/rss=na`，
  AFTER 帶 `att=/ok1=/a1t=...` 兼冇 `rss=`。兩個 schema 唔同 ⇒ 就算 size 核對失效都認得出。
  報告提咗「chips= 有冇小數點」呢個弱一級嘅判別式，冇提呢個更硬嘅。我喺此補記。

### 5.2 §4.2「856→376ms 歸因 F-4 主導」—— **判：合理，而且我可以幫佢加強**

報告嘅歸因係推論（冇獨立 build 拆 F-3/F-4），佢自己有聲明（L2）。我做咗兩件佢冇做嘅事：

**(a) 換一個唔受開機前段波動影響嘅指標重算。** 用 `home − cacheReady`（剔走 T0→cache 就緒嗰段）：

| 組 | 逐 run `home−cacheReady` | median |
|---|---|---|
| 1B S2 baseline | 713 / 742 / 717 / 720 / 727 | 720 |
| 2B BEFORE | 679 / 682 / 675 / 675 / 680 | **679** |
| 2B AFTER | 186 / 186 / 197 / 197 / 210 | **197** |

差 482ms，同 raw `home` 差 480ms **一致到 2ms** ⇒ 呢個收益唔係開機前段噪音搬位，係真嘢。
而且 AFTER 組嘅離散度（186–210，跨度 24ms）遠細過 BEFORE（675–682）—— 收益穩定。

**(b) 答埋「480ms 點解大過量到嘅 Library render 176ms」。**
BEFORE 嘅 `lib=176/179/180/176/175`，睇落淨係 176ms，同 480ms 差 ~300ms。
呢個唔係矛盾：`libraryRenderMs` 個 span 收喺 `LibraryScreen.js:267-272`，**即係 `return (` 之前** ——
佢只計 render function **body**，**唔計** JSX 構造、reconciliation、commit、native view 建立、FlatList 首窗 layout。
而 `home` mark 係 `requestAnimationFrame` 雙層之後（`HomeScreen.js:268`），**要等 JS thread 真係得閒**先記到。
∴ `lib=176ms` 係 Library mount 總成本嘅**下限**，480ms 完全喺合理範圍。
**F-3 亦排除得乾淨**：`React.memo` 對首次 mount 只會加（一層 wrapper）唔會減，冚唔到 480ms 呢個方向。
**∴ 歸因 F-4 主導，我 confirm，而且比報告講嘅更硬。**

### 5.3 1B baseline 938 vs 2B BEFORE 856 —— **判：解釋得到，唔係儀器問題**

拆開睇：`cont` 1B median 217（範圍 187–321）vs 2B BEFORE median 180（176–188）；
`cacheReady` 1B 211（181–315）vs 2B 175（171–183）。
**差距絕大部分喺 cacheReady 之前**（開機前段：不同 build / derivedData 增量 / 模擬器狀態 / seed launch 預熱）。
過咗 cacheReady 之後嘅可比段（§5.2 表）1B 720 vs 2B BEFORE 679，**只差 41ms（5.7%）**。
∴ 報告嗰句「量級一致，確認儀器冇變」**結論啱**，但論證太鬆（佢只比 856 vs 938 個總數）。
我補上呢個拆段對照，**判 PASS**。
另外 2B 個 v2 protocol 多咗一次 seed launch（12s）先 terminate 再 measure，本身就會令第二次開機快啲 ——
呢個係 BEFORE/AFTER **兩邊都有**嘅共同條件，唔影響 A/B，但令佢唔可以同 1B 直接比。報告冇講呢點。

---

## 6. F-2 診斷（`297bf52`）—— 判：**決策啱（唔做 useMemo）；但「(i) 成立」呢個結論本身有保留**

### 6.1 raw 實情比報告講嘅複雜

`2b-f2-s5-beacons.log` 有**兩行** perfRenders，報告只引咗第二行：

```
t=15  Home=5 Library=0 Mine=5 Mini=5 TabBar=5 FullPlayer=0 AppContent=5 PlayerProvider=4
t=60  Home=9 Library=0 Mine=9 Mini=9 TabBar=9 FullPlayer=4 AppContent=9 PlayerProvider=9
```

- t=15：**AppContent(5) > PlayerProvider(4)** —— 即係 AppContent 有**至少一次**唔係由 PlayerProvider 帶起嘅 render
  （佢自己嘅 state / 上游 provider）⇒ 我 §4f 嘅候選 **(ii) 有份，唔係零**。
- t=15→t=60：PlayerProvider **+5**，AppContent **+4** —— 有一次 PlayerProvider render **冇**帶起 AppContent。
  ∴ 兩者亦**唔係**嚴格鎖死關係。
- t=60 兩個數啱啱好相等，係「PlayerProvider 多咗一次自己嘅、AppContent 多咗一次自己嘅」**互相抵消**嘅巧合。

**判詞：報告 §3 寫「完全相等 → 依規則 (i) 成立」係只睇咗一行、揀咗最啱自己嘅嗰行。**
正確講法應該係：「t=60 相等、t=15 唔相等，兩個機制都有份，n=1 個 session 分辨唔到比例」。
**呢項標「有保留」。**（唔係致命：呢個係診斷唔係改動，冇任何嘢出咗街。）

### 6.2 但「唔做 `PlayerCtx.Provider` value useMemo」呢個決定 —— **PASS，我同意**

理由同我 §4f 一樣，同數據無關：`value` object 涵蓋咗差唔多全部 PlayerProvider state
⇒ 大部分令佢 re-render 嘅事件同時就係 dep 變化 ⇒ memo 照樣出新 object ⇒ **淨賺 ~0**。
真正贏到嘅只有 `noticeText`/`slowLoadNotice` 兩個唔喺 value 入面嘅 state，範圍極窄。
**再加一條：60 秒播放期間多 4–9 次 render，由頭到尾冇任何 frame-drop / jank / 耗時數據指佢係問題。**
∴ 唔做係啱嘅，慳返一個掂 `PlayerProvider` 嘅風險。

### 6.3 「React.memo 包 screens」仲有冇價值 —— **判：而家唔值得做**

- §6.1 顯示 AppContent 確實有自己嘅 render，理論上 memo 包 Home/Library/Mine 會切斷傳播。
- **但**：`<HomeScreen hymns={...} loading={...} onPlayHymn={handlePlayHymn} onOpenList={showHymnList} />`——
  `showHymnList` 睇代碼唔係 `useCallback`（`closeHymnList` 亦係普通 function），
  ∴ 每次 AppContent render 都係新 reference ⇒ **memo 直接 miss，包咗等於白包**，
  要真做就要連埋 `useCallback` 一堆 props，改動面比 F-2 本身大，而且仍然係**冇問題證據嘅優化**。
- **建議：唔做。** 如果將來真係有 jank 報告，先返嚟量。

### 6.4 `useRenderCount('PlayerProvider')` 出唔出街

呢行係診斷用。留住嘅成本 = `PlayerProvider` 多一個 `useRef` + 一次 Map 寫入（可忽略），
好處 = 之後真機有 jank 報告時即刻有數。**我建議留住**，唔值得為呢一行再開一個 commit/build。
（但要連埋 §7 嘅 telemetry 決定一齊睇。）

---

## 7. 正控 / 缺口

### 7.1 §L4「今日為你預備」冇截圖比對 —— **判：代碼審查 + 兩個數據常數，已經夠，唔使補截圖**

報告只講咗「邏輯冇改」。我補三條硬證據，令呢個正控**強過截圖**：

1. `git diff fcfb62e 8a2e729 -- src/utils/homeChips.js src/utils/dailyShuffle.js` = **完全空**。
2. `HomeScreen.js` 喺同一 range 嘅改動，剔走 span/`now()` 之後**只有 5 行**，全部係 SongCard props，
   `hymns.filter(hasAlbum)` / `featured===1` / `dailyPickBalanced(pool,'today',6,LANGS)` **一個字冇動**。
3. **輸入相同**：全部 10 個 A/B run `n=6405`；全部冷開 run `byt=3657732`（BEFORE 同 AFTER 完全一樣）
   ⇒ 兩個 build 食嘅係 **byte 級同一份資料**。
   種子固定（`'today'`）+ 函數相同 + 輸入相同 ⇒ **輸出必然相同**，唔使用眼睇。

**判：L4 唔算缺口，可以劃走。**（`byt` 呢個欄名有小問題，見 §8。）

### 7.2 **真正嘅正控缺口喺另一處：F-4 改咗「畫乜」，但冇任何功能性確認**

`ops/perf/stage2-20260902/` **一張截圖都冇**（執行單 §2B 產出寫明要 screenshots）。
我哋而家有嘅只係 `tab=Library tapToMount=... tapToPaint=...` —— 證明咗**有嘢 mount 咗、有畫過一幀**，
但**冇任何證據話 Library 畫出嚟係啱嘅**（搜尋欄、語言 chip、6405 首清單、scroll）。
F-1/F-2/F-3 都唔改畫面，唯獨 F-4 改。
**列為 OTA 前必補（P2）：一張「首次撳詩歌庫之後」嘅截圖 + 一次搜尋（確認歌詞搜尋唔會空手而回）。**
呢個交返俾佔住模擬器嗰個 session 順手做就得，唔使新 build。

---

## 8. 證據表格式、raw 存在性、越界判詞

| 項 | 判 | 理由 |
|---|---|---|
| **raw 檔存在性** | **PASS** | 報告引用嘅 42 個 `2b-*` 檔我逐個 `ls` 過，**全部存在**；連被作廢嘅第一版 A/B（`2b-s2s3-*` 11 個）都留低咗，冇滅證。 |
| **數字轉錄** | **PASS（全中）** | §1.1 三行（3748/553/3170/25、6703/524/6154/25、6570/537/6009/24、byt 3657732）✅；§1.2 三行（3/3/15/6、lib 181/174/178、mine 0/1/0、home 870/846/869）✅；§2.1 十行 hymnsMs + ttfb/body/pars + att/ok1/a1t/a1b/a1p ✅；§4.2 二十格（home 851/858/858/856/855 → 376/361/371/414/378；tapToPaint 59/73/73/72/56 → 537/539/522/539/554）✅；§0 兩個 jsbundle size（3,718,093 / 3,720,516）同 install-verify log 一致 ✅。**一個轉錄錯都冇。** |
| **median 計算** | **PASS** | §2.1 median 5734/4562、§4.2 median 856/376/40/72/237/539 我逐組重算，全對。 |
| **A/B 交錯** | **PASS** | `host_launch_ts` 排序顯示 f1-ab 同 s2s3v2 都係真交替（s2s3v2 由 after 起手），唔係「先做完 5 個 before 再做 5 個 after」。 |
| **執行者唔判 PASS/FAIL** | **PASS** | 全份冇一句「快咗/冇問題/成功」式判詞。§4.2 甚至主動用粗體寫「升咗 467ms」呢個對自己不利嘅數。§2.1 主動講「較大機會係網絡波動而唔係代碼效果」。**守得好。** |
| **「零 X」有冇正控** | **PASS** | 冇講過任何「零 X」。 |
| **限制章（L1–L7）** | **PASS（高質）** | 七條全部係真限制，L1 尤其有方法論價值。**唯一漏咗嘅係 §4.2 嗰個（歌詞索引推遲），同 §6.1 嗰個（只引一行 perfRenders）。** |
| **pathspec-only commit** | **PASS** | 七個 commit 我逐個 `--stat`，冇一個夾帶其他 session 嘅檔。`fcfb62e..8a2e729` 之間雖然夾住咗 Stage 3 / 2A 嘅 commit（`d8b7f04`/`ebe29ba`/`77fa5ee`），但**前端 bundle 嘅 delta 只有 6 個檔**（App.js、HomeScreen、LibraryScreen、MineScreen、useCachedHymns、perfMarks），backend 改動冇 restart ⇒ **A/B 無混淆變數**。 |
| **紅線（唔掂 PlayerProvider 邏輯）** | **PASS** | `git diff fcfb62e 8a2e729 -- App.js` 得 4 段：F-2 一行 counter（`:420`）+ F-4 三段（全部喺 `AppContent`，`:3907`/`:4274`/`:4297`）。**冇掂起播/stall/nudge/watchdog/HLS/queue 一個字。** |

### 三個小瑕疵（唔影響結論，但要記低）

1. **`byt=` 唔係 bytes。** `note('hymnsBytes', text.length)` 記嘅係 **JS string length（UTF-16 code unit）**，
   所以係 3,657,732 而唔係 1A 量到嘅 5,567,646 B（中文字 UTF-8 三個 byte、JS 一個單位）。
   §1.1 表個欄頭寫「bytes」係**唔準**。要同 A-2 gzip 效益對數嘅時候唔可以直接攞呢個數比。
2. **perfMarks beacon 已經迫近 300 字上限。** AFTER 版最長 `detail` = **276 / 300**。
   一旦真係發生 retry（`a2t/a2b/a2p` 由 `-` 變真數），再加多幾個 fetch entry，就會撞爆 300 → `sendBeacon` 靜靜 `slice(0,300)` 截走 `fetch=` 尾。
   **即係「F-1 最想量到嗰個場景」正正就係最容易令儀器自己失真嘅場景。** 下次加欄之前要先減欄。
3. **報告 §0 講嘅 build 判別法（`chips=` 有冇小數點）比 raw 入面實際存在嘅判別法弱。** 見 §5.1。

---

## 9. 逐項判定總表

| 項 | 判定 | 一句理由 |
|---|---|---|
| **D-1 診斷（`d51c3bc`+`fcfb62e`）** | **PASS** | 純儀器；`fcfb62e` 個 write-once 修正（只喺 `hymns.length>0` 先記）係啱嘅，仲保留咗 `lib0` 唔滅證；三段拆時內部加數 5/5 自洽。 |
| **§4c 反轉** | **我 FAIL，正式撤回** | expo/fetch streaming 已由 Swift/Kotlin 原始碼 + `fetch=api/hymns:1` 雙重實錘；錯因見 §1.2。 |
| **F-1（`4321f46`）** | **條件 PASS + 兩個保留** | 無 leak、真斷網仍 16s、retry 不變、`text()+JSON.parse` 同 `json()` **字面同一條路徑**；但 30s body timeout 喺 expo/fetch **唔會 recover 只會掛住**（§2.6），且源碼註解仍寫住已推翻嘅講法（§2.7）。 |
| **F-2 診斷（`297bf52`）** | **決策 PASS / 結論有保留** | 唔做 useMemo 係啱；但「(i) 成立」係只引 t=60 一行，t=15 嗰行同佢相反（§6.1）。 |
| **F-3（`b9e0f64`）** | **PASS（未量化、代碼審查安全）** | 行為逐條等價、無 stale closure、無 TDZ；唔要求補量（§3.5）。 |
| **F-4（`d547279`）** | **PASS + 一個必須知嘅副作用** | 480ms 真、穩定（AFTER 跨度 24ms）、歸因我獨立加強咗；但歌詞索引預熱被推遲（§4.2），建議加 idle pre-mount（§4.3）。 |
| **A/B 方法（§L1 + §4.2 歸因）** | **PASS（建議改 sha256）** | 10/10 `match=YES` 屬實；歸因用 `home−cacheReady` 重算得 482ms，同 480ms 一致。 |
| **1B 938 vs 2B 856** | **PASS（我補論證）** | 差距 90% 喺 cacheReady 之前；可比段只差 41ms。 |
| **§5/§L4 正控** | **PASS，缺口劃走** | 代碼 diff 空 + `n=6405` + `byt` 兩 build 相同 ⇒ seeded 抽歌必然相同，強過截圖。 |
| **真正正控缺口** | **要補（P2）** | F-4 改咗畫面但零截圖、零功能確認（§7.2）。 |
| **證據表格式 / raw / 越界** | **PASS（高質）** | 見 §8；「執行者唔判 PASS/FAIL」守得好，主動記自己不利嘅數。 |

---

## 10. OTA 出街建議

**結論：可以出街，但要先做 P0–P2 三件（全部係文字/截圖/一個決定，冇一件要重新 build 或者重新量）。**

### 出街前必做

| # | 事項 | 點解 |
|---|---|---|
| **P0（決定，唔係改動）** | `perfMarks.js:23` `PERF_MARKS_ENABLED = true` **會隨呢個 OTA 出到所有真機**。之後每次開 app 都會向 `/api/client-log` POST 4 條（perfHome@5s、perfRenders@15s+60s、perfMarks@25s）再加最多 10 條 perfNav。**要 Fable 5.1 / Eric 明文拍板留定關。** | 我嘅意見：**留住開一段時間**。理由：F-1 最想知嘅嘢（真機蜂窩網嘅 ttfb/body 分佈、有冇真係撞到 retry）**只有真機量到**，而 L6 已經聲明模擬器數字唔代表真機。但要同時知：呢個係新增嘅恆常上行流量 + backend log 量，而且 §8 第 2 點嗰個 276/300 截斷風險喺真機（慢網、多 fetch）會更易撞到。 |
| **P1（必改）** | `useCachedHymns.js:22-25` 註解仍然寫住「1B baseline 5/5 run 第一次嘗試全部撞 8s」「實際逾時拉到 16s」—— 已被推翻。改成「舊碼 8s 只保護 ttfb，body 從來冇 cap；F-1 加嘅係 body cancel，但見 §2.6 JS 側仍唔會 recover」。 | 唔改嘅話，下一手讀碼嘅人（人或 agent）會由呢段註解重新推出同一個錯結論 —— 我自己就係咁錯咗一次。 |
| **P2（必補，唔使 build）** | 一張「首次撳詩歌庫之後」嘅截圖 + 一次歌詞搜尋，確認 F-4 lazy-mount 之後畫面同搜尋正常。 | F-4 係四項入面**唯一**改咗「畫乜」嘅，而家零視覺/功能確認（§7.2）。 |

### 建議同一輪順手做（我推薦，但唔擋出街）

- **F-4 idle pre-mount**（§4.3 嗰段 `InteractionManager.runAfterInteractions(() => setLibraryEverVisited(true))`）。
  保住 480ms、攞返 72ms tapToPaint、攞返歌詞索引開機預熱。三贏，改動 5 行。
  如果做，要保留現有嘅 render 期間 setState 做兜底。

### 排喺之後（Stage 2C / 3）

- **F-1 body timeout 真身修法**（§2.6 `Promise.race`）。而家嗰個 30s 只 cancel 底層下載，JS 側唔會 recover。
  唔急（同改前一樣，冇 regression），但唔修就唔可以再講「body 有逾時保護」。
- **perfMarks 300 字上限**：加新欄之前要先減欄，否則 retry 場景會截走 `fetch=`。
- `byt=` 改名做 `chr=` 或者改記真 byte，避免將來同 A-2 gzip 效益對錯數。

### 出街次序上唔使擔心嘅

2B 四項全部係 **JS-only**，唔依賴 2A 任何 backend 改動（A-2 compression / A-4 410 stub 都未 restart）。
∴ **2B 嘅 OTA 同 backend restart 窗口冇耦合**，唔會踩到 memory 記低嗰條
「`.m3u8` 撞 stream.js 出 400 / restart 一定排喺 OTA 前」嘅紅線（嗰條係針對 HLS route，同呢批無關）。

---

## 11. 要記入 MEMORY 嘅三條

1. **Expo SDK 53+（本 repo SDK 56）嘅 `global.fetch` 係 expo/fetch，唔係 RN whatwg-fetch。**
   `fetch()` 喺 headers 到就 resolve（`ExpoFetchModule.swift` `waitFor([.responseReceived, .errorReceived])`）。
   ∴ **任何「用 AbortController 包住 `await fetch()`」嘅 timeout 只保護 ttfb，唔保護 body。**
   而且 **`response.text()`/`arrayBuffer()` 只等 `.bodyCompleted`，唔等 `.errorReceived`** ⇒
   **headers 之後任何 abort / 網絡錯，`text()` 嘅 promise 永遠唔 settle（iOS 同 Android 都係）。**
   要真 timeout 一定要 `Promise.race` 一個會 reject 嘅 timer。
2. **方法論（我自己踩嘅坑）**：由「假設嘅 library 語義」推出嚟嘅結論，出之前一定要
   (i) 去 `node_modules` 讀真身，(ii) 喺自己已經轉錄過嘅欄位度搵一個可以推翻自己嘅判別式。
   我 §4c 有反證（`fetch=api/hymns:1`）擺喺同一行、我仲親手核對過「全中」，但冇攞嚟用。
3. **iOS 模擬器 A/B 共用 bundle id**：`simctl install` 覆蓋唔一定真換二進制（CoreSimulator 去重）。
   一定要 uninstall + install + `get_app_container` **核對檔案指紋（用 sha256，唔好用 size）**，
   最好再喺 beacon 度留一個**結構性**判別式（例如兩個 build 嘅 beacon schema 唔同欄），做第二重保險。
