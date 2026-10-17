# Phase 1E 真機 Telemetry 體檢 2026-09-06

角色:Sonnet 5 數據審計者。**只讀唔改**——本報告全部數字嚟自現存 log/JSON 檔案，冇改過任何 code、冇 restart、冇碰模擬器。唔判 PASS/FAIL，只擺數同標異常訊號。

## 0. 數據源同時間窗

| 源 | 路徑 | 覆蓋時間窗 | 備註 |
|---|---|---|---|
| client-log 持久化 | `backend/logs/client-log/client-log-2026-{08-23..09-05}.jsonl` | 2026-08-23 ~ 2026-09-05（14 個曆日，缺 08-28，retention=14 天） | 白名單見 `backend/routes/clientLog.js`；`platform`/`deviceId` 兩欄係 **2026-08-31 先開始出現**（首條帶 platform 嘅 row = `2026-08-31T07:34:08.171Z`），之前嘅 row 呢兩欄一律空 |
| backend stdout | `/tmp/hymn_backend.log` | **只得 2026-09-05 07:36 ~ 09-05 16:35**（`[access]`/`[stream]` 全部落喺呢個窗；`launchd` StandardOutPath 冇 rotation，但呢個檔案本身唔知點解冇更舊嘅逐行紀錄——見 §6 caveat） | 2404 行，`[resolve]`1225/`[stream]`364/`[w4rescue]`171/`[access]`127/`[client-log]`117/`[opsmetrics]`22/`[hls]`4 |
| ops-metrics | `backend/logs/metrics/ops-metrics.json` | `since=2026-08-23T01:33:28.481Z` 累計 + `hourly` 由 `2026-09-02T01` 到 `2026-09-06T00`（96 小時） | 呢個係**累計計數器**，唔受 backend restart 影響（讀碟載返） |
| stream-health | `backend/data/stream-health.log` | 2026-08-19 ~ 2026-09-06，154 行 | 定時 healthcheck（A/B 探針），唔係真用戶流量 |

**用嘅指令**（可重跑）：
```bash
# 讀晒全部 client-log jsonl
python3 -c "
import json, glob
rows=[]
for f in sorted(glob.glob('backend/logs/client-log/client-log-*.jsonl')):
    for line in open(f):
        line=line.strip()
        if line:
            try: rows.append(json.loads(line))
            except: pass
print(len(rows))
"
# backend access 行
grep '^\[access\]' /tmp/hymn_backend.log
# stream 行（真流量 vs 健康探針用 ua= 分）
grep '^\[stream\]' /tmp/hymn_backend.log | grep -oE 'ua=[^ ]+'
```

## 1. 樣本規模同 deviceId 剔除名單（全部表共用）

- client-log 總行數：**2649**（13 個檔案）。
- 帶 `platform` 欄嘅 row：**970 / 2649**（37%）——08-23~08-30 嗰 7 個檔案冇呢欄，`platform`/`deviceId` 由 08-31 先開始出現（`NATIVE-STALL-PROGRESS-PREDICATE-PLAN-20260831` §4-3 加，`deviceId` 由 `HLS-EXEC-D123-GATE-20260901` 加）。**呢個窗之前嘅 event 結構上分唔到邊部機、邊個平台**，全部表格入面標「unknown/none」。
- 帶 `deviceId` 嘅 iOS 相異值：**45 個**；Android：**1 個**（`d03463c30ea4935bc0d49ec57ba53b4c`）。

### 剔除方法（記錄點解剔）

CLAUDE.md 要求嘅指紋（「模擬器 deviceId 前綴」+「同一 deviceId 一日 >20 次冷開」）喺呢個窗**實際數字冚唔到**（最高單日 `perfMarks`——即一次冷開一條——係 11 次，冚唔到 20 次門檻），所以用一個對等但貼返實測分佈嘅版本：

