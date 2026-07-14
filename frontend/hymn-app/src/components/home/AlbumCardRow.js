// AlbumCardRow — YouTube Music 風格推薦專輯橫向滾動
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { COLORS } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_W = Math.floor((SCREEN_WIDTH - 48) / 2.8); // ~2.8 cards visible

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function AlbumCover({ coverUrl, youtubeId }) {
  const [failed, setFailed] = useState(false);
  const uri = coverUrl || getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={styles.cover}>
        <Text style={styles.coverIcon}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={styles.cover} onError={() => setFailed(true)} />
  );
}

export default function AlbumCardRow({ title, albums, onPlay }) {
  if (!albums || albums.length === 0) {
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
        snapToInterval={CARD_W + 8}
        decelerationRate="fast"
      >
        {albums.map((album, i) => (
          <TouchableOpacity
            key={album.id || i}
            style={styles.card}
            onPress={() => {
              if (album.hymns?.[0]) onPlay(album.hymns[0]);
            }}
            activeOpacity={0.8}
          >
            <AlbumCover coverUrl={album.coverUrl} youtubeId={album.hymns?.[0]?.youtube_id} />
            <Text style={styles.cardTitle} numberOfLines={1}>{album.title}</Text>
            <Text style={styles.cardArtist} numberOfLines={1}>{album.artist || '多種作品'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  more: { fontSize: 13, color: COLORS.secondary },
  scroll: { paddingHorizontal: 12, gap: 8 },
  card: { width: CARD_W },
  cover: {
    width: CARD_W,
    height: CARD_W,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverIcon: { fontSize: 28 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginTop: 8 },
  cardArtist: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  emptyText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontStyle: 'italic',
    paddingHorizontal: 16,
  },
});
