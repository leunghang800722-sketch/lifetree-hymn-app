// HomeScreen — Rolex Green · 9 區塊（mind map 名）· 無搜尋
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../../constants/theme';
import DailyVerseCard from './DailyVerseCard';
import PlaylistCardRow from './PlaylistCardRow';
import SongListSection from './SongListSection';
import HotSongCarousel from './HotSongCarousel';
import TestimonyCarousel from './TestimonyCarousel';
import AlbumCardRow from './AlbumCardRow';
import SectionRow from './SectionRow';
import { usePlaylists } from '../../context/PlaylistContext';
import { homeApi } from '../../services/homeApi';

export default function HomeScreen({ navigation, onPlayHymn }) {
  const [data, setData] = useState({
    dailyVerse: null,
    basedOnTaste: [], newReleases: [],
    genreRec: [], folkSharing: [], artist: null,
    combinedCharts: [], topVerses: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [verse, taste, releases, genre, folk, artist, charts, verses] = await Promise.all([
          homeApi.getDailyVerse().catch(() => null),
          homeApi.getBasedOnTaste().catch(() => []),
          homeApi.getNewReleases().catch(() => []),
          homeApi.getGenreRecommendation().catch(() => []),
          homeApi.getFolkSharing().catch(() => []),
          homeApi.getFeaturedArtist().catch(() => null),
          homeApi.getCombinedCharts().catch(() => []),
          homeApi.getTopVerses().catch(() => []),
        ]);
        setData({ dailyVerse: verse, basedOnTaste: taste, newReleases: releases, genreRec: genre, folkSharing: folk, artist, combinedCharts: charts, topVerses: verses });
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // 為你推薦的播放清單 — 4 張合成
  const playlists = useMemo(() => {
    const pl = [];
    if (data.genreRec?.length > 0) pl.push({ id: 'genre-mix', title: '類型精選', subtitle: `${data.genreRec.length} 首`, hymns: data.genreRec });
    if (data.folkSharing?.length > 0) pl.push({ id: 'folk-mix', title: '🎸 民謠精選', subtitle: `${data.folkSharing.length} 首`, hymns: data.folkSharing });
    if (data.artist?.hymns?.length > 0) pl.push({ id: 'artist-mix', title: data.artist.artist, subtitle: `${data.artist.hymns.length} 首`, hymns: data.artist.hymns });
    if (data.combinedCharts?.length > 0) pl.push({ id: 'hot-mix', title: '🔥 熱門詩歌', subtitle: `${data.combinedCharts.length} 首`, hymns: data.combinedCharts });
    return pl;
  }, [data]);

  // 推薦專輯 — artist 分組
  const albumRows = useMemo(() => {
    const pool = [...(data.combinedCharts || []), ...(data.newReleases || []), ...(data.topVerses || []), ...(data.genreRec || [])];
    const seen = new Set();
    const unique = pool.filter(h => { const k = h.id || h.youtube_id; if (seen.has(k)) return false; seen.add(k); return true; });
    const groups = {};
    for (const h of unique) { const a = h.artist || '未知'; if (!groups[a]) groups[a] = []; if (groups[a].length < 3) groups[a].push(h); }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([artist, hymns]) => ({ id: `album-${artist}`, title: `${artist} 精選`, artist, hymns }));
  }, [data]);

  const { playlists: userPlaylists, addToPlaylist } = usePlaylists();
  const [showPlModal, setShowPlModal] = useState(false);
  const [plTargetHymn, setPlTargetHymn] = useState(null);

  const playSong = (h) => { if (onPlayHymn) onPlayHymn(h); else if (navigation) navigation.navigate('Player', { hymn: h }); };

  const showMoreMenu = (hymn) => {
    Alert.alert(hymn.title, '請選擇', [
      { text: '播放', onPress: () => playSong(hymn) },
      { text: '下一首播放', onPress: () => playSong(hymn) },
      { text: '加入播放清單', onPress: () => { setPlTargetHymn(hymn); setShowPlModal(true); } },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleAddToPlaylist = (playlistId) => {
    if (plTargetHymn) {
      addToPlaylist(playlistId, plTargetHymn);
      Alert.alert('已加入', `已加入「${userPlaylists.find(p => p.id === playlistId)?.name || ''}」`);
    }
    setShowPlModal(false);
    setPlTargetHymn(null);
  };

  return (
    <View style={styles.root}>
      {/* Playlist selection modal */}
      {showPlModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => { setShowPlModal(false); setPlTargetHymn(null); }}>
          <TouchableOpacity style={plModalStyles.overlay} activeOpacity={1} onPress={() => { setShowPlModal(false); setPlTargetHymn(null); }}>
            <View style={plModalStyles.card}>
              <Text style={plModalStyles.title}>加入播放清單</Text>
              {userPlaylists.length === 0 ? (
                <Text style={plModalStyles.empty}>尚未建立任何清單，先去「清單」tab 建立</Text>
              ) : (
                userPlaylists.map(pl => (
                  <TouchableOpacity key={pl.id} style={plModalStyles.item} onPress={() => handleAddToPlaylist(pl.id)}>
                    <MaterialIcons name={pl.type === 'video' ? 'videocam' : 'music-note'} size={18} color={pl.type === 'video' ? '#64B5F6' : '#A0A0A0'} />
                    <Text style={plModalStyles.itemText}>{pl.name}</Text>
                    <Text style={plModalStyles.itemCount}>{pl.hymns.length} 首</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.topLoading}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.topLoadingText}>載入中...</Text>
          </View>
        )}
        {/* 0. 每日金句 */}
        <DailyVerseCard verse={data.dailyVerse} />

        {/* 1. 為你推薦 */}
        {data.basedOnTaste.length > 0 && (
          <SectionRow title="為你推薦" data={data.basedOnTaste.slice(0, 10)} onPress={playSong} />
        )}

        {/* 2. 新作品 */}
        {data.newReleases.length > 0 && (
          <SectionRow title="新作品" data={data.newReleases.slice(0, 10)} onPress={playSong} />
        )}

        {/* 3. 為你推薦的播放清單 */}
        {playlists.length > 0 && (
          <PlaylistCardRow title="為你推薦的播放清單" playlists={playlists} onPlay={playSong} />
        )}

        {/* 4. 推薦專輯 */}
        {albumRows.length > 0 && (
          <AlbumCardRow title="推薦專輯" albums={albumRows} onPlay={playSong} />
        )}

        {/* 5. 推薦大熱歌曲 — 橫滑 4 頁 × 每頁 4 首 */}
        {data.combinedCharts.length > 0 && (() => {
          // Backfill to 16 songs for 4 full pages using other data sources
          const pool = data.combinedCharts.slice(0, 16);
          const seen = new Set(pool.map(h => h.id || h.youtube_id));
          const fillers = [...(data.newReleases || []), ...(data.topVerses || []), ...(data.genreRec || [])];
          for (const h of fillers) {
            if (pool.length >= 16) break;
            const key = h.id || h.youtube_id;
            if (!seen.has(key)) {
              seen.add(key);
              pool.push(h);
            }
          }
          return <HotSongCarousel hymns={pool} onPlay={playSong} onMore={showMoreMenu} />;
        })()}

        {/* 6. 排行榜 */}
        {data.topVerses.length > 0 && (
          <SongListSection title="排行榜" hymns={data.topVerses.slice(0, 8)} onPlay={playSong} onMore={showMoreMenu} />
        )}

        {/* 7. 見證分享 — 星火飛騰 + 恩雨之聲 */}
        <TestimonyCarousel />

        {/* 8. 純音樂 */}
        <SectionRow title="純音樂" data={data.genreRec.slice(0, 10)} onPress={playSong} />

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const plModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 },
  title: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 14 },
  empty: { fontSize: 14, color: '#A0A0A0', textAlign: 'center', paddingVertical: 20 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  itemText: { flex: 1, fontSize: 15, color: '#FFFFFF', marginLeft: 10 },
  itemCount: { fontSize: 12, color: '#A0A0A0' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 20 },
  topLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 6 },
  topLoadingText: { fontSize: 13, color: COLORS.secondary },
});
