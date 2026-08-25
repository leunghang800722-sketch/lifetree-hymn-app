# 第三輪全面 Review + 雙平台 Load 歌實測(2026-08-22 深夜)

**執行**:Fable 5(研究+實測+規劃,零代碼改動)
**背景**:yt-dlp 統一(P0+P1+P2,`f1b65d3`/`11fa461`/`29fe63f`)同 Android 飛歌修復(`2f4c26b`/`1768a5b`)當日落地後,重新 review iOS+Android 兩邊,並開 iOS Xcode 模擬器 + Android 模擬器實測「由撳歌到出聲」時間。
**對照文件**:`FRONTEND-CODE-REVIEW-20260819.md`、`SECOND-PASS-REVIEW-20260820.md`、`BATCH6-PLAN-20260820.md`、`IOS-NEXT-TRACK-PRELOAD-PLAN.md`、`YTDLP-UNIFY-PLAN-20260822.md`、`DELISTED-FAVORITES-ROOTCAUSE-20260822.md`

---

## §0 TL;DR

1. **Android 串流路徑好健康**:tapNext 0.8–3.0 秒、暖 URL 第一首 1.8–2.7 秒。8-13 嗰輪「16.2s→~2.9s」嘅修復繼續生效,yt-dlp 統一後 resolve 穩定喺 2.8–3.6 秒,成晚零 XProtect stall、用戶路徑零 403。
2. **iOS「下一首」已經接近零延遲**:本地預載(IOS-NEXT-TRACK-PRELOAD)實錘生效,tapNext 全部 **163–172ms**、source=local。
3. **iOS「第一首」照舊慢——未處理,有新數據**:cold start 第一首 **14.8s(凍 URL)/ 9.6s(暖 URL)**,仍然落喺舊記錄 6.9–20.8s 區間。分解實錘:backend 只佔 ~1–4s,**AVPlayer 端 buffering 佔 8–9 秒係主因**,同 yt-dlp 無關。Phase 2.5(開 app 預載第一首)依然係正解,今次數據支持佢升優先度。
4. **實測途中拍到一個量度儀器 bug**:`finishTransitionMeasure` 個 `trackChangedSeen` 守衛擋唔住「舊 track 遲到嘅 Playing」——iOS 實錘一單 382ms 假快數(真數 ~8.4s)。同 DELISTED report §2.3 懷疑嘅「假 Playing」同一 class,今次喺 iOS 拍到現行犯。
5. **Review 三路並行掃完**(串流 workaround 冗餘/前端死 code/後端死 code):舊三份 review 嘅已知項**幾乎全部落地咗**,今次係新一層發現——P1 有 5 項(詳見 §4),最大嚿係 6 個 git-tracked backup 檔共 4,439 行、同埋 `2f4c26b` 入面三處臨時 `always:true` beacon 未閂。
6. OCR 協調:照足「開模擬器前 pause、完事 resume」流程(growlibrary unload 23:05 → load 返 23:28),OCR 池今晚 cooldown 中,零衝突。臨時開過嘅 `DIAG_ENABLED` 已還原,working tree 乾淨。

---

## §1 OCR pause/resume 協調記錄

- 原定做法係問返 47H OCR session(`local_bc09ae56`)——但今晚呢個 session 冇 running,而且本 session 係 dispatched(unattended),cross-session messaging 用唔到。改用**實證核對**:
  - `ps` 掃勻:冇任何 OCR/whisper/paddle/fetchLyrics process 行緊 ✓
  - `com.hymnapp.fetchlyrics` plist 維持 `.disabled-20260813` 狀態 ✓
  - launchd 排程表逐個查:測試窗(23:05–23:30)內只有 growlibrary(每 15 分鐘)同 albumsearch(每點 15 分)會開波
