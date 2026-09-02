# PERF-BASELINE-OPUS-20260902 — Opus 5 獨立驗收

驗收者：Opus 5。對象：`PERF-BASELINE-1A-20260902.md`、`PERF-BASELINE-1B-20260902.md`，
raw `ops/perf/baseline-20260902/`。

**本次驗收冇改任何 repo source file、冇 commit、冇 restart backend、冇部署、冇掂 Cloudflare、冇開模擬器。**
所有動作只有：讀檔、`git ls-files`/`wc`/`grep`、read-only `curl` GET（localhost:3001 同 api.odemusics.com）。
`/api/category/*` **一次都冇打過**（連 1 次都冇用）。
臨時檔：`<scratchpad>/opus-spot-small.log`、`opus-spot-hymns.log`、`g.sh`。

判定準則：①數字有冇出處（指令 + timestamp + raw 檔存在且內容對得上）②方法有冇混淆變數
③「零 X」有冇 positive control ④結論有冇超出數據。

---

## 0. 總結（三句）

1. **兩份報告嘅「數字轉錄」質素高**：我逐個抽核嘅 raw 檔，表格數字**全部**同 raw 對得上，一個轉錄錯都冇。
2. **錯喺三處「衍生數字」**（唔係量出嚟、係算出嚟／抄過嚟嘅）：1B 建置時長、1A backend root script 數目/行數、1B S5 播放覆蓋秒數。
3. **兩個指標唔可以做「改前」基準**（混淆變數未拆）：backend RSS 736MB、S1 `hymnsMs` 10.3–11.6s。其餘全部可用。

---

## 1. 逐表判定

### 1A — backend / bundle / 靜態

| # | 表 / 段落 | Opus5判定 | 理由 |
|---|---|---|---|
| A1-1 | Backend endpoint 延遲/payload 主表 | **PASS（有保留）** | 指令、timestamp（07:11:14Z–07:24:23Z）、raw 齊；warm id=42 做 positive control 且講明點解要 warm；`ORDER BY RANDOM()` 五條 route 用 `*` footnote 聲明 size 不可比 —— 呢個處理正確。**保留三點**：①`1a-a1-endpoint-latency.log` **每個 request 冇 timestamp**，只有 run 頭尾兩個，令任何「呢個 endpoint 打嗰陣 process 點樣」嘅事後對照都做唔到（我要自己用 cumulative `total=` 重建時間軸先答到 §4d）；②表冇 ETag 欄——`/api/hymns` **本身有** `ETag: W/"54f49e-…"`，我實測 `If-None-Match` **即刻回 304**（見 §2），所以「除 hls 外全部冇 cache header」讀落會比事實強；③`content-encoding` / `cf-cache-status` 觀察正確且可重現。 |
| A1-2 | `/api/hymns` 欄位級 byte 拆解 | **PASS** | 逐行對 `1a-a1-hymns-column-breakdown.log`，18 個欄位、`5387/6405`、`avg 214.5`、`dataVersion` **全部一字不差**。`lyrics 1,327,724 / 5,567,646 = 23.85%` 我獨立算過 ✅。推翻 server.js「只有 ~10 首有歌詞」註解嘅結論**有數據支持，冇超出數據**。 |
| A2-1 | Process snapshot（RSS 736MB） | **有保留（數字 PASS，詮釋 FAIL）** | `1a-a2-process-snapshot.log` 逐格對：PID 14704 / RSS 753,696KB / ELAPSED 15:34:45 ✅。**但**呢個 07:14:45Z 讀數係喺 **1A 自己個 load test 開波之後 3 分 31 秒**攞嘅，嗰陣已經打咗約 35 個「每 request 重開 61MB DB」嘅 request（30 個 search + 5 個 category local）。報告寫成「backend process **現時** RSS = 736MB（uptime 15.6 小時）」——讀落係穩態屬性，實際係自己壓測期間嘅瞬態。混淆變數未聲明。詳見 §4d。 |
| A2-2 | DB 載入/查詢/序列化計時 | **PASS** | `1a-a2-dbload-timing.log` 五個 run + summary 逐個對：dbLoad 6.93/7.56/21.28、query 97.34/129.10/157.88、stringify 7.34/12.20/19.34、RSS 49.0→53.2→296.3MB、jsonBytes 5,433,117 **全中**。用 DB **複製**喺獨立 process 跑 = 好嘅隔離；「跟 server.js 完全同一條 SELECT」呢個對照設計正確。報告有講明呢個唔係 server.js 真身路徑，冇報大。 |
| A2-3 | DB 分層事實（讀 code，唔跑） | **PASS** | 明文標「唔跑」，只做 code reading，冇任何未量嘅數字被講成量過。`search.js`/`category.js` 各自 inline `queryDb()` 唔經 singleton 呢個發現 —— 我讀 code 確認成立，係本次盤點最有價值嘅結構性發現之一。 |
| A2-4 | ops-metrics 24 小時 sample | **有保留** | `bufferCache.rssKb` 29,712–366,032KB 我抽最近 8 個 bucket 覆核，量級一致 ✅。**兩個問題**：①bucket key 係**本地時**（`2026-09-02T15` = 07:00–08:00Z），但 `since` 係 UTC，報告寫「2026-08-29T16 – 2026-09-02T15」冇講呢個混用；②報告用「唔係同一個 process 生命週期」去消化 736MB vs 358MB 嘅落差 —— 但**最近約 16 小時嘅 bucket 就係同一個 PID 14704**，而佢自己 30 分鐘一 sample **從來冇見過 736MB**（我抽到嘅最近 8 格：32,048–263,056KB）。即係話呢個落差唔係「唔同 process」，係「1A 攞到嗰個係尖峰」——報告用錯理由掃走咗一個本應指向混淆變數嘅矛盾。 |
| A3-1 | Export 大細對照表 | **有保留** | `dist/` 嗰個 3,031,752 B 我今日獨立核實 ✅（`index-55278b8091c0a711d1d54174ebcc39ad.hbc`）。**但** fresh export 嘅 3,040,452 / 2,654,414 / 7,677,057 / 9,210,344 四個數，產物喺 scratchpad 已經冇咗，**冇任何 raw 檔留低**（個 `ls -la` 貼咗入報告正文，冇存檔）。違反規劃書「每個數字要有 raw log 路徑」。Release sim `main.jsbundle` 3,703,949 B 亦係引 PERF-IMPROVEMENT-PLAN，非本次產物。 |
| A3-2 | Module-size 歸因 | **PASS（示範級）** | `1a-a3-manual-module-attribution.json` 對數：`totalJsBytes=2654414`、`attributedBytes=2542693`（我算 95.79% ✅）、`appJsBytes=62278`、`srcSelfBytes=172215`、`skippedLineNotFound=0` **全中**。`source-map-explorer` 拋錯有原文引述、有排除 cache、有講明 map 本身合法；替代腳本講明用同一演算法**而且明文寫「未經第二個工具交叉驗證」**。呢段係「工具死咗點交代」嘅正確做法。 |
| A3-3 | Assets | **PASS** | 7 個檔我逐個 `stat` 獨立核實，**byte 級全中**（NotoSerifTC 9,929,552 / icon 499,869 / splash 297,750 / android-icon-foreground 297,750 / logo-ring@3x 113,594 / @2x 56,917 / Sora 46,296）。「佔 88%」算式成立。 |
| A4-1 | depcheck | **PASS** | 兩個 false positive（`expo-font` config plugin、`@expo/config-plugins` 隱式依賴）都**人手推翻咗工具**，冇照抄工具輸出。呢個係正確態度。 |
| A4-2 | 前端 unused exports | **PASS（附方法論註）** | `1a-a4-unused-exports.json` 對數：`totalExports=129`、`zeroRefCount=12`、12 個 symbol 逐個對 **全中**。正控（`resolveAudio`/`useCachedHymns`）有做。**我喺 raw 度執到一個報告冇講嘅嘢**：`sampleWithRef` 入面 `note` 嘅 `refCount=4` 包含 `./plugins/withSwiftAudioExStallWatchdog.js` —— 幾乎肯定係 word-boundary 撞中嘅假 hit。錯嘅方向係**安全**嘅（heuristic 只會**多**數 reference → 「零 ref」嗰批只會漏報唔會誤報），所以 3 個零引用嘅結論企得穩；但 raw 入面嗰啲 `refCount` 數字唔可靠，報告冇標。 |
| A4-3 | 檔案級 import 檢查 | **PASS** | 冇逐個重跑，但方法（45 檔逐個確認至少一個 importer）合理，而且**自己踢爆咗自己第一版 regex 漏咗動態 `import()`** 並寫入方法論缺口 —— 呢種自曝比結論本身更有價值。 |
| A4-4 | git tracked 備份檔 | **PASS** | 7 個檔我用 `git ls-files` + `stat` 獨立重跑，檔名同 size **byte 級全中**；`1a-a4-tracked-backups.log` 亦對得上。 |
| A4-5 | **backend root 舊 script** | **FAIL（數目 + 行數）** | 報告標題同總結寫「**11** 個舊 script（合共 **1,461** 行）」，但**佢自己張表列咗 14 行**。我 `ls backend/*.js *.cjs` + `wc -l` 獨立數：**14 個**（除 `db.js`/`server.js`）、**合共 1,561 行**。逐個檔嘅行數（125/176/41/53/132/115/199/225/94/49/80/110/50/112）**張表係啱嘅**，錯嘅係總數同總行數 —— 「11」係由 PERF-IMPROVEMENT-PLAN §1 嘅盤點抄落嚟冇覆核。**另一個未披露嘅嘢**：raw `1a-a4-backend-root-scripts.log` 入面大部分 script 其實有一行 hit，就係 `ops/perf/baseline-20260902/1a-a4-depcheck-backend.json` —— 即係掃描器**撞中咗自己嘅輸出目錄**。報告一律寫「無」（判斷正確：depcheck json 唔係真 referrer），但冇聲明過濾咗呢個自我命中，令報告同 raw 對唔上。**結論（14 個全部冇 executable 引用）仍然成立**，錯嘅淨係數字同透明度。 |
| A4-6 | backend/lib + backend/scripts 使用情況 | **PASS** | 冇獨立重跑（92 + 28 個檔成本高），但三管道（code / ops+plist+package.json / doc）嘅設計係對嘅，而且 7 個零引用逐個都有解釋（6 個一次性爬蟲 + 1 個帶日期 oneoff）。 |
| A4-7 | **4 類 route 前端呼叫盤點** | **PASS（我獨立重做並且加強咗）** | 見 §4e —— 我用另一套 pattern + 正控獨立重做，結論**完全一致**，而且我做咗一個更強嘅版本（窮舉全部 `/api/…` literal）。 |
| A4-8 | **「Backend 真實流量量度缺席聲明」** | **PASS（全份最佳段落）** | 明文拒絕將「冇 log」轉成「冇流量」；指出 `audio.js` 成功路徑**唔留痕**、`Proxying audio` 只喺 proxy mode 出、4.9 日窗口本身有邊界。呢段完全符合「零 X 要 positive control」嘅精神 —— 冇正控就唔講「零」。**Stage 2 A-4 必須尊重呢段**（見 §5）。 |
| A4-9 | 4 個 route 檔行數表 | **PASS** | 527 行合計，我覆核加數正確。 |
| Obs | 觀察 1–15 | **13 PASS / 1 有保留 / 1 FAIL** | 觀察 4（RSS 736MB）＝有保留，同 A2-1；觀察 14（11 個 / 1,461 行）＝FAIL，同 A4-5。其餘 13 條全部係事實陳述、冇越界成因果判斷。觀察 6 我覆核：App.js **4,557 行** ✅、`PlayerProvider` 421→~2938 = ~2,518 行 ✅。 |
| Gap | 「做唔到 / 有缺口」1–5 | **PASS** | 五條全部係真缺口而且寫得準，尤其第 3 條（「零引用只覆蓋呢個 client，冇排除第三方 client」）同第 4 條（log 窗口先天限制）。 |

