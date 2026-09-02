# PERF-STAGE2-2C6-OPUS-20260902 — C-6 獨立驗收(Opus 5)

**對象**:`PERF-STAGE2-2C-20260902.md` §C-6 + 兩處更正、commit `feb0060`(source)、
`d23fba1`(docs)、raw `ops/perf/stage2-20260902/2c-c6-*.log`。
**回應**:`PERF-STAGE2-2C-OPUS-20260902.md` 五個保留(§4.3 / §4.4 / §5.3 / §5.4 / §5.5)。

**方法**:冇改 source、冇 commit、冇 restart 3001、冇部署、冇掂 `backend/hymns.db`
(只讀 + copy 落 scratchpad)、冇開模擬器、冇 import `server.js`。
Harness = slice `server.js` 342–577 原文(`sendHymnsCache` / `scheduleHymnsCompression` /
兩條 route)+ 逐字照抄 `server.js:119-126` 嘅 `compression()` 設定,注入真
`lib/serverDb.js`(整個檔 copy,`DB_PATH` 靠目錄結構自然指去 scratchpad copy)。
scratchpad:`/private/tmp/claude-501/…/dbef9ccd…/scratchpad/verify`。

⚠️ 期間 `backend/hymns.db` md5 由 `34baa9b9…` → `e1203d69…` → `3e53e72b…` 一路變 ——
**唔係我改**(我全程只讀),係夜晚 job / 隔籬 session 寫緊。所以執行單嗰種
「開工/收工 md5 一致」嘅自證喺呢個 repo 靠唔住,要靠「我冇跑過任何寫入」+
`git diff --stat` 見到 hymns.db 早喺 session 開始前已經 dirty 呢兩點。

---

## 0. 判詞總表

| 項 | 判 | 一句 |
|---|---|---|
| (a) route-scoped ETag | ✅ **PASS**(獨立重現) | 三條 tag 唔同;cross-route → 200;self → 304;full tag 值不變 |
| (b) brotli 優先 + 大細 | ✅ **PASS**(negotiator 原碼 + 四種 header 實測) | 佢個 negotiator tie-break 發現係**真**,而且我補到佢冇講嘅一半:`compression@1.8.1` 自己嗰條路反而係啱嘅 |
| (c) async 壓縮 | ✅ **PASS**,再加四個新量度 | miss 個 request **冇**同步 gzip;107ms 殘餘 lag 我拆到係 SELECT 90.8ms,唔係 C-6 新增 |
| (d) getDb dedupe | ✅ **PASS**,失敗 reset / reload 互動全過 | 但**冷開機**並發仍然 N× SELECT(pre-existing,已量化) |
| (e) stale-lock 告警 | ✅ **PASS** | lock 路徑同 `hymnDb.js` 逐字一致,年齡都係用 `mtimeMs`,同一把尺 |
| (f) 兩處更正 | ✅ **到位**,兩條事實我都自己 grep 過 | |
| (g) 部署 | 🟢 **GO** | 兩個殘餘問題**都唔係 C-6 引入**,已量化 + 有監察 + 有回滾 |

**C-6 冇引入任何新 regression。** 兩個值得寫低嘅新發現(§3.4 / §5.2)都係
C-4 / C-5 之前已經存在,C-6 令其中一個(冷開機重複做嘢)嘅代價**細咗一半**。

---

## 1. (a) route-scoped ETag —— PASS

我自己嘅 harness(唔係覆核佢個 log):

```
etag full   = W/"1788341764943.0015-61054976"
etag lite   = W/"1788341764943.0015-61054976-lite"
etag lyrics = W/"1788341764943.0015-61054976-lyrics"

cross full-tag -> ?lite=1      : 200 (expect 200)   ✅
cross lite-tag -> full         : 200 (expect 200)   ✅  <- 佢冇測呢個方向
cross full-tag -> lyrics       : 200 (expect 200)   ✅  <- 佢冇測呢個方向
self full   -> 304  bodyBytes=0
self lite   -> 304  bodyBytes=0
self lyrics -> 304  bodyBytes=0
同一個 tag 但 AE=gzip -> 304 (weak validator 跨 representation 共用,正確)
```

