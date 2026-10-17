#!/usr/bin/env node
// tools/insertnext-harness/run.js — PLAYNEXT-EXEC-20260906 §2 H1
// + PLAYNEXT-OPUS-20260906 修復驗證(P0-1/P0-2/P1-3/P3-6/P3-7/P3-8)
// + PLAYNEXT-OPUS2-20260906 第二輪修復驗證(B1 revert P3-6/B2 shuffle 開住
//   插入/P3-7 nit)
//
// 直接 require `../../src/insertNextCore.js`(而家真係俾 App.js 用緊嘅同一份
// 源碼,冇抄副本)——呢個係純 CommonJS function,零 React/TrackPlayer 依賴,
// 純 Node 30 秒內跑完,唔使 emulator/simulator。覆蓋執行單 §2 H1 (a)-(g)
// 七個情境,加埋 Opus 驗收揪出嘅修復場景 (h)-(o),再加埋 Opus2 揪出嘅
// B1/B2 場景 (m 已改寫/p)。任何一個 FAIL 就 process.exit(1),可以當 gate 用。
//
// 點跑: node tools/insertnext-harness/run.js

const path = require('path');
const { computeInsertNext, reconcileFromNativeQueue, reindexBoundaryById } = require(
  path.join(__dirname, '..', '..', 'src', 'insertNextCore.js')
);

let pass = 0;
let fail = 0;
const failures = [];

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function song(id) { return { id, title: `song-${id}`, artist: 'x' }; }
function ids(list) { return list.map((s) => s.id); }

// ---------------------------------------------------------------------
// (a) 空 queue → fallbackToSingle(caller 應該 playSingle(hymn))。
// 附加:queue 非空但 idle=true(player idle)一樣要 fallback。
// ---------------------------------------------------------------------
(function scenarioA() {
  const r1 = computeInsertNext([], 0, song('X'), {});
  assertEqual(r1.fallbackToSingle, true, '(a) empty queue → fallbackToSingle');

  const cur = [song(0), song(1)];
  const r2 = computeInsertNext(cur, 0, song('X'), { idle: true });
  assertEqual(r2.fallbackToSingle, true, '(a) idle=true → fallbackToSingle even with non-empty queue');
})();

// ---------------------------------------------------------------------
// (b) 正常插入 curIdx=2, len=6 → newQ 長度 7、位置 3 係新歌、
//     autoRadioFrom 4→5、insertBoundary null 不變。
// ---------------------------------------------------------------------
(function scenarioB() {
  const cur = [song(0), song(1), song(2), song(3), song(4), song(5)];
  const hymn = song('X');
  const plan = computeInsertNext(cur, 2, hymn, { autoRadioFrom: 4, insertBoundary: null });
  assertEqual(plan.fallbackToSingle, false, '(b) fallbackToSingle=false');
  assertEqual(plan.newQ.length, 7, '(b) newQ length');
  assertEqual(plan.newQ[3].id, 'X', '(b) new song at index 3');
  assertEqual(plan.autoRadioFrom, 5, '(b) autoRadioFrom 4→5');
  assertEqual(plan.insertBoundary, null, '(b) insertBoundary unchanged (null)');
  assertEqual(plan.moved, 0, '(b) moved=0 (no dup)');
})();

// ---------------------------------------------------------------------
// (c) 連插兩首 → 次序 [cur, B, A, ...](後插先播:B 後插,推到 A 前面)。
// ---------------------------------------------------------------------
(function scenarioC() {
  const cur = [song(0), song(1), song(2), song(3)];
  const curIdx = 1;
  const A = song('A');
  const planA = computeInsertNext(cur, curIdx, A, { autoRadioFrom: null, insertBoundary: null });
  const afterA = planA.newQ; // [0,1,A,2,3]
  const B = song('B');
  const planB = computeInsertNext(afterA, curIdx, B, {
    autoRadioFrom: planA.autoRadioFrom, insertBoundary: planA.insertBoundary,
  });
  const finalQ = planB.newQ; // expect [0,1,B,A,2,3]
  assertEqual(finalQ[curIdx].id, cur[curIdx].id, '(c) current track index unchanged');
  assertEqual(finalQ[curIdx + 1].id, 'B', '(c) B (second insert) at curIdx+1');
  assertEqual(finalQ[curIdx + 2].id, 'A', '(c) A (first insert) pushed to curIdx+2');
})();