### 1B — iOS 模擬器 runtime

| # | 表 / 段落 | Opus5判定 | 理由 |
|---|---|---|---|
| B0 | 建置 provenance | **FAIL（「Build 時長 ≈3h03m」一格）** | 其餘全部核實 ✅（HEAD `7a0a96c`、`main.jsbundle` 3,716,119 B、diffstat 6 檔 +56/-1、`git status ios/` 乾淨）。**但「3h03m」錯咗約 51 倍**，詳見 §4a。而且個 caveat（「含排隊時間，唔可以當編譯要 3 小時」）**令錯誤更難被發現** —— 佢為一個唔存在嘅現象寫咗個合理解釋，呢個係比純打錯數更嚴重嘅失效模式。 |
| B1.1 | S1 逐 run 表 | **轉錄 PASS / 詮釋有保留** | `1b-s1-run3.log` 我逐欄對：app=138 cont=201 home=261 verMs=1024 verSkip=0 hymnsMs=10269 n=6405 fetch=7(…) **全中** ✅。**保留**：`hymnsMs=10269/11626` 兩個數**本身就超過 8000ms 單次上限**，即係兩個「完成」嘅 run 其實都已經行過 timeout+retry，真正單次 fetch 只係 ~2.3–3.6s。1B 冇由自己個數推出呢點，詳見 §4c。 |
| B1.2 | S1 記憶體 | **PASS** | run2–5 對 raw 全中（327440/371472 等）。run1 讀數喺 +117s 唔係 +20s —— **主動標明並且剔出 median**，做得啱。 |
| B1.3 | S1 render 計數 | **PASS** | 5 個 run 全部對 raw ✅。`FullPlayer=0` 用做內部 positive control 而且**喺 S5 真係驗返轉頭變 4** —— 呢個係全份報告最扎實嘅一個控制設計。§1.3 嗰條因果（hymns fetch 完成 → 多 render 2 次）標明係「觀察」，而且 run 級配對（3/4 有數→render 5；1/2/5 冇數→render 3）支持得住，冇越界。 |
| B1.4 | 正控：screenshot 時序 | **PASS** | 用截圖去驗一個 mark 量緊乜 —— 方法正確。T0 反推邏輯站得住。 |
| B2 | S2 逐 run 表 + 記憶體 + render | **PASS** | `1b-s2-run1.log` 逐欄全中（109/187/17/19/181/894/963/verSkip=1/fetch=6）✅。5/5 run `n=6405` + `verSkip=1` = 好嘅內部一致性控制。**推翻咗規劃書 §1 嘅假設**（「冷開 JSON.parse 5.5MB 係樽頸」→ 實測 mmkvRead 18ms + parse 19ms）—— 呢個負面結果好有價值。⚠️小註：`Date.now()` 只有 1ms 解析度，17–19ms 呢類細數有 ±1ms 量化誤差（Stage 2 D-1 量 section 時長要改 `performance.now()`）。 |
| B3 | S3 tab 導航 | **PASS（工具有保留，已自曝）** | 5 行 `perfNav` 逐個對 `1b-s3-nav.log` 全中 ✅。`idb ui tap` 冇實時畫面，靠事後截圖 + beacon 確認 —— 已喺限制 #1/#9 自曝，而且 #9 明講咗 `tapToMount` 唔係真 native mount，唔准當「起一個 screen 要幾耐」讀。誠實。 |
| B4 | S4 記憶體 | **PASS** | 424432 / 459984 對 raw 全中 ✅。 |
| B5 | S5 播放 | **有保留（兩點）** | `nextTrackMs=205ms`（hymnId=5742, surface=shuffle, first=1）對 raw 全中 ✅，而且**揀啱咗**。**但**：①同一個 raw 檔入面，早 18 秒有另一條 `nextTrackMs`（hymnId=1821, deviceId `e1b6dc8a…`）**唔係呢部模擬器** —— 我查 `/tmp/hymn_backend.log` 見到 `e1b6dc8a…` 由 00:15Z 一路活躍到而家（93 條），另有 `df3e6a93…`（84 條），即係 1B 量度窗口內**至少 2 部其他裝置**同時寫緊同一個 client-log。1B 冇聲明過 deviceId 過濾係方法嘅一部分，而呢個正正係 repo 記錄在案嘅陷阱。②「涵蓋播放中約 **53 秒**」冇出處：由 raw 反推 T0≈07:26:36.1、tap 喺 07:26:57.2、t=60 beacon 喺 T0+60s → 4→8 呢個增量實際覆蓋 **≈39 秒**播放，唔係 53 秒。 |
| B6.1 | client 端 fetch 計數 | **PASS（示範級）** | 明文列出**唔計乜**（`<Image>` native loader、`audioPrefetch` 行 expo-file-system、TrackPlayer native 對 googlevideo）—— 呢個 scope 聲明防止咗一個好易犯嘅誤讀。 |
| B6.2 | backend log 對照 | **有保留** | 「backend 冇通用 access log」呢個發現正確、有價值（`grep morgan` 零命中我認同）。**但**「窗口內有 timestamp 嘅行 = 4（client-log×2 + stream×2）」係喺一個有 ≥2 部其他裝置寫緊嘢嘅共用 log 度數嘅，嗰 2 條 `[stream]` 歸唔歸得呢部模擬器**未確立**。結論唔受影響，計數唔可信。 |
| BI | 儀器改動清單 | **PASS** | 6 檔 +56/-1 對 `1b-00-build-provenance.log` 嘅 diffstat 全中 ✅。明文「冇掂 PlayerProvider」—— 我讀 App.js 確認 `useRenderCount` 只加咗喺 Mini(2960)/TabBar(3026)/FullPlayer(3178)/AppContent(3892)，冇一個喺 PlayerProvider 內部邏輯。守住咗紅線。 |
| BL | 限制 1–10 | **PASS（但有兩個漏）** | #2/#3/#7/#9/#10 全部係真.自捉，質素高於一般執行報告。**漏咗兩條**：①共用 client-log / deviceId 污染（見 B5）；②`Date.now()` 1ms 解析度。 |

