// ../storage.js 嘅 harness stub —— getStorage() 回 mmkvMock 嘅 in-memory MMKV
// (同步 getString/set,場景用 __harnessReset 種 cache)。
import { MMKV } from './mmkvMock.js';

let _s = null;
export function getStorage() {
  if (!_s) _s = new MMKV();
  return _s;
}
