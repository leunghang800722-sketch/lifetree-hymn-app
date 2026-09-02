# PERF-STAGE2-2C-OPUS-20260902 — Opus 5 獨立驗收(backend C-1..C-5)

驗收人:Opus 5(獨立)。範圍:`PERF-STAGE2-2C-20260902.md` 五項 C-1..C-5,
commit `78e7acb` / `8d7a2d4` / `c55cfa9` / `ab78c98` / `0519814`。
呢五項係回應我 `PERF-STAGE2-2A-OPUS-20260902.md` 嘅四點意見(§6 A-6 bytes、
§3.3+§3.6 A-3 bytes/abort 缺失、§4.4 A-4 carve-out、§1.3 dataVersion 落後 10.86h)。

**我做過乜**:全部數字我自己重量咗一次(唔係覆核佢個 log)。方法 = slice
committed `backend/server.js` 原文(access-log 41-109 / compression 111-126 /
hymns routes 342-498)入獨立 express instance、真 `compression@1.8.1`、真
`sql.js`,DB 用 `backend/hymns.db` 嘅 scratchpad copy。零 restart、零部署、
冇改 source、冇寫過真 `hymns.db`(收工 `md5 = 8dfa11315ec95563248c28a9d0f52c2f`
同 mtime `Sep 2 09:45` 兩樣都同開工前一樣)、冇開模擬器、冇 import `server.js`。
harness 全喺 scratchpad,DB copy 已刪。

---

## 0. 判詞總表

| 項 | 判 | 一句總結 |
|---|---|---|
| C-1 `?lite=1` + `/api/hymns/lyrics` | **PASS** | 合約、byte 數、三個 slot 獨立性、kids/real_lang 墊、id key 全部我獨立重現;bytes 同我 §6 對到 16 bytes 之內(差額 = dataVersion 字串長度) |
| C-2 A-4 carve-out | **PASS** | 兩條 handler `diff` 對 `ebe29ba~1` **零輸出**,逐字還原屬實 |
| C-3 access log bytes/abort | **PASS** | 我讀完 `compression@1.8.1` 原碼確認 wrapper 次序推論正確;abort 正控/負控/假陽性控我自己再跑過全對 |
| C-4 `maybeReload()` | **PASS,三個保留** | torn read 風險確係零(但真正嘅理由係 atomic rename,唔係 lock);⚠️ `getDb()` 冇 in-flight dedupe → 3 個並發 request 會 load 三次 61MB;⚠️ 殘留 lock 檔會**永久**熄咗 maybeReload;⚠️ 報告嘅「殘餘限制」段講錯咗 |
| C-5 預壓縮 cache | **PASS(效果實錘),三個保留** | double-gzip guard 我逐行核過 `compression` 原碼 + 實測 Content-Length 對數;⚠️ 三條 route **共用同一個 ETag** → 我實測到跨 representation / 跨 route 錯誤 304;⚠️ brotli 被靜靜熄咗,br client 多食 23% wire;⚠️ `gzipSync` 令 miss 路徑多咗 109ms **同步**阻塞 |
| 部署整體 | **GO**(建議先落一行 ETag 修) | 見 §7 |

---

## 1. C-1 —— `?lite=1` + `/api/hymns/lyrics` … **PASS**

### 1.1 預設分支 byte-for-byte(我自己嘅正控)

我冇用佢個 log。我由 `git show 8d7a2d4~1:backend/server.js` 抽出**舊**嘅 column
list,同而家 default 分支嘅 column list 各自行同一套 `kids→lang` / `real_lang`
墊 + `JSON.stringify`:

```
old len = 5567632   new len = 5567632   identical = true
```

再喺真 express harness(post-C-5 原文)打 `Accept-Encoding: identity`:

```
/api/hymns  identity  wire = 5567648  CL = 5567648   (= 5567632 + 16,16 = 真 dataVersion 字串比我 harness 個 'TESTVERSION' 長 16 字)
```

⇒ **body 一個 byte 都冇變,C-5 之後都仲係冇變。**

⚠️ 但 2C 報告「俾前端睇」嗰段寫「`/api/hymns`(冇 `?lite=1`)行為**一個 byte 都
冇變**」—— 呢句喺 C-5 之後**淨係對 body 成立,對 header 唔成立**:C-5 改咗
ETag 嘅值(express auto-hash → `W/"<dataVersion>"`)、加咗 `Vary`、gzip 路徑
多咗 `Content-Length` 同自己 set 嘅 `Content-Encoding`。佢個 byte-for-byte 正控
係喺 C-1 嗰陣(`8d7a2d4`)跑嘅,C-5 之後冇重跑。實際影響 = 零(我 grep 過
`frontend/hymn-app/src` **完全冇** `If-None-Match`/`ETag` 字樣,見 §5.2),
但句 claim 要收窄成「body byte-for-byte」。

### 1.2 bytes 表 —— 同我 2A §6 對數

| endpoint | 2C 報告 | 我獨立重量 | 差 |
|---|---|---|---|
| `/api/hymns` raw | 5,567,648 | 5,567,632 (+16 = dataVersion 長度差) | ✅ |
| `/api/hymns` gzip | 1,474,227 | 1,474,213 / harness wire 1,474,228 | ✅ |
| `?lite=1` raw | 2,839,533 | 2,839,517 (+16) | ✅ |
| `?lite=1` gzip | 371,984 | 371,971 / wire 371,985 | ✅ |
| `/lyrics` raw | 2,702,660 | 2,702,644 (+16) | ✅ |
| `/lyrics` gzip | 992,859 | 992,843 / wire 992,858 | ✅ |
| lyrics 佔 full raw | 49.00% | 2,728,115 / 5,567,632 = **49.00%** | ✅ |

