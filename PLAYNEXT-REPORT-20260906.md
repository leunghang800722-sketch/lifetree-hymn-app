# Play Next（下一首播放）執行報告 2026-09-06

執行單：PLAYNEXT-EXEC-20260906.md。基準 HEAD `8c2894b`（執行期間另一 session
已推 `6e71cc1` SheetShell 補丁，共用 worktree——本單只 pathspec commit 自己
改過嘅檔，冇夾帶）。

## 0. 紅線核對

- 起播/stall/watchdog/nudge/rescue：`git diff -- frontend/hymn-app/App.js`
  逐行核，`handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog`
  呢組關鍵字喺 diff 入面淨係命中一行——係我加嘅**註解**（"唔掂起播/watchdog
  任何邏輯"呢句本身),唔係任何函式本體改動。
- `playQueue()` 語義：一行未動；`insertNext()` 係獨立新函式,唔 call
  `playQueue`。
- queueRef/setQueue/native queue 三同步、先 ref 後 state：見 §1.1。
- 冇擴大本地音訊副本、冇加預載:`insertNext` 冇 call 任何 `prefetchAudio`/
  `warmIds`,淨係 native `add`/`remove` 一次。
- SheetShell.js:未掂(`git status` 對唔到呢個檔)。

## 1. 實作

### 1.1 `insertNext(hymn)`

放喺 `playSingle` 之後(App.js)。陣列/index 純運算部分抽咗去
**`frontend/hymn-app/src/insertNextCore.js`**(CommonJS,`computeInsertNext()`
+ `reconcileFromNativeQueue()`),App.js 用 `require()` 讀同一份源碼(唔係
抄副本)——咁樣先做到 H1 用純 Node 直接測而唔使 mock React/TrackPlayer。

流程(對返執行單 12 點):
1. `cur.length===0 || trackStateRef.current===TPState.None` → `playSingle(hymn)`。
2. `curIdx = currentQueueIndexRef.current ?? 0`。
3. 播緊嗰首(`cur[curIdx].id === hymn.id`)→ toast「播緊呢首」,return。
4. 去重:`cur` 喺 `curIdx` 之後搵同 id,有就 `TrackPlayer.remove(dupIdx)` +
   JS 陣列刪走,記 `removedIdx`。
5. `insertAt = curIdx+1`;`newQ` 砌好;`TrackPlayer.add(toTrack(hymn), insertAt)`。
6. `autoRadioFrom`/`insertBoundary` 用 `adjustBoundary()`(先減去重刪走嘅
   -1、再加插入 +1)重算,**先 ref 後 state**(`autoRadioFromRef.current = ...`
   先於 `setAutoRadioFrom(...)`,`insertBoundaryRef` 同理)。
7. `queueRef.current = newQ; setQueue(newQ)`;`currentQueueIndexRef` 唔郁。
8. `showNotice('已加到下一首播放')`。
9. try/catch 包晒 native 呼叫;失敗就 `TrackPlayer.getQueue()` 讀返 native
   真相,用 `reconcileFromNativeQueue(cur, hymn, nativeQueue)` 重砌 JS 陣列
   (絕對唔留低一個「JS 話已插入,native 冧咗」嘅錯亂中間態)。
10. **native swap 索引安全**——見 §1.1-10 獨立一節,結論喺嗰度。
11. Repeat/shuffle 行為——見下面「11. Repeat/shuffle」一節。
12. Beacon:`sendClientLog('playNext', { hymnId, detail: 'moved=<0|1> at=<insertAt> qlen=<n>' })`,
    直接用 `src/clientLog.js`,唔經 `logDiag()` 嘅 `DIAG_ENABLED` 閘(明文
    常開,同執行單一致)。

### 1.1-10 native swap 索引安全(結論)

執行單要求核 App.js 三處「native 換 URL」(`TrackPlayer.add(freshTrack, idx)`)
會唔會俾 `insertNext()` 插入之後嘅索引位移整錯。逐個查:

