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
  Modal, Dimensions, FlatList, Animated, PanResponder, Linking,
} from 'react-native';
import { COLORS } from './src/constants/theme';
import { FavoritesProvider, useFavorites } from './src/context/FavoritesContext';
import { PlaylistsProvider, usePlaylists } from './src/context/PlaylistsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import { PlaylistProvider } from './src/context/PlaylistContext';
import { API_BASE } from './src/config.js';

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

// ===== 黑色主調（Rolex 綠只做 accent） =====
const MAIN_BG_COLOR = '#000000';
const CARD_BG_COLOR = '#1A1A1A';
const ACCENT_COLOR = '#1ED760';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#A0A0A0';

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
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
function CoverImage({ youtubeId, style, fallbackStyle, fallbackIcon }) {
  const [failed, setFailed] = useState(false);
  const uri = getAlbumCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={[{
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center', alignItems: 'center',
      }, style]}>
        <Text style={[{ fontSize: 24, opacity: 0.6 }, fallbackIcon]}>{fallbackIcon || '🎵'}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} onError={() => setFailed(true)} />;
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
  // §3.6 — real shuffle: reorder the actual upcoming TrackPlayer queue rather
  // than picking randomly at each transition. Only ever uses
  // removeUpcomingTracks() + add() — never a bulk remove-by-index (removing
  // ~1500 tracks by index array is what silently failed before, leaving the
  // original order playing). Tracks already played (before the active one) are
  // left in place as history; the shuffle pool excludes them to avoid dupes.
  const toggleShuffle = useCallback(async () => {
    try {
      const activeIdx = await TrackPlayer.getActiveTrackIndex();
      const q = queueRef.current;
      if (activeIdx == null || activeIdx < 0 || !q.length) { setIsShuffled(s => !s); return; }
      const head = q.slice(0, activeIdx + 1); // history + current, kept as-is

      if (!isShuffledRef.current) {
        // On: shuffle everything not already queued up to the current track.
        const played = new Set(head.map(s => String(s.id)));
        const pool = q.filter(s => !played.has(String(s.id)));
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const newQ = [...head, ...pool];
        // Update the ref synchronously — the remove/add below can fire
        // PlaybackActiveTrackChanged, whose handler reads queueRef.current
        // directly (setQueue alone wouldn't land until the next render).
        queueRef.current = newQ;
        setQueue(newQ);
        await TrackPlayer.removeUpcomingTracks();
        if (pool.length) await TrackPlayer.add(pool.map(toTrack));
        setIsShuffled(true);
      } else {
        // Off: restore original order for everything after the current track.
        const orig = originalQueueRef.current || q;
        const curId = String(q[activeIdx].id);
        const origIdx = Math.max(0, orig.findIndex(s => String(s.id) === curId));
        const after = orig.slice(origIdx + 1);
        const newQ = [...head, ...after];
        queueRef.current = newQ;
        setQueue(newQ);
        await TrackPlayer.removeUpcomingTracks();
        if (after.length) await TrackPlayer.add(after.map(toTrack));
        setIsShuffled(false);
      }
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
        if (val === TPState.Playing) setIsLoading(false);
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
        // §3.7 — a real track change means playback is healthy again.
        errorSkipCountRef.current = 0;
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
  async function playQueue(list, startIndex = 0) {
    if (!Array.isArray(list) || list.length === 0) return;
    setIsLoading(true);
    setQueue(list);
    originalQueueRef.current = list;
    setIsShuffled(false);
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
      playQueue, cmd_play, cmd_pause, togglePlayPause,
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
          <CoverImage youtubeId={currentHymn.youtube_id} style={miStyles.cover} fallbackIcon="🎵" />
          <View style={miStyles.info}>
            <Text style={miStyles.title} numberOfLines={1}>{currentHymn.title}</Text>
            <Text style={miStyles.artist} numberOfLines={1}>{currentHymn.artist}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.favBtn} onPress={(e) => { e.stopPropagation(); toggleFavorite(currentHymn); }} activeOpacity={0.7}>
          <MaterialIcons name={fav ? 'favorite' : 'favorite-border'} size={24} color={fav ? '#1ED760' : '#FFFFFF'} />
        </TouchableOpacity>
        <TouchableOpacity style={miStyles.playBtn} onPress={(e) => { e.stopPropagation(); togglePlayPause(); }} activeOpacity={0.8}>
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={20} color="#000000" />
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
  cover: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#161F19' },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  artist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 1 },
  mainTouch: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  favBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
});

// ================================================================
//  TAB BAR
// ================================================================
const TAB_CONFIG = [
  { key: 'Home', label: '首頁', emoji: '🏠' },
  { key: 'Search', label: '搜尋', emoji: '🔍' },
  { key: 'Category', label: '分類', emoji: '📚' },
  { key: 'Playlist', label: '清單', emoji: '📋' },
  { key: 'Favorites', label: '最愛', emoji: '❤️' },
];
function TabBar({ activeTab, onTabChange, bottomInset, onMiniPlayerPress }) {
  const { currentHymn } = usePlayer();
  const safePad = Math.max(bottomInset || 0, 4);
  return (
    <View style={[tbStyles.wrapper, { paddingBottom: safePad + 8 }]}>
      <View style={tbStyles.miniWrap}>
        <MiniPlayer onPress={onMiniPlayerPress} />
      </View>
      <View style={tbStyles.miniWrapSpacer} />
      <View style={tbStyles.bar}>
        {TAB_CONFIG.map(tab => (
          <TouchableOpacity key={tab.key} style={tbStyles.item} onPress={() => onTabChange(tab.key)}>
            <Text style={tbStyles.icon}>{tab.emoji}</Text>
            <Text style={[tbStyles.label, activeTab === tab.key && tbStyles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={tbStyles.item} onPress={() => onMiniPlayerPress()}>
          <MaterialIcons name="play-circle-outline" size={22} color={TEXT_SECONDARY} />
          <Text style={tbStyles.label}>播放</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const tbStyles = StyleSheet.create({
  wrapper: { backgroundColor: MAIN_BG_COLOR },
  miniWrap: { },
  miniWrapSpacer: { height: 4 },
  bar: { flexDirection: 'row', backgroundColor: MAIN_BG_COLOR, paddingTop: 4, paddingBottom: 4 },
  item: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  icon: { fontSize: 18 },
  label: { fontSize: 10, color: TEXT_SECONDARY, marginTop: 2, fontWeight: '500' },
  labelActive: { color: TEXT_PRIMARY, fontWeight: '700' },
});

// ===== 引入新 Home 10 區塊元件 =====
import HomeSections from './src/components/home/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import CategoryScreen from './src/screens/CategoryScreen';
import HymnListScreen from './src/screens/HymnListScreen';
import PlaylistScreen from './src/screens/PlaylistScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';

// ================================================================
//  HOME SCREEN
// ================================================================
function HomeScreen({ hymns, activeCategory, onCategoryChange, onPlayHymn, onOpenAuth }) {
  const homeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  const { user } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header — 生命樹品牌 + 通知 + 頭像 */}
      <View style={[hs.header, { paddingTop: (homeInsets.top || StatusBar.currentHeight || 24) + 8 }]}>
        <View style={hs.brandWrap}>
          <Text style={hs.brandIcon}>🌳</Text>
          <View>
            <Text style={hs.brandTitle}>生命樹</Text>
            <Text style={hs.brandSub}>Etz Chayim</Text>
          </View>
        </View>
        <View style={hs.iconWrap}>
          <TouchableOpacity style={hs.iconBtn}>
            <MaterialIcons name="notifications-none" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={hs.avatarBtn} onPress={onOpenAuth}>
            {user ? (
              <Text style={hs.avatarText}>{(user.username || '?').charAt(0).toUpperCase()}</Text>
            ) : (
              <MaterialIcons name="person-outline" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <HomeSections
        navigation={{
          navigate: (route, params) => {
            if (route === 'Category') onCategoryChange(params?.category);
            if (params?.hymn) onPlayHymn(params.hymn);
          },
        }}
        onPlayHymn={onPlayHymn}
      />
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
    backgroundColor: '#006039',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
});

// ================================================================
//  FULL SCREEN PLAYER OVERLAY — TrackPlayer 版（無 YouTube Iframe）
// ================================================================
function FullScreenPlayerOverlay() {
  const insets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0, bottom: 0 };
  const player = usePlayer();

  const queue = player.queue || [];
  const [isPlaylistVisible, setIsPlaylistVisible] = useState(false);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const sheetPanY = useRef(new Animated.Value(0)).current;
  const sheetPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10,
    onPanResponderMove: Animated.event([null, { dy: sheetPanY }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 100) {
        setShowPlaylistSheet(false);
      }
      Animated.timing(sheetPanY, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    },
  })).current;

  const cur = player.currentHymn || { title: '', artist: '', youtube_id: '', id: null, lyrics: '' };
  const progressPercent = player.duration > 0 ? Math.min((player.currentTime / player.duration) * 100, 100) : 0;
  const bottomPad = (insets?.bottom || 20) + 8;
  const safeTop = (insets?.top || StatusBar.currentHeight || 24) + 8;

  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { addToPlaylist } = usePlaylists();

  return (
    <View style={[fsStyles.container, { paddingBottom: bottomPad }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Top Bar */}
      <View style={[fsStyles.topBar, { paddingTop: safeTop }]}>
        <TouchableOpacity style={fsStyles.dismissBtn} onPress={player.hidePlayer}>
          <MaterialIcons name="keyboard-arrow-down" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={fsStyles.topBarTitle}>生命樹</Text>
        <View style={fsStyles.dismissBtn} />
      </View>

      {/* Album Art */}
      <View style={fsStyles.coverWrap}>
        {cur.youtube_id ? (
          <Image
            source={{ uri: getAlbumCoverUrl(cur.youtube_id) }}
            style={fsStyles.coverImg}
            onError={() => {}}
          />
        ) : (
          <View style={fsStyles.coverFallback}>
            <Text style={fsStyles.coverFallbackIcon}>🎵</Text>
          </View>
        )}
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

        {/* Action Bar — long pill segmented bar */}
        <View style={{ flexDirection: 'row', backgroundColor: '#1F2925', marginHorizontal: 16, borderRadius: 999, padding: 6, marginBottom: 16 }}>
          <TouchableOpacity style={fsStyles.pillButton} onPress={() => toggleFavorite(cur)}>
            <Text style={{ fontSize: 20 }}>❤️</Text>
            <Text style={{ fontSize: 11, color: '#9AA696' }}>最愛</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.pillButton} onPress={() => alert('歌詞')}>
            <Text style={{ fontSize: 20 }}>📝</Text>
            <Text style={{ fontSize: 11, color: '#9AA696' }}>歌詞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.pillButton} onPress={() => alert('分享')}>
            <Text style={{ fontSize: 20 }}>🔗</Text>
            <Text style={{ fontSize: 11, color: '#9AA696' }}>分享</Text>
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.pillButton} onPress={() => setShowPlaylistSheet(true)}>
            <Text style={{ fontSize: 20 }}>📋</Text>
            <Text style={{ fontSize: 11, color: '#9AA696' }}>清單</Text>
          </TouchableOpacity>
        </View>
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
            <MaterialIcons name="skip-previous" size={32} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.playBtn} onPress={player.togglePlayPause} activeOpacity={0.8}>
            <MaterialIcons name={player.isPlaying ? 'pause' : 'play-arrow'} size={24} color="#000000" />
          </TouchableOpacity>
          <TouchableOpacity style={fsStyles.controlBtn} onPress={player.handleNextTrack} activeOpacity={0.6}>
            <MaterialIcons name="skip-next" size={32} color="#FFFFFF" />
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

        {/* 📋 Playlist button — opens full-screen Modal */}
        <TouchableOpacity style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          paddingVertical: 14, marginHorizontal: 20, marginTop: 4,
          backgroundColor: CARD_BG_COLOR, borderRadius: 16,
        }} activeOpacity={0.7} onPress={() => setIsPlaylistVisible(true)}>
          <Text style={fsStyles.sheetTitle}>📋 播放清單 ({queue.length})</Text>
        </TouchableOpacity>
      </View>

      {/* ===== NATIVE MODAL: Playlist ===== */}
      <Modal
        visible={isPlaylistVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsPlaylistVisible(false)}
      >
        <View style={{
          flex: 1, backgroundColor: MAIN_BG_COLOR, paddingTop: safeTop,
        }}>
          {/* Modal header */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 16, paddingBottom: 12,
          }}>
            <TouchableOpacity onPress={() => setIsPlaylistVisible(false)} style={{ padding: 4 }}>
              <MaterialIcons name="keyboard-arrow-down" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '600', color: TEXT_PRIMARY }}>📋 播放清單</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* FlatList — 100% scrollable inside Modal */}
          <FlatList
            data={queue}
            keyExtractor={item => String(item.id)}
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={true}
            renderItem={({ item }) => (
              <TouchableOpacity style={[fsStyles.queueItem, item.id === cur.id && fsStyles.queueItemActive]}
                onPress={() => { player.skipToQueueIndex(queue.findIndex(h => h.id === item.id)); setIsPlaylistVisible(false); }} activeOpacity={0.7}>
                <CoverImage youtubeId={item.youtube_id} style={fsStyles.queueCover} fallbackIcon="🎵" />
                <View style={fsStyles.queueInfo}>
                  <Text style={fsStyles.queueTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={fsStyles.queueArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                {item.id === cur.id ? (
                  <MaterialIcons name="play-arrow" size={16} color={ACCENT_COLOR} />
                ) : (
                  <MaterialIcons name="queue-music" size={18} color={TEXT_SECONDARY} />
                )}
              </TouchableOpacity>
            )}
            scrollEnabled={true}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>

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
            <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>📄 歌詞</Text>
            <TouchableOpacity onPress={() => setLyricsVisible(false)} style={{ padding: 4 }}>
              <Text style={{ fontSize: 20, color: TEXT_SECONDARY }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: TEXT_PRIMARY, lineHeight: 28 }}>{cur.lyrics || '暫無歌詞'}</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Lyrics button at bottom */}
      <TouchableOpacity
        onPress={() => setLyricsVisible(true)}
        style={{
          position: 'absolute', bottom: bottomPad + 50, right: 20,
          paddingVertical: 8, paddingHorizontal: 16,
          backgroundColor: 'rgba(30,215,96,0.15)', borderRadius: 20,
          borderWidth: 1, borderColor: ACCENT_COLOR,
        }}
      >
        <Text style={{ fontSize: 13, color: ACCENT_COLOR, fontWeight: '600' }}>📄 歌詞</Text>
      </TouchableOpacity>

      {/* Bottom Sheet for adding to playlists */}
      <Modal visible={showPlaylistSheet} animationType="slide" transparent onRequestClose={() => setShowPlaylistSheet(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
          <Animated.View style={{ backgroundColor: '#121A17', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', transform: [{ translateY: sheetPanY }] }}>
            {/* Drag Handle */}
            <View {...sheetPanResponder.panHandlers} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#555' }} />
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600', padding: 20 }}>加入到清單</Text>

            {/* 最愛 */}
            <TouchableOpacity onPress={() => { toggleFavorite(cur); setShowPlaylistSheet(false); }} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#1F2925' }}>
              <Text style={{ color: '#E8B86D' }}>❤️ 最愛清單</Text>
            </TouchableOpacity>

            {/* 其他清單 */}
            <FlatList
              data={favorites}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { addToPlaylist(item.id, cur); setShowPlaylistSheet(false); }} style={{ padding: 16 }}>
                  <Text style={{ color: '#FFFFFF' }}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity onPress={() => setShowPlaylistSheet(false)} style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#9AA696' }}>取消</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const fsStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  pillButton: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 999, marginHorizontal: 2 },
  dismissBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  dismissIcon: { fontSize: 16, color: '#FFFFFF' },
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
  ctrlIconPrev: { fontSize: 32, color: '#FFFFFF' },
  ctrlIconNext: { fontSize: 32, color: '#FFFFFF' },
  ctrlIconActive: { color: ACCENT_COLOR },
  ctrlActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT_COLOR, marginTop: 3 },
  playBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  playBtnIcon: { fontSize: 24, color: '#000000', marginLeft: 2 },
  handleBar: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 8 },
  sheetHandleRow: { flexDirection: 'row', alignItems: 'center' },
  sheetTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginRight: 8 },
  sheetCount: { fontSize: 12, color: TEXT_SECONDARY, fontWeight: '500' },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  queueItemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  queueCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#161F19' },
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
  const { hymns, setHymns, playQueue, showPlayer, queueReady, isPlaying: debugPlaying, currentHymn: debugHymn, togglePlayPause: debugToggle } = usePlayer();
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
    // §3.8 — no more reordering the list to put the tapped song first;
    // native skip(idx) keeps natural order so prev can go back further.
    const list = opts.playlist?.length ? opts.playlist : (allSongs || FALLBACK_HYMNS);
    const idx = Math.max(0, list.findIndex(s => s.id === h.id));
    playQueue(list, idx);
    showPlayer();
  }
  function handleOpenFullScreen() { showPlayer(); }

  return (
    <View style={pageStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />



      <View style={pageStyles.content}>
        {/* Keep all screens mounted; hide inactive ones to preserve state */}
        {/* Home: visible when Home tab, or other tabs without dedicated screen (Favorites/Player) */}
        <View style={[pageStyles.screenWrap, { display: (activeTab === 'Home' || (activeTab !== 'Search' && activeTab !== 'Category' && activeTab !== 'Playlist' && activeTab !== 'Favorites')) ? 'flex' : 'none' }]}>
          <HomeScreen hymns={allSongs || []} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} onPlayHymn={handlePlayHymn} onOpenAuth={openAuth} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Search' ? 'flex' : 'none' }]}>
          <SearchScreen navigation={{ navigate: (route, params) => {
            if (route === 'Player' && params?.hymn) handlePlayHymn(params.hymn);
          }}} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Category' ? 'flex' : 'none' }]}>
          <CategoryScreen showHymnList={showHymnList} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Playlist' ? 'flex' : 'none' }]}>
          <PlaylistScreen onPlayHymn={handlePlayHymn} />
        </View>
        <View style={[pageStyles.screenWrap, { display: activeTab === 'Favorites' ? 'flex' : 'none' }]}>
          <FavoritesScreen onPlayHymn={handlePlayHymn} />
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
            <Text style={pageStyles.hymnListCloseText}>✕ 返回</Text>
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
  if (SafeAreaProvider) {
    return (
      <SafeAreaProvider>
        <AuthProvider><FavoritesProvider><PlaylistsProvider><PlayerProvider><PlaylistProvider><AppContent /></PlaylistProvider></PlayerProvider></PlaylistsProvider></FavoritesProvider></AuthProvider>
      </SafeAreaProvider>
    );
  }
  return <AuthProvider><FavoritesProvider><PlaylistsProvider><PlayerProvider><PlaylistProvider><AppContent /></PlaylistProvider></PlayerProvider></PlaylistsProvider></FavoritesProvider></AuthProvider>;
}

const pageStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  content: { flex: 1 },
  screenWrap: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hymnListModal: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  hymnListClose: { padding: 16, backgroundColor: CARD_BG_COLOR, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  hymnListCloseText: { fontSize: 16, color: TEXT_PRIMARY },
  loadingText: { color: TEXT_SECONDARY, marginTop: 16, fontSize: 15 },
});