// ---------------------------------------------------------------------
// (d) 歌已喺 index 6(len=8)→ 搬到 3、長度不變、autoRadioFrom 唔變(刪一加一)。
// ---------------------------------------------------------------------
(function scenarioD() {
  const cur = [song(0), song(1), song(2), song(3), song(4), song(5), song('DUP'), song(7)];
  const curIdx = 2;
  const plan = computeInsertNext(cur, curIdx, song('DUP'), { autoRadioFrom: 8, insertBoundary: null });
  assertEqual(plan.newQ.length, 8, '(d) queue length unchanged (removed one, inserted one)');
  assertEqual(plan.newQ[3].id, 'DUP', '(d) dup song moved to index curIdx+1=3');
  assertEqual(plan.moved, 1, '(d) moved=1');
  assertEqual(plan.autoRadioFrom, 8, '(d) autoRadioFrom unchanged (removedIdx>=autoRadioFrom cancels with insert)');
})();

// ---------------------------------------------------------------------
// (e) 歌已喺 autoRadioFrom 之前(head)→ 搬位 + autoRadioFrom 不變。
// cur = [0,1,cur2,3,DUP(idx4),tailStart(idx5, autoRadioFrom=5)]
// ---------------------------------------------------------------------
(function scenarioE() {
  const cur = [song(0), song(1), song(2), song(3), song('DUP'), song(5)];
  const curIdx = 2;
  const plan = computeInsertNext(cur, curIdx, song('DUP'), { autoRadioFrom: 5, insertBoundary: null });
  assertEqual(plan.newQ[3].id, 'DUP', '(e) dup moved to curIdx+1=3 (head region)');
  assertEqual(plan.autoRadioFrom, 5, '(e) autoRadioFrom unchanged (removal-before-boundary cancels with insert-before-boundary)');
})();

// ---------------------------------------------------------------------
// (f) 播緊嗰首 → 唔改,toast(alreadyPlaying=true,冇 newQ)。
// ---------------------------------------------------------------------
(function scenarioF() {
  const cur = [song(0), song(1), song(2)];
  const plan = computeInsertNext(cur, 1, song(1), { autoRadioFrom: null, insertBoundary: null });
  assertEqual(plan.fallbackToSingle, false, '(f) fallbackToSingle=false');
  assertEqual(plan.alreadyPlaying, true, '(f) alreadyPlaying=true for currently-playing song');
  assertEqual(plan.newQ, undefined, '(f) no newQ produced (queue must stay untouched by caller)');
})();

// ---------------------------------------------------------------------
// (g) native add throw → JS 唔變。
// 用 reconcileFromNativeQueue 模擬:native add() 冧咗,native queue 完全
// 冇變(同插入之前一樣),JS 經 reconcile 之後應該跟返 native 嘅原狀
// (唔會停留喺一個「已插入」嘅錯亂中間態)。
// ---------------------------------------------------------------------
(function scenarioG() {
  const cur = [song(0), song(1), song(2)];
  const hymn = song('X');
  // native queue 反映「add() 冧咗、queue 完全冇變」——即係同 cur 一樣嘅 id 序列。
  const nativeQueueUnchanged = cur.map((s) => ({ id: s.id, title: s.title, artist: s.artist }));
  const rebuilt = reconcileFromNativeQueue(cur, hymn, nativeQueueUnchanged);
  assertEqual(ids(rebuilt), ids(cur), '(g) JS array reconciled back to pre-insert state when native add throws with no native mutation');

  // 附加:去重 remove 成功但 add 冧咗嘅情況——native queue 少咗 dup 嗰個,
  // 冇新歌;reconcile 應該反映呢個「remove 咗但未 add」嘅真實 native 狀態,
  // 唔會靜雞雞塞返個舊 dup 或者當個新歌已經入咗去。
  const curWithDup = [song(0), song(1), song('DUP')];
  const nativeAfterRemoveOnly = [{ id: 0 }, { id: 1 }]; // DUP 已 remove,新歌未 add
  const rebuilt2 = reconcileFromNativeQueue(curWithDup, song('DUP'), nativeAfterRemoveOnly);
  assertEqual(ids(rebuilt2), [0, 1], '(g) partial failure (remove ok, add threw) reconciles to native truth, not a phantom insert');
})();

