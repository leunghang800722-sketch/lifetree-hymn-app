import React, { createContext, useContext, useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';

let storage = null;
function getStorage() {
  if (!storage) {
    try { storage = new MMKV(); } catch (e) { console.warn('MMKV init:', e); }
  }
  return storage;
}

const FavoritesCtx = createContext();

export const FavoritesProvider = ({ children }) => {
 const [favorites, setFavorites] = useState([]);

 useEffect(() => {
 const s = getStorage();
 if (!s) return;
 const saved = s.getString('favorites');
 if (saved) {
   try { setFavorites(JSON.parse(saved)); } catch (e) {}
 }
 }, []);

 const toggleFavorite = (hymn) => {
 const s = getStorage();
 if (!s) return;
 let newFavorites;
 if (favorites.some(f => f.id === hymn.id)) {
 newFavorites = favorites.filter(f => f.id !== hymn.id);
 } else {
 newFavorites = [...favorites, hymn];
 }
 setFavorites(newFavorites);
 s.set('favorites', JSON.stringify(newFavorites));
 };

 const isFavorite = (id) => favorites.some(f => f.id === id);

 return (
 <FavoritesCtx.Provider value={{ favorites, toggleFavorite, isFavorite }}>
 {children}
 </FavoritesCtx.Provider>
 );
};

export const useFavorites = () => useContext(FavoritesCtx);
