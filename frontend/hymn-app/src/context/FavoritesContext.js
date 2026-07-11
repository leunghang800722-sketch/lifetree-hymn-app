// Favorites Context - 收藏詩歌（綁會員 / Guest fallback）
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const GUEST_KEY = '***';

function getKey(user) {
  if (user && user.id) return `@favorites_user_${user.id}`;
  return GUEST_KEY;
}

const FavoritesContext = createContext(null);
const NOT_INIT = {}; // sentinel for first mount

export function FavoritesProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const prevUserId = useRef(NOT_INIT);

  const loadFavorites = useCallback(async (key) => {
    try {
      const stored = await AsyncStorage.getItem(key);
      setFavorites(stored ? JSON.parse(stored) : []);
    } catch (e) {
      setFavorites([]);
    }
    setLoaded(true);
  }, []);

  // Reload when user changes (login/logout), including initial mount
  useEffect(() => {
    if (authLoading) return; // wait for auth to restore from storage
    const uid = user?.id ?? null;
    if (prevUserId.current === uid) return; // same identity
    prevUserId.current = uid;
    loadFavorites(getKey(user));
  }, [user, authLoading, loadFavorites]);

  const saveFavorites = useCallback(async (list) => {
    try { await AsyncStorage.setItem(getKey(user), JSON.stringify(list)); }
    catch (e) { console.log('Save favorites error:', e); }
  }, [user]);

  const toggleFavorite = useCallback(async (hymn) => {
    setFavorites(prev => {
      const exists = prev.find(h => h.id === hymn.id);
      const newList = exists
        ? prev.filter(h => h.id !== hymn.id)
        : [...prev, { id: hymn.id, title: hymn.title, artist: hymn.artist, category: hymn.category, youtube_id: hymn.youtube_id }];
      saveFavorites(newList);
      return newList;
    });
  }, [saveFavorites]);

  const isFavorite = useCallback((hymnId) => {
    return favorites.some(h => h.id === hymnId);
  }, [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, loaded, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