- `full` 個 tag 值 **冇變**(仍然 `W/"<dataVersion>"`),即係 C-5 已經出街過嘅
  行為零改動 —— `tagSuffix` 缺席行 `undefined` 分支,`server.js:379`。
- 304 上面仲留住 `Content-Encoding: br`(express `res.send()` fresh 路徑只剷
  `Content-Type`/`Content-Length`/`Transfer-Encoding`)。RFC 7232 §4.1 講 304
  **應該**帶返 200 會帶嘅 representation header,所以呢個係啱,唔使改。
- 前端零 conditional GET(`grep -rn "If-None-Match\|ETag" frontend/hymn-app/src`
  → 零命中),所以今日呢個修係純預防性,冇活嘅觸發路徑 —— 同佢報告講法一致。

---

## 2. (b) brotli —— PASS,而且佢個發現係真嘅

### 2.1 negotiator tie-break:佢講嘅係事實,我核到原碼

`backend/node_modules/negotiator/lib/encoding.js:164-166`:

```js
function compareSpecs (a, b) {
  return (b.q - a.q) || (b.s - a.s) || (a.o - b.o) || (a.i - b.i) || 0;
}
```

`o` = encoding 喺**客戶端 header** 入面嘅位置,`i` = 我哋 provided array 嘅
index。`o` 排喺 `i` 前面 → **客戶端次序贏我哋嘅次序**。佢冇講錯。

### 2.2 四種 header,naive vs 出街版(我自己跑,`accepts@1.3.8` 直測)

| `Accept-Encoding` | naive `acceptsEncodings(['br','gzip'])` | C-6 出街版(兩次獨立 check) | 差 |
|---|---|---|---|
| `br;q=1.0, gzip;q=0.9`(執行單引嘅 Apple 寫法) | `br` | **br** | 同 |
| `gzip, deflate, br`(**真** iOS NSURLSession) | `gzip` ❌ | **br** ✅ | **唔同** |
| `gzip, deflate, br, zstd`(Chrome) | `gzip` ❌ | **br** ✅ | **唔同** |
| `gzip` only(Android OkHttp 預設) | `gzip` | **gzip** | 同 |
| header 完全冇 | `false` | raw(identity) | 同(兩者都送 raw) |

➡️ **修得啱,而且唔修就會喺最主流嗰兩種 header 靜靜哋跌返 gzip。**

⚠️ 但要記住:parent 個問題單引 `br;q=1.0, gzip;q=0.9` —— 呢個寫法 naive 版
**都會**揀 br。真正中伏嘅係冇 q value 嗰種(`gzip, deflate, br`),即係
Apple 由 iOS 11 起實際送嗰種、Chrome 亦係咁。所以「Apple header」呢個講法
要講清楚係邊種寫法,否則會以為呢個修係多餘。

### 2.3 端到端(真 route + 真 compression middleware)

```
AE="gzip, deflate, br"      -> ce=br   bytes=1083708  ms=1
AE="br;q=1.0, gzip;q=0.9"   -> ce=br   bytes=1083708  ms=1
AE="gzip, deflate, br, zstd"-> ce=br   bytes=1083708  ms=1
AE="gzip"                   -> ce=gzip bytes=1474228  ms=2
AE="identity" / "" / 冇 header -> ce=(none) bytes=5567648
vary=Accept-Encoding  (四種情況全部有)   ✅

br  decode 返 raw byte-for-byte identical = true   ✅
gz  decode 返 raw byte-for-byte identical = true   ✅
br vs gz 慳 26.5%(1,083,708 vs 1,474,228)
```

q5 壓縮耗時:`gzip + brotliCompress` 兩個一齊 `Promise.all` 完成 = **106ms**
(佢個 log 同我 harness 一致),期間 event-loop max lag = **0.3ms**(我量到,
佢量到 1ms)。

### 2.4 🟡 佢冇講嘅一半:`compression@1.8.1` 自己嗰條路本身係啱嘅

