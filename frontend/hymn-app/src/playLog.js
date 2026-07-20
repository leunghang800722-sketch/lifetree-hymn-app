// 本地播放記錄 —— AUTOPLAY-MIX-PLAN §3a,供「隨心」flavor 加權。
// MMKV(同 lastPlayed / favorites 一致),lazy + try-catch,掛咗都唔 crash。
// 聽夠 30 秒先算一次播放(skip 唔算)。只存本機,唔上傳。

import { MMKV } from 'react-native-mmkv';

const KEY = 'playLog.v1';       // { [hymnId]: { count, lastAt } }
const RECENT_KEY = 'playRecent.v1'; // 最近播過嘅 id(壓權防循環),最多留 15

let _store = null;
function store() {
  if (!_store) { try { _store = new MMKV(); } catch (e) { console.warn('MMKV(playLog):', e?.message); } }
  return _store;
}

export function getPlayLog() {
  try { const s = store()?.getString(KEY); return s ? JSON.parse(s) : {}; } catch (_) { return {}; }
}

export function getRecentIds() {
  try { const s = store()?.getString(RECENT_KEY); return s ? JSON.parse(s) : []; } catch (_) { return []; }
}

// 聽夠 30 秒先叫。記 count + lastAt,順手更新「最近 15 首」。
export function recordPlay(hymnId) {
  if (hymnId == null) return;
  try {
    const log = getPlayLog();
    const prev = log[hymnId] || { count: 0, lastAt: 0 };
    log[hymnId] = { count: prev.count + 1, lastAt: Date.now() };
    store()?.set(KEY, JSON.stringify(log));

    const recent = getRecentIds().filter((id) => id !== hymnId);
    recent.unshift(hymnId);
    store()?.set(RECENT_KEY, JSON.stringify(recent.slice(0, 15)));
  } catch (_) {}
}