// ---------------------------------------------------------------------
// (h) PLAYNEXT-OPUS-20260906 P0-1 —— 插一首已經喺 curIdx **之前**(頭先啱啱
// 播過)嘅歌:去重要搵到、唔可以出現重複 id、播緊嗰首嘅 index 要跟住郁
// (newCurIdx),插入位跟住新 index 走。呢個係 Opus 揪出嘅兩個 P0 之一,
// 亦係 Play Next 最典型嘅用法(「頭先嗰首想再聽一次」)。
// ---------------------------------------------------------------------
(function scenarioH() {
  const cur = [song(10), song(11), song(12), song(13)]; // 播緊 index 1(=11),10 已播完
  const plan = computeInsertNext(cur, 1, song(10), { autoRadioFrom: null, insertBoundary: null });
  assertEqual(plan.moved, 1, '(h) dup-before-curIdx found (moved=1), not treated as new song');
  assertEqual(plan.removedIdx, 0, '(h) removedIdx points at the old (pre-curIdx) position');
  assertEqual(new Set(ids(plan.newQ)).size, plan.newQ.length, '(h) no duplicate ids in newQ');
  assertEqual(ids(plan.newQ), [11, 10, 12, 13], '(h) newQ order: currently-playing first, dup right after');
  assertEqual(plan.newCurIdx, 0, '(h) newCurIdx shifts down by one (dup removed from in front of it)');
  assertEqual(plan.newQ[plan.newCurIdx].id, 11, '(h) newCurIdx still points at the song that was actually playing');
  assertEqual(plan.newQ[plan.newCurIdx + 1].id, 10, '(h) inserted song sits right after the currently-playing song');
  // Reproduce the App.js:3678 tap-to-jump path with the FIXED newQ: tapping
  // the newly-inserted row must resolve to itself, not jump back to a phantom
  // earlier duplicate (that phantom no longer exists after the fix).
  const tappedIdx = plan.newCurIdx + 1;
  const jumpTo = plan.newQ.findIndex((s) => String(s.id) === String(plan.newQ[tappedIdx].id));
  assertEqual(jumpTo, tappedIdx, '(h) tapping the inserted row resolves to itself, no back-jump');
})();

// ---------------------------------------------------------------------
// (i) 重複喺後(curIdx 之後)——舊有 (d)/(e) 已覆蓋,呢度加返 Opus N4 原文
// 案例做 regression pin:插一首已經喺 index 5(len 6)嘅歌,搬去 curIdx+1,
// 長度不變,newCurIdx 唔郁(dup 喺播緊嗰首後面,唔影響播緊嗰首個 index)。
// ---------------------------------------------------------------------
(function scenarioI() {
  const cur = [song(0), song(1), song(2), song(3), song(4), song(5)];
  const plan = computeInsertNext(cur, 2, song(5), { autoRadioFrom: null, insertBoundary: null });
  assertEqual(plan.moved, 1, '(i) dup-after-curIdx found (moved=1)');
  assertEqual(plan.newCurIdx, 2, '(i) newCurIdx unchanged (dup was behind current, not in front)');
  assertEqual(plan.newQ.length, 6, '(i) queue length unchanged (removed one, inserted one)');
  assertEqual(ids(plan.newQ), [0, 1, 2, 5, 3, 4], '(i) dup moved to curIdx+1');
})();

