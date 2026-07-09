// src/components/home/DailyQuoteCard.js
// 每日精選一句 — 大卡片，150px 高（深色主題版）
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';

const MAIN_BG_COLOR = '#131C16';
const ACCENT_COLOR = '#A8C765';

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

export default function DailyQuoteCard({ data, onPress }) {
  const [failed, setFailed] = useState(false);

  if (!data || data.message) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>今日暫無精選</Text>
      </View>
    );
  }

  const uri = getAlbumCoverUrl(data.youtube_id);
  const showCover = uri && !failed;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(data)}
      activeOpacity={0.8}
    >
      <ImageBackground
        source={{ uri: showCover ? uri : 'https://via.placeholder.com/400x150' }}
        style={styles.background}
        imageStyle={styles.backgroundImage}
        onError={() => setFailed(true)}
      >
        <View style={styles.overlay}>
          <Text style={styles.label}>每日精選</Text>
          <Text style={styles.title} numberOfLines={2}>
            {data.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {data.artist || '未知藝人'}
          </Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 150,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: MAIN_BG_COLOR,
  },
  background: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backgroundImage: {
    borderRadius: 12,
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
  },
  label: {
    fontSize: 12,
    color: ACCENT_COLOR,
    fontWeight: '600',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: '#E0E0E0',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 60,
    color: '#888',
  },
});
