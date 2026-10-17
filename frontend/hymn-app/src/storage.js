// BATCH5 O10:單一 MMKV instance 共用畀全 app。之前 7 個檔案(FavoritesContext/
// PlaylistsContext/userSync/playLog/autoplayPrefs/homePrefs/useCachedHymns)
// 各自 `new MMKV()`——全部冇傳 id/path,即係本身已經係同一份 default instance
// (react-native-mmkv 冇指定 id 就用 'mmkv.default'),呢度收歸一份純粹減重複
// 初始化 boilerplate,零行為改變(同一份底層檔案,key 冇變)。
//
// Lazy + try-catch:MMKV 喺 release JSI 出過事(v212 血淚教訓),掛咗都唔可以
// crash,最多係唔記得低。冇成功就每次 call 再試一次(同舊版每個檔案自己嗰套
// 一致),唔加額外「試過一次就永久放棄」嘅 flag。
import { MMKV } from 'react-native-mmkv';

let _storage = null;
export function getStorage() {
  if (!_storage) {
    try { _storage = new MMKV(); } catch (e) { console.warn('MMKV init:', e?.message || e); }
  }
  return _storage;
}
