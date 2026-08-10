// 詩歌App v211 TrackPlayer — 背景播放 + Ode 主題(ODE-REBRAND-PLAN)
import { COLORS as DesignColors, TYPOGRAPHY, SPACING, effects } from './src/theme/designSystem';
import { useCachedHymns } from './src/hooks/useCachedHymns';
import Skeleton from './src/components/Skeleton';
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
import { COLORS } from './src/constants/theme';
import { FavoritesProvider, useFavorites } from './src/context/FavoritesContext';
import { PlaylistsProvider, usePlaylists } from './src/context/PlaylistsContext';
import { AddToPlaylistProvider, useAddToPlaylist } from './src/components/AddToPlaylistSheet';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import AdminAddHymnScreen from './src/screens/AdminAddHymnScreen';
import SharedPlaylistSheet from './src/screens/SharedPlaylistSheet';
import { AdminEditHymnProvider } from './src/components/AdminEditHymnSheet';
import { PlaylistProvider } from './src/context/PlaylistContext';
import { setAuthToken, pullData, pushSync, flush as flushOutbox, getOwner, setOwner, clearOutbox } from './src/sync/userSync';
import { API_BASE } from './src/config.js';
import { dailyPickBalanced } from './src/utils/dailyShuffle';
import { buildAutoplayTail, FLAVORS, poolSize } from './src/utils/autoplay';
import { getPlayLog, getRecentIds, recordPlay } from './src/playLog';
import { getAutoplayEnabled, setAutoplayEnabled, getAutoplayFlavor, setAutoplayFlavor } from './src/autoplayPrefs';
import { useInsets } from './src/hooks/useInsets';
import { getDisplayTitle } from './src/utils/displayTitle';
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
const VIDEO_HEIGHT = SCREEN_WIDTH * 9 / 16;

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
function toTrack(song) {
  return {
    id: String(song.id),
    url: `${API_BASE}/api/stream/${song.id}`,
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

// ===== Fallback Hymns =====
const FALLBACK_HYMNS = [
  { id: 1, title: '恩典太美麗', artist: 'ACM', youtube_id: 'JlTb0Sf7xUg', lang: '粵語' },
  { id: 2, title: '這一生最美的祝福', artist: '讚美之泉', youtube_id: 'tPf7Ig1ebL4', lang: '國語' },
  { id: 3, title: '我要向高山舉目', artist: '玻璃海', youtube_id: 'HfE3WNcdDTk', lang: '粵語' },
  { id: 4, title: '日光之上', artist: 'ACM', youtube_id: 'QTyqM_zFrJw', lang: '粵語' },
  { id: 5, title: 'THE WAY (全碟)', artist: 'ACM', youtube_id: '2lE3bNC8neE', lang: '粵語' },
  { id: 6, title: '耶和華是我的倚靠', artist: '粵語詩歌站', youtube_id: 'o_sm7zTzNRY', lang: '粵語' },
  { id: 7, title: '深深愛祢', artist: '讚美之泉', youtube_id: 'JlTb0Sf7xUg', lang: '國語' },
  { id: 8, title: '有一位神', artist: 'ACM', youtube_id: 'tPf7Ig1ebL4', lang: '粵語' },
  { id: 9, title: '將天敞開', artist: '讚美之泉', youtube_id: 'HfE3WNcdDTk', lang: '國語' },
  { id: 10, title: '祢的愛不離不棄', artist: '生命河靈糧堂', youtube_id: 'QTyqM_zFrJw', lang: '國語' },
  { id: 11, title: '我心頌揚', artist: 'ACM', youtube_id: '2lE3bNC8neE', lang: '粵語' },
  { id: 12, title: '勝過這世界', artist: '讚美之泉', youtube_id: 'o_sm7zTzNRY', lang: '國語' },
  { id: 13, title: '從心合一', artist: '讚美之泉', youtube_id: 'JlTb0Sf7xUg', lang: '國語' },
  { id: 14, title: '主的喜樂是我力量', artist: '讚美之泉', youtube_id: 'HfE3WNcdDTk', lang: '國語' },
  { id: 15, title: '復興聖潔', artist: '讚美之泉', youtube_id: 'tPf7Ig1ebL4', lang: '國語' },
];


// 統一去 useInsets(唯一來源)。之前呢度自己一套 fallback(android 硬寫 20),
// 三鍵導航列實際係 48dp,所以 tab 掣同 collapsed sheet 都會俾導航列食咗一截。
function useBottomInset() {
  return useInsets().bottom;
}

async function fetchWithTimeout(url, ms = 8000) {
  // Promise.race approach avoids AbortController compatibility issues
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function safeFetchHymnDetail(id) {
  try { const r = await fetchWithTimeout(`${API_BASE}/api/hymns/${id}`); if (!r.ok) return null; return (await r.json())?.data || null; }
  catch (e) { return null; }
}
async function safeFetchAllHymns() {
  try { const r = await fetchWithTimeout(`${API_BASE}/api/hymns`); if (!r.ok) return []; const d = (await r.json())?.data || r; return Array.isArray(d) ? d : []; }
  catch (e) { return []; }
}

// ================================================================
//  GLOBAL PLAYER CONTEXT
// ================================================================
const PlayerCtx = createContext();

function PlayerProvider({ children }) {
  const [currentHymn, setCurrentHymn] = useState(null);
  const [hymn, setHymn] = useState(null);
  const [hymns, setHymns] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPercent, setSeekPercent] = useState(0);
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
      await TrackPlayer.add(newQ.map(toTrack));
      // Restore position BEFORE resuming. play() must be the last action here:
      // seeking right after play() left the player stalled at 0:00 (the queue
      // was correct but playback sat paused).
      if (position > 1) { try { await TrackPlayer.seekTo(position); } catch (_) {} }
      if (wasPlaying) { try { await TrackPlayer.play(); } catch (_) {} }
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
  const [queueReady, setQueueReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const progressRef = useRef(null);
  const currentQueueIndexRef = useRef(0);
  const playLogTimerRef = useRef(null); // §3a:30 秒「算一次播放」計時器
  const repeatModeRef = useRef(0);
  const isShuffledRef = useRef(false);
  const errorSkipCountRef = useRef(0); // §3.7 — consecutive PlaybackError count
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
  // BUG2 P0 — 單曲載入失敗嘅輕量非阻擋提示(唔用會擋住成個畫面嘅白色系統
  // Alert)。noticeTimerRef 用嚟蓋過上一個未完嘅計時器,唔會提早收咗新嗰句。
  const [noticeText, setNoticeText] = useState(null);
  const noticeTimerRef = useRef(null);
  const showNotice = useCallback((msg) => {
    setNoticeText(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNoticeText(null), 2800);
  }, []);

  // Lazy TrackPlayer initialization — runs on first play, not on mount
  const playerReadyRef = useRef(false);
  const optionsAppliedRef = useRef(false);
  const initInFlightRef = useRef(null);

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
        await TrackPlayer.setupPlayer({ waitForBuffer: true });
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

  const onOverlayLayout = useCallback((e) => {
    const h = e?.nativeEvent?.layout?.height;
    if (!h || Math.abs(h - overlayHRef.current) < 1) return;
    overlayHRef.current = h;
    // 淨係喺「收埋 + 冇動畫行緊」先重設,唔係會將開緊嘅播放器推走。
    if (!isAnimatingRef.current && !overlayExpanded) drawerAnim.setValue(h);
  }, [drawerAnim, overlayExpanded]);

  const showPlayer = useCallback(() => {
    if (overlayExpanded || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setOverlayExpanded(true);
    drawerAnim.setValue(overlayHRef.current);
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      isAnimatingRef.current = false;
    });
    // Sync track state immediately so overlay shows correct icon
    TrackPlayer.getPlaybackState().then(s => {
      const val = typeof s === 'object' && s != null ? s.state : s;
      if (val != null) setTrackState(val);
    }).catch(() => {});
  }, [overlayExpanded, drawerAnim]);

  const hidePlayer = useCallback(() => {
    if (!overlayExpanded || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    Animated.timing(drawerAnim, {
      toValue: overlayHRef.current,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setOverlayExpanded(false);
      isAnimatingRef.current = false;
    });
  }, [overlayExpanded, drawerAnim]);

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // TrackPlayer init is now lazy — no eager setupPlayer on mount
  const playerInitRef = useRef(false);
  // setQueueReady is handled by lazyEnsurePlayer at first play
  useEffect(() => {
    // queueReady starts as false; lazy init sets it when player is ready
    return () => {};
  }, []);

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
        setTrackState(val);
        // playQueue() (§3.2) leaves isLoading true until audio is actually
        // audible, rather than clearing it right after TrackPlayer.play()
        // resolves — this is what clears it.
        if (val === TPState.Playing) {
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
        currentQueueIndexRef.current = idx;
        setCurrentQueueIndex(idx);
        const song = queueRef.current[idx];
        if (song) { setHymn(song); setCurrentHymn(song); }
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
          await TrackPlayer.pause().catch(() => {});
          Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
          errorSkipCountRef.current = 0;
          return;
        }
        // BUG2(c)P0 — 單首歌失敗唔好再用會擋住成個畫面嘅白色系統 Alert,
        // 改用輕量、非阻擋、自動消失嘅提示。
        showNotice('呢首歌暫時載入唔到，跳去下一首');
        try { await TrackPlayer.skipToNext(); } catch (e) { /* queue tail, repeat off — nothing to skip to */ }
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
        await TrackPlayer.pause().catch(() => {});
        errorSkipCountRef.current = 0;
        pendingPlaybackNoticeRef.current = '背景播放中斷：連續多首歌載入唔到，已暫停';
        return;
      }
      try { await TrackPlayer.skipToNext(); } catch (e) { /* queue tail, repeat off — nothing to skip to */ }
    });

    return () => {
      unsubscribe.remove();
      unsubscribeTrack.remove();
      unsubscribeError.remove();
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
      const toHymn = async (t) => {
        const found = lib.find((h) => String(h.id) === String(t.id));
        if (found) return found;
        const yt = typeof t.artwork === 'string' ? (t.artwork.match(/\/vi\/([^/]+)\//)?.[1] || '') : '';
        const detail = await safeFetchHymnDetail(t.id);
        if (detail) return detail;
        return { id: Number(t.id) || t.id, title: t.title || '', artist: t.artist || '', youtube_id: yt, lyrics: '' };
      };
      const rebuilt = await Promise.all(q.map(toHymn));
      queueRef.current = rebuilt;
      setQueue(rebuilt);
      const idx = typeof idxRaw === 'number' && idxRaw >= 0 ? idxRaw : 0;
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

  // Progress — poll TrackPlayer.getProgress() directly instead of useProgress hook
  // This avoids the hook being mounted before TrackPlayer is ready
  useEffect(() => {
    if (!queueReady) return;
    let mounted = true;
    
    async function poll() {
      while (mounted) {
        try {
          const progress = await TrackPlayer.getProgress();
          if (mounted) {
            setCurrentTime(progress.position || 0);
            // B14 修 —— toggleShuffle 會 reset()+add() 成個 native queue,呢 1 秒
            // poll 窗口入面有陣時 getProgress() 會短暫報 duration:0(隊列啱啱重
            // 起,新 metadata 未到手),之前直接 setDuration(0) 就即刻喺 UI 度
            // 睇到「總長 0:00 + 進度條彈返 0%」,自我修正返都要等成隻歌重新
            // buffer(§3.6 註解提過嘅代價)。呢個 0 淨係短暫、唔係真值,唔應該
            // 覆蓋一個已知嘅正確長度 —— 淨係喺攞到正數先更新,0/undefined 就
            // 保留返上一個已知值,唔會喺 UI 度出現「肯定係假」嘅 0:00。
            if (progress.duration > 0) setDuration(progress.duration);
          }
        } catch (e) {
          // TrackPlayer not ready yet, skip
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    poll();
    
    return () => { mounted = false; };
  }, [queueReady]);

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

  // Determine playback mode: 'audio' (TrackPlayer background) or 'video' (YouTube foreground)
  // Currently all hymns are audio-only; video mode is reserved for future YouTube-based playback
  function getPlayMode(s) {
    // Video mode: song has mode='video' flag (not yet implemented in data model)
    if (s && s.mode === 'video') return 'video';
    return 'audio';
  }

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
        if (rest.length) await TrackPlayer.add(rest.map(toTrack));
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
      if (rest.length) await TrackPlayer.add(rest.map(toTrack));
      const newQ = [...head, ...tail];
      queueRef.current = newQ; setQueue(newQ);
      setAutoRadioFrom(tail.length ? headLen : null);
    } catch (e) { console.warn('rebuildTail error:', e?.message); }
  }


  async function playQueue(list, startIndex = 0, opts = {}) {
    if (!Array.isArray(list) || list.length === 0) return;
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
      await lazyEnsurePlayer();
      await TrackPlayer.reset();
      await TrackPlayer.add(finalList.map(toTrack));
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
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
    await TrackPlayer.play();
  }
  async function cmd_pause() {
    await TrackPlayer.pause();
  }
  function togglePlayPause() {
    isPlaying ? cmd_pause() : cmd_play();
  }

  // §3.5 — tap an item in the currently-playing queue: skip within it,
  // don't reset/rebuild (that's what playQueue() is for, for a new list).
  async function skipToQueueIndex(idx) {
    if (typeof idx !== 'number' || idx < 0) return;
    try {
      await TrackPlayer.skip(idx);
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
  async function handleNextTrack() {
    try {
      await TrackPlayer.skipToNext();
    } catch (e) {
      // Queue tail with repeat off — matches notification-bar behavior (no-op)
      if (repeatModeRef.current === 1) {
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
      }
    }
  }

  async function handlePrevTrack() {
    try {
      const { position } = await TrackPlayer.getProgress();
      if (position > 3) { await TrackPlayer.seekTo(0); return; } // standard UX: >3s in, prev = restart
    } catch (e) {}
    try {
      await TrackPlayer.skipToPrevious();
    } catch (e) {
      await TrackPlayer.seekTo(0); // queue head — restart instead
    }
  }

  function handleSeekRelease() {
    if (!isSeeking || !duration) { setIsSeeking(false); return; }
    const target = seekPercent * duration;
    setCurrentTime(target);
    TrackPlayer.seekTo(target).catch(() => {});
    setIsSeeking(false);
  }

  function handleProgressBarPress(evt) {
    if (!duration) return;
    const x = evt.nativeEvent.locationX;
    if (typeof x !== 'number') return;
    const target = (x / (SCREEN_WIDTH - 40)) * duration;
    setCurrentTime(target);
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
      isPlaying, currentTime, duration,
      repeatMode, isShuffled, setIsShuffled,
      currentQueueIndex, setCurrentQueueIndex, queue,
      overlayExpanded, queueReady, isLoading, getPlayMode,
      playQueue, playSingle, autoRadioFrom, insertBoundary,
      cmd_play, cmd_pause, togglePlayPause,
      skipToQueueIndex, reorderQueue, handleNextTrack, handlePrevTrack,
      autoplayEnabled, autoplayFlavor, applyAutoplayEnabled, applyAutoplayFlavor,
      setCurrentTime, setDuration,
      setSeekPercent, setIsSeeking, setRepeatMode,
      handleSeekRelease, handleProgressBarPress,
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
        <View pointerEvents="none" style={noticeStyles.wrap}>
          <View style={noticeStyles.pill}>
            <Text style={noticeStyles.text} numberOfLines={2}>{noticeText}</Text>
          </View>
        </View>
      )}
    </PlayerCtx.Provider>
  );
}
const noticeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: (StatusBar.currentHeight || 44) + 12, left: 16, right: 16,
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
// 舊 tab 畫面(Category / Playlist / Favorites / Search)已由上面新畫面取代。
// 檔案暫時保留喺 src/screens/ 未刪(等 Phase 3 收尾一次過清 legacy;
// SearchScreen.js + services/searchApi.js 同樣唔再 import,一齊等清)。

// ================================================================
//  HOME SCREEN
// ================================================================
function HomeScreen({ hymns, loading, activeCategory, onCategoryChange, onPlayHymn, onOpenAuth, onOpenList }) {
  const homeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header — Ode 品牌 + 通知 + 頭像 */}
      <View style={[hs.header, { paddingTop: (homeInsets.top || StatusBar.currentHeight || 24) + 8 }]}>
        <View style={hs.brandWrap}>
          <Image source={require('./assets/logo-ring.png')} style={hs.brandIconImg} />
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
    backgroundColor: COLORS.cardBg,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  // ODE-HANDOFF §1/§3:header logo 環 52dp,「ode」32px Sora 200 letterSpacing 1.5,全小寫
  brandIconImg: {
    width: 52,
    height: 52,
    marginRight: 13,
    resizeMode: 'contain',
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

function FullScreenPlayerOverlay() {
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
  const lyricsStanzas = formatLyricsStanzas(cur.lyrics);
  // BUG3(c) P0(Eric 實測)—— 自動播放關咗 + 播緊 queue 最後一首,⏭ 之前係
  // 冇 disabled 狀態嘅死掣(撳落去 TrackPlayer.skipToNext() 靜靜哋失敗,冇反應)。
  // repeatMode===1(repeat-all)會 wrap 返轉頭,所以呢種情況仲係「有嘢跳」。
  const hasNext = player.repeatMode === 1 || (player.currentQueueIndex ?? 0) < queue.length - 1;
  const progressPercent = player.duration > 0 ? Math.min((player.currentTime / player.duration) * 100, 100) : 0;
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
          <Image source={require('./assets/logo-ring.png')} style={fsStyles.topBarBrandImg} />
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
            <Text style={fsStyles.loadingText}>正在載入音訊...</Text>
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
        <View style={fsStyles.progressSection}>
          <TouchableOpacity style={fsStyles.progressBarTouchArea} onPress={(e) => { player.handleProgressBarPress(e); }}>
            <View style={fsStyles.progressBarBg}>
              <View style={[fsStyles.progressBarFill, { width: `${progressPercent}%` }]}>
                <View style={fsStyles.progressBarThumb} />
              </View>
            </View>
          </TouchableOpacity>
          <View style={fsStyles.timeRow}>
            <Text style={fsStyles.timeText}>{player.formatTime(player.currentTime)}</Text>
            <Text style={fsStyles.timeText}>{player.formatTime(player.duration)}</Text>
          </View>
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
          <TouchableOpacity style={fsStyles.controlBtn} onPress={() => player.setRepeatMode?.((player.repeatMode + 1) % 3)} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              {/* odeIcons.js repeat note:單曲循環(repeatMode===2)= 同一個 repeat
                  icon 中間疊一個 Sora 200「1」,唔另畫新 icon。 */}
              <View>
                <OdeIcon
                  name="repeat"
                  size={32}
                  color={player.repeatMode > 0 ? GLOW_COLOR : 'rgba(255,255,255,0.6)'}
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
                寫落 DB 嗰陣已經分好,呢度只係跟住個結構畫返出嚟。 */}
            {lyricsStanzas.length > 0 ? (
              lyricsStanzas.map((lines, i) => (
                <View key={i} style={{ marginBottom: i < lyricsStanzas.length - 1 ? 28 : 0 }}>
                  {lines.map((line, j) => (
                    <Text key={j} style={TYPOGRAPHY.lyrics}>{line}</Text>
                  ))}
                </View>
              ))
            ) : (
              <Text style={{ ...TYPOGRAPHY.body, color: TEXT_SECONDARY }}>暫無歌詞</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // queue sheet 自訂 handle 個 grabber(取代 gorhom default handleIndicator)
  queueHandleBar: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: TEXT_SECONDARY, marginTop: 8, marginBottom: 6 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  pillButton: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 999, marginHorizontal: 2 },
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
  dismissIcon: { fontSize: 16, color: TEXT_PRIMARY },
  // ODE-HANDOFF §1:播放器頂 title = logo 環 22dp + 「ode」17px(Sora 200)
  topBarBrand: { flexDirection: 'row', alignItems: 'center' },
  topBarBrandImg: { width: 22, height: 22, marginRight: 7, resizeMode: 'contain' },
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
  coverFallbackIcon: { fontSize: 80, opacity: 0.6 },
  equalizerContainer: { position: 'absolute', bottom: 16, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  equalizerBar: { width: 5, backgroundColor: GLOW_COLOR, borderRadius: 2 },
  equalizerBar1: { height: 18 },
  equalizerBar2: { height: 28 },
  equalizerBar3: { height: 14 },
  equalizerBar4: { height: 22 },
  songInfo: { paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
  songTitle: { fontSize: 24, fontWeight: '800', color: TEXT_PRIMARY },
  songArtist: { fontSize: 16, color: TEXT_SECONDARY, marginTop: 6 },
  progressSection: { paddingHorizontal: 28, paddingVertical: 4 },
  progressBarTouchArea: { height: 36, justifyContent: 'center' },
  progressBarBg: { height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3 },
  progressBarFill: { height: 5, backgroundColor: GLOW_COLOR, borderRadius: 3 },
  progressBarThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: GLOW_COLOR, position: 'absolute', right: -7, top: '50%', marginTop: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 12, color: TEXT_SECONDARY },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  controlBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  // BUG3(c) — ⏭ 冇嘢跳嗰陣唔再係死掣,dim 落嚟同 pillDisabled(opacity: 0.45)睇齊。
  controlBtnDisabled: { opacity: 0.45 },
  ctrlIconShuffle: { fontSize: 32, color: TEXT_SECONDARY },
  ctrlIconPrev: { fontSize: 32, color: TEXT_PRIMARY },
  ctrlIconNext: { fontSize: 32, color: TEXT_PRIMARY },
  ctrlIconActive: { color: GLOW_COLOR },
  ctrlActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GLOW_COLOR, marginTop: 3 },
  // 單曲循環:repeat icon 中間疊個 Sora 200「1」(odeIcons.js repeat note)
  repeatOneBadge: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    textAlign: 'center', textAlignVertical: 'center',
    fontFamily: 'Sora-ExtraLight', fontWeight: '200', fontSize: 13, color: GLOW_COLOR,
  },
  playBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: GLOW_COLOR,
    justifyContent: 'center', alignItems: 'center',
    ...effects.playGlow, // F3(b):播放器主掣暖光外發光(ODE-HANDOFF §3)
  },
  playBtnIcon: { fontSize: 24, color: TEXT_ON_GLOW, marginLeft: 2 },
  handleBar: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 8 },
  sheetHandleRow: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginRight: 8 },
  // native Modal bottom-sheet 外殼(手尾修正 v228,取代 gorhom)
  // 「正在隨機播放：」分隔線 —— 用戶揀嘅歌 vs 系統自動接落去嘅歌之間嗰條界。
  radioDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  radioDividerLine: { flex: 1, height: 1, backgroundColor: DesignColors.border },
  radioDividerText: { color: GLOW_COLOR, fontSize: 13, fontWeight: '600' },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 8 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: TEXT_SECONDARY, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
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
  sheetCount: { fontSize: 12, color: TEXT_SECONDARY, fontWeight: '500' },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  queueItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  queueItemDragging: { backgroundColor: CARD_BG_COLOR, borderRadius: 10 },
  dragHandleLeft: { paddingRight: 10, paddingVertical: 4 }, // §Eric #4:喺最左
  rowAct: { paddingHorizontal: 8, paddingVertical: 4 },
  queueCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: DesignColors.cardLight, ...effects.coverInset },
  queueInfo: { flex: 1, marginLeft: 10 },
  queueTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  queueArtist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  queueDragIcon: { fontSize: 18, color: TEXT_SECONDARY, paddingLeft: 8 },
  queuePlayingIcon: { fontSize: 14, color: GLOW_COLOR, paddingLeft: 8, fontWeight: 'bold' },
  lyricsContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: MAIN_BG_COLOR, zIndex: 100 },
  lyricsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: (StatusBar.currentHeight || 44) + 12, paddingBottom: 12 },
  lyricsTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  lyricsClose: { fontSize: 20, color: TEXT_SECONDARY, padding: 8 },
  lyricsScroll: { flex: 1, paddingHorizontal: 20 },
  lyricsBody: { fontSize: 16, color: TEXT_PRIMARY, lineHeight: 28, paddingBottom: 40 },
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
        const favIds = (favoritesRef.current || []).map((f) => f.id);
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
      setHymns(allSongs);
    }
  }, [allSongs]);

  // §3a PERF-FAST-START-PLAN:開 App 熱身 ping —— 預先找數 DNS+TLS+tunnel 握手,
  // 第一下撳歌慳 ~0.3-0.5s。fire-and-forget。
  useEffect(() => {
    fetch(`${API_BASE}/api/health`).catch(() => {});
  }, []);

  // §3b①:歌單一 load 好就預熱「今日為你預備」6 首(同 HomeScreen 個算法
  // 一致),令開 App 後頭幾下撳落去都係 warm。只做一次。
  // 2026-07-29 QUEUE-UX-4FIXES §4/§7-3:「繼續收聽」已剷,呢度唔再預熱嗰首。
  const bootWarmedRef = useRef(false);
  useEffect(() => {
    if (bootWarmedRef.current || !allSongs?.length) return;
    bootWarmedRef.current = true;
    const ids = [];
    try {
      const featured = allSongs.filter((h) => h.featured === 1);
      const pool = featured.length >= 6 ? featured : allSongs;
      for (const p of dailyPickBalanced(pool, 'today', 6, ['粵語', '國語', '英文'])) ids.push(p.id);
    } catch (_) {}
    warmIds(ids);
  }, [allSongs]);

  async function handlePlayHymn(h, opts = {}) {
    if (!h) return;
    if (opts.mode === 'video') {
      Linking.openURL(`https://www.youtube.com/watch?v=${h.youtube_id}`);
      return;
    }
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
      playQueue(list, idx, { appendAutoplayTail: !!opts.appendAutoplayTail, browseTap: !!opts.browseTap });
    } else {
      // 隨機接續一律由**全庫**抽,唔用 opts.playlist 做 pool ——「今日為你預備」
      // 之類得 6 首,攞嚟做 pool 就得 5 首尾巴,太短。全庫抽先夠似 Spotify。
      // (副作用:舊 caller 傳落嚟嘅 `playlist` 喺呢條路徑會被忽略,呢個係有意嘅。)
      playSingle(h, allSongs || FALLBACK_HYMNS);
    }
    showPlayer();
  }
  function handleOpenFullScreen() { showPlayer(); }

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
      {!__DEV__ ? <ApkUpdateBanner /> : null}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab}
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
    <AuthProvider><AdminEditHymnProvider><FavoritesProvider><PlaylistsProvider><AddToPlaylistProvider><PlayerProvider><PlaylistProvider>
      <AppContent />
    </PlaylistProvider></PlayerProvider></AddToPlaylistProvider></PlaylistsProvider></FavoritesProvider></AdminEditHymnProvider></AuthProvider>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hymnListModal: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  hymnListClose: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: CARD_BG_COLOR,
    borderBottomWidth: 1, borderBottomColor: DesignColors.cardLight,
  },
  hymnListCloseText: { fontSize: 16, color: TEXT_PRIMARY, marginLeft: 8 },
  loadingText: { color: TEXT_SECONDARY, marginTop: 16, fontSize: 15 },
});