---

## 2. Spot re-run 對數表

指令：`curl -s -o /dev/null -w 'code=… ttfb=… total=… size=…'`，每個 ×3。
Timestamp：2026-09-02T07:42:31Z – 07:43:23Z。Raw：`<scratchpad>/opus-spot-small.log`、`opus-spot-hymns.log`。
**冇打過 `/api/category/*`。**

| endpoint | target | 1A median total (s) | Opus median total (s) | 偏差 | 判定 |
|---|---|---|---|---|---|
| /api/health | local | 0.001 | 0.0017 | +70%（絕對 0.7ms） | ✅ 噪音底，唔算偏差 |
| /api/health | prod | 0.776 | 0.780 | **+0.5%** | ✅ |
| /api/version | local | 0.001 | 0.0017 | +70%（絕對 0.7ms） | ✅ 噪音底 |
| /api/version | prod | 0.772 | 0.787 | **+1.9%** | ✅ |
| /api/home/daily-verse | local | 0.001 | 0.0025 | +150%（絕對 1.5ms） | ✅ 噪音底 |
| /api/home/daily-verse | prod | 0.767 | 0.757 | **−1.3%** | ✅ |
| **/api/hymns** | **local** | **0.089** | **0.138** | **+55%** | ⚠️ **標** |
| **/api/hymns** | **prod** | **2.837** | **5.085** | **+79%** | ⚠️ **標** |
| **/api/hymns** | **prod+gzip** | **2.333** | **4.808** | **+106%** | ⚠️ **標** |
| /api/hymns size | local/prod | 5,567,646 B | 5,567,646 B | **0%** | ✅ 完全一致（DB 未變） |
| /api/hymns gzip size | prod | 1,471,654 B | 1,510,165 B | +2.6% | ✅ CF 動態壓縮正常浮動 |

**偏差判詞。** 三個 `/api/hymns` wall-clock 全部超 30%，**但唔係 1A 量錯**：
① `size` 兩邊 byte 級一致、ETag 一樣（`W/"54f49e-O/4fjB4uFrgJcgNYwNM7Fia8ABY"`），證明後端內容零改動；
② 我量嗰陣**環境唔同**：Stage 2B agent 獨佔緊模擬器做 Release build + 量度，Eric 真機 HLS QA 亦在跑（backend log 見 `e1b6dc8a…` 07:45Z 仍活躍）；backend RSS 亦由 736MB 跌返 246MB（PID 14704 未變）。
③ **Stage 2 含義（重要）**：`/api/hymns` 嘅 end-to-end 秒數喺呢部機**半個鐘內就可以差一倍**。任何「改前→改後」如果用非交錯量度，A-2 compression 嘅真實效果會俾環境噪音蓋過。**必須 interleave（A,B,A,B,…）**，或者只用穩定指標（線上 bytes、server 側 ms）落判。

**額外實測（1A 冇量、對 Stage 2 A-5 直接相關）**：
```
curl -H 'If-None-Match: W/"54f49e-…"' http://localhost:3001/api/hymns
→ HTTP/1.1 304 Not Modified   total=0.140s  size=0
```
即係 **origin 而家已經識回 304**（Express 內建 ETag）。兩個含義：
(a) A-5「保留 ETag」唔係新增能力，係已經有；真正缺嘅係**前端冇送 `If-None-Match`**（`useCachedHymns.js:24` 只係 `fetch(\`${API_BASE}/api/hymns\`)`），而呢一半**唔喺 2A 亦唔喺 2B 嘅範圍入面**。
(b) 304 依然食 **140ms server 時間** —— 因為 Express 要砌完成個 body 先計到 ETag。所以 **A-1（cache 住 stringify 完嘅 string）係 A-5 有意義嘅前置**，唔係兩件獨立嘢。

---

## 3. Raw 檔核對結果

