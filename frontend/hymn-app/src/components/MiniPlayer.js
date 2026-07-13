// Mini Player — YouTube Music 扁條風格
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS } from '../constants/theme';
import { getAlbumCoverUrl } from '../utils/albumCover';
import { useNavigation } from '@react-navigation/native';

export default function MiniPlayer({ hymn }) {
  const navigation = useNavigation();

  if (!hymn) return null;

  return (
    <View style={styles.wrapper}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 0.5,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.cardBg,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#003D24',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  artist: {
    fontSize: 12,
    color: COLORS.secondary,
    marginTop: 1,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 14,
    color: '#000',
    marginLeft: 1,
  },
});
