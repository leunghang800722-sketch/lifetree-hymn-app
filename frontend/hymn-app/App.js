// 詩歌App v211 TrackPlayer — 背景播放 + Ode 主題(ODE-REBRAND-PLAN)
import { COLORS as DesignColors, TYPOGRAPHY, effects } from './src/theme/designSystem';
import { useCachedHymns } from './src/hooks/useCachedHymns';
import { createExternalStore } from './src/hooks/externalStore';
import LogoRing from './src/components/LogoRing';
import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import OdeIcon from './src/icons/OdeIcon';
import TrackPlayer, {
  State as TPState,
  Event as TPEvent,
  RepeatMode as TPRepeatMode,
  Capability as TPCapability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Image, Platform, Alert, AppState,
  Modal, Dimensions, FlatList, Animated, Linking, Share, BackHandler,
  PermissionsAndroid,
} from 'react-native';
import { FavoritesProvider, useFavorites } from './src/context/FavoritesContext';
import { PlaylistsProvider, usePlaylists } from './src/context/PlaylistsContext';
import { AddToPlaylistProvider, useAddToPlaylist } from './src/components/AddToPlaylistSheet';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import AdminAddHymnScreen from './src/screens/AdminAddHymnScreen';
import SharedPlaylistSheet from './src/screens/SharedPlaylistSheet';
import { AdminEditHymnProvider } from './src/components/AdminEditHymnSheet';
import { setAuthToken, pullData, pushSync, flush as flushOutbox, getOwner, setOwner, clearOutbox } from './src/sync/userSync';
import { API_BASE, DIAG_ENABLED } from './src/config.js';
import { consumeRemotePauseExpected } from './src/playback-intent.js';
// HLS-EXEC-D123-GATE-20260901 P3 — 單機 gate 用嘅 deviceId(純 app 內隨機,
// 唔係硬件識別碼)。見 src/deviceId.js 頂部註解。
import { getOrCreateDeviceId } from './src/deviceId.js';
// IOS-ANDROID-PARITY-PLAN §5 Phase 2 — iOS 本地音頻預載。呢個 module 頂層
// 冇任何 native 依賴(expo-file-system 淨係喺 module 入面 lazy require、
// 淨係 iOS call site 先觸發),所以呢度 static import 對 Android 完全 safe。
import {
  initCache as initAudioCache,
  getLocalUri as getLocalAudioUri,
  prefetch as prefetchAudio,
  invalidate as invalidateAudioCache,
  cancelIfDownloading as cancelAudioPrefetch,
  pauseAllForStream as pauseAudioPrefetchForStream,
  resumeQueue as resumeAudioPrefetch,
  onPrefetchComplete,
  setDurationIndex as setAudioDurationIndex,
  setPinProvider as setAudioPinProvider,
} from './src/audioPrefetch.js';
import { dailyPick, dailyPickBalanced } from './src/utils/dailyShuffle';
// PHASE2.5-PRELOAD-PLAN §4 W2 —— 「即刻揀歌」現用 chip 同 HomeScreen 共用一份
// 定義/fallback 邏輯,唔可以兩邊各自實現(drift 咗預載就會靜靜哋落錯歌)。
import { CHIP_PAGE_SIZE, resolveActiveChip } from './src/utils/homeChips';
import { getHomeChip } from './src/homePrefs';
import { buildAutoplayTail, FLAVORS, poolSize } from './src/utils/autoplay';
import { getPlayLog, getRecentIds, recordPlay } from './src/playLog';
import { getAutoplayEnabled, setAutoplayEnabled, getAutoplayFlavor, setAutoplayFlavor } from './src/autoplayPrefs';
import { useInsets } from './src/hooks/useInsets';
import { getDisplayTitle } from './src/utils/displayTitle';
import { mark, useRenderCount, recordNavBeacon } from './src/perfMarks'; // PERF-BASELINE-1B-20260902
// 播放清單 / 加入到清單 sheet 用 @gorhom/bottom-sheet 嘅 **inline `<BottomSheet>`**(v229)。
//
// ⚠️ v228 曾經誤判呢個係「reanimated 4 + gorhom 5 唔夾」。真正原因係 **z-order**,唔關
// reanimated 事(版本全部係 SDK 56 bundledNativeModules 嘅官方組合,冇任何唔夾):
//   `<BottomSheetModal>` 唔會喺原地 render,佢 portal 去 `<BottomSheetModalProvider>`
//   入面嘅 hosting container。而 gorhom 個 provider 係咁 render 嘅:
//       <BottomSheetHostingContainer />   ← absoluteFill,**冇 zIndex**,排第一
//       <PortalProvider>{children}</PortalProvider>
//   我哋成個 App(連 `olStyles.overlay` —— position:absolute + 不透明底色 + zIndex:999
//   嘅全螢幕播放器)都係喺 `{children}` 入面。RN 度 zIndex 999 一定畫喺 zIndex 0 之上,
//   所以 sheet 其實 present 咗、reanimated 都 animate 緊,只不過**畫喺塊不透明 overlay
//   下面**,用家永遠見唔到 → 表徵就係「撳咗完全冇反應」。
//
// 解法:改用 **inline `<BottomSheet>`**(唔經 portal),直接擺喺 overlay 個 container
// 最後一個 child。冇咗 portal 就冇咗跨層 z-order 問題,而手勢引擎完全一樣 ——
// 向上滑彈出 / 向下滑收起照有。`BottomSheetFlatList` 由 gorhom 協調手勢同 scroll,
// 唔會有舊 PanResponder 撞 FlatList scroll 嗰個問題(HANDOFF 教訓)。
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
// ⚠️ sheet **入面**啲掣要用 gorhom 自己嗰個 TouchableOpacity(SheetTouchable)。
// RN 內置嘅 TouchableOpacity 用舊 responder 系統,喺 gesture-handler 嘅手勢區域入面
// 喺 Android 上會俾 pan gesture 搶咗個 touch,撳落去時好時壞。gorhom 個版本係
// gesture-handler 實現,同 sheet 嘅拖曳手勢正常協調。
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  TouchableOpacity as SheetTouchable,
} from '@gorhom/bottom-sheet';
// 佇列拖曳排序(§Eric v237)。放喺 gorhom sheet 入面,要關咗 sheet 嘅
// content panning(enableContentPanningGesture={false}),否則長按拖曳同 sheet
// 自己嘅下拉手勢會搶 touch。DraggableFlatList 本身用 gesture-handler + reanimated,
// 兩個都已經喺 project 度。
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

// ===== OdeIcon 圖標名稱 =====

// ===== 安全匯入 =====
let SafeAreaProvider = null, useSafeAreaInsets = null;
try {
  const sac = require('react-native-safe-area-context');
  SafeAreaProvider = sac.SafeAreaProvider;
  useSafeAreaInsets = sac.useSafeAreaInsets;
} catch (e) {}

// ===== Config =====
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ===== Ode 色板 (ODE-REBRAND-PLAN) =====
// 呢幾個常數散落用咗 60+ 次,所以唔逐個改 import,直接指返單一色板 —— 全部一次過轉色。
// GLOW_COLOR(暖光 #EFE4D2)= 播放掣/進度條/CTA/啟用狀態;PRIMARY_COLOR(主色紫
// #B9A6F2)= 已收藏/連結/靜態強調 icon。舊 ACCENT_COLOR 已經逐個用位判斷拆做
// 呢兩個(唔係機械式全換一隻色),冇金色(GOLD_COLOR)呢個概念,Ode 唔用金。
const MAIN_BG_COLOR = DesignColors.background;
const CARD_BG_COLOR = DesignColors.card;
const GLOW_COLOR = DesignColors.glow;
const PRIMARY_COLOR = DesignColors.primary;
const TEXT_ON_GLOW = DesignColors.textOnGlow;
const TEXT_PRIMARY = DesignColors.textPrimary;
const TEXT_SECONDARY = DesignColors.textSecondary;

// ⚠️ 唔好用 hqdefault.jpg —— 佢係 4:3(480x360),YouTube 會將 16:9 影片 baked 咗
// 上下兩條黑邊入去。封面容器係正方形 cover-crop,裁走咗左右之後,嗰兩條黑 bar 仲
// 喺頂同底 → 就係 Eric 見到嘅黑邊。改用 mqdefault.jpg(320x180,真 16:9,一定有,冇黑邊)。
function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
}
// 大封面用高清 16:9 版(maxresdefault 1280x720,同樣冇黑邊)。唔係每條片都有,
// 冇就 404 → onError fallback 返 mqdefault(見 <BigCover>)。
function getAlbumCoverUrlHi(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg` : null;
}

// PHASE1-PLAYER-REBUILD.md §3.2 — stable per-song URL via the backend stream
// proxy, so the whole list can be handed to TrackPlayer at once.
// IOS-ANDROID-PARITY-PLAN §5 Phase 2 — iOS 建隊列嗰刻已經盡量用本地檔:
// 有落載完成嘅 file:// URI 就用嗰個(跳過網絡),冇就照舊行 stream URL。
// getLocalAudioUri() 喺 Android/未 ready 時永遠回 null,呢個 if 淨係喺
// iOS 先會行到,Android 行為零改動。
// HLS-ROOTFIX-PLAN-20260901 §5.1:回退槓桿喺 backend 手上,唔寫死喺 JS。
// `hlsEnabled` 由下面 boot effect 喺 App 啟動時打 `/api/app-version`(App 本身
// 已經有嗰個 fetch 俾 APK 更新 banner 用,呢度加多一次獨立、輕量嘅
// no-store 讀,唔改 ApkUpdateBanner 本身嗰個 call)。開機打唔到 / 舊
// manifest 冇呢個欄位 → 保持 false,行為同今日一模一樣。
// ⚠️ HLS-EXEC-AB-20260901 紅線:階段 A/B 只喺 backend/public/app-version.json
// 手動改成 true 嚟做模擬器實測,呢個檔案出街嗰刻必須係 false。
let HLS_ENABLED = false;
// HLS-EXEC-D123-GATE-20260901 P3 — 由下面一個 cross-platform boot effect
// 填,logDiag() 用嚟俾每條 client-log 帶。填之前一律 null(未生成/未讀到),
// backend 白名單當空字串處理,唔會 crash。
let DEVICE_ID = null;

// HLS-EXEC-D-FIXES-20260901 §1.2:第二個參數俾 PlaybackError handler 嘅 D2
// 降級分支用——`forceProgressive: true` 令呢次 toTrack() 一定跳過 HLS 分支
// (唔理 HLS_ENABLED 定係咪 true),即刻攞返 `/api/stream/:id`。本地檔命中
// 判斷（下面）唔受影響,一樣可以贏。
function toTrack(song, opts) {
  let url = `${API_BASE}/api/stream/${song.id}`;
  // HLS-ROOTFIX-PLAN-20260901 §2.1:純 iOS(§2.2 拍板 Android 一個字唔准
  // 改)。AVPlayer 由 `.m3u8` 副檔名 + Content-Type 自己認出 HLS,呢度淨係
  // 換條 URL,零 native 改動。
  // HLS-EXEC-D-FIXES-20260901 §3.2(b):playlist route 由 `/api/hls/:id.m3u8`
  // 搬去 `/api/stream/:id.m3u8`——同一個 handler(routes/hls.js),但 URL
  // 字面帶住 `/api/stream/`,令 native `hymnId(for:)`(只認呢個 prefix)可以
  // parse 到 hid,唔使掂任何 native code。實測見 D4 交付。
  if (Platform.OS === 'ios' && HLS_ENABLED && !(opts && opts.forceProgressive)) {
    url = `${API_BASE}/api/stream/${song.id}.m3u8`;
  }
  if (Platform.OS === 'ios') {
    // IOS-ANDROID-PARITY-PLAN §5 Phase 2 本身嘅本地預載命中判斷——完全冇改
    // 呢兩行,擺喺 HLS 判斷之後,保證本地檔命中永遠贏 HLS(§3.2-2 紅線:
    // audioPrefetch.js 呢條路徑唔應該行 HLS)。
    const localUri = getLocalAudioUri(song.id);
    if (localUri) url = localUri;
  }
  return {
    id: String(song.id),
    url,
    title: song.display_title || song.title || 'Unknown',
    artist: song.artist || '',
    artwork: getAlbumCoverUrl(song.youtube_id),
  };
}

// BUG1 P0 — DB 用 "|" 分行儲歌詞(見 GET /api/hymns 回傳嘅 lyrics 欄),
// 舊版直接畫 cur.lyrics 出嚟,「|」就一路帶埋出嚟變成成段字中間嵌晒字面
// pipe。統一用呢個 helper 轉做真正換行:同時兼容已經有 "\n"、或者「\n」同
// "|" 兩種都用埋嘅舊資料,並且清走首尾/重複造成嘅空行。
function formatLyrics(raw) {
  if (!raw) return '';
  return String(raw)
    .split(/\r\n|\r|\n|\|/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// 段落分組 —— STAGE 3 對嘴驗證 pipeline(backend/scripts/alignLyrics.js)寫
// displayText 入 DB 嗰陣,段落之間已經用空行(\n\n)分隔咗(見 alignLyrics.js
// 嘅 displayStanzas.join('\n\n'))。呢度淨係讀返嗰個現成分界,唔重新判斷邊度
// 斷句 —— 冇空行分界嘅舊資料(純 "|" 一行到尾)就自然變返一個段落。
function formatLyricsStanzas(raw) {
  if (!raw) return [];
  return String(raw)
    .replace(/\r\n|\r/g, '\n')
    .split(/\n\s*\n+/)
    .map((chunk) =>
      chunk
        .split(/\n|\|/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    )
    .filter((lines) => lines.length > 0);
}

// §3b PERF-FAST-START-PLAN:叫 backend 預熱嗰幾首歌嘅 URL(fire-and-forget)。
// 令自動接續 / 撳「下一首」/ 開機頭幾首永遠行 warm 路徑。上限 10,backend 即回 202。
function warmIds(ids) {
  try {
    const clean = (ids || []).filter((x) => x != null).slice(0, 10);
    if (!clean.length) return;
    fetch(`${API_BASE}/api/stream/warm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: clean }),
    }).catch(() => {});
  } catch (_) {}
}

// IOS-ANDROID-PARITY-PLAN Phase 2.5 —— 「聽日」清單頭 2 首嘅 id,由 boot warm
// effect(下面 §3b①)計好擺喺度;PlayerProvider 嘅 trackChanged listener 喺
// 用戶真係聽緊歌嗰陣先排佢入落載隊(每個 app session 一次)。兩個 component
// 同喺呢個 file,用 module scope 傳遞,唔使搞 context/prop 鏈。
let tomorrowHeadIds = [];
let tomorrowQueuedThisSession = false;

// PHASE2.5-PRELOAD-PLAN §4 W4 —— firstTapSurface。開機嗰陣(§3b①)計低首屏三個
// 可預知位置嘅 id,`origin=start` 上報 nextTrackMs 嗰刻就答得返兩條問題:
// (a) 真用戶第一撳實際撳咗邊個位,(b) 嗰個位嘅本地檔命中率有幾高。
// 純粹收數 —— 呢輪唔會攞嚟即刻改行為(加碼預載等 1-2 星期真機數據,§10-4)。
let todayPickIds = [];
let chipHeadIds = [];
let recentHeadIds = [];
let firstStartLogged = false;

function classifyFirstTapSurface(songId) {
  if (songId == null) return 'unknown';
  const id = String(songId);
  if (todayPickIds.some((x) => String(x) === id)) return 'today';
  if (chipHeadIds.some((x) => String(x) === id)) return 'chip';
  if (recentHeadIds.some((x) => String(x) === id)) return 'recent';
  return 'other';
}

// STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇(2026-08-13)—— 鎖屏播25分鐘停咗嗰單,
// 查到watchdog/PlaybackError呢幾條路徑就係疑犯,但完全冇log可以睇:TestFlight
// build冇人駁Xcode,console.warn全部飛咗,下次撞到都係一樣飛盲。加呢個
// fire-and-forget beacon(同warmIds()一樣寫法),將watchdog決策嗰刻嘅state
// 送去backend,同[stream] log共用嗰條管,下次撞到就可以對返時間軸。刻意唔
// await、唔重試——診斷本身唔可以拖累/整壞播放。
// O12(FRONTEND-CODE-REVIEW-20260819)—— 根因已查完,高頻嗰批(每次轉歌
// 3-5 個 POST)預設熄咗;`{ always: true }` 淨係俾 PlaybackError/watchdog
// giveup/wallClockDrift 呢啲低頻高價值嘅信號用,唔受 DIAG_ENABLED 影響。
// 2026-08-23 更新:always 名單而家係六條 —— nextTrackMs(Phase 2.5 KPI,每次
// 真轉歌一條,**暫時性**,收夠 baseline 要覆檢)+ PlaybackError /
// handleStuckTrackEnd / handleMidStreamStall_giveup / handleBufferingStuck_giveup
// / wallClockDrift(呢五條係設計上永久開)。stateChange/trackChanged 嗰三處
// 臨時 always 已經喺 P1-1 閂返,唔好再喺 call site 加 always 嚟做臨時診斷,
// 要收高頻數就臨時開 `src/config.js` 嘅 DIAG_ENABLED。
// HLS-EXEC-PREWINDOW-20260901 §3 W-c 更新:加咗第七條 midStallNudge(第一次
// nudge 嗰刻,永久開)——同 handleMidStreamStall_giveup 一樣低頻(每首歌最多
// fire 一次,仲要喺 nudge 救唔返先會再 fire giveup),派工單 §3 明文批准
// always:true。之前呢個 nudge 淨係 console.warn 冇 beacon,令「HLS seek 完
// 假報 Playing」呢個診斷假設結構上冇資料可以證實。
function logDiag(event, extra, opts) {
  if (!DIAG_ENABLED && !(opts && opts.always)) return;
  try {
    fetch(`${API_BASE}/api/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // NATIVE-STALL-PROGRESS-PREDICATE-PLAN-20260831 v4 §4-3(STARTUP-ROOTFIX-
      // EXEC-BC-20260831 §2.4):加 platform 落每一條 client-log,兩部機
      // telemetry 撈埋一齊要靠 backend ua= 反查對號嘅盲點由呢度收工。
      // HLS-EXEC-D123-GATE-20260901 P3 — deviceId 順手堵「兩部機寫同一份
      // log 分唔開」舊病(見 memory project-multi-sim-clientlog-contamination)。
      body: JSON.stringify({ event, clientTs: new Date().toISOString(), platform: Platform.OS, deviceId: DEVICE_ID, ...extra }),
    }).catch(() => {});
  } catch (_) {}
}

// STARTUP-ROOTFIX-EXEC-BC-20260831 §2.3 —— JS 側嘅「唔驚動 breaker」nudge。
// TrackPlayer.play() 最終會行到 native AudioPlayer.play(),嗰度 build 16 patch
// 咗嘅 swStallWatchdog.onUserPlay() 會將呢個當做「用戶明文撳播」去 reset
// breakerLatched/consecutiveSkips——一個自動 nudge 假扮成用戶意圖係唔啱嘅。
// react-native-track-player 官方已經 export 咗 setPlayWhenReady(),直接寫
// AudioPlayer.playWhenReady 個 setter,完全唔經 play(),天然就唔會觸發
// onUserPlay(native AVPlayerWrapper.swift/RNTrackPlayer.swift 已核實,見
// STARTUP-ROOTFIX-EXEC-BC-20260831 交付報告)。
function swNudgePlay() {
  return TrackPlayer.setPlayWhenReady(true);
}

// ===== CoverImage with fallback =====
// §5.4 fallback 用向量圖標,唔用 Emoji 🎵。(fallbackIcon 舊 prop 仍收但只用嚟兼容,
// 唔再當文字render。)
function CoverImage({ youtubeId, style }) {
  const [failed, setFailed] = useState(false);
  const uri = getAlbumCoverUrl(youtubeId);
  if (!uri || failed) {
    const flat = StyleSheet.flatten(style) || {};
    const size = Math.min(flat.width || 44, flat.height || 44);
    return (
      <View style={[{ backgroundColor: DesignColors.cardLight, justifyContent: 'center', alignItems: 'center' }, style]}>
        <OdeIcon name="musicNote" size={Math.max(16, size * 0.45)} color={TEXT_SECONDARY} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} onError={() => setFailed(true)} />;
}

// ===== 播放頁大封面 =====
// tier 0 = maxresdefault(1280x720 高清 16:9),1 = mqdefault(320x180 16:9),2 = 向量 fallback。
// B4 修(第二版):容器返咗做正方形(見 coverWrap),但唔少 YouTube 縮圖本身
// 個「相片」係方形專輯封面俾 YT 加咗色帶再存做 16:9 檔(例:掛號信
// K4T7-k0aZUs——色帶係燒死喺 JPEG 像素入面,唔係容器/resizeMode 整出嚟,
// 正方形 cover-crop 裁走晒側邊色帶,但相入面自己嵌住嘅頂/底白邊有時仲留低
// 一線)。做法跟返正牌音樂 App:auto-fallback 之外,加多層「同一張圖、放大
// 再 blur」做背景墊底,前景正常靚圖疊喺上面——殘留嗰線就融入返個模糊色場,
// 唔會再讀成一條突兀嘅黑/白 bar。前景同背景一定用同一個 uri(同一 tier),
// 唔會出現背景先 fallback 咗前景仲未 fallback 嘅唔同步情況。
function BigCover({ youtubeId }) {
  const [tier, setTier] = useState(0);
  useEffect(() => { setTier(0); }, [youtubeId]);
  if (!youtubeId || tier >= 2) {
    return (
      <View style={fsStyles.coverFallback}>
        <OdeIcon name="musicNote" size={90} color={TEXT_SECONDARY} />
      </View>
    );
  }
  const uri = tier === 0 ? getAlbumCoverUrlHi(youtubeId) : getAlbumCoverUrl(youtubeId);
  return (
    <>
      <Image
        source={{ uri }}
        style={fsStyles.coverBackdrop}
        resizeMode="cover"
        blurRadius={Platform.OS === 'android' ? 30 : 25}
        pointerEvents="none"
      />
      <Image
        source={{ uri }}
        style={fsStyles.coverImg}
        resizeMode="cover"
        onError={() => setTier((t) => t + 1)}
      />
    </>
  );
}

// ===== 清單用嘅心心掣 =====
// 播放清單 / 加入清單 每一行右邊都有,一撳即加入(或者移出)最愛,唔使入返播放頁。
// 用 Pressable + hitSlop:個 icon 細,唔撐大觸控範圍好易撳唔中兼撳親成行(變咗跳去播歌)。
function FavHeart({ hymn }) {
  const { isFavorite, toggleFavorite } = useFavorites() || {};
  if (!hymn?.id || typeof toggleFavorite !== 'function') return null;
  const on = typeof isFavorite === 'function' ? isFavorite(hymn.id) : false;
  return (
    <TouchableOpacity
      onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(hymn); }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ paddingLeft: 14, paddingVertical: 2 }}
      activeOpacity={0.6}
    >
      <OdeIcon
        name="heart"
        filled={on}
        size={20}
        color={on ? PRIMARY_COLOR : TEXT_SECONDARY}
      />
    </TouchableOpacity>
  );
}

// 統一去 useInsets(唯一來源)。之前呢度自己一套 fallback(android 硬寫 20),
// 三鍵導航列實際係 48dp,所以 tab 掣同 collapsed sheet 都會俾導航列食咗一截。
function useBottomInset() {
  return useInsets().bottom;
}

// BATCH5 O7:改用 AbortController——舊嘅 Promise.race 逾時之後底層 fetch
// 連線唔會斷,慢網下會同 retry 疊住背景繼續拉多幾份全量。而家逾時會真
// abort 底層 fetch,throw 嘅係 AbortError(唔再係自製 Error)——兩邊全部
// caller 已核實只 catch 完回 null/空,冇人讀 error message,語義安全。
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function safeFetchHymnDetail(id) {
  try { const r = await fetchWithTimeout(`${API_BASE}/api/hymns/${id}`); if (!r.ok) return null; return (await r.json())?.data || null; }
  catch (e) { return null; }
}
// ================================================================
//  GLOBAL PLAYER CONTEXT
// ================================================================
const PlayerCtx = createContext();

// O1-O2-REPLAN-20260819.md §3.2(Commit B1+B2)—— currentTime/duration 每秒轉
// 一次係全 app 每秒 re-render 嘅唯一源頭(§1 grep 實證),所以搬出 React
// state,移入同 useCachedHymns 共用嘅 external store,進度條抽做細 component
// (ProgressSection)自己訂閱。播放中每秒得 ProgressSection 一個 component
// re-render;PlayerProvider/AppContent/三個 tab 唔再受影響。
const progressStore = createExternalStore({ currentTime: 0, duration: 0 });
function usePlayerProgress() { return progressStore.useStore(); }

function PlayerProvider({ children }) {
  // FRONTEND-CODE-REVIEW-20260819 §4 #4 — noticeStyles.wrap 個 top 淨係靠
  // StatusBar.currentHeight(iOS 永遠 undefined),恆用 44 會喺 Dynamic
  // Island 機(iPhone 14 Pro+)撞落去。改用 safe-area insets.top。
  const noticeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  const [currentHymn, setCurrentHymn] = useState(null);
  const [hymn, setHymn] = useState(null);
  const [hymns, setHymns] = useState(null);
  // currentTime/duration O1-B2(O1-O2-REPLAN-20260819.md §3.2)拔咗出去,
  // 淨係住喺 progressStore(見 §319 附近),唔再係 React state —— 呢個先係
  // 全 app 每秒 re-render 嘅根治位。
  const [repeatMode, setRepeatMode] = useState(0); // 0=off, 1=repeat-all, 2=repeat-one
  const [isShuffled, setIsShuffled] = useState(false);
  // §3.6 — real shuffle. Rebuilds the whole TrackPlayer queue with the current
  // song first, via reset() + add(). Earlier attempts reordered the LIVE queue
  // with remove([~1500 indices]) then removeUpcomingTracks()+add(); both left
  // the original order playing (bulk removal of ~1500 tracks is unreliable at
  // that scale). reset() is a single native op that can't partially fail, and
  // add() at full scale is already proven (it's how playback starts). The one
  // cost is a brief re-buffer of the current song (we seek back to where it
  // was) — an acceptable trade for shuffle that actually works.
  const toggleShuffle = useCallback(async () => {
    try {
      const q = queueRef.current;
      if (!q.length) { setIsShuffled(s => !s); return; }
      // Identify the current song robustly, not relying solely on
      // getActiveTrackIndex (which can momentarily return undefined).
      let idx = await TrackPlayer.getActiveTrackIndex();
      if (typeof idx !== 'number' || idx < 0 || idx >= q.length) idx = currentQueueIndexRef.current;
      if (typeof idx !== 'number' || idx < 0 || idx >= q.length) idx = 0;
      const cur = q[idx];
      let position = 0;
      try { position = (await TrackPlayer.getProgress()).position || 0; } catch (_) {}
      // Remember whether we were playing: reset() stops playback, so we have to
      // resume deliberately afterwards (and must NOT start playing if the user
      // had it paused).
      let wasPlaying = false;
      try {
        const raw = await TrackPlayer.getPlaybackState();
        const st = typeof raw === 'object' && raw !== null ? raw.state : raw;
        wasPlaying = st === TPState.Playing || st === TPState.Buffering;
      } catch (_) {}

      let newQ;
      if (!isShuffledRef.current) {
        // On: current song first, everything else Fisher-Yates shuffled after.
        const rest = q.filter(s => String(s.id) !== String(cur.id));
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        newQ = [cur, ...rest];
      } else {
        // Off: original order, rotated so the current song stays current.
        const orig = originalQueueRef.current?.length ? originalQueueRef.current : q;
        const oidx = Math.max(0, orig.findIndex(s => String(s.id) === String(cur.id)));
        newQ = [...orig.slice(oidx), ...orig.slice(0, oidx)];
      }

      queueRef.current = newQ;
      setQueue(newQ);
      // 洗完牌之後,「邊度開始係自動接續」呢個 index 已經冇意義,清走條分隔線,
      // 唔好留條線喺個完全唔同嘅位度呃人。插播分隔線同理(§3.2)。
      setAutoRadioFrom(null);
      setInsertBoundary(null);
      currentQueueIndexRef.current = 0;
      setCurrentQueueIndex(0);
      await TrackPlayer.reset();
      await TrackPlayer.add(newQ.map((s) => toTrack(s)));
      // Restore position BEFORE resuming. play() must be the last action here:
      // seeking right after play() left the player stalled at 0:00 (the queue
      // was correct but playback sat paused).
      if (position > 1) { try { await TrackPlayer.seekTo(position); } catch (_) {} }
      if (wasPlaying) { expectPlayingRef.current = true; try { await TrackPlayer.play(); } catch (_) {} }
      setIsShuffled(!isShuffledRef.current);
    } catch (e) {
      console.warn('toggleShuffle error:', e?.message || e);
    }
  }, []);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  // PHASE1-PLAYER-REBUILD.md §3.5 — single source of truth for the actual
  // playback queue, written only by playQueue()/shuffle.
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  const originalQueueRef = useRef([]); // pre-shuffle order, for shuffle-off restore
  const [trackState, setTrackState] = useState(TPState.None);
  const trackStateRef = useRef(TPState.None); // stuck-track-end watchdog 用(§見下面 poll effect)
  const [queueReady, setQueueReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const progressRef = useRef(null);
  const currentQueueIndexRef = useRef(0);
  const playLogTimerRef = useRef(null); // §3a:30 秒「算一次播放」計時器
  const repeatModeRef = useRef(0);
  const isShuffledRef = useRef(false);
  const errorSkipCountRef = useRef(0); // §3.7 — consecutive PlaybackError count
  // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.2 —— 「呢首 track 有冇試過真
  // 播放」旗標,喺 poll loop 見到 position>0.5 就 set true(見下面),
  // PlaybackActiveTrackChanged 轉去下一首嗰刻讀舊值、清返 false 俾新 track。
  // 淨係 iOS build>=15(NATIVE_WD_V2)先會寫呢支 ref,其他平台永遠停留喺
  // 初始值,唔會影響任何現有邏輯(冇任何舊 code 讀呢支 ref)。
  const trackHasPlayedRef = useRef(false);
  // STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13 D2 —— 「呢個app自己有冇主動叫過
  // pause()」嘅意圖旗標。呢個file入面嘅pause()/play() call site全部直接set
  // 呢支flag(§4.4 揪出嘅native quiet-shutoff聽`Event.PlaybackPlayWhenReadyChanged`
  // 要靠呢支flag分辨「我哋自己想暫停」定「native靜靜哋熄咗」)。
  // STREAM-LOCKSCREEN-PAUSE-RESUME-BUG-2026-08-17 —— track-player-service.js
  // 嘅RemotePause/RemoteStop(鎖屏/耳機/Control Center暫停/停止掣)行喺獨立
  // event-listener context,冇呢個ref可以碰,而家經playback-intent.js呢個共用
  // module,喺下面D2嘅PlaybackPlayWhenReadyChanged listener入面consume返嚟同步
  // 呢支flag(見下面)。H2(9f078d0,FRONTEND-CODE-REVIEW-20260819)已經補埋
  // RemoteDuck permanent:true分支(用戶接聽電話等唔應該恢復嘅情況)——
  // track-player-service.js嘅RemoteDuck handler見到paused===true就無條件
  // markRemotePauseExpected(),唔理permanent係咪true,呢個D2 guard唔會再誤判。
  const expectPlayingRef = useRef(false);
  // D2 anti-fight(NATIVE-STALL-WATCHDOG):上次「unexpected playWhenReady-off」時間戳
  const unexpectedOffAtRef = useRef(0);
  // BG-PLAYBACK-STOPS-PLAN Fix A — 記住上次 warmIds() 暖過嘅 id 串,防止連環
  // 換歌/撳「下一首」狂 POST /warm(同一組 3 首唔會重覆 call)。
  const lastWarmedKeyRef = useRef('');
  // BG-PLAYBACK-STOPS-PLAN Fix B — 記低而家 AppState,俾 PlaybackError 熔斷器
  // 判斷前台/背景走邊條路(前台行為完全不變,門檻 3;背景門檻放寬到 10、
  // 唔即場 Alert)。pendingPlaybackNoticeRef 存住背景觸發熔斷之後、等用戶返
  // 前台先顯示嘅提示文字(背景彈 Alert 等於冇彈,用戶淨係見到「靜靜哋停咗」)。
  const appStateRef = useRef(AppState.currentState);
  const pendingPlaybackNoticeRef = useRef(null);
  // BUG2 P0 — 記低「呢首歌已經 retry 過一次未」,先至知道下次撞 PlaybackError
  // 係要再 retry 定係死心跳下一首。存 song id(唔係 index),因為 retry() 唔會
  // 改變 index,兩次錯誤事件個 index 一樣,靠 id 分辨「係咪同一首」。
  const retriedTrackRef = useRef(null);
  // HLS-EXEC-D-FIXES-20260901 §1.2 D2 —— 記低「呢首歌已經因為 HLS playlist
  // 播唔到而降級去 progressive 過未」,同 retriedTrackRef 一樣存 song id、
  // 一樣淨係記「最近一次」(唔係 Set)。目的:一首歌只准降級一次,唔准
  // HLS↔progressive 嚟回彈(§1.2 第4點紅線)。
  const hlsDowngradedTrackRef = useRef(null);
  // IOS-ANDROID-PARITY-PLAN Phase 1 —— 轉歌感知延遲真機量度。t0 喺「轉歌動作」
  // 嗰刻 set(用戶撳掣優先;native auto-advance 就用 PlaybackActiveTrackChanged
  // 嗰刻),t1 = 之後第一次 state=Playing。t1 必須「見過 trackChanged」先算數
  // (trackChangedSeen),否則舊 track 遲到嘅 Playing event 會搶閘做出 0ms 假數。
  // 相減就係用戶感受緊嘅「等幾耐先有聲」,經 logDiag('nextTrackMs') 打返 backend
  // 收 baseline。detail 內 source 標明播緊嘅係串流定本地檔(Phase 2 先會有 local),
  // Android 一樣上報——正好攞埋「Android 感知延遲」做對照組。
  const transitionT0Ref = useRef(null); // { ts, origin, trackChangedSeen, hymnId }
  // BUG2 P0 — 單曲載入失敗嘅輕量非阻擋提示(唔用會擋住成個畫面嘅白色系統
  // Alert)。noticeTimerRef 用嚟蓋過上一個未完嘅計時器,唔會提早收咗新嗰句。
  const [noticeText, setNoticeText] = useState(null);
  const noticeTimerRef = useRef(null);
  // Phase 1 量度收尾:由 PlaybackState listener(主)同 poll loop(fallback,
  // 冚「state event 冇嚟/轉歌時 state 冇離開過 Playing」)兩度呼叫。只掂 refs,
  // 邊個 render 嘅 closure 版本都得。>60s 當過期唔上報(中間可能 suspend 過,
  // 嗰啲數屬於「自己停」事件,唔應該溝入轉歌延遲分佈)。
  function finishTransitionMeasure() {
    const t0 = transitionT0Ref.current;
    // t0.pending:getActiveTrack() 係 async,兩個 Playing event 連住嚟會重入。
    if (!t0 || !t0.trackChangedSeen || t0.pending) return;
    const ms = Date.now() - t0.ts;
    if (ms > 60000) { transitionT0Ref.current = null; return; }
    t0.pending = true;
    TrackPlayer.getActiveTrack()
      .then((t) => {
        t0.pending = false;
        if (transitionT0Ref.current !== t0) return; // 期間俾新一次轉歌換走咗
        const src = t && t.url && String(t.url).indexOf('file:') === 0 ? 'local' : 'stream';
        // THIRD-PASS-REVIEW §3.4 / P2-1 —— 假快數守衛。實錘(2026-08-22 15:16:36,
        // id=68):beacon 報 ms=382,但同一秒 log 次序係 nextTrackMs(382ms) →
        // from=none to=buffering → 8.4 秒後先 from=buffering to=playing。即係
        // **舊 track 遲到嘅 Playing event** 喺 trackChanged 之後、新 track 開
        // buffer 之前搶咗閘。呢度要求 stream 樣本一定要見過 buffering/loading
        // 先算數;見唔到就唔清 t0,等真嗰個 Playing 嚟到再計(ms 會重新計)。
        // source=local 豁免:本地檔真係可以 <500ms 就出聲,佢唔會 buffer。
        if (src !== 'local' && !t0.bufferingSeen) return;
        transitionT0Ref.current = null;
        // W4:第一首(origin=start)先報 surface —— 轉歌(tapNext/auto)冇「入口」
        // 呢個概念。first=1 標住成個 app session 嘅第一撳,分析嗰陣唔使靠時間戳估。
        let extra = '';
        if (t0.origin === 'start') {
          const first = firstStartLogged ? 0 : 1;
          firstStartLogged = true;
          extra = ` surface=${t0.surface || 'unknown'} first=${first}`;
        }
        // 2026-08-23 Eric 拍板開返呢條(同 P1-1 閂嗰三條分開睇待:嗰三條係
        // 「證據已經攞夠」嘅臨時 beacon,呢條係 Phase 2.5 嘅 KPI,由 8-14 埋咗
        // 點到而家一條真機數據都未收過 —— `DIAG_ENABLED` 由引入到今日從未
        // ship 過 true,所以唔加 always 就等於推咗都收唔到 W4 嘅 surface/first)。
        // 量:每次真轉歌先至一條(仲要過埋上面 bufferingSeen 守衛),同
        // trackChanged 嗰種「一 fire 就一條」唔同級,亦遠低過 stateChange 嘅
        // 每首 4-6 條。收夠 Phase 2.5 baseline(§8.1 講嘅冷/暖/命中分佈)之後
        // 要返嚟覆檢,唔係當佢同 PlaybackError 嗰批一樣永久開。
        logDiag('nextTrackMs', {
          appState: appStateRef.current,
          hymnId: typeof t0.hymnId === 'number' ? t0.hymnId : null,
          detail: `ms=${ms} origin=${t0.origin} source=${src}${extra}`,
        }, { always: true });
      })
      .catch(() => { t0.pending = false; });
  }
  const showNotice = useCallback((msg) => {
    setNoticeText(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNoticeText(null), 2800);
  }, []);

  // IOS-ANDROID-PARITY-PLAN §5 Phase 2 —— boot scan(建 in-memory index)+
  // 隊列熱換訂閱。獨立於 queueReady,一開 app 就跑;getLocalAudioUri()/
  // prefetchAudio() 喺 index 未 ready 之前只會係「冇本地檔」,唔會出錯。
  // Android 上 initAudioCache()/onPrefetchComplete() 都係 no-op(見
  // audioPrefetch.js),呢個 effect 喺 Android 上等於冇行過。
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    initAudioCache();
    // ROOTFIX-2026-08-24 防線A —— 話俾 prune() 知隊列而家參照緊邊啲 id:由
    // 「倒數三首」(curIdx−3,Eric 拍板)起到隊尾,pin 住唔准剷。用 ref 現讀,
    // 唔使跟 queue state 重新註冊;id 統一 String()(cache 檔名係 string)。
    // 再舊嘅(curIdx−4 之前)交防線B/B′自癒——production 實錘(2026-08-24)
    // 隊列 70 首時第 4/5 首個檔俾 prune 剷走,呢個 provider 就係嗰單嘅根治。
    setAudioPinProvider(() => {
      const q = queueRef.current || [];
      const from = Math.max(0, (currentQueueIndexRef.current ?? 0) - 3);
      return new Set(q.slice(from).map((s) => String(s?.id)));
    });
    const unsubscribe = onPrefetchComplete((songId) => {
      (async () => {
        try {
          const q = queueRef.current || [];
          const curIdx = currentQueueIndexRef.current ?? 0;
          const idx = q.findIndex((s) => String(s.id) === String(songId));
          // 永遠唔掂播緊嗰首、唔掂 current 之前嘅。
          if (idx <= curIdx) return;
          const song = q[idx];
          if (!song) return;
          if (idx === curIdx + 1) {
            // 避開 native auto-advance 交接嘅 race:就快跳去下一首(尾
            // 15 秒內)嗰陣唔好換,等佢自然過渡完先算。
            let prog = null;
            try { prog = await TrackPlayer.getProgress(); } catch (_) {}
            if (prog && prog.duration > 0 && prog.position > prog.duration - 15) return;
          }
          const swappedTrack = toTrack(song); // toTrack() 而家已經會揀返本地 URI
          try {
            await TrackPlayer.remove(idx);
            await TrackPlayer.add(swappedTrack, idx);
          } catch (_) { /* 換失敗就算數,原本 stream URL 照行 */ }
        } catch (_) {}
      })();
    });
    return () => { unsubscribe(); setAudioPinProvider(null); };
  }, []);

  // Lazy TrackPlayer initialization — runs on first play, not on mount
  const playerReadyRef = useRef(false);
  const optionsAppliedRef = useRef(false);
  const initInFlightRef = useRef(null);
  // H6 修 — playQueue() 冇並發保護嘅排隊 ref,見下面 playQueue() 定義。
  const playQueueChainRef = useRef(Promise.resolve());
  // BATCH7 B7-11 — playQueue() generation counter,見下面 playQueue() 定義。
  const playQueueGenRef = useRef(0);

  // RNTP 嘅播放器選項(capabilities / 媒體通知 / swipe 走行為)。抽做一個
  // function 係因為佢而家要可以**重試**同**返前台時重新 apply**,唔再係
  // 一次性。詳見下面 applyPlayerOptions 個註解。
  const buildPlayerOptions = useCallback(() => ({
    capabilities: [
      TPCapability.Play,
      TPCapability.Pause,
      TPCapability.SkipToNext,
      TPCapability.SkipToPrevious,
      TPCapability.SeekTo,
      TPCapability.Stop,
    ],
    compactCapabilities: [
      TPCapability.Play,
      TPCapability.Pause,
      TPCapability.SkipToNext,
    ],
    notificationChannel: {
      id: 'hymn-app',
      name: '詩歌播放',
      importance: 1,
    },
    icon: require('./assets/notification-icon.png'),
    // 2026-07-29 QUEUE-UX-4FIXES §4/§7-2、Eric 明確要求(推翻 §3.2 舊決定):
    // 手指 swipe 走成個 app,音樂要即刻停,連 mini player bar／通知欄都要
    // 一齊取消 —— 唔係之前「背景繼續播」嗰個情境(嗰個係用戶撳 Home
    // 掣去背景,app process 冇死,唔受呢個設定影響,見下面 resyncFromNative
    // 嘅 AppState 'active' 分支)。原本 ContinuePlayback 令 swipe 走之後
    // service 仲生存、繼續出聲,同「swipe 走要停」呢個新要求正面衝突,
    // 所以改用 StopPlaybackAndRemoveNotification。
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
  }), []);

  // ⚠️ 2026-08-01 regression 修復(OTA-MEDIA-NOTIFICATION)——
  // 舊寫法係 `try { await TrackPlayer.updateOptions(...) } catch { console.warn }`,
  // 而且 lazyEnsurePlayer 一入嚟就 `playerReadyRef.current = true`。兩樣夾埋,
  // updateOptions 一失敗就:(a) 冇人知(淨係一句吞咗嘅 warn),(b) 一世唔會再試
  // (ref 已經 latch 咗)。後果係 RNTP 個 NotificationConfig 由頭到尾未 apply 過
  // → **完全冇媒體通知**(左上角 mini player 冇咗、通知欄冇播放卡),但 ExoPlayer
  // 照播;連 appKilledPlaybackBehavior 都返返預設 ContinuePlayback(swipe 走
  // 唔會停)。2026-08-01 喺 local update server harness 上面確認咗 production
  // OTA bundle 真係踩中呢個狀態。
  //
  // 而家:失敗會重試(指數退避),而且會記住「未 apply 成功」,返前台/開始播歌
  // 之前都會再 apply 一次。updateOptions 本身係 idempotent,重覆 call 安全。
  const applyPlayerOptions = useCallback(async ({ retries = 3 } = {}) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await TrackPlayer.updateOptions(buildPlayerOptions());
        optionsAppliedRef.current = true;
        return true;
      } catch (e) {
        // 唔好靜靜吞咗——最少要留低一條可以喺 logcat 見到嘅記錄,
        // 而且要講明係第幾次、仲會唔會再試。
        console.warn(
          `[player] updateOptions failed (attempt ${attempt + 1}/${retries + 1}):`,
          e?.message || e,
        );
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
        }
      }
    }
    optionsAppliedRef.current = false;
    return false;
  }, [buildPlayerOptions]);

  // 未成功 apply 過就再試一次(平時 no-op,所以放喺熱路徑都唔貴)。
  const ensurePlayerOptions = useCallback(async () => {
    if (optionsAppliedRef.current) return true;
    return applyPlayerOptions({ retries: 2 });
  }, [applyPlayerOptions]);

  const lazyEnsurePlayer = useCallback(async () => {
    if (playerReadyRef.current) return ensurePlayerOptions();
    // 同一時間有幾個 caller(resyncFromNative + handlePlayHymn)就共用同一個
    // in-flight promise,唔好各自行一次 setupPlayer。
    if (initInFlightRef.current) return initInFlightRef.current;

    const run = (async () => {
      // Android 13+(API 33)POST_NOTIFICATIONS 一定要 runtime request,淨係喺
      // manifest 度宣告唔會自動有——冇request過就一直當用戶拒絕,post唔到
      // RNTP 個背景播放通知,離開App之後個mini player就會「唔見咗」但歌照播
      // (2026-07-30 Eric 實測 + STREAM-403-FGS-CRASH-PLAN 已知缺口)。
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch (e) { console.warn('POST_NOTIFICATIONS request (ignored):', e?.message); }
      }
      let setupOk = true;
      try {
        // waitForBuffer:false → iOS AVPlayer.automaticallyWaitsToMinimizeStalling=false。
        // true(舊設定)令AVPlayer用自己嘅頻寬預測算法決定幾時開始播,喺VPN造成
        // 嘅高延遲抖動下,呢個算法會不斷推翻自己個估算、反覆等待/重新緩衝,將
        // 單次~600ms嘅慢response滾大成20幾個buffering週期、成30秒先播到(Android
        // ExoPlayer冇呢種預測式等待,單次慢咗都會一氣呵成播)。設false之後AVPlayer
        // 唔再自己估,一有數據夠(靠已有嘅preferredForwardBufferDuration/
        // playbackLikelyToKeepUp把關)就播,唔會再自行反覆重試。
        //
        // autoHandleInterruptions:true —— 2026-08-12 真機撞到「鎖屏聽緊15分鐘
        // 又自己完全靜晒」,查落 SwiftAudioEx 原碼(RNTrackPlayer.swift
        // handleInterruption)發現:audio session 俾人打斷完(電話/Siri/另一個
        // app攞走audio/藍牙路由切換)之後,native 淨係喺呢個flag=true先會自動
        // player.play() 恢復;預設false嘅話淨係fire個RemoteDuck event,冇人聽
        // 就一直卡喺paused、冇crash冇錯誤、亦唔會再有任何network request(所以
        // backend log會見到完全靜晒——同「卡buffering」嗰種截然不同,三個
        // stuck-watchdog都唔會出手,因為native老實報緊「已經pause咗」)。之前
        // 一直冇設呢個flag(default false)。見STREAM-LOCKSCREEN-STOP-ROOTCAUSE-
        // 2026-08-12.md 續篇。
        //
        // ⚠️ 呢個唔係 iOS-only option——Android 邊 map 做 handleAudioFocus=true
        // (RNTP MusicService.kt:189),1dde53d 起已生效;audio focus 場景(電話/
        // 第二個 app 搶聲/拔耳機)同 D2 嘅互動見 FRONTEND-CODE-REVIEW-20260819
        // §9,實測歸 consolidated testing(BATCH5-PLAN-20260819 §5.3/§6.3-7)。
        await TrackPlayer.setupPlayer({ waitForBuffer: false, autoHandleInterruptions: true });
      } catch (e) {
        // setupPlayer 喺「player 已經 set 過」嗰陣都會 reject(code
        // player_already_initialized,見 MusicModule.kt),嗰個唔算失敗;
        // 真係失敗就唔好 latch playerReadyRef,留返俾下次重試。
        const msg = String(e?.message || e);
        setupOk = e?.code === 'player_already_initialized' || /already been initialized/i.test(msg);
        if (!setupOk) console.warn('[player] setupPlayer failed:', msg);
      }
      await applyPlayerOptions();
      // 只有 setupPlayer 真係 OK 先當 ready;唔係就下次 call 會再行一次。
      playerReadyRef.current = setupOk;
      setQueueReady(true);
    })();

    initInFlightRef.current = run;
    try {
      await run;
    } finally {
      initInFlightRef.current = null;
    }
  }, [applyPlayerOptions, ensurePlayerOptions]);

  // 同步 ref 俾 event handler 用
  repeatModeRef.current = repeatMode;
  isShuffledRef.current = isShuffled;
  queueRef.current = queue;
  trackStateRef.current = trackState;

  // ── 自動播放(AUTOPLAY-MIX-PLAN)──────────────────────────────
  const [autoplayEnabled, setAutoplayEnabledState] = useState(getAutoplayEnabled());
  const [autoplayFlavor, setAutoplayFlavorState] = useState(getAutoplayFlavor());
  const autoplayEnabledRef = useRef(autoplayEnabled);
  const autoplayFlavorRef = useRef(autoplayFlavor);
  autoplayEnabledRef.current = autoplayEnabled;
  autoplayFlavorRef.current = autoplayFlavor;
  const hymnsRef = useRef(null);
  hymnsRef.current = hymns;

  // ===== 物理抽屜動畫 (slide-up/slide-down) =====
  //
  // 🔴 v233 修「tab 掣俾黑條檔住一半」——
  // 呢個 overlay 係 position:absolute + top0/bottom0(即係跟足 parent 實際高度)、
  // 底色 #0B0F0E 近黑、**zIndex:999**、而且成個 Animated.View **永遠 mount**。
  // 收埋嘅方法係 translateY 個 `SCREEN_HEIGHT`,但 SCREEN_HEIGHT 係
  // `Dimensions.get('window').height` —— Android 呢個值**唔包導航列**,而 App 係
  // edge-to-edge,root view 係鋪滿**成塊屏**(包埋導航列嗰條)。
  // 即係:overlay 真高度 > 推落去嘅距離 → 底部永遠剩返一條約 48px 嘅近黑色
  // zIndex:999 overlay,啱啱好蓋住 tab 掣下半截。
  //
  // 嗰條「黑條」根本唔係手機導航列,所以之前點樣搞 safe-area inset 都好,
  // 一世都掂唔到佢。兩重保險:
  //   (a) 用 onLayout 度返 overlay **實際**高度嚟做收埋距離,唔再靠 Dimensions;
  //   (b) 完全收埋(!overlayExpanded)嗰陣直接 display:'none',零繪製。
  //       收埋動畫行完先會 setOverlayExpanded(false),所以唔會截斷動畫。
  const [overlayExpanded, setOverlayExpanded] = useState(false);
  const overlayHRef = useRef(SCREEN_HEIGHT);
  const drawerAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const isAnimatingRef = useRef(false);
  // BATCH7-1: `.start(callback)` 嘅 completion callback 有陣時永遠唔 fire
  // (觀察到同 PlaybackError 風暴/高頻 render 相關),令 isAnimatingRef 卡死 true、
  // showPlayer/hidePlayer 永久 no-op,用戶被困要重啟 app。呢個 timeout 係 JS-driven
  // 保底:completion 冇喺 duration+300ms 內到,就強制當佢完成咗。
  const animTimeoutRef = useRef(null);
  const clearAnimTimeout = useCallback(() => {
    if (animTimeoutRef.current != null) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => () => clearAnimTimeout(), [clearAnimTimeout]);

  const onOverlayLayout = useCallback((e) => {
    const h = e?.nativeEvent?.layout?.height;
    if (!h || Math.abs(h - overlayHRef.current) < 1) return;
    overlayHRef.current = h;
    // 淨係喺「收埋 + 冇動畫行緊」先重設,唔係會將開緊嘅播放器推走。
    if (!isAnimatingRef.current && !overlayExpanded) drawerAnim.setValue(h);
  }, [drawerAnim, overlayExpanded]);

  const showPlayer = useCallback(() => {
    // 已經穩定開住(冇動畫行緊)先算真係 no-op;仲喺度收緊嘅話要俾佢反方向。
    if (overlayExpanded && !isAnimatingRef.current) return;
    clearAnimTimeout();
    drawerAnim.stopAnimation(); // 中斷緊行嘅 hide 動畫(可重入)
    isAnimatingRef.current = true;
    setOverlayExpanded(true);
    if (!overlayExpanded) drawerAnim.setValue(overlayHRef.current);
    const finishShow = () => {
      clearAnimTimeout();
      // BATCH7 B7-1b:timeout 保底 fire 嗰陣(completion callback 冇到)
      // drawerAnim 可能停喺動畫行到一半嘅中途值——冇呢句嘅話 isAnimatingRef
      // 雖然自癒返 false,但 native translateY 同 overlayExpanded=true 個
      // 邏輯狀態對唔上,用戶見到播放器卡喺半開半收,§3.1 個場景理論上仲會
      // 出現。強制拉去目標值,令視覺同 state 對齊。
      drawerAnim.setValue(0);
      isAnimatingRef.current = false;
    };
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(finishShow); // finishShow 唔理 {finished} 係 true定 false,都要清 guard
    animTimeoutRef.current = setTimeout(finishShow, 600);
    // Sync track state immediately so overlay shows correct icon
    TrackPlayer.getPlaybackState().then(s => {
      const val = typeof s === 'object' && s != null ? s.state : s;
      if (val != null) setTrackState(val);
    }).catch(() => {});
  }, [overlayExpanded, drawerAnim, clearAnimTimeout]);

  const hidePlayer = useCallback(() => {
    if (!overlayExpanded) return; // 已經完全收埋,冇嘢好做
    clearAnimTimeout();
    drawerAnim.stopAnimation(); // 中斷緊行嘅 show 動畫(可重入)
    isAnimatingRef.current = true;
    const finishHide = () => {
      clearAnimTimeout();
      // BATCH7 B7-1b:同 finishShow 一樣,timeout 保底 fire 嗰陣要強制拉去
      // 目標值(overlayHRef.current,唔係 0——收埋方向係推落去嗰個高度)。
      drawerAnim.setValue(overlayHRef.current);
      setOverlayExpanded(false);
      isAnimatingRef.current = false;
    };
    Animated.timing(drawerAnim, {
      toValue: overlayHRef.current,
      duration: 250,
      useNativeDriver: true,
    }).start(finishHide); // finishHide 唔理 {finished} 係 true定 false,都要清 guard
    animTimeoutRef.current = setTimeout(finishHide, 550);
  }, [overlayExpanded, drawerAnim, clearAnimTimeout]);

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Listen to TrackPlayer events — safe guard with try/catch
  // We use a custom event listener approach instead of useTrackPlayerEvents
  // to avoid crashes if native module isn't ready yet
  useEffect(() => {
    if (!queueReady) return;
    
    // Sync initial state immediately (v4 returns { state } object)
    TrackPlayer.getPlaybackState().then(raw => {
      const val = typeof raw === 'object' && raw != null ? raw.state : raw;
      if (val != null) setTrackState(val);
    }).catch(() => {});

    const unsubscribe = TrackPlayer.addEventListener(TPEvent.PlaybackState, (event) => {
      try {
        // v3: event.state = enum; v4: event.state = object with .state
        const val = typeof event?.state === 'object' ? event.state.state : event.state;
        // STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13 D1 —— Opus5 揪出 §4.3 覆蓋
        // 矩陣有洞(Paused/Ready/Loading/Ended冇watchdog管),但完全冇log過player
        // 最後停喺邊個state。呢度記低轉換(trackStateRef.current呢一刻仲係轉之前
        // 嗰個值,setTrackState(val)要等render後嘅sync effect先追上)。
        // ⚠️ 2026-08-22 臨時開 always 上傳(Eric 拍板,攞證據用,唔係永久)——
        // DELISTED-FAVORITES-ROOTCAUSE-20260822.md §2.3:熔斷器(連續 3/6 首載入
        // 唔到就停+提示)實測由頭到尾冇 trip 過,15:49–15:55 連燒六首個 counter
        // 一路喺 0/1 之間彈。懷疑 `setupPlayer({ waitForBuffer: false })` 令
        // ExoPlayer 喺 buffer 未夠、根本未出到聲嗰陣就報 `Playing`,而下面條
        // reset 就正正掛喺 `Playing` 度 —— 即係每次 skip 去下一首(就算下一首
        // 一樣播唔到)都即刻清零,門檻永遠去唔到。
        //
        // 要分辨「真出聲」定「假 Playing」,淨係知道 state 轉咗係唔夠嘅,所以
        // 呢度連 **reset 之前嗰刻嘅 errorSkipCount** 同 **嗰一刻嘅 position/
        // duration** 一齊送。假 Playing 嘅簽名 = `to=playing` 但 position/
        // duration 都係 0、而且緊接住上一首 PlaybackError。
        //
        // 收夠幾轉真實數據就要**改返** always 落嚟(每首歌 4-6 個 POST,唔係
        // 長期跑嘅量)。⚠️ 呢段純粹係診斷:sync 嗰截行為一行都冇改,await
        // getProgress() 擺喺後面獨立 async IIFE,唔會拖慢/改變 state 處理。
        // ✅ 2026-08-23 已閂返(THIRD-PASS-REVIEW P1-1):`{ always: true }` 剷咗,
        // 呢兩條同下面 trackChanged 一律返去食 DIAG_ENABLED(預設 false)。由
        // commit 到閂返之間一次都未 OTA 過,所以零真機數據損失;下次要收呢批數
        // 就臨時開 DIAG_ENABLED,唔好再喺 call site 加 always。
        const prevSkipCount = errorSkipCountRef.current;
        const fromState = trackStateRef.current;
        // THIRD-PASS-REVIEW P2-1 —— 記低「新 track 真係開過 buffer」。
        // finishTransitionMeasure() 靠呢支旗擋走舊 track 遲到嘅 Playing event
        // 整出嚟嘅假快數(見嗰度嘅完整分析)。無條件 set:buffering 有機會喺
        // trackChanged 之前就 fire(Loading → ActiveTrackChanged),唔可以要求
        // 次序。呢度只係寫一個 boolean,零行為影響。
        if (val === TPState.Buffering || val === TPState.Loading) {
          const t0b = transitionT0Ref.current;
          if (t0b) t0b.bufferingSeen = true;
        }
        if (val === TPState.Playing) {
          (async () => {
            let p = null;
            try { p = await TrackPlayer.getProgress(); } catch (_) {}
            logDiag('stateChange', {
              appState: appStateRef.current,
              position: p?.position,
              duration: p?.duration,
              errorSkipCount: prevSkipCount,
              detail: `from=${fromState} to=${val}`,
            });
          })();
        } else {
          logDiag('stateChange', {
            appState: appStateRef.current,
            errorSkipCount: prevSkipCount,
            detail: `from=${fromState} to=${val}`,
          });
        }
        setTrackState(val);
        // playQueue() (§3.2) leaves isLoading true until audio is actually
        // audible, rather than clearing it right after TrackPlayer.play()
        // resolves — this is what clears it.
        if (val === TPState.Playing) {
          // Phase 1 量度 t1(主路徑):真係播到聲嗰刻。
          finishTransitionMeasure();
          // PHASE2.5-PRELOAD-PLAN §4 W2-2 —— 到呢一刻用戶先至真係聽到聲,背景
          // 落載可以開返。**唔可以**擺喺 trackChanged 度做:trackChanged 幾乎
          // 一 add/play 完即刻 fire,即係喺 AVPlayer 嗰 9 秒 load 之前,咁樣讓路
          // 等於冇讓過。iOS-only(Android 兩個 function 都係 no-op)。
          if (Platform.OS === 'ios') resumeAudioPrefetch();
          setIsLoading(false);
          // §3.7 — only ACTUAL audible playback proves we've recovered, so the
          // circuit breaker resets here. It must NOT reset on track-change:
          // the breaker's own skipToNext() causes a track change, which would
          // zero the counter every time and make the "5 strikes" limit
          // unreachable.
          errorSkipCountRef.current = 0;
          // BUG2 P0 — 呢首歌真係播到聲,清埋 retry flag,下次撞返嚟(例如
          // repeat/prev)先至又攞多一次 retry 機會,唔會永久鎖死。
          retriedTrackRef.current = null;
          // HLS-EXEC-PREWINDOW-20260901 §2 W-b —— hlsDowngradedTrackRef
          // 之前全檔淨係 set(:1236 附近)冇 reset,令一首歌喺 app 一世人
          // 淨係降級得一次:用戶稍後再撳返同一首、又撞 404 → 唔會再降級
          // → 打回原形跳歌。同 retriedTrackRef 一齊喺「真播到聲」呢一刻
          // 清返,令「一首歌只准降級一次」個保證收窄返做「一次播放之內」
          // (派工單原意),唔係一世人一次。
          hlsDowngradedTrackRef.current = null;
        }
      } catch (e) {}
    });
    // PHASE1-PLAYER-REBUILD.md §3.5 — direct index lookup against `queue`
    // (written by playQueue()). PlaybackQueueEnded is gone: repeat/advance
    // are now native TrackPlayer behavior (see repeatMode sync below), not
    // JS recomputing "what's next".
    const unsubscribeTrack = TrackPlayer.addEventListener(TPEvent.PlaybackActiveTrackChanged, async (event) => {
      try {
        if (typeof event?.index !== 'number') return;
        const idx = event.index;
        // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.2 —— 舊 track 有冇播過,
        // 要喺呢一刻(重置之前)攞定,亦要喺任何 await 之前做(呢個 handler 頭
        // 幾行完全同步,唔會俾 poll loop 嗰個 async tick 搶閘覆寫)。
        const prevTrackHasPlayed = trackHasPlayedRef.current;
        if (NATIVE_WD_V2) trackHasPlayedRef.current = false; // 新 track 重新計
        currentQueueIndexRef.current = idx;
        setCurrentQueueIndex(idx);
        const song = queueRef.current[idx];
        if (song) { setHymn(song); setCurrentHymn(song); }
        // STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇 —— 呢個先係「track 幾時真係轉
        // 咗」嘅唯一 client-side 真相來源;之前次診斷淨係靠 backend [stream] log
        // 反推轉歌時間,查唔到轉歌係 native 真轉定係重載緊同一首。呢度直接記低。
        // 同上,2026-08-22 臨時開 always(每首歌得一條,量細)——冇呢條就淨係
        // 見到一串 stateChange,唔知邊個 to=playing 對應邊首歌、亦分唔到
        // 「跳咗去下一首」定「同一首歌 retry」。攞夠證據要同 stateChange 一齊
        // 改返落嚟。✅ 2026-08-23 已同 stateChange 一齊閂返(P1-1),而家食
        // DIAG_ENABLED。
        logDiag('trackChanged', {
          appState: appStateRef.current,
          hymnId: song?.id ?? null,
          errorSkipCount: errorSkipCountRef.current,
          detail: `idx=${idx}`,
        });
        // Phase 1 量度 —— 撳掣起源嘅 t0 未過期(30s)就補「track 真係轉咗」標記
        // + hymnId;冇 t0(native auto-advance)就以呢一刻做 t0。
        {
          const t0 = transitionT0Ref.current;
          const wasAnticipatedByJs = !!(t0 && !t0.trackChangedSeen && Date.now() - t0.ts <= 30000);
          if (wasAnticipatedByJs) {
            t0.trackChangedSeen = true;
            t0.hymnId = song?.id ?? null;
          } else {
            transitionT0Ref.current = { ts: Date.now(), origin: 'auto', trackChangedSeen: true, bufferingSeen: false, hymnId: song?.id ?? null };
          }
          // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.2 —— native 前台 watchdog
          // 嘅 skip 唔經任何 JS TrackPlayer.* API(見 plugins/
          // withSwiftAudioExStallWatchdog.js escalate()),JS 完全冇辦法直接聽到
          // 呢個訊號,只能反推:「track 換咗,但 JS 完全冇預期(!wasAnticipatedByJs,
          // 冇一個 tap/watchdog-skip 落嘅 pending t0)」+「舊 track 從未真正播過
          // (!prevTrackHasPlayed)」= native 靜靜哋跳咗一首死歌。真・native
          // auto-advance(一首歌自然播完)一定滿足咗 prevTrackHasPlayed,唔會
          // 撞入呢度;用戶/JS watchdog 主動發起嘅轉track 全部會經 transitionT0Ref
          // 標記做「有預期」(見 handleStuckTrackEnd/PlaybackError 嗰幾個
          // NATIVE_WD_V2 guard),都唔會撞入嚟——所以呢度唔會同 bufferingStuck/
          // PlaybackError 已經加過嘅數 double count。淨係前台計(appStateRef
          // === 'active'):背景嗰陣 native 自己嘅 20s/8s/3-strike 熔斷已經係
          // 唯一防線,JS 呢套前台 UX 熔斷唔應該搶佢戲(彈唔到 Alert 都冇意義)。
          if (NATIVE_WD_V2 && appStateRef.current === 'active' && !wasAnticipatedByJs && !prevTrackHasPlayed) {
            errorSkipCountRef.current += 1;
            logDiag('nativeSkipAttributed', {
              appState: appStateRef.current,
              hymnId: song?.id ?? null,
              errorSkipCount: errorSkipCountRef.current,
              detail: `idx=${idx}`,
            }, { always: true });
            // 現有前台 threshold=3 彈 Alert 嗰套照用(同 §3.7/PlaybackError 完全
            // 同一個門檻同同一句文案),唔可以等 PlaybackError 嗰邊嘅 check 執行
            // ——native skip 冇跟 PlaybackError 事件,嗰段 code 唔會行到。
            if (errorSkipCountRef.current >= 3) {
              expectPlayingRef.current = false; // D2 — 呢個係我哋主動叫嘅pause
              await TrackPlayer.pause().catch(() => {});
              Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
              errorSkipCountRef.current = 0;
            }
          }
        }
        // 2026-07-29 QUEUE-UX-4FIXES §3(Opus 5 驗收補漏)—— 插播歌播完(或者
        // 用戶自己撳咗過去),播放位置一行過條分隔線,「即將播放」就唔再係
        // 「即將」:線下面嗰首已經係播緊嗰首,插播歌反而喺線上面變咗「播完咗
        // 嘅嘢」,睇落就係鬼影分隔線。行到 boundary(或者更後)就清走。
        // 純粹清 UI state,唔掂 browseTap/headLen 任何判斷邏輯(§3.4 鐵律)。
        if (insertBoundaryRef.current != null && idx >= insertBoundaryRef.current) {
          insertBoundaryRef.current = null;
          setInsertBoundary(null);
        }
        // BG-PLAYBACK-STOPS-PLAN Fix A — playQueue() 起播嗰陣淨係暖咗頭 3 首
        // (§1092),之後換歌完全冇再預熱 → 第 5 首起全部撞冷歌。呢度令預熱窗口
        // 跟住播放位置滾動,永遠暖住前面 3 首。輕量去重:同上次暖過嘅 id 串
        // 一樣就唔再 call,防止連環撳「下一首」狂 POST /warm。
        const nextIds = queueRef.current.slice(idx + 1, idx + 4).map((s) => s.id);
        const nextIdsKey = nextIds.join(',');
        if (nextIds.length && lastWarmedKeyRef.current !== nextIdsKey) {
          lastWarmedKeyRef.current = nextIdsKey;
          warmIds(nextIds);
        }
        // IOS-ANDROID-PARITY-PLAN §5 Phase 2 — 落載下 2 首去本地(iOS only,
        // no-op on Android)。audioPrefetch 自己序列化(module-level 1 條
        // 落載嘅 queue/lock),呢度連續 call 兩次就得,唔使等第一個先。
        // backend warm(above)令 prefetch 快好多,兩層係配合唔係重複。
        if (Platform.OS === 'ios') {
          // Phase 2.5 backstop —— 「而家播緊嗰首」永遠唔准同時落載緊(native
          // 自動轉歌唔經任何撳掣 call site,喺呢度兜底;撳掣路徑早一步已 cancel)。
          if (song?.id != null) cancelAudioPrefetch(song.id);
          const n1 = queueRef.current[idx + 1];
          const n2 = queueRef.current[idx + 2];
          if (n1?.id != null) prefetchAudio(n1.id);
          if (n2?.id != null) prefetchAudio(n2.id);
          // Phase 2.5② —— 用戶真係聽緊歌,先至排「聽日」頭 2 首入落載隊
          // (每 session 一次;FIFO 排喺即場 next-2 後面,唔會搶priority)。
          if (!tomorrowQueuedThisSession && tomorrowHeadIds.length) {
            tomorrowQueuedThisSession = true;
            for (const tid of tomorrowHeadIds) if (tid != null) prefetchAudio(tid);
          }
        }
        // §3a playLog:聽夠 30 秒先算一次(skip 唔算)。換咗歌就取消上一個計時器,
        // 開一個新嘅;30 秒後如果仲係播緊同一首,先記錄。
        if (playLogTimerRef.current) clearTimeout(playLogTimerRef.current);
        if (song?.id != null) {
          const startedId = song.id;
          playLogTimerRef.current = setTimeout(() => {
            if (queueRef.current[currentQueueIndexRef.current]?.id === startedId) recordPlay(startedId);
          }, 30000);
        }
      } catch (e) {}
    });

    // §3.7 — auto-skip on a failed track (dead link, etc), with a circuit
    // breaker so a long dead-link run doesn't silently skip forever.
    //
    // BUG2 P0(實測):冷 song(backend resolve-cache 未 warm)/api/stream/:id
    // 要 8–11s 先返第一個 byte,ExoPlayer 預設 connect/read timeout = 8s,
    // 所以冷歌幾乎一定 timeout。react-native-track-player v4.1.2 嘅
    // setupPlayer/updateOptions（PlayerOptions/AndroidOptions）冇任何欄位可以
    // 調呢個 HTTP timeout——真正嘅 DefaultHttpDataSource 喺 kotlinaudio(native
    // maven 依賴,唔喺呢個 repo 度)入面,唔喺 JS 層可以改,亦唔喺呢次改動範圍
    // (唔准掂 native)。所以呢度純粹用「retry 一次」嚟頂:backend 502/timeout
    // 好多時得一次(實測 id=369:錯一次、retry 就成功),warm 咗就得返 ~1.5s。
    const unsubscribeError = TrackPlayer.addEventListener(TPEvent.PlaybackError, async (event) => {
      console.error('[PlaybackError]', event?.code || '', event?.message || 'Unknown error');

      // 邊首歌爆咗:靠而家 active index 喺 queueRef 度攞返個 song id(PlaybackError
      // event 本身冇帶 track 資訊)。攞唔到就當唔識,直接跳去下面 skip 分支。
      let curIdx = null;
      try { curIdx = await TrackPlayer.getActiveTrackIndex(); } catch (_) {}
      const curSong = typeof curIdx === 'number' ? queueRef.current[curIdx] : null;
      const curId = curSong?.id ?? null;

      // STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇 —— 呢一刻嘅 position/duration 係
      // 判斷「TrackPlayer.retry()下面嘅native reload(startFromCurrentTime:true)
      // 會唔會執位失敗變返0:00」嘅關鍵訊號(SwiftAudioEx只喺currentItem.duration
      // 唔係indefinite先會攞返position嚟seek番去)。JS層攞唔到嗰個native flag
      // 本身,但duration喺呢度報0/attb好可疑就係好強嘅代理訊號。
      let diagProgress = null;
      try { diagProgress = await TrackPlayer.getProgress(); } catch (_) {}
      logDiag('PlaybackError', {
        appState: appStateRef.current,
        hymnId: curId,
        position: diagProgress?.position,
        duration: diagProgress?.duration,
        repeatMode: repeatModeRef.current,
        errorSkipCount: errorSkipCountRef.current,
        detail: `code=${event?.code || ''} willRetry=${curId != null && retriedTrackRef.current !== curId}`,
      }, { always: true });

      // ROOTFIX-2026-08-24 防線B —— 播緊嘅係本地 file:// 檔而撞 PlaybackError
      // (檔壞咗/俾系統清咗/任何未預見原因冇咗):舊版剷完檔就跌落共用
      // retry(),而 TrackPlayer.retry() reload 嘅係隊列入面**同一條死 file://**,
      // 必然二次爆然後跳歌(production 實錘 2026-08-24:連環死 file:// 令
      // 「聽完第 1、2 首之後播唔到」)。而家自成一條「換 URL 重播」路:
      //   1. invalidate:剷壞檔 + 剔 index → 下面 toTrack() 必然回 stream URL;
      //   2. retriedTrackRef = curId:呢次熱換當「已 retry」,stream 版再爆
      //      先至跌落下面原有 skip/熔斷流程(嗰邊一行都冇改);
      //   3. TrackPlayer.load():RNTP 4.1.2 官方「原位替換 current track」API,
      //      唔郁隊列其他 entries、唔 reset、唔跳 index;load() 唔得就行
      //      remove/add/skip 三步後備(同 onPrefetchComplete 熱換同款)。
      // 成條路自己爆錯就由外層 catch 兜住跌返落原有 retry/skip 流程——嗰陣
      // retriedTrackRef 已 set,即刻入 skip 分支,唔會再撞死同一條死 URL。
      if (Platform.OS === 'ios' && curId != null && curSong) {
        try {
          const activeTrack = await TrackPlayer.getActiveTrack();
          const activeUrl = activeTrack?.url;
          if (activeUrl && String(activeUrl).indexOf('file:') === 0) {
            invalidateAudioCache(curId);
            retriedTrackRef.current = curId;
            // HLS-EXEC-PREWINDOW-20260901 §5 W-e —— 呢個 comment 之前寫
            // 「index 已剔 → 必然 stream URL」,HLS 落地之後已經係錯:
            // toTrack(curSong) 冇帶 opts,iOS + HLS_ENABLED 之下會攞返
            // `.m3u8` playlist URL,唔一定係 progressive stream URL。呢度
            // 冇加 `{ forceProgressive: true }`——單純 file:// 本地播放失敗
            // fallback,同 HLS 播唔到嗰個獨立分支(hlsDowngradedTrackRef)
            // 語義唔同,故意唔改行為,淨係修返個過時 comment。
            const freshTrack = toTrack(curSong);
            logDiag('localFallback', {
              appState: appStateRef.current,
              hymnId: curId,
              position: diagProgress?.position,
              duration: diagProgress?.duration,
              detail: `code=${event?.code || ''}`,
            }, { always: true });
            // NATIVE-STALL-FG-SPEEDUP §4.2 —— 呢個熱換(load/remove+add+skip)
            // 可能會令 active index 睇落好似「轉咗」,標記做 JS 自己發起,避免
            // PlaybackActiveTrackChanged 誤判做 native skip 加多一次計數。
            if (NATIVE_WD_V2) {
              transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
            }
            try {
              await TrackPlayer.load(freshTrack);
            } catch (loadErr) {
              if (typeof curIdx !== 'number') throw loadErr;
              await TrackPlayer.remove(curIdx);
              await TrackPlayer.add(freshTrack, curIdx);
              await TrackPlayer.skip(curIdx);
            }
            expectPlayingRef.current = true;
            await TrackPlayer.play();
            return;
          }

          // HLS-EXEC-D-FIXES-20260901 §1 D2 —— `.m3u8` 播唔到(no-sidx 404 /
          // 起播失敗 / 任何原因)本身唔會入上面 file:// 分支,舊代碼會跌落
          // 通用 retry()(重試同一條播唔到嘅 .m3u8)→ errorSkipCount 熔斷/
          // 跳歌,用戶感受係「撳落歌A冇聲、自己跳咗去B」——而且 no-sidx 係
          // 「同一首歌隨機」(resolveAudioUrl() 每次可能揀唔同 format
          // variant),理論上任何一首歌、任何一次撳落去都可能中。
          // 而家一見到 activeUrl 係 HLS playlist,即刻換返 `/api/stream/:id`
          // progressive URL 重播同一首歌:
          //   - 唔計 errorSkipCount(§1.2 第2點:呢次唔係「呢首歌壞咗」,
          //     係「HLS 路行唔通」);
          //   - 一定要有 log/beacon(`hlsFallback`),否則唔知實地發生率;
          //   - hlsDowngradedTrackRef 保證同一首歌只降級一次,唔准
          //     HLS↔progressive 嚟回彈(§1.2 第4點紅線)——降級之後再撞
          //     PlaybackError(即係 progressive 版都播唔到),跌落下面原有
          //     retry-once/skip 流程,正常計 errorSkipCount。
          const isHlsUrl = activeUrl && /\.m3u8(\?|$)/.test(String(activeUrl));
          if (isHlsUrl && hlsDowngradedTrackRef.current !== curId) {
            hlsDowngradedTrackRef.current = curId;
            retriedTrackRef.current = curId; // 呢次熱換當「已 retry」,同 file:// 分支一致
            const freshTrack = toTrack(curSong, { forceProgressive: true });
            logDiag('hlsFallback', {
              appState: appStateRef.current,
              hymnId: curId,
              position: diagProgress?.position,
              duration: diagProgress?.duration,
              detail: `code=${event?.code || ''} from=${String(activeUrl)}`,
            }, { always: true });
            if (NATIVE_WD_V2) {
              transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
            }
            try {
              await TrackPlayer.load(freshTrack);
            } catch (loadErr) {
              if (typeof curIdx !== 'number') throw loadErr;
              await TrackPlayer.remove(curIdx);
              await TrackPlayer.add(freshTrack, curIdx);
              await TrackPlayer.skip(curIdx);
            }
            expectPlayingRef.current = true;
            await TrackPlayer.play();
            return;
          }
        } catch (_) { /* 自癒失敗 → 跌落下面原有 retry/skip(見上面註解第 2 點) */ }
      }

      // 呢首歌未 retry 過 → retry 一次先,唔即刻放棄跳下一首。
      if (curId != null && retriedTrackRef.current !== curId) {
        retriedTrackRef.current = curId;
        try {
          await TrackPlayer.retry();
          return; // 得唔得都要俾 native 再試一次機會；再撞 error 先至到下面 skip 分支
        } catch (_) { /* retry() 本身拋錯就直接落去 skip */ }
      }
      // 呢首歌啱啱先 retry 過都仲係錯 → 死心,跳去下一首,並清返 retry flag
      // (下次冇再撞返呢首歌之前唔會誤判成「未 retry 過」)。
      retriedTrackRef.current = null;

      errorSkipCountRef.current += 1;

      // BG-PLAYBACK-STOPS-PLAN Fix B — 前台/背景分流。前台行為完全不變(Eric
      // 2026-07-29 拍板門檻 3,唔准喺前台改)。背景嗰陣 Alert 彈唔到俾人睇,
      // 用戶淨係見到「靜靜哋停咗」,所以背景放寬門檻到 10 先 pause,而且
      // 唔即場 Alert,改為記低 pending notice 等返前台先顯示。
      const isBackground = appStateRef.current !== 'active';

      if (!isBackground) {
        // BUG2(d)P0 — 舊門檻 5 太遲先出聲,而家 3 次連續失敗就出（Eric 要求 2–3）。
        if (errorSkipCountRef.current >= 3) {
          expectPlayingRef.current = false; // D2 — 呢個係我哋主動叫嘅pause,唔想俾D2扣返play()
          await TrackPlayer.pause().catch(() => {});
          Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
          errorSkipCountRef.current = 0;
          return;
        }
        // BUG2(c)P0 — 單首歌失敗唔好再用會擋住成個畫面嘅白色系統 Alert,
        // 改用輕量、非阻擋、自動消失嘅提示。
        // NATIVE-STALL-FG-SPEEDUP §4.2 —— 呢個 skip 已經喺上面加咗
        // errorSkipCountRef,標記做 JS 發起,PlaybackActiveTrackChanged 見到
        // 唔可以再計多一次(避免 double count)。
        if (NATIVE_WD_V2) {
          transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
        }
        // HLS-EXEC-D123-GATE-20260901 P1 —— 之前個 banner 喺 skip *之前*無條件
        // 出,skipToNext() 嘅 catch 又係空嘅:queue 尾冇歌可跳(repeat 關咗)
        // 嗰陣 skipToNext() 會 throw,但 UI 已經講咗「跳去下一首」——大話,
        // 兼零 log。而家改做 skip 成功先出呢句;失敗就出誠實提示,並補一個
        // 之前完全冇記錄嘅 beacon。
        try {
          await TrackPlayer.skipToNext();
          showNotice('呢首歌暫時載入唔到，跳去下一首');
        } catch (e) {
          showNotice('呢首歌暫時載入唔到');
          logDiag('skipNextFailed', { hymnId: curId, reason: e?.message }, { always: true });
        }
        return;
      }

      // 背景路徑:每次失敗留一條 logcat 可見嘅記錄,方便下一輪對數。
      console.warn('[playback] background skip', {
        count: errorSkipCountRef.current,
        songId: curId,
        code: event?.code || '',
      });
      // BG-PLAYBACK-STOPS-PLAN Fix B followup — 規劃層拍板 10→6:10次×~16s
      // (8s timeout+8s retry)最壞要2.5分鐘先發現「播住但冇聲」,用戶感知同
      // 「停咗」一樣但更困惑(通知仲寫住播緊);Fix A 滾動預熱已令前面3首
      // 永遠warm,連續失敗基本上等於網絡真係斷咗,再試10次冇意義;30首尾巴
      // 燒10首=33%,返嚟見播放位置跳好遠。6次≈最壞96秒,仍然係前台門檻3
      // 嘅兩倍(「背景寬鬆啲」目的達到)但唔會拖到以為死機。前台門檻 3 維持
      // 不變(Eric 2026-07-29 拍板,唔准郁)。
      if (errorSkipCountRef.current >= 6) {
        expectPlayingRef.current = false; // D2 — 呢個係我哋主動叫嘅pause,唔想俾D2扣返play()
        await TrackPlayer.pause().catch(() => {});
        errorSkipCountRef.current = 0;
        pendingPlaybackNoticeRef.current = '背景播放中斷：連續多首歌載入唔到，已暫停';
        return;
      }
      // NATIVE-STALL-FG-SPEEDUP §4.2 —— 同上,背景路徑一樣要標記,唔准 double count。
      if (NATIVE_WD_V2) {
        transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
      }
      try { await TrackPlayer.skipToNext(); } catch (e) { /* queue tail, repeat off — nothing to skip to */ }
    });

    // STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13 D2 —— §4.4 揪出嘅缺口:native
    // 喺 AVPlayer 因為藍牙斷開/其他外部原因跌落 .paused 嗰陣,會靜靜哋將
    // playWhenReady 熄咗但**唔改 state**(JS 見到嘅 state 仲係過時嘅
    // Playing),之後冇聲 → iOS suspend → 所有 JS watchdog 一齊死。呢個
    // event(RNTrackPlayer.swift:44 player.event.playWhenReadyChange)係
    // 目前為止**唯一一條喺 suspend 之前、JS 仲行得郁嗰陣就收到嘅訊號**。
    //
    // ⚠️ 呢個係止血,唔係根治,亦唔保證100%攔得住:
    // (a) 淨係喺 process 仲未俾 suspend、event 仲有機會 fire 到 JS 嗰個窗口先
    //     有用——如果 native 熄咗 playWhenReady 之後好快就直接 suspend(冇畀
    //     event 機會 round-trip 到 JS),呢度一樣救唔到,同其他 JS watchdog
    //     結構性缺陷一樣。
    // (b) expectPlayingRef 淨係 cover 呢個 file(App.js)入面嘅 pause()/play()
    //     call site——track-player-service.js 嘅 RemoteDuck permanent:true
    //     分支(用戶接聽電話等唔應該恢復嘅情況)冇 set 呢支 flag,理論上可能
    //     被呢度誤判做「未預期」而錯誤咁再 play() 番。呢個 race 未實測過。
    const unsubscribePlayWhenReady = TrackPlayer.addEventListener(TPEvent.PlaybackPlayWhenReadyChanged, (event) => {
      try {
        // STREAM-LOCKSCREEN-PAUSE-RESUME-BUG-2026-08-17 —— 鎖屏/耳機/Control
        // Center撳暫停/停止掣,係經track-player-service.js嘅RemotePause/
        // RemoteStop觸發,嗰個file冇呢個component嘅expectPlayingRef可以碰,
        // 所以喺嗰邊call pause()/stop()之前,經playback-intent.js呢個共用
        // module留低一個one-shot訊號。呢度consume返嚟(consume-once:讀完
        // 即刻歸位,唔會賴死响度誤蓋第日真係「native靜靜清除意圖」嗰種要
        // D2攔嘅場景),但淨係喺呢個event真係對應嗰個pause transition
        // (playWhenReady===false)先應用去expectPlayingRef,避免同「native
        // 靜默清除意圖」(呢個flag冇set過,event照舊淨係睇原本嗰支ref)嗰種
        // D2原本要防範嘅場景撞埋一齊、被誤判做「已預期」。
        // H3(FRONTEND-CODE-REVIEW-20260819)—— consumeRemotePauseExpected() 要
        // short-circuit 喺 false event 先叫,唔可以無條件執行:如果 markRemotePauseExpected()
        // 之後、對應嗰個 false event 到之前有一個 true event 插隊(例如 RemotePause
        // 撞正 watchdog 嘅 play()),支旗會俾嗰個 true event 白白食咗,令真正
        // 嗰個 false event 見唔到已 consume,又跌返去俾 D2 誤判做「未預期」再
        // play() 一次——即係 8-17 修好嗰個「撳暫停即刻彈返播」bug 會喺 race 下復發。
        if (event?.playWhenReady === false && consumeRemotePauseExpected()) {
          expectPlayingRef.current = false;
        }
        // H1(FRONTEND-CODE-REVIEW-20260819)—— 鎖屏/耳機/Control Center 撳
        // 「播放」(RemotePlay/RemoteNext/RemotePrevious/native 自己 resume)冇
        // 任何一條路徑會補返呢支旗,搞到 D2 守衛(下面 unexpectedly-off 嗰段)
        // 喺呢類 resume 之後就永久失效。呢度一次過覆蓋晒所有 resume 路徑,
        // 淨係令守衛「更加會出手」,唔會令佢誤 pause。
        if (event?.playWhenReady === true) {
          expectPlayingRef.current = true;
        }
        logDiag('playWhenReadyChanged', {
          appState: appStateRef.current,
          trackState: trackStateRef.current,
          detail: `playWhenReady=${event?.playWhenReady} expected=${expectPlayingRef.current}`,
        });
        if (event?.playWhenReady === false && expectPlayingRef.current === true) {
          // NATIVE-STALL-WATCHDOG W3 實測(2026-08-25):native 熔斷嘅 pause 會俾
          // 呢度當「無故熄」自動 resume,兩邊打交無限 loop(skips 衝到 7)。
          // 60 秒內第二次 unexpected-off 就接受現實(多數係 native 層刻意
          // pause——stall 熔斷/queueEnd),唔再搶;D2 原本要防嘅「一次性靜默
          // 熄」場景唔受影響(嗰種一分鐘內唔會嚟兩次,第一次照救)。
          const nowTs = Date.now();
          if (nowTs - (unexpectedOffAtRef.current || 0) < 60000) {
            expectPlayingRef.current = false;
            console.warn('[player] repeated unexpected playWhenReady-off within 60s — accepting pause');
            logDiag('playWhenReadyOffAccepted', { appState: appStateRef.current }, { always: true });
          } else {
            unexpectedOffAtRef.current = nowTs;
            console.warn('[player] playWhenReady quietly turned off unexpectedly — resuming');
            TrackPlayer.play().catch(() => {});
          }
        }
      } catch (_) {}
    });

    return () => {
      unsubscribe.remove();
      unsubscribeTrack.remove();
      unsubscribeError.remove();
      unsubscribePlayWhenReady.remove();
    };
  }, [queueReady]);

  // §Eric #2 —— app resume / 重開 之後同 native TrackPlayer 對返數。
  // Android 低記憶體會殺咗個 JS(Activity),但 TrackPlayer 個 foreground service
  // 仲喺度播 → 用戶返嚟見到 mini player 唔見咗(currentHymn 係 null)但實際上
  // 有歌播緊。呢度讀返 native 嘅 queue / 而家播緊嗰首 / 播放狀態,補返 JS 嘅
  // UI state。只讀 + set state,唔會郁到 native 播緊嗰首。
  //
  // 2026-07-29 QUEUE-UX-4FIXES §4/§7-3:Eric 要求「重開 App 播放頁嘅清單重新
  // 開始,唔會有記憶」。唔可以簡單剷走呢個 function(§Eric #2 仲要靠佢處理
  // 「背景播緊歌、用戶返前台」嗰個正常場景),要按**冷啟動 vs 返前台**同
  // **native 係咪真係播緊**分流:冷啟動(isColdStart=true)嗰陣,如果 native
  // 唔係 Playing/Buffering(即係上次退出留低嘅殘留隊列,例如啱啱喺 notification
  // 撳咗暫停就 swipe 走),就 TrackPlayer.reset() 清晒 native queue + 收埋
  // notification,唔補任何 JS state,App 以 clean state 開始。返前台
  // (isColdStart=false)呢條路一行都冇變,先唔會令 §Eric #2 翻發。
  const resyncFromNative = useCallback(async (isColdStart = false) => {
    try {
      await lazyEnsurePlayer(); // 確保呢個 JS instance 連到 native service(idempotent)
      const [q, idxRaw, stateRaw] = await Promise.all([
        TrackPlayer.getQueue().catch(() => []),
        TrackPlayer.getActiveTrackIndex().catch(() => null),
        TrackPlayer.getPlaybackState().catch(() => null),
      ]);
      const stateVal = typeof stateRaw === 'object' && stateRaw != null ? stateRaw.state : stateRaw;
      const isActuallyPlaying = stateVal === TPState.Playing || stateVal === TPState.Buffering;
      if (isColdStart && Array.isArray(q) && q.length > 0 && !isActuallyPlaying) {
        // 殘留隊列(service 未死但冇聲)—— 清場,唔補 JS state。
        try { await TrackPlayer.reset(); } catch (_) {}
        setTrackState(TPState.None);
        return;
      }
      if (stateVal != null) setTrackState(stateVal);
      if (!Array.isArray(q) || q.length === 0) return; // native 冇嘢播,唔使補
      // native track → hymn 物件:優先由 allSongs 攞齊資料;冇就由 track 砌返
      // 最低限度(youtube_id 由 artwork URL 拆返)。
      //
      // B6 修 —— 舊版「冇搵到」個分支直接硬寫 `lyrics: ''`,而呢個 track 本身
      // 好可能真係有歌詞,淨係因為 lib(hymnsRef.current)呢一刻仲未 load 好
      // 先搵唔到。結果:歌詞 pill 灰咗,永久鎖死(除非用戶去返歌單再撳一次
      // 嗰首歌)。而家「搵唔到」就額外用 safeFetchHymnDetail() 補問一次 API
      // (同 hymns 個 REST 形狀一致,見檔頭 safeFetchHymnDetail),攞到就用齊
      // 全資料(包括真 lyrics);attempts 都失敗先至真係冇歌詞得 fallback 做
      // `lyrics: ''`——呢種情況歌詞 pill 應該本身就要顯示灰(冇資料判斷唔到）。
      const lib = hymnsRef.current || [];
      const idx = typeof idxRaw === 'number' && idxRaw >= 0 ? idxRaw : 0;
      const buildMinimal = (t) => {
        const yt = typeof t.artwork === 'string' ? (t.artwork.match(/\/vi\/([^/]+)\//)?.[1] || '') : '';
        return { id: Number(t.id) || t.id, title: t.title || '', artist: t.artist || '', youtube_id: yt, lyrics: '' };
      };
      // H4 修 — 冇上限嘅 Promise.all(q.map(safeFetchHymnDetail)) 曾經可以喺
      // 冷啟動(hymnsRef.current 仲未 load 好)一次過打幾百個 /api/hymns/:id,
      // 塞爆手機同 backend(同 OCR 爭 CPU)。而家:① lib 未 load 好(空)就完全
      // 唔 fetch,淨係用 track 砌最低限度 object——liveHymn lookup(上面
      // dataVersion cache-bust 段)一旦 hymns load 好就會自動補返最新版包括
      // 歌詞,唔需要呢度 fetch;② lib 已 load 好但單首搵唔到,先至 fetch,
      // 亦只補 current index 前後 2 首(最多 5 個並發),其餘一樣用 minimal。
      const NEAR_RANGE = 2;
      const toHymn = async (t, i) => {
        const found = lib.find((h) => String(h.id) === String(t.id));
        if (found) return found;
        if (lib.length === 0) return buildMinimal(t);
        if (Math.abs(i - idx) > NEAR_RANGE) return buildMinimal(t);
        const detail = await safeFetchHymnDetail(t.id);
        if (detail) return detail;
        return buildMinimal(t);
      };
      const rebuilt = await Promise.all(q.map((t, i) => toHymn(t, i)));
      queueRef.current = rebuilt;
      setQueue(rebuilt);
      currentQueueIndexRef.current = idx;
      setCurrentQueueIndex(idx);
      const cur = rebuilt[idx];
      if (cur) { setHymn(cur); setCurrentHymn(cur); }
    } catch (_) {}
  }, [lazyEnsurePlayer]);

  useEffect(() => {
    // 開機一次(isColdStart=true,俾 native service 少少時間重連;冇播緊就清場)
    // + 每次返前台(isColdStart=false,照舊 resync,唔清場)。
    const t = setTimeout(() => { resyncFromNative(true); }, 800);
    const sub = AppState.addEventListener('change', (s) => {
      // BG-PLAYBACK-STOPS-PLAN Fix B — 記低所有 state(唔淨係 'active'),俾
      // PlaybackError 熔斷器判斷前台/背景。原本 'active' 分支嘅行為完全不變。
      appStateRef.current = s;
      if (s !== 'active') return;
      resyncFromNative(false);
      // OTA-MEDIA-NOTIFICATION:每次返前台都重新 apply 一次播放器選項。
      // 唔淨係「未成功過先試」——MusicService 有機會俾系統殺咗再起返
      // (START_STICKY),嗰陣 RNTP 會重新 setupPlayer 但**唔會**自動用返
      // latestOptions,個媒體通知就會啞晒。updateOptions 係 idempotent,
      // KotlinAudio 見到 buttons 冇變會 skip 重建,所以重覆 call 好平。
      applyPlayerOptions({ retries: 1 });
      // BG-PLAYBACK-STOPS-PLAN Fix B — 背景熔斷器觸發時冇即場 Alert(彈咗都
      // 冇人見到),而係留低一個 pending notice;返前台呢度用現有嘅輕量
      // showNotice() 顯示,保證用戶一定見到解釋,而唔係之前嗰種靜默 stop。
      if (pendingPlaybackNoticeRef.current) {
        showNotice(pendingPlaybackNoticeRef.current);
        pendingPlaybackNoticeRef.current = null;
      }
    });
    return () => { clearTimeout(t); sub.remove(); };
  }, [resyncFromNative, applyPlayerOptions]);

  // iOS 真機 QA(Eric 2026-08-11)—— 一首歌實際上已經播完(冇聲),但 App/鎖屏
  // 仲顯示緊「播放緊」,亦冇自動跳下一首。查過 react-native-track-player 上游
  // GitHub(#1995/#1598 等),SwiftAudioEx(RNTP 底層 iOS engine)已知有一類
  // bug:track 真係播完,但 native 冇轉 playback state、亦冇 fire
  // PlaybackActiveTrackChanged/PlaybackState,令 App.js 呢邊完全唔知已經完咗
  // ——包括下面 pollState() 嗰個 2 秒一次嘅 getPlaybackState() poll,因為佢讀
  // 嘅都係同一個「卡死咗」嘅 native 內部狀態,唔淨係 event 冇 fire 咁簡單。
  // 呢度純粹屬 native SDK 行為,唔喺呢個 repo 度、亦唔准掂 native(同 §3.7
  // ExoPlayer timeout 嗰段一樣嘅限制)。
  //
  // Watchdog:position/duration 呢兩個數值嚟自另一條讀取路徑(AVPlayerItem 嘅
  // currentTime/duration 屬性),就算 state 卡咗都仲反映緊實際播放頭。淨係喺
  // 「貼近track尾+連續 3 秒完全冇郁」先當「真係完咗但native冇講我知」。
  //
  // 2026-08-12 Eric 真機再報一單:「有一天」(盛曉玫)卡喺 5:55/11:54,即係
  // 明顯唔喺尾聲、pause icon 顯示緊播放緊但完全冇聲——證明上面條「貼近track
  // 尾」嘅 gate 太窄,response 唔到中途 stall(SwiftAudioEx 個
  // AVWrapperItemPlaybackStalled() delegate 係完全空,ios/Pods/SwiftAudioEx/
  // Sources/SwiftAudioEx/AudioPlayer.swift:440-442 確認過——AVPlayerItem 中途
  // 派 AVPlayerItemPlaybackStalled 通知嗰陣,SwiftAudioEx 接住咗個 delegate call
  // 但入面乜都冇做,state 唔會轉,同track-end嗰個缺口係同一個技術根因、唔同
  // 觸發時機)。呢個係 Pods 入面嘅 vendored 依賴(SwiftAudioEx,經
  // react-native-track-player 帶入嚟),唔喺呢個 repo,亦冇喺 patches/ 度整
  // 個 patch-package——照跟 §3.7 嗰條「唔准掂 native」限制,喺 JS 層度用
  // poll 頂住呢個缺口(同上面 track-end watchdog 一樣嘅招數)。
  //
  // (順帶查過:呢首歌 DB 個 youtube_id 96WDXhk6qjU 用 yt-dlp 核實真身,單一
  // 首歌、真實長度 5:57——唔係大合輯/連續播放多首歌嗰種 video,5:55 stall
  // 已經非常貼近呢個真長度。App 度顯示嘅 11:54 總長明顯係另一個 duration
  // 顯示/上報獨立問題[真實媒體長度冇doubling,單獨起request驗證過],但同
  // 呢次stall recovery冧咗嘅根因冇直接關係——下面嘅 fix 已經唔再靠信賴
  // reported duration 嚟判斷,所以呢個獨立問題唔會影響 recovery 生效。)
  //
  // 泛化:淨係當「聲稱 Playing + position 連續 N 秒完全冇郁」就當 stall,唔理
  // 離 duration 有幾遠。近尾(<1.5s)當「真係播完」,直接用返原本嗰套 track-end
  // recovery;唔近尾就當「中途 stall」——先試一次「向前 nudge 個
  // seek+play()」逼 AVPlayerItem 喺嗰個位重新攞緊接落去嗰段data(呢招對「已經
  // buffer 落嚟嘅data用晒、AVPlayer冇再拉新data」嗰類 stall 好有用),仲係卡住
  // 先當呢首歌/呢段串流有問題,跌落去同track-end一樣嘅 skip 邏輯。
  const stuckEndTicksRef = useRef(0);
  const midStallTicksRef = useRef(0);
  const midStallNudgedRef = useRef(false);
  // EXEC-B123-20260901 B3 —— 記低 nudge fire 嗰刻嘅 position,等 poll loop
  // 度可以判斷「nudge 之後係咪真係郁咗 ≥1 秒」,郁咗就補返一次 nudge 額
  // (見下面 handleMidStreamStall + poll loop 兩處用法)。
  const midStallNudgeAnchorPosRef = useRef(null);
  // EXEC-B123-FIX-20260901 B3-nudge-budget-cap(第四件,不記名派工單提到嘅
  // 「順手」項)—— B3 補嘅 reset 路(下面 poll loop)本身冇上限:「播1秒→
  // 凍3秒(未夠3個frozen tick嗰陣位置郁咗少少)→補返nudge額」呢個序列理論上
  // 可以一首歌無限次重複,永遠唔會跌落 giveup(修呢張單之前,同一首歌第二次
  // 凍就直接跳歌,而家反而可能「賴死唔走」)。加返一個 per-track 上限,見下面
  // `handleMidStreamStall` 遞增、poll loop reset block 睇呢個上限、track-change
  // effect 歸零。
  const midStallNudgeCountRef = useRef(0);
  const MAX_MID_STALL_NUDGES_PER_TRACK = 3;
  // STREAM-LOCKSCREEN-STOP-ROOTCAUSE-2026-08-12 —— 上面兩個 watchdog(track-end/
  // mid-stream stall)淨係喺 native state 聲稱 `Playing` 先會觸發(下面
  // `claimsActive` 個 gate)。但 2026-08-12 真機撞到嘅「鎖屏播幾首歌後 widget
  // 完全消失」,backend log 顯示係一輪典型 AVPlayer stalling-retry-storm 訊號
  // (同一首歌短短15秒內30幾個 range request)——呢種卡法 native state 老實報
  // 緊 `Buffering`(唔係假扮 Playing 嗰種),所以兩個現存 watchdog 一個都唔會
  // 出手,一直卡到 iOS 見「冇真正出緊聲」自己收返背景執行權(呢個正正解釋
  // 點解個 widget 會成個消失,唔淨係停頓——`UIBackgroundModes:audio` 嘅背景權
  // 前提係要真係播緊嘢,永久 Buffering 唔算)。
  //
  // 呢度加返一條獨立分支頂呢個缺口:淨係計「聲稱 Buffering」嘅連續秒數(唔靠
  // position 郁唔郁——啱啱起播/冷 resolve 嗰陣 position 本身就係 0,唔可以當
  // stall 訊號)。門檻要夠鬆,唔好同正常冷 resolve(實測最壞 ~11s)撞埋:第一次
  // 15 秒先試軟踢一腳(唔 seek,單純再 play() 逼佢重新嘗試,同 mid-stream stall
  // 嗰套「唔知邊度卡死就唔好亂 seek」原則一致);再 15 秒仲係 Buffering 就當
  // 呢首歌/呢段串流救唔返,跌落去同 handleStuckTrackEnd 一樣嘅 skip/repeat 邏輯。
  const bufferingStuckTicksRef = useRef(0);
  const bufferingNudgedRef = useRef(false);
  // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.1 —— 前台 10 秒緩衝提示
  // (iOS build>=15 only)。獨立於下面 noticeText/showNotice(嗰套 2.8 秒自動
  // 消失,唔啱呢度「要跟住仲係咪卡緊」精確 show/hide 嘅需要)。ref 鏡像俾
  // poll loop 讀(避免將 state 擺入 effect deps 令 poll loop 重新掛載)。
  const slowLoadNoticeRef = useRef(false);
  const [slowLoadNotice, setSlowLoadNotice] = useState(false);
  const BUFFERING_STUCK_NUDGE_TICKS = 15;
  // NEXT-TRACK-LATENCY 2026-08-12 追加(Opus 5 驗收 punch list 第6點)——原本
  // 15+15=30 秒就會跳,同 backend 死鏈嘅最壞 resolve+retry 時間(RESOLVE_TIMEOUT_MS
  // 12s × 3 個 strategy = 36s,見 resolveAudio.js)有衝突:watchdog 會喺 backend
  // 仲未答之前搶先跳咗,本身應該成功嘅 retry 冧咗都嚟唔切見到。加落去到 30(即係
  // nudge 後再等 30 秒,總共 45 秒先跳),留返 9 秒安全邊際俾 36s 嘅最壞情況,
  // 唔會再同正常(雖然好慢)嘅 resolve 撞埋。
  const BUFFERING_STUCK_SKIP_TICKS = 30;
  const lastPollPositionRef = useRef(-1);
  // HLS-EXEC-D-FIXES-20260901 §2 D3 —— mid-stream-stall watchdog 嘅
  // 「有冇有效進展」訊號,見下面 stalled 判斷。iOS-only(見下面用法),
  // Android/progressive 行為完全唔變。
  const lastPollBufferedRef = useRef(-1);
  // HLS-EXEC-PREWINDOW-20260901 §4 W-d —— `bufferedAdvancing` 淨係要
  // bytes 仲喺度 append 落 loadedTimeRanges 就永遠 true,JS watchdog 就永久
  // 唔出手。呢個正正就係「backend 送緊但 AVFoundation 消化唔到」嗰隻追咗
  // 成星期嘅病(2026-09-01 02:04Z 真機log:backend 1 毫秒送咗成個檔三次,
  // client 全程 itemNil=1)——冇 cap 就係喺 JS 層親手重開返呢個洞。
  // bufferedAdvancingCreditRef 數緊「連續幾多個 tick position 凍住,但靠
  // buffered 仲喺度長大嚟抵銷咗 stalled 判斷」;抵銷夠 N 個 tick 就唔
  // 再賞面,即刻交返俾底層純 position 判斷(等同冇呢個 D3 訊號嗰陣嘅舊行為
  // ——position 再凍多 3 個 tick 就會 nudge,再 3 個就 giveup)。
  // EXEC-B123-20260901 B2 —— 原本 N=12 令 nudge 要等到 tick≈15(12+3)先
  // fire,對上 native watchdog 嘅 skip 死線(≈16s)淨返 ~1s margin,而 nudge
  // 本身由 fire 到 recovered 要 1.80–1.83s(真機實錘 id=4436/5407,兩單
  // native skip 都喺 nudge fire 之後 0.1–0.43s 內斬到,即係「自己人打交」,
  // 唔關 HLS 事)。收窄去 N=4:nudge 提早去 tick≈7(4+3),留返 ~9s margin
  // 俾 native 死線,遠夠 nudge 嘅 1.8s recovery 用。
  //
  // EXEC-B123-FIX-20260901 更正(上一版呢度寫「已經 smoke 過冇假觸發」係
  // 假嘅——嗰次 smoke 從未做成,詳見下面獨立段落,唔准淨係信呢句 comment):
  //
  // 靜態論證(讀 code 得出,唔係量出嚟):`bufferedAdvancingCreditRef` 淨係喺
  // `posFrozenThisTick` 為 true(position 連續兩個 tick 之間差 <0.05)先會
  // `+= 1`,一有真實移動即刻歸零(見下面 `else { ...current = 0; }`)。
  // `BUFFERED_ADVANCING_CAP_TICKS` 呢個常數淨係喺 `bufferedAdvancing` 嗰條
  // 運算式用到,而 `bufferedAdvancing` 淨係喺 `stalled` 運算式用到——一首歌
  // 正常播緊(position 逐 tick 郁),`posFrozenThisTick` 永遠 false,呢個
  // counter 永遠停喺 0,CAP 12 定 4 完全冇分別:CAP 呢個常數喺健康播放路徑上
  // 結構上唔會被讀到,淨係喺 position 已經凍咗(真・stall 已經開始)先會
  // 影響「仲信唔信 buffered 仲喺度長大」呢個判斷幾耐。
  //
  // Live 佐證(生產 client-log,唔係設計好嘅 smoke test):2026-09-01 全日
  // `midStallNudge` beacon 共 45 條,扣走 1 條(hymnId=708,09:03:35Z——同一
  // 分鐘撞正另一個 session 用緊同一部模擬器做緊 HLS 實測,唔當乾淨數據,
  // 見下面「模擬器實測」段)淨返 44 條,全部 `position=0`(冷開場)——一條都
  // 冇喺歌已經播緊、position>0 嗰陣觸發。呢個支持「CAP 提早咗冇引致健康
  // 播放中途假觸發」嘅結論,但呢個係翻查生產 log 得出嚟嘅事後統計,唔係
  // 專門設計嘅獨立 smoke test,冇覆蓋到「一首歌播到中途先撞正 stall」呢類
  // 場景嘅假陽性風險。
  //
  // 模擬器實測(progressive smoke)——未做,唔係「非範圍」,係做唔到:三次
  // 試喺 iPhone 17 Pro 模擬器(FF770D48-ED92-48AD-93D8-79FEA46CAA55)用
  // Release config 重 build 裝返新 JS,三次都失敗(CocoaPods encoding 錯誤 →
  // 加 LANG env 後撞 code-signing 錯誤 → 改行 xcodebuild 直起,起緊嗰陣發現
  // backend log 顯示另一個 session 同一分鐘用緊同一部模擬器做緊 D1-D5 HLS
  // 實測,即刻停手唔撞人哋)。完整過程見 `scratchpad/exec-b123-raw.md`
  // 「模擬器實測(B2 progressive smoke)」段。
  //
  // ⚠️ `HLS_ENABLED`(App.js:142)唔係常數——佢係 `let`,`/api/app-version`
  // 每次開 app 都會用 `data.hlsEnabled` 覆寫(見下面呢個 effect),backend
  // 一個 flag 就可以令 `.m3u8` 路徑喺**冇任何前端 rebuild**之下變 live,
  // 唔可以當佢係「呢個 build 永遠行唔到 HLS」嘅保證。
  const bufferedAdvancingCreditRef = useRef(0);
  const BUFFERED_ADVANCING_CAP_TICKS = 4;
  // EXEC-B123-FIX-20260901 B2-giveup-race(Opus5 揾到,零測試)—— 上面 CAP
  // 12→4 令 nudge 提早去 t≈7s,但 giveup(nudge 之後再凍幾多 tick 就
  // handleMidStreamStall_giveup→handleStuckTrackEnd()→skipToNext())之前
  // 一路用同一個「3 tick」門檻,即係 giveup 都跟住提早去 t≈7+3=10s。而 native
  // EXEC-B123-FIX-20260901 B2-giveup-race —— ⚠️ 試過拉長 post-nudge giveup
  // 門檻(`MID_STALL_GIVEUP_TICKS = 9`),已經 revert,唔好再試。原因(Opus5
  // 用 App.js 2086-2185 逐字 slice + 生產 log 對數推翻):
  //   1. 個論證自打嘴巴:聲稱 giveup 落 t≈16「喺 native 15-17s window 之後」,
  //      但 16 就喺 15-17 之內。
  //   2. 連個 16 都係錯——原本個 harness 硬寫 posSeries 全 0,冇 model 到
  //      nudge 自己個副作用。真身 nudge 係 `seekTo(pos + 0.3)`,下個 tick
  //      position 郁咗 0.3 → posFrozenThisTick=false → credit 同 midStallTicks
  //      一齊歸零。真機實錘:07:08:19.974 midStallNudge → 07:08:20.057
  //      nativeStall pos=0.3。真數係:純 stall 路 giveup 由 t=8 搬去 t=14,
  //      啱啱插入 native 嘅 abandon+reload 窗(t=10→16)正中間,反而製造
  //      zombie asset(memory 實錘會喺 mediaserverd 風暴 7-43 秒)。
  //   3. 用返 3:每一條路都「唔差過今日」。storm 路 giveup 落 t≈16 撞 native
  //      skip——但今日已經係咁,唔係新引入,而且一日只 fire 4 次。
  // 真正嘅贏面係 `BUFFERED_ADVANCING_CAP_TICKS` 12→4(nudge 由 t≈16 撞正
  // native skip,搬到 t≈8),嗰個有真機 log 對得到數,保留。
  // HLS-EXEC-PREWINDOW-20260901 §4 W-d —— 向後 seek 個窿(Opus5 揾到):
  // AVPlayerWrapper.swift:128 `bufferedPosition` 攞 `loadedTimeRanges` 入面
  // 「時間上最後」嗰個 range 嘅 end(即係跨全部 range 揾最大 end 時間),
  // 唔係跟緊家陣播緊嗰個 range。向後大幅 seek(例如 86%→10%)之後,舊
  // range(86% 嗰段)嘅 end 喺數值上仍然係全片最大,`bufferedPosition` 會
  // 卡死喺嗰個舊值唔郁,直到新位置嘅 range 追過返嗰個舊 end 為止——期間
  // `bufferedAdvancing` 恆等於 false,D3 嗰個「buffered 仲喺度長大」保護
  // 完全幫唔到手,同呢個 D3 訊號未加之前一模一樣(退化,唔係新病)。
  // 呢度**唔改 native**:靠喺 poll loop 本身偵測「position 突然大幅倒退」
  // (即係啱啱發生咗一次向後 seek),開一個短暫 grace window,window 之內
  // 完全跳過 stalled 判斷(唔理 position/buffered 點,當冇事)——畀
  // AVFoundation 有時間真正開始由新位置攞緊 data。Grace 過咗之後跌返落
  // 正常 position-based 判斷(同冇呢個 fix 之前一樣嘅 3-tick 門檻),真係
  // stall 仍然會俾捉到,唔會永久收埋個 watchdog。
  // ⚠️ 呢個做法冇修到 native 個 `.last` bug 本身(bufferedPosition 呢個
  // 數值喺向後 seek 之後仍然會誤導——例如 UI 度顯示嘅「已緩衝」條會睇落
  // 好古怪),淨係補住 watchdog 誤判嗰單。6 ticks(≈6秒,等於一次完整
  // nudge+giveup 循環)係初值,未喺真機/模擬器驗證過夠唔夠,量完要報返。
  const backwardSeekGraceTicksRef = useRef(0);
  const BACKWARD_SEEK_GRACE_TICKS = 6;
  const BACKWARD_SEEK_JUMP_THRESHOLD_SEC = 2; // 分辨「真係向後seek」同「poll抖動」
  // HLS-EXEC-STARTUP-GRACE-20260902(aefcd58,已 OTA rollback)—— 當時由
  // Eric 真機 hymnId=1298 立案:HLS 起播期(iOS + active track URL 係 `.m3u8`
  // + pos<1.0)seg1-seg8 八段連續流入,JS watchdog 卻用 progressive 門檻響
  // t≈12s giveup 兼降級去 progressive(本身沉緊嗰隻船)。嗰版做咗 R1(cap
  // 豁免)/R2(8-tick)/R3(30s ceiling)/R4(起播期唔准降級),出街即俾真機
  // hid=28 推翻 R1-R3:JS 靜晒都冇用,position 照釘 0 到 native 16s 斬。
  // R1-R3 已刪,只剩 R4(見 handleStuckTrackEnd)。而家嘅起播期邏輯係下面
  // KICK 單嘅 K1/K2;非起播期(progressive iOS、HLS 中途 pos>=1、Android)
  // 嘅 watchdog 決策同 84f2e03 逐 tick 一樣,唯一多咗嘅係起播期凍 tick 嗰下
  // 一次 getActiveTrack() 嘅 native round-trip。
  // HLS-EXEC-STARTUP-KICK-20260902 K1 —— 取代上面 GRACE 單嘅 R1(bufferedAdvancing
  // cap 豁免)/R2(8-tick 門檻)/R3(30s ceiling):真機 hid=28 證實純粹拉長 JS
  // 門檻救唔到,因為病根本唔喺 JS 判斷太快 giveup ——係 AVPlayer 自己
  // `avPlayer.rate` 跌咗去 0 之後,`didChangeTimeControlStatus(.paused)`
  // 嗰段 `currentTime>0` guard 喺 currentTime==0 時唔成立,冧咗個「攞返
  // rate=1」嘅動作,冇人再幫手,一直卡到 native watchdog 16 秒死線。
  // 修法:起播期(hlsStartup)每隔 2 個凍 tick 就 `swNudgePlay()`
  // (`setPlayWhenReady(true)`,唔經 `play()`,唔驚動 native breaker),
  // 頂替呢個冧咗嘅動作,唔使 seek。R1/R2/R3 嘅常數同邏輯已刪。
  const hlsStartupKickTicksRef = useRef(0);
  const hlsStartupKickCountRef = useRef(0);
  const HLS_STARTUP_KICK_INTERVAL_TICKS = 2;
  const HLS_STARTUP_KICK_MAX_PER_TRACK = 8;
  // STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13 D1 —— Opus5 核實過RN喺background
  // 唔會節流JS timer(CADisplayLink轉NSTimer照跑),真正停係iOS成個process
  // suspend咗。呢個poll loop理論上應該全速1秒一tick,如果兩個tick之間嘅
  // wall-clock時間爆錶,即係中間成個process俾suspend咗(假說A);如果一直都係
  // 1秒一tick、冇drift,但state卡住唔郁,就係跌落冇watchdog管嘅state(假說B)。
  // 一個數字就分到,唔使Xcode/device log。
  const lastTickTsRef = useRef(Date.now());
  const driftLogRef = useRef([]); // 本地ring buffer,封頂20條
  // O1-A(O1-O2-REPLAN-20260819.md §3.3)—— 記低啱啱嗰嚿 poll 瞓覺,目標瞓咗
  // 幾耐,俾下一個 tick 嘅 drift 探測用嚟減,唔再寫死 1000。
  const lastPollTargetMsRef = useRef(1000);
  const handleStuckTrackEnd = useCallback(async (opts) => {
    // EXEC-B123-FIX-20260901 B1-nearEnd-race(Opus5 揾到,零測試)—— 呢個
    // function 有三個 caller:mid-stream stall giveup(1805 行)/buffering
    // stuck giveup(1857 行)/poll loop 嘅 `nearEnd` 分支(2060 行,pos>=
    // dur-1.5,即「歌播完但 native 唔肯過下一首」嗰種)。下面新加嘅 hlsFallback
    // 分支原本冧硬喺最頂、喺 repeat/skip 判斷之前,冇分辨呢三種 caller——一首
    // HLS 歌播到 3:58/4:00 先卡死,會俾呢個分支當「呢段 HLS 播唔到」熱換
    // progressive URL 由 0:00 重播成首歌,唔係去下一首(poll loop 原本設計
    // 嘅正確行為)。`nearEnd` caller 傳 `{ nearEnd: true }`,下面用嚟閂咗
    // hlsFallback 分支,跌返落原有 repeat/skip 流程。
    const isNearEndCall = !!(opts && opts.nearEnd);
    try {
      const idx0 = currentQueueIndexRef.current ?? 0;
      const q0 = queueRef.current || [];
      let diagProgress = null;
      try { diagProgress = await TrackPlayer.getProgress(); } catch (_) {}
      logDiag('handleStuckTrackEnd', {
        appState: appStateRef.current,
        hymnId: q0[idx0]?.id ?? null,
        position: diagProgress?.position,
        duration: diagProgress?.duration,
        repeatMode: repeatModeRef.current,
        errorSkipCount: errorSkipCountRef.current,
        detail: `idx=${idx0} qlen=${q0.length} nearEnd=${isNearEndCall}`,
      }, { always: true });

      // EXEC-B123-20260901 B1 —— `hlsFallback` 降級分支之前淨係掛喺
      // `PlaybackError` 事件度(見上面 unsubscribeError),但實測 `PlaybackError`
      // 全日 0 命中(所有窗口),即係嗰段降級 code 結構上永遠行唔到。實際
      // 發生嘅係:AVPlayer 卡喺 `duration=0` 嘅幻影 Playing,唔拋
      // `PlaybackError`,反而由呢度(通用 stuck-track-end watchdog)直接
      // `skipToNext()` 跳去完全唔相干嘅下一首(實測發生率 4.6–7.3%,見
      // exec-b123-raw.md)。呢度加返同款分支,喺任何 skip/repeat 決定**之前**
      // 攔截:如果而家播緊嘅係 `.m3u8` 而且呢首歌未降級過,熱換返同一首歌嘅
      // progressive URL,唔跳去第二首。同 PlaybackError 嗰段共用
      // `hlsDowngradedTrackRef`(同一支計數器,同一個「只降級一次」保證)。
      // ⚠️ EXEC-B123-FIX-20260901:淨係 `!isNearEndCall` 先行呢個分支——nearEnd
      // caller 已經確認呢首歌播到尾,唔係「HLS 段播唔到」,應該直接落去下面
      // 原有 repeat/skip 邏輯過下一首,唔好由 0:00 重播同一首歌。
      const curId0 = q0[idx0]?.id ?? null;
      if (Platform.OS === 'ios' && curId0 != null && !isNearEndCall) {
        try {
          const activeTrack0 = await TrackPlayer.getActiveTrack();
          const activeUrl0 = activeTrack0?.url;
          const isHlsUrl0 = activeUrl0 && /\.m3u8(\?|$)/.test(String(activeUrl0));
          // HLS-EXEC-STARTUP-GRACE-20260902 R4 —— §0 hymnId=1298 條鏈證實
          // 咗:起播期(position<1)嘅 giveup 唔准降級去 progressive,因為
          // progressive 本身正正係沉緊嗰隻船(同一晚 itemNil storm)。淨係
          // position>=1(HLS 中途真係播過先卡死)先准熱換;起播期就出
          // `hlsFallbackSuppressed` beacon,跌落下面原有 repeat/skip 流程
          // (唔 return)。
          // Opus5 驗收(2c):position 讀唔到(getProgress 拋錯/undefined)唔准
          // 當 0——否則 HLS 中途(真 pos=120)嘅 giveup 會誤走 suppressed 路,
          // 而嗰條路係呢張單明文唔准變嘅。讀唔到就行返舊 hotswap 分支。
          const posForFallback0 = diagProgress?.position;
          const startupSuppress0 = Number.isFinite(posForFallback0) && posForFallback0 < 1;
          if (isHlsUrl0 && hlsDowngradedTrackRef.current !== curId0 && startupSuppress0) {
            logDiag('hlsFallbackSuppressed', {
              appState: appStateRef.current,
              hymnId: curId0,
              position: posForFallback0,
            }, { always: true });
          } else if (isHlsUrl0 && hlsDowngradedTrackRef.current !== curId0) {
            hlsDowngradedTrackRef.current = curId0;
            // EXEC-B123-FIX-20260901 —— 原版(PlaybackError 嗰段,App.js:1256)
            // 同一個熱換模式明文寫低 `retriedTrackRef.current = curId`「呢次熱換
            // 當『已 retry』」,B1 呢度複製漏咗呢一句。補返:唔係同一支計數器
            // 就會令之後(如果進度版都爆)PlaybackError 嗰段誤判「未 retry 過」
            // 再多等一次 retry() 先至跌落 skip,同 file:// 分支/HLS 分支兩個
            // 已有先例唔一致。
            retriedTrackRef.current = curId0;
            const freshTrack0 = toTrack(q0[idx0], { forceProgressive: true });
            logDiag('hlsFallback', {
              appState: appStateRef.current,
              hymnId: curId0,
              position: diagProgress?.position,
              duration: diagProgress?.duration,
              detail: `from=stuckTrackEnd url=${String(activeUrl0)}`,
            }, { always: true });
            if (NATIVE_WD_V2) {
              transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
            }
            try {
              await TrackPlayer.load(freshTrack0);
            } catch (loadErr) {
              await TrackPlayer.remove(idx0);
              await TrackPlayer.add(freshTrack0, idx0);
              await TrackPlayer.skip(idx0);
            }
            expectPlayingRef.current = true;
            await TrackPlayer.play();
            return;
          }
        } catch (_) { /* 自癒失敗 → 跌落下面原有 repeat/skip 流程 */ }
      }

      if (repeatModeRef.current === 2) {
        // repeat-one:native 冇自動重播(上游 #1995 講嘅正正係呢個場景),手動
        // 由頭嚟過。
        expectPlayingRef.current = true;
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
        return;
      }
      const idx = currentQueueIndexRef.current ?? 0;
      const q = queueRef.current || [];
      const hasNext = repeatModeRef.current === 1 || idx < q.length - 1;
      if (hasNext) {
        // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.2 —— 呢個 skip 係 JS 自己
        // 嘅 watchdog(mid-stream stall / buffering stuck / 近尾卡死)發起,唔係
        // native 前台 watchdog 靜靜哋跳嘅嗰種。要喺 PlaybackActiveTrackChanged
        // 度俾人認得出「呢次轉track JS 有預期」,唔好誤判做「native 冧咗」再加多
        // 一次 errorSkipCountRef(嗰個熔斷已經喺 handleBufferingStuck/
        // PlaybackError 自己嗰陣加咗,呢度唔可以再計——見§4.2「唔准double
        // count」)。重用現成嘅 transitionT0Ref 機制(同 tapNext/tapQueue 果套
        // 一樣),淨係 NATIVE_WD_V2 先寫,Android/舊 build 嘅 origin=auto 標籤
        // 完全唔變。
        if (NATIVE_WD_V2) {
          transitionT0Ref.current = { ts: Date.now(), origin: 'jsRecover', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
        }
        await TrackPlayer.skipToNext();
        // 見 handleNextTrack() 嗰句一樣嘅原因(SwiftAudioEx QueuedAudioPlayer.next()
        // 冇 playWhenReady:true,單靠佢自己嗰套 preserve-existing-flag 邏輯響呢個
        // 卡死場景未必信得過)——明文再叫一次 play() 逼佢真係郁,唔淨係靠估。
        expectPlayingRef.current = true;
        await TrackPlayer.play().catch(() => {});
      } else {
        // 成個 queue 真係播晒——native 卡住嘅「播放緊」係假嘅,強制歸位到
        // 「已停」,UI/鎖屏至會反映返實況。
        expectPlayingRef.current = false; // D2 — 我哋主動叫嘅pause
        await TrackPlayer.pause().catch(() => {});
        setTrackState(TPState.Paused);
      }
    } catch (e) {
      console.warn('[player] stuck-track-end recovery failed:', e?.message || e);
    }
  }, []);

  // 中途 stall(唔近尾)——第一次先試 nudge(前跳0.3s再play()逼佢重新拉
  // data),留個 flag 記住「呢首歌已經nudge過」;如果 nudge 完再卡多 3 秒即係
  // nudge 都救唔到(串流呢段真係有問題),先跌落去 handleStuckTrackEnd 嗰套
  // skip/repeat 邏輯,唔好一直喺同一首歌度死等。track 一轉(見下面
  // PlaybackActiveTrackChanged 個 effect)個 flag 會reset,新歌有自己一次
  // nudge 機會。
  const handleMidStreamStall = useCallback(async (ticksAtTrigger) => {
    try {
      if (!midStallNudgedRef.current) {
        midStallNudgedRef.current = true;
        // EXEC-B123-FIX-20260901 B3-nudge-budget-cap —— 每次真係 fire 一次
        // nudge(唔係 giveup 嗰個 branch)就計一次,配合下面 poll loop reset
        // block 嘅上限,防止「播1秒→凍3秒→nudge」喺同一首歌無限循環。
        midStallNudgeCountRef.current += 1;
        const pos = lastPollPositionRef.current;
        // EXEC-B123-20260901 B3 —— 記低呢刻嘅 position 做「復原錨點」,poll
        // loop 見到 position 由呢個錨點郁咗 ≥1 秒就當呢次 nudge 真係救返
        // 咗,補返一次額(見下面 poll loop)。
        midStallNudgeAnchorPosRef.current = pos;
        console.warn('[player] mid-stream stall detected @', pos, '— nudging seek+play');
        // HLS-EXEC-PREWINDOW-20260901 §3 W-c —— 之前呢個第一次 nudge 淨係
        // console.warn,冇 logDiag,全日 client-log 出現 0 個 nudge、只有
        // giveup(見下面)——即係 D3 個「HLS 之下 seek 完 AVPlayer 會假報
        // Playing」診斷假設結構上永遠冇得證實(冇資料)。呢度補返個 beacon,
        // 同 giveup 一樣低頻事件,用 always:true。
        const curSongNow = queueRef.current[currentQueueIndexRef.current];
        logDiag('midStallNudge', {
          appState: appStateRef.current,
          hymnId: curSongNow?.id ?? null,
          position: pos,
          bufferedNow: lastPollBufferedRef.current,
          detail: `ticks=${ticksAtTrigger ?? '?'}`,
        }, { always: true });
        expectPlayingRef.current = true;
        await TrackPlayer.seekTo(Math.max(0, pos + 0.3));
        await TrackPlayer.play().catch(() => {});
        return;
      }
      console.warn('[player] mid-stream stall persists after nudge — treating as unrecoverable, skipping');
      // HLS-EXEC-D123-GATE-20260901 P2 —— 呢個 giveup 之前冇 hymnId,Stage D
      // 出事歸唔到邊首歌。用同一個 scope 入面 midStallNudge(上面)攞 hymnId
      // 嘅同一個來源(queueRef[currentQueueIndexRef])補返。
      const curSongGiveup = queueRef.current[currentQueueIndexRef.current];
      logDiag('handleMidStreamStall_giveup', { appState: appStateRef.current, hymnId: curSongGiveup?.id ?? null, position: lastPollPositionRef.current }, { always: true });
      await handleStuckTrackEnd();
    } catch (e) {
      console.warn('[player] mid-stream stall recovery failed:', e?.message || e);
    }
  }, [handleStuckTrackEnd]);

  // STREAM-LOCKSCREEN-STOP-ROOTCAUSE-2026-08-12 —— 「聲稱 Buffering 太耐冇轉」
  // 嘅復原:第一次淨係再 play() 軟踢一腳(唔 seek——呢首歌可能仲未真正播過
  // 一格,冇一個「已知安全」嘅位可以 seek 去);踢完都仲係卡就當救唔返,跌落去
  // 同 track-end 一樣嘅 skip/repeat 邏輯(唔好一直卡喺同一首歌等 iOS 自己收
  // 背景權)。
  const handleBufferingStuck = useCallback(async () => {
    try {
      if (!bufferingNudgedRef.current) {
        bufferingNudgedRef.current = true;
        console.warn('[player] stuck-in-buffering detected — nudging play()');
        expectPlayingRef.current = true;
        // STARTUP-ROOTFIX-EXEC-BC-20260831 §2.3:build 17 起,呢個自動 nudge
        // 唔可以再用 TrackPlayer.play()——嗰條路會撞落 native watchdog 嘅
        // onUserPlay(),當呢下自動動作係「用戶明文撳播」去 reset
        // breakerLatched/consecutiveSkips。改用 swNudgePlay()(setPlayWhenReady,
        // 唔經 play())。build<17/Android 冇呢個顧慮,行返原本嘅 TrackPlayer.play()。
        if (NATIVE_WD_V3) {
          await swNudgePlay().catch(() => {});
        } else {
          await TrackPlayer.play().catch(() => {});
        }
        return;
      }
      console.warn('[player] stuck-in-buffering persists after nudge — treating as unrecoverable, skipping');
      logDiag('handleBufferingStuck_giveup', { appState: appStateRef.current, errorSkipCount: errorSkipCountRef.current }, { always: true });
      // NEXT-TRACK-LATENCY 2026-08-12 追加(Opus 5 驗收 punch list 第5點)——之前
      // 呢度冧咗都係直接 handleStuckTrackEnd() 跳落一首,冇熔斷:網絡真係斷咗嘅
      // 話,每首歌都會重複「nudge 一次、再冧就跳」,即係每 ~30-45 秒自動跳一首,
      // 10 分鐘可以跳成 20 首。同 §3.7 PlaybackError 個熔斷器共用同一條
      // errorSkipCountRef——兩者都係「呢首/呢幾首播唔到聲」嘅訊號,應該計埋
      // 同一條數(而且都係靠同一句「真係播到聲」嗰下 reset,見上面 line ~672)。
      // 門檻同背景/前台分流完全對齊 §3.7:前台 3 次、背景 6 次。
      errorSkipCountRef.current += 1;
      const isBackground = appStateRef.current !== 'active';
      const threshold = isBackground ? 6 : 3;
      if (errorSkipCountRef.current >= threshold) {
        expectPlayingRef.current = false; // D2 — 我哋主動叫嘅pause
        await TrackPlayer.pause().catch(() => {});
        errorSkipCountRef.current = 0;
        if (isBackground) {
          pendingPlaybackNoticeRef.current = '背景播放中斷：連續多首歌載入唔到，已暫停';
        } else {
          Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
        }
        return;
      }
      await handleStuckTrackEnd();
    } catch (e) {
      console.warn('[player] stuck-in-buffering recovery failed:', e?.message || e);
    }
  }, [handleStuckTrackEnd]);

  // 新歌一上場,舊歌嗰啲「已經nudge過」flag要reset,唔好累到新歌一開波就
  // 當自己已經nudge失敗一次。
  useEffect(() => {
    midStallNudgedRef.current = false;
    midStallTicksRef.current = 0;
    midStallNudgeAnchorPosRef.current = null; // EXEC-B123-20260901 B3
    midStallNudgeCountRef.current = 0; // EXEC-B123-FIX-20260901 B3-nudge-budget-cap
    bufferingNudgedRef.current = false;
    bufferingStuckTicksRef.current = 0;
    // HLS-EXEC-PREWINDOW-20260901 §4 W-d —— 新 track 上場,舊 track 遺留低嘅
    // 「連續抵銷夠幾多個 tick」/「向後 seek grace 仲有幾多 tick」都要歸零,
    // 唔好累到新歌一開波就用緊舊歌嘅狀態(track boundary 本身喺 poll loop
    // 個 prevPos/pos 比較會被當成一次大幅「向後跳」,唔靠呢度 reset 都唔會
    // 出事——但呢度做埋令個語義乾淨返,同其餘幾個 ticks ref 一致)。
    bufferedAdvancingCreditRef.current = 0;
    backwardSeekGraceTicksRef.current = 0;
    // HLS-EXEC-STARTUP-KICK-20260902 K1 —— 新 track 上場,舊 track 遺留低嘅
    // kick tick 計數/kick 次數都要歸零,新歌有自己一份 kick 額。
    hlsStartupKickTicksRef.current = 0;
    hlsStartupKickCountRef.current = 0;
    // NATIVE-STALL-FG-SPEEDUP §4.1 —— 新 track 上場,舊 track 嘅緩衝提示唔應該
    // 留喺度(例如用戶手動跳去下一首,新歌先啱啱開始 loading,唔算「卡」)。
    if (NATIVE_WD_V2 && slowLoadNoticeRef.current) {
      slowLoadNoticeRef.current = false;
      setSlowLoadNotice(false);
    }
  }, [currentQueueIndex]);

  // Progress — poll TrackPlayer.getProgress() directly instead of useProgress hook
  // This avoids the hook being mounted before TrackPlayer is ready
  useEffect(() => {
    if (!queueReady) return;
    let mounted = true;

    // O1-A(O1-O2-REPLAN-20260819.md §3.3)—— 唔係 Playing/Buffering(idle)
    // 嗰陣目標瞓 2500ms 慳電,但唔可以一瞓就瞓成 2.5 秒先醒:用 500ms 分片瞓,
    // 每片起身check返trackStateRef,一轉活躍(撳咗play)即刻break返1s節奏,
    // 唔會撳完play要等成2-3秒先郁進度。Watchdog唔受影響——佢哋淨係喺
    // Playing/Buffering先計tick,嗰陣呢個函數本身都係行緊1s嗰條路。
    // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §8 Addendum(Opus5驗收D-note1)——
    // `Loading` 原本跌入呢度嘅2.5秒idle節奏,令1769行嗰個buffering/loading
    // counter嘅「tick=1秒」假設喺Loading狀態失效(banner 10 tick會變25s、
    // nudge 15 tick變37.5s、skip累計變112s)。前台+iOS build>=15
    // (`NATIVE_WD_V2`)先至將 Loading 都攞去行1秒快路,同 Playing/Buffering睇齊;
    // build≤14/Android唔滿足呢個gate,維持原本2.5秒idle節奏——呢個唔係漏,
    // 係刻意gate住,避免OTA一推就令Android/舊build嘅JS ladder實際時序提前變
    // (§2「一次過出」紀律)。
    // §9 Addendum(2026-08-30,Opus5 §8驗收D-note)—— 上面「前台+iOS build>=15」
    // 果句喺§8嗰陣淨係得個名:`NATIVE_WD_V2`本身冇appState項,背景一樣行呢條
    // 1秒快路,令背景Loading死鏈嘅JS nudge由~37.5s提前到~15s、行喺native
    // 背景detect(20-22s)之前撳返0 native `consecutiveSkips`,背景3-strike
    // 熔斷失效。而家condition加咗`appStateRef.current === 'active'`,先真係
    // 做到「前台+iOS build>=15」;背景一律維持build 14現狀2.5秒idle節奏。
    async function sleepPollInterval() {
      if (
        trackStateRef.current === TPState.Playing ||
        trackStateRef.current === TPState.Buffering ||
        (NATIVE_WD_V2 && appStateRef.current === 'active' && trackStateRef.current === TPState.Loading)
      ) {
        lastPollTargetMsRef.current = 1000;
        await new Promise(r => setTimeout(r, 1000));
        return;
      }
      const IDLE_TARGET_MS = 2500;
      const SLICE_MS = 500;
      let slept = 0;
      while (slept < IDLE_TARGET_MS) {
        await new Promise(r => setTimeout(r, SLICE_MS));
        slept += SLICE_MS;
        if (
          trackStateRef.current === TPState.Playing ||
          trackStateRef.current === TPState.Buffering ||
          (NATIVE_WD_V2 && appStateRef.current === 'active' && trackStateRef.current === TPState.Loading)
        ) break;
      }
      lastPollTargetMsRef.current = slept;
    }

    async function poll() {
      while (mounted) {
        // STREAM-LOCKSCREEN-FREEZE-OPUS5-2026-08-13 D1 —— drift探測要喺
        // try/catch外面、喺getProgress()之前計,先至唔會受native call失敗影響,
        // 亦先至量到嘅係「呢個poll loop本身隔咗幾耐先再行到」,唔係其他嘢。
        const nowTs = Date.now();
        const drift = nowTs - lastTickTsRef.current - lastPollTargetMsRef.current;
        lastTickTsRef.current = nowTs;
        if (drift > 5000) {
          driftLogRef.current.push({ ts: nowTs, driftMs: drift });
          if (driftLogRef.current.length > 20) driftLogRef.current.shift();
          logDiag('wallClockDrift', {
            appState: appStateRef.current,
            trackState: trackStateRef.current,
            detail: `driftMs=${drift}`,
          }, { always: true });
        }
        try {
          const progress = await TrackPlayer.getProgress();
          if (mounted) {
            const pos = progress.position || 0;
            progressStore.setState({ currentTime: pos }); // O1-B2:淨寫store
            // NATIVE-STALL-FG-SPEEDUP §4.2 —— 「呢首 track 真係播過」嘅最簡單訊號。
            if (NATIVE_WD_V2 && pos > 0.5) trackHasPlayedRef.current = true;
            // B14 修 —— toggleShuffle 會 reset()+add() 成個 native queue,呢 1 秒
            // poll 窗口入面有陣時 getProgress() 會短暫報 duration:0(隊列啱啱重
            // 起,新 metadata 未到手),之前直接 setDuration(0) 就即刻喺 UI 度
            // 睇到「總長 0:00 + 進度條彈返 0%」,自我修正返都要等成隻歌重新
            // buffer(§3.6 註解提過嘅代價)。呢個 0 淨係短暫、唔係真值,唔應該
            // 覆蓋一個已知嘅正確長度 —— 淨係喺攞到正數先更新,0/undefined 就
            // 保留返上一個已知值,唔會喺 UI 度出現「肯定係假」嘅 0:00。
            if (progress.duration > 0) {
              progressStore.setState({ duration: progress.duration }); // O1-B2:淨寫store,B14 guard保留
            }

            // Phase 1 量度 t1(fallback):Playing state event 冇嚟(或者轉歌時
            // state 冇離開過 Playing)就由 poll 收尾,精度 ±1s,夠做 baseline。
            if (
              transitionT0Ref.current &&
              transitionT0Ref.current.trackChangedSeen &&
              trackStateRef.current === TPState.Playing &&
              pos > 0.2
            ) {
              finishTransitionMeasure();
            }

            const dur = progress.duration || 0;
            const nearEnd = dur > 0 && pos >= dur - 1.5;
            // D3-1(STREAM-LOCKSCREEN-FREEZE-OPUS5 §D3,Eric 2026-08-25 拍板)——
            // 拆走 `pos > 0` 呢個前置:佢令「轉歌之後卡死喺 0:00 但 native 仲聲稱
            // Playing」永遠唔入呢個 watchdog(§4.3 覆蓋矩陣嘅洞)。誤判風險有限:
            // claimsActive 仍然係 Playing-only(起播慢嗰陣 native 報 Loading/
            // Buffering,唔會入呢度),真・Playing 而 position 連續 3 秒釘死喺
            // 0.00 就係病,唔係慢。
            // HLS-EXEC-D-FIXES-20260901 §2 D3 —— 診斷實錘(真機 log,
            // 2026-09-01 03:40:20-23):seek 之後 AVPlayer/RNTP 喺 HLS 之下
            // 會喺真正拉到新 segment 之前就報 `state=Playing`(progressive
            // 之下呢段等待期正確報 Buffering,唔會入呢個 Playing-only 分支
            // ——見下面 claimsActive 個 comment)。淨睇 position 郁唔郁分辨
            // 唔到「真係卡死」同「HLS seek 緊等緊新segment但已經有data落緊
            // 嚟」,backend log 喺嗰 3 秒之間持續送緊 segment(range 逐條
            // 遞增、ttfb 1-6ms),position 凍咗但唔係病。
            // 判準改做「有冇有效進展」(NATIVE-STALL-PROGRESS-PREDICATE-PLAN
            // v4 同一原則,呢度係 JS 層獨立實作):position 凍咗,但
            // `buffered`(loadedTimeRanges 映射出嚟嘅已落貨秒數)仲喺度長
            // 大,即係 segment request 仲流緊,唔算 stalled。`buffered`都凍
            // 埋先算真 stall——負控見 exec-d-fixes-raw.md(人工造嘅真 stall
            // 兩個都凍,watchdog 一樣出手)。
            // 淨係 iOS 開:Android 完全冇呢個 bug(純 progressive,冇 HLS),
            // `bufferedAdvancing` 恆等於 false 令 Android `stalled` 運算
            // 同今日一模一樣,一個字都冇變(§5 紅線)。
            const bufferedNow = progress.buffered || 0;
            const prevPos = lastPollPositionRef.current;
            const posFrozenThisTick = Math.abs(pos - prevPos) < 0.05;
            // HLS-EXEC-STARTUP-GRACE-20260902 —— hlsStartup 判斷:iOS + 現正
            // active track 嘅 URL 係 `.m3u8` + pos<1.0。淨係喺
            // `posFrozenThisTick && pos < 1` 先 await `TrackPlayer.getActiveTrack()`
            // 一次(§1「攞 active URL 嘅做法」):position 冇凍住或者已經播過
            // 1 秒嗰啲 tick,下面四條規則本身都唔生效,hlsStartup 留返 false
            // 一樣啱,唔使問 native。
            let hlsStartup = false;
            if (Platform.OS === 'ios' && posFrozenThisTick && pos < 1) {
              try {
                const activeTrackNow = await TrackPlayer.getActiveTrack();
                const activeUrlNow = activeTrackNow?.url;
                hlsStartup = !!(activeUrlNow && /\.m3u8(\?|$)/.test(String(activeUrlNow)));
              } catch (_) { hlsStartup = false; }
            }
            // HLS-EXEC-PREWINDOW-20260901 §4 W-d —— 向後 seek grace:呢個
            // tick 之前(prevPos)同而家(pos)一比,發現大幅倒退,就當「啱啱
            // 發生咗一次向後 seek」,開個短暫 grace window(見上面 ref 個
            // comment)。prevPos<0(poll loop 頭一個 tick,sentinel -1)唔算。
            const backwardSeekJustHappened = prevPos >= 0 && (prevPos - pos) > BACKWARD_SEEK_JUMP_THRESHOLD_SEC;
            if (backwardSeekJustHappened) {
              backwardSeekGraceTicksRef.current = BACKWARD_SEEK_GRACE_TICKS;
            }
            const inBackwardSeekGrace = backwardSeekGraceTicksRef.current > 0;
            if (backwardSeekGraceTicksRef.current > 0) backwardSeekGraceTicksRef.current -= 1;

            // W-d cap:抵銷夠 N 個 tick 就唔再賞面 bufferedAdvancing(詳見上面
            // bufferedAdvancingCreditRef 個 comment)。
            if (posFrozenThisTick) {
              bufferedAdvancingCreditRef.current += 1;
            } else {
              bufferedAdvancingCreditRef.current = 0;
            }
            const bufferedGrowingThisTick = bufferedNow - lastPollBufferedRef.current > 0.05;
            // HLS-EXEC-STARTUP-KICK-20260902 —— R1(hlsStartup 豁免 CAP)已刪:
            // K2 令 hlsStartup 之下成個 stalled/giveup 判斷都唔行(見下面),
            // 呢條 bufferedAdvancing 喺 hlsStartup 期間結構上讀唔到,豁免與否
            // 已經冇分別,跌返去出街現狀嘅純 CAP 判斷。
            const bufferedAdvancing = Platform.OS === 'ios'
              && bufferedGrowingThisTick
              && bufferedAdvancingCreditRef.current <= BUFFERED_ADVANCING_CAP_TICKS;
            const stalled = !inBackwardSeekGrace && posFrozenThisTick && !bufferedAdvancing;
            // 淨係 Playing 先算——Buffering 有可能係正常等緊data未到(RNTP
            // 呢種情況會轉 state=Buffering,唔會停留喺 Playing),唔想同
            // 「聲稱播放緊但native卡死」撞埋一齊誤判。
            const claimsActive = trackStateRef.current === TPState.Playing;
            // HLS-EXEC-STARTUP-KICK-20260902 K1 —— 起播期 kick tick 計數。
            // 用返 GRACE R3 留低嘅 `engagedNow`(player 真係「做緊嘢」
            // Playing/Buffering/Loading 先計,Paused/Ready/None 唔計亦歸零
            // ——避免「用戶暫停緊」/「隊列 load 咗未撳播」被誤判做起播卡
            // 死;X3 教訓:唔加 claimsActive-only gate,唔好俾 state 喺
            // Playing↔Buffering 之間飄就令 counter 歸零)。position 一郁
            // 或者換咗歌(track-change effect 歸零)就重新起計。
            const engagedNow = claimsActive
              || trackStateRef.current === TPState.Buffering
              || trackStateRef.current === TPState.Loading;
            if (engagedNow && hlsStartup && posFrozenThisTick) {
              hlsStartupKickTicksRef.current += 1;
            } else {
              hlsStartupKickTicksRef.current = 0;
            }
            // K1 —— 由第 2 個凍 tick 起,每隔 2 tick 就 swNudgePlay() 一次,
            // 每 track 上限 HLS_STARTUP_KICK_MAX_PER_TRACK 次。唔經
            // TrackPlayer.play(),唔會撞落 native watchdog 嘅 onUserPlay()
            // breaker-reset 路。
            // Opus5 驗收(3e/X8c):`trackStateRef` 由事件寫,用戶撳暫停之後遲
            // 一 tick 先變 Paused,呢個窗口 kick 照 fire 就會撤銷用戶暫停,兼令
            // native watchdog 嘅 userWantsPlayback 停喺 false(熄火)。
            // `expectPlayingRef` 喺 cmd_pause 係同步 set false 先 await pause,
            // 用佢做 gate 就 100% 擋到 app 內撳暫停嗰個競態。
            if (
              hlsStartup &&
              expectPlayingRef.current === true &&
              hlsStartupKickTicksRef.current >= HLS_STARTUP_KICK_INTERVAL_TICKS &&
              hlsStartupKickTicksRef.current % HLS_STARTUP_KICK_INTERVAL_TICKS === 0 &&
              hlsStartupKickCountRef.current < HLS_STARTUP_KICK_MAX_PER_TRACK
            ) {
              hlsStartupKickCountRef.current += 1;
              const curSongKick = queueRef.current[currentQueueIndexRef.current];
              logDiag('hlsStartupKick', {
                appState: appStateRef.current,
                hymnId: curSongKick?.id ?? null,
                position: pos,
                trackState: trackStateRef.current,
                detail: `n=${hlsStartupKickCountRef.current} frozenTicks=${hlsStartupKickTicksRef.current} bufferedNow=${bufferedNow}`,
              }, { always: true });
              swNudgePlay().catch(() => {});
            }
            // EXEC-B123-20260901 B3 —— 之前 midStallNudgedRef 一世淨係喺
            // track 換咗(currentQueueIndex effect)先 reset,同一首歌原位
            // 熱換(TrackPlayer.load()/repeat-one)完全唔改 index,凍多一次
            // 就零次 nudge 直入 giveup。呢度補第二條 reset 路:nudge 之後
            // position 真係由錨點郁咗 ≥1 秒(唔係 <0.05 嗰種 poll 抖動),即係
            // 呢首歌已經救返,補返一次 nudge 額俾佢,下次先至又要凍夠 3 tick
            // 先 giveup,唔使一路死等 native 死線。
            // ⚠️ EXEC-B123-FIX-20260901 兩條補丁:
            //   1) 加 `Platform.OS === 'ios'` gate——呢個 reset block 冧原本
            //      冇 platform 分流,派工單框住嘅範圍係「iOS stall 修」,
            //      Android 嘅 nudge budget 行為唔喺呢張單度改(同上面
            //      `bufferedAdvancing` 本身已經係 `Platform.OS === 'ios'`
            //      gate 一致,呢度補返冇改過嘅一段)。
            //   2) 加 `midStallNudgeCountRef.current < MAX_MID_STALL_NUDGES_PER_TRACK`
            //      上限——冇呢條,「播1秒→凍3秒(未夠3個frozen tick位置郁咗
            //      少少)→補額」呢個序列可以一首歌無限重複,永遠唔跌落
            //      giveup(修呢張單之前,同一首歌第二次凍就直接跳歌;而家
            //      如果冇上限反而會「賴死唔走」)。攞夠 3 次 nudge 額之後,
            //      呢個 track 唔再補額,下次凍夠門檻就正常 giveup。
            if (
              Platform.OS === 'ios' &&
              midStallNudgedRef.current &&
              midStallNudgeAnchorPosRef.current != null &&
              pos - midStallNudgeAnchorPosRef.current >= 1 &&
              midStallNudgeCountRef.current < MAX_MID_STALL_NUDGES_PER_TRACK
            ) {
              midStallNudgedRef.current = false;
              midStallNudgeAnchorPosRef.current = null;
            }
            lastPollPositionRef.current = pos;
            lastPollBufferedRef.current = bufferedNow;
            if (hlsStartup) {
              // HLS-EXEC-STARTUP-KICK-20260902 K2 —— JS 嘅 stalled/giveup
              // watchdog 起播期唔准行(R1/R2/R3 已刪):native 16s detect+
              // reload+escalate 死線(背景 ~28s)係最後防線,JS 淨係靠上面
              // K1 嘅 swNudgePlay() 幫手。歸零兩個 tick counter,等離開起播期
              // (pos>=1,連帶 hlsStartup 變 false)之後由零開始計。
              // ⚠️ Opus5 驗收:bufferingStuck 45s 嗰條路只喺 state=Buffering/
              // Loading 先計數;HLS 起播期 state 釘住 Playing,所以嗰條路喺
              // 呢度實際上唔會到,起播期 JS 真正剩低嘅只有 K1 八次 kick。
              stuckEndTicksRef.current = 0;
              midStallTicksRef.current = 0;
            } else if (stalled && claimsActive) {
              if (nearEnd) {
                midStallTicksRef.current = 0;
                stuckEndTicksRef.current += 1;
                if (stuckEndTicksRef.current >= 3) {
                  stuckEndTicksRef.current = 0;
                  // EXEC-B123-FIX-20260901 B1-nearEnd-race —— 傳 nearEnd:true,
                  // 令 handleStuckTrackEnd() 閂咗 B1 hlsFallback 分支(見上面
                  // function 頭嘅 comment),唔好由 0:00 重播成首歌。
                  handleStuckTrackEnd({ nearEnd: true });
                }
              } else {
                stuckEndTicksRef.current = 0;
                midStallTicksRef.current += 1;
                // EXEC-B123-FIX-20260901 —— 拉長 post-nudge 門檻嗰個嘗試已
                // revert(理由見上面 BUFFERED_ADVANCING_CAP_TICKS 附近個
                // comment)。兩個 round 一律 3 tick,同出街現狀一致。
                // HLS-EXEC-STARTUP-KICK-20260902 —— hlsStartup 之下呢個
                // 分支結構上唔會行到(上面 `if (hlsStartup)` 已經攔咗),
                // 呢度淨返 progressive/HLS 中途(pos>=1)嘅原有 3-tick 行為。
                const midStallThreshold = 3;
                if (midStallTicksRef.current >= midStallThreshold) {
                  // HLS-EXEC-PREWINDOW-20260901 §3 W-c —— 攞真正觸發嗰下嘅
                  // tick 數落嚟俾 handleMidStreamStall() 做 log(下面 reset
                  // 咗之後個 ref 已經係 0,冇得再讀)。
                  const ticksAtTrigger = midStallTicksRef.current;
                  midStallTicksRef.current = 0;
                  handleMidStreamStall(ticksAtTrigger);
                }
              }
            } else {
              stuckEndTicksRef.current = 0;
              midStallTicksRef.current = 0;
            }

            // STREAM-LOCKSCREEN-STOP-ROOTCAUSE-2026-08-12 —— 獨立於上面嗰個
            // `claimsActive`(Playing-only)分支:淨係計「聲稱 Buffering」嘅
            // 連續秒數,唔睇 position 郁唔郁(啱啱起播/冷 resolve position 本身
            // 就係 0,唔可以當停頓訊號)。呢個分支專門頂「native 老實報緊
            // Buffering,但其實卡喺 retry storm 永遠出唔到嚟」嗰種缺口——上面
            // 兩個 watchdog 淨係 Playing 先觸發,呢種情況一個都唔會出手。
            // D3-2(同上拍板)—— RNTP 嘅 `loading` 同 `buffering` 係兩個唔同
            // state,而轉歌一定經 loading;之前淨係計 Buffering,「卡死喺 loading
            // 出唔到嚟」(例如 resolve 死鏈)就冇 watchdog 管。兩個 state 共用
            // 同一個 counter/門檻——nudge/skip 語義一樣。
            // §8 Addendum —— 呢個「tick=1秒」嘅假設淨係喺 `NATIVE_WD_V2`
            // (前台+iOS build>=15)先成立,因為`sleepPollInterval()`嗰邊已經
            // 將 Loading 攞埋去1秒快路;build<=14/Android嘅 Loading 仍然行
            // 2.5秒idle節奏,即係呢個counter嘅tick喺嗰啲環境唔等於1秒
            // (banner/nudge/skip嘅實際秒數會被拉長,係現狀,唔係新引入嘅bug)。
            // §9 Addendum(2026-08-30,Opus5 §8驗收D-note)—— 上面「前台+iOS
            // build>=15」喺§8嗰陣其實冇被`sleepPollInterval()`實際執行
            // (`NATIVE_WD_V2`本身冇appState項,背景都會攞Loading去1秒快路),
            // 而家`sleepPollInterval()`嗰兩個condition已經加咗
            // `appStateRef.current === 'active'`,呢句comment所講嘅gate先真係
            // 生效;背景Loading一律維持build 14現狀(2.5秒idle節奏)。
            if (trackStateRef.current === TPState.Buffering || trackStateRef.current === TPState.Loading) {
              bufferingStuckTicksRef.current += 1;
              // NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.1 —— 10 秒非阻斷提示,
              // 純粹UI,唔郁落面 nudge(15)/skip(30,累計45秒)呢條階梯任何數字。
              // 前台 + iOS build>=15 先顯示;呢個 tick 節奏本身同 nudge/skip 共用
              // 同一個 counter,>=10 一定喺 nudge(>=15)之前先到。
              if (NATIVE_WD_V2 && appStateRef.current === 'active' && bufferingStuckTicksRef.current >= 10) {
                if (!slowLoadNoticeRef.current) { slowLoadNoticeRef.current = true; setSlowLoadNotice(true); }
              }
              if (!bufferingNudgedRef.current && bufferingStuckTicksRef.current >= BUFFERING_STUCK_NUDGE_TICKS) {
                bufferingStuckTicksRef.current = 0;
                handleBufferingStuck();
              } else if (bufferingNudgedRef.current && bufferingStuckTicksRef.current >= BUFFERING_STUCK_SKIP_TICKS) {
                bufferingStuckTicksRef.current = 0;
                handleBufferingStuck();
              }
            } else {
              bufferingStuckTicksRef.current = 0;
              // 一離開 buffering/loading(真出咗聲,或者轉咗第二個 state)—— 提示
              // 即刻收起,唔使等 §4.1 果邊嘅 2.8 秒 timeout 呢套機制(呢個係獨立
              // state,由呢度直接精準控制)。
              if (NATIVE_WD_V2 && slowLoadNoticeRef.current) {
                slowLoadNoticeRef.current = false;
                setSlowLoadNotice(false);
              }
            }
          }
        } catch (e) {
          // TrackPlayer not ready yet, skip
        }
        await sleepPollInterval();
      }
    }
    poll();

    return () => { mounted = false; };
  }, [queueReady, handleStuckTrackEnd, handleMidStreamStall, handleBufferingStuck]);

  // Poll player state as well
  useEffect(() => {
    if (!queueReady) return;
    let mounted = true;
    
    async function pollState() {
      while (mounted) {
        try {
          const raw = await TrackPlayer.getPlaybackState();
          if (mounted) {
            // v3: raw = enum; v4: raw = object with .state
            const val = typeof raw === 'object' && raw !== null ? raw.state : raw;
            setTrackState(val);
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    pollState();
    
    return () => { mounted = false; };
  }, [queueReady]);

  const isPlaying = trackState === TPState.Playing || trackState === TPState.Buffering;

  // playQueue: PHASE1-PLAYER-REBUILD.md §3.2 — the single entry point for
  // "start playing this list from this index". Hands the whole list to
  // TrackPlayer at once (stable per-song URLs via toTrack/stream proxy), so
  // native next/prev/repeat/background-auto-advance can take over instead of
  // JS recomputing "what's next" (see §1 root-cause).
  // 「單曲 + 自動隨機接續」(v231,Eric 要求,對齊 Spotify/YT Music)。
  //
  // 語義分界:
  //  - 用戶揀咗一個**完整清單**(chip「播全部」/「睇晒」入面撳歌/隨心聽)
  //    → `playQueue(list, idx)`,**照住清單次序播晒**,冇隨機尾巴。
  //  - 用戶淨係撳**一首散歌**(首頁一行歌 / 今日為你預備 / 最近加入 /
  //    詩歌庫 / 搜尋 / 繼續收聽)→ `playSingle(hymn, pool)`,
  //    隊列 = [嗰首歌, ...由 pool 隨機抽嘅接續],UI 會喺交界畫「正在隨機播放：」。
  //
  // 為咗唔好一次過餵成千首落 TrackPlayer(reset+add 嘅成本同 §3.6 一樣),
  // 隨機尾巴取 RADIO_LEN 首就夠;播到差唔多先算(暫時唔做無限接續)。
  const [autoRadioFrom, setAutoRadioFrom] = useState(null); // queue 由邊個 index 開始係自動接續
  const autoRadioFromRef = useRef(null);
  autoRadioFromRef.current = autoRadioFrom;
  // 2026-07-29 QUEUE-UX-4FIXES §3:插播歌視覺分隔——queue 頭幾多首係插播歌,
  // null = 冇插播。同 autoRadioFrom 一樣平行機關,喺 playQueue() 統一
  // set/clear(見下面),唔逐個 caller 執,避免漏清變鬼影分隔線。
  const [insertBoundary, setInsertBoundary] = useState(null);
  const insertBoundaryRef = useRef(null);
  insertBoundaryRef.current = insertBoundary;
  async function playSingle(hymn, pool) {
    if (!hymn) return;
    // 插播 —— 如果而家播緊一個「明確清單」(playQueue 直接開嗰種,冇自動尾巴,
    // 即 Library/搜尋撳單曲以外嗰種:清單「播全部」/清單入面撳歌),
    // 喺清單以外撳一首散歌唔應該換走成個清單:即刻播嗰首,播完接返落去
    // 原本清單嘅下一首,唔使額外 resume 狀態 —— 淨係將呢首歌擺喺
    // [新歌, ...原本清單餘低嗰截] 交返俾 playQueue,靠 native 自動接續。
    const curQ = queueRef.current || [];
    const curIdx = currentQueueIndexRef.current || 0;
    // headLen = 幾多首係用戶真係揀嘅(唔計自動接續尾巴)。PlaylistDetailSheet
    // 播嘅清單而家都會加尾巴(autoRadioFrom = list.length,唔係 null),所以
    // 唔可以再靠「autoRadioFrom == null」判斷係咪「明確清單」(P1,Opus 驗收揪出)。
    const headLen = autoRadioFromRef.current != null ? autoRadioFromRef.current : curQ.length;
    const isExplicitQueue = headLen > 1;
    const resumeRemainder = isExplicitQueue
      ? curQ.slice(curIdx + 1, headLen).filter((s) => String(s.id) !== String(hymn.id))
      : [];
    if (resumeRemainder.length > 0) {
      // insertBoundary: 1 —— 插播歌恆企喺 index 0,§3.3:插播永遠一首,
      // 邊個時候都係固定 1(唔使做動態數值)。
      await playQueue([hymn, ...resumeRemainder], 0, { autoRadioFrom: null, insertBoundary: 1 });
      return;
    }
    // 自動播放關咗 → 淨播嗰首,冇隨機尾巴(AUTOPLAY-MIX-PLAN:關咗就係關咗)
    if (!autoplayEnabledRef.current) {
      await playQueue([hymn], 0, { autoRadioFrom: null });
      return;
    }
    // 尾巴由全庫(hymns)按 flavor 加權抽;冇全庫先退返去 pool。
    const libr = (hymnsRef.current && hymnsRef.current.length)
      ? hymnsRef.current
      : (Array.isArray(pool) && pool.length ? pool : (queueRef.current || []));
    const tail = buildAutoplayTail(autoplayFlavorRef.current, hymn, libr, {
      playLog: getPlayLog(), recentIds: getRecentIds(),
    });
    const list = [hymn, ...tail];
    await playQueue(list, 0, { autoRadioFrom: tail.length > 0 ? 1 : null });
  }

  // 熱切換 flavor / toggle:唔斷歌 —— 剪走舊尾巴、生成新尾巴 add 返。
  // 只喺而家有自動尾巴(autoRadioFrom != null)先郁;冇尾巴就淨係存設定,下次
  // playSingle 先生效。⚠️ removeUpcomingTracks 之後 native queue = [0..current],
  // 所以要同步 queueRef/setQueue/autoRadioFrom,唔係 index 會對唔上(§3.5 教訓)。
  async function applyAutoplayFlavor(flavor) {
    setAutoplayFlavorState(flavor);
    setAutoplayFlavor(flavor);
    autoplayFlavorRef.current = flavor;
    if (autoRadioFromRef.current == null) return; // 冇尾巴,下次先生效
    await rebuildTail();
  }
  async function applyAutoplayEnabled(on) {
    setAutoplayEnabledState(on);
    setAutoplayEnabled(on);
    autoplayEnabledRef.current = on;
    if (on) {
      // 由關變開:如果而家播緊嘅係單曲(冇尾巴),補一條尾巴落去
      if (autoRadioFromRef.current == null) await rebuildTail(true);
      else await rebuildTail();
    } else {
      // 由開變關:淨係剪走自動尾巴,用戶自己揀嗰個清單(explicit head)要原封不動。
      if (autoRadioFromRef.current == null) return;
      try {
        const curQ = queueRef.current || [];
        const curIdx = currentQueueIndexRef.current || 0;
        const head = curQ.slice(0, autoRadioFromRef.current);
        await TrackPlayer.removeUpcomingTracks();
        // removeUpcomingTracks 會連 head 喺 curIdx 之後嗰截一齊剷埋(native queue
        // 淨返 [0..curIdx]),所以要 add 返落去,唔係 JS queue 同 native 會對唔上。
        const rest = head.slice(curIdx + 1);
        if (rest.length) await TrackPlayer.add(rest.map((s) => toTrack(s)));
        queueRef.current = head; setQueue(head);
        setAutoRadioFrom(null);
      } catch (e) { console.warn('autoplay off error:', e?.message); }
    }
  }
  async function rebuildTail(force) {
    try {
      const curQ = queueRef.current || [];
      const curIdx = currentQueueIndexRef.current || 0;
      const cur = curQ[curIdx];
      if (!cur) return;
      // ⚠️ 2026-07-30 Opus 5 驗收揪出:舊寫法用 slice(0, curIdx + 1) 做 head,即係
      // 當「而家播緊嗰首之後全部都係可以剷嘅尾巴」。呢個假設淨係喺 playSingle
      // 嗰種「單曲 + 尾巴」先成立;分類「播全部」/「睇晒」/隨心聽 build 出嚟嘅
      // explicit queue 一樣係 autoRadioFrom == null,結果撳一下「自動播放」toggle
      // 就會將用戶揀咗嗰個清單剩低嗰截直接剷走(實測:兒童 476 首播到第 396 首
      // 撳開自動播放 → 隊列淨返 426,尾嗰 80 首無聲無息冇咗)。同 playSingle()/
      // playQueue() 一樣用 headLen 分辨「明確清單嗰截」先啱。
      const headLen = autoRadioFromRef.current != null ? autoRadioFromRef.current : curQ.length;
      const head = curQ.slice(0, headLen);
      const libr = (hymnsRef.current && hymnsRef.current.length) ? hymnsRef.current : curQ;
      // 尾巴要避開 head 已經有嘅歌:queue list 個 keyExtractor 用 id,重複 id 會
      // 令 React 出 "two children with the same key" warning,「而家播緊」個高亮
      // 同時著兩行,而且撳第二行嗰陣 queue.findIndex() 會跳返第一行嗰個 index、
      // skip 去錯歌(2026-07-30 實測 logcat 見到 warning)。
      const headIds = new Set(head.map((s) => String(s.id)));
      const tail = buildAutoplayTail(autoplayFlavorRef.current, cur, libr, {
        playLog: getPlayLog(), recentIds: getRecentIds(),
      }).filter((s) => !headIds.has(String(s.id)));
      await TrackPlayer.removeUpcomingTracks();
      // native queue 而家淨返 [0..curIdx],所以 head 剩低嗰截同新尾巴都要 add 返。
      const rest = [...head.slice(curIdx + 1), ...tail];
      if (rest.length) await TrackPlayer.add(rest.map((s) => toTrack(s)));
      const newQ = [...head, ...tail];
      queueRef.current = newQ; setQueue(newQ);
      setAutoRadioFrom(tail.length ? headLen : null);
    } catch (e) { console.warn('rebuildTail error:', e?.message); }
  }


  // H6 修 — playQueue() 舊版一 call 就即刻做四個連續 await(lazyEnsurePlayer→
  // reset→add→skip→play)。用戶快速撳兩首歌會有兩條 playQueue 交錯行:第二條
  // 嘅 reset() 可能夾喺第一條嘅 add() 同 play() 中間 → queueRef/setQueue 係
  // 第二個 list,但 native queue 係第一個 list 嘅殘留 → index 對唔上、播錯歌
  // 或者空隊列。呢度改做同 lazyEnsurePlayer(initInFlightRef)一樣嘅排隊做法:
  // 每次 call 都掛喺上一個嘅 promise 後面先至真正行,保證 native TrackPlayer
  // 呼叫序列(reset/add/skip/play)唔會交錯——連續撳幾首都會逐個跑完先到
  // 下一個,最後跑嗰個先真係播出嚟,同用戶最新一下撳嘅意圖一致。playQueueImpl
  // 內部所有錯誤都自己 catch(唔會 reject),所以呢度唔使額外處理 chain 斷咗。
  // BATCH7 B7-11 — 上面 H6 個排隊保證咗唔會 native call 交錯,但冇 supersede:
  // 連環快撳 N 首歌會逐個做晒 N 次 reset+add(全隊)+play,中間每首都響一下
  // 先到最後嗰首(SECOND-PASS-REVIEW-20260820.md f6)。加 generation counter:
  // 輪到自己執行嗰刻先 check 係咪仲係最新一次 call——已經俾之後一次撳歌
  // superseded 嘅就唔使再做嗰四個連續 await,直接跳過(已經開始行緊嗰個
  // playQueueImpl 唔會中途中斷,呢個純粹擋住「仲未輪到自己執行」嘅過時隊員)。
  function playQueue(list, startIndex = 0, opts = {}) {
    const myGen = ++playQueueGenRef.current;
    const run = () => {
      if (myGen !== playQueueGenRef.current) return Promise.resolve();
      return playQueueImpl(list, startIndex, opts);
    };
    const next = playQueueChainRef.current.then(run, run);
    playQueueChainRef.current = next;
    return next;
  }

  async function playQueueImpl(list, startIndex = 0, opts = {}) {
    if (!Array.isArray(list) || list.length === 0) return;
    // 「(已下架)」佔位項唔可以餵落 TrackPlayer(2026-08-22 Eric 報「連續飛歌」)。
    //
    // FavoritesContext.replaceAllFavorites() 對「server 有呢個 hymn_id、但全庫
    // 同本地 cache 兩邊都揾唔到佢」嘅 id 會留一個 { unavailable: true } 灰態
    // 佔位(唔靜靜哋跌走,免得用戶以為心心自己唔見咗)。但 toTrack() 照樣會
    // 幫佢砌 `/api/stream/<id>`,而 backend 嗰條 route 係查 `hymns` view,查唔到
    // 就 404 —— 實測 id=2015 喺 17:12:02–17:13:27 俾 ExoPlayer 用退避重試撞咗
    // 21 次 404、燒咗 86 秒死寂,先至拋 PlaybackError 跌落 skip 分支。背景
    // 嗰陣 JS thread 俾 Doze 凍住(同一段 log 見到 driftMs 去到 21 分鐘),
    // 三個 JS watchdog 一個都救唔到,用戶感知就係「首歌無聲然後連環飛」。
    //
    // 呢個 flag 淨係喺「library 同本地 cache 都冇料」先會 set,即係我哋對呢個
    // id 一無所知,冇任何可播嘅嘢 —— 揀走佢零損失。library 未載入(空陣列)
    // 嗰陣所有 id 都會 fallback 落本地 cache 攞返 full object,唔會誤標,所以
    // 呢度唔會誤殺正常歌。
    const unavailableCount = list.filter((s) => s?.unavailable).length;
    if (unavailableCount > 0) {
      const tapped = list[startIndex];
      const playable = list.filter((s) => !s?.unavailable);
      if (playable.length === 0) {
        showNotice('呢首歌已經下架，播唔到');
        return;
      }
      // 用戶撳正嗰個下架項 → 出聲提示,並由佢後面第一首播得嘅歌開始。
      if (tapped?.unavailable) showNotice('呢首歌已經下架，跳去下一首');
      // startIndex 要跟住重新對位:數返「startIndex 之前」仲剩低幾多首播得嘅歌。
      const newStart = tapped?.unavailable
        ? Math.min(list.slice(0, startIndex).filter((s) => !s?.unavailable).length, playable.length - 1)
        : playable.findIndex((s) => String(s.id) === String(tapped.id));
      // autoRadioFrom / insertBoundary 都係「原本 list 入面第幾個位」嘅 index,
      // 剪走前面嘅項就要跟住縮返,唔係「正在隨機播放:」同插播分隔線會畫錯位。
      const shift = (b) => (typeof b === 'number'
        ? list.slice(0, b).filter((s) => !s?.unavailable).length
        : b);
      if (typeof opts.autoRadioFrom === 'number' || typeof opts.insertBoundary === 'number') {
        opts = { ...opts, autoRadioFrom: shift(opts.autoRadioFrom), insertBoundary: shift(opts.insertBoundary) };
      }
      list = playable;
      startIndex = newStart >= 0 ? newStart : 0;
    }
    // 插播(Eric 2026-07-28)—— 原意係詩歌庫/搜尋(`opts.browseTap`)撳嘅歌唔算
    // 「揀咗成個清單」,淨係「掃緊街見到一首想聽」。如果而家已經有第二個真.
    // 清單播緊(唔係呢首歌本身所屬嗰個 `list`),就淨係插播嗰首,播完接返
    // 落去嗰個清單嘅下一首,唔好成個清單換走。
    // 2026-07-30 更新(QUEUE-BEHAVIOR-3-SCENARIOS-PLAN §3.4):Eric 三場景規格
    // 推翻 BUG3(a) 之後,詩歌庫/即刻揀歌已經 revert 返行 playSingle() 條路
    // (唔再傳 opts),插播改由 playSingle() 自己嗰個分支處理(§3.3)。而家
    // **冇任何 caller 再傳 `browseTap`**——呢個分支照 `appendAutoplayTail`
    // 先例刻意保留做死碼機關,第時有 explicit 入口需要插播行為就用得返,
    // 唔好順手剷。分支本身邏輯冇改過一行。
    if (opts.browseTap) {
      const tapped = list[startIndex];
      const curQ = queueRef.current || [];
      const curIdx = currentQueueIndexRef.current || 0;
      // headLen/explicitHead:同 playSingle() 果句一樣嘅道理——而家播緊嘅清單
      // 可能已經加咗自動接續尾巴(PlaylistDetailSheet,autoRadioFrom != null),
      // 「係咪同一個清單」呢個判斷淨係應該睇明確嗰截,唔可以連隨機尾巴嗰
      // 30 首都攞嚟比對,唔係撳中尾巴任何一首都會誤判做「同一清單」而唔插播
      // (P1,Opus 驗收揪出)。
      const headLen = autoRadioFromRef.current != null ? autoRadioFromRef.current : curQ.length;
      const explicitHead = curQ.slice(0, headLen);
      const isDifferentExplicitQueue = headLen > 1
        && tapped && !explicitHead.some((s) => String(s.id) === String(tapped.id));
      const resumeRemainder = isDifferentExplicitQueue
        ? explicitHead.slice(curIdx + 1).filter((s) => String(s.id) !== String(tapped.id))
        : [];
      if (resumeRemainder.length > 0) {
        list = [tapped, ...resumeRemainder];
        startIndex = 0;
        // §3.3:插播恆企 index 0——再插第二首時呢個分支會用而家隊列重新砌
        // [新插播歌, ...explicitHead 餘下],上一首插播歌(嗰陣 curIdx=0,
        // slice(curIdx+1) 由 1 開始)自然唔會帶落新隊列,唔使動態 boundary。
        opts = { ...opts, insertBoundary: 1 };
      }
    }
    // BUG3(b) P0(Eric 實測,已於 2026-07-29 推翻)—— 呢個分支曾經俾
    // PlaylistDetailSheet 傳 opts.appendAutoplayTail 觸發,令自訂清單播晒之後
    // (自動播放開住)接一條隨機尾巴,唔係就死死哋停、「⏭ 冇嘢跳」變死掣。
    // 2026-07-29 Eric 明確要求推翻:「如果我按清單就唔好加其他野」——而家已經
    // 冇任何 caller 傳呢個 flag(PlaylistDetailSheet.js 刪咗),分支自然唔會行,
    // 自訂清單播晒就停,最尾一首 ⏭ 冇反應係預期行為,唔算 regression
    // (QUEUE-UX-4FIXES-PLAN §1/§7-1)。**刻意保留**呢段分支同判斷邏輯:
    // 唔係第時邊個 caller 想要「播完接隨機尾巴」呢個機關仲喺度,冇 caller
    // 傳就係死碼、唔會意外觸發。
    let finalList = list;
    let autoRadioFrom = opts.autoRadioFrom ?? null;
    if (opts.appendAutoplayTail && autoplayEnabledRef.current) {
      const seed = list[startIndex] || list[0];
      const libr = (hymnsRef.current && hymnsRef.current.length) ? hymnsRef.current : list;
      const tail = buildAutoplayTail(autoplayFlavorRef.current, seed, libr, {
        playLog: getPlayLog(), recentIds: getRecentIds(),
      }).filter((t) => !list.some((s) => String(s.id) === String(t.id))); // 唔好同個清單本身撞歌
      if (tail.length) {
        finalList = [...list, ...tail];
        autoRadioFrom = list.length;
      }
    }
    setAutoRadioFrom(autoRadioFrom);
    // §3.2:同 autoRadioFrom 並排統一 set/clear——正常換 queue(opts 冇傳
    // insertBoundary)就自動歸零,唔使逐個 caller 執,避免漏清變鬼影分隔線。
    setInsertBoundary(opts.insertBoundary ?? null);
    setIsLoading(true);
    // Set the ref synchronously alongside the state (same reason as
    // toggleShuffle): TrackPlayer events fire during the add/play below and
    // PlaybackActiveTrackChanged reads queueRef.current directly to look up the
    // song. A setQueue() alone wouldn't land until the next render, so an early
    // event could read a stale queue and show the wrong title.
    queueRef.current = finalList;
    setQueue(finalList);
    originalQueueRef.current = finalList;
    setIsShuffled(false);
    try {
      // Phase 1 量度 t0 —— 用戶撳一個清單/一首歌開播,由呢刻計到出聲,就係
      // 「第一首要 load 幾耐」嘅真機數(origin=start,同轉歌數分開統計)。
      // W4 —— surface:caller 明確講咗就用佢(例如「隨心聽」);冇講就靠開機
      // 計低嗰三張 id 名單反查(今日為你預備 / 現用 chip 首頁 / 最近加入頭 12)。
      const startSongForMeasure = finalList[startIndex];
      transitionT0Ref.current = {
        ts: Date.now(), origin: 'start', trackChangedSeen: false, bufferingSeen: false, hymnId: null,
        surface: opts.surface || classifyFirstTapSurface(startSongForMeasure?.id),
      };
      // Phase 2.5 —— 就嚟播嗰首如果啱啱好背景落載緊,即刻中止讓路俾串流
      // (已落載完成嘅唔受影響,toTrack 上面已經揀咗 file://)。
      //
      // W2-2(PHASE2.5-PRELOAD-PLAN §4)——「讓路」由「淨係 cancel 撳嗰首」加強到
      // 「冇本地檔就成條背景落載隊列都停低」。原則:**用戶聽得到嘅串流永遠大過
      // 背景落載**。弱網之下背景搶緊 6MB 頻寬會令本來 9.6s 嘅串流更慢,即係做咗
      // Phase 2.5 反而令 miss case 衰咗 —— 呢條係嗰個保險。有本地檔嗰陣就唔使
      // 停(file:// 零網絡),照舊淨係 cancel 佢自己。
      // 恢復點:PlaybackState 見到 Playing(真出咗聲)嗰刻,見上面。
      if (Platform.OS === 'ios') {
        const startSong = startSongForMeasure;
        if (startSong?.id != null) {
          if (getLocalAudioUri(startSong.id) == null) pauseAudioPrefetchForStream();
          // 播緊/就嚟播嗰首本身永遠唔准喺 resume 嗰陣復活(佢已經行緊串流,
          // 再落載多次就係同自己爭頻寬)——cancelAudioPrefetch 會連 pausedIds
          // 一齊清。
          cancelAudioPrefetch(startSong.id);
        }
      }
      await lazyEnsurePlayer();
      await TrackPlayer.reset();
      await TrackPlayer.add(finalList.map((s) => toTrack(s)));
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
      expectPlayingRef.current = true;
      await TrackPlayer.play();
      // §3b:起播後預熱隊列下 3 首 → 自動接續 / 撳「下一首」永遠 warm。
      warmIds(finalList.slice(startIndex + 1, startIndex + 4).map((s) => s.id));
    } catch (e) {
      setIsLoading(false);
      console.warn('playQueue error:', e.message || e);
      Alert.alert('播放錯誤', e.message || '無法播放此清單，請稍後再試');
      return;
    }
    // isLoading is cleared by the PlaybackState listener once it observes
    // Playing, not here — per §3.2, so the indicator reflects real audible state.
  }

  async function cmd_play() {
    expectPlayingRef.current = true; // D2 — 用戶自己撳play
    await TrackPlayer.play();
  }
  async function cmd_pause() {
    expectPlayingRef.current = false; // D2 — 用戶自己撳pause,呢個係最主要嗰個「唔好嗌醒」訊號
    await TrackPlayer.pause();
  }
  function togglePlayPause() {
    isPlaying ? cmd_pause() : cmd_play();
  }

  // §3.5 — tap an item in the currently-playing queue: skip within it,
  // don't reset/rebuild (that's what playQueue() is for, for a new list).
  async function skipToQueueIndex(idx) {
    if (typeof idx !== 'number' || idx < 0) return;
    transitionT0Ref.current = { ts: Date.now(), origin: 'tapQueue', trackChangedSeen: false, bufferingSeen: false, hymnId: null }; // Phase 1 量度 t0
    if (Platform.OS === 'ios') {
      const target = queueRef.current[idx]; // Phase 2.5 —— 撳嗰首落載緊就中止讓路
      if (target?.id != null) cancelAudioPrefetch(target.id);
    }
    try {
      await TrackPlayer.skip(idx);
      expectPlayingRef.current = true;
      await TrackPlayer.play();
    } catch (e) {
      console.warn('skipToQueueIndex error:', e.message || e);
    }
  }

  // 拖曳調整播放次序(佇列 sheet)。newData = DraggableFlatList 洗好牌嘅新次序,
  // from/to = 郁咗邊個到邊個。要點都好:JS queue、TrackPlayer 原生 queue、同「而家
  // 播緊邊 index」三樣一定要一齊更新,唔係就會 skip 跳錯歌(§3.5 教訓)。
  async function reorderQueue(newData, from, to) {
    if (!Array.isArray(newData) || from === to) return;
    // 喺覆寫 queueRef 之前,capture 住而家播緊嗰首(靠佢喺新次序搵返正確 index)
    const playing = queueRef.current[currentQueueIndexRef.current];
    queueRef.current = newData;
    setQueue(newData);
    // 拖曳排序之後,插播分隔線嘅 index 已經冇意義(§3.2,同 shuffle 同一道理)。
    setInsertBoundary(null);
    // 冇 shuffle 時 original order = 顯示緊嘅次序;shuffle 開住就唔郁 original
    // (熄 shuffle 會還原返未拖之前嗰個原始次序,呢個係合理嘅)。
    if (!isShuffledRef.current) originalQueueRef.current = newData;
    try {
      await TrackPlayer.move(from, to);
    } catch (e) {
      console.warn('reorderQueue move error:', e?.message || e);
    }
    // TrackPlayer.move 唔會 fire track-changed,所以手動更新「而家播緊」個 index
    if (playing) {
      const ni = newData.findIndex((s) => String(s.id) === String(playing.id));
      if (ni >= 0) { currentQueueIndexRef.current = ni; setCurrentQueueIndex(ni); }
    }
  }

  // §3.3 — next/previous handed off to TrackPlayer's own queue/repeat state
  // instead of JS recomputing "what's next".
  //
  // iOS 真機 QA(Eric 2026-08-11 補充)—— 撳「下一首」有時要自己再撳多一次
  // 「Play」先真正出聲。查過 SwiftAudioEx 原碼(ios/Pods/SwiftAudioEx/Sources/
  // SwiftAudioEx/QueuedAudioPlayer.swift):`next()` 淨係 `queue.next()`,行到
  // `onCurrentItemChanged()` → `super.load(item:)`,冇傳 `playWhenReady:true`
  // ——即係淨係「preserve 返而家個 playWhenReady flag」,唔係主動叫佢播。正常
  // 情況呢個 flag 應該仲係 true(冇人主動 pause 過),但依家已知 iOS 有個
  // 上游 bug(track 播完 native 冇收到 didPlayToEndTime,見上面 watchdog 段
  // 註解)會令 native 個「播放緊」狀態同真實audio session唔同步咗好耐,期間
  // 隨時俾 audio session interruption(鎖屏/收音頻打斷)靜靜哋將 playWhenReady
  // 撥返 false——到用戶終於手動撳「下一首」嗰刻,呢個 flag 已經唔可靠。明文
  // 再 play() 一次,唔理內部個 flag 係乜,強制真係郁。Android 呢邊 native
  // 事件一路行得好,呢句最多係多餘嘅 no-op,唔會有副作用。
  async function handleNextTrack() {
    // Phase 1 量度 t0 —— 由用戶撳掣嗰刻計起,先反映到真實體感。
    transitionT0Ref.current = { ts: Date.now(), origin: 'tapNext', trackChangedSeen: false, bufferingSeen: false, hymnId: null };
    if (Platform.OS === 'ios') {
      const nxt = queueRef.current[currentQueueIndexRef.current + 1]; // Phase 2.5 —— 就嚟播嗰首落載緊就中止讓路
      if (nxt?.id != null) cancelAudioPrefetch(nxt.id);
    }
    try {
      await TrackPlayer.skipToNext();
      expectPlayingRef.current = true;
      await TrackPlayer.play().catch(() => {});
    } catch (e) {
      // Queue tail with repeat off — matches notification-bar behavior (no-op)
      if (repeatModeRef.current === 1) {
        await TrackPlayer.skip(0);
        expectPlayingRef.current = true;
        await TrackPlayer.play();
      }
    }
  }

  async function handlePrevTrack() {
    try {
      const { position } = await TrackPlayer.getProgress();
      if (position > 3) { await TrackPlayer.seekTo(0); return; } // standard UX: >3s in, prev = restart
    } catch (e) {}
    transitionT0Ref.current = { ts: Date.now(), origin: 'tapPrev', trackChangedSeen: false, bufferingSeen: false, hymnId: null }; // Phase 1 量度 t0
    // H5(FRONTEND-CODE-REVIEW-20260819)—— SwiftAudioEx `previous()` 同 `next()`
    // 係同一套實現(queue.previous()/next() → onCurrentItemChanged() → super.load(item:)),
    // 一樣冇傳 playWhenReady:true,見上面 handleNextTrack() 嗰段完整分析。
    // 呢度照跟 handleNextTrack 兩條路徑都明文再 play() 一次。
    try {
      await TrackPlayer.skipToPrevious();
      expectPlayingRef.current = true;
      await TrackPlayer.play().catch(() => {});
    } catch (e) {
      await TrackPlayer.seekTo(0); // queue head — restart instead
      expectPlayingRef.current = true;
      await TrackPlayer.play().catch(() => {});
    }
  }

  function handleProgressBarPress(evt) {
    // O1-B2 —— duration 唔再係 React state,module-level 讀 store 永遠新鮮,
    // 仲順手消滅咗原本讀 state closure 嘅隱性 staleness。
    const { duration: liveDuration } = progressStore.getSnapshot();
    if (!liveDuration) return;
    const x = evt.nativeEvent.locationX;
    if (typeof x !== 'number') return;
    const target = (x / (SCREEN_WIDTH - 40)) * liveDuration;
    progressStore.setState({ currentTime: target });
    TrackPlayer.seekTo(target).catch(() => {});
  }

  // Sync repeat mode to TrackPlayer
  useEffect(() => {
    async function syncRepeat() {
      try {
        const tpMode = repeatMode === 0 ? TPRepeatMode.Off
          : repeatMode === 1 ? TPRepeatMode.Queue
          : TPRepeatMode.Track;
        await TrackPlayer.setRepeatMode(tpMode);
      } catch (e) {}
    }
    syncRepeat();
  }, [repeatMode]);

  const activeHymn = hymn || currentHymn || { title: '', artist: '', youtube_id: '', id: null };

  return (
    <PlayerCtx.Provider value={{
      currentHymn: activeHymn, hymn, hymns, setHymns,
      isPlaying,
      repeatMode, isShuffled, setIsShuffled,
      currentQueueIndex, setCurrentQueueIndex, queue,
      overlayExpanded, queueReady, isLoading,
      playQueue, playSingle, autoRadioFrom, insertBoundary,
      cmd_play, cmd_pause, togglePlayPause,
      skipToQueueIndex, reorderQueue, handleNextTrack, handlePrevTrack,
      autoplayEnabled, autoplayFlavor, applyAutoplayEnabled, applyAutoplayFlavor,
      setRepeatMode,
      handleProgressBarPress,
      formatTime, currentQueueIndexRef,
      showPlayer, hidePlayer, toggleShuffle,
    }}>
      {children}

      {/* Fullscreen player overlay — always mounted, animated slide-up */}
      <Animated.View
        onLayout={onOverlayLayout}
        pointerEvents={overlayExpanded ? 'auto' : 'none'}
        style={[
          olStyles.overlay,
          { transform: [{ translateY: drawerAnim }] },
          // 完全收埋就唔好畫 —— 呢行先係「黑條」嘅根治位
          !overlayExpanded && { display: 'none' },
        ]}
      >
        {(overlayExpanded) && <FullScreenPlayerOverlay />}
      </Animated.View>

      {/* BUG2(c) P0 — 單首歌載入失敗嘅輕量非阻擋提示。擺喺 PlayerProvider 呢層
          (唔係入面某個 screen),邊個 tab / 全螢幕播放器開唔開住都見得到；
          pointerEvents="none" 唔會擋到底下任何 touch,計時器到就自動消失。 */}
      {noticeText && (
        <View pointerEvents="none" style={[noticeStyles.wrap, { top: (noticeInsets.top || StatusBar.currentHeight || 44) + 12 }]}>
          <View style={noticeStyles.pill}>
            <Text style={noticeStyles.text} numberOfLines={2}>{noticeText}</Text>
          </View>
        </View>
      )}

      {/* NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §4.1 —— 前台 10 秒緩衝提示
          (iOS build>=15 only)。同上面 noticeText 共用視覺語言(noticeStyles)
          但係獨立 state,精準跟住「仲係咪卡緊」show/hide,唔靠 timeout。 */}
      {slowLoadNotice && (
        <View pointerEvents="none" style={[noticeStyles.wrap, { top: (noticeInsets.top || StatusBar.currentHeight || 44) + 12 }]}>
          <View style={noticeStyles.pill}>
            <Text style={noticeStyles.text} numberOfLines={2}>載入緩慢，重試緊…</Text>
          </View>
        </View>
      )}
    </PlayerCtx.Provider>
  );
}
const noticeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16,
    alignItems: 'center', zIndex: 1000,
  },
  pill: {
    backgroundColor: CARD_BG_COLOR, borderRadius: 20, borderWidth: 1, borderColor: DesignColors.border,
    paddingHorizontal: 16, paddingVertical: 10, maxWidth: '92%', elevation: 8,
  },
  text: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
export function usePlayer() {
  return useContext(PlayerCtx) || {};
}

const olStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: MAIN_BG_COLOR, zIndex: 999,
    // 🔴 v237:collapsed queue bar 頂部圓角位露咗後面 mini player 個封面(藍色)出嚟。
    // 根因係 Android 淨靠 zIndex 唔一定壓得住有自己 elevation 嘅 sibling(TabBar/mini
    // player)。畫面層面 overlay 係不透明全屏,但冇 elevation 就可能俾後面嘢喺邊位透出。
    // 補返 elevation 令佢喺 Android 都實實在在蓋晒後面所有嘢。
    elevation: 32,
    overflow: 'hidden'
  },
});

// ================================================================
//  MINI PLAYER — YT Music 扁條風格
// ================================================================
function MiniPlayer({ onPress }) {
  useRenderCount('Mini'); // PERF-BASELINE-1B-20260902
  const player = usePlayer();
  const { currentHymn, isPlaying, togglePlayPause } = player;
  const { isFavorite, toggleFavorite } = useFavorites();
  if (!currentHymn?.id) return null;
  const fav = isFavorite(currentHymn.id);

  return (
    <View style={miStyles.wrapper}>
      <View style={miStyles.container}>
        <TouchableOpacity style={miStyles.mainTouch} onPress={onPress} activeOpacity={0.85}>
          <CoverImage youtubeId={currentHymn.youtube_id} style={miStyles.cover} />
          <View style={miStyles.info}>
            <Text style={miStyles.title} numberOfLines={1}>{getDisplayTitle(currentHymn)}</Text>
            <Text style={miStyles.artist} numberOfLines={1}>{currentHymn.artist}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.favBtn} onPress={(e) => { e.stopPropagation(); toggleFavorite(currentHymn); }} activeOpacity={0.7}>
          <OdeIcon name="heart" filled={fav} size={24} color={fav ? PRIMARY_COLOR : TEXT_PRIMARY} />
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.playBtn} onPress={(e) => { e.stopPropagation(); togglePlayPause(); }} activeOpacity={0.8}>
          <OdeIcon name={isPlaying ? 'pause' : 'play'} size={20} color={TEXT_ON_GLOW} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const miStyles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: CARD_BG_COLOR,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: DesignColors.cardLight, ...effects.coverInset },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  artist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 1 },
  mainTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  favBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: GLOW_COLOR, justifyContent: 'center', alignItems: 'center' },
});

// ================================================================
//  TAB BAR
// ================================================================
// §2.2 六格減到四格,2026-07 SEARCH-MERGE-PLAN 再減到三格。
// 舊版係 首頁/搜尋/分類/清單/最愛/播放 —— 六個掣太密、易撳錯,
// 而且六樣嘢擺埋一齊冇主次。合併邏輯:
//   清單 + 最愛 + 帳戶 + 設定 -> 「我的」
//   搜尋 + 分類 -> 「搜尋」-> 2026-07 再併入「詩歌庫」(搜尋欄喺詩歌庫頁頂,
//     本地即時 filter,見 SEARCH-MERGE-PLAN.md;獨立搜尋 tab 已刪)
//   「播放」唔再佔一格 —— 撳迷你播放條就向上展開,係全世界音樂 App 嘅標準做法
// §5.4:圖標一律用向量圖標庫,唔用 Emoji(舊版 tab 用緊 🏠🔍📚📋❤️)
// ODE-HANDOFF §5:Tab icon 有 stroke/fill 兩版,選中用 fill,唔使再靠換 icon 名。
const TAB_CONFIG = [
  { key: 'Home',    label: '首頁',   icon: 'home' },
  { key: 'Library', label: '詩歌庫', icon: 'library' },
  { key: 'Mine',    label: '我的',   icon: 'me' },
];
function TabBar({ activeTab, onTabChange, bottomInset, onMiniPlayerPress }) {
  useRenderCount('TabBar'); // PERF-BASELINE-1B-20260902
  const safePad = Math.max(bottomInset || 0, 4);
  return (
    <View style={[tbStyles.wrapper, { paddingBottom: safePad + 8 }]}>
      {/* 迷你播放條貫穿全 App,撳佢就展開播放頁(取代咗舊嘅「播放」tab) */}
      <MiniPlayer onPress={onMiniPlayerPress} />
      <View style={tbStyles.bar}>
        {TAB_CONFIG.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} style={tbStyles.item} onPress={() => onTabChange(tab.key)} activeOpacity={0.7}>
              <OdeIcon
                name={tab.icon}
                size={24}
                filled={active}
                color={active ? GLOW_COLOR : TEXT_SECONDARY}
              />
              <Text style={[tbStyles.label, active && tbStyles.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const tbStyles = StyleSheet.create({
  wrapper: { backgroundColor: MAIN_BG_COLOR },
  bar: {
    flexDirection: 'row', backgroundColor: MAIN_BG_COLOR,
    paddingTop: 6, paddingBottom: 4,
    borderTopWidth: 0.5, borderTopColor: DesignColors.border,
  },
  item: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  // §5.3 重要功能嘅 icon 要配文字標籤
  label: { fontSize: 11, color: TEXT_SECONDARY, marginTop: 3, fontWeight: '500' },
  labelActive: { color: GLOW_COLOR, fontWeight: '700' },
});

// ===== 各 tab 畫面 =====
import HomeSections from './src/components/home/HomeScreen';
import HymnListScreen from './src/screens/HymnListScreen';
import LibraryScreen from './src/screens/LibraryScreen'; // §2.2 詩歌庫(2026-07 併入搜尋欄,SEARCH-MERGE-PLAN)
import MineScreen from './src/screens/MineScreen';        // §2.2 我的(新,合併 最愛+清單+帳戶)
import AvatarButton from './src/components/AvatarButton'; // PHONE-PASSWORD-AUTH-PLAN §5.4:三頁右上角共用會員掣
// 舊 tab 畫面(Category / Playlist / Favorites / Search)已由上面新畫面取代,
// 對應嘅舊檔案已喺 FRONTEND-CODE-REVIEW-20260819 D1 剷晒。

// ================================================================
//  HOME SCREEN
// ================================================================
function HomeScreen({ hymns, loading, activeCategory, onCategoryChange, onPlayHymn, onOpenAuth, onOpenList }) {
  const homeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: DesignColors.background }}>
      {/* Header — Ode 品牌 + 通知 + 頭像 */}
      <View style={[hs.header, { paddingTop: (homeInsets.top || StatusBar.currentHeight || 24) + 8 }]}>
        <View style={hs.brandWrap}>
          <LogoRing size={52} style={hs.brandIconImg} />
          <View>
            <Text style={hs.brandTitle}>odely</Text>
          </View>
        </View>
        {/* B13 —— 舊嘅通知鐘掣冇 onPress(App 未有通知功能),撳落去零反應。
            一個死掣好過冇掣,而家直接拆走,將來真係有通知功能先加返。 */}
        <View style={hs.iconWrap}>
          {/* PHONE-PASSWORD-AUTH-PLAN §5.4:抽做共用 AvatarButton,三頁(首頁/
              詩歌庫/我的)右上角一致,唔再喺呢度 inline 寫顯示邏輯。 */}
          <AvatarButton onPress={onOpenAuth} />
        </View>
      </View>
      <HomeSections hymns={hymns} loading={loading} onPlayHymn={onPlayHymn} onOpenList={onOpenList} />
    </View>
  );
}
// ===== HomeScreen Header Styles =====
const hs = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: DesignColors.card,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // ODE-HANDOFF §1/§3:header logo 環 52dp,「ode」32px Sora 200 letterSpacing 1.5,全小寫
  // CHANGE-REQUEST §2:環要由原圖放大1.6倍裁切填滿容器(LogoRing component),呢度淨係要 gap
  brandIconImg: {
    marginRight: 13,
  },
  brandTitle: {
    fontFamily: 'Sora-ExtraLight',
    fontSize: 30,
    fontWeight: '200',
    letterSpacing: 1.2,
    color: TEXT_PRIMARY,
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // avatarBtn/avatarText 搬咗去 src/components/AvatarButton.js(§5.4,三頁
  // 共用),呢度唔再需要。
});

// ================================================================
//  FULL SCREEN PLAYER OVERLAY — TrackPlayer 版（無 YouTube Iframe）
// ================================================================
// snapPoints 要係穩定 reference,唔可以每次 render 新開 array(會令 gorhom 重算成套
// layout,拖到一半彈返)。所以擺喺 module 層。
//
// queue sheet 有兩個 detent:collapsed(常駐,得 handle + 標題)同 88%(全開)。
// collapsed 用**固定 px** 唔用 %,因為呢個高度要同 content 嘅 paddingBottom
// 啱啱好對得上(唔係就會遮住播放掣或者留條罅),固定數值先算得準。
const QUEUE_COLLAPSED_H = 78;
const QUEUE_SNAP_POINTS = [QUEUE_COLLAPSED_H, '88%'];

// O1-O2-REPLAN-20260819.md §3.2 Commit B1 —— 由 FullScreenPlayerOverlay 抽出
// 嚟嘅細 component,自己訂閱 progressStore(唔經 PlayerCtx),播放中每秒得
// 呢一個 component re-render;overlay 收埋時(冇 mount)零訂閱者,連一個
// re-render 都冇。
function ProgressSection() {
  const { currentTime, duration } = usePlayerProgress();
  const player = usePlayer();
  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  return (
    <View style={fsStyles.progressSection}>
      <TouchableOpacity style={fsStyles.progressBarTouchArea} onPress={(e) => { player.handleProgressBarPress(e); }}>
        <View style={fsStyles.progressBarBg}>
          <View style={[fsStyles.progressBarFill, { width: `${progressPercent}%` }]}>
            <View style={fsStyles.progressBarThumb} />
          </View>
        </View>
      </TouchableOpacity>
      <View style={fsStyles.timeRow}>
        <Text style={fsStyles.timeText}>{player.formatTime(currentTime)}</Text>
        <Text style={fsStyles.timeText}>{player.formatTime(duration)}</Text>
      </View>
    </View>
  );
}

// C(Eric 2026-08-25)—— 循環模式嘅文字名。三個模式淨係靠 icon 顏色、一粒 4dp
// 圓點同一個「1」分辨,Eric 實測「睇唔出而家係邊個模式」;呢行字係唯一一個
// 唔使靠眼力嘅回饋。index 對應 repeatMode 0/1/2(見 PlayerCtx 個 useState 註解)。
const REPEAT_MODE_LABELS = ['唔循環', '循環播放全部', '單曲循環'];

function FullScreenPlayerOverlay() {
  useRenderCount('FullPlayer'); // PERF-BASELINE-1B-20260902
  // 用統一嘅 useInsets:佢會幫 Android 落個底線,唔會計出 0 令 collapsed sheet
  // 貼死喺螢幕底俾導航列蓋住(見 useInsets.js)。
  const insets = useInsets();
  const player = usePlayer();

  const queue = player.queue || [];
  // 兩個 sheet 都係 inline `<BottomSheet>`(見檔頭 import 處嘅 v229 註解)。
  //
  // v231 之後兩個 sheet 嘅角色**唔同**咗,呢點好重要:
  //  - queue sheet:**常駐**,snapPoints = [collapsed, 88%],index 0 = collapsed。
  //    永遠有條 handle 喺螢幕底,所以永遠滑得上去。向下滑 = 返 collapsed,唔會消失。
  //  - add sheet:**撳掣先 mount**,收埋就 unmount,零殘留、唔會擋住 queue sheet。
  const queueSheetRef = useRef(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const openQueue = useCallback(() => queueSheetRef.current?.snapToIndex(1), []);
  const closeQueue = useCallback(() => queueSheetRef.current?.snapToIndex(0), []);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  // 「加入到清單」picker 而家係 App 層級嘅 native Modal(見 AddToPlaylistSheet.js),
  // 由 pill 撳 openAddToPlaylist(cur) 彈出,唔再係呢度嘅 gorhom sheet。
  const { open: openAddToPlaylist } = useAddToPlaylist();

  // queue sheet 全開(index 1)嗰陣,Android 返回鍵應該係「收返 collapsed」而唔係
  // 收埋成個播放器。(add picker 係獨立 Modal,佢自己 onRequestClose 處理返回鍵。)
  const queueOpenRef = useRef(false);
  const [anySheetOpen, setAnySheetOpen] = useState(false);
  // 2026-07-30 Eric 實測:大分類(例如兒童 476 首)撳歌之後開「播放清單」,
  // 個 list 由頭(index 0)開始 render,而家播緊嗰首坐喺隊列中間某個 index,
  // 用戶淨係見到一堆完全睇唔出邊首正播緊嘅歌,以為個queue俾成個分類換晒
  // (其實 queueItemActive 高亮同 §3.4 嘅 browseTap 插播邏輯本身冇壞,單純
  // 冇 scroll 過去)。呢度補返「開全屏 sheet 就自動 scroll 去而家播緊嗰行」。
  const queueListRef = useRef(null);
  // ⚠️ 2026-07-30 實測教訓:第一版冇 getItemLayout,scrollToIndex 喺 476 首
  // 嘅大 queue 度量唔到目標 row,觸發 onScrollToIndexFailed → scrollToOffset
  // → 再 scrollToIndex → 又失敗 → 又觸發……冇上限咁循環,直接 ANR 咗個 app。
  // 依家用固定估計行高做 getItemLayout,scrollToIndex 唔使量、一步到位,
  // 根本唔會撞落 failure 嗰條路。行高唔係定值(標題有一/兩行),呢個淨係
  // 估計,scroll 落點容許有少少誤差,但保證唔會再撞 ANR。
  const QUEUE_ROW_EST_H = 70;
  const getQueueItemLayout = useCallback((data, index) => (
    { length: QUEUE_ROW_EST_H, offset: QUEUE_ROW_EST_H * index, index }
  ), []);
  const scrollQueueToCurrent = useCallback(() => {
    const idx = player.currentQueueIndexRef?.current || 0;
    if (idx <= 0) return;
    requestAnimationFrame(() => {
      try {
        queueListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.3 });
      } catch (e) { /* getItemLayout 已經俾夠資訊,理論上唔會再失敗 */ }
    });
  }, [player.currentQueueIndexRef]);
  // 淨係做一次性 fallback(唔會再連鎖觸發 scrollToIndex),避免重蹈 ANR 覆轍。
  const onQueueScrollToIndexFailed = useCallback((info) => {
    queueListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
  }, []);
  const onQueueChange = useCallback((i) => {
    queueOpenRef.current = i >= 1;
    setQueueExpanded(i >= 1);
    setAnySheetOpen(i >= 1);
  }, []);
  // DraggableFlatList 淨係喺 queueExpanded 先 mount(下面 §Eric #3/#6),喺
  // onQueueChange 嗰刻即刻 scroll 會執行喺 mount 之前。用 effect 等佢真係
  // mount 咗先 scroll,唔使賭 requestAnimationFrame 嘅時序。
  useEffect(() => {
    if (queueExpanded) scrollQueueToCurrent();
  }, [queueExpanded, scrollQueueToCurrent]);

  useEffect(() => {
    if (!anySheetOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (queueOpenRef.current) closeQueue();
      return true; // 食咗個返回鍵,唔好傳落去收埋播放器
    });
    return () => sub.remove();
  }, [anySheetOpen, closeQueue]);

  // queue sheet 嘅 backdrop:collapsed(index 0)嗰陣**唔可以**有遮罩,
  // 唔係就會擋死下面成個播放器啲掣。全開(index 1)先出,撳一下收返 collapsed。
  const renderQueueBackdrop = useCallback((props) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={1} disappearsOnIndex={0} pressBehavior="collapse" />
  ), []);

  // §Eric(v242 regression):content panning 要 keep 住 false(唔係長按拖歌會同
  // sheet 下拉手勢搶 touch),但咁樣「滑」就淨係得條幼 handle indicator 食到,好易
  // 撳唔中 → 要滑幾次先開/收。解法:成條標題 bar 升做**自訂 handleComponent** ——
  // gorhom 個 pan 手勢係綁喺 handle 容器度,所以喺呢條 bar 上面**任何位**向上/向下
  // 滑都 pan 到個 sheet,撳一下就照 toggle。拖歌手勢完全冇掂到。
  const renderQueueHandle = useCallback(() => (
    <View>
      <View style={fsStyles.queueHandleBar} />
      <SheetTouchable
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 10 }}
        onPress={() => (queueOpenRef.current ? closeQueue() : openQueue())}
      >
        <OdeIcon
          name={queueExpanded ? 'chevronDown' : 'chevronUp'}
          size={18} color={TEXT_SECONDARY} style={{ marginRight: 6 }}
        />
        <Text style={{ ...TYPOGRAPHY.sectionTitle }}>播放清單 ({queue.length})</Text>
      </SheetTouchable>
    </View>
  ), [queueExpanded, queue.length, closeQueue, openQueue]);

  // dataVersion cache-bust 第 3 步(SUPERVISION-LOG 2026-07-27 16:50/18:00 條目)——
  // player.currentHymn 係播放嗰刻由 queue 度攞落嚟嘅 snapshot(playQueue/
  // PlaybackActiveTrackChanged 寫入,見 §3.5),之後 useCachedHymns 背景全量
  // refresh 更新嘅係 player.hymns,唔會走返轉頭改呢個 snapshot —— 呢個就係
  // 「認識你是祢」App 顯示舊歌詞事故嘅根源:首頁開住個播放器唔郁,refresh
  // 完都仲係揸住開嗰刻嗰份舊 lyrics。修法:render 時按 id 喺 live 嘅
  // player.hymns 度搵返最新版,搵到就用嗰份(歌詞/內容一定新);搵唔到
  // (例如全庫都未載完)先 fallback 用返 snapshot。
  const snapshotHymn = player.currentHymn || { title: '', artist: '', youtube_id: '', id: null, lyrics: '' };
  const liveHymn = snapshotHymn.id != null
    ? (player.hymns || []).find(h => String(h.id) === String(snapshotHymn.id))
    : null;
  const cur = liveHymn || snapshotHymn;
  // BUG1 P0 — 統一喺呢度轉一次,下面 hasLyrics 判斷同歌詞 Modal 顯示都食呢個
  // 已經拆好行嘅版本,唔再各自 trim() 原始「|」字串。
  const lyricsText = formatLyrics(cur.lyrics);

  // BATCH5 §7.3-E:冷 start 分階段 loading 文案——純 client UI,唔掂 provider
  // 層(O1 啱啱先拆走每秒 re-render,PlayerCtx 唔准加每秒變嘅嘢),淨係喺
  // overlay 呢個 local component 度用 local state 計時。player.isLoading
  // 入 loading 家族超過 8 秒就轉「網絡較慢」文案;離開 loading 或者轉咗歌
  // (cur.id 變)就清 timer 歸零。唔掂 watchdog、retry、expectPlayingRef、
  // 任何 TrackPlayer call。
  const [slowHint, setSlowHint] = useState(false);
  const slowHintTimerRef = useRef(null);
  useEffect(() => {
    setSlowHint(false); // BATCH6 C4:effect 每次 re-run(isLoading 變 或 cur.id 變)都由頭計過——轉歌嗰陣仲 loading 緊,舊 code 唔會行 else 分支,上一首個「網絡較慢」會漏落新歌度
    if (player.isLoading) {
      slowHintTimerRef.current = setTimeout(() => setSlowHint(true), 8000);
    }
    return () => {
      if (slowHintTimerRef.current) { clearTimeout(slowHintTimerRef.current); slowHintTimerRef.current = null; }
    };
  }, [player.isLoading, cur.id]);

  // C(Eric 2026-08-25)—— 撳循環掣即刻淡入一行文字,1.5 秒後淡出。
  // ⚠️ 個容器高度**寫死**(唔用條件 render),字淡走咗之後照樣佔位,唔會令
  // 下面成排控制掣同 sheet 跳上跳落。
  // ⚠️ 用 useNativeDriver —— opacity 行得,而且 JS thread 忙緊(轉歌/解析)
  // 嗰陣個淡入淡出唔會窒。
  const [repeatHint, setRepeatHint] = useState('');
  const repeatHintOpacity = useRef(new Animated.Value(0)).current;
  const repeatHintTimerRef = useRef(null);
  useEffect(() => () => {
    if (repeatHintTimerRef.current) { clearTimeout(repeatHintTimerRef.current); repeatHintTimerRef.current = null; }
  }, []);
  const cycleRepeatMode = useCallback(() => {
    const next = ((player.repeatMode ?? 0) + 1) % 3;
    player.setRepeatMode?.(next);
    setRepeatHint(REPEAT_MODE_LABELS[next]);
    // 連撳幾下:清走上一次個「1.5 秒後淡出」timer,亦要 stopAnimation() 截停
    // 仲行緊嗰段淡出,否則新一次淡入會俾舊嗰段 timing 蓋返落去變半透明。
    if (repeatHintTimerRef.current) clearTimeout(repeatHintTimerRef.current);
    repeatHintOpacity.stopAnimation();
    Animated.timing(repeatHintOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    repeatHintTimerRef.current = setTimeout(() => {
      repeatHintTimerRef.current = null;
      Animated.timing(repeatHintOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    }, 1500);
  }, [player.repeatMode, player.setRepeatMode, repeatHintOpacity]);

  const lyricsStanzas = formatLyricsStanzas(cur.lyrics);
  // BUG3(c) P0(Eric 實測)—— 自動播放關咗 + 播緊 queue 最後一首,⏭ 之前係
  // 冇 disabled 狀態嘅死掣(撳落去 TrackPlayer.skipToNext() 靜靜哋失敗,冇反應)。
  // repeatMode===1(repeat-all)會 wrap 返轉頭,所以呢種情況仲係「有嘢跳」。
  const hasNext = player.repeatMode === 1 || (player.currentQueueIndex ?? 0) < queue.length - 1;
  const bottomPad = (insets?.bottom || 20) + 8;
  const safeTop = (insets?.top || StatusBar.currentHeight || 24) + 8;

  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  return (
    // ⚠️ 外層**唔可以有 padding**(v231)。gorhom 個 hosting container 係
    // `StyleSheet.absoluteFill`,而 absolute 定位嘅 child 係相對 parent 嘅
    // **padding box**(CSS/Yoga 都係咁)。之前喺呢度落咗 `paddingBottom`,
    // 令 sheet 個 container 比螢幕矮咗 bottomPad,收埋咗嘅 sheet 就企喺
    // 「螢幕底 - bottomPad」度 → 每個 sheet 都露返條 bottomPad 高嘅邊出嚟。
    // 兩個 sheet 就露兩條 = Eric 見到「2 個 sheet 疊埋」。詳見「三之八」。
    // padding 改為落喺下面個 content wrapper,sheet 留喺無 padding 嘅外層。
    <View style={fsStyles.container}>
      <View style={{ flex: 1, paddingBottom: bottomPad + QUEUE_COLLAPSED_H }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Top Bar */}
      <View style={[fsStyles.topBar, { paddingTop: safeTop }]}>
        <TouchableOpacity style={fsStyles.dismissBtn} onPress={player.hidePlayer}>
          <OdeIcon name="chevronDown" size={24} color={TEXT_PRIMARY} />
        </TouchableOpacity>
        <View style={fsStyles.topBarBrand}>
          <LogoRing size={22} style={fsStyles.topBarBrandImg} />
          <Text style={fsStyles.topBarTitle}>odely</Text>
        </View>
        <View style={fsStyles.dismissBtn} />
      </View>

      {/* Album Art */}
      <View style={fsStyles.coverWrap}>
        <BigCover youtubeId={cur.youtube_id} />
        {player.isPlaying && (
          <View style={fsStyles.equalizerContainer}>
            <View style={[fsStyles.equalizerBar, fsStyles.equalizerBar1]} />
            <View style={[fsStyles.equalizerBar, fsStyles.equalizerBar2]} />
            <View style={[fsStyles.equalizerBar, fsStyles.equalizerBar3]} />
            <View style={[fsStyles.equalizerBar, fsStyles.equalizerBar4]} />
          </View>
        )}
        {/* B5 修:loadingOverlay 之前 absolute top0/bottom0 貼住成個 fsStyles.container
            (即係成個播放頁,由封面貼到控制列),所以個「正在載入音訊...」文字
            實際上係喺成頁正中間,同下面 songInfo 個歌名(2 行就會撞落嚟)冇任何
            關係——歌名行數點變都好,個 loading 文字位置係定死喺頁中間,梗會撞。
            而家搬入嚟 coverWrap 度做佢個 sibling:coverWrap 有 overflow:hidden,
            absolute top0/bottom0 就淨係填滿封面格,structurally 冧唔到歌名
            (歌名喺 coverWrap 之後,完全喺 loadingOverlay 嘅範圍以外),1/2/3 行
            標題都唔會再撞。 */}
        {player.isLoading && (
          <View style={fsStyles.loadingOverlay}>
            <ActivityIndicator size="large" color={GLOW_COLOR} />
            <Text style={fsStyles.loadingText}>{slowHint ? '網絡較慢,仲努力緊…' : '正在載入音訊...'}</Text>
          </View>
        )}
      </View>

      {/* Controls + Playlist button */}
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 8 }}>
        <View style={fsStyles.songInfo}>
          <Text style={[{ ...TYPOGRAPHY.title, color: TEXT_PRIMARY, textAlign: 'center' }]} numberOfLines={2}>{getDisplayTitle(cur)}</Text>
          <Text style={[{ ...TYPOGRAPHY.artist, textAlign: 'center', marginTop: 4 }]}>{cur.artist}</Text>
        </View>

        {/* Action Bar — 4 粒獨立 pill(§3.4 / Eric 2026-07 指定順序):
            最愛 / 歌詞 / 分享 / 清單。膠囊形、向量圖標(§5.4 唔用 Emoji)。
            歌詞冇 data 就 disabled 灰咗,唔俾個掣呃人(§3.4)。 */}
        {(() => {
          const faved = isFavorite(cur.id);
          const hasLyrics = !!lyricsText;
          const pills = [
            { key: 'fav', label: '最愛', icon: 'heart',
              active: faved, onPress: () => toggleFavorite(cur) },
            { key: 'lyr', label: '歌詞', icon: 'lyrics', disabled: !hasLyrics,
              onPress: () => setLyricsVisible(true) },
            { key: 'shr', label: '分享', icon: 'share',
              onPress: () => Share.share({
                message: `一齊聽「${getDisplayTitle(cur)}」${cur.artist ? ' - ' + cur.artist : ''}（Odely 詩歌）`,
              }).catch(() => {}) },
            { key: 'que', label: '清單', icon: 'queue',
              onPress: () => openAddToPlaylist(cur) },
          ];
          return (
            <View style={fsStyles.actionRow}>
              {pills.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[fsStyles.pill, p.disabled && fsStyles.pillDisabled]}
                  onPress={p.onPress}
                  disabled={p.disabled}
                  activeOpacity={0.7}
                >
                  <OdeIcon
                    name={p.icon}
                    size={20}
                    filled={!!p.active}
                    color={p.disabled ? DesignColors.border : (p.active ? PRIMARY_COLOR : TEXT_PRIMARY)}
                  />
                  <Text style={[fsStyles.pillLabel, p.active && { color: PRIMARY_COLOR }, p.disabled && { color: TEXT_SECONDARY }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}
        <ProgressSection />
        <View style={fsStyles.repeatHintRow} pointerEvents="none">
          <Animated.Text style={[fsStyles.repeatHintText, { opacity: repeatHintOpacity }]}>
            {repeatHint}
          </Animated.Text>
        </View>
        <View style={fsStyles.controlsRow}>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={player.toggleShuffle} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              <OdeIcon name="shuffle" size={32} color={player.isShuffled ? GLOW_COLOR : TEXT_SECONDARY} />
              {player.isShuffled && <View style={fsStyles.ctrlActiveDot} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={player.handlePrevTrack} activeOpacity={0.6}>
            <OdeIcon name="prev" size={32} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.playBtn} onPress={player.togglePlayPause} activeOpacity={0.8}>
            <OdeIcon name={player.isPlaying ? 'pause' : 'play'} size={24} color={TEXT_ON_GLOW} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[fsStyles.controlBtn, !hasNext && fsStyles.controlBtnDisabled]}
            onPress={player.handleNextTrack}
            activeOpacity={0.6}
            disabled={!hasNext}
          >
            <OdeIcon name="next" size={32} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={cycleRepeatMode} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              {/* odeIcons.js repeat note:單曲循環(repeatMode===2)= 同一個 repeat
                  icon 中間疊一個「1」,唔另畫新 icon。字款/置中見下面
                  fsStyles.repeatOneBadge(B,Eric 2026-08-25 由 Sora 200 改粗)。 */}
              <View>
                <OdeIcon
                  name="repeat"
                  size={32}
                  // A(Eric 2026-08-25)—— 熄燈色由寫死嘅 rgba(255,255,255,0.6)
                  // (疊落 #0B0913 實際渲染 ≈ #9D9BA1,光到似著住一半)改用
                  // TEXT_SECONDARY,同隔籬粒 shuffle 掣同一套「熄燈」語言,
                  // 順便合返 designSystem.js 開頭「唔准寫死 hex」嗰條規矩。
                  color={player.repeatMode > 0 ? GLOW_COLOR : TEXT_SECONDARY}
                />
                {player.repeatMode === 2 && (
                  <Text style={fsStyles.repeatOneBadge}>1</Text>
                )}
              </View>
              {player.repeatMode > 0 && <View style={fsStyles.ctrlActiveDot} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* 舊嗰個「播放清單 (N)」掣喺 v231 移走咗 —— 佢同下面 sheet 個收埋狀態
            並排出現,就係 Eric 見到嘅「兩條 bar」。而家個 collapsed sheet
            本身就係嗰個掣(有 drag handle,撳到又滑到)。 */}
      </View>
      </View>

      {/* ===== 播放清單 BOTTOM SHEET(v231:常駐 collapsed,可滑上滑落)=====
          擺喺 overlay container 最後一個 child → 畫喺 overlay 之上,冇 portal z-order 問題。
          兩個 snap point:collapsed(得條 handle + 標題,常駐)同 88%(全開)。
          **唔用 `enablePanDownToClose`** —— 呢個 sheet 唔會消失,向下滑 = 收返做
          collapsed。咁就一定有嘢俾用戶向上滑,唔會出現「冇手柄就滑唔返上去」。 */}
      <BottomSheet
        ref={queueSheetRef}
        index={0}
        snapPoints={QUEUE_SNAP_POINTS}
        enableDynamicSizing={false}
        // 佇列改用 DraggableFlatList 拖曳排序(§v237)。一定要關 sheet 嘅 content
        // panning,唔係長按拖歌同 sheet 自己嘅下拉手勢會搶 touch。收埋 sheet 靠條
        // handle grabber(handle panning 仍然開住)同埋撳標題(openQueue/closeQueue)。
        enableContentPanningGesture={false}
        // ⚠️ collapsed bar 之前俾手機導航列蓋住半截(v232 修)。外層 container 係
        // 全螢幕(edge-to-edge),所以 sheet 個底 = 螢幕底 = 導航列下面。gorhom 有
        // `bottomInset` 專門做呢件事,成個 sheet 抬高返 inset 咁多,唔使喺外層落
        // padding(落 padding 會整亂 gorhom 個 absoluteFill container,見 v231 註解)。
        bottomInset={insets.bottom}
        onChange={onQueueChange}
        backdropComponent={renderQueueBackdrop}
        // §Eric(v242):成條標題 bar 升做 handle,喺 bar 上面任何位都滑得郁個 sheet。
        handleComponent={renderQueueHandle}
        // 明確嘅圓角 + 不透明底色,collapsed 個頂邊界乾淨,唔會靠 gorhom default
        backgroundStyle={{ backgroundColor: MAIN_BG_COLOR, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        {/* 🩹 §Eric #3/#6:collapsed 只顯示個 header(乾淨,冇歌封面突出圓角邊)。
            自動播放控制 + 佇列 list 只喺 sheet 全開先 render。 */}
        {queueExpanded && (
        <DraggableFlatList
          ref={queueListRef}
          data={queue}
          keyExtractor={(item) => String(item.id)}
          getItemLayout={getQueueItemLayout}
          contentContainerStyle={{ paddingBottom: 40 }}
          activationDistance={12}
          onScrollToIndexFailed={onQueueScrollToIndexFailed}
          onDragEnd={({ data, from, to }) => player.reorderQueue(data, from, to)}
          // §Eric #1:自動播放控制放喺 ListHeaderComponent(唔係做 sibling)——
          // DraggableFlatList 拖曳嗰陣會 translate 佢個 content,sibling 會俾佢一齊拖郁;
          // ListHeaderComponent 係固定 header,拖歌唔會郁到佢。
          ListHeaderComponent={
            <View>
              <View style={fsStyles.autoplayRow}>
                <View style={{ flex: 1 }}>
                  <Text style={fsStyles.autoplayTitle}>自動播放</Text>
                  <Text style={fsStyles.autoplaySub}>加入類似內容,無間斷播放</Text>
                </View>
                <SheetTouchable
                  onPress={() => player.applyAutoplayEnabled?.(!player.autoplayEnabled)}
                  style={[fsStyles.toggleTrack, player.autoplayEnabled && fsStyles.toggleTrackOn]}
                  activeOpacity={0.8}
                >
                  <View style={[fsStyles.toggleThumb, player.autoplayEnabled && fsStyles.toggleThumbOn]} />
                </SheetTouchable>
              </View>
              {player.autoplayEnabled && (
                <View>
                  <View style={fsStyles.chipBar}>
                    {/* §Eric(v244):chip 由 FLAVORS 設定檔驅動,五粒常設顯示,
                        加新分類改 src/utils/autoplay.js 一行就得,唔使掂呢度。 */}
                    {FLAVORS.map((f) => {
                      const on = (player.autoplayFlavor || '全部') === f.key;
                      return (
                        <SheetTouchable key={f.key} onPress={() => player.applyAutoplayFlavor?.(f.key)} activeOpacity={0.8}
                          style={[fsStyles.apChip, on && fsStyles.apChipOn]}>
                          <Text style={[fsStyles.apChipText, on && fsStyles.apChipTextOn]}>{f.label}</Text>
                        </SheetTouchable>
                      );
                    })}
                  </View>
                  {/* 揀咗嘅類別未有貨(tag 類 poolSize=0)→ 友善提示:話明入緊庫,
                      同時 buildAutoplayTail 已 fallback 全庫隨機,唔會斷播。 */}
                  {(() => {
                    const sel = FLAVORS.find((f) => f.key === (player.autoplayFlavor || '全部'));
                    if (!sel?.tag || poolSize(sel.key, player.hymns || []) > 0) return null;
                    return (
                      <Text style={fsStyles.apChipHint}>
                        「{sel.label}」詩歌入緊庫,暫時先為你隨機接續全庫詩歌
                      </Text>
                    );
                  })()}
                </View>
              )}
              {player.isShuffled && (
                <View style={[fsStyles.shuffleBanner, { marginBottom: 8, alignSelf: 'center' }]}>
                  <OdeIcon name="shuffle" size={14} color={GLOW_COLOR} />
                  <Text style={fsStyles.shuffleBannerText}>已隨機排序</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item, drag, isActive, getIndex }) => {
            const index = getIndex();
            return (
              <ScaleDecorator activeScale={1.03}>
                {index === player.autoRadioFrom && (
                  <View style={fsStyles.radioDivider}>
                    <View style={fsStyles.radioDividerLine} />
                    <OdeIcon name="shuffle" size={14} color={GLOW_COLOR} style={{ marginHorizontal: 8 }} />
                    <Text style={fsStyles.radioDividerText}>自動播放：{player.autoplayFlavor || '全部'}</Text>
                    <View style={fsStyles.radioDividerLine} />
                  </View>
                )}
                {/* 2026-07-29 QUEUE-UX-4FIXES §3/§7-4:插播歌分隔線——插播歌
                    永遠企喺 index 0(§3.3),分隔線畫喺 index 1 之前,即插播歌
                    同「原本清單餘下」交界。文案「即將播放」係 Eric 拍板
                    (§7-4,推翻咗規劃文件暫定嘅「接返原本清單」)。樣式直接
                    重用 radioDivider 三件套,淨係換 icon/文字/顏色作區分。 */}
                {index === player.insertBoundary && (
                  <View style={fsStyles.radioDivider}>
                    <View style={fsStyles.radioDividerLine} />
                    <OdeIcon name="queue" size={14} color={PRIMARY_COLOR} style={{ marginHorizontal: 8 }} />
                    <Text style={fsStyles.radioDividerText}>即將播放</Text>
                    <View style={fsStyles.radioDividerLine} />
                  </View>
                )}
                <SheetTouchable style={[fsStyles.queueItem, item.id === cur.id && fsStyles.queueItemActive, isActive && fsStyles.queueItemDragging]}
                  onPress={() => { player.skipToQueueIndex(queue.findIndex(h => h.id === item.id)); closeQueue(); }} activeOpacity={0.7}>
                  {/* ≡ 拖曳 handle(§Eric #4:喺成行最頭)。長按拖動排序。
                      §Eric #3:唔用 disabled={isActive} —— draggable-flatlist 有時拖完唔 reset
                      isActive,會令粒掣卡喺 disabled(變灰、撳唔到)。activeOpacity=1 = 撳落唔會
                      dim,唔會卡喺灰色。 */}
                  <SheetTouchable onLongPress={drag} delayLongPress={150} activeOpacity={1}
                    hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }} style={fsStyles.dragHandleLeft}>
                    <OdeIcon name="dragHandle" size={22} color={item.id === cur.id ? GLOW_COLOR : TEXT_SECONDARY} />
                  </SheetTouchable>
                  <CoverImage youtubeId={item.youtube_id} style={fsStyles.queueCover} />
                  <View style={fsStyles.queueInfo}>
                    <Text style={fsStyles.queueTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
                    <Text style={fsStyles.queueArtist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  {/* ≡♪ 加入到清單 */}
                  <SheetTouchable onPress={(e) => { e?.stopPropagation?.(); openAddToPlaylist(item); }}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} style={fsStyles.rowAct}>
                    <OdeIcon name="addToList" size={22} color={TEXT_SECONDARY} />
                  </SheetTouchable>
                  <FavHeart hymn={item} />
                </SheetTouchable>
              </ScaleDecorator>
            );
          }}
        />
        )}
      </BottomSheet>

      {/* ===== NATIVE MODAL: Lyrics ===== */}
      <Modal
        visible={lyricsVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setLyricsVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: MAIN_BG_COLOR, paddingTop: safeTop,
          paddingHorizontal: 20,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <OdeIcon name="lyrics" size={20} color={PRIMARY_COLOR} />
              <Text style={{ ...TYPOGRAPHY.sectionTitle, marginLeft: 8 }}>歌詞</Text>
            </View>
            <TouchableOpacity onPress={() => setLyricsVisible(false)} style={{ padding: 4 }}>
              <OdeIcon name="close" size={24} color={TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>
          {/* 歌名 + 歌手做副標 */}
          <Text style={{ ...TYPOGRAPHY.songTitle, marginBottom: 2 }} numberOfLines={2}>{getDisplayTitle(cur)}</Text>
          <Text style={{ ...TYPOGRAPHY.artist, marginBottom: 16 }} numberOfLines={1}>{cur.artist || ''}</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* §5.3 歌詞行距 1.7x;冇歌詞唔呃人。BUG1:呢度食已經轉好換行嘅
                lyricsText,唔再係原始「|」分隔字串。
                段落間距:lyricsStanzas 每個元素係一個段落(主歌/副歌),用
                獨立 <View> 分開再加 marginBottom,唔係淨係塞多幾個 "\n" 落
                一嚿 Text 度 —— 段落邊界本身就係 STAGE 3 對嘴驗證 pipeline
                寫落 DB 嗰陣已經分好,呢度只係跟住個結構畫返出嚟。
                INSTRUMENTAL-CATEGORY-PLAN §3.3 #5(Phase 2e)—— 空狀態文案分兩
                種:純音樂唔係「歌詞未做」,係本身冇歌詞(lyrics_status 落咗
                'unavailable' 係終態,歌詞班永遠唔會補到佢),用返同一句
                「暫無歌詞」會令用戶以為我哋執漏咗。 */}
            {lyricsStanzas.length > 0 ? (
              lyricsStanzas.map((lines, i) => (
                <View key={i} style={{ marginBottom: i < lyricsStanzas.length - 1 ? 28 : 0 }}>
                  {lines.map((line, j) => (
                    <Text key={j} style={TYPOGRAPHY.lyrics}>{line}</Text>
                  ))}
                </View>
              ))
            ) : (
              <Text style={{ ...TYPOGRAPHY.body, color: TEXT_SECONDARY }}>
                {cur?.instrumental === 1 ? '純音樂 · 無歌詞' : '暫無歌詞'}
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const fsStyles = StyleSheet.create({
  // 同 pageStyles.container 一樣唔可以寫死 SCREEN_HEIGHT(見嗰邊註解)
  container: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  // queue sheet 自訂 handle 個 grabber(取代 gorhom default handleIndicator)
  queueHandleBar: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: TEXT_SECONDARY, marginTop: 8, marginBottom: 6 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  // §3.4 4 粒獨立膠囊 pill:黑底(卡片色)、橫排並列
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 16 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD_BG_COLOR, borderRadius: 999,
    paddingVertical: 10, marginHorizontal: 4,
  },
  pillDisabled: { opacity: 0.45 },
  pillLabel: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY, marginLeft: 6 },
  dismissBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  // ODE-HANDOFF §1:播放器頂 title = logo 環 22dp + 「ode」17px(Sora 200)
  topBarBrand: { flexDirection: 'row', alignItems: 'center' },
  topBarBrandImg: { marginRight: 7 },
  topBarTitle: { fontFamily: 'Sora-ExtraLight', fontWeight: '200', fontSize: 17, letterSpacing: 1, color: TEXT_PRIMARY },
  // B4 修(第二版,revert):試過 aspectRatio:16/9 但令 Eric 部機睇落更差——
  // 唔少縮圖嘅色帶係燒死喺 JPEG 像素入面(唔係容器逼出嚟嘅偽影),16:9 容器
  // 反而完整顯示埋個色帶,仲拉開咗封面同歌名之間嘅空隙。改返正方形,由
  // BigCover 用「模糊放大墊底 + 正常前景」蓋走殘留色帶(見 BigCover 註解)。
  coverWrap: {
    width: '85%',
    aspectRatio: 1,
    alignSelf: 'center',
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  coverImg: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    resizeMode: 'cover',
    ...effects.coverInset, // F3(a):封面 1px 內描邊(ODE-HANDOFF §3)
  },
  // 背景墊底層:同前景同一張圖、放大 15% 再 blur,填滿成個 coverWrap,行
  // 喺前景之後(z-order 靠 View child order,呢層擺喺 coverImg 之前 render)。
  // 放大係要避免 blurRadius 喺圖邊採樣到透明/邊緣像素,整出一圈唔均勻嘅邊。
  coverBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
    borderRadius: 24,
    transform: [{ scale: 1.15 }],
  },
  coverFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  equalizerContainer: { position: 'absolute', bottom: 16, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  equalizerBar: { width: 5, backgroundColor: GLOW_COLOR, borderRadius: 2 },
  equalizerBar1: { height: 18 },
  equalizerBar2: { height: 28 },
  equalizerBar3: { height: 14 },
  equalizerBar4: { height: 22 },
  songInfo: { paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
  progressSection: { paddingHorizontal: 28, paddingVertical: 4 },
  progressBarTouchArea: { height: 36, justifyContent: 'center' },
  progressBarBg: { height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3 },
  progressBarFill: { height: 5, backgroundColor: GLOW_COLOR, borderRadius: 3 },
  progressBarThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: GLOW_COLOR, position: 'absolute', right: -7, top: '50%', marginTop: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 12, color: TEXT_SECONDARY },
  // C —— 循環模式文字提示。高度寫死 18,冇字嗰陣照佔位(見 cycleRepeatMode 註解)。
  repeatHintRow: { height: 18, justifyContent: 'center', alignItems: 'center' },
  repeatHintText: { fontSize: 13, fontWeight: '600', color: GLOW_COLOR, letterSpacing: 0.5 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  controlBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  // BUG3(c) — ⏭ 冇嘢跳嗰陣唔再係死掣,dim 落嚟同 pillDisabled(opacity: 0.45)睇齊。
  controlBtnDisabled: { opacity: 0.45 },
  ctrlActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GLOW_COLOR, marginTop: 3 },
  // 單曲循環:repeat icon 中間疊個「1」(odeIcons.js repeat note —— 唔另畫 icon)。
  // B(Eric 2026-08-25)兩處改動:
  //  1. 字重由 Sora ExtraLight 200 / 13px 改做**系統字 700 / 14px**。舊嗰個係
  //     全 App 最幼嗰隻字款,喺 32dp 圖示中間細過個箭嘴,Eric 影相形容成
  //     「一粒細圓點」——即係根本認唔出係「1」。⚠️ 唔可以齋齋喺原本嗰句加
  //     fontWeight:'700' —— Android 只 bundle 咗 Sora-ExtraLight.ttf 呢一個
  //     字重,指名 fontFamily 之後 fontWeight 會俾 ignore(或者出 fake bold),
  //     所以要連 fontFamily 一齊拎走,行返系統字(同 radioDividerText 等
  //     一眾 fontWeight:'600' 嘅位一樣做法)。
  //  2. `textAlignVertical` 喺 RN **淨係 Android 有效**,iOS 完全唔理 → 個
  //     絕對定位鋪滿 32×32 嘅 Text 喺 iOS 會貼住頂,撞正個環嘅上邊橫線,
  //     睇落似汙糟嘢多過似「1」(TestFlight build 13 中招)。改用
  //     lineHeight = 圖示尺寸(32)做真正跨平台垂直置中。
  repeatOneBadge: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    textAlign: 'center', lineHeight: 32,
    fontWeight: '700', fontSize: 14, color: GLOW_COLOR,
  },
  playBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: GLOW_COLOR,
    justifyContent: 'center', alignItems: 'center',
    ...effects.playGlow, // F3(b):播放器主掣暖光外發光(ODE-HANDOFF §3)
  },
  // native Modal bottom-sheet 外殼(手尾修正 v228,取代 gorhom)
  // 「正在隨機播放：」分隔線 —— 用戶揀嘅歌 vs 系統自動接落去嘅歌之間嗰條界。
  radioDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  radioDividerLine: { flex: 1, height: 1, backgroundColor: DesignColors.border },
  radioDividerText: { color: GLOW_COLOR, fontSize: 13, fontWeight: '600' },
  // 自動播放 toggle + chips
  autoplayRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  autoplayTitle: { ...TYPOGRAPHY.songTitle, fontSize: 16 },
  autoplaySub: { ...TYPOGRAPHY.artist, marginTop: 1 },
  toggleTrack: { width: 46, height: 28, borderRadius: 14, backgroundColor: DesignColors.cardLight, padding: 3, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: GLOW_COLOR },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: TEXT_SECONDARY },
  toggleThumbOn: { backgroundColor: MAIN_BG_COLOR, alignSelf: 'flex-end' },
  chipBar: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 6 },
  apChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, margin: 4,
    backgroundColor: CARD_BG_COLOR, borderWidth: 1, borderColor: DesignColors.border,
  },
  apChipOn: { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
  apChipText: { fontSize: 13, fontWeight: '600', color: TEXT_SECONDARY },
  apChipTextOn: { color: TEXT_ON_GLOW },
  apChipHint: { ...TYPOGRAPHY.artist, paddingHorizontal: 16, paddingBottom: 8, marginTop: -2 },
  shuffleBanner: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: 'rgba(239,228,210,0.14)',
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 8,
  },
  shuffleBannerText: { fontSize: 12, fontWeight: '600', color: GLOW_COLOR, marginLeft: 5 },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  queueItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  queueItemDragging: { backgroundColor: CARD_BG_COLOR, borderRadius: 10 },
  dragHandleLeft: { paddingRight: 10, paddingVertical: 4 }, // §Eric #4:喺最左
  rowAct: { paddingHorizontal: 8, paddingVertical: 4 },
  queueCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: DesignColors.cardLight, ...effects.coverInset },
  queueInfo: { flex: 1, marginLeft: 10 },
  queueTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  queueArtist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50,
  },
  loadingText: { color: TEXT_PRIMARY, fontSize: 14, marginTop: 12 },
});

// ===== AppContent =====
// 分享清單 deep link(MEMBERSHIP-PHASE3-SHARE-PLAN §2.3;domain 遷移見
// ODE-REBRAND-PLAN §3.5)—— parse 三款 URL:`https://api.god-music.com/p/<token>`
// (舊域,流通中嘅分享連結靠佢,唔可以剷)、`https://api.odemusics.com/p/<token>`
// (新域)、同 `godmusic://p/<token>`(scheme 冇改)。
// 呢個 handler 喺 §0.2 講嘅「舊 APK dormant code」前提下要極度防禦性:
// 冇 scheme/intentFilter 嘅舊 APK 根本唔會有呢個 URL 走入嚟,但萬一將來
// 有奇怪輸入(例如其他 app 亂 send intent),parse 唔到就靜靜哋 return null,
// 唔可以拋錯累冧成個開機流程。
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{20,24}$/;
const SHARE_URL_PREFIXES = [
  'https://api.god-music.com/p/',
  'https://api.odemusics.com/p/',
  'godmusic://p/',
];
function parseSharedToken(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    let rest = null;
    for (const prefix of SHARE_URL_PREFIXES) {
      if (url.startsWith(prefix)) { rest = url.slice(prefix.length); break; }
    }
    if (!rest) return null;
    const token = rest.split(/[/?#]/)[0];
    return SHARE_TOKEN_RE.test(token) ? token : null;
  } catch (_) {
    return null;
  }
}

function AppContent() {
  useRenderCount('AppContent'); // PERF-BASELINE-1B-20260902
  useEffect(() => { mark('cont'); }, []); // PERF-BASELINE-1B-20260902 — AppContent mount
  const {
    hymns, setHymns, playQueue, playSingle, showPlayer, queueReady,
    isPlaying: debugPlaying, currentHymn, togglePlayPause: debugToggle,
    overlayExpanded, hidePlayer,
  } = usePlayer();
  const { hymns: allSongs, loading } = useCachedHymns();
  const bottomInset = useBottomInset();
  const topInset = useInsets().top;
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeTab, setActiveTab] = useState('Home');
  const [authVisible, setAuthVisible] = useState(false);
  const [hymnListVisible, setHymnListVisible] = useState(false);

  // ── 會員系統 Phase 1 W2:登入合併 + 跨裝置同步(MEMBERSHIP-PHASE1-LOGIN-SYNC.md §2.3-2.5)──
  const { user, token } = useAuth();
  const { favorites, replaceAllFavorites } = useFavorites() || {};
  const { playlists, replaceAllPlaylists } = usePlaylists() || {};
  // 「最新值」ref pattern:登入/前後台 effect 唔想因為 favorites/playlists 每次
  // 變動(用戶撳心心)都重新掛聽/拆聽,淨係要嗰一刻嘅最新值,喺 render 度直接
  // 寫 ref 就夠(純賦值,冇副作用,strict-mode 重跑都冇問題)。
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const allSongsRef = useRef(allSongs);
  allSongsRef.current = allSongs;
  const prevUserIdRef = useRef(null);
  const pendingSyncRef = useRef(false); // merge/pull 失敗 → 等下次 app active 再試
  // 防抖:app 前後台切幾下(或 login-transition effect 同 AppState listener 撞埋)
  // 可以喺一個 merge 未做完之前又觸發多一次,唔加呢個 guard 會疊 call、疊出多個
  // 「已同步」Alert(pushSync 本身冪等,唔會整壞數據,但體驗難睇)。
  const syncInFlightRef = useRef(false);

  const runLoginSync = useCallback(async () => {
    if (!user || !token) return;
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      setAuthToken(token); // 防 AuthContext 個 effect 未 run 到,呢度同步行呼叫前自己確保灌咗
      const ownerId = getOwner();
      const sameOwner = ownerId == null || String(ownerId) === String(user.id);

      if (sameOwner) {
        // §2.3 登入合併:推晒本地全量,response = 合併後全量,一次過 replaceAll。
        // ⚠️ 「(已下架)」佔位項唔可以再推上 server(2026-08-22 實錘)。
        // /api/me/sync 係 union merge(INSERT OR IGNORE,冇核過 hymn_id 存唔存在),
        // 所以本地一日仲揸住嗰個死 id,就算 server 側清理過都會俾下一次登入合併
        // 原封不動打返上去。實例:kids C4 原子換血(c4-swap-users-remap.json)
        // 2026-08-01 已經幫 user 2 favDropped 咗 oldId 2015,但 2026-08-02 06:59:45
        // 又由 client 推返上嚟(同一批仲有 1835/1951/2420/2718),之後就一直卡喺
        // 最愛度 404。呢度剪走佢:server 側清理至少企得穩,唔會被合併復活。
        // (注意呢個 filter 本身唔會刪 server 現有嗰行 —— union merge 唔識刪嘢,
        //  已經寫咗落 users.db 嗰啲死 id 要另外做一次 reconcile,見分析文件。)
        const favIds = (favoritesRef.current || []).filter((f) => !f?.unavailable).map((f) => f.id);
        const plList = (playlistsRef.current || []).map((p, i) => ({
          id: p.id,
          name: p.name,
          position: typeof p.position === 'number' ? p.position : i,
          songs: p.songs || [],
          updated_at: p.updated_at || '1970-01-01T00:00:00.000Z',
        }));
        const result = await pushSync(favIds, plList);
        if (!result) { pendingSyncRef.current = true; return; }
        replaceAllFavorites && replaceAllFavorites(result.favorites || [], allSongsRef.current);
        replaceAllPlaylists && replaceAllPlaylists(result.playlists || []);
        setOwner(user.id);
        clearOutbox();
        pendingSyncRef.current = false;
        Alert.alert('已同步', `已同步 ${result.favorites?.length || 0} 首最愛、${result.playlists?.length || 0} 個清單`);
      } else {
        // §2.5 換帳戶保護:呢部機啲本地數據係上手用戶嘅,唔准 merge,靜靜哋
        // 直接 pull 呢個新帳戶自己嘅 server 版覆蓋本地。
        const data = await pullData();
        if (!data) { pendingSyncRef.current = true; return; }
        replaceAllFavorites && replaceAllFavorites(data.favorites || [], allSongsRef.current);
        replaceAllPlaylists && replaceAllPlaylists(data.playlists || []);
        setOwner(user.id);
        clearOutbox();
        pendingSyncRef.current = false;
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [user, token, replaceAllFavorites, replaceAllPlaylists]);

  // 登入合併觸發點①:App.js 監察 user 由 null → 有(涵蓋開機讀返 saved token,
  // 同真係撳「登入」兩種情況——兩種都要合併/pull,冪等,唔怕重複行)。
  useEffect(() => {
    const wasLoggedOut = !prevUserIdRef.current;
    prevUserIdRef.current = user?.id || null;
    if (user && token && wasLoggedOut) runLoginSync();
  }, [user, token, runLoginSync]);

  // 觸發點②③:app active 前後台切換——merge 未成功就 retry;成功咗就淨係
  // flush outbox + pull 一次(§2.4 輕量版,唔使成個 /api/me/sync 再推一次)。
  const lastPullRef = useRef(0);
  useEffect(() => {
    async function onActive() {
      if (!user || !token) return;
      if (pendingSyncRef.current) { await runLoginSync(); return; }
      // P0(Opus 驗收揪出)—— flush 失敗(outbox 仲有嘢未推)就唔可以照樣
      // pull+replaceAll:嗰啲未推嘅本地新增(例如啱啱撳嘅心心)會俾 server
      // 舊版全部覆蓋、無聲無息永久蒸發。要 confirm 真係推晒先安全覆蓋本地。
      const flushed = await flushOutbox();
      if (!flushed) return;
      const now = Date.now();
      if (now - lastPullRef.current < 60000) return; // 節流:60 秒最多一次
      lastPullRef.current = now;
      const data = await pullData();
      if (data) {
        replaceAllFavorites && replaceAllFavorites(data.favorites || [], allSongsRef.current);
        replaceAllPlaylists && replaceAllPlaylists(data.playlists || []);
      }
    }
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') onActive(); });
    return () => sub.remove();
  }, [user, token, runLoginSync, replaceAllFavorites, replaceAllPlaylists]);

  // B7 修 —— 之前全 App 淨係得 FullScreenPlayerOverlay 入面嗰個 BackHandler
  // (見嗰邊,喺 anySheetOpen 先註冊,淨係管「收返 queue sheet」)。冇任何嘢
  // 處理過「而家喺邊個 tab」,所以喺「詩歌庫」/「我的」撳返回鍵,RN 冇人食
  // 呢個事件,就直接跌落去 Android 預設行為——退出 App。
  //
  // 呢個 effect 補返「非首頁 tab 撳返回 = 返首頁」。優先順序(點解冇撞):
  //  1. queue sheet 全開 —— FullScreenPlayerOverlay 嗰個 handler 處理,唔關呢度事。
  //  2. 播放器全螢幕開住(overlayExpanded)—— 呢度先收返 mini player。
  //  3. 唔喺首頁 tab —— 呢度切返首頁。
  //  4. 首頁 tab + 播放器收埋 —— 乜都唔做,俾返 RN 預設行為(退出)。
  // RN 嘅 BackHandler 係後註冊嘅 listener 優先(LIFO)。FullScreenPlayerOverlay
  // 淨係喺 overlayExpanded 先會 mount(見 PlayerProvider 個 `{overlayExpanded &&
  // <FullScreenPlayerOverlay/>}`),而佢喺 render tree 排喺 AppContent 之後
  // (PlayerProvider 先 render `{children}`即 AppContent,先至到 overlay),
  // 所以兩個 effect 同一個 commit 內一齊註冊時,佢實會排喺呢度之後、變成
  // 最新嗰個 → 佢個 handler 優先食events,同上面優先順序 1 > 2 一致,唔使
  // 額外協調狀態。
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlayExpanded) { hidePlayer(); return true; }
      if (activeTab !== 'Home') { setActiveTab('Home'); return true; }
      return false; // 首頁 tab + 播放器收埋:保留預設行為(退出 App)
    });
    return () => sub.remove();
  }, [overlayExpanded, hidePlayer, activeTab]);

  const openAuth = useCallback(() => setAuthVisible(true), []);
  const closeAuth = useCallback(() => setAuthVisible(false), []);
  // Admin「貼連結加歌」畫面(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)—— 同 Auth Modal
  // 一樣做法:slide-in 全螢幕 Modal,由 MineScreen 個入口開。
  const [adminAddVisible, setAdminAddVisible] = useState(false);
  const openAdminAdd = useCallback(() => setAdminAddVisible(true), []);
  const closeAdminAdd = useCallback(() => setAdminAddVisible(false), []);
  const [hymnListData, setHymnListData] = useState({ hymns: [], title: '' });

  const showHymnList = (hymns, title) => {
    setHymnListData({ hymns, title });
    setHymnListVisible(true);
  };

  const closeHymnList = () => {
    setHymnListVisible(false);
  };

  // 分享清單 deep link 接收(MEMBERSHIP-PHASE3-SHARE-PLAN §2.3)—— mount 時
  // 揸實 getInitialURL()(cold start 由 link 開 app)+ 掛 'url' listener
  // (app 已經開住,WhatsApp/瀏覽器再掟一個 link 過嚟)。中咗就 render
  // SharedPlaylistSheet;parse 唔到(舊 APK 冇 scheme/intentFilter 根本唔會
  // 觸發到呢度、或者將來奇怪輸入)就乜都唔做,唔影響現有啟動流程。
  const [sharedToken, setSharedToken] = useState(null);
  useEffect(() => {
    let mounted = true;
    Linking.getInitialURL().then((url) => {
      if (!mounted) return;
      const token = parseSharedToken(url);
      if (token) setSharedToken(token);
    }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      const token = parseSharedToken(url);
      if (token) setSharedToken(token);
    });
    return () => { mounted = false; sub.remove(); };
  }, []);
  const closeSharedPlaylist = useCallback(() => setSharedToken(null), []);

  // Hymns loaded via useCachedHymns (MMKV cache + background refresh)
  // When fresh data arrives, update PlayerProvider's hymns
  useEffect(() => {
    if (allSongs && allSongs.length > 0) {
      // INSTRUMENTAL-CATEGORY-PLAN §6 P0(Phase 3a)—— 灌 duration 落預載
      // module,佢個長檔閘先至查得到。要喺任何 prefetchAudio() 之前 call:
      // 呢個 effect 同下面 boot 預載嗰個都係食 `allSongs`,React 按宣告次序
      // 行 effect,呢個喺前面(3250 vs 3280),所以開機第一批已經有數。
      // background refresh 換咗個庫都會再行一次,新歌自然補上。
      setAudioDurationIndex(allSongs);
      setHymns(allSongs);
    }
  }, [allSongs]);

  // §3a PERF-FAST-START-PLAN:開 App 熱身 ping —— 預先找數 DNS+TLS+tunnel 握手,
  // 第一下撳歌慳 ~0.3-0.5s。fire-and-forget。
  useEffect(() => {
    fetch(`${API_BASE}/api/health`).catch(() => {});
  }, []);

  // HLS-EXEC-D123-GATE-20260901 P3 —— deviceId 開機讀/生成,cross-platform
  // (Android 都要,logDiag() 每條 client-log 都帶住佢)。獨立於下面 iOS-only
  // 嘅 app-version fetch,純粹負責填 module-level `DEVICE_ID`。
  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((id) => { if (!cancelled) DEVICE_ID = id; }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // HLS-ROOTFIX-PLAN-20260901 §5.1:開機打一次 `/api/app-version`,讀
  // `hlsEnabled` 落 module-level 變量(toTrack() 用)。淨係 iOS 需要(§2.2
  // Android 一個字唔改)。呢個 fetch 同 ApkUpdateBanner 入面嗰個係獨立兩次
  // call(嗰個負責 versionCode 比較彈 banner,呢個負責讀 flag),故意唔共用
  // ——避免將兩個唔相關嘅關注點綁埋一齊、日後其中一個要改動累到另一個。
  // 打唔到 / timeout / 冇呢個欄位一律維持預設 false,唔會影響現有行為。
  // HLS-EXEC-D123-GATE-20260901 P3 —— 單機 gate:帶 `?d=<deviceId>`,等
  // backend 可以淨開俾指定機。ApkUpdateBanner 嗰條(App.js:~4270)冇 d 都要
  // 照答,故意唔改。
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    getOrCreateDeviceId()
      .catch(() => '')
      .then((id) => fetch(`${API_BASE}/api/app-version?d=${encodeURIComponent(id || '')}`, { signal: controller.signal }))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) HLS_ENABLED = data.hlsEnabled === true;
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, []);

  // §3b①:歌單一 load 好就預熱「今日為你預備」6 首(同 HomeScreen 個算法
  // 一致),令開 App 後頭幾下撳落去都係 warm。只做一次。
  // 2026-07-29 QUEUE-UX-4FIXES §4/§7-3:「繼續收聽」已剷,呢度唔再預熱嗰首。
  //
  // PHASE2.5-PRELOAD-PLAN §4 W2 —— 呢度同時係開機本地預載名單嘅唯一出處。
  // 「只做一次」而家安全咗:W1 之後抽選唔再跟池飄(background refresh 換咗個
  // 庫都唔會換歌),所以用第一份(MMKV 快取)庫算出嚟嗰批,同用戶幾秒後喺
  // 首頁見到嗰批係同一批。
  const bootWarmedRef = useRef(false);
  useEffect(() => {
    if (bootWarmedRef.current || !allSongs?.length) return;
    bootWarmedRef.current = true;
    const ids = [];
    let chipHeadId = null;
    try {
      const featured = allSongs.filter((h) => h.featured === 1);
      const pool = featured.length >= 6 ? featured : allSongs;
      for (const p of dailyPickBalanced(pool, 'today', 6, ['粵語', '國語', '英文'])) ids.push(p.id);
      todayPickIds = ids.slice(); // W4 量度用
      // W2 —— 「即刻揀歌」而家用緊嗰個 chip 嘅第一首。chip 定義同「記低嗰個
      // 冇咗就 fallback 第一個」嘅邏輯同 HomeScreen 共用(utils/homeChips.js),
      // 唔可以喺呢度另抄一份。dailyPick 係 top-n 排序,所以 n=1 攞到嗰首同
      // HomeScreen 頭一版嘅第一首必定一樣。
      const chip = resolveActiveChip(allSongs, getHomeChip());
      if (chip) {
        const head = dailyPick(chip.songs, chip.id, CHIP_PAGE_SIZE);
        chipHeadIds = head.map((h) => h.id); // W4:成版 4 首都算「chip」呢個 surface
        chipHeadId = head[0]?.id ?? null;
      } else {
        chipHeadIds = [];
      }
      // W4 —— 「最近加入」頭 12(冇 created_at,用 id 由大到細近似,同 HomeScreen 一樣)。
      recentHeadIds = [...allSongs].sort((a, b) => b.id - a.id).slice(0, 12).map((h) => h.id);
      // Phase 2.5② —— 個清單係日期種子決定,今晚已經計到「聽日」係邊幾首。
      // W1 之前呢個係空轉(聽朝個庫一變就成套換晒),而家先至靠得住。
      if (Platform.OS === 'ios') {
        const tmr = new Date(Date.now() + 24 * 60 * 60 * 1000);
        tomorrowHeadIds = dailyPickBalanced(pool, 'today', 6, ['粵語', '國語', '英文'], tmr)
          .slice(0, 2)
          .map((p) => p.id);
      }
    } catch (_) {}
    warmIds(ids);
    // Phase 2.5① + W2 —— 開 App 即刻背景落載呢 5 首(串行,順序就係優先序):
    //   [今日頭1, 今日頭2, 現用chip頭1, 聽日頭1, 聽日頭2]
    // 流量:每首 3–8MB。穩定狀態下今日嗰 2 首琴晚已經喺 disk(index.has() 零成本
    // skip),實際新落載通常淨係 chip頭1 + 聽日 2 首 ≈ 9–18MB/日;最壞(新裝/
    // 斷開幾日)5 首 ≈ 15–30MB。名單 cap 死 5 首,唔准喺呢度加碼——「今日其餘
    // 4 首 / 最近加入」等 W4 真機數據先決定(§10-4)。
    // 聽日嗰 2 首排最尾,唔會阻住今日嗰 3 首;trackChanged 嗰段(Phase 2.5②)
    // 保留做後備,冚呢個 effect 行唔到嘅 edge case,prefetch() 自己會去重。
    if (Platform.OS === 'ios') {
      const preloadIds = [ids[0], ids[1], chipHeadId, tomorrowHeadIds[0], tomorrowHeadIds[1]];
      for (const pid of preloadIds) if (pid != null) prefetchAudio(pid);
    }
  }, [allSongs]);

  async function handlePlayHymn(h, opts = {}) {
    if (!h) return;
    // v231 —— 兩種播放語義,由 caller 用 `opts.explicit` 講明邊種:
    //
    //  explicit: true  = 用戶揀咗**成個清單**(chip「播全部」/「睇晒」歌單頁 /
    //                    隨心聽)→ 照清單次序播晒,§3.8:唔重排,native skip(idx)
    //                    保持自然次序,咁 prev 先返得返上面幾首。
    //  explicit: 唔係   = 用戶淨係撳咗**一首散歌**→「單曲 + 自動隨機接續」。
    //                    `opts.playlist` 喺呢種情況下淨係做隨機接續嘅 pool,
    //                    **唔係**播放次序。
    //
    // Default 係「單曲 + 隨機接續」,所以任何未標明嘅入口(詩歌庫、搜尋、
    // 我的、繼續收聽)都自動係 Eric 要嘅行為,唔會漏。
    if (opts.explicit && opts.playlist?.length) {
      const list = opts.playlist;
      const idx = Math.max(0, list.findIndex(s => s.id === h.id));
      // BUG3(b)(2026-07-29 推翻,見 playQueue() 註解)—— opts.appendAutoplayTail
      // 而家冇任何 caller 傳(PlaylistDetailSheet.js 刪咗),pass-through 刻意留低
      // 做死碼機關,唔會意外觸發。
      // browseTap:true(詩歌庫/搜尋)—— 插播判斷邏輯喺 playQueue() 入面做
      // (嗰度先有 queueRef 呢啲 player 內部 ref,呢個 component 冇)。
      playQueue(list, idx, { appendAutoplayTail: !!opts.appendAutoplayTail, browseTap: !!opts.browseTap, surface: opts.surface });
    } else {
      // 隨機接續一律由**全庫**抽,唔用 opts.playlist 做 pool ——「今日為你預備」
      // 之類得 6 首,攞嚟做 pool 就得 5 首尾巴,太短。全庫抽先夠似 Spotify。
      // (副作用:舊 caller 傳落嚟嘅 `playlist` 喺呢條路徑會被忽略,呢個係有意嘅。)
      playSingle(h, allSongs);
    }
    showPlayer();
  }
  function handleOpenFullScreen() { showPlayer(); }

  // PERF-BASELINE-1B-20260902 — tab 導航 tap-to-mount/tap-to-paint 量度
  // (三個 tab keep-mount,「mount」呢度近似做「State 更新 commit 咗」;
  // 「paint」用雙 rAF 之後嗰刻)。純量度,唔改任何導航行為。
  const navTapRef = useRef(null);
  const handleTabChange = useCallback((tab) => {
    navTapRef.current = Date.now();
    setActiveTab(tab);
  }, []);
  useEffect(() => {
    const tStart = navTapRef.current;
    if (tStart == null) return; // 首次掛載,唔係用戶撳出嚟嘅
    navTapRef.current = null;
    const tapToMountMs = Date.now() - tStart;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        recordNavBeacon(activeTab, tapToMountMs, Date.now() - tStart);
      });
    });
  }, [activeTab]);

  // B9 修 —— MiniPlayer 之前淨係喺 <TabBar> 入面 render(主 tab 專用)。
  // 「睇晒 N 首」分類詳情頁(下面 HymnList Modal)同「我的」入面嘅播放清單
  // 詳情頁(PlaylistDetailSheet,喺 MineScreen.js 度)兩個都係 **native
  // `<Modal>`**——Modal 喺 Android 係獨立一層,會完全遮住底下嗰層,所以主
  // tab 嗰個 MiniPlayer/TabBar 影都見唔到,音樂播緊都冇得控制、都唔切得
  // 返 tab。
  //
  // 呢兩個畫面唔喺 App.js 度(HymnListScreen 喺呢度,PlaylistDetailSheet
  // 就係由 MineScreen.js 開嘅),為咗唔好將 MiniPlayer 呢個組件抄多份
  // (或者由嗰啲畫面 import 返 App.js,製造返 circular import 問題),
  // 做法係喺呢度起**一個** MiniPlayer 嘅 React
  // element,包埋佢自己嘅底部 safe-area padding(mini player 企喺呢兩個
  // Modal 度冇 TabBar 陪住,要自己頂住導航列),再用 props 派落去。
  // MiniPlayer 本身喺冇 currentHymn 就 return null,唔會喺冇歌播嗰陣佔位。
  //
  // Tab bar 就冇跟落去 —— 呢兩頁定位係「入咗一層」嘅詳情頁(似 stack
  // push),唔係平行嘅主 tab;跟返返回鍵/返回掣就返到去主 tab,毋須要
  // 再喺呢層度切 tab。淨係補返控制播放呢一環先啱用家最迫切嘅需要
  // (音樂播緊冇得控)。
  const miniPlayerNode = (
    <View style={{ backgroundColor: CARD_BG_COLOR, paddingBottom: bottomInset }}>
      <MiniPlayer onPress={handleOpenFullScreen} />
    </View>
  );
  const hasMiniPlayer = !!currentHymn?.id;

  return (
    <View style={pageStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />



      <View style={pageStyles.content}>
        {/* 三 tab(§2.2 + SEARCH-MERGE-PLAN):首頁 / 詩歌庫 / 我的。全部 keep mount,
            靠 display 收埋以保留各自 scroll/state(詩歌庫嘅搜尋字串都因此跨 tab 保留)。 */}
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Home' ? 'flex' : 'none' }]}>
          <HomeScreen hymns={allSongs || []} loading={loading} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} onPlayHymn={handlePlayHymn} onOpenAuth={openAuth}
            onOpenList={showHymnList} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Library' ? 'flex' : 'none' }]}>
          <LibraryScreen hymns={allSongs || []} onPlayHymn={handlePlayHymn} onOpenAuth={openAuth} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Mine' ? 'flex' : 'none' }]}>
          <MineScreen onPlayHymn={handlePlayHymn} onOpenAuth={openAuth} onOpenAdminAdd={openAdminAdd}
            miniPlayer={miniPlayerNode} hasMiniPlayer={hasMiniPlayer} />
        </View>
      </View>

      {/* Auth Modal */}
      {authVisible && (
        <Modal visible animationType="slide" onRequestClose={closeAuth}>
          <AuthScreen onClose={closeAuth} />
        </Modal>
      )}

      {/* Admin「貼連結加歌」Modal(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7) */}
      {adminAddVisible && (
        <Modal visible animationType="slide" onRequestClose={closeAdminAdd}>
          <AdminAddHymnScreen onClose={closeAdminAdd} />
        </Modal>
      )}

      {/* 分享清單:撳 link 收到(MEMBERSHIP-PHASE3-SHARE-PLAN §2.3),獨立
          native Modal,同 PlaylistDetailSheet 一樣要自己帶 mini player。 */}
      {sharedToken && (
        <SharedPlaylistSheet token={sharedToken} onClose={closeSharedPlaylist}
          onPlayHymn={handlePlayHymn} miniPlayer={miniPlayerNode} hasMiniPlayer={hasMiniPlayer} />
      )}

      {!__DEV__ ? <UpdateBanner /> : null}
      {/* iOS 冇 APK 側載,呢個 banner 淨係 Android 適用——iOS 嘅 native 殼
          更新行 TestFlight 自己嘅更新機制,唔 gate 嘅話會攞 iOS build number
          同 Android versionCode 亂比,仲叫 iPhone 用戶去落 APK。 */}
      {!__DEV__ && Platform.OS === 'android' ? <ApkUpdateBanner /> : null}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange}
        bottomInset={bottomInset} onMiniPlayerPress={handleOpenFullScreen} />

      {/* HymnList Modal */}
      <Modal
        visible={hymnListVisible}
        animationType="slide"
        onRequestClose={closeHymnList}
      >
        <View style={pageStyles.hymnListModal}>
          <TouchableOpacity
            style={[pageStyles.hymnListClose, { paddingTop: topInset + 12 }]}
            onPress={closeHymnList}
          >
            {/* §5.4 向量圖標,同全 App 其他返回入口睇齊 */}
            <OdeIcon name="back" size={22} color={TEXT_PRIMARY} />
            <Text style={pageStyles.hymnListCloseText}>返回</Text>
          </TouchableOpacity>
          <HymnListScreen
            hymns={hymnListData.hymns}
            title={hymnListData.title}
            hasMiniPlayer={hasMiniPlayer}
            onPlayHymn={(hymn) => {
              const idx = Math.max(0, hymnListData.hymns.findIndex(s => s.id === hymn.id));
              playQueue(hymnListData.hymns, idx);
              showPlayer();
              closeHymnList();
            }}
          />
          {/* B9 — 呢個 Modal 冇 TabBar 陪住,音樂播緊要有得控制/跳返播放頁 */}
          {miniPlayerNode}
        </View>
      </Modal>
    </View>
  );
}

