# 第一首歌 第0步(量度)+ 第1步(純backend) 修復報告 2026-09-07

執行者:Sonnet 5。對應 `FIRST-TRACK-STEP01-OPUS-20260907.md`(Opus 5 驗收,8 條問題)嘅
Fable 決定(見派工單)。基準 HEAD `96c6b10`(即 Opus 驗收報告 commit)。
全程唔改 App、唔改 resolve 策略/stream.js 重試/playlist 內容、唔部署/restart、
唔打真.YouTube(全部 mock)、唔改 prod cache json、唔用 `git add -A`/`clean`/`stash`。

## 交付 commit(pathspec,共 2 個)

| # | 內容 |
|---|---|
| 1(code) | `backend/lib/urlItagClen.js`(新)、`backend/lib/hotIds.js`、`backend/lib/resolveAudio.js`、`backend/routes/hls.js`、`backend/routes/stream.js` |
| 2(script+報告) | `ops/perf/first-track/harness-n1-hls-playlist-cache.mjs`、`harness-n3-warm-hotids.mjs`、`harness-n5-buffercache-pinned.mjs`、`timeline.mjs`、`timeline-20260907.md`、`FIRST-TRACK-STEP01-REPORT-20260907.md`(改核心結論段)、本報告 |

---

## 逐條對應 Opus 8 條問題 + Fable 決定

### #2(對應 P1-1 唔擋、P1-2 主修)N1 校驗改用 URL 內 `clen`(離線,零上游請求)

`backend/lib/urlItagClen.js`(新)抽出 `extractItagClen(url)`——原本淨係喺
`routes/stream.js` 用,而家 `routes/hls.js` 都 import 同一份,唔重複維護兩份
幾乎一樣嘅 parse 邏輯。

`routes/hls.js`:
- 新增 `urlClenMatches(url, cached)`:純字串/數字比較,由 `resolveAudioUrl()`
  攞返嚟嗰條 URL 嘅 query string 讀 `clen`/`itag`,同快取存低嘅
  `{ clen, itag }` 對比,**零網絡請求**。
- `resolveStructureInner()` 命中路徑:`HLS_PLAYLIST_VERIFY=1`(預設)之下,
  先行 `urlClenMatches()`;URL 冇 clen(理論上唔會,防禦性)先退返舊嘅
  `verifyClenMatches()`(`Range: bytes=0-0` 網絡校驗,保留做 fallback)。
  `HLS_PLAYLIST_VERIFY=0` 保留做「完全唔校驗」嘅逃生門。
- playlistCache entry 加 `itag` 欄(命中校驗順手連 itag 都對埋,比淨係對
  clen 更準)。

**實測**(H1 test(1c)):
```
[hls] id=2005 yt=yt-d result=ok ... cache=miss ms=1
[hls] id=2005 yt=yt-d result=ok ... cache=hit  ms=0
```
URL 續期(唔同 URL,query string 帶同一個 `clen=6000000&itag=140`)之後命中,
`fileD-renewed` mock 端點**完全冇被打過**(`hitCounts` 差值 = 0),`ms=0`。
換 format(clen/itag 都唔同)之下(H1 test(1d)):離線就判斷到唔夾,
`cache=verifyfail`,`opsMetrics.hlsPlaylist.verifyFail +1`——**唔使打
googlevideo 先知**。

冇 clen 嘅舊 fallback 路徑(H1 test(1),mock URL 冇 query string)依然覆蓋:
`cache=hit ms=1`,`fileA-renewed` 被打咗 1 次(bytes=0-0 校驗),
`opsMetrics.upstream403.hlsTotal +1`(見下面 §細項)。

### #3 N5 pinned 預算真正強制

`backend/lib/resolveAudio.js`:
- (a) `adoptStreamedHead()` 加 `isPinned` check,pinned id 嘅 tee buf 一律截到
  `LONG_WARM_CAP_BYTES`(4MB)先存(之前完全冇理 pinnedIds,呢條先係
  Opus 揪出嘅**主**缺口——「真播放順手 tee」係熱門歌入池嘅主路徑)。
