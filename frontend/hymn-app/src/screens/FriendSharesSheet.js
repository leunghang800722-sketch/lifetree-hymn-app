// 好友分享緊嘅清單(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §1.4/§3.2)——
// 撳好友行「⋯ → 睇分享清單」開,列 GET /api/friends/:userId/shares,
// 撳一個清單 → onOpenToken(token),由 caller(MineScreen)開現成
// SharedPlaylistSheet(睇/播/儲存副本全部現成,呢度冇新同步邏輯)。
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useAuth } from '../context/AuthContext';
import { friendsShares } from '../api';

export default function FriendSharesSheet({ friend, onClose, onOpenToken }) {
  const { getToken } = useAuth() || {};
  const insets = useInsets();
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState([]);
  const [err, setErr] = useState(false);

  const visible = !!friend;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true); setErr(false);
    const token = getToken ? getToken() : null;
    friendsShares(token, friend.user_id)
      .then((r) => { if (!cancelled) setShares(r.shares || []); })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, friend, getToken]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent>
      <View style={styles.scrim}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{friend.username} 分享緊嘅清單</Text>

          {loading ? (
            <View style={styles.centerState}><ActivityIndicator color={COLORS.accent} /></View>
          ) : err ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>讀取失敗,遲啲再試</Text>
            </View>
          ) : (
            <FlatList
              data={shares}
              keyExtractor={(item) => item.token}
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onOpenToken && onOpenToken(item.token)}>
                  <View style={styles.rowIcon}>
                    <MaterialIcons name="queue-music" size={22} color={COLORS.accent} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowCount}>{item.song_count} 首</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <MaterialIcons name="queue-music" size={36} color={COLORS.textSecondary} />
                  <Text style={styles.emptyText}>佢未有分享緊嘅清單</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    maxHeight: '70%', backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingTop: 4,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  title: { ...TYPOGRAPHY.body, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12 },
  centerState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  rowIcon: {
    width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.cardLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1, marginLeft: 12 },
  rowName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  rowCount: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
});
