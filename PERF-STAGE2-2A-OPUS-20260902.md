# PERF-STAGE2-2A-OPUS-20260902 — Opus 5 獨立驗收（backend A-1..A-6）

驗收對象：`PERF-STAGE2-2A-20260902.md`（Sonnet 5 證據表）+ 五個 commit
`06d0cb8` `8f56b02` `5943880` `ebe29ba` `77fa5ee`，執行單 `PERF-STAGE2-EXEC-20260902.md` §2A + §4 Addendum。
我自己 baseline 驗收：`PERF-BASELINE-OPUS-20260902.md`（下面引用 §4c/§4e/§5.3）。

**鐵律遵守聲明**：全程零 source 改動、零 commit、零 restart、零部署、冇掂 Cloudflare、冇寫過
`backend/hymns.db`（只讀）、冇開模擬器、冇起第二個 `server.js`。所有量度用我自己寫嘅 harness，
放喺 scratchpad（`/private/tmp/.../scratchpad/opus-harness.mjs`、`opus-a1-invalidation.mjs`、
`opus-a6-bytes.mjs`、`opus-fieldbytes.mjs`），收工已 `pkill`（`pgrep -fl opus-harness` = 空）。

**我個 harness 同 Sonnet 個唔同嘅地方（重要）**：我唔重寫任何 backend 邏輯，而係由
`backend/server.js` **原文 slice 出嗰幾段 source text**（用 anchor 搵行號，唔硬編），
喺 `new Function('app','compression','getDb','getDataVersion', code)` 入面原文執行：

```
[harness] listening 3999 compression=true accesslog=true
          slices comp=48-55 access=84-98 hymns=292-347
```

