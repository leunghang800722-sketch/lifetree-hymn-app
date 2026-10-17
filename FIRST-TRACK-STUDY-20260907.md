# 第一首歌起播研究底稿 — 2026-09-07

**作者**：Opus 5（研究員角色：唔改 code、唔 commit、唔部署、冇開模擬器/AVD）。
**對象**：Fable 5.1（出執行單前嘅底稿）。**Eric 原話**：「精益求精」，唔要一嚟就跳去單一方案。
**方法**：讀 code + 讀 log + 今日現場度數。所有數字都標出處；估算一律寫明假設。

---

## §0 量度環境（紅線：任何起播數字都要連環境一齊講）

2026-09-07 15:40–15:52 HKT，喺 backend 同一部 Mac 上量（即係「經 tunnel 兜返自己」，同 2026-08-31 嘅四層隔離實測同一手法，可比）。

| 量度 | 結果 | 指令 |
|---|---|---|
| loopback `/api/health` | **0.57 / 0.73 / 3.93 ms** | `curl -w %{time_total} http://localhost:3001/api/health` |
| tunnel `/api/health`（含 connect+TLS） | **757 / 758 / 962 ms** | `curl … https://api.odemusics.com/api/health` |
| tunnel 穩態每 request 開銷（keep-alive，唔含握手） | **386–407 ms** | 1C errata #5（`a1t − server_ms`） |
| cloudflared → CF edge QUIC `min_rtt` | **177 / 177 / 178 / 178 ms**（4 條連線） | `curl 127.0.0.1:20241/metrics \| grep quic_client_min_rtt` |
| cloudflared edge location | **sea01 / sea06 / sea08 / sea10**（Seattle） | 同上 `cloudflared_tunnel_server_locations` |
| 呢部 Mac 公網 IP / CF colo | **187.15.93.116 / colo=SEA** | `curl https://www.cloudflare.com/cdn-cgi/trace` |
| tunnel 單條連線吞吐（3,167,422 B payload ×6） | **1.19 / 1.30 / 1.31 / 1.37 / 1.39 / 1.39 MB/s** | `curl -w %{speed_download} …/api/hymns?lite=1` |
| **tunnel 3 條並行** | **1.30 + 1.33 + 1.37 = 4.00 MB/s 合計** | 同上 ×3 背景 |
| 同一 payload loopback | 22.8 MB/s（冷）/ 426 MB/s（cache hit） | 同上 localhost |
| cloudflared 對外 socket | **4 條 UDP、0 條對外 TCP** = 仍然行緊預設 QUIC | `lsof -nP -p <pid>` |

### 🔴 三條同舊記錄唔同、必須更新嘅事實

1. **`0.65 MB/s 硬天花` 今日唔成立。** 今日單條 1.19–1.39 MB/s（快咗 ~2 倍），而且**3 條並行合共 4.0 MB/s**。2026-08-31 記錄嘅「3 條並行只得 0.67 MB/s 合計 → 真頻寬天花」**今日重現唔到** —— 今日嘅 ~1.3 MB/s 係 **per-connection** 上限，唔係全局天花。
   → 含義：`project-uplink-bottleneck-065mbps` 嘅「搬少啲字節」推論要降權；「開多條連線」由「冇用」變「有用」。
2. **RTT 地板嘅真身係「origin 喺美國 VPN 後面」。** cloudflared 打去 **Seattle** edge，QUIC min_rtt **177 ms**。呢 177ms 係 Mac→NordVPN→SEA 呢一段，同 App 端無關、同 HLS/progressive 無關、任何 code 改動都改唔到。
3. **`playlistCacheSize` gauge = 3。** 即係 iOS HLS 嘅 sidx 結構快取幾乎永遠係空 —— 見 §1.1 環節 6，呢個係本次最抵嘅單點發現。

---

## §1 路徑重繪

### §1.0 兩條路今日嘅終點數（`nextTrackMs origin=start`，client-log，09-05/06/07）

| 平台 | source | 日 | n | p50 | p90 | max |
|---|---|---|---|---|---|---|
| ios | stream | 09-05 | 2 | 4,893 | — | 5,441 |
| ios | stream | **09-06** | **19** | **5,176** | 9,148 | 9,516 |
| ios | stream | 09-07 | 3 | 4,848 | — | 5,426 |
| ios | local | 09-05/06 | 4 / 10 | **190 / 183** | 256 / 356 | 262 / 1,493 |
| android | stream | 09-05 | 6 | 6,235 | 7,084 | 32,369 |
| android | stream | **09-06** | **11** | **2,692** | 6,712 | 6,983 |
| android | stream | 09-07 | 3 | 5,619 | — | 6,640 |

（出處：`backend/logs/client-log/client-log-2026-09-0{5,6,7}.jsonl`，`event=nextTrackMs` + `detail` 內 `origin=start`。）

**⚠️ 樣本紀律**：09-06 係唯一一日兩個平台都有雙位數樣本。iOS 呢批基本上係 Eric 部機（`hlsDeviceIds` 只有 2 個 id，其餘 iOS 全部行 progressive）。Android 嗰 11 條係 `d03463c3…`，1E 判「未證實真機定 AVD」。**所有 p50 都係 n<20 嘅單機數，只可以做量級判斷，唔可以做百分比宣稱。**

---

### §1.1 iOS 路徑表（HLS 路，即 `hlsDeviceIds` 名單內；名單外 iOS 行 progressive，見 §1.3）

