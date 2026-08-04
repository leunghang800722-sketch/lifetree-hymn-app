// 邀請朋友加入(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.7)—— AccountScreen
// 「邀請朋友加入」一行撳開。列自己啲碼(未用/已用邊個用咗),「＋生成新碼」,
// 每個未用碼有「分享」掣 → Share.share 純文字(照 §2.7 文案)。
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Share, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useAuth } from '../context/AuthContext';
import { createInvite, listMyInvites, friendsErrorMessage } from '../api';

const APK_URL = 'https://api.god-music.com/downloads/app.apk';

function shareText(code) {
  return `我邀請你用 God Music 詩歌 App 🎵\n下載(Android):${APK_URL}\n註冊時輸入邀請碼:${code}`;
}

export default function InviteFriendsSheet({ visible, onClose }) {
  const { getToken } = useAuth() || {};
  const insets = useInsets();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState([]);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listMyInvites(getToken ? getToken() : null)
      .then((r) => setInvites(r.invites || []))
      .catch(() => setInvites([]))
      .finally(() => setLoading(false));
  }, [getToken]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await createInvite(getToken ? getToken() : null);
      load();
    } catch (e) {
      Alert.alert('生成失敗', friendsErrorMessage(e, '請再試'));
    } finally { setGenerating(false); }
  }, [getToken, load]);

  const handleShare = useCallback((code) => {
    Share.share({ message: shareText(code) }).catch(() => {});
  }, []);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent>
      <View style={styles.scrim}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>邀請朋友加入</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sub}>邀請碼一次性,一個碼開一個新戶;用碼註冊嘅人會自動同你做好友</Text>

          <TouchableOpacity style={styles.genBtn} onPress={handleGenerate} disabled={generating} activeOpacity={0.85}>
            {generating ? <ActivityIndicator color={COLORS.background} /> : (
              <>
                <MaterialIcons name="add" size={20} color={COLORS.background} />
                <Text style={styles.genBtnText}>生成新邀請碼</Text>
              </>
            )}
          </TouchableOpacity>

          {loading ? (
            <View style={styles.centerState}><ActivityIndicator color={COLORS.accent} /></View>
          ) : (
            <FlatList
              data={invites}
              keyExtractor={(item) => item.code}
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.code}>{item.code}</Text>
                    <Text style={styles.status}>
                      {item.used ? (item.used_by_name ? `已用・${item.used_by_name}` : '已用') : '未用'}
                    </Text>
                  </View>
                  {!item.used && (
                    <TouchableOpacity onPress={() => handleShare(item.code)} style={styles.shareBtn} activeOpacity={0.75}>
                      <MaterialIcons name="share" size={16} color={COLORS.background} />
                      <Text style={styles.shareBtnText}>分享</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <MaterialIcons name="card-giftcard" size={36} color={COLORS.textSecondary} />
                  <Text style={styles.emptyText}>仲未生成過邀請碼</Text>
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
    maxHeight: '75%', backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingTop: 4,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { ...TYPOGRAPHY.body, fontSize: 17, fontWeight: '700' },
  sub: { color: COLORS.textSecondary, fontSize: 13, paddingHorizontal: 20, marginTop: 6, marginBottom: 14, lineHeight: 18 },
  genBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, marginBottom: 10, paddingVertical: 12, borderRadius: 24,
    backgroundColor: COLORS.accent,
  },
  genBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 15, marginLeft: 6 },
  centerState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  rowText: { flex: 1 },
  code: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  status: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7,
  },
  shareBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 13, marginLeft: 4 },
});
