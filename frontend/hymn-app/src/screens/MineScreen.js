// 我的 —— REDESIGN-PLAN §2.2「最愛 + 我嘅清單 + 登入/帳戶 + 設定 全部喺呢度」
//
// 舊版呢啲嘢散喺三個 tab(清單/最愛)加零散入口。合併埋一個 tab,少兩格。
//
// ⚠️ 設定嗰part:§5.3 原本建議嘅「大字模式」2026-07-15 Eric 已確認**唔做**
// (主要用戶唔係長者),所以呢度冇字體大小設定。深淺色模式亦都跟 §5.4「深色為主,
// 日後有餘力先考慮淺色」,所以而家淨係得帳戶相關。

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useFavorites } from '../context/FavoritesContext';
import { usePlaylists } from '../context/PlaylistsContext';
import { useAuth } from '../context/AuthContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import PlaylistDetailSheet from './PlaylistDetailSheet';
import { getDisplayTitle } from '../utils/displayTitle';
import { getOutboxLength } from '../sync/userSync';

// 帳戶格副標題(已登入時):讀 outbox length 俾 Eric 肉眼驗證同步狀態
// (MEMBERSHIP-PHASE1-LOGIN-SYNC §2.6——唔加任何 spinner/手動掣,全自動)。
// 冇專用事件通知呢度「outbox 變咗」,poll 一下夠用,mount 先行有,唔會谷 CPU。
function useOutboxLength() {
  const [len, setLen] = useState(() => getOutboxLength());
  useEffect(() => {
    const t = setInterval(() => setLen(getOutboxLength()), 2000);
    return () => clearInterval(t);
  }, []);
  return len;
}

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

