// 詩歌App v131 TrackPlayer — 背景播放 + 生命樹主題
import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import TrackPlayer, {
  State as TPState,
  Event as TPEvent,
  RepeatMode as TPRepeatMode,
  Capability as TPCapability,
} from 'react-native-track-player';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, Image, Platform, Alert,
  Modal, Dimensions, FlatList,
} from 'react-native';

// ===== MaterialIcons 圖標名稱 =====

// ===== 安全匯入 =====
let SafeAreaProvider = null, useSafeAreaInsets = null;
try {
  const sac = require('react-native-safe-area-context');
  SafeAreaProvider = sac.SafeAreaProvider;
  useSafeAreaInsets = sac.useSafeAreaInsets;
} catch (e) {}

// ===== Config =====
const API_BASE = 'http://192.168.30.45:3001';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_WIDTH * 9 / 16;

// ===== 生命樹主題色系 =====
const MAIN_BG_COLOR = '#131C16';
const CARD_BG_COLOR = '#1E2B22';
const ACCENT_COLOR = '#A8C765';
const TEXT_PRIMARY = '#F0F4E8';
const TEXT_SECONDARY = '#9AA696';

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
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
const STATIC_PLAYLIST = FALLBACK_HYMNS.concat(
  FALLBACK_HYMNS.map(h => ({...h, id: h.id + 1000})),
  FALLBACK_HYMNS.map(h => ({...h, id: h.id + 2000})),
  FALLBACK_HYMNS.map(h => ({...h, id: h.id + 3000, title: h.title + ' (copy)'}))
);

const DAILY_VERSE = { text: '應當一無掛慮，只要凡事藉著禱告、祈求和感謝，將你們所要的告訴神。', ref: '腓立比書 4:6' };
const CATEGORIES = ['全部', '平安', '讚美', '靈修', '醫治', '信心', '恩典', '復興'];

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

