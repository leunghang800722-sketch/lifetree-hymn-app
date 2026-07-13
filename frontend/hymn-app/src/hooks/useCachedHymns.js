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

   // First read from local cache (if MMKV available)
   if (s) {
     const cached = s.getString('allHymns');
     if (cached) {
       try {
         setHymns(JSON.parse(cached));
       } catch (e) {}
       setLoading(false);
     }
   }

   // Background refresh from server
   fetchAllHymns().then(fresh => {
     if (fresh && fresh.length > 0) {
       if (s) s.set('allHymns', JSON.stringify(fresh));
       setHymns(fresh);
     }
     setLoading(false);
   }).catch(() => setLoading(false));
 }, []);

 return { hymns: hymns || [], loading };
};
