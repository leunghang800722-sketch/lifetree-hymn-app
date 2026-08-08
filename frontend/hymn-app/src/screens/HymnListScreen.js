// 歌單頁 —— 首頁「即刻揀歌」撳「睇晒 N 首」入到嚟嘅全清單頁。
//
// ⚠️ v234 之前呢個係全 App 最後一塊冇跟色板嘅畫面:白底 #fff、黑字、灰線,
// 喺深色 App 入面撞到出面。而且啲寫死 hex 犯咗 §5.2「唔准再寫死 hex」。
// 而家跟返 Ode 色板同 LibraryScreen / MineScreen 嘅列表樣式(ODE-REBRAND-PLAN):
//   * 靛紫底 #0B0913、米白字、淡紫次要字
//   * 暖光 #EFE4D2 = 播放 / 選中狀態
//   * 主色紫 #B9A6F2 = 已收藏 / 連結
//   * 歌名 18pt(§5.3 列表可讀性)、封面縮圖、行尾心心同其他歌單一致

import React, { useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS, TYPOGRAPHY, effects } from '../theme/designSystem';
import { useFavorites } from '../context/FavoritesContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import { useAdminEditHymn } from '../components/AdminEditHymnSheet';
import { useAuth } from '../context/AuthContext';
import { useInsets } from '../hooks/useInsets';
import { getDisplayTitle } from '../utils/displayTitle';

// B9 — 呢頁而家可能有 App.js 傳落嚟嘅 mini player 企喺底(見 App.js
// hymnListModal),要留返呢個高度嘅空間,唔係尾幾行歌會俾佢遮咗。約數
// (44 封面 + 上下 padding 10*2)已經夠準,唔使逐 px 對正。
const MINI_PLAYER_H = 64;

// mqdefault = 真 16:9 冇黑邊(hqdefault 係 4:3,黑邊 baked 咗入張圖)
function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <OdeIcon name="musicNote" size={size * 0.42} color={COLORS.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.cover, { width: size, height: size }]}
      onError={() => setFailed(true)}
    />
  );
}

// 同播放清單 / 首頁一致:喺清單度直接加最愛,唔使入返播放頁
function Heart({ hymn }) {
  const { isFavorite, toggleFavorite } = useFavorites() || {};
  if (!hymn?.id || typeof toggleFavorite !== 'function') return null;
  const on = typeof isFavorite === 'function' ? isFavorite(hymn.id) : false;
  return (
    <TouchableOpacity
      onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(hymn); }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.heart}
      activeOpacity={0.6}
    >
      <OdeIcon
        name="heart"
        size={20}
        filled={on}
        color={on ? COLORS.primary : COLORS.textSecondary}
      />
    </TouchableOpacity>
  );
}

export default function HymnListScreen({ hymns = [], title, onPlayHymn, hasMiniPlayer = false }) {
  const { open: openAddToPlaylist } = useAddToPlaylist();
  const { isAdmin } = useAuth() || {};
  const { open: openAdminEdit } = useAdminEditHymn();
  const handlePlayHymn = (hymn) => {
    if (onPlayHymn) onPlayHymn(hymn);
  };
  // B8 修 —— 之前呢度寫死 `paddingBottom: 32`,edge-to-edge 底下嗰 32px 冚
  // 唔到手勢導航列(見 useInsets.js 檔頭大段解釋),尾幾行歌就俾條白色
  // gesture pill 蓋住半截。跟返 PlaylistDetailSheet.js 個做法用 useInsets()。
  const insets = useInsets();
  const bottomPad = 24 + insets.bottom + (hasMiniPlayer ? MINI_PLAYER_H : 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <Text style={styles.header} numberOfLines={1}>{title}</Text>
        <Text style={styles.count}>{hymns.length} 首</Text>
      </View>

      <FlatList
        data={hymns}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <OdeIcon name="musicOff" size={36} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>呢個清單暫時冇歌</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => handlePlayHymn(item)}
            onLongPress={isAdmin ? () => openAdminEdit(item) : undefined}
            activeOpacity={0.7}
          >
            <Cover youtubeId={item.youtube_id} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
            </View>
            {/* ≡♪ 加入到清單 —— 彈揀清單 sheet(同 Mine / 播放頁「清單」pill 一致) */}
            <TouchableOpacity
              onPress={(e) => { e?.stopPropagation?.(); openAddToPlaylist(item); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.rowAction}
              activeOpacity={0.6}
            >
              <OdeIcon name="addToList" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Heart hymn={item} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerWrap: {
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  header: { ...TYPOGRAPHY.title },
  count: { ...TYPOGRAPHY.artist, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight, ...effects.coverInset },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },   // §5.3 列表 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  rowAction: { paddingLeft: 14 },
  heart: { paddingLeft: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.artist, marginTop: 8 },
});