1. **確認嘅真機**：`e1b6dc8a6948c3018036565007ad87d4`（iOS）—— 由 `backend/public/app-version.json` 嘅 `hlsDeviceIds: ["e1b6dc8a..."]` 獨立佐證（`HLS-EXEC-D123-GATE-20260901` §3：Eric 開一次 app 之後由佢真機 deviceId 填入呢個名單做單機 gate），**唯一有第二個獨立來源確認嘅 deviceId**。橫跨 4 個曆日（09-02/03/04/05），258 行，event 種類齊全（nextTrackMs/PlaybackError/hlsFallback/giveup 都有）——符合真人長期用機嘅樣。
2. **剔走**：其餘 44 個 iOS deviceId，全部得單一曆日出現、且 `perfMarks`（每次冷開一條）喺同一日出現 ≥2 次，或者完全冇 `perfMarks`/`perfHome`/`perfNav`/`perfRenders` 淨得播放 event 連環爆（例如 `df3e6a9370ecf52d55ee7e73867a53d0`：09-02 單日 84 行,全部 `nextTrackMs`/`hlsStartupKick`/`nativeSkipAttributed`,零生命週期 beacon——即冇經過正常開機/首頁流程,結構上似 scripted 播放迴圈測試,唔似真人揭 app）。呢 44 個當**模擬器/session 測試殘留**（同 memory `project-multi-sim-clientlog-contamination` 講嘅「每個 fresh 模擬器/重裝 = 新 AsyncStorage = 新 deviceId」完全吻合），計落「測試流量」唔計落「真用戶 baseline」。
3. **Android `d03463c30ea4935bc0d49ec57ba53b4c`**：橫跨 3 個曆日（09-02/04/05），33 行，但**冇任何獨立來源確認**呢個係 Eric 嘅真 Android 機定係 `DEEP-AUDIT-PLAN` 1B 講嘅持久化 AVD `hymntest`（AVD 一路唔重裝就會保留同一個 AsyncStorage/deviceId，橫跨多日一樣會做出「多日模式」，同真人用機睇落一樣）。**呢個 deviceId 嘅數字全部標「未證實」，唔可以當真用戶 baseline 用。**
4. `platform=''`（無欄）嘅 event：即刻歸類做「08-31 前歷史數據，唔標平台」，唔嘗試靠 UA 反推——本次審計冇做呢個推斷（超出「只讀」範圍，亦係已知會出錯嘅方法，見 memory）。

**呢個剔除法嘅唯一可信結論**：iOS 真用戶 baseline = **1 部機（Eric）**；Android 真用戶 baseline = **0 部確認**，得 1 部未證實嘅機。

## 2. 起播（Startup / stall）

### 2.1 `nextTrackMs` 分佈（全部樣本，含未剔除嘅測試機——按 platform×source×origin）

n=636（跨 08-23~09-05，`unknown` = 冇 platform 欄嘅歷史行）：

| platform | source | origin | n | p50(ms) | p90(ms) | max(ms) |
|---|---|---|---|---|---|---|
| ios | local | auto | 192 | 66 | 101 | 783 |
| unknown | local | auto | 148 | 71 | 88 | 1365 |
| ios | stream | start | 87 | 1669 | 9553 | 17223 |
| ios | stream | auto | 65 | 951 | 8376 | 14927 |
| unknown | stream | auto | 62 | 22 | 7505 | 22294 |
| unknown | stream | start | 28 | 12135 | 17799 | 35901 |
| unknown | local | tapNext | 16 | 314 | 345 | 348 |
| unknown | local | start | 13 | 714 | 755 | 763 |
| ios | stream | jsRecover | 7 | 213 | 9413 | 9413 |
| ios | local | start | 7 | 205 | 235 | 235 |
| unknown | stream | tapNext | 4 | 7434 | 7460 | 7460 |
| ios | stream | tapQueue | 4 | 4986 | 5774 | 5774 |
| ios | stream | tapNext | 2 | 1541 | 1541 | 1541 |

**Android：零行。**`nextTrackMs` 呢個 KPI 喺呢個窗完全冇 android 數據——DEEP-AUDIT-PLAN §5 問「Android 有冇儀器數據」，答案係「呢一個 event 完全冇」（見 §5 詳表）。

