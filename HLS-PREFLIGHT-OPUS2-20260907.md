# HLS 起播預檢修補 —— Opus 第二輪獨立驗收 2026-09-07

驗收對象:`63ffcd2`(App)、`61e6ad3`(backend)、`57346ef`(harness/報告),base `f4bcb2d`。
上輪驗收 `HLS-PREFLIGHT-OPUS-20260907.md` 七條;執行者報告 `HLS-PREFLIGHT-FIX-REPORT-20260907.md`。

---

## 0. 結論

🟢 **可以 OTA + restart backend。** 七條全部落咗地,紅線零命中,harness 64/64,
iOS sim 五個情境全部量過。核心目標(403 唔跳歌、冷歌唔誤降級、零假 `nativeSkipAttributed`)
真機達到,而且正常暖歌起播**冇引入延遲**(A/B 中位 after 110ms vs before 112ms)。

兩件要記低但**唔阻出街**:

| | 事 | 點解唔阻 |
|---|---|---|
| 🟠 P1 | **#6 目標未達到**:用戶喺預檢窗口撳暫停,熱換之後首歌**仍然會自己播返**(遲 ~15 秒,由 native 而唔係 JS 觸發) | 同 `f4bcb2d`、同 pre-preflight 舊行為**一模一樣**(對照組實測),唔係 regression;#6 個 guard 本身行為正確(冇 call `play()`),係俾下游一條既有 listener 抵銷 |
| 🟡 P2 | **`nextTrackMs` 量度偏差**:降級個案而家報 `origin=jsRecover`,而且 `ms` 由「熱換嗰刻」起計(唔係用戶撳嗰刻) | 同其餘三條既有熱換分支一致;但**收貨數字唔可以淨睇 `origin=start` 中位**,見 §4 |

---

## 1. 逐條核七條

| # | 修法 | 核實 |
|---|---|---|
| **#1** | 只認明確 4xx/5xx;`timeoutMs` 5000→9000 | ✅ `isExplicitHttpFailure()` 要求 `typeof status === 'number' && 400≤status<600`;`timeout`/`network`/`not-m3u8`(200 但唔係 m3u8,status<400)一律 return false。§1.2/§1.3 兩個 call site 都由 `if (pre.ok) return` 改成 `if (!isExplicitHttpFailure(pre)) return`,共用同一條判斷。真機:6.5s 同 8.5s 冷預檢**兩次都 `ok=1`、零 `hlsFallback`**(§3b);全 session 5 條 `hlsFallback` **全部帶 `status=404`**,冇一條由 timeout/network 觸發。 |
| **#2** | RN abort 用 timer flag | ✅ `didTimeout` 喺 `setTimeout` callback 設,`catch` 直接讀,唔再摸 `e.name`/`e.message`。H-A 有專門 case(RN 形狀嘅 `TypeError('Network request failed')` 判 `timeout` 唔係 `network`)。⚠️ 真機今輪冇再現一次真 timeout(9 秒閘冇撞過),呢條淨係 harness 級證據 —— 但因為 #1 之後 `timeout` **唔會觸發任何行為**,錯判嘅代價由「誤降級」跌到「beacon 個 reason 欄唔準」,風險已經消失。 |
| **#3** | 熱換前 `transitionT0Ref = jsRecover` marker | ✅ **有正控**。同一情境(403 + 撳暫停)`before` build 出咗**全 session 唯一一條** `nativeSkipAttributed hymnId=50 errorSkipCount=1` + `nextTrackMs origin=auto`;`after` build 同一情境 **0 條**,`origin=jsRecover`、`errorSkipCount=0`。三次 after 降級(a/c/e)累計 `nativeSkipAttributed=0`、`PlaybackError=0`。 |
| **#4** | backend 403 → `bustCache` + 即回 404,唔 re-resolve | ✅ 落咗地,`backoffMsFor`/`HLS_RETRY_BACKOFF_MS` 已刪乾淨,`playlistCache.set` 改用 `cacheKey`(等值,冇 bug)。`routes/stream.js` **一個字冇改**(`git diff --stat` 空),progressive 嗰條 backoff→bustCache→re-resolve 403 重試鏈原封不動(`stream.js:517-548`)。**「本來重試就成功」嘅影響見 §2。** |
| **#5** | `hlsDowngradedTrackRef` 成功後先 set | ✅ 兩個 call site 都搬咗落 `load()`/`remove+add` 之後。H-B 有正反兩控:load 拋錯但 fallback 成功 → 照 set;成條路都失敗 → 保持 null(唔閂死 `PlaybackError`/`handleStuckTrackEnd`)。真機冇撞過 `load()` 拋錯,呢條仍然淨係 harness 級。 |
| **#6** | 用戶暫停唔夾硬 play | 🟠 **guard 本身正確,但目標未達到**,見 §3c。 |
| **#7** | §1.3 近尾 15 秒唔換 | ✅ 照抄 `onPrefetchComplete`(App.js ~668)。**結構上唔會誤擋**:§1.3 淨係喺 `PlaybackActiveTrackChanged` 嗰刻 fire,預檢最多 9 秒,所以 guard 睇到嘅 `position` 最多 ~9 秒 —— 除非首歌短過 24 秒,否則永遠過得到。真機 (e) 實測:swap 嗰刻 position≈0 / duration=348.9,guard 冇擋。 |

