# Batch D 執行紀錄(2026-08-23 早上)

**來源**:`THIRD-PASS-REVIEW-20260822.md` §5 Batch D,Eric 2026-08-23 拍板三件。
**commit**:`8dac308`(backend restart 已經過 deploy gate,09:33)。
**紅線**:D-2/D-4 **淨係加 log/計數器**,`CACHE_SIZE_CEILING` 同三招 resolve 策略
一個數都冇郁;D-3 係開一個 2026-07-21 已經寫好、一直 `false` 嘅開關。

---

## D-3 — `THROTTLE_FOR_LISTENERS` 開咗

| | |
|---|---|
| 檔案 | `backend/scripts/growLibrary.js:111`(原本 106) |
| 改動 | `const THROTTLE_FOR_LISTENERS = false;` → `true` |
| 要唔要 restart backend | **唔使**。growLibrary 係 launchd 每 900 秒開一個**新 node process**,下一個 tick 就係新碼。佢問嘅 `/api/internal/activity` 喺跑緊嗰個 backend 本來已經 live(restart 之前實測 `{"streaming":false}`)。 |

### 驗證(唔止改個 flag)

| # | 場景 | 做法 | 結果 |
|---|---|---|---|
| 1 | 有人聽緊歌 → 讓路 | `curl --limit-rate 3k` 開住 hymn 1 嘅 range 連線(= 真 `markStreaming()` refcount),再手動行 `growLibrary --mode curate --budget 1 --dry` | `/api/internal/activity` 回 `{"streaming":true}`;script log 「**偵測到而家有真人聽緊歌,呢一輪跳過**」即刻收工 ✅ |
| 2 | 冇人聽 → 照做嘢(唔會餓死) | kill 條 curl,等 refcount 放返 | activity 回 `false`;同一句指令行足全程(報進度 → curate → discover)✅ |
| 3 | fail-open(backend 死唔會令排程死鎖) | `BACKEND_BASE=http://localhost:59999` 行一次 | 當冇人聽,照做嘢,冇 hang ✅ |
| 4 | **launchd 真排程實錘** | 09:29:32 嗰個 scheduled tick 啱啱撞正場景 1 條測試連線 | `/tmp/hymn_growlibrary.log` 09:29:32 寫住「偵測到而家有真人聽緊歌,呢一輪跳過」✅ —— 唔係淨係手動行到,係真.排程行到 |

⚠️ 副作用要知:每 15 分鐘嗰個 tick,只要撞正有人聽歌就會**成輪跳過**(唔係延後,係跳過,等下一個 tick)。而家 curate backlog 見底、discover 每 tick 都係細額度,少做一兩轉冇代價;將來真用戶多咗、tick 命中率跌得緊要嘅話,`total.keepWarm` 同 growlibrary log 睇得返。

---

## D-2 — warm cache 命中率(**只量,冇郁 `CACHE_SIZE_CEILING`**)

新檔 `backend/lib/opsMetrics.js`(純計數器,全部 call 都包咗 try/catch,唔可能拖冧播放路徑)。

- `routes/stream.js`:沿用佢**本來已經計咗**嘅 `warm` 判斷(即係 `[stream]` log 行嗰個 `mode=warm|cold`),順手記多份數。冇加任何新判斷。
- ⚠️ **點解唔可以直接數 request**:ExoPlayer/AVFoundation 一首歌會開十幾廿條 range 連線,第一條之後必然 warm。所以計數器分開兩層:
  - `stream.req/warm/cold` —— 逐個 HTTP request(會高估)
  - `stream.startReq/startWarm/startCold` —— **同一條 youtube_id 隔 60 秒先再嚟嗰下先算一次「開歌」**。判斷 warm 策略要睇呢個(`derived.trackStartWarmRatePct`)。
- `server.js` keep-warm 追落後 timer:每個 tick 因為咩理由收工都有數 —— `ceiling` / `dailyCap` / `streaming` / `offHours` / `warmed` / `failed`。P2-5 話「1800 落後庫存 6,053」,但**係咪真係喺度攔住**以前一句 log 都冇。`ceiling` 一路升先算實錘。
- 另外每 30 分鐘抽一次 `cache.size` + 出一行 `[opsmetrics]` summary 落 backend log。

### 開波即見嘅第一個數(09:33-09:36,樣本仲細,唔可以落結論)

- `keepWarm: {tick:1, ceiling:0, warmed:1}` —— cache 而家 ~350 條,**距離 1800 好遠,個 ceiling 根本未攔到嘢**。真.瓶頸似係 `KEEPWARM_BACKLOG_MAX_PER_DAY=150`(每日最多暖 150 首)同 90 秒一首嘅節奏,唔係個 ceiling。呢點同 P2-5 原本嘅假設唔同,要等 24-48 鐘頭數據確認。

---

## D-4 — yt-dlp 三招邊招真係救到嘢(**只量,三招一個都冇剷**)

`backend/lib/resolveAudio.js`:

