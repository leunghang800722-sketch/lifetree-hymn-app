# Odely — 架構總覽（Master Blueprint）

> **v2（2026-10-18）—— 取代 v117（2026-06-01，原文見 git `0de3b6c`）。**
> 舊版「雙電梯／Spotify 綠／MaterialIcons」已於 2026-07 REDESIGN-PLAN 同 Ode 品牌化取代。
> 本文件 = 架構總覽（點砌）；「唔准掂」嘅清單同改動程序喺 `HYMN-APP-IRON-RULES.md`。
> 行號以 `frontend/hymn-app/App.js` 2026-10-18 為準，會漂移，以函數／常數名為主。

## 目錄
一、播放器佔位結構　二、Sheet 層　三、Icon 與設計系統　四、資料流與 store　五、播放路徑（HLS／progressive）　六、Watchdog 三層　七、部署與監察　八、仍然有效嘅舊規

## 一、播放器佔位結構
- 全螢幕播放器係 `olStyles.overlay`（`position:absolute` + 不透明底色 + `zIndex:999`），所有播放器 UI 都喺佢個 container 入面。
- 垂直次序：影片 → 封面／歌名／功能列 → 控制列 → 播放清單 sheet（最後一個 child，見二）。**雙電梯（Handle／Controls 差速平移）已廢**，由 gorhom 手勢引擎取代（REDESIGN-PLAN §3.4 拍板）。
- 「黃金差速」嘅效果保留（彈出時封面＋控制列成組上移），但由 sheet 手勢帶動，唔再有手寫 `CONTROLS_LIFT` 數值規範。

## 二、Sheet 層（兩套，唔好混）
1. **播放清單 sheet = inline gorhom `<BottomSheet>`**（App.js:3848，兩個 snap point：collapsed 常駐＋88%）。
   - 必須 inline、擺喺 overlay container 最後一個 child。原因（App.js:72–99 註解）：`<BottomSheetModal>` 會 portal 去 `<BottomSheetModalProvider>` 嘅 hosting container，嗰個係 absoluteFill 但**冇 zIndex**，而成個 App 連 `zIndex:999` overlay 都喺 `{children}` 入面 → sheet 其實 present 咗，但畫喺不透明 overlay **下面**，用家見唔到。v228 誤判成 reanimated 版本問題；真因係 z-order。
   - sheet 入面嘅掣用 gorhom 嘅 `TouchableOpacity`（`SheetTouchable`，App.js:91–95），RN 內置嗰個喺 Android 會被 pan gesture 搶 touch。
   - 清單用 `BottomSheetFlatList`；唔用 `enablePanDownToClose`（sheet 常駐，向下滑 = 收返 collapsed）。
2. **其餘 8 個面板 = `src/components/SheetShell.js` 統一殼**（SHEETSHELL-EXEC-20260906）：variant `bottom`（RNGH `Gesture.Pan` 下滑收起＋flex:1 backdrop）／`center`（上下兩嚿 flex:1 backdrop 企正中）／`fullscreen`（只供 Modal＋GestureHandlerRootView，唔畫 chrome）。起因係每個面板抄一套 Modal＋手勢、抄漏手勢（AddToPlaylistSheet 滑唔到收起）。新面板一律用 SheetShell，唔准再自砌 Modal。
- 兩套都唔用 `absoluteFillObject` 做 backdrop（收唔到 touch，07-29 實證）；亦唔用 PanResponder（New Architecture 下收唔到 move 事件）。

