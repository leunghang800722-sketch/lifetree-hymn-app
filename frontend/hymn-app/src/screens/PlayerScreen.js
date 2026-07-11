// 播放頁面 (代替設定 Tab) - 似 YouTube Music 風格
// 由底部 Tab 進入，顯示最近播過/推薦詩歌，YouTube 播歌掣

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  StatusBar,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchHymnDetail, fetchHymns } from '../api';
import { getAlbumCoverUrl } from '../utils/albumCover';

const RECENT_KEY = '@hymn_app_recent';

export default function PlayerScreen({ navigation, route }) {
  const [recentHymn, setRecentHymn] = useState(null);
  const [allHymns, setAllHymns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedLyrics, setExpandedLyrics] = useState(false);

  useEffect(() => {
    loadRecent();
    loadAllHymns();
  }, []);

  // 每次返到呢個畫面 reload 最近播放
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadRecent();
    });
    return unsubscribe;
  }, [navigation]);

  async function loadRecent() {
    try {
      const stored = await AsyncStorage.getItem(RECENT_KEY);
      if (stored) {
        const hymnId = parseInt(stored, 10);
        const data = await fetchHymnDetail(hymnId);
        setRecentHymn(data);
      }
    } catch (err) {
      console.log('Load recent error:', err);
    }
  }

  async function loadAllHymns() {
    try {
      const data = await fetchHymns();
      setAllHymns(data);
    } catch (err) {
      console.log('Load hymns error:', err);
    }
  }

  async function playOnYouTube(hymn) {
    if (!hymn?.youtube_id) return;
    
    // Save as recent
    await AsyncStorage.setItem(RECENT_KEY, String(hymn.id));
    setRecentHymn(hymn);

    // Open YouTube App
    const youtubeUrl = `https://www.youtube.com/watch?v=${hymn.youtube_id}`;
    const intentUrl = `intent://watch?v=${hymn.youtube_id}#Intent;package=com.google.android.youtube;scheme=https;end`;
    
    try {
      const canOpen = await Linking.canOpenURL(intentUrl);
      if (canOpen) {
        await Linking.openURL(intentUrl);
      } else {
        await Linking.openURL(youtubeUrl);
      }
    } catch (err) {
      console.log('YouTube error:', err);
    }
  }

  // 推薦詩歌 — 快速播歌用
  const quickPlayHymns = allHymns.slice(0, 5);

  // 播最近
  const currentSong = recentHymn;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>播放</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Text style={styles.settingsBtn}>≡</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentSong ? (
          <>
            {/* Now playing card */}
            <View style={styles.nowPlayingCard}>
              <Image
                source={{ uri: getAlbumCoverUrl(currentSong.youtube_id) }}
                style={styles.coverBig}
              />
              <Text style={styles.songTitle}>{currentSong.title}</Text>
              <Text style={styles.songArtist}>{currentSong.artist}</Text>
              
              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={styles.progressFill} />
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>0:00</Text>
                  <Text style={styles.timeText}>{currentSong.duration || '4:30'}</Text>
                </View>
              </View>

              {/* Controls */}
              <View style={styles.controls}>
                <Text style={styles.controlIcon}>⏮</Text>
                <TouchableOpacity style={styles.playBtn} onPress={() => playOnYouTube(currentSong)}>
                  <Text style={styles.playIcon}>▶</Text>
                </TouchableOpacity>
                <Text style={styles.controlIcon}>⏭</Text>
              </View>

              {/* Lyrics preview */}
              {currentSong.lyrics_array && currentSong.lyrics_array.length > 0 && (
                <TouchableOpacity 
                  style={styles.lyricsPreview}
                  onPress={() => setExpandedLyrics(!expandedLyrics)}
                >
                  <Text style={styles.lyricsLabel}>歌詞</Text>
                  {expandedLyrics ? (
                    currentSong.lyrics_array.map((line, i) => (
                      <Text key={i} style={styles.lyricLine}>{line}</Text>
                    ))
                  ) : (
                    <Text style={styles.lyricPreviewText} numberOfLines={2}>
                      {currentSong.lyrics_array.slice(0, 2).join('  ')}
                    </Text>
                  )}
                  <Text style={styles.expandIcon}>
                    {expandedLyrics ? '▲ 收合' : '▼ 展開全部'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.youtubeBtn}
                onPress={() => playOnYouTube(currentSong)}
              >
                <Text style={styles.youtubeBtnIcon}>▶</Text>
                <Text style={styles.youtubeBtnText}>YouTube 播歌</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* No recent song */}
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎶</Text>
              <Text style={styles.emptyTitle}>未有任何播放記錄</Text>
              <Text style={styles.emptySubtitle}>揀一首詩歌開始播放</Text>
            </View>
          </>
        )}

        {/* Quick play section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>快速播放</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickPlayHymns.map((hymn) => (
              <TouchableOpacity 
                key={hymn.id} 
                style={styles.quickCard}
                onPress={() => playOnYouTube(hymn)}
              >
                <Image
                  source={{ uri: getAlbumCoverUrl(hymn.youtube_id) }}
                  style={styles.quickCover}
                />
                <Text style={styles.quickTitle} numberOfLines={1}>{hymn.title}</Text>
                <Text style={styles.quickArtist} numberOfLines={1}>{hymn.artist}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 85,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  settingsBtn: {
    color: '#8B9D83',
    fontSize: 28,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Now Playing
  nowPlayingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  coverBig: {
    width: 180,
    height: 180,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    marginBottom: 20,
  },
  songTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  songArtist: {
    color: '#8B9D83',
    fontSize: 14,
    marginTop: 4,
  },
  progressContainer: {
    width: '100%',
    marginTop: 24,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#1A1A1A',
    borderRadius: 2,
  },
  progressFill: {
    width: '0%',
    height: 3,
    backgroundColor: '#F5E6CA',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    color: '#5A6B55',
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    marginTop: 20,
  },
  controlIcon: {
    color: '#FFF',
    fontSize: 28,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F5E6CA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#FFF',
    fontSize: 28,
  },
  // Lyrics
  lyricsPreview: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
  },
  lyricsLabel: {
    color: '#F5E6CA',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  lyricPreviewText: {
    color: '#8B9D83',
    fontSize: 14,
    lineHeight: 22,
  },
  lyricLine: {
    color: .#A0A0A0.,
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 22,
  },
  expandIcon: {
    color: '#5A6B55',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  // YouTube button
  youtubeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4A843',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 20,
  },
  youtubeBtnIcon: {
    color: '#FFF',
    fontSize: 16,
    marginRight: 8,
  },
  youtubeBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#5A6B55',
    fontSize: 14,
    marginTop: 8,
  },
  // Quick play section
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  quickCard: {
    width: 120,
    marginRight: 12,
  },
  quickCover: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  quickTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
  },
  quickArtist: {
    color: '#5A6B55',
    fontSize: 11,
    marginTop: 2,
  },
});
