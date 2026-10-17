# NATIVE-STALL-ROOTFIX-PLAN-20260830 — 前台0秒卡死(load storm)根因診斷+根治方案

**狀態**:診斷完成,方案等老闆拍板(§9)。未批唔准開工。
**總負責**:Fable5;執行:Sonnet5;獨立驗收:Opus5。
**前置閱讀**:`NATIVE-STALL-WATCHDOG-PLAN-20260825.md`(§12)、`NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md`。
**源起**:2026-08-30 07:49 老闆真機(build 15)「深深愛你」(id=5)卡0.0秒;build 15前台watchdog照設計運作(10s banner、~15s跳歌),但reload救唔返,要跳歌先甩身。老闆指示:追底層根因。

---

## §0 TL;DR

1. **「SwiftAudioEx靜靜熄playWhenReady」同「0秒卡死」係兩種唔同嘅病**,今次(同08-29前台三連)係後者,rogue playWhenReady根本冇參與。
2. rogue playWhenReady機制已100%解通(§3):upstream把「stall跌rate=0」誤認做「藍牙拔線類外部pause」,只喺 `0 < currentTime < duration` 先觸發——**pos=0結構上唔會中呢招**。
3. 0秒卡死嘅真身係 **AVFoundation load storm**(§4):mediaserverd每~1.1秒開一條Range請求、收~0.6-1.2秒數據就abort、永不開聲。**backend完全脫罪**——08-29嗰單好多請求係warm buffer記憶體命中(ttfb 1-3ms)都照樣風暴。
4. **點解reload+強制playWhenReady=true冇效**(§4.2):(a)playWhenReady嗰下根本冇熄,重推係no-op;(b)reload係**同一條URL**,而棄置咗嘅zombie asset實證仲會繼續風暴同一條URL 7~43秒——新load同zombie喺mediaserverd層面撞正同一個resource state,等於跳返落同一個火坑。兩單事故加埋:pos=0 reload成功率 **0/5**;mid-track reload成功率1/1(08-29 09:58 pos=211.5,5秒recovered)。跳歌(唔同URL)100%甩身。
5. 方案三段(§6):**Phase A** backend觀測(range/sent/itag,零行為改動,即可出)→ **Phase B** native rescue v2(build 16:換新URL identity重載+background thread勒死zombie+beacon補hymnId)→ **Phase C** cause-level修改(押後,等A/B數據先拍板)。

---

## §1 事故實錄(兩單對齊)

### 1.1 2026-08-30 07:49(build 15,前台,fresh session頭幾首)

client-log + backend `[stream]`(`/tmp/hymn_backend.log`)拼圖:

```
07:49:34  prefetchFail aborted-for-stream(JS讓路俾串流)
07:49:35-40.9  id=1:4條206,ttfb 0.2-0.9s,冇起播 → 07:49:40 track change(來源未明,見§7 V2)
07:49:40.6-59.7  id=5(深深愛你):~17條206,節奏~1.1s一條,ttfb穩定0.62s,
                 幾乎全部 aborted=true —— 典型load storm
07:49:46.8  nativeStall detected frozenSec=12 pos=0.0 state=buffering fg=1(FG新節奏work)
07:49:46.8  reloaded targetPos=0.0 —— 冇用,storm照舊
07:49:52.2  skipped skips=1 → id=6 5.5秒起播正常
07:49:52-59.7  id=5嘅請求仲繼續咗7秒 —— zombie asset實證
```

關鍵:成場老闆網絡正常(id=6即刻播到、後面id=7/27 local秒播)、backend全程快。

### 1.2 2026-08-29 09:51(build 14,前台三連,同一隻病)

- id=36/38/39連續三個cycle detected(frozenSec=25)→reloaded→skipped,pos全部0.0。
- **決定性證據**:09:51:14起id=36/38嘅請求好多係 `ttfb_ms=1-3` = backend warm buffer**記憶體命中**——數據1ms到手,AVFoundation照樣唔開聲、照樣~1-2s一條咁abort。Server side完全排除。
- zombie:id=36啲請求由09:51:03一路去到09:51:46(43秒),明顯跨過咗佢被skip嘅時刻。
- 對照組:同日09:58 **背景mid-track stall(pos=211.5,state=paused,rogue-off指紋)→reload+seek+重推playWhenReady→5秒recovered**。證明rescue機制本身冇壞——佢醫到mid-track病,醫唔到pos=0病。
- 另一指紋:09:51:03 `wallClockDrift driftMs=17739` —— session啱開頭JS/process有~18秒嚴重starvation(同「head-of-session先發病」吻合,見§5)。

