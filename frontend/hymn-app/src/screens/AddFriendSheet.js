// 加好友 sheet(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §3.2)—— 輸入電話,
// lookup 之後按 relation 顯示唔同文案/掣。置中 dialog(照 AddToPlaylistSheet
// 嘅 create/rename 視覺,唔係貼底 sheet——呢度冇 FlatList,一格輸入夠晒)。
import React, { useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { friendsLookup, friendsRequest, friendsErrorMessage } from '../api';

export default function AddFriendSheet({ visible, onClose, onRequested }) {
  const { getToken } = useAuth() || {};
  const [phone, setPhone] = useState('+852');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { relation } 之後先顯示第二步

  const reset = useCallback(() => {
    setPhone('+852'); setBusy(false); setErr(''); setResult(null);
  }, []);

  const close = useCallback(() => { reset(); onClose && onClose(); }, [reset, onClose]);

  const handleLookup = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      const token = getToken ? getToken() : null;
      const r = await friendsLookup(token, phone.trim());
      setResult(r);
    } catch (e) {
      setErr(friendsErrorMessage(e, '搵唔到'));
    } finally { setBusy(false); }
  }, [phone, getToken]);

  const handleRequest = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      const token = getToken ? getToken() : null;
      await friendsRequest(token, phone.trim());
      onRequested && onRequested();
      close();
    } catch (e) {
      setErr(friendsErrorMessage(e, '發出請求失敗'));
    } finally { setBusy(false); }
  }, [phone, getToken, onRequested, close]);

  // relation → 文案 + 底部掣(§3.2)
  const relationView = () => {
    if (!result) return null;
    if (!result.found) {
      return <Text style={styles.hint}>呢個號碼未註冊,可以邀請佢一齊用 God Music(帳戶頁「邀請朋友加入」)</Text>;
    }
    switch (result.relation) {
      case 'self':
        return <Text style={styles.hint}>呢個係你自己嘅號碼</Text>;
      case 'friends':
        return <Text style={styles.hint}>已經係好友喇</Text>;
      case 'pending_out':
        return <Text style={styles.hint}>已經發出咗請求,等緊佢接受</Text>;
      case 'pending_in':
        return (
          <>
            <Text style={styles.hint}>佢已經想加你做好友!撳下面即刻成為好友。</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleRequest} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.confirmBtnText}>接受</Text>}
            </TouchableOpacity>
          </>
        );
      default:
        return (
          <TouchableOpacity style={styles.confirmBtn} onPress={handleRequest} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.confirmBtnText}>發出好友請求</Text>}
          </TouchableOpacity>
        );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.scrim}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>加好友</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sub}>用電話號碼搵朋友(要對方電話已經註冊)</Text>
          <TextInput
            style={styles.input} value={phone}
            onChangeText={(t) => { setPhone(t); setResult(null); setErr(''); }}
            keyboardType="phone-pad" placeholder="+852 1234 5678" placeholderTextColor={COLORS.textSecondary}
            autoComplete="tel" textContentType="telephoneNumber"
          />
          {!!err && <Text style={styles.err}>{err}</Text>}
          {!result && (
            <TouchableOpacity style={styles.confirmBtn} onPress={handleLookup} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.confirmBtnText}>搵吓</Text>}
            </TouchableOpacity>
          )}
          {relationView()}
        </View>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: {
    alignSelf: 'center', width: '86%', maxWidth: 420,
    backgroundColor: COLORS.card, borderRadius: 20, padding: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  sub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 6, marginBottom: 16 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, height: 48, paddingHorizontal: 14,
    color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 10 },
  hint: { color: COLORS.textSecondary, fontSize: 14, marginTop: 14, lineHeight: 20 },
  confirmBtn: {
    backgroundColor: COLORS.accent, borderRadius: 24, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  confirmBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 15 },
});
