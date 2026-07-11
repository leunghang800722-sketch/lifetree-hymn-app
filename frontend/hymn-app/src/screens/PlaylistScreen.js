// PlaylistScreen — 本地播放清單（最簡 MVP）
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
} from 'react-native';
import TrackPlayer from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@hymn_playlist_queue';

function getCoverUrl(youtubeId) {
  return youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

function Thumbnail({ youtubeId, size = 48 }) {
  const [failed, setFailed] = useState(false);
  const uri = getCoverUrl(youtubeId);
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, { width: size, height: size, borderRadius: 6 }]}>
        <Text style={{ fontSize: 24 }}>🎵</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri }} style={[styles.thumb, { width: size, height: size, borderRadius: 6 }]}
      resizeMode="cover" onError={() => setFailed(true)} />
  );
}

export default function PlaylistScreen({ onPlayHymn }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      // Try loading from TrackPlayer first
      const tpQueue = await TrackPlayer.getQueue?.();
      if (tpQueue && tpQueue.length > 0) {
        setQueue(tpQueue);
      } else {
        // Fallback to AsyncStorage
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setQueue(JSON.parse(raw));
      }
    } catch (_) {
      // If TrackPlayer not ready, use stored
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setQueue(JSON.parse(raw));
      } catch (_) {}
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handlePlay = useCallback((item) => {
    if (onPlayHymn) onPlayHymn(item);
  }, [onPlayHymn]);

  const handleClear = useCallback(async () => {
    Alert.alert('清空清單', '確定要清空目前播放清單？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => {
        try {
          await TrackPlayer.reset?.();
          await AsyncStorage.removeItem(STORAGE_KEY);
          setQueue([]);
        } catch (_) {}
      }},
    ]);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>播放清單</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#1ED760" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>播放清單</Text>
        {queue.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>清空</Text>
          </TouchableOpacity>
        )}
      </View>

      {queue.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>播放清單係空的</Text>
          <Text style={styles.emptyHint}>點擊歌曲的「⋯」→「下一首播放」或「加入播放清單」</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(_, i) => `q-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.item} onPress={() => handlePlay(item)} activeOpacity={0.7}>
              <Text style={styles.itemIdx}>{index + 1}</Text>
              <Thumbnail youtubeId={item.youtube_id} size={44} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title || item.name || item.filename}</Text>
                <Text style={styles.itemArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  clearBtn: { padding: 8 },
  clearText: { fontSize: 14, color: '#1ED760', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
  emptyHint: { fontSize: 14, color: '#A0A0A0', textAlign: 'center', lineHeight: 20 },

  // List items
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 20,
  },
  itemIdx: { width: 24, fontSize: 13, color: '#555', fontWeight: '500' },
  thumb: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A1A1A' },
  itemInfo: { flex: 1, marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  itemArtist: { fontSize: 12, color: '#A0A0A0', marginTop: 1 },
});
