// 詩歌App v211 TrackPlayer — 背景播放 + 生命樹主題
import { COLORS as DesignColors, TYPOGRAPHY, SPACING } from './src/theme/designSystem';
import { useCachedHymns } from './src/hooks/useCachedHymns';
import Skeleton from './src/components/Skeleton';
import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import TrackPlayer, {
  State as TPState,
  Event as TPEvent,
  RepeatMode as TPRepeatMode,
  Capability as TPCapability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Image, Platform, Alert,
  Modal, Dimensions, FlatList, Animated, Linking, Share, BackHandler,
} from 'react-native';
import { COLORS } from './src/constants/theme';
import { FavoritesProvider, useFavorites } from './src/context/FavoritesContext';
import { PlaylistsProvider, usePlaylists } from './src/context/PlaylistsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import { PlaylistProvider } from './src/context/PlaylistContext';
import { API_BASE } from './src/config.js';
import { saveLastPlayed } from './src/lastPlayed';
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
// ⚠️ sheet **入面**啲掣要用 gorhom 自己嗰個 TouchableOpacity(SheetTouchable)。
// RN 內置嘅 TouchableOpacity 用舊 responder 系統,喺 gesture-handler 嘅手勢區域入面
// 喺 Android 上會俾 pan gesture 搶咗個 touch,撳落去時好時壞。gorhom 個版本係
// gesture-handler 實現,同 sheet 嘅拖曳手勢正常協調。
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  TouchableOpacity as SheetTouchable,
} from '@gorhom/bottom-sheet';

// ===== MaterialIcons 圖標名稱 =====

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

// ===== 「生命樹」色板 (REDESIGN-PLAN.md §5.2) =====
// 呢五個常數散落用咗 60+ 次,所以唔逐個改,直接指返單一色板 —— 全部一次過轉色。
// 舊值:黑底 #000000 + Spotify 綠 #1ED760(§5.2 明確要求同 Spotify 綠講拜拜,
// 因為佢令個 App 睇落似 Spotify 翻版,同「安靜、屬靈陪伴」嘅定位相沖)。
const MAIN_BG_COLOR = DesignColors.background;
const CARD_BG_COLOR = DesignColors.card;
const ACCENT_COLOR = DesignColors.accent;   // 生命綠
const GOLD_COLOR = DesignColors.gold;       // 【只限金句/精選】
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
    title: song.title || 'Unknown',
    artist: song.artist || '',
    artwork: getAlbumCoverUrl(song.youtube_id),
  };
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
        <MaterialIcons name="music-note" size={Math.max(16, size * 0.45)} color={TEXT_SECONDARY} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} onError={() => setFailed(true)} />;
}