- **Pause**:23:05 `launchctl unload com.hymnapp.growlibrary.plist`,`launchctl list` 確認消失(照返 SUPERVISION-LOG:1882 嘅既定做法)。albumsearch 係輕量 API job,冇 unload(23:15 冇撞正測試高峰,00:15 嗰班喺收工之後)。
- **Resume**:23:28 `launchctl load` 返,`launchctl list` 確認返到位 ✓
- ⚠️ **勘誤**:backend review agent 有一項 P1「growlibrary plist 裝咗但冇 bootstrap,dead schedule」——嗰個 agent 係喺我 unload 之後先去查,**佢見到嘅正正係我個 pause 窗口,唔係真發現**。§4 已剔走呢項。
- 兩條 lyrics 複核 session(mandarin b / cantonese b)測試期間仲行緊——佢哋讀 DB 為主,唔屬 OCR pipeline,冇干預。

## §2 實測方法(點量、有咩偏差)

- **儀器**:用 app 本身嘅 `nextTrackMs` beacon(`App.js:472` `finishTransitionMeasure`,t0=撳掣嗰刻,t1=trackChanged 之後第一個 state=Playing,即「用戶感受緊嘅等幾耐先有聲」),經 `/api/client-log` 落 `backend/logs/client-log/`。呢個係 IOS-ANDROID-PARITY-PLAN Phase 1 起嘅量度制,今次直接攞嚟用。
- 測試期間臨時將 `src/config.js` 嘅 `DIAG_ENABLED` 開 `true`(呢個 flag 嘅注明用途就係「查緊嘢先臨時開」),**測完已還原 `false`,`git diff` 確認同 HEAD 一致,冇 commit 過**。
- 交叉核對:`/tmp/hymn_backend.log` 嘅 `[stream]` 行(resolve_ms/ttfb_ms/total_ms/status)逐單對返,分解 backend 定 client 端食咗啲時間。
- **環境 caveat(睇數要記住)**:
  1. 兩邊都係 **debug build + metro dev server**(iOS `Odely.app` 8-20 build;Android `app-debug.apk` 8-10 build;JS 係今晚 main branch 現碼)。debug JS 行慢過 release,絕對值會偏慢,但**平台對比同分解結論唔受影響**。
  2. API 行正式 `api.odemusics.com` tunnel(同真機一樣嘅網絡路徑)。
  3. iOS 沙箱入面上輪 second-pass「種 cache」留低嘅 3 個 m4a(4808/5646/4526)已搬走(留咗 backup 喺 session scratchpad),確保 stream 樣本唔俾舊種子污染;測試期間 app 自己重新預載嘅本地檔係真實現行行為,照計。

## §3 實測數據

### §3.1 iOS(iPhone 17 Pro 模擬器,iOS 26.5)

| 場景 | hymn | 結果 | 備註 |
|---|---|---|---|
| Cold start → 第一首(凍 URL) | 4897 | **14,803ms** | resolve 2,823ms + AVPlayer probe/buffer ~9s |
| Cold start → 第一首(暖 URL) | 4897 | **9,551ms** | resolve 0ms,淨計 AVPlayer 端 ~9s |
| 插播凍歌 | 2676 | **10,639ms** | resolve 3,171ms |
| 插播暖歌 | 68 | **~8,400ms(真)** | beacon 報 382ms 係假數,見 §3.4 |
| tapNext ×4(本地預載) | 5587/7641/8460/5802 | **169 / 165 / 163 / 172ms** | 全部 source=local ✅ |

**分解(4897 cold 嗰單)**:撳掣 → 首個 stream request 到 backend 只 ~0.9s;yt-dlp cold resolve 2.8s;backend 出 head 之後 AVPlayer 做咗兩次 aborted range probe + 一次 3.9s 長讀,到 state=Playing 總共食多 ~8-9s。**呢舊 AVFoundation 端開銷先係第一首慢嘅大頭**,同 IOS-NEXT-TRACK-PRELOAD-PLAN 當日嘅判斷(「backend 點快都慳唔到 AVPlayerItem 起 asset 嗰層」)完全吻合。

### §3.2 Android(hymntest AVD,API 34)

