# HLS 起播預檢執行報告 2026-09-07

執行單:`HLS-PREFLIGHT-EXEC-20260907.md`(§6 修訂 A:串行改並行 + 熱換,hls route 加 in-flight 共用)。
基準 HEAD:`a10fcef`(已含修訂 A 文檔本身)。上一個 Sonnet session 被叫停,worktree 已有部分未 commit 改動
(`frontend/hymn-app/src/hlsPreflight.js`、`App.js`、`backend/routes/hls.js`、`backend/routes/stream.js`、
`backend/lib/opsMetrics.js`)——本報告開頭先交代邊啲保留、邊啲重寫。

**執行者唔判 PASS/FAIL,以下純列證據。**

## 0. 承接上手 session 嘅 `git diff` 審查結論

| 檔案 | 上手做咗乜 | 呢次點處理 |
|---|---|---|
| `frontend/hymn-app/src/hlsPreflight.js` | §1.1 全做完:`preflightHls()` 純函式+fetch,永不 throw,beacon 齊 | **原封不動保留**,H-A 驗證通過 |
| `frontend/hymn-app/App.js` §1.2 | 舊版:`await preflightHls()` **串行**擺喺 `TrackPlayer.add()` 之前 | **重寫**成 §6 並行+熱換(見 §1) |
| `frontend/hymn-app/App.js` §1.3 | 已經係 fire-and-forget,滾動預熱換下一首 | **一個字冇改**(§6 明文:「§1.3 本身已係 fire-and-forget，不變」) |
| `backend/routes/hls.js` §2.1 快失敗 | 固定 800ms backoff、3s head-fetch timeout、`ms=` log | **原封不動保留**,H-C 驗證通過 |
| `backend/routes/hls.js` §6 點2 in-flight 共用 | **未做**(上手停喺 §2.1) | **新加** `resolveStructureShared()`(見 §2) |
| `backend/routes/stream.js` §2.2 | 純記帳(`recordUpstream403('stream', ...)`),零重試邏輯改動 | **原封不動保留** |
| `backend/lib/opsMetrics.js` §2.2 | `upstream403` gauge 全套(`blankBucket`/`normalizeBucket` 已經係新 top-level key,舊碟淺層 merge 自動補齊,唔撞 B4 嗰種巢狀缺欄舊病) | **原封不動保留** |

## 1. App 側 §1.2 重寫(§6 修訂 A)

`frontend/hymn-app/App.js`(`playQueueImpl`,`TrackPlayer.add`/`skip`/`play` 之後):

1. `TrackPlayer.add(trackList)` → `skip` → `play()` **完全唔等預檢**,一個字冇改动次序,起播零延遲。
2. 完咗之後(fire-and-forget,`(async () => {...})()`,唔 `await`)先 fire `preflightHls(startTrack.url)`。
3. `!ok` 先判斷要唔要換:
   - `hlsDowngradedTrackRef.current` 已經係呢首歌 → 跳過(已經俾第二條路降級咗)。
   - `transitionT0Ref.current !== myT0`(identity capture)→ 跳過(呢次轉歌已完結/俾蓋過,即係已出聲或已經被新一次轉歌取代)。
   - `TrackPlayer.getActiveTrack()` 嘅 id/url 唔 match → 跳過(race:用戶已經跳咗第二首,或已經俾人搶先換咗)。
   - `getProgress().position >= 0.5` → 跳過(第二重「仲未出聲」信號)。
   - 全部過關先 `TrackPlayer.load(freshTrack)`(同 App.js ~1937 `handleStuckTrackEnd` 個熱換分支同一手法),失敗 fallback `remove+add+skip`,再 `play()`。
4. `ok` → 乜都唔做。

紅線覆核(§0):`toTrack()` 簽名冇改、`playQueue()` 對外語義冇改、Android 分支(`Platform.OS === 'android'`)完全冇掂、`hlsDeviceIds`/`app-version.json` 冇掂、`handleStuckTrackEnd`/watchdog/nudge/rescue 邏輯**一行都冇改**(只喺注釋提到佢哋)。

## 2. Backend 側 §6 點2:hls route in-flight 共用(本次新加)

`backend/routes/hls.js`:
- 原 `resolveStructure()` 改名 `resolveStructureInner()`,邏輯**一個字冇改**。
- 新增 `resolveStructureShared(youtubeId, url)`:一個 `structureInFlight` Map(key = `${youtubeId}::${url}`),同一個 key 嘅並發 call 全部指去同一個 in-flight promise,`finally` 清 Map。
- Route handler 由 call `resolveStructure` 改 call `resolveStructureShared`;舊 export 名 `resolveStructure` 保留(now = `resolveStructureShared` 嘅 alias),避免破壞任何舊 caller。
- 已有嘅 `playlistCache`(TTL 4 小時)喺 `resolveStructureInner` 入面完全冇郁,兩層(in-flight 共用「處理緊嗰刻」、playlistCache 共用「處理完之後」)互補。

