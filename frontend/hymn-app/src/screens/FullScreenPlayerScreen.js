// FullScreenPlayerScreen v31 — 純 flex Column 排版，保證不塌陷
// 用 Modal + 狀態切換「你的播放清單」（Bottom Sheet 只是覆蓋層）
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  StatusBar,
  SafeAreaView,
  FlatList,
  Animated,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchHymnDetail, fetchHymns } from '../api';
import { getAlbumCoverUrl } from '../utils/albumCover';
import { usePlayer } from '../context/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_WIDTH * 9 / 16;

export default function FullScreenPlayerScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { hymnId } = route.params;
  const { currentHymn, playHymn } = usePlayer();

  const [hymn, setHymn] = useState(null);
  const [allHymns, setAllHymns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [queue, setQueue] = useState([]);
  const [sheetVisible, setSheetVisible] = useState(false); // 「你的播放清單」展開/收合

  // Sheet slide animation
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
  }, [hymnId]);

  useEffect(() => {
    if (allHymns.length > 0 && hymn) {
      const currentIdx = allHymns.findIndex(h => h.id === hymn.id);
      if (currentIdx >= 0) {
        const after = allHymns.slice(currentIdx + 1);
        const before = allHymns.slice(0, currentIdx);
        setQueue([...after, ...before]);
      }
    }
  }, [allHymns, hymn]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchHymnDetail(hymnId);
      setHymn(data);
      const all = await fetchHymns();
      setAllHymns(all || []);
    } catch (err) {
      console.error('FullScreenPlayer load error:', err);
    }
    setLoading(false);
  }

  function toggleSheet() {
    if (sheetVisible) {
      // Close sheet with animation
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setSheetVisible(false));
    } else {
      setSheetVisible(true);
      // Animate in after mount
      requestAnimationFrame(() => {
        Animated.timing(sheetAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }
  }

  function handlePlayFromQueue(queueItem) {
    playHymn({
      id: queueItem.id,
      title: queueItem.title,
      artist: queueItem.artist,
      youtube_id: queueItem.youtube_id,
    });
    setHymn(queueItem);
    navigation.setParams({ hymnId: queueItem.id });
    toggleSheet();
  }

  function handleDismiss() {
    navigation.goBack();
  }

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  if (loading || !hymn) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />
        <Text style={styles.loadingText}>載入中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ===== 主播放視圖 ===== */}
      <SafeAreaView style={styles.mainContent}>
        {/* 頂部導航欄 — 固定高度 */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss}>
            <Text style={styles.dismissIcon}>▼</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>生命樹</Text>
          <TouchableOpacity style={styles.menuBtn}>
            <Text style={styles.menuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>

        {/* 下方 flex:1 區域，用 ScrollView 包住内容 */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* 1. 影片區域 — 固定 16:9 高度，絕對不塌陷 */}
          <View style={styles.videoContainer}>
            <Image
              source={{ uri: getAlbumCoverUrl(hymn.youtube_id) }}
              style={styles.videoCover}
            />
            <View style={styles.videoOverlay}>
              <TouchableOpacity style={styles.videoPlayBtn}>
                <Text style={styles.videoPlayIcon}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. 歌曲資訊 */}
          <View style={styles.songInfo}>
            <Text style={styles.songTitle} numberOfLines={2}>{hymn.title}</Text>
            <Text style={styles.songArtist}>{hymn.artist}</Text>
          </View>

          {/* 3. 進度條 */}
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.progressTimeRow}>
              <Text style={styles.progressTime}>0:00</Text>
              <Text style={styles.progressTime}>{hymn.duration || '4:30'}</Text>
            </View>
          </View>

          {/* 4. 播放控制區 — 固定，不亂飄 */}
          <View style={styles.controlsSection}>
            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => setIsShuffled(!isShuffled)}
            >
              <Text style={[styles.controlIcon, isShuffled && styles.controlIconActive]}>🔀</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn}>
              <Text style={styles.controlIcon}>⏮</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mainPlayBtn}>
              <Text style={styles.mainPlayIcon}>▶</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn}>
              <Text style={styles.controlIcon}>⏭</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlBtn}
              onPress={() => setIsRepeating(!isRepeating)}
            >
              <Text style={[styles.controlIcon, isRepeating && styles.controlIconActive]}>🔁</Text>
            </TouchableOpacity>
          </View>

          {/* 底部空間 */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ===== 「你的播放清單」把手 — 永遠在畫面底部 ===== */}
        <View style={[styles.sheetHandleBar, { paddingBottom: insets.bottom || 8 }]}>
          <TouchableOpacity
            style={styles.sheetHandleBtn}
            onPress={toggleSheet}
            activeOpacity={0.8}
          >
            <View style={styles.handleBar} />
            <View style={styles.sheetHandleRow}>
              <Text style={styles.sheetTitle}>📋 你的播放清單</Text>
              <Text style={styles.sheetCount}>{queue.length} 首</Text>
              <Text style={styles.sheetArrow}>{sheetVisible ? '▼' : '▲'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ===== Modal：展開後的「你的播放清單」— 覆蓋整個畫面下半部 ===== */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={toggleSheet}
      >
        <View style={styles.sheetModalOverlay}>
          <TouchableOpacity
            style={styles.sheetModalBackdrop}
            onPress={toggleSheet}
            activeOpacity={1}
          />
          <Animated.View
            style={[
              styles.sheetModalContent,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            {/* 清單頂部 */}
            <View style={[styles.sheetModalHeader, { paddingTop: 16 }]}>
              <View style={styles.handleBar} />
              <View style={styles.sheetModalTitleRow}>
                <Text style={styles.sheetModalTitle}>📋 你的播放清單</Text>
                <TouchableOpacity onPress={toggleSheet}>
                  <Text style={styles.sheetModalClose}>▼ 收起</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 清單内容 */}
            {queue.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Text style={styles.sheetEmptyText}>沒有下一首詩歌</Text>
              </View>
            ) : (
              <FlatList
                data={queue}
                keyExtractor={(item) => String(item.id)}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetListContent}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.queueItem,
                      item.id === hymn?.id && styles.queueItemActive,
                    ]}
                    onPress={() => handlePlayFromQueue(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.queueNumberBadge}>
                      <Text style={styles.queueNumber}>{index + 1}</Text>
                    </View>
                    <Image
                      source={{ uri: getAlbumCoverUrl(item.youtube_id) }}
                      style={styles.queueCover}
                    />
                    <View style={styles.queueInfo}>
                      <Text
                        style={[
                          styles.queueTitle,
                          item.id === hymn?.id && styles.queueTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    </View>
                    <Text style={styles.queueDragIcon}>☰</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  loadingContainer: {
    flex: 1, backgroundColor: '#121212',
    justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },

  // ===== 主播放視圖 =====
  mainContent: { flex: 1, backgroundColor: '#121212' },

  // 頂部導航欄
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    backgroundColor: '#121212',
  },
  dismissBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  dismissIcon: { fontSize: 16, color: '#FFFFFF' },
  topBarTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  menuBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  menuIcon: { fontSize: 20, color: '#FFFFFF' },

  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // 1. 影片 — 固定 16:9
  videoContainer: {
    width: SCREEN_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#1E1E1E',
  },
  videoCover: {
    width: SCREEN_WIDTH,
    height: VIDEO_HEIGHT,
    resizeMode: 'cover',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoPlayBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FFBF00',
    justifyContent: 'center', alignItems: 'center',
  },
  videoPlayIcon: {
    fontSize: 28, color: '#121212', marginLeft: 4,
  },

  // 2. 歌曲資訊
  songInfo: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  songTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  songArtist: { fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 6 },

  // 3. 進度條
  progressSection: { paddingHorizontal: 20, marginBottom: 20 },
  progressBar: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
  },
  progressFill: {
    width: '0%', height: 4, backgroundColor: '#FFBF00',
    borderRadius: 2,
  },
  progressTimeRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 8,
  },
  progressTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },

  // 4. 播放控制區
  controlsSection: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 20,
    gap: 12, marginBottom: 20,
  },
  controlBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  controlIcon: { fontSize: 24, color: 'rgba(255,255,255,0.7)' },
  controlIconActive: { color: '#FFBF00' },
  mainPlayBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FFBF00',
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 12,
  },
  mainPlayIcon: { fontSize: 30, color: '#121212', marginLeft: 4 },

  // ===== 「你的播放清單」把手（固定在底部）=====
  sheetHandleBar: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
  },
  sheetHandleBtn: { alignItems: 'center' },
  handleBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 8,
  },
  sheetHandleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%',
  },
  sheetTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', flex: 1 },
  sheetCount: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginRight: 8 },
  sheetArrow: { fontSize: 12, color: '#FFBF00' },

  // ===== Modal 清單（展開後）=====
  sheetModalOverlay: { flex: 1 },
  sheetModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetModalContent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '70%',
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetModalHeader: {
    alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetModalTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%', marginTop: 4,
  },
  sheetModalTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  sheetModalClose: { fontSize: 13, color: '#FFBF00', fontWeight: '600' },

  sheetListContent: { paddingBottom: 40 },

  sheetEmpty: {
    paddingVertical: 60, alignItems: 'center',
  },
  sheetEmptyText: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },

  // 清單項目
  queueItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  queueItemActive: { backgroundColor: 'rgba(255,191,0,0.08)' },
  queueNumberBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  queueNumber: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  queueCover: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#2A2A2A', marginRight: 10,
  },
  queueInfo: { flex: 1 },
  queueTitle: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  queueTitleActive: { color: '#FFBF00' },
  queueArtist: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  queueDragIcon: { fontSize: 18, color: 'rgba(255,255,255,0.2)', paddingLeft: 8 },
});
