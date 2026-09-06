// src/insertNextCore.js — PLAYNEXT-EXEC-20260906 §1.1 + PLAYNEXT-OPUS-20260906 修復
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
// PLAYNEXT-OPUS-20260906 獨立驗收揪出兩個 P0 + 一個 P1 + 一個 P3,四條都喺
// 呢個檔案入面修(Opus 判斷全部喺 insertNext()/insertNextCore.js 入面,唔使
// 掂 playQueue/watchdog):
//   P0-1 去重淨係搜「播緊之後」→ 插一首頭先啱啱播過嘅歌會令 queue 出現
//        重複 id(§3 P0-1)。修法:搜成個 queue(除咗播緊嗰個位),舊位喺
//        播緊嗰首前面就要令 currentQueueIndexRef 跟住郁(newCurIdx)。
//        Opus 已經寫咗原型並窮舉驗證過(910/910,零重複 id、零 index 錯位),
//        呢度係將個驗證過嘅設計搬入正式源碼。
//   P1-3 unavailable(下架佔位)完全冇 filter → 重演 2026-08-22「連續飛歌」
//        事故。修法:hymn.unavailable 一律阻,唔理而家有冇 queue/idle。
//   P3-8 失敗 rollback 之後,autoRadioFrom/insertBoundary 要用 id 對位重算
//        (見 reindexBoundaryById),唔可以停留喺失敗嗰刻計出嚟嘅 plan 數值。
//
// PLAYNEXT-OPUS2-20260906 B1(revert P3-6)—— 上面 P3-6 個修法(推
// autoRadioFrom)已經 revert:autoRadioFrom 同時係「headLen」語義
// (playSingle/rebuildTail/applyAutoplayEnabled 三個地方都靠佢分辨
// 「用戶真係揀咗幾多首」vs「自動接續尾巴」),推咗條線 = 話俾呢三個
// caller 知「頭幾首全部係用戶揀」,而佢哋其實係系統隨機抽嘅尾巴——
// 觸發頻率高(播到尾巴入面就撞中,係常態唔係邊角),後果係電台尾巴
// 死亡(playSingle 之後撳散歌行「插播」路,得返兩首,播完就停)。
// 而家改用現有「插播」概念畫線:尾巴期間插入(adjustedAutoRadioFrom
// != null 且 <= insertAt,即插入位喺自動尾巴入面或線上)→
// insertBoundary 推去 insertAt+1(「即將播放」分隔線畫喺新歌下面),
// autoRadioFrom 本身完全唔郁。呢條插播線行過就自動清(App.js:1128
// PlaybackActiveTrackChanged 現有邏輯),唔會變成永久嘅鬼影分隔線。
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
//     { fallbackToSingle: false, alreadyPlaying: false,
//       blocked: true, reason: 'unavailable' }               — hymn 係下架佔位項,caller 應該 toast「呢首歌已經下架，播唔到」,唔插
//     { fallbackToSingle: true }                              — 冇 queue/idle,caller 應該 playSingle(hymn)
//     { fallbackToSingle: false, alreadyPlaying: true }        — hymn 已經係播緊嗰首,caller 應該 toast「播緊呢首」,唔改任何嘢
//     { fallbackToSingle: false, alreadyPlaying: false,
//       newQ, insertAt, removedIdx, newCurIdx, moved,
//       autoRadioFrom, insertBoundary }
//                                                               — 正常插入嘅計劃(newQ 已經係最終陣列;removedIdx=-1 代表冇去重刪位;
//                                                                  newCurIdx=去重刪位之後「播緊嗰首」喺 newQ 嘅新 index(通常同 curIdx
//                                                                  一樣,除非 removedIdx < curIdx 令佢郁咗一格);
//                                                                  autoRadioFrom 已經跟返 opts 入面同一個 null/number 形態,number 就已經
//                                                                  adjustBoundary 調整咗,永遠唔會被呢個 function 推去 insertAt+1(B1);
//                                                                  insertBoundary 除咗跟 opts 嘅 null/number 形態調整之外,如果插入位喺
//                                                                  自動尾巴入面(adjustedAutoRadioFrom<=insertAt),會被推去 insertAt+1
//                                                                  ——即使 opts.insertBoundary 本身係 null 都可能因此變成 number)
function computeInsertNext(cur, curIdx, hymn, opts) {
  opts = opts || {};
  const autoRadioFrom = typeof opts.autoRadioFrom === 'number' ? opts.autoRadioFrom : null;
  const insertBoundary = typeof opts.insertBoundary === 'number' ? opts.insertBoundary : null;
  const idle = !!opts.idle;

  // PLAYNEXT-OPUS-20260906 P1-3 —— 下架佔位項(FavoritesContext 對「server
  // 有、庫同本地 cache 都揾唔到」嘅 id 整嘅 {unavailable:true} 灰態)一律
  // 阻,唔理而家有冇 queue/idle:插入之後 toTrack() 會砌一條
  // /api/stream/<id>,backend 404,重演 2026-08-22「21 次 404/86 秒死寂/
  // 連續飛歌」事故(playQueueImpl 已經有專門 filter,insertNext 呢個新
  // mutator 之前完全冇)。呢個 check 擺喺最頭,行過任何其他判斷之前。
  if (hymn && hymn.unavailable) {
    return { fallbackToSingle: false, alreadyPlaying: false, blocked: true, reason: 'unavailable' };
  }

  if (!Array.isArray(cur) || cur.length === 0 || idle) {
    return { fallbackToSingle: true };
  }

  const safeIdx = typeof curIdx === 'number' && curIdx >= 0 && curIdx < cur.length ? curIdx : 0;

  // §1.1-3 —— 播緊嗰首 → 唔改。
  if (String(cur[safeIdx] && cur[safeIdx].id) === String(hymn && hymn.id)) {
    return { fallbackToSingle: false, alreadyPlaying: true };
  }

  // PLAYNEXT-OPUS-20260906 P0-1 —— 去重要搜成個 queue(包括 curIdx 之前),
  // 唔止「播緊之後」嗰截。舊碼(`for (i = safeIdx+1; ...)`)對「頭先啱啱
  // 播過」嗰種 Play Next 最典型用法(A 已播完喺 curIdx 前面 → 再插 A)
  // 完全搜唔到 → 當佢係新歌插多一次 → queue 出現重複 id,打破
  // playSingle(.filter id!==hymn.id)/rebuildTail(headIds Set)刻意維持
  // 嘅「queue 冇重複 id」不變式。Opus 已經寫咗呢個修法並窮舉驗證過
  // (910/910,零重複 id、零 index 錯位),呢度係將個驗證過嘅設計搬入
  // 正式源碼。i===safeIdx(播緊嗰首,上面已經處理咗)之外全部搜。
  let dupIdx = -1;
  for (let i = 0; i < cur.length; i++) {
    if (i === safeIdx) continue;
    if (String(cur[i] && cur[i].id) === String(hymn && hymn.id)) { dupIdx = i; break; }
  }
  let workingQ = cur;
  let removedIdx = -1;
  let newCurIdx = safeIdx;
  if (dupIdx >= 0) {
    workingQ = cur.slice(0, dupIdx).concat(cur.slice(dupIdx + 1));
    removedIdx = dupIdx;
    // ★ 舊位喺播緊嗰首前面 → 播緊嗰首自己嘅 index 喺 workingQ 少咗一格,
    // currentQueueIndexRef 要跟住郁,唔係之後 index-based 對位(reorderQueue
    // / PlaybackActiveTrackChanged)會指錯歌。
    if (dupIdx < safeIdx) newCurIdx = safeIdx - 1;
  }

  // §1.1-5 —— 插入位 = newCurIdx + 1(唔再一定係 safeIdx+1;dupIdx<safeIdx
  // 嗰陣 newCurIdx 已經郁咗——後插先播:再插一首都係插呢個位,之前嗰首
  // 自然畀推落第三)。
  const insertAt = newCurIdx + 1;
  const newQ = workingQ.slice(0, insertAt).concat([hymn], workingQ.slice(insertAt));

  // §1.1-6 —— 邊界調整。呢兩條規則(刪走嘅舊位喺 boundary 之前 → -1;
  // 插入位喺 boundary 或之前 → +1)喺 dupIdx<safeIdx 嘅新情況下(removedIdx
  // 可以 < insertAt,同舊碼「removedIdx 結構上一定 >= insertAt」嘅前設
  // 唔同)依然成立——Opus N7 910 case 窮舉冚晒呢啲組合,零 mismatch。
  function adjustBoundary(b) {
    if (typeof b !== 'number') return b;
    let v = b;
    if (removedIdx >= 0 && removedIdx < v) v -= 1;
    if (v >= insertAt) v += 1;
    return v;
  }

  const adjustedAutoRadioFrom = autoRadioFrom != null ? adjustBoundary(autoRadioFrom) : autoRadioFrom;

  const adjustedInsertBoundary = insertBoundary != null ? adjustBoundary(insertBoundary) : insertBoundary;
  // PLAYNEXT-OPUS2-20260906 B1(revert P3-6)—— autoRadioFrom 完全唔郁,淨係
  // 跟正常 adjustBoundary shift(上面一行)。播到自動尾巴之後(curIdx>=
  // autoRadioFrom 嘅常態)嗰陣,調整完嘅「自動播放」線仲係 <= insertAt
  // (即插入位喺尾巴入面或線上),改用現有「插播」機制畫線:insertBoundary
  // 推去 insertAt+1(「即將播放」分隔線畫喺新歌下面,播過就自動清——
  // App.js:1128 已有邏輯)。冇尾巴(null)唔受影響;插入位喺線之前(用戶
  // 仲未播到尾巴)嘅正常情況 adjustedAutoRadioFrom 已經 > insertAt,唔會
  // 觸發呢條 override,insertBoundary 維持返正常 adjustBoundary 嘅結果。
  const finalInsertBoundary = (adjustedAutoRadioFrom != null && adjustedAutoRadioFrom <= insertAt)
    ? insertAt + 1
    : adjustedInsertBoundary;

  return {
    fallbackToSingle: false,
    alreadyPlaying: false,
    newQ: newQ,
    insertAt: insertAt,
    removedIdx: removedIdx,
    newCurIdx: newCurIdx,
    moved: dupIdx >= 0 ? 1 : 0,
    autoRadioFrom: adjustedAutoRadioFrom,
    insertBoundary: finalInsertBoundary,
  };
}

