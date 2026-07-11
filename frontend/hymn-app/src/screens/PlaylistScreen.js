// PlaylistScreen — 我的音樂庫 (A 音樂清單 / B 影音清單 / C 最愛)
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  Modal, TextInput, Alert, Dimensions,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePlaylists } from '../context/PlaylistContext';
import { useFavorites } from '../context/FavoritesContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function CoverThumb({ youtubeId, size = 48, type }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, borderRadius: type === 'video' ? 6 : 8, backgroundColor: type === 'video' ? '#1A237E' : '#1A1A1A' }]}>
        <MaterialIcons name={type === 'video' ? 'videocam' : 'music-note'} size={size * 0.4} color="#555" />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size, borderRadius: type === 'video' ? 6 : 8 }]} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function PlaylistScreen({ onPlayHymn }) {
  const { playlists, createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist } = usePlaylists();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('music');
  const [showDetail, setShowDetail] = useState(null); // playlist object or null
  const [showAddTo, setShowAddTo] = useState(null); // hymn object to add

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) { Alert.alert('請輸入清單名稱'); return; }
    await createPlaylist(createName.trim(), createType);
    setCreateName('');
    setShowCreate(false);
  }, [createName, createType, createPlaylist]);

  const handlePlayPlaylist = useCallback((pl) => {
    if (pl.hymns.length === 0) return;
    // Pass mode: 'audio' for music/fav, 'video' for video playlists
    // Also pass the full playlist for queue support
    const mode = pl.type === 'video' ? 'video' : 'audio';
    if (onPlayHymn) onPlayHymn(pl.hymns[0], { mode, playlist: pl.hymns, playlistName: pl.name });
  }, [onPlayHymn]);

  const handleDelete = useCallback((pl) => {
    Alert.alert('刪除清單', `確定刪除「${pl.name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: () => deletePlaylist(pl.id) },
    ]);
  }, [deletePlaylist]);

  // Combined data: user playlists + system favorites item
  const allItems = [
    ...(favorites.length > 0 ? [{ id: '__favorites__', name: '我的最愛', type: 'system', hymns: favorites, count: favorites.length }] : []),
    ...playlists,
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>播放清單</Text>
          <Text style={styles.subtitle}>共 {allItems.length} 個清單</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <MaterialIcons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      {allItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconBg}>
            <MaterialIcons name="library-music" size={40} color="#2A2A2A" />
          </View>
          <Text style={styles.emptyTitle}>尚未建立播放清單</Text>
          <Text style={styles.emptyHint}>點右上 + 建立音樂清單或影音清單</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
            <MaterialIcons name="add" size={18} color="#000" />
            <Text style={styles.emptyBtnText}>建立播放清單</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.plItem} onPress={() => {
              if (item.id === '__favorites__') return; // handled by tab
              setShowDetail(item);
            }} activeOpacity={0.7}>
              <CoverThumb youtubeId={item.hymns?.[0]?.youtube_id} size={52} type={item.type === 'video' ? 'video' : 'music'} />
              <View style={styles.plInfo}>
                <Text style={styles.plName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.plMeta}>
                  <View style={styles.plTypeTag}>
                    <MaterialIcons name={item.type === 'video' ? 'videocam' : item.type === 'system' ? 'favorite' : 'music-note'} size={12} color={item.type === 'video' ? '#64B5F6' : item.type === 'system' ? '#1ED760' : '#A0A0A0'} />
                    <Text style={[styles.plTypeText, { color: item.type === 'video' ? '#64B5F6' : item.type === 'system' ? '#1ED760' : '#A0A0A0' }]}>
                      {item.type === 'video' ? '影音' : item.type === 'system' ? '最愛' : '音樂'}
                    </Text>
                  </View>
                  <Text style={styles.plCount}>{item.hymns?.length || 0} 首</Text>
                </View>
              </View>
              {item.type !== 'system' && (
                <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="more-vert" size={20} color="#555" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCreate(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>建立播放清單</Text>
            <TextInput style={styles.modalInput} placeholder="清單名稱" placeholderTextColor="#666" value={createName} onChangeText={setCreateName} autoFocus />
            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.typeBtn, createType === 'music' && styles.typeBtnActive]} onPress={() => setCreateType('music')}>
                <MaterialIcons name="music-note" size={20} color={createType === 'music' ? '#1ED760' : '#A0A0A0'} />
                <Text style={[styles.typeBtnText, createType === 'music' && { color: '#1ED760' }]}>音樂（背景）</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, createType === 'video' && styles.typeBtnActive]} onPress={() => setCreateType('video')}>
                <MaterialIcons name="videocam" size={20} color={createType === 'video' ? '#1ED760' : '#A0A0A0'} />
                <Text style={[styles.typeBtnText, createType === 'video' && { color: '#1ED760' }]}>影音（前景）</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.createSubmit} onPress={handleCreate}>
              <Text style={styles.createSubmitText}>建立</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(null)}>
              <MaterialIcons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.detailInfo}>
              <Text style={styles.detailTitle} numberOfLines={1}>{showDetail?.name || ''}</Text>
              <Text style={styles.detailMeta}>{showDetail?.hymns?.length || 0} 首</Text>
            </View>
            {showDetail?.hymns?.length > 0 && (
              <TouchableOpacity onPress={() => handlePlayPlaylist(showDetail)}>
                <MaterialIcons name="play-circle-filled" size={32} color="#1ED760" />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={showDetail?.hymns || []}
            keyExtractor={(item, i) => `${item.id}-${i}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.detailItem} onPress={() => { 
                const mode = showDetail?.type === 'video' ? 'video' : 'audio';
                if (onPlayHymn) onPlayHymn(item, { mode, playlist: showDetail?.hymns, playlistName: showDetail?.name }); 
                setShowDetail(null); 
              }} activeOpacity={0.7}>
                <CoverThumb youtubeId={item.youtube_id} size={40} type={showDetail?.type === 'video' ? 'video' : 'music'} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.detailSongTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.detailSongArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
                </View>
                <TouchableOpacity onPress={() => removeFromPlaylist(showDetail?.id, item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="remove-circle-outline" size={20} color="#A0A0A0" />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>清單係空嘅</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#A0A0A0', marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1ED760', justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 40 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1ED760', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 6 },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#000000' },

  // List
  listContent: { paddingBottom: 20 },
  plItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  cover: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A' },
  plInfo: { flex: 1, marginLeft: 12 },
  plName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  plMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 },
  plTypeTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  plTypeText: { fontSize: 11, fontWeight: '600' },
  plCount: { fontSize: 12, color: '#A0A0A0' },

  // Create modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  modalCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 16 },
  modalInput: { backgroundColor: '#2A2A2A', borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 16, color: '#FFFFFF', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2A2A2A' },
  typeBtnActive: { borderWidth: 1.5, borderColor: '#1ED760' },
  typeBtnText: { fontSize: 13, color: '#A0A0A0', fontWeight: '600' },
  createSubmit: { backgroundColor: '#1ED760', borderRadius: 10, height: 48, justifyContent: 'center', alignItems: 'center' },
  createSubmitText: { fontSize: 17, fontWeight: '700', color: '#000000' },

  // Detail modal
  detailContainer: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  detailInfo: { flex: 1 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  detailMeta: { fontSize: 12, color: '#A0A0A0', marginTop: 2 },
  detailItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  detailSongTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  detailSongArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 1 },
  emptyText: { fontSize: 14, color: '#A0A0A0', textAlign: 'center', paddingVertical: 40 },
});
