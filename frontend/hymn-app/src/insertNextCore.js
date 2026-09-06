// src/insertNextCore.js — PLAYNEXT-EXEC-20260906 §1.1
//
// insertNext(hymn)(App.js,PlayerProvider 入面)嘅純陣列/index 運算部分,抽出
// 嚟做獨立、零依賴嘅 pure function——冇 TrackPlayer、冇 React、冇任何
// side-effect,淨係「畀返一個 queue 快照 + 現正播放 index + 要插嘅歌」,計
// 出插完之後嘅新 queue、去重刪走嘅舊 index、同 autoRadioFrom/insertBoundary
// 點郁。App.js 嘅 insertNext() 直接 require 呢個檔案做核心運算,自己淨係
// 負責 native TrackPlayer 呼叫 + toast + beacon(呢啲要 mock 先測到,唔啱擺
// 呢度)。
//
// 用 CommonJS(module.exports)唔用 ESM import/export——等 H1 harness 可以喺
// 純 Node(冇 Metro/Babel)直接 require 呢個「而家真係用緊」嘅同一份源碼,
// 唔使抄一份副本。App.js 其他地方都用 require() 混 import(見 src/clientLog.js
// 嘅 guarded require expo-constants 做法),呢度跟同一個慣例。
//
// 契約:
//   computeInsertNext(cur, curIdx, hymn, opts)
//     cur           — queueRef.current 嘅陣列快照(唔會被呢個 function 改)
//     curIdx        — currentQueueIndexRef.current
//     hymn          — 要插入做「下一首播放」嗰首歌 object(要有 .id)
//     opts.autoRadioFrom  — 現有 autoRadioFromRef.current(null = 冇)
//     opts.insertBoundary — 現有 insertBoundaryRef.current(null = 冇)
//     opts.idle           — true = 冇 current track(player idle),連同
//                            cur.length === 0 一齊觸發 fallbackToSingle
//
//   回傳其中一種:
//     { fallbackToSingle: true }                              — 冇 queue/idle,caller 應該 playSingle(hymn)
//     { fallbackToSingle: false, alreadyPlaying: true }        — hymn 已經係播緊嗰首,caller 應該 toast「播緊呢首」,唔改任何嘢
//     { fallbackToSingle: false, alreadyPlaying: false,
//       newQ, insertAt, removedIdx, moved, autoRadioFrom, insertBoundary }
//                                                               — 正常插入嘅計劃(newQ 已經係最終陣列;removedIdx=-1 代表冇去重刪位;
//                                                                  autoRadioFrom/insertBoundary 已經跟返 opts 入面同一個 null/number 形態,
//                                                                  number 就已經調整咗)
function computeInsertNext(cur, curIdx, hymn, opts) {
  opts = opts || {};
  const autoRadioFrom = typeof opts.autoRadioFrom === 'number' ? opts.autoRadioFrom : null;
  const insertBoundary = typeof opts.insertBoundary === 'number' ? opts.insertBoundary : null;
  const idle = !!opts.idle;

  if (!Array.isArray(cur) || cur.length === 0 || idle) {
    return { fallbackToSingle: true };
  }

  const safeIdx = typeof curIdx === 'number' && curIdx >= 0 && curIdx < cur.length ? curIdx : 0;

  // §1.1-3 —— 播緊嗰首 → 唔改。
  if (String(cur[safeIdx] && cur[safeIdx].id) === String(hymn && hymn.id)) {
    return { fallbackToSingle: false, alreadyPlaying: true };
  }

  // §1.1-4 —— 去重搬位:淨係喺「現正播放之後」嗰截搵(i > safeIdx),唔會撞到
  // 已經播完/播緊嗰首。dupIdx 結構上一定 >= insertAt(下面),因為搜尋範圍
  // 由 safeIdx+1 開始。
  let dupIdx = -1;
  for (let i = safeIdx + 1; i < cur.length; i++) {
    if (String(cur[i] && cur[i].id) === String(hymn && hymn.id)) { dupIdx = i; break; }
  }
  let workingQ = cur;
  let removedIdx = -1;
  if (dupIdx >= 0) {
    workingQ = cur.slice(0, dupIdx).concat(cur.slice(dupIdx + 1));
    removedIdx = dupIdx;
  }

  // §1.1-5 —— 插入位 = curIdx + 1(後插先播:再插一首都係插呢個位,之前
  // 嗰首自然畀推落第三)。
  const insertAt = safeIdx + 1;
  const newQ = workingQ.slice(0, insertAt).concat([hymn], workingQ.slice(insertAt));

  // §1.1-6 —— 邊界調整。removedIdx(如果有)結構上一定 >= insertAt,所以
  // 「刪走嘅舊位喺 boundary 之前 → -1」同「插入位喺 boundary 或之後 → +1」
  // 呢兩條調整唔會互相影響對方個判斷結果(見 PLAYNEXT-REPORT §1.1-6 推導)。
  function adjustBoundary(b) {
    if (typeof b !== 'number') return b;
    let v = b;
    if (removedIdx >= 0 && removedIdx < v) v -= 1;
    if (v >= insertAt) v += 1;
    return v;
  }

  return {
    fallbackToSingle: false,
    alreadyPlaying: false,
    newQ: newQ,
    insertAt: insertAt,
    removedIdx: removedIdx,
    moved: dupIdx >= 0 ? 1 : 0,
    autoRadioFrom: autoRadioFrom != null ? adjustBoundary(autoRadioFrom) : autoRadioFrom,
    insertBoundary: insertBoundary != null ? adjustBoundary(insertBoundary) : insertBoundary,
  };
}

// §1.1-9 —— 失敗 rollback 嘅純運算部分:native 可能已經 add(或去重 remove)
// 成功而 JS 冇同步埋,呢個 function 淨係負責「畀返 native 嘅真實 queue(track
// 陣列,每個 track 帶 `.id`)+ 舊 JS 陣列 + 想插嘅 hymn,砌一個同 native 對齊
// 嘅 JS 陣列」——查唔到就 fallback 用 track 本身嘅 title/artist(冇 hymn 全部
// 欄位,總好過完全冧咗)。零 TrackPlayer 呼叫,純陣列運算,H1 (g) 用嚟證
// 「native add 冧咗、queue 完全冇變」嗰種情況,JS 陣列（經呢個 function
// 對齊）都會跟返 native 嘅原狀,唔會停留喺一個「已插入但 native 冧咗」嘅
// 錯亂中間態。
function reconcileFromNativeQueue(cur, hymn, nativeQueue) {
  const list = Array.isArray(nativeQueue) ? nativeQueue : [];
  const safeCur = Array.isArray(cur) ? cur : [];
  return list.map((t) => {
    const found = safeCur.find((s) => String(s && s.id) === String(t && t.id));
    if (found) return found;
    if (hymn && String(hymn.id) === String(t && t.id)) return hymn;
    return { id: t && t.id, title: t && t.title, artist: t && t.artist };
  });
}

module.exports = { computeInsertNext: computeInsertNext, reconcileFromNativeQueue: reconcileFromNativeQueue };
