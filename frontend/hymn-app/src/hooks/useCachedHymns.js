import { useState, useEffect } from 'react';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

export const useCachedHymns = () => {
 const [hymns, setHymns] = useState(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 // 先讀取本地快取
 const cached = storage.getString('allHymns');
 if (cached) {
 setHymns(JSON.parse(cached));
 setLoading(false);
 }

 // 背景更新最新資料
 safeFetchAllHymns().then(fresh => {
 if (fresh && fresh.length > 0) {
 storage.set('allHymns', JSON.stringify(fresh));
 setHymns(fresh);
 }
 setLoading(false);
 }).catch(() => setLoading(false));
 }, []);

 return { hymns: hymns || [], loading };
};
