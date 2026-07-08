// 生命樹主頁 — v38 逐層還原版 step 1：純文字 ScrollView
// 冇 Animated, 冇 Image, 冇 API
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const navigation = useNavigation();

  const items = [
    { id: 1, title: '恩典太美麗', artist: 'ACM' },
    { id: 2, title: '這一生最美的祝福', artist: '讚美之泉' },
    { id: 3, title: '我要向高山舉目', artist: '玻璃海' },
    { id: 5, title: '深深愛你', artist: '讚美之泉' },
    { id: 7, title: '榮耀神羔羊', artist: '玻璃海' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>生命樹</Text>
        <Text style={styles.sub}>Etz Chayim</Text>

        {items.map(item => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemArtist}>{item.artist}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 24 },
  item: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  itemTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  itemArtist: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
});
