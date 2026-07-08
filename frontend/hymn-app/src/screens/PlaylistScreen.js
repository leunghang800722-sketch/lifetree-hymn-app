// 播放清單畫面

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  fetchPlaylists,
  createPlaylist,
  deletePlaylist,
  fetchPlaylistHymns,
  addHymnToPlaylist,
  removeHymnFromPlaylist,
} from '../api';

export default function PlaylistScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistHymns, setPlaylistHymns] = useState([]);
  const [showHymns, setShowHymns] = useState(false);

  const loadPlaylists = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchPlaylists();
      setPlaylists(data);
    } catch (err) {
      console.log('Load playlists error:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadPlaylists);
    return unsubscribe;
  }, [navigation, loadPlaylists]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  async function handleCreate() {
    if (!newName.trim()) {
      Alert.alert('錯誤', '請輸入播放清單名稱');
      return;
    }
    try {
      await createPlaylist(newName.trim());
      setShowCreate(false);
      setNewName('');
      loadPlaylists();
    } catch (err) {
      Alert.alert('錯誤', err.message);
    }
  }

  async function handleDelete(id) {
    Alert.alert('刪除播放清單', '確定要刪除嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlaylist(id);
            loadPlaylists();
          } catch (err) {
            Alert.alert('錯誤', err.message);
          }
        },
      },
    ]);
  }

  async function openPlaylist(playlist) {
    setSelectedPlaylist(playlist);
    setShowHymns(true);
    try {
      const hymns = await fetchPlaylistHymns(playlist.id);
      setPlaylistHymns(hymns);
    } catch (err) {
      Alert.alert('錯誤', err.message);
    }
  }

  function openYouTube(hymn) {
    if (!hymn || !hymn.youtube_id) return;
    const url = `https://www.youtube.com/watch?v=${hymn.youtube_id}`;
    const intent = `intent://watch?v=${hymn.youtube_id}#Intent;package=com.google.android.youtube;scheme=https;end`;
    Linking.canOpenURL(intent).then(can => {
      if (can) Linking.openURL(intent);
      else Linking.openURL(url);
    }).catch(() => Linking.openURL(url));
  }

  async function playAllPlaylist() {
    if (!selectedPlaylist || playlistHymns.length === 0) return;
    // Open first hymn in YouTube
    openYouTube(playlistHymns[0]);
  }

  async function handleRemoveHymn(hymnId) {
    if (!selectedPlaylist) return;
    try {
      await removeHymnFromPlaylist(selectedPlaylist.id, hymnId);
      setPlaylistHymns(prev => prev.filter(h => h.id !== hymnId));
    } catch (err) {
      Alert.alert('錯誤', err.message);
    }
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyIcon}>🔒</Text>
        <Text style={styles.emptyTitle}>請先登入</Text>
        <Text style={styles.emptySubtitle}>登入後可以使用播放清單功能</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F5E6CA" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的播放清單</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowCreate(true)}
        >
          <Text style={styles.addBtnText}>+ 新增</Text>
        </TouchableOpacity>
      </View>

      {playlists.length === 0 ? (
        <View style={[styles.container, styles.center]}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>未有播放清單</Text>
          <Text style={styles.emptySubtitle}>按「+ 新增」建立你的第一個播放清單</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.playlistCard}
              onPress={() => openPlaylist(item)}
              onLongPress={() => handleDelete(item.id)}
            >
              <View style={styles.playlistIcon}>
                <Text style={styles.playlistEmoji}>🎵</Text>
              </View>
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistName}>{item.name}</Text>
                <Text style={styles.playlistCount}>
                  {item.hymn_count} 首詩歌
                </Text>
              </View>
              <Text style={styles.arrowIcon}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>新增播放清單</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="播放清單名稱"
              placeholderTextColor="#6B7D65"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowCreate(false);
                  setNewName('');
                }}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleCreate}
              >
                <Text style={styles.modalConfirmText}>建立</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Playlist Hymns Modal */}
      <Modal visible={showHymns} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowHymns(false)}>
              <Text style={styles.backText}>← 返回</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {selectedPlaylist?.name || '播放清單'}
            </Text>
            {playlistHymns.length > 0 && (
              <TouchableOpacity
                style={styles.playAllBtn}
                onPress={playAllPlaylist}
              >
                <Text style={styles.playAllText}>全部播放</Text>
              </TouchableOpacity>
            )}
          </View>

          {playlistHymns.length === 0 ? (
            <View style={[styles.container, styles.center]}>
              <Text style={styles.emptyIcon}>🎶</Text>
              <Text style={styles.emptyTitle}>未有詩歌</Text>
              <Text style={styles.emptySubtitle}>
                喺詩歌頁面可以將詩歌加入播放清單
              </Text>
            </View>
          ) : (
            <FlatList
              data={playlistHymns}
              keyExtractor={item => String(item.id)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.hymnItem}
                  onPress={() => openYouTube(item)}
                  onLongPress={() => handleRemoveHymn(item.id)}
                >
                  <Text style={styles.hymnIndex}>{index + 1}</Text>
                  <View style={styles.hymnInfo}>
                    <Text style={styles.hymnTitle}>{item.title}</Text>
                    <Text style={styles.hymnArtist}>{item.artist}</Text>
                  </View>
                  <Text style={styles.hymnPlayIcon}>▶</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1A16',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  backText: {
    color: '#8B9D83',
    fontSize: 16,
  },
  addBtn: {
    backgroundColor: '#1A2E26',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addBtnText: {
    color: '#F5E6CA',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E26',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  playlistIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#0F1A16',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  playlistEmoji: {
    fontSize: 26,
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  playlistCount: {
    color: '#8B9D83',
    fontSize: 13,
    marginTop: 4,
  },
  arrowIcon: {
    color: '#6B7D65',
    fontSize: 24,
  },
  // Empty state
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#6B7D65',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1A2E26',
    borderRadius: 18,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F1A16',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    color: '#8B9D83',
    fontSize: 16,
  },
  modalConfirmBtn: {
    backgroundColor: '#F5E6CA',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalConfirmText: {
    color: '#0F1A16',
    fontSize: 16,
    fontWeight: '600',
  },
  // Playlist hymns
  playAllBtn: {
    backgroundColor: '#1A2E26',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  playAllText: {
    color: '#F5E6CA',
    fontSize: 13,
    fontWeight: '600',
  },
  hymnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E26',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  hymnIndex: {
    width: 28,
    color: '#6B7D65',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginRight: 12,
  },
  hymnInfo: {
    flex: 1,
  },
  hymnTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  hymnArtist: {
    color: '#8B9D83',
    fontSize: 12,
    marginTop: 2,
  },
  hymnPlayIcon: {
    color: '#F5E6CA',
    fontSize: 18,
  },
});