即係我測嘅係 **committed 嗰段字**本身，唔係佢嘅複製品。routes/*.js 直接 dynamic import 真檔
（已核實 working tree 四個 route 檔同 `ebe29ba` byte-identical、`server.js` 同 `77fa5ee`
byte-identical —— 所以 Stage 3 agent 未落任何改動，我判嘅同 commit 一致）。

---

## 0. 總判定

| 項 | 判定 | 一句理由 |
|---|---|---|
| A-1 cache | **PASS** | 正確性我用 committed handler 原文行過 miss→hit→變→miss→hit→還原→miss 全綠；race 分析結論係「結構上開唔到窗」；cache 冇引入新嘅 staleness（見 §1.3 —— live process 本身已經 stale 10.9 鐘頭，同 A-1 無關） |
| A-2 compression | **PASS** | 1,474,227 B 我重現到（分毫不差）；exclusion list **實測係 load-bearing**（我用 synthetic 206 probe 證明冇排除就真係會 gzip 埋 206 + 剷走 Content-Length）；今日冇漏 route |
| A-3 access log | **有保留（可出街）** | `req.path` 修法正確、正/負控我自己重做過全綠；但 **同 A-2 撞：所有壓縮過嘅 response，bytes 欄一律出 `-`**，即係最想量嗰條 `/api/hymns` 永遠冇 bytes |
| A-4 410 | **PASS（風險我獨立收窄到零），但要求一個 carve-out** | 舊 client 風險我用四條互相獨立嘅證據鏈封死（§4）；但 `/api/audio/cache/stats` + `/cache/warm-stats` **唔應該 410** —— 佢哋唔掂 DB、零 perf 收益、而且上星期先用過 |
| A-5 Cache-Control | **無害，但唔係「無效改動」** | 實測帶 `If-None-Match` 真係出 304/0 bytes；佢而家零收益係因為前端唔送，唔係因為機制唔 work。判「無害 + 現時 inert」 |
| A-6 提案 | **FAIL（估算錯 2–3 倍）** | lyrics 唔係 payload 嘅 23.85%，係 **47.85%**；lite+gzip 唔係 1.12MB，係 **372KB**。方向啱，但個數全錯，而且錯嘅方向係**低估咗 A-6 嘅價值** |
| 證據表格式 | **大致合格，兩處要記低** | §6 有一句越界判詞（而且係錯嘅）；A-3 個「零」正控唔夠硬 |

---

## 1. A-1 —— `/api/hymns` response cache

### 1.1 我自己跑嘅對數（同一 process，run1 = 冷 compute）

`curl -H 'Accept-Encoding:'`（逼走 gzip，隔離 A-1）：

```
run1 code=200 size=5567648 total=0.138331s   ← miss，行足 SELECT+getAsObject+stringify
run2 code=200 size=5567648 total=0.014510s
run3 code=200 size=5567648 total=0.012343s
run4 code=200 size=5567648 total=0.012208s
run5 code=200 size=5567648 total=0.012439s
```

Sonnet 報 78.5/83.1/131.8 → 12.3/12.5/134.9。**重現到**，量級一致（我 cold 138ms 落喺 1A A2
嗰個 110–190ms 區間）。省到嘅 server 側時間 ≈ **每 request 125ms**。

### 1.2 正控：cache 係咪嚴格跟 dataVersion 走（我做咗一個比 Sonnet 強嘅版本）

Sonnet 個 `2a-a1-positive-control.log` 係**複製**咗 cache 判斷演算法再測 —— 即係佢驗證緊自己
抄嗰份，唔係 committed 嗰份。我改為：slice 出 `backend/server.js` **292-347 行原文**，注入一個我
控制得到嘅 `getDataVersion`，等真 handler 自己決定 hit 定 miss：

```
[slice] backend/server.js lines 292-347
r1 (V1, 冷):              dataVersion(in body)=V1  computeRan=true
r2 (V1, 應該 cache hit):   dataVersion(in body)=V1  computeRan=false
   r1===r2 byte-for-byte: true
r3 (dataVersion 變 V2):    dataVersion(in body)=V2  computeRan=true
r4 (V2, 應該 hit):         dataVersion(in body)=V2  computeRan=false
   r3===r4 byte-for-byte: true | r1===r3: false
r5 (轉返 V1 → 再 miss):    dataVersion(in body)=V1  computeRan=true
總 compute 次數 = 3（預期 3）
```

**PASS。** 而且順手證埋 `r1===r2` / `r3===r4` byte-for-byte，即係 cache hit 出嘅 body 同
fresh-compute 出嘅完全一樣。

### 1.3 `reloadDb()` 路徑 + race —— 我嘅獨立分析（同一個 Sonnet 冇講嘅重點）

`backend/lib/serverDb.js:33-55`：

```js
let dbPromise = null;
let dataVersion = computeDataVersion();      // ← 只喺 import 嗰刻計一次
export function getDataVersion() { return dataVersion; }   // 唔會每次 stat
export function reloadDb() { dbPromise = null; dataVersion = computeDataVersion(); }
```

**(a) admin 寫入路徑：安全。** `reloadDb()` 唯一呼叫者係 `backend/lib/adminHymns.js:93,125,166,195`
（四個寫入點全部有 call）。佢**同一句**清 `dbPromise` 同重算 `dataVersion` —— 兩者唔可能離婚。
下一個 `/api/hymns` 見到新 dataVersion → miss → `getDb()` 由碟重讀 → 正確。

**(b) race（reload 撞正 request 中途）：結構上開唔到窗。** handler 讀兩次 dataVersion
（`server.js:297` 入口、`server.js:336` 存 cache 前）。理論風險係「攞舊 db 嘅資料、用新
dataVersion 做 key」→ 永久 stale。我逐個 yield point 追過：

- `await getDb()`（`server.js:302`）當 `dbPromise` 已存在 → 只係一個 **microtask**，Node 一定
  行完 microtask queue 先接下一個 I/O event，**其他 request 嘅 handler 插唔入嚟**。
- `dbPromise` 係 null 嗰次，唯一真 yield 係 `await initSqlJs()`，而佢**喺 `fs.readFileSync` 之前**
  —— 就算 `reloadDb()` 喺呢個窗口射，跟住嗰句 readFileSync 讀到嘅係**新**檔，同新 dataVersion 一致。
- 由 readFileSync 到 `server.js:336` 之間（`new SQL.Database` → SELECT loop → getDataVersion）
  **全部同步**，冇 yield。

⇒ **冇 race。** 呢個結論靠嘅係「`getDataVersion()` 唔會每次 stat」呢個性質 —— 如果第日有人把佢
改成每次 `statSync`，上面呢條推理即刻失效。**建議喺 `serverDb.js` 個 `getDataVersion` 上面留一句**。

**(c) 夜間 job / 其他 session 寫 hymns.db（out-of-process）：A-1 冇令佢變差，但呢度有個既有病，
而且 Sonnet §6 對佢下咗一句相反嘅判詞。** 實測：

```
live :3001 /api/version → {"dataVersion":"1788274394187.32-61054976"}
真檔 statSync           →  file mtimeMs-size = 1788313502009.5908-61054976
差 = 39,107,822 ms ≈ 10.86 鐘頭
```

即係：**live backend 而家 serve 緊一份落後 10.9 鐘頭嘅 dataVersion，同一份落後 10.9 鐘頭嘅
in-memory DB**（`dbPromise` 同 `dataVersion` 一齊食死，因為冇人 call `reloadDb()` —— 歌詞班/
夜間 job 係另一個 process 寫檔）。

- **對 A-1 嘅判斷**：body 本來就係由呢份 stale 記憶體 DB 計出嚟，A-1 只係唔重複計同一份 stale
  body。**零 regression**，判 PASS。
- **對 Sonnet §6 嘅判斷**：佢寫「呢個差異反而證明 dataVersion 機制本身係即時追蹤緊真檔案變化,
  冇食死」——**呢句錯，而且係反轉咗**。harness 係新 spawn（import 嗰刻計）先至係新值；live
  process 正正就係食死咗。呢句係 §7 講嘅越界判詞（見 §7）。
- **Follow-up（唔喺 2A 範圍）**：如果想 out-of-process 寫入即時見效，要 `fs.watch(DB_PATH)` 或者
  一個 admin-only `POST /api/internal/reload`。而家嘅事實係「唯一令佢見到新歌嘅方法 = restart」。

### 1.4 kids→lang / real_lang 墊有冇入 cache

有。`server.js:325-328` 個 `for (const h of hymns) { h.real_lang = h.lang; if (h.kids) h.lang='兒童'; }`
喺 `JSON.stringify`（:336）**之前**，所以係入咗 cache 嗰份 string 入面。我 §1.2 個 byte-for-byte
比對已經覆蓋咗（cache hit 同 fresh compute 完全一樣）。Sonnet §6 個 live-vs-harness diff（除
dataVersion 外零差異）亦係同一結論嘅獨立證據 —— 呢個 diff 我認可，做法（pretty-print + sort-keys
再逐行 diff）夠硬。

### 1.5 記憶體：5.5MB 常駐可唔可以接受

可以。三個理由：
1. 絕對值細：5.57MB string 相對 live backend 常態 RSS（1A 記 ~150MB–700MB+ 波幅）係 <4%。
2. 佢**取代**緊一個更貴嘅 transient：每次 request 本來都要即場砌一個 6,405 個 object 嘅 array
   + 一個 5.5MB string（即係本來每 request 都有 peak，只係即用即棄）。cache 令 peak 變常駐但
   **消滅咗重複 allocate/GC**。
3. 只有一份（`hymnsResponseCache` 係 module-level 單一 slot，換 dataVersion 就整份換）。

⚠️ 但要記低一個**新增**嘅 CPU 常駐成本，見 §2.3：A-2 令每個 request 重新 gzip，A-1 慳返嘅
125ms 有 96ms 俾 gzip 攞返。

---

## 2. A-2 —— compression

### 2.1 filter 覆蓋審查（`server.js:48`）

```js
const COMPRESSION_EXCLUDE_PATHS = [/^\/api\/stream/, /^\/api\/hls/, /^\/api\/audio/,
                                   /^\/app\.apk/, /^\/downloads/];
```

我 grep 晒全 backend 邊啲 route 會派 range / binary：

```
backend/server.js:192  res.sendFile(filePath, ...)   ← /app.apk        （已排除）
backend/server.js:206  res.sendFile(filePath)        ← /downloads/app.apk（已排除）
（express.static 已經喺 server.js:209 個註解講明剷走咗）
routes/stream.js / routes/hls.js                     ← 唯二 range server（已排除）
```

`/api/hls` router 仲有第二個 mount 喺 `/api/stream`（`server.js:116`）—— 兩個 prefix 都喺
exclusion list，**冇漏**。

**執行單問嘅 `/.well-known`**：`sendAASA`（`server.js:162-176`）出嘅 JSON 約 150 B，
**喺 threshold 1024 以下，壓唔到**。就算壓到都係標準行為（Apple 個 fetcher 收得 gzip）。
**判：唔使加入 exclusion list。**

**`/api/client-log` POST**：compression 只掂 response，佢個 response 幾十 byte < threshold；
request body 由 `express.json()` 處理（本來就識 inflate）。**不受影響。**

### 2.2 filter 係咪 load-bearing —— 我做咗一個 Sonnet 冇做嘅測試

Sonnet 證明咗「排除咗嘅 route 冇被壓」（`2a-a2-stream-hls-unaffected.log`，206 + content-range
+ content-length 全部原封不動 —— 呢個我認可）。但佢冇答**「如果冇排除會點」**。我加咗一條
synthetic 206 probe（唔喺 exclusion list、`Content-Type: application/json`、帶
`Content-Range` + `Content-Length`）：

```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-49999/1000000
Content-Encoding: gzip          ← 真係壓咗
Transfer-Encoding: chunked      ← Content-Length 俾剷走
```

⇒ **`compression` 完全唔理 206**，一樣照壓、照剷 Content-Length。即係話個 exclusion list
**唔係裝飾，係擋住 AVPlayer range 播放斷片嘅唯一嘢**。

**建議（Stage 3 或者跟手一個 commit）**：由「黑名單 path」升做「黑名單 + 語意 guard」，
喺 filter 入面加一句：

```js
if (res.statusCode === 206 || res.getHeader('Content-Range')) return false;
```

（`compression` 個 filter 係喺第一次 `res.write/end` 嗰刻先 call，嗰陣 statusCode/headers 已
set，所以呢句攞得到值。）咁第日有人加新 range route 唔記得改 exclusion list 都唔會炸。

### 2.3 bytes / 時間 —— 我自己嘅數

```
帶 Accept-Encoding: gzip ×5
run1 code=200 size=1474227 total=0.110565s
run2 code=200 size=1474227 total=0.109618s
run3 code=200 size=1474227 total=0.108644s
run4 code=200 size=1474227 total=0.109005s
run5 code=200 size=1474227 total=0.107658s
```

`1,474,227 B` —— 同 Sonnet、同 1A 量到嘅 CF edge gzip size 分毫不差。**PASS。**

**但要記低一件 Sonnet 冇點名嘅事**：cache hit 12.4ms → 帶 gzip 108.7ms。**gzip 冇 cache，
每個 request 燒 ~96ms CPU**，即係 A-1 慳返嘅 125ms 有 77% 即刻俾 A-2 攞返。
喺呢個 trade 上 A-2 仍然抵做（4.09MB vs 96ms CPU，見 §2.5），但：

> **建議（高性價比、純 backend）**：連 gzip buffer 一齊 cache（同一個 dataVersion key，存
> `{json, gzipBuffer}`，hit 時如果 client 有 `Accept-Encoding: gzip` 就直接
> `res.set('Content-Encoding','gzip').send(buf)`）。咁 `/api/hymns` 就會係 ~12ms + 1.47MB，
> 兩樣好處都攞晒。開機同時開幾部機／retry storm 嗰陣呢 96ms×N 係會排隊嘅。

### 2.4 Cloudflare 之後嘅行為

- **唔會 double-gzip**：CF 見 origin response 已經有 `Content-Encoding: gzip` 就直接轉發，
  唔會再壓一次。（1A 已經量到 CF edge 出 1.47MB；origin 而家出 1,474,227 B —— 同一個數，
  即係 client 端收到嘅 bytes **完全冇變**。）
- **`Vary: Accept-Encoding`** 由 compression 自動加咗（我 header dump 見到），CF cache key
  正確。而家 57 組合全 DYNAMIC，冇 cache，所以呢點暫時 moot。
- **唔支援 gzip 嘅 client**：CF 會幫佢解壓（standard behaviour）；就算直連 origin，冇送
  `Accept-Encoding` 就照收 5,567,648 B plain —— 我實測過（`total=0.014025s size=5567648`）。
  **舊 client 零 format 改動。**

### 2.5 真收益估算（**只可以估，以下唔係實測**）

真收益喺 **origin→edge 嗰段**（5.57MB → 1.47MB，慳 4,093,421 B）。edge→client 段冇變。

用我 baseline §4c 嘅結論做基礎（**單次** `/api/hymns` fetch ≈ 2.3–3.6s，唔係執行單 B1 嗰個
10.3–11.6s —— 嗰個係「8s 白燒 + 真 fetch」）：

| 假設 | 有效 origin 吞吐 T | 慳 4.09MB ⇒ |
|---|---|---|
| 1A prod total 2.5–3.0s，扣 B4 嘅 0.77s RTT 地板 ⇒ transfer 1.7–2.2s | 2.5–3.2 MB/s | **1.3–1.6s** |
| 我 baseline spot re-run 4.7–5.3s ⇒ transfer 3.9–4.5s | 1.2–1.4 MB/s | **2.9–3.3s** |

⇒ **估算區間 ≈ 1.3–3.3s**。

⚠️ **兩個唔准跳過嘅 caveat**：
1. 記憶入面嗰個「上行 0.65MB/s」係 **2026-08-31 喺串流路徑量、而且當時行緊 VPN**。如果照
   0.65MB/s 計，5.57MB 要 8.6s，但 1A 實測整條 `/api/hymns` total 得 2.5–3.0s —— **兩個數
   對唔上**，所以呢度**唔可以**用 0.65MB/s 推出「慳 6–8 秒」。我用返實測 total 反推吞吐。
2. 上面假設 origin leg 主導、CF 係 streaming proxy。真數要 A-2 出街之後同一儀器交錯量
   （baseline §5.4 紀律）先算數。

**點解呢 1.3–3.3s 特別重要**：baseline §4c 證明第一次嘗試 **5/5 撞爆 8s timeout**。如果第一次
嘗試由 >8s 跌到 8s 以下，`hymnsMs` 就會由「8000 白燒 + 2.3–3.6s」變成「一次過 2–4s」，
即係開機慳嘅**唔止**傳輸嗰 1.3–3.3s，仲有嗰 8s 白燒。**A-2 同 F-1 有交互作用，F-1 嘅
改前基準要喺 A-2 出街之後重新量**（否則兩個改動搶同一份功勞）。

---

## 3. A-3 —— access log

### 3.1 格式 / 位置 / `req.path` 修法

middleware 喺 `server.js:84-98`，即係 cors(37)/json(38)/compression(49)/host-redirect(66) 之後、
所有 `/api/*` mount（100 起）之前。**位置正確**，我核過 37–83 行之間冇任何 `/api/*` route。

`req.path` 嗰個修法（`server.js:85` 入口即刻讀入 local `p`）**正確**，而且我獨立驗證到：

```
[access] ... GET /api/home/daily-verse 200 0ms 185b      ← 唔係 /daily-verse
[access] ... GET /api/category/mandarin 410 1ms 113b
```

Sonnet 描述個 Express 陷阱（sub-router dispatch 就地改 `req.url`、response 完咗冇 `next()`
唔會復原）**成立**，呢個係真 bug、真修好。

### 3.2 正控 / 負控（我自己重做，同一批 request）

```
/api/stream/999    -> 404   （冇 [access] 行）
/api/hls/999.m3u8  -> 404   （冇 [access] 行）
/api/client-log    -> 404   （冇 [access] 行）
/api/version       -> 200   → [access] 2026-09-02T08:13:08.063Z GET /api/version 200 0ms 45b
```

**負控 + 正控同一批、同一 process。PASS。**
（Sonnet 個 `2a-a3-before.log` 只有 harness 啟動行，冇任何證據話佢真係打過 curl —— 一個「零」
配一個冇證據嘅動作，係弱正控。我上面呢個先係硬嘅形式。）

### 3.3 🔴 保留一：同 A-2 撞，bytes 欄對壓縮過嘅 response 一律出 `-`

```
[access] ... GET /api/hymns 200 137ms 5567648b     ← 冇 Accept-Encoding
[access] ... GET /api/hymns 200 110ms -b           ← 帶 gzip（compression 剷走 Content-Length）
[access] ... GET /api/hymns 200 109ms -b
[access] ... GET /api/fake206 206 1ms -b
[access] ... GET /api/hymns 304 10ms -b
```

`res.getHeader('content-length')`（`server.js:95`）喺 compression 之後一定係 `undefined`。
Sonnet 個 A-3 測試冇撞到，係因為佢啲 curl 冇送 `Accept-Encoding`（見
`2a-a2-after.log` 自己都寫「curl default sends none unless --compressed」）—— **真 App 會送**。
⇒ **出街之後，`/api/hymns`（唯一一條你想量 bytes 嘅 route）永遠冇 bytes。**

修法（純 backend，一行）：用 `res.socket.bytesWritten` 差值，或者喺 finish handler 加
`res.getHeader('content-encoding')` 做標記，或者最簡單 —— 記低係「壓縮咗」而唔係 `-`：

```js
const bytes = res.getHeader('content-length') ?? (res.getHeader('content-encoding') ? 'gz' : '-');
```

### 3.4 對 stream 高頻 request 嘅性能影響：已排除

`/api/stream`、`/api/hls` 喺 middleware 第二句就 `return next()`（`server.js:91`），成本 =
兩個 `startsWith`，冇 `Date.now()`、冇 `res.on`。**冇量度必要，讀碼已封閉。**
其餘 route 每個 request 加一個 closure + 一個 `Date.now()` + 一行 stdout —— 我 harness
`/api/hymns` cache-hit 由 12.2ms 到 14.5ms 嘅波幅本身已經蓋過呢個成本。

### 3.5 log volume 估算

`/tmp/hymn_backend.log`（launchd `StandardOutPath`，`com.hymnapp.backend.plist`）：
3,185,000 B / 21,409 行 / 窗口 2026-08-23T01:33 → 2026-09-02T08:01（10.27 日）
⇒ **現況 ≈ 2,084 行/日、310 KB/日**。內容分佈：

```
7322 [resolve]   6771 [stream]   607 [hls]   194 🔖(/api/version)   169 📚(/api/hymns)
```

新增嘅 `[access]` 行：`/api/hymns`(16/日) + `/api/version`(19/日) + growLibrary 每 15 分鐘打
一次 `/api/internal/activity`(96/日) + `/api/me/*`、`/api/app-version`、`/api/auth/*`、
`/api/admin/*`（現時完全冇 log，估幾十至一兩百）
⇒ **估 200–400 行/日 ≈ 25–50 KB/日 = 現況嘅 +8–16%。可以接受。**

⚠️ **附帶發現（既有問題，唔關 A-3 事但 A-3 令佢惡化少少）**：呢個 log **完全冇 rotation**
（`/etc/newsyslog.conf` 同 `/etc/newsyslog.d/` grep `hymn` = 零命中，`/tmp/hymn_backend.log*`
只得一個檔）。淨係靠 reboot 清。建議加一個 newsyslog entry 或者 launchd 定期 truncate。

### 3.6 一個要寫落 runbook 嘅語意陷阱

`res.on('finish')` 係「response 寫晒落 socket」，唔係「client 收晒」。我實測過：客戶端連
socket 都唔讀就 destroy，**一樣有 log 行**，`ms=406`（= abort 時間），`status=200`：

```
[access] 2026-09-02T08:12:40.764Z GET /api/hymns 200 406ms 5567648b   ← 其實 client 半個 byte 都冇收完
```

⇒ **`[access]` 嘅 `ms` 對大 response 嚟講唔係「server 處理時間」，係「寫落 socket 嘅時間」**，
經 tunnel 會包埋上行傳輸。好處：`/api/hymns` 嗰個 ms 會真係反映到 ~8s 級嘅慢；壞處：
**一條「client 8s timeout abort 咗」嘅 request 同一條「成功但慢」嘅 request 喺 log 入面
一模一樣（都係 200 + 大 ms）**。分析 A-4/F-1 嘅時候唔好當佢係 success rate。

---

## 4. A-4 —— 410

### 4.1 覆蓋範圍核對（before/after route list 逐條）

| 檔 | before | after | 判 |
|---|---|---|---|
| `search.js` | /all /title /artist /lyrics /album（5） | 5 條全 `gone` | ✅ 齊 |
| `category.js` | 8 條 | 8 條全 `gone` | ✅ 齊 |
| `audio.js` | /:youtubeId /cache/stats /cache/warm-stats（3） | 3 條全 `gone`，順序不變 | ⚠️ 見 §4.4 |
| `home.js` | 10 條 | 9 條 `gone` + `/daily-verse` 原邏輯 | ✅ 啱 |

`export { cache }` 由 `audio.js` 剷走 —— 我 grep 過全 repo，**冇任何地方 import 佢**
（`server.js:14` 只係 `import audioRoutes from './routes/audio.js'` default import）。
`lib/resolveAudio.js`／`lib/opsMetrics.js` 仲有 9 個其他 importer，唔會因為 audio.js 唔 import
而消失。**唔會 restart 即炸。**

### 4.2 我自己跑嘅 410（每條 ×3）+ 正控

```
/api/category/mandarin          410 113B  1.0ms / 0.7ms / 0.5ms
/api/search/all?q=x             410 113B  1.1ms / 0.5ms / 0.4ms
/api/audio/PG_J_0gsMXA          410 113B  0.7ms / 0.5ms / 0.5ms
/api/audio/cache/warm-stats     410 113B  0.5ms / 0.5ms / 0.4ms
/api/home/genre-recommendation  410 113B  0.5ms / 0.6ms / 0.4ms
正控 /api/home/daily-verse      200 185B  0.6ms / 0.5ms / 0.5ms
RSS：176,272 KB → 176,944 KB（15 個 410 + 3 個 200，+672 KB）
```

對比改前（`2a-a4-before.log`）`/api/category/mandarin` = 200 / 35,145,812 B / 278–308ms、
RSS 713,920 → 871,536 KB。**PASS，重現到。**

### 4.3 舊 client 風險 —— 我獨立覆核咗 Fable 5.1 嗰個歷史 grep，**結論一樣，但佢個方法有窿**

**先講方法窿**：Fable 報「`api/search` / `api/category` / `api/home/` `git log -S` 零命中」。
我重跑，`api/search`＝0、`api/category`＝0、`api/home/`＝0 —— 數字啱。**但呢三個 pattern
結構上搵唔到嘢**：

```js
// frontend/hymn-app/src/services/searchApi.js @71595c2
const API_BASE = 'https://lifetree-hymn-api.zeabur.app/api';
fetch(`${API_BASE}/search/all?q=...`)      // ← 字面上冇「api/search」呢串字
// frontend/hymn-app/src/services/homeApi.js
const HOME_BASE = `${API_BASE}/api/home`;
fetchJSON(`${HOME_BASE}/daily-verse`)      // ← 字面上冇「api/home/」
```

**即係「零命中」係一個 false-negative-prone probe 啱啱撞啱答案**（同我 baseline §4e 記低嗰個
「冇正控就會證實 `/api/hymns` 都零引用」係同一族陷阱）。我改用**方法名 pickaxe**重做：

```
git log -S <name> -- frontend/     （全 history；已核實 frontend/ 由 initial commit 就存在，冇 rename gap）
daily-quote 2  featured-artist 2  new-releases 2  genre-recommendation 2  based-on-taste 2
resonating 3   top-verses 2       folk-sharing 2  combined-charts 2
```

**唔係零** —— 呢 9 個方法喺 `homeApi.js` 由 2026-07-09 活到 2026-08-19。所以要再問一層：
**有冇 build 真係 call 過、而且指住我哋呢個 origin。** 我逐個時間點查 call site + `API_BASE`：

| 日期 | `API_BASE` | homeApi call sites | search/category call sites |
|---|---|---|---|
| 2026-07-12 | `https://4e152f1ef...serveousercontent.com`（serveo 臨時 tunnel，已死） | **9 個全部 call 緊** | CategoryScreen/SearchScreen 有 call |
| 2026-07-18 (`16691f3`) | **轉做 `https://api.god-music.com`** | **同一個 commit 剷走 8 個，只剩 `getDailyVerse`** | 同上（但指住 zeabur） |
| 2026-08-08（Android 首發） | `https://api.odemusics.com` | 只有 `getDailyVerse` | 同上 |
| 2026-08-11（iOS 首發） | `https://api.odemusics.com` | 只有 `getDailyVerse` | 同上 |
| 2026-08-19 (`e9c5f18`) | — | — | SearchScreen/CategoryScreen/searchApi/categoryApi **整批刪**（commit 訊息：「unreachable 舊 react-navigation 檔案」） |

**四條互相獨立嘅證據鏈，全部指同一個結論（風險 = 零）**：

1. **`/api/audio`**：前端最後一次引用喺 `635530c`（**2026-07-15**），早過任何指住 live domain
   嘅 build（07-18 先轉 god-music.com）。
2. **`/api/search` + `/api/category`**：`searchApi.js`/`categoryApi.js` **成世都硬編
   `https://lifetree-hymn-api.zeabur.app/api`**，唔係 `API_BASE`。就算有舊 APK 帶住呢兩個
   screen，佢打嘅係 Zeabur，**物理上打唔到 api.odemusics.com**。（呢條比 grep 硬。）
3. **`/api/home` 9 條**：8 個 call site 喺 `16691f3` 剷走，而 `16691f3` **就係**引入
   `api.god-music.com` 嗰個 commit。之前所有版本指住一條已死嘅 serveo tunnel。
4. **首發時點快照**：08-08 同 08-11 兩個 tree 我 `git grep` 過，`homeApi.` 只有一個 call site
   = `getDailyVerse`（`HomeScreen.js:367` / `:376`）。

**加多一層安全網**：就算真係有一部化石機打過嚟，`homeApi.js` 個 `fetchJSON` 對非 2xx 係
`throw`，而舊 HomeScreen 每個 call 都係 `.catch(() => [])` / `.catch(() => null)`
⇒ **410 只會令 section 空白，唔會 crash、唔會白畫面。**

**判：A-4 (a) 舊 client 風險 = 零。我 baseline §5.3 建議「access log 跑一日先 410」嗰個理由
（「三條 route 一行 log 都冇，所以量唔到」）已經俾呢個歷史審計取代 —— 我撤回嗰個前置條件。**

### 4.4 🔴 唯一保留：`/api/audio/cache/stats` + `/cache/warm-stats` **唔應該 410**

A-4 個 perf 理據係「每 request 重開 61MB DB」。呢兩條**根本唔掂 DB**：

- `/cache/stats` 讀 `failCache` in-memory Map（`routes/audio.js:83-107` 舊版）
- `/cache/warm-stats` 讀 `getOpsMetrics()` in-memory counter（`lib/opsMetrics.js`）

兩條都係 <1ms、零 RSS 影響。**佢哋唔係 App 用嘅 route，係我哋自己嘅維運觀察口**，而且
memory 有記錄上星期先用過（`warm-stats` 穩態 13 格/59MB/RSS ~151MB，2026-08-31 量，
STARTUP-ROOTFIX 期間）、2026-07-28「神我屬祢」卡 loading 事故就係靠 `/cache/stats` 睇
failCache 先斷到症。`lib/opsMetrics.js:276` 同 `lib/resolveAudio.js:418` 兩處註解仲係指住
呢兩條 endpoint。

⇒ **410 佢哋 = 零 perf 收益 + 剷走兩件下次撞 stall 事故要用嘅儀器。**
**建議：出街前補一個 commit，`/cache/stats` 同 `/cache/warm-stats` 還原**（`/:youtubeId`
照 410）。`export { cache }` 唔使還原（冇人用）。呢個係我對 A-4 唯一嘅 blocking-ish 意見
（唔還原都唔會壞嘢，但係一個唔抵嘅損失）。

順帶：`backend/check_hymns.cjs` 打 `/api/audio/:id` 會撞 410 —— Sonnet §8.2 已經明文記低，
而且 Stage 3 本來就要刪 backend root 舊 script，**唔算漏改**。

### 4.5 部署次序建議（(b) 題）

**建議：五個 commit 同一次 restart 一齊出，唔使分兩次。** 理由：

1. 分兩次做唔到 —— `ops/deploy/backend-restart.sh` 個 gate 要 `HEAD == approved.sha`
   （見 `2a-backend-restart-dryrun.log`），要先出 A-1..A-3 再出 A-4 就要 rebase / 開 branch，
   喺一個多 session 共用 worktree 度做呢件事嘅風險，遠大過 A-4 本身嘅風險。
2. 「等 access log 跑一日」嘅唯一理由已經冇咗（§4.3）。而且 A-3 同 A-4 一齊出反而**更好**：
   `[access]` 同 `[deprecated-route]` 同一刻開始有數，撞到嘅話兩邊對得返。
3. 回滾平：`git revert ebe29ba` + restart，唔使掂其他四個。

**但出街前要做嘅兩件事**：
- (i) §4.4 個 carve-out commit（還原兩條 in-memory 觀察口）；
- (ii) （可選但建議）§3.3 個 bytes `-` 一行修 + §2.3 個 gzip cache。呢兩樣都係純 backend、
  同一次 restart 就出得。

---

## 5. A-5 —— Cache-Control

### 5.1 值本身

| endpoint | 值 | 判 |
|---|---|---|
| `/api/hymns` | `private, max-age=0, must-revalidate` | 語意啱（每次都要 revalidate、唔准共享 cache 存）。⚠️ `private` 順手封死咗第日想用 CF shared cache 嘅路 —— `/api/hymns` **唔係** per-user 內容，嚴格嚟講 `no-cache` 已經夠。唔算錯，但係一個 gratuitous 嘅限制 |
| `/api/version` | `no-cache` | 完全啱（cache-bust probe 一定要每次 revalidate） |

兩條分支（cache hit `server.js:300` 同 fresh compute `server.js:341`）都有加，**冇漏**。
ETag 冇被碰（我實測兩邊都係同一個 `W/"54f4a0-FBwNriKnuMzO0pyf9jexRd+9n/Y"`，同 Sonnet 一致）。

### 5.2 同 A-1 ETag 嘅配合 —— **「無效改動」呢個標籤唔啱**

我實測帶 `If-None-Match` 返去：

```
etag=W/"54f4a0-FBwNriKnuMzO0pyf9jexRd+9n/Y"
with If-None-Match: code=304 size=0
```

**304 係 work 嘅、真係慳晒成 1.47MB。** 所以呢個機制冇壞，只係**前端唔送 If-None-Match**
（`useCachedHymns.js` 行嘅係另一套：先問 `/api/version` 攞 dataVersion，唔同先全量拉）。

⇒ **判：「無害 + 現時 inert」，唔係「無效改動」。** 兩者分別好緊要：
- 「無效」= 應該 revert；
- 「inert」= 留住冇成本，而且係一個**已經接好線、等前端插頭**嘅位。

**但我唔建議前端改去用 If-None-Match**：現有 `/api/version` 機制**更好**（45 B 就答完
「使唔使拉」，而 If-None-Match 要送成個 conditional GET 落 5.5MB 條 route，仲要俾 Express
計一次 ETag = 全 body hash）。⇒ **A-5 就咁擺住，唔使跟進。**（我 baseline §5.3 寫「A-5 連
前端 If-None-Match 一齊做，否則跳過」—— 呢句我修正：擺住，但唔好做前端嗰半。）

---

## 6. A-6 —— **提案嘅 bytes 估算 FAIL（錯 2–3 倍），但方向啱，而且錯嘅方向係低估**

Sonnet §7 用 1A A1 個欄位表外推。我**冇外推，直接量**（`opus-a6-bytes.mjs`：用
`server.js` 原文抽出嗰條 SELECT、行同一個 kids/real_lang 墊、真 `zlib.gzipSync`）：

```
rows=6405  有 lyrics=5387 (84.1%)
full         raw=5,567,648B   gzip=1,474,227B   ratio=26.48%
lite         raw=2,839,533B   gzip=  371,984B   ratio=13.10%
lyricsOnly   raw=2,702,660B   gzip=  992,859B   ratio=36.74%
lyrics 欄佔 full raw = 49.00%
lite+lyricsOnly gzip 合計 = 1,364,843B  vs  full gzip 1,474,227B
```

| 項 | Sonnet §7（外推） | 我實測 | 差 |
|---|---|---|---|
| lyrics 佔 payload | 1,327,724 B / **23.85%** | **2,728,115 B / 49.00%** | **少報一半** |
| lite raw | 4,239,922 B | **2,839,533 B** | 多報 49% |
| lite + gzip | ≈1,122,300 B | **371,984 B** | **多報 3.0 倍** |
| lyrics + gzip | ≈351,500 B | **992,859 B** | 少報 2.8 倍 |

### 6.1 根因：1A 個欄位表混咗單位（字元 vs UTF-8 bytes）

`PERF-BASELINE-1A-20260902.md:73` 寫 `| lyrics | 1,327,724 | 23.85% |`。
1,327,724 / 5,567,646 = 23.85% —— **分子係字元數（SQLite `length()` 對 TEXT 數字元），
分母係 bytes**。中文一個字 UTF-8 係 3 bytes，所以 CJK 欄位全部俾少報 2–3 倍。我逐欄重算
真 UTF-8 bytes：

```
field            chars(1A做法)     真UTF-8 bytes   %of payload
lyrics               1155488         2664065      47.85%
title                 282950          471581       8.47%
display_title         195735          323618       5.81%
created_at            121695          134505       2.42%
album                  41321          101632       1.83%
org                    37843           97483       1.75%
artist                 37868           97378       1.75%
youtube_id             70455           83265       1.50%
```

⇒ **1A A1 成張欄位表嘅百分比對 CJK 欄位系統性低估**，唔止 lyrics。呢個要寫返落 1A 做更正
（我 baseline §6 已經開咗一張「必須更正」表，呢條係第 4 條）。

### 6.2 做定唔做：**做，而且應該升做 Stage 2 剩低最抵嘅 backend 改動**

配合 A-2 之後嘅真收益（wire bytes 先係樽頸）：

| 方案 | 開機要落嘅 wire bytes |
|---|---|
| 今日（A-2 後） | **1,474,227 B** |
| A-6 lite（lyrics 延後） | **371,984 B（−74.8%）** |
| lite + 之後補 lyrics | 1,364,843 B（比而家一次過拉仲少 7.4%） |

即係話：**A-6 令開機那一刻要等嘅 bytes 由 1.47MB 跌到 372KB。** 用 §2.5 同一個吞吐推算
（1.2–3.2 MB/s），大約再慳 **0.35–0.9s**，而且係慳喺**首屏 critical path 嗰段**（lyrics 只有
撳開一首歌先用到，`App.js` §3.4）。加埋 A-2，`/api/hymns` 由 5.57MB → 0.37MB = **少 93.3%**。

Sonnet §7 個「風險/待決」寫「如果 `hymnsParse` 先係主要成本，減 bytes 幫助有限」—— 呢個
考慮啱，但要補一句：**lite 嘅 raw string 亦都由 5.57MB 跌到 2.84MB（−49%）**，`JSON.parse`
嘅成本同 input 長度大致線性（object 數目一樣，但 string scan 少一半），所以 parse 嗰段
**都會**受惠，唔係只有下載受惠。⇒ **唔使等 2B D-1 都拍得板**（D-1 嘅數只會影響「值唔值得
再做多啲」，唔會令 A-6 由抵變唔抵）。

實作提醒：`/api/hymns/lyrics` 要小心 route 次序（要喺 `/api/hymns` 之後、而且唔可以撞
`/api/hymns/:id`）；兩條都應該行 A-1 同一個 dataVersion cache（連 §2.3 建議嘅 gzip buffer
一齊 cache 就最抵）。

---

## 7. 證據表格式審核

| 檢查項 | 結果 |
|---|---|
| 每項有改前→改後同一指令 | A-1 ✅ / A-4 ✅ / A-5 ✅ / A-3 ⚠️（「改前」只有 harness 啟動行，冇證據話 curl 真係打過）/ A-2 ⚠️（「改前 payload」引用 `2a-a1-before.log`，但嗰個 curl **冇送** `Accept-Encoding: gzip`，同「改後」唔係同一條指令。數字啱——因為改前根本冇 middleware——但形式上破咗規） |
| raw 檔存在 | ✅ 全部 13 個檔存在、內容同表對得上（我逐個 cat 過） |
| 「零 X」有正控 | A-4 ✅（`daily-verse` 200 做正控）/ A-1 ✅ / A-3 ⚠️（見上；我 §3.2 補咗硬正控） |
| 執行者唔判 PASS/FAIL | ⚠️ 表格本身守規矩，但 `2a-a1-positive-control.log` 最後一行印咗 `PASS: cache hit/miss follows dataVersion exactly` —— raw 出面嘅字，算輕微 |
| 越界判詞 | 🔴 **一處，而且係錯嘅**：§6「dataVersion 唔同…呢個差異反而證明 dataVersion 機制本身係即時追蹤緊真檔案變化,冇食死」。實測反轉（§1.3）：live process 個 dataVersion 落後真檔 10.86 鐘頭。正確講法係「harness 係新 process 所以計到新值；live process 因為冇人 call reloadDb 所以停留喺舊值 —— 呢個差異同本次改動無關」 |
| 限制段誠實度 | ✅ 好。§8 六條（唔可以起真 server.js、check_hymns.cjs 會撞 410、RSS 唔可以同 1A 比絕對值、A-6 純估算、gate 冇跑到第二步、home.js 留低死 helper）全部我覆核過屬實，冇隱瞞 |

---

## 8. 部署建議

### 8.1 次序

```
0. 等 Eric 真機 HLS QA 嘅窗口收咗（memory 紅線：唔准喺 live QA 進行中部署）
1. 補 carve-out commit：還原 /api/audio/cache/stats + /cache/warm-stats（§4.4）
   （可選同一 commit：§3.3 bytes 'gz' 標記、§2.3 gzip buffer cache）
2. ops/deploy/approve.sh backend <新 HEAD> --confirm      ← 要 Eric go
3. ops/deploy/backend-restart.sh                          ← 五個 commit 一次過出
4. restart 後 60 秒內：驗 §8.2 頭三條
5. OTA（如果有）一定排喺 restart 之後（memory 紅線：唔可以倒轉，.m3u8 會撞 stream.js 出 400）
```

⚠️ approve 嗰個 sha 會**連埋** 2B 嘅前端 commit（`d51c3bc`、`fcfb62e`、`0ad1a3f`）一齊批 ——
呢個係 gate per-sha 嘅已知性質（memory 有記），對 backend 行為零影響，但批之前要知自己批緊乜。
另外 `compression@1.8.1` 我核實過已經喺 `backend/node_modules/`，`backend-restart.sh`
唔會跑 `npm install`，所以呢部機 restart 唔會缺 module。

### 8.2 監察項（restart 後）

| # | 睇乜 | 指令 | 期望 |
|---|---|---|---|
| 1 | 有冇 crash | `tail -50 /tmp/hymn_backend.log` | 見到啟動行，冇 `Cannot find module 'compression'` |
| 2 | gzip 真係開咗 | `curl -sD- -o /dev/null -H 'Accept-Encoding: gzip' https://api.odemusics.com/api/hymns \| grep -i content-encoding` | `gzip`，`size_download≈1474227` |
| 3 | stream 冇被壓 | `curl -sD- -o /dev/null -r 0-1023 -H 'Accept-Encoding: gzip' <stream url>` | `206` + `content-range` + **冇** `content-encoding` |
| 4 | 410 有冇真人撞到（48h） | `grep -c deprecated-route /tmp/hymn_backend.log`；逐條睇 | 期望 0。>0 就要睇係邊條 + 邊個時間 |
| 5 | A-1 cache 有冇食死 | `curl -s .../api/version` vs `stat backend/hymns.db` | 兩者一致（restart 後應該啱）；日後再飄開就係 §1.3 個既有病，唔係 A-1 |
| 6 | access log 量 | `grep -c '\[access\]' /tmp/hymn_backend.log`（隔日） | 200–400 行/日。>2000 就要收窄 |
| 7 | RSS | `ps -o rss= -p $(pgrep -f 'backend/server.js')` | 唔應該再見到 `/api/category` 式嘅階梯式增長 |

### 8.3 回滾條件

| 觸發 | 動作 |
|---|---|
| `[deprecated-route]` 有非我哋自己嘅 request（尤其帶 App User-Agent） | `git revert ebe29ba` + restart（只回滾 A-4） |
| 播歌出現 range/seek 壞（206 被壓） | `git revert 8f56b02` + restart。**呢個係 A-2 唯一真風險**，出街後頭一個鐘要試 seek |
| App 見唔到 admin 啱啱改嘅歌，而 `/api/version` 又冇變 | 先確認係咪 §1.3 個既有 out-of-process 病（restart 就會好）；如果 admin 寫入路徑都中招先 revert `06d0cb8` |
| `/tmp/hymn_backend.log` 一日漲 >1MB | 收窄 A-3（加多幾條 exclude）或者加 rotation，唔使 revert |

---

## 9. 三句總結

1. **五項全部可以出街**，A-1/A-2/A-4/A-5 我獨立重現晒，A-3 有兩個要記低嘅語意陷阱
   （bytes 對壓縮 response 出 `-`、`ms` 包埋上行時間）但唔擋部署。
2. **兩個 blocking-ish 意見**：出街前還原 `/api/audio/cache/{stats,warm-stats}`（410 咗
   佢哋零收益、剷走事故儀器）；A-4 唔使等一日 access log —— 我用四條獨立證據鏈證明咗
   **從來冇一個指住 live domain 嘅 build call 過呢啲 route**，我撤回 baseline §5.3 嗰個前置條件。
3. **最大發現喺 A-6**：1A 個欄位表混咗「字元 vs bytes」，lyrics 唔係 payload 嘅 24% 而係
   **48%**；lite payload gzip 之後係 **372KB 唔係 1.12MB**。⇒ A-6 由「等 2B 先算」升做
   **Stage 2 剩低最抵嘅 backend 改動**（開機 wire bytes 1.47MB → 372KB，−75%）。