| raw 檔 | 核對範圍 | 結果 |
|---|---|---|
| `1a-a2-dbload-timing.log` | 5 個 run 全部 3 個計時 + summary + RSS 軌跡 + jsonBytes | ✅ **全中**（6.93/7.56/21.28、97.34/129.10/157.88、7.34/12.20/19.34、49.0→53.2→296.3MB、5,433,117 B） |
| `1a-a2-process-snapshot.log` | PID/RSS/VSZ/ELAPSED | ✅ 全中（14704 / 753,696KB / 15:34:45），⚠️ 但取樣時機有混淆變數（§4d） |
| `1a-a4-unused-exports.json` | totalExports / zeroRefCount / 12 個 symbol | ✅ 全中；⚠️ raw 嘅 `sampleWithRef.note.refCount=4` 含假 hit（`plugins/withSwiftAudioExStallWatchdog.js`），報告冇標 |
| `1a-a4-backend-root-scripts.log` | 檔數 / 逐檔行數 / 引用欄 | ⚠️ **逐檔行數全中，但總數同總行數同報告對唔上**（raw+我獨立 wc = 14 檔 1,561 行；報告寫 11 檔 1,461 行）；raw 有未披露嘅自我命中行 |
| `1a-a1-hymns-column-breakdown.log` | 18 個欄位 + 5387/6405 + 214.5 + dataVersion | ✅ **全中** |
| `1a-a3-manual-module-attribution.json` | totalJsBytes / attributedBytes / appJsBytes / srcSelfBytes | ✅ 全中（2,654,414 / 2,542,693 = 95.79% / 62,278 / 172,215） |
| `1a-a4-tracked-backups.log` | 7 個檔 + size | ✅ 全中（我用 `git ls-files`+`stat` 獨立重跑） |
| `1a-a1-endpoint-latency.log` | 結構 + 我重建時間軸 | ✅ 數據齊；⚠️ 冇 per-request timestamp（見 §4d） |
| `1b-00-build-provenance.log` | HEAD / bundle size / diffstat / ios 乾淨 | ✅ 全中；❌ 但衍生嘅「build 時長」錯（§4a） |
| `1b-s1-run3.log` | 全部 9 欄 + 2 個 RSS | ✅ **全中** |
| `1b-s2-run1.log` | 全部 10 欄 + 2 個 RSS | ✅ **全中** |
| `1b-s5-playback.log` | nextTrackMs / perfRenders t=15,60 / RSS | ✅ 數字全中；⚠️ 檔內混有外部裝置 beacon；❌ 報告「53 秒」同 raw 反推嘅 ≈39 秒對唔上 |
| `1b-s3-nav.log` / `1b-s4-memory.log` | 全部 | ✅ 全中（額外核對，非指定） |
| `1b-xcodebuild-tail200.log` | `BUILD SUCCEEDED` + 時間戳 | ✅ 存在（L199 / L157 `15:16:36`）；用嚟拆穿 §4a |

**轉錄準確度結論：我抽核嘅每一個表格數字都同 raw 對得上，零轉錄錯誤。** 三個錯全部係「衍生／抄襲」數字。

---

## 4. 4a–4f 逐點判詞

### 4a. 1B §0「Build 時長 ≈3h03m」 —— **FAIL，Fable 5.1 嘅懷疑成立**

證據：
- `1b-00-build-provenance.log`：`Build started: 2026-09-02T07:13:03Z (host UTC)`
- 同檔：`Build finished (approx, log line): 2026-09-02 15:16:36 local`
- `1b-xcodebuild-tail200.log:157`：`2026-09-02 15:16:36.663 appintentsmetadataprocessor[88940:…]`（`BUILD SUCCEEDED` 喺 L199）
- 本機時區：`date` → `Wed Sep  2 15:44:22 HKT 2026` / `date -u` → `07:44:22 UTC` ⇒ **HKT = UTC+8**
- 同檔交叉印證：`HEAD date: 2026-09-02 14:04:31 +0800`

∴ 15:16:36 HKT = **07:16:36Z**。07:16:36Z − 07:13:03Z = **3 分 33 秒**。

**判詞。** 報告攞 UTC 開始時間減本地完成時間，**8 個鐘嘅時區差被當成 build 時間**。實際 ≈3m33s，同 Stage 2 執行單 §2B 講嘅「每輪 Release build 一次（約 4 分鐘）」完全吻合 —— 即係另一份文件其實已經有反證，冇人對過數。

**加重情節**：報告冇淨係報個錯數，仲**替佢寫咗個合理化解釋**（「含等其他 session 用緊 CPU/CI 的排隊時間，唔係純編譯時間」）。呢個令錯誤睇落好似已經被審視過，反而降低咗被質疑嘅機會。**呢個係比打錯數更值得記入方法論嘅失效模式：唔好為一個未核實嘅異常數字預先寫解釋。**

**影響範圍**：純 provenance，不影響任何量度結論。**要改。**

### 4b. S1 `home` mark 量緊 spinner —— **1B 嘅「限制」寫法夠誠實（PASS）；但仲有一個佢冇捉到嘅結構性後果**

我讀咗 `src/components/home/HomeScreen.js`：
```
252  React.useEffect(() => {
253    requestAnimationFrame(() => { requestAnimationFrame(() => { mark('home'); }); });
254  }, []);
256  if (!hasData) { if (loading) { return (<View …><ActivityIndicator …/></View>); } … }
```
`mark('home')` 喺 **`[]` deps 嘅 mount effect**，早過 early return，所以：
- S1（冇 cache）：首次 mount 時 `hasData=false` → 畫 spinner → `home` 記住嘅係 **spinner 出現**。
- S2（有 cache）：`cacheReady` 喺 mount 之前已經 setState → 首次 mount `hasData=true` → `home` 記住嘅係 **真內容出現**。

**判詞（誠實度）：PASS，而且係好樣本。** 限制 #2 嘅措辭「呢點令 S1 同 S2 嘅 `home` 數字**唔可以直接比大小**當『首屏耗時』」精準、無迴避，仲用咗 §1.4 嘅截圖（T0+648ms 見到 spinner）做旁證去確認個 mark 真係對應 spinner。執行單 §1 B2 亦如實寫成「首頁有內容 mount 938ms **vs** spinner 261ms」，冇偷偷相減。

**但 1B 冇講出嚟嘅結構性後果**：因為 deps 係 `[]`，**S1 根本冇任何儀器可以量到「冷開第一次見到真內容」**。呢個窿唔係「兩個數唔可比」咁簡單，係「冷開首屏呢件事完全冇 instrument」。而執行單 B1 就用咗 `hymnsMs` 10.3–11.6s 做冷開首屏嘅代理數 —— 而嗰個數本身又有問題（§4c）。

**建議 Stage 2 用邊個 mark 做「首屏有內容」**：
1. 新增一個獨立 mark（**唔好改 `home` 嘅語義**，否則 baseline 對唔返）：
   ```js
   const contentMarked = React.useRef(false);
   React.useEffect(() => {
     if (!hasData || contentMarked.current) return;
     contentMarked.current = true;
     requestAnimationFrame(() => requestAnimationFrame(() => mark('homeContent')));
   }, [hasData]);
   ```
2. `home` 保持原樣 = 「HomeScreen 第一幀（任何狀態）」；`homeContent` = 「首次畫到真內容」。**S1/S2 就可以用 `homeContent` 直接比**，而 `home` 仍然同 baseline 可比。
3. 正控：S2 應該見到 `homeContent ≈ home`（±一兩幀）；S1 應該見到 `homeContent >> home`。**呢兩個關係同時成立先算個 mark 啱**。
4. F-3 嘅改前→改後**必須用 `homeContent`**，唔可以用 `home`（S2 warm 場景兩者相若，但 F-4 一旦改咗 mount 時序，`home` 嘅語義會再飄一次）。

### 4c. S1 `hymnsMs` 只有 2/5 有數 —— **主因唔係「15 秒窗口太短」，係「8s timeout 喺 5/5 run 都射咗」**

