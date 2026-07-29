// 登入後帳戶頁 —— MEMBER-UI-REDESIGN-SPEC §1。跟 YouTube Music 帳戶頁骨架:
// 頂部帳戶卡(首字母大頭像+名+電話/email+同步狀態 pill)+ 分組 list(帳戶/一般/登出)。
// 由 AuthScreen.js 見到 user 就 render 呢個(原本齋齋一個頭像+登出掣個 profile 段搬咗嚟呢度)。
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { usePlaylists } from '../context/PlaylistsContext';
import { useOutboxLength } from '../hooks/useOutboxLength';
import VersionTag, { buildLabel } from '../components/VersionTag';

function Row({ icon, label, value, onPress, showChevron = true, tint }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  const color = tint || COLORS.accent;
  return (
    <Wrapper style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.6 : undefined}>
      <View style={styles.rowIconWrap}>
        <MaterialIcons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.rowLabel, tint && { color: tint }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {onPress && showChevron ? (
        <MaterialIcons name="chevron-right" size={20} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
      ) : null}
    </Wrapper>
  );
}

function GroupCard({ rows }) {
  return (
    <View style={styles.card}>
      {/* key 要喺 spread 之外抽走,否則 React 會嗌
          「A props object containing a "key" prop is being spread into JSX」 */}
      {rows.map(({ key, ...r }, i) => (
        <React.Fragment key={key || r.label}>
          <Row {...r} />
          {i < rows.length - 1 && <View style={styles.separator} />}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function AccountScreen({ onClose }) {
  const insets = useInsets();
  const { user, logout } = useAuth();
  const { favorites = [] } = useFavorites() || {};
  const { playlists = [] } = usePlaylists() || {};
  const outboxLength = useOutboxLength();

  if (!user) return null; // AuthScreen 淨係喺 user 存在先 render 呢頁

  const firstLetter = (user.username || user.phone?.slice(-4) || '?').charAt(0).toUpperCase();
  const displayName = user.username || (user.phone ? `尾號 ${user.phone.slice(-4)}` : '未命名帳戶');
  const hasRealEmail = user.email && !user.email.endsWith('@placeholder.local');
  const subtitle = hasRealEmail ? user.email : user.phone;
  const synced = outboxLength === 0;

  const handleLogout = () => {
    Alert.alert('登出', '本地嘅最愛同清單會保留喺呢部機。', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: () => { logout(); onClose && onClose(); } },
    ]);
  };

  const handleAbout = () => {
    Alert.alert('God Music', buildLabel());
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 8 }]} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="close" size={24} color={COLORS.textPrimary} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        <View style={{ height: insets.top + 64 }} />

        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{firstLetter}</Text>
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.syncPill}>
          <MaterialIcons name={synced ? 'cloud-done' : 'cloud-queue'} size={16} color={synced ? COLORS.accent : COLORS.textSecondary} />
          <Text style={[styles.syncPillText, { color: synced ? COLORS.accent : COLORS.textSecondary }]}>
            {synced ? '已同步' : `${outboxLength} 項等緊同步`}
          </Text>
        </View>

        <Text style={styles.groupTitle}>帳戶</Text>
        <GroupCard
          rows={[
            { key: 'fav', icon: 'favorite', label: '我的最愛', value: String(favorites.length), onPress: onClose },
            { key: 'pl', icon: 'queue-music', label: '我嘅清單', value: String(playlists.length), onPress: onClose },
            { key: 'sync', icon: synced ? 'cloud-done' : 'cloud-queue', label: '同步狀態', value: synced ? '已同步' : `${outboxLength} 項等緊同步` },
          ]}
        />

        <Text style={styles.groupTitle}>一般</Text>
        <GroupCard
          rows={[
            { key: 'about', icon: 'info-outline', label: '關於 God Music', value: `v${Constants.expoConfig?.version || '—'}`, onPress: handleAbout },
          ]}
        />

        <View style={{ marginTop: 12 }}>
          <GroupCard
            rows={[
              { key: 'logout', icon: 'logout', label: '登出', onPress: handleLogout, showChevron: false, tint: COLORS.danger },
            ]}
          />
        </View>

        <VersionTag style={{ marginTop: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  closeBtn: { position: 'absolute', right: 20, zIndex: 10, padding: 8 },

  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.accent, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 38, fontWeight: '800', color: COLORS.background },
  displayName: { ...TYPOGRAPHY.title, fontSize: 24, textAlign: 'center', marginTop: 14 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },

  syncPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: COLORS.card,
  },
  syncPillText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },

  groupTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 28, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  rowIconWrap: { width: 32, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 16, color: COLORS.textPrimary, marginLeft: 8 },
  rowValue: { fontSize: 14, color: COLORS.textSecondary, marginLeft: 8 },
  separator: { height: 1, backgroundColor: COLORS.border, marginLeft: 56 },
});