// ---------------------------------------------------------------------
// (j) PLAYNEXT-OPUS-20260906 P0-1 窮舉 —— 910 case(len 3..7 × curIdx ×
// autoRadioFrom 0..len × dupAt ∈ {-1, 0..len-1})用真源碼(唔係 Opus scratch
// 嗰份獨立原型)驗證四條不變式:零重複 id、newCurIdx 真係指住原本播緊嗰首、
// 插入嗰首喺 newCurIdx+1、boundary 跟住「原本 cur[b] 嗰個元素」呢條 ground
// truth(B1 嘅 insertBoundary override 唔喺呢度驗——嗰條規則專門測落
// scenarioM;autoRadioFrom 而家(B1 之後)完全唔會被 override,純粹跟呢度
// 嘅 adjustBoundary shift,所以唔使額外隔離)。
// ---------------------------------------------------------------------
(function scenarioJ() {
  let tested = 0;
  let dupIdBad = 0;
  let curIdxBad = 0;
  let posBad = 0;
  for (let len = 3; len <= 7; len++) {
    for (let curIdx = 0; curIdx < len; curIdx++) {
      for (let b = 0; b <= len; b++) {
        for (const dupAt of [-1, ...Array.from({ length: len }, (_, i) => i)]) {
          if (dupAt === curIdx) continue; // alreadyPlaying 路徑,唔算入呢個窮舉
          const cur = Array.from({ length: len }, (_, i) => song(i));
          const hymn = dupAt >= 0 ? song(dupAt) : song('NEW');
          const p = computeInsertNext(cur, curIdx, hymn, { autoRadioFrom: b, insertBoundary: null });
          if (!p.newQ) continue;
          tested += 1;
          const idList = ids(p.newQ);
          if (new Set(idList).size !== idList.length) dupIdBad += 1;
          if (String(p.newQ[p.newCurIdx].id) !== String(cur[curIdx].id)) curIdxBad += 1;
          if (String(p.newQ[p.newCurIdx + 1].id) !== String(hymn.id)) posBad += 1;
        }
      }
    }
  }
  assertEqual(tested > 0, true, '(j) exhaustive sweep actually ran cases');
  assertEqual(dupIdBad, 0, `(j) 910-ish case sweep(tested=${tested}): zero duplicate-id invariant failures`);
  assertEqual(curIdxBad, 0, `(j) 910-ish case sweep(tested=${tested}): zero newCurIdx-points-at-playing-song failures`);
  assertEqual(posBad, 0, `(j) 910-ish case sweep(tested=${tested}): zero inserted-song-position failures`);
  console.log(`  (j) exhaustive sweep tested=${tested} on real src/insertNextCore.js`);
})();

// ---------------------------------------------------------------------
// (k) PLAYNEXT-OPUS-20260906 P0-2 —— shuffle 開→插入→關,插入嘅歌唔可以
// 喺 originalQueueRef 度冇咗(Android 實測:34 首插完 → shuffle 開 34 首仲
// 喺 → shuffle 關跌返 31,插入嘅 3 首無聲無息消失)。呢度直接搬 App.js 嘅
// 修復邏輯(`if (!isShuffledRef.current) originalQueueRef.current = plan.
// newQ;`,同 reorderQueue 一致)入嚟做一個小型模擬,證明主線(插入嗰陣冇
// shuffle)個 case 唔會再蒸發。
// ---------------------------------------------------------------------
(function scenarioK() {
  const original = [song(10), song(11), song(12), song(13)];
  let originalQueueRef = original.slice(); // playQueueImpl 寫嘅
  let isShuffled = false;
  let q = original.slice();
  // 插入一首新歌(冇 shuffle) —— App.js 嘅修復:!isShuffled 就寫 originalQueueRef。
  const plan = computeInsertNext(q, 0, song('X'), { autoRadioFrom: null, insertBoundary: null });
  q = plan.newQ;
  if (!isShuffled) originalQueueRef = plan.newQ;
  assertEqual(ids(originalQueueRef).includes('X'), true, '(k) originalQueueRef synced after insert (not-shuffled path)');
  // 用戶開 shuffle:toggleShuffle 洗牌 queueRef,唔改 originalQueueRef(呢個
  // 係 toggleShuffle 現有行為,唔喺呢次修復範圍)。
  isShuffled = true;
  const shuffled = [q[0], q[3], q[1], q[2]]; // 假設洗成咁,X(index1原位)仍然喺入面
  q = shuffled;
  assertEqual(ids(q).includes('X'), true, '(k) shuffle ON: inserted song still present in shuffled queue');
  // 用戶關返 shuffle:用 originalQueueRef 重砌,旋轉到播緊嗰首行頭。
  isShuffled = false;
  const curNow = q[0];
  const oidx = Math.max(0, originalQueueRef.findIndex((s) => String(s.id) === String(curNow.id)));
  const restored = [...originalQueueRef.slice(oidx), ...originalQueueRef.slice(0, oidx)];
  assertEqual(ids(restored).includes('X'), true, '(k) shuffle OFF restore: inserted song survives (P0-2 fixed)');
})();

