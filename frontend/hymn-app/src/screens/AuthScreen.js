// AuthScreen — 已登入 → AccountScreen;未登入 → email 登入 form / PhoneLoginScreen。
// Email 註冊已永久封側門(D6),呢度淨係登入。
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import LogoRing from '../components/LogoRing';
import { useInsets } from '../hooks/useInsets';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { PHONE_AUTH_ENABLED } from '../config';
import PhoneLoginScreen from './PhoneLoginScreen';
import AccountScreen from './AccountScreen';
import VersionTag from '../components/VersionTag';

export default function AuthScreen({ onClose }) {
  // edge-to-edge:個 X 掣本來寫死 top:50,喺唔同機頂到狀態列(見 useInsets.js)
  const insets = useInsets();
  const { user, login } = useAuth();
  // PHONE_AUTH_ENABLED 開咗先預設電話登入(plan §6:電話為主,底部可切返 email)。
  // flag false(而家)→ usePhone 一路係 false,登入頁維持現有 email/password。
  const [usePhone, setUsePhone] = useState(PHONE_AUTH_ENABLED);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [focused, setFocused] = useState(null); // 'email' | 'password' | null

  const handleSubmit = useCallback(async () => {
    setErr('');
    if (!email.trim()) { setErr('請輸入電郵'); return; }
    if (!password || password.length < 6) { setErr('密碼最少 6 位'); return; }

    setLoading(true);
    try {
      await login(email, password);
      if (onClose) onClose();
    } catch (e) {
      // 網絡/伺服器錯誤留返俾 Alert(§1.4.2),表單驗證錯用 inline
      Alert.alert('錯誤', e.message);
    }
    setLoading(false);
  }, [email, password, login, onClose]);

  // 已登入 —— 帳戶頁(MEMBER-UI-REDESIGN-SPEC §1)
  if (user) {
    return <AccountScreen onClose={onClose} />;
  }

  // 電話登入(flag 開咗先會行到呢度)。底部可以切返 email。
  if (usePhone) {
    return <PhoneLoginScreen onClose={onClose} onUseEmail={() => setUsePhone(false)} />;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        {/* Close button */}
        <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 8 }]} onPress={onClose}>
          <OdeIcon name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        {/* Logo area — 品牌 icon 同 App.js home header / PhoneLoginScreen 同一個做法 */}
        <View style={styles.logoArea}>
          <LogoRing size={88} style={styles.brandLogoImg} />
          <Text style={styles.logoTitle}>odely</Text>
          <Text style={styles.logoSubtitle}>歡迎回來</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={[styles.inputWrap, focused === 'email' && styles.inputWrapFocused]}>
            <OdeIcon name="email" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="電郵"
              placeholderTextColor={COLORS.textSecondary}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.inputWrap, focused === 'password' && styles.inputWrapFocused]}>
            <OdeIcon name="lockOutline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="密碼（最少 6 位）"
              placeholderTextColor={COLORS.textSecondary}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry
            />
          </View>
          {!!err && <Text style={styles.errText}>{err}</Text>}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.textOnGlow} />
            ) : (
              <Text style={styles.submitText}>登入</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Email 註冊已經永久封側門(routes/auth.js /api/auth/register)——
            呢個掣一直帶去一條死路,已收埋(opus-verify local_a1403205 P3;
            FRONTEND-CODE-REVIEW-20260819 D6 剷埋成套 register 分支)。 */}
        {PHONE_AUTH_ENABLED && (
          <TouchableOpacity onPress={() => setUsePhone(true)} style={styles.linkTouch}>
            <Text style={styles.toggleText}>改用電話登入</Text>
          </TouchableOpacity>
        )}
        <VersionTag style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },

  // Logo
  logoArea: { alignItems: 'center', marginBottom: 40 },
  brandLogoImg: { marginBottom: 12 },
  logoTitle: { fontFamily: 'Sora-ExtraLight', fontSize: 26, fontWeight: '200', letterSpacing: 1.2, color: COLORS.textPrimary, marginBottom: 4 },
  logoSubtitle: { fontSize: 15, color: COLORS.textSecondary },

  // Form
  form: { marginBottom: 20 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: COLORS.border },
  inputWrapFocused: { borderColor: COLORS.primary },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.textPrimary },
  errText: { color: COLORS.danger, fontSize: 13, marginTop: -4, marginBottom: 12 },

  submitBtn: { backgroundColor: COLORS.glow, borderRadius: 26, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 17, fontWeight: '700', color: COLORS.textOnGlow },

  linkTouch: { paddingVertical: 10, marginTop: 4 },
  toggleText: { textAlign: 'center', fontSize: 14, color: COLORS.primary },
});
