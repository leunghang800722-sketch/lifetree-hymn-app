# PERF-FINAL-OPUS-20260902 — Opus 5 最後一輪獨立驗收（2E / C-7 / 總結報告對數 / 部署判定）

驗收者：Opus 5。對象：
- **A** `PERF-STAGE2-2E-20260902.md` + raw `ops/perf/stage2-20260902/2e-*` + commits `b0e3411 a829ed8 0875920 925c98f 1b66931`
- **B** `git show 7eab3c1` + `PERF-STAGE2-2C-20260902.md` §C-7 + raw `2c-c7-*`
- **C** `PERF-FINAL-REPORT-20260902.md` §1/§2/§4 逐個數字對源

**本次驗收冇改任何 source、冇 commit、冇部署、冇 restart backend、冇掂 hymns.db／Cloudflare、冇開模擬器。**
動作只有：`git show/diff/log`、讀 repo 檔同 `frontend/hymn-app/node_modules/expo`（iOS Swift + winter fetch TS 原始碼）、
`grep`/`awk`/`sed` 統計 raw log、`git --numstat` 重算 Stage 3。臨時檔：無。

判定準則同前幾輪一致：①數字有冇出處 ②方法有冇混淆變數 ③「零 X」有冇正控 ④結論有冇超出數據。

---

## 0. 總結（六句）

1. **E-1 實作正確，而且我獨立收窄咗佢嘅適用範圍**：headers 階段嘅 abort 本來就 catch 得到（`ExpoFetchModule.swift` `start()` 喺 `.errorReceived` 會 `promise.reject`），**只有 body 階段係真窿**，E-1 修中咗嗰一個。冇 listener leak（理由同註解寫嘅唔同，見 §A1.3）。**PASS**
2. **E-2 PASS，而且「對首屏零影響」有一條比報告寫嘅更硬嘅證據**：`libIdle` 684–897ms **全部喺 `home` 385–474ms 之後**，時序上結構性唔可能影響首幀 —— 呢條比 median 422 vs 414 嘅 n=5 對比可靠得多，報告冇用。
3. **E-5(1) P0 PASS**（harness 逐字抄 `canSkip`，bug 重現 + 修法生效兩邊都證，我獨立對過判斷式）。
4. **E-5(3) + `b0f7931` 判 FAIL（補救無效）**：client `perfMarks.js:155` 自己 `String(detail).slice(0, 300)`，backend 由 300 放寬到 400 收到嘅字串**本身已經係 300** —— 對 perfMarks 截斷零作用。`b0f7931` 係**必要前置**唔係補救，真修法係 client 一行。
5. **C-7 兩項全 PASS**：8 個 `getDb()` call site 我逐個獨立核完，「同步用完就放手」屬實；dedupe × C-6 async 壓縮嘅互動唔單止冇問題，仲有一個報告冇提嘅額外收益（壓縮由 3 次變 1 次）。
6. **總結報告對數：15 條要改**（8 條係實質數字／歸因錯，7 條係精度／出處／標題），逐條「現寫→應為」喺 §C。**部署判定：GO（有條件）**，見 §D。

---

## A. Stage 2E

### A1. E-1 —— body-timeout abort race（`b0e3411`）：**PASS**

#### A1.1 我獨立重讀原生碼，得出兩條 Sonnet 同 2B-Opus 都冇分開講嘅結論

`frontend/hymn-app/node_modules/expo/ios/Fetch/ExpoFetchModule.swift`：

```
AsyncFunction("text") { (response, promise) in
  response.waitFor(states: [.bodyCompleted]) { ... promise.resolve(text) }
}
AsyncFunction("start") { (request, ...) in
  request.response.waitFor(states: [.responseReceived, .errorReceived]) { state in
    if state == .responseReceived { promise.resolve() }
    else if state == .errorReceived { promise.reject(request.response.error ?? FetchUnknownException()) }
  }
}
```

**(a) headers 階段嘅 abort 本來就冇壞。** `start()` 明文 `.errorReceived → promise.reject`，
∴ `fetchHymnsTwoStage` 頭嗰個 8s timeout 一直都拋得到、`catch` 一直都行得到。
E-1 **只**修 body 階段（`text()` 淨等 `.bodyCompleted`，abort 令 state 去咗 `.errorReceived`，once-listener 永遠唔 fire）。
∴ 「兩條路都 catch 到？」答案：**係 —— headers 靠 expo 自己 reject，body 靠 E-1 個 race**。兩條都封咗。

**(b) `signal.addEventListener` 喺呢個 runtime 一定存在** —— 呢點係 E-1 嘅隱含前提，而且係**災難級前提**
（如果 `addEventListener` 係 undefined，`new Promise` executor 會同步 throw → race 即刻 reject → **每一次** body 都失敗）。
兩條獨立證據：
- `node_modules/expo/src/winter/fetch/fetch.ts:98-102` expo **自己**就係用 `signal?.addEventListener('abort', listener)` 去 `request.cancel()`；
- 2E S2 A/B 入面 **A 組（AFTER，含 E-1）5/5 seed launch 全部 `n=6405`、`ok1=1`、`att=1`**（`2e-run-A-seed-*.log` / `2e-s2-clientlog-window.log`）——
  即係真 iOS runtime 上面，race 冇整壞正常路徑。**呢個係最有力嘅機上正控，報告冇當佢係正控嚟講。**