讀碼（`src/hooks/useCachedHymns.js`）：
- L12 `fetchWithTimeout(url, ms = 8000)` — `AbortController`，8s **硬 abort**。
- L38–42 `fetchAllHymnsWithRetry()`：第一次 `fetchAllHymns()`，`hymns.length > 0` 就 return，否則**再試一次**。abort → catch → `return { hymns: [] }` → 一定會 retry。
- L143–145 `mark('hymnsStart')` … `await fetchAllHymnsWithRetry()` … `mark('hymnsEnd')` ⇒ **`hymnsMs` 係「兩次嘗試加埋」，唔係一次 fetch**。

讀碼（`src/perfMarks.js`）：
- L23 `const T0 = Date.now()`（index.js 第一行 import）
- L185 `}, 15000)` — perfMarks beacon 喺 **T0+15s** 射。
- `mark()` 用 `Date.now()`（1ms 解析度）。

**算術（呢度係關鍵）**：run3 `hymnsMs=10269`、run4 `hymnsMs=11626`。**兩個都 > 8000ms 嘅單次上限。**
∴ 兩個「成功」嘅 run **都已經係「第一次 abort 咗 8000ms + 第二次成功用咗 2269 / 3626ms」**。

∴ 三個結論：
1. **第一次嘗試喺 5/5 run 全部撞爆 8s** —— 唔係「有時慢」，係 100%。1B 手上已經有足夠數據推到呢點，但冇推。
2. **真正單次 `/api/hymns` fetch ≈ 2.3–3.6s**，同我 spot re-run 量到嘅 prod `/api/hymns` total（4.7–5.3s，1A 量 2.5–3.0s）同一量級 —— 互相印證。
3. 有效預算唔係 15s：`hymnsStart` 喺 `verMs`（875–1159ms）之後先開始，run3 大約 T0+1.3s ⇒ **實際得 ~13.7s**。理論最差 16s > 13.7s，所以 retry 都慢嗰陣一定截頓。

**判詞：兩者都係因，但層次唔同。**
- 「15s 窗口太短」係 `-` 出現嘅**近因**（proximate）。1B 限制 #3 講咗呢層，冇錯。
- 「8s timeout 低於實際分佈」係**根因**（root）。1B **冇由自己個數推到呢層**，而呢層先係 Stage 2 要動嘅嘢。

**兩個必須修正嘅下游講法**：
- 執行單 §1 **B1「全量 /api/hymns 喺模擬器 10.3–11.6s」講法要改** —— 10.3–11.6s **唔係** fetch 時間，係「8s 白燒 + 真 fetch」。照呢個數去估 compression 效益會嚴重高估（compression 慳嘅係嗰 2.3–3.6s 嗰半，唔係 10.3s）。
- 執行單 F-1（8s→30s）**方向啱但唔可以照做**：淨係加大 timeout，最壞情況（真斷網）會由「8+8=16s 先見到『網絡好似斷咗』」變成「30+30=60s」，UX 反而衰咗。**必須先用 D-1 拆開第一次 vs 第二次嘗試**（`hymnsTtfb`/`hymnsBody`/`hymnsParse` 要**逐次嘗試**各記一份，而唔係包住 `fetchAllHymnsWithRetry`），答到「點解第一次要 >8s 而第二次得 2–3s」（候選：冷 TLS/QUIC 經 tunnel、同開機另外 3 個 fetch + 2 個 stream 爭上行、memory 記錄嘅 0.65MB/s 上行天花）先決定係加 timeout 定係其他修法。
- Beacon 窗口亦要由 15s 加到 ≥25s，否則改完仍然量唔到。

### 4d. 1A A2「backend RSS 736MB」 —— **推論唔成立（時間對唔上）；1A 本身冇作呢個推論，作咗嘅係執行單 B6**

我先分清楚邊個講咗乜：
- **1A 報告本身**：只寫「backend process **現時** RSS = 736MB（uptime 15.6 小時）」（觀察 4）。**冇歸因俾自己個 curl。**
- **`PERF-STAGE2-EXEC-20260902.md` §1 B6**：「1A curl **5 次**令 backend RSS **360→736MB**（之後 GC 返 94MB）」。**呢個因果係執行單度加嘅。**

**時間軸重建**（`1a-a1-endpoint-latency.log` 冇 per-request timestamp，我用逐個 `total=` 累加重建；累加 782.5s vs 實際 wall-clock 789s，**只差 6.5s，重建可信**）：

| 區段 | 重建時間（UTC） |
|---|---|
| run 開始 | 07:11:14 |
| search-zh + search-en（**30 個 request，每個重開 61MB DB**） | 07:13:28 – 07:14:04 |
| **category-mandarin local ×5** | **07:14:04 – 07:14:18** |
| **category-mandarin prod ×5** | **07:14:18 – 07:16:26** |
| ← **`ps` RSS 快照 = 07:14:45Z** | ← 喺 category prod 第 1–2 個 request 期間 |
| category-mandarin prod_gzip ×5 | 07:16:26 – 07:20:08 |
| category-cantonese（3 個 target ×5） | 07:20:08 – 07:23:57 |
| run 結束 | 07:24:23 |

**判詞（分三層）：**

1. **「5 次 category curl 令 RSS 升到 736MB」——證據鏈斷。** 快照喺 07:14:45Z 攞，嗰陣 category 只行咗 **5 個 local + 約 1–2 個 prod**；**30 個 category request 之中有 25 個（包括全部 gzip 嗰啲）係喺快照之後先發生**。時間上唔可能係佢哋造成 736MB。

2. **但「1A 自己個壓測係主因」呢個更闊嘅講法——成立，而且更有力。** 快照嗰刻 backend 已經食咗 **約 35–37 個「每 request `fs.readFileSync` 61MB + `initSqlJs()` + `new SQL.Database()`」嘅 request**，其中 **30 個係 `/api/search`**（唔係 category）。真兇主要係 `routes/search.js`，唔係 `routes/category.js`。旁證：`1a-a2-dbload-timing.log` 顯示**單一 node process 跑 5 輪同類操作，RSS 就由 49MB 升到 296MB 而且唔釋放** —— 35 個 request 去到 736MB 完全合理。

3. **「360MB」同「94MB」兩個數，兩份 baseline 報告都冇。** 「360MB」出自 PERF-IMPROVEMENT-PLAN §1（Fable 5.1 09:50–10:10 親手量，冇 raw 檔）；「94MB @15:37」喺 `ops/perf/baseline-20260902/` 完全搵唔到出處。∴ **B6 嗰句係由三個唔同時間、唔同人、其中兩個冇 raw 嘅數字砌出嚟嘅因果句**，唔符合「每個數字要 timestamp + raw 檔」。

4. **反證（我今日獨立攞）**：
   - `ps -p 14704` @07:45:44Z（**同一個 PID，冇重啟**）：RSS = **252,064KB ≈ 246MB**，uptime 16:05:44。
   - `backend/logs/metrics/ops-metrics.json` 最近 8 個 hourly bucket（同一個 PID 覆蓋）：`rssKb` = 157,360 / 263,056 / 234,592 / 117,968 / 172,784 / 187,456 / 179,008 / 32,048 —— **同一個 process 自己 30 分鐘一 sample，由頭到尾冇一次見過 736MB**。
   ⇒ 736MB 係尖峰，唔係穩態。1A 用「唔係同一個 process 生命週期」去解釋落差 —— **呢個解釋唔啱**，最近約 16 小時就係同一個 PID。