| 位置 | 用嘅 idx 嚟源 | 會唔會俾 insertNext 影響 | 結論 |
|---|---|---|---|
| `onPrefetchComplete` 熱換本地檔(原 ~663 行) | `idx` = 喺 async callback 開頭 `queueRef.current.findIndex(...)` 攞嘅**快照**,`idx===curIdx+1` 分支中間仲有一個 `await TrackPlayer.getProgress()` | **會**——`insertAt` 啱啱好都係 `curIdx+1`,如果 `insertNext()` 喺呢個 await 窗口插咗歌,快照 `idx` 已經唔係目標歌嘅位置 | 🔴 已加 guard:remove/add 郁手前加多一步 `TrackPlayer.getQueue()`,用 track id(`songId`)喺**native 真實 queue** 重新搵位(`nativeIdx`),搵唔到就直接 return(寧願唔換好過換錯)。已落地(diff 見 App.js `onPrefetchComplete`)。 |
| `PlaybackError` file:// 熱換(原 ~1242 行) | `curIdx` = `await TrackPlayer.getActiveTrackIndex()`,即「而家播緊嗰首」嘅 native 真實 index | **唔會**——insertNext 插入位恆為 `curIdx+1`,結構上唔會郁到「播緊嗰首」自己個 index | 安全,冇改 |
| `PlaybackError` HLS 降級熱換(原 ~1285 行) | 同上,`curIdx` 嚟源一樣 | 同上 | 安全,冇改 |
| `handleStuckTrackEnd` HLS 降級熱換(原 ~1866 行) | `idx0 = currentQueueIndexRef.current` 喺函式頭部**同步**攞(冇 await 之前),之後雖然有幾個 await(`getProgress`/`getActiveTrack`/`TrackPlayer.load` 失敗先落嚟呢句) | **唔會**——`idx0` 代表「播緊嗰首」,insertNext 由頭到尾都唔會令呢個 index 郁(插入位置永遠喺佢後面) | 安全,冇改 |

**結論:四處入面淨係第一處(`onPrefetchComplete`)真係有快照 racing 風險
(因為佢操作嘅係「將要播」嘅 index,同 insertNext 嘅插入點撞正),已加
`TrackPlayer.getQueue()` + id 對位嘅 guard。其餘三處操作嘅都係「現正播放
嗰首」自己嘅 index,insertNext 結構上唔會令呢個 index 移位,唔使加 guard。**

### 11. Repeat/shuffle

- **repeat-one**:`insertNext()` 完全冇讀 `repeatModeRef`,插入行為同 repeat
  mode 無關——用戶主動插一首,照插,唔做特殊判斷。符合執行單「照插(用戶
  主動)」。
- **shuffle**:`toggleShuffle()`(App.js,未改)會將 `queueRef.current`
  整個攞嚟做「現正播放行 + 洗牌返部分」,`insertNext()` 插入嘅歌會被當做
  普通一個 queue entry,一齊俾洗返(冇特殊保護,亦冇要求要有)。⚠️
  發現一個未修嘅細節寫喺呢度(唔喺 §0 紅線範圍,純粹記錄行為):
  `toggleShuffle`/`playQueue` 有更新 `originalQueueRef.current`,但
  `insertNext()` **冇**同步更新佢——如果用戶插一首歌之後開返 shuffle 再閂
  返(熄 shuffle 用 `originalQueueRef` 還原次序),個插入嘅歌會唔喺
  `originalQueueRef` 入面,熄 shuffle 之後可能唔見咗/次序跟返插入前。呢個
  係「唔要求完美,寫低行為」範圍內嘅已知限制,冇修(修佢要掂
  `toggleShuffle`,執行單冇要求)。

### 1.2 AddToPlaylistSheet(只 add mode)

列表頂加一行(`ListHeaderComponent`),`OdeIcon name="next"`(▶│ skip-forward
形狀,冇新畫 icon)+ 文字「下一首播放」(冇用 emoji 做 icon,跟
`OdeIcon.js` 頭註解「唔准 emoji 當 icon」政策;「⏭」淨係執行單自己描述
功能用嘅講法)。顯示條件:`mode==='add' && queue.length>0 && currentHymn`。
撳 → `insertNext(target)` → `close()`。