- 加咗**成功行**:`[resolve] ok strategy=<default|youtube:player_client=tv|default-any> id=… ms=…`。之前得**失敗**先有 log,所以「邊招真係做緊嘢」完全靠估。
- 失敗行補返 `ms=`。
- 計數器:逐招 `tries/ok/fail/msSum/msMax`,加一次完整 resolve 嘅 `winner`(邊招最後贏)同 **`rescued`(唔係第一招 default 贏 = 後備招真係救返呢一次)**。
- exec 命令、timeout、次序、成功/失敗判斷、拋咩 error —— **一律冇郁**。

舊數據點解唔用得:溝埋咗 2026-08-22 yt-dlp 統一之前嗰個壞 binary 年代(`project-stream-outage-ytdlp-stale-2026-08-22`)。呢個計數器由 `8dac308` restart 嗰刻起,收嘅全部係統一後乾淨數。

---

## 點樣攞數

```bash
curl -s http://localhost:3001/api/audio/cache/warm-stats | python3 -m json.tool
```

睇邊幾個:

| 欄位 | 意思 | 用嚟決定 |
|---|---|---|
| `derived.trackStartWarmRatePct` | 開一首歌入面幾多 % 食住暖 URL | D-2:低 = warm 策略真係唔夠冚,先值得郁 `CACHE_SIZE_CEILING` |
| `derived.streamWarmRatePct` | 逐個 request(會高估,對照用) | — |
| `total.keepWarm.ceiling` vs `.dailyCap` vs `.warmed` | 追落後 timer 每個 tick 點解收工 | D-2:邊個先係真瓶頸 |
| `total.cacheSize.last/min/max` | cache 實際企喺邊(每 30 分鐘抽) | D-2:離 1800 幾遠 |
| `total.resolve.winner` | 三招各贏幾多次 | D-4:`tv` / `default-any` 贏 0 次 = 冇貢獻 |
| `total.resolve.rescued` | default 死咗、後備救返嘅次數 | D-4:**呢個先係「留唔留」嘅關鍵數** |
| `total.resolve.attempts.<招>.msSum` | 每招燒咗幾多時間 | D-4:算返「白蝕幾多秒」對得住幾多次救援 |
| `hourly` / `derivedHourly` | 逐個鐘 bucket(保留 4 日) | 睇時段分佈(403 舊記錄係午後起、深夜散) |

- 落碟:`backend/logs/metrics/ops-metrics.json`(gitignored,15 秒 debounce)。**restart 唔會清零**(開機讀返)。
- backend log 每 30 分鐘一行 `[opsmetrics] …` summary,`grep '\[opsmetrics\]' /tmp/hymn_backend.log`。
- 單一寫手:淨係 backend server process 會寫個檔;`growLibrary`/`checkDeadLinks` 等 script import 到 `resolveAudio.js` 嗰陣淨係數落 memory,唔會兩個 process 爭住寫。

## 幾時有數睇

| 時間 | 睇乜 |
|---|---|
| **2026-08-23 中午前後(+3h)** | 大致睇到 keep-warm 每個 tick 嘅收工理由分佈、`cacheSize` 走勢。resolve 樣本仍細。 |
| **2026-08-24 早上(+24h)** | 第一個可以講嘢嘅窗口:一日完整播放 + 一日 keep-warm + 一日 resolve。D-4 通常已經夠(每日 resolve 上限 150 + 播放 cold resolve)。 |
| **2026-08-25 早上(+48h)** | D-2 建議等到呢度先落刀 —— `trackStartWarmRatePct` 要跨兩日(平日/週末聽歌模式唔同)先代表得到。 |

⚠️ 樣本代表性 caveat:而家實際用戶得 Eric 一個,`trackStartWarmRatePct` 反映嘅係**佢一個人嘅聽歌模式**。如果呢兩日冇點聽歌,`startReq` 會細到唔夠數 —— 睇數之前先睇 `total.stream.startReq` 有幾多,少過 ~50 就唔好落結論,延長窗口。

---

## 附錄:「restart 會唔會清咗啲數」實測(2026-08-23 10:2x,Eric 問)

**唔係講設計意圖,係真係 restart 咗 5 次去試。** 揪到兩個真風險,已經修好 + 重驗。

### 一、正常 restart:數據保住 ✅

行返正常 `approve.sh` + `backend-restart.sh` 流程 restart(pid 81547 → 87739):

| | restart 前 | restart 後 |
|---|---|---|
| `since` | 2026-08-23T01:33:28.481Z | **一模一樣** |
| `resolve.total` | 60 | 60 |
| `keepWarm.tick` | 31 | 31 |
| `stream.startReq` | 2 | 2 |
| `hourly` bucket | 09 / 10 | 兩個都仲喺度,09 點 bucket 內容一致 |

開機 log 見到 `📊 ops-metrics:由碟載返(since=…)`,之後 counter **繼續由 60 累加落去**(唔係凍結)。

