// 畫面 2：播放器 - 開 YouTube App 播 + 加到播放清單

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchHymnDetail, fetchPlaylists, addHymnToPlaylist, getToken } from '../api';
import { useFavorites } from '../context/FavoritesContext';
import { openYoutubeVideo } from '../utils/openYoutube';

const RECENT_KEY = '@hymn_app_recent';

export default function WebPlayerScreen({ route, navigation }) {
  const { hymnId } = route.params;
  const [hymn, setHymn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const { toggleFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    loadHymn();
  }, [hymnId]);

  async function loadHymn() {
    setLoading(true);
    try {
      const data = await fetchHymnDetail(hymnId);
      setHymn(data);
    } catch (err) {
      Alert.alert('Error', 'Load詩歌失敗');
    }
    setLoading(false);
  }

  async function openYouTubeMusic() {
    if (!hymn || !hymn.youtube_id) return;

    await AsyncStorage.setItem(RECENT_KEY, String(hymn.id)).catch(() => {});

    const ok = await openYoutubeVideo(hymn.youtube_id);
    if (!ok) {
      Alert.alert('錯誤', '開唔到YouTube，請確保已安裝 YouTube App');
    }
  }

  async function openAddToPlaylist() {
    const token = await getToken();
    if (!token) {
      Alert.alert('提示', '請先登入先可以使用播放清單功能');
      return;
    }
    try {
      const data = await fetchPlaylists();
      setPlaylists(data);
      setShowPlaylistModal(true);
    } catch (err) {
      Alert.alert('錯誤', '讀取播放清單失敗');
    }
  }

  async function handleAddToPlaylist(playlist) {
    if (!hymn) return;
    setAddingToPlaylist(true);
    try {
      await addHymnToPlaylist(playlist.id, hymn.id);
      Alert.alert('成功', `已將「${hymn.title}」加入「${playlist.name}」`);
      setShowPlaylistModal(false);
    } catch (err) {
      if (err.message === 'Hymn already in playlist') {
        Alert.alert('提示', '呢首詩歌已經喺播放清單入面');
      } else {
        Alert.alert('錯誤', err.message);
      }
    }
    setAddingToPlaylist(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F5E6CA" />
      </View>
    );
  }

  if (!hymn) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#FFF' }}>Load失敗😢</Text>
      </View>
    );
  }

  const lyrics = hymn.lyrics_array || [];

  if (showLyrics) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowLyrics(false)}>
            <Text style={styles.backText}>← 播放器</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.lyricsContainer}>
          <Text style={styles.lyricsTitle}>{hymn.title}</Text>
          <Text style={styles.lyricsArtist}>{hymn.artist}</Text>
          <View style={styles.divider} />
          {lyrics.map((line, i) => (
            <Text key={i} style={styles.lyricLine}>{line}</Text>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← 詩歌列表</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{hymn.title}</Text>
        <TouchableOpacity
          onPress={() => toggleFavorite(hymn)}
          style={styles.headerFavBtn}
        >
          <Text style={styles.favIcon}>{isFavorite(hymn.id) ? '❤️' : '♡'}</Text>
        </TouchableOpacity>
      </View>

      {/* Cover Art */}
      <View style={styles.playerArea}>
        <View style={styles.coverArt}>
          <Text style={styles.coverEmoji}>🎵</Text>
        </View>
      </View>

      {/* Info Area */}
      <View style={styles.infoArea}>
        <Text style={styles.songTitle}>{hymn.title}</Text>
        <Text style={styles.songArtist}>{hymn.artist}</Text>
        {hymn.duration ? (
          <Text style={styles.duration}>⏱ {hymn.duration}</Text>
        ) : null}

        <Text style={styles.hint}>🎵 會在 YouTube App 播放</Text>

        <TouchableOpacity style={styles.playBtn} onPress={openYouTubeMusic}>
          <Text style={styles.playBtnText}>▶ YouTube 播歌</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addPlaylistBtn}
          onPress={openAddToPlaylist}
        >
          <Text style={styles.addPlaylistBtnText}>+ 加到播放清單</Text>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          {lyrics.length > 0 && (
            <TouchableOpacity
              style={styles.lyricsBtn}
              onPress={() => setShowLyrics(true)}
            >
              <Text style={styles.lyricsBtnText}>📄 歌詞</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Add to Playlist Modal */}
      <Modal visible={showPlaylistModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>加到播放清單</Text>
            {playlists.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>未有播放清單</Text>
                <TouchableOpacity
                  style={styles.modalCreateBtn}
                  onPress={() => {
                    setShowPlaylistModal(false);
                    navigation.navigate('PlaylistTab');
                  }}
                >
                  <Text style={styles.modalCreateText}>去建立播放清單</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalPlaylistItem}
                    onPress={() => handleAddToPlaylist(item)}
                    disabled={addingToPlaylist}
                  >
                    <Text style={styles.modalPlaylistIcon}>🎵</Text>
                    <View style={styles.modalPlaylistInfo}>
                      <Text style={styles.modalPlaylistName}>{item.name}</Text>
                      <Text style={styles.modalPlaylistCount}>{item.hymn_count} 首</Text>
                    </View>
                    <Text style={styles.modalAddIcon}>+</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowPlaylistModal(false)}
            >
              <Text style={styles.modalCloseText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Lyrics Modal */}
      <Modal
        visible={showLyrics}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowLyrics(false)}
      >
        <View style={styles.lyricsModal}>
          <View style={styles.lyricsHeader}>
            <TouchableOpacity onPress={() => setShowLyrics(false)}>
              <Text style={styles.backText}>← 返回</Text>
            </TouchableOpacity>
            <Text style={styles.lyricsModalTitle}>歌詞</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={styles.lyricsContainer}>
            <Text style={styles.lyricsSongTitle}>{hymn.title}</Text>
            <Text style={styles.lyricsArtist}>{hymn.artist}</Text>
            <View style={styles.divider} />
            {lyrics.map((line, i) => (
              <Text key={i} style={styles.lyricLine}>{line}</Text>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  backText: {
    color: '#8B9D83',
    fontSize: 16,
  },
  headerFavBtn: {
    padding: 8,
  },
  favIcon: {
    fontSize: 24,
  },
  playerArea: {
    height: 240,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverArt: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: {
    fontSize: 60,
  },
  infoArea: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 16,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
  },
  songArtist: {
    fontSize: 15,
    color: '#8B9D83',
    marginTop: 6,
  },
  duration: {
    color: '#6B7D65',
    fontSize: 13,
    marginTop: 4,
  },
  hint: {
    color: '#6B7D65',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  playBtn: {
    backgroundColor: '#F5E6CA',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  playBtnText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '600',
  },
  addPlaylistBtn: {
    borderWidth: 1,
    borderColor: '#F5E6CA',
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  addPlaylistBtnText: {
    color: '#F5E6CA',
    fontSize: 16,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  lyricsBtn: {
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  lyricsBtnText: {
    color: '#8B9D83',
    fontSize: 15,
  },
  // Playlist Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '60%',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalEmpty: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  modalEmptyText: {
    color: '#6B7D65',
    fontSize: 15,
    marginBottom: 12,
  },
  modalCreateBtn: {
    backgroundColor: '#F5E6CA',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCreateText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  modalPlaylistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  modalPlaylistIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  modalPlaylistInfo: {
    flex: 1,
  },
  modalPlaylistName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  modalPlaylistCount: {
    color: '#6B7D65',
    fontSize: 12,
    marginTop: 2,
  },
  modalAddIcon: {
    color: '#F5E6CA',
    fontSize: 22,
    fontWeight: '600',
  },
  modalCloseBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 12,
  },
  modalCloseText: {
    color: '#8B9D83',
    fontSize: 16,
  },
  // Lyrics
  lyricsModal: {
    flex: 1,
    backgroundColor: '#000000',
  },
  lyricsHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lyricsModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  lyricsContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  lyricsSongTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginTop: 10,
  },
  lyricsArtist: {
    fontSize: 14,
    color: '#8B9D83',
    textAlign: 'center',
    marginTop: 4,
  },
  lyricsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginTop: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#1A1A1A',
    marginVertical: 20,
  },
  lyricLine: {
    fontSize: 16,
    color: '#8B9D83',
    marginBottom: 12,
    lineHeight: 24,
  },
});
