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
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen({ onClose }) {
  const { user, register, login, logout } = useAuth();
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
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.logoArea}>
            <View style={[styles.logoIcon, { backgroundColor: '#006039' }]}>
              <Text style={[styles.avatarLetter, { fontSize: 28, fontWeight: '800' }]}>{(user.username || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.logoTitle}>{user.username}</Text>
            <Text style={styles.logoSubtitle}>{user.email}</Text>
          </View>
          <TouchableOpacity style={styles.submitBtn} onPress={() => { logout(); if (onClose) onClose(); }} activeOpacity={0.8}>
            <Text style={styles.submitText}>登出</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <MaterialIcons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>✝️</Text>
          </View>
          <Text style={styles.logoTitle}>詩歌App</Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },

  // Logo
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoEmoji: { fontSize: 32 },
  logoTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  logoSubtitle: { fontSize: 15, color: '#A0A0A0' },

  // Form
  form: { marginBottom: 20 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: '#2A2A2A' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#FFFFFF' },

  submitBtn: { backgroundColor: '#1ED760', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 17, fontWeight: '700', color: '#000000' },

  toggleText: { textAlign: 'center', fontSize: 14, color: '#1ED760', marginTop: 8 },
  avatarLetter: { color: '#FFFFFF', textAlign: 'center' },
});