### 紅線 grep(重跑,全部零命中)

```
git diff f4bcb2d..57346ef -- frontend/hymn-app/App.js | grep '^[+-]' | grep -v '^[+-][+-]' \
  | grep -vE '^\s*[+-]\s*//' \
  | grep -iE 'watchdog|nudge|rescue|hlsStartupKick|handleMidStreamStall|handleBufferingStuck|handleStuckTrackEnd|threshold|GIVEUP|CAP_TICKS'
```
→ 0 行。另外核實:
- `Platform.OS` / `android` 喺 `frontend`+`backend` diff **零命中** → **Android 路徑今輪零改動**(所以照上輪結論唔使再開 AVD)。
- `toTrack()` / `playQueue()` 簽名行零改動。
- `backend/routes/stream.js`、`app-version.json`、`hlsDeviceIds`、`frontend/hymn-app/ios|android/` 全部唔喺 diff 入面。
- 改動檔淨係 7 個:`backend/routes/hls.js`、`frontend/hymn-app/App.js`、`src/hlsPreflight.js`、3 個 harness、1 份報告。

### Harness 重跑(我自己跑,唔係抄報告)

| Harness | 結果 |
|---|---|
| H-A | 14 pass / 0 fail |
| H-B | 26 pass / 0 fail |
| H-C | 19 pass / 0 fail |
| H-D | 5 pass / 0 fail |
| **合計** | **64 pass / 0 fail** ✅ |

---

## 2. #4 —— 「本來重試就成功」嘅個案有幾多?prod log 答案:**0**

上輪講「log 上面結構上數唔到」(`result=ok` 嗰行冇印 `retried`)。**今輪搵到一個間接但硬嘅數法**:
重試路徑一定會 `bustCache` + 再 `resolveAudioUrl()`,而 `resolveAudioUrl()` 成功會印一行
`[resolve] ok ... id=<ytid>`。所以「重試救返」嘅指紋 = 同一個 `ytid` 喺 `[hls] result=ok` 之前
出咗 **2 條** `[resolve]`。

實測 prod `/tmp/hymn_backend.log`(09-05 10:37 → 09-07 01:57,即現役 backend 由上次 restart 到而家):

| `[hls]` 結果 | 條數 | 之前 `[resolve]` 條數 |
|---|---|---|
| `result=ok` | 26 | **每一條都 ≤1**(即冇一次行過重試) |
| `404-headfetch-failed(status=403)` `retried=true` | 4(2 首歌 × 2 request) | 2–3(重試真係行過) |

**即係:呢個窗口入面重試 fire 過 4 次,4 次全部救唔返;救返嘅個案 0 次。**
(n 細係因為 HLS 而家只開俾 Eric 一部機。)加埋上輪三次 force-403 實測 before/after 一樣救唔返,
**移走呢個重試冇量到任何損失**。

