// 畫面 1：詩歌列表
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { fetchHymns, fetchCategories } from '../api';
import { useFavorites } from '../context/FavoritesContext';

export default function HymnListScreen({ navigation, route }) {
  const [hymns, setHymns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(route?.params?.category || '');
  const [search, setSearch] = useState(route?.params?.search || '');
  const [loading, setLoading] = useState(true);
  const { toggleFavorite, isFavorite } = useFavorites();

  // Listen for route params changes (coming from Home screen)
  useEffect(() => {
    if (route?.params?.category !== undefined) {
      setSelectedCategory(route.params.category);
    }
    if (route?.params?.search !== undefined) {
      setSearch(route.params.search);
    }
  }, [route?.params?.category, route?.params?.search]);

  async function loadHymns() {
    setLoading(true);
    try {
      const data = await fetchHymns(search, selectedCategory);
      setHymns(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function loadCategories() {
    try {
      const data = await fetchCategories();
      setCategories(['全部', ...data]);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHymns();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedCategory]);

  function renderHymn({ item }) {
    const fav = isFavorite(item.id);
    return (
      <TouchableOpacity
        style={styles.hymnItem}
        onPress={() => navigation.navigate('Player', { hymnId: item.id })}
      >
        <View style={styles.hymnInfo}>
          <Text style={styles.hymnTitle}>{item.title}</Text>
          <Text style={styles.hymnArtist}>{item.artist} · {item.duration}</Text>
        </View>
        <TouchableOpacity
          style={styles.favBtn}
          onPress={() => toggleFavorite(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.favIcon}>{fav ? '❤️' : '♡'}</Text>
        </TouchableOpacity>
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A2E26" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎵 詩歌</Text>
        <TextInput
          style={styles.searchBar}
          placeholder="🔍 搜尋詩歌..."
          placeholderTextColor="#8B9D83"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Categories */}
      <View style={styles.categoryRow}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryBtn,
              {
                backgroundColor:
                  selectedCategory === cat || (cat === '全部' && selectedCategory === '')
                    ? '#F5E6CA'
                    : '#E2E8F0',
              },
            ]}
            onPress={() => setSelectedCategory(cat === '全部' ? '' : cat)}
          >
            <Text
              style={[
                styles.categoryText,
                {
                  color:
                    selectedCategory === cat || (cat === '全部' && selectedCategory === '')
                      ? '#FFF'
                      : '#475569',
                },
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#F5E6CA" />
      ) : (
        <FlatList
          data={hymns}
          renderItem={renderHymn}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 20 },
          ]}
          ListEmptyComponent={
            <Text style={styles.emptyText}>搵唔到詩歌 😢</Text>
          }
        />
      )}


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#1A2E26',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
  },
  searchBar: {
    backgroundColor: '#334155',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  categoryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
  },
  hymnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  hymnInfo: {
    flex: 1,
  },
  hymnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  hymnArtist: {
    fontSize: 13,
    color: '#6B7D65',
    marginTop: 4,
  },
  favBtn: {
    paddingHorizontal: 8,
  },
  favIcon: {
    fontSize: 20,
  },
  playIcon: {
    fontSize: 20,
    color: '#F5E6CA',
    marginLeft: 12,
  },
  loader: {
    marginTop: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 40,
  },
  // Mini Player Bar
  miniPlayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A2E26',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 24, // safe area for Android bottom bar
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  miniPlayerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniPlayerInfo: {
    flex: 1,
  },
  miniPlayerTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  miniPlayerArtist: {
    color: '#8B9D83',
    fontSize: 12,
    marginTop: 2,
  },
  miniPlayerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5E6CA',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  miniPlayerIcon: {
    fontSize: 20,
    color: '#FFF',
  },
});