**確認真機（Eric,`e1b6...`）獨立睇**：09-02 起播 `stream` 樣本仍有 p90 落喺 8-9 秒級（同 09-02 效能工程總結報告記錄嘅改善後基準吻合，唔係 regression）；本window冇再收集到佢 09-02 之前嘅 `nextTrackMs`（呢個機喺 client-log 入面第一條紀錄就係 09-02T11:07,OTA 已經生效之後）。

抽取指令：
```python
import json, glob, collections
def parse_detail(d):
    return dict(t.split('=',1) for t in d.split() if '=' in t)
rows=[json.loads(l) for f in glob.glob('backend/logs/client-log/*.jsonl') for l in open(f) if l.strip()]
nt=[r for r in rows if r.get('event')=='nextTrackMs']
```

### 2.2 stall/救援 event 每部機每日次數（只計有 `deviceId` 嘅 row；`(none)` = 08-31 前後冇 deviceId 嘅歷史行，唔可以歸機）

| deviceId | 日期 | event | 次數 |
|---|---|---|---|
| **(none)** | 2026-09-01 | midStallNudge | 63 |
| df3e6a93...（**已剔,測試機**） | 09-02 | hlsStartupKick | 30 |
| **e1b6dc8a...（Eric，確認真機）** | 09-02 | hlsStartupKick | 28 |
| **(none)** | 09-01 | nativeSkipAttributed | 23 |
| df3e6a93...（已剔） | 09-02 | nativeSkipAttributed | 19 |
| **(none)** | 08-31 | nativeSkipAttributed | 16 |
| **e1b6dc8a...** | 09-02 | nativeSkipAttributed | 10 |
| **e1b6dc8a...** | 09-05 | hlsStartupKick | 10 |
| **(none)** | 09-01 | handleMidStreamStall_giveup | 8 |
| **(none)** | 09-01 | handleStuckTrackEnd | 8 |
| **e1b6dc8a...** | 09-02 | midStallNudge | 7 |
| **e1b6dc8a...** | 09-03 | hlsStartupKick | 5 |
| **(none)** | 09-01 | hlsFallback | 4 |
| **e1b6dc8a...** | 09-04 | hlsStartupKick | 4 |
| **e1b6dc8a...** | 09-02 | handleMidStreamStall_giveup | 2 |
| **e1b6dc8a...** | 09-02 | handleStuckTrackEnd | 2 |
| **e1b6dc8a...** | 09-02 | hlsFallback | 2 |
| **e1b6dc8a...** | 09-05 | midStallNudge | 2 |

**異常訊號**：確認真機 Eric 喺 09-02 單日 `hlsStartupKick`=28、`nativeSkipAttributed`=10——呢兩個數喺 09-02 之後（09-03/04/05）大幅回落（5/4/0、0/0/0），可能係 09-02 11:03Z OTA 部署嗰日本身有暖機/切換期效應，或者 09-02 集中做咗覆核測試（同一部真機當日仲有 258 行入面 156 行都喺 09-02）。**唔可以斷定係 regression 定係測試密度差異**——冇 09-02 之前嘅同機基線可以對比（§3.2 A-6 前後對比同一限制）。

### 2.3 `nativeStall`（iOS SwiftAudioEx watchdog，Podfile patch）—— 結構性冇 platform/deviceId

`backend/routes/clientLog.js` 白名單有 `platform`/`deviceId` 兩欄，但 `ios/Podfile:101` patch 入去嘅 `SWStallWatchdog.beacon()` 個 body **淨係 `{event, clientTs, detail}`，冇帶 platform 冇帶 deviceId**（同 App.js 嘅 `logDiag()`/`perfMarks.js` 嘅 `sendBeacon()` 唔同一套實作）。結果：

