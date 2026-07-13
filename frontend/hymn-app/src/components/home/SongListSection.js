// SongListSection — YouTube Music 風格垂直歌曲列表（可重用）
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS } from '../../constants/theme';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function Thumbnail({ youtubeId }) {
  const [failed, setFailed] = useState(false);
  const uri = getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={styles.thumb}>
        <Text style={styles.thumbIcon}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={styles.thumb} onError={() => setFailed(true)} />
  );
}

export default function SongListSection({ title, hymns, onPlay, onMore, showPlayAll }) {
  if (!hymns || hymns.length === 0) return null;

  const displayHymns = hymns.slice(0, 8);
  const playCount = (h) => h.view_count || h.like_count || null;

  const handlePlayAll = () => {
    // Play first song; full play-all queue logic TBD
    if (displayHymns[0]) onPlay(displayHymns[0]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {showPlayAll && (
          <TouchableOpacity onPress={handlePlayAll}>
            <Text style={styles.playAll}>全部播放</Text>
          </TouchableOpacity>
        )}
      </View>
      {displayHymns.map((h, i) => (
        <TouchableOpacity
          key={h.id || i}
          style={styles.row}
          onPress={() => onPlay(h)}
          activeOpacity={0.7}
        >
          <Thumbnail youtubeId={h.youtube_id} />
          <View style={styles.info}>
            <Text style={styles.songTitle} numberOfLines={1}>{h.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{h.artist || '未知'}</Text>
          </View>
          {playCount(h) != null && (
            <Text style={styles.count}>{formatCount(playCount(h))}</Text>
          )}
          <TouchableOpacity onPress={() => onMore?.(h)} style={styles.moreBtn}>
            <Text style={styles.more}>⋯</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function formatCount(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}萬`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  playAll: { fontSize: 14, color: COLORS.accent, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIcon: { fontSize: 20 },
  info: { flex: 1, marginLeft: 12 },
  songTitle: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  songArtist: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  count: { fontSize: 11, color: COLORS.secondary, marginRight: 8 },
  moreBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  more: { fontSize: 16, color: COLORS.secondary },
});