// ===== EAS Update — 靜默下載 + 薄 banner（雙保險，唔撳都會喺下次冷啟動生效）=====
// __DEV__/debug build 冇 embed updates config,expo-updates 停用,故意唔喺呢啲環境
// render 呢個 component(唔淨係 guard 內部邏輯),避免 native module 報錯。
//
// ⚠️ 呢個 banner 一定要用**正常 flow**(唔好 position:absolute)——TabBar 本身
// 就係 flow 入面最尾一個 sibling(冇自己嘅 absolute 定位),absolute banner
// 會直接疊喺 TabBar 上面遮住個掣(撞過:遮咗「詩歌庫」個掣)。用返 flow,
// 出現時將 TabBar 自然推低少少,唔會遮任何嘢。
function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  if (!isUpdatePending || dismissed) return null;
  return (
    <View style={updateBannerStyles.wrap}>
      <TouchableOpacity
        style={updateBannerStyles.bubble}
        activeOpacity={0.85}
        onPress={() => { setDismissed(true); Updates.reloadAsync(); }}
      >
        <OdeIcon name="systemUpdate" size={16} color={PRIMARY_COLOR} style={{ marginRight: 6 }} />
        <Text style={updateBannerStyles.text} numberOfLines={1}>已有新版本，撳一下更新</Text>
      </TouchableOpacity>
    </View>
  );
}

