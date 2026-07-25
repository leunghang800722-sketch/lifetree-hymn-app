// 設定畫面
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';

// app.json 嘅 "version" 係單一事實來源(同 android/app/build.gradle versionName 對齊),
// 唔好再喺呢度寫死版本號,咪學返 v1.0 咁一改就走樣。
const APP_VERSION = Constants.expoConfig?.version || '—';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👤 設定</Text>
      </View>

      <View style={styles.content}>
        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>應用程式</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>God Music</Text>
            <Text style={styles.settingValue}>v{APP_VERSION}</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>詩歌數量</Text>
            <Text style={styles.settingValue}>10 首</Text>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>關於</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>🎵 詩歌資料來源</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>💻 Backend Server</Text>
            <Text style={styles.settingValue}>192.168.50.244:3000</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>支援</Text>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>📧 聯絡我們</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={styles.settingLabel}>⭐ 評分鼓勵</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footer}>Made with ❤️ for worship</Text>
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
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  content: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7D65',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  settingLabel: {
    fontSize: 15,
    color: '#FFF',
  },
  settingValue: {
    fontSize: 13,
    color: '#6B7D65',
  },
  footer: {
    textAlign: 'center',
    color: '#6B7D65',
    fontSize: 12,
    marginTop: 40,
  },
});
