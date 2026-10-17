# NATIVE-STALL-ROOTFIX-REVIEW-OPUS5-20260830 — Phase A + Phase B 獨立驗收報告

**驗收人**:Opus5(獨立覆核,唔靠執行記錄自述)。**實作**:Sonnet5。**總負責**:Fable5。
**對應規劃**:`NATIVE-STALL-ROOTFIX-PLAN-20260830.md` §6/§7/§8。
**驗收方法**:自己讀兩個 Phase A commit 嘅逐行 diff、自己抽出 Phase B 內嵌 Swift 做結構化
diff、自己讀 patched Pods 產物、自己打 live probe 對 backend log、自己核 approve 紀錄同
working tree。**零 code 改動、零 backend restart、零 db/build/OTA 動作**(守 §8 紅線)。

**總判**:**Phase A ①收貨、Phase B ①收貨——兩者都可以進入 release step**(Phase B 即
build 16 bump+EAS build+submit,由 Fable5 按 §6 派工)。兩個 flagged 觀察:①判 by-design、
Phase B 冇令佢變差;②判接受。另有 4 條非阻塞保留/尾巴,列喺 §5。

---

## §1 Phase A 驗收(commits `9f151e5` + `195f1ff`)

### 1.1 零行為改動 —— ①收貨

逐行讀完兩個 commit 嘅完整 diff。改動只有三類:

1. **純新增 helper**:`sanitizeLogToken()`、`extractItagClen()`、`computeSentBytes()` —— 三個
   都係 pure function,全部包 `try/catch`,失敗一律返 `-`,冇任何一個會拋錯上去污染 request。
2. **三個 log call site 加 field**:400 分支、404 分支、`finishLog` closure。加嘅係
   `logLine({...})` 個 object literal 嘅新 key,`logLine` 本身冇改。
3. **兩個 request-scope const**:`const sock = res.socket`(純讀 property,零副作用)、
   `bytesWrittenStart`/`wd`/`uaShort`。

**proxy/response/status/header 邏輯一行都冇郁**:`res.write`/`res.pipe`/`fetch`/
`Content-Range`/`Content-Length`/status code 判斷/retry 邏輯,喺兩個 diff 入面完全冇出現過
(除咗 `sent:` 嗰個 value expression 由 `computeSentBytes(res, …)` 改做
`computeSentBytes(sock, …)`,仍然係 log field)。`extractItagClen(url)` 讀外層 `let url` 嘅
TDZ 分析我獨立覆核過:`finishLog` 所有 call site 都喺 `let url` 聲明之後,推論成立。

### 1.2 每個 commit 只含一個檔 —— ①收貨

`git show --stat` 實測:`9f151e5` = `backend/routes/stream.js` +72/−2(單檔);
`195f1ff` = 同一檔 +32/−10(單檔)。冇夾帶。

### 1.3 Live probe(我自己打,唔用執行記錄嘅數) —— ①收貨

四條輕量 probe(production live,合共 ~250KB,冇 restart、冇改任何嘢),`/tmp/hymn_backend.log`
實際輸出:

```
14:21:38.399Z id=6   … status=206 aborted=false range=bytes=0-1023 sent=1301   itag=140 clen=2962801 wd=1 ua=Opus5VerifyUA-LONGTA
14:21:38.637Z id=6   … status=206 aborted=false range=bytes=0-2047 sent=2325   itag=140 clen=2962801 wd=0 ua=Opus5VerifyUA-LONGTA
14:21:38.660Z id=xyz … status=400 aborted=false range=-           sent=0      itag=-   clen=-       wd=0 ua=Opus5VerifyUA
14:21:39.677Z id=6   … status=200 aborted=true  range=-           sent=262374 itag=140 clen=2962801 wd=0 ua=Opus5VerifyUA
```

逐項對 §7 要求:

| 要求 | 結果 |
|---|---|
| `Range: bytes=0-1023` + `?swr=99` → `range=` 原文、`wd=1` | ✅ `range=bytes=0-1023 wd=1` |
| `sent=` 真數 | ✅ `sent=1301`(1024 body + 277 headers);`sent=2325`(2048+277)——headers 開銷穩定,同 code comment 聲明嘅語義一致 |
| `itag=`/`clen=` 由 resolved URL parse | ✅ `itag=140 clen=2962801` |
| 唔帶 swr → `wd=0` | ✅ |
| 非法 id → 400 + 佔位 `-` 正確 | ✅ `range=- sent=0 itag=- clen=-`(400 路徑 log 先於任何 write,`sent=0` 語義啱) |
| 半途 abort → `aborted=true sent=<真數>` | ✅ `aborted=true sent=262374`——即 §5 H3 要嘅「送咗幾多 bytes 先俾 abort」真係量到 |
| `ua=` 頭 20 字元 | ✅ 我特登餵 41 字元 UA,出 `Opus5VerifyUA-LONGTA` 啱好 20 字元、正確截斷 |

**順帶覆核**:同一時段真實流量(老闆真機)亦出齊新 field,而且 `ua=AppleCoreMedia/1.0.0`
vs `ua=Odely/15_CFNetwork/3` 兩種 UA 清楚分到 AVFoundation 同 JS fetch ——§6 Phase A 第 5
點嘅目的達到。零 error、零 log 格式破壞。

### 1.4 舊 field 名同語義不變 —— ①收貨

`id`/`yt`/`mode`/`resolve_ms`/`ttfb_ms`/`total_ms`/`status`/`aborted`/`retried` 九個 field 喺
diff 入面一個都冇改名、冇改 value expression、順序不變;六個新 field 一律 append 喺尾。
舊 log 解析工具唔會爆。

### 1.5 Deploy 紀律 —— ①收貨

- `~/.hymn-deploy/approved.json` backend sha = `2380438` = 現時 `HEAD` ✅。
- 每次批准窗口只含自己嗰個 commit:`git log 833001e..9f151e5 -- backend/` = 得 `9f151e5`;
  `git log a08ab2f..195f1ff -- backend/` = 得 `195f1ff`。✅ 冇夾帶其他 session 嘅 backend 改動。
- **一個要 Fable5 知嘅事實(唔算違規)**:現時 live backend 係由**另一個 session**(歌詞
  殭屍修復嗰條線)喺 14:18Z 用 sha `2380438` restart 嘅——即係 §12 舊筆記講嘅「deploy gate
  係 per-sha 會夾帶」。我核過 `git log 195f1ff..HEAD -- backend/`:呢段區間**唯一** backend
  改動係 `1d0f943 chore(db)`(只碰 `backend/hymns.db` 二進制),**零 backend code 搭順風車**。
  所以 live backend 跑緊嘅 stream.js 就係 `195f1ff` 嗰版(我上面 probe 出 `sent=` 真數已經
  實證咗)。安全。
- `backend/` 冇 scratch script(只有其他 session 嘅 `data/*` + `hymns.db` 舊有髒檔案,gate 認)。

---

## §2 Phase B 驗收(commit `a08ab2f`)

`git show --stat` 顯示 1 insertion/1 deletion,係因為成個 Swift patch 塞喺 plugin 第 46 行
一條 20,702 字元嘅長 line。我將新舊兩版嗰條 line 抽出、還原換行後做結構化 diff(114 行),
再對 patched Pods 產物逐項核。

### 2.1 B1 `swReloadFresh()` —— ①收貨

實際產物 `ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift:271-287`:

- **只限 http/https**:`scheme == "http" || scheme == "https"` 硬閘,`.lowercased()` 做過。✅
- **append/遞增**:`items.removeAll { $0.name == "swr" }` 先剷舊嗰個至 append 新值 —— 連續
  rescue 唔會疊成 `?swr=1&swr=2`,counter 係 wrapper instance 級單調遞增,跨 track 都唯一。✅
