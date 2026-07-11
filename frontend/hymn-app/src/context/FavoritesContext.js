// Favorites Context - 收藏詩歌（綁會員 / Guest fallback）
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const GUEST_KEY = '@favorites';

function getKey(user) {
  if (user && user.id) return `@favorites_user_${user.id}`;
  return GUEST_KEY;
}

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const prevUserId = useRef(null);

  const loadFavorites = useCallback(async (key) => {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        setFavorites(JSON.parse(stored));
      } else {
        setFavorites([]);
      }
    } catch (e) {
      console.log('Load favorites error:', e);
      setFavorites([]);
    }
    setLoaded(true);
  }, []);

  // Reload when user changes (login/logout)
  useEffect(() => {
    const uid = user?.id || null;
    if (prevUserId.current !== uid) {
      prevUserId.current = uid;
      const key = getKey(user);
      loadFavorites(key);
    }
  }, [user, loadFavorites]);

  const saveFavorites = useCallback(async (list) => {
    const key = getKey(user);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.log('Save favorites error:', e);
    }
  }, [user]);

  const toggleFavorite = useCallback(async (hymn) => {
    setFavorites(prev => {
      const exists = prev.find(h => h.id === hymn.id);
      let newList;
      if (exists) {
        newList = prev.filter(h => h.id !== hymn.id);
      } else {
        newList = [...prev, { id: hymn.id, title: hymn.title, artist: hymn.artist, category: hymn.category, youtube_id: hymn.youtube_id }];
      }
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
