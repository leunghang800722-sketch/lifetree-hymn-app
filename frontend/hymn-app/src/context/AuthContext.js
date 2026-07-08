// Auth Context — 管理登入/登出狀態
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMe, clearToken, getToken } from '../api';

const AuthContext = createContext(null);

const TOKEN_KEY = '@hymn_app_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 每次 app 啟動檢查 token
  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const token = await getToken();
      if (token) {
        const userData = await fetchMe();
        setUser(userData);
      }
    } catch (err) {
      // Token invalid or network error — clear
      await clearToken();
    }
    setLoading(false);
  }

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await fetchMe();
      setUser(userData);
      return userData;
    } catch {
      await clearToken();
      setUser(null);
      return null;
    }
  }, []);

  const setUserDirect = useCallback((userData) => {
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, setUserDirect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