`compression/index.js:199` 用嘅係 **`negotiator.encoding(SUPPORTED, PREFERRED)`
兩個參數版**,而且 `compression` 有自己 nested 嘅 `negotiator@0.6.4`
(`backend/node_modules/compression/node_modules/negotiator`),支援
`preferred` list。我實測:

```
"gzip, deflate, br"       -> br     (compression 揀得啱)
"br;q=1.0, gzip;q=0.9"    -> br
"gzip, deflate, br, zstd" -> br
```

即係話 **middleware 一路都識揀 br**;被熄咗嘅唔係 negotiator,係 C-5 提早
set 咗 `Content-Encoding: gzip` 觸發 `nocompress('already encoded')`
(`compression/index.js:186-188`,我核過原碼)。佢報告寫「C-5 令 br 冇機會行」
—— 結論啱,但機制描述(negotiator 揀唔啱)淨係適用於 **express 個
`req.acceptsEncodings`**(單參數,冇 preferred list),唔適用於 middleware。
**唔影響 PASS**,但呢個分別決定咗一件事:

> 如果第日想拆走成套 pre-compressed cache,直接刪 `cache.gz`/`cache.br` 兩條
> 分支就得 —— middleware 會自動接返 br(q4,1,198,686B),唔會跌返 gzip。

### 2.5 🟡 Cloudflare 對 origin `br` 嘅行為 —— **未驗證,而且我唔會為咗驗佢去 poke prod**

實測限制:live origin 行緊嘅係已批准嘅 `84f2e03`,**根本未有 compression
middleware**,所以喺 CF 後面點打都攞唔到 origin-br 嘅信號;`/api/version`
得 43 bytes(< 1KB threshold)冇壓縮;而唯一夠大嘅 `/api/hymns` 一打落去就會
令 live process 由 RSS 21MB 一次過 lazy-load 61MB DB(見 §5.2),**呢個係對
production 嘅副作用,我唔做**。

我可以講嘅係推論邊界(唔當證據):

1. **唔會整爛 client。** origin 只會喺「真係到達 origin 嗰個 request 自己講
   收 br」先送 br。CF 對 client 嘅 encoding 由 CF 自己負責(要就地 decode
   再 re-encode 都係 CF 嘅事),加上 `Vary: Accept-Encoding` 已經 set。
   **最壞情況係「慳唔到」,唔係「壞」。**
2. **可能慳唔到。** CF 歷來會改寫送去 origin 嘅 `Accept-Encoding`;如果佢只
   forward `gzip`,我哋條 br 分支永遠唔會 fire = 純 no-op(唔會出錯)。
   如果佢 forward 咗 br 但 edge 又 re-encode,我哋就白燒咗 CPU。
3. **restart 之後有現成儀器可以一次過答呢題,唔使加 log**:C-3 個
   `[access]` middleware 記嘅係**真 wire bytes**(壓縮後)。開街之後
   `grep '/api/hymns '` 睇個 bytes 欄:
   - `~1,083,7xx` → origin 真係出緊 br,CF passthrough,**慳到**
   - `~1,474,2xx` → origin 出 gzip(CF 剝走咗 br)
   - `~5,567,6xx` → origin 出 raw(CF 完全冇 forward Accept-Encoding)

   **呢個係 §7.4 監察清單第一項。**

---

## 3. (c) async 壓縮 —— PASS,並補齊 parent 四條子問題

### 3.1 「miss 路徑先送 raw 經 compression middleware,呢下係咪同步 gzip 一次?」→ **唔係**

`compression/index.js:214-217` 起嘅係 `zlib.createGzip()` / `zlib.createBrotliCompress()`
**stream**,行 libuv threadpool。我端到端量:

```
miss(full, AE=gzip,deflate,br)  status=200  ce=br  bytes=1198693  ms=168
```

`1,198,693B` = compression 套件嘅 **br q4**(對得上我上一份報告引嘅 1,198,686),
即係 miss 嗰個 request 真係行咗 middleware 條 async br 路,**唔係 gzipSync**。

