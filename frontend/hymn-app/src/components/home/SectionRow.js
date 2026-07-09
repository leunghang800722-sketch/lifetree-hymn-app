// src/components/home/SectionRow.js
// 通用橫向滾動列（可重用）— 深色主題版
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';

// 深色主題色系（與 App.js 一致）
const MAIN_BG_COLOR = '#131C16';
const CARD_BG_COLOR = '#1E2B22';
const ACCENT_COLOR = '#A8C765';
const TEXT_PRIMARY = '#F0F4E8';
const TEXT_SECONDARY = '#9AA696';

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function Thumbnail({ item }) {
  const [failed, setFailed] = React.useState(false);
  const uri = getAlbumCoverUrl(item.youtube_id);
  if (!uri || failed) {
    return (
      <View style={styles.thumbnail}>
        <Text style={styles.thumbnailText}>🎵</Text>
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

export default function SectionRow({ title, data, onPress }) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {data.map((item, index) => (
          <TouchableOpacity
            key={item.id || index}
            style={styles.card}
            onPress={() => onPress(item)}
            activeOpacity={0.8}
          >
            <Thumbnail item={item} />
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardArtist} numberOfLines={1}>
              {item.artist || '未知藝人'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT_PRIMARY,
    marginLeft: 16,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  card: {
    width: 120,
    marginHorizontal: 4,
  },
  thumbnail: {
    width: 120,
    height: 68,
    backgroundColor: CARD_BG_COLOR,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  thumbnailText: {
    fontSize: 24,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  cardArtist: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
});