- n=1025，日期 08-25~09-05，**全部 `platform=''`**——本表結構上做唔到「每部機每日次數」，呢個係 DEEP-AUDIT-PLAN 要求嘅表格本身喺現有儀器下做唔到。
- phase 分佈：`progressTick`386 / `detected`181 / `reloaded`178 / `nudge`105 / `skipped`97 / `recovered`53 / **`breakerTripped`20** / `stallNotification`5。`breakerTripped`=watchdog 三次連續 reload 都救唔返、熔斷 pause——**14 日內發生 20 次**，係最值得跟進嘅訊號，但因為冇 device 標識，唔知集中喺幾多部機。
- hymnId（`hid=`）分佈:121 個相異 id,`?`(parse 唔到,通常係 progressTick/nudge 冇帶)119 次,`795` 66 次(全庫最多)、`2737` 33、`3576` 25、`190` 24、`6712` 18——**id=795 係歷史上多份 HLS 報告都提過嘅大檔測試個案**,呢度唔係新發現,只係佐證佢持續係 stall 熱點。

**架構性缺口**（唔係本次審計嘅範圍去改，但要記錄）：`nativeStall`/`prefetchFail`/`RemoteDuck` 三種 event 全部冇 platform/deviceId,理由如下（§5 詳述）。

### 2.4 stall→跳歌率

冇一個乾淨嘅分母可以計「stall→跳歌率」：`handleMidStreamStall_giveup`/`handleBufferingStuck_giveup` 已經**係**跳歌事件本身（giveup 之後必然 `handleStuckTrackEnd`），`nativeStall` 冇 hymnId 穩定配對（119/1025 個 `hid=?`）。可以講嘅係**比例**：確認真機 Eric 14 日內 `nextTrackMs`(=真轉咗歌) 143(local auto)+87+65+7+7+4+2 條 stream/local 樣本 中,對應 `handleMidStreamStall_giveup`=2、`handleStuckTrackEnd`=2、`hlsFallback`=2——單一真機樣本量太細,呢個比率唔穩,只可以講「單位數,唔係常態」。

## 3. 開機（App startup）

### 3.1 `perfMarks`／`perfHome`／`perfNav`／`perfRenders`——確認真機 Eric 全 5 個樣本（08-31 前呢個 event 冇 deviceId,唔可以用嚟做同機對比,所以呢度**只用有 deviceId 之後**嘅樣本）

| ts | app | cont | mmkvRead | parse | home | verMs | hymnsMs | att | ok1 | lyrMs | merged |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 09-02 11:07（OTA 生效後 ~4 分鐘） | 53 | 102 | 18 | 21 | 379 | 721 | **-**(verSkip=1,冇 fetch) | - | - | - | - |
| 09-03 01:29 | 103 | 187 | 19 | 22 | 497 | 1362 | 1014 | 1 | 1 | 1962 | 1 |
| 09-04 10:50 | 99 | 201 | 19 | 22 | 537 | 1397 | 1665 | 1 | 1 | 4016 | 1 |
| 09-05 08:36 | 93 | 214 | 19 | 21 | 513 | 1387 | 2187 | 1 | 1 | 3221 | 1 |
| 09-05 11:18 | 55 | 106 | 18 | 21 | 399 | 1038 | 3573 | 1 | 1 | 5734 | 1 |

`perfHome`（同一機 5 個樣本）：`lib`（Library 首 render 耗時）穩定喺 217~232ms、`libIdle`（idle pre-mount 時機）832~988ms、`today`16.4~17.8ms、`recent`5.9~6.4ms——5 個樣本波動細,睇唔出趨勢。

`perfNav`：`tapToMount` 63~157ms、`tapToPaint` 89~225ms（Library tab 最耐,同 `lib` render 耗時吻合）。

`perfRenders`（t=15/60 秒累積 render 次數）：`Home`7~16、`Library`3~32(09-05 11:xx 嗰次 Library=25→29,同其他樣本 3~10 差好遠,可能嗰次撳咗 Library tab 幾次或者觸發咗重複 render——單一樣本,唔足以下判斷,列做觀察點)、`PlayerProvider`4~11。