### 3.2 miss request 自己嘅 latency:107ms lag 邊度嚟?我拆到底

佢個 `2c-c6-etag-brotli-async.log:35` 寫住 `max setImmediate lag = 112 ms`,
同另一份 log 嘅 `1 ms` 表面矛盾,佢喺報告度用一句「包埋既有同步成本」帶過。
**我唔收口頭解釋,直接拆**:

```
SELECT + rows(6,405 首,17 欄)   90.8 ms   <- 同步,pre-C-5 就存在
JSON.stringify                     5.6 ms   <- 同步,pre-C-5 就存在
Buffer.from(body,'utf8')           8.1 ms   <- 同步,pre-C-5 就存在
                                 ───────
                                  104.5 ms
(參照)gzipSync 改前仲要加         99.8 ms   <- C-5 加、C-6 剷走
```

我端到端量返個 miss request:`max event-loop lag = 107.6ms`。
**104.5 ≈ 107.6 → 個 lag 逐 ms 都交代得到,零剩餘。** 佢個「唔係 C-6 新增」
成立,而且而家有數,唔係講。改前應該係 ~205ms,改後 ~107ms。

三條 route 一齊 miss(夜晚 job 之後嘅真實情景):

```
wall = 284ms,max event-loop lag = 214.5ms
各自:full 200/1198686b/284ms   lite 200/334527b/273ms   lyrics 200/840058b/284ms
```

改前呢個數應該係 ~214 + 3×~100(gzipSync)≈ 500ms+。

### 3.3 stale write race:**有守住**,而且我打埋佢冇打嘅同-dataVersion 個 case

```
T10  壓緊嗰陣 slot 被換做新 dataVersion
     → 丟棄 1 次、寫入 0 次;新 slot gz=false br=false(冇被污染)✅
T10b 兩個 entry 同一個 dataVersion 但唔同 object(兩個並發 miss 各自 schedule)
     → 丟棄 0、寫入 2:兩次都寫落 current slot。內容一樣(同一 dataVersion
       = 同一份 JSON),**冇正確性問題**,淨係白壓多一次。
```

`getCurrentSlot()` 用 closure 每次即場讀模組變量(唔係捕捉 object reference),
所以就算 slot 被換咗做另一個 object 都判得啱。✅

### 3.4 兩個並發 miss 會唔會雙倍壓縮?**冇 in-flight flag,答案睇冷/熱**

```
熱(getDb 已 load),2 個並發 miss:SELECT 1 次、compress 1 次   ← 冇雙倍
冷(getDb 未 load),3 個並發 miss:SELECT 3 次、compress 3 次   ← 真係三倍
     wall = 377ms
```

機制:熱嗰陣 `await getDb()` 只讓一個 microtask,microtask queue 喺落下一個
I/O event 之前就 drain 晒,所以 request A 一口氣做完 SELECT 兼填咗 slot,B
先至被 dispatch → 天然唔撞。冷嗰陣 `await initSqlJs()` + 61MB `readFileSync`
係真 async yield,queue 住嗰批 request 全部過咗 cache check,各自 SELECT。

➡️ **呢個係 pre-existing(C-5 一樣有,而且更貴:嗰陣係 3× `gzipSync`)**,
C-6 令每份代價由 ~205ms 跌到 ~107ms。觸發窗口 = restart 之後第一批 request。
唔係 blocker,入 §7.4 監察 + §8 F1。

### 3.5 event-loop lag 量法可信度

佢用 `setImmediate` 自 re-arm 探針。我獨立寫咗一個同款
(`process.hrtime.bigint()` + 自 re-arm `setImmediate`),三點交叉驗證:

- **正控**:同一個探針喺已知同步阻塞(miss)度量到 107.6ms —— 量得到真嘢,
  唔係結構上永遠回 0。
- **樣本密度**:1.2 秒窗口 92,015 個 tick(~13µs/tick),分辨率遠夠捉 100ms 級。
- **負控**:純背景壓縮窗口 max lag 0.3ms。

