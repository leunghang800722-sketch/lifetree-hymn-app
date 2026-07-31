import { useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';
import { API_BASE } from '../config.js';

let storage = null;
function getStorage() {
  if (!storage) {
    try { storage = new MMKV(); } catch (e) { console.warn('MMKV init:', e); }
  }
  return storage;
}

async function fetchAllHymns() {
  try {
    const r = await fetch(`${API_BASE}/api/hymns`);
    if (!r.ok) return { hymns: [], dataVersion: null };
    const body = await r.json();
    const d = body?.data || body;
    return { hymns: Array.isArray(d) ? d : [], dataVersion: body?.dataVersion ?? null };
  } catch (e) {
    return { hymns: [], dataVersion: null };
  }
}

// dataVersion cache-bust(SUPERVISION-LOG 2026-07-27 18:00)—— 24 小時內兩單
// 「DB/API 一早啱,App 顯示 MMKV 舊 cache」事故都係因為:開 App 一路都係
// 「照畫 cache + 背景全量 refresh」,冇辦法知 cache 係咪已經過時,亦冇壓力
// 逼佢一定要 refresh。而家用 /api/version(超平,唔讀 DB)嚟判斷:
// version 唔同(或者根本冇存過 version)先做全量 fetch;相同就跳過,慳返
// 每次開 App 都全量拉嘅流量。/api/version 攞唔到(斷網/舊 backend 未部署呢個
// endpoint)就 fallback 返舊行為 —— 無條件背景 refresh,唔可以行為變差。
async function fetchVersion() {
  try {
    const r = await fetch(`${API_BASE}/api/version`);
    if (!r.ok) return null;
    const body = await r.json();
    return body?.dataVersion ?? null;
  } catch (e) {
    return null;
  }
}

// Admin 寫入完成即刻刷新用(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)——admin API
// response 已經帶埋新 dataVersion,唔使再問一次 /api/version。呢個 Set 存住
// 每個掛緊嘅 useCachedHymns() hook 嘅 setHymns,寫入完 call notifyHymnsChanged()
// 就即刻攞新資料、更新 MMKV、再通知晒全部掛緊嘅 hook 更新 UI(改完自己部機即時
// 見到;其他裝置跟現有 pull-on-open 機制下次開 app 見到)。
const hymnsListeners = new Set();

export function notifyHymnsChanged(serverDataVersion) {
  (async () => {
    const s = getStorage();
    const cachedVersion = s ? s.getString('allHymnsVersion') : null;
    if (serverDataVersion != null && cachedVersion === serverDataVersion) return; // 冇改
    const { hymns: fresh, dataVersion } = await fetchAllHymns();
    if (fresh && fresh.length > 0) {
      if (s) {
        s.set('allHymns', JSON.stringify(fresh));
        s.set('allHymnsVersion', dataVersion ?? serverDataVersion ?? '');
      }
      hymnsListeners.forEach((fn) => fn(fresh));
    }
  })().catch(() => {});
}

export const useCachedHymns = () => {
 const [hymns, setHymns] = useState(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
   hymnsListeners.add(setHymns);
   return () => { hymnsListeners.delete(setHymns); };
 }, []);

 useEffect(() => {
   const s = getStorage();

   // Try MMKV cache first (non-blocking — even if MMKV fails, we show content)
   let cachedVersion = null;
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
       cachedVersion = s.getString('allHymnsVersion') || null;
     } catch (e) {}
   }
   // Ensure loading ends even if cache is empty
   setLoading(false);

   async function refresh() {
     const serverVersion = await fetchVersion();

     if (serverVersion == null) {
       // /api/version 攞唔到 → fallback 返舊行為:無條件全量 background refresh。
       const { hymns: fresh } = await fetchAllHymns();
       if (fresh && fresh.length > 0) {
         if (s) s.set('allHymns', JSON.stringify(fresh));
         setHymns(fresh);
       }
       return;
     }

     if (cachedVersion && serverVersion === cachedVersion) {
       // 冇改過版,跳過全量 fetch —— 呢個先係慳流量嘅位。
       return;
     }

     // version 唔同,或者根本未存過 cached version → 全量 fetch,寫返 data+version。
     const { hymns: fresh, dataVersion } = await fetchAllHymns();
     if (fresh && fresh.length > 0) {
       if (s) {
         s.set('allHymns', JSON.stringify(fresh));
         s.set('allHymnsVersion', dataVersion ?? serverVersion ?? '');
       }
       setHymns(fresh);
     }
   }

   refresh().catch(() => {});
 }, []);

 return { hymns: hymns || [], loading };
};
