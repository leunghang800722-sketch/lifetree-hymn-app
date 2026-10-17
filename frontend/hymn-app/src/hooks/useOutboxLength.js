// 讀 outbox length 俾 UI 肉眼驗證同步狀態(MEMBERSHIP-PHASE1-LOGIN-SYNC §2.6)。
// 冇專用事件通知「outbox 變咗」,poll 一下夠用,mount 先行有,唔會谷 CPU。
// 由 MineScreen.js 抽出嚟,俾 AccountScreen.js 共用(MEMBER-UI-REDESIGN-SPEC §1.2)。
import { useState, useEffect } from 'react';
import { getOutboxLength } from '../sync/userSync';

export function useOutboxLength() {
  const [len, setLen] = useState(() => getOutboxLength());
  useEffect(() => {
    const t = setInterval(() => setLen(getOutboxLength()), 2000);
    return () => clearInterval(t);
  }, []);
  return len;
}
