// Mini Player — 底部迷你播放控制列
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAlbumCoverUrl } from '../utils/albumCover';

export default function MiniPlayer({ hymn }) {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Player', { hymnId: hymn.id })}
    >
      <Image
        source={{ uri: getAlbumCoverUrl(hymn.youtube_id) }}
        style={styles.cover}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{hymn.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{hymn.artist}</Text>
      </View>
      <TouchableOpacity style={styles.playBtn}>
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  info: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  artist: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,191,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  playIcon: {
    fontSize: 16,
    color: '#FFBF00',
    marginLeft: 2,
  },
});
