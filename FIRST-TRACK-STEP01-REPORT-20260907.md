# 第一首歌起播 第0步(量度)+ 第1步(純backend)執行報告 2026-09-07

執行者:Sonnet 5。對應 `FIRST-TRACK-STEP01-EXEC-20260907.md`。基準 HEAD `574ecc1`。
全程唔部署、唔 restart、唔開模擬器、App 一個字冇改。

## 交付 commit(pathspec,共 4 個)

| # | sha | 內容 |
|---|---|---|
| 1 | `65c0951` | 第 0 步 script + 報告(timeline.mjs / sidx-stability.mjs / tunnel-probe.sh + 產出) |
| 2 | `6e1aaef` | N1(`routes/hls.js` + `lib/opsMetrics.js` hlsPlaylist 部分) |
| 3 | `1ce0c21` | N3 + N5(`lib/hotIds.js` 新增、`routes/stream.js`、`lib/resolveAudio.js`、`server.js`、`lib/opsMetrics.js` bufferCache.pinned 部分) |
| 4 | 本次 | harness + 本報告 + `.gitignore`(harness scratch 目錄) |

⚠️ **做唔到嘅/偏離執行單之處(如實列低)**:
- `lib/opsMetrics.js` 同一個檔嘅改動理論上要分落 commit 2(N1)同 commit 3(N3+N5)—— 已做到(用兩次編輯:commit 2 前暫時抽走 N5 嗰 3 個 hunk,commit 完再貼返做 commit 3),`git diff` 逐個 commit 核實過乾淨分割,冇夾雜。
- S0-2(G-4)撞到 403 提早停手,淨收咗 5/30 個完整樣本(11/60 次 yt-dlp)——呢個係執行單紅線本身要求嘅行為(「撞 403 即停」保護出口 IP),唔係做漏,已喺報告寫明。
- `backend-restart.sh --dry-run` 喺「HEAD == approved.json sha」呢一步預期會 abort(呢 4 個 commit 未經 approve,執行單本身都話明「唔部署」),下面 H4 段落用獨立指令驗證咗第二步(working tree 乾淨檢查)本身會過。

---

## 第 0 步:量度結果

### S0-1(G-1 起播時間軸)—— `ops/perf/first-track/timeline.mjs` + `timeline-20260907.md`

覆蓋 09-06(46 條 nextTrackMs origin=start/jsRecover,其中 Eric 部機 13 條)+ 09-07 全部,連 hlsStartupKick(90)/hlsPreflight(2)/nativeStall(275,⚠️呢個 beacon 冇 hymnId/deviceId,配對淨係時間窗重疊,已喺報告寫明限制)。**正控**:hymnId=1550(09-06,4,975ms)逐段人手核,結果收錄喺報告「正控」段。

**一句話結論**:喺已配對到 `[hls]` 記錄嘅 16 個 iOS HLS 樣本入面,**由撳掣到 backend 吐返 playlist(.m3u8)呢一步本身就食咗 total ms 嘅 p50 88%(p90 93%,min 52%,max 95%)**。「2.3 秒未歸屬」原本嘅框架(三段串行 vs 觀測值)喺真實生產數據下唔成立——真身係幾乎全部起播耗時都集中喺 playlist 步驟(sidx resolve + head-fetch),同 N1 嘅目標完全對得上。init/seg0 兩步(warm buffer 之下)本身好快:init→seg0 gap 全部樣本 ≥50ms(p50 435ms)= **串行**(G-3 答案),但呢個 gap 本身只係總時間嘅一細截。

**額外發現(非事先假設)**:「未歸屬」呢個指標喺 iOS HLS 樣本入面經常出現負數(p50 −1,299ms,分組數字見報告),原因係 seg0 request 嘅 `total_ms`(成個 162KB range 派晒)呢個代理指標,大過 AVPlayer 真正開聲嘅門檻——樣本入面成日見到 `nextTrackMs`(client 報有聲)落喺 seg0 request 仲未開始或者未派完嗰陣。呢個唔係量錯,係「seg0 完整落完」呢個代理指標本身用得唔啱嚟做「起播 done」嘅終點,已喺報告寫明,唔應該攞嚟直接減數。

S0-4(G-9,`[hls] ms=` 分佈,已收錄喺同一份報告):樣本(有 `ms=` 欄嘅 [hls] 行)僅 10 條(其餘 46-10=36 條係加呢個欄之前嘅舊格式,`ms=` 顯示 `-`)——p50=835ms,p90=4760ms,估算 miss 率(ms>500 當 miss)= 8/10 = 80%。樣本太細,呢個 p50/p90 只可以做量級參考。

### S0-2(G-4 sidx 穩定性)—— `ops/perf/first-track/sidx-stability.mjs` + `sidx-stability-20260907.md`