### 二、⚠️ 揪到嘅真風險 #1:寫到一半俾殺 → **靜靜哋歸零**(已修)

原本 flush 直接 `writeFileSync` 落正式檔,**唔係 atomic**。而 restart 用 `launchctl bootout` = SIGTERM 即殺。撞正寫緊嗰刻就會留低半截 JSON,下次開機 parse 唔到、俾 `catch (_)` 靜吞 → 由零開始數,**一句 log 都冇**。

實測(將個檔 truncate 到 400 bytes,再行正常 restart 流程):

```
resolve.total  60 → 0
keepWarm.tick  31 → 0     ← 收咗成朝嘅數就咁冇咗,而且完全冇提示
```

**修法(`1d40412`)**:①寫 `.tmp` 再 `renameSync`(atomic)②保住上一份做 `.bak`,load 順序 主檔 → `.bak` → 先至當新開始 ③load 失敗大聲嘈,唔再靜吞。
**重驗**:同一個半截檔場景,而家開機出 `⚠️ 主檔讀唔到/壞咗` + `📊 由碟載返(.bak 後備)`,`resolve.total` 由 **0 變返 60** ✅

### 三、⚠️ 揪到嘅真風險 #2:`.bak` 自己俾爛檔蓋走(已修)

修完 #1 之後再測,親眼見到:主檔壞 → 由 `.bak` 救返 → **第一次 flush 就用嗰個爛主檔 copy 蓋走咗好嘅 `.bak`**(1330 bytes → 400 bytes)。即係「壞一次」之後後備就冇咗,再壞一次真係乜都冇。
順帶推論到第二個窿:`.tmp` 自己都可以寫到一半(碟滿/俾殺),rename 完主檔一樣係爛檔 —— atomic rename 保證「唔會見到半截」,唔保證「內容啱」。

**修法(`ad0a493`)**:①rename 之前先 `JSON.parse` 返 `.tmp`,唔完整就咩都唔做(寧願主檔停喺舊版本蝕幾秒)②只有主檔自己 parse 得到先准 copy 去 `.bak`。
**重驗**:同一場景再行一次 —— 主檔由 `.bak` 救返 75、**`.bak` 保持完好(71)冇再俾污染** ✅

### 四、其他清走風險(逐個查過)

| 風險 | 實測結果 |
|---|---|
| `git clean -fd`(唔帶 `-x`) | **安全** —— dry run 零命中(檔案喺 gitignore 嘅 `backend/logs/` 入面,`-fd` 唔掃 ignored) |
| `git clean -fdx`(帶 `-x`) | ⚠️ **會刪**。`git clean -ndx` 實測輸出 `Would remove backend/logs/`。同一刀會順手剷埋 `admin-audit.log` 同 `client-log/`(唔係我哋呢個檔獨有嘅風險,係 `backend/logs/` 成個目錄)。**紅線:量數期間唔好行 `git clean -fdx`** |
| repo 入面有冇 script 自己 `git clean` / 刪 `logs/` | **冇** —— 全 repo grep `git clean` = 0 條,grep 刪 logs = 0 條 |
| launchd job 會唔會清 | 10 個 hymn job 逐個睇過,冇一個掂 `backend/logs/` |
| Mac 重開機 | **安全** —— 檔案喺 repo 目錄(`backend/logs/metrics/`),唔喺 `/tmp`。⚠️ 反而 `[resolve]`/`[stream]`/`[opsmetrics]` 嘅 raw log 行係寫落 `/tmp/hymn_backend.log`,`/tmp` 唔係耐用地方 —— **要攞數請用個 JSON / endpoint,唔好靠 grep log** |
| 換新版本 backend code(Phase 2.5 / D1) | **安全** —— load 嗰陣 `{...blankBucket(), ...prev.total}`,新加嘅 counter 欄自動補 0,舊數照留。除非有人改咗現有欄位個名(咁就要人手 migrate) |
| 兩個 backend process 同時行 | ⚠️ 會互相蓋(單一寫手假設)。正常 launchd 只會有一個;如果有 session 開多一個 dev instance 落同一個 repo,個數會亂 |

### 五、仲有嘅殘餘蝕數(冇得完全避,量化咗)

- **最壞蝕 4 秒**:flush debounce 4 秒,SIGTERM 即殺就冇咗嗰 4 秒。點解唔用 SIGTERM handler graceful flush?**唔可以** —— `server.js` 而家冇任何 SIGTERM listener,一加就覆蓋咗 node 預設「收到 SIGTERM 就死」,`launchctl bootout` 會殺唔死佢、要等 SIGKILL timeout,直接拖冧 `backend-restart.sh`。呢個代價唔值得。
- **跌返 `.bak` 嗰陣蝕一個 flush 週期**(實測 75 → 71,即 4 次 resolve)。淨係喺主檔真係壞咗先會發生。
- 今次測試本身蝕咗幾分鐘計數(10:23-10:29 之間嗰段),`since` 同 09/10 點 bucket 全部保住。
