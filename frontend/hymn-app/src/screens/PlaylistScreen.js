// PlaylistScreen — 我的音樂庫 (設計稿 v1)
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
  Modal, TextInput, Alert, Dimensions,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePlaylists } from '../context/PlaylistContext';
import { useFavorites } from '../context/FavoritesContext';

const CARD_SIZE = 56;
const BIG_COVER = 120;

function CoverThumb({ youtubeId, size = CARD_SIZE, type }) {
  const [failed, setFailed] = React.useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, borderRadius: type === 'video' ? 6 : 8, backgroundColor: type === 'video' ? '#1A237E' : '#1A1A1A' }]}>
        <MaterialIcons name={type === 'video' ? 'videocam' : 'music-note'} size={size * 0.35} color="#555" />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size, borderRadius: type === 'video' ? 6 : 8 }]} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function PlaylistScreen({ onPlayHymn }) {
  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, removeFromPlaylist } = usePlaylists();
  const { favorites, toggleFavorite } = useFavorites();
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('music');
  const [showDetail, setShowDetail] = useState(null);

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    await createPlaylist(createName.trim(), createType);
    setCreateName('');
    setShowCreate(false);
  }, [createName, createType, createPlaylist]);

  const handlePlayAll = useCallback((pl) => {
    if (pl.hymns.length === 0) return;
    const mode = pl.type === 'video' ? 'video' : 'audio';
    if (onPlayHymn) onPlayHymn(pl.hymns[0], { mode, playlist: pl.hymns, playlistName: pl.name });
  }, [onPlayHymn]);

  const handleDelete = useCallback((pl) => {
    Alert.alert('刪除清單', `「${pl.name}」將被刪除`, [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: () => deletePlaylist(pl.id) },
    ]);
  }, [deletePlaylist]);

  const handleAddToPlaylist = useCallback((hymn) => {
    Alert.alert('加入播放清單', '請在清單頁使用「加入播放清單」功能', [{ text: '好的' }]);
  }, []);

  // Combined: system favorites first, then user playlists
  const allItems = [
    { id: '__favorites__', name: '我的最愛', type: 'system', hymns: favorites },
    ...playlists,
  ];

  return (
    <View style={styles.container}>
      {/* 1A/1B Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>我的音樂庫</Text>
          <Text style={styles.subtitle}>共 {allItems.length} 個清單</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <MaterialIcons name="add" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* 1B Empty */}
      {allItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconBg}>
            <MaterialIcons name="library-music" size={40} color="#2A2A2A" />
          </View>
          <Text style={styles.emptyTitle}>建立你的第一個播放清單</Text>
          <Text style={styles.emptyHint}>音樂清單可背景播放；影音清單可前景觀看</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
            <MaterialIcons name="add" size={18} color="#000" />
            <Text style={styles.emptyBtnText}>建立播放清單</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* 1A List */
        <FlatList
          data={allItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => setShowDetail(item)} activeOpacity={0.7}>
              <CoverThumb youtubeId={item.hymns?.[0]?.youtube_id} type={item.type === 'video' ? 'video' : 'music'} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.rowMeta}>
                  <View style={[styles.typeTag, { backgroundColor: item.type === 'video' ? 'rgba(100,181,246,0.15)' : item.type === 'system' ? 'rgba(30,215,96,0.15)' : 'rgba(160,160,160,0.15)' }]}>
                    <MaterialIcons name={item.type === 'video' ? 'videocam' : item.type === 'system' ? 'favorite' : 'music-note'} size={12} color={item.type === 'video' ? '#64B5F6' : item.type === 'system' ? '#1ED760' : '#A0A0A0'} />
                    <Text style={[styles.typeText, { color: item.type === 'video' ? '#64B5F6' : item.type === 'system' ? '#1ED760' : '#A0A0A0' }]}>
                      {item.type === 'video' ? '影音' : item.type === 'system' ? '最愛' : '音樂'}
                    </Text>
                  </View>
                  <Text style={styles.rowCount}>{item.hymns?.length || 0} 首</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#555" />
            </TouchableOpacity>
          )}
        />
      )}

      {/* 1C Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCreate(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>建立播放清單</Text>
            <TextInput style={styles.modalInput} placeholder="清單名稱" placeholderTextColor="#666" value={createName} onChangeText={setCreateName} autoFocus />

            <TouchableOpacity style={styles.radioRow} onPress={() => setCreateType('music')}>
              <View style={styles.radioCircle}>{createType === 'music' && <View style={styles.radioDot} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioTitle}>音樂清單</Text>
                <Text style={styles.radioHint}>音訊 · 可背景播放</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.radioRow} onPress={() => setCreateType('video')}>
              <View style={styles.radioCircle}>{createType === 'video' && <View style={styles.radioDot} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioTitle}>影音清單</Text>
                <Text style={styles.radioHint}>影片 · 前景播放</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setShowCreate(false); setCreateName(''); }}>
                <Text style={styles.cancelBtn}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, !createName.trim() && { opacity: 0.4 }]} onPress={handleCreate} disabled={!createName.trim()}>
                <Text style={styles.createBtnText}>建立</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 1D/1E Detail Modal */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setShowDetail(null)}>
              <MaterialIcons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {showDetail && (
            <>
              {/* Big cover + info */}
              <View style={styles.detailTop}>
                <CoverThumb youtubeId={showDetail.hymns?.[0]?.youtube_id} size={BIG_COVER} type={showDetail.type} />
                <Text style={styles.detailName}>{showDetail.name}</Text>
                <Text style={styles.detailMeta}>
                  {showDetail.type === 'video' ? '影音' : showDetail.type === 'system' ? '最愛' : '音樂'} · {showDetail.hymns?.length || 0} 首
                </Text>
              </View>

              {/* Action buttons */}
              {showDetail.hymns?.length > 0 && (
                <View style={styles.detailActions}>
                  <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlayAll(showDetail)}>
                    <MaterialIcons name="play-arrow" size={20} color="#000" />
                    <Text style={styles.playAllText}>全部播放</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shuffleBtn} onPress={() => {
                    const shuffled = [...showDetail.hymns].sort(() => Math.random() - 0.5);
                    if (onPlayHymn) onPlayHymn(shuffled[0], { mode: showDetail.type === 'video' ? 'video' : 'audio', playlist: shuffled });
                  }}>
                    <MaterialIcons name="shuffle" size={18} color="#A0A0A0" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Song list or empty */}
              {showDetail.hymns?.length === 0 ? (
                <View style={styles.detailEmpty}>
                  <Text style={styles.detailEmptyText}>清單未有詩歌</Text>
                  <Text style={styles.detailEmptyHint}>喺歌曲選單選「加入播放清單」</Text>
                  <TouchableOpacity onPress={() => setShowDetail(null)}>
                    <Text style={styles.detailBackLink}>返回音樂庫</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={showDetail.hymns}
                  keyExtractor={(item, i) => `${item.id}-${i}`}
                  contentContainerStyle={styles.detailList}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.detailRow}
                      onPress={() => {
                        const mode = showDetail.type === 'video' ? 'video' : 'audio';
                        if (onPlayHymn) onPlayHymn(item, { mode, playlist: showDetail.hymns, playlistName: showDetail.name });
                        setShowDetail(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <CoverThumb youtubeId={item.youtube_id} size={CARD_SIZE} type={showDetail.type} />
                      <View style={styles.detailRowInfo}>
                        <Text style={styles.detailRowTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.detailRowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
                      </View>
                      {showDetail.type !== 'system' && (
                        <TouchableOpacity onPress={() => {
                          Alert.alert('移除', `從「${showDetail.name}」移除？`, [
                            { text: '取消', style: 'cancel' },
                            { text: '移除', style: 'destructive', onPress: () => removeFromPlaylist(showDetail.id, item.id) },
                          ]);
                        }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name="more-horiz" size={20} color="#555" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#A0A0A0', marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1ED760', justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 40 },
  emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: '#A0A0A0', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1ED760', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, gap: 6 },

  // Row
  listContent: { paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  cover: { justifyContent: 'center', alignItems: 'center' },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  typeTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  typeText: { fontSize: 10, fontWeight: '700' },
  rowCount: { fontSize: 12, color: '#A0A0A0' },
  rowArrow: { fontSize: 18, color: '#555' },

  // Create Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 },
  modalCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 16 },
  modalInput: { backgroundColor: '#121212', borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 16, color: '#FFFFFF', marginBottom: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#1ED760', justifyContent: 'center', alignItems: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1ED760' },
  radioTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  radioHint: { fontSize: 12, color: '#A0A0A0', marginTop: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelBtn: { fontSize: 16, fontWeight: '600', color: '#A0A0A0', paddingVertical: 12, paddingHorizontal: 16 },
  createBtn: { backgroundColor: '#1ED760', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#000000' },

  // Detail
  detailContainer: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  detailHeader: { paddingHorizontal: 16, paddingBottom: 8 },
  detailTop: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  detailName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  detailMeta: { fontSize: 13, color: '#A0A0A0', marginTop: 4 },
  detailActions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  playAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1ED760', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, gap: 4 },
  playAllText: { fontSize: 15, fontWeight: '700', color: '#000000' },
  shuffleBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center' },
  detailList: { paddingBottom: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  detailRowInfo: { flex: 1, marginLeft: 12 },
  detailRowTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  detailRowArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 1 },
  detailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  detailEmptyText: { fontSize: 15, color: '#FFFFFF', fontWeight: '600', marginBottom: 4 },
  detailEmptyHint: { fontSize: 13, color: '#A0A0A0', marginBottom: 16 },
  detailBackLink: { fontSize: 14, color: '#1ED760', fontWeight: '600' },
});