方法:獨立 shell out yt-dlp(同 production `default` strategy 一樣嘅 `-f` 參數),**完全唔碰 `resolveAudio.js`/`resolve-cache.json`**,每首歌兩次獨立 cold resolve + 輕量 HEAD range fetch 讀 `content-range`(clen)+ sidx 解析,對比 `clen`/`initSize`/頭 5 段 offset+length。限速:每次 resolve ≥4 秒間隔,封頂 60 次。

**結果**:11/60 次 yt-dlp 之後撞到 403(googlevideo),依紅線即刻停手。收到 **5 首完整樣本,5/5(100%)sidx 完全一致**(`clen`/`initSize`/頭 5 段 offset+length 全部兩次 resolve 一模一樣)。

**決定 N1 key 用 `yt` 定 `yt+clen`**:樣本細(5 首,遠低於原定 30 首目標),唔足以推翻「預設校驗」呢個保守立場——**維持執行單原文預設值 `HLS_PLAYLIST_VERIFY=1`(校驗)**,兩個 mode(校驗/唔校驗)都已經落地(見下面 N1),等之後有更多數據先由 Fable 決定會唔會切 `0`。

### S0-3(G-7 tunnel 探針)—— `ops/perf/first-track/tunnel-probe.sh` + `tunnel-probe.csv`

**Before 一行**(2026-09-07,label=before):`rtt_med=782ms, kbps_med=487KB/s, quic_min_rtt=178, colo=SEA`(同 09-07 研究稿 §0 量到嘅 757–962ms/1.19–1.39MB/s/177ms/SEA 同一數量級)。冇 launchctl 權限,故未裝 cron,設計做「before/after 各跑一次」用——署名可重跑:`ops/perf/first-track/tunnel-probe.sh <hymnId> <label>`。

---

## 第 1 步:純 backend 落地

### N1 — `backend/routes/hls.js`

- key 由 `${youtubeId}::${url}` 改做純 `youtubeId`(structureInFlight de-dup key 同步改)。
- entry 存 `{ structure, clen, initSize, expiresAt, savedAt }`,持久化落 `backend/cache/hls-playlist-cache.json`(debounce flush、開機載返、TTL 24h、上限 2,000 條 LRU;`HLS_PLAYLIST_CACHE_FILE`/`_MAX_ENTRIES`/`_TTL_MS` env 可覆蓋,純測試用途,production 冇設就用預設值)。
- 命中校驗:`HLS_PLAYLIST_VERIFY`(預設 `1`)控制命中要唔要用 `Range: bytes=0-0` 輕量校驗 clen;clen 唔夾即 `verifyfail`,落返完整 miss 路徑重解。
- `[hls]` log 行加 `cache=hit|miss|verifyfail`;opsMetrics 加 `hlsPlaylist:{hit,miss,verifyFail}`。
- 唔改 playlist 內容 / `Cache-Control: no-store` / resolve 策略。

### N3 — `backend/lib/hotIds.js`(新)+ `backend/routes/stream.js`

- `hotIds.js`:滾動 24h 串流計數,per-hymnId 去重(60 秒窗口,同 opsMetrics.js track-start 邏輯一致嘅教訓),UA 排除法過濾合成流量(curl/監控探針),上限 5,000 個追蹤 id,持久化 `backend/cache/hot-ids.json`。
- `/warm`:client 名單(≤10)之後補 backend 熱門 id 到總數 ≤16(`WARM_TOTAL_CAP` env,預設 16),去重,`anyStreaming()` 讓路邏輯完全不變;log `[warm] client=<n> hot=<n> total=<n>`。
- `routes/stream.js` GET handler 加 `recordStreamHit(id, uaShort)`,純觀測。

### N5 — `backend/lib/resolveAudio.js` bufferCache

- 加 `pinnedIds`(Set<youtubeId>),由 `server.js` 每 30 分鐘(`startPinnedIdsRefresh`)用 `getHotIds()`→DB 查 `youtube_id`→`setPinnedIds()` 灌入(`resolveAudio.js` 本身唔識 DB,避免循環 import,跟 opsMetrics.js sampler 嗰條紀律)。
- `evictBufferCacheOverflow()` 揀「最舊」時跳過 pinned;pinned 經 `warmBuffer()` 入池一律 head-only(`LONG_WARM_CAP_BYTES` 4MB),唔理 durationSec。
- `PINNED_MAX_COUNT` 硬 clamp 喺 16(= 128MB 閘一半 64MB ÷ 4MB),防 env 誤設都唔會爆記憶體預算。
- gauge:`bufferCache.pinned`;`opsMetrics.js` `normalizeBucket()` 補返 `bufferCache` 淺 merge(同 `resolve` 一樣嘅「舊碟頂層 key 覆蓋新子欄」陷阱,已修)。

---

## 驗證(H1–H5)

