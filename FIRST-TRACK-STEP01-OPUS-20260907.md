# 第一首歌 第0步(量度)+第1步(純backend) — Opus 5 獨立驗收 2026-09-07

驗收對象:`65c0951`(第0步)、`6e1aaef`(N1)、`1ce0c21`(N3+N5)、`82b7388`(harness+報告),base `5d8f68b`。
驗收者全程:唔改 source、唔 commit、唔部署/restart、唔寫 prod cache json;打 googlevideo 共 **3 次**(限額 10)。
scratch:`/private/tmp/…/scratchpad/firsttrack-opus/`。

---

## 結論

🟠 **要修先至值得 restart。** 三個改動本身**功能上正確**(harness 全部重跑過、playlist bytes 對住 base commit byte-for-byte 一模一樣、跨 restart 持久化實測 work、記帳四條路數得返),但:

1. 第 0 步嘅**核心結論(「playlist 步驟佔 p50 88%」)唔成立**——嗰個數係「playlist 回應**完成嘅時刻**佔 nextTrackMs 幾多 %」,唔係「playlist **呢一步用咗**幾多時間」。
2. N1 照而家嘅預設(`HLS_PLAYLIST_VERIFY=1`)**實測只慳到 ~20ms**(真.googlevideo 量度),因為命中路徑照樣要打一個 RTT。而**慳走呢個 RTT 係免費嘅**:383/383 條 cache 住嘅 googlevideo URL 個 query string 本身已經有 `clen`,`stream.js` 仲已經有現成嘅 `extractItagClen()`。
3. N5 講嘅「pinned 總 bytes ≤64MB」**冇任何嘢強制執行**,實測 pinned 可以霸住 120MB / 128MB。

修好呢三樣(全部係細改、純 backend、唔使 build 唔使 OTA)先 restart,呢次 restart 至會喺 Eric 部機度見到數。

---

## 問題清單(8 條,按嚴重度)

### 🔴 P1-1 「playlist 步驟佔 p50 88%」唔成立(第0步核心結論)
出處:`ops/perf/first-track/timeline.mjs:320`
```js
const playlistRatios = iosHlsWithPlaylist.map((t) => (100 * t.hlsInfo.reqEndOffset) / t.ms);
```
`reqEndOffset = [hls] log 完成 ts − T0`,即係「由撳掣到 playlist 回應**派完**」嘅**累積 offset**——入面包晒 App JS、tunnel 來回、`resolveAudioUrl`,唔係 playlist 呢一步嘅**耗時**。

我獨立由原始 log 重算,完全重現到嗰個數,再拆多兩層:

| 量法 | 數 |
|---|---|
| A. 重現 Sonnet 嘅 ratio(n=16 iOS) | p50=**88%** p90=93% ✅ 算術冇錯 |
| B. 16 個樣本入面**真係有 `[hls] ms=`** 嘅 | **1 個** |
| C. backend 直接量到嘅 playlist 耗時(`[hls] ms=`,n=10) | p50=**835ms** — 對 Eric 4,975ms 起播 ≈ **17%** |
| D. 用已記錄嘅「nextTrackMs 早報 2.5 秒」修正分母 | ratio p50 跌到 **57%** |

即係話:16 個樣本入面 15 個**根本冇量過 playlist 步驟用咗幾耐**,個 88% 全部由 offset 砌返出嚟。
✅ 我另外驗咗**唔係時鐘偏差搞鬼**:Eric 部機(`e1b6dc8a`)`clientTs − serverTs` p50=−16ms、p90=+131ms,兩邊鐘差 ≤±250ms,對唔上位嘅唔係鐘。
➡️ **成立嘅講法**:「playlist 回應派完嗰刻已經行咗成個起播窗口嘅 ~88%,即係話樽頸全部喺 playlist 回應之前(App + tunnel + resolve + head-fetch)」。呢個方向仍然指住同一度,但**N1 只拆走入面最細嗰片(sidx head-fetch)**,唔係 88%。

### 🔴 P1-2 N1 照預設 `VERIFY=1` 實測只慳 ~20ms;而慳走佢係免費嘅
出處:`backend/routes/hls.js:110-133`(`verifyClenMatches`)、`:196-210`

