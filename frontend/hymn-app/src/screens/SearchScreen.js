import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { searchApi } from '../services/searchApi';

export default function SearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all, title, artist, lyrics, album
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (searchQuery, tab = activeTab) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      let data;
      switch (tab) {
        case 'all':
          data = await searchApi.searchAll(searchQuery);
          break;
        case 'title':
          data = await searchApi.searchTitle(searchQuery);
          break;
        case 'artist':
          data = await searchApi.searchArtist(searchQuery);
          break;
        case 'lyrics':
          data = await searchApi.searchLyrics(searchQuery);
          break;
        case 'album':
          data = await searchApi.searchAlbum(searchQuery);
          break;
      }
      setResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (query.trim()) {
      handleSearch(query, tab);
    }
  };

  const handlePlayHymn = (hymn) => {
    navigation.navigate('Player', { hymn });
  };

  return (
    <View style={styles.container}>
      {/* 搜尋框 */}
      <TextInput
        style={styles.searchInput}
        placeholder="搜尋歌名、歌手、歌詞..."
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          handleSearch(text);
        }}
        autoFocus
        returnKeyType="search"
      />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {[
          { key: 'all', label: '全部' },
          { key: 'title', label: '歌名' },
          { key: 'artist', label: '歌手' },
          { key: 'lyrics', label: '歌詞' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
            onPress={() => handleTabChange(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 載入中 */}
      {loading && <ActivityIndicator size="large" color="#A8C765" style={styles.loader} />}

      {/* 搜尋結果 */}
      {!loading && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handlePlayHymn(item)}
            >
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.artist}>{item.artist}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.trim() ? (
              <Text style={styles.emptyText}>未找到結果</Text>
            ) : (
              <Text style={styles.emptyText}>輸入關鍵字搜尋詩歌</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchInput: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 20,
    margin: 16,
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#A8C765',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#A8C765',
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 50,
  },
  resultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#999',
  },
});
