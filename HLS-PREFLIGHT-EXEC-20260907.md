# HLS 起播預檢執行單 2026-09-07

Eric「go」（09-07）。根源：Eric 09-07 07:04/07:05 兩次跳歌 = googlevideo 檔頭 403（一分鐘窗）→ backend `/api/stream/:id.m3u8` 重試 14 秒先回 404 → App HLS→progressive 後備（`hlsFallback`）等 PlaybackError 嚟唔切 → native 16 秒看門狗跳歌（D2 家族，`hlsFallback` 歷史零次 fire）。
目標：403 事件變成「起播慢 4–5 秒」而唔係「跳歌」。純 JS（OTA）+ backend（restart），唔使 native build。
流程：Fable 規劃 → Sonnet 執行 → **Opus 先做根源覆核（起播路徑邊）再驗收**（兩平台各試一次 403 情境）→ 報 Eric → OTA。基準 HEAD `790da25`。

## 0. 紅線
- 🔴 唔改看門狗 / stall / nudge / rescue / `hlsStartupKick` / `handleMidStreamStall` / `handleBufferingStuck` 任何邏輯或 threshold。
- 🔴 唔改 `toTrack()` 簽名（15 個 caller，同步函式）；唔改 `playQueue()` 對外語義；Android 一個字唔准改（HLS 純 iOS，`Platform.OS === 'ios'` 閘照舊）。
- 🔴 本地檔命中永遠贏（`localUri`），預檢只針對 `.m3u8` URL。
- 🔴 唔掂 `hlsDeviceIds` gate / app-version；唔改 stream.js 403 重試邏輯（佢係 progressive 後備嘅依靠）。
- 唔部署；模擬器一次一部；hold 檔；收工清。

## 1. App 側（`frontend/hymn-app`）

### 1.1 `src/hlsPreflight.js`（新，純函式 + fetch）
```
preflightHls(url, { timeoutMs = 5000 }) → Promise<{ ok, status, ms, reason }>
```
- `fetch(url, { method: 'GET', signal })`，AbortController 5s；`ok` = 2xx 且 body 頭幾百 byte 含 `#EXTM3U`（唔使讀晒）；否則 `reason` = `status:<n>` / `timeout` / `network` / `not-m3u8`。永不 throw。
- 每次結果送 beacon `hlsPreflight`（用 W1 `sendClientLog`）：`detail="ok=<0|1> status=<n|-> ms=<n> reason=<...> ctx=<start|next>"`，帶 hymnId。

### 1.2 起播路徑：`playQueue()` 內、`TrackPlayer.add` 之前
- 只對 **`startIndex` 嗰一首**：如果佢嘅 track.url 係 `.m3u8`（iOS + HLS_ENABLED + 非 local）→ `await preflightHls(url)`；`!ok` → 用 `toTrack(song, { forceProgressive: true })` 換走嗰一個 track（其他 track 唔郁），並 `hlsDowngradedTrackRef.current = song.id`（沿用「同一首歌只降級一次」機關，令之後 PlaybackError 路唔會再降一次）；beacon `hlsFallback` 加 `via=preflight`（**唔改**現有 hlsFallback 分支，只加一個新 call site 帶 `via`）。
- 預檢成功嗰陣 backend playlistCache 已暖，AVPlayer 第二次 fetch 命中 cache，額外延遲 ≈ 一次 RTT。要量：`nextTrackMs` before/after（§3）。

### 1.3 自動接播路徑：滾動預熱 hook（App.js ~1140 `warmIds(nextIds)` 附近）
- 換歌嗰刻，對 `queueRef.current[idx+1]`（下一首）做預檢（**唔阻塞**，fire-and-forget）：如果佢喺 native queue 嘅 URL 係 `.m3u8` 且預檢 `!ok` → 用現有 URL 熱換機制（`TrackPlayer.add(freshTrack, idx+1)` swap，**照抄 W1/Play Next 已核嘅 id 對位 guard**）換成 progressive；記 `hlsDowngradedTrackRef`。
- 去重：同一 id 同一 session 只預檢一次（Map cap 200）。
- 如果換歌後 idx+1 已經開始播（race）→ 唔 swap（guard：只 swap 未成為 current 嘅 index）。

### 1.4 唔做
- 唔預檢 idx+2 之後；唔改 prefetch（本地檔）邏輯；唔加重試。

## 2. Backend 側
### 2.1 `routes/hls.js` 快失敗
- `fetchHeadBytes`：加 AbortController **3 秒** timeout（timeout 當 `badStatus: 'timeout'`，唔重試）。
- 403/410 重試：保留一次，但 backoff 固定 **800ms**（唔用升級 backoff——HLS 路徑由 client 5 秒預檢兜底，唔應該喺 backend 慢慢等），re-resolve 沿用現有 `resolveAudioUrl`（唔改 resolve timeout）。
- 目標：403 路徑 backend 回 404 嘅時間由 ~14s → **≤ 4s（暖 resolve）/ ≤ 8s（冷 resolve）**；量法見 §3。
- log 行加 `ms=<總耗時>`。

### 2.2 403 率 gauge（長期追出口 IP 問題）
- `lib/opsMetrics.js` 加 `upstream403: { hls: n, stream: n, hlsTotal: n, streamTotal: n }`（每 hourly bucket + total，`blankBucket`/`normalizeBucket` 補齊，同 W1 做法）；`routes/hls.js` head fetch 結果 + `routes/stream.js` 現有 403 重試位各 call `recordUpstream403(kind, is403)`。
- `ops/stream/stream-status.sh` 輸出加一行 `hls403Rate`/`stream403Rate`（24h），**唔改 exit code 邏輯**。

