# 「(已下架)」留喺最愛 + 連續飛歌 —— 根因分析(2026-08-22)

Eric 報告:Android app 播歌連續飛咗幾首;截圖見到播放清單(75 首)入面有一項顯示
「(已下架)」,冇封面、灰色音符 icon,排喺「偶然遇上的驚喜」同「父啊,我向祢呼求」中間。

以下全部由 backend log(`/tmp/hymn_backend.log`)、`hymns.db`、`users.db`、
`backend/data/kids-refetch/*.json` 同前端源碼實證,冇靠估嘅部分會明文標「未實錘」。

---

## 一、實錘咗嘅事實

### 1.1 「(已下架)」係邊首 —— id 2015

| 證據 | 內容 |
|---|---|
| 前端 | `(已下架)` 呢個字串全 app 得一個出處:`src/context/FavoritesContext.js:64`,`replaceAllFavorites()` 對「server 有呢個 hymn_id、但全庫同本地 cache 兩邊都揾唔到」嘅 id 留低嘅灰態佔位 `{ id, title: '(已下架)', unavailable: true }` |
| users.db | `user_id=2`(Eric)favorites **正好 75 行**,同截圖「75 首」對上;入面有 `hymn_id=2015`,`created_at = 2026-08-02 06:59:45` |
| hymns.db | `select … from hymns_all where id=2015` → **零行**。唔係 soft-delete(`status='dead'`),係**成行俾人 hard delete 咗** |
| backend log | `[stream] … id=2015 yt=- … status=404`,`routes/stream.js:120-128` 查 `hymns` view 查唔到就 404,`yt=-` 就係呢條路徑嘅簽名 |

### 1.2 佢點解仲喺個清單度 —— kids C4 原子換血 + 登入合併復活

1. `backend/scripts/finalizeKidsC4.js:264` 做「兒童庫換血」嗰陣行咗
   `DELETE FROM hymns_all WHERE lang='兒童' AND status != 'rejected'`,舊 471 條兒童歌
   **hard delete**,再插 608 條新 id。
2. 個 script **有**做用戶側清理(`:345` `DELETE FROM favorites WHERE user_id=? AND hymn_id=?`),
   而且留低咗紀錄 —— `backend/data/kids-refetch/c4-swap-users-remap.json`
   (generatedAt `2026-08-01 16:32:33`):
   - `favRemapped: 4`(舊 id 就地改寫做新 id,所以 4225/4237/4254/4384 嘅 `created_at`
     仲係 07-29,冇變)
   - `favDropped: [{ "user_id": 2, "oldId": 2015 }]` ← **2015 當時已經清走咗**
   - 2015 屬於 `id-remap.json` 嗰 33 條 `unmapped`(新庫冇對應片),所以冇得 remap,只能刪
3. 但係 **2026-08-02 06:59:45,五個舊兒童 id 一次過返曬嚟**:
   `1835 / 1951 / 2015 / 2420 / 2718` —— 全部係換血前嘅舊 id,全部
   `hymns_all` 已經冇行。
4. 復活路徑實錘:
   - `App.js` `runLoginSync()` 推 `favIds = favoritesRef.current.map(f => f.id)`
     —— 即係**本地 MMKV `favorites` 全量**,包括佔位項
   - `routes/me.js` `POST /api/me/sync`:
     `INSERT OR IGNORE INTO favorites (user_id, hymn_id) VALUES (?, ?)`
     —— **union merge,完全冇核 hymn_id 存唔存在**
   - 即係:server 清得幾多次都冇用,client 一登入就原封不動打返上去。

### 1.3 事發時序(backend log,UTC;+8 = HKT)