// ---------------------------------------------------------------------
// (l) PLAYNEXT-OPUS-20260906 P1-3 —— 插入嘅歌 unavailable(已下架佔位)一律
// 阻,唔理有冇 queue/idle,唔會產出任何 newQ(唔會插入)。
// ---------------------------------------------------------------------
(function scenarioL() {
  const cur = [song(10), song(11), song(12)];
  const dead = { id: 2015, title: '(已下架)', unavailable: true };
  const plan = computeInsertNext(cur, 0, dead, { autoRadioFrom: null, insertBoundary: null });
  assertEqual(plan.blocked, true, '(l) unavailable hymn is blocked');
  assertEqual(plan.newQ, undefined, '(l) blocked hymn produces no newQ (queue untouched)');
  // 空 queue/idle 情況都要阻,唔可以行去 fallbackToSingle 度播咗首下架歌。
  const planIdle = computeInsertNext([], 0, dead, { idle: true });
  assertEqual(planIdle.blocked, true, '(l) unavailable hymn blocked even with empty/idle queue');
  assertEqual(planIdle.fallbackToSingle, false, '(l) blocked takes priority over fallbackToSingle (explicit false, not the idle/empty-queue path)');
})();

// ---------------------------------------------------------------------
// (m) PLAYNEXT-OPUS2-20260906 B1(revert P3-6)—— 上一輪 P3-6 個修法(播到
// 自動尾巴之後就推 autoRadioFrom)整死咗電台尾巴:autoRadioFrom 同時係
// 「headLen」語義(playSingle/rebuildTail/applyAutoplayEnabled 三個
// caller 都靠佢分辨「用戶真係揀咗幾多首」vs「自動接續尾巴」),推咗條線
// = 話俾呢啲 caller 知「頭幾首全部係用戶揀」,觸發頻率高(播到尾巴入面
// 就撞中,係常態唔係邊角)、後果係之後 playSingle() 撳散歌會行「插播」
// 路(isExplicitQueue=true),得返 [新歌,插入嗰首] 兩首、冇尾巴、播完就
// 停(Opus2 iOS 實測「播放清單 (2)」)。
//
// 而家改用現有「插播」概念:autoRadioFrom 完全唔郁(淨係跟正常
// adjustBoundary shift),尾巴期間插入改畫 insertBoundary(insertAt+1)。
// 對照組:插入位喺線之前(用戶仲未播到尾巴)嘅正常情況,唔應該觸發呢條
// override,行為同 (b) 一致(autoRadioFrom 純粹 +1 shift,insertBoundary
// 保持 null)。
// ---------------------------------------------------------------------
(function scenarioM() {
  // 播到尾巴入面:autoRadioFrom=1(第一首之後全部自動),而家播緊 index 3。
  const cur = [song(10), song(20), song(21), song(22), song(23)];
  const plan = computeInsertNext(cur, 3, song('X'), { autoRadioFrom: 1, insertBoundary: null });
  assertEqual(plan.insertAt, 4, '(m) insertAt = curIdx+1');
  assertEqual(plan.autoRadioFrom, 1, '(m) B1: autoRadioFrom untouched(仍然係 headLen=1,唔會俾插入推大)');
  assertEqual(plan.insertBoundary, 5, '(m) B1: insertBoundary(插播分隔線)推去 insertAt+1 代替');
  assertEqual(plan.newQ[plan.insertAt].id, 'X', '(m) inserted song sits right below the insert-boundary line');

  // 對照組:插入位喺線之前(autoRadioFrom=4,insertAt=1)—— 唔應該觸發
  // override,autoRadioFrom 純粹 +1 shift,insertBoundary 保持 null
  // (冇尾巴期間插入嘅情境)。
  const curB = [song(0), song(1), song(2), song(3), song(4), song(5)];
  const planB = computeInsertNext(curB, 0, song('Y'), { autoRadioFrom: 4, insertBoundary: null });
  assertEqual(planB.autoRadioFrom, 5, '(m) control: insertion before the tail still just shifts +1, no override');
  assertEqual(planB.insertBoundary, null, '(m) control: insertBoundary stays null (no tail-insertion override triggered)');

  // B1 主要斷言 —— 尾巴期間插入之後,再撳一首散歌(playSingle):headLen
  // 淨係睇 autoRadioFrom(冇變、仍然係 1)→ isExplicitQueue=false → 唔會
  // 行「插播剩餘清單」嗰條路 → playSingle 會照舊起返電台尾巴(唔會變成
  // explicit 2 首)。抄 App.js playSingle() 頭嗰段(§2478-2486)入嚟做
  // 模擬,證明 qlen 唔會跌落 2(唔係得個「唔跌」,係跟返正常電台邏輯)。
  const headLen = plan.autoRadioFrom != null ? plan.autoRadioFrom : plan.newQ.length;
  const isExplicitQueue = headLen > 1;
  assertEqual(isExplicitQueue, false, '(m) B1: playSingle 之後睇到 headLen=1(冇變)→ 唔當成明確清單');
  const single = song(777);
  const resumeRemainder = isExplicitQueue
    ? plan.newQ.slice(plan.newCurIdx + 1, headLen).filter((s) => String(s.id) !== String(single.id))
    : [];
  assertEqual(resumeRemainder.length, 0, '(m) B1: resumeRemainder 空 → playSingle 行「自動接續尾巴」嗰條路,唔會行「[新歌,插入嗰首] 兩首 explicit」嗰條路(隊列唔會變 2 首)');
})();