真係撞到「重試本來會成功」嗰種罕見情況,新行為 = 嗰首歌行 progressive(慢啲,但唔係跳歌),
而 progressive 自己喺 `stream.js` 仲有一套完整 403 重試(冇改)兜底。**可接受。**

另外一個順帶收益:舊碼 403 之後喺 hls request 入面等 3–5 秒 re-resolve;新碼即刻回 404、
client 即刻換 progressive,而 progressive 嗰邊先付 re-resolve 成本 —— **總時間冇變差,但用戶等嘅時候 app 已經喺度做嘢**。

---

## 3. iOS Simulator(iPhone 17 `E0416618`,Release build + 隔離 backend 副本 port 3999)

**方法.** `backend/` APFS clone → port 3999,`app-version.json` 副本 `hlsDeviceIds: []`(全量開 HLS),
`URL_KEEPWARM=0` + precache 熄。副本加咗三個 **SIM-VERIFY-ONLY**、env-gated、逐段 comment 標注嘅 mock
(`force403yt` 模擬 head-fetch 403 之後**照行真身 #1/#4 分支**、`forceSlow` 模擬冷 resolve、
`blockPrefetchIds` 擋走 `Odely/` UA 嘅本地預載,避開 memory `project-hls-window-source-local-trap`
嗰個 `source=local` 空炮)。App 側兩個 APFS clone(`appAfter` = working tree = `57346ef`;
`appBefore` = `git show f4bcb2d:` 還原嘅 `App.js`+`hlsPreflight.js`),兩邊**只差 59 行 App.js + 38 行 hlsPreflight.js**
(= 呢次 diff 本身),兩邊同樣打咗 `API_BASE=http://localhost:3999`、`DIAG_ENABLED=true`、
同一份 SIM-VERIFY-ONLY 劇本 driver。`expo export:embed --dev false` 出 bundle 蓋落同一個
Release-iphonesimulator `Odely.app` 嘅 `main.jsbundle`(原生層零改動),`EXUpdatesCheckOnLaunch=NEVER`。
Bundle 自證:after `timeoutMs:l=9e3` + `jsRecover`×7;before `timeoutMs:l=5e3` + `jsRecover`×6。
**prod backend / prod `app-version.json` / repo working tree 一個字冇改**(收工已核)。

### (a) 403 → 唔跳歌、零 nativeSkipAttributed、有聲 ✅

```
02:23:13.98  stateChange none→loading→buffering, trackChanged idx=0 hymnId=1   ← HLS 起播
02:23:16.84  hlsPreflight ok=0 status=404 ms=2859 reason=status:404 ctx=start
02:23:16.85  hlsFallback via=preflight ctx=start reason=status:404
02:23:16.85  stateChange buffering→loading      ← TrackPlayer.load() 熱換
02:23:16.90  trackChanged idx=0 hymnId=1        ← 仲係同一首
02:23:24.42  stateChange buffering→playing position=0 duration=290.9  ← 真出聲
02:23:24.42  nextTrackMs ms=7572 origin=jsRecover source=stream
```
`nativeSkipAttributed`=0、`PlaybackError`=0、`idx` 全程 0、`hymnId` 全程 1。
用戶感知起播 10.4 秒(絕大部分係 `bustCache` 之後 progressive 冷 re-resolve;本機 loopback,絕對值同 Eric 部機唔可比)。

### (b) 冷預檢 6.5s / 8.5s 先 200 → 唔降級 ✅

| 個案 | `hlsPreflight` | `hlsFallback` | `nextTrackMs` | 播緊條 URL |
|---|---|---|---|---|
| id=4,延遲 6.5s | `ok=1 status=200 ms=6809` | **0 條** | `ms=6816 origin=start` | `.../stream/4.m3u8` ✅ |
| id=8,延遲 **8.5s(邊界)** | `ok=1 status=200 ms=8531` | **0 條** | `ms=8571 origin=start` | `.../stream/8.m3u8` ✅ |

8.5s 距 9000ms 閘剩 469ms,仍然乾淨過關。就算真係過咗 9 秒,#1 之後 `timeout` **唔會觸發降級**,
所以呢條閘而家係「軟」嘅 —— 上輪嗰個「5 秒誤殺健康冷歌」嘅病根已經斷。