```
09:07:40Z  id=1820  206  ← 正常播緊
09:07:42Z  id=117   200  ← 預熱下一首(= 截圖嗰首「偶然遇上的驚喜」)
09:12:02Z ─┐
   …       │ id=2015  status=404 × 21 次,退避重試 0.7s→1.5s→…→5.6s 封頂
09:13:27Z ─┘ 共 86 秒完全冇聲
09:13:23Z  [client-log] PlaybackError hymnId=2015 errorSkipCount=0 willRetry=true
09:13:27Z  [client-log] wallClockDrift driftMs=1261838  ← JS thread 俾凍咗 21 分鐘
09:13:28Z  [client-log] PlaybackError hymnId=2015 code=android-io-bad-http-status willRetry=false → skipToNext
09:13:29Z  id=350  upstream 403 → retry,3.9 秒後 aborted   ← 「父啊,我向祢呼求」
09:14:06Z  id=55   upstream 403 → retry → 10.3 秒後 200 OK
09:15:04Z  app 返前台,trackState=playing
```

`117 → 2015 → 350` 呢個次序同截圖「已下架排喺兩首歌中間」完全對得上,所以呢段
log 就係 Eric 見到嗰件事。

> ⚠️ **時間對唔上要講清楚**:Eric 話 18:15,但呢部機而家先 17:17,log 最後一條
> 係 17:15 HKT。上述 17:12–17:15 嗰段係唯一同截圖內容吻合嘅窗口,我當佢係同一件事。
> 如果 Eric 確定真係 18:15 之後先發生,咁就係另一單,要再攞多一次 log。

### 1.4 全庫有幾多呢類死 reference

| 用戶 | 死 id | 種類 |
|---|---|---|
| user 2 (Eric) | 1835, 1951, 2015, 2420, 2718 | 行都冇咗(kids C4 hard delete) |
| user 3 | 1002, 1003 | 行仲喺 `hymns_all` 但 `curated=0`,唔喺 `hymns` view → 一樣 404 |
| user 6 | 1848, 2626, 2654 | `status='rejected'`(非歌內容 delist)→ 一樣 404 |
| user 3 | 播放清單「Test A Renamed」入面 id 1001 | 同上 |

**共 10 個死最愛 + 1 個死清單項。** Eric 嗰 5 個仲喺同一個 75 首隊列裏面,即係
今次唔止撞到 2015 一次,之後仲會撞多 4 次。

---

## 二、點解一首死歌會拖到「連續飛幾首」

三件事疊埋:

### 2.1 佔位項照樣餵落 TrackPlayer(**已修,見第三節**)

`toTrack()` 見到 id 就砌 `/api/stream/<id>`,完全冇睇 `unavailable` flag。
一個 404 track 落到 ExoPlayer 手上,就變成上面嗰 86 秒退避重試。

### 2.2 背景 JS 凍住 → 三個 watchdog 一個都唔會出手

`handleBufferingStuck` 設計上係 15 秒軟踢、45 秒放棄跳,但 09:13:27 嗰條
`wallClockDrift driftMs=1261838` 講明 JS thread 俾 Android Doze 凍咗 21 分鐘。
凍住期間 poll loop 唔行 → 冇 tick → watchdog 永遠數唔到 15/30。
所以實際救場嘅係 ExoPlayer 自己拋 error,而佢慢足 86 秒。

**呢個係已知結構性缺陷**(同 `STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13` D1 記錄嘅
同一個根),今次冇新做法可以喺 JS 層解決,只可以「唔好一開始就餵首死歌落去」。

### 2.3 熔斷器(連續 3/6 首就停+提示)實測冇 trip 過 —— **未實錘,建議跟進**

`errorSkipCountRef` 設計上係「只有真係播到聲(`TPState.Playing`)先 reset」,
連續 3 首(前台)/ 6 首(背景)失敗就 pause + 出提示。但今日 log 見到:

```
07:49:36Z PlaybackError id=3100 errorSkipCount=0
07:49:53Z handleStuckTrackEnd id=3100 errorSkipCount=1  → skip
07:50:18Z PlaybackError id=6903 errorSkipCount=1
07:51:09Z PlaybackError id=33   errorSkipCount=0  ← 中間 reset 咗
07:52:06Z PlaybackError id=35   errorSkipCount=1
07:52:35Z PlaybackError id=35   errorSkipCount=1  → skip
07:54:26Z PlaybackError id=40   errorSkipCount=0  ← 又 reset 咗
```