同我 `PERF-STAGE2-2A-OPUS-20260902.md` §6 完全一致。(§6 另一個數 47.85% 係
**lyrics 欄內容**嘅 UTF-8 bytes;49.00% 係 payload 差額,包埋 `"lyrics":` key、
引號同 escape —— 兩個數唔矛盾,2C 引 49.00% 係啱嘅。)

### 1.3 合約正控(我自己跑)

```
full rows = 6405   lite rows = 6405   lyrics map keys = 5387
lite keys = 17,full keys = 18,lite hasOwnProperty('lyrics') = false
lite keys == full keys 剷走 lyrics(逐個 key 名同次序比對)= true
lite vs full 逐欄逐行比對(除 lyrics)mismatch = 0 / 6405
```

**kids→lang / real_lang 墊喺 lite 分支照行**(呢個係執行單特別問嘅):

```
lite 入面 kids 行 = 653,全部 lang === '兒童' = true
lite 全部行都有 real_lang = true
sample: {"id":4225,"lang":"兒童","real_lang":"國語","kids":1}
```

code 上亦成立:`for (const h of hymns) { h.real_lang = h.lang; if (h.kids) h.lang='兒童'; }`
喺 `lite` 三元式**之外**,兩條分支共用。

### 1.4 lyrics map 用 string key —— 6,405 首入面有冇非整數 / 衝突

我直接查 DB(scratch copy,read-only):

```
typeof(id) census        : [{"t":"integer","c":6405}]     ← 全部 integer,零 text/real/blob
非整數 id                : []  (CAST(id AS INTEGER) != id 零命中)
id min/max               : 1 .. 9036      id <= 0 : 0
JS object key 衝突        : 0  (5387 rows → 5387 keys)
全部 key 都係 int-like 而且 < 2^32-1 : true
key 次序(V8 integer-index 升序)     : true,first=1 last=9035
```

⇒ **零風險**。三個要注意嘅陷阱都唔存在:(a) 冇 float/text id 會被 `String()`
撞埋一齊;(b) 冇負數/超 2^32-1 嘅 id 會令 V8 由「integer index 升序」跌返
「插入次序」;(c) id 係 PRIMARY KEY 本身唔可能重複。

補一個 2C 報告寫得唔準嘅位:報告話「冇歌詞嘅 1,018 首唔會出現喺 map,前端查
唔到就當『冇歌詞』(**同而家 `lyrics===''` 語意等價**)」。實際 DB 係
`lyrics IS NULL` **1,018 首、`lyrics = ''` 零首**,即係 full payload 出嘅係
`lyrics: null` 唔係 `''`。前端 `mergeLyrics()` 用 `lyricsMap[h.id] ?? ''` 補
`''`,即係 merge 完之後嗰 1,018 首由 `null` 變 `''`。兩個都係 falsy,實際零影響,
但講法要改成「full 出 `null`,merge 後變 `''`」。

我另外核實咗 **lite + lyrics map merge 返出嚟 == full**:

```
逐行逐欄(以 full 嘅 key 為準)比對:mismatch = 0 / 6405
```

### 1.5 三個 cache slot 獨立性

`hymnsResponseCache` / `hymnsLiteResponseCache` / `hymnsLyricsResponseCache`
三個獨立 module-level 變量,`/api/hymns` 用 `lite ? … : …` 揀 slot。我喺同一個
process 交替打三條 route ×3 輪,每次都攞返自己嗰個 payload 大細
(5,567,648 / 2,839,533 / 2,702,660),零串味。dataVersion 變咗之後三個各自
miss 一次再 hit —— 佢個 `2c-c1-positive-control.log`(computeCount
1/1/1 → 1/1/1 → 2/2/2 → 2/2/2)我用 §4 個 maybeReload harness 獨立重現到同樣行為。

### 1.6 route 次序

`/api/hymns/lyrics` 註冊喺 `/api/hymns` 之後、冇 `/api/hymns/:id` 存在、
`app.use('/api/home'|'/api/search'|…)` 全部 prefix 唔撞。我 harness 實測兩條
route 各自 match 正確。跟足我 2A §6 嘅實作提醒。

---

## 2. C-2 —— A-4 carve-out … **PASS**

我冇靠肉眼睇 diff,直接對兩個 block 做 `diff`:

```
$ git show ebe29ba~1:backend/routes/audio.js | sed -n '/^\/\/ GET \/api\/audio\/cache\/stats/,/^router.get(.\/cache\/warm-stats/p' > /tmp/o.txt
$ sed -n '同一 pattern' backend/routes/audio.js > /tmp/n.txt
$ diff /tmp/o.txt /tmp/n.txt
(零輸出)  → C-2 cache/stats block: VERBATIM IDENTICAL
$ (warm-stats block 同樣做法)
(零輸出)  → C-2 warm-stats block: VERBATIM IDENTICAL
```

`/:youtubeId` 維持 410 ✅(`2c-c2-carveout.log` 有 `[deprecated-route]` 行,
即係 A-4 嗰個觀察口仲喺度)。`export { cache }` 冇還原 —— 我 grep 全 repo
確認冇 importer ✅。router 內部次序都同原文一樣(`/:youtubeId` 行先,但佢係
單 segment pattern,match 唔到兩 segment 嘅 `/cache/stats`,同原版行為一致)。

**呢項完全符合我 §4.4 個要求,冇保留。**

---

## 3. C-3 —— access log bytes / abort … **PASS**

### 3.1 wrapper 次序(呢個係核心,我逐行核 `compression@1.8.1` 原碼)

執行單問「compression 包住 access log 定反轉」。答案:**compression 喺外、
access-log 喺內**,而呢個先係啱嘅。證據喺 `node_modules/compression/index.js`:

