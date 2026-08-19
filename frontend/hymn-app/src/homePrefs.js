// 首頁本機偏好 —— HOME-DISCOVERY-REDESIGN.md §2.3(4)
//
// 記住用戶上次揀嘅「即刻揀歌」chip,下次開 App 直接顯示返(粵語用戶日日見粵語歌)。
//
// 文件寫 AsyncStorage,但本 repo 一路用 MMKV(favorites / lastPlayed / cache 都係),
// 為咗唔多帶一個 storage 庫入嚟,呢度跟返 MMKV。同 lastPlayed.js 一樣 lazy + try-catch,
// MMKV 掛咗都唔會 crash(v212 血淚教訓),最多係唔記得低。
//
// key 加版本前綴,將來改格式唔會讀到舊 data。

import { getStorage } from './storage';

const KEY_CHIP = 'home.chip.v1';

// BATCH5 O10:MMKV instance 收歸 storage.js 一份共用(零行為改變,本身就係
// 同一份 default instance)。
const store = getStorage;

export function getHomeChip() {
  try { return store()?.getString(KEY_CHIP) || null; } catch (_) { return null; }
}

export function saveHomeChip(chipId) {
  try { if (chipId) store()?.set(KEY_CHIP, String(chipId)); } catch (_) {}
}
