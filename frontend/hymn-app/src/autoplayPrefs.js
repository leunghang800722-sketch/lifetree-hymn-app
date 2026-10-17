// 自動播放設定 —— AUTOPLAY-MIX-PLAN。toggle + 揀咗嘅 flavor,存 MMKV,開 App 記得。
import { getStorage } from './storage';

const K_ON = 'autoplay.enabled.v1';
const K_FLAVOR = 'autoplay.flavor.v1';

// BATCH5 O10:MMKV instance 收歸 storage.js 一份共用(零行為改變,本身就係
// 同一份 default instance)。
const store = getStorage;

export function getAutoplayEnabled() {
  try { const v = store()?.getString(K_ON); return v == null ? true : v === '1'; } catch (_) { return true; }
}
export function setAutoplayEnabled(on) {
  try { store()?.set(K_ON, on ? '1' : '0'); } catch (_) {}
}
export function getAutoplayFlavor() {
  try { return store()?.getString(K_FLAVOR) || '全部'; } catch (_) { return '全部'; }
}
export function setAutoplayFlavor(f) {
  try { store()?.set(K_FLAVOR, String(f || '全部')); } catch (_) {}
}