- (b) `setPinnedIds()` 灌入新名單嗰刻,對已經喺 bufferCache、但大過 4MB 嘅
  entry 用新嘅 `truncateEntryForPin()` 即刻裁剪到 4MB(揀裁剪而唔係唔
  pin——寧願保住個 4MB head 都好過完全冇保底)。
- (c) `evictBufferCacheOverflow()` 加一個獨立 while loop:實測 pinned 總
  bytes(新 `pinnedTotalBytes()`),超過 `PINNED_TOTAL_CAP_BYTES`(64MB,
  執行單原文數字)就 `unpinOldestPinned()`(最舊嗰個),直至冇超或者冇
  更多 pinned 可以 unpin。
- (d) 四條記帳路徑(warm 入 `touchBufferEntry`、adopt 入`touchBufferEntry`、
  evict 出、pin 裁剪 `truncateEntryForPin`)全部經同一個「先扣舊、後加新」
  嘅 `touchBufferEntry()`,`bufferCacheTotalBytes` 唔會有第二份唔一致嘅
  算法。`getBufferCacheStats()` 新加 `pinnedBytes` 欄,俾 harness/production
  監察直接讀到 pinned 集合實際食緊幾多 bytes。

**實測**(H3 test(2b)/(5)):
```
adoptStreamedHead(pinned, teeBuf=12MB, totalLength=20MB) → buf.length === 4,194,304(4MB)✅
16 個 pinned(4MB head + ≤512KB 尾)之後:
  entries=40 totalBytes=82,697,472 pinned=14 pinnedBytes=66,060,288(63.00MB)
  → pinnedBytes ≤ 64MB ✅
  → 最舊嗰個(index 0)已經俾 unpin ✅
```
單靠 `PINNED_MAX_COUNT×LONG_WARM_CAP_BYTES=16×4MB=64MB` 嘅算術唔夠(尾巴
補攞令每個 pinned entry 實際 ≈4.5MB,16 個 ≈72MB > 64MB),(c) 嗰條獨立
「pinned 總 bytes 超咗就 unpin 最舊」保險絲先真正守住咗個 64MB 閘。

### #4 hotIds key 一律 `String(id)`

`backend/lib/hotIds.js` `recordStreamHit()` 入面第一句 `hymnId = String(hymnId)`
(喺 `isSyntheticUa`/`isStart` check 之後,mutate `hits`/`recentHitAt` 之前)。
`getHotIds()`(讀取)同 `loadFromDisk()`(持久化載返)本身已經全部係 string
key(JSON key 冇第二種可能),寫入一致化之後三處自然對齊。

**實測**(H2 test(6)):
```
recordStreamHit(1550 /* Number */, ...) → getHotIds() 攞到 "1550"(string)
[flush 落碟,5.5s debounce]
[cache-busted 重新 import,模擬 restart]
getHotIds() 由碟載返仍然係 "1550" ✅
recordStreamHit(1550 /* Number,第二個 client */, ...)
→ getHotIds() 入面 "1550" 出現次數 = 1(冇分裂成 1550/"1550" 兩條)✅
```

### #5 hotIds 改計「開歌次數」

`backend/lib/hotIds.js` `recordStreamHit(hymnId, ua, { isStart, clientKey })`:
- `isStart=false`(中段續播 range)一律 `return`,唔計數;`isStart` 冇傳當
  `true`(保留俾直接 unit test 呢個 module 嘅舊 call site零 breaking change)。
- 去重 key 由淨係 `hymnId` 改做 `${hymnId}::${clientKey||ua||'-'}`(同一 id
  同一 client 先去重,唔同 client 各自計)。
- `HIT_DEDUP_MS` 預設由 60 秒放寬到 **5 分鐘**(執行單原文數字,env 可覆蓋
  純測試用)。
- 持久化格式版本 bump 到 `v2`(`{ v: 2, hits: {...} }`)——`loadFromDisk()`
  見到 `v !== 2`(舊碟/冇 `v` 呢個欄)一律當冇檔清零重計,唔會將舊「串流
  分鐘」數當做新「開歌次數」用。