## 3. 驗證證據

### H-A —— `frontend/hymn-app/tools/hls-preflight-harness/harness-a.js`
「babel 真 module」手法:用 `babel-preset-expo` 將 `src/hlsPreflight.js` 原封不動轉做 CJS 執行(唔抄邏輯),`./clientLog.js` 呢個 import 邊界 stub 做記錄器。

```
node frontend/hymn-app/tools/hls-preflight-harness/harness-a.js
```

結果:**9 pass / 0 fail**——2xx+`#EXTM3U`→ok;403→`status:403`;6s 唔答/5s timeoutMs→`timeout`(且真係喺 ~5s 內有結果,唔係等到 6s);2xx 非 m3u8→`not-m3u8`;fetch throw(Error/非Error 物件兩種)→`network`/唔 throw;每次都送咗 beacon。

### H-B —— `frontend/hymn-app/tools/hls-preflight-harness/harness-b.js`
用字元級 brace-matching 由 `App.js` 原文**直接抽取** §1.2/§6 嗰個 if-block(由 `const startTrack = trackList[startIndex];` 到佢 if 嘅 closing brace),`new Function()` 注入 mock `TrackPlayer`/refs/真身 `preflightHls` 執行——如果日後 App.js 呢段邏輯改咗,harness 會自動攞返新版文字一齊測(唔會靜靜哋同源碼分岔;抽取後仲有 5 條「必須包含關鍵字」自證,搵唔到就直接 throw)。

```
node frontend/hymn-app/tools/hls-preflight-harness/harness-b.js
```

結果:**14 pass / 0 fail**,涵蓋:
- §6 點1 次序證據:`add()`/`play()` 已經即刻做咗,先至 fire 預檢。
- §6 點4:preflight ok → 零 `load`/`remove` call。
- 403 + 仲未出聲(position=0)→ `TrackPlayer.load()` 熱換去 progressive URL,`hlsDowngradedTrackRef` 正確 set,`hlsFallback via=preflight` beacon 送咗。
- 403 + 已出聲(position=1.2)→ 唔換(留返 PlaybackError/handleStuckTrackEnd)。
- 403 + transitionT0 已被蓋過(呢次轉歌已完結)→ 唔換。
- 403 + 已經俾第二條路降級過 → 唔重複換。
- 403 + active track 唔 match(race:用戶已跳去第二首)→ 唔換(避免換錯歌)。
- `TrackPlayer.load()` 拋錯 → fallback `remove→add→skip` 次序正確。
- **交錯 5 run(狀態序列 [200,403,200,403,200],mock fetch 故意等 2000ms)**:同步呼叫耗時實測 `0.076, 0.089, 0.070, 0.057, 0.041`ms——同 mock 網絡延遲(2000ms)完全無關,結構性證明起播路徑 +0ms(見下面 H-D 段解釋點解冇真機數據)。

### H-C —— `ops/perf/harness/hlspreflight/hc-backend-harness.mjs` + `resolve-audio-stub-loader.mjs`
起真 express app 掛真身 `backend/routes/hls.js`(`app.use('/api/stream', hlsRoutes(getDb))`,同 `server.js` 一樣掛法),`getDb` mock(唔碰 `hymns.db`)。「googlevideo」由本機另一個 http server(隨機 port)扮演。用 Node ESM loader hook(`module.register`)淨係喺 `hls.js` 呢一個 importer 入面將 `../lib/resolveAudio.js` 換做可擺佈嘅 stub,`hlsPlaylist.js`/`opsMetrics.js` 全部真身。

```
node ops/perf/harness/hlspreflight/hc-backend-harness.mjs
```

結果:**17 pass / 0 fail**:
- **(a) 403×2 → 404**:mock googlevideo 真係打中 2 次(頭一次 + 一次重試),總耗時 **817ms**(≤4s 達標),`opsMetrics.upstream403.hls`/`hlsTotal` 各加 2。
- **(b) 檔頭 fetch 掛住 → timeout**:實測 **3003-3004ms**(3s AbortController 準時,唔重試 timeout)。
- **(c) 200 正常路徑**:HTTP 200、`Content-Type: application/vnd.apple.mpegurl`,playlist 嘅 `EXT-X-MAP BYTERANGE`/segment 數/segment byte 總和,同獨立 `parsePlaylistStructure()` 直接 parse 同一份 fixture bytes 嘅結果**逐項一致**。
- **§6 加驗證(並發 de-dup)**:兩個幾乎同一刻嘅並發 `.m3u8` 請求(用刻意加 300ms 延遲嘅 mock 端點確保真係有重疊),mock googlevideo **淨係俾打中 1 次**(唔係 2 次)——`resolveStructureShared` 嘅 in-flight 共用生效;兩份 playlist body 完全一樣。

