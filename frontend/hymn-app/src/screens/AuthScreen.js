// AuthScreen — 登入／註冊（黑底設計）
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
  Image,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useInsets } from '../hooks/useInsets';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { PHONE_AUTH_ENABLED } from '../config';
import PhoneLoginScreen from './PhoneLoginScreen';
import VersionTag from '../components/VersionTag';

export default function AuthScreen({ onClose }) {
  // edge-to-edge:個 X 掣本來寫死 top:50,喺唔同機頂到狀態列(見 useInsets.js)
  const insets = useInsets();
  const { user, register, login, logout } = useAuth();
  // PHONE_AUTH_ENABLED 開咗先預設電話登入(plan §6:電話為主,底部可切返 email)。
  // flag false(而家)→ usePhone 一路係 false,登入頁維持現有 email/password。
  const [usePhone, setUsePhone] = useState(PHONE_AUTH_ENABLED);
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!email.trim()) { Alert.alert('請輸入電郵'); return; }
    if (!password || password.length < 6) { Alert.alert('密碼最少 6 位'); return; }
    if (mode === 'register' && !username.trim()) { Alert.alert('請輸入用戶名稱'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
      if (onClose) onClose();
    } catch (err) {
      Alert.alert('錯誤', err.message);
    }
    setLoading(false);
  }, [mode, email, password, username, login, register, onClose]);

  // If already logged in — show profile
  if (user) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 8 }]} onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#F5F7F4" />
          </TouchableOpacity>
          <View style={styles.logoArea}>
            {/* OTP 新用戶冇 username(§2.6)—— 用電話尾四位做顯示名,唔好出 `?` */}
            <View style={[styles.logoIcon, { backgroundColor: '#3DB389' }]}>
              <Text style={[styles.avatarLetter, { fontSize: 28, fontWeight: '800' }]}>
                {(user.username || user.phone?.slice(-4) || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.logoTitle}>{user.username || (user.phone ? `尾號 ${user.phone.slice(-4)}` : '未命名帳戶')}</Text>
            <Text style={styles.logoSubtitle}>{user.email && !user.email.endsWith('@placeholder.local') ? user.email : user.phone}</Text>
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={() => { logout(); if (onClose) onClose(); }} activeOpacity={0.8}>
            <Text style={styles.submitText}>登出</Text>
          </TouchableOpacity>
          <VersionTag style={{ marginTop: 16 }} />
        </View>
      </View>
    );
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
          <MaterialIcons name="close" size={24} color="#F5F7F4" />
        </TouchableOpacity>

        {/* Logo area — 品牌 icon 同 App.js:1042 home header 同一個做法(F 形音符/十字融合,
            teal→navy 漸變),Text 就分開寫,免得個 icon 細碼位帶字(BRAND-GODMUSIC-PLAN.md §icon 規則)。 */}
        <View style={styles.logoArea}>
          <Image source={require('../../assets/android-icon-foreground.png')} style={styles.brandLogoImg} />
          <Text style={styles.logoTitle}>God Music</Text>
          <Text style={styles.logoSubtitle}>{mode === 'login' ? '歡迎回來' : '建立帳戶'}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'register' && (
            <View style={styles.inputWrap}>
              <MaterialIcons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="用戶名稱"
                placeholderTextColor="#666"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
          )}
          <View style={styles.inputWrap}>
            <MaterialIcons name="email" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="電郵"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.inputWrap}>
            <MaterialIcons name="lock-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="密碼（最少 6 位）"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.submitText}>{mode === 'login' ? '登入' : '註冊'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Toggle mode */}
        <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setPassword(''); }}>
          <Text style={styles.toggleText}>
            {mode === 'login' ? '未有帳戶？按此註冊' : '已有帳戶？按此登入'}
          </Text>
        </TouchableOpacity>
        {PHONE_AUTH_ENABLED && (
          <TouchableOpacity onPress={() => setUsePhone(true)} style={{ marginTop: 12 }}>
            <Text style={styles.toggleText}>改用電話登入</Text>
          </TouchableOpacity>
        )}
        <VersionTag style={{ marginTop: 20 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F0E' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },

  // Logo
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#121A17', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  brandLogoImg: { width: 88, height: 88, marginBottom: 12, resizeMode: 'contain' },
  logoTitle: { fontSize: 24, fontWeight: '800', color: '#F5F7F4', marginBottom: 4 },
  logoSubtitle: { fontSize: 15, color: '#9AA696' },

  // Form
  form: { marginBottom: 20 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121A17', borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: '#1F2925' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#F5F7F4' },

  submitBtn: { backgroundColor: '#3DB389', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 17, fontWeight: '700', color: '#0B0F0E' },

  toggleText: { textAlign: 'center', fontSize: 14, color: '#3DB389', marginTop: 8 },
  avatarLetter: { color: '#F5F7F4', textAlign: 'center' },
});
