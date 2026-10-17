# HLS-EXEC-STARTUP-GRACE-20260902 — HLS 起播期唔准降級去 progressive(緊急 OTA 修)

**派工**:Sonnet 5 執行 → Opus 5 獨立驗收 → Fable 5.1 commit + OTA + 判斷
**狀態**:Eric 已批(01:3x UTC);Sonnet5 執行完、Opus5 驗收核心 GO + 三修已由 Fable 5.1 落手,覆核中
**上游**:2026-09-02 00:51–00:56Z Eric 真機(deviceId `e1b6dc8a…`)HLS 首試;`HLS-EXEC-D123-GATE-20260901.md`;commit 84f2e03
**範圍**:純 JS(`frontend/hymn-app/App.js`),OTA 出得街,零 native、零 backend。**唔准 commit、唔准 OTA/push、唔准 restart backend、唔准掂 live `app-version.json`(flag 而家係 true + 單機名單,一個字都唔准郁)。**

---

## §0 立案證據(Fable 5.1 由 client-log + backend log 對數,唔係推論)

Eric 部機今晚兩個階段,同一個網絡、同一個 build:

| 階段 | 時間(UTC) | stream 起播 | 結果 |
|---|---|---|---|
| progressive(flag 未開) | 00:14–00:31 | 3 次,nextTrackMs 11.7s / 14.9s / 15.3s | `nativeSkipAttributed` ×10、`PlaybackError` ×2、itemNil=1 storm 全程 |
| HLS(flag 開咗) | 00:51–00:56 | 4 次(1298 / 7728 / 6712 / 5688) | 3 首淨係 nudge 一次就播到;**1 首(1298)俾 JS 降級鏈斬死** |

**1298 條鏈(全部原文喺 `/tmp/hymn_backend.log` 18301–18345 行 + client-log jsonl)**:

```
00:51:46.718 [hls] id=1298 result=ok refs=37                       ← playlist 出咗
00:51:47.374 nextTrackMs ms=4064 origin=start source=stream        ← native 報 Playing(早報)
00:51:47.905 [stream] range=0-667 (init)  ttfb=559ms
00:51:49.143 [stream] range=1144-163232 (seg1) ttfb=185ms
00:51:49.610 midStallNudge ticks=3 pos=0                           ← ⚠️ seg1 啱啱到手就 nudge(buffered=0 → 3 tick 即 fire)
00:51:50.603 [stream] range=1144-163232 (seg1 **再攞一次**)         ← nudge 嘅 seekTo(0.3) 令 AVPlayer 重攞 seg1
00:51:51.5 → 58.3  seg2…seg8 每秒一段流入(8 段 = 80 秒音頻已落)
00:51:58.655 handleMidStreamStall_giveup pos=0.3                   ← ⚠️ buffered 一路長大,但 CAP=4 用完就當 stall
00:51:58.661 hlsFallback from=stuckTrackEnd → /api/stream/1298     ← 降級去 progressive
00:52:05–15  nativeStall hid=1298 itemNil=1 ×9 → phase=skipped     ← progressive 舊病原樣發作
00:52:15.424 nativeSkipAttributed hid=6168                          ← 跳咗歌
```

**HLS 階段 00:51:46–00:51:58 之間 `nativeStall hid=1298` = 0 條**(native watchdog 喺 HLS 下靜默,同確認窗 10/10 一致);佢係 JS 降級去 progressive **之後**先醒。

其餘三首(7728 / 6712 / 5688):nudge 分別喺起播後 +2.6s / +7.4s / +6.6s fire,之後 position 自己行,冇 giveup。即係 Eric 網絡下 HLS 起播 position 由 0 開始郁要 **5–9 秒**(AVPlayer 見網絡慢會多 buffer 幾段先開聲),而 JS watchdog 而家嘅門檻(nudge 3 tick、CAP 4、giveup 再 3 tick)係為 progressive 同 native watchdog 賽跑而校,喺 HLS 起播期係**誤判**。

**結論**:病唔喺 HLS,病喺「起播期 JS watchdog 太早 giveup + giveup 之後降級去 progressive」。progressive 就係本身沉緊嗰隻船。

## §1 修法(設計已定,唔好自行改設計;實作細節你話事)

新概念 **HLS 起播期(hlsStartup)**:`Platform.OS === 'ios'` && 而家 active track 嘅 URL 係 `.m3u8` && `pos < 1.0`。