**真.googlevideo 實測**(id `PG_J_0gsMXA`,3 次呼叫):
| 請求 | status | ms |
|---|---|---|
| `Range: bytes=0-0`(命中校驗) | 206,`content-range: bytes 0-0/5646616` | **189ms** |
| `Range: bytes=0-8191`(miss 嘅 head fetch) | 206 | **209ms** |

**隔離副本實測**(mock RTT=200ms,真身 `routes/hls.js`):
| mode | miss `ms=` | hit `ms=` |
|---|---|---|
| `HLS_PLAYLIST_VERIFY=1`(預設) | 222 | **207** |
| `HLS_PLAYLIST_VERIFY=0` | 221 | **0** |

命中路徑照樣要行足一個 googlevideo RTT,慳嘅只係「8KB body 傳輸 + sidx parse」≈ 20ms。對 4,975ms 起播 = **0.4%**。

**免費修法(建議)**:googlevideo URL 個 query string 本身帶住 `clen` 同 `itag`——
```
$ 抽查 backend/cache/resolve-cache.json:有 clen param 嘅 URL = 383 / 383 (100%)
```
`backend/routes/stream.js:37` 已經有現成嘅 `extractItagClen(url)`。改成由 URL param 攞 clen(順手連 `itag` 都對埋,比淨係對 clen 更準)做校驗:**零網絡、hit ms→0、format 換咗照樣捉到**。「保守校驗 vs 快」呢個取捨根本唔使做。

### 🔴 P1-3 N5「pinned 總 bytes ≤64MB」冇強制執行,實測 pinned 霸 120MB
出處:`backend/lib/resolveAudio.js:452`(comment 聲稱 16×4MB=64MB)、`:590-593`(4MB cap 只喺 `warmBuffer()` 入面)

4MB head-only cap **淨係**用喺「**已經 pinned** 之後先經 `warmBuffer()` 入池」嗰條路。但熱門歌入池嘅主路係:
- `adoptStreamedHead()`(真播放順手 tee)——**完全冇 pinned cap**;
- `warmBuffer()` 喺 30 分鐘 pin refresh **之前**行——攞足 `WARM_CAP_BYTES` 12MB,之後先被 pin,個 12MB entry 就一世唔踢得。

隔離實測:
```
16 個 12MB entry 入池 → entries=10 totalBytes=125,829,120 (LRU 已收窄到 10 格)
setPinnedIds(16 個)   → pinned=16,10 格全部係 pinned = 120MB
再灌 10 個 8MB 普通 entry → totalBytes=134,217,728 = 128.0MB(啱啱頂住閘)
```
即係 128MB 預算入面 **120MB 俾 pinned 霸晒**,`evictBufferCacheOverflow()` 揾唔到非 pinned victim 就 break,正播緊/啱啱 warm 嘅歌被擠到近乎冇位。
➡️ 建議:evict 嗰陣加一條「pinned 總 bytes > 64MB 就連 pinned 都可以踢(由最舊嗰個起)」,或者 `setPinnedIds()` 嗰刻對已在池嘅 pinned entry 做 head-only 截斷。

### 🟠 P2-4 hot-ids 跨 restart 之後 key 由 number 變 string,同一首歌分裂成兩條記錄
出處:`backend/lib/hotIds.js:recordStreamHit`(用 `hymnId` 原型做 key)vs `loadFromDisk`(JSON key 一定係 string);caller `routes/stream.js:273` 傳嘅係 `Number(req.params.hymnId)`。

實測:
```
PH1(首次)          getHotIds(5) = [1550, 2222, 4444]      tracked=3
PH2(restart 後載返) getHotIds(5) = ["1550","2222","4444"] tracked=3
PH2 再打 1550 兩次   getHotIds(5) = ["1550","2222",1550,"4444"]  tracked=4  ← 同一首歌兩條
```
後果:①restart 之後嘅播放次數**唔會加返落舊記錄**,排名要等 24 小時窗口過晒先返正常;②`getHotIds(n)` 個 top-N 有重複,浪費補位額;③`refreshPinnedIdsFromHotIds()` 攞 12 個返嚟 Set 去重之後可能得 8-9 個,pinned 數細過 `PIN_N`;④`MAX_TRACKED_IDS` 5,000 最多虛報一倍。
➡️ 一行修:`recordStreamHit` 入面 `hymnId = String(hymnId)`(caller 全部已經 `Number(raw)`,唔會爛)。