量法可信。⚠️ 唯一保留:`setImmediate` 只量 check phase,量唔到「同一個
macrotask 內部」嘅阻塞細節 —— 但呢度要答嘅係「有冇成嚿凍住」,呢個 metric
啱用。

### 3.6 🟡 新發現:async 壓縮會霸 libuv threadpool(低嚴重度)

三條 route 一齊 miss = 6 個 zlib job,預設 `UV_THREADPOOL_SIZE=4`:

```
async fs.readFile 延遲   基線      p50=0.14ms p95=0.38ms max=0.62ms
                        壓縮期間   p50=0.11ms p95=5.94ms max=207.69ms  (335×)
dns.lookup 延遲          基線      p50=1.0ms  p95=4.6ms  max=6.8ms
                        壓縮期間   p50=5.0ms  p95=6.5ms  max=9.7ms     (1.4×)
```

**點解只算低嚴重度**:我 grep 過成個 backend,`routes/` + `lib/` **零個
async fs**(`createReadStream` / `createWriteStream` / `fs.promises` 全部零
命中,只有 `*Sync`)。唯一喺熱路徑用 threadpool 嘅係 `fetch()`(undici)
背後嘅 `dns.lookup`,實測只慢 1.4×(max 9.7ms)。窗口亦只係 dataVersion 一
變之後嗰 ~300-600ms,即係 restart + 夜晚 job 完之後嗰幾下。

一行 mitigation(**唔建議而家做**,唔值得為咗佢改 plist 再過一次 gate):
launchd plist 加 `UV_THREADPOOL_SIZE=8`。入 §8 F3。

---

## 4. (d) getDb dedupe —— PASS

```
T6  熱、2 個並發 getDb()       → readFileSync 1 次
T9  冷、3 個並發 HTTP miss     → getDb 只 load 1 次(但 SELECT 3 次,見 §3.4)
T11 reloadDb() 之後            → 舊 handle !== 新 handle ✅(換到新副本)
T11 真 in-flight 期間 reloadDb → load 咗兩次 61MB(pA !== pB)
T12 注入 readFileSync 失敗     → 第一次 throw BOOM;恢復之後第二次成功攞到 DB ✅
                                 (冇卡死一個 rejected promise)
```

- **同步賦值成立**:`dbPromise = (async()=>{...})()` 喺任何 `await` 之前完成
  (`serverDb.js:53`)。`.catch()` 派生 promise 先賦值、callback 至遲一個
  microtask 先行,所以 `dbPromise = null`(:61)唔會反過來覆蓋 assignment。✅
- **`reloadDb()` 互動**:`reloadDb()` 淨係 `dbPromise = null`,唔會 cancel
  in-flight。真 in-flight 期間 reload → 兩份 61MB 一齊入面。呢個係已知
  trade-off(改前一樣),而且窗口極窄(reload 只喺 dataVersion 變 + 冇 lock
  先 fire)。**唔算 C-6 引入。**
- ⚠️ 但佢連住一個真問題,見 §5.2。

---

## 5. (e) stale-lock 告警 —— PASS,+ 一個要入監察嘅嘢

### 5.1 lock 路徑 / 年齡尺 —— 同 `hymnDb.js` 一致(逐行核)

| | `lib/serverDb.js` | `lib/hymnDb.js` |
|---|---|---|
| `DB_PATH` | `path.join(__dirname,'..','hymns.db')` (:20) | `path.join(__dirname,'..','hymns.db')` (:17) |
| `LOCK_PATH` | `` `${DB_PATH}.lock` `` (:106) | `` `${DB_PATH}.lock` `` (:571) |
| 年齡點量 | `Date.now() - fs.statSync(LOCK_PATH).mtimeMs` (:141) | `Date.now() - fs.statSync(LOCK_PATH).mtimeMs` (:648) |

兩個檔都喺 `backend/lib/`,`__dirname` 一樣 → **同一個絕對路徑,同一把尺**。✅