四條規則,全部只喺 hlsStartup 為 true 先生效;hlsStartup 為 false 嘅所有路徑(progressive iOS、HLS 中途 pos≥1、Android)**一個 tick 嘅行為都唔准變**。

| # | 規則 | 位置 |
|---|---|---|
| R1 | `bufferedAdvancing` 喺 hlsStartup **唔受 `BUFFERED_ADVANCING_CAP_TICKS` 限制**:只要 `bufferedGrowingThisTick` 就唔算 stalled | poll loop `bufferedAdvancing` 運算式(App.js ~2136) |
| R2 | nudge 門檻由 3 tick 改 `HLS_STARTUP_STALL_TICKS = 8`(即 position 凍住**兼** buffered 唔長大連續 8 秒先 nudge);nudge 之後 giveup 門檻同樣 8 tick | poll loop `midStallThreshold`(~2190) |
| R3 | 硬上限 `HLS_STARTUP_MAX_TICKS = 30`:新 ref 數「hlsStartup 之下 position 凍住嘅連續 tick」(唔理 buffered),夠 30 就直接 giveup(先出 `logDiag('hlsStartupCeiling', {hymnId, position, bufferedNow}, {always:true})` 再 `handleStuckTrackEnd()`);position 一郁或者換歌就歸零(track-change effect ~1970 加 reset) | poll loop + track-change effect |
| R4 | `handleStuckTrackEnd` 嘅 hlsFallback 分支(~1790)加條件:`(diagProgress?.position ?? 0) >= 1` 先准降級。起播期 giveup **唔降級**,出 `logDiag('hlsFallbackSuppressed', {hymnId, position}, {always:true})` 之後跌落原有 repeat/skip 流程 | handleStuckTrackEnd |

**唔改嘅嘢(明文)**:nudge 動作本身(`seekTo(pos+0.3)`+`play()`)唔改;`PlaybackError` 路徑嗰個 hlsFallback(~1262)唔改;`BUFFERED_ADVANCING_CAP_TICKS=4` 數值唔改;bufferingStuck watchdog 唔改;`nearEnd` 路徑唔改;Android 唔改。

**攞 active URL 嘅做法**:唔准每 tick 都 `await TrackPlayer.getActiveTrack()`。只准喺 `Platform.OS==='ios' && posFrozenThisTick && pos < 1` 先 await 一次;或者用一個 ref 喺 `PlaybackActiveTrackChanged`(event.track?.url)同兩處 hlsFallback 熱換(freshTrack.url)度更新。揀邊種寫落 raw,並證明兩處熱換之後 ref 值正確(如用 ref 法)。

## §2 證據規則(承 D123 單 §0,逐條跟)

1. **唔准寫 PASS / FAIL / 達標。** 交 §3 證據表 + raw 原文,判詞欄留空。任何欄空 = 該 case「未做」。
2. **儀器正控**:每個 harness assert 都要先對住**修改前**嘅 code(`git show HEAD:frontend/hymn-app/App.js` slice)跑一次,貼出佢喺舊 code 上「捉得到病」嘅輸出(S1–S3 喺舊 code 應該出 nudge/giveup/hlsFallback),先准用嚟證明新 code「冇」。正控輸出貼喺每個 case 前面。
3. harness 方法照 `exec-b123-fix-raw.md`:**逐字 sed slice 真 code 落 harness**(貼 `sed -n 'A,Bp'` 行號 + `cmp` byte-identical 證明),唔准手抄邏輯。Poll loop 一段、`handleMidStreamStall`、`handleStuckTrackEnd` 三段都要 slice。
4. 統計 client-log 一律 `json.loads` 逐行 parse,唔准 grep 字串 pattern。
5. 做唔到照直寫「未做+原因」。

## §3 Harness 情境(每個一行,欄欄必填)

模擬 poll loop 1 tick = 1 秒,`trackState=Playing`,iOS。每個 case 交:tick-by-tick 輸入序列(pos / buffered)、觸發嘅 beacon 名 + tick 號、`handleStuckTrackEnd` 有冇被 call、`hlsFallback` 有冇 fire、`skipToNext` 有冇被 call。