#### A1.2 harness 正控 —— 有效，但要講清楚佢證緊乜

`2e-e1-harness-output.log`：`withFix_hang` 2,059ms `AbortError`、`withoutFix_hang` 6,003ms 未 settle、`withFix_normal` 10ms 正常。
三項屬實。**但 harness 用嘅係自寫嘅 `nativeBuggyText()`**（模擬「吞咗 abort、永遠唔 settle」嘅語義），
唔係真 expo/fetch。∴ 佢證嘅係「**假如** native 有呢個語義，race 就救得返」，
唔係「native 真係有呢個語義」。後者由 §A1.1 嘅原生碼 + 2B-Opus §2.6 提供。
兩截夾埋先完整 —— **報告冇明講呢個分工，我喺此補上，判證據鏈成立。**

#### A1.3 「冇 listener 泄漏」—— 結論啱，但註解寫嘅理由係錯嘅

`useCachedHymns.js:33-36` 寫「`addEventListener` 用 `{once:true}`，resolve 咗都唔會再有 abort 事件觸發佢」。
`{once:true}` 只保證「fire 一次之後自動除」——**fire 唔到嘅 listener 唔會因為 `{once:true}` 而消失**。
真正唔漏嘅理由係：`controller` 係 `fetchHymnsTwoStage`／`fetchLyricsMap` 嘅 **function-local**，
function 一 return 成個 graph（controller → signal → listener → 個 pending promise）就唔可達，俾 GC 收。
**判：行為 PASS，註解理由錯，列 P2 文檔修。**

#### A1.4 兩個保留（都唔 block）

- **保留 E-1a**：race 輸咗嗰一邊（`r.text()`）**永遠唔會 settle**。JS 側冇 unhandled rejection
  （`Promise.race` 已經幫兩邊都掛咗 handler），但 native `NativeResponse` 會繼續揸住已下載嘅 sink buffer
  直到 JS 側 `r` 被 GC。每次 30s body timeout 泄一次（最多幾 MB，短命）。**低風險，記錄用。**
- **保留 E-1b**：E-1 拋嘅 `AbortError` 同「HTTP 錯誤／JSON 壞」喺 `catch` 度**分唔開**，
  兩者都回 `{hymns: []}`／`{map: null}`。即係出街之後 beacon 分唔到「30s body timeout」同「其他失敗」。
  今日冇欄可以睇 —— 想量到就要加一個 `note('bodyTimeout', 1)`。**列 P2。**

---

### A2. E-2 —— Library idle pre-mount（`a829ed8` + `925c98f`）：**PASS**

#### A2.1 「對首屏零影響」—— 報告用嘅證據太弱，但有一條更硬嘅擺喺數據入面

報告用 `home` median A 422ms vs B 414ms 講「不變」。呢個對比 n=5、兩組範圍（A 398–430 / B 385–474）
**完全重疊**，而且 A 中位數其實**慢 8ms** —— 用佢嚟撐「零影響」係弱論證，
嚴格講只能講「量唔到差異」。

**真正嘅證據係時序**：`libIdle` 12 個讀數（`2e-s2-clientlog-window.log`）全部落喺 **684–897ms**，
而同一批 launch 嘅 `home` mark 係 **385–474ms**。
∴ idle pre-mount **必然喺首幀畫完之後先發生**，結構上唔可能同首幀爭 JS thread。
呢條係 categorical（唔係統計）論證，比 median 對比強一個檔次。**報告冇用，我喺此補入判詞。**

#### A2.2 A/B 方法：**PASS（今次係四份報告入面最紮實嗰次）**

| 檢查 | 結果 |
|---|---|
| byte-verify | 10/10 `match=YES`，兩個**唔同**嘅 `main.jsbundle` size（BEFORE 3,725,280 / AFTER 3,726,969），非同一個二進制 ✅ |
| 交錯 | BABABABABA，起手 A，seed+warm 各一 ✅ |
| 每 cycle 清場 | `uninstall`→`install`→新 deviceId ✅ |
| 分組判別式 | deviceId（10 個獨立）**＋** `liteMs` 欄有／冇（E-5 剷咗 → A 組必定冇），5A/5B 100% 對應 ✅ 雙重判別式，堵死 2B-Opus §5.1 個教訓 |
| 正控 | 10/10 `n=6405`、10/10 `verSkip=1`（證明 E-5 冇改壞 `canSkip`）✅ |
| 數字重算 | tapToPaint A{49,54,57,63,67} median **57** ✅／B{530,531,544,545,562} median **544** ✅；tapToMount A median **32** ✅／B median **229** ✅ —— 我由 raw 逐個重算，全對 |

**A1 個異常（§4.2）處理正確**：規則（「最後一次 `perfNav` 之後緊接嗰對」）對其餘 9 個 device
係恆等變換，raw 9 條全部留底可覆核。**唔算挑數據。**

#### A2.3 三個保留（都唔 block）