// §1.1-9 —— 失敗 rollback 嘅純運算部分:native 可能已經 add(或去重 remove)
// 成功而 JS 冇同步埋,呢個 function 淨係負責「畀返 native 嘅真實 queue(track
// 陣列,每個 track 帶 `.id`)+ 舊 JS 陣列 + 想插嘅 hymn,砌一個同 native 對齊
// 嘅 JS 陣列」——查唔到就 fallback 用 track 本身嘅 title/artist(冇 hymn 全部
// 欄位,總好過完全冧咗)。零 TrackPlayer 呼叫,純陣列運算,H1 (g) 用嚟證
// 「native add 冧咗、queue 完全冇變」嗰種情況,JS 陣列(經呢個 function
// 對齊)都會跟返 native 嘅原狀,唔會停留喺一個「已插入但 native 冧咗」嘅
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

// PLAYNEXT-OPUS-20260906 P3-8 —— 失敗 rollback 之後,autoRadioFrom/
// insertBoundary(兩個都係「指住 oldCur 入面第幾個元素」嘅 index)要跟住
// 用 id 喺 rebuiltQ(reconcileFromNativeQueue 嘅結果)度重新搵返個元素而家
// 喺邊,唔可以停留喺失敗嗰刻(native 少做咗一步)計出嚟嘅 plan 數值。
// 語義同 §1.1-6 個 ground truth 一致(PLAYNEXT-OPUS-20260906 §1.5):
// boundary 指住「原本 oldCur[boundary] 嗰個元素」,b===oldCur.length 代表
// 「尾巴之後」(冇實際元素),搵唔返(元素本身俾去重刪咗)就跌返做
// rebuiltQ.length。
function reindexBoundaryById(oldCur, boundary, newQ) {
  if (typeof boundary !== 'number') return boundary;
  const safeCur = Array.isArray(oldCur) ? oldCur : [];
  const safeNew = Array.isArray(newQ) ? newQ : [];
  if (boundary >= safeCur.length) return safeNew.length;
  const marker = safeCur[boundary];
  if (!marker) return safeNew.length;
  const idx = safeNew.findIndex((x) => String(x && x.id) === String(marker.id));
  return idx >= 0 ? idx : safeNew.length;
}

module.exports = {
  computeInsertNext: computeInsertNext,
  reconcileFromNativeQueue: reconcileFromNativeQueue,
  reindexBoundaryById: reindexBoundaryById,
};
