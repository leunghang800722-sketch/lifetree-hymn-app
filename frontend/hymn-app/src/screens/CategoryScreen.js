// CategoryScreen — 分類頁 redesign（Spotify 風格）
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { categoryApi } from '../services/categoryApi';

const LANG_CATS = [
  { key: 'mandarin', label: '國語詩歌', emoji: '🇨🇳', color: '#B71C1C', api: 'getMandarin' },
  { key: 'cantonese', label: '粵語詩歌', emoji: '🇭🇰', color: '#1B5E20', api: 'getCantonese' },
  { key: 'english', label: '英文詩歌', emoji: '🇺🇸', color: '#0D47A1', api: 'getEnglish' },
  { key: 'chinese', label: '所有中文', emoji: '🇨🇳', color: '#E65100', api: 'getChinese' },
];

export default function CategoryScreen({ navigation, showHymnList }) {
  const [activeSection, setActiveSection] = useState('language');
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadArtists();
  }, []);

  const loadArtists = async () => {
    try {
      const data = await categoryApi.getArtists();
      setArtists(data || []);
    } catch (error) {
      console.error('Load artists error:', error);
    }
  };

  const handleLanguageCategory = async (langKey) => {
    const cat = LANG_CATS.find(c => c.key === langKey);
    if (!cat) return;
    setLoading(true);
    try {
      const hymns = await categoryApi[cat.api]();
      showHymnList(hymns || [], cat.label);
    } catch (error) {
      console.error('Load category error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleArtistCategory = async (artistName) => {
    setLoading(true);
    try {
      const hymns = await categoryApi.getArtistHymns(artistName);
      showHymnList(hymns || [], artistName);
    } catch (error) {
      console.error('Load artist hymns error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group artists by first character (拼音/英文首字母)
  const artistGroups = useMemo(() => {
    const groups = {};
    for (const item of artists) {
      const first = (item.artist || '?').charAt(0).toUpperCase();
      if (!groups[first]) groups[first] = [];
      groups[first].push(item);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted;
  }, [artists]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>分類</Text>
      </View>

      {/* Section Tabs */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'language' && styles.sectionTabActive]}
          onPress={() => setActiveSection('language')}
        >
          <Text style={[styles.sectionTabText, activeSection === 'language' && styles.sectionTabTextActive]}>
            語言分類
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'artist' && styles.sectionTabActive]}
          onPress={() => setActiveSection('artist')}
        >
          <Text style={[styles.sectionTabText, activeSection === 'artist' && styles.sectionTabTextActive]}>
            歌手分類
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.topLoading}>
          <ActivityIndicator size="small" color="#3DB389" />
          <Text style={styles.topLoadingText}>載入中...</Text>
        </View>
      )}

      {/* Language Categories */}
      {activeSection === 'language' && (
        <ScrollView contentContainerStyle={styles.langContent} showsVerticalScrollIndicator={false}>
          <View style={styles.langGrid}>
            {LANG_CATS.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.langCard, { backgroundColor: cat.color + '20', borderColor: cat.color + '40' }]}
                onPress={() => handleLanguageCategory(cat.key)}
                activeOpacity={0.8}
              >
                <Text style={styles.langEmoji}>{cat.emoji}</Text>
                <View style={styles.langInfo}>
                  <Text style={styles.langLabel}>{cat.label}</Text>
                  <Text style={styles.langHint}>點擊瀏覽</Text>
                </View>
                <Text style={[styles.langArrow, { color: cat.color }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Artist Categories */}
      {activeSection === 'artist' && (
        <FlatList
          data={artistGroups}
          keyExtractor={([letter]) => letter}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.artistContent}
          renderItem={({ item: [letter, group] }) => (
            <View style={styles.letterGroup}>
              <Text style={styles.letterHeader}>{letter}</Text>
              {group.map((item) => (
                <TouchableOpacity
                  key={item.artist}
                  style={styles.artistItem}
                  onPress={() => handleArtistCategory(item.artist)}
                  activeOpacity={0.7}
                >
                  <View style={styles.artistAvatar}>
                    <Text style={styles.artistInitial}>{item.artist.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.artistInfo}>
                    <Text style={styles.artistName} numberOfLines={1}>{item.artist}</Text>
                    <Text style={styles.artistCount}>{item.count} 首詩歌</Text>
                  </View>
                  <Text style={styles.artistArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F0E' },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#F5F7F4' },

  // Section tabs
  sectionTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#121A17', borderRadius: 10, padding: 3 },
  sectionTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  sectionTabActive: { backgroundColor: '#1F2925' },
  sectionTabText: { fontSize: 14, color: '#9AA696', fontWeight: '500' },
  sectionTabTextActive: { color: '#F5F7F4', fontWeight: '700' },

  // Loading
  topLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  topLoadingText: { fontSize: 13, color: '#9AA696' },

  // Language section
  langContent: { padding: 16, paddingBottom: 40 },
  langGrid: { gap: 12 },
  langCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, borderRadius: 14,
    borderWidth: 1,
  },
  langEmoji: { fontSize: 28, marginRight: 14 },
  langInfo: { flex: 1 },
  langLabel: { fontSize: 17, fontWeight: '700', color: '#F5F7F4' },
  langHint: { fontSize: 12, color: '#9AA696', marginTop: 2 },
  langArrow: { fontSize: 22, fontWeight: '300' },

  // Artist section
  artistContent: { paddingBottom: 40 },
  letterGroup: { marginBottom: 8 },
  letterHeader: {
    fontSize: 16, fontWeight: '800', color: '#F5F7F4',
    paddingHorizontal: 20, paddingVertical: 10, paddingTop: 16,
  },
  artistItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
  },
  artistAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1F2925', justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  artistInitial: { fontSize: 16, fontWeight: '700', color: '#F5F7F4' },
  artistInfo: { flex: 1 },
  artistName: { fontSize: 15, fontWeight: '600', color: '#F5F7F4' },
  artistCount: { fontSize: 12, color: '#9AA696', marginTop: 2 },
  artistArrow: { fontSize: 18, color: '#555' },
});