- **保留 E-2a（實作脆弱）**：`const task = InteractionManager.runAfterInteractions(cb)`，
  而 `cb` 內部寫 `task.timer = timer`。呢個依賴「`runAfterInteractions` **一定** async 派 callback」——
  如果佢同步行咗，`task` 仲喺 TDZ，會拋 `ReferenceError`。RN 現行實作（`setImmediate` 排隊）唔會，
  但呢個係一個冇必要嘅賭。用一個 `let timer` 喺 effect scope 就冇事。**列 P2。**
- **保留 E-2b**：`tapToPaint 57ms` 比 F-4 **之前**嘅 72ms 仲快。合理（idle mount 完 FlatList 已經 layout 好，
  而 F-4 之前係開機期 mount 完等到撳嗰刻）——但兩個數嚟自唔同 build／唔同日子，
  「57 < 72 = 比原本仲好」呢個講法唔應該當結論用，只可以講「攞返晒 F-4 嘅代價」。
- **保留 E-2c**：E-2 令 Library **每次開機都一定 mount**（原本 F-4 之後係「唔撳就唔 mount」）。
  即係 F-4 慳低嘅記憶體／CPU 又還返晒，只係搬去 idle window。呢個係設計上嘅取捨（換返 tapToPaint +
  歌詞索引預熱），commit message 有講，**但總結報告冇。**

---

### A3. E-3 / E-4（`0875920`）：**PASS**（純文檔）

`useCachedHymns.js:49-73` 已經改走「1B 5/5 撞 8s」「逾時拉到 16s」兩句被撤回嘅判詞，
改寫嘅版本（「8s 舊碼淨係保護 headers、body 由頭到尾冇 cap」）**同我 §A1.1 由原生碼獨立推出嘅結論一致**。
`PERF_MARKS_ENABLED = true` 保持開，加咗「收爐要關返」嘅拍板註解 —— 符合 2B-Opus §10 P1。
⚠️ 提醒：呢個 flag 會隨今次 OTA 出街，即係**恆常上行 telemetry**（每次開 app 4 條 beacon + 最多 10 條 perfNav），
要入監察清單（§D）。

---

### A4. E-5（`1b66931`）

#### A4.1 E-5(1) P0 `s.delete('allHymnsVersion')`：**PASS**

我獨立對過 harness（`2e-e5-p0-harness.mjs`）同 `useCachedHymns.js:302` 真身：
`canSkip = hadCache && serverVersion != null && cachedVersion && serverVersion === cachedVersion` —— **逐字一樣**，
唔係另寫一個近似式。輸出（`2e-e5-p0-output.log`）**兩邊都證**：冇修 → `canSkipNextBoot=true`（bug 重現）；
有修 → `allHymnsVersion` 變 `undefined` → `canSkipNextBoot=false`。
**呢個係「bug 重現 + 修法生效」雙向正控，係呢輪最乾淨嘅一個 harness。**

**語義覆核**：`delete` 而唔係 `set('')` 係啱嘅 —— `cachedVersion = s.getString(...) || null` 遇到空字串
一樣會變 `null`，兩種寫法效果相同，但 `delete` 語義更清楚（「呢個 cache 冇對應版本」）。
代價：一個長期 lyrics fetch 失敗嘅用戶，每次開機都會重新拉一次 lite（gz 371,984 B）。
呢個係 P0 修法嘅**必然**代價，可接受。

#### A4.2 E-5(2) lyrics 延後 8s：**有保留（唔 block，但要 Eric 知）**

**問到嘅三點，逐點答：**

1. **「用戶 8 秒內撳播」會唔會播唔到？** —— **唔會。** 音頻路徑（`playQueueImpl`／`/api/stream`）
   完全唔靠 lyrics map，E-5 一個字都冇掂。播放零影響。
2. **`getLyricsById` fallback 仲 work 嗎？** —— **機制仲喺，但延遲窗口入面佢冇嘢可以派。**
   `lyricsMapStore` 只喺 `fetchLyricsMap()` 成功之後先 `Object.assign` 填。E-5 令佢由
   「lite 到手即刻拉」變成「idle + 8s 之後先拉」。窗口內 `App.js:3302`
   `formatLyrics(cur.lyrics || getLyricsById(cur.id))` 兩邊都空 → `hasLyrics=false` →
   `App.js:3426` **「歌詞」pill 變灰（disabled）**。merge 落嚟之後 `hymnsStore.setState` 會令
   `cur` 重算、pill 自動着返 —— **自癒，冇死鎖。**
3. **有幾闊？** —— 呢個先係要 Eric 知嘅位：`!canSkip` 嗰刻 `hymnsStore.setState({ hymns: primary.hymns })`
   會用 **lite（冇 lyrics）蓋咗 MMKV 入面本來有 lyrics 嗰份**。即係**每次 dataVersion 一變**
   （按 memory，歌詞班／夜晚 job 令佢差唔多日日變），開機頭 `idle + 8s + fetch` 期間，
   **本來有歌詞嘅歌都會冇歌詞**。呢個 regression 係 **2D（A-6）引入**嘅，E-5 令佢闊咗 8 秒。
   一行修：merge 之前唔好用 lite 蓋 store（或者 lite 先同 MMKV 舊 lyrics 合併）。
   **唔屬 2E 引入，唔 block 出街，列 P1。**

