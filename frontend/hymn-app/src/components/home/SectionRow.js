// src/components/home/SectionRow.js
// 通用橫向滾動列（可重用）
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

export default function SectionRow({ title, data, onPress }) {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {data.map((item, index) => (
          <TouchableOpacity
            key={item.id || index}
            style={styles.card}
            onPress={() => onPress(item)}
            activeOpacity={0.8}
          >
            <View style={styles.thumbnail}>
              <Text style={styles.thumbnailText}>🎵</Text>
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardArtist} numberOfLines={1}>
              {item.artist || '未知藝人'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 16,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  card: {
    width: 120,
    marginHorizontal: 4,
  },
  thumbnail: {
    width: 120,
    height: 120,
    backgroundColor: '#A8C765',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  thumbnailText: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  cardArtist: {
    fontSize: 12,
    color: '#666',
  },
});
