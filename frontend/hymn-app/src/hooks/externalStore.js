import { useSyncExternalStore } from 'react';

// O1-O2-REPLAN-20260819.md §2.2 —— O1(播放進度)/O2(useCachedHymns)共用嘅
// external store helper。用 React 內建 useSyncExternalStore(uSES)代替手寫
// 「useState 影一份 snapshot + useEffect 補訂閱」嘅 pattern —— 嗰個 pattern
// 喺 render 同 effect 之間有窗口,任何同步 broadcast 跌入窗口就蝕咗(見
// useCachedHymns c9bd715 P0 事故)。uSES 嘅 mount effect 內部規定咗會對比
// 「render 嗰刻讀到嘅 snapshot」同「而家 store 嘅 snapshot」,唔同就強制
// re-render,呢個窗口喺 spec 層面已經冚咗。
export function createExternalStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const getSnapshot = () => state;
  const setState = (partial) => {
    state = { ...state, ...partial };
    listeners.forEach((fn) => fn());
  };
  const useStore = () => useSyncExternalStore(subscribe, getSnapshot);
  return { getSnapshot, setState, useStore };
}
