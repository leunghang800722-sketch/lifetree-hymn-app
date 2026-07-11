// PlaylistScreen — 播放清單（有設計 MVP）
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import TrackPlayer from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STORAGE_KEY = '@hymn_…ueue';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function CoverThumb({ youtubeId, size = 48 }) {
  const [failed, setFailed] = useState(false);
  const uri = getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, { width: size, height: size, borderRadius: 8 }]}>
        <Text style={{ fontSize: 20 }}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={[styles.thumb, { width: size, height: size, borderRadius: 8 }]}
      resizeMode="cover" onError={() => setFailed(true)} />
  );
}

export default function PlaylistScreen({ onPlayHymn }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const tpQueue = await TrackPlayer.getQueue?.();
      if (tpQueue && tpQueue.length > 0) {
        setQueue(tpQueue);
      } else {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setQueue(JSON.parse(raw));
      }
    } catch (_) {
      try { const raw = await AsyncStorage.getItem(STORAGE_KEY); if (raw) setQueue(JSON.parse(raw)); } catch (_) {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handlePlay = useCallback((item) => onPlayHymn && onPlayHymn(item), [onPlayHymn]);

  const handleClear = useCallback(() => {
    Alert.alert('清空清單', '確定要清空目前播放清單？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => {
        try { await TrackPlayer.reset?.(); await AsyncStorage.removeItem(STORAGE_KEY); setQueue([]); } catch (_) {}
      }},
    ]);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>播放清單</Text>
        </View>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="small" color="#1ED760" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>播放清單</Text>
        {queue.length > 0 && (
          <View style={styles.headerRight}>
            <Text style={styles.count}>{queue.length} 首</Text>
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <MaterialIcons name="delete-outline" size={20} color="#A0A0A0" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {queue.length === 0 ? (
        /* Empty state — with design */
        <View style={styles.emptyWrap}>
          <View style={styles.emptyGraphic}>
            <Text style={styles.emptyBgIcon}>📋</Text>
            <View style={styles.emptyLine} />
            <View style={[styles.emptyDot, styles.emptyDot1]} />
            <View style={[styles.emptyDot, styles.emptyDot2]} />
          </View>
          <Text style={styles.emptyTitle}>播放清單係空的</Text>
          <Text style={styles.emptyDesc}>聽歌嗰陣點歌曲旁邊嘅「⋯」</Text>
          <Text style={styles.emptyDesc}>揀「下一首播放」或「加入播放清單」</Text>
        </View>
      ) : (
        /* Queue list */
        <FlatList
          data={queue}
          keyExtractor={(_, i) => `q-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.item} onPress={() => handlePlay(item)} activeOpacity={0.7}>
              <Text style={styles.idx}>{index + 1}</Text>
              <CoverThumb youtubeId={item.youtube_id} size={44} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title || item.name || item.filename}</Text>
                <Text style={styles.itemArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <MaterialIcons name="play-circle-outline" size={22} color="#555" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 13, color: '#A0A0A0' },
  clearBtn: { padding: 6 },

  // Loading
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingBottom: 80,
  },
  emptyGraphic: { position: 'relative', marginBottom: 20, alignItems: 'center', height: 80 },
  emptyBgIcon: { fontSize: 64, opacity: 0.15 },
  emptyLine: { position: 'absolute', bottom: 10, width: 120, height: 2, backgroundColor: '#2A2A2A', borderRadius: 1 },
  emptyDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#1ED760' },
  emptyDot1: { bottom: 6, left: -10 },
  emptyDot2: { bottom: 6, right: -10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: '#A0A0A0', lineHeight: 19 },

  // List
  listContent: { paddingBottom: 20 },
  separator: { height: 1, backgroundColor: '#1A1A1A', marginLeft: 78 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 20,
  },
  idx: { width: 24, fontSize: 13, color: '#555', fontWeight: '500', textAlign: 'center' },
  thumb: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A' },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  itemArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 2 },
});