### 3.2 A-6 OTA（09-02 11:03Z）前後對比——**做唔到**

確認真機 Eric 喺 client-log 入面**第一條紀錄就係 09-02T11:06:48Z**（OTA 部署 09-02 11:03Z 之後 3 分鐘）,冇任何 09-02 11:03 之前嘅同機樣本。**冇辦法用呢個數據源做同一部真機嘅 OTA 前後對比**——呢個唔係「數字唔好睇」,而係結構性冇「before」樣本。前後對比要睇 `PERF-BASELINE-1A/1B-20260902.md`/`PERF-FINAL-REPORT-20260902.md` 嗰批獨立收集嘅基準（唔喺呢份審計範圍內重複引用其結論）。

用全部（含未剔除測試機）樣本做 09-02 11:03 前後嘅粗略切分都做唔到——09-02 之前得返 `platform=''`（冇 device 標識）嘅零星樣本,總數太少（perfMarks 喺 08-31~09-01 呢兩日總共得幾條,唔構成穩定分佈）。**結論:A-6 前後對比呢個要求喺現有 client-log 數據下唔可行,誠實標「無法比較」。**

### 3.3 Android `perfMarks`——**有,但薄**

推翻 DEEP-AUDIT-PLAN 「Android 可能冇儀器數據」嘅擔心一半:`d03463c30ea4935bc0d49ec57ba53b4c`（未證實真機/AVD）有 5 條 `perfMarks`（09-02×1、09-04×1、09-05×3）,格式同 iOS 完全一樣（`app=66~129 cont=139~282 mmkvRead=13~26 parse=15~23 home=315~524 hymnsMs=559~1914`）。**但呢個 deviceId 未證實係真人**（見 §1 第 3 點）,唔可以直接當「Android 真用戶開機基準」報。若要相信呢組數,同 iOS 比:`app`/`cont`/`hymnsMs` 數量級同 iOS 相若,冇睇到平台級嘅巨大落差。

## 4. 錯誤

### 4.1 `prefetchFail`（`frontend/hymn-app/src/audioPrefetch.js`,**架構上 iOS-only**——`initCache()` 開頭 `if (Platform.OS !== 'ios') return`,呢個 module 對 Android「完全冇耦合」係 comment 原話）

n=149,08-23~09-05 全期都有。**呢個 beacon 冇 platform 冇 deviceId 欄**（`diagFail()` 自己另寫一份,冇跟 App.js 個白名單格式）——冇得再細分邊部機。原因分佈：

| reason | 次數 |
|---|---|
| aborted-for-stream | 89 |
| timeout | 19 |
| status=502 | 15 |
| pruneSkipPinned=1 | 13 |
| cacheStale | 6 |
| pruneSkipPinned=5 | 4 |
| badType=audio/webm | 2 |
| fetch failed: FetchRequestCanceledExcept | 1 |

`aborted-for-stream`(89/149=60%)係設計行為(prefetch 俾緊播嘅 stream 讓路),`pruneSkipPinned`(17)都係正常 cache 管理。**真正嘅失敗訊號係 `timeout`(19)+`status=502`(15)+`badType`(2)=36 條,佔 24%**。

### 4.2 `wallClockDrift`

n=65,`driftMs` p50=60,671ms(~1 分鐘) p90=2,989,376ms(~50 分鐘) max=47,814,845ms(~13.3 小時)。分佈極闊,而且 `driftMs` 本質上量緊「JS 計時器 tick 之間嘅實際牆鐘差」,**app background 咗好耐先 resume 都會出巨大 driftMs**——呢個 event 結構上分唔開「真時鐘飄移」同「app 俾人背景咗一晚」。Android 機（`d03463c3...`）5 條樣本入面就有 1,481,062ms(~24.7分)、10,487,845ms(~2.9小時)兩條巨大值——**極可能係背景太耐,唔係時鐘飄移**,報告入面唔當異常。按 platform:`''`45／`ios`15／`android`5。

### 4.3 `PlaybackError`