| # | 環節 | 檔:行 | 做乜 / 依賴 | 近期實測 | 窄位判斷 |
|---|---|---|---|---|---|
| 1 | Native 冷開（pre-JS） | — | dyld/RN/Hermes 起身到 bundle entry | **1,239–1,346 ms**（1C §6，5 run；errata #3：warm 都係 ~1,215 ms，**同 cache 無關**） | ⚠️ 佔冷開到首屏 ~82%，但**唔喺撳掣之後**，唔算起播窄位 |
| 2 | JS 起身 → 首屏 | `App.js` / `HomeScreen.js` | `app`/`cont`/`home` mark | 冷 163/232/**286 ms**；暖 112/185/**382 ms**（1C §1.1/§2.1） | 🟢 唔係窄位 |
| 3 | `/api/hymns?lite=1` | `src/hooks/useCachedHymns.js` | 歌庫落地先畫得到卡 | `hymnsMs` **1,189–1,389 ms**（ttfb 388–549 / body 781–841 / parse 15–20）；wire 2,376,336 B；`ok1=5/5` | 🟡 決定「幾時撳得到」，唔喺撳掣之後 |
| 4 | 開機 warm（`warmIds`） | `App.js:228` / `App.js:4556` | POST `/api/stream/warm`（≤10 id）；backend `routes/stream.js:142` 順手 `warmBuffer()` | 名單 = **「今日為你預備」6 首**（`dailyPickBalanced`） | 🔴 **名單同「隨心聽」完全唔重疊**（見 #5） |
| 5 | 撳「隨心聽」→ 揀第一首 | `src/components/home/HomeScreen.js:230-262` | `randomShuffle(全庫)` → `findIndex(getLocalUri!=null)` → 換上第 0 位 | 全庫 7,156 行；本地 cache 上限 **60 檔 / 300MB**（`audioPrefetch.js:32-34`） | 🔴 **真隨機，唔係 seeded** → 開機嗰刻**預測唔到**。W3 本地偏向只係「有就中」；1E 真機 `origin=start` **stream:local = 87:7 = 92.6% 冇中** |
| 6 | `playQueue` → `toTrack` | `App.js:2866` / `App.js:167-193` | URL 三選一：`file://`(贏) > `.m3u8`(HLS) > `/api/stream/:id` | JS 側同步工作：單曲撳歌行 `buildAutoplayTail`(掃全庫加權抽 30 首，`App.js:2574`)；「隨心聽」**唔行** tail | 🟢 量級 <20ms（1C `perfHome` 四個 useMemo 合共 <30ms 做參照），唔係窄位 |
| 7 | `TrackPlayer.add/play` | `App.js:2954-2958` | `reset → add(全隊) → skip → play` | `transitionT0Ref` 喺 `add()` **之前**打（`App.js:2933`）→ `nextTrackMs` 由撳掣起計，冇少報 | 🟢 |
| 8 | HLS 預檢（並行） | `App.js:2977-3010` / `src/hlsPreflight.js` | 同一刻 fire 多一個 m3u8 GET，只認明確 4xx/5xx 先降級 | 09-07 只有 **2 條** beacon（`ok=1 ms=1229 ctx=start` / `ok=1 ms=5204 ctx=next`）；backend `resolveStructureShared` 防重複 head fetch | 🟢 零起播延遲（A/B 110ms vs 112ms） |
| 9 | **AVPlayer GET playlist** | `backend/routes/hls.js:148` | `resolveAudioUrl()` → head fetch googlevideo 解 `sidx` → 砌 m3u8 | **今日實測（經 tunnel）**：URL 暖 / sidx 冷 = **1.45 s、1.81 s**；完全 cache hit = **0.758 s、0.778 s**；cold resolve = **4.60 s、5.14 s**。backend 側 `[hls] ms=` 只有 4 個樣本：**707 / 835 / 4,569 / 4,760 ms** | 🔴🔴 **最大可修窄位**：`playlistCache` 係純記憶體 Map、key = `youtubeId::url`，gauge **= 3**（3 日 10 次 restart）→ 每次起播幾乎都要重新問 googlevideo 攞檔頭。**server 側 0.7–1.05 s，純 backend 可修** |
| 10 | AVPlayer GET init segment | `routes/stream.js` byte-range | `EXT-X-MAP BYTERANGE="723@0"` | init 大細實測只有三個值：**632 / 668 / 723 B**；今日 tunnel ttfb **1.364 s**（首個請求含握手） | 🟡 一個 round trip 買 723 bytes |
| 11 | AVPlayer GET segment 0 | 同上 | `#EXT-X-BYTERANGE:162114@1091` | 今日 tunnel：ttfb **0.976 / 1.117 s**，total **1.635 / 1.882 s**，162,114 B ≈ **210–235 KB/s**（細傳輸受 slow-start 主導） | 🟡 |
| 12 | 出聲 | — | | HLS Stage B 最佳：**633–1,813 ms**；今日真機 p50 **4,848–5,176 ms** | |
| 13 | 起播救援 | `App.js:2325-2358` | 每 1 秒 poll，凍 2 tick 起每 2 tick `swNudgePlay()`，每首上限 8 次 | 09-06：**71 kick / 18 episode**（p50 n=3、max n=8 ≈ **16 秒**）；`bufferedNow=0` 佔 **57/71**。09-07：19 kick / 5 episode | 🔴 起播期「乜都冇 buffer 到」係常態，唔係例外 |
| 14 | 失敗形態 | `App.js` H1/H3 | | 09-06 `nativeSkipAttributed` **20 條全部 iOS**；`nativeStall` **199 條**（樣本 `phase=nudge pos=0.0 itemNil=1 bytesXfer=0`）；`hlsFallback` **3 日 0 條** | |

**iOS 起播時間帳（今日數據重建，假設寫明）**

| 組成 | 全暖理想 | 今日常見 | 冷 resolve |
|---|---|---|---|
| playlist（含 resolve + sidx head fetch） | 0.39 s（純 RTT） | **0.39 + 0.7~1.05 = 1.1~1.4 s** | 0.39 + 3.1 + 0.8 ≈ **4.3 s** |
| init segment（723 B） | 0.39 + 0.18 = 0.57 s | 0.57 s | 0.57 s |
| segment 0（162 KB） | 0.39 + 0.18 + 0.15 = 0.72 s | 0.72 s | 0.72 s |
| **合計（假設三段串行）** | **≈ 1.7 s** | **≈ 2.4–2.7 s** | **≈ 5.6 s** |

假設：①每個 round trip 用穩態 390 ms（1C errata #5，唔用我今日 curl 嘅 757 ms —— 嗰個含 TLS 握手兼且我部機**同時經 VPN 出去再經 VPN 入返嚟**，對真用戶係上界）；②backend warm ttfb 182 ms（1E §4.6 / agent §1.3）；③三段串行（AVPlayer 對 `EXT-X-MAP` 同第一條 segment 嘅取數次序未實測，見 §5 缺口 G-3）。
**對數**：全暖 1.7 s ≈ HLS Stage B 實測 633–1,813 ms ✅；今日常見 2.4–2.7 s + 12–17% 冷尾 + kick episode ≈ 觀察到嘅 p50 4.8–5.2 s（差距見 §5 G-1）。

**🔑 一句話**：iOS 而家嘅起播**唔係 byte 樽頸**（只要 163 KB），係 **「串行 round trip 數 × RTT」+「每次都要重新解 sidx」**。

---

### §1.2 Android 路徑表（progressive，`toTrack` 唔會出 `.m3u8`）

| # | 環節 | 檔:行 | 做乜 | 近期實測 | 窄位判斷 |
|---|---|---|---|---|---|
| 1 | Native 冷開 | — | `am start -W TotalTime` | **441 / 458 / 473 ms**（S1）、407/419/445（S2）→ **冷暖一樣** | 🟢 比 iOS 快 ~3 倍 |
| 2 | JS → 首屏 | 同 iOS | `app`/`cont`/`home` | 冷 113/159/**220**；暖 118/209/**448** ms | 🟢 |
| 3 | `/api/hymns?lite=1` | 同 iOS | | `hymnsMs` **1,272–1,310 ms**；`byt` 2,381,052；`ok1=5/5` | 🟡 |
| 4 | 開機 warm | `App.js:4556` | 同 iOS 一樣 call `warmIds` | ✅ 兩平台都行 | — |
| 4b | 本地預載 | `audioPrefetch.js` | **Android 恆 no-op**（`Platform.OS!=='ios'` 即回）；APK 冇 expo-file-system | 1B 場景 H：測試窗內 `/api/stream` 只有 1 條 = 播緊嗰首，**零預載** | 🔴 Android **完全冇本地 cache 呢條腿** |
| 5 | 揀第一首 | 同 iOS | `getLocalUri()` 恆 null → W3 本地偏向自動 no-op | — | 🔴 Android 第一首 **100% 行網絡** |
| 6 | `toTrack` → `add/play` | `App.js:167` | `${API_BASE}/api/stream/:id` 一條 URL | — | 🟢 |
| 7 | **backend resolve** | `lib/resolveAudio.js:258` | cache miss → yt-dlp 串行 3 策略 | 冷 `resolve_ms` p50 **2,993–3,315 ms**、p90 3,496–7,437、**min 2,541 ms**（yt-dlp 硬地板，n=4,334） | 🔴 冷路必付 ≥2.5 s |
| 8 | backend → googlevideo | `routes/stream.js` | 攞第一個 byte | 冷 `ttfb_ms` p50 **3,785–4,383 ms**、p90 **5,045–9,676**；暖 p50 **182 ms**（09-06 有 buffer hit 時 **1 ms**） | 🔴 冷/暖差 **20 倍** |
| 9 | 派 bytes | 同上 | ExoPlayer 一條 `range=-` 開放到 EOF | 冷路 `sent` p50 **3.59–4.12 MB ≈ 成個 clen**（09-05 sent 4.12 vs clen 4.12 MB）；暖路 p50 **0.15 MB**（64 KB range） | 🟡 |
| 10 | ExoPlayer 起播門檻 | RNTP 4.1.2 → `DefaultLoadControl` | `DEFAULT_BUFFER_FOR_PLAYBACK_MS = 2500` ≈ **40 KB**（itag140 128 kbps） | 40 KB @ 1.3 MB/s = **0.03 s** | 🟢 **今日完全唔係窄位**（08-31 嗰陣 @0.65MB/s 都只係 0.06 s） |
| 11 | 出聲 | | | 真機 09-06 p50 **2,692 ms**（n=11）；AVD 6,057–7,084 ms（n=4） | |
| 12 | 儀器 | | `hlsStartupKick`/`nativeStall` 全部 iOS-only | Android **0 條** stall/救援 event（3 日） | ⚠️ 唔係「冇事」，係**冇儀器**（C1/1E 已記） |

**Android 起播時間帳**

| 組成 | 暖 | 冷 |
|---|---|---|
| resolve | 0 | **3.0–3.3 s** |
| upstream ttfb | 0.18 s（buffer hit 0.001 s） | 0.8–1.1 s（= ttfb 4.0 − resolve 3.1） |
| tunnel RTT + connect | ~0.4–0.8 s | ~0.4–0.8 s |
| 40 KB 起播門檻 | 0.03 s | 0.03 s |
| **合計** | **≈ 0.6–1.0 s** | **≈ 4.4–5.3 s** |

對數：09-06 p50 2,692 ms 落喺暖同冷之間（backend `startWarm` 率 82.6%，但 p90 6,712 ms 就係冷尾）✅。AVD 6.0–7.1 s 全部 `surface=shuffle` = 隨機歌 = 冷路 ✅。

**🔑 一句話**：Android 嘅起播 **完全由 backend cold resolve 主導**（一個 3 秒地板 + 1 秒 upstream），app 側冇任何嘢好慳。

---

### §1.3 兩條被忽略嘅路

- **iOS 非 HLS 名單（= 除 Eric 之外全部 iOS 用戶）**：行 progressive，即係 `project-hls-vs-progressive-startup-ab` 量到嘅 **10/10 要救援、5/10 徹底跳歌、itemNil=1** 嗰條路。呢批用戶嘅起播體驗**冇任何 09-02 之後嘅改善**，而且**冇人量過**（1E 唯一認證 iOS 真機就係 Eric，佢喺名單內）。
- **backend 起播統計**（`ops-metrics.json`，唔受 deviceId 污染、兩平台共用）：`startReq/startWarm/startCold` = 122/107/15（09-05）、500/413/87（09-06）、206/182/24（09-07）→ **起播暖率 82.6–88.3%**。
  ⚠️ 呢個數同「resolve cache 只覆蓋 573/7,156 = **8.0%** 歌庫」唔矛盾：真實播放高度集中喺一小撮歌。**但佢亦都話俾我哋知：iOS p50 5 秒係喺 83–88% 已經 warm 嘅情況下發生嘅 —— 即係「preresolve 覆蓋率」唔係 iOS 嘅主因。**

---

## §2 方向比較表

「效益」一律標明係「p50」定「p90/尾巴」——呢兩樣要分開，因為好多方向只醫尾巴。

| # | 方向 | 機制 | 預期效益（附假設） | 風險 | native build？ | 複雜度 | 依賴 | 平台 |
|---|---|---|---|---|---|---|---|---|
| **N1** | **`playlistCache` 持久化 + key 由 `yt::url` 改做 `yt`** | sidx 嘅 byte offset 係**媒體檔本身**嘅屬性，URL 換咗（每 4–5 小時）offset 一個字唔變。而家 key 帶住 url → 每次 URL 續期就全部作廢；再加 Map 唔落碟、3 日 restart 10 次 → gauge **= 3** | iOS p50 **−0.7～−1.05 s**（server 側 head fetch 直接消失）；亦順手令 `hlsPreflight` 唔使等 | 低。要驗證「同一 youtube_id 唔同 format variant 會唔會有唔同 sidx」——`resolveAudioUrl` 有機會揀到唔同 itag（Stage B 記錄嘅 1.7% no-sidx 隨機性）。**修法：entry 存埋 `clen`，`clen` 唔夾就當 miss** | ❌ | **低**（1 個檔，~40 行） | 無 | iOS（HLS 名單） |
| **N2** | **「隨心聽第一首」加第二層偏向：backend 已 warm 池** | 而家只有一層（本地檔）。加一層：boot 時攞 backend 一份「而家 resolve 暖」嘅 id 集（573 個），洗完牌搵第一個命中嘅換上第 0 位。第 2 首之後照舊隨機（有時間 `/warm`） | 兩平台 **p90 −3～−4 s**（把 12–17% 冷尾變暖）；p50 iOS −0.3 s / Android −0.5 s（把 `startCold` 由 15% 推向 ~0） | 中低。①「隨心」變成偏向同一批 573 首 → 多樣性下降（緩解：只郁**第一首**，同 W3 一樣）；②要一條新 route 出 warm id 清單（~5 KB gzip） | ❌ | **中低**（backend 1 route + App 1 段） | N5（要 backend 出清單） | 兩平台 |
| **N3** | **`/api/stream/warm` 名單由「今日 6 首」擴到覆蓋真實入口** | 而家開機只 warm `dailyPickBalanced` 6 首，而 1E 顯示 92.6% 起播係 stream = 名單脫靶。改為：warm 名單 = 今日 6 + 現用 chip 頭 4 + 最近加入頭 2（上限 10 已經有） | p50 影響細（已經 82–88% warm）；主要係令 `surface=chip/recent` 嗰批唔使冷 | 低（`/warm` 已存在、202 即回、`anyStreaming()` 讓路已做） | ❌ | **低** | 無 | 兩平台 |
| **N4** | **剷 `youtube:player_client=tv` 策略 + 收窄失敗路徑（= C9 cluster，已排 W2）** | 累計 `tries=1087 / ok=0 / fail=1087`，`msSum=40,806,109 ms`（平均 37.5 s/次）。串行 fallback 令失敗路徑 76 s，而 client 死線 10–20 s | 唔改 p50。**醫「首歌播唔到自己跳」呢種最痛失敗形態**。3 日 92 次 `All yt-dlp strategies failed`（29 個 id，其中 64 次係同一條死鏈） | 低。`RESOLVE_TV` 已經**預設關咗**（`resolveAudio.js:87`）—— ⚠️ 即係 1087 呢個數係**歷史累計**，唔係現行。真正要做嘅係 `default-any`（1,128 試 / 64 中）同死鏈 backoff | ❌ | 低 | 已排 W2 | 兩平台 |
| **N5** | **backend「熱池」常駐：bufferCache 由 LRU 改「保底 N 首常暖」** | 而家 `MAX_BUFFER_ENTRIES=40 / 128MB`，命中率 27.2 / 53.6 / 39.1%（逐日）、71.9%（累計）。改成「隨心聽候選池頭 N 首永遠唔 evict」 | 命中即 ttfb 182 ms → **1 ms**（09-06 實錄）。iOS 省 init+seg0 兩段各 ~0.18 s；Android 省 0.18 s | 中。記憶體：N=20 × 12MB cap = 240MB，超出而家 128MB 閘。要用 **head-only cap**（4MB，`LONG_WARM_CAP_BYTES` 已有）→ 20 × 4MB = 80MB | ❌ | 中 | 記憶體預算要 Eric 知（Mac 而家 swap 3.74GB/5GB） | 兩平台 |
| **N6** | **playlist 落 CF edge cache** | 而家 `Cache-Control: no-store`。playlist 內容只係 byte offset + 相對路徑 `/api/stream/:id`，**唔含任何 googlevideo URL、唔含任何音訊 byte**。設 `public, max-age=1800` | iOS **−0.39 s 起** RTT 段（edge 命中 ~30–60 ms 對 390 ms）；兼且 backend 完全唔使醒 | 中。①要確認 offset 對同一 `youtube_id` 永遠穩定（同 N1 同一個問號）；②歌被 delist / 換片 要有 purge 手段；③ `?swr=` nonce 要 bypass cache | ❌ | 中低 | N1 先做（同一個穩定性前提） | iOS |
| **N7** | **cloudflared `--protocol http2`** | 而家預設 QUIC（4 條 UDP、0 條 TCP 實證）。08-31 假說：QUIC/UDP 經 VPN = 吞吐殺手 | ⚠️ **今日呢個假說證據變弱**：單條已經有 1.3 MB/s、並行 scale 到 4 MB/s。可能仍然改善 **per-connection** 上限同 loss（metrics 見 `lost_packets reordering=999`、`dropped initial key_unavailable=2613`） | 中。要 restart tunnel（短暫斷線），要挑 Eric 唔用 App 嘅窗口 | ❌ | 低（一個 flag） | 要窗口 | 兩平台 |
| **N8** | **VPN 出口換去亞洲 / 改用固定住宅代理** | RTT 地板 177 ms 全部嚟自「Mac → NordVPN → Seattle edge」。換去香港/日本節點，edge 會變 HKG/NRT，177 ms 有機會跌到 20–50 ms | **兩平台每個 round trip −0.13～−0.15 s**。iOS 3 個 round trip = **−0.4 s**；Android −0.15 s。連帶 `/api/hymns` 冷開都快 | 🔴🔴 **最高風險**：`project-hymn-app-infra` 明文寫住「成個 App 靠緊呢條 NordVPN 出口 IP 未被 YouTube 封」。換 IP = 賭新 IP 冇被封。**Eric 拍板 + 要有即時回滾** | ❌ | 低（改設定）但**風險最高** | Eric 拍板 | 兩平台 |
| **N9** | **首段音訊落 CF edge cache（init + segment 0）** | 只 cache `/api/stream/:id` 頭 163 KB（我哋自己出嘅 fMP4 bytes，唔係 googlevideo URL） | iOS **−0.7～−1.0 s**（兩個 round trip 由 390+180 ms 變 edge ~40 ms + 高速傳輸） | 🔴 **版權定性改變**：由「用戶機上臨時快取」變成「我哋喺 CDN 分發音訊」。同 Eric 07 月立場**唔同性質**。另外 CF 免費 ToS 對 media caching 有限制 | ❌ | 中 | **Eric 拍板（版權）** | iOS |
| **N10** | **Android 開 `maxCacheSize`（ExoPlayer SimpleCache）** | `setupPlayer({maxCacheSize: N})` → `MusicService.kt:185 CacheConfig` → kotlin-audio SimpleCache。**JS-only、RNTP 4.1.2 已有呢段 native code、APK vc55 唔使重出** | Android 由「零本地 cache」變「有」。重播/回帶命中 ≈ iOS local 嘅 183–190 ms | 中。①同 iOS 本地預載**同一條版權線**；②`/api/stream/:id` URL 穩定 = cache key 穩定 ✅；③ cache 大細要有預算；④第一首**仍然係 miss**，只醫第二次 | ❌（純 OTA，runtime "4"） | 低 | **Eric 拍板（版權，同 iOS 同一條線）** | Android |
| **N11** | **Android `playBuffer` 由 2,500 ms 調細** | `PlayerOptions.playBuffer`（JS 可設，`MusicModule.kt:189` 已核實接線） | **≈ 0**（40 KB → 16 KB，@1.3 MB/s 慳 0.018 s） | 低 | ❌ | 低 | — | Android。**不建議做 —— 收益量級係毫秒** |
| **N12** | **iOS AVPlayer 參數** | `preferredForwardBufferDuration` — **已證偽**（`project-minbuffer-experiment-falsified`：item 未出世根本掂唔到）。`automaticallyWaitsToMinimizeStalling` — **已經係 false**（`waitForBuffer:false`，`App.js:818`）。`preferredPeakBitRate` / `canUseNetworkResourcesForLiveStreamingWhilePaused` — RNTP **冇 expose**，要 native | 極低。HLS 之下起播 bytes 已經係 163 KB 固定，冇嘢好封頂 | — | ✅ 要 build | 高 | 出 build | iOS。**不建議做** |
| **N13** | **iOS：更細嘅第一段 segment** | segment 邊界由 **googlevideo 自己嘅 sidx** 決定（實測 28 段 / 每段 162,114 B / 9.985 s）。要更細 = 要**重新分片 fMP4**（拆 moof/mdat + 改 tfdt）= 真 remux | 起播 bytes 163 KB → 40 KB，@1.3 MB/s 慳 **0.09 s** | 高（remux 出錯 = 播唔到） | ❌ | **高** | — | iOS。**不建議做 —— 收益 90ms 對複雜度高** |
| **N14** | **itag 139（48 kbps HE-AAC）做第一首 / 做 HLS variant** | `resolveAudio.js:89` 而家 `bestaudio[ext=m4a]` → 全部 itag 140（573/573 實證），clen p50 **4.47 MB** / p90 7.66 MB。139 大約細 2.7 倍 | progressive（Android）冷路 `sent` p50 由 4.12 MB → ~1.5 MB，@1.3 MB/s **慳 ~2 s 落載時間**（但唔慳 resolve 3 s、唔慳 ttfb）。HLS 之下**幾乎零收益**（只 163 KB） | 中。①音質下降（Eric/用戶感知）；②多一個 yt-dlp format 要驗死鏈；③139 唔一定每條片都有 | ❌ | 中 | Eric 拍板（音質） | Android 為主 |
| **N15** | **第一首本地預載（Phase 2.5 加碼）** | 已上線：開機串行落 5 首（今日2+chip頭1+聽日2）。加碼 = 落多啲 | iOS 命中即 **183–190 ms**（實測）。但 W4 一直冇收夠數答「加碼值唔值」 | 中。①流量（每首 3–8 MB，p90 7.66 MB）；②版權（本地音訊副本擴大）；③**「隨心聽」係真隨機，加碼預載對佢命中率貢獻近乎零**（60 檔 / 7,156 首 = 0.84%） | ❌ | 中 | Eric 拍板（流量+版權） | iOS only |
| **N16** | **JS 側同步工作** | 1A APP-002 unmemoized find、PlayerProvider re-render；`buildAutoplayTail` 掃全庫 | 量級 <30 ms（1C `perfHome` 四個 useMemo 合共 <30ms 做參照） | 低 | ❌ | 低 | 已排 W6 | 兩平台。**唔係起播窄位**，唔應該借起播名義做 |
| **N17** | **HLS 擴到更多 iOS 機** | 而家 `hlsDeviceIds` 只有 2 個 id；其餘 iOS 全部行 progressive（= 5/10 徹底跳歌嗰條路） | 對呢批用戶：起播「徹底放棄」由 **50% → 5.6%**（A/B 實測），救返時間 14–17 s → 1.8 s | 中。①`hlsFallback` 3 日 0 條 = 呢條救援路**冇被證實過會 fire**；②預檢 09-07 先上，n=2；③一 flip 就全開，冇分批 | ❌（純 backend JSON） | 低 | **Eric 拍板（D-2 已列）** | iOS |

---

## §3 我嘅排序建議

### 排序原則
1. **先做「唔使拍板、唔使 build、唔改用戶可見行為」嘅純 backend 修**——出錯即刻 restart 回滾。
2. **p50 同 p90 分開打**：N1/N6 打 p50，N2/N3/N4 打 p90 尾巴。
3. **唔准喺同一波夾兩個平台嘅行為改動**（否則又冇對照組）。
4. 每一波都要 **iOS + Android 兩邊量**（`project-ios-vs-android-startup-threshold` 嘅教訓）。

### 第一梯隊（建議即刻做，總共 ~1 個工作天，全部純 backend）

| 序 | 方向 | 點解排呢度 | 預期：首歌由幾秒 → 幾秒 |
|---|---|---|---|
| **1** | **N1 `playlistCache` 持久化 + 改 key** | 唯一一個「單點、純 backend、零拍板、零 build、零 OTA」而且直接切走 0.7–1.05 s 嘅修。`playlistCacheSize=3` 呢個 gauge 就係鐵證 | iOS HLS p50 **≈5.0 s → ≈4.0 s**（假設：省下嘅完全等於今日量到嘅 server 側 head-fetch 時間 0.7–1.05 s） |
| **2** | **N3 warm 名單擴到真實入口** | 零風險、route 已存在、10 個位而家只用咗 6 個 | p50 影響細；`surface=chip/recent` 嗰批冷路減少 |
| **3** | **N4 失敗路徑收窄（已排 W2）** | 唔改 p50，但醫最痛症狀（首歌無聲然後自己跳）。3 日 92 次 resolve 全滅、其中 64 次係同一條死鏈被背景 job 撞爆 | 「起播直接跳歌」次數下降（09-06 `nativeSkipAttributed`=20 做 before） |

### 第二梯隊（要一啲設計，但仍然唔使拍板 / 唔使 build）

| 序 | 方向 | 預期 |
|---|---|---|
| **4** | **N2 隨心聽第一首偏向 backend warm 池** | 兩平台 **p90 −3～−4 s**（把 `startCold` 15% 推向 0）。iOS p90 9.1 s → ~5.5 s；Android p90 6.7 s → ~3 s |
| **5** | **N5 bufferCache 保底熱池（head-only 4MB cap）** | iOS 再 −0.2～−0.35 s（兩個 range 各省 180 ms）；Android −0.18 s。配合 N1 之後 iOS p50 **≈4.0 → ≈3.7 s** |
| **6** | **N6 playlist 落 edge cache** | iOS 再 −0.35 s（一個 round trip 變 edge）。累計 iOS p50 **≈3.7 → ≈3.3 s** |

### 第三梯隊（要 Eric 拍板先做）

| 序 | 方向 | 拍板事項 | 預期 |
|---|---|---|---|
| 7 | **N7 tunnel `--protocol http2`** | 要一個「Eric 唔用 App」嘅窗口（會斷線幾秒） | 未知。今日證據已經轉弱，但一個 flag 就驗到；**建議做成「量度實驗」唔係「修法」** |
| 8 | **N17 HLS 擴機** | D-2（已列） | 名單外 iOS 用戶：徹底跳歌 50% → 5.6% |
| 9 | **N10 Android ExoPlayer cache** | 版權（同 iOS 本地預載同一條線） | Android 第二次起播 → ~200 ms |
| 10 | **N8 VPN 出口地區** | 🔴 最高風險（YouTube IP 封鎖） | 兩平台每個 RTT −0.13~0.15 s；iOS −0.4 s |
| 11 | **N9 首段音訊 edge cache** | 🔴 版權定性 | iOS 再 −0.7~1.0 s |

### 明確 **唔建議** 做（寫低，免得下一手又重新諗一次）
- **N11 Android `playBuffer`**：收益 18 毫秒。
- **N12 iOS AVPlayer 參數**：`preferredForwardBufferDuration` 已證偽（結構上掂唔到）、`automaticallyWaitsToMinimizeStalling` 已經係 false。
- **N13 更細 segment**：要真 remux，換 90 毫秒。
- **N16 JS 同步工作**：<30 ms，而且已排 W6，唔應該借起播名義提前。
- **N15 預載加碼**：對「隨心聽」呢個真隨機入口貢獻 0.84%，要拍板但回報唔對稱。等 W4 收夠 `surface` 數先講。

### 累計預期（iOS HLS 路，全部第一+二梯隊做齊）
```
今日 p50 4,848–5,176 ms
 −0.7~1.05 s  (N1 sidx 持久化)
 −0.2~0.35 s  (N5 熱池，init+seg0 由 RAM 派)
 −0.35 s      (N6 playlist edge cache)
 ≈ 3.3–3.6 s   ← 剩返嘅係「3 個串行 round trip × 390 ms」+ 傳輸 + AVPlayer 自己
```
再要落去 3 秒以下，就一定要掂 **N8（RTT 地板）** 或者 **N9（round trip 數）**——兩個都要 Eric 拍板。**「精益求精」嘅硬牆喺呢度。**

Android 對應：
```
今日 p50 2,692 ms（p90 6,712）
 N2 之後 p90 ≈ 3,000 ms（冷尾消失）
 N5 之後 p50 ≈ 2,500 ms
 剩返 = 1 個 round trip + connect + upstream ttfb
```

---

## §4 要 Eric 拍板嘅項

| # | 項 | 點解要佢決定 | 我嘅建議 |
|---|---|---|---|
| **E-1** | **版權線：Android 開唔開 ExoPlayer 本地 cache（N10）** | iOS 而家已經有本地音訊副本（60 檔/300MB）。Android 開咗就係「兩平台都存住音訊」。呢個係 07 月立場嘅延伸唔係新開一條線，但係擴大 | **開，但細 cap（50–100MB）**，同 iOS 同一把尺。純 OTA、零 build |
| **E-2** | **版權線：首段音訊上唔上 CF edge（N9）** | 呢個**係新開一條線** —— 由「用戶機上」變「我哋喺 CDN 上分發」。性質同本地快取唔同 | **暫時唔做。** 等 N1/N5/N6 做完睇返仲爭幾多先講 |
| **E-3** | **VPN 出口地區（N8）** | 換 IP = 賭新 IP 未被 YouTube 封。`project-hymn-app-infra` 明文話呢個係架構最脆弱嗰環 | **唔好第一時間做。** 但可以先做**零風險量度**：喺同一部 Mac 開第二個 NordVPN session 連亞洲節點，`curl cdn-cgi/trace` 睇 colo 同 RTT，唔郁 tunnel。有數先傾 |
| **E-4** | **HLS 擴機（N17 / 已有 D-2）** | 產品/風險決定。名單外 iOS 用戶而家行緊「5/10 徹底跳歌」嗰條路 | 我同 ROOTCAUSE D-2 嘅「維持單機」**唔同意**：而家已經有預檢（09-07）+ 起播 kick + native watchdog 三層，而 A/B 實錘 progressive 差 9 倍。**建議擴到 3–5 部機一個星期**，睇 `hlsFallback` 同 `nativeSkipAttributed` 先全開 |
| **E-5** | **音質：第一首用 itag 139（N14）** | 用戶聽得出。48 kbps HE-AAC vs 128 kbps AAC | **唔做。** HLS 之下零收益；Android 收益 ~2 s 但用音質換，唔抵 |
| **E-6** | **tunnel restart 窗口（N7）** | 會斷線 | 揀一個夜晚窗口，同 N1 部署夾埋一次過做 |
| **E-7** | **要唔要出 native build** | 本研究**全部第一/二梯隊建議都唔使 build**。呢個係好消息，要講明 | 起播呢條線**唔使 build**。build 留返俾 W8（native beacon） |

---

## §5 數據缺口（要量先答到）

| # | 缺口 | 點解重要 | 點量（唔使 build、唔使拍板） |
|---|---|---|---|
| **G-1** | **iOS 起播 5 秒嘅逐段分解**（playlist / init / seg0 / AVPlayer 內部）**冇 client 側時間戳** | 我 §1.1 個時間帳係由「backend log + 我今日 curl」拼出嚟嘅**推算**，唔係量度。3 段串行加埋 2.4–2.7 s，但觀察到 5.0 s —— **2.3 秒冇歸屬** | backend `[stream]` 已經有 `range=` 同 timestamp。寫一支**純讀 log** 嘅 script，將同一個 `hymnId` 喺起播窗口內嘅 `[hls]` + 頭三條 `[stream]` 排成時間軸，同 client `nextTrackMs` 對數。**零改動、可以即刻做** |
| **G-2** | **`hlsStartupKick` 期間 `bufferedNow=0` 佔 57/71 —— 究竟 backend 有冇喺派緊 byte？** | 如果 backend 派緊而 AVPlayer 話 0，就係 AVPlayer 內部問題（N1/N5/N6 醫唔到）；如果 backend 都冇 request，就係我哋自己嘅 route 卡住 | 同 G-1 同一支 script：kick 嘅 `ts` 對返 `[stream]` 有冇 in-flight request |
| **G-3** | **AVPlayer 攞 `EXT-X-MAP` init 同 segment 0 究竟串行定並行** | 決定 N6/N9 嘅效益係 −0.39 s 定 −0.78 s | 讀 `[stream]` log 兩條 range request 嘅 timestamp 差（<50 ms = 並行）。**零改動** |
| **G-4** | **同一個 `youtube_id` 唔同次 resolve，sidx offset 會唔會變** | **N1 同 N6 兩個方向嘅共同前提**。Stage B 記錄過 1.7% no-sidx「同一首歌隨機」 | 對 30 首歌各 `bustCache` 後重 resolve 兩次，比 `clen` 同頭 8KB 嘅 sidx。**要 backend script，唔使 restart** |
| **G-5** | **非 HLS iOS 用戶（= 除 Eric 外全部）嘅起播數 = 0** | 佢哋行緊已知最差嗰條路，而我哋**一個數都冇** | 冇捷徑：要麼擴 HLS 名單（E-4），要麼喺模擬器**清晒 prefetch cache** 再量 progressive（1C errata #7 已指出 S5 三首全 local = 只覆蓋 7% 路徑） |
| **G-6** | **Android 真機 telemetry = 0**（唯一 deviceId 未證實係真機定 AVD） | 我 §1.2 嘅 p50 2,692 ms 建基於 n=11 條未證實來源嘅樣本 | ROOTCAUSE D-12：Eric 部 Android 機開一晚 |
| **G-7** | **tunnel 吞吐/RTT 冇時間序列** | 08-31 量 0.65 MB/s、今日量 1.3 MB/s（並行 4 MB/s）—— **差 2–6 倍，而兩次都係「一次性 curl」**。任何「改善 X%」都可能純粹係當日條線唔同 | 加一支每 15 分鐘 `curl -w %{speed_download}` + `quic_client_min_rtt` 落 CSV 嘅 cron。**呢個係所有 after 量度嘅前置** |
| **G-8** | **`upstream403` gauge 未有一日完整數據** | 09-07 03:5x 先開始計，`hlsTotal=3` vs log 40 條 `[hls]`。真實 3 日 403 = **32(stream) + 4(hls) = 36 次**，gauge 讀 `0/0` | 等一日完整數據；期間用 `grep 'stream upstream bad status'` 做真值 |
| **G-9** | **`playlistCache` 唔中嘅真實比率** | 我只有 gauge=3 呢個快照 | N1 落地前先加一條 hit/miss counter（純 counter，零行為改動）—— 否則 after 冇 before |

---

## 附：本研究推翻/更新咗嘅舊結論

| 舊結論 | 出處 | 今日狀態 |
|---|---|---|
| 「0.65 MB/s 係真頻寬天花，並行唔 scale」 | `project-uplink-bottleneck-065mbps` | **今日重現唔到**：單條 1.19–1.39 MB/s，3 條並行 4.0 MB/s 合計。今日嘅 1.3 係 per-connection 上限 |
| 「搬少啲字節（降碼率）係三條路之一」 | 同上 | **降權**：HLS 之下起播只要 163 KB，字節唔再係窄位 |
| 「iOS 第一首慢 = AVFoundation 要成個 5MB」 | `project-ios-vs-android-startup-threshold` | HLS 路已經解決（163 KB 固定）。**但名單外 iOS 用戶仲係行緊舊路** |
| 「cold resolve 係最大窄位」 | 多處 | **Android 成立、iOS 唔成立**：backend `startWarm` 率 82.6–88.3%，iOS p50 5 秒係喺已經 warm 之下發生 |
| 「ExoPlayer 40KB 門檻係 Android 優勢」 | 同上 | 今日 @1.3 MB/s 只值 0.03 s。Android 優勢而家主要係 **native 冷開 458 ms vs iOS 1,243 ms** 同 **一個 round trip vs 三個** |

---
*本文件由 Opus 5 撰寫，未改動任何 source、未 commit、未部署。所有現場量度都係 read-only curl / 讀 log / 讀 metrics endpoint。*

---

## §6 Fable 5.1 審核判斷（2026-09-07）

讀完全份 + 核對關鍵數（`playlistCacheSize=3` gauge、cold/warm 94%/6%、隨心聽真隨機 `HomeScreen.js:230`）。同意 §3 排序骨架，補四點：

1. **N4 已經做咗**（W2 09-06 上線：tv 策略關、失敗路徑 76s→<30s、失敗率 4.9%→2.0%）。文件寫「已排 W2」係舊資料；剩低嘅只係 `default-any` 值唔值（D-9，等 7 日數）同死鏈被背景 job 撞爆（64/92）——後者係一個新細單：背景 job 對 `failCache` 命中嘅 id 唔應該重試。
2. **先做 G-1 再做 N1**。iOS 5 秒有 2.3 秒未歸屬，而 N1 嘅 −0.7～1.05s 係推算。一支純讀 log 嘅時間軸 script（零改動、一小時）可以答「三段串行之外嗰 2.3 秒係 AVPlayer 內部定係我哋 route」——如果係 AVPlayer 內部，N1/N5/N6 全部收益要打折，排序要重整。
3. **N1 前置 G-4**（sidx offset 跨 resolve 穩唔穩）：唔驗就持久化會令 1.7% 隨機 no-sidx 變成「永久錯 offset 播唔到」。30 首各 resolve 兩次比對，backend script 半小時。
4. **E-4（HLS 擴機）**：Opus 同 ROOTCAUSE D-2 唔同意，我判：**兩邊都對，分階段**。D-2「唔郁」係因為當時只有一層保護；而家預檢已上、Joy 已係第二部機。建議 09-13 前先睇 Eric+Joy 兩部機 `hlsFallback via=preflight` 有冇 fire 過、`nativeSkipAttributed` 有冇歸零，有數先擴 3–5 部（唔全開）。

**建議俾 Eric 嘅路線（三步，前兩步唔使拍板）**：
- 第 0 步（1 日內）：G-1 時間軸 script + G-4 sidx 穩定性 + G-9 playlistCache hit/miss counter + G-7 tunnel 吞吐 cron。純量度，零行為改動。
- 第 1 步（第 0 步答到「窄位喺 route」先做）：N1 + N3 + N5（head-only 熱池）—— 純 backend restart，iOS p50 目標 5.0→~3.7s、Android p50 2.7→~2.5s。
- 第 2 步：N2（隨心聽首歌偏向 warm 池，兩平台 p90 −3～4s）+ N6（playlist edge cache）。N2 改咗「隨心」嘅隨機性（只第一首），要 Eric 知。
- 拍板項：E-1 Android 本地 cache（版權延伸，建議開細 cap）、E-3 VPN 出口先量唔郁、E-4 HLS 分階段擴、E-2/E-5 唔做。**全部唔使 native build。**