### 🟠 P2-5 hotIds 計嘅係「串流分鐘 ÷ 60s」,唔係「開歌次數」——同佢自己個 comment 講嘅相反
出處:`backend/lib/hotIds.js`(comment 話「同 opsMetrics.js `recordStreamRequest` 個 `TRACK_GAP_MS` 一樣嘅教訓」)

兩邊其實**唔一樣**:
- `opsMetrics.js:176`——**每個 request 都** `lastSeen.set(youtubeId, now)`,所以持續播一首歌 = **1 次** track start。
- `hotIds.js`——`recentHitAt.set()` **只喺計數嗰陣先行**(前面 early-return 唔更新),所以持續播 = **每 60 秒 +1**。

實測(dedup 窗口縮到 50ms 代表 60 秒):歌 101 連續 685ms(≈13.7 個窗口)vs 歌 202 只開一次 → `getHotIds = [101, 202]`,101 攞咗 ~14 分。
➡️ iOS HLS 模式每段都打一次 `/api/stream/:id`,所以一首 40 分鐘純音樂會攞 ~40 分,一首 4 分鐘詩歌得 4 分。**熱門榜會被長檔洗版**,而長檔正正係最唔應該 pin(佢哋只 warm 4MB head 都嘥 4MB×N)。修法:抄 opsMetrics 嗰句,每個 request 都更新 `recentHitAt`。

### 🟠 P2-6 N3 令每次 `/warm` 嘅 upstream fetch 由 6 個 id 變 16 個,同 128MB 閘打交
出處:`backend/routes/stream.js:154-171`;佢哋自己個 H2 harness 都量到「**warmBuffer 真係俾 call 過(實測 16 次)**」。

`/warm` 每個 id 都行 `resolveAudioUrl` → `preVerifyUrl`(一次 googlevideo 探測)→ `warmBuffer`(4MB 或 12MB fetch),而 `warmBuffer()` **唔會因為 bufferCache 已經有就跳過**。所以每次開 App:
- upstream 由 ~6×12MB=72MB 升到最壞 16×12MB=**192MB**;
- 192MB > 128MB bufferCache 閘 → 排喺頭嗰批(= **client 名單、非 pinned**)反而會俾後面嘅 hot 補位 evict 走。

`anyStreaming()` 只係「有人聽緊就讓路」,唔係流量上限,擋唔到呢個。
➡️ 建議:第一波 `WARM_TOTAL_CAP` 收做 **10**,同埋 hot 補位嗰批一律行 head-only(4MB)。

### 🟡 P3-7 「正控」唔係正控(執行單明文要求「逐段人手核」)
出處:`timeline.mjs:362-370` — `--control` 分支做嘅係 `renderEventBlock(t)`,即係**原封不動再印一次同一個自動產生嘅 block**。報告嗰段同上面 hymnId=1550 嗰段**逐隻字一樣**,冇引任何原始 log 行、冇任何獨立對數。
而且個正控自己嗰條 `[hls]` 行係 `ms=-`(舊格式),**結構上量唔到 playlist 步驟**,揀佢做正控本身就冇檢驗力。
(對照 memory `feedback-exec-sheet-evidence-format`:「儀器正控」係硬要求。)
✅ 另一方面 script 本身嘅算術我核過冇問題(我獨立重算,88%/435ms 全部對得返),**問題係個數嘅意思,唔係計錯**。

### 🟡 P3-8 「未歸屬負數」嘅解釋漏咗已經記錄咗嘅儀器偏差
出處:`timeline-20260907.md` 核心結論 #3。
報告新造咗一個解釋(「seg0 完整落完呢個代理指標大過真起播門檻」),但**冇提**已經入咗 memory 嘅結論:`project-hls-b3-resolved-conditional-go` —「Stage B 量 `nextTrackMs`(**HLS 下早報 2–3 秒**)」。ios/stream 未歸屬 p50 = **−1,299ms** 正正落喺呢個band。
兩個原因可以同時成立,但**已知嗰個要點名**,而且佢直接影響 P1-1 個分母(早報 → 分母細咗 → ratio 報大)。