### 1.3 歷史對照(「係咪呢啲檔永遠死」——唔係)

id=38喺08-23、id=39喺08-26、id=1喺08-17/08-24都試過stream成功;但id=1兩次成功都要15.8s/36.2s先起播(origin=start第一首)——似「風暴一輪先鎖到」嘅半病態。**病發集中喺fresh session嘅頭1-3首stream track**,同一批id第日又冇事。

---

## §2 病種正式分家

| | A. mid-track rogue pause(D2家族) | B. pos=0 load storm(今次) |
|---|---|---|
| 指紋 | pos>0,state=paused,playWhenReady被熄 | pos=0.0,state=buffering,playWhenReady一直係true |
| 機制 | §3,已全解 | §4-§5,AVFoundation內部,假說三個 |
| watchdog reload | **有效**(1/1,5秒recovered) | **無效**(0/5) |
| 現有止血 | watchdog intent guard+重推,已收爐 | 只有「跳歌」呢招work |
| 今次要做 | 冇嘢做 | 本規劃全部 |

---

## §3 「SwiftAudioEx靜靜熄playWhenReady」完整解答(老闆問題一)

位置:`AVPlayerWrapper.swift` 452-468(`player(didChangeTimeControlStatus:)` 嘅 `.paused` 分支):

```swift
case .paused:
    ...
    } else if (state != .failed && state != .stopped) {
        // Playback may have become paused externally for example due to a bluetooth device disconnecting:
        if (self.playWhenReady) {
            if (self.currentTime > 0 && self.currentTime < self.duration) {
                self.playWhenReady = false;      // ← rogue off
            }
        }
    ...
```

完整因果鏈:

1. 我哋app-wide set咗 `automaticallyWaitsToMinimizeStalling=false`(withSwiftAudioExStallFix,醫VPN jitter嘅舊patch,有充分理由,唔郁)。
2. 呢個mode下buffer食乾嗰刻,AVPlayer自己跌 `rate=0` → `timeControlStatus`變`.paused`(§12 #4實錘:mid-stream stall嘅state係paused唔係buffering)。
3. SwiftAudioEx呢段handler**分唔開**「藍牙拔線/外部pause」同「buffer餓死」——兩者都係rate跌0。佢設計本意係:外部裝置拔線,iOS pause咗你,app UI應該同步顯示paused,所以熄埋playWhenReady。
4. 副作用:一個純粹網絡blip令AVPlayer跌rate,SwiftAudioEx就當你「唔想播」,intent俾佢改寫——JS層見到嘅就係「playWhenReady無故變false」,即成個八月「鎖屏靜咗/widget消失」family。

**點解得mid-track中招**:條件 `currentTime > 0 && currentTime < duration`。pos=0(起播卡死)同duration攞唔到(indefinite→computed 0)兩種情況都入唔到分支。所以今次「深深愛你」卡0秒**唔係**rogue off——beacon亦實證state=buffering、watchdog intent一直係「想播」。

呢隻病嘅藥已經齊:watchdog唔信wrapper.playWhenReady(自家intent)、rescue重推、JS D2 anti-fight。08-29 09:58實戰1/1醫返。**呢部分唔使再做嘢。**

---

## §4 「reload+強制playWhenReady=true點解冇效」完整解答(老闆問題二)

### 4.1 重推playWhenReady係no-op

pos=0 storm入面playWhenReady從來冇熄(§3)。`p.wrapper.playWhenReady = true`寫落去嗰刻oldValue==true,didSet淨係重apply一次rate,乜都改變唔到。呢招係為A病種而設,啱藥;對B病種無藥效亦無害。

### 4.2 reload真正嘅結構性缺陷:同一條URL+zombie同場

現行rescue(`beginEpisode`):`swAbandonCurrentItem()`(斷參照,**特登唔**`cancelLoading`——嗰個喺卡死asset上會sync堵main ~50秒,§12 #2/#3)→ `wrapper.reload()` → `load()`用返 `self.url` 起一個**同URL**嘅新AVURLAsset。

問題兩層:

1. **zombie asset冇死**:斷參照唔等於停loading。實證:08-30 skip咗之後id=5照請求7秒;08-29 id=36請求橫跨43秒。棄置咗嘅asset繼續喺mediaserverd度風暴**同一條URL**。
2. **新load撞正同一個resource state**:AVFoundation嘅media loading係喺mediaserverd(獨立系統process)做,按resource(URL)維護state。新asset load同一條URL,同zombie嘅in-flight loading喺同一個火坑內——舊嗰個wedge咗,新嗰個大概率繼承或者爭用。而**跳歌之所以100%得,唯一唔同就係URL唔同**。

呢個解釋同數據完全吻合:pos=0(zombie活躍緊+同URL)0/5;mid-track(舊asset早已停晒手,或者純粹blip已過)1/1。

---

## §5 底層AVFoundation wedge:三個假說(誠實申報:未實錘邊個)

storm嘅「~1.1s一條、收0.6-1.2s就abort、永不開聲」到底係mediaserverd入面乜嘢卡住,現有log見唔到佢每條請求**攞緊邊個range、真係收咗幾多bytes**。三個候選:

- **H1 起播rate thrash**(暫列首位):`automaticallyWaits=false` + load完即刻`rate=1`(`applyAVPlayerRate`喺replaceCurrentItem後即行)。buffer空白之下強推rate,iOS已知會反覆重排loading計劃(同stallFix註釋講嗰個estimator病係同一族)。同「head-of-session先發病」(process starvation、audio session啱啱activate、CFNetwork凍水)吻合;都解釋到「同一首歌第日冇事」。
- **H2 嗰次resolve出嘅bytes有問題**:同一hymn唔同日子resolve可以出唔同itag/URL。「檔第日播到」唔完全排除「嗰日嗰個variant啲bytes AVFoundation唔受」(fMP4 zeroFix邊界/Content-Range怪response)。特徵會係「storm期間반複要同一個offset」。
- **H3 電話端網絡路徑transient**:未完全排除,但08-29 warm-hit 1ms照storm+請求節奏規律(斷網唔會係整齊1.1s一條)令佢排最尾。特徵會係「每條請求sent bytes極少」。
  ⚠️(Opus5驗收§5補註)`sent=`係「server寫入socket」嘅**上限值**,唔等於client真收到——abort個案實測有~16KB kernel buffer水份(送完嘅個案差值穩定=headers)。判H3:見細數=真係送得少(H3成立);見大數要扣返呢個水份先落結論。

**三個假說由Phase A嘅數據直接分辨**:H1=range有序前進但反覆棄掉;H2=同一offset打圈;H3=sent極細。

---

## §6 方案

### Phase A — backend觀測補完(零行為改動,唔使等build)

改`backend/routes/stream.js`嘅`logLine`/`finishLog`,每條[stream]加:

1. `range=`(client嘅Range header原文,冇就`-`);
2. `sent=`(真寫咗幾多body bytes;實作建議用`res.socket.bytesWritten`起止差值或者累加寫入chunk長度,揀邊種要喺code註明語義);
3. `itag=`/`clen=`(由resolve出嚟嗰條googlevideo URL嘅query param parse,答H2「嗰日嗰個variant」);
4. `wd=1`(request query帶`swr`時標記——Phase B嘅rescue請求喺server side即刻認得出);
5. `ua=`頭20字元(分AVFoundation/JS fetch)。

純log,零行為改動;下次真機再發病,唔使加任何嘢就攞到判假說嘅決定性數據。**要backend restart**(過deploy gate;老闆QA進行中唔准deploy嘅老規矩照守)。

### Phase B — native rescue v2(build 16,`plugins/withSwiftAudioExStallWatchdog.js`)

行動階梯結構、所有門檻數字(FG 10/5、BG 20/8、3-strike、latch)**一律不變**,只換「reload」嗰下嘅內容:

- **B1 換新URL identity重載**:AVPlayerWrapper加patch method `swReloadFresh()`——喺`self.url`後面append/遞增 `swr=<n>` query param(**只限http/https scheme;file://一律唔郁,行返原路**),然後行原有load()。mediaserverd當佢係全新resource,唔會再同zombie/毒咗嘅state攪埋。backend route係`/:hymnId`,query param天然被忽略,零backend改動(Phase A順手令佢喺log現形)。
- **B2 勒死zombie**:`swAbandonCurrentItem()`斷參照**之前**capture住舊asset,跟手`DispatchQueue.global(qos: .utility).async { oldAsset.cancelLoading() }`——50秒sync barrier(§12 #2)由main thread嘅死穴變成一條廢棄background thread嘅自閉,main零影響,而zombie嘅網絡風暴即止。舊load completion嘅`pendingAsset != self.asset`護欄照舊生效。
- **B3 beacon補完**:`nativeStall`各phase加 `hid=<hymnId>`(由wrapper.url parse `/api/stream/(\d+)`,parse唔到出`-`)同 `sinceItemChange=<秒>`——今次診斷要靠backend log反推邊首歌、仲撞到frozenSec同track change對唔上數嘅謎(§7 V1),兩個窿一次封。
- **B4(可選,Opus5評完先定)**:pos<1嘅rescue喺B1之前加`recreateAVPlayer()`(fresh AVPlayer instance,demuxer state歸零)。asset經B2已nil,`clearCurrentItem`早退,唔會踩50秒地雷。風險:recreate會reset observers,SwiftAudioEx呢條路徑喺failed state以外冇行過——**默認唔做**,除非Opus5評估後認為值博。

JS**零改動**、Android零改動、runtimeVersion不變、無OTA成分——成個Phase B冇§2「一次過出」嘅gate問題。

### Phase C — cause-level(押後,唔喺今次範圍)

如果Phase A/B數據實錘H1:考慮「起播rate gating」——pos=0起播時等`playbackLikelyToKeepUp`先applyRate(等效於只喺起播階段借用automaticWaits語義)。呢個掂核心播放路徑,影響面大,**要有實錘先另出規劃拍板**,唔准夾喺Phase B度做。

---

## §7 驗收(Opus5)

**Phase A**:對住模擬器/curl打幾種range,肉眼核對新field語義正確;正常stream/warm hit/abort路徑各驗一條;確認零行為改動(diff只碰log)。

**Phase B**(模擬器,重用08-25 W套件手法製造load stall):
- P1 stall→rescue:beacon見`reloaded`帶`hid=`+新`swr=`請求落backend log(`wd=1`);position保持(mid-track flavor都要驗,seek照舊)。
- P2 zombie kill:製造卡死load→rescue後,舊URL請求**即止**(對比而家拖7-43秒);main thread零卡頓(NSLog時間戳核對rescue全程<100ms)。
- P3 file://局部:本地檔rescue唔append swr、行為同build 15全等。
- P4 skip路徑回歸:reload救唔返照跳歌,3-strike/latch/breaker全部同build 15節奏一致。
- P5 正常播放零regression、零beacon噪音(W5同款)。
- P6 背景場景回歸(BG 20/8節奏不變,09:58嗰種mid-track recovered路徑照work)。

**真機**:build 16 TestFlight後,下次自然發病靠Phase A log+B3 beacon實證「pos=0 storm俾fresh-URL rescue救返」——呢個先係最終驗收指標。

**順手verification items(Sonnet5做,唔准擴大改動)**:
- V1:08-30 detected `frozenSec=12`但track change喺~6秒前——追一次`onItemChanged`喺QueuedAudioPlayer next/jump路徑嘅覆蓋(净診斷,發現有窿報返嚟,B3嘅`sinceItemChange`本身就係長期儀器)。
- V2:07:49:40嗰下track change冇任何beacon/PlaybackError又俾JS當咗native skip計數(errorSkipCount 1→2)——audit `transitionT0Ref`覆蓋(用戶撳next/Remote next各路徑),評估有冇「double count令三首唔夠就彈Alert」風險。净診斷+報告,唔准就咁改。

---

## §8 紅線(逐條硬性,同FG-SPEEDUP §7一致)

- 🔴唔准`eas update`/OTA publish;唔准掂Cloudflare API/DNS/cert.pem/token。
- 🔴共用worktree:唔准`git add -A`/`git clean`;commit必須`git commit -- <pathspec>`。
- 🔴scratch script唔准放backend/;放scratchpad。
- 🔴`backend/hymns.db`唔准掂。Phase A要restart backend——只准經`ops/deploy/backend-restart.sh`行gate,老闆QA進行中唔准deploy。
- 🔴唔准用AskUserQuestion;有問題寫低留俾Fable5。
- 🔴背景watchdog數字(20/8/3/latch)、FG數字(10/5)、cancelLoading main-thread禁令、`wrapper.playWhenReady`唔可信——全部唔准倒退。
- 🔴Sonnet5唔准自行bump buildNumber/build/submit;實作+模擬器驗證完停低等Opus5。

## §9 等拍板(老闆)

1. **Phase A**(backend log五個field+restart)——批唔批?批嘅話幾時restart(建議:QA完即出,半日內完成)。
2. **Phase B**(build 16:B1 fresh-URL rescue+B2 zombie kill+B3 beacon補完;B4默認唔做)——批唔批?
3. build 16係咪淨係裝Phase B,定等埋其他native積壓(例:repeat掣兩條尾巴)一齊?(建議:淨裝Phase B,快進快出,方便歸因)
4. Phase C押後、有實錘另出規劃——OK?

**時間表(拍板後)**:Phase A半日;Phase B實作+模擬器驗收~1日,build 16+TestFlight 1-2日。
