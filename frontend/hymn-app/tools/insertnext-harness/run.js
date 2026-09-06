#!/usr/bin/env node
// tools/insertnext-harness/run.js — PLAYNEXT-EXEC-20260906 §2 H1
//
// 直接 require `../../src/insertNextCore.js`(而家真係俾 App.js 用緊嘅同一份
// 源碼,冇抄副本)——呢個係純 CommonJS function,零 React/TrackPlayer 依賴,
// 純 Node 30 秒內跑完,唔使 emulator/simulator。覆蓋執行單 §2 H1 (a)-(g)
// 七個情境。任何一個 FAIL 就 process.exit(1),可以當 gate 用。
//
// 點跑: node tools/insertnext-harness/run.js

const path = require('path');
const { computeInsertNext, reconcileFromNativeQueue } = require(
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
console.log(`insertnext-harness: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
