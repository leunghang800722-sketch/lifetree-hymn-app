// FavoritesScreen — 我的最愛 (Spotify「讚好過的歌曲」級)
import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Modal,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFavorites } from '../context/FavoritesContext';
import { usePlaylists } from '../context/PlaylistContext';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function CoverThumb({ hymn }) {
  const [failed, setFailed] = React.useState(false);
  const uri = getCoverUrl(hymn.youtube_id);
  if (!uri || failed) {
    return <View style={styles.thumb}><Text style={styles.thumbIcon}>🎵</Text></View>;
  }
  return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function FavoritesScreen({ onPlayHymn }) {
  const { favorites, toggleFavorite } = useFavorites();
  const { playlists, addToPlaylist } = usePlaylists();
  const [showPlModal, setShowPlModal] = useState(false);
  const [plTargetHymn, setPlTargetHymn] = useState(null);

  const handlePlay = useCallback((item) => {
    if (onPlayHymn) onPlayHymn(item);
  }, [onPlayHymn]);

  const handlePlayAll = useCallback(() => {
    if (favorites.length > 0 && onPlayHymn) {
      onPlayHymn(favorites[0], { mode: 'audio', playlist: favorites });
    }
  }, [favorites, onPlayHymn]);

  const handleShuffle = useCallback(() => {
    if (favorites.length > 0 && onPlayHymn) {
      const shuffled = [...favorites].sort(() => Math.random() - 0.5);
      onPlayHymn(shuffled[0], { mode: 'audio', playlist: shuffled, shuffle: true });
    }
  }, [favorites, onPlayHymn]);

  const handleAddToPlaylist = useCallback((playlistId) => {
    if (plTargetHymn) {
      addToPlaylist(playlistId, plTargetHymn);
    }
    setShowPlModal(false);
    setPlTargetHymn(null);
  }, [plTargetHymn, addToPlaylist]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>我的最愛</Text>
          <Text style={styles.subtitle}>{favorites.length > 0 ? `共 ${favorites.length} 首詩歌` : '未有收藏詩歌'}</Text>
        </View>
      </View>

      {/* Action bar (when has songs) */}
      {favorites.length > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}>
            <MaterialIcons name="play-arrow" size={22} color="#000" />
            <Text style={styles.playAllText}>全部播放</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shuffleBtn} onPress={handleShuffle}>
            <MaterialIcons name="shuffle" size={20} color="#A0A0A0" />
          </TouchableOpacity>
        </View>
      )}

      {favorites.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyGraphic}>
            <MaterialIcons name="favorite-border" size={64} color="#2A2A2A" />
          </View>
          <Text style={styles.emptyTitle}>收藏你喜愛的詩歌</Text>
          <Text style={styles.emptyHint}>喺 Mini Player 或歌曲選單點 ♥</Text>
          <Text style={styles.emptyHint}>收藏會出現在這裡</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => handlePlay(item)} activeOpacity={0.7}>
              <CoverThumb hymn={item} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <TouchableOpacity style={styles.moreBtn} onPress={() => { setPlTargetHymn(item); setShowPlModal(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="more-horiz" size={20} color="#A0A0A0" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.favBtn} onPress={() => toggleFavorite(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="favorite" size={22} color="#1ED760" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Add to playlist modal */}
      {showPlModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => { setShowPlModal(false); setPlTargetHymn(null); }}>
          <TouchableOpacity style={plStyles.overlay} activeOpacity={1} onPress={() => { setShowPlModal(false); setPlTargetHymn(null); }}>
            <View style={plStyles.card}>
              <Text style={plStyles.title}>加入播放清單</Text>
              {playlists.length === 0 ? (
                <Text style={plStyles.empty}>尚未建立播放清單，請去「清單」tab 建立</Text>
              ) : (
                playlists.map(pl => (
                  <TouchableOpacity key={pl.id} style={plStyles.item} onPress={() => handleAddToPlaylist(pl.id)}>
                    <MaterialIcons name={pl.type === 'video' ? 'videocam' : 'music-note'} size={18} color={pl.type === 'video' ? '#64B5F6' : '#A0A0A0'} />
                    <Text style={plStyles.itemText}>{pl.name}</Text>
                    <Text style={plStyles.itemCount}>{pl.hymns.length} 首</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const plStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 },
  title: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 14 },
  empty: { fontSize: 14, color: '#A0A0A0', textAlign: 'center', paddingVertical: 20 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  itemText: { flex: 1, fontSize: 15, color: '#FFFFFF', marginLeft: 10 },
  itemCount: { fontSize: 12, color: '#A0A0A0' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#A0A0A0', marginTop: 4 },

  // Action bar
  actionBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  playAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1ED760', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, gap: 4 },
  playAllText: { fontSize: 15, fontWeight: '700', color: '#000000' },
  shuffleBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyGraphic: { alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#A0A0A0' },

  // List
  listContent: { paddingBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  thumbIcon: { fontSize: 20 },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  itemArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 2 },
  moreBtn: { padding: 6, marginRight: 4 },
  favBtn: { padding: 6 },
});