**結論：**
- 1A 報告本身 = **有保留**（數字啱、取樣時機有未聲明嘅混淆變數、用錯理由消化咗一個本應報警嘅矛盾）。
- 執行單 B6 嗰句因果 = **要改**。可以保留嘅事實版本：「`/api/search` 同 `/api/category` 每個 request 都重開 61MB DB 且唔快取；獨立 harness 證實 5 輪同類操作令 node RSS 由 49MB 升至 296MB 且唔釋放；1A 壓測期間（約 35 個此類 request 之後）實測 backend RSS 到 736MB，同期同一 process 嘅 30 分鐘 sample 從未超過 ~360MB。」
- **Stage 2 A-4 唔可以將「慳返 400MB RSS」當成交付成果去量**（因果未確立）。可以量嘅係：`/api/category/mandarin` 改前 35MB/秒級 → 改後 410/ms 級（呢個係直接因果），同埋「打 N 次之後 RSS 前後對比」**但要交錯做、同一個 N、同一段時間**。

### 4e. 1A A4「9 條前端零引用」 —— **獨立重做，結論 PASS，而且我做到一個更強嘅版本**

**先講一個我自己撞到嘅陷阱（值得入方法論）**：我第一次用
`grep -rn $FE_INC $EXCL -F "$p" .`（變數未 quote），**zsh 唔會做 word splitting**，`--include=*.js` 直接俾 glob 展開 → `no matches found` → grep 冇行到 → **所有 pattern（連正控 `api/hymns`）都回 0**。
**如果我冇做正控，我就會「證實」咗全部 route 零引用，包括明明用緊嘅 `/api/hymns`。** 呢個係「正控唔係儀式，係唯一擋得住 silent-zero 嘅嘢」嘅活教材。改用 bash script + quoted `--include` 之後正常。

**正控（全部非零 = grep 有效）**：

| pattern | hits |
|---|---|
| `API_BASE` | 63 |
| `api/version` | 15 |
| `api/hymns` | 14 |
| `api/stream` | 11 |
| `api/client-log` | 7 |
| `resolveAudio` | 3 |
| `api/home` | 1 |
| `daily-verse` | 1 |

**目標 pattern（範圍：`frontend/hymn-app/**`，`*.js/jsx/ts/tsx/json`，排除 node_modules/dist/ios/android/.expo）**：

| pattern | hits |
|---|---|
| `api/search` | **0** |
| `api/category` | **0** |
| `api/audio` | **0** |
| `fetchAudioUrl` | **0** |
| `search/all` | **0** |
| `daily-quote` / `featured-artist` / `new-releases` / `genre-recommendation` / `based-on-taste` / `resonating` / `top-verses` / `folk-sharing` / `combined-charts` | **各 0** |

**我加咗一個 1A 冇做、但更強嘅檢查 —— 窮舉法。** 與其逐條 pattern 問「有冇」（開放式論證，永遠可能漏 pattern），不如**列晒**前端 live source 入面每一個 `/api/…` literal，再睇邊啲 route 出現過。全部 41 個 distinct literal：

```
/api/version(15) /api/hymns(12) /api/client-log(7) /api/stream/(6) /api/app-version(6)
/api/stream/:id(3) /api/me/sync(3) /api/me/playlists/(3) /api/friends/(3) /api/admin/hymns/(3)
/api/p/(2) /api/me/invites(2) /api/me/favorites/(2) /api/auth/otp/status(2)
/api/stream/warm /api/stream/:id.m3u8 /api/me/data /api/me/ /api/invites/redeem
/api/hymns/:id /api/hymns/ /api/home /api/hls/:id.m3u8 /api/health
/api/friends/request /api/friends/lookup /api/friends/:userId/shares /api/friends
/api/auth/reset-password /api/auth/register-phone /api/auth/register
/api/auth/otp/verify-ticket /api/auth/otp/request /api/auth/me
/api/auth/login-phone /api/auth/login /api/auth/invite-check
/api/admin/hymns/preview /api/admin/hymns/:id /api/admin/hymns
/api/admin/activity/delisted /api/admin/activity/added
```
**`search` / `category` / `audio` 一個都冇出現過。** `/api/home` 只出現 1 次（`src/services/homeApi.js`，即 `daily-verse` 嗰條）。

再查模板字串／動態組路徑（`${VAR}/…` 全掃）：40 個命中全部係 `${API_BASE}/api/{stream,client-log,hymns,health,app-version,friends,me,invites,admin,auth,version}` 或者 `${youtubeId}/mqdefault.jpg` 類 —— **冇一個組得出 search/category/audio**。

**判詞：PASS，1A 嘅結論成立，而且我嘅窮舉版把論證由「開放」變成「封閉」**（唔係「我搵唔到」，係「全部 literal 列晒喺度，冇呢三個」）。

**⚠️ 但 1A 嗰個限制照舊有效，Stage 2 必須尊重**：呢個結論只覆蓋 **`frontend/hymn-app` 呢一個 client**。冇排除舊版 app（`/api/version` 唔會強制升級）、外部 client、或者第三方。而 1A 自己講得好清楚：呢三條 route **一行 log 都冇**，所以「冇人打過」**量唔到**。→ 見 §5 對 A-3/A-4 次序嘅意見。

### 4f. 1B render 計數「播歌後六個 component 同步 4→8」 —— **機制真實存在，但 1B 嘅數據分辨唔到係咪佢；F-2 嘅預期效益遠細過表面**

**先分清楚邊個講咗乜**：1B §5 **只列數字**（`Home=8 … FullPlayer=4 AppContent=8`）同 `FullPlayer` 嘅正控，**冇提出過「context value 每次新建 object」呢個解釋**。個解釋喺**執行單 F-2**。所以 1B 冇越界（PASS），要判嘅係 F-2 個理據。

**我讀 App.js 確認嘅事實**：
- `App.js:2873`：`<PlayerCtx.Provider value={{ … }}>` —— **inline object literal，約 30 個 entry**。∴ `PlayerProvider` 每 render 一次，context value 嘅 identity **必定變**，全部 `useContext` 消費者**必定** re-render。**機制成立，唔駁得。**
- `usePlayer()` 嘅 call site（`App.js` 內 4 個消費者）：`2961` MiniPlayer、`3153`/`3182` FullScreenPlayerOverlay 相關、**`3898` 喺 `AppContent`（`3891` 開始）**。
- `grep -rn usePlayer src/` = **0** ⇒ **HomeScreen / LibraryScreen / MineScreen 完全唔係 context 消費者**。
- 佢哋喺 `AppContent` 嘅 JSX 度 inline render（`4277`/`4282`/`4285`），`TabBar` 喺 `4316`，`MiniPlayer` 喺 `4262` 同 `TabBar` 內部 `3031`。

**∴ 真正嘅因果鏈係**：
```
PlayerProvider re-render → value identity 變 → AppContent（消費者）re-render
                                             → Home / Library / Mine / TabBar / Mini（純子節點，冇 memo）全部跟住 re-render
```
六個數字**永遠鎖死一齊郁**係呢個樹狀結構嘅必然結果 —— 呢點解釋咗**「點解同步」**。

**但解釋唔到「點解係呢個原因而唔係另一個」。** 至少三個候選都會產生一模一樣嘅 4→8：
- (i) `PlayerProvider` re-render 咗 4 次（F-2 假設）；
- (ii) `AppContent` 自己嘅 state 變咗 4 次（佢有自己嘅 `activeTab` 等 state）；
- (iii) 上游任何一個 Provider（`AuthProvider`/`FavoritesProvider`/`PlaylistsProvider`/`AddToPlaylistProvider`，`App.js:4535` 全部包住）re-render。

