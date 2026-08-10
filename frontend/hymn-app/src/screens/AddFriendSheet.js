// 加好友 sheet(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §3.2 + 已登入用戶輸入
// 邀請碼補漏)—— 兩種方式用 tab 分:搜電話(lookup 之後按 relation 顯示唔同
// 文案/掣)/輸入邀請碼(朋友派俾自己嗰個碼,兌換即刻自動加為好友)。置中
// dialog(照 AddToPlaylistSheet 嘅 create/rename 視覺,唔係貼底 sheet——呢度
// 冇 FlatList,一格輸入夠晒)。
import React, { useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { friendsLookup, friendsRequest, redeemInvite, friendsErrorMessage } from '../api';

export default function AddFriendSheet({ visible, onClose, onRequested, onFriended }) {
  const { getToken } = useAuth() || {};
  const [mode, setMode] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('+852');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { relation } 之後先顯示第二步(淨係 phone mode 用)

  const reset = useCallback(() => {
    setMode('phone'); setPhone('+852'); setCode(''); setBusy(false); setErr(''); setResult(null);
  }, []);

  const close = useCallback(() => { reset(); onClose && onClose(); }, [reset, onClose]);

  const switchMode = useCallback((m) => {
    setMode(m); setErr(''); setResult(null); setBusy(false);
  }, []);

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

  const handleRedeem = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      const token = getToken ? getToken() : null;
      const r = await redeemInvite(token, code.trim());
      onFriended && onFriended(r.friendUsername, r.alreadyFriends);
      close();
    } catch (e) {
      setErr(friendsErrorMessage(e, '兌換失敗'));
    } finally { setBusy(false); }
  }, [code, getToken, onFriended, close]);

  // relation → 文案 + 底部掣(§3.2)
  const relationView = () => {
    if (!result) return null;
    if (!result.found) {
      return <Text style={styles.hint}>呢個號碼未註冊,可以邀請佢一齊用 Odely 詩歌 App(帳戶頁「邀請朋友加入」)</Text>;
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
              {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.confirmBtnText}>接受</Text>}
            </TouchableOpacity>
          </>
        );
      default:
        return (
          <TouchableOpacity style={styles.confirmBtn} onPress={handleRequest} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.confirmBtnText}>發出好友請求</Text>}
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
              <OdeIcon name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'phone' && styles.tabBtnActive]}
              onPress={() => switchMode('phone')} activeOpacity={0.8}
            >
              <Text style={[styles.tabText, mode === 'phone' && styles.tabTextActive]}>搜電話</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'code' && styles.tabBtnActive]}
              onPress={() => switchMode('code')} activeOpacity={0.8}
            >
              <Text style={[styles.tabText, mode === 'code' && styles.tabTextActive]}>輸入邀請碼</Text>
            </TouchableOpacity>
          </View>

          {mode === 'phone' ? (
            <>
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
                  {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.confirmBtnText}>搵吓</Text>}
                </TouchableOpacity>
              )}
              {relationView()}
            </>
          ) : (
            <>
              <Text style={styles.sub}>朋友邀請你嗰個碼,輸入即刻自動加為好友</Text>
              <TextInput
                style={styles.input} value={code}
                onChangeText={(t) => { setCode(t); setErr(''); }}
                autoCapitalize="characters" autoCorrect={false}
                placeholder="K7NM-WP4E" placeholderTextColor={COLORS.textSecondary}
              />
              {!!err && <Text style={styles.err}>{err}</Text>}
              <TouchableOpacity
                style={styles.confirmBtn} onPress={handleRedeem}
                disabled={busy || !code.trim()} activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color={COLORS.textOnGlow} /> : <Text style={styles.confirmBtnText}>兌換</Text>}
              </TouchableOpacity>
            </>
          )}
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
  tabRow: {
    flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 12,
    padding: 3, marginTop: 14,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: COLORS.textOnGlow },
  sub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 12, marginBottom: 16 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, height: 48, paddingHorizontal: 14,
    color: COLORS.textPrimary, fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 10 },
  hint: { color: COLORS.textSecondary, fontSize: 14, marginTop: 14, lineHeight: 20 },
  confirmBtn: {
    backgroundColor: COLORS.glow, borderRadius: 24, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  confirmBtnText: { color: COLORS.textOnGlow, fontWeight: '700', fontSize: 15 },
});