⚠️ 一個 mock 假象要記低:id=8 播咗 10 秒之後有一次中途 stall(`playing→loading→buffering→paused`),
原因係我個 `forceSlow` 對**每一個** `.m3u8` request 都加 8.5 秒,連 native `swReloadFresh` 嗰次 reload
都慢咗 8.5 秒([hls] 第三條 `ms=8504`,`[stream] wd=1`)。呢個係測試裝置嘅產物,唔關修補事。

### (c) 403 期間用戶撳暫停 → 熱換後**仍然會自己播返** 🟠(唔係 regression)

```
after (63ffcd2):
02:32:33.21  cmd_pause → playWhenReady=false expected=false        ← 用戶撳暫停
02:32:37.58  hlsPreflight ok=0 status=404 ms=5867 → hlsFallback
02:32:37.59  stateChange paused→loading                            ← TrackPlayer.load() 熱換
   (15 秒之內完全冇 playWhenReadyChanged —— 即係 #6 個 guard 真係 return 咗,冇 call play())
02:32:52.83  loading→buffering + playWhenReadyChanged playWhenReady=true expected=true   ← native 自己開
02:32:56.28  buffering→playing        ← 首歌自己播返
```
```
before (f4bcb2d) 對照組:
02:34:32.08  cmd_pause → playWhenReady=false expected=false
02:34:33.54  hlsFallback
02:34:33.60  playWhenReadyChanged playWhenReady=true   ← 熱換後 55ms,JS 夾硬 play()
02:34:33.60  nativeSkipAttributed hymnId=50 errorSkipCount=1        ← #3 要醫嗰條假嘢
02:34:40.87  playing,nextTrackMs origin=auto
```

**判斷.** #6 個 guard 本身**行為正確**(after 熱換之後 15 秒零 `play()`,before 係 55ms 就 play);
但 `TrackPlayer.load()` 會令 native `playWhenReady` 喺 item ready 嗰刻變返 `true`,
而 `App.js:1508` 一條**既有** listener(`if (event?.playWhenReady === true) expectPlayingRef.current = true`,
H1 修復,為咗鎖屏/耳機 resume)會照單全收 → 首歌照播。
**兩個 build 最終都會播返**,所以呢條**唔係新 regression、唔阻 OTA**;但 #6「用戶撳咗暫停就唔好嗌醒」
呢個目標**實際上冇達到**,報告 §0 #6 講「留喺原地(暫停緊),等用戶自己撳 play」係報大咗。
要真正做到,個修法要落喺 `load()` 之後補一次 `TrackPlayer.pause()`(或者喺熱換窗口臨時
suppress 嗰條 H1 listener),唔係得個 `return`。建議另開一張細單,唔好夾喺呢次出街。

### (d) 正常暖歌起播 A/B 交錯 ✅ 冇引入延遲

交錯次序 after→before→after→before→after→before(每 block 重裝一次,每 block 2 次起播),
固定 id=34 / id=41(兩首都預先暖過 resolve + playlist + progressive,`blockPrefetchIds` 逼晒行
`source=stream`),量 `nextTrackMs origin=start source=stream`:

| 變體 | n | **中位** | 全部樣本(ms) |
|---|---|---|---|
| **after**(`57346ef`) | 6 | **110 ms** | 101 102 107 113 118 119 |
| **before**(`f4bcb2d`) | 6 | **112 ms** | 97 105 106 118 120 125 |

Δ 中位 = **−2 ms**,兩組範圍幾乎完全重疊,差異喺噪音之內。
同期 12 次 `ctx=start` 預檢自己耗時 48–55ms,全部 `ok=1`,零 `hlsFallback`、零 `nativeSkipAttributed`
—— 印證預檢係喺 `play()` 之後 fire、唔入起播路徑。

### (e) 自動接播下一首 403 → §1.3 熱換 ✅,#7 guard 冇誤擋