**架構發現(執行單冇預見,已解決)**:AddToPlaylistProvider 喺 App.js 嘅
provider tree 係 `<AddToPlaylistProvider><PlayerProvider>{children}
</PlayerProvider></AddToPlaylistProvider>`——AddToPlaylistProvider 喺
**外面**(PlayerProvider 嘅祖先)。呢個次序唔可以掉轉:`FullScreenPlayerOverlay`
(PlayerProvider 自己 `return` 出嚟嘅,唔喺 `{children}` 之內)本身已經用緊
`useAddToPlaylist()`(App.js「清單」pill),靠現有次序先攞到。曾經試過對調
兩個 provider 次序令 AddToPlaylistSheet 攞到 `usePlayer()`,但發現會令
`FullScreenPlayerOverlay` 嗰個現有用法斷咗(regression)——已 revert 返做
返原本次序。

改用 **`src/playerBridge.js`**:一個 module-level `setPlayerBridge()`/
`getPlayerBridge()`,PlayerProvider 每次 render 都同步寫一次(同
`queueRef.current = queue` 嗰種 render-body 直寫 ref 慣例一致,唔經
`useEffect`),AddToPlaylistSheet.js 唔靠 context ancestry,直接
`getPlayerBridge()` 讀「呢一刻」嘅 `insertNext`/`queue`/`currentHymn`。
⚠️ 已知限制:`canPlayNext` 淨係喺 AddToPlaylistProvider 自己嗰次 render
先重新評估(即係開 sheet 嗰刻),如果 sheet 開住嗰陣 queue 由「有」變
「冇」,行嘅顯示唔會即時消失——影響極細(用戶好少會咁做),寫低唔修。

### 1.3 Queue UI(insertBoundary 畫線)

冇改任何 code——`insertBoundary` 嘅調整已經喺 `insertNext()` 嘅
`adjustBoundary()` 做咗(§1.1 步驟 6),播放清單 sheet 畫線嗰段
(`index === player.insertBoundary`)本身冇改,直接食新值。**已喺真機
核實**:H3 截圖 `13-queue-open.png` 見到 Play Next 插入之後,「自動播放：
全部」分隔線正確咁移咗去插入位之後一格(原本 `autoRadioFrom=1` 因為插入
一首變咗 `2`,分隔線正確跟住畫喺新位置)。冇撞到「Play Next 場景根本冇
boundary」個 case(呢次測試起播用嘅係有 autoRadioFrom 嘅正常路徑),寫低
呢個 case 未喺真機測到,但邏輯上(`insertBoundary` 為 null 時
`adjustBoundary` 直接 `return b`,即 `null`)`insertNext` 唔會無中生有整
一條線出嚟,同執行單「可接受,唔畫線」一致。

## 2. 驗證證據

### H1 — harness(純函式,零 React/TrackPlayer 依賴)

檔案:`frontend/hymn-app/tools/insertnext-harness/run.js`,直接
`require('../../src/insertNextCore.js')`(而家真係俾 App.js 用緊嘅同一份
源碼)。

```
$ node tools/insertnext-harness/run.js
insertnext-harness: 22 passed, 0 failed
```

七個情境全部覆蓋(每個情境入面拆咗幾條獨立斷言,合共 22 條):

| 情境 | 斷言 | 結果 |
|---|---|---|
| (a) 空 queue / idle | `computeInsertNext([], 0, hymn, {})` → `fallbackToSingle:true`;非空 queue 但 `idle:true` 一樣 fallback | ✅ |
| (b) 正常插入 curIdx=2,len=6 | newQ 長度 7、位置 3 係新歌、`autoRadioFrom` 4→5、`insertBoundary` null 不變、`moved=0` | ✅ |
| (c) 連插兩首 | 次序 `[cur, B, A, ...]`(B 後插推到 curIdx+1,A 落 curIdx+2) | ✅ |
| (d) 歌已喺 index 6(len=8) | 搬到 curIdx+1=3、長度不變(8)、`autoRadioFrom` 8→8 唔變(刪一加一抵消) | ✅ |
| (e) 歌已喺 autoRadioFrom(=5) 之前 head(dupIdx=4) | 搬位 + `autoRadioFrom` 5→5 唔變 | ✅ |
| (f) 播緊嗰首 | `alreadyPlaying:true`,`newQ` 冇產生(caller 唔准碰 queue) | ✅ |
| (g) native add throw → JS 唔變 | `reconcileFromNativeQueue()` 用「native queue 完全冇變」重砌,結果同插入前一樣;附加case:去重 remove 成功但 add 冧咗,reconcile 反映「真係 remove 咗、未 add」嘅 native 真相,唔係幻覺插入 | ✅ |

