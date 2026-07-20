// 歌單頁 —— 首頁「即刻揀歌」撳「睇晒 N 首」入到嚟嘅全清單頁。
//
// ⚠️ v234 之前呢個係全 App 最後一塊冇跟色板嘅畫面:白底 #fff、黑字、灰線,
// 喺深色 App 入面撞到出面。而且啲寫死 hex 犯咗 §5.2「唔准再寫死 hex」。
// 而家跟返「生命樹」色板同 LibraryScreen / MineScreen 嘅列表樣式:
//   * 深林綠 #0B0F0E 底、米白字、灰綠次要字
//   * 生命綠 #3DB389 = 播放 / 着燈狀態
//   * 暖金 #E8B86D 淨係用嚟做「屬靈重點」記號 —— 呢頁冇金句類內容,
//     所以金色只出現喺 header 嗰條細分隔線,唔攞嚟做普通按鈕(§5.2 聖俗有別)
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useFavorites } from '../context/FavoritesContext';

// mqdefault = 真 16:9 冇黑邊(hqdefault 係 4:3,黑邊 baked 咗入張圖)
function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="music-note" size={size * 0.42} color={COLORS.textSecondary} />
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
      <MaterialIcons
        name={on ? 'favorite' : 'favorite-border'}
        size={20}
        color={on ? COLORS.accent : COLORS.textSecondary}
      />
    </TouchableOpacity>
  );
}

export default function HymnListScreen({ hymns = [], title, onPlayHymn, onAddToQueue }) {
  const handlePlayHymn = (hymn) => {
    if (onPlayHymn) onPlayHymn(hymn);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <Text style={styles.header} numberOfLines={1}>{title}</Text>
        <Text style={styles.count}>{hymns.length} 首</Text>
      </View>

      <FlatList
        data={hymns}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="music-off" size={36} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>呢個清單暫時冇歌</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => handlePlayHymn(item)}
            activeOpacity={0.7}
          >
            <Cover youtubeId={item.youtube_id} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
            </View>
            {/* ≡♪ 加入而家播緊嘅播放清單(同 Mine / queue sheet 一致) */}
            <TouchableOpacity
              onPress={(e) => { e?.stopPropagation?.(); onAddToQueue && onAddToQueue(item); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.rowAction}
              activeOpacity={0.6}
            >
              <MaterialIcons name="playlist-add" size={22} color={COLORS.textSecondary} />
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
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },   // §5.3 列表 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  rowAction: { paddingLeft: 14 },
  heart: { paddingLeft: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.artist, marginTop: 8 },
});