嗰段時間(15:49–15:55 HKT,即 yt-dlp 事故未修好嗰陣)全部歌都 502,
app 連續燒咗 `3100 → 6903 → 33 → 35 → 36 → 40` **六首**,但個 counter
一路喺 0/1 之間彈,**由頭到尾冇到過 3,所以熔斷器同「連續幾首歌都載入唔到」
嗰個 Alert 一次都冇出過**。用戶感知就係「無聲無息連環飛歌」。

**懷疑點(未證實)**:`setupPlayer({ waitForBuffer: false })` 會令 ExoPlayer
喺 buffer 未夠嗰陣就報 `Playing`。而 `App.js:826` 嘅 reset 就係掛喺
`TPState.Playing` 度 —— 個註釋自己寫明「only ACTUAL audible playback proves
we've recovered」,但 `waitForBuffer:false` 之下 `Playing` 已經唔再等於「出到聲」。
如果係咁,每次 skip 去下一首都會即刻 reset 個 counter,門檻永遠去唔到。

**點解今次唔即刻改**:`logDiag('stateChange')` 唔係 `{always:true}`,冇上傳,
所以我喺 backend log 度證唔到「有冇一個假 Playing」。可能性仲包括 Eric 自己
撳過 play。改法本身有 regression 風險(改成「要見到 position 真係行過先 reset」,
背景 poll 凍住嗰陣就永遠 reset 唔到,長時間背景播放期間零散幾次失敗就會誤 pause)。
建議:**先開 `stateChange` 嘅 always 上傳一輪,攞到實證再改**,唔好靠估落刀。

---

## 三、今次已經改咗嘅(前端,已 commit,未 OTA)

兩處都係細、可證、唔使 restart backend:

1. **`playQueueImpl()` 剪走 `unavailable` 佔位項**
   - 佢哋照定義就係「library 同本地 cache 兩邊都冇料」,即係我哋對呢個 id 一無所知,
     冇任何可播嘅嘢,剪走零損失。
   - library 未載入(空陣列)嗰陣,所有 id 都會 fallback 落本地 cache 攞返 full
     object、唔會被標 `unavailable`,所以唔會誤殺正常歌。
   - 用戶撳正嗰個下架項 → 出 `showNotice('呢首歌已經下架，跳去下一首')`,由後面
     第一首播得嘅開始;成個 list 都死 → `'呢首歌已經下架，播唔到'`,唔會靜靜哋乜都冇。
   - `startIndex` / `autoRadioFrom` / `insertBoundary` 三個 index 都跟住重新對位
     (五個 case 用 node 跑過 truth table 對過)。
2. **`runLoginSync()` 唔再將 `unavailable` 佔位項推返上 server**
   - 直接堵住 §1.2 條復活路徑:以後 server 側清理企得穩。
   - ⚠️ 呢個 filter **唔會刪 server 現有嗰行**(union merge 唔識刪嘢),已經寫咗落
     `users.db` 嗰 10 個死 id 要另外 reconcile,見下。

冇郁:native、backend、watchdog 門檻、熔斷器邏輯。

---

## 四、架構性缺口(唔急住修,等 Eric 拍板)

### G1. 下架/換血流程冇一個「用戶 reference 會唔會斷」嘅統一關口

而家三條路都會令一個 hymn_id 由「播得」變「404」,但只有第一條有做用戶側清理:

| 路徑 | 有冇清 users.db |
|---|---|
| kids C4 hard delete(`finalizeKidsC4.js`) | ✅ 有(但被 client 合併復活) |
| `status='dead'` / `'rejected'` soft delete(非歌內容 delist、dl:dead) | ❌ 冇 |
| `curated=0` | ❌ 冇 |