- middleware body 一入嚟就 `var _write = res.write` —— 嗰一刻 `res.write`
  已經係 access-log 嘅 wrapper(因為 access-log 早咗註冊)。
- 壓縮路徑:`stream.on('data', chunk => { if (_write.call(res, chunk) === false) … })`
  —— gzip **出嚟之後**先 call 我哋個 wrapper ⇒ 數到嘅係壓縮後 wire bytes。
- 唔壓縮路徑:`res.end` → `return _end.call(this, chunk, encoding)` ⇒ 數到 raw bytes。

兩條路都只會數一次。**2C 報告個推論屬實,而且係佢自己講嘅理由。**

### 3.2 我自己跑嘅正控/負控/假陽性控

```
負控   /api/stream/999、/api/hls/999.m3u8、POST /api/client-log → [access] 行 = 0(打完之後再數,仍然 0)
正控   GET /api/version 200 0ms 20b            ← 唔係 '-'
正控   GET /api/hymns 200 (gzip) 1474228b      ← 同手動 gzipSync 對到數
正控   GET /api/hymns 200 (identity) 5567648b
正控   404 路徑 GET /api/version_notexist 404 1ms 159b   ← 非 200 都有記
abort  raw socket,收夠 100000 bytes 就 destroy:
       [access] GET /api/slow 200 12ms 100000b aborted=1   ← 標到
假陽性控 正常 request 有冇被誤標 aborted:0 / 全部
304 路徑 [access] GET /api/hymns 304 0ms 0b   ← 唔會報大
```

`finish`/`close` + `done` 旗標:Node ≥12 每個正常 response **兩個 event 都會
fire**(`finish` 先),所以 `done` 旗標唔係「防守性」而係**必要**,冇佢每條
request 都會 log 兩次兼全部誤標 aborted。呢點報告冇明講,但實作啱。

### 3.3 兩個要記低嘅細位(唔影響 PASS)

1. **`[access]` 唔記 query string**(用 `req.path`)。即係
   `/api/hymns?lite=1` 同 `/api/hymns` 兩條**喺 log 入面同名**:
   ```
   [access] … GET /api/hymns 200 123ms 371980b   ← 呢條其實係 ?lite=1
   ```
   C-1 成件事嘅監察指標就係「幾多流量已經轉咗去 lite」,而家只可以靠 bytes
   (~372KB vs ~1.47MB)反推。夠用,但唔係直接量到。想直接量嘅話一個字改
   `req.path` → `req.originalUrl`(⚠️ 但咁樣會令 log 出街帶 query,要諗埋
   `?swr=`/token 之類嘅洩漏面;而家排除咗 stream/hls 所以其實安全)。
2. `2c-c3-synthetic.log` 自己張表寫「total [access] lines = 4 (**expect 5**)」——
   實際只發過 4 條 request(identity 嗰條嘅 [access] 行因為 `finish` 係非同步,
   印咗落 abort 段落),`expect 5` 係佢自己 annotation 打錯,唔係量度出事。
   我獨立跑 = 全對。

---

## 4. C-4 —— `maybeReload()` … **PASS,但三個保留**

### 4.1 torn read 風險 = 真係零,但報告個理由排錯先後

我讀咗 `lib/hymnDb.js`:

- `saveDb()` (:24-29) = `writeFileSync(${DB_PATH}.tmp)` + `renameSync(tmp, DB_PATH)` ✅ atomic
- `LOCK_PATH` = `` `${DB_PATH}.lock` `` (hymnDb.js:571) — `lib/serverDb.js` C-4 新加嗰條
  **完全同一條路徑**(兩邊 `DB_PATH` 都係 `path.join(__dirname,'..','hymns.db')`)✅
- `LOCK_STALE_MS = 20min`、`LOCK_HARD_STALE_MS = 2h`、`LOCK_MAX_WAIT_MS = 5min`

**真正令 torn read = 零 嘅係 (a) atomic rename,唔係 (b) lock。** rename 之後
`stat` 見到嘅一係舊版一係完整新版,冇中間態 —— 呢個性質同有冇攞鎖無關。
lock 檢查買到嘅係另一樣嘢:唔喺一個 multi-`saveDb()` job 中途讀到「做咗一半」
嘅邏輯狀態。所以我獨立驗證 (b) 到底成唔成立:

```
$ 全部 saveDb() caller 入面冇 acquireDbLock 嘅:
  curateLibrary.js / migrate-lyrics.js / migrate-lyrics-timeline.js / reconcileUserRefs.js
$ 直接寫 DB_PATH 唔經 tmp+rename 嘅:
  backend/scripts/migrate-add-status.js:56  fs.writeFileSync(DB_PATH, Buffer.from(db.export()))   ← 唯一一個非 atomic
$ 排程(launchd)嘅寫手:alignBackfill / backfillMeta / backfillAlbumSearch / growLibrary
  / checkDeadLinks / nightly-db-sync —— 呢啲全部有 acquireDbLock
```

⇒ **排程路徑上 (a)(b) 都成立,C-4 落地嘅前提屬實。** 唯一結構上會撞 torn read
嘅係 `migrate-add-status.js`(非 atomic),但佢係一次性 migration、唔喺排程、
而且 header 自己寫住 "One-off migration"。記低就得,唔阻部署。

### 4.2 我自己跑嘅 touch → pickup / lock → hold(用 DB copy)

```
v0                              1788339693669.7747-61054976
touch(冇鎖)                     1788339864695-61054976        changed = true
建 lock 檔 + 再 touch            1788339864695-61054976        held(冇郁)= true   ← guard 生效
刪 lock                          1788339865798-61054976        picked up = true
```