門檻對照:`serverDb` warn @ 30 分鐘;`hymnDb` `LOCK_STALE_MS` = 20 分鐘(仲要
pid 已死)、`LOCK_HARD_STALE_MS` = 2 粒鐘。30 分鐘夾喺中間 —— 即係「一把
`acquireDbLock()` 已經肯搶但我哋仲未嘈」嗰 10 分鐘係靜嘅。**呢個係啱嘅取態**
(嗰 10 分鐘之內下一個 job 開工就會自動搶走鎖,唔應該嘈),唔使改。

throttle / threshold 實作我核過:`STALE_LOCK_WARN_THRESHOLD_MS = 30*60*1000`、
`STALE_LOCK_WARN_THROTTLE_MS = 10*60*1000`、`lastStaleLockWarnAt` module-level
(:122-124)。行為分支 `return` 喺 warn 之後(:149)—— **lock 存在照舊唔
reload,唔理年齡**,同佢講「唔改行為」一致。✅

🟡 一個細位(冇實際影響):舊版 `fs.existsSync` 一律唔 throw,所以舊個
`catch { return }`(保守唔 reload)其實係 dead code;新版 `statSync` 嘅
`catch` 當「冇鎖」→ reload。即係「判斷唔到 lock 狀態」由「保守唔 reload」變
「reload」—— **但舊版實際行為本來就係 reload**(existsSync 回 false),所以
淨行為零改變。報告冇提呢點,唔算報大。

### 5.2 🟡 新發現(**唔關 C-6 事,但關呢次 restart 事**):`reloadDb()` 每次漏 ~58MB,永久唔收

`reloadDb()` 只 `dbPromise = null`(`serverDb.js:76`),**從來冇 `db.close()`**。
sql.js 嘅 `new SQL.Database(buffer)` 會將個 buffer 掛落 emscripten MEMFS
(`close()` 入面嗰句 `ua("/"+this.filename)` 就係 unlink),冇 `close()` 就
永遠 retain。wasm heap 只可以長唔可以縮。我實測(每次都 `--expose-gc` 強制
full GC,每輪都同 `getDb()` 一樣行 `fs.readFileSync` 攞新 buffer):

```
A) 冇 close()(= 而家嘅行為)
   #1 rss=143MB arrayBuffers= 58MB
   #2 rss=211MB arrayBuffers=116MB
   #3 rss=272MB arrayBuffers=175MB
   #4 rss=332MB arrayBuffers=233MB
   #5 rss=392MB arrayBuffers=291MB      <- 每次 +58MB,drop reference + gc 都跌唔返
B) 換之前 close() 舊嗰個
   #1..#5 arrayBuffers 一路企 349MB     <- 完全平,close() 真係 free 得返
```

**點解而家先要講**:改之前 `reloadDb()` 淨係 in-process admin 寫入先 call
(罕有);**C-4 `maybeReload()` 令佢變成「夜晚 job 每次改完 hymns.db 就 fire
一次」**。即係由「幾個禮拜一次」變「一日 1-4 次」→ **+58MB ~ +230MB/日,
永不歸還**。live backend(PID 14704,已開 18 小時)而家 RSS 21MB,DB 仲未
lazy-load。

**我唔要求呢次改**(要 close 就要處理「in-flight request 仲揸住舊 handle」,
安全寫法係延遲 60 秒先 close,唔係一行嘢,唔應該塞落呢個 restart)。
**但一定要入監察清單 + 回滾條件**,見 §7.4 / §7.5 / §8 F2。

⚠️ 我上一份報告 §7.3 R4 / R6 已經寫過「監察 RSS」,但當時定性做**尖峰**;
而家證實係**單調累積**。呢個係我自己嗰份報告要修正嘅地方,唔係佢報大。

---

## 6. (f) 兩處更正 —— 到位

