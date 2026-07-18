// §2.3「繼續收聽」—— 記低最後播嗰首,首頁一撳即續。
// 抽做獨立 module(唔放喺 App.js)以免 HomeScreen import App.js 造成 circular import。
// 用 MMKV(同 favorites/cache 一樣),lazy + try-catch 包住,MMKV 掛咗都唔會 crash
// (v212 血淚教訓)。

import { MMKV } from 'react-native-mmkv';

let _store = null;
function store() {
  if (!_store) { try { _store = new MMKV(); } catch (e) { console.warn('MMKV(lastPlayed):', e?.message); } }
  return _store;
}

export function saveLastPlayed(song) {
  try {
    if (!song?.id) return;
    store()?.set('lastPlayed', JSON.stringify({
      id: song.id, title: song.title, artist: song.artist, youtube_id: song.youtube_id, lang: song.lang,
    }));
  } catch (_) {}
}

export function getLastPlayed() {
  try { const s = store()?.getString('lastPlayed'); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