### H-D(iOS,由執行者做嗰一次)—— `frontend/hymn-app/tools/hls-preflight-harness/harness-d-ios-realhttp.js`
**冇做完整 iOS Simulator/真機行為驗證**——原因:呢個 repo 冇 jest/react-test-renderer,亦冇可用嘅 Metro 連線 dev-client(memory 記錄 iOS 模擬器行 dev/debug 會 Hermes segfault,要用 Release build,即要重新 `expo export` + Hermes bytecode 編譯 + patch 落一個已裝嘅 `.app`,呢個 pipeline 喺呢個 session 嘅合理範圍之外,而且 App.js 呢次改動要真係跑落 Simulator 先睇到「唔跳歌」嘅 UI/native 行為,呢部分明文寫低係「由 Opus 做」)。

做咗嘅係**核心可驗證部分**:真係起一個獨立 http server(隨機 port,唔掂 prod backend/hymns.db 一個字),對一個測試 id 嘅 `.m3u8` 端點回 403、progressive 端點回 200,用真身 `preflightHls()`(H-A 同一手法)打真實 HTTP(loopback)去嗰個獨立 server:

```
node frontend/hymn-app/tools/hls-preflight-harness/harness-d-ios-realhttp.js
```

結果:**5 pass / 0 fail**——`preflightHls` 正確判 403(`ok=false, reason=status:403`),真實 round-trip **34ms**(遠低於 5s timeoutMs),native 16s 看門狗死線剩 **15,966ms**(遠超 §6 點3 要求嘅 ≥11,000ms),獨立 server 嘅 `.m3u8` 端點淨係俾打中 1 次(`preflightHls` 本身唔重試),熱換去嘅 progressive 端點正常。

⚠️ 呢個唔等於「App 喺 Simulator 度真係播緊歌、撞 403、冇跳歌」——嗰個完整兩平台情境確認留返俾 Opus。

### H-E —— 紅線 `git diff` 逐行核

```
git diff -- frontend/hymn-app/App.js | grep -iE "watchdog|nudge|rescue|hlsStartupKick|handleMidStreamStall|handleBufferingStuck|handleStuckTrackEnd"
```
全部命中都喺**注釋**入面(提到呢啲名做背景解釋),零一行程式碼改動。另外核實:
- `toTrack()`/`playQueueImpl()` 簽名:`git diff` 冇任何 `function` 簽名行改動。
- `Platform.OS === 'android'`:`git diff` 零命中。
- `hlsDeviceIds` / `app-version.json`:唔喺呢次改動嘅四個檔案入面。
- `backend/routes/stream.js`:diff 淨係加 `recordUpstream403()` 記帳 call + import,backoff/bust/重試/timing **一行邏輯都冇改**。

### H-F —— 09-06 before 數(已知基準,交叉核對 `/tmp/hymn_backend.log`)
```
grep "2026-09-06" /tmp/hymn_backend.log | grep -c "^\[hls\]"        → 24
grep "2026-09-06" /tmp/hymn_backend.log | grep "\[hls\]" | grep -c "404-headfetch-failed(status=403)" → 4
```
**同執行單所述「24 次 4 次 403」完全對得上。** 4 次 403 集中喺 23:04:43–23:05:22Z(id=4335 兩次、id=4621 兩次),同 09-07 07:04/07:05 兩次跳歌屬同一種節流窗現象。

`nativeSkipAttributed` 09-06 全日(所有 deviceId 合計)實測 **20 次**,同執行單所述「3 次」對唔上——執行單嗰個數字可能係篩選咗 Eric 特定 deviceId,但我搵唔到篩選依據(memory 冇記錄一個穩定嘅「Eric deviceId」),**呢個數字我核唔到,如實報,唔砌一個假嘅出嚟**。403→404 耗時「14–16s」呢個數字舊 code 冇印 `ms=`,冇得由呢個 log 直接量,相信係 Fable 由 client 側 beacon 時間戳反推(root cause 診斷階段已有,唔喺呢次覆核範圍)。

## 4. 交付

三個 commit(pathspec):
1. App:`frontend/hymn-app/src/hlsPreflight.js` + `frontend/hymn-app/App.js`
2. backend:`backend/routes/hls.js` + `backend/routes/stream.js` + `backend/lib/opsMetrics.js`
3. harness + 報告:`frontend/hymn-app/tools/hls-preflight-harness/` + `ops/perf/harness/hlspreflight/` + `HLS-PREFLIGHT-REPORT-20260907.md`

**唔部署、唔 OTA、唔 restart backend、唔改 `app-version.json`。**

## 5. 紅線自我覆核一句

`git diff` 逐行核過:watchdog/stall/nudge/rescue/`hlsStartupKick`/threshold 零改動;Android 分支零改動;`stream.js` 403 重試邏輯零改動;`toTrack()`/`playQueue()` 簽名冇變;`hlsDeviceIds`/`app-version.json` 冇掂;冇部署/restart/OTA/eas/launchctl;冇用 `git add -A`/`clean`/`stash`;iOS Simulator 全程冇開(H-D 淨係起獨立 http server,冇碰模擬器/AVD)。
