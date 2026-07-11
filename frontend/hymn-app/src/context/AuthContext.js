// Auth Context — 會員系統
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = '@hymn…uth';
const API_BASE = 'https://4e152f1ef2394bdb-94-190-228-145.serveousercontent.com';

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

  const logout = useCallback(async () => {
    await clearAuth();
  }, [clearAuth]);

  const getToken = useCallback(() => token, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, register, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