// ============ Audio API ============
async function fetchAudioUrl(youtubeId, showErrorAlert, retryCount = 2) {
  if (!youtubeId) return null;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Promise.race timeout instead of AbortController
      const data = await Promise.race([
        (async () => {
          const res = await fetch(`${API_BASE}/api/audio/${youtubeId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        })(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout (10s)')), 10000)
        ),
      ]);
      if (data && data.url && typeof data.url === 'string') return data.url;
      if (showErrorAlert && attempt === retryCount) Alert.alert('載入失敗', '無法取得音樂網址，請稍後再試');
    } catch (e) {
      const errMsg = `連線錯誤: ${e.message || e}`;
      console.warn(`fetchAudioUrl attempt ${attempt + 1}/${retryCount + 1}:`, errMsg);
      if (attempt < retryCount) {
        // Wait 1s before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      if (showErrorAlert) Alert.alert('網路錯誤', errMsg);
    }
  }
  return null;
}

// ================================================================
//  GLOBAL PLAYER CONTEXT
// ================================================================
const PlayerCtx = createContext();

function getQueue(hymns) {
  return Array.isArray(hymns) && hymns.length > 0 ? hymns : STATIC_PLAYLIST;
}

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
  const toggleShuffle = useCallback(() => {
    setIsShuffled(s => {
      const next = !s;
      // Reset shuffle history when toggling on
      if (next) shuffleHistoryRef.current = [currentQueueIndexRef.current];
      return next;
    });
  }, []);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [trackState, setTrackState] = useState(TPState.None);
  const [queueReady, setQueueReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const progressRef = useRef(null);
  const currentQueueIndexRef = useRef(0);
  const repeatModeRef = useRef(0);
  const isShuffledRef = useRef(false);
  const queueSnapshotRef = useRef([]);
  const shuffleHistoryRef = useRef([]); // tracks played indices for shuffle fairness

  // 同步 ref 俾 event handler 用
  repeatModeRef.current = repeatMode;
  isShuffledRef.current = isShuffled;

  // ===== 推拉門 (simple conditional, no animated transforms) =====
  const [overlayExpanded, setOverlayExpanded] = useState(false);

  const showPlayer = useCallback(() => {
    if (!overlayExpanded) {
      setOverlayExpanded(true);
      // Sync track state immediately so overlay shows correct icon
      TrackPlayer.getPlaybackState().then(s => {
        const val = typeof s === 'object' && s != null ? s.state : s;
        if (val != null) setTrackState(val);
      }).catch(() => {});
    }
  }, [overlayExpanded]);

  const hidePlayer = useCallback(() => {
    if (overlayExpanded) {
      setOverlayExpanded(false);
    }
  }, [overlayExpanded]);

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Init TrackPlayer — exactly once, no retry loop
  const playerInitRef = useRef(false);
  useEffect(() => {
    if (playerInitRef.current) return;
    playerInitRef.current = true;
    let mounted = true;
    (async () => {
      try {
        await TrackPlayer.setupPlayer({ waitForBuffer: true });
      } catch (e) {
        // Player may already be initialized via registerPlaybackService — that's OK
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
        });
      } catch (e) {
        console.warn('updateOptions (ignored):', e?.message);
      }
      if (mounted) {
        setQueueReady(true);
      }
    })();
    return () => { mounted = false; };
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
      } catch (e) {}
    });
    const unsubscribeTrack = TrackPlayer.addEventListener(TPEvent.PlaybackActiveTrackChanged, async (event) => {
      try {
        const trackIndex = await TrackPlayer.getActiveTrackIndex();
        if (typeof trackIndex === 'number' && trackIndex >= 0) {
          // ⚠️ Don't overwrite currentQueueIndexRef — changeToSong sets it
          // from the hymns array index, not TrackPlayer's queue index
          const track = await TrackPlayer.getTrack(trackIndex);
          if (track && track.title) {
            // Update current index to match the now-playing track
            const q = queueSnapshotRef.current || [];
            const newIdx = q.findIndex(h => String(h.id) === String(track.id));
            if (newIdx >= 0) {
              currentQueueIndexRef.current = newIdx;
              setCurrentQueueIndex(newIdx);
            }

            const hymnData = {
              id: track.id,
              title: track.title,
              artist: track.artist || '',
              youtube_id: track.youtubeId || track.videoId || track.originalYoutubeId || '',
            };
            setHymn(hymnData);
            setCurrentHymn(hymnData);
            
            // Track auto-advanced — pre-fetch the NEXT next track
            prefetchNextTrack();
          }
        }
      } catch (e) {}
    });
    const unsubscribeQueueEnd = TrackPlayer.addEventListener(TPEvent.PlaybackQueueEnded, async () => {
      try {
        if (repeatModeRef.current === 2) {
          // Repeat one: restart current
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        } else if (isShuffledRef.current) {
          // Shuffle: pick next unplayed from history
          const q = queueSnapshotRef.current || [];
          if (!q.length) return;
          const hist = shuffleHistoryRef.current;
          const unplayed = q.map((_, i) => i).filter(i => !hist.includes(i));
          if (unplayed.length > 0) {
            const n = unplayed[Math.floor(Math.random() * unplayed.length)];
            await changeToSong(q[n], n);
          } else if (repeatModeRef.current === 1) {
            // Repeat all: reset history and start over
            shuffleHistoryRef.current = [];
            const n = Math.floor(Math.random() * q.length);
            await changeToSong(q[n], n);
          }
        } else {
          // Normal sequential
          const q = queueSnapshotRef.current || [];
          const nextIdx = currentQueueIndexRef.current !== undefined ? currentQueueIndexRef.current + 1 : -1;
          if (q.length > 0 && nextIdx >= 0 && nextIdx < q.length) {
            await changeToSong(q[nextIdx], nextIdx);
          } else if (repeatModeRef.current === 1 && q.length > 0) {
            await changeToSong(q[0], 0);
          }
        }
      } catch (e) {}
    });

    // PlaybackError: auto-skip when a track fails to play
    const unsubscribeError = TrackPlayer.addEventListener(TPEvent.PlaybackError, async (event) => {
      try {
        const code = event?.code || '';
        const message = event?.message || 'Unknown error';
        console.error('[PlaybackError]', code, message);

        // Try to skip to next track automatically
        const q = queueSnapshotRef.current || [];
        if (q.length === 0) return;

        let nextIdx = currentQueueIndexRef.current + 1;
        if (nextIdx >= q.length) {
          if (repeatModeRef.current === 1) {
            nextIdx = 0;
          } else {
            return; // No repeat and no next track — stop
          }
        }
        const nextSong = q[nextIdx];
        if (nextSong) {
          console.log('[PlaybackError] auto-skipping to:', nextSong.title);
          await changeToSong(nextSong, nextIdx);
        }
      } catch (e) {
        console.warn('[PlaybackError] handler error:', e);
      }
    });

    return () => {
      unsubscribe.remove();
      unsubscribeTrack.remove();
      unsubscribeQueueEnd.remove();
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

  // changeToSong: load hymns into TrackPlayer, play
  // Only the active song is added to the queue with its real URL
  // Sequential play is handled by the PlaybackQueueEnded event handler
  async function changeToSong(song, queueIndex) {
    try {
      if (!song || !song.youtube_id) return;
      setIsLoading(true);
      const q = getQueue(hymns);
      let idx = typeof queueIndex === 'number' ? queueIndex : q.findIndex(h => h.id === song.id);
      if (idx < 0) idx = 0;

      currentQueueIndexRef.current = idx;
      setCurrentQueueIndex(idx);
      setCurrentTime(0);
      setDuration(0);

      // Record in shuffle history to avoid repeat
      if (isShuffledRef.current) {
        const hist = shuffleHistoryRef.current;
        if (!hist.includes(idx)) hist.push(idx);
      }
      setHymn(song);
      setCurrentHymn(song);

      // Resolve audio URL
      let audioUrl = await fetchAudioUrl(song.youtube_id, true);
      
      // 🛡️ Defense: validate URL is a real, non-empty HTTP(S) URL
      if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.startsWith('http')) {
        setIsLoading(false);
        Alert.alert('播放失敗', `無法取得音樂網址 (${song.title})，請確認後端伺服器已啟動`);
        return;
      }

      // JIT queue: only add the current song with real URL
      // Other songs are stored in queueSnapshotRef for FlatList display
      // and PlaybackQueueEnded/handleNextTrack handles sequential play
      queueSnapshotRef.current = q;
      await TrackPlayer.reset();
      await TrackPlayer.add([{
        id: song.id,
        url: audioUrl,
        title: song.title || 'Unknown',
        artist: song.artist || '',
        artwork: getAlbumCoverUrl(song.youtube_id),
        originalYoutubeId: song.youtube_id,
      }]);
      await TrackPlayer.play();
      setIsLoading(false);

      // Background pre-fetch next track for gapless playback
      prefetchNextTrack();
    } catch (e) {
    setIsLoading(false);
    console.warn('changeToSong error:', e.message || e);
    Alert.alert('播放錯誤', e.message || '無法播放此歌曲，請稍後再試');
    }
  }

  // Pre-fetch the next track's URL and add to TrackPlayer queue for gapless playback
  async function prefetchNextTrack() {
    try {
      const q = queueSnapshotRef.current || [];
      if (!q.length) return;

      let nextIdx;
      if (isShuffledRef.current) {
        // Shuffle: pick from unplayed tracks
        const hist = shuffleHistoryRef.current;
        const unplayed = q.map((_, i) => i).filter(i => !hist.includes(i));
        if (unplayed.length === 0) {
          if (repeatModeRef.current !== 1) return;
          nextIdx = q.map((_, i) => i).filter(i => i !== currentQueueIndexRef.current);
          nextIdx = nextIdx[Math.floor(Math.random() * nextIdx.length)] || 0;
        } else {
          nextIdx = unplayed[Math.floor(Math.random() * unplayed.length)];
        }
      } else {
        nextIdx = currentQueueIndexRef.current + 1;
        if (nextIdx >= q.length) {
          if (repeatModeRef.current !== 1) return;
          nextIdx = 0;
        }
      }

      const nextSong = q[nextIdx];
      if (!nextSong || !nextSong.youtube_id || nextSong.id === (currentHymn?.id)) return;

      const nextUrl = await fetchAudioUrl(nextSong.youtube_id, false);
      if (!nextUrl || typeof nextUrl !== 'string' || !nextUrl.startsWith('http')) return;

      await TrackPlayer.add([{
        id: nextSong.id,
        url: nextUrl,
        title: nextSong.title || 'Unknown',
        artist: nextSong.artist || '',
        artwork: getAlbumCoverUrl(nextSong.youtube_id),
        originalYoutubeId: nextSong.youtube_id,
      }]);
    } catch (e) {
      // Silent fail — pre-fetch is best-effort
    }
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

  async function handlePlayFromQueue(item) {
    if (!item) return;
    const q = getQueue(hymns);
    const idx = q.findIndex(h => h.id === item.id);
    if (idx >= 0) {
      await changeToSong(item, idx);
    }
  }

  async function handleNextTrack() {
    const q = getQueue(hymns);
    if (!q.length) return;
    let nextIdx;
    if (isShuffledRef.current) {
      // Shuffle: pick from unplayed tracks to avoid repeats
      const history = shuffleHistoryRef.current;
      const unplayed = q.map((_, i) => i).filter(i => !history.includes(i));
      if (unplayed.length === 0) {
        // All played — reset history if repeat-all, else stop
        if (repeatModeRef.current === 1) {
          shuffleHistoryRef.current = [currentQueueIndexRef.current];
          nextIdx = q.map((_, i) => i).filter(i => i !== currentQueueIndexRef.current);
          nextIdx = nextIdx[Math.floor(Math.random() * nextIdx.length)];
        } else {
          return; // no more songs
        }
      } else {
        nextIdx = unplayed[Math.floor(Math.random() * unplayed.length)];
      }
    } else {
      nextIdx = (currentQueueIndexRef.current + 1) % q.length;
    }
    await changeToSong(q[nextIdx], nextIdx);
  }

  async function handlePrevTrack() {
    const q = getQueue(hymns);
    if (!q.length) return;
    const prev = currentQueueIndexRef.current > 0
      ? currentQueueIndexRef.current - 1 : q.length - 1;
    await changeToSong(q[prev], prev);
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
      currentQueueIndex, setCurrentQueueIndex, queue: getQueue(hymns),
      overlayExpanded, queueReady, isLoading,
      changeToSong, cmd_play, cmd_pause, togglePlayPause,
      handlePlayFromQueue, handleNextTrack, handlePrevTrack,
      setCurrentTime, setDuration,
      setSeekPercent, setIsSeeking, setRepeatMode,
      handleSeekRelease, handleProgressBarPress,
      formatTime, currentQueueIndexRef,
      showPlayer, hidePlayer, toggleShuffle,
    }}>
      {children}

      {/* Fullscreen player overlay */}
      {overlayExpanded ? (
        <View style={olStyles.overlay}>
          <FullScreenPlayerOverlay />
        </View>
      ) : null}
    </PlayerCtx.Provider>
  );
}
function usePlayer() {
  return useContext(PlayerCtx) || {};
}

const olStyles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: MAIN_BG_COLOR, zIndex: 999,
    overflow: 'visible', // Don't clip absolute-positioned drawer below screen
  },
});

// ================================================================
//  MINI PLAYER
// ================================================================
function MiniPlayer({ onPress }) {
  const player = usePlayer();
  const { currentHymn, isPlaying, currentTime, duration, formatTime,
    togglePlayPause, handleNextTrack, handlePrevTrack,
    repeatMode, setRepeatMode, isShuffled, toggleShuffle } = player;
  if (!currentHymn?.id) return null;
  const progressPct = duration > 0 ? Math.min((currentTime/duration)*100, 100) : 0;

  return (
    <View style={miStyles.wrapper}>
      <TouchableOpacity style={miStyles.container} onPress={onPress} activeOpacity={0.9}>
        <View style={miStyles.topRow}>
          <CoverImage youtubeId={currentHymn.youtube_id} style={miStyles.cover} fallbackIcon="🎵" />
          <View style={miStyles.info}>
            <Text style={miStyles.title} numberOfLines={1}>{currentHymn.title}</Text>
            <Text style={miStyles.artist} numberOfLines={1}>{currentHymn.artist}</Text>
          </View>
        </View>

        <View style={miStyles.progressSection}>
          <View style={miStyles.progressBarTouchArea}>
            <View style={miStyles.progressBarBg}>
              <View style={[miStyles.progressBarFill, { width: `${progressPct}%` }]}>
                <View style={miStyles.progressBarThumb} />
              </View>
            </View>
          </View>
          <View style={miStyles.timeRow}>
            <Text style={miStyles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={miStyles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={miStyles.controlsRow}>
          <TouchableOpacity style={miStyles.ctrlBtn} onPress={(e) => { e.stopPropagation(); toggleShuffle(); }} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons name="shuffle" size={28} color={isShuffled ? ACCENT_COLOR : TEXT_SECONDARY} />
              {isShuffled && <View style={miStyles.ctrlActiveDot} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={miStyles.ctrlBtn} onPress={(e) => { e.stopPropagation(); handlePrevTrack(); }} activeOpacity={0.6}>
            <MaterialIcons name="skip-previous" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={miStyles.playBtn} onPress={(e) => { e.stopPropagation(); togglePlayPause(); }} activeOpacity={0.8}>
            <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={20} color="#000000" />
          </TouchableOpacity>
          <TouchableOpacity style={miStyles.ctrlBtn} onPress={(e) => { e.stopPropagation(); handleNextTrack(); }} activeOpacity={0.6}>
            <MaterialIcons name="skip-next" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={miStyles.ctrlBtn} onPress={(e) => { e.stopPropagation(); setRepeatMode?.((repeatMode + 1) % 3); }} activeOpacity={0.6}>
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons
                name={repeatMode === 2 ? 'repeat-one' : 'repeat'}
                size={28}
                style={{ color: repeatMode > 0 ? ACCENT_COLOR : 'rgba(255,255,255,0.6)' }}
              />
              {repeatMode > 0 && <View style={miStyles.ctrlActiveDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
}
const miStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 10, marginBottom: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  container: { backgroundColor: CARD_BG_COLOR, borderRadius: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cover: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#161F19' },
  info: { flex: 1, marginLeft: 12 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  artist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  progressSection: { marginBottom: 8 },
  progressBarTouchArea: { height: 24, justifyContent: 'center' },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: ACCENT_COLOR, borderRadius: 2 },
  progressBarThumb: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT_COLOR, position: 'absolute', right: -5, top: '50%', marginTop: -5 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 10, color: TEXT_SECONDARY },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  ctrlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  ctrlIcon: { fontSize: 28, color: TEXT_SECONDARY },
  ctrlIconPrev: { fontSize: 24, color: '#FFFFFF' },
  ctrlIconNext: { fontSize: 24, color: '#FFFFFF' },
  ctrlIconActive: { color: ACCENT_COLOR },
  ctrlActiveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT_COLOR, marginTop: 2 },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  playBtnIcon: { fontSize: 20, color: '#000000', marginLeft: 2 },
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
        <TouchableOpacity style={tbStyles.item} onPress={() => onTabChange('Player')}>
          <MaterialIcons name="play-circle-outline" size={22} color={TEXT_SECONDARY} />
          <Text style={[tbStyles.label, activeTab === 'Player' && tbStyles.labelActive]}>播放</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const tbStyles = StyleSheet.create({
  wrapper: { backgroundColor: MAIN_BG_COLOR },
  miniWrap: { marginBottom: 6 },
  miniWrapSpacer: { height: 8 },
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

// ================================================================
//  HOME SCREEN
// ================================================================
function HomeScreen({ hymns, activeCategory, onCategoryChange, onPlayHymn }) {
  const homeInsets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { top: 0 };
  const safeHymns = hymns || [];
  const featured = safeHymns.filter(h => h.youtube_id).slice(0, 6);
  const filtered = safeHymns.filter(h => h.youtube_id).filter(h => activeCategory === '全部' || (h.lang || h.category || '').toLowerCase().includes(activeCategory));
  return (
    <ScrollView style={hStyles.scroll} contentContainerStyle={hStyles.scrollContent}>
      {/* 🔥 10 區塊主頁 — API-driven sections */}
      <HomeSections navigation={{ navigate: (route, params) => {
        if (params?.hymn) onPlayHymn(params.hymn);
      }}} onPlayHymn={onPlayHymn} />
      <View style={[hStyles.appBar, { paddingTop: (homeInsets.top || StatusBar.currentHeight || 24) + 12 }]}>
        <View><Text style={hStyles.appBarTitle}>生命樹</Text><Text style={hStyles.appBarSub}>Etz Chayim</Text></View>
      </View>
      <TouchableOpacity style={hStyles.verseCard} activeOpacity={0.9}>
        <Text style={hStyles.verseLabel}>✝️ DAILY VERSE 每日金句</Text>
        <Text style={hStyles.verseText}>{DAILY_VERSE.text}</Text>
        <Text style={hStyles.verseRef}>— {DAILY_VERSE.ref}</Text>
      </TouchableOpacity>
      <View style={hStyles.sectionHeader}><Text style={hStyles.sectionTitle}>情境分類</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hStyles.chipContainer}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity key={cat} style={[hStyles.chip, activeCategory === cat && hStyles.chipActive]}
            onPress={() => onCategoryChange(cat)}>
            <Text style={[hStyles.chipText, activeCategory === cat && hStyles.chipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={hStyles.sectionHeader}><Text style={hStyles.sectionTitle}>🔥 推薦精選</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hStyles.featuredContainer}>
        {featured.map(h => (
          <TouchableOpacity key={h.id} style={hStyles.featuredCard} onPress={() => onPlayHymn(h)}>
            <CoverImage youtubeId={h.youtube_id} style={hStyles.featuredCover} fallbackIcon="🎵" />
            <View style={hStyles.featuredInfo}>
              <Text style={hStyles.featuredTitle} numberOfLines={1}>{h.title}</Text>
              <Text style={hStyles.featuredArtist} numberOfLines={1}>{h.artist}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={[hStyles.sectionHeader, { marginTop: 24 }]}>
        <Text style={hStyles.sectionTitle}>全部詩歌</Text>
        <Text style={{ color: TEXT_SECONDARY, fontSize: 12 }}>{safeHymns.length} 首</Text>
      </View>
      {filtered.map(h => (
        <TouchableOpacity key={h.id} style={hStyles.songItem} onPress={() => onPlayHymn(h)}>
          <CoverImage youtubeId={h.youtube_id} style={hStyles.songCover} fallbackIcon="🎵" />
          <View style={hStyles.songInfo}>
            <Text style={hStyles.songTitle} numberOfLines={1}>{h.title}</Text>
            <Text style={hStyles.songArtist} numberOfLines={1}>{h.artist}</Text>
          </View>
          <MaterialIcons name="play-arrow" size={18} color={ACCENT_COLOR} />
        </TouchableOpacity>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const hStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: MAIN_BG_COLOR },
  scrollContent: { paddingBottom: 20 },
  appBar: { paddingHorizontal: 20, paddingBottom: 12 },
  appBarTitle: { fontSize: 28, fontWeight: '800', color: TEXT_PRIMARY },
  appBarSub: { fontSize: 14, color: TEXT_SECONDARY, fontWeight: '500', marginTop: 2 },
  verseCard: { marginHorizontal: 16, padding: 16, backgroundColor: CARD_BG_COLOR, borderRadius: 16, marginBottom: 20 },
  verseLabel: { fontSize: 11, color: ACCENT_COLOR, fontWeight: '600', marginBottom: 10, letterSpacing: 1 },
  verseText: { fontSize: 17, color: TEXT_PRIMARY, lineHeight: 26, fontWeight: '500' },
  verseRef: { fontSize: 13, color: TEXT_SECONDARY, marginTop: 10, fontStyle: 'italic' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  chipContainer: { paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: CARD_BG_COLOR, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipActive: { backgroundColor: 'rgba(168,199,101,0.15)', borderColor: ACCENT_COLOR },
  chipText: { fontSize: 13, color: TEXT_SECONDARY, fontWeight: '500' },
  chipTextActive: { color: ACCENT_COLOR },
  featuredContainer: { paddingHorizontal: 16, gap: 12 },
  featuredCard: { width: 160 },
  featuredCover: { width: 160, height: 90, borderRadius: 12, backgroundColor: '#161F19' },
  featuredInfo: { marginTop: 8 },
  featuredTitle: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY },
  featuredArtist: { fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 },
  songItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  songCover: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#161F19' },
  songInfo: { flex: 1, marginLeft: 12 },
  songTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  songArtist: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  songPlay: { fontSize: 16, color: ACCENT_COLOR, paddingLeft: 8 },
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

  const cur = player.currentHymn || { title: '', artist: '', youtube_id: '', id: null, lyrics: '' };
  const progressPercent = player.duration > 0 ? Math.min((player.currentTime / player.duration) * 100, 100) : 0;
  const bottomPad = (insets?.bottom || 20) + 8;
  const safeTop = (insets?.top || StatusBar.currentHeight || 24) + 8;

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
          <Text style={fsStyles.songTitle} numberOfLines={2}>{cur.title}</Text>
          <Text style={fsStyles.songArtist}>{cur.artist}</Text>
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
                onPress={() => { player.handlePlayFromQueue(item); setIsPlaylistVisible(false); }} activeOpacity={0.7}>
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
          backgroundColor: 'rgba(168,199,101,0.2)', borderRadius: 20,
          borderWidth: 1, borderColor: ACCENT_COLOR,
        }}
      >
        <Text style={{ fontSize: 13, color: ACCENT_COLOR, fontWeight: '600' }}>📄 歌詞</Text>
      </TouchableOpacity>
    </View>
  );
}

const fsStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
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
  const { hymns, setHymns, changeToSong, showPlayer, queueReady, isPlaying: debugPlaying, currentHymn: debugHymn, togglePlayPause: debugToggle } = usePlayer();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(true);
  const [allSongs, setAllSongs] = useState([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeTab, setActiveTab] = useState('Home');
  const [hymnListVisible, setHymnListVisible] = useState(false);
  const [hymnListData, setHymnListData] = useState({ hymns: [], title: '' });

  const showHymnList = (hymns, title) => {
    setHymnListData({ hymns, title });
    setHymnListVisible(true);
  };

  const closeHymnList = () => {
    setHymnListVisible(false);
  };

  // Show fallback hymns IMMEDIATELY so UI is never stuck at 0 songs
  useEffect(() => {
    setAllSongs(FALLBACK_HYMNS);
    setHymns(FALLBACK_HYMNS);
    setLoading(false);

    // Try fetch in background — if component unmounts (Fabric error),
    // fallback is already shown, so setState is best-effort only
    safeFetchAllHymns().then(all => {
      if (Array.isArray(all) && all.length > 0) {
        setAllSongs(all);
        setHymns(all);
      }
    }).catch(() => {});

    // Also try fetching via adb-reverse-friendly localhost
    fetch('http://127.0.0.1:3001/api/hymns', { method: 'HEAD' }).then(r => {
      if (r.ok) {
        safeFetchAllHymns().then(all => {
          if (Array.isArray(all) && all.length > 0) {
            setAllSongs(all);
            setHymns(all);
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  function handlePlayHymn(h) { if (h) { changeToSong(h); showPlayer(); } }
  function handleOpenFullScreen() { showPlayer(); }

  if (loading || (!queueReady && Platform.OS === 'ios')) {
    // On Android, queueReady may stay false due to headless service timing
    // But we should still wait briefly, not crash
    return (
      <View style={pageStyles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={pageStyles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={pageStyles.loadingText}>載入詩歌中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={pageStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />



      <View style={pageStyles.content}>
        {activeTab === 'Home' ? (
          <HomeScreen hymns={allSongs || []} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} onPlayHymn={handlePlayHymn} />
        ) : activeTab === 'Search' ? (
          <SearchScreen navigation={{ navigate: (route, params) => {
            if (route === 'Player' && params?.hymn) handlePlayHymn(params.hymn);
          }}} />
        ) : activeTab === 'Category' ? (
          <CategoryScreen showHymnList={showHymnList} />
        ) : (
          <HomeScreen hymns={allSongs || []} activeCategory={activeCategory}
            onCategoryChange={setActiveCategory} onPlayHymn={handlePlayHymn} />
        )}
      </View>
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
              changeToSong(hymn);
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
        <PlayerProvider><AppContent /></PlayerProvider>
      </SafeAreaProvider>
    );
  }
  return <PlayerProvider><AppContent /></PlayerProvider>;
}

const pageStyles = StyleSheet.create({
  container: { flex: 1, height: SCREEN_HEIGHT, backgroundColor: MAIN_BG_COLOR },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hymnListModal: { flex: 1, backgroundColor: '#fff' },
  hymnListClose: { padding: 16, backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  hymnListCloseText: { fontSize: 16, color: '#333' },
  loadingText: { color: TEXT_SECONDARY, marginTop: 16, fontSize: 15 },
});