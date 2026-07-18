// 我的 —— REDESIGN-PLAN §2.2「最愛 + 我嘅清單 + 登入/帳戶 + 設定 全部喺呢度」
//
// 舊版呢啲嘢散喺三個 tab(清單/最愛)加零散入口。合併埋一個 tab,少兩格。
//
// ⚠️ 設定嗰part:§5.3 原本建議嘅「大字模式」2026-07-15 Eric 已確認**唔做**
// (主要用戶唔係長者),所以呢度冇字體大小設定。深淺色模式亦都跟 §5.4「深色為主,
// 日後有餘力先考慮淺色」,所以而家淨係得帳戶相關。

import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useFavorites } from '../context/FavoritesContext';
import { usePlaylists } from '../context/PlaylistsContext';
import { useAuth } from '../context/AuthContext';

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

export default function MineScreen({ onPlayHymn, onOpenAuth }) {
  const { favorites = [], toggleFavorite } = useFavorites() || {};
  const { playlists = [] } = usePlaylists() || {};
  const { user, logout } = useAuth() || {};
  const [tab, setTab] = useState('favorites'); // favorites | playlists

  return (
    <View style={styles.container}>
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
          <Text style={styles.accountTitle}>{user ? (user.username || user.email) : '未登入'}</Text>
          <Text style={styles.accountSub}>{user ? '撳一下管理帳戶' : '登入後可以同步最愛同清單'}</Text>
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
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => onPlayHymn && onPlayHymn(item)} activeOpacity={0.7}>
              <Cover youtubeId={item.youtube_id} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleFavorite && toggleFavorite(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} activeOpacity={0.7}
              onPress={() => item.hymns?.length && onPlayHymn && onPlayHymn(item.hymns[0], { playlist: item.hymns })}>
              <View style={[styles.cover, styles.plCover]}>
                <MaterialIcons name="queue-music" size={26} color={COLORS.textSecondary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowArtist}>{item.hymns?.length || 0} 首</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="queue-music" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>仲未有清單</Text>
              <Text style={styles.emptyHint}>喺播放頁撳「清單」就可以加歌入去</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 8 },
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
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  plCover: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 4 },
});
