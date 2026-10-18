// 讀 outbox length 俾 UI 肉眼驗證同步狀態(MEMBERSHIP-PHASE1-LOGIN-SYNC §2.6)。
// 由 MineScreen.js 抽出嚟,俾 AccountScreen.js 共用(MEMBER-UI-REDESIGN-SPEC §1.2)。
// ODELY-OPT 1b:原本每 2 秒 setInterval 輪詢 MMKV + JSON.parse;而家 userSync.js
// 嘅 writeOutbox() 會更新 outboxStore,呢度用 external store(useSyncExternalStore)
// 訂閱,冇變就唔 re-render、冇 timer。
import { outboxStore } from '../sync/userSync';

export function useOutboxLength() {
  return outboxStore.useStore().length;
}