### H2 — 靜態核對

```
$ grep -n "insertNext" App.js src/components/AddToPlaylistSheet.js
App.js:2924:      playQueue, playSingle, insertNext, autoRadioFrom, insertBoundary,
AddToPlaylistSheet.js:93:    getPlayerBridge().insertNext?.(target);
```
`insertNext` 出現喺 context value(供其他 consumer 用)同
`AddToPlaylistSheet.js`(經 `playerBridge.js` 讀)。

```
$ git diff -- frontend/hymn-app/App.js | grep -iE "handleMidStreamStall|handleBufferingStuck|nudge|rescue|watchdog"
+  // 播放、唔掂起播/watchdog 任何邏輯(§0 紅線)。queueRef/setQueue/native
```
淨係一句自己加嘅註解,冇一行掂到呢四個函式本體。`git diff --stat` 見
App.js 淨係 5 個 hunk(imports / onPrefetchComplete guard / 新 insertNext
函式 / context value 加一個名 / — provider 次序改咗又 revert 返,冇殘留
diff)。

### H3 — iOS 模擬器 smoke(iPhone 17,Release build,一次性)

**Build**:`xcodebuild -workspace Odely.xcworkspace -scheme Odely
-configuration Release -sdk iphonesimulator ARCHS=arm64
EXCLUDED_ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES -derivedDataPath <scratch>`,
**BUILD SUCCEEDED**(改咗 code 之後重 build 過一次,確保 embed 嘅
`main.jsbundle` 反映最終版本,唔係改 provider 次序前嗰個有 bug 嘅版)。
用 `idb`(已安裝)驅動觸控,`xcrun simctl io screenshot` 截圖,production
backend(`api.odemusics.com`,經 tunnel)做資料源,冇碰 backend/冇 OTA。

執行過程截圖(`scratchpad/playnext/shots/`):
1. `01-launch.png` — App 開機,首頁正常。
2. `02-after-tap-song.png` — 撳「同心圓 |《我心中每一意念》」開播,起播
   0:01/4:55、自動接續尾巴「播放清單 (31)」。
3. `06-library.png`/`07-library2.png` — 詩歌庫,7108 首。
4. `08-add-sheet.png` — 撳「這一生最美的祝福」嘅「≡+」,「加入到清單」
   sheet 頂出現「下一首播放」行(icon 用 `next`,截圖 `08-icon-zoom2.png`
   放大核實圖形係 ▶│ skip-forward 方向,唔係 prev)。
5. `10-after-tap-insertnext.png` — 撳「下一首播放」,toast「已加到下一首
   播放」彈出,**mini player 顯示原歌繼續播放(pause icon = 播緊,冇斷)**。
6. `12-fullplayer3.png` — 開返全螢幕,原歌 3:40/4:55 繼續行(位置由
   0:01→0:24→0:48→3:40 一路連貫,冇 reset/冇斷),「播放清單 (32)」
   (31+1)。
7. **`13-queue-open.png` — 決定性一張**:第一行「同心圓」播緊(highlight),
   第二行正正係「這一生最美的祝福」(插入嗰首),之後先係「自動播放：
   全部」分隔線,再落先係原本自動接續尾巴。插入位置、queue 長度、
   insertBoundary/autoRadioFrom 分隔線位置全部同 H1 嘅純函式運算一致。
8. `14-after-skip-next.png` — (此次因為 bottom sheet 收埋咗但未完全
   collapse,誤中咗 queue 入面另一行,skipToQueueIndex 跳咗去「醫治這地」
   ——**呢個唔係 bug**,client-log 證實 origin=tapQueue 唔係 tapNext,純粹
   我測試手法問題,下面第二次乾淨重試已補證)。