後兩條係日常操作(今日仲跑緊 dl:dead reset 同 879 首 unavailable 重掃),
即係呢個死 reference 池**只會越積越多**。

### G2. `/api/me/sync` 同 `/api/me/favorites/:id` 完全唔核 hymn_id

`INSERT OR IGNORE`,乜 id 都收。所以:
- server 側清理永遠會被 client 合併打返轉頭(§1.2 實錘)
- 前端 §3 嗰個 filter 只擋到「client 知佢死咗」嗰啲;`1835/1951/2420/2718` 因為本地
  cache 仲揸住舊 full object(有 title 有封面),**唔會**被標 `unavailable`,
  睇落同正常歌一模一樣,一撳落去一樣 404 —— 前端修唔到,要 server 出手。

### G3. 建議方向(三選一/可疊)

1. **最平**:backend 加 `hymn_id` 存在性驗證(`INSERT … SELECT … WHERE EXISTS
   (SELECT 1 FROM hymns WHERE id=?)`),`/sync` + `/favorites/:id` 兩條都加。
   死 id 從此入唔到庫。要 backend restart(行 deploy gate)。
2. **一次性**:寫個 reconcile script 掃 `users.db`,將指唔到 `hymns` view 嘅
   favorites / playlist songs 刪走(今日總共 10 + 1 條),連埋做 backup。
   要同 (1) 一齊做,唔係下次登入又復活。
3. **長遠**:下架流程(delist / dl:dead / curated=0 / 換血)統一收埋一個
   `retireHymn()` helper,入面順手 reconcile users.db,唔好再逐個 script 各自為政。

### G4. 附帶發現:上游 403 仲未散

17:13 同 17:14 兩條 log(`id=350`、`id=55`)都要 retry 一次先落到,同
`project-stream-outage-ytdlp-stale-2026-08-22` 記低嘅「403 午後起、深夜散」規律一致。
今日 `brew upgrade yt-dlp` 修好嘅係「必 403」;呢種**間歇** 403 係另一件事,
每次都燒 4–10 秒。今次「飛歌」感覺入面有一部分係佢貢獻,唔係淨係 2015 一首歌嘅錯。

---

## 五、要 Eric 拍板嘅三件事

1. **G3 做邊個組合**(建議 1+2 一齊,一次過斷尾;要一次 backend restart)。
2. **§2.3 熔斷器**:要唔要先開 `stateChange` always 上傳一輪攞實證,再決定改唔改
   reset 條件?(我建議要,唔好靠估改個關住播放嘅門檻)
3. Eric 嗰 5 個死最愛(1835/1951/2015/2420/2718)要唔要即刻手動喺 users.db 剷走
   止血(佢哋仲喺同一個 75 首隊列度,今次唔止撞一次)—— 剷完要配埋 G3(1),
   否則下次登入合併又返嚟。

---

## 六、執行紀錄(2026-08-22,Eric 三項全部拍板做)

### 6.1 已落地

| 項 | 內容 | Commit |
|---|---|---|
| 前端 ①(上一轉) | `playQueueImpl()` 剪走 `unavailable` 佔位項;`runLoginSync()` 唔再推佔位項上 server | `1768a5b` |
| Backend ② | `routes/me.js` 加 `existingHymnIds()` 入口守衛,`/api/me/sync`、`POST /api/me/favorites/:id`、`PUT /api/me/playlists/:id` 三條全部核 `hymns` view | 見下 |
| Script ③ | `backend/scripts/reconcileUserRefs.js` 一次性清死 reference | 見下 |
| 前端 ④ | `stateChange` / `trackChanged` 臨時 `always: true`,加埋 `errorSkipCount` + `position/duration` | 見下 |

### 6.2 §G2 入口守衛嘅設計取捨

