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
      // B6 修:之前冇存 lyrics,首頁「繼續收聽」重開 App 之後撳返呢首歌,
      // 個 hymn 物件淨係得返呢幾個欄(lyrics 根本 undefined),「歌詞」pill
      // 就永久灰咗——即使呢首歌本身有歌詞。呢度存嘅時候(playQueue 起播嗰
      // 一刻)song 已經係嚟自真庫嘅完整 hymn record,順手帶埋 lyrics 一齊存,
      // 下次「繼續收聽」就唔使再靠額外一次 API/lib 查詢。
      lyrics: song.lyrics || '',
    }));
  } catch (_) {}
}

export function getLastPlayed() {
  try { const s = store()?.getString('lastPlayed'); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