export default function MineScreen({ onPlayHymn, onOpenAuth, miniPlayer, hasMiniPlayer }) {
  const { favorites = [], toggleFavorite } = useFavorites() || {};
  const { playlists = [], deletePlaylist } = usePlaylists() || {};
  const { user, logout } = useAuth() || {};
  const { open: openAddToPlaylist, openCreate, openRename } = useAddToPlaylist();
  const outboxLength = useOutboxLength();
  const [tab, setTab] = useState('favorites'); // favorites | playlists
  const [detailId, setDetailId] = useState(null); // 開緊邊個清單嘅詳情頁

  // 清單行 ⋯ 掣:得兩個選項,native Alert 夠用,唔使另開 action sheet
  // (同下面帳戶卡登出一致做法)。
  const showPlaylistMenu = (pl) => {
    Alert.alert(pl.name, null, [
      { text: '改名', onPress: () => openRename && openRename(pl) },
      {
        text: '刪除清單', style: 'destructive',
        onPress: () => Alert.alert('刪除清單', `「${pl.name}」同入面 ${pl.songs?.length || 0} 首歌都會刪走。`, [
          { text: '取消', style: 'cancel' },
          { text: '刪除', style: 'destructive', onPress: () => deletePlaylist && deletePlaylist(pl.id) },
        ]),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // edge-to-edge:唔加 top inset 個大字標題會同狀態列時間疊埋(見 useInsets.js)
  const insets = useInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.header}>我的</Text>

      {/* 帳戶 */}
      <TouchableOpacity
        style={styles.account}
        activeOpacity={0.7}
        onPress={() => {
          if (user) {
            Alert.alert('帳戶', user.email || user.username || '', [
              { text: '取消', style: 'cancel' },
              { text: '登出', style: 'destructive', onPress: () => logout && logout() },
            ]);
          } else {
            onOpenAuth && onOpenAuth();
          }
        }}
      >
        <View style={styles.avatar}>
          <MaterialIcons name={user ? 'person' : 'person-outline'} size={22} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.accountTitle}>
            {user ? (user.username || user.email || (user.phone ? `尾號 ${user.phone.slice(-4)}` : '未命名帳戶')) : '未登入'}
          </Text>
          <Text style={styles.accountSub}>
            {user ? (outboxLength > 0 ? `${outboxLength} 項等緊同步` : '已同步') : '登入後可以同步最愛同清單'}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {/* 最愛 / 清單 切換 */}
      <View style={styles.segment}>
        {[
          { k: 'favorites', label: `最愛 ${favorites.length}`, icon: 'favorite' },
          { k: 'playlists', label: `我嘅清單 ${playlists.length}`, icon: 'queue-music' },
        ].map((s) => (
          <TouchableOpacity
            key={s.k}
            style={[styles.segItem, tab === s.k && styles.segItemActive]}
            onPress={() => setTab(s.k)}
            activeOpacity={0.7}
          >
            <MaterialIcons name={s.icon} size={16} color={tab === s.k ? COLORS.background : COLORS.textSecondary} />
            <Text style={[styles.segText, tab === s.k && styles.segTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'favorites' ? (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          // 播全部最愛(Eric 2026-07-25)—— 同首頁「▶ 播全部 N 首」/清單詳情頁一款;
          // explicit: true = 照收藏次序播晒(v231 語義),唔係單曲+隨機接續
          ListHeaderComponent={
            favorites.length ? (
              <TouchableOpacity
                style={styles.playAll}
                onPress={() => onPlayHymn && onPlayHymn(favorites[0], { explicit: true, playlist: favorites })}
                activeOpacity={0.8}
              >
                <MaterialIcons name="play-arrow" size={22} color={COLORS.background} />
                <Text style={styles.playAllText}>播全部 {favorites.length} 首</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            // 撳最愛入面一首歌 = 喺一個清單畫面度揀歌,同「播全部」/清單詳情頁一致
            // 用 explicit + playlist(唔係散歌插播),照最愛次序接落去。
            <TouchableOpacity style={styles.row} onPress={() => onPlayHymn && onPlayHymn(item, { explicit: true, playlist: favorites })} activeOpacity={0.7}>
              <Cover youtubeId={item.youtube_id} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              {/* ≡♪ 加入到清單 —— 彈揀清單 sheet(同播放頁「清單」pill 一致),唔使入返播放頁 */}
              <TouchableOpacity onPress={() => openAddToPlaylist(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <MaterialIcons name="playlist-add" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleFavorite && toggleFavorite(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                {/* §5.2 心心着燈用生命綠 */}
                <MaterialIcons name="favorite" size={22} color={COLORS.accent} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="favorite-border" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>仲未有最愛</Text>
              <Text style={styles.emptyHint}>喺播放頁撳心心就會加入呢度</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          // ＋新清單擺列表最頂:同 AddToPlaylistSheet 底部嗰行同字眼同視覺,
          // 空狀態都有入口;唔加喺 chip 度(目標區太細,又同切 tab 撈亂語義)。
          ListHeaderComponent={
            <TouchableOpacity style={styles.newRow} onPress={() => openCreate && openCreate()} activeOpacity={0.7}>
              <MaterialIcons name="add" size={22} color={COLORS.accent} />
              <Text style={styles.newText}>新播放清單</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            // ⚠️ 資料模型係 item.songs(PlaylistsContext/MMKV)—— 之前寫咗 item.hymns
            // (舊 PlaylistContext 嘅形狀),搞到首數永遠顯示 0、撳極都冇反應。
            <TouchableOpacity style={styles.row} activeOpacity={0.7}
              onPress={() => setDetailId(item.id)}>
              <View style={[styles.cover, styles.plCover]}>
                <MaterialIcons name="queue-music" size={26} color={COLORS.textSecondary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowArtist}>{item.songs?.length || 0} 首</Text>
              </View>
              <TouchableOpacity onPress={() => showPlaylistMenu(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <MaterialIcons name="more-vert" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="queue-music" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>仲未有清單</Text>
              <Text style={styles.emptyHint}>撳上面「＋新播放清單」開一個{'\n'}喺播放頁撳「清單」都可以加歌</Text>
            </View>
          }
        />
      )}

      {/* B9 — PlaylistDetailSheet 係獨立 native Modal,冇 TabBar 陪住,mini player
          由 App.js 傳落嚟(避免呢度反過來 import App.js 撞 circular import,
          見 App.js handleOpenFullScreen 上面嗰段註解)。 */}
      <PlaylistDetailSheet playlistId={detailId} onClose={() => setDetailId(null)} onPlayHymn={onPlayHymn}
        miniPlayer={miniPlayer} hasMiniPlayer={hasMiniPlayer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { ...TYPOGRAPHY.title, paddingHorizontal: 16, marginBottom: 12 },
  account: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 16, padding: 12,
    backgroundColor: COLORS.card, borderRadius: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center',
  },
  accountTitle: { ...TYPOGRAPHY.body, fontWeight: '600' },
  accountSub: { ...TYPOGRAPHY.artist, marginTop: 2 },
  segment: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12 },
  segItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
  },
  segItemActive: { backgroundColor: COLORS.accent },
  segText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', marginLeft: 5 },
  segTextActive: { color: COLORS.background },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  rowAction: { paddingLeft: 14 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  plCover: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  // ＋新播放清單(視覺照 AddToPlaylistSheet 嘅 newRow/newText)
  newRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  newText: { color: COLORS.accent, marginLeft: 8, fontSize: 15, fontWeight: '700' },
  // 播全部最愛 pill(視覺照 PlaylistDetailSheet 嘅 playAll)
  playAll: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: COLORS.accent, borderRadius: 20,
  },
  playAllText: { color: COLORS.background, fontWeight: '700', fontSize: 15, marginLeft: 4 },
});