### 其餘細項(唔擋 restart,順手記低)
- `verifyClenMatches()` 冇叫 `recordUpstream403('hls', …)`,新加嘅每次命中 googlevideo 請求對 403 metric **隱形**;403 風暴期間仲會逐個剷走持久化 entry(自癒得返,但個 cache 喺最需要嘅時候失效)。
- `structureInFlight` key 由 `yt::url` 改做 `yt`:兩條**URL 唔同**嘅並發請求而家會共用第一條嘅結果(之前唔會 dedup),B 可以繼承 A 條死 URL 嘅 404。機率低(`resolveAudioUrl` 本身 per-id coalesce),但係新開嘅窿。
- flush 只喺「成功存低新 structure」先排隊,`verifyfail` 刪除同 LRU touch 唔會即時落碟;冇 exit hook(**正確**——BATCH D 記低咗唔准加 SIGTERM handler),最壞蝕 5 秒。
- 持久化 entry 存住成個 `segments` array(一首 5 分鐘歌 ≈ 75 段 ≈ 4KB JSON)。上限 2,000 條 = 最壞 ~8MB `writeFileSync` 每 5 秒一次,阻塞 event loop。而家 gauge 得 7 條,建議上限收做 300–500。

---

## 第 0 步結論逐條:成唔成立

| 結論 | 判 | 理由 |
|---|---|---|
| G-1「playlist 步驟佔 total ms p50 88%」 | ❌ **唔成立(照字面)** | 量嘅係累積 offset 唔係步驟耗時;16 個樣本得 1 個有真 `[hls] ms=`;直接量度 p50=835ms≈17%;分母 nextTrackMs 已知早報 2-3 秒。改成「playlist 回應完成已經去到起播窗口 88% 位」就成立 |
| G-3「init→seg0 串行」(gap ≥50ms) | ✅ **成立,而且好穩陣** | 19 個樣本 **min=361ms**、p50=464ms、max=1548ms。50ms 呢個門檻根本唔 load-bearing(最細嗰個都係門檻嘅 7 倍),就算門檻揀 200ms 結論一樣 |
| 「AVPlayer 未派完 seg0 已開聲 → 未歸屬負數」 | 🟠 **部分成立** | 方向合理(AVPlayer 唔使等成段),但漏咗已記錄嘅 `nextTrackMs` HLS 早報 2–3 秒(數值 −1,299ms 同佢完全 fit)。兩個原因分唔開,唔應該淨係報新嗰個 |
| 時鐘對位有冇污染(我加驗) | ✅ **冇** | Eric `e1b6dc8a`:`clientTs−serverTs` p50=−16ms p90=+131ms,鐘差 ≤±250ms,解釋唔到 −1.3 秒 |
| G-4 sidx 5/30 → N1 用 verify mode | 🟠 **判斷方向啱,但個取捨唔使做** | 5 首樣本撐唔起「唔校驗」,保守 `VERIFY=1` 係啱嘅決定;但 clen 喺 URL param 免費攞到(383/383),應該「又保守又快」,唔使二選一 |
| G-7 tunnel before 一行 | ✅ 成立 | `rtt_med=782ms kbps_med=487KB/s quic_min_rtt=178 colo=SEA`,同 09-07 研究稿同一數量級 |

---

## 重跑數(全部我自己重跑)