同 A-1 cache 嘅互動我亦重現到:touch 之後打 `/api/hymns`,`readFileSync` +
`new SQL.Database` 計數 +1、ETag 由 `W/"…693669.7747-…"` 變 `W/"…865798-…"`,
再打就唔再 +1(hit)。✅

`statSync` 成本:佢報 1.228µs/call。呢個量級同 macOS APFS 一致,而且 hot path
上只係一次 syscall —— 我唔覺得需要重量,接受。

### 4.3 🔴 保留一:`getDb()` 冇 in-flight dedupe,C-4 令佢由「幾乎唔發生」變「每次 job 寫完都可能發生」

`lib/serverDb.js` 個變量叫 `dbPromise`,但佢**存嘅唔係 promise 係 Database
object**,而且係喺**兩個 await 之後**先賦值:

```js
export async function getDb() {
  if (!dbPromise) {
    const SQL = await initSqlJs();          // ← 讓出
    const buffer = fs.readFileSync(DB_PATH); // 61MB
    dbPromise = new SQL.Database(buffer);
  }
  return dbPromise;
}
```

我實測(`concurrency.mjs`):

```
case A 首次 3 個並發 getDb()                     → loads = 3,distinct DB object = 3
case B reloadDb() 之後同一 tick 3 個並發 getDb()  → loads = 3,distinct DB object = 3
case C 隔一個 macrotask 先 call 第二次            → loads = 1 ✅
case D reloadDb() 喺一個 getDb() 飛緊嗰陣再 fire  → loads = 2,兩份 61MB DB 同時活住
                                                   (RSS 523MB)
```

即係:**同一個 event-loop turn 落到嘅並發 request 會各自 `readFileSync` 61MB +
起一個 sql.js Database。** 呢個係 pre-existing bug(唔係 C-4 引入),但 C-4
**大幅提高咗佢 fire 嘅頻率**:以前 `reloadDb()` 淨係 in-process admin 寫入先
call(罕見),而家夜晚 job 每次 `saveDb()` 落地之後嘅第一批 request 都會行呢條路。
再加上三個 cache slot 全部 key 喺同一個 dataVersion,**一變就三條 route 一齊 miss**,
三條都要 `getDb()`。

我 HTTP harness 打 4 個並發 request 量到 loads = 1(因為 `initSqlJs()` 之後已經
cached,微任務即刻 resolve,實際上變返同步)—— 所以**日常唔會 fire**;但
first-request-after-boot 同「兩條 socket 嘅 data 喺同一個 poll batch 入面讀到」
呢兩種情況會 fire。低機率、高代價(N × 61MB)。

修法一行:`dbPromise = (async () => { … })()` —— 即係真係存個 promise。
**唔屬於 2C 範圍,我唔要求呢次改**,但要入監察清單(睇 RSS)。

### 4.4 🔴 保留二:殘留 lock 檔會**永久**熄咗 maybeReload,而且冇聲

`maybeReload()` 見到 lock 檔存在就 `return`,**冇年齡判斷**。`lockIsStealable()`
(20 分鐘 / 2 粒鐘)嗰套只喺 `acquireDbLock()` 入面行,即係**只有另一個 writer
開工先會清走殘鎖**。所以:writer crash / 俾人 `kill -9` 之後留低個 lock 檔,
而之後又冇 job 再開工的話,`maybeReload()` 就**由嗰刻起永遠唔會再 reload**,
靜靜退化返今日「唯一方法 = restart」嘅狀態,零 log 零告警。

呢個唔係理論:`backend/` 而家仲擺住
`hymns.db.lock.bak` / `.bak-d1` / `.bak-d1b` / `.bak2` / `.bak3`(2026-08-17)——
即係當日真係試過要人手搬走殘鎖。

建議(唔阻部署,但抵做):`maybeReload()` 加返年齡判斷,或者最少喺「連續 N 次
見到 lock 擋住」印一行 log。而家嘅寫法連「有冇被擋過」都查唔到。

### 4.5 🟡 保留三:報告個「已知殘餘限制」段講錯咗機制

2C 報告寫:

> 其餘 route(例如 `/api/home/*`)仲係食緊 `getDb()` 嘅 lazy-load 快取,唔會因為
> out-of-process 寫入而自動 refresh

兩點都唔啱:

1. `routes/home.js` 喺 Stage 3 `b13088f` 已經**完全冇咗 `getDb` import**,佢
   而家零 DB 存取(我 grep 過:`routes/home.js` 只 import `express`/`fs`/`path`/`url`)。
   攞佢做例子係攞咗個唔存在嘅例子。
2. 更重要:`reloadDb()` 清嘅係 **`lib/serverDb.js` 個 singleton `dbPromise`**,
   而 `routes/me.js`、`server.js` 傳俾 `hlsRoutes(getDb)`/`streamRoutes(getDb)`
   全部食同一個 singleton。所以只要三條 route 任何一條觸發過 reload,**其餘所有
   route 下次 `getDb()` 都會攞到新鮮 DB**。真正嘅限制係「邊條 route 會**觸發**
   檢查」,唔係「邊條 route 會**見到**新資料」。呢個係報大咗個限制(方向對用家有利),
   但寫錯咗機制,第日會誤導人去改 `routes/home.js`。

(`routes/search.js` 自己註明唔經 singleton、每次自己開 DB,係另一件事,1A A2 已記。)

---

## 5. C-5 —— 預壓縮 cache … **PASS(效果實錘),三個保留**

### 5.1 double-gzip guard —— 成立,我逐行核過原碼 + 實測

`compression@1.8.1` `onHeaders` callback 次序:

```js
if (!filter(req,res)) { nocompress('filtered'); return }
if (!shouldTransform(req,res)) { nocompress('no transform'); return }
vary(res, 'Accept-Encoding')
if (Number(res.getHeader('Content-Length')) < threshold || length < threshold) { nocompress('size below threshold'); return }
var encoding = res.getHeader('Content-Encoding') || 'identity'
if (encoding !== 'identity') { nocompress('already encoded'); return }      ← 我哋行呢條
…
res.setHeader('Content-Encoding', method)
res.removeHeader('Content-Length')                                          ← 只喺「真係要壓」嗰枝先行
```

⇒ 報告講「唔會 double-gzip、亦唔會剷 Content-Length」**完全屬實**。我實測:

```
/api/hymns          CE=gzip CL=1474228 wire=1474228 TE=(none)
/api/hymns?lite=1   CE=gzip CL= 371985 wire= 371985 TE=(none)
/api/hymns/lyrics   CE=gzip CL= 992858 wire= 992858 TE=(none)
```

三個 CL **完全等於 wire bytes、等於手動 `gzipSync` 個 size**,而且冇
`Transfer-Encoding: chunked` —— 如果 double-gzip 或者被 compression 接手,
呢兩樣都唔會係咁。✅

`req.acceptsEncodings('gzip') === 'gzip'` 嘅 fallback 行為我亦實測晒:

```
AE: (完全冇 header)                      → CE=(none)  wire=5567648  ← 冇 send 錯 encoding ✅
AE: gzip;q=0                            → CE=(none)  wire=5567648  ✅
AE: identity                            → CE=(none)  wire=5567643  ✅
AE: *                                   → CE=gzip    wire=1474223  ✅
```

### 5.2 效果 —— 實錘,而且比佢報嘅仲好

| endpoint | 改前 gzip hit | 2C 報告改後 | 我量到(client ms / server `[access]` ms) |
|---|---|---|---|
| `/api/hymns` | ~117ms | 18/18/21 | **1 / 3 / 1 ms**,server 側 **0-1ms** |
| `?lite=1` | ~30ms | 10/7/6 | **1 / 1 / 1 ms**,server 側 **0-1ms** |
| `/lyrics` | ~86ms | 9/10/9 | **1 / 1 / 1 ms**,server 側 **0-1ms** |

(佢個 client-side 數大過我,因為佢個 harness client 連 gunzip 都計埋。兩邊
server 側 `[access]` 都係 0-1ms,結論一致。)

identity hit:full 13/13/14ms、lite 6/6/7ms、lyrics 6/5/8ms —— 同 A-1 報嘅
~12-17ms 一致,冇 regression。

正控(我自己再跑):三條 route `raw` vs `gunzip(gz)` **byte-for-byte identical = true**。

### 5.3 🔴 保留一:三條 route 共用同一個 ETag —— 我實測到**錯誤 304**

`sendHymnsCache()` set `W/"${cache.dataVersion}"`,而三條 route 嘅 dataVersion
係同一個值。實測:

```
etag full   = W/"1788339693669.7747-61054976"
etag lite   = W/"1788339693669.7747-61054976"   同 full 一樣 = true
etag lyrics = W/"1788339693669.7747-61054976"   同 full 一樣 = true

GET /api/hymns        (AE: gzip)     + If-None-Match: <上面個 tag> → 304 ✅ 應該
GET /api/hymns        (AE: identity) + If-None-Match: <gz 嗰個 tag> → 304 ⚠ 跨 representation
GET /api/hymns?lite=1 (AE: gzip)     + If-None-Match: <full 嗰個 tag> → 304 🔴 跨資源
```

兩個問題要分開講:

**(a) raw / gz 共用一個 weak tag** —— 報告引 RFC 7232 §2.1 話 weak validator 就係
為咗呢個而設,呢個講法**過度樂觀**:RFC 9110 §8.8.3.3 嗰個 content-negotiation
例子出嘅係**兩個唔同嘅 entity-tag**(`"123-a"` / `"123-b"`),weak 講嘅係「同一個
representation 語意上冇變」,唔係「唔同 representation 可以共用」。不過:
① `Vary: Accept-Encoding` 有 set,合規 cache 唔會攞錯;② **呢個情況 C-5 之前
已經存在** —— express 個 auto-ETag 係喺 `res.send(body)` 用**未壓縮**嘅 body 計,
compression 之後先壓,即係改前 raw/gz 都係同一個 tag。⇒ **C-5 冇令呢點變差**,
我唔當佢係 C-5 嘅問題。

**(b) `/api/hymns` vs `?lite=1` vs `/lyrics` 三個唔同資源共用一個 tag —— 呢個係
C-5 新引入嘅。** 改前三條嘅 auto-ETag 由 content hash 計,**必然唔同**;而家一模
一樣。一個 cache 如果 key 唔包 query string(Cloudflare 就有「Ignore Query String」
呢個 cache level;好多 client-side cache 亦係按 path key),`?lite=1` 同 full 就
會撞埋,而**共用 ETag 令呢個撞車由「必然被 ETag 攔住」變成「靜靜哋出錯資料」**。

今日**冇活嘅觸發路徑**(所以唔 blocking):
- `frontend/hymn-app/src` 全域 grep `If-None-Match|ETag` = **零命中**,App 唔會送 conditional GET;
- 三條 route 都出 `Cache-Control: private, max-age=0, must-revalidate`,CF 唔會 cache
  (1A A1 實測 57 個組合 `cf-cache-status` 全部 DYNAMIC)。

**建議**:出街前落一行,零成本、零風險:

```js
-  res.set('ETag', `W/"${cache.dataVersion}"`);
+  res.set('ETag', `W/"${tag}-${cache.dataVersion}"`);   // tag = 'h' | 'hl' | 'ly'
```

