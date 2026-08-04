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

  // ── 電話+密碼登入(PHONE-PASSWORD-AUTH-PLAN §5.1)──────────────────
  // 統一錯誤形狀:e.message 係俾用戶睇嘅文案,e.code 係 server 回嘅 error
  // 短碼(如 already_registered/no_account/password_not_set),俾畫面
  // 用嚟分流(例如撳「返去登入」/「去註冊」)。
  async function postAuth(path, body) {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const e = new Error(data.message || data.error || '請求失敗');
      e.code = data.error;
      throw e;
    }
    return data;
  }

  // ②輸入驗證碼 → 換一個 10 分鐘 ticket,證明「呢一刻控制住呢個電話」
  // (註冊/忘記密碼共用)。唔會 saveAuth——呢步仲未有 session token。
  const verifyOtpTicket = useCallback(async (phone, code) => {
    return postAuth('/api/auth/otp/verify-ticket', { phone, code });
  }, []);

  // ③一版過填密碼+姓名+性別+出生年份,連同 ticket 換 session token;
  // inviteCode(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.7)—— mode=open 時
  // 淨係送 undefined,backend 唔理呢個欄。
  const registerPhone = useCallback(async ({ ticket, password, username, gender, birthYear, inviteCode }) => {
    const data = await postAuth('/api/auth/register-phone', { ticket, password, username, gender, birthYear, inviteCode });
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  // 日常登入:電話 + 密碼
  const loginPhone = useCallback(async (phone, password) => {
    const data = await postAuth('/api/auth/login-phone', { phone, password });
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  // 忘記密碼:ticket + 新密碼,順便補完 profile(得 NULL 嘅欄先寫得入)
  const resetPassword = useCallback(async (ticket, password, extra = {}) => {
    const data = await postAuth('/api/auth/reset-password', { ticket, password, ...extra });
    await saveAuth(data.token, data.user);
    return data;
  }, [saveAuth]);

  // ── 邀請碼(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §2.4/§2.7)────────────
  // otp/status 加咗 registrationMode 欄,俾註冊流程決定使唔使顯示⓪邀請碼步;
  // 呢兩條都係公開 GET/POST,唔使 token,唔行 postAuth() 嗰套(冇 saveAuth)。
  const fetchOtpStatus = useCallback(async () => {
    const resp = await fetch(`${API_BASE}/api/auth/otp/status`);
    return resp.json().catch(() => ({}));
  }, []);

  const checkInviteCode = useCallback(async (code) => {
    const resp = await fetch(`${API_BASE}/api/auth/invite-check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || '檢查失敗,請再試');
    return !!data.valid;
  }, []);

  // §2.5 登出:本地最愛/清單保留(降返做訪客數據),但 outbox 要清——嗰啲操作
  // 屬於舊帳戶,冇 token 之後亦推唔到,留低只會喺下次(可能係第二個人)登入
  // 嗰陣做錯嘢。owner 唔郁,等下次登入判斷同一人定換咗人。
  const logout = useCallback(async () => {
    await clearAuth();
    clearOutbox();
  }, [clearAuth]);

  const getToken = useCallback(() => token, [token]);

  // MEMBERSHIP-PHASE2-ADMIN-PLAN §2.3:UI 遮罩用,唔係安全邊界(API 有
  // requireAdmin 每 request 由 DB 核實兜底)。role 跟現有 user object 持久化,
  // 零新機制;App 而家開機冇 call /api/auth/me 刷新 user,所以褫奪要等用戶
  // 下次重新登入先喺 UI 反映——冇安全後果(admin API 一早 403 咗)。
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, token, loading, isAdmin, register, login, logout, getToken,
      requestOtp, verifyOtpTicket, registerPhone, loginPhone, resetPassword,
      fetchOtpStatus, checkInviteCode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
