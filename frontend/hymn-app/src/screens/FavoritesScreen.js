// FavoritesScreen — 我的最愛（配合 FavoritesContext）
import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFavorites } from '../context/FavoritesContext';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function CoverThumb({ hymn }) {
  const [failed, setFailed] = React.useState(false);
  const uri = getCoverUrl(hymn.youtube_id);
  if (!uri || failed) {
    return (
      <View style={styles.thumb}>
        <Text style={styles.thumbIcon}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" onError={() => setFailed(true)} />
  );
}

export default function FavoritesScreen({ onPlayHymn }) {
  const { favorites, toggleFavorite } = useFavorites();

  const handlePlay = useCallback((item) => {
    if (onPlayHymn) onPlayHymn(item);
  }, [onPlayHymn]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>我的最愛</Text>
        {favorites.length > 0 && (
          <Text style={styles.count}>共 {favorites.length} 首</Text>
        )}
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="favorite-border" size={48} color="#2A2A2A" />
          </View>
          <Text style={styles.emptyTitle}>未有收藏詩歌</Text>
          <Text style={styles.emptyHint}>喺 Mini Player 點 ♥ 加入收藏</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => handlePlay(item)}
              activeOpacity={0.7}
            >
              <CoverThumb hymn={item} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <TouchableOpacity
                style={styles.favBtn}
                onPress={() => toggleFavorite(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="favorite" size={22} color="#1ED760" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  count: { fontSize: 13, color: '#A0A0A0' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#A0A0A0' },

  // List
  listContent: { paddingBottom: 20 },
  separator: { height: 1, backgroundColor: '#1A1A1A', marginLeft: 70 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 20,
  },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  thumbIcon: { fontSize: 20 },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  itemArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 2 },
  favBtn: { padding: 6 },
});