**新增保留 E-5c（我提出，報告冇）**：`waitBeforeLyricsFetch()` 冇 hard cap。
`InteractionManager.runAfterInteractions` 喺有未清嘅 interaction handle 之下**可以永遠唔 fire**；
一旦咁樣，唔止 lyrics 永遠攞唔到，連 `allHymnsVersion` 都永遠唔寫（成個 `else` 分支行唔到）→
**每次開機都全套重來**。我 grep 過全 repo：冇 `Animated.loop`、冇 `isInteraction`，
而 E-2 用同一個 API 10/10 launch 都喺 <900ms fire ⇒ 實際風險低。
但呢個係「一個 handle 冇 release 就靜靜哋壞、冇 beacon 睇得出」嘅失效模式。
建議 `Promise.race([runAfterInteractions+8s, setTimeout(15000)])`。**列 P1。**

**L1 誠實度**：報告明文寫低 E-5(1)(2) 嘅 code path 今次**完全冇被踩到**
（live backend 未 restart 落 C-1，`?lite=1` 俾舊 server 忽略 → `isFull=true` → 跳過整段），
並且用 `merged=1` 但 `lyrMs=-`／`lyrBytes=-`／`byt=3657732`（full payload 嘅 char 數）三個欄互證。
**呢個係模範級嘅量度缺席聲明，我核過屬實。**

#### A4.3 E-5(3) + `b0f7931`（backend detail 300→400）：**FAIL —— 補救無效**

**實錘：`frontend/hymn-app/src/perfMarks.js:155`**

```js
detail: String(detail).slice(0, 300),
```

**client 自己已經切到 300 先送出。** `b0f7931` 改嘅係 `backend/routes/clientLog.js:46`
`String(b.detail || '').slice(0, 300 → 400)` —— **佢收到嗰條字本身已經係 300 個字。**
∴ 對 perfMarks beacon 嘅截斷問題，`b0f7931` **零作用**，
`2e-e5-truncation-evidence.log` 入面兩條 `len=300` 出街之後仍然會係 `len=300`。

**缺口有幾大**（我由 raw 反推）：
- A（已剷 `liteMs`）尾段切喺 `api/hom`，補齊 `api/home:1)` 要多 **4 個字 → 304**；
- B（仲有 `liteMs`）切喺 `api/stre`，補齊要多約 **16 個字 → 316**。
∴ **400 綽綽有餘 —— 前提係 client 個 slice 都要跟住放寬。**

**判詞**：
- `b0f7931` 本身**無害**，而且係**必要前置**（restart 排喺 OTA 之前，backend 一定要先接受 400，
  client 先可以送 400）—— 但佢**唔係**「補救」，總結報告如果話「已補救」就係報大。
- 真修法係 client 一行 `slice(0, 300) → slice(0, 400)`。**呢行改動今日唔存在於任何 commit。**
- 實際損害細：`fetch=` 係刻意排最後嘅「最有彈性」欄，而且 `fetch=N(` 個**總數 N 喺前面保住晒**，
  切走嘅只係尾一兩個 path 嘅分項。∴ **唔 block 出街**，但要老實講「未解決」。
- 2E 報告 §3／L2 **已經如實講咗「未完全解決」** —— 執行者誠實度 PASS，
  問題係 `b0f7931` 呢個補救**揀錯咗層**。

---

## B. C-7（`7eab3c1`）：**兩項全 PASS**

### B1. reloadDb 延遲 10 秒 close —— 8 個 call site 我逐個獨立核完

我自己 grep（唔靠佢張 `2c-c7-getdb-callers-grep.log`）+ 逐個讀上下文：

| # | call site | `db` 之後有冇跨 `await` 再用 | 判 |
|---|---|---|---|
| 1 | `routes/hls.js:141` | `prepare/bind/step/getAsObject/free` 全同步；之後 `await resolveAudioUrl` / `await resolveStructure` 都**冇再掂 `db`** | ✅ |
| 2 | `routes/stream.js:152`（`/warm`） | 第一個 `for` loop 建 `warmTargets` 全同步；第二個 loop 先開始 `await`，嗰時 `db` 已經冇再用 | ✅ |
| 3 | `routes/stream.js:215` | 同步 `prepare/bind/step/free`；我 `awk 'NR>215'` 掃成個 handler，**`db` 呢個 token 一次都冇再出現** | ✅ |
| 4 | `routes/me.js:31` | 同步 `prepare` + `bind/step/reset` 迴圈 + `free` + `return` | ✅ |
| 5 | `server.js:500`（`computeHymnsEntry`） | 同步 SELECT 迴圈 → `getDataVersion()` → `JSON.stringify` → `scheduleHymnsCompression`（只食個 string，唔掂 db） | ✅ |
| 6 | `server.js:592`（`computeHymnsLyricsEntry`） | 同上 | ✅ |
| 7 | `server.js:879`（keep-warm tick） | 同步 SELECT 揀 target + `free`，**之後**先 `await resolveAudioUrl/preVerifyUrl`，冇再用 `db` | ✅ |
| 8 | `server.js:947`（daily warm cron） | `getDb()` 喺**每個 iteration 入面**重攞，用完即棄 —— 比其餘七個仲安全 | ✅ |