// ===== 播放頁大封面 =====
// tier 0 = maxresdefault(1280x720 高清 16:9),1 = mqdefault(320x180 16:9),2 = 向量 fallback。
// 兩個 tier 都係 16:9 無黑邊;maxres 有時 404 就 onError 降到 mq。全部 resizeMode cover。
function BigCover({ youtubeId }) {
  const [tier, setTier] = useState(0);
  useEffect(() => { setTier(0); }, [youtubeId]);
  if (!youtubeId || tier >= 2) {
    return (
      <View style={fsStyles.coverFallback}>
        <MaterialIcons name="music-note" size={90} color={TEXT_SECONDARY} />
      </View>
    );
  }
  const uri = tier === 0 ? getAlbumCoverUrlHi(youtubeId) : getAlbumCoverUrl(youtubeId);
  return (
    <Image
      source={{ uri }}
      style={fsStyles.coverImg}
      resizeMode="cover"
      onError={() => setTier((t) => t + 1)}
    />
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


function useBottomInset() {
  const safe = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : null;
  if (safe?.bottom) return safe.bottom;
  if (Platform.OS === 'android') return 20;
  return Platform.OS === 'ios' ? 34 : 0;
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
      // 唔好留條線喺個完全唔同嘅位度呃人。
      setAutoRadioFrom(null);
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
  const repeatModeRef = useRef(0);
  const isShuffledRef = useRef(false);
  const errorSkipCountRef = useRef(0); // §3.7 — consecutive PlaybackError count

  // Lazy TrackPlayer initialization — runs on first play, not on mount
  const playerReadyRef = useRef(false);
  const lazyEnsurePlayer = useCallback(async () => {
    if (playerReadyRef.current) return;
    playerReadyRef.current = true;
    try {
      await TrackPlayer.setupPlayer({ waitForBuffer: true });
    } catch (e) {
      console.warn('setupPlayer (ignored):', e?.message);
    }
    try {
      await TrackPlayer.updateOptions({
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
        icon: require('./assets/icon.png'),
        // §3.2 — keep playing when the user swipes the app away from recents
        android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
      });
    } catch (e) {
      console.warn('updateOptions (ignored):', e?.message);
    }
    setQueueReady(true);
  }, []);

  // 同步 ref 俾 event handler 用
  repeatModeRef.current = repeatMode;
  isShuffledRef.current = isShuffled;
  queueRef.current = queue;

  // ===== 物理抽屜動畫 (slide-up/slide-down) =====
  const [overlayExpanded, setOverlayExpanded] = useState(false);
  const drawerAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const isAnimatingRef = useRef(false);

  const showPlayer = useCallback(() => {
    if (overlayExpanded || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setOverlayExpanded(true);
    drawerAnim.setValue(SCREEN_HEIGHT);
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
      toValue: SCREEN_HEIGHT,
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
      } catch (e) {}
    });

    // §3.7 — auto-skip on a failed track (dead link, etc), with a circuit
    // breaker so a long dead-link run doesn't silently skip forever.
    const unsubscribeError = TrackPlayer.addEventListener(TPEvent.PlaybackError, async (event) => {
      console.error('[PlaybackError]', event?.code || '', event?.message || 'Unknown error');
      errorSkipCountRef.current += 1;
      if (errorSkipCountRef.current >= 5) {
        await TrackPlayer.pause().catch(() => {});
        Alert.alert('播放中斷', '連續幾首歌都載入唔到，請檢查網絡或者稍後再試');
        errorSkipCountRef.current = 0;
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
            setDuration(progress.duration || 0);
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
  const RADIO_LEN = 30;
  const [autoRadioFrom, setAutoRadioFrom] = useState(null); // queue 由邊個 index 開始係自動接續
  async function playSingle(hymn, pool) {
    if (!hymn) return;
    const src = Array.isArray(pool) && pool.length ? pool : (queueRef.current || []);
    const rest = src.filter(s => String(s.id) !== String(hymn.id));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const list = [hymn, ...rest.slice(0, RADIO_LEN)];
    // 冇嘢可以接(個 pool 得嗰首歌)就當普通單曲播,唔好畫條冇意思嘅分隔線。
    await playQueue(list, 0, { autoRadioFrom: list.length > 1 ? 1 : null });
  }

  async function playQueue(list, startIndex = 0, opts = {}) {
    if (!Array.isArray(list) || list.length === 0) return;
    setAutoRadioFrom(opts.autoRadioFrom ?? null);
    setIsLoading(true);
    // Set the ref synchronously alongside the state (same reason as
    // toggleShuffle): TrackPlayer events fire during the add/play below and
    // PlaybackActiveTrackChanged reads queueRef.current directly to look up the
    // song. A setQueue() alone wouldn't land until the next render, so an early
    // event could read a stale queue and show the wrong title.
    queueRef.current = list;
    setQueue(list);
    originalQueueRef.current = list;
    setIsShuffled(false);
    saveLastPlayed(list[startIndex] || list[0]); // §2.3 繼續收聽
    try {
      await lazyEnsurePlayer();
      await TrackPlayer.reset();
      await TrackPlayer.add(list.map(toTrack));
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
      await TrackPlayer.play();
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
      playQueue, playSingle, autoRadioFrom,
      cmd_play, cmd_pause, togglePlayPause,
      skipToQueueIndex, handleNextTrack, handlePrevTrack,
      setCurrentTime, setDuration,
      setSeekPercent, setIsSeeking, setRepeatMode,
      handleSeekRelease, handleProgressBarPress,
      formatTime, currentQueueIndexRef,
      showPlayer, hidePlayer, toggleShuffle,
    }}>
      {children}

      {/* Fullscreen player overlay — always mounted, animated slide-up */}
      <Animated.View style={[olStyles.overlay, { transform: [{ translateY: drawerAnim }] }]}>
        {(overlayExpanded) && <FullScreenPlayerOverlay />}
      </Animated.View>
    </PlayerCtx.Provider>
  );
}
export function usePlayer() {
  return useContext(PlayerCtx) || {};
}

const olStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: MAIN_BG_COLOR, zIndex: 999,
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
            <Text style={miStyles.title} numberOfLines={1}>{currentHymn.title}</Text>
            <Text style={miStyles.artist} numberOfLines={1}>{currentHymn.artist}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.favBtn} onPress={(e) => { e.stopPropagation(); toggleFavorite(currentHymn); }} activeOpacity={0.7}>
          <MaterialIcons name={fav ? 'favorite' : 'favorite-border'} size={24} color={fav ? ACCENT_COLOR : TEXT_PRIMARY} />
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.playBtn} onPress={(e) => { e.stopPropagation(); togglePlayPause(); }} activeOpacity={0.8}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={20} color={MAIN_BG_COLOR} />
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
  cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: DesignColors.cardLight },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  artist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 1 },
  mainTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  favBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: TEXT_PRIMARY, justifyContent: 'center', alignItems: 'center' },
});