| 場景 | hymn | 結果 | 備註 |
|---|---|---|---|
| Cold start → 第一首(凍 URL) | 6319 | **13,511ms** | 凍 resolve + ExoPlayer buffer |
| Cold start → 第一首(暖 URL) | 6319 | **2,659ms** | |
| 再撳同一首(暖) | 6319 | **1,845ms** | |
| 插播凍歌 | 5008 | **9,619ms** | |
| tapNext ×4(串流) | 6609/5743/6700/5510 | **2,955 / 1,247 / 1,462 / 773ms** | Android 冇本地預載,全 stream |

### §3.3 兩系統對比 + 同舊 baseline 對比

| 指標 | iOS 今晚 | Android 今晚 | 舊 baseline |
|---|---|---|---|
| tapNext(下一首) | **~0.17s**(本地預載) | 0.8–3.0s(串流) | 8-13 修復後 ~2.9s;iOS 而家反超前 Android |
| 暖 URL 第一首 | ~9.6s | **1.8–2.7s** | — |
| 凍 URL(第一首/插播) | 10.6–14.8s | 9.6–13.5s | iOS 舊記錄 6.9–20.8s,**冇改善,亦唔預期會改善**(主因唔喺 backend) |
| yt-dlp cold resolve | 2.8–3.2s | 2.8–3.6s | 統一後健康;成晚最高 10.5s 嗰單係撞 upstream 403 retry |