**斷言成立。** 10 秒 = 實測同步 SQL（<100ms，C-6 §3.2）嘅 100 倍邊際。
唯一理論漏洞係「`await getDb()` resolve 咗但 event loop 被阻 >10s 先行到 continuation」——
而 C-6 已經將 miss 路徑最大嗰嚿同步成本（`gzipSync` 104.7ms）搬去 async，
剩返最大嘅同步段係 `readFileSync(61MB)` 6.7–20.5ms。**結構上到唔到 10 秒。**

⚠️ commit 註解已經自己寫低「日後有新 caller 打破呢個 pattern 就要重新檢討」——
**呢句要真係留喺 `serverDb.js` 度**（已經喺），我認可。

安全窗口正控（`2c-c7-reloaddb-close-safety-window.log`）：t=0/3/8s 舊 db 查得到、
t=11s `out of memory`（sql.js handle 已釋放）、`oldDb === newDb` = false。
**呢個係「延遲有效 + 之後真係釋放」雙向證明，設計正確。**
記憶體正控（`2c-c7-reloaddb-close-memory.log`）：改前 5 輪 112.7→346.1MB（每輪 +58.2MB 單調爬）、
改後 112.7–112.9MB 企定。**Opus 5 §5.2 個 bug 重現咗，修法生效。**

**保留 C-7a（細）**：個 close timer `unref()` 咗 —— 即係 process 喺 reload 後 10 秒內收工，
舊 DB 唔會 close。無害（process 退出乜都還晒），記錄用。

### B2. in-flight miss dedupe × C-6 async 壓縮 —— **互動正確，仲有一個報告冇提嘅額外收益**

**問到嘅：「dedupe promise resolve 之後 gz/br 仲係 async 補齊？」答：係，而且係補落同一個 object。**

機制我逐層核過：
1. `computeHymnsEntry(lite)` 起一個 `cacheEntry = { dataVersion, json }`，
   **同時**（a）掛落 module slot（`hymnsResponseCache` / `hymnsLiteResponseCache`）、
   （b）傳去 `scheduleHymnsCompression`、（c）`return` 俾所有 joiner。
   **三邊係同一個 object reference。**
2. Joiner 喺 `sendHymnsCache` 嗰刻讀 `cache.br` / `cache.gz` —— 未補齊就係 `undefined`，
   兩個 `if` 都唔中，跌落最底 `res.send(cache.json)`，交返俾 `compression` middleware
   做 async 協商。**唔會扔錯 `Content-Encoding`，唔會 double-encode。**
3. `scheduleHymnsCompression` 完成之後寫 `current.gz` / `current.br` —— 因為係同一個 object，
   **之後真正嘅 cache hit 即刻食到**。
4. 寫入前 `getCurrentSlot().dataVersion !== dataVersion` 就掉咗唔寫（stale guard）。✅

**額外收益（報告冇提）**：改前 3 個並發 miss = 3 次 `scheduleHymnsCompression`
= **6 次**壓縮（gzip×3 + brotli×3，每次 ~106ms libuv threadpool）。
dedupe 之後變 **2 次**。冷開機嗰刻 threadpool 壓力減 2/3。

**保留 C-7b**：`dedupeHymnsMiss` 用 `currentDataVersion`（route handler 開頭讀）做 key，
但 `computeHymnsEntry` 入面 `getDataVersion()` 係 `await getDb()` **之後**先讀。
兩者理論上可以唔同（reload 撞正嗰個窗口）→ joiner 收到嘅 `cacheEntry.dataVersion`
同佢當初 key 唔一致，連 ETag 都係新嗰個。**唔係 correctness bug**（派更新嘅資料冇問題，
`W/` weak validator 亦合規），而且改之前每個 request 各自都會撞同一件事。**記錄用。**

**保留 C-7c**：`computeFn()` reject 時所有 joiner 一齊收 500（改前係各自獨立 500）。
行為等價，`finally` 會清返 slot（用 entry identity 判斷，唔會誤刪第二輪）。✅

**Harness 品質**：`2c-c7-inflight-miss-dedupe.log` 有**改前 bug 重現**（C-6 版 SELECT=3）、
改後三條 route 各自 =1、混合 5 request delta 剛好 `{full:1, lite:1, lyrics:1}`、
**同埋三次回應 byte-for-byte 一致**（證明 share promise 冇整壞資料）。**四層正控，PASS。**

---

## C. `PERF-FINAL-REPORT-20260902.md` §1/§2/§4 對數

### C1. 對得上嘅（我逐個追返源，全中）

