// ops/perf/harness/w2/hc1-otp-verify-harness.mjs — DEEP-AUDIT W2 §2 H-C1
//
// otpAuth.js 嘅 `/otp/verify`/`/otp/verify-ticket` 真正打 Twilio 先會行到
// verifyRecordFail/verifyCheckPhoneLock 嗰段(otpConfigured() 喺呢個環境
// 冇 TWILIO_* env 一定 false,route 會喺打 Twilio 之前已經 503 return),
// 冇 Twilio 帳戶就冇得經真 HTTP 打通全條鏈。呢度直接 unit 層面測試
// verifyCheckPhoneLock/verifyRecordFail/verifyClearPhone/verifyIpLimiter
// 呢幾個 pure export(otpAuth.js route handler 本身完全冇改用呢啲
// export,純粹俾 harness 睇)。
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-test-secret-not-real';

const { verifyCheckPhoneLock, verifyRecordFail, verifyClearPhone, verifyIpLimiter } =
  await import('../../../../backend/routes/otpAuth.js');

const events = [];
const phoneA = '+85261111111';

// (a) 同一 phone 打 6 次「錯」(每次:先睇 lock 狀態,再 recordFail)
for (let i = 1; i <= 6; i++) {
  const lockBefore = verifyCheckPhoneLock(phoneA);
  events.push({ phase: 'sixFails', i, lockedBefore: lockBefore.locked, retryAfterSec: lockBefore.retryAfterSec ?? null });
  if (!lockBefore.locked) verifyRecordFail(phoneA);
}
const lockAfter6 = verifyCheckPhoneLock(phoneA);
events.push({ phase: 'afterSixFails', locked: lockAfter6.locked, retryAfterSec: lockAfter6.retryAfterSec ?? null });

// (b) 成功一次 -> clear -> 即刻應該未 locked
verifyClearPhone(phoneA);
const lockAfterClear = verifyCheckPhoneLock(phoneA);
events.push({ phase: 'afterSuccessClear', locked: lockAfterClear.locked });

// (c) 20 個唔同 phone 各打 1 次「錯」-> 全部未 locked(未夠 5 次)
for (let i = 0; i < 20; i++) {
  const phone = `+8526${3000000 + i}`;
  const lockBefore = verifyCheckPhoneLock(phone);
  events.push({ phase: 'distinctPhones', i, lockedBefore: lockBefore.locked });
  verifyRecordFail(phone);
}

// (d) per-IP 保底:同一 ip 打 61 次 check() -> 第 61 次先 limited
const ipA = '203.0.113.11';
for (let i = 1; i <= 61; i++) {
  const limited = verifyIpLimiter.check(ipA);
  if (i === 60 || i === 61) events.push({ phase: 'ipBackstop', i, limited });
}

for (const e of events) console.log(JSON.stringify(e));