```
02:38:35.00  playQueue([42,46]) → trackChanged idx=0 hymnId=42
02:38:35.05  hlsPreflight ok=0 status=404 ms=53 ctx=next hymnId=46   ← §1.3 fire(position≈0)
02:38:35.05  hlsFallback via=preflight ctx=next → remove+add 換 progressive
             (#7 guard:nativeIdx==curIdx+1,position≈0 vs duration=348.9 → 冇擋 ✅)
02:38:35.57  id=42 playing,nextTrackMs ms=627 origin=start          ← 當首歌零影響
02:38:55.53  seek 到 340.9(距尾 8 秒)→ 逼 native auto-advance
02:39:03.67  trackChanged idx=1 hymnId=46
02:39:07.60  playing duration=225.98,nextTrackMs ms=3941 origin=auto source=stream
             活躍 URL = http://localhost:3999/api/stream/46 (progressive,冇 .m3u8) ✅
```
零跳歌、零 `nativeSkipAttributed`、零 `PlaybackError`。

⚠️ 第一次跑呢個情境**空炮咗**:audioPrefetch 喺嗰 20 秒入面已經將 id=46 落載成本地檔,
`onPrefetchComplete` 再熱換多一次去 `file://`,最後係本地檔播 —— `source=local`,
證唔到 progressive 條路。要 `blockPrefetchIds` 擋走預載先量到真嘢。
(實務含義:真機好多時本地預載會贏,§1.3 呢條熱換嘅實際觸發率會低過 sim。)

### 收工

`simctl terminate/uninstall`、殺 log stream、殺 3999 副本、`simctl shutdown all`、
`pkill Simulator/idb_companion`、刪 `/tmp/claude-ios-cleanup.hold`。核實:
`booted:0 idb:0 sim:0 devtools:0`、`lsof -i :3999` 空、prod backend 3001 `/api/health` 200、
`git status --short` 對三個修復檔 + `app-version.json` 全空(冇 commit、冇部署、冇 OTA、冇 restart)。

---

## 4. 剩餘問題

1. 🟠 **#6 目標未達到**(§3c)。唔阻出街(同 before 行為一致),但唔好對 Eric 講「撳咗暫停就唔會自己播」。
2. 🟡 **`nextTrackMs` 量度偏差 —— 收貨數字唔可以淨睇 `origin=start`。**
   降級個案而家報 `origin=jsRecover`,而且個 `ms` 係由**熱換嗰刻**起計,唔係用戶撳嗰刻
   (實測 (a):用戶等咗 10.4 秒,`nextTrackMs` 報 7,572ms)。所以出街之後
   `origin=start` 嗰條中位會**系統性剔走最差嗰批**,睇落一定靚過 09-06 baseline。
   ➡️ **驗收一定要三個數一齊睇**:`origin=start` 中位 **+** `hlsFallback` 條數 **+** `origin=jsRecover` 條數同耗時。
   (呢個行為同其餘三條既有熱換分支一致,唔係新病;但 09-06 baseline 係「冇預檢」年代嘅數,兩邊定義唔同。)