// ================================================================
//  TAB BAR
// ================================================================
// §2.2 六格減到四格。舊版係 首頁/搜尋/分類/清單/最愛/播放 —— 六個掣太密、易撳錯,
// 而且六樣嘢擺埋一齊冇主次。合併邏輯:
//   搜尋 + 分類  -> 「搜尋」  (本質都係「搵歌」)
//   清單 + 最愛 + 帳戶 + 設定 -> 「我的」
//   新增「詩歌庫」(全部詩歌)
//   「播放」唔再佔一格 —— 撳迷你播放條就向上展開,係全世界音樂 App 嘅標準做法
// §5.4:圖標一律用向量圖標庫,唔用 Emoji(舊版 tab 用緊 🏠🔍📚📋❤️)
const TAB_CONFIG = [
  { key: 'Home',    label: '首頁',   icon: 'home',          iconOff: 'home' },
  { key: 'Search',  label: '搜尋',   icon: 'search',        iconOff: 'search' },
  { key: 'Library', label: '詩歌庫', icon: 'library-music', iconOff: 'library-music' },
  { key: 'Mine',    label: '我的',   icon: 'person',        iconOff: 'person-outline' },
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
              <MaterialIcons
                name={active ? tab.icon : tab.iconOff}
                size={24}
                color={active ? ACCENT_COLOR : TEXT_SECONDARY}
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
  labelActive: { color: ACCENT_COLOR, fontWeight: '700' },
});

// ===== 各 tab 畫面 =====
import HomeSections from './src/components/home/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import HymnListScreen from './src/screens/HymnListScreen';
import LibraryScreen from './src/screens/LibraryScreen'; // §2.2 詩歌庫(新)
import MineScreen from './src/screens/MineScreen';        // §2.2 我的(新,合併 最愛+清單+帳戶)
// 舊 tab 畫面(Category / Playlist / Favorites)已由上面兩個新畫面取代 —— §2.2 六格減四格。
// 檔案暫時保留喺 src/screens/ 未刪(等 Phase 3 收尾一次過清 legacy)。