n=20,08-24~09-02。**確認真機 Eric 得 3 條,全部集中 09-02 00:29~01:27（OTA 部署後首晚）,09-03 之後零條**。其餘 17 條全部係 08-24/08-25 嘅歷史行（`platform=None`,舊版本）或 09-01 一條(`deviceId=None`,deviceId 未 rollout 嗰陣)。

### 4.4 `RemoteDuck`——冇 platform/deviceId(第二個架構缺口)

`track-player-service.js` 自己有一份獨立嘅極簡 `logDiag()`（同 App.js 嗰個唔係同一份 code,冇 `platform`/`deviceId`,**亦冇 `DIAG_ENABLED` 閘**——呢個 event 一路都係無條件送,唔受「效能工程期間先開」個閘影響）。n=39,08-25~09-05,`paused=true`28/`paused=false`11,`permanent` 全部 `undefined`（前端 code 冇讀 `event.permanent` 就直接塞落 detail,呢個欄事實上冇用過）。

### 4.5 `stateChange`/`trackChanged`/`playWhenReadyChanged`——DIAG_ENABLED gate

`src/config.js` 現時 `DIAG_ENABLED = false`。呢三個 event 只有喺歷史上 `DIAG_ENABLED` 短暫開過嘅窗口先出現（本窗全部 70/13/20 條,日期集中 08-24~08-25,**09 月之後零條**）——證實現時呢啲高頻 event 完全冇再收,同 code comment「已經閂返」吻合。

### 4.6 Backend 側

- **`All yt-dlp strategies failed`**：/tmp/hymn_backend.log(09-05 單日窗)出現 31 次。
- **`[resolve]` 失敗率**（`ops-metrics.json` 累計,08-23~09-06 全期）：`resolve.total=23609,ok=22443,fail=1166` → **失敗率 4.94%**；`winner.default=22384` 對 `default-any`(rescue strategy)`=59` 次先至救返。`attempts["youtube:player_client=tv"]` 策略 **0/1087 成功**（100% fail,`msSum=40806109` 即平均每次試 37.5 秒先判失敗）——呢個策略喺呢 14 日完全冇成功過一次,值得問係咪應該剷走。
- **`resolve_ms` 分佈**：冇逐筆記錄落 JSON,只有 `okMsSum=78411405 / ok=22443` → 平均 3494ms,`okMsMax=384179ms`(6.4 分鐘,極端值)。
- **`[stream]` ttfb/aborted/retried**（09-05 單日窗,按真流量 UA(`Odely`/`AppleCoreMedia`) vs 健康探針(`curl`)分）：

| 類型 | mode | n | ttfb p50 | ttfb p90 | resolve p50 |
|---|---|---|---|---|---|
| 真流量 | warm | 291 | 182ms | 191ms | 0ms |
| 真流量 | cold | 6 | 4059ms | 5846ms | 3266ms |
| 健康探針(curl) | warm | 61 | 778ms | 1369ms | 0ms |
| 健康探針(curl) | cold | 6 | 3639ms | 5180ms | 2916ms |

真流量 aborted=5/297(1.7%),retried=0/297(0%)。**冷熱差距明顯(182ms vs 4059ms),warm rate 靠 `ops-metrics.json` 全期累計係 96.2%**（`stream.warm=9014/9366`）。

## 5. Backend 綜合（`/tmp/hymn_backend.log`,09-05 07:36~16:35 單一 restart 窗）

