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
 if (!hymn || hymn.id == null) return;
 let newFavorites;
 if (favorites.some(f => f.id === hymn.id)) {
 newFavorites = favorites.filter(f => f.id !== hymn.id);
 } else {
 newFavorites = [...favorites, hymn];
 }
 // 先更新記憶體 state,個心一定即刻着燈(唔好因為 storage 死咗就靜靜哋 no-op —
 // 舊版 `if(!s) return` 喺 release JSI 出事嗰陣會令「最愛」掣撳極冇反應)。
 setFavorites(newFavorites);
 // 持久化盡力而為:MMKV 掛咗就跳過,唔阻 UI。
 const s = getStorage();
 if (s) {
 try { s.set('favorites', JSON.stringify(newFavorites)); } catch (e) { console.warn('favorites persist:', e); }
 }
 };

 const isFavorite = (id) => favorites.some(f => f.id === id);

 return (
 <FavoritesCtx.Provider value={{ favorites, toggleFavorite, isFavorite }}>
 {children}
 </FavoritesCtx.Provider>
 );
};

export const useFavorites = () => useContext(FavoritesCtx);