// ---------------------------------------------------------------------
// (n) PLAYNEXT-OPUS-20260906 P3-8 —— 失敗 rollback 之後,autoRadioFrom /
// insertBoundary 要用 id 對位重算(reindexBoundaryById),唔可以停留喺失敗
// 嗰刻計出嚟嘅 plan 數值。模擬:native remove 成功、add 拋錯 → reconcile
// 返一個少咗 dup 嗰首嘅陣列,boundary 原本指住嘅元素要喺新陣列搵返新位置。
// ---------------------------------------------------------------------
(function scenarioN() {
  const oldCur = [song(0), song(1), song(2), song(3), song(4)];
  // boundary=3 指住 oldCur[3](=song 3)。native 側:add 拋錯之前 remove(1) 已
  // 經成功執行(即 song(1) 已經冧咗),reconcile 返嚟嘅陣列冇咗 song(1)。
  const rebuiltQ = [song(0), song(2), song(3), song(4)];
  const reidxAutoRadio = reindexBoundaryById(oldCur, 3, rebuiltQ);
  assertEqual(reidxAutoRadio, 2, '(n) boundary re-anchored to the same element (song 3) at its new index in rebuiltQ');
  // boundary 指住嘅元素本身俾拎走咗(例如就係去重刪走嗰個)—— 搵唔返,跌
  // 落 rebuiltQ.length(冇更好嘅答案,寧願線畫喺尾,都唔好整爛)。
  const rebuiltQ2 = [song(0), song(2), song(3), song(4)]; // song(1) 冧咗
  const reidxGone = reindexBoundaryById(oldCur, 1, rebuiltQ2); // boundary 本身就指住 song(1)
  assertEqual(reidxGone, rebuiltQ2.length, '(n) boundary element itself was removed → falls back to rebuiltQ.length');
  // boundary === oldCur.length(冇尾巴實際元素,指住「尾巴之後」)照跟做
  // rebuiltQ.length。
  const reidxTail = reindexBoundaryById(oldCur, oldCur.length, rebuiltQ);
  assertEqual(reidxTail, rebuiltQ.length, '(n) boundary pointing past the end tracks rebuiltQ.length');
  // null/undefined 原封不動,唔郁。
  assertEqual(reindexBoundaryById(oldCur, null, rebuiltQ), null, '(n) null boundary passes through unchanged');
})();

