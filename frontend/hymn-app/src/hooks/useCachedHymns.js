import { useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';

let storage = null;
function getStorage() {
  if (!storage) {
    try { storage = new MMKV(); } catch (e) { console.warn('MMKV init:', e); }
  }
  return storage;
}

const API_BASE = 'https://4e152f1ef2394bdb-94-190-228-145.serveousercontent.com';

async function fetchAllHymns() {
  try {
    const r = await fetch(`${API_BASE}/api/hymns`);
    if (!r.ok) return [];
    const d = (await r.json())?.data || r;
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

export const useCachedHymns = () => {
 const [hymns, setHymns] = useState(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
   const s = getStorage();

   // Try MMKV cache first (non-blocking — even if MMKV fails, we show content)
   if (s) {
     try {
       const cached = s.getString('allHymns');
       if (cached) {
         const parsed = JSON.parse(cached);
         if (Array.isArray(parsed) && parsed.length > 0) {
           setHymns(parsed);
           setLoading(false);
         }
       }
     } catch (e) {}
   }
   // Ensure loading ends even if cache is empty
   setLoading(false);

   // Background refresh from server
   fetchAllHymns().then(fresh => {
     if (fresh && fresh.length > 0) {
       if (s) s.set('allHymns', JSON.stringify(fresh));
       setHymns(fresh);
     }
   }).catch(() => {});
 }, []);

 return { hymns: hymns || [], loading };
};
