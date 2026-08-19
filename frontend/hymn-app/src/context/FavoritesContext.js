import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MMKV } from 'react-native-mmkv';
import { enqueue, flush } from '../sync/userSync';

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
 // ref 鏡像:每個寫 state 嘅位都同步寫呢個,令 toggleFavorite/isFavorite/replaceAllFavorites
 // 讀嘅永遠係最新值(read-your-writes),同一 tick 連撳兩下唔會撞 stale closure(S1+O9)。
 const favoritesRef = useRef([]);

 useEffect(() => {
 const s = getStorage();
 if (!s) return;
 const saved = s.getString('favorites');
 if (saved) {
   try {
     const parsed = JSON.parse(saved);
     favoritesRef.current = parsed;
     setFavorites(parsed);
   } catch (e) {}
 }
 }, []);

 const toggleFavorite = useCallback((hymn) => {
 if (!hymn || hymn.id == null) return;
 const current = favoritesRef.current;
 let newFavorites;
 let added;
 if (current.some(f => f.id === hymn.id)) {
 newFavorites = current.filter(f => f.id !== hymn.id);
 added = false;
 } else {
 newFavorites = [...current, hymn];
 added = true;
 }
 // 先更新記憶體 state,個心一定即刻着燈(唔好因為 storage 死咗就靜靜哋 no-op —
 // 舊版 `if(!s) return` 喺 release JSI 出事嗰陣會令「最愛」掣撳極冇反應)。
 favoritesRef.current = newFavorites;
 setFavorites(newFavorites);
 // 持久化盡力而為:MMKV 掛咗就跳過,唔阻 UI。
 const s = getStorage();
 if (s) {
 try { s.set('favorites', JSON.stringify(newFavorites)); } catch (e) { console.warn('favorites persist:', e); }
 }
 // 跨裝置同步(MEMBERSHIP-PHASE1-LOGIN-SYNC §2.2)—— fire-and-forget,唔 block UI,
 // 離線就留喺 outbox 等下次 flush,對 UI 完全冇分別。
 enqueue({ op: added ? 'fav_add' : 'fav_remove', hymn_id: hymn.id });
 flush();
 }, []);

 const isFavorite = useCallback((id) => favoritesRef.current.some(f => f.id === id), []);

 // 登入合併/pull(§2.3-2.4)用:server 淨係俾 hymn_id list,呢度負責 hydrate 返
 // full object——優先用現有本地 favorites cache,再用 app 已載入嘅 library,
 // 兩邊都揾唔到(歌下架咗)就留一個灰態佔位,唔好靜靜哋跌走(用戶心心唔見咗
 // 會以為係 bug)。
 const replaceAllFavorites = useCallback((hymnIds, library = []) => {
 const byLibId = new Map((library || []).map(h => [String(h.id), h]));
 const byLocalId = new Map(favoritesRef.current.map(f => [String(f.id), f]));
 const next = (hymnIds || []).map((rawId) => {
 const key = String(rawId);
 return byLibId.get(key) || byLocalId.get(key) || { id: rawId, title: '(已下架)', unavailable: true };
 });
 favoritesRef.current = next;
 setFavorites(next);
 const s = getStorage();
 if (s) {
 try { s.set('favorites', JSON.stringify(next)); } catch (e) { console.warn('favorites persist:', e); }
 }
 }, []);

 const value = useMemo(
 () => ({ favorites, toggleFavorite, isFavorite, replaceAllFavorites }),
 [favorites, toggleFavorite, isFavorite, replaceAllFavorites]
 );

 return (
 <FavoritesCtx.Provider value={value}>
 {children}
 </FavoritesCtx.Provider>
 );
};

export const useFavorites = () => useContext(FavoritesCtx);