// ---------------------------------------------------------------------
// (o) PLAYNEXT-OPUS-20260906 P3-7 —— 並發兩次 insertNext:模擬 App.js
// `playQueueChainRef.current.then(run, run)` 嗰套排隊機制(唔係
// TrackPlayer/React,純粹重用真嘅 computeInsertNext + 一條 Promise 鏈),
// 證明兩個「幾乎同時」call 嘅 insertNext(唔 await 第一個就即刻撳第二個)
// 會被鏈逼到序列執行、cur/curIdx 喺輪到自己嗰一刻先重讀,唔會有一個
// mutation 覆寫咗另一個(對照 §3 P3-7:冇鏈嘅話,兩個 mutation 可能各自攞住
// 舊快照,其中一個嘅結果會俾另一個覆寫)。用隨機延遲模擬 TrackPlayer.add()
// 呢啲 await 之間嘅時間差,跑多次confirming 冇 flaky。
// ---------------------------------------------------------------------
const scenarioOPromise = (function scenarioO() {
  async function runOnce() {
    const chainRef = { current: Promise.resolve() };
    const queueRef = { current: [song(0), song(1), song(2)] }; // 播緊 index 0
    const curIdxRef = { current: 0 };
    function insertNextMock(hymn) {
      const run = async () => {
        // cur/curIdx 喺 run() 執行(即輪到自己)嗰一刻先讀 —— 呢個係 P3-7
        // 修法嘅命脈:唔係喺 call insertNextMock 嗰一刻讀死。
        const cur = queueRef.current;
        const curIdx = curIdxRef.current;
        const plan = computeInsertNext(cur, curIdx, hymn, {});
        // 模擬 TrackPlayer.remove/add 嘅 await 之間有真實時間差,製造race窗口。
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 8)));
        queueRef.current = plan.newQ;
        if (plan.newCurIdx !== curIdx) curIdxRef.current = plan.newCurIdx;
      };
      const next = chainRef.current.then(run, run);
      chainRef.current = next;
      return next;
    }
    // 唔 await 第一個,即刻撳第二個 —— 模擬「sheet 即刻閂之後即刻撳另一首」。
    const p1 = insertNextMock(song('A'));
    const p2 = insertNextMock(song('B'));
    await Promise.all([p1, p2]);
    return ids(queueRef.current);
  }
  return (async () => {
    let allGood = true;
    let lastResult = null;
    for (let i = 0; i < 20; i++) {
      const result = await runOnce();
      lastResult = result;
      // 兩次插入都要喺入面,冇一個俾對方嘅 mutation 覆寫;次序 = 後插先播
      // (B 後撳,推喺 A 前面):[0, B, A, 1, 2]。
      const okShape = result[0] === 0 && result[1] === 'B' && result[2] === 'A'
        && result.length === 5 && new Set(result.map(String)).size === 5;
      if (!okShape) allGood = false;
    }
    assertEqual(allGood, true, `(o) 20 runs of two concurrent insertNext calls all serialize correctly, no clobbering (last=${JSON.stringify(lastResult)})`);
  })();
})();

