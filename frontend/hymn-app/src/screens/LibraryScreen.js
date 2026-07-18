// 詩歌庫 —— REDESIGN-PLAN §2.2「全部詩歌,可以按語言/歌手/專輯篩選」
//
// 呢個 tab 係新嘅(舊版冇)。而家個庫係 Phase 2 揀出嚟嘅 150 首試版歌
// (backend 個 `hymns` view 已經幫我哋隱藏咗死鏈同非 curated 嘅歌),
// 所以呢度收到咩就顯示咩,唔使前端再過濾一次。

import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';

const LANGS = ['全部', '粵語', '國語', '英文'];

function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    // §5.4 唔用 Emoji 做 fallback,用向量圖標
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="music-note" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

export default function LibraryScreen({ hymns = [], onPlayHymn }) {
  const [lang, setLang] = useState('全部');
  const [artist, setArtist] = useState(null);

  const artists = useMemo(() => {
    const base = lang === '全部' ? hymns : hymns.filter((h) => h.lang === lang);
    const counts = {};
    base.forEach((h) => { const a = h.artist || '未知'; counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [hymns, lang]);

  const shown = useMemo(() => {
    let out = lang === '全部' ? hymns : hymns.filter((h) => h.lang === lang);
    if (artist) out = out.filter((h) => (h.artist || '未知') === artist);
    return out;
  }, [hymns, lang, artist]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>詩歌庫</Text>
      <Text style={styles.count}>{shown.length} 首</Text>

      {/* 語言篩選 */}
      <View style={styles.chipRow}>
        {LANGS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.chip, lang === l && styles.chipActive]}
            onPress={() => { setLang(l); setArtist(null); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, lang === l && styles.chipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 歌手篩選(橫向) */}
      <View style={styles.artistWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[['全部歌手', shown.length], ...artists]}
          keyExtractor={(item) => String(item[0])}
          renderItem={({ item }) => {
            const [name, n] = item;
            const isAll = name === '全部歌手';
            const active = isAll ? !artist : artist === name;
            return (
              <TouchableOpacity
                style={[styles.artistChip, active && styles.artistChipActive]}
                onPress={() => setArtist(isAll ? null : name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.artistChipText, active && styles.artistChipTextActive]} numberOfLines={1}>
                  {name}{isAll ? '' : ` ${n}`}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => onPlayHymn && onPlayHymn(item)} activeOpacity={0.7}>
            <Cover youtubeId={item.youtube_id} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'} · {item.lang}</Text>
            </View>
            <MaterialIcons name="play-arrow" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="library-music" size={40} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>冇歌</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 8 },
  header: { ...TYPOGRAPHY.title, paddingHorizontal: 16 },
  count: { ...TYPOGRAPHY.artist, paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.background },
  artistWrap: { paddingLeft: 16, marginBottom: 10 },
  artistChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 8, maxWidth: 150,
  },
  artistChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.card },
  artistChipText: { fontSize: 12, color: COLORS.textSecondary },
  artistChipTextActive: { color: COLORS.accent, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },   // §5.3 列表 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.artist, marginTop: 8 },
});