## 3. 驗證（執行者出證據，唔判）
| 項 | 證據 |
|---|---|
| H-A harness（babel 真 module） | `preflightHls`：2xx+`#EXTM3U` → ok；403 → `status:403`；5s 唔答 → `timeout`（用 mock fetch 6s）；2xx 但唔係 m3u8 → `not-m3u8`；fetch throw → `network`；全部唔 throw |
| H-B harness | playQueue 前置：抽取/模擬 startIndex track 換 URL 邏輯——預檢 fail → 只有 startIndex 嗰個 track 變 `/api/stream/:id`（其他 track 仍 `.m3u8`）+ `hlsDowngradedTrackRef` set；預檢 ok → 零改動 |
| H-C backend harness | 起 hls router 隨機 port，mock googlevideo：(a) 403×2 → 回 404 總耗時 ≤ 4s（暖 resolve mock）；(b) 檔頭 fetch 掛住 → 3s timeout 回 404；(c) 200 正常路徑不變（同 HEAD 前後 playlist bytes 一致）；opsMetrics `upstream403` 計數對得上 |
| H-D 兩平台 403 情境（**由 Opus 做，執行者只做 iOS 一次**） | 用本機 throttle/mock proxy 或臨時令 backend 對某 id 回 403（**唔准改 prod backend**：用隔離 backend 副本喺另一 port + sim 指去佢，或 mock fetch）：起播 HLS 歌撞 403 → App 5s 內換 progressive → **唔跳歌**、`hlsFallback via=preflight` beacon、`nextTrackMs` 記到；負控：正常 HLS 歌起播 `nextTrackMs` 同 09-06 中位 5.0s 比較（唔准差 >1s）；自動接播下一首撞 403 → 熱換 progressive、唔跳 |
| H-E 紅線 | `git diff` 逐行：watchdog/stall/nudge/rescue/hlsStartupKick/threshold 零改動；Android 分支零改動；stream.js 403 重試零改動 |
| H-F before 數 | 09-06 Eric 部機 HLS 起播 n=11 中位 4,975ms；09-06 `[hls]` 24 次 4 次 403、403→404 耗時 14–16s（log 時間差）；nativeSkipAttributed 09-06 3 次 |

## 4. 交付
Commit（pathspec）：App 一個（hlsPreflight.js + App.js）、backend 一個、harness+報告 `HLS-PREFLIGHT-REPORT-20260907.md` 一個。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。唔部署。

## 5. Opus 驗收要點（預告）
根源覆核：預檢係咪真係喺看門狗起計之前完成（`playQueue` 內 add 之前 vs 看門狗由 add/play 起計）；自動接播 swap 嘅 race（idx+1 已成為 current）；預檢對正常起播嘅額外延遲；backend 快失敗會唔會令「本來重試一次就成功」嘅 case 變失敗（對照 09-06 `retried=true` 但 `result=ok` 有幾多）；兩平台各一次 403 情境 + 一次正常情境。

---

## 6. 修訂 A（09-07，Eric 問「起播會唔會慢咗」）—— §1.2 由「串行」改「並行 + 熱換」

**原 §1.2 問題**：預檢 `await` 喺 `TrackPlayer.add` 之前 = 串行。正常（冇 403）情況每次起播多一趟 JS→backend 來回；tunnel RTT 地板 ~0.75s（memory `project-hymn-app-infra`/1C 量到），即 **暖 cache 起播由 ~5.0s 變 ~5.8–6.0s（+15–20%）**，唔可接受。

**改為並行**：
1. `playQueue()` 照舊即刻 `TrackPlayer.add` + play（起播零延遲，看門狗照舊由呢刻起計）。
2. **同一刻** fire `preflightHls(url)`（唔 await）。backend `resolveAudio` 已有 per-id in-flight coalescing（`resolveAudio.js:282/307`），JS 同 AVPlayer 兩個 m3u8 請求只會觸發一次 resolve；playlist 由 `playlistCache` 或 hls route 內同一次 build 出——**要加**：hls route 對同一 `id` 嘅 in-flight playlist build 做 promise 共用（pending Map），避免檔頭 range fetch 做兩次。
3. 預檢 `!ok`（403/404/timeout ≤5s）→ 用現有 URL 熱換機制（`TrackPlayer.add(toTrack(song,{forceProgressive:true}), idx)` swap，id 對位 guard）換走**仍係 current 而且仲未出聲**（`nextTrackMs` 未記 / position=0）嗰首；已出聲就唔換。看門狗 16s 內剩 ≥11s 俾 progressive。
4. 預檢 ok → 乜都唔做（零成本：第二個 m3u8 請求命中 cache，server 0–1ms，只多 2–4KB tunnel 流量）。

**成本結論**：正常路徑 **+0ms 起播延遲**（並行）；冷 resolve 情況兩邊等同一次 resolve，冇重複 yt-dlp；唯一代價 = 每次起播多一個細請求（≤4KB）同 client-log 一條 `hlsPreflight` beacon。

**§1.3 自動接播路徑**本身已係 fire-and-forget，不變。

**§3 加驗證**：H-B 改為「add 已被 call 之後 preflight 先 resolve」（次序證據：mock 記 call 順序）；H-C 加「同一 id 兩個並發 m3u8 請求 → 檔頭 fetch 只做一次、resolve 只做一次」；H-D 正常起播 `nextTrackMs` 對照 **唔准有可量測差異**（交錯 5 run，中位差 ≤ 噪音）。
