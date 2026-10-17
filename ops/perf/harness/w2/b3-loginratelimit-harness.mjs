// ops/perf/harness/w2/b3-loginratelimit-harness.mjs — DEEP-AUDIT W2 Commit B3
//
// lib/loginRateLimit.js 嘅 ipLoginLimiter/phoneLoginLimiter 冇掛喺任何
// makeLimiter().check(req) 形狀(佢哋淨計失敗,唔係全部 request——見
// lib/loginRateLimit.js 頂部新加嘅註解),所以唔可以好似 invites/share/
// presence/clientLog 咁用 HTTP 層面嘅 b3-harness.mjs 對照。呢度直接 unit
// 層面 call isLocked/recordFail/clear,用同一個腳本(sequence 唔變)分別
// 餵 OLD(git show 43589c7 snapshot)同 NEW(改咗之後嘅檔案)兩個 module,
// 逐步記錄返回值,再對照。
//
// 用法:node b3-loginratelimit-harness.mjs <old|new> <modulePath>

const [, , which, modulePath] = process.argv;
if (!which || !modulePath) {
  console.error('usage: node b3-loginratelimit-harness.mjs <old|new> <modulePath>');
  process.exit(2);
}

const mod = await import(modulePath);
const { ipLoginLimiter, phoneLoginLimiter } = mod;

const events = [];

function run(limiter, label) {
  const keyA = '203.0.113.11';
  // (a) 連續 12 次 recordFail 同一 key,每次之前記 isLocked
  for (let i = 1; i <= 12; i++) {
    const lockedBefore = limiter.isLocked(keyA);
    events.push({ label, phase: 'recordFailLoop', i, key: keyA, lockedBefore });
    limiter.recordFail(keyA);
  }
  const lockedAfterLoop = limiter.isLocked(keyA);
  events.push({ label, phase: 'afterLoop', key: keyA, lockedAfterLoop });

  // (b) clear 之後應該即刻返 false
  limiter.clear(keyA);
  events.push({ label, phase: 'afterClear', key: keyA, lockedAfterClear: limiter.isLocked(keyA) });

  // (c) 5 個唔同 key 各 recordFail 一次,查 isLocked(全部應該 false,未夠 max)
  const otherKeys = ['203.0.113.21', '203.0.113.22', '203.0.113.23', '203.0.113.24', '203.0.113.25'];
  for (const k of otherKeys) {
    limiter.recordFail(k);
    events.push({ label, phase: 'distinctKey', key: k, locked: limiter.isLocked(k) });
  }
}

run(ipLoginLimiter, 'ip');
run(phoneLoginLimiter, 'phone');

for (const e of events) console.log(JSON.stringify(e));
