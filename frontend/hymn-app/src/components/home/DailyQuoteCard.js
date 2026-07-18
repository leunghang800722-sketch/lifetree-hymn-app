// DailyQuoteCard — 每日精選一句（YouTube Music 風格大卡片）
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { COLORS } from '../../constants/theme';

const CARD_WIDTH = Dimensions.get('window').width - 32;

function getAlbumCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
}

export default function DailyQuoteCard({ data, onPress }) {
  const [failed, setFailed] = useState(false);

  if (!data || data.message) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>今日暫無精選</Text>
      </View>
    );
  }

  const uri = getAlbumCoverUrl(data.youtube_id);
  const hasCover = uri && !failed;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(data)}
      activeOpacity={0.85}
    >
      {/* Background cover */}
      {hasCover && (
        <Image source={{ uri }} style={styles.cover} blurRadius={40} />
      )}
      <View style={[styles.overlay, hasCover ? {} : { backgroundColor: COLORS.cardBg }]}>
        {/* Label */}
        <Text style={styles.label}>每日精選</Text>

        {/* Album art + info */}
        <View style={styles.contentRow}>
          {hasCover ? (
            <Image source={{ uri }} style={styles.albumArt} />
          ) : (
            <View style={[styles.albumArt, styles.albumFallback]}>
              <Text style={styles.fallbackIcon}>🎵</Text>
            </View>
          )}

          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>{data.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{data.artist || '未知'}</Text>
          </View>
        </View>

        {/* Play button */}
        <View style={styles.playBtn}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: 160,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    width: CARD_WIDTH,
    height: 160,
  },
  overlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumArt: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  albumFallback: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackIcon: {
    fontSize: 28,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primary,
    lineHeight: 22,
  },
  artist: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 4,
  },
  playBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 16,
    color: '#000',
    marginLeft: 2,
  },
  empty: {
    width: CARD_WIDTH,
    height: 160,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.secondary,
  },
});