(`sendHymnsCache` 多收一個參數。)唔改嘅話要寫入監察清單:任何人日後開
CF cache rule / 前端加 conditional GET,呢條就會即刻變真 bug。

### 5.4 🔴 保留二:brotli 俾靜靜熄咗,br client 多食 23% wire

`sendHymnsCache` 見到 client 收 gzip 就即刻 set `Content-Encoding: gzip`,
compression 就 `nocompress('already encoded')` —— 連帶**brotli 都冇機會行**。
我用真 client 常見 header 實測:

```
AE: gzip                                  → CE=gzip  wire=1,474,223
AE: gzip, deflate                         → CE=gzip  wire=1,474,223
AE: gzip, deflate, br                     → CE=gzip  wire=1,474,223
AE: br;q=1.0, gzip;q=0.9, deflate;q=0.8   → CE=gzip  wire=1,474,223   ← Apple NSURLSession 嘅標準 header
AE: br(只收 br)                           → CE=br    wire=1,198,686

參考:同一份 body,gzip = 1,474,223 / brotli(q4,compression 個 default) = 1,198,686
```

⇒ **改前 br-capable client 會攞到 1.20MB,改後一律 1.47MB,多 275,537 bytes(+23%)。**
喺呢個 project 尤其要留意:2A §2.5 量到 tunnel 上行只有 **0.65 MB/s**,275KB ≈
**多 0.42 秒**,而 C-5 慳返嘅 server CPU 係 ~110ms。單睇 full route,呢單交易
喺 br client 身上係**蝕**嘅。

但**未必打到真流量**,因為中間隔住 Cloudflare:CF 向 origin 攞嘢嗰陣送乜
`Accept-Encoding` 我喺呢度**量唔到**(唔准掂 prod / 唔准 restart)。如果 CF 只
送 `gzip`,咁改前改後都係 gzip,零影響;如果 CF 送 `br, gzip`,就係上面條數。

**必須做嘅事(出街後第一件)**:

```bash
curl -s -o /dev/null -H 'Accept-Encoding: br, gzip' \
     -w 'ce=%{content_type} size=%{size_download}\n' https://api.odemusics.com/api/hymns
# 再喺 backend log 睇同一秒嗰條 [access] 行嘅 bytes
```

如果證實 br 有得行,補一個 `brotliCompressSync` buffer 落同一個 slot(同 gzip
一樣嘅寫法,多 ~1 個 slot ≈ 1.2MB 記憶體)就兩頭都攞晒。

### 5.5 🟡 保留三:`gzipSync` 令 miss 路徑多咗 ~110ms **同步**阻塞

改前 compression 用 **async** zlib stream(行 threadpool,唔阻 event loop);
改後 miss 路徑係 `zlib.gzipSync`(**阻 event loop**)。我實測一次 miss 嘅同步
時間分佈:

```
readFileSync(61MB)        20.5ms
new SQL.Database(buffer)   4.7ms
SELECT + stringify(full)  99.5ms
zlib.gzipSync(full)      109.2ms   ← C-5 新加,同步
────────────────────────────────
一次 /api/hymns miss       233.9ms  event loop 全程唔郁

三個 slot 全部 miss(dataVersion 一變就係咁):
  lite   SELECT+stringify 64.7ms + gzipSync 27.7ms
  lyrics SELECT+stringify 17.4ms + gzipSync 84.2ms
  ──────────────────────────────────────────────
  累計同步阻塞            427.9ms
```

其中 **221ms(三個 gzipSync)係 C-5 新加嘅同步時間**。呢個 backend 同時服務
`/api/stream` 嘅 range request,而 C-4 令 dataVersion **喺夜晚 job 每次
`saveDb()` 之後都會變**(以前係 restart 先變)—— 即係夜晚 job 跑緊嗰陣,每次
有人打 `/api/hymns`,event loop 就凍 ~230-430ms。

嚴重度我判**低**:① 遠低於 native/JS 兩層 watchdog 嘅門檻(10s/5s);② Eric
一個人聽歌,夜晚 job 窗口撞正播歌嘅機會細;③ 收益(hit 由 117ms→0-1ms)遠大過
呢個代價。但要入監察清單,亦係「唔好隨便再加同步 CPU 落 hot path」嘅一筆。
想收窄就改用 `zlib.gzip` + promise(cache miss 本身已經係 async handler)。

### 5.6 記憶體:三個 slot raw + gz 常駐幾多

我用 `--expose-gc` 逐步量 delta:

```
baseline node                          rss  50.3MB
+ 1 份 sql.js DB(61MB 檔)              rss +62.6MB  (external +58.2MB)
+ full   json string                   rss +55.5MB  heapUsed +7.2MB
+ lite   json string                   rss +19.8MB  heapUsed +4.4MB
+ lyrics json string                   rss + 5.6MB  heapUsed +4.8MB
+ 3 個 gz buffer                        rss +11.0MB  external +16.0MB(buffer 本身合共 2.84MB)
────────────────────────────────────────────────────────────
三個 slot 合共 vs 淨 DB                 rss +91.9MB,heapUsed +16.4MB
final rss 204.8MB
```

**真正常駐 ≈ 19MB**(3 個 JSON string 16.4MB heap + 3 個 gz buffer 2.84MB);
RSS 帳面 +92MB 係因為 `SELECT`→`getAsObject()`→`stringify` 嘅暫態垃圾 macOS
唔即刻還俾 OS。C-1+C-5 相對 A-1(本身已有 full slot)嘅**增量 ≈ 12MB**
(lite 4.4 + lyrics 4.8 + 3 個 gz 2.8)。

