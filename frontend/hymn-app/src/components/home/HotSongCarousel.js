// HotSongCarousel — 推薦大熱歌曲 · 橫滑 4 頁 × 每頁 4 首（2×2 網格）
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { COLORS } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_H_PADDING = 16;
const PAGE_WIDTH = SCREEN_WIDTH - PAGE_H_PADDING * 2;
const ITEM_GAP = 8;
const ITEMS_PER_COL = 2;
const ITEMS_PER_PAGE = 4;
const MAX_PAGES = 4;
const CARD_SIZE = Math.floor((PAGE_WIDTH - ITEM_GAP) / ITEMS_PER_COL);

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function Thumbnail({ youtubeId }) {
  const [failed, setFailed] = useState(false);
  const uri = getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={styles.thumb}>
        <Text style={styles.thumbIcon}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} />
  );
}

export default function HotSongCarousel({ hymns, onPlay, onMore }) {
  const flatRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Slice up to 16 songs, group into pages of 4
  const pages = useMemo(() => {
    const songs = (hymns || []).slice(0, MAX_PAGES * ITEMS_PER_PAGE);
    const result = [];
    for (let i = 0; i < songs.length; i += ITEMS_PER_PAGE) {
      result.push(songs.slice(i, i + ITEMS_PER_PAGE));
    }
    return result;
  }, [hymns]);

  if (pages.length === 0) return null;

  const handleScrollEnd = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / PAGE_WIDTH);
    setCurrentPage(Math.min(page, pages.length - 1));
  }, [pages.length]);

  const handlePlayAll = () => {
    if (hymns && hymns[0]) onPlay(hymns[0]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>推薦大熱歌曲</Text>
        <TouchableOpacity onPress={handlePlayAll}>
          <Text style={styles.playAll}>全部播放</Text>
        </TouchableOpacity>
      </View>

      {/* Pages */}
      <FlatList
        ref={flatRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={PAGE_WIDTH}
        snapToAlignment="start"
        onMomentumScrollEnd={handleScrollEnd}
        keyExtractor={(_, i) => `page-${i}`}
        renderItem={({ item: pageSongs }) => (
          <View style={styles.page}>
            <View style={styles.grid}>
              {pageSongs.length > 0 && (
                <>
                  {/* Row 1 */}
                  <View style={styles.gridRow}>
                    {pageSongs.slice(0, 2).map((song, i) => (
                      <SongCard key={song.id || `r1-${i}`} song={song} onPlay={onPlay} onMore={onMore} />
                    ))}
                  </View>
                  {/* Row 2 */}
                  {pageSongs.length > 2 && (
                    <View style={styles.gridRow}>
                      {pageSongs.slice(2, 4).map((song, i) => (
                        <SongCard key={song.id || `r2-${i}`} song={song} onPlay={onPlay} onMore={onMore} />
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: PAGE_H_PADDING }}
      />

      {/* Page indicator dots */}
      {pages.length > 1 && (
        <View style={styles.dotRow}>
          {pages.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function SongCard({ song, onPlay, onMore }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPlay(song)} activeOpacity={0.7}>
      <Thumbnail youtubeId={song.youtube_id} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.cardArtist} numberOfLines={1}>{song.artist || '未知'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  playAll: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '600',
  },
  page: {
    width: PAGE_WIDTH,
  },
  grid: {
    gap: ITEM_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: ITEM_GAP,
  },
  card: {
    width: CARD_SIZE,
  },
  thumb: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: {
    fontSize: 30,
  },
  cardInfo: {
    marginTop: 6,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 1,
  },
  cardArtist: {
    fontSize: 11,
    color: COLORS.secondary,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