| 項 | 結果 |
|---|---|
| H1 `harness-n1-hls-playlist-cache.mjs` | **21 pass / 0 fail** ✅ |
| H2 `harness-n3-warm-hotids.mjs` | **13 pass / 0 fail** ✅ |
| H3 `harness-n5-buffercache-pinned.mjs` | **13 pass / 0 fail** ✅ |
| 既有 `hlspreflight/hc-backend-harness.mjs`(隔離 cache 檔) | **19 pass / 0 fail** ✅(N1 冇累到 403/410/timeout/並發去重) |
| `node --check` × 6 個改動檔 | 全過 ✅ |
| `backend-restart.sh --dry-run` | 喺第 1 步 sha gate abort(**預期**:HEAD `82b7388` ≠ approved `217fe127`) ✅ |
| 第 2 步(髒檔)會唔會過 | ✅ 會。`backend/cache/` 成個目錄已經喺 `.gitignore:77`,兩個新 json(`hls-playlist-cache.json`/`hot-ids.json`)**唔使加運行時白名單**;我實跑過 filtered porcelain = 空 |

⚠️ **harness 一個缺口**:H1 個「playlist bytes byte-for-byte」(harness:174)只係比 `body1 === body2`(新版自己前後對比),**冇對過 base**。我補做咗真嘅:

---

## 隔離 backend 副本實測(另起 port,真身 `routes/hls.js`,mock googlevideo,唔掂 prod)

| 場景 | 結果 |
|---|---|
| 同一首歌打 3 次(VERIFY=1) | `cache=miss ms=222` → `cache=hit ms=207` → `cache=hit ms=205` ✅ |
| 同一首歌打 3 次(VERIFY=0) | `cache=miss ms=221` → `cache=hit ms=0` → `cache=hit ms=0` ✅ |
| kill 副本重開 → 第一次 | `cache=hit ms=217`(碟上 323 bytes,`{"ytX":{"structure":…,"clen":5000000,…}}`)✅ |
| 換 URL(URL 續期,clen 一樣) | 仍然 `cache=hit`,playlist body 一模一樣 ✅ |
| 換 format(clen 唔同) | `cache=verifyfail ms=415` → 重新解出**新結構**(refs 2→1、segBytes 380000→999000),下一次 `cache=hit` ✅ **clen 校驗真係擋到「同一個 youtube_id 換咗片」** |
| VERIFY=0 之下換 format | ❌ 照舊送**舊嗰份錯 offset 嘅 playlist**(sameBody=true)——證實 `VERIFY=0` 唔可以裸切 |
| opsMetrics | `{"hit":4,"miss":1,"verifyFail":1}` 同實際行為對得返 ✅;`normalizeBucket` 有補 `bufferCache`(舊碟已有嘅 key),`hlsPlaylist` 係新 top-level key 唔使補,**restart 唔會清零** ✅ |
| **playlist bytes vs base `5d8f68b`** | 我用 `git show 5d8f68b:backend/routes/hls.js` 跑咗一次 base 副本 → `md5 592b7664…` **三份(base / 新版 miss / 新版由碟載返 hit)完全一樣** ✅ |
| `/warm` log | `[warm] … client=6 hot=10 total=16`、`client=1 hot=11 total=12` ✅ 格式對;⚠️ 見 P2-6 |
| bufferCache pinned | pinned 唔被 evict ✅、非 pinned 照 LRU ✅、`bufferCacheTotalBytes` 四條 mutation 路(`touchBufferEntry` 加/減、`evictBufferCacheOverflow` 減、`evictBufferedChunk` 減)全部數得返 ✅ **冇 W1/W2 `:570` 嗰種洩漏**;⚠️ 但 pinned 字節預算冇強制,見 P1-3 |
| 真.googlevideo(3 次) | `Range: bytes=0-0` → 206 + `content-range: bytes 0-0/5646616`,同 URL query 個 `clen=5646616` **一致**;189ms vs 8KB head-fetch 209ms ✅ 機制 work,但慳唔到時間 |

---

## Restart smoke 清單(修完之後跑)

前置:`ops/deploy/approve.sh backend <sha> --confirm` → `ops/deploy/backend-restart.sh`。
**紅線**:restart 一定要排喺任何 OTA 之前(memory `project-hls-d-fixes-verified`)。

