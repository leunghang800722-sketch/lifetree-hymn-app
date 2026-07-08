// 分類畫面 - 根據 album, lang, 歌手分類
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { fetchHymns } from '../api';
import { getAlbumCoverUrl } from '../utils/albumCover';

const RECENT_KEY = '@hymn_app_recent';

const LANG_TABS = ['全部', '粵語', '國語', '英語'];

const ARTIST_EMOJIS = {
  '讚美之泉': '💜',
  'ACM': '💙',
  '玻璃海': '💚',
  '角聲使團': '🧡',
  '小羊詩歌': '🐑',
  '基恩敬拜': '🙏',
};

const ARTIST_COLORS = {
  '讚美之泉': '#7C3AED',
  'ACM': '#F5E6CA',
  '玻璃海': '#059669',
  '角聲使團': '#D97706',
  '小羊詩歌': '#EC4899',
  '基恩敬拜': '#3B82F6',
};

export default function CategoriesScreen() {
  const navigation = useNavigation();
  const [hymns, setHymns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLang, setActiveLang] = useState('全部');

  useEffect(() => {
    loadHymns();
  }, []);

  async function loadHymns() {
    setLoading(true);
    try {
      const data = await fetchHymns();
      setHymns(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Filter by lang (handle both 'lang' field and legacy 'category' field)
  const filteredHymns = activeLang === '全部'
    ? hymns
    : hymns.filter(h => {
        const langField = h.lang || '';
        const categoryField = h.category || '';
        return langField === activeLang || categoryField === activeLang;
      });

  // Group by artist
  const artistGroups = {};
  filteredHymns.forEach(h => {
    if (!artistGroups[h.artist]) {
      artistGroups[h.artist] = [];
    }
    artistGroups[h.artist].push(h);
  });

  const artistList = Object.entries(artistGroups).map(([artist, songs]) => ({
    artist,
    songs,
    count: songs.length,
    color: ARTIST_COLORS[artist] || '#F5E6CA',
    emoji: ARTIST_EMOJIS[artist] || '🎵',
  }));

  function handleHymnPress(hymn) {
    AsyncStorage.setItem(RECENT_KEY, String(hymn.id)).catch(() => {});
    navigation.navigate('Player', { hymnId: hymn.id });
  }

  function getLangBadge(lang) {
    switch(lang || '') {
      case '粵語': return { bg: '#065F46', text: '粵' };
      case '國語': return { bg: '#1E40AF', text: '國' };
      case '英語': return { bg: '#7C3AED', text: 'EN' };
      default: return { bg: '#333', text: lang ? lang.substring(0,2) : '??' };
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F5E6CA" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 分類瀏覽</Text>
        <Text style={styles.headerSubtitle}>按歌手/語言/專輯搜尋</Text>
      </View>

      {/* Language tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langTabs}>
        {LANG_TABS.map(lang => (
          <TouchableOpacity
            key={lang}
            style={[
              styles.langTab,
              activeLang === lang && styles.langTabActive
            ]}
            onPress={() => setActiveLang(lang)}
          >
            <Text style={[
              styles.langTabText,
              activeLang === lang && styles.langTabTextActive
            ]}>{lang}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={artistList}
        keyExtractor={(item) => item.artist}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.artistSection}>
            <TouchableOpacity style={styles.artistHeader}>
              <View style={[styles.artistIcon, { backgroundColor: item.color }]}>
                <Text style={styles.artistEmoji}>{item.emoji}</Text>
              </View>
              <View style={styles.artistInfo}>
                <Text style={styles.artistName}>{item.artist}</Text>
                <Text style={styles.artistCount}>{item.count} 首詩歌</Text>
              </View>
            </TouchableOpacity>
            {item.songs.map((hymn) => {
              const badge = getLangBadge(hymn.lang || hymn.category);
              return (
                <TouchableOpacity
                  key={hymn.id}
                  style={styles.hymnItem}
                  onPress={() => handleHymnPress(hymn)}
                >
                  <Image
                    source={{ uri: getAlbumCoverUrl(hymn.youtube_id) }}
                    style={styles.hymnCover}
                  />
                  <View style={styles.hymnContent}>
                    <View style={styles.titleRow}>
                      <Text style={styles.hymnTitle}>{hymn.title}</Text>
                      {hymn.title_en ? (
                        <Text style={styles.hymnTitleEn}>{hymn.title_en}</Text>
                      ) : null}
                    </View>
                    <View style={styles.hymnMeta}>
                      <View style={[styles.langBadge, { backgroundColor: badge.bg }]}>
                        <Text style={styles.langBadgeText}>{badge.text}</Text>
                      </View>
                      {hymn.album ? (
                        <Text style={styles.hymnAlbum}>📀 {hymn.album}</Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>搵唔到相關詩歌</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1A16' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: Platform.OS === 'ios' ? 50 : 40, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF' },
  headerSubtitle: { fontSize: 13, color: '#6B7D65', marginTop: 4 },

  // Language tabs
  langTabs: { paddingHorizontal: 20, marginBottom: 12 },
  langTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#1A2E26',
  },
  langTabActive: { backgroundColor: '#F5E6CA' },
  langTabText: { color: '#8B9D83', fontSize: 14 },
  langTabTextActive: { color: '#0F1A16', fontWeight: '600' },

  listContent: { paddingHorizontal: 20, paddingBottom: 85 },

  // Artist section
  artistSection: { marginBottom: 16 },
  artistHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 2 },
  artistIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  artistEmoji: { fontSize: 20 },
  artistInfo: { flex: 1 },
  artistName: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  artistCount: { fontSize: 12, color: '#6B7D65', marginTop: 2 },

  // Hymn items
  hymnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E26',
    borderRadius: 12,
    padding: 8,
    marginLeft: 52,
    marginBottom: 8,
  },
  hymnCover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0F1A16',
    marginRight: 10,
  },
  hymnContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  hymnTitle: { fontSize: 16, fontWeight: '600', color: '#FFF', marginRight: 6 },
  hymnTitleEn: { fontSize: 13, color: '#6B7D65', fontStyle: 'italic' },
  hymnMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  langBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  langBadgeText: { fontSize: 11, fontWeight: '600', color: '#FFF' },
  hymnAlbum: { fontSize: 12, color: '#8B9D83' },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#6B7D65', fontSize: 16 },
});
