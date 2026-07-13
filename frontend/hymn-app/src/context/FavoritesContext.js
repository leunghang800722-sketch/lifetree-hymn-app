import React, { createContext, useContext, useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();
const FavoritesCtx = createContext();

export const FavoritesProvider = ({ children }) => {
 const [favorites, setFavorites] = useState([]);

 useEffect(() => {
 const saved = storage.getString('favorites');
 if (saved) setFavorites(JSON.parse(saved));
 }, []);

 const toggleFavorite = (hymn) => {
 let newFavorites;
 if (favorites.some(f => f.id === hymn.id)) {
 newFavorites = favorites.filter(f => f.id !== hymn.id);
 } else {
 newFavorites = [...favorites, hymn];
 }
 setFavorites(newFavorites);
 storage.set('favorites', JSON.stringify(newFavorites));
 };

 const isFavorite = (id) => favorites.some(f => f.id === id);

 return (
 <FavoritesCtx.Provider value={{ favorites, toggleFavorite, isFavorite }}>
 {children}
 </FavoritesCtx.Provider>
 );
};

export const useFavorites = () => useContext(FavoritesCtx);