| route | n | ms p50 | ms p90 | bytes p50 | bytes p90 | status |
|---|---|---|---|---|---|---|
| GET /api/internal/activity | 26 | 1 | 2 | 19 | 19 | 200×26 |
| GET /api/hymns | 20 | 136 | 221 | 377,384 | 5,652,555 | 200×19 304×1 |
| GET /api/version | 15 | 1 | 6 | 45 | 45 | 200×12 304×3 |
| GET /api/health | 13 | 1 | 3 | 0 | 15 | 304×8 200×5 |
| GET /api/home/daily-verse | 10 | 1 | 3 | 0 | 113 | 200×4 304×6 |
| GET /api/app-version | 10 | 5 | 19 | 163 | 163 | 200×10 |
| POST /api/me/sync | 8 | 11 | 154 | 927 | 927 | 200×8 |
| GET /api/friends | 8 | 4 | 19 | 0 | 79 | 304×7 200×1 |
| GET /api/me/data | 8 | 8 | 37 | 0 | 136 | 304×7 200×1 |
| GET /api/hymns/lyrics | 6 | 119 | 774 | 844,596 | 850,350 | 200×6 |
| GET /api/admin/presence | 4 | 2 | 4 | 189 | 189 | 200×3 401×1 |
| GET /api/auth/otp/status | 2 | 1 | 1 | 85 | 85 | 200×1 304×1 |
| **POST /api/presence/heartbeat** | **1** | 20 | 20 | 162 | 162 | **404×1** |
| POST /api/me/favorites/3240 | 1 | 9 | 9 | 11 | 11 | 200×1 |

**異常訊號 —— `POST /api/presence/heartbeat` 404**（09-05T08:12:50Z,唯一一次呼叫）：`backend/routes/presence.js` 已定義呢條 route,`server.js:180` 有 `presenceRoutes(app)` 掛載,`frontend/hymn-app/src/hooks/usePresenceHeartbeat.js` 都有叫。但實測回 404。核對 `ps -o lstart -p <pid>` 見**目前跑緊嘅 backend process 喺 2026-09-05 21:09:02 先起身**,比呢個 404 request(08:12)遲——**即係呢次 404 係俾一個更舊嘅 process 答嘅,唔代表而家跑緊嘅版本仲係咁**。因為窗內淨係得一次呼叫,**冇後續樣本可以確認而家係咪已經好返**。呢個係讀 log 讀出嚟嘅事實,唔係猜測——但結論要停喺「未證實現況,建議另外主動探測一次」,唔延伸落去話係邊個 bug。

- **`[deprecated-route]`**：09-05 單日窗**零命中**（`backend/routes/{audio,category,home,search}.js` 嘅 deprecated 分支全部冇 log 出過）——同 09-02 效能報告「4 個 route 疑零引用」嘅懷疑吻合,新增一日獨立佐證。
- **🗜️ async compress**：18 條,全部係正常完成(`async compress → gz=...br=...`),**冇一條「dataVersion 已經郁咗,掉咗唔寫」嘅 race 訊息**——本窗冇撞到呢個已知邊界情況。
- **`[db]` stale lock**：09-05 單日窗零命中。
- **RSS 曲線(`ops-metrics.json` hourly,09-02 01:00~09-06 00:00,96 小時)**：範圍 32,048KB~380,688KB,**冇單調上升嘅「階梯」洩漏訊號**——反而係鋸齒形,谷底(如 09-02 15:00=32MB、09-04 02:00=49MB)同 backend restart 時間點吻合(09-02 11:03Z OTA 附近有一次、09-02 15:00 附近應該另有一次 restart)。**呢個窗入面 backend restart 太頻密(工程期間常態),用呢段時間嘅 RSS 曲線判斷「有冇記憶體洩漏」唔可靠**——每次 restart 就歸零,睇唔到跨 restart 嘅累積趨勢。
- **presence heartbeat 流量**：全期(`/api/admin/presence` GET 4 次可反映呢個功能有人用緊 admin 頁)但 `/api/presence/heartbeat` POST 只出現 1 次(仲要 404)——**呢個功能喺真實流量入面基本上冧,冇心跳流量進帳**,同 `ADMIN-PRESENCE-REPORT-20260905.md`「冇部署」嘅記錄吻合(呢個功能 09-05 都仲未算完全上線)。

### stream-health.log（獨立健康探針,08-19~09-06）

