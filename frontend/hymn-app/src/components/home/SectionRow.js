// SectionRow — YouTube Music 風格橫向滾動列
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { COLORS } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 32 - 16) / 2.5); // 2.5 cards visible

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function Thumbnail({ item }) {
  const [failed, setFailed] = useState(false);
  const uri = getAlbumCoverUrl(item.youtube_id);
  if (!uri || failed) {
    return (
      <View style={styles.thumbnail}>
        <Text style={styles.thumbnailEmoji}>🎵</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.thumbnail}
      onError={() => setFailed(true)}
    />
  );
}

export default function SectionRow({ title, data, onPress, subtitle }) {
  if (!data || data.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={CARD_WIDTH + 8}
        decelerationRate="fast"
      >
        {data.map((item, index) => (
          <TouchableOpacity
            key={item.id || index}
            style={styles.card}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
          >
            <Thumbnail item={item} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardArtist} numberOfLines={1}>
                {item.artist || '未知'}
              </Text>
            </View>
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.secondary,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  card: {
    width: CARD_WIDTH,
  },
  thumbnail: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailEmoji: {
    fontSize: 36,
  },
  cardText: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 2,
  },
  cardArtist: {
    fontSize: 12,
    color: COLORS.secondary,
  },
});
