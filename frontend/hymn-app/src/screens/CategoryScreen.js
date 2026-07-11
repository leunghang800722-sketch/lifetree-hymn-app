import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { categoryApi } from '../services/categoryApi';

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

  const handleLanguageCategory = async (categoryFn, title) => {
    setLoading(true);
    try {
      const hymns = await categoryFn();
      showHymnList(hymns, title);
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
      showHymnList(hymns, artistName);
    } catch (error) {
      console.error('Load artist hymns error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Section Tabs */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[
            styles.sectionTab,
            activeSection === 'language' && styles.activeSectionTab,
          ]}
          onPress={() => setActiveSection('language')}
        >
          <Text
            style={[
              styles.sectionTabText,
              activeSection === 'language' && styles.activeSectionTabText,
            ]}
          >
            語言分類
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sectionTab,
            activeSection === 'artist' && styles.activeSectionTab,
          ]}
          onPress={() => setActiveSection('artist')}
        >
          <Text
            style={[
              styles.sectionTabText,
              activeSection === 'artist' && styles.activeSectionTabText,
            ]}
          >
            歌手分類
          </Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#1ED760" style={styles.loader} />}

      {/* Language Categories */}
      {activeSection === 'language' && !loading && (
        <View style={styles.content}>
          <CategoryButton
            title="🇨🇳 國語詩歌"
            subtitle="241 首"
            onPress={() => handleLanguageCategory(categoryApi.getMandarin, '國語詩歌')}
          />
          <CategoryButton
            title="🇭🇰 粵語詩歌"
            subtitle="170 首"
            onPress={() => handleLanguageCategory(categoryApi.getCantonese, '粵語詩歌')}
          />
          <CategoryButton
            title="🇺🇸 英文詩歌"
            subtitle="254 首"
            onPress={() => handleLanguageCategory(categoryApi.getEnglish, '英文詩歌')}
          />
          <CategoryButton
            title="🇨🇳 所有中文"
            subtitle="411 首（國語+粵語）"
            onPress={() => handleLanguageCategory(categoryApi.getChinese, '所有中文')}
          />
        </View>
      )}

      {/* Artist Categories */}
      {activeSection === 'artist' && !loading && (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.artist}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.artistItem}
              onPress={() => handleArtistCategory(item.artist)}
            >
              <Text style={styles.artistName}>{item.artist}</Text>
              <Text style={styles.artistCount}>{item.count} 首</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.artistList}
        />
      )}
    </View>
  );
}

function CategoryButton({ title, subtitle, onPress }) {
  return (
    <TouchableOpacity style={styles.categoryButton} onPress={onPress}>
      <Text style={styles.categoryTitle}>{title}</Text>
      <Text style={styles.categorySubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  sectionTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeSectionTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#1ED760',
  },
  sectionTabText: {
    fontSize: 16,
    color: '#666',
  },
  activeSectionTabText: {
    color: '#1ED760',
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 50,
  },
  content: {
    padding: 16,
  },
  categoryButton: {
    backgroundColor: '#f8f8f8',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  categorySubtitle: {
    fontSize: 14,
    color: '#666',
  },
  artistList: {
    padding: 16,
  },
  artistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  artistName: {
    fontSize: 16,
    fontWeight: '500',
  },
  artistCount: {
    fontSize: 14,
    color: '#666',
  },
});