- **file:// byte-identical 行原路**:guard 唔入 → 直接 `load()`。我核過舊路徑
  `reload(startFromCurrentTime: false)` 嘅實現(同檔 417-430 行):`startFromCurrentTime=false`
  → `time=nil` → `load()` → 冇 seek。**兩者行為完全等價**,所以 P3 就算冇行 e2e,file:// 局部
  嘅等價性喺 code 層面已經係確定性成立,唔係靠測試運氣。✅
- **rescue/escalate 用法正確**:`beginEpisode()` 用 `swReloadFresh()`(帶 `as? AVPlayerWrapper`
  cast fallback 返舊 `reload()`);`escalate()` 嘅 `q.next()` 跳去另一 track 嗰條路**冇改**
  (本來就係新 URL)。✅
- **rescue 語義完整保留**:`let pos = p.currentTime` → `swAbandonCurrentItem()` → reload →
  `if pos > 1 { p.seek(to: pos) }` → `p.wrapper.playWhenReady = true` → `reloadAt = Date()` →
  `beacon("reloaded", …, targetPos=)`。同 build 15 逐句一致,只換咗 reload 嗰一步。✅

### 2.2 B2 zombie kill —— ①收貨

產物 `AVPlayerWrapper.swift:237-258`:

- **舊 asset 喺 nil 之前 capture**:`let swZombieAsset = asset` 排喺 `asset = nil` **之前**。✅
- **background utility queue**:`DispatchQueue.global(qos: .utility).async { swZombieAsset.cancelLoading() }`。✅
- **冇任何 caller 路徑會 synchronous 行 cancelLoading(§12 #2 嘅 50 秒地雷)** —— 呢條我獨立
  追過全部 call site:全 file 得兩個 `cancelLoading()`,一個係新加嘅 background 嗰個,另一個
  係 upstream `clearCurrentItem()` 第 438 行(synchronous)。`clearCurrentItem()` 開頭係
  `guard let asset = asset else { return }`;而 `beginEpisode()` 同 `escalate()` **兩條 rescue
  路徑都一定先行 `swAbandonCurrentItem()` 將 `asset` 設 nil**,之後 `load()` 入面無論走
  `clearCurrentItem()` 定 `recreateAVPlayer()`(佢自己都係經 `clearCurrentItem()`)都即時早退。
  ✅ 地雷冇被踩返出嚟。

### 2.3 B3 beacon —— ①收貨

產物 `AudioPlayer.swift:678`:

```
phase=… pos=… state=… skips=… bg=… hid=\(hymnId(for: p)) sinceItemChange=\(Int(…)) \(extra)
```

- `hid=`/`sinceItemChange=` 插喺 `bg=` 之後、`extra` 之前。✅
- **現有 field 一個都冇改名**:`phase`/`pos`/`state`/`skips`/`bg` 原封不動;經 `extra` 入嘅
  `frozenSec=`/`fg=`(detected)、`targetPos=`(reloaded)亦冇郁。✅
- `hymnId(for:)` 純字串 parse(`range(of: "/api/stream/")` + `prefix { $0.isNumber }`),parse
  唔到一律 `-`,唔會 crash。`lastItemChangeAt` 只喺 `mainItemChanged()` 更新(main-only)。✅

### 2.4 紅線核對 —— ①收貨(全部不變)

我喺新舊兩版 Swift 逐個 grep 對數:

| 項目 | 舊(build 15) | 新(Phase B) |
|---|---|---|
| FG 門檻 | `stallActionSeconds` 10 / `reloadWaitSeconds` 5 | 同 ✅ |
| BG 門檻 | 20 / 8 | 同 ✅ |
| 3-strike | `maxConsecutiveSkips = 3` | 同 ✅ |
| latch | `breakerLatched` 全套 | 同 ✅ |
| timer | 2 秒 | 同 ✅ |
| intent guard | 自家 `userWantsPlayback`,唔信 `wrapper.playWhenReady` | 同 ✅ |
| main-only 紀律 | 全部入口 `DispatchQueue.main.async` | 同 ✅ |

diff 嘅 114 行入面**冇一行掂過上面任何一項**。B4(`recreateAVPlayer()`)按規劃默認冇做 ✅
——我同意唔做:B1+B2 已經直擊 §4.2 兩層結構性缺陷,B4 會 reset observers、係 SwiftAudioEx
未行過嘅路徑,風險/回報唔抵,而且 P1 已經實測攞到 `recovered`。

### 2.5 冪等閘 / 產物新鮮度 —— ①收貨(呢條係最易靜靜失守嘅位,我特別重點驗)

`unless content.include?('SWStallWatchdog')` 呢個閘會令「plugin 改咗但 Pods 冇重 patch」變成
靜默舊 build。我做咗**內容級**(唔係淨睇 mtime)驗證:

- 將 diff 嘅全部 **55 條新增 Swift 行**還原轉義後,逐條喺 patched Pods 兩個檔案入面搵:
  **55/55 全部命中,missing = 0**。
- 反向驗:build 15 嗰句同 URL reload(`p.wrapper.reload(startFromCurrentTime: false)` 緊接
  `NSLog`)喺產物入面**已經唔存在**(只剩 cast 失敗嘅 else fallback)。
- `swReloadFresh`/`swCurrentUrlString`/`lastItemChangeAt`/`hid=`/`sinceItemChange`/
  `swZombieAsset` 六個新符號喺產物全部齊。

**結論:Pods 產物真係新版,冇撞冪等閘、冇靜默舊 build。** 執行者「清 Pods + `prebuild
--clean` + `pod install`」嗰步係真做咗。

### 2.6 P1-P6 實據審查

| 場景 | 我嘅判斷 | 理由 |
|---|---|---|
| P1 stall→rescue | ①收貨 | timeline 完整:`detected … hid=27 sinceItemChange=10 frozenSec=10 fg=1` 對得正 FG 10s;`hid=4930` 個例 3.75 秒 `recovered`——**呢個係 B1 有效嘅決定性正面證據**(08-25 筆記寫明模擬器從來冇攞到過 `recovered`);proxy 側 reload 後 13ms 即見 `?swr=1`,server side 現形 |
| P2 zombie kill | ②有保留(唔使重做) | main thread 非阻塞證據**好硬**(reload begin→returned 2.5ms/3ms/5ms,遠低於 <100ms 門檻);「storm 即止」證據**間接但邏輯成立**:第一次 rescue 之前條 URL 係光板冇 `swr`,所以「reload 之後零條光板請求」確實等於「zombie 停咗發新請求」。保留位:第二次 rescue(`swr=1` 殭屍 vs `swr=2` 新)冇分開對數,而 grep 只查「有冇 `?swr=`」。唔影響主結論,唔值得為此重跑 |
| P3 file:// | ①收貨(唔使重做) | 執行者只做咗隔離邏輯測試,但我**自己**喺 code 層證明咗 file:// 路徑同舊 `reload(startFromCurrentTime:false)` 完全等價(見 §2.1),呢個比一次 e2e run 更硬 |
| P4 skip 回歸 | ①收貨 | 兩輪 ladder(hid=27→3334→第三首)節奏正確:detected→+6.0s skipped = FG 5s + 2s timer granularity ✅;`skips` 觀察見 §3① |
| P5 正常播放零 regression | ①收貨 | 3分24秒 + 後續多次自然 track 完結,`sw-watchdog` 全程零 beacon;B1/B2/B3 對健康路徑零影響 |
| P6 背景回歸 | ①收貨 | `bg=1 fg=0` 正確;`frozenSec=22` 對 BG 20s(唔係 FG 10s);`sinceItemChange=31` = 21 detect + 10 escalate,對 BG 8s + 2s granularity ✅;背景 reload 5ms 非阻塞;`beginBackgroundTask` 令全套流程喺背景行得完 |

**冇發現「話做咗但冇實據」嘅位。** 反而執行記錄主動申報咗兩個對自己不利嘅細節(P2 socket、
P4 skips),誠實度合格。§8.0 嗰個 Hermes debugger crash 嘅歸因(backtrace 零 frame 掂過
patched code、切 Release 即零 crash)我覆核過,判斷合理,同 Phase B 無關。

### 2.7 紀律核對 —— ①收貨

- `frontend/` working tree **完全乾淨**(`git status --porcelain frontend/` 零輸出)——即係
  §8.1 講嘅 `src/config.js` temp override 真係還原咗,plugin 檔 working tree == HEAD。
- `app.json`:`buildNumber` 仍然係 `"15"`(**冇自行 bump** ✅)、`runtimeVersion` `"5"` 冇郁 ✅。
- commit 只含 plugin 一個檔,`ios/` generated 嘢冇入 git ✅。
- 冇 `eas build`/`submit`/`update`、冇掂 backend/db/Cloudflare ✅。

---

## §3 兩個 flagged 觀察嘅裁決

### ① JS `play()` 經 `onUserPlay` 重置 native `consecutiveSkips`,前台 3-strike 難 trip

**裁決:by-design,唔係 bug,更加唔係 Phase B 引入;Phase B 冇令佢變差(輕微變好)。**
同意 Fable5 初判。

實據(我獨立翻返 `NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md`):

- **§1 背景**逐字寫咗呢個現象,而且係**當時已知並已診斷**嘅嘢:「JS層15s buffering nudge嘅
  `play()`經`onUserPlay`重置咗native `consecutiveSkips` → **native 3-strike前台結構上永遠
  唔會trip**」。
- **§3 第 3 點**係明文設計決定:「`maxConsecutiveSkips=3`、breaker latch、`onUserPlay`重置
  行為:**全部不變**(前台熔斷改由JS層負責,見§4.2;native breaker繼續守背景場景)」。
- 前台熔斷嘅接班人係 §4.2 嗰套 JS `errorSkipCountRef` + `nativeSkipAttributed`(threshold 3
  → Alert),即係 EXEC-B §5 V2 審嗰套。所以「前台 native breaker 唔 trip」係**預期結果**,
  唔係故障。

**Phase B 有冇令佢變差**:冇。我 diff 對過,`onUserPlay()`、`escalate()`、
`maxConsecutiveSkips`、latch **一行都冇改**。方向上反而係改善:B1 令 reload 真係救得返
(P1 攞到 `recovered`),skip 次數會少咗,前台根本行唔到需要 breaker 嗰步。

**尾巴(非阻塞)**:P4 嗰兩次連續 skip,JS 側 `errorSkipCountRef` 有冇如設計咁經
`nativeSkipAttributed` 加到數(2 次),執行記錄冇截到 JS console 實據。呢個係 build 15 已
驗收過嘅範圍,唔屬 Phase B,但下次真機/模擬器見到連環 skip 時順手截一次 JS log 就可以把
呢條長期疑問封死。

### ② zombie TCP socket 唔即刻 close(URLSession connection pool 行為)

**裁決:接受,唔算 regression,唔使跟進。**

理由三條:

1. **同病徵定義對得上**。原本個病係「棄置咗嘅 asset 繼續喺 mediaserverd 度**發新 HTTP Range
   請求** 7~43 秒」——係**請求風暴**,唔係「有條 socket 開住」。P2 已實證新請求歸零,即係
   病徵消失。一條 idle keep-alive socket 唔耗頻寬、唔碰 backend handler(我 Phase A probe
   期間 log 亦見唔到任何無主請求)。
2. **技術上冇得再控**。`cancelLoading()` 係 Apple 文檔化嘅正解;socket 幾時真係俾 OS 回收
   係 `URLSession` connection pool 嘅內部行為,唔喺 AVFoundation/Swift API surface 之內。要
   再進一步就要改 `AVURLAsset` 嘅 resource loader,係 Phase C 級數嘅侵入性改動,唔抵。
3. **成本上限得閒**。backend 對 idle 連線有自己嘅 keep-alive timeout,最壞情況係多咗幾條
   短命 idle socket,對 Node 零壓力。

---

## §4 總判

| | 判決 | 可唔可以進 release step |
|---|---|---|
| **Phase A** | **①收貨** | ✅ 已經 live(`195f1ff` 已 restart 並經我 probe 實證),功能完整、零行為改動、deploy 紀律乾淨。**唔使再做嘢** |
| **Phase B** | **①收貨** | ✅ **可以入 release step**:bump `app.json` ios `buildNumber` 15→16(或依 EAS autoIncrement 自動行,**唔准手動改**——見 MEMORY 舊教訓)、EAS build、`eas submit`(要 `zsh -ilc` 包住攞 `EXPO_TOKEN`)。按規劃 §9 第 3 點建議:build 16 淨裝 Phase B,方便歸因 |

最終驗收指標仍然係規劃書講嘅:build 16 上 TestFlight 之後,下次真機自然發病,用 Phase A 嘅
`wd=1`/`range=`/`sent=` + B3 嘅 `hid=`/`sinceItemChange=` 實證「pos=0 storm 俾 fresh-URL
rescue 救返」。呢個唔阻住 release。

---

## §5 保留 / 尾巴(全部非阻塞,交 Fable5 收檔)

1. **`sent=` 係「server 寫入 socket 嘅 bytes」上限值,唔等於 client 真收到嘅 bytes**。我
   probe 實測:1 秒斬全檔嗰條 `sent=262374`,但 curl 只 `size_download=245760`——差 ~16.6KB
   係 kernel/socket buffer 入面已寫未收嘅嘢。完整送完嗰啲差值穩定得 277 bytes(純 headers),
   所以**只有 abort 個案會高估**。判 H3(「每條請求 sent bytes 極細」)時要記住呢個係
   **上限**:見到細數 = 真係送得少(H3 成立),見到大數要扣返 buffer 水份。建議 Fable5 喺
   規劃書 §5 H3 旁邊補一句註,唔使改 code。
2. **`range=` 冇長度上限**:`sanitizeLogToken(req.headers.range)` 冇傳 `maxLen`(`ua=` 有傳
   20)。惡意/古怪 client 塞條超長 Range header 就會發大 log line。實際風險極低(呢個 route
   走 tunnel + 自家 app),純 nit,如果日後順手改就加個 `, 64`。
3. **`clearCurrentItem()` 第 438 行嘅 synchronous `cancelLoading()` 仍然企喺度**(pre-existing,
   Phase B 冇引入亦冇加劇)。rescue 兩條路都有 `asset = nil` 早退護欄,但**唔經 watchdog 嘅
   路徑**(例如用戶自己撳 next 跳走一首卡死緊嘅歌)理論上仍然會 synchronous 撞到佢。實戰上
   「跳歌 100% 甩身」證明冇發作,列返出嚟做長期記錄,唔建議喺 Phase B 動佢。
4. **V1 假說(main thread congestion 延遲 `onItemChanged`)未實錘**。我同意執行者判斷:唔使
   而家用臨時 NSLog 逼,B3 個 `sinceItemChange=` 本身就係長期儀器,下次真機發病自己會答。
   V2「冇 double count」嘅結論我覆核過推理鏈(三個計數入口各自喺 skip 前 set `transitionT0Ref`;
   `retry()` 唔掂 `currentIndex` 所以唔會出 stray trackChanged),成立。