154 行入面 121 行(79%)係全 ok,33 行(21%)有唔同程度 fail。集中喺 **08-28 19:52 ~ 08-30 16:39** 之間一段連續退化(`consecutiveFail` 一路衝到 4,`resolve-fail` 打晒三首探針歌),之後 08-30 16:39 之後**冇再出過任何 fail**,直到 09-06 全部乾淨。**呢個係 14 日窗入面歷史上最大嘅一次(已自愈嘅)異常**,08-30 之後穩定。

## 6. 已知限制(唔好用呢份報告答唔到嘅問題)

1. `/tmp/hymn_backend.log` 得返 09-05 一個 restart 窗嘅 `[access]`/`[stream]` 逐行紀錄——**冇辦法用佢做「14 日」嘅 backend 逐行分佈**,只有 `ops-metrics.json` 嘅累計/hourly 撐到成個窗。兩者唔可以直接加埋一齊睇(粒度唔同)。
2. `nativeStall`/`prefetchFail`/`RemoteDuck` 三種 event 結構上冇 `platform`/`deviceId`——呢個唔係本次審計嘅盲點,係現有儀器嘅缺口,已喺 §2.3/§4.1/§4.4 逐條標明,冇嘗試用 UA 或者時間相近反推(memory `project-multi-sim-clientlog-contamination` 明文話呢招會出錯)。
3. A-6(09-02 11:03Z OTA)前後對比**做唔到**——確認真機嘅第一條紀錄就已經喺 OTA 之後,結構性冇 before 樣本(§3.2)。
4. Android 嘅所有數字(§3.3、`wallClockDrift` 5 條)嚟自**未經獨立確認**嘅單一 deviceId,唔可以當「Android 真用戶 baseline」使用——只可以當「呢個特定機喺呢幾日嘅行為」嘅弱訊號。

## 7. 真用戶 baseline 總表(唔判 PASS/FAIL)

| 指標 | iOS(確認真機 `e1b6dc8a...`,09-02~09-05,n=258 rows) | Android |
|---|---|---|
| 開機 `app`+`cont`(ms) | 53-103 / 102-214 | 無法確認(§1第3點,只有未證實機嘅 5 個樣本:66-129/139-282) |
| `hymnsMs`(冷首屏歌庫 fetch) | 1014-3573ms(1 個樣本 verSkip 冇 fetch) | 同上,未證實機:559-1914ms |
| `home` render | 379-537ms | 未證實機:315-524ms |
| `nextTrackMs` local/auto | p50 66ms p90 101ms(全部樣本含未剔測試機) | **無數據**(0 行) |
| `nextTrackMs` stream/start | p50 1669ms p90 9553ms | **無數據** |
| `PlaybackError` | 3 次(全部 09-02 首晚,之後零) | **無數據** |
| `hlsFallback` | 2 次(09-02) | **無數據**(HLS 只喺 iOS 用) |
| `handleMidStreamStall_giveup` | 2 次(09-02) | **無數據** |
| `nativeStall breakerTripped` | 20 次(全期,**冇 device 標識,唔知係咪呢部機**) | 架構上唔存在(iOS-only patch) |
| `prefetchFail` | 149 次(全期,**冇 device 標識**) timeout/502=24% | 架構上唔存在(iOS-only module) |
| resolve 失敗率(backend,全期累計) | 4.94%(兩平台共用同一 backend,唔分平台) | 同左 |
| stream warm rate(backend,全期累計) | 96.2%(共用) | 同左 |

**Android 一行總結**：呢 14 日窗入面,`nextTrackMs`/`PlaybackError`/`hlsFallback`/stall 救援全部 event 類型,Android 平台**一條都冇**——唔係「數字唔好睇」,而係**完全冇數據**,連確認做「有冇人用緊 android 版本」都做唔到(得返嗰一個未證實 deviceId 開過幾次 app,冇播過歌)。呢個本身就係 Phase 1 體檢嘅一個發現:**Android 真機 telemetry 缺口(冇真人樣本)比任何具體 bug 都更優先**,同 `DEEP-AUDIT-PLAN` §0 講嘅「Android 完全未量」吻合。
