// Auth Context — 會員系統
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../config';
import { setAuthToken, clearOutbox } from '../sync/userSync';

const AUTH_KEY = '@hymn…uth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load saved auth on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          setToken(saved.token);
          setUser(saved.user);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // userSync 係獨立 lib(唔係 context),要靠呢度灌 token 落去先識打 /api/me/*
  // (§2.1)。token 一變(登入/登出/loading 完成)即刻同步落去。
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const saveAuth = useCallback(async (token, user) => {
    setToken(token);
    setUser(user);
    try {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    } catch (_) {}
  }, []);

  const clearAuth = useCallback(async () => {
    setToken(null);
    setUser(null);
    try { await AsyncStorage.removeItem(AUTH_KEY); } catch (_) {}
  }, []);

  const register = useCallback(async (username, email, password) => {
    const resp = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Registration failed');
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  const login = useCallback(async (email, password) => {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Login failed');
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  // ── 電話 OTP 登入(PHONE-AUTH-PLAN)──────────────────────────
  const requestOtp = useCallback(async (phone) => {
    const resp = await fetch(`${API_BASE}/api/auth/otp/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || data.error || '發送失敗');
    return data;
  }, []);

  const verifyOtp = useCallback(async (phone, code) => {
    const resp = await fetch(`${API_BASE}/api/auth/otp/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || data.error || '驗證失敗');
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  // §2.5 登出:本地最愛/清單保留(降返做訪客數據),但 outbox 要清——嗰啲操作
  // 屬於舊帳戶,冇 token 之後亦推唔到,留低只會喺下次(可能係第二個人)登入
  // 嗰陣做錯嘢。owner 唔郁,等下次登入判斷同一人定換咗人。
  const logout = useCallback(async () => {
    await clearAuth();
    clearOutbox();
  }, [clearAuth]);

  const getToken = useCallback(() => token, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, register, login, logout, getToken, requestOtp, verifyOtp }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
