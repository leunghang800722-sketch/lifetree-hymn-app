// 搜尋畫面
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fetchHymns } from '../api';
import { getAlbumCoverUrl } from '../utils/albumCover';

export default function SearchScreen() {
  const navigation = useNavigation();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (search.trim().length > 0) {
      doSearch();
    } else {
      setResults([]);
      setHasSearched(false);
    }
  }, [search]);

  async function doSearch() {
    if (!search.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await fetchHymns(search);
      setResults(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  function handleHymnPress(hymn) {
    navigation.navigate('Player', { hymnId: hymn.id });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔍 搜尋詩歌</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="輸入詩歌名、歌手..."
            placeholderTextColor="#6B7D65"
            value={search}
            onChangeText={setSearch}
            autoFocus={true}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F5E6CA" />
        </View>
      ) : hasSearched && results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>😢</Text>
          <Text style={styles.emptyText}>搵唔到詩歌</Text>
          <Text style={styles.emptyHint}>試下其他關鍵字</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.hymnItem}
              onPress={() => handleHymnPress(item)}
            >
              <Image
                source={{ uri: getAlbumCoverUrl(item.youtube_id) }}
                style={styles.hymnCover}
              />
              <View style={styles.hymnInfo}>
                <Text style={styles.hymnTitle}>{item.title}</Text>
                <View style={styles.hymnMetaRow}>
                  <Text style={styles.hymnArtist}>{item.artist}</Text>
                  {item.album ? <Text style={styles.hymnAlbum}> · {item.album}</Text> : null}
                </View>
              </View>
              <View style={[
                styles.hymnBadge,
                { backgroundColor: (item.lang || item.category) === '粵語' ? '#065F46' : (item.lang || item.category) === '國語' ? '#1E40AF' : '#7C3AED' }
              ]}>
                <Text style={styles.hymnBadgeText}>{item.lang || item.category}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !hasSearched ? (
              <View style={styles.center}>
                <Text style={styles.emptyEmoji}>🎵</Text>
                <Text style={styles.emptyHint}>輸入關鍵字搜尋詩歌</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1A16',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 85,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E26',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
  },
  clearBtn: {
    fontSize: 16,
    color: '#6B7D65',
    paddingLeft: 8,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  hymnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E26',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  hymnCover: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#0F1A16',
    marginRight: 12,
  },
  hymnNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2D2A5E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hymnNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5E6CA',
  },
  hymnInfo: {
    flex: 1,
  },
  hymnTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  hymnArtist: {
    fontSize: 12,
    color: '#8B9D83',
    marginTop: 2,
  },
  hymnMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  hymnAlbum: {
    fontSize: 12,
    color: '#6B7D65',
  },
  hymnBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hymnBadgeText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  emptyEmoji: {
    fontSize: 50,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: '#6B7D65',
    marginTop: 4,
  },
});