3. 🟡 **`timeout` 分類真機未再現**(#2)。9 秒閘今輪冇撞過。影響已經由 #1 降到「beacon reason 欄唔準」。
4. 🟡 **`load()` 拋錯嗰條 fallback 真機未驗**(#5),仍然淨係 H-B 級證據。
5. 🟡 **全部數字都係本機 loopback**,冇 tunnel RTT。絕對值同 Eric 部機唔可比,只可比 A/B 相對值。
6. 🟡 **背景/鎖屏之下嘅預檢降級冇測**(同上輪)。
7. 🟡 **`hlsPreflight` beacon 唔受 `DIAG_ENABLED` 管**(上輪 #8),每首歌起播 +1、轉歌 +1,常開。量細,但要知。

---

## 5. 出街步驟同驗收

### 紅線次序:**restart backend 一定要排喺 OTA 之前**
(memory `project-hls-d-fixes-verified`:唔跟次序,新 App 送 `.m3u8` 落舊 `stream.js` 會出 400。)

### restart 之後 smoke 三條(全部打 prod,唔使開 App)

```bash
# 1) HLS playlist 正常路徑照樣 200 + 係 m3u8
curl -s -D- -o /dev/null https://api.odemusics.com/api/stream/34.m3u8 | grep -E 'HTTP/|mpegurl'
#    要見:200 + Content-Type: application/vnd.apple.mpegurl

# 2) progressive 路徑(降級落腳點)冇壞
curl -s -o /dev/null -r 0-1 -w '%{http_code}\n' https://api.odemusics.com/api/stream/34
#    要見:206

# 3) 403 快失敗:backend log 新格式 retried=false、ms 細
tail -200 /tmp/hymn_backend.log | grep '\[hls\]' | tail -5
#    每條要有 ms=<n>;任何 404-headfetch-failed 行要係 retried=false
#    (舊碼會係 retried=true,而且冇 ms= 欄 —— 見到舊格式即係 restart 冇生效)
```

### OTA 之後 Eric 真機最少一項檢查(有 before 數)

Eric 部機 deviceId `e1b6dc8a6948c3018036565007ad87d4`(hlsDeviceIds 第一個)。

| 指標 | **before(09-06,同一部機)** | after 要求 |
|---|---|---|
| `nextTrackMs origin=start source=stream` 中位 | **4,975 ms**(n=11) | 唔准明顯變差(>6,000ms 就要查) |
| `nativeSkipAttributed` | **3 次** | **應該跌** —— 呢個係最直接嗰條溫度計 |
| `hlsFallback` | 0(嗰陣未有呢個 beacon) | 新出現 = 預檢真係喺度做嘢;**每條都要 `status=4xx/5xx`**,見到 `reason=timeout`/`network` 即係 #1 漏咗 |
| `hlsPreflight` `ok=0` 但唔係 4xx/5xx | — | 有嘅話**唔應該**跟住有 `hlsFallback` |

重跑呢個 before 數(同一條 query,改日期):

```bash
cd backend/logs/client-log && python3 - <<'EOF'
import json,re,statistics,collections
DEV='e1b6dc8a6948c3018036565007ad87d4'; DAY='2026-09-06'   # ← 改做 OTA 之後嗰日
ms=[];c=collections.Counter();fb=[]
for l in open(f'client-log-{DAY}.jsonl',errors='replace'):
    try: r=json.loads(l)
    except: continue
    if r.get('deviceId')!=DEV: continue
    e=r.get('event'); d=r.get('detail') or ''; c[e]+=1
    if e=='nextTrackMs' and 'origin=start' in d and 'source=stream' in d:
        m=re.search(r'ms=(\d+)',d);  ms.append(int(m.group(1))) if m else None
    if e=='hlsFallback': fb.append(d)
ms.sort()
print('origin=start n=',len(ms),'median=',statistics.median(ms) if ms else '-')
print('nativeSkipAttributed=',c['nativeSkipAttributed'],'hlsFallback=',c['hlsFallback'],'hlsPreflight=',c['hlsPreflight'])
print('\n'.join(fb))
EOF
```
09-06 跑出嚟應該係 `n=11 median=4975` / `nativeSkipAttributed=3` —— 對得返即係 query 冇問題。

**⚠️ 讀數提醒(見 §4 第 2 點):`origin=start` 中位變靚唔可以單獨當贏。**
要同時睇「`hlsFallback` 有幾多條」同「嗰啲 `origin=jsRecover` 嘅 `ms`」,
否則等於將最差嗰批個案剔走之後先量中位。

---

## 6. 我今輪做唔到 / 冇覆蓋

1. Tunnel RTT 條件下嘅絕對值(同上輪)。
2. 真手指 tap —— 用 SIM-VERIFY-ONLY 劇本 driver 代替(call 同一批 context 函式:`playQueue`/`cmd_pause`),
   只存在於 APFS clone,repo working tree 一個字冇。
3. 背景/鎖屏。
4. Android 完全冇開 —— 今輪 diff 對 `Platform.OS`/`android` **零命中**,結構上零影響(上輪已有實測正控)。
5. #2 嘅真機 timeout、#5 嘅真機 `load()` 拋錯,兩條仍然係 harness 級。