const updateBannerStyles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: MAIN_BG_COLOR, paddingVertical: 8 },
  bubble: {
    flexDirection: 'row', alignItems: 'center', maxWidth: '86%',
    backgroundColor: CARD_BG_COLOR, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, borderColor: DesignColors.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  text: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '600' },
});

// ===== APK 側載更新提示（APP-UPDATE-CHECK-PLAN §1.2）=====
// App 冇上架 store，靠側載 APK 派新版，用戶對「有大更新」零感知。呢個 banner
// 補呢個窿：cold start 起完 render 之後靜默 fetch 一次 manifest，同裝機
// versionCode 比，有新先出 banner，撳落開瀏覽器落新 APK。
//
// ⚠️ 唔跟 UpdateBanner（EAS OTA）任何機制——嗰個係另一條管道（JS bundle
// 靜默下載完待冷啟動生效），呢個係「要換成隻新 APK」嗰種大更新，冇得靜默，
// 一定要用戶撳一下去瀏覽器落載＋人手裝。兩個 banner 共存邏輯淨係「OTA
// 優先」：isUpdatePending 顯示緊就唔出呢個，因為 OTA 撳一下就完，體驗好過
// 叫人去落 APK。
//
// 比較用 native 實際 versionCode —— 唔可以用 Constants.expoConfig.version，
// 因為 OTA 推咗新 JS bundle 之後，JS 側嘅 version 字串會行先於二進制，用嗰個
// 比較會喺用戶其實仲用緊舊 APK 底子時都話「已經最新」，或者反過來誤判有
// 更新（見 §1.2 註解）。
//
// ⚠️ 第二輪修正（見 APP-UPDATE-CHECK-PLAN §5）：expo-constants 56 已經剷咗
// `nativeBuildVersion`（types 淨返 deprecation 註解，runtime 係
// undefined），改用 `expo-application` 嘅同名 field。但而家出街緊嘅 APK 53
// 未 embed 呢個 native module —— 如果 top-level `import * as Application
// from 'expo-application'` 會喺 import 時直接 throw，一推呢個 OTA 就即刻
// 整死現役 app。所以呢度用 **guarded require**（唔用 top-level import）：
// require 失敗（APK 53）→ null → NaN → banner 靜默唔觸發（冇 crash）；
// 下一隻含 expo-application 嘅 APK 上正常運作。呢個 guard 一定要留到落
// 一隻新 APK 出咗街先可以拆（到時 runtimeVersion 都會由 3 bump 去 4）。
let _nativeBuildVersion = null;
try {
  _nativeBuildVersion = require('expo-application').nativeBuildVersion;
} catch (e) {
  // native module 未存在（現役 APK 53）—— 靜默，等同「查唔到，唔出 banner」
}

