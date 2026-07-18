// SearchScreen — 搜尋頁 redesign（Spotify × YT Music 風格）
import React, { useState, useEffect, useCallback } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useInsets } from '../hooks/useInsets';
import { COLORS } from '../theme/designSystem';
import {
  View,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchApi } from '../services/searchApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RECENT_KEY = 'search_recent_v2';
const MAX_RECENT = 10;

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
}

// Fallback cover for thumbnail
function Thumbnail({ youtubeId, size = 48 }) {
  const [failed, setFailed] = useState(false);
  const uri = getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, { width: size, height: size, borderRadius: 6 }]}>
        <MaterialIcons name="music-note" size={size / 2.2} color={COLORS.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.thumb, { width: size, height: size, borderRadius: 6 }]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// "發掘詩歌" discovery cards
const DISCOVER_POOL = [
  { id: 'disc-1', title: '#讚美', youtube_id: 'JlTb0Sf7xUg', tag: '讚美' },
  { id: 'disc-2', title: '#敬拜', youtube_id: 'HfE3WNcdDTk', tag: '敬拜' },
  { id: 'disc-3', title: '#國語', youtube_id: 'tPf7Ig1ebL4', tag: '國語' },
  { id: 'disc-4', title: '#粵語', youtube_id: '7auHGSs5f4o', tag: '粵語' },
  { id: 'disc-5', title: '#英文', youtube_id: '4GthZbt1lPo', tag: '英文' },
  { id: 'disc-6', title: '#兒童詩歌', youtube_id: 'raA84tzs4rw', tag: '兒童' },
];