**結論**:
- yt-dlp 統一對「load 歌時間」嘅貢獻係**穩定性**(冇 XProtect 26-42s stall、冇全線 403),唔係絕對速度——速度瓶頸而家好清楚:**iOS = AVPlayer 端 ~9s、兩平台共通 = 凍歌 resolve ~3s**。
- **「iOS 開 app 第一首慢」維持未處理**(Phase 2.5 押後項)。今晚數據將條數拆得好清:得 Phase 2.5(開 app 即預載第一首落本地檔,行 file://)先殺得死嗰 9 秒,因為 tapNext 用同一招已經做到 0.17s。
- 測試窗內用戶路徑零 403;唯一一單 502 係 iOS 預載器撞單一影片 upstream 403(preVerify+retry 後放棄,`prefetchFail` beacon 有影),殘餘性質,唔係 regression。

### §3.4 實測拍到嘅量度儀器 bug(新發現,P2)

`App.js:472` `finishTransitionMeasure` 要求 t1 個 Playing「見過 trackChanged 先算」,但**唔要求見過新 track 嘅 buffering/loading**。實錘:15:16:36 id=68 嗰單,beacon 報 `ms=382`,但同一秒 log 順序係 `nextTrackMs(382ms)` → `from=none to=buffering` → 8.4 秒後先 `from=buffering to=playing`。即係舊 track 遲到嘅 Playing event 喺 trackChanged 之後、新 track 開 buffer 之前搶咗閘。呢個係 DELISTED-FAVORITES report §2.3 懷疑嗰個「假 Playing」class 嘅 iOS 版現行犯——**將來用 nextTrackMs 數據做 baseline 時,分佈入面嗰啲 <500ms 嘅 stream 樣本要當可疑**。修法(一行式):t0 record 加 `bufferingSeen`,`finishTransitionMeasure` 要 `trackChangedSeen && bufferingSeen` 先上報(source=local 嘅樣本可以豁免,本地檔真係可以 <500ms)。

---

## §4 Review 發現(三路 agent 掃描,已同舊三份 review 去重)

前提:FRONTEND-CODE-REVIEW-20260819 嘅 D1–D8、BATCH6 C6、`hasChipFilter` 等已知項**逐項驗證過全部已落地**,以下全部係新發現。標 ⚙️=零 restart 零 OTA、📱=要 OTA、🏗️=要新 native build。

### P1(實際風險/混淆源)

| # | 項目 | 位置 | 內容 | 改動面 |
|---|---|---|---|---|
| P1-1 | **三處臨時 `always:true` beacon 未閂** 📱 | `App.js:840,847,893` | `stateChange`/`trackChanged` 嘅 `{always:true}` 已 commit(`2f4c26b`),繞過 `DIAG_ENABLED`,一 OTA 就每首歌 4-6 個 POST。註解自己寫明「收夠數據要改返落嚟」——而家實況:**由 commit 到今晚一條真機數據都未收過**(前端未 OTA),閂返零證據損失。⚠️ 其餘六個 `always:true`(PlaybackError/watchdog giveup/wallClockDrift 等)係設計上永久開,**唔好一齊閂** | 3 行 |
| P1-2 | **6 個 backup 檔 git-tracked,共 4,439 行** ⚙️ | `frontend/hymn-app/App.js.{fullbak,trackplayer-backup,v134-expo-av,v135-youtube,v138-bak}`、`index.js.bak` | 零引用(Metro 根本 resolve 唔到呢啲 extension),但同現役 code 撞名(五份都有自己嘅 `handlePlayHymn`/`PlayerContext`),grep/AI 搜尋必中伏。git history 保得住,`git rm` 就得 | 刪 6 檔 |
| P1-3 | **healthcheck 紅色警報指去唔存在嘅 rollback 程序** ⚙️ | `ops/lyrics/stream-healthcheck.sh:162` | 兩層檢查都 fail 嗰陣個警報教人 `mv` 返 `backend/tools/yt-dlp.prev`——`29fe63f` 之後 rollback 已改成 a/b slot symlink,`.prev` 唔存在。下次事故 on-call 跟住做會白燒時間 | 1 行 |
| P1-4 | **dl-failures ledger 帶住壞 binary 年代嘅 strike** ⚙️ | `backend/data/lyrics-dl-failures.json`(機制:`fetchLyrics.js:150-152`) | 1,976 條入面 1,054 條 `fails=2`,當中 845 條係 8/18–8/19(format 18/舊 binary 全線 403 兩日)——病因已消失,但呢批歌**再失敗一次就永久 `dl:dead`**。同類誤判已經人手補鑊過兩次(`b2d9bf5` reset 181 首)。建議:寫一支 locked script 將 `lastAt < 2026-08-20` 嘅 strike 歸零 | 一支 script |
| P1-5 | **`react-native.config.js` 指住已剷嘅 package** ⚙️(下次 prebuild 前) | `frontend/hymn-app/react-native.config.js:1-9` | 仲引用 `react-native-vector-icons`(D7 已剷,node_modules 冇呢個 dir),assets 陣列指住空氣。下次 prebuild/asset link 出事會好難 debug | 刪一個 block |

註:兩個 agent 都報咗「`DIAG_ENABLED=true` 未還原」做 P1——嗰個係**我今晚實測嘅臨時開關,已經還原,working tree 已同 HEAD 一致**,唔使入 batch。

### P2(清理價值高/要少少功夫)

| # | 項目 | 位置 | 內容 |
|---|---|---|---|
| P2-1 | `finishTransitionMeasure` 假快數守衛(§3.4)📱 | `App.js:472` | 加 `bufferingSeen` 條件,一 OTA 之後先有可信 baseline |
| P2-2 | `RESOLVE_PARALLEL` 死分支 ⚙️ | `backend/lib/resolveAudio.js:63,178-198` | 2026-07-20 起冇人行,同檔註解自己寫明開返會重現「播下停下」regression——唯一作用係俾人有日誤設 env 整爛串流。剷 code 留 rationale 註解 |
| P2-3 | `/api/audio` legacy route 收乾 ⚙️ | `backend/routes/audio.js:11-14,32-75,103` | proxy 模式恆假(`AUDIO_PROXY_TARGET` 冇人 set)、resolve route 零 client(前端全行 `/api/stream`)、`export {cache}` 零 importer。**`/api/audio/cache/stats` 係有用觀察口要留** |
| P2-4 | `/api/client-log` 冇 rate limit ⚙️ | `backend/routes/clientLog.js:27` | 無認證係特登(watchdog 冇網都要報到),但「無認證+無限速+上游有高頻開關」夾埋唔穩陣。現成 `lib/loginRateLimit.js` 掛落去 ~3 行 |
| P2-5 | `CACHE_SIZE_CEILING=1800` 落後庫存 ⚙️(要先量) | `backend/server.js:432,447` | 訂嗰陣庫存 1,744,而家 6,053——追落後 timer 最多冚 30% 就熄火。同 2026-07-29 修過嗰單同 class 但方向掉轉。**未即時咬到**(disk cache 568 條),落刀前要先量 warm hit rate,同埋一齊檢討 `KEEPWARM_MAX_PER_DAY=800` 嘅超賣數學(§C1 詳見 agent 報告) |
| P2-6 | 兩層 theme 收乾 📱 | `src/theme/designSystem.js`(7 個死 export)、`src/constants/theme.js`(成個 shim 得 App.js 2 個用位,檔頭「10+ 檔 import 緊」係假話,兩個 `COLORS` 撞名係第二次中伏位) | App.js 兩個用位改 `DesignColors`,剷 shim + 死 export |
| P2-7 | `/api/internal/activity` 休眠鏈複核 ⚙️ | `server.js:193` + `growLibrary.js:106-121` | 無認證 route + `THROTTLE_FOR_LISTENERS=false`,2026-07-21 拍板「暫時未開」到而家一個月零執行。要 Eric 覆一句:仲開唔開?唔開就剷 |
| P2-8 | 零 import 嘅 dependency 🏗️ | `package.json`:`expo-status-bar`、web 三件套(`react-native-web`/`react-dom`/`@expo/metro-runtime`)、`expo-web-browser` | 要決定 web 平台仲要唔要;⚠️ `react-native-reanimated`/`react-native-worklets`/`expo-font` 表面零 import 但係 peer/babel/plugin 依賴,**唔剷得** |

### P3(cosmetic/歸檔)

- **格式 waterfall 殘留 `/18/`** ⚙️:`fetchLyrics.js:474` + `producer-keeper.sh:140`——YouTube 8/18 起唔派 format 18,同檔註解自己都咁講;兩份字串仲要係逐字 copy,會 drift。抽單一來源或加交叉註解。
- **7 個 legacy `.cjs` 仲用 bare `yt-dlp`(PATH→brew 版)**:`expand_hymns*.cjs` 等一次性擴庫 script,唔喺 14 個 call site 範圍、平時唔行,但正係 `ytdlpBin.js` 警告嗰種「靜靜哋第二條 path」入口。歸檔或跟 `generate_hymns.js` 先例收編。
- **scripts/ 大掃除**:25 個零 reference 一次性檔(oneoff-delist 系列/catalog fetcher/已完成 migration)→ 建議 `scripts/archive/` + `backend/legacy/` **搬唔剷**(delist 稽核紀錄+schema 定義有歷史價值);⚠️ `reconcileUserRefs.js` 唔係 dead,係 pending(DELISTED report 寫明要定期跑,值得考慮排入夜間排程)。
- **前端零碎**:`web-build.js`(孤兒,9 行)、`assets/splash-icon.png`(零引用+同 android-icon-foreground byte-identical,291KB)、`AdminEditHymnSheet.js:17` unused `Keyboard` import、`useScreenTopPad`/`todayKey`/`seededShuffle` 死 export、`PHONE_AUTH_ENABLED` 恆真+`AuthScreen.js:32`/`PhoneLoginScreen.js:6` 兩段註解講緊反話、`app.json` `LSApplicationQueriesSchemes:["youtube"]` 已死 🏗️。
- **`failCache` 反推 timestamp 耦合**:`resolveAudio.js:229` 用 `failedUntil - FAIL_TTL_MS` 反推,同 `audio.js:92` 公式硬耦合,改存 `{failedAt}` 拆開(純 refactor)。
- **唔建議做**:21 個多餘 `import React`(零收益大 diff)、`ios/Pods` 清磁碟。

### 驗證過「唔好郁」嘅清單(防止下手誤剷)

backend `backoffMsFor`/`attemptFetch` bust 重試/`sameFormat` 守衛/iOS webm→502/fMP4 duration 三個施用點(各守一條數據路徑,冇一個係重複)/B7-3 evict/429 全局冷卻/preVerify 2MiB+416 分支/`bytes=0-` 反節流;前端三個 watchdog/D2 playWhenReady guard/PlaybackError retry+熔斷/generation counter/下架佔位過濾;producer-keeper 403 斷路器。詳細理由喺 agent 報告 §D4,呢度只留清單。
⚠️ **耦合警告**:`App.js:1295` `BUFFERING_STUCK_SKIP_TICKS=30` 係由「12s×3 strategies」推導——將來任何改 strategy 數量嘅嘢要連呢個常數一齊重算。

---

## §5 Batch 建議

**Batch A「即刻可做」⚙️(零 restart 零 OTA 零 build,~1 個鐘)**
P1-2 git rm 六檔 · P1-3 healthcheck 文案 · P1-4 ledger prune script(要行 lock 紀律)· P1-5 config block · P3 嘅 web-build.js/splash-icon.png/format-18 兩行 · scripts 歸檔搬遷
→ 交 Sonnet 5 一個 session 掃晒,唔使掂任何行為邏輯。

**Batch B「下一次 OTA 夾埋」📱**
P1-1 閂三處 `always:true` · P2-1 量度守衛 · P2-6 theme 收乾 · P3 前端零碎(unused import/死 export/PHONE_AUTH 註解)
→ 呢批同 `1768a5b`(Android 飛歌修復,本身已等緊 OTA)一齊推最抵。

**Batch C「下一次 native build 夾埋」🏗️**
P2-8 死 dependency · P3 LSApplicationQueriesSchemes
→ 唔使特登開 build,等下次有其他原因出 build 先執。

**Batch D「要拍板/要先量數」**
1. **Phase 2.5 第一首預載**(§3):今晚數據實錘 iOS 第一首 9 秒瓶頸喺 AVPlayer 端、而本地檔路徑實測 0.17 秒——建議升優先度,方案跟 IOS-ANDROID-PARITY Phase 2 現成機制延伸(開 app queue ready 之後即預載第 1 首)。
2. P2-5 warm 策略重訂(先量 warm hit rate 再郁)。
3. P2-7 `/api/internal/activity` 開定剷。
4. tv/default-any resolve strategy 值唔值得留:agent 數過歷史數據只救 ~6.5%,但溝埋舊 binary 年代,**要用純統一後窗口重數**先好落刀(仲要連動 §4 耦合警告)。

---

## §6 誠實申報(今晚郁過啲乜)

本 round 定位「唔落 code」,實際有以下暫時性操作,全部已還原:
1. `src/config.js` `DIAG_ENABLED` false→true→**false**(量度用,`git diff` 確認乾淨,冇 commit)。
2. Android 模擬器上兩次誤撳「心心」幫《給夢想一雙翅膀》(6319)加咗最愛(個心心 touch target 闊過 ▶ 好多)——**兩次都即場撳返、player「最愛」chip 確認還原**。順帶觀察:呢個 hit target 問題真機都可能中,但今次唔算實錘 UX bug(模擬器 tap 精度所限),唔入清單。
3. iOS 沙箱 3 個上輪種落嘅 m4a 搬走咗(scratchpad 有 backup;佢哋本來就係上輪測試 artifact,app 會自己重新預載)。
4. growlibrary 排程 unload→load(§1)。
5. 開過 metro/兩個模擬器,已全部熄。

## §7 建議下一步

1. Eric 過目 §5,拍板 Batch A/B 開唔開(跟返 Fable5 規劃 → Sonnet5 執行 → Opus5 驗收節奏;Batch A 零風險可以即開)。
2. Batch D-1(第一首預載)值得單獨出一份執行規劃,今晚數據已經夠做 §before 基準。
3. 下次想攞 release-build 級數嘅絕對值,可以喺 Eric 真機行一晚 `DIAG_ENABLED=true` 收自然分佈(記得 P2-1 修咗先,唔係啲數會溝入假快數)。
