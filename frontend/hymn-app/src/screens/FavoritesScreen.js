// 最愛畫面 - 收藏詩歌
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFavorites } from '../context/FavoritesContext';

const RECENT_KEY = '@hymn_app_recent';

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const { favorites } = useFavorites();

  function handleHymnPress(hymn) {
    AsyncStorage.setItem(RECENT_KEY, String(hymn.id)).catch(() => {});
    navigation.navigate('Player', { hymnId: hymn.id });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>❤️ 我最喜愛</Text>
        <Text style={styles.headerSubtitle}>
          {favorites.length > 0 ? `共 ${favorites.length} 首` : '未有收藏詩歌'}
        </Text>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💖</Text>
          <Text style={styles.emptyText}>未有收藏詩歌</Text>
          <Text style={styles.emptyHint}>喺詩歌列表點擊 ♡ 加入收藏</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.hymnItem}
              onPress={() => handleHymnPress(item)}
            >
              <View style={styles.hymnNumber}>
                <Text style={styles.hymnNumberText}>{item.id}</Text>
              </View>
              <View style={styles.hymnInfo}>
                <Text style={styles.hymnTitle}>{item.title}</Text>
                <Text style={styles.hymnArtist}>{item.artist}</Text>
              </View>
              <View style={[
                styles.hymnBadge,
                { backgroundColor: item.category === '粵語' ? '#065F46' : '#1E40AF' }
              ]}>
                <Text style={styles.hymnBadgeText}>{item.category}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1A16',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7D65',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: '#6B7D65',
    marginTop: 6,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  hymnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1A16',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  hymnNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2D2A5E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hymnNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5E6CA',
  },
  hymnInfo: {
    flex: 1,
  },
  hymnTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  hymnArtist: {
    fontSize: 12,
    color: '#6B7D65',
    marginTop: 2,
  },
  hymnBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hymnBadgeText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
});
