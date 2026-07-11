// HomeScreen — Rolex Green · 9 區塊（mind map 名）· 無搜尋
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/theme';
import DailyVerseCard from './DailyVerseCard';
import PlaylistCardRow from './PlaylistCardRow';
import SongListSection from './SongListSection';
import HotSongCarousel from './HotSongCarousel';
import TestimonyCarousel from './TestimonyCarousel';
import AlbumCardRow from './AlbumCardRow';
import SectionRow from './SectionRow';
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

  const playSong = (h) => { if (onPlayHymn) onPlayHymn(h); else if (navigation) navigation.navigate('Player', { hymn: h }); };

  const showMoreMenu = (hymn) => {
    // Simple ⋯ menu: uses Alert for now
    // In production this would open a proper bottom sheet
    Alert.alert(hymn.title, '請選擇', [
      { text: '播放', onPress: () => playSong(hymn) },
      { text: '下一首播放', onPress: () => playSong(hymn) },
      { text: '加入播放清單', onPress: () => {} },
      { text: '分享', onPress: () => {} },
      { text: '取消', style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>載入中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 20 },
  loadingWrap: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingBottom: 20 },
  loadingText: { fontSize: 14, color: COLORS.secondary },
});