// ================================================================
//  HOME SCREEN
// ================================================================
function HomeScreen({ hymns, activeCategory, onCategoryChange, onPlayHymn, onOpenAuth, onOpenList }) {
  const homeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  const { user } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header — 生命樹品牌 + 通知 + 頭像 */}
      <View style={[hs.header, { paddingTop: (homeInsets.top || StatusBar.currentHeight || 24) + 8 }]}>
        <View style={hs.brandWrap}>
          {/* §5.4 唔用 Emoji;生命樹 = 向量樹圖標,用生命綠 */}
          <MaterialIcons name="park" size={26} color={ACCENT_COLOR} style={{ marginRight: 10 }} />
          <View>
            <Text style={hs.brandTitle}>生命樹</Text>
            <Text style={hs.brandSub}>Etz Chayim</Text>
          </View>
        </View>
        <View style={hs.iconWrap}>
          <TouchableOpacity style={hs.iconBtn}>
            <MaterialIcons name="notifications-none" size={24} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={hs.avatarBtn} onPress={onOpenAuth}>
            {user ? (
              <Text style={hs.avatarText}>{(user.username || '?').charAt(0).toUpperCase()}</Text>
            ) : (
              <MaterialIcons name="person-outline" size={20} color={TEXT_PRIMARY} />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <HomeSections hymns={hymns} onPlayHymn={onPlayHymn} onOpenList={onOpenList} />
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
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  brandSub: {
    fontSize: 11,
    color: COLORS.secondary,
    marginTop: 1,
  },
  iconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DesignColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: MAIN_BG_COLOR,
  },
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
const ADD_SNAP_POINTS = ['55%'];

function FullScreenPlayerOverlay() {
  const insets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0, bottom: 0 };
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
  const addSheetRef = useRef(null);
  // mount 咗先可以 present;所以「開」= setAddMounted(true),gorhom 自己
  // 由 index 0 animate 上嚟(index={0} + animateOnMount default true)。
  const [addMounted, setAddMounted] = useState(false);
  const openAddSheet = useCallback(() => setAddMounted(true), []);
  const closeAddSheet = useCallback(() => addSheetRef.current?.close(), []);

  // 有 sheet 開緊嗰陣,Android 返回鍵應該係「收 sheet」而唔係「收埋成個播放器」。
  // queue sheet:index 1 = 全開先叫「開」(index 0 係常駐 collapsed,唔算)。
  // add sheet:index -1 = 收埋完,順手 unmount。
  const queueOpenRef = useRef(false);
  const addOpenRef = useRef(false);
  const [anySheetOpen, setAnySheetOpen] = useState(false);
  const syncSheetOpen = useCallback(() => {
    setAnySheetOpen(queueOpenRef.current || addOpenRef.current);
  }, []);
  const onQueueChange = useCallback((i) => {
    queueOpenRef.current = i >= 1;
    setQueueExpanded(i >= 1);
    syncSheetOpen();
  }, [syncSheetOpen]);
  const onAddChange = useCallback((i) => {
    addOpenRef.current = i >= 0;
    // 收埋完就 unmount,唔好留個 absoluteFill container 喺度擋住 queue sheet。
    if (i < 0) setAddMounted(false);
    syncSheetOpen();
  }, [syncSheetOpen]);

  useEffect(() => {
    if (!anySheetOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // add sheet 喺 queue sheet 上面,有佢就先收佢。
      if (addOpenRef.current) closeAddSheet();
      else if (queueOpenRef.current) closeQueue();
      return true; // 食咗個返回鍵,唔好傳落去收埋播放器
    });
    return () => sub.remove();
  }, [anySheetOpen, closeQueue, closeAddSheet]);

  // add sheet 嘅 backdrop:收埋(-1)之後完全唔食 touch。
  const renderBackdrop = useCallback((props) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
  ), []);
  // queue sheet 嘅 backdrop:collapsed(index 0)嗰陣**唔可以**有遮罩,
  // 唔係就會擋死下面成個播放器啲掣。全開(index 1)先出,撳一下收返 collapsed。
  const renderQueueBackdrop = useCallback((props) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={1} disappearsOnIndex={0} pressBehavior="collapse" />
  ), []);

  const cur = player.currentHymn || { title: '', artist: '', youtube_id: '', id: null, lyrics: '' };
  const progressPercent = player.duration > 0 ? Math.min((player.currentTime / player.duration) * 100, 100) : 0;
  const bottomPad = (insets?.bottom || 20) + 8;
  const safeTop = (insets?.top || StatusBar.currentHeight || 24) + 8;

  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { addToPlaylist } = usePlaylists();

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
          <MaterialIcons name="keyboard-arrow-down" size={24} color={TEXT_PRIMARY} />
        </TouchableOpacity>
        <Text style={fsStyles.topBarTitle}>生命樹</Text>
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
      </View>

      {/* Loading overlay */}
      {player.isLoading && (
        <View style={fsStyles.loadingOverlay}>
          <ActivityIndicator size="large" color={ACCENT_COLOR} />
          <Text style={fsStyles.loadingText}>正在載入音訊...</Text>
        </View>
      )}

      {/* Controls + Playlist button */}
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 8 }}>
        <View style={fsStyles.songInfo}>
          <Text style={[{ ...TYPOGRAPHY.title, color: TEXT_PRIMARY, textAlign: 'center' }]} numberOfLines={2}>{cur.title}</Text>
          <Text style={[{ ...TYPOGRAPHY.artist, textAlign: 'center', marginTop: 4 }]}>{cur.artist}</Text>
        </View>

        {/* Action Bar — 4 粒獨立 pill(§3.4 / Eric 2026-07 指定順序):
            最愛 / 歌詞 / 分享 / 清單。膠囊形、向量圖標(§5.4 唔用 Emoji)。
            歌詞冇 data 就 disabled 灰咗,唔俾個掣呃人(§3.4)。 */}
        {(() => {
          const faved = isFavorite(cur.id);
          const hasLyrics = !!(cur.lyrics && String(cur.lyrics).trim());
          const pills = [
            { key: 'fav', label: '最愛', icon: faved ? 'favorite' : 'favorite-border',
              active: faved, onPress: () => toggleFavorite(cur) },
            { key: 'lyr', label: '歌詞', icon: 'lyrics', disabled: !hasLyrics,
              onPress: () => setLyricsVisible(true) },
            { key: 'shr', label: '分享', icon: 'share',
              onPress: () => Share.share({
                message: `一齊聽「${cur.title}」${cur.artist ? ' - ' + cur.artist : ''}（生命樹詩歌）`,
              }).catch(() => {}) },
            { key: 'que', label: '清單', icon: 'queue-music',
              onPress: openAddSheet },
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
                  <MaterialIcons
                    name={p.icon}
                    size={20}
                    color={p.disabled ? DesignColors.border : (p.active ? ACCENT_COLOR : TEXT_PRIMARY)}
                  />
                  <Text style={[fsStyles.pillLabel, p.active && { color: ACCENT_COLOR }, p.disabled && { color: TEXT_SECONDARY }]}>
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
              <MaterialIcons name="shuffle" size={32} color={player.isShuffled ? ACCENT_COLOR : TEXT_SECONDARY} />
              {player.isShuffled && <View style={fsStyles.ctrlActiveDot} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={player.handlePrevTrack} activeOpacity={0.6}>
            <MaterialIcons name="skip-previous" size={32} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.playBtn} onPress={player.togglePlayPause} activeOpacity={0.8}>
            <MaterialIcons name={player.isPlaying ? 'pause' : 'play-arrow'} size={24} color={MAIN_BG_COLOR} />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={player.handleNextTrack} activeOpacity={0.6}>
            <MaterialIcons name="skip-next" size={32} color={TEXT_PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={() => player.setRepeatMode?.((player.repeatMode + 1) % 3)} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons
                name={player.repeatMode === 2 ? 'repeat-one' : 'repeat'}
                size={32}
                style={{ color: player.repeatMode > 0 ? ACCENT_COLOR : 'rgba(255,255,255,0.6)' }}
              />
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
        onChange={onQueueChange}
        backdropComponent={renderQueueBackdrop}
        backgroundStyle={{ backgroundColor: MAIN_BG_COLOR }}
        handleIndicatorStyle={{ backgroundColor: TEXT_SECONDARY }}
      >
        {/* Collapsed 狀態見到嘅就係呢行 —— 撳佢 = 全開(同向上滑一樣效果)。 */}
        <SheetTouchable
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 10 }}
          onPress={queueExpanded ? closeQueue : openQueue}
        >
          <MaterialIcons
            name={queueExpanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
            size={18} color={TEXT_SECONDARY} style={{ marginRight: 6 }}
          />
          <Text style={{ ...TYPOGRAPHY.sectionTitle }}>播放清單 ({queue.length})</Text>
        </SheetTouchable>
        {/* Shuffle indicator —— 個 list 本身就係洗咗牌嘅順序,冇呢個提示分唔出 */}
        {player.isShuffled && (
          <View style={[fsStyles.shuffleBanner, { marginBottom: 8, alignSelf: 'center' }]}>
            <MaterialIcons name="shuffle" size={14} color={ACCENT_COLOR} />
            <Text style={fsStyles.shuffleBannerText}>已隨機排序</Text>
          </View>
        )}
        <BottomSheetFlatList
          data={queue}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <>
              {/* §「單曲 + 自動隨機接續」:由呢個 index 開始係系統自動接落去嘅歌,
                  唔係用戶揀嘅清單。畫條線講明白,唔好扮到係佢自己揀嘅。 */}
              {index === player.autoRadioFrom && (
                <View style={fsStyles.radioDivider}>
                  <View style={fsStyles.radioDividerLine} />
                  <MaterialIcons name="shuffle" size={14} color={ACCENT_COLOR} style={{ marginHorizontal: 8 }} />
                  <Text style={fsStyles.radioDividerText}>正在隨機播放：</Text>
                  <View style={fsStyles.radioDividerLine} />
                </View>
              )}
              <SheetTouchable style={[fsStyles.queueItem, item.id === cur.id && fsStyles.queueItemActive]}
                onPress={() => { player.skipToQueueIndex(queue.findIndex(h => h.id === item.id)); closeQueue(); }} activeOpacity={0.7}>
                <CoverImage youtubeId={item.youtube_id} style={fsStyles.queueCover} />
                <View style={fsStyles.queueInfo}>
                  <Text style={fsStyles.queueTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={fsStyles.queueArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                {item.id === cur.id
                  ? <MaterialIcons name="play-arrow" size={18} color={ACCENT_COLOR} />
                  : <MaterialIcons name="queue-music" size={18} color={TEXT_SECONDARY} />}
              </SheetTouchable>
            </>
          )}
        />
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
              <MaterialIcons name="lyrics" size={20} color={ACCENT_COLOR} />
              <Text style={{ ...TYPOGRAPHY.sectionTitle, marginLeft: 8 }}>歌詞</Text>
            </View>
            <TouchableOpacity onPress={() => setLyricsVisible(false)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={24} color={TEXT_SECONDARY} />
            </TouchableOpacity>
          </View>
          {/* 歌名 + 歌手做副標 */}
          <Text style={{ ...TYPOGRAPHY.songTitle, marginBottom: 2 }} numberOfLines={1}>{cur.title}</Text>
          <Text style={{ ...TYPOGRAPHY.artist, marginBottom: 16 }} numberOfLines={1}>{cur.artist || ''}</Text>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* §5.3 歌詞行距 1.7x;冇歌詞唔呃人 */}
            <Text style={cur.lyrics && String(cur.lyrics).trim() ? TYPOGRAPHY.lyrics : { ...TYPOGRAPHY.body, color: TEXT_SECONDARY }}>
              {(cur.lyrics && String(cur.lyrics).trim()) || '暫無歌詞'}
            </Text>
          </ScrollView>
        </View>
      </Modal>

      {/* 加入到清單 bottom sheet(v231:**用到先 mount**)。
          之前係一直 mount 住 index={-1},即係佢個 absoluteFill hosting container
          永遠疊喺 queue sheet 上面 —— queue sheet 露出嘅嗰條邊就係俾佢擋住,
          先至會「有手柄嗰個滑到、冇手柄嗰個滑唔到」。呢個 sheet 係撳掣先開嘅
          對話框,冇理由常駐,收埋就直接 unmount,零殘留。 */}
      {addMounted && (
      <BottomSheet
        ref={addSheetRef}
        index={0}
        snapPoints={ADD_SNAP_POINTS}
        enableDynamicSizing={false}
        enablePanDownToClose
        onChange={onAddChange}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: CARD_BG_COLOR }}
        handleIndicatorStyle={{ backgroundColor: TEXT_SECONDARY }}
      >
        <Text style={{ color: TEXT_PRIMARY, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 12 }}>加入到清單</Text>
        {/* 最愛 —— 金色記號(屬靈重點) */}
        <SheetTouchable
          onPress={() => { toggleFavorite(cur); closeAddSheet(); }}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DesignColors.border }}
        >
          <MaterialIcons name="favorite" size={20} color={GOLD_COLOR} />
          <Text style={{ color: GOLD_COLOR, marginLeft: 10, fontSize: 15, fontWeight: '600' }}>最愛清單</Text>
        </SheetTouchable>
        <BottomSheetFlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <Text style={{ color: TEXT_SECONDARY, paddingHorizontal: 20, paddingVertical: 16 }}>仲未有其他清單</Text>
          }
          renderItem={({ item }) => (
            <SheetTouchable onPress={() => { addToPlaylist(item.id, cur); closeAddSheet(); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
              <MaterialIcons name="queue-music" size={20} color={TEXT_SECONDARY} />
              <Text style={{ color: TEXT_PRIMARY, marginLeft: 10, fontSize: 15 }} numberOfLines={1}>{item.title}</Text>
            </SheetTouchable>
          )}
        />
      </BottomSheet>
      )}
    </View>
  );
}

const fsStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  topBarTitle: { fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY },
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
  equalizerBar: { width: 5, backgroundColor: ACCENT_COLOR, borderRadius: 2 },
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
  progressBarFill: { height: 5, backgroundColor: ACCENT_COLOR, borderRadius: 3 },
  progressBarThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT_COLOR, position: 'absolute', right: -7, top: '50%', marginTop: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 12, color: TEXT_SECONDARY },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  controlBtn: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  ctrlIconShuffle: { fontSize: 32, color: TEXT_SECONDARY },
  ctrlIconPrev: { fontSize: 32, color: TEXT_PRIMARY },
  ctrlIconNext: { fontSize: 32, color: TEXT_PRIMARY },
  ctrlIconActive: { color: ACCENT_COLOR },
  ctrlActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT_COLOR, marginTop: 3 },
  playBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: TEXT_PRIMARY, justifyContent: 'center', alignItems: 'center' },
  playBtnIcon: { fontSize: 24, color: MAIN_BG_COLOR, marginLeft: 2 },
  handleBar: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 8 },
  sheetHandleRow: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginRight: 8 },
  // native Modal bottom-sheet 外殼(手尾修正 v228,取代 gorhom)
  // 「正在隨機播放：」分隔線 —— 用戶揀嘅歌 vs 系統自動接落去嘅歌之間嗰條界。
  radioDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  radioDividerLine: { flex: 1, height: 1, backgroundColor: DesignColors.border },
  radioDividerText: { color: ACCENT_COLOR, fontSize: 13, fontWeight: '600' },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 8 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: TEXT_SECONDARY, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  shuffleBanner: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: 'rgba(30,215,96,0.12)',
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 8,
  },
  shuffleBannerText: { fontSize: 12, fontWeight: '600', color: ACCENT_COLOR, marginLeft: 5 },
  sheetCount: { fontSize: 12, color: TEXT_SECONDARY, fontWeight: '500' },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  queueItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  queueCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: DesignColors.cardLight },
  queueInfo: { flex: 1, marginLeft: 10 },
  queueTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  queueArtist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  queueDragIcon: { fontSize: 18, color: TEXT_SECONDARY, paddingLeft: 8 },
  queuePlayingIcon: { fontSize: 14, color: ACCENT_COLOR, paddingLeft: 8, fontWeight: 'bold' },
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
function AppContent() {
  const { hymns, setHymns, playQueue, playSingle, showPlayer, queueReady, isPlaying: debugPlaying, currentHymn: debugHymn, togglePlayPause: debugToggle } = usePlayer();
  const { hymns: allSongs, loading } = useCachedHymns();
  const bottomInset = useBottomInset();
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeTab, setActiveTab] = useState('Home');
  const [authVisible, setAuthVisible] = useState(false);
  const [hymnListVisible, setHymnListVisible] = useState(false);

  const openAuth = useCallback(() => setAuthVisible(true), []);
  const closeAuth = useCallback(() => setAuthVisible(false), []);
  const [hymnListData, setHymnListData] = useState({ hymns: [], title: '' });

  const showHymnList = (hymns, title) => {
    setHymnListData({ hymns, title });
    setHymnListVisible(true);
  };

  const closeHymnList = () => {
    setHymnListVisible(false);
  };

  // Hymns loaded via useCachedHymns (MMKV cache + background refresh)
  // When fresh data arrives, update PlayerProvider's hymns
  useEffect(() => {
    if (allSongs && allSongs.length > 0) {
      setHymns(allSongs);
    }
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
      playQueue(list, idx);
    } else {
      // 隨機接續一律由**全庫**抽,唔用 opts.playlist 做 pool ——「今日為你預備」
      // 之類得 6 首,攞嚟做 pool 就得 5 首尾巴,太短。全庫抽先夠似 Spotify。
      // (副作用:舊 caller 傳落嚟嘅 `playlist` 喺呢條路徑會被忽略,呢個係有意嘅。)
      playSingle(h, allSongs || FALLBACK_HYMNS);
    }
    showPlayer();
  }
  function handleOpenFullScreen() { showPlayer(); }

  return (
    <View style={pageStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />



      <View style={pageStyles.content}>
        {/* 四 tab(§2.2):首頁 / 搜尋 / 詩歌庫 / 我的。全部 keep mount,靠 display 收埋
            以保留各自 scroll/state。 */}
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Home' ? 'flex' : 'none' }]}>
          <HomeScreen hymns={allSongs || []} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} onPlayHymn={handlePlayHymn} onOpenAuth={openAuth}
            onOpenList={showHymnList} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Search' ? 'flex' : 'none' }]}>
          <SearchScreen navigation={{ navigate: (route, params) => {
            if (route === 'Player' && params?.hymn) handlePlayHymn(params.hymn);
          }}} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Library' ? 'flex' : 'none' }]}>
          <LibraryScreen hymns={allSongs || []} onPlayHymn={handlePlayHymn} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Mine' ? 'flex' : 'none' }]}>
          <MineScreen onPlayHymn={handlePlayHymn} onOpenAuth={openAuth} />
        </View>
      </View>

      {/* Auth Modal */}
      {authVisible && (
        <Modal visible animationType="slide" onRequestClose={closeAuth}>
          <AuthScreen onClose={closeAuth} />
        </Modal>
      )}

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
            style={pageStyles.hymnListClose}
            onPress={closeHymnList}
          >
            <Text style={pageStyles.hymnListCloseText}>返回</Text>
          </TouchableOpacity>
          <HymnListScreen
            hymns={hymnListData.hymns}
            title={hymnListData.title}
            onPlayHymn={(hymn) => {
              const idx = Math.max(0, hymnListData.hymns.findIndex(s => s.id === hymn.id));
              playQueue(hymnListData.hymns, idx);
              showPlayer();
              closeHymnList();
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

// ===== App Entry =====
export default function App() {
  // GestureHandlerRootView 一定要包最外 —— gorhom 嘅拖曳手勢靠佢。
  // 兩個 sheet 用 inline `<BottomSheet>`(唔經 portal),所以**故意唔加**
  // BottomSheetModalProvider:加返佢就會走返 v228 嗰條 portal 路,個 hosting
  // container 冇 zIndex,又會俾 zIndex:999 嘅播放器 overlay 蓋住。詳見檔頭註解。
  const tree = (
    <AuthProvider><FavoritesProvider><PlaylistsProvider><PlayerProvider><PlaylistProvider>
      <AppContent />
    </PlaylistProvider></PlayerProvider></PlaylistsProvider></FavoritesProvider></AuthProvider>
  );
  const inner = SafeAreaProvider ? <SafeAreaProvider>{tree}</SafeAreaProvider> : tree;
  return <GestureHandlerRootView style={{ flex: 1 }}>{inner}</GestureHandlerRootView>;
}

const pageStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  content: { flex: 1 },
  screenWrap: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hymnListModal: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  hymnListClose: { padding: 16, backgroundColor: CARD_BG_COLOR, borderBottomWidth: 1, borderBottomColor: DesignColors.cardLight },
  hymnListCloseText: { fontSize: 16, color: TEXT_PRIMARY },
  loadingText: { color: TEXT_SECONDARY, marginTop: 16, fontSize: 15 },
});