**1B 嘅數據分辨唔到呢三個，因為 `PlayerProvider` 本身冇 render counter**（執行單禁止掂 PlayerProvider 內部，1B 守咗，冇錯）。

**`progressStore` 可以排除**（Fable 問題入面提到嘅候選）：`App.js:3148` 註解明講嗰啲每秒變嘅細 component「自己訂閱 progressStore（**唔經 PlayerCtx**）」，`App.js:3299` 更加寫住「**PlayerCtx 唔准加每秒變嘅嘢**」。如果 progressStore 有份，60 秒播放應該見到幾十次 render 而唔係 4 次。**4 次呢個量級本身就係反證。**

**F-2 預期效益嘅冷水（呢點最重要）**：
個 `value` object 列咗差唔多**全部** `PlayerProvider` 嘅 state（`isPlaying`、`queue`、`currentQueueIndex`、`overlayExpanded`、`queueReady`、`isLoading`、`repeatMode`、`isShuffled`、`hymn`、`hymns`…）。
⇒ 大部分令 `PlayerProvider` re-render 嘅事件，**同時就係 `useMemo` 嘅 dep 變化** ⇒ memo 照樣出新 object ⇒ 消費者照樣 re-render ⇒ **淨賺 0**。

`useMemo` **真正贏到嘅**，係「`PlayerProvider` re-render 但冇一個 dep 變」嗰啲。我睇到兩個具體嘅：
- **`noticeText`**（`App.js:2907` 附近用）—— `PlayerProvider` 嘅 state，**唔喺 value 入面**；
- **`slowLoadNotice`**（`App.js:2918` 附近用）—— 同上。
呢兩個一變，今日**成個 app 樹都 re-render**，加咗 `useMemo` 之後就唔會。**呢個係真收益，但範圍窄**（只喺載入提示出現/消失嗰陣）。

**判詞：**
- 1B §5 = **PASS**（只報數 + 有正控，冇作因果）。
- 執行單 F-2 嘅理據 = **證據不足，唔可以盲做**。
- **建議**：F-2 **降級做 D-1 嘅一部分**（診斷先）。喺 `PlayerProvider` **第一行**加 `useRenderCount('PlayerProvider')` —— 呢個係**純讀計數器，唔掂任何起播/stall/nudge/watchdog 邏輯**，我認為符合紅線精神，但要 Fable 5.1 明文批（執行單現行寫法只准掂 `<PlayerCtx.Provider value>` 嗰行）。攞到「PlayerProvider render 次數 vs AppContent render 次數」之後：
  - 兩個數一樣 ⇒ (i) 成立 ⇒ 做 F-2（但預期收益仍然細，見上）；
  - `AppContent` > `PlayerProvider` ⇒ (ii) 成立 ⇒ **F-2 白做**，應該轉去 `React.memo` 包住 Home/Library/Mine（呢個先係真正切斷傳播嘅位）。
- 無論邊個結果，**「六個 component 由 4 變 8」本身唔係一個效能問題嘅證據** —— 60 秒播放期間多 4 次 render，冇任何 frame-drop / jank / 耗時數據支持佢係樽頸。**Stage 2 唔應該將呢項排喺前面。**

---

## 5. Stage 2 次序意見（只講理據，唔改執行單）

### 5.1 按「baseline 證據強度」排（強→弱）

| 項 | 證據強度 | 理據 |
|---|---|---|
| **A-2** compression | 🟩 **最強** | 5.57MB vs gzip ~1.5MB，1A 同我今日各量一次、byte 級可重現；origin 冇 compression 呢點由 header 直接證實（唔帶 `Accept-Encoding` 就冇 `content-encoding`）。因果單一，零推論。 |
| **A-1** `/api/hymns` response cache | 🟩 強 | server 側 SELECT+getAsObject 97–158ms/req 有隔離 harness 實測；我今日再證 **304 都要 140ms**（Express 砌完 body 先計 ETag）⇒ A-1 係 A-5 有意義嘅前置。 |
| **A-3** access log | 🟩 強（但係診斷唔係優化） | 1A/1B **兩份獨立**都撞到同一個窿（1A：三個 route 檔零 `console.*`；1B §6.2：開機 4 個 request 一行 log 都冇）。呢個係「量度能力」缺口，**唔係效能改善**，但佢係 A-4 嘅前置。 |
| **F-3** 首頁 warm mount 938ms | 🟨 中 | 數字扎實（5/5 run 894–1035ms，變異細）**但完全未拆解** —— 唔知幾多係 section compute、幾多係 ScrollView 首幀 + N 張封面圖。D-1 嘅 `span()` 係啱嘅前置。⚠️`span` 係 1A 揾到嘅零引用 export，D-1 會係佢第一次真跑，本身未驗過。 |
| **A-4** 9 條 route → 410 | 🟨 中（前端側鐵證，後端側盲） | 「前端零引用」我獨立窮舉重做，**封閉論證，鐵**。但「冇任何 client 打緊」**結構上量唔到**（1A 自己講咗）。呢個唔係證據弱，係**風險未量**。 |
| **F-1** timeout 8s→30s | 🟨 中（方向啱，數字被誤讀） | §4c 證明第一次嘗試 **5/5 run 都撞爆 8s**，動機成立。但 baseline 嗰個「10.3–11.6s」係複合數，**唔可以做改前基準**，而且淨加 timeout 會令真斷網嘅 UX 由 16s 變 60s。 |
| **A-5** Cache-Control | 🟥 弱（不如講係範圍錯） | ETag/304 origin 側**已經 work**；真正缺嘅係 client 冇送 `If-None-Match` —— 而呢一半 2A/2B 都冇覆蓋。照執行單做等於改幾個 header 然後量到零變化。 |
| **F-4** Library/Mine lazy mount | 🟥 弱 | **完全冇 baseline 數字**。S3 量嘅係「已 mount 嘅 tab 切換」（限制 #9 自己講咗），唔係「開機 mount 兩個隱藏 tab 要幾耐」。執行單已經內建咗「<50ms 就唔做」嘅閘，但個閘要 D-1 先開得。 |
| **F-2** PlayerCtx useMemo | 🟥 **最弱** | 見 §4f：機制真、但數據分辨唔到係咪佢；而且就算係，因為 value 涵蓋咗差唔多全部 state，`useMemo` 大部分情況冇效。**而且冇任何數據顯示「多 4 次 render」造成過任何可觀察嘅問題。** |

### 5.2 邊項應該先做診斷

1. **F-2 → 全轉診斷。** 唔加 `PlayerProvider` 自己嘅 render counter 就做 `useMemo`，係喺一個未定位嘅問題上落一個未必有效嘅藥。要 Fable 5.1 拍板准唔准喺 `PlayerProvider` 第一行加純讀 counter。
2. **F-4 → 診斷先（執行單已經內建，只要確保 D-1 真係產出呢個數）。**
3. **F-1 → 診斷要重新設計。** D-1 現行寫法（`hymnsTtfb`/`hymnsBody`/`hymnsParse`）如果包住 `fetchAllHymnsWithRetry`，會**再一次**造出複合數。必須**逐次嘗試各記一份**（attempt1 / attempt2），並且**同時把 beacon 窗口由 15s 加到 ≥25s**，否則慢嘅 run 又係 `-`。
4. **A-4 → A-3 要先出街兼且真係跑過一日。** 呢個係我最強嘅次序意見：`/api/search` `/api/category` **今日冇任何 log**，改成 410 之後如果真係有未知 client，**冇人知**（410 加 `[deprecated-route]` log 係改完先有 log，等於「先開槍後裝瞄準器」）。正確次序：**A-3 落 access log → 跨越 Eric 一日真機 QA → 睇實測流量 → 先 A-4**。執行單將 A-3/A-4 平排，我建議明文加依賴。
5. **A-6 唔好喺 A-2 之前估。** lyrics 佔 23.85% 係**未壓縮**嘅比例；文字壓縮率高，A-2 之後 lyrics 喺 gzip payload 入面嘅佔比會**細過** 23.85%。A-6 嘅估算要**喺 A-2 落咗之後重新量**先有意義。

