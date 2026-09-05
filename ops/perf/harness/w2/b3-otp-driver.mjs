// ops/perf/harness/w2/b3-otp-driver.mjs — 驅動 b3-otp-checkrate-{old,new}.mjs
// 用法: node b3-otp-driver.mjs <old|new>
const which = process.argv[2];
const modPath = which === 'old' ? './b3-otp-checkrate-old.mjs' : './b3-otp-checkrate-new.mjs';
const { checkRate, mapSizes } = await import(modPath);

const events = [];
const phoneA = '+85261234567';
const ipA = '203.0.113.11';

// (a) 同一 phone/ip 打 6 次 —— 前 5 次應該分別受 cooldown(第2-5次,60秒內)
// 阻擋,第 1 次同「等夠 60 秒」之後嗰次應該 ok。用 fake now 避免真等。
function withFakeNow(deltaMs, fn) {
  const real = Date.now;
  const base = real();
  Date.now = () => base + deltaMs;
  try { return fn(); } finally { Date.now = real; }
}

for (let i = 1; i <= 6; i++) {
  // 每次相隔模擬 61 秒,避開 cooldown,踩 PHONE_DAILY=5 嘅上限
  const r = withFakeNow(i * 61 * 1000, () => checkRate(phoneA, ipA));
  events.push({ phase: 'phoneDailyLoop', i, ok: r.ok, code: r.code || null });
  if (r.ok) withFakeNow(i * 61 * 1000, () => r.commit());
}

// (b) 冷卻:連續兩次冇隔 60 秒 -> 第二次 cooldown
const phoneB = '+85267654321';
const r1 = checkRate(phoneB, ipA);
events.push({ phase: 'cooldown', step: 1, ok: r1.ok, code: r1.code || null });
if (r1.ok) r1.commit();
const r2 = checkRate(phoneB, ipA);
events.push({ phase: 'cooldown', step: 2, ok: r2.ok, code: r2.code || null });

// (c) 20 個唔同 phone(用返夠遠嘅 fake now 避免撞 cooldown/day),各打一次都 ok
for (let i = 0; i < 20; i++) {
  const phone = `+8526${1000000 + i}`;
  const r = withFakeNow((100 + i) * 61 * 1000, () => checkRate(phone, ipA));
  events.push({ phase: 'distinctPhones', i, ok: r.ok, code: r.code || null });
  if (r.ok) withFakeNow((100 + i) * 61 * 1000, () => r.commit());
}

// (d) IP daily cap:同一 ip 已經被上面 (a)(c) 打咗好多次,再打多幾次應該撞 ip_cap
for (let i = 0; i < 5; i++) {
  const phone = `+8526${2000000 + i}`;
  const r = withFakeNow((200 + i) * 61 * 1000, () => checkRate(phone, ipA));
  events.push({ phase: 'ipCapProbe', i, ok: r.ok, code: r.code || null });
}

events.push({ phase: 'mapSizes', sizes: mapSizes() });

for (const e of events) console.log(JSON.stringify(e));