⚠️ 對照:live backend 而家 `RSS = 38MB`(PID 14704,已開 17 小時,DB 仲未
lazy-load)。出街之後第一次有人打 `/api/hymns`,RSS 會一次過跳到 ~200MB 級數。
**呢個係預期,唔係 leak** —— 但要事先講清楚,否則第一次睇 RSS 會以為出事。

### 5.7 304 路徑仍正常

```
GET /api/hymns + If-None-Match(啱 tag)→ 304,body 0 byte,[access] 記 `304 0ms 0b`
```

express 個 304 分支剷走 `Content-Type`/`Content-Length`/`Transfer-Encoding`,
**留低 `Content-Encoding: gzip`** —— RFC 9110 §15.4.5 容許(304 應該帶返 200
會帶嘅 representation metadata),唔係 bug。`Vary`/`ETag` 都留低 ✅。
compression 對 304 會行 `nocompress('filtered')`(冇 Content-Type),唔會搞亂。

報告記低嗰個 `fetch()` 陷阱(手動 set `If-None-Match` → undici 自動加
`Cache-Control: no-cache` → `fresh` 故意判 stale)我覆核過屬實,係 fetch API
行為唔關 server 事,佢改用 `http.get` 係啱嘅做法。**呢條係好嘅方法論記錄。**

---

## 6. Spot re-check 匯總(全部我自己跑,唔係覆核佢個 log)

| 檢查 | 結果 | 判 |
|---|---|---|
| 三 route gzip hit ms | 1/3/1、1/1/1、1/1/1(server `[access]` 0-1ms) | ✅ 比報告仲好 |
| `?lite=1` 首數 | 6,405 | ✅ |
| lyrics map key 數 | 5,387(= full 非空 lyrics 數;0 個空字串,1,018 個 NULL) | ✅ |
| lyrics map key 有冇非整數/衝突 | 全 6,405 個 id 都係 integer 1..9036,零衝突,V8 升序 | ✅ |
| byte-for-byte 正控(default route) | 舊/新 column list 產物 identical = true;harness wire 5,567,648 | ✅ body |
| lite/full 逐欄比對 | mismatch 0/6,405;kids 653 行 lang=兒童;real_lang 全有 | ✅ |
| lite + lyrics map merge == full | mismatch 0/6,405 | ✅ |
| double-gzip guard | CL == wire == 手動 gzipSync size,無 chunked | ✅ |
| raw vs gunzip(gz) | 三條 route 全部 identical | ✅ |
| maybeReload touch → pickup(DB copy) | touch 追到 / 有 lock 企定 / 解鎖追到 | ✅ |
| access log 負控 | stream/hls/client-log = 0 行(打完再數仍 0) | ✅ |
| abort=1 正控 + 假陽性控 | 標到 aborted=1;正常 request 假陽性 0 | ✅ |
| C-2 逐字還原 | `diff` 對 `ebe29ba~1` 兩個 block 零輸出 | ✅ |
| 真 `hymns.db` 有冇被我掂過 | md5 + mtime 開工/收工一樣 | ✅ |

---

## 7. 部署整體判定 —— **GO**

### 7.1 一次過出街嘅範圍

`git log 84f2e03..HEAD` = **35 個 commit**。分三堆:

| 堆 | 影響面 | 出街手段 |
|---|---|---|
| 2A(A-1..A-5)+ 2C(C-1..C-5) | backend | **restart 3001** |
| Stage 3(S3-1..S3-6 + 尾巴) | backend 死 code 清理 + `deviceId.js` | restart(backend 部分) |
| 2B(D-1/F-1..F-4)+ C-1 client + player HLS(`f509c3b` 等) | frontend | **OTA**(另一件事) |

⚠️ deploy gate 係 **per-sha**:`approve.sh backend <HEAD>` 會**一次過批埋**上面
35 個,包括 frontend / player 嗰啲。呢個係已知性質(memory 有記),但要 Eric
明確知道佢批嘅係 HEAD 唔係「淨係 2C」。

### 7.2 gate 現況(我冇跑 approve)

- step 1:`HEAD (7106682) != approved backend.sha (84f2e03)` → 會 abort,要 approve。
- step 2:`git status --porcelain -- backend/` 現時 10 條全部落喺豁免清單
  (`backend/data/`×7、`backend/hymns.db`、`backend/public/`、`?? backend/data/hymns.db`)
  → **會過**。
- 依賴:`compression@^1.8.1` 已經喺 `backend/package.json` 而且 `node_modules`
  有裝(我核過 1.8.1)→ **唔使 `npm install`**。

### 7.3 風險清單(按嚴重度)

| # | 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|---|
| R1 | **brotli 被熄** → br-capable client 每次多食 275KB(+23%),0.65MB/s 上行即係多 0.42s | 未知(睇 CF 向 origin 送乜 AE) | 中 —— 直接打對面 Stage 2 想改善嘅嘢 | 出街後第一件事就量(§5.4 個 curl);證實有事就補 br buffer |
| R2 | **三條 route 共用 ETag** → 日後開 CF query-string-insensitive cache 或者前端加 conditional GET 就會出錯資料 | 今日 0(冇觸發路徑) | 高(如果 fire) | 出街前落一行 route-scoped tag(§5.3);唔落就入監察 |
| R3 | **殘留 lock 檔永久熄咗 maybeReload**,零告警 | 中(歷史上出過,`hymns.db.lock.bak*` 係證據) | 中 —— 靜靜退化返「要 restart」,唔會壞嘢 | 入監察:定期 `ls backend/hymns.db.lock` |
| R4 | `getDb()` 冇 dedupe → 並發 reload 一次過起 2-3 份 61MB DB | 低(日常微任務會自然去重) | 中(RSS 尖峰) | 監察 RSS;要修就一行改成真 promise |
| R5 | `gzipSync` + reload 令 miss 路徑同步阻塞 234-428ms,而 C-4 令 miss 喺夜晚 job 期間會反覆發生 | 中 | 低(遠低過 10s/5s watchdog) | 監察;要收窄就轉 async `zlib.gzip` |
| R6 | RSS 由 38MB 跳到 ~200MB | **必然** | 零(預期行為) | 事先講明,唔好當 leak |
| R7 | C-4 首次生效 → backend 一開始就見到落後 10.86 鐘頭嗰批新歌/新歌詞 | 必然 | 正面,但**係一次過嘅內容跳變** | 出街後對一次 `/api/version` 同 `stat backend/hymns.db` |
| R8 | A-4 410 化嘅 route 有真 client 打 | 低(2A 四條證據鏈封死) | 高 | `[deprecated-route]` log 一有非自己嘅 request 就 revert `ebe29ba` |