`backend/routes/stream.js` GET handler:呼叫位改做
`recordStreamHit(id, uaShort, { isStart: isStreamStartReq, clientKey: `${clientIp(req)}|${uaShort}` })`,
`isStreamStartReq = !req.headers.range || /^bytes=0-/.test(req.headers.range)`
(喺 `clientRange`/`parsedRange` 呢兩個 local 變數聲明之前,獨立重複判斷同一
條件,避免搬前呢兩個變數嘅聲明撞到 fMP4 duration 修補段嘅變數次序)。
`clientKey` 用 `lib/loginRateLimit.js` 已有嘅 `clientIp(req)`(cf-connecting-ip
優先,跌落 `req.ip`)+ ua(呢條 route 冇 deviceId,App 一個字冇改前提下攞唔到)。

**實測**(H2 test(4)/(5)):
```
isStart=false(中段 range) → 完全唔入 hotIds ✅
isStart=true(起播) → 計落 ✅
連播 14 分鐘(1 個 isStart + 20 條 isStart=false 續播,同一 client)→ 只計 1 次
開 3 次(3 個獨立 isStart=true,用 sleep 隔開 dedup 窗口)→ 計 3 次
→ getHotIds() 排名:開 3 次嘅 id 行喺連播 14 分鐘嘅 id 之前 ✅
```

### #6 `WARM_TOTAL_CAP` 預設改 10

`backend/routes/stream.js`:`WARM_TOTAL_CAP` 預設由 16 改做 10(env 可覆蓋)。

**實測**(H2 test(4)/(4b)):
```
client=6 + hot=4 = 10(啱啱頂閘)
[warm] client=6 hot=4 total=10
client=10(已經頂閘)+ hot=0 = 10(唔再補)
[warm] client=10 hot=0 total=10
```

### #7/#8 timeline.mjs `--control` 改真.正控 + 報告結論改寫

`ops/perf/first-track/timeline.mjs`:
- `parseTaggedLine()`/`loadClientLog()` 保留原始一行文字(`raw`/`rawLine`),
  俾之後可以印返一字不漏嘅原文。
- 新函式 `renderControlBlock(t)`:印**原始** `nextTrackMs`/`hlsStartupKick`/
  `hlsPreflight` beacon JSON 行 + 原始 `[hls]` log 行 + 頭幾條原始 `[stream]`
  log 行,唔再係 `renderEventBlock(t)` 摘要重印一次(舊版 `--control` 個
  Opus P3-7 問題:「正控」同上面自動摘要逐隻字一樣,冇檢驗力)。
- 「核心結論」段改寫:
  1. 標題由「playlist 步驟佔 total ms 嘅比例」改做「playlist 回應完成時,
     距離撳掣已經去到起播窗口嘅幾多 %(累積 offset,唔係步驟耗時)」,
     並且**明文列出**呢批樣本入面真正直接量到 `[hls] ms=` 嘅樣本數(現時
     n=16 入面得 1 個,835ms)同埋 S0-4(G-9)嗰組更大獨立樣本(n=10,
     p50=835ms≈17% of Eric 起播中位)做對照。
  2. 「未歸屬常見負數」段加返 (b):已知儀器偏差
     (memory `project-hls-b3-resolved-conditional-go`——`nextTrackMs` HLS
     下早報 2–3 秒),同原有 (a) seg0 代理指標解釋並列,唔淨係報新嗰個。

