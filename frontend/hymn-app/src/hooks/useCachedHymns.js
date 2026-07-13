import { useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();
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
   // First read from local cache
   const cached = storage.getString('allHymns');
   if (cached) {
     try {
       setHymns(JSON.parse(cached));
     } catch (e) {
       // Corrupted cache — ignore
     }
     setLoading(false);
   }

   // Background refresh from server
   fetchAllHymns().then(fresh => {
     if (fresh && fresh.length > 0) {
       storage.set('allHymns', JSON.stringify(fresh));
       setHymns(fresh);
     }
     setLoading(false);
   }).catch(() => setLoading(false));
 }, []);

 return { hymns: hymns || [], loading };
};
