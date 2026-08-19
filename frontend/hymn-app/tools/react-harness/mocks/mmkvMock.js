// react-native-mmkv 嘅 in-memory mock。getString/set 行為同真 MMKV 一樣係
// 同步(synchronous)嘅 —— 呢點好緊要,useCachedHymns.js 嘅 kick effect 就係
// 靠呢個同步讀嚟喺 mount effect 入面即刻 setState(c9bd715 P0 場景嘅關鍵)。
let store = new Map();

export function __harnessReset(seed = {}) {
  store = new Map(Object.entries(seed));
}

export class MMKV {
  getString(key) {
    return store.has(key) ? store.get(key) : undefined;
  }
  set(key, value) {
    store.set(key, String(value));
  }
}