// NATIVE-STALL-FG-SPEEDUP-PLAN-20260829.md §2/§4 —— 統一 gate。build 15 先帶
// 「前台 stall watchdog 10s/5s 加速」嘅 native patch;所有依賴呢個加速嘅 JS
// 新行為（10 秒緩衝提示、native-skip 指紋計入 errorSkipCountRef）都要 gate 喺
// 呢條後面。刻意重用上面已經 guard 過嘅 `_nativeBuildVersion`（iOS 呢邊
// expo-application 老早已經 linked 入 Podfile.lock，唔會炸，純粹想同一個
// 已驗證嘅 guarded 變量嚟源，日後一齊查/一齊拆）。Android 或者 iOS build<15
// 呢條 const 恆為 false —— 底下所有 NATIVE_WD_V2 gate 嘅新行為完全 dormant，
// 即使呢段 code 意外經 OTA 派咗出去都對現役 build 14 零影響（老闆 §2 拍板嘅
// 安全網:一次過出 JS+native，唔准分開派）。
const NATIVE_WD_V2 = Platform.OS === 'ios' && Number(_nativeBuildVersion ?? 0) >= 15;

// STARTUP-ROOTFIX-EXEC-BC-20260831 §2.3 —— build 17 帶嘅 progress-predicate
// watchdog(三層階梯 T0 nudge/T1 reload/T2 skip + S1 veto + ETA 閘)。跟
// NATIVE_WD_V2 同一個 guarded 變量嚟源、同一個「一次過出 JS+native」安全網:
// build<17 或者 Android,呢條 const 恆為 false,底下 NATIVE_WD_V3 gate 嘅新
// 行為完全 dormant。
const NATIVE_WD_V3 = Platform.OS === 'ios' && Number(_nativeBuildVersion ?? 0) >= 17;

function ApkUpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/app-version`, { signal: controller.signal });
        if (!res.ok) return; // 404/5xx 一律靜默當冇更新
        const data = await res.json();
        if (cancelled) return;
        const remoteCode = Number(data?.versionCode);
        // ⚠️ 唔可以直接 Number(_nativeBuildVersion)：guard 失敗時佢係
        // `null`，而 `Number(null) === 0`（唔係 NaN！），會令下面
        // `remoteCode > installedCode` 錯誤咁當 0 係合法已裝機版本，
        // 喺 APK 53（native module 未存在）都彈 banner。要顯式將
        // null/undefined 導去 NaN 先可以俾 Number.isFinite 擋到。
        const installedCode = _nativeBuildVersion != null ? Number(_nativeBuildVersion) : NaN;
        if (
          Number.isFinite(remoteCode) && Number.isFinite(installedCode) &&
          remoteCode > installedCode && typeof data?.url === 'string' && data.url
        ) {
          setManifest(data);
        }
      } catch (e) {
        // 斷網 / timeout(AbortError)/ 壞 JSON 一律靜默——呢個 banner 冇得
        // 有 error UI，唔准阻塞正常用機（§1.2）。
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, []);

  if (isUpdatePending) return null; // OTA banner 優先，避免兩條疊
  if (!manifest || dismissed) return null;

  return (
    <View style={apkUpdateBannerStyles.wrap}>
      <View style={apkUpdateBannerStyles.bubble}>
        <TouchableOpacity
          style={apkUpdateBannerStyles.mainTouch}
          activeOpacity={0.85}
          onPress={() => { Linking.openURL(manifest.url); }}
        >
          <OdeIcon name="systemUpdate" size={16} color={PRIMARY_COLOR} style={{ marginRight: 6 }} />
          <Text style={apkUpdateBannerStyles.text} numberOfLines={1}>
            {`有新版本 v${manifest.versionName}，撳一下下載安裝`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={apkUpdateBannerStyles.dismissTouch}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setDismissed(true)}
        >
          <OdeIcon name="close" size={14} color={TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const apkUpdateBannerStyles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: MAIN_BG_COLOR, paddingVertical: 8 },
  bubble: {
    flexDirection: 'row', alignItems: 'center', maxWidth: '86%',
    backgroundColor: CARD_BG_COLOR, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, borderColor: DesignColors.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  mainTouch: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  text: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  dismissTouch: { marginLeft: 10 },
});

// ===== App Entry =====
export default function App() {
  mark('app'); // PERF-BASELINE-1B-20260902 — App() 首次 render
  // ODE-REBRAND-PLAN B2 followup:Sora(拉丁字標)+ Noto Serif TC(金句/歌詞)
  // 已改做 build 期靜態嵌入(app.json expo-font plugin `fonts` array +
  // android/app/src/main/assets/fonts/),唔再靠 runtime `useFonts()`——
  // 舊做法喺 release build 靜默失敗(Noto Serif TC 9.9MB,native asset
  // resolve 唔到),成 app 永遠 fallback 返 Roboto。字體 family 名直接以
  // ttf 檔名為準:'Sora-ExtraLight' / 'NotoSerifTC-Regular',即裝即用,
  // 冇載入延遲、冇白閃。中文 UI 繼續用系統字(唔 bundle Noto Sans TC)。

  // GestureHandlerRootView 一定要包最外 —— gorhom 嘅拖曳手勢靠佢。
  // 兩個 sheet 用 inline `<BottomSheet>`(唔經 portal),所以**故意唔加**
  // BottomSheetModalProvider:加返佢就會走返 v228 嗰條 portal 路,個 hosting
  // container 冇 zIndex,又會俾 zIndex:999 嘅播放器 overlay 蓋住。詳見檔頭註解。
  const tree = (
    <AuthProvider><AdminEditHymnProvider><FavoritesProvider><PlaylistsProvider><AddToPlaylistProvider><PlayerProvider>
      <AppContent />
    </PlayerProvider></AddToPlaylistProvider></PlaylistsProvider></FavoritesProvider></AdminEditHymnProvider></AuthProvider>
  );
  const inner = SafeAreaProvider ? <SafeAreaProvider>{tree}</SafeAreaProvider> : tree;
  return <GestureHandlerRootView style={{ flex: 1 }}>{inner}</GestureHandlerRootView>;
}

const pageStyles = StyleSheet.create({
  // ⚠️ 唔可以寫 `height: SCREEN_HEIGHT`(v232 修)。個 App 係 edge-to-edge
  // (styles.xml 兩條系統列都透明),`Dimensions.get('window').height` 計埋
  // 導航列嗰條。硬撐成咁高,擺喺最底嘅 TabBar 就會俾導航列黑條蓋住 ——
  // 即係 Eric 見到「4 個 tab 掣俾黑條檔住」。淨係用 flex:1 跟返實際可用高度。
  container: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  content: { flex: 1 },
  screenWrap: { flex: 1 },
  hymnListModal: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  hymnListClose: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: CARD_BG_COLOR,
    borderBottomWidth: 1, borderBottomColor: DesignColors.cardLight,
  },
  hymnListCloseText: { fontSize: 16, color: TEXT_PRIMARY, marginLeft: 8 },
});