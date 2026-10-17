# 第一首歌起播 第 0 步（量度）+ 第 1 步（純 backend）執行單 2026-09-07

Eric 拍板：開第 0 步 + 第 1 步；**唔郁「隨心聽第一首偏向已暖池」（N2）**；第 2 步其餘（N6 edge cache）同五條拍板項（E-1～E-5）唔郁。研究底稿：`FIRST-TRACK-STUDY-20260907.md`（§1.1 路徑表、§2 N1/N3/N5、§5 G-1/G-4/G-7/G-9、§6）。
流程：Fable 規劃 → Sonnet 執行 → Opus 驗收 → 報 Eric → backend restart（唔使 OTA、唔使 build）。基準 HEAD `574ecc1`。

## 0. 紅線
- 🔴 純 backend + ops script。**App 一個字唔改**（N3 App 側名單改動留下一波；本波 warm 名單擴充喺 backend 做）。
- 🔴 唔改 resolve 策略/timeout、唔改 stream.js 403 重試、唔改 HLS playlist 內容格式（`EXT-X-MAP`/byterange 一個字唔變——只改快取層）。
- 🔴 唔改隨心聽/`dailyPick`/任何揀歌邏輯（Eric 明令）。
- 🔴 記憶體：bufferCache 總閘 128MB 唔准加大；熱池用 head-only cap（`LONG_WARM_CAP_BYTES` 4MB）。
- 🔴 唔部署、唔 restart；第 0 步 script 純讀（log/jsonl/metrics），G-4 例外要打 YouTube（限速、隔離 cache）。
- scratch 唔准放 backend/；長期 script 放 `ops/perf/first-track/`。

## 1. 第 0 步：量度（先做，出數先落第 1 步）

| # | 項 | 具體 | 產出 |
|---|---|---|---|
| S0-1 | **G-1 起播時間軸**（`ops/perf/first-track/timeline.mjs`） | 輸入：`backend/logs/client-log/*.jsonl`（Eric `e1b6dc8a…`、Joy `0ae6ff0c…`）+ `/tmp/hymn_backend.log`。對每條 `nextTrackMs origin=start`（連 `jsRecover`）：由 `clientTs − ms` 反推撳掣時刻 T0，撈同一 hymnId 喺 [T0−2s, T0+ms+2s] 內嘅 `[hls]`（含 `ms=`）、頭三條 `[stream]`（range/ttfb/total/mode）、`hlsStartupKick`/`hlsPreflight`/`nativeStall` beacon，排成時間軸；輸出每首：T0→playlist 回應、→init 請求、→seg0 請求、→seg0 完成、→出聲（ms），同「未歸屬」= ms − 已知段。**要正控**：揀一首 09-06 已知 4.9s 嘅歌逐段人手核。輸出 markdown 表 + 分佈（p50/p90 每段） | `ops/perf/first-track/timeline-20260907.md`：**答「2.3 秒去咗邊」**（三段串行外係 AVPlayer 內部？init/seg0 串行定並行——G-3 順手答） |
| S0-2 | **G-4 sidx 穩定性**（`ops/perf/first-track/sidx-stability.mjs`） | 揀 30 首（09-06/07 有 `[hls]` 記錄嘅 + 隨機 10 首），對每首：用**隔離 cache 目錄**（env 指去 scratch，唔掂 `backend/cache/resolve-cache.json`）resolve 兩次（第二次 bust），每次讀檔頭解 sidx，比 `clen`、init 大細、首 5 個 segment offset/size。**限速**：每次 resolve 間隔 ≥4s，全程唔准超過 60 次 yt-dlp（YouTube 出口 IP 係命脈）。撞 403 即停 | `sidx-stability-20260907.md`：「同一 youtube_id 跨 resolve sidx 一致率」+ 唔一致嗰啲係咪 clen 都唔同（= 唔同 itag/variant）→ **決定 N1 key 用 `yt` 定 `yt+clen`** |
| S0-3 | **G-7 tunnel 吞吐探針**（`ops/perf/first-track/tunnel-probe.sh`） | 經 `https://api.odemusics.com` 打 `/api/health`（RTT）、`/api/stream/<熱歌> -r 0-1048575`（1MB 吞吐）各 5 次，輸出 CSV 一行（ts, rtt_med, kbps_med, colo）；**冇 launchctl 權限**，唔做 cron——寫成「before/after 各跑一次」用；另讀 `127.0.0.1:20241/metrics` `quic_client_min_rtt` | `tunnel-probe.csv` before 一行 |
| S0-4 | **G-9 before**：由 `[hls]` log `ms=` 分佈（09-06/07）出「playlist 回應耗時 p50/p90」+ 估算 miss 率（ms > 500 當 miss） | 數字入 timeline 報告 |

## 2. 第 1 步：純 backend