// "你可能會喜歡" suggestions
const SUGGESTIONS = [
  { text: '恩典太美麗', type: '歌曲' },
  { text: '這一生最美的祝福', type: '歌曲' },
  { text: '我要向高山舉目', type: '歌曲' },
  { text: 'ACM', type: '歌手' },
  { text: '讚美之泉', type: '歌手' },
  { text: '生命河靈糧堂', type: '歌手' },
];

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [focused, setFocused] = useState(false);

  // Load recent searches on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_KEY);
        if (raw) setRecentSearches(JSON.parse(raw));
      } catch (_) {}
    })();
  }, []);

  const saveRecent = useCallback(async (keyword) => {
    if (!keyword.trim()) return;
    const updated = [keyword, ...recentSearches.filter(s => s !== keyword)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try { await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch (_) {}
  }, [recentSearches]);

  const handleSearch = useCallback(async (searchQuery, tab = activeTab) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      let data;
      switch (tab) {
        case 'all': data = await searchApi.searchAll(searchQuery); break;
        case 'title': data = await searchApi.searchTitle(searchQuery); break;
        case 'artist': data = await searchApi.searchArtist(searchQuery); break;
        case 'lyrics': data = await searchApi.searchLyrics(searchQuery); break;
        case 'album': data = await searchApi.searchAlbum(searchQuery); break;
      }
      setResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      saveRecent(query);
      handleSearch(query);
    }
  }, [query, saveRecent, handleSearch]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    if (query.trim()) handleSearch(query, tab);
  }, [query, handleSearch]);

  const handleRecentTap = useCallback((keyword) => {
    setQuery(keyword);
    setFocused(true);
    saveRecent(keyword);
    handleSearch(keyword);
  }, [saveRecent, handleSearch]);

  const handlePlayHymn = useCallback((hymn) => {
    navigation.navigate('Player', { hymn });
  }, [navigation]);

  const hasInput = query.trim().length > 0;
  const showDefaultView = !hasInput && !loading;
  // edge-to-edge:唔加 top inset 個「搜尋」標題會頂到狀態列(見 useInsets.js)
  const insets = useInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>搜尋</Text>
      </View>

      {/* Search bar — near white pill */}
      <View style={[styles.searchWrap, focused && styles.searchWrapFocused]}>
        <MaterialIcons name="search" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋歌名、歌手、歌詞、專輯"
          placeholderTextColor="#888"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (text.trim()) handleSearch(text);
            else setResults([]);
          }}
          onSubmitEditing={handleSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
        />
        {hasInput && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => { setQuery(''); setResults([]); }}>
            <MaterialIcons name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chips — search dimensions */}
      {hasInput && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
          {[
            { key: 'all', label: '全部' },
            { key: 'title', label: '歌名' },
            { key: 'artist', label: '歌手' },
            { key: 'lyrics', label: '歌詞' },
            { key: 'album', label: '專輯' },
          ].map(chip => (
            <TouchableOpacity
              key={chip.key}
              style={[styles.chip, activeTab === chip.key && styles.chipActive]}
              onPress={() => handleTabChange(chip.key)}
            >
              <Text style={[styles.chipText, activeTab === chip.key && styles.chipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ===== Default view (no search) ===== */}
      {showDefaultView && (
        <ScrollView style={styles.defaultScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.defaultContent}>
          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>最近搜尋</Text>
              {recentSearches.map((kw, i) => (
                <TouchableOpacity key={i} style={styles.recentRow} onPress={() => handleRecentTap(kw)} activeOpacity={0.7}>
                  <MaterialIcons name="history" size={18} color={COLORS.textSecondary} style={styles.recentIcon} />
                  <Text style={styles.recentText} numberOfLines={1}>{kw}</Text>
                  <MaterialIcons name="north-east" size={16} color={COLORS.textSecondary} style={styles.recentArrow} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 發掘詩歌 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>發掘詩歌</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoverScroll}>
              {DISCOVER_POOL.map(item => (
                <TouchableOpacity key={item.id} style={styles.discoverCard} activeOpacity={0.7}
                  onPress={() => { setQuery(item.tag); handleSearch(item.tag); }}>
                  <Thumbnail youtubeId={item.youtube_id} size={DISCOVER_CARD_SIZE} />
                  <View style={styles.discoverTag}>
                    <Text style={styles.discoverTagText}>{item.tag}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 你可能會喜歡 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>你可能會喜歡</Text>
            {SUGGESTIONS.map((item, i) => (
              <TouchableOpacity key={i} style={styles.suggestRow} onPress={() => { setQuery(item.text); handleSearch(item.text); }} activeOpacity={0.7}>
                <MaterialIcons name="search" size={18} color={COLORS.textSecondary} style={styles.suggestIcon} />
                <View style={styles.suggestInfo}>
                  <Text style={styles.suggestText}>{item.text}</Text>
                  <Text style={styles.suggestType}>{item.type}</Text>
                </View>
                <MaterialIcons name="north-east" size={16} color={COLORS.textSecondary} style={styles.recentArrow} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ===== Results view (search active) ===== */}
      {hasInput && !showDefaultView && (
        <>
          {loading && (
            <View style={styles.topLoading}>
              <ActivityIndicator size="small" color="#3DB389" />
              <Text style={styles.topLoadingText}>搜尋中...</Text>
            </View>
          )}
          {!loading && (
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              style={styles.resultList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.resultRow} onPress={() => handlePlayHymn(item)} activeOpacity={0.7}>
                  <Thumbnail youtubeId={item.youtube_id} size={48} />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.resultArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
                  </View>
                  <Text style={styles.resultMore}>⋯</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>搵唔到相關詩歌</Text>
                  <Text style={styles.emptyHint}>試下其他關鍵字</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const DISCOVER_CARD_SIZE = Math.floor((SCREEN_WIDTH - 64) / 2.5);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F0E' },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#F5F7F4' },

  // Search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8E8E8',
    borderRadius: 24,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 8,
  },
  searchWrapFocused: {
    borderWidth: 2,
    borderColor: '#3DB389',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#0B0F0E', height: 48 },
  clearBtn: { padding: 4 },
  clearIcon: { fontSize: 16, color: '#666' },

  // Chips
  chipsScroll: { marginBottom: 4 },
  chipsContent: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F2925',
  },
  chipActive: {
    backgroundColor: '#3DB389',
  },
  chipText: { fontSize: 14, color: '#9AA696', fontWeight: '500' },
  chipTextActive: { color: '#0B0F0E', fontWeight: '700' },

  // Default view
  defaultScroll: { flex: 1 },
  defaultContent: { paddingBottom: 20 },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#F5F7F4', marginBottom: 10, paddingHorizontal: 16 },

  // Recent
  recentRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  recentIcon: { fontSize: 16, marginRight: 12, width: 20, textAlign: 'center' },
  recentText: { flex: 1, fontSize: 15, color: '#F5F7F4' },
  recentArrow: { fontSize: 14, color: '#9AA696' },

  // Discover
  discoverScroll: { paddingHorizontal: 12, gap: 10 },
  discoverCard: { width: DISCOVER_CARD_SIZE },
  discoverTag: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    alignItems: 'center',
  },
  discoverTagText: {
    fontSize: 13, fontWeight: '700', color: '#F5F7F4',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    overflow: 'hidden',
  },

  // Suggestions
  suggestRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  suggestIcon: { fontSize: 16, marginRight: 12, width: 20, textAlign: 'center' },
  suggestInfo: { flex: 1 },
  suggestText: { fontSize: 15, color: '#F5F7F4' },
  suggestType: { fontSize: 12, color: '#9AA696', marginTop: 1 },
  suggestArrow: { fontSize: 14, color: '#9AA696' },

  // Results
  topLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  topLoadingText: { fontSize: 13, color: '#9AA696' },
  resultList: { flex: 1 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  thumb: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#121A17' },
  resultInfo: { flex: 1, marginLeft: 12 },
  resultTitle: { fontSize: 15, fontWeight: '600', color: '#F5F7F4' },
  resultArtist: { fontSize: 12, color: '#9AA696', marginTop: 2 },
  resultMore: { fontSize: 16, color: '#9AA696', paddingHorizontal: 8, paddingVertical: 4 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#9AA696' },
  emptyHint: { fontSize: 13, color: '#666', marginTop: 6 },
});