### 7.4 監察項(restart 之後第一個 24 小時)

```bash
# 1. access log 有冇正常出、bytes 係咪真數(唔再係 -)
tail -f <backend log> | grep '\[access\]'
#    要見到:GET /api/hymns 200 …ms 1474227b(或 372KB 級數 = 已經有 client 行 lite)
#    ⚠️ query string 唔會出,full vs lite 靠 bytes 分(§3.3)

# 2. A-4 410 有冇誤殺
grep '\[deprecated-route\]' <backend log>     # 只應該有我哋自己嘅測試

# 3. dataVersion 有冇真係追到檔(C-4 主指標)
curl -s localhost:3001/api/version ; stat -f '%m %z' backend/hymns.db
#    夜晚 job 完之後再對一次 —— 兩邊應該對得上,唔使 restart

# 4. 殘留 lock(R3)
ls -l backend/hymns.db.lock 2>/dev/null && echo '⚠️ maybeReload 而家係熄咗嘅'

# 5. RSS(R4/R6)
ps -o pid,rss,etime -p $(pgrep -f 'backend/server.js')
#    預期:第一次 /api/hymns 之後 ~200MB 級數並企定。持續向上爬 = 有嘢唔妥

# 6. brotli 實況(R1)
curl -s -o /dev/null -H 'Accept-Encoding: br, gzip' -w '%{size_download}\n' https://api.odemusics.com/api/hymns
```

### 7.5 回滾條件

| 觸發 | 動作 |
|---|---|
| `[deprecated-route]` 出現帶 App User-Agent 嘅 request | `git revert ebe29ba` + restart(只回滾 A-4) |
| App 開機拎唔到歌單 / 歌單有錯(例如 lite 同 full 撈亂) | `git revert 0519814 8d7a2d4` + restart(回滾 C-5+C-1,`/api/hymns` 返回改前狀態);⚠️ 前端 `d375f9a` 已經識 handle 404 → 自動退返 full,唔使同步 OTA rollback |
| dataVersion 亂跳 / 出到殘缺歌單 | `git revert ab78c98` + restart(只回滾 C-4);⚠️ 呢個係最有可能要用嘅一條,因為 C-4 係唯一改變「backend 幾時換資料」語意嘅一項 |
| RSS 持續向上爬過 1GB | `git revert 0519814` + restart(先剷 gz buffer),再睇 |
| backend 起唔到(`compression` import 爆) | `cd backend && npm install` 再 restart |
| 以上任何一項處理唔到 | `ops/deploy/approve.sh backend 84f2e03 --confirm` + `git checkout 84f2e03` + restart(全套回到今日 live) |

### 7.6 出街次序建議

1. (可選,建議做)落 §5.3 一行 route-scoped ETag,commit。
2. `ops/deploy/approve.sh backend <HEAD> --confirm` → `ops/deploy/backend-restart.sh`。
3. 即刻跑 §7.4 第 1/2/3/6 條。
4. **確認 backend 綠燈之後**先出 OTA(C-1 client `d375f9a`)。
   ⚠️ 次序唔可以倒轉:前端出咗、backend 未 restart 的話,`/api/hymns/lyrics`
   會 404 —— 前端 `fetchLyricsMap()` 有 handle(`map:null` → 維持 lite 顯示),
   但咁即係全庫暫時冇歌詞。**backend restart 一定要排喺 OTA 之前**
   (同 2026-09-01 HLS 嗰條紅線同一個道理)。

---

## 8. 我自己嘅限制(誠實交代)

1. **CF ↔ origin 之間送乜 `Accept-Encoding` 我量唔到**(唔准掂 prod / 唔准 restart)。
   所以 §5.4 個 brotli 損失係「條件成立就係咁」,唔係已證實嘅生產影響。
2. **冇起過真 `server.js`**,所以 middleware 註冊次序我係讀 source + slice harness
   推論嘅,唔係喺真 process 觀察。slice 用嘅係 committed 原文、真 `compression@1.8.1`,
   我認為等價,但唔係同一件事。
3. **`statSync` 1.228µs 我冇重量**,接受佢個數(量級合理、hot path 只一次 syscall)。
4. **C-4 喺真並發流量下嘅行為冇壓測**。`getDb()` dedupe 缺口我用 in-process
   `Promise.all` 證實存在,但「真 HTTP 流量幾時會撞同一個 event-loop turn」我
   只證到「日常唔會、boot / 同一 poll batch 會」,冇量頻率。
5. **前端 C-1 client(`d375f9a`)唔喺我今次範圍**,我只 grep 咗兩點做 backend
   合約覆核:冇 conditional GET(§5.3)、`mergeLyrics` 用 `?? ''`(§1.4)。