| case | 輸入 | 舊 code 正控輸出 | 新 code 輸出 | 判詞(留空) |
|---|---|---|---|---|
| S1 重演 1298 | URL `.m3u8`;t0–t2 pos=0 buffered=0;t3–t12 pos=0 buffered 每 tick +10;t13 起 pos 每 tick +1 | (預期:t3 nudge、t≈10 giveup、hlsFallback) | | |
| S2 真死 | URL `.m3u8`;pos=0、buffered=0 永遠 | | | |
| S3 buffered 長大但永遠唔播 | URL `.m3u8`;pos=0、buffered 每 tick +10 直到 t60 | | | |
| S4 HLS 中途 stall(回歸保護) | URL `.m3u8`;pos=120 凍住、buffered 凍住 | (預期:t3 nudge、+3 giveup、hlsFallback fire) | (必須同舊 code 逐 tick 一樣) | |
| S5 progressive iOS 起播(回歸保護) | URL `/api/stream/1298`;pos=0 凍住、buffered 每 tick +10 | (預期:CAP=4 → t≈7 nudge) | (必須同舊 code 逐 tick 一樣) | |
| S6 Android | `Platform.OS='android'`,同 S1 輸入 | | (必須同舊 code 逐 tick 一樣) | |
| S7 換歌 reset | S3 行到 t20 之後 track-change effect fire,再入新 `.m3u8` 歌 | | (新 ref 歸零證明) | |

S1 想見:零 nudge(t3–t12 buffered 長大)、零 giveup、零 hlsFallback。S2 想見:nudge@t8、giveup@t16、`hlsFallbackSuppressed`、`skipToNext`。S3 想見:`hlsStartupCeiling`@t30、無 hlsFallback。**呢啲係「想見」,唔係判詞——你照實填實際輸出。**

## §4 模擬器

Eric 嘅網絡條件(segment ttfb 185–590ms)模擬器重現唔到(本機 ttfb 1ms),**唔要求做模擬器 run**。如果你做,照 D123 單 §1 gate(booted=0/xcodebuild=0/load<3.0/單一模擬器/Release/TEMP 標記/收工 revert + 四項殘留全 0),但唔做唔算未完成。

## §5 紅線

1. 唔准 commit / OTA / push / EAS build;唔准 restart backend;唔准掂 live `backend/public/app-version.json`(`hlsEnabled` 同 `hlsDeviceIds` 一個字唔准郁)。
2. 唔准掂 Android 播放路徑、`audioPrefetch.js`、`/api/stream/:id` route、四個 WARM 常數、native watchdog、`BUFFERED_ADVANCING_CAP_TICKS` 數值。
3. 唔准起第二個 `node server.js`;唔准掂 Cloudflare / DNS / cert / token;唔准用 AskUserQuestion。
4. `git diff --stat` 收工只准見 `frontend/hymn-app/App.js` 一個檔(harness 留 scratchpad)。
5. raw 寫 `scratchpad/exec-startup-grace-raw.md`。

## §6 交付

raw:§1 四條規則各自嘅 diff hunk + 行號;§2.3 slice 行號 + cmp 證明;§3 七個 case 嘅正控輸出 + 新 code 輸出(判詞留空);`git diff --stat`;未做清單(冇就明寫「無」)。**唔准有任何 PASS/FAIL 字眼。**

## §7 出街後(Fable 5.1 做,唔係你做)

commit → OTA → 叫 Eric **完全閂 app 再開**(OTA 開 app 先食到)→ 用 `json.loads` 掃 Eric deviceId 嘅 `midStallNudge` / `hlsFallbackSuppressed` / `hlsStartupCeiling` / `hlsFallback` / `nativeSkipAttributed` 五個 counter,對返今晚 HLS 起播嘅基線。**Opus5 驗收更正**:基線唔係 4 首,係 **5 首**(第 5 次 hymnId=6363 @01:27:45Z,一樣 nudge→giveup(pos=0.3)→hlsFallback→PlaybackError):nudge 5 / giveup 2 / hlsFallback 2。§0 個 `url=` 係來源 URL(`.m3u8`)唔係降級目的地。

**出街版本(Fable 5.1 收貨後加嘅三個修,全部由 Opus5 驗收提出)**:① `hlsStartupCeiling` 嘅 bufferedNow 塞入 `detail`(backend 白名單冇 bufferedNow key);② R4 position 讀唔到(非有限數)唔當 0,行返舊 hotswap 路;③ R3 counter 拆走 `claimsActive` gate(state 飄一次 Buffering 就歸零會令 ceiling 廢武功)。