| 更正 | 佢寫咗乜 | 我核 |
|---|---|---|
| 1. 「一個 byte 都冇變」→「**body** 一個 byte 都冇變」 | §C-1 已原地改,並列明 header 邊三樣變咗(ETag 值 / `Vary` / 自 set 嘅 `Content-Encoding`),兼註明實際影響零 | ✅ `grep -rn "If-None-Match\|ETag\|Accept-Encoding" frontend/hymn-app/src` → **零命中**,冇 conditional GET 邏輯 |
| 2. 「已知殘餘限制」機制錯 | 改正咗兩點:`routes/home.js` Stage 3 之後零 DB 存取;`reloadDb()` 清嘅係全 route 共用嘅單一 singleton,真限制係「邊條 route 會**觸發**檢查」 | ✅ `head -12 backend/routes/home.js` 只有 `express` / `fs` / `path` / `url` 四個 import,**冇 `getDb`** |
| (順帶)lyrics `null` vs `''` | §C-1 加咗 ⚠️ 更正,講明 full 出 `null`,前端 `?? ''` 補 | ✅ |

三處都係**原地改**,唔係另開一段講「之前講錯」,睇報告嘅人唔會再讀到錯嘢。到位。

---

## 7. (g) 部署判定 —— 🟢 **GO**

### 7.1 範圍(一次 restart 出晒)

`84f2e03`(已批准)→ `feb0060`,共 24 個 commit:Stage 3 清理、
2A A-1..A-5、2B 前端 instrumentation / F-1..F-4、2C C-1..C-6。
`ops/deploy/backend-restart.sh` dry-run 仍然 abort(未 approve),正確
(`ops/perf/stage2-20260902/2c-c6-backend-restart-dryrun.log:1`)。

### 7.2 GO 嘅理由

1. C-6 五項我全部**獨立重現**(唔係讀佢個 log),冇一項報大。
2. **零新 regression**:body byte-for-byte、304 路徑、identity 路徑、
   Android gzip-only 路徑、stale-write guard、getDb 失敗 retry 全過。
3. C-6 淨影響係**減**同步阻塞(單條 miss 205ms → 107ms;三條齊 miss
   ~500ms → 285ms)同**減** wire(br client −26.5%)。
4. 兩個殘餘問題(§3.4 冷開機 N× SELECT、§5.2 reload 漏記憶體)**都係
   pre-existing**,而且 C-6 令第一個平咗一半。
5. Stage 3 已經係純刪嘢,2A / 2B 上兩份報告已判 GO。

### 7.3 出街次序(硬性)

```
1. ops/deploy/approve.sh backend feb0060 --confirm
2. ops/deploy/backend-restart.sh          ← restart 一定要喺 OTA 之前
3. 確認 §7.4 監察頭三項冇紅
4. 先至經 ops/deploy/ota-publish.sh 推前端(C-1 client 兩段式 fetch)
```

⚠️ restart 排喺 OTA 之前呢條紅線係舊帳(memory
`project-hls-d-fixes-verified`):反過來會令新 client 打舊 backend。

### 7.4 監察清單(restart 之後頭 24 小時)

| # | 睇乜 | 點睇 | 正常 | 紅 |
|---|---|---|---|---|
| 1 | **CF 收唔收 origin br**(§2.5 唯一未驗) | `[access]` log `/api/hymns` 個 bytes 欄 | `~1,083,7xx` = br 通;`~1,474,2xx` = 得 gzip(慳少啲,唔算壞) | `~5,567,6xx` = CF 完全冇 forward AE → C-5/C-6 白做,要諗過 |
| 2 | **RSS 單調爬升**(§5.2) | `ps -o rss -p $(pgrep -f backend/server.js)` 每日一次 | 第一次有人打 `/api/hymns` 之後跳到 ~200MB 係**預期**;之後應該平 | 每日 +58MB 級數一路爬 → 確認 reload 漏記憶體,行 §8 F2 |
| 3 | `[db] stale lock` | `grep '\[db\] stale lock'` backend log | 零 | 出現 = 有殘鎖,`maybeReload()` 已經熄咗,人手核實 + 刪 `backend/hymns.db.lock` |
| 4 | async compress 有冇 fail | `grep 'async compress 失敗'` | 零 | 有 = slot 永遠冇 gz/br,會靜靜跌返 raw(唔會壞,但慳唔到) |
| 5 | 掉咗唔寫 | `grep '掉咗唔寫'` | 偶爾 0-1 次(夜晚 job 之後)正常 | 頻繁 = dataVersion 抖緊,要查 |
| 6 | miss 尖峰 | `[access]` `/api/hymns` 個 ms 欄 | miss ~150-300ms、hit <20ms | miss 持續 >600ms = §3.4 冷開機放大,睇 §8 F1 |
| 7 | 舊 client 冇壞 | `[access]` `/api/hymns` 200 比率 + client-log | 同 restart 前一樣 | 有 5xx / parse error |