### 5.3 建議次序

```
A-2  →  A-1  →  A-3  →  D-1（重新設計 F-1/F-2/F-4 三個診斷）
                          ↓
              F-1（按 D-1 結果重新定義修法）  →  F-3
                          ↓
        A-3 跑滿一日真流量  →  A-4        F-2 / F-4：只喺 D-1 證明得到先做
                          ↓
                    A-5（連前端 If-None-Match 一齊，否則跳過）
                          ↓
                    A-6（喺 A-2 之後重新估算）
```

### 5.4 一條跨項目嘅量度紀律（強烈建議寫入執行單 §0）

我 spot re-run 顯示 `/api/hymns` 嘅 end-to-end 秒數，喺**同一部機、半個鐘之內、後端零改動**嘅前提下，比 1A 慢咗 **55–106%**（2B 模擬器 build + Eric 真機 QA 同時食緊上行同 CPU）。
⇒ **任何「改前→改後」嘅 wall-clock 對比，如果唔係交錯（A,B,A,B,…）量，effect size 會俾環境噪音完全蓋過。**
⇒ 穩定嘅指標：**線上 bytes**（`size_download`）、**server 側 ms**（隔離 harness）、**render 次數**、**mark 之間嘅相對差**。
⇒ 唔穩定：prod total 秒數、模擬器 RSS、開機端到端秒數。呢啲要交錯量 + 報 min/median/max + 記低同期有冇其他 session 佔緊資源。

---

## 6. 總判定 —— baseline 可唔可以做「改前」基準？

### **可以，但要先落三個更正，並且排除兩個指標。**

**必須更正（唔改就會污染 Stage 2 嘅對比）**

| # | 位置 | 現寫 | 應為 |
|---|---|---|---|
| 1 | 1B §0 | Build 時長 ≈ **3h03m** | **≈ 3m33s**（07:13:03Z → 07:16:36Z；15:16:36 係 HKT=UTC+8）。連埋嗰個「排隊時間」嘅解釋一齊刪。 |
| 2 | 1A A4 + 觀察 14 | backend root **11** 個舊 script，合共 **1,461** 行 | **14** 個，合共 **1,561** 行（張表本身係啱嘅；總數係由 PERF-IMPROVEMENT-PLAN §1 抄落嚟冇覆核） |
| 3 | 1B §5 | perfRenders t=60「涵蓋播放中約 **53 秒**」 | **≈39 秒**（T0≈07:26:36.1、tap 07:26:57.2、t=60 beacon 喺 T0+60s） |

**必須排除（唔可以做改前基準）**

| # | 指標 | 點解 |
|---|---|---|
| A | backend RSS **736MB** | 喺 1A 自己壓測開波後 3m31s、約 35 個「重開 61MB DB」request 之後攞；同一個 PID 嘅 30 分鐘 sample 從未超過 ~360MB；我今日同一 PID 量到 246MB。**係尖峰唔係穩態。**（§4d） |
| B | S1 `hymnsMs` **10.3–11.6s** 當「`/api/hymns` fetch 時間」 | 實際係「8000ms timeout 白燒 + 真 fetch 2.3–3.6s」。當 fetch 時間讀會嚴重高估 compression 效益、亦會掩蓋「第一次嘗試 100% 撞爆 8s」呢個真問題。（§4c） |

**建議補做（唔補唔算 baseline 缺陷，但補咗 Stage 2 會準好多）**

- 1B 補一條限制：**共用 client-log / deviceId 污染**（量度窗口內至少 2 部其他裝置活躍：`e1b6dc8a…` 93 條、`df3e6a93…` 84 條），並明文寫「本報告所有 beacon 已按 deviceId 過濾」。§6.2 嗰個「4 行」計數要標明未按 device 歸因。
- 1B 補一條限制：`Date.now()` 1ms 解析度；D-1 量 section 時長改用 `performance.now()`。
- 1A A3 export 大細補 raw（`ls -la` 存檔），或者明文標「產物已刪、不可覆核」。
- 1A A4 unused-exports 補一句：heuristic 只會**多**數 reference（raw 嘅 `note.refCount=4` 含假 hit），所以零引用清單係保守嘅。

**可以直接當基準用嘅（我核對過、可重現）**

`/api/hymns` payload 5,567,646 B ／ gzip ~1.47–1.51MB ／ 18 個欄位 byte 拆解（lyrics 23.85%、5,387/6,405 有詞）／ 全部 prod 地板延遲 ~0.75–0.78s ／ server 側 DB load 7ms・query 97–158ms・stringify 7–19ms ／ bundle 2,654,414 B 及 module/package 歸因 ／ 全部 asset 大細 ／ tracked 備份檔 7 個 ／ 14 個 backend root script 逐檔行數 ／ 前端零引用 route 清單（我獨立窮舉確認）／ S2 熱開全部 mark（mmkvRead 18ms・parse 19ms・cacheReady 211ms・home 938ms）／ 全部 render 計數 ／ S3 導航 39–114ms ／ 全部 RSS 讀數（作為模擬器數字，非 backend）。

**最後一句評語。** 兩位執行者都守住咗「唔判 PASS/FAIL」同「零 X 要正控」呢兩條，1A 嘅「量度缺席聲明」同 1B 嘅 `FullPlayer` 正控 + 截圖驗 mark，質素高過一般驗收所見。三個錯**全部係「衍生數字」**（時區相減、抄上游盤點、心算秒數）——**冇一個係量錯**。呢個 pattern 值得入方法論：**量出嚟嘅數要 raw 檔；算出嚟嘅數要第二個人重算。**

---
## Fable 5.1 附註（2026-09-02 16:40）：§4c 判詞被 Stage 2B 實測推翻
- 舊碼 `fetchWithTimeout` 只 `await fetch()`，headers 一到即 resolve 並 `clearTimeout`；`r.json()` 喺 timer 清咗之後先讀 body（Expo SDK 53+ 嘅 winter fetch 係 streaming，fetch 喺 headers 到就 resolve）。**即係 8s timer 從來冇 abort 過 body 下載。**
- 決定性證據：baseline S1 run3/run4 嘅 beacon `fetch=` 計數係 `api/hymns:1`（單次），如果曾 abort+retry 應為 `:2`。D-1 拆時亦見 ttfb ~520ms、body 3–9s、parse 25ms。
- ∴ baseline 10.3/11.6s 係**真·單次 fetch 時間**（當時網絡），run1/2/5 嘅 `-` 係 body 下載超過 ~13.7s 未完成；「第一次嘗試 5/5 撞 timeout」唔成立；1B 原文「15s 窗口太短」係啱嘅近因。
- F-1 嘅真身係「第一次幫 body 加返 30s 逾時保護」（安全性修正），唔係提速；提速靠 A-2 origin gzip + A-6 lite（減 wire bytes）。
- §4c 對 F-1 設計嘅建議（唔好淨係加大 timeout、要拆 attempt 記錄）仍然有價值，已執行。