- **判準用「喺唔喺 `hymns` view」**,唔逐種死因分開寫:hard delete / `status='dead'` /
  `status='rejected'` / `curated=0` 四種喺 `/api/stream` 都一律 404
  (`routes/stream.js:120` 查嘅就係同一個 view),一條判準冚曬。
- **同 `/api/hymns` 讀同一份 in-memory 副本**(`lib/serverDb.js` getDb),所以
  「App 見得到」同「收得入最愛」永遠一致,唔會出現「見到但加唔到」。
- **故意 fail-open**:讀唔到 hymns.db 就回 `null`,caller 一律當「唔過濾」。
  寧願放幾個死 id 入嚟(前端仲有佔位 + `playQueueImpl` 剪走做第二層),
  都唔可以因為 DB 一時讀唔到就靜靜哋剷走用戶成個最愛清單。
- 清單 `updated_at` **唔郁**:嗰個係 LWW 比較欄,推前咗會令 client 手上真.較新
  嘅版本被判 stale 冚走。

### 6.3 Restart 前嘅夾帶檢查(Eric 明文要求)

批准檔上次 backend sha = `94cf6de`。HEAD 之前有三個未批准 commit,逐個查過
**改動檔案零 backend/ code**:

| Commit | 改咗乜 | 會唔會隨 restart 上 prod |
|---|---|---|
| `fe4580b` 複核線 2→4 | `docs/SUPERVISION-LOG.md`、`ops/lyrics/REVIEW-LINE-SOP.md` | ❌ 純文檔 |
| `36fccbd` 鍵盤收唔返 | `frontend/hymn-app/src/screens/{AddFriendSheet,AuthScreen}.js` | ❌ 前端,要 OTA/APK 先到用戶 |
| `1768a5b` 佔位項唔餵落 player | `frontend/hymn-app/App.js` + 本文件 | ❌ 同上 |

即係今次 restart **唯一真係上線嘅 backend 行為改動就係 §6.2 嗰個入口守衛**。
YTDLP-UNIFY 規劃暫時得文檔冇 code,唔涉及。

### 6.4 仲未做 / 殘留風險

- §2.3 熔斷器根因**仲未定案** —— 今次淨係開咗 log 攞證據,冇改 reset 條件。
  收夠幾轉真實數據要記得**改返 `always` 落嚟**(`stateChange` 每首歌 4-6 個 POST)。
- 前端兩處修法(`1768a5b`)**未 OTA**,要等落一批。即係用戶手機而家仲係舊行為,
  暫時靠 backend 守衛頂住「唔會再有新死 id 入庫」。
- Restart 之後 `/api/hymns` 會由 6092 跌到 6082(server 開機時嗰份副本係
  13:35 讀嘅,之後 pipeline 又落架咗 10 首)。呢 10 首如果有人 favourite 咗,
  reconcile 之後嘅下一轉會變成新嘅死 reference —— 屬正常運作,由今次個守衛
  + 定期再跑一次 reconcile 處理。

---

## 七、執行後驗證(2026-08-22 18:0x–18:2x)

### 7.1 ⚠️ 補記:同一日**撞咗第二次**,而且解釋返 Eric 個「18:15」

寫完第一版之後再掃 log,喺 **17:35:47–17:37:43 HKT**(= `09:35–09:37Z`)搵到
**第二單一模一樣嘅事**,今次係 **id 2718**:

```
09:35:47Z ─┐ id=2718  yt=-  status=404 × 22 次
09:37:43Z ─┘ 共 116 秒死寂
09:37:37Z  PlaybackError hymnId=2718 errorSkipCount=0 willRetry=true
09:37:41Z  wallClockDrift driftMs=1333966   ← 又一次背景凍咗 22 分鐘
09:37:43Z  PlaybackError hymnId=2718 code=android-io-bad-http-status willRetry=false → skip
09:37:43Z  id=1637 status=200  ← 跳到落一首正常播返
```