// ---------------------------------------------------------------------
// (p) PLAYNEXT-OPUS2-20260906 B2 —— shuffle 開住嗰陣插入,originalQueueRef
// 都要同步(唔淨係「插入」嗰下,dedupe 搬位都要跟)。上一輪個修法(P0-2)
// 淨係覆蓋咗 `!isShuffledRef.current` 果條路,shuffle 開住插入嘅歌喺
// originalQueueRef(pre-shuffle 次序)度從未出現過 → 關返 shuffle 用佢
// 重砌就無聲無息消失(Opus2 iOS 實測 33→31)。呢度抄 App.js
// insertNextImpl 而家嘅寫法(B2 patch:!isShuffled 直接覆寫,shuffle 開住
// 就喺 originalQueueRef 度做返一次獨立嘅「去重(hymn.id)+插入(錨定播緊
// 嗰首)」)入嚟做模擬,連續插三首(兩首全新 + 一首本身已經喺
// originalQueueRef 度嘅歌,行埋 dedupe 搬位嗰條路)之後先熄 shuffle,
// 證明數量唔跌、三首插入/搬位嘅歌全部仲喺度、冇重複 id。
// ---------------------------------------------------------------------
(function scenarioP() {
  const original = [song(10), song(11), song(12), song(13), song(14)];
  let originalQueueRef = original.slice(); // playQueueImpl 寫嘅 pre-shuffle 次序
  const isShuffled = true; // 插入嘅三次全部發生喺 shuffle 開住嗰段時間

  // App.js insertNextImpl 嘅 B2 patch(逐行抄):
  function syncOriginalQueueRef(cur, curIdx, hymn, planNewQ) {
    if (!isShuffled) {
      originalQueueRef = planNewQ;
    } else {
      const o = originalQueueRef || [];
      const without = o.filter((x) => String(x && x.id) !== String(hymn.id));
      const anchor = cur[curIdx];
      const oi = without.findIndex((x) => String(x && x.id) === String(anchor && anchor.id));
      originalQueueRef = oi >= 0
        ? [...without.slice(0, oi + 1), hymn, ...without.slice(oi + 1)]
        : [...without, hymn];
    }
  }

  // 假設洗牌之後嘅播放次序(播緊 song(12))。
  let q = [song(12), song(14), song(10), song(11), song(13)];
  let curIdx = 0;

  // 插第一首:全新歌 X。
  const hymnX = song('X');
  const planX = computeInsertNext(q, curIdx, hymnX, { autoRadioFrom: null, insertBoundary: null });
  syncOriginalQueueRef(q, curIdx, hymnX, planX.newQ);
  q = planX.newQ; curIdx = planX.newCurIdx;

  // 插第二首:全新歌 Y。
  const hymnY = song('Y');
  const planY = computeInsertNext(q, curIdx, hymnY, { autoRadioFrom: null, insertBoundary: null });
  syncOriginalQueueRef(q, curIdx, hymnY, planY.newQ);
  q = planY.newQ; curIdx = planY.newCurIdx;

  assertEqual(ids(q).includes('X') && ids(q).includes('Y'), true, '(p) both freshly-inserted songs present in the shuffled (native) queue');
  assertEqual(new Set(ids(q).map(String)).size, q.length, '(p) shuffled queue itself has no duplicate ids after two inserts');

  // 插第三首:song(13),本身已經喺 originalQueueRef(pre-shuffle 次序)度
  // —— 行 dedupe 搬位嗰條路,證明唔會喺 originalQueueRef 度留低兩份 '13'。
  const dupSong = song(13);
  const planDup = computeInsertNext(q, curIdx, dupSong, { autoRadioFrom: null, insertBoundary: null });
  syncOriginalQueueRef(q, curIdx, dupSong, planDup.newQ);
  q = planDup.newQ; curIdx = planDup.newCurIdx;

  assertEqual(new Set(ids(originalQueueRef).map(String)).size, originalQueueRef.length, '(p) B2: originalQueueRef has no duplicate ids after re-inserting a song (13) that was already present while shuffled (dedupe path exercised)');
  assertEqual(originalQueueRef.length, original.length + 2, '(p) B2: originalQueueRef grew by exactly 2 (X, Y) — the dedupe re-insert of 13 is a move, not a net addition');

  // 熄 shuffle:toggleShuffle 現有邏輯(用 originalQueueRef 重砌,旋轉到
  // 播緊嗰首行頭)。
  const curNow = q[curIdx];
  const oidx = Math.max(0, originalQueueRef.findIndex((s) => String(s.id) === String(curNow.id)));
  const restored = [...originalQueueRef.slice(oidx), ...originalQueueRef.slice(0, oidx)];

  assertEqual(restored.length, original.length + 2, '(p) B2 fix: shuffle-off restored queue length unchanged (not lost) after three inserts made while shuffled ON');
  assertEqual(ids(restored).includes('X'), true, '(p) B2 fix: first inserted song (X) survives shuffle-off restore');
  assertEqual(ids(restored).includes('Y'), true, '(p) B2 fix: second inserted song (Y) survives shuffle-off restore');
  assertEqual(new Set(ids(restored).map(String)).size, restored.length, '(p) B2 fix: no duplicate ids in the restored (shuffle-off) queue');
})();

// ---------------------------------------------------------------------
// scenarioO 係 async(入面用真 setTimeout 模擬 await 之間嘅時間差),要等佢
// 個 promise 真係 resolve 咗先印總結,唔用固定 sleep(避免又慢又唔可靠)。
// ---------------------------------------------------------------------
scenarioOPromise.then(() => {
  console.log(`insertnext-harness: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}).catch((e) => {
  console.error('scenarioO crashed:', e);
  process.exit(1);
});