`5,567,646`（1A:32）／`1,474,227`（2A:63）／`371,984` + `−74.8%`（2C C-5 content-length）／
`992,859`（同上）／`47.85%`（2A-Opus:550）／SELECT `97–158ms`（1A:113 97.34/129.10/157.88）／
stringify `7–19ms`／local total `85–140ms`（1A:32 0.085/0.089/0.140）／prod 地板 `~0.75s`（1A:29,31）／
`18ms / 19ms / 938ms`（Baseline-Opus:419）／`856ms`（2B:106）／Library `174–186ms`、Mine `<1ms`（2B:50）／
bundle `2,654,414 B`、reanimated `26.6%`（704,946÷2,654,414=26.56%）、RN `25.8%`（685,818=25.84%）／
`3.70MB`（1A:148 3,703,949 B）／`14 script 1,561 行`（Baseline-Opus:400 更正值）／`10.86h`（2A-Opus:114）／
A-4 `35,145,812 B`／`278–308ms` → `410`／`<1ms`（2A:110）／C-6 `1,083,708 B`、`−26.5%`（2C:440,447）／
C-6 miss `196.7 → 73.0ms`（2C:475-490）／C-7 `112→346MB`、`112.7–112.9MB`（raw）／
A-6 `125→35ms`、比值 `0.280` vs `0.252`、`~6.6s → ~2.1s`（2D-Opus:250,253,269）／
E-1 `2,059ms`（raw）／E-2 `544 → 57`、`414 vs 422`（我由 raw 重算 median，全對）。

### C2. 要改嘅 15 條（現寫 → 應為）

| # | 位置 | 現寫 | 應為 | 性質 |
|---|---|---|---|---|
| 1 | §1 | 「剷走 **29 個死檔 6,138 行**」 | 「剷走 **29 個死檔 6,101 行**」（6,138 係 **35 檔**嘅總刪行，含 4 個仲喺度嘅檔嘅原地編輯 37 行）—— 我 `git --numstat` 重算：`d8b7f04+5baf3e1+3227fc3` = 29 檔 −6,101 | **數字錯（歸因）** |
| 2 | §4 Stage 3 總計 | 「**35 檔 +30/−6,138**，29 檔移除」 | 表入面列咗 **7 個** commit（含 `20a9ba0`），但呢個總計只覆蓋前 **6** 個。含 `20a9ba0` 應為「**36 檔 +30/−6,147**」；想保留 35/−6,138 就要註明「不含 20a9ba0 尾巴（+1 檔 −9 行）」 | **數字錯（範圍）** |
| 3 | §4 C-5 | 「117/30/86 → **18/8/10**」 | 三個後值聚合方式唔一致：full `18/18/21` 取 median 18、lite `10/7/6` 取四捨五入平均 8、lyrics `9/10/9` 取 **max** 10。應為「→ **18/7/9**（median）」或「→ **18–21 / 6–10 / 9–10**」 | **統計方法不一致** |
| 4 | §2 backend RSS | 「打 /api/search /api/category…**5 次 +400MB 尖峰**」 | +400MB **唔係 5 次打出嚟**。1A 個 736MB 快照係壓測開波 3m31s、約 **35 個** search+category request 之後，而且 1A:387 自己已更正「係尖峰唔係穩態」。5 次嘅實測數字係 A-4 harness `+157,616 KB`。應為「約 35 個 search+category request 後 live process 尖峰 736MB（穩態 ~250–360MB）；A-4 harness 5 次 category = +157,616 KB」 | **歸因錯（最嚴重一條）** |
| 5 | §4 A-4 | 「5 次 RSS **+157MB** → +1.6MB」 | `157,616 KB ÷ 1024 = 153.9 MB`。應為「**+154MB**（+157,616 KB） → +1.6MB（+1,648 KB）」 | **單位換算錯** |
| 6 | §2 冷開 | 「ttfb ~520ms、**body 3–9s**、parse 25ms；出處 1B + D-1」 | D-1 三條 beacon body = **3,170 / 6,009 / 6,154ms**，冇 9s。`body=9,461ms` 出自 **2B §2.1 F-1 A/B**（`2b-f1-ab-beacons.log`，而且 2B 自己標明係離群值）。應為「body 3.2–6.2s（D-1）；單一離群 9.5s（2B F-1 A/B）」+ 補返出處 | **出處錯** |
| 7 | §4 E-2 | 「idle mount 喺開機後 **683–897ms** fire」 | raw 最細係 **684**（`grep -c "libIdle=683"` = 0）。應為「**684–897ms**」 | 轉錄錯（1ms） |
| 8 | §4 F-4 | 「856 → 376ms（**5/5 一致**）」 | AFTER 五個值 376/361/371/414/378，跨度 53ms，唔算「一致」。應為「**median** 856 → 376ms（5/5 都改善，AFTER 361–414）」 | 用詞報大 |
| 9 | §4 A-1 | 「**server 側** 78–132ms → 12ms（hit）」 | 78.5/83.1/131.8 同 12.3/12.5 係 **loopback `curl` total**（2A:40 原文「curl /api/hymns total ×5」），唔係 server 側。真「server 側」數字係 §2 嗰行（SELECT 97–158 + stringify 7–19）同 C-5 `[access]` 0–1ms。應為「**loopback curl total** 78–132ms → 12ms（hit；run1 冷 compute 134.9ms）」 | **標籤錯** |
| 10 | §1 | 「server 側每次 request 由 **130ms** 縮到 ~1ms」 | 130ms 係範圍上限當咗代表值。應為「**78–132ms → 0–1ms**（server 側 `[access]`）」 | 取值偏高 |
| 11 | §1 | 「5.57MB 原文（CF 壓完 1.47MB）縮到 372KB（**−75%**）」 | −75% 係相對 **gzip 後**嘅 1.47MB，一句入面 raw／gzip 混用。應為「**wire bytes 1,474,227 → 371,984 B（−74.8%）**；raw 5,567,646 → 2,839,533 B（−49%）」 | 表述混用單位 |
| 12 | §4 backend 段標題 | 「Opus **2A/2C/C-6 全 PASS**，部署 GO」 | 表入面 **C-7** 同 **`b0f7931`** 喺寫嗰刻**未經任何 Opus 驗收**。應為「2A/2C/C-6 全 PASS；**C-7 見 PERF-FINAL-OPUS §B（PASS）**；`b0f7931` 見 §A4.3（**補救無效，但無害且為必要前置**）」 | 覆蓋範圍報大 |
| 13 | §4 frontend 段標題 | 「2E **進行中**」 | 應為「2E 見 PERF-FINAL-OPUS §A（E-1/E-2/E-3/E-4/E-5(1) PASS；E-5(2) 有保留；E-5(3) 補救無效）」 | 狀態過時 |
| 14 | §2 vs §4 | §2 `5,567,646` ／ §4 A-2 `5,567,648` | **兩個都啱**（1A 量 646、2A/2C 量 648，差 2 byte 係 `dataVersion` 字串長度變咗），但同一份文件出兩個數而唔註明會令讀者以為有錯。應加一句註 | 表述（唔係錯） |
| 15 | §2 lyrics 行 | 「1A 原報 **24%** 係字元數」 | 1A 原報係 **23.85%**。同行嘅 47.85% 寫足兩位小數，精度唔對稱 | 精度不一致 |

