// 登入 / 註冊畫面

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { login, register } from '../api';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUserDirect } = useAuth();

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('錯誤', '請輸入 Email 和密碼');
      return;
    }
    setLoading(true);
    try {
      const result = isRegister
        ? await register(email.trim(), password)
        : await login(email.trim(), password);
      // Set user in auth context
      setUserDirect({ id: result.userId, email: email.trim() });
      Alert.alert('成功', isRegister ? '註冊成功！' : '登入成功！');
    } catch (err) {
      Alert.alert('錯誤', err.message || '操作失敗');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🎵</Text>
          <Text style={styles.appName}>詩歌App</Text>
          <Text style={styles.tagline}>敬拜 • 讚美 • 靈修</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {isRegister ? '建立帳號' : '登入'}
        </Text>

        {/* Email Input */}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6B7D65"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Password Input */}
        <TextInput
          style={styles.input}
          placeholder="密碼"
          placeholderTextColor="#6B7D65"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isRegister ? '註冊' : '登入'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Toggle */}
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setIsRegister(!isRegister)}
        >
          <Text style={styles.toggleText}>
            {isRegister ? '已經有帳號？登入' : '未有帳號？註冊'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  tagline: {
    fontSize: 14,
    color: '#6B7D65',
    marginTop: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 14,
  },
  submitBtn: {
    backgroundColor: '#F5E6CA',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#8B9D83',
    fontSize: 14,
  },
});