## 三、Icon 與設計系統
- **OdeIcon 單一來源**：`src/icons/OdeIcon.js`（讀 `odeIcons.js` 嘅 `ODE_ICONS`，24×24、stroke 1.75）。全 App 只用呢個出 icon；禁 Emoji／文字符號當 icon，禁混用 `@expo/vector-icons`（ODE-REBRAND-PLAN §7 驗收）。
- **`src/theme/designSystem.js`**：全 App 只准用 `COLORS`（不寫死 hex）。語義：暖光 `COLORS.glow`／`glowSoft` = 播放／進度條／主 CTA／選中 tab；主色 `COLORS.primary` = 已收藏／選中 chip／連結；`textOnGlow` 用喺暖光底上嘅字；另有 `danger`、`surface`／`surface2`／`surfaceRaised`、`border`、`textMuted`／`textDim`。其他匯出：`TYPOGRAPHY`、`radii`、`effects`、`iconState`（icon 狀態色）。綠色退場、冇金色；舊 key（`accent`／`gold`／`card`…）係過渡 alias。數值唯一來源係該檔，**呢度唔抄**。品牌／色板背景見 `docs/design-ode/ODE-HANDOFF.md`。

## 四、資料流與 store
- `src/hooks/externalStore.js` 嘅 `createExternalStore`（`useSyncExternalStore`）= 高頻狀態隔離層，令更新唔觸發全 App re-render：
  - `progressStore`（App.js:405，`{currentTime, duration}`）：播放進度只住呢度，**唔再係 React state**（O1-B2）；寫入點 App.js:~2199／2210。
  - `hymnsStore`（`useCachedHymns.js`）：詩歌庫；`hymnsById` Map 隨 `setState` 重建，讀用 `getHymnById(id)`。
  - `outboxStore`（`src/sync/userSync.js`）：用戶資料同步 outbox 長度（`useOutboxLength`）。
- 新加高頻共享狀態 → 用 `createExternalStore`，唔好塞 `useState`／Context。

## 五、播放路徑
- 播放核心：react-native-track-player 一次交晒隊列俾 native，native 自己處理 next／repeat／背景自動前進（PHASE1-PLAYER-REBUILD §3.2 `playQueue`）。
- **progressive**（Android 全部＋iOS 預設）：`/api/stream/:id`。
- **HLS**（純 iOS）：`HLS_ENABLED`（App.js:158）由開機 `/api/app-version` 決定，預設 false；回退槓桿喺 backend manifest，唔寫死 JS。`toTrack(song, {forceProgressive})` 可強制降級。本地檔命中永遠贏過 HLS。
- **起播預檢＋熱換**：下一首／插播喺 trackChanged 時並行 `preflightHls`（App.js:~1137–1200，`hlsPreflightSeenRef` 去重、`hlsDowngradedTrackRef`），404／5xx 即熱換 progressive 並 `logDiag('hlsFallback')`。

## 六、Watchdog 三層（紅線，詳見 IRON-RULES §三）
Native（SwiftAudioEx 經 config plugin 打 patch，iOS build>=15，`NATIVE_WD_V2` App.js:4805；前台死線 10s＋5s ≈16s，背景 20s＋8s；plugin `plugins/withSwiftAudioExStallWatchdog.js`）／JS 輪詢 watchdog（`handleStuckTrackEnd`、`handleMidStreamStall`、`handleBufferingStuck`）／iOS HLS 起播 kick（`hlsStartupKick*`）。三條**獨立**嘅 state 讀取路徑互相補位。

## 七、部署與監察
- 一切 deploy／OTA／backend restart 只經 `ops/deploy/` 嘅 gate script（`ota-publish.sh`／`backend-restart.sh`／`apk-publish.sh`／`approve.sh`），需 Eric 批准檔；詳見 `DEPLOY-GATE-PLAN.md`、`HANDOFF.md` §2.10。
- 串流健康有 `ops/stream/` 監察（偵測＋警報＋selfheal）。**出口 IP 係成個 App 嘅命脈**（`HANDOFF.md` §2.2）。
- 模擬器收尾見 `CLAUDE.md`。

## 八、仍然有效嘅舊規
- 禁 `onLayout`／`useMemo`／動態測量驅動 Native Driver 動畫；translateY outputRange 用硬編碼常數。
- 禁 Emoji 做 icon（現為 OdeIcon）。
- Build APK 指令見 `HYMN-APP-IRON-RULES.md` §五。

> v2 · 2026-10-18。改動鐵律須先過 Eric（見 IRON-RULES）。