### 7.5 回滾條件(逐級,唔好一嚿過 revert 24 個 commit)

| 症狀 | 動作 |
|---|---|
| br client 收到讀唔到嘅 body / iOS 出 parse error | `git revert feb0060` + restart(退返 C-5 純 gzip)。**注意**:revert 之後 `?lite=1` 同 full 會再共用 ETag —— 前端零 conditional GET 所以安全 |
| RSS 一日內爬過 **1GB** | 即刻 restart(即時止血),同日做 §8 F2;**唔使 revert code** |
| `[access]` 見到 `/api/hymns` 出 raw 5.5MB(CF 冇 forward AE) | 唔使 revert,係「慳唔到」唔係「壞」;開單研究 CF `Accept-Encoding` 設定 |
| miss 路徑令 event loop 凍住 >1s、`/api/stream` 受影響 | `git revert feb0060 0519814`(連 C-5 一齊退),退返 C-1 純 raw cache |
| 「歌庫改咗但 App 見唔到」+ 冇 `[db] stale lock` | `git revert ab78c98`(C-4),退返「restart 先追」 |
| 舊 client 大面積壞 | `git revert 8d7a2d4`(C-1)+ OTA rollback(`ops/deploy/ota-rollback.sh`) |

---

## 8. Follow-up(**唔喺呢次 restart**)

| # | 事 | 點解唔而家做 |
|---|---|---|
| F1 | miss 加 in-flight flag(§3.4:冷開機 3 個並發 = 3× 90ms SELECT) | 要改 route 控制流,唔係一行;而家最壞 ~377ms,只喺 restart 後第一批 |
| F2 | `reloadDb()` 延遲 `close()` 舊 Database(§5.2:每次漏 58MB) | 要處理 in-flight request 仲揸住舊 handle(安全做法:hold 60 秒先 close),唔應該塞落呢個 restart |
| F3 | launchd plist 加 `UV_THREADPOOL_SIZE=8`(§3.6) | 影響低(dns 只慢 1.4×),改 plist 又要再過一次 gate,唔抵 |
| F4 | 前端加 conditional GET 食返 route-scoped ETag(§1) | C-6 已經預先鋪好路,幾時做都得 |

---

## 9. 我自己嘅限制(誠實交代)

1. **CF ↔ origin brotli passthrough 完全未驗**(§2.5)。要驗就要 poke live
   `/api/hymns`,會令 production process 一次過 lazy-load 61MB DB,我判呢個
   副作用唔值得。已經用 §7.4 #1 一條 log 觀察頂替。
2. 全部量度喺 **localhost harness**,冇經 cloudflared tunnel。0.65MB/s 上行
   樽頸(memory `project-uplink-bottleneck-065mbps`)之下,br 慳嗰
   390KB ≈ **少傳 0.6 秒**,呢個推算我冇實測。
3. §5.2 個漏記憶體我係用 slice + 真 `serverDb.js` 量,冇喺 live process 上
   量過(唔想 poke prod)。所以 §7.4 #2 定咗做「每日睇 RSS」而唔係
   「已知會爆」。
4. 前端(2B / 2D)唔喺呢次覆核範圍,我照搬上兩份報告嘅 GO。
5. `backend/hymns.db` 全程俾其他 process 改緊(md5 變咗三次),所以我
   harness 用嘅 copy 同執行單用嗰份唔同版本 —— 條數(6,405 首、5,567,648B
   raw)夾得返,唔影響結論。