### N1 `playlistCache` 持久化 + key 改 `youtubeId`（`backend/routes/hls.js`）
- key 由 `${youtubeId}::${url}` 改為 `${youtubeId}`；entry 存 `{ structure, clen, initSize, expiresAt, savedAt }`；命中時**校驗**：`resolveAudioUrl` 攞到嘅 URL 做 HEAD/首 range 拎 `clen`（已有 head fetch 邏輯——只喺 miss 先做完整 sidx 解析；hit 時做一個輕量 `Range: bytes=0-0` 攞 content-range 總長對 clen，≈1 個 RTT 對 googlevideo，仍慳 sidx 解析嘅大 range）——**如果 S0-2 證明 clen 跨 resolve 100% 一致，可以改為「唔校驗、TTL 24h」**，由 Fable 睇 S0-2 結果定（執行者兩個 mode 都做，env `HLS_PLAYLIST_VERIFY=1|0`，預設 1）。
- 持久化：`backend/cache/hls-playlist-cache.json`（同 resolve-cache 一樣 debounce flush；開機載返；上限 2,000 條 LRU；TTL 24h）；**同 W2 C8 教訓**：呢個檔只由 server.js 寫，scripts 唔准 import 寫。
- `structureInFlight` key 同步改。
- opsMetrics：`hlsPlaylist: { hit, miss, verifyFail }` 計數（hourly + total，`normalizeBucket` 補齊）+ gauge `playlistCacheSize` 已有。
- `[hls]` log 行加 `cache=hit|miss|verifyfail`。
- 唔改 playlist 內容、唔改 `Cache-Control: no-store`（N6 未拍板）。

### N3 warm 名單擴充（backend 側，`backend/routes/stream.js` `/warm` + 新 `lib/hotIds.js`）
- `lib/hotIds.js`：滾動 24h 串流計數（`recordStreamRequest` 已有 per-id？冇就加 Map id→{count,last}，上限 5,000，持久化入 opsMetrics 或獨立 json）；`getHotIds(n)` 出最近 24h 最多真播放（`[stream]` 非 curl、非 warm burst——用 ua 判）嘅 id。
- `/warm`：client 名單（≤10）**之後**補 backend 熱門 id 到總數 ≤ 16（`WARM_TOTAL_CAP` env），去重；`anyStreaming()` 讓路邏輯照舊。
- 開機 warm 由 App 觸發呢點唔變（App 唔改）。
- log：`[warm] client=<n> hot=<n>`。

### N5 熱池保底（`backend/lib/resolveAudio.js` bufferCache）
- 加 `pinnedIds`（來源 = `getHotIds(PIN_N)`，`PIN_N` env 預設 12，每 30 分鐘刷新）；`evictBufferCacheOverflow()` 跳過 pinned；pinned 入池一律 head-only（4MB cap）；pinned 總 bytes 唔准超過 128MB 閘嘅一半（64MB，即 12×4MB=48MB ✓）。
- pinned 唔會自動 warm（唔掂 YouTube 額外流量）——只係「入咗池就唔踢」；由 `/warm` 或真播放自然入池。
- gauge：`bufferCache.pinned`、`bufferCache.totalBytes`。
- 紅線：`bufferCacheTotalBytes` 記帳同 W1/W2 記錄過嘅洩漏（`:570` 冇扣數）一齊核——pinned 唔准令記帳錯。

### 唔做
N2（Eric 明令）、N6、N4 剩餘（D-9）、任何 App 改動。

## 3. 驗證（執行者出證據）
| 項 | 證據 |
|---|---|
| H0 | S0-1 timeline 對 09-06 Eric 12 首 + 09-07 全部起播；正控一首人手核；輸出未歸屬 p50 |
| H1 harness（express 起 hls router 隨機 port + mock googlevideo） | miss→hit 路徑：第二次同 id 唔同 url 命中（cache=hit）；clen 唔夾 → verifyfail → 重解；restart（重新 import module）後由 json 載返命中；LRU 上限；TTL 過期；playlist bytes 前後一致（byte-for-byte vs HEAD 版本輸出）；`structureInFlight` 並發只 head fetch 一次；opsMetrics 計數對得上 |
| H2 harness（stream router） | `/warm` client 6 + hot 補到 16、去重、`anyStreaming` 讓路不變；hotIds 排序正確、上限 5,000、curl/warm-burst UA 唔計 |
| H3 harness（resolveAudio bufferCache） | pinned 唔被 evict、非 pinned 照 LRU、總 bytes 記帳前後一致（加/減/pin/unpin 各路徑數返）、pinned 上限 |
| H4 | `node --check` 全部改動檔 + 逐 module import（唔 import server.js）；`backend-restart.sh --dry-run` 過（新 cache json 要入運行時白名單如有需要） |
| H5 before 數 | `[hls] ms=` 09-06/07 p50/p90；bufferCache 命中率（opsMetrics）；Eric HLS 起播中位 4,975ms（09-06）/ 5,145ms（09-07）；tunnel-probe before 一行 |

## 4. 交付
Commit（pathspec）：第 0 步 script + 報告一個；N1 一個；N3+N5 一個；harness + `FIRST-TRACK-STEP01-REPORT-20260907.md` 一個。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。唔部署。

## 5. Opus 驗收要點（預告）
timeline script 正控；N1 key 改動對 1.7% no-sidx / 換片（youtube_id 同但片換咗——clen 校驗係咪擋到）；持久化檔跨 restart 載返；記憶體記帳；restart smoke（`[hls] cache=hit` 出現、`hlsPlaylist.hit` 上升、playlist bytes 同舊版一致、`/warm` log）；after 量法 = Eric 真機 `nextTrackMs origin=start` 中位 + `[hls] ms=` p50 + timeline 重跑。