| 項 | 結果 |
|---|---|
| **H1**(N1 harness,`ops/perf/first-track/harness-n1-hls-playlist-cache.mjs`) | **21/21 pass**。覆蓋:miss→hit(URL 續期、clen 一樣)、playlist bytes byte-for-byte 一致、clen 唔夾→verifyfail→重解(結構真係變返做新 format)、VERIFY=0 mode 真係跳過校驗、restart(cache-busted re-import 模擬)後由 json 載返命中、LRU 上限(細 cap=3 驗證)、TTL 過期(細 TTL=200ms 驗證)。 |
| **H2**(N3 harness,`harness-n3-warm-hotids.mjs`) | **13/13 pass**。覆蓋:hotIds UA 過濾、60s 去重排序、5,000 上限+最舊被踢;`/warm` client=6+hot=10=16、去重(client 兼熱門唔重複補)、`anyStreaming()` 讓路(true 時 warmBuffer 零 fire)、`recordWarmIds` 淨收 client 原裝名單。 |
| **H3**(N5 harness,`harness-n5-buffercache-pinned.mjs`) | **13/13 pass**。覆蓋:`PINNED_MAX_COUNT` clamp=16、pinned 用 4MB cap(實測 Range 上限=4194303)、bufferCacheTotalBytes 記帳(加/evict/pin/unpin 全部核對得上)、pinned 唔被 40 格 LRU 踢走、非 pinned 照 LRU。 |
| **既有 HLS-PREFLIGHT harness**(`ops/perf/harness/hlspreflight/hc-backend-harness.mjs`,隔離 cache 檔跑) | **19/19 pass**(N1 冇累到 403/410/timeout/並發去重呢批既有行為)。 |
| **H4**(node --check + import + restart --dry-run) | 6 個改動檔全部 `node --check` 過;逐個 `import()`(唔 import server.js)成功,無拋錯。`backend-restart.sh --dry-run` 喺「HEAD==approved sha」呢一步 abort(**預期行為**——4 個 commit 未經 Eric approve,執行單本身要求「唔部署」);獨立核實咗第二步(working tree 乾淨檢查,豁免運行時檔案後)本身乾淨會過 —— `git status --porcelain -- backend/` 過濾晒 `hymns.db*/users.db*/backend/data//*.log/*.bak*/backend/public/` 之後輸出為空。 |
| **H5**(before 數) | `[hls] ms=` p50=835ms/p90=4760ms(n=10,樣本細);`bufferCache` 累計命中率 71.8%(req=8193,hit=5882,entries=30,totalBytes≈131.6MB,rssKb≈43.7MB);`playlistCacheSize` gauge=7(印證研究稿講嘅「長期停留單位數」);Eric(deviceId e1b6dc8a…)iOS HLS `nextTrackMs origin=start source=stream` 09-06 p50=**4,975ms**(n=11,同執行單原文一致)、09-07 p50=**4,848ms**(n=3——本次覆核值,執行單原文寫 5,145ms,樣本量細,兩個數字差異屬於 n=3 中位數本身嘅波動,如實列出唔強行對齊);tunnel-probe before 一行已列喺 S0-3。 |

## N1 最終用邊個 verify mode 同點解

**維持執行單原文預設值:`HLS_PLAYLIST_VERIFY=1`(校驗)**。S0-2 收到嘅 5/5(100%)sidx 一致樣本方向上支持「可以唔校驗」,但樣本量(5 首,11/60 次 yt-dlp)遠低於原定 30 首目標(中途撞 403 停手),唔足以推翻「預設保守校驗」呢個立場——執行單原文已經寫明呢個決定要留俾 Fable 睇數據判斷,執行者已經將兩個 mode 都完整落地(`HLS_PLAYLIST_VERIFY=0|1` 兩條路都有 harness 覆蓋,見 H1(2)/(2b)),方便日後一鍵切換。

## 做唔到嘅

1. S0-2 目標 30 首,實收 5 首完整樣本(11/60 次 yt-dlp)——撞到 googlevideo 403 依紅線即停,冇再打多一次(出口 IP 係全 app 命脈,唔值得為湊夠樣本數冒風險)。已如實記錄,唔影響 N1 決策方向(保守校驗預設值本身唔靠呢個樣本量撐)。
2. 09-07 Eric p50 覆核值(4,848ms,n=3)同執行單原文引用嘅 5,145ms 有落差——n=3 太細,中位數對單一樣本敏感,兩個數字都如實列出,冇強行解釋/調和。
3. `lib/opsMetrics.js` 嘅 N1/N5 改動分落兩個 commit 靠人手拆 hunk(先臨時抽走 N5 部分、commit N1、再貼返、commit N3+N5)完成,冇用 `git add -p` 互動指令(non-interactive session 用唔到互動輸入)——結果核實過乾淨,但流程比較迂迴,值得記低俾下次做類似「同一檔案分屬兩個邏輯改動」嘅場景參考。