兩個結論:
1. **§1.4 嗰句「今次唔止撞到 2015 一次」即場應驗**。2718 正正就係嗰四首
   「本地 cache 仲有 full object、所以睇落同正常歌一模一樣、唔會標
   `unavailable`」嘅其中一首 —— 佢**證實咗淨靠前端修法係救唔到嘅**,
   一定要 §G2 入口守衛 + reconcile 先冚得曬。
2. 第一版報告話「Eric 講 18:15 但 log 最後只到 17:15,可能係另一單」——
   而家睇返,**17:35 呢單先至係佢多數見到嗰單**(時間近好多)。兩單根因、
   簽名完全一樣,結論一個字都唔使改。

### 7.2 做咗乜 / 驗證結果

| 步驟 | 結果 |
|---|---|
| Gate:`approve.sh backend 2f4c26b --confirm` | ✅ |
| Restart #1(部署入口守衛) | ✅ health 200 |
| `reconcileUserRefs.js --apply` | ✅ 清 10 個死最愛 + 1 個清單死歌,備份 `users.db.bak-reconcile-20260822101121` |
| Restart #2(令 server 重讀清乾淨嘅 users.db) | ✅ health 200 |
| reconcile 重掃 | ✅ favorites 0、playlists 0 |
| 端到端:推返清理前嗰 75 個(含 5 個死 id) | ✅ 拒收 5 個、70 個生 id 一個唔少 |
| 端到端:`POST favorites/:id` 三種死 id | ✅ 全部 404 `hymn_not_found`;生 id 200 |
| 端到端:`PUT playlists/:id` 含死歌 | ✅ 3 首剪到剩 1 首(只留生 id) |
| Live:`/api/stream/{2015,2718,1835,1951,2420}` | ✅ 全部 404 |
| Live:`/api/stream/{117,350}` | ✅ 206 |
| Live:`/api/hymns` | ✅ 6082 首(restart 前個 stale 副本係 6092) |
| Live:`/api/me/sync` 冇 token | ✅ 401 |

各人最愛數目變化:user 2 = 75→70、user 3 = 2→0、user 6 = 12→9,其餘不變。

### 7.3 驗證過程中整污糟咗又還原返嘅嘢(照直講)

端到端 harness 嘅測試 2 加咗 `117` 落最愛再喺收尾刪返 —— 但 **117 本身就係
Eric 原有嘅最愛**(2026-07-29 嗰批),收尾嗰下實際上係刪咗佢一首真最愛。
即場同 e2e 前嘅 users.db 快照 diff 揪返出嚟,已經連原本嘅 `created_at`
(`2026-07-29 04:48:31`,唔用 now,唔會打亂最愛排序)還原,並剷走 harness
留低嗰個 soft-deleted 測試清單 `pl_e2eharness`,再 restart 一次令 server
in-memory 副本對得返上。最後全表 diff:**favorites 同 playlists 都同快照
逐 byte 一致**。

### 7.4 殘留風險

1. **前端 `1768a5b` 仲未 OTA** —— Eric 部機而家仲係舊 code。但佢下次開 app
   前台,`onActive` 會 pull 一次,server 回嘅 70 個入面已經冇咗五個死 id,
   `replaceAllFavorites()` 會直接冚走本地嗰五個 —— 即係**唔使等 OTA 都會自愈**。
2. **臨時 log 要記得閂返**:`stateChange` / `trackChanged` 而家係 `always`,
   每首歌 4-6 個 POST,`/api/client-log` 冇限速。攞夠幾轉數據就要 revert。
3. **入口守衛擋新唔擋舊**:守衛只保證「唔會再有新死 id 入庫」。日後 pipeline
   再落架歌(今日 restart 前後就已經由 6092 跌到 6082),舊 favorites 一樣會
   變死 reference。要**定期再跑一次 `reconcileUserRefs.js`** —— 建議跟住
   §G3-3 收埋落 `retireHymn()`,或者最低限度加落夜晚排程。
4. **§2.3 熔斷器根因仍未定案**,今次只開 log 冇改邏輯。
