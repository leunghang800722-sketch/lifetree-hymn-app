// TestimonyCarousel — 見證分享 · 星火飛騰 + 恩雨之聲 橫滑卡片
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions, Linking } from 'react-native';
import { COLORS } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 32 - 12) / 2.5); // 2.5 cards visible

// 預設 6 條見證影片（channel: 星火飛騰 CBNHK / 恩雨之聲 SOBEM）
const TESTIMONY_LIST = [
  {
    id: 'test-1',
    title: '破降耶利米',
    artist: '星火飛騰 522',
    youtube_id: 'CyYyquZJPk4',
    source: '星火飛騰',
  },
  {
    id: 'test-2',
    title: '走出茅山',
    artist: '星火飛騰 505',
    youtube_id: 'k8HZfK8XtcI',
    source: '星火飛騰',
  },
  {
    id: 'test-3',
    title: '不完美義人',
    artist: '星火飛騰 600',
    youtube_id: 'JE7VdrhakS4',
    source: '星火飛騰',
  },
  {
    id: 'test-4',
    title: '我聽見神的聲音',
    artist: '恩雨之聲 朱世聰',
    youtube_id: 'suYXavfsjlQ',
    source: '恩雨之聲',
  },
  {
    id: 'test-5',
    title: '百分百恩典',
    artist: '恩雨之聲 徐朝華',
    youtube_id: 'fldZ6NaXaPw',
    source: '恩雨之聲',
  },
  {
    id: 'test-6',
    title: '信心。信靠',
    artist: '恩雨之聲 何樹生',
    youtube_id: '6TrG7I4EEbg',
    source: '恩雨之聲',
  },
];

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

export default function TestimonyCarousel() {
  const handlePress = useCallback(async (item) => {
    const url = `https://www.youtube.com/watch?v=${item.youtube_id}`;
    const intent = `intent://watch?v=${item.youtube_id}#Intent;package=com.google.android.youtube;scheme=https;end`;

    try {
      const canOpenYT = await Linking.canOpenURL(intent);
      if (canOpenYT) {
        await Linking.openURL(intent);
        return;
      }
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch (e) {
      console.warn('open testimony failed:', e);
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>見證分享</Text>
      </View>
      <FlatList
        horizontal
        data={TESTIMONY_LIST}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={CARD_WIDTH + 8}
        decelerationRate="fast"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
          >
            <Thumbnail youtubeId={item.youtube_id} />
            <View style={styles.sourceTag}>
              <Text style={styles.sourceText}>{item.source}</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardArtist} numberOfLines={1}>{item.artist}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
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
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  card: {
    width: CARD_WIDTH,
  },
  thumb: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: {
    fontSize: 36,
  },
  sourceTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 9,
    color: '#F5F7F4',
    fontWeight: '600',
  },
  cardText: {
    marginTop: 8,
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
});
