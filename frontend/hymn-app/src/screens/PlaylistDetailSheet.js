// 清單詳情 —— 「我的」頁撳一個清單入嚟(§MYPAGE-PLAYLIST-MANAGE-PLAN §4)。
//
// full-screen native Modal,由 MineScreen 控制。傳 playlistId **唔係成個 object**:
// 喺呢頁移除歌/改名之後要即時反映,所以每次 render 都由 usePlaylists() 按 id
// 攞最新版;清單唔見咗(被刪)就自動閂。
//
// 播放語義(v231,見 App.js handlePlayHymn 註解):呢頁所有播放都係
// explicit: true —— 用戶明知自己揀緊一個清單,照清單次序播,唔好隨機接續。
//
// 移除單曲**唔使二次確認**(re-add 好易,Spotify 同款);刪成個清單先要確認。

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';

// mqdefault = 真 16:9 冇黑邊(同 MineScreen / HymnListScreen 一致)
function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="music-note" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

export default function PlaylistDetailSheet({ playlistId, onClose, onPlayHymn }) {
  const { playlists = [], removeFromPlaylist, deletePlaylist } = usePlaylists() || {};
  const { openRename } = useAddToPlaylist();
  const insets = useInsets();

  const visible = !!playlistId;
  const pl = playlists.find((p) => p.id === playlistId);

  // 清單被刪(喺呢頁 ⋯ 刪、或第度刪咗)就冇嘢好顯示,自動閂返出去
  useEffect(() => {
    if (visible && !pl) onClose && onClose();
  }, [visible, pl, onClose]);

  if (!visible || !pl) return null;
  const songs = pl.songs || [];

  const showMenu = () => {
    Alert.alert(pl.name, null, [
      { text: '改名', onPress: () => openRename && openRename(pl) },
      {
        text: '刪除清單', style: 'destructive',
        onPress: () => Alert.alert('刪除清單', `「${pl.name}」同入面 ${songs.length} 首歌都會刪走。`, [
          { text: '取消', style: 'cancel' },
          // 刪完 pl 變 undefined,上面個 effect 會自動閂 Modal
          { text: '刪除', style: 'destructive', onPress: () => deletePlaylist && deletePlaylist(pl.id) },
        ]),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // 播歌後要閂埋自己:播放器 overlay 係主 view hierarchy 嘅嘢(zIndex 999),
  // 畫喺 native Modal **後面**—— Modal 唔閂,用戶會以為撳咗冇反應(emulator 實測)。
  // BUG3(b) P0(Eric 實測)——之前呢度 explicit 隊列播完就完全停,自動播放開住
  // 都冇尾巴接落去,同其他入口(睇晒/隨心聽/首頁即刻揀歌)嘅體驗唔一致。
  // `appendAutoplayTail: true` 話俾 App.js handlePlayHymn/playQueue 知:呢個
  // explicit 隊列播晒之後,自動播放開住就照樣加條隨機尾巴,冇開就同以前一樣停。
  const play = (hymn) => {
    onPlayHymn && onPlayHymn(hymn, { explicit: true, playlist: songs, appendAutoplayTail: true });
    onClose && onClose();
  };

  const playAll = () => {
    if (!songs.length) return;
    play(songs[0]);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {/* Header:返回 │ 清單名 + N / 30 首 │ ⋯ */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerBtn}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>{pl.name}</Text>
            <Text style={styles.headerSub}>{songs.length} / {MAX_PLAYLIST_SONGS} 首</Text>
          </View>
          <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerBtn}>
            <MaterialIcons name="more-vert" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={songs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
          ListHeaderComponent={
            <TouchableOpacity
              style={[styles.playAll, { opacity: songs.length ? 1 : 0.45 }]}
              onPress={playAll} activeOpacity={0.8} disabled={!songs.length}>
              <MaterialIcons name="play-arrow" size={22} color={COLORS.background} />
              <Text style={styles.playAllText}>播全部</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} activeOpacity={0.7}
              onPress={() => play(item)}>
              <Cover youtubeId={item.youtube_id} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <TouchableOpacity onPress={() => removeFromPlaylist && removeFromPlaylist(pl.id, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <MaterialIcons name="remove-circle-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="queue-music" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>呢個清單仲未有歌</Text>
              <Text style={styles.emptyHint}>喺播放頁或者最愛度撳 ≡♪ 加歌入嚟</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBtn: { padding: 4 },
  headerText: { flex: 1, marginHorizontal: 12 },
  headerTitle: { ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '700' },
  headerSub: { ...TYPOGRAPHY.artist, marginTop: 2 },
  playAll: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: COLORS.accent, borderRadius: 20,
  },
  playAllText: { color: COLORS.background, fontWeight: '700', fontSize: 15, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  rowAction: { paddingLeft: 14 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 4 },
});
