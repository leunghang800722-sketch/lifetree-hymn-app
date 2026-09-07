# 第一首歌 第0+1步 修補 —— Opus 5 第二輪獨立驗收 2026-09-07

覆核對象:`23853ab`(code)+ `6f9231f`(script/報告),對應 `FIRST-TRACK-STEP01-OPUS-20260907.md` 八條。
基準 `96c6b10`。純 backend。全程唔改 source、唔 commit、唔部署/restart、唔改 prod cache json、唔打 YouTube。
隔離副本喺 `/private/tmp/claude-501/.../scratchpad/firsttrack-opus2/`(兩份 repo 副本:`iso-hls/base-backend`=5d8f68b、`iso-core/prefix-backend`=96c6b10)。

---

## 結論

🟡 **條件性 GO —— 七條半過,一條(#3)要修先。**

八條之中 #2 / #4 / #5 / #6 / #7 / #8 / 細項全部獨立重做確認落地,行為同報告講嘅一致,
harness 全綠(95/95),playlist bytes 對 base `5d8f68b` **逐 byte 一樣**。

**唯一擋住嘅係 #3。** #3 嘅 64MB 守衛同「4MB cap」喺**帳面**上完全 work
(pinnedBytes 128MB → 63MB,實測),但用嘅係 `Buffer.subarray()`——**唔 copy**。
底層 12MB `ArrayBuffer` 一個 byte 都冇釋放,所以:

| | 帳面 `totalBytes` | 實測 `arrayBuffers`(真記憶體) |
|---|---|---|
| PRE-FIX `96c6b10`(12 個 pinned × 12MB tee) | 150.0 MB | **150.1 MB** |
| HEAD `6f9231f`(同一情境) | 54.0 MB | **150.1 MB** |

即係話 #3 **一個 byte 記憶體都冇慳到**,淨係令 gauge 報細咗 2.8 倍;
而 `evictBufferCacheOverflow()` 嘅 eviction 壓力係睇 `bufferCacheTotalBytes` 嘅,
帳面報細 → 少踢咗 non-pinned entry → **真 RSS 可以比修之前仲高**(粗算最壞 +90MB)。
修法係兩行字(見下面 P1),補完再 restart 最穩陣。

如果 Fable 決定即刻 restart:唔會爛播放、唔會爛 API(全部 harness + 我自己 26 條獨立
assertion 都過),但要接受 (a) `bufferCache.totalBytes` 呢個 after 指標會系統性報細,
(b) RSS 有機會上升。

---

## 逐條核 —— 我自己重做嘅結果

### 儀器正控先行
所有「零上游」/「打咗上游」嘅斷言都有反向控制:同一個 counter 喺 miss 路徑一定 >0
(`V1 miss 真係打過上游`)、md5 比較有「改一個 byte 就唔同」正控、pinned cap 有
「非 pinned 唔截」負控、64MB 守衛有 PRE-FIX 對照組。

### #2 URL clen 離線校驗 —— ✅ 過,而且我補咗執行者冇做嘅**真實數據正控**

- **同一實作,冇重複**:`backend/lib/urlItagClen.js` 係由 `routes/stream.js` 原本
  `extractItagClen` 原封搬出(diff 逐行對過,行為零改動),`stream.js:12` 同
  `hls.js:21` 兩邊 import 同一份。`stream.js` 舊定義已刪,冇兩份。
- **🏆 跨來源假設實地驗證(執行者只用 mock,冇驗過呢條)**:`urlClenMatches()` 攞
  **URL query 嘅 `clen`** 同快取入面**由 `content-range` 讀返嘅 clen** 對數 —— 呢兩個
  數唔係同一個來源。如果佢哋唔相等,每次命中都會 verifyfail、cache 永遠廢咗。
  我用 prod `backend/cache/resolve-cache.json`(純讀)對 S0-4 `sidx-stability-20260907.md`
  嗰 5 首歌交叉核對,3 首仲喺 cache 入面:

  | id | URL `clen` | `content-range` total | 一致 |
  |---|---|---|---|
  | 362 | 140232377 | 140232377 | ✅ |
  | 1550 | 7297548 | 7297548 | ✅ |
  | 3669 | 3373385 | 3373385 | ✅ |

  另外掃晒 353 條 cached URL:**353/353 有 `clen`、353/353 有 `itag`(全部 140)**
  → 離線路徑實質上 100% 命中,網絡 fallback 真係罕見路徑。
- **冇 clen 時 fallback**:V5 實測 —— mock URL 冇 query string → 命中走
  `verifyClenMatches()`,mock 端點**剛好被打 1 次**(唔係 0、唔係 2)。
- **itag 唔同、clen 同 → verifyfail**:V4 實測 —— `itag=140`→`itag=251` 而 clen 一樣,
  判 `cache=verifyfail`。(答返執行單問題:**係**,itag 唔夾一樣當作廢。)
- 換 format(clen 唔同)→ `cache=verifyfail` + 真係重新 resolve(V3)。
- `HLS_PLAYLIST_VERIFY=0` 逃生門仍在(V6)。
- 碟上 entry 有 `itag` 欄、key 係 `youtubeId`、`clen` 係數字(V2)。
- **⚠️ 一個語意差異,唔擋但要入帳**:舊嘅網絡校驗順手證明「呢條 URL 而家仲生存」;
  離線校驗證唔到。呢個唔成問題,因為 `buildM3U8()` 出嘅 segment URI 指返
  `/api/stream/:id`(自己 backend),URL 生死由 `stream.js` 現有 403 重試處理,
  而 byte offset 本身係媒體檔屬性,唔跟簽名 URL 走。

### #3 pinned 4MB cap + 64MB 守衛 —— 🔴 帳面過、真記憶體唔過

三條路我逐條驗:

| 路 | 結果 |
|---|---|
| (a) `adoptStreamedHead()` pinned 截 4MB | ✅ 12MB tee → 存低 `buf.length === 4,194,304`;負控:非 pinned 仍然 12MB |
| (b) `setPinnedIds()` 追溯裁剪 | ✅ 12MB entry 一 pin 落嚟即刻變 4MB,記帳同步扣 8.5MB(12MB head + 512KB tail → 4MB,**數字啱到 byte**) |
| (c) `evictBufferCacheOverflow()` 64MB 守衛 | ✅ 16 個 pinned(4MB+512KB)入池 → `pinnedBytes=66,060,288`(63.00MiB)≤ 64MiB,最舊 2 個俾 unpin,`pinned` 由 16 → 14 |

**64MB 守衛有真對照組**(執行者冇做):同一情境跑 PRE-FIX `96c6b10` →
`pinnedBytes=128.0MB / pinned=16 / totalBytes=128.0MB`(食晒成個閘,證實 Opus P1-3 原判斷成立);
HEAD → `63.0MB / 14 / 72.0MB`。守衛真係 fire 咗。

**記帳審計(四條 mutation 路)**:`warm入` / `adopt入` / `evict出` / `pin裁剪` 全部經同一個
`touchBufferEntry()`(先扣舊、後加新),我做咗獨立審計 ——
`sum(逐個 entry 嘅 buf.length + tailBuf.length) === getBufferCacheStats().totalBytes`,
16 個 entry **完全相等**。帳目本身冇第二份算法,呢點過。

**🔴 P1 —— 但個「4MB」係假嘅:**

```js
// backend/lib/resolveAudio.js:757
const cappedBuf = (isPinned && buf.length > LONG_WARM_CAP_BYTES) ? buf.subarray(0, LONG_WARM_CAP_BYTES) : buf;
// backend/lib/resolveAudio.js:496
buf: entry.buf.subarray(0, LONG_WARM_CAP_BYTES),
```

`Buffer.prototype.subarray()` 係 **view,唔 copy**。實測 pinned entry:
`buf.length=4,194,304` 但 `buf.buffer.byteLength=12,582,912` —— 底層 12MB 一個 byte 冇放。
caller(`routes/stream.js:705` `Buffer.concat(teeChunks)`)個 headBuf 係獨佔 allocation,
adopt 完唯一持有人就係呢個 subarray,所以成 12MB 跟住 entry 一世。

RSS 對照(`--expose-gc`,12 個 pinned × 12MB tee):

```
PRE  帳面 totalBytes=150.0MB  ΔRSS=228.1MB  ΔarrayBuffers=150.1MB
HEAD 帳面 totalBytes= 54.0MB  ΔRSS=225.1MB  ΔarrayBuffers=150.1MB
```

真記憶體 150.1MB **一模一樣**。而且因為 eviction loop 讀 `bufferCacheTotalBytes`,
帳面由 150 → 54 等於**放鬆咗 96MB eviction 壓力**,non-pinned entry 會留多咗,
真 RSS 反而可以升。production `PIN_N=12`,粗算最壞 12×12MB(pinned,實)+ 74MB
(non-pinned,帳面填到 128MB)≈ 218MB,對比今日 live(冇 pinned)≈128MB。

**修法(兩行,零風險)**:

```js
// :757
? Buffer.from(buf.subarray(0, LONG_WARM_CAP_BYTES))
// :496
buf: Buffer.from(entry.buf.subarray(0, LONG_WARM_CAP_BYTES)),
```

安全性我核過:`headBuf` 係 fire-and-forget 傳入 `adoptStreamedHead()`,caller 之後
完全冇再掂佢(`routes/stream.js:705-707`),所以 `zeroFragmentedMp4Durations()` 由
「就地改 caller 個 buf」變成「只改副本」冇任何 caller 依賴。
Harness 加一句就守得住:`entry.buf.buffer.byteLength <= LONG_WARM_CAP_BYTES + 一啲 slack`。

### #4 hotIds String key(三處)—— ✅ 過

`recordStreamHit()` 寫入 `String(hymnId)`(`hotIds.js:145`)、`loadFromDisk()` 讀入
`hits.set(String(id), ...)`、`getHotIds()` 出返 string。實測:
`recordStreamHit(1550 /* Number */)` → `getHotIds()` 出 `"1550"`(string,唔係 number);
碟上 key `"1550"`;restart(cache-bust re-import,真係行返 `loadFromDisk()`)之後
再用 Number 記一次 → `getHotIds()` 入面 `1550` **只出現 1 次**,冇分裂。

### #5 起播計法 —— ✅ 過

- `isStart` 判斷 `!req.headers.range || /^bytes=0-/.test(...)`(`stream.js:284`)——
  同下面 `startsAtZero`(`:678`)同一條式,刻意重複而唔搬 `clientRange` 聲明,
  理由(唔郁 fMP4 duration 段變數次序)成立。HLS 之下 init segment 係
  `bytes=0-<initSize-1>`,一樣中呢條 → 一次播放計一次,啱。
- `isStart=false` 完全唔入 hotIds(實測)。
- 連播(1 起播 + 30 條中段 range,同一 client)vs 開 3 次(3 個 client)→
  排名「開 3 次」贏,證實舊嘅「串流分鐘」病治好咗。
- 5 分鐘 dedup:同一 `id::ip|ua` 連續兩次起播只計 1 次。
- v2 檔:碟上 `{"v":2,"hits":{...}}`;我特登砌一個 v1 舊格式檔(冇 `v` 欄,
  key `7777`)→ 載入時**清零重計**,`7777` 冇出現。日誌行都有印。
- **⚠️ 唔擋嘅副作用**:`clientKey = cf-connecting-ip | ua`。同一 NAT / 同一 CF 出口
  + 同一 UA 嘅兩部機會被當同一個 client 去重 → **少計**。方向保守(寧少勿多),
  用途只係揀 warm 名單,可接受;但如果之後想用呢個數做「熱門榜」就要知呢件事。

### #6 `WARM_TOTAL_CAP` = 10 —— ✅ 過

用真身 `routes/stream.js` 起 express:client=6 → `{"warming":10}` + log
`client=6 hot=4 total=10`;client=10 → `client=10 hot=0 total=10`(唔再補);
client 傳 12 個 → route 自己 `slice(0,10)` 頂住,一樣 10。
- **🟡 P3 註釋過時**:`routes/stream.js:149` 個 comment 仲寫住「總數封頂
  `WARM_TOTAL_CAP`(**預設 16**)」,同 `:130` 已改嘅 10 唔夾。純註釋,唔影響行為。

### #7/#8 timeline 改寫 + `--control` 真引原行 —— ✅ 過

我重跑 `--dates=2026-09-06,2026-09-07 --control=1550`,輸出同 committed 報告
**除咗「產生時間」一行之外逐字一樣**(可重現)。正控段引咗 7 條原文
(1 條 `[hls]` + 2 條 `[stream]` + 1 條 `nextTrackMs` + 3 條 `hlsStartupKick` beacon JSON),
我逐條去 `/tmp/hymn_backend.log` 同 `client-log-2026-09-06.jsonl` 做子字串比對:
**7/7 逐字對得返原始 log 檔**,唔係摘要重印。P3-7 修好。
(重跑會覆寫 `ops/perf/first-track/timeline-20260907.md`,我已 `git checkout --` 還原,
working tree 冇留低改動。)

核心結論段已改成「累積 offset,唔係步驟耗時」,明文寫低 n=16 入面真正量到
`[hls] ms=` 得 1 個(hymnId=5839 ms=835),同 S0-4 獨立 n=10 對照,
負數段補返 (b) 已知 `nextTrackMs` HLS 早報 2–3 秒偏差。措辭我覆核過,冇報大。

### 細項 —— ✅ 全部落地

`verifyClenMatches` 三個分支加 `recordUpstream403('hls', …)`;
`PLAYLIST_CACHE_MAX_ENTRIES` 2000 → 500(live gauge `playlistCacheSize=7`,headroom 足);
verifyfail 之後即刻 `schedulePlaylistFlush()`;
`structureInFlight` key 保持 `yt` + 寫低理由 comment。

---

## 驗證數字(全部我自己重跑)

| 項 | 結果 |
|---|---|
| H1 `harness-n1-hls-playlist-cache.mjs` | **35 pass / 0 fail** |
| H2 `harness-n3-warm-hotids.mjs` | **24 pass / 0 fail** |
| H3 `harness-n5-buffercache-pinned.mjs` | **17 pass / 0 fail** |
| `ops/perf/harness/hlspreflight/hc-backend-harness.mjs`(隔離 cache 檔) | **19 pass / 0 fail** |
| 合計(執行者 harness) | **95 / 0** —— 同報告一致 |
| **我自己寫嘅獨立 harness** `verify-hls.mjs`(V1–V7) | **23 pass / 0 fail** |
| **我自己寫嘅獨立 harness** `verify-core.mjs`(A1–A5/B1–B6/C1–C3) | **24 pass / 0 fail** |
| PRE-FIX 對照組 `negctl.mjs` + RSS 對照 `rss.mjs` | 見上面 #3 |
| `node --check` × 8 檔 | 全過 |
| 逐 module import(唔 import server.js) | 全部成功,`getBufferCacheStats()` 有 `pinnedBytes` |
| `backend-restart.sh --dry-run` | 喺 sha gate abort(**預期**);**注意 HEAD 已經行前咗**(見下面 rollback) |
| 第 2 步(working tree 乾淨)獨立重做 | **PASS** —— 過濾運行時豁免之後零非運行時髒檔 |
| prod cache 污染檢查 | `backend/cache/` 只有 `channel-cooldown / discover-fail-cache / last-reconcile-date / reconcile-missing / resolve-cache` —— **冇** `hls-playlist-cache.json`、**冇** `hot-ids.json`,隔離做得啱 |
| **playlist bytes vs base `5d8f68b`** | **md5 `03373c3997e044ba314ccf980c19c816` 兩邊完全一致**(同一 hymnId、同一 fixture、乾淨獨立 run;`lib/hlsPlaylist.js` 兩個 sha 之間亦都 diff 零) |

---

## 剩餘問題

| # | 級別 | 位置 | 內容 |
|---|---|---|---|
| 1 | **P1(擋)** | `lib/resolveAudio.js:757`、`:496` | `subarray` 唔 copy → pinned entry 帳面 4MB、真記憶體 12MB。實測真 RSS 同修之前**一模一樣**(150.1MB),而帳面報細 96MB 會放鬆 eviction 壓力。改 `Buffer.from(...)` 兩行 |
| 2 | P2 | `lib/opsMetrics.js:428` | `pinnedBytes` 冇接上 gauge(只有 `pinned` count)。#3 修嘅嘢喺 production **量唔到**,after 只可以用 `bufferCache.pinned` 個數做代理。一行 sampler 映射 |
| 3 | P3 | `routes/stream.js:149` | 註釋仲寫「預設 16」,實際 10 |
| 4 | P3 | `lib/resolveAudio.js:762` | pinned entry 一旦定咗 4MB,同 URL 之下 `cappedBuf.length <= existing.buf.length` 永遠成立 → adopt 永遠 skip,head 喺 TTL 內唔會再更新。內容一樣,影響極低,但同 BATCH7 B7-4「等大 head 蓋 stub」個原意有少少張力 |
| 5 | P3 | `routes/stream.js:157` | `getHotIds(WARM_TOTAL_CAP)` 只攞 10 個候選,同 client 名單撞名就 skip → 可能補唔滿 10。攞 `WARM_TOTAL_CAP * 2` 就解決 |
| 6 | 註記 | `lib/hotIds.js` | `clientKey = ip|ua`,同 NAT + 同 UA 兩部機當一部 → 少計。方向保守,可接受 |
| 7 | 註記 | `routes/hls.js` | 離線校驗證唔到 URL 生死(舊網絡校驗順手證到)。因為 segment 指返 `/api/stream/:id`、offset 唔跟 URL 走,所以唔成問題 |

---

## restart smoke 清單(6 條 curl 原文 + 期望值)

restart 之後**立即**跑。`$B=https://api.odemusics.com`。
⚠️ 第 4 條要留意:restart 之後 `backend/cache/hot-ids.json` 唔存在(舊格式一律清零),
所以 `hot=0` 係**預期**,唔係 bug。

```bash
B=https://api.odemusics.com

# 1) 健康 —— 期望 200,total_time < 1.5s
curl -s -o /dev/null -w 'health %{http_code} %{time_total}s\n' --max-time 8 "$B/api/health"

# 2) playlist 冷路徑（restart 後第一擊,碟上冇 cache）—— 期望 200、size 2000-8000 bytes
#    backend log 應該有一行  [hls] ... id=1550 ... cache=miss ms=<幾百至幾千>
curl -s -o /tmp/smoke-1550.m3u8 -w 'm3u8#1 %{http_code} %{size_download}B %{time_total}s\n' --max-time 20 "$B/api/stream/1550.m3u8"
head -5 /tmp/smoke-1550.m3u8   # 期望 #EXTM3U / #EXT-X-VERSION:7 / #EXT-X-MAP:URI="/api/stream/1550"

# 3) 同一首再打一次 —— 期望 200、size 同第 2 條**一模一樣**、time_total 少過第 2 條
#    backend log 應該有  cache=hit ms=0  或  ms=1（離線 clen 校驗,零上游）
curl -s -o /tmp/smoke-1550b.m3u8 -w 'm3u8#2 %{http_code} %{size_download}B %{time_total}s\n' --max-time 20 "$B/api/stream/1550.m3u8"
cmp /tmp/smoke-1550.m3u8 /tmp/smoke-1550b.m3u8 && echo 'playlist bytes 一致 ✅'
tail -40 /tmp/hymn_backend.log | grep '\[hls\]' | tail -2   # 期望第二行 cache=hit ms=0|1

# 4) /warm —— restart 直後期望 {"warming":6} + log 行 client=6 hot=0 total=6
#    （hot-ids 由零開始儲；跑咗幾個鐘真流量之後再打同一條,應該見到 hot>0、total 封頂 10）
curl -s -X POST -H 'content-type: application/json' -d '{"ids":[1550,42,104,203,362,3669]}' "$B/api/stream/warm"; echo
tail -20 /tmp/hymn_backend.log | grep '\[warm\]' | tail -1

# 5) 新 metrics 有冇通電 —— 期望 hlsPlaylist 唔再係 null（hit/miss/verifyFail 三個數,
#    miss 至少 1、hit 至少 1，verifyFail 應該 0）；bufferCache.pinned 係數字（≤12）
curl -s --max-time 10 "$B/api/audio/cache/warm-stats" | python3 -c 'import sys,json;d=json.load(sys.stdin)["total"];print("hlsPlaylist",d.get("hlsPlaylist"));print("bufferCache",{k:d["bufferCache"][k] for k in ("entries","totalBytes","pinned")});print("upstream403",d.get("upstream403"))'

# 6) 持久化真係落碟（等 ≥6 秒 debounce）—— 期望兩個檔存在且 JSON 合法
#    hls-playlist-cache.json：key 係 youtube_id、entry 有 clen+itag
#    hot-ids.json：{"v":2,"hits":{...}}（第 4 條之後未必即刻有,要等有真播放）
ls -l backend/cache/hls-playlist-cache.json
python3 -c 'import json;d=json.load(open("backend/cache/hls-playlist-cache.json"));k=list(d)[0];print("keys",len(d),"sample",k,{x:d[k][x] for x in ("clen","itag","initSize")})'
```

任何一條唔符預期 → 即刻 rollback(見下面),唔好等。

---

## after 量法

**before 基準(必須引住,唔好重數)**:Eric 真機 `nextTrackMs origin=start` 中位
**4,975ms(09-06)/ 4,848ms(09-07)**;tunnel-probe before =
`2026-09-07T10:02:12Z,before,42,rtt_med=782ms,kbps_med=487,quic_min_rtt=178ms,colo=SEA`。

| 指標 | 點量 | 期望方向 |
|---|---|---|
| ① `nextTrackMs origin=start` 中位 | `node ops/perf/first-track/timeline.mjs --dates=<restart當日>,<+1日>` 出嘅逐條事件;或直接 `grep nextTrackMs backend/logs/client-log/client-log-<date>.jsonl` 抽 `ms=` 取中位 | 由 4,975 / 4,848 跌。N1 命中之後理論上慳返 playlist 嗰步(S0-4 p50 835ms)。**⚠️ 記住 memory 已知偏差:HLS 之下 `nextTrackMs` 本身早報 2–3 秒,所以只可以同自己 before 比,唔可以當絕對值** |
| ② `[hls] ms=` + `cache=` 比率 | `grep '\[hls\]' /tmp/hymn_backend.log \| grep -c 'cache=hit'` / `cache=miss` / `cache=verifyfail`;`ms=` 分佈用 `sed -E 's/.* ms=([0-9]+).*/\1/'` 取 p50/p90 | hit 比率 24 小時後應該 **>70%**;hit 嘅 `ms=` 應該 **0–2ms**(離線校驗);`verifyfail` 應該 **≈0**(353/353 URL 都有 clen 同 itag=140)。**verifyfail 比率高 = 「URL clen ≠ content-range total」呢個假設爆咗,即刻切 `HLS_PLAYLIST_VERIFY=0` 止血** |
| ③ `hlsPlaylist` 計數 | `curl -s $B/api/audio/cache/warm-stats \| python3 -c '…["total"]["hlsPlaylist"]'` | `hit` 應該遠大過 `miss`;`verifyFail` 應該係個位數或者 0 |
| ④ pinned / bufferCache | 同一個 endpoint 睇 `bufferCache.{entries,totalBytes,pinned}` | `pinned` 應該 = **12**(`PIN_N`)。**跌到 <12 = 64MB 守衛 fire 咗**(理論上 12×4.5MB=54MB 唔應該撞)。`totalBytes` **⚠️ 見剩餘問題 #1:未修 subarray 之前呢個數會報細,唔可以當真記憶體用**;真記憶體要睇 `bufferCache.rssKb` 或者 `ps -o rss= -p $(pgrep -f 'node.*server.js')` |
| ⑤ tunnel after 一行 | `ops/perf/first-track/tunnel-probe.sh 42 after` → append 落 `ops/perf/first-track/tunnel-probe.csv` | 同 before 嗰行並排比。tunnel 冇改過,呢條係**環境控制變數**——如果 rtt/kbps 大幅變咗,①嘅改善(或者退步)唔可以歸功/歸咎呢次改動 |
| ⑥ 24h 後 timeline 重跑 | `node ops/perf/first-track/timeline.mjs --dates=<D>,<D+1> --control=1550` | 對比 `timeline-20260907.md`:「playlist 回應完成時累積 offset %」應該由 p50 88% 跌;**今次要睇實際直接量到 `[hls] ms=` 嘅樣本數**(上次 n=16 得 1 個)——restart 之後全部 `[hls]` 行都有 `ms=` 同 `cache=`,樣本量應該足夠,先至可以講「步驟耗時」而唔係「累積 offset」 |

**唔可以做嘅**:唔好喺 Eric 真機 QA 進行緊嗰陣再部署(memory `feedback-no-deploy-during-live-qa`);
量 after 之前要確認冇第二次 restart / OTA 混入。

---

## Rollback

**⚠️ 先講一件事:HEAD 已經行前咗。** dry-run 實測 HEAD = `d3918f5`
(`chore(db): 每晚自動備份 hymns.db (2026-09-07)`,自動夜更 commit),唔係 `6f9231f`。
所以 approve 要用 `d3918f5`,而個 approve 會**連夜更 DB commit 一齊帶埋**:

```bash
ops/deploy/approve.sh backend d3918f527157c5abae75978525e67c77d20b84f3 --confirm
ops/deploy/backend-restart.sh
```

**Rollback 步驟**:

1. approve 返前一個 sha,restart 返轉頭:
   ```bash
   ops/deploy/approve.sh backend 217fe127e1dc4cc33c4b6d99fd12d50007106a83 --confirm
   ops/deploy/backend-restart.sh
   ```
   (`217fe127` = 而家 live 嗰個已批准 sha,即係呢一整波之前嘅狀態。
   ⚠️ `backend-restart.sh` 第 1 步係 `HEAD == approved sha`,所以要行呢條之前
   working tree 要 checkout 返 `217fe127`,或者用 `--mode same-code` 嗰條路——
   restart 前先跑一次 `--dry-run` 確認過閘。)
2. 兩個新 json 可以直接刪,冇任何 migration 副作用:
   ```bash
   rm -f backend/cache/hls-playlist-cache.json backend/cache/hot-ids.json
   ```
   兩個檔都係 best-effort 快取:`loadPlaylistCacheFromDisk()` / `loadFromDisk()`
   讀唔到就當第一次開機(`catch(_)` 靜靜跳過),`backend/cache/` 全目錄 gitignore。
3. 唔使 rollback OTA / 唔使掂 App —— 呢波係純 backend,前端一個字冇改。
4. 中途止血(唔使 restart)嘅逃生門:`HLS_PLAYLIST_VERIFY=0`(完全唔校驗)、
   `WARM_TOTAL_CAP=<n>`、`BUFFER_CACHE_PIN_N=0`(等於熄咗 pinned 熱池)——
   三個都係 env,改咗要 restart 先生效,但唔使改 code / 唔使重新 approve。

---

## 隔離副本清單(全部喺 scratchpad,冇入 repo)

| 副本 | 用途 |
|---|---|
| `iso-hls/base-backend/` = `git archive 5d8f68b backend` | playlist bytes 對照組(md5 比較) |
| `iso-core/prefix-backend/` = `git archive 96c6b10 backend` | #3 PRE-FIX 對照組(pinnedBytes 128MB vs 63MB、RSS 150.1MB vs 150.1MB) |
| `verify-hls.mjs` / `verify-core.mjs` / `negctl.mjs` / `rss.mjs` / `dbg-base.mjs` | 我自己寫嘅獨立 harness,唔 reuse 執行者 assertion |
| `iso-hls/pl*.json`、`iso-core/hot-ids*.json`、`iso-hlspreflight-cache.json` | 隔離 cache 檔 —— prod `backend/cache/` 已核實零污染 |

