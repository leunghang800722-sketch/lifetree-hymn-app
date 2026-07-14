// PlaylistCardRow — YouTube Music 風格播放清單橫向大卡片
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { COLORS } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_W = Math.floor((SCREEN_WIDTH - 48) * 0.75); // 75% screen width
const CARD_H = CARD_W * 0.56; // 16:9 approx

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

const GRADIENTS = [
  { from: '#FF6B9D', to: '#C239B3' }, // pink-purple
  { from: '#00D9FF', to: '#7B2FF7' }, // blue-purple
  { from: '#FFA000', to: '#FF5722' }, // orange-red
  { from: '#00E676', to: '#00BFA5' }, // green-teal
];

function PlaylistCover({ playlist, gradientIndex }) {
  const firstId = playlist.hymns?.[0]?.youtube_id;
  const secondId = playlist.hymns?.[1]?.youtube_id;
  const uri1 = getCoverUrl(firstId);
  const uri2 = getCoverUrl(secondId);
  const gIdx = gradientIndex != null ? gradientIndex % GRADIENTS.length : -1;

  return (
    <View style={styles.coverWrap}>
      {uri1 && (
        <Image source={{ uri: uri1 }} style={[styles.coverImg, uri2 ? styles.coverHalf : styles.coverFull]} />
      )}
      {uri2 && (
        <Image source={{ uri: uri2 }} style={[styles.coverImg, styles.coverHalf, { left: '50%' }]} />
      )}
      {!uri1 && !uri2 && (
        <View style={[styles.coverImg, styles.coverFallback]}>
          <Text style={styles.fallbackIcon}>🎵</Text>
        </View>
      )}
      {/* Gradient overlay */}
      {gIdx >= 0 && (
        <View style={[styles.gradientOverlay, { backgroundColor: GRADIENTS[gIdx].from, opacity: 0.6 }]} />
      )}
      {/* Play button top-left */}
      <View style={styles.playBadge}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </View>
  );
}

export default function PlaylistCardRow({ title, playlists, onPlay }) {
  if (!playlists || playlists.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.emptyText}>暫無數據</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.more}>全部顯示</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        snapToInterval={CARD_W + 12}
        decelerationRate="fast"
      >
        {playlists.map((pl, i) => (
          <TouchableOpacity
            key={pl.id || i}
            style={styles.card}
            onPress={() => {
              if (onPlay && pl.hymns?.[0]) onPlay(pl.hymns[0]);
            }}
            activeOpacity={0.8}
          >
            <PlaylistCover playlist={pl} gradientIndex={pl.gradientIndex} />
            <Text style={styles.cardTitle} numberOfLines={1}>{pl.title}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{pl.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
  more: {
    fontSize: 13,
    color: COLORS.secondary,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 12,
  },
  card: {
    width: CARD_W,
  },
  coverWrap: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBg,
  },
  coverImg: {
    position: 'absolute',
    top: 0,
    width: '100%',
    height: '100%',
  },
  coverHalf: {
    width: '50%',
    height: '100%',
  },
  coverFull: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  coverFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  fallbackIcon: {
    fontSize: 36,
  },
  playBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 12,
    color: '#000',
    marginLeft: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 8,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontStyle: 'italic',
    paddingHorizontal: 16,
  },
});