### C3. 特別核嘅四組（題目點名）

- **§1 四個數字**：`5.57MB→372KB(−75%)` ⚠️（#11 單位混用，數字本身啱）／`130ms→~1ms` ⚠️（#10）／
  `856→376ms` ✅／`29 檔 6,138 行` ❌（#1）。**四個入面兩個要改、一個要補註。**
- **§4 A-1「78–132ms → 12ms」**：數字 ✅、**標籤 ❌**（#9）。
- **§4 C-5「117/30/86 → 18/8/10」**：改前 ✅、**改後聚合不一致 ❌**（#3）。
- **§4 F-4「856→376」** ✅（#8 只係「5/5 一致」用詞）／**E-2「544→57」** ✅（我由 raw 重算 median）／
  **Stage 3「35 檔 +30/−6,138、29 檔移除」** ⚠️（#2：35/−6,138 對「前 6 個 commit」啱，對「表入面列咗 7 個」唔啱；29 ✅）。

---

## D. 最終部署判定：**GO（有條件）**

### D0. 前置紅線

- **唔准喺 Eric 真機 HLS QA 進行緊嗰陣做**（memory `feedback-no-deploy-during-live-qa`）。
- **`restart` 必須排喺 `OTA` 之前**（`?lite=1` / `/api/hymns/lyrics` 要 backend 先識；
  同時 client detail 400 都要 backend 先接受）。反過嚟做唔會壞（有 `isFull` fallback），但收益全部落空。
- HEAD 必須 = `b0f7931`，`approve.sh backend b0f7931 --confirm` 之後先跑 `backend-restart.sh --dry-run`。
  ⚠️ gate 係 per-sha，會連埋 tree 入面其他 session 嘅 commit —— restart 前 `git log <approved>..HEAD` 核一次。
  `backend/data/`、`backend/hymns.db`、`backend/public/` 係 gate 豁免嘅運行時檔，現時 working tree 嗰啲 `M`／`??` 唔會擋。

### D1. 內容

| 階段 | 內容 | commit |
|---|---|---|
| **① backend restart** | 2A（A-1..A-5）+ 2C（C-1..C-7）+ Stage 3 + `b0f7931` | `06d0cb8 8f56b02 5943880 c55cfa9 ebe29ba 78e7acb 77fa5ee 8d7a2d4 ab78c98 0519814 feb0060 7eab3c1 b0f7931` + Stage 3 七個 |
| **② OTA** | 2B（D-1/F-1/F-2/F-3/F-4）+ 2D（A-6 client）+ 2E（E-1..E-5） | `d51c3bc fcfb62e b9e0f64 d547279 4321f46 297bf52 8a2e729 bda9f9e d375f9a b0e3411 0875920 a829ed8 925c98f 1b66931` |

### D2. 次序

1. `approve.sh backend b0f7931 --confirm` → `backend-restart.sh --dry-run` → 真 restart。
2. **Restart 後 15 分鐘 smoke（唔過就唔好 OTA）**：
   - `curl -s localhost:3001/api/version` 對 `stat backend/hymns.db` —— C-4 首次生效會有**一次過內容跳變**（追返 10.86h），呢個係預期唔係 bug。
   - `/api/hymns?lite=1` 帶 gzip → `content-length ≈ 371,984`，第一個 hymn object **冇 `lyrics` key**（`isFull` fallback 嘅判別式靠呢點）。
   - `/api/hymns/lyrics` → 200、`≈ 992,859`。
   - `/api/hymns`（無 lite，模擬舊 client）→ 6,405 首、有 `lyrics` key。**呢條係舊 client 唔會斷嘅正控。**
   - `/api/category/mandarin`、`/api/search`、`/api/audio/*` → 410；`/api/audio/cache/stats`、`warm-stats` → 200（A-4 carve-out）。
   - `ps -o rss=` backend PID。
3. **建議（唔 block）先補兩個一行修再 OTA**：
   - `perfMarks.js:155` `slice(0, 300)` → `slice(0, 400)` —— **否則 `b0f7931` 白做**（§A4.3）。
   - `waitBeforeLyricsFetch()` 加 15s hard cap —— 堵 `runAfterInteractions` 永不 fire 嘅靜默失效（§A4.2 保留 E-5c）。
4. OTA（同一個 sha）。**記低 publish 出嘅 android／ios group id**（`ota-rollback.sh` 要用）。

### D3. 監察七項（出街後 48h）

1. **`[access]`** 三條 hymns route 嘅 `ms` / `bytes` —— 期望 **0–1ms**、gz 371,984 / 992,859 / 1,474,227。任何一條長期 >20ms = cache 冇命中。
2. **`[deprecated-route]`** 410 命中數 —— **48h 零命中先可以刪 stub 檔**。有命中 = 有我哋唔知嘅 client。
3. **`🗜️ … async compress → gz=…B br=…B`** 有冇喺每次 miss 之後 ~100–200ms 內出 —— 出唔到代表一直行 raw+middleware（C-5/C-6 收益歸零）。順手睇 CF 對 origin 送嘅 `Accept-Encoding` 有冇 `br`。
4. **`[db] stale lock`** 告警（C-6 e，>30min 每 10min 一次）。
5. **backend RSS 曲線** —— C-7 之後每晚 job 觸發 `reloadDb` 唔應該再見到 **+58MB/次**嘅階梯；見到就係 close 冇生效。
6. **client-log `perfMarks`**：`merged=1` 佔比（應該 ≈ OTA 前）、`lyricsFail`、`lyrMs`/`lyrBytes` 由 `-` 變真數（證 E-5(2) 8s 延遲之後真係 fetch 到）、`byt` 由 `3,657,732` 跌到 lite 嗰個細數（證 `?lite=1` 真係生效）、`att`/`ok1`。
7. **client-log `perfHome` `libIdle`** —— 真機應該同模擬器同級（~0.7–1.5s）；同時睇 `home` 有冇比 OTA 前差。
   ＋ 順手睇 `/api/client-log` 本身嘅量（`PERF_MARKS_ENABLED=true` 係恆常上行，收爐要關返）。

### D4. 回滾條件

**Backend（`approve.sh` 前一個 sha + `backend-restart.sh`）**：
- 任何一條 hymns route 出 5xx，或 `[access]` bytes 同上面期望值對唔上；
- RSS 反而升（C-7 令情況變差）；
- 舊 client（未 OTA 嗰啲）攞唔到 6,405 首。

**OTA（`ota-rollback.sh` + 記低嘅 group id）**：
- `n` 唔係 6,405，或 `merged=1` 佔比明顯跌穿 OTA 前；
- `home` median 惡化 >20%；
- 用戶投訴「歌詞睇唔到 / 歌詞掣灰咗」—— 呢個大機會係 §A4.2 第 3 點嗰個窗口，**8 秒延遲冇 kill switch，要出多一次 OTA 先收得返**（風險已記錄）。

⚠️ **紅線提醒**：backend 回滾之後，已經出咗街嘅新 client 會撞返 `?lite=1` 被忽略（回 full，安全）＋ `/api/hymns/lyrics` 404（`lyricsFail` → `delete allHymnsVersion` → 每次開機重試）。**功能唔會斷，但每次開機拉全量。** 即係 **backend 唔可以長期停喺舊版而 client 已 OTA**。

---

## E. 待辦清單（按優先次序）

| P | 項 | 出處 |
|---|---|---|
| **P1** | `perfMarks.js:155` `slice(0,400)` —— 唔改嘅話 `b0f7931` 完全冇作用 | §A4.3 |
| **P1** | `waitBeforeLyricsFetch()` 加 15s hard cap | §A4.2 保留 E-5c |
| **P1** | `!canSkip` 唔好用 lite 蓋咗 MMKV 舊 lyrics（2D 引入、E-5 加劇嘅「開機一段時間冇歌詞」窗口） | §A4.2 第 3 點 |
| **P2** | `useCachedHymns.js:33-36` 註解「`{once:true}` 所以唔漏」理由寫錯 | §A1.3 |
| **P2** | E-1 加 `note('bodyTimeout', 1)`，等出街之後分得到「30s body timeout」同其他失敗 | §A1.4 |
| **P2** | E-2 `task.timer = timer` 改用 effect-scope `let timer`（去 TDZ 賭博） | §A2.3 |
| **P2** | `PERF-FINAL-REPORT` 按 §C2 十五條修數 | §C |
| **P3** | 效能工程收爐之後 `PERF_MARKS_ENABLED = false` | §A3 |
