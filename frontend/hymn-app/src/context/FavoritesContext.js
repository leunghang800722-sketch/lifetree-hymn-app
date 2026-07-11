// Favorites Context - 收藏詩歌
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = '@hymn_app_favorites';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Load on mount
  useEffect(() => {
    loadFavorites();
  }, []);

  async function loadFavorites() {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Load favorites error:', e);
    }
    setLoaded(true);
  }

  async function saveFavorites(list) {
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
    } catch (e) {
      console.log('Save favorites error:', e);
    }
  }

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
  }, []);

  const isFavorite = useCallback((hymnId) => {
    return favorites.some(h => h.id === hymnId);
  }, [favorites]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        loaded,
        toggleFavorite,
        isFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