```bash
# 0) 開機 log:三個新 loader + pin
grep -E 'hls-playlist-cache:由碟載返|hot-ids:由碟載返|\[pin\] ' /tmp/hymn_backend.log | tail -5

# 1) 同一首歌打兩次 .m3u8 —— 第二次一定要 cache=hit
ID=1550
for i in 1 2; do curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
  https://api.odemusics.com/api/hls/$ID.m3u8; sleep 1; done
grep "\[hls\].* id=$ID " /tmp/hymn_backend.log | tail -2      # 期望:cache=miss → cache=hit

# 2) playlist bytes 同 base 一致(restart 前先留底)
curl -s https://api.odemusics.com/api/hls/$ID.m3u8 > /tmp/pl-after.m3u8
diff /tmp/pl-before.m3u8 /tmp/pl-after.m3u8 && echo "playlist IDENTICAL"

# 3) hlsPlaylist 計數要升,而且唔可以清零
curl -s https://api.odemusics.com/api/audio/cache/warm-stats | \
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
  console.log("hlsPlaylist",JSON.stringify(j.total.hlsPlaylist),
              "bufferCache",JSON.stringify(j.total.bufferCache),
              "since",j.since);})'
#   期望:hit 上升;since 同 restart 前一樣(= 冇清零);bufferCache.pinned 有數字(唔係 null)

# 4) /warm log
grep '\[warm\] ' /tmp/hymn_backend.log | tail -3            # 期望:client=<n> hot=<n> total=<n>

# 5) 持久化檔真係寫到(等 >5 秒 debounce)
ls -l backend/cache/hls-playlist-cache.json backend/cache/hot-ids.json

# 6) 負控:確認冇整爛 progressive
curl -s -o /dev/null -w "%{http_code}\n" -r 0-1023 https://api.odemusics.com/api/stream/$ID   # 期望 206
```
⚠️ smoke 期間唔好撞正 Eric 真機 QA(memory `feedback-no-deploy-during-live-qa`);restart 會清 in-memory presence Map,唔好當 regression。

---

## After 量法(修完 + restart 之後)

| 指標 | Before(已量) | 點量 after |
|---|---|---|
| Eric 真機 `nextTrackMs origin=start source=stream`(iOS) 中位 | 09-06 **4,975ms**(n=11)/ 09-07 **4,848ms**(n=3) | 同一條 grep,收夠 **n≥10** 先睇中位(n=3 唔准當數,執行單原文 5,145ms 同覆核 4,848ms 嘅落差就係呢個問題)。⚠️ 呢個指標本身 HLS 下早報 2–3 秒,只可以做**同法對比**,唔可以當絕對起播時間 |
| `[hls] ms=` p50/p90 | p50=**835ms** p90=**4760ms**(n=10) | 同樣 grep;呢個係**唯一直接量到 playlist 步驟**嘅數,after 收夠 n≥30。改咗 URL-clen 校驗之後,hit 應該由 ~200ms 跌到個位數 |
| `hlsPlaylist` hit/miss/verifyFail | 全新,before=0 | `/api/audio/cache/warm-stats`。命中率係 N1 有冇食到嘢嘅**主指標**;`verifyFail` 應該接近 0(高 = 換片頻密或者 403 風暴) |
| bufferCache 命中率 / pinned | req=8193 hit=5882 = **71.8%**,entries=30,totalBytes≈**131.6MB**,pinned=(新) | 同一個 endpoint。⚠️ 睇實 `totalBytes` 有冇長期貼住 128MB 而 `pinned` 又高(= P1-3 嗰個病發作) |
| timeline 重跑 | `timeline-20260907.md` | `node ops/perf/first-track/timeline.mjs --dates=<after 兩日>`。**但**個「88%」欄要改成用 `[hls] ms=`(而家 16 個樣本得 1 個有)——建議 after 之前先確認全部 `[hls]` 行都有 `ms=` 欄,唔係就再重複同一個誤導 |
| tunnel-probe after | `rtt_med=782ms kbps_med=487KB/s quic_min_rtt=178 colo=SEA` | `ops/perf/first-track/tunnel-probe.sh <hymnId> after` 加一行(控制變數:證明起播改善唔係 tunnel 當日順咗) |

**建議 after 加一條**:`[hls]` log 印埋 `resolveMs=`(分開 resolve 同 head-fetch),否則 `ms=` 入面 resolve 同 sidx 兩件事永遠拆唔開,N1 到底食到幾多永遠靠估。