9. `16-add-sheet2.png`/`17-insertnext2.png` — 再插一首(「我要向高山
   舉目」)做下一首播放,toast 出現,原歌(「醫治這地」)繼續播放冇斷,
   queue 33(32+1)。
10. **`18-clean-skipnext.png` — 第二個決定性截圖**:呢次確保 bottom
    sheet 完全收埋(a11y 核實冇 `Bottom Sheet` overlay 元素)先撳全螢幕
    播放器嘅**真・transport「下一首」掣**,結果**正確跳去「我要向高山
    舉目」**(0:00/6:52,標題/封面/歌手全部同步正確,冇錯歌),證實
    §1.1-10 native swap 索引安全嘅結論(冇一個 swap 換錯歌)。

**Backend client-log 交叉核對**(`backend/logs/client-log/client-log-2026-09-06.jsonl`):
```
10:08:36 playNext hymnId=2 moved=0 at=1 qlen=32   ← 對應「這一生最美的祝福」插入
10:10:11 nextTrackMs hymnId=1322 origin=tapQueue   ← 意外 tap 中 queue 行(非 bug,測試手法)
10:12:57 playNext hymnId=3 moved=0 at=7 qlen=33    ← 對應「我要向高山舉目」插入
10:13:59 nextTrackMs hymnId=3 origin=tapNext ms=8812 ← 呢條先係真・撳「下一首」transport 掣,origin=tapNext 證實(唔係 tapQueue)
```
`hymnId=2`/`hymnId=3` 分別經 `curl localhost:3001/api/hymns` 核實
= 「這一生最美的祝福」/「我要向高山舉目」,同截圖完全對得上。`at=7`
係因為第二次插入嗰刻 `curIdx=6`(已跳咗去「醫治這地」),`insertAt=7`
一致。

**做唔到嘅(寫原因)**:
- 「插已喺後面嘅歌 → 搬上嚟唔重複」(dedup,H1 已用純函式 (d)(e) 兩個
  情境驗證過)冇喺真機再撳多一次:`idb ui text` 唔支援中文字符(嘗試打
  「醫治這地」入搜尋框直接 `Exception: No keycode found for 醫`),而
  organic scroll 揾返嗰首歌(或者長按/context menu 入返個 queue sheet
  嘅 add 掣)嗰下手工太重,喺一次 smoke 嘅預算入面揀咗優先做完「正常
  插入」+「真・skip next 冇換錯歌」呢兩個更關鍵嘅情境,冇再補呢一項嘅
  真機重複。純函式層面(H1 (d)(e))已經覆蓋。
- 「歌名/封面顯示正確(索引同步正控)」——`18-clean-skipnext.png` 已經
  係呢個嘅正面證據(標題「我要向高山舉目」、封面、6:52 時長全部同資料庫
  id=3 對得上),當已完成。

### H4 — beacon

見 H3 段嘅 client-log 摘錄,兩條 `playNext` row 各帶齊五個必要欄位
(`hymnId`/`detail` 入面嘅 `moved`/`at`/`qlen`),另加強制注入嘅
`platform`/`deviceId`/`appVersion`/`updateId`/`sessionId`(來自
`src/clientLog.js`)。

## 3. 交付

Commit(pathspec,逐個檔案,冇 `git add -A`):
1. `frontend/hymn-app/App.js` + `frontend/hymn-app/src/insertNextCore.js`
   + `frontend/hymn-app/src/playerBridge.js`(insertNext 主體 + 純函式核心
   + module bridge)
2. `frontend/hymn-app/src/components/AddToPlaylistSheet.js`(「下一首
   播放」行)
3. `frontend/hymn-app/tools/insertnext-harness/` + `PLAYNEXT-REPORT-20260906.md`

實際 sha 見終端輸出。冇部署/OTA/eas/restart/backend 改動。

模擬器收工:`booted:0 idb:0 sim:0 devtools:0`,`/tmp/claude-ios-cleanup.hold`
已刪,scratch DerivedData 已清。
