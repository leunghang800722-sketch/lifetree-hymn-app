# Odely — 鐵律（唔准掂清單，PINNED）

> **v2（2026-10-18）—— 取代 v117（2026-06-01，原文見 git `0de3b6c`）。**
> 舊版「雙電梯／Spotify 綠／MaterialIcons」已於 2026-07 REDESIGN-PLAN 同 Ode 品牌化取代。
> 架構背景見 `BLUEPRINT.md`。每條格式：**乜嘢／點解／要改先要乜程序**。

## 目錄
一、UI 與動畫　二、Sheet　三、Watchdog／HLS 紅線　四、Store 與資料　五、Build／部署　六、環境與私隱

## 一、UI 與動畫
1. **唔准用 `onLayout`／`useMemo`／runtime 測量驅動 Native Driver 動畫；translateY outputRange 必須硬編碼常數。** 點解：動態值會 crash／死機（v117 血淚）。改動：要 Eric 批。
2. **Icon 只准 `src/icons/OdeIcon.js`。禁 Emoji、禁文字符號當 icon、禁混 `@expo/vector-icons`。** 點解：視覺統一（ODE-REBRAND-PLAN §7）。新 icon 加入 `odeIcons.js`。
3. **顏色只准經 `src/theme/designSystem.js` 嘅 `COLORS`／`iconState`，唔准寫死 hex，唔准開第二套色板。** 暖光 `glow` = 播放／進度／主 CTA／選中 tab；主色 `primary` = 已收藏／選中 chip／連結；綠色退場。點解：曾有兩個 `COLORS` 撞名害過人兩次。改動：改 token 值喺該檔一處；改語義要 Eric 批。

## 二、Sheet
1. **播放清單 sheet 必須 inline `<BottomSheet>`（App.js:3848），擺喺 overlay container 最後一個 child；禁止換成 `<BottomSheetModal>` 或任何 portal。** 點解（App.js:72–99）：portal 去嘅 hosting container 冇 zIndex，畫喺 `zIndex:999` 不透明 overlay 下面，sheet 開咗但永遠見唔到（v228 誤判、v229 修）。改動：先喺模擬器實測 z-order，Opus 論證＋Eric 批。
2. **gorhom sheet 入面嘅掣用 `SheetTouchable`（gorhom 嘅 TouchableOpacity），唔用 RN 內置。** 點解：Android 上 pan gesture 搶 touch（App.js:91–95）。
3. **其餘面板一律用 `src/components/SheetShell.js`（bottom／center／fullscreen），唔准自砌 Modal＋backdrop＋手勢。** 點解：8 個面板各抄一套曾漏手勢（AddToPlaylistSheet 滑唔到收起）。
4. **Backdrop／overlay 唔用 `absoluteFillObject`（用 flex:1 或 `top/left/right/bottom:0`），手勢用 RNGH，唔用 PanResponder。** 點解：07-29 實證收唔到 touch；New Architecture 收唔到 PanResponder move。
5. 清單手勢唔准用自製 PanResponder（撞 FlatList scroll）；清單用 `BottomSheetFlatList`。

## 三、Watchdog／HLS 紅線（🔴 最高危）
涉及：`handleStuckTrackEnd`、`handleMidStreamStall`（含 `MAX_MID_STALL_NUDGES_PER_TRACK=3`、nudge／giveup）、`handleBufferingStuck`（`BUFFERING_STUCK_NUDGE_TICKS=15`、`BUFFERING_STUCK_SKIP_TICKS=30`）、`BUFFERED_ADVANCING_CAP_TICKS=4`（App.js:1778）、`BACKWARD_SEEK_GRACE_TICKS`、起播 kick（`hlsStartupKick*`、`HLS_STARTUP_KICK_INTERVAL_TICKS=2`，用 `setPlayWhenReady(true)`）、`HLS_ENABLED`／`toTrack` 嘅 `forceProgressive`、HLS 預檢熱換（`hlsPreflightSeenRef`、`hlsDowngradedTrackRef`、近尾 15 秒唔換）、native 16s 死線（`NATIVE_WD_V2`，App.js:4805）、前台 10 秒緩衝提示（App.js:1708）。
1. **三條獨立 state 讀取路徑互相補位，唔准當重複而刪：** (a) event（PlaybackState／ActiveTrackChanged）、(b) `pollState()` 2 秒 `getPlaybackState()` poll（App.js:~2480，理據見 App.js:~1640：native 可卡死而唔發 event）、(c) position／duration poll（AVPlayerItem 屬性，state 卡死時仍反映播放頭）。**`pollState` 唔准刪。** `sleepPollInterval`（App.js:2147，Playing／Buffering 1 秒、閒時 2.5 秒分片）亦唔准隨便改。
2. **JS nudge 同 native 16s 死線唔可以撞：** `BUFFERED_ADVANCING_CAP_TICKS` 由 12 收窄到 4，因為 12 令 nudge ≈ tick 15 fire，同 native 斬歌打交（兩單真機實錘）。任何門檻調整須對照 native 死線留 margin。
3. **前台熔斷門檻、背景放寬、nudge 額、giveup 邏輯：唔准單獨調一個數字。** 要改：**先寫 Opus 論證（附真機 log 證據，唔係靜態推理）＋ Fable 批，再獨立 commit，改動前後 `git diff` 逐行標註，harness 全 pass。**
4. 唔准以拉長 JS 門檻代替修根因（HLS 起播已試過，被真機推翻）。
5. 唔准掂 native patch（`patches/`、`plugins/withSwiftAudioExStallFix.js`），除非有 Fable 批嘅 build 計劃。

## 四、Store 與資料
1. 播放進度只寫 `progressStore`（`createExternalStore`），唔准搬返 React state。點解：每秒全 App re-render（O1-B2）。
2. `hymnsStore.setState` 係薄包裝（重建 `hymnsById`），唔准繞過直寫 base；讀詩歌用 `getHymnById`。`outboxStore` 同理。
3. 唔准加新高頻 `useState` 去共享 UI；改用 `src/hooks/externalStore.js`。

## 五、Build／部署
- **Build APK：** `cd frontend/hymn-app/android && ANDROID_HOME=$HOME/Library/Android/sdk JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home ./gradlew assembleRelease`
- **每次 build 完必須 auto-copy：** `cp android/app/build/outputs/apk/release/app-release.apk ~/Desktop/詩歌App/hymn-app-v{版本}.apk`
- OTA／backend restart／APK publish 只准經 `ops/deploy/` gate script（需批准檔），唔准直跑原始 OTA／launchctl 命令（`DEPLOY-GATE-PLAN.md`、`HANDOFF.md` §2.10）。
- 唔准手動 bump buildNumber（autoIncrement）。
- **401 = App 即登出：** 換 `JWT_SECRET`、改 `requireAuth`、批量 token_valid_after 等會令全員登出且 OTA 救唔返，須事先 Eric 批。

## 六、環境與私隱
- **出口 IP 係命脈（`HANDOFF.md` §2.2）：** 唔准爆發式打 YouTube、唔准開機 pre-cache 全庫、唔准加快死鏈檢測；唔准觸碰 VPN 設定。
- 本地 backend 係 localhost:3001，係正式本地 port，清理 process 要放過（見 `CLAUDE.md`）。
- 文件／commit 唔准寫入密鑰、內網 IP、電話、chat id、device id。

> 任何改動以上條款，必須先獲得 Eric 批准。v2 · 2026-10-18。