**重跑產出**(`node ops/perf/first-track/timeline.mjs --dates=2026-09-06,2026-09-07 --control=1550`):
```
1. playlist(.m3u8)回應完成時,距離撳掣已經去到起播窗口嘅幾多 %(累積 offset,唔係步驟耗時)
   (n=16): p50=88%,p90=93%,min=52%,max=95%
   → 呢 16 個樣本入面,真正直接量到 [hls] ms= 嘅淨係 1 個樣本(hymnId=5839 ms=835)
   → S0-4(G-9)獨立樣本(n=10):p50=835ms、p90=4760ms ≈ 17% of 4,975ms
   → 成立嘅講法:「playlist 回應完成嗰一刻已經行咗起播窗口 p50 88% 位」,唔等於「呢一步用咗 88% 時間」
3. 未歸屬負數:(a) seg0 代理指標 + (b) 已知 nextTrackMs HLS 早報 2–3 秒偏差,兩者可同時成立
```
`--control=1550` 產出嘅「正控」段已經印返原始 `nextTrackMs`/`hlsStartupKick`
beacon JSON 一字不漏 + 原始 `[hls]`/`[stream]` log 行(見
`ops/perf/first-track/timeline-20260907.md` §正控)。

`FIRST-TRACK-STEP01-REPORT-20260907.md` §S0-1 段已經同步改寫,措辭同上。

### §細項(唔擋,已全部落地)

- `verifyClenMatches()` fallback 路徑(2xx/非2xx/拋錯三個分支)全部加咗
  `recordUpstream403('hls', ...)`——H1 test(1) 實測 `upstream403.hlsTotal +1`。
- 持久化上限(`PLAYLIST_CACHE_MAX_ENTRIES`)預設由 2,000 收窄到 **500**
  (`backend/routes/hls.js`)。
- `structureInFlight` key 保持 `yt`(唔改做 `yt::url`)——加咗理由 comment:
  `resolveAudioUrl()` 本身已經對 yt-dlp resolve 做緊 per-id in-flight
  coalescing,呢層 de-dup 純粹係效能優化唔係正確性保證,改用 `yt::url` 會
  令兩個 map 嘅「重複」粒度分裂,得不償失。
- `resolveStructureInner()` 校驗失敗(verifyfail)嗰刻,`playlistCache.delete()`
  之後即刻加咗 `schedulePlaylistFlush()`——即使之後嘅重解都失敗,呢個
  「作廢咗嘅 entry」都會落實到碟,唔靠嗰次(可能失敗嘅)重解成功先觸發
  flush。H1 test(1e) 用一個 `/deadend`(一律 500)mock 端點實測:verifyfail
  + 重解失敗 → 等 5.5s → 碟上嗰個 key 已經唔喺度。

---

## 驗證

| 項 | 結果 |
|---|---|
| H1(`harness-n1-hls-playlist-cache.mjs`) | **35 pass / 0 fail**(新增:(1c)URL clen 零上游命中、(1d)URL clen 唔夾即判 verifyfail、(1e)verifyfail 重解失敗都排到 flush、upstream403 記帳) |
| H2(`harness-n3-warm-hotids.mjs`) | **24 pass / 0 fail**(新增:(4)isStart gating、(5)連播14分鐘vs開3次、(6)restart key 一致性、(4b)client=10 唔再補hot;既有 test 已更新去用 WARM_TOTAL_CAP=10) |
| H3(`harness-n5-buffercache-pinned.mjs`) | **17 pass / 0 fail**(新增:(2b)adoptStreamedHead pinned cap、(5)pinned 總 bytes 64MB 硬頂+自動 unpin) |
| 既有 `hlspreflight/hc-backend-harness.mjs`(隔離 cache 檔) | **19 pass / 0 fail**(N1/N3/N5 改動冇累到 403/410/timeout/並發去重呢批既有行為) |
| **合計** | **95 pass / 0 fail** |
| `node --check` × 7 個改動/新增檔(`urlItagClen.js`/`hotIds.js`/`resolveAudio.js`/`hls.js`/`stream.js`/`opsMetrics.js`/`server.js`) | 全過 ✅ |
| 逐 module import(唔 import server.js) | `urlItagClen.js`/`hotIds.js`/`hls.js`/`stream.js`/`loginRateLimit.js`/`resolveAudio.js` 全部 `import()` 成功,`getBufferCacheStats()` 讀到新 `pinnedBytes` 欄 ✅ |
| `backend-restart.sh --dry-run` | 喺 sha gate abort(**預期**:HEAD `96c6b10`≠approved `217fe127`);獨立核實第 2 步(working tree 乾淨檢查):`git status --porcelain -- backend/` 過濾晒 runtime 產物之後,剩低嘅淨係本波真正嘅 source 改動(`hotIds.js`/`resolveAudio.js`/`hls.js`/`stream.js`/新 `urlItagClen.js`),`backend/cache/` 全目錄仍然 gitignore,冇任何 production cache json 被建立 ✅ |

## 隔離副本(另一 port,mock googlevideo)重做 Opus 嘅 miss→hit→restart→hit 序列(H1 原始 log 行)

```
# 免費(URL clen)校驗路徑 —— id=2005 yt=yt-d
[hls] id=2005 yt=yt-d ... cache=miss ms=1
[hls] id=2005 yt=yt-d ... cache=hit  ms=0     ← URL 續期,零上游請求

# 網絡 fallback 路徑(URL 冇 clen)—— id=2001 yt=yt-a
[hls] id=2001 yt=yt-a ... cache=miss ms=6
[hls] id=2001 yt=yt-a ... cache=hit  ms=1     ← 一次 bytes=0-0 校驗

# restart 持久化 —— id=2004 yt=yt-d
[hls] id=2004 yt=yt-d ... cache=miss ms=1
🗃️  hls-playlist-cache:由碟載返 1 條未過期 playlist 結構     ← cache-busted 重新 import,模擬 restart
[hls] id=2004 yt=yt-d ... cache=hit  ms=2     ← restart 之後第一個 request 就命中
```

## Pinned 預算實測(H3 test(5))

```
16 個 pinned entry(每個 head 4MB + tail ≤512KB)入池之後:
  entries=40 totalBytes=82,697,472(78.9MB) pinned=14 pinnedBytes=66,060,288(63.00MB)
  → pinnedBytes ≤ PINNED_TOTAL_CAP_BYTES(64MB)✅
  → 16 個入池,最終得 14 個仲係 pinned(最舊 2 個俾 unpin)✅
```

## hotIds 計法實測(H2 test(5)/(6))

```
isStart=false(中段續播 range) → 完全唔計         ✅
isStart=true(起播)            → 計落             ✅
連播 14 分鐘(1 個 isStart + 20 條非 isStart 續播,同一 client)→ 只計 1 次
開 3 次(3 個獨立 isStart=true,隔開 dedup 窗口)   → 計 3 次
→ getHotIds() 排名:開 3 次 > 連播 14 分鐘 ✅

restart 前:recordStreamHit(1550 /* Number */) → getHotIds() 攞到 "1550"
restart 後(v2 格式由碟載返):getHotIds() 仍然係 "1550"(唔會分裂做 number/string 兩條)
```

## 做唔到嘅 / 偏離之處

1. `PLAYLIST_CACHE_MAX_ENTRIES` 預設收窄到 500 呢個改動冇專門加新 harness
   case(直接改常數值,LRU test 本身用 env 覆蓋做細 cap 驗證邏輯,常數本身
   改動已經喺 code review 層面核實,唔值得為單一常數加多一組 40 格灌水
   test)。
2. `getBufferCacheStats()` 新加嘅 `pinnedBytes` 冇進一步接返
   `opsMetrics.js` 嘅 gauge(`bufferCache.pinnedBytes`)做 production 長期
   監察——執行單冇明文要求呢一步,加返純粹係為咗俾 harness/手動 debug 直接
   讀到,如果之後想長期追蹤,揸多一行 `opsMetrics.js` sampler 映射即可
   (低風險,冇喺呢次落地,留返俾下一波如果 Fable 覺得有需要)。
3. isStart 判斷喺 `routes/stream.js` 重複咗一次 `!req.headers.range ||
   /^bytes=0-/.test(...)`(下面 `startsAtZero` 已經計過一次同一條件)——
   刻意揀重複判斷而唔係搬前 `clientRange`/`parsedRange` 嘅聲明,避免郁到
   fMP4 duration 修補段嗰條已經驗證過嘅變數次序,已喺 code comment 講明
   理由。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
