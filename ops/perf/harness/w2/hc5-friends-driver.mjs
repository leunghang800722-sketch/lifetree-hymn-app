// ops/perf/harness/w2/hc5-friends-driver.mjs — 驅動 hc5-friends-dailylimiter-{old,new}.mjs
// 用法: node hc5-friends-driver.mjs <old|new>
const which = process.argv[2];
const modPath = which === 'old' ? './hc5-friends-dailylimiter-old.mjs' : './hc5-friends-dailylimiter-new.mjs';
const { makeDailyLimiter } = await import(modPath);

const LOOKUP_DAILY_MAX = 20;
const lookupLimiter = makeDailyLimiter(LOOKUP_DAILY_MAX);

const events = [];
const userA = 4242;

// (a) 同一 user 打 21 次(max+1),每次成功就 commit
for (let i = 1; i <= LOOKUP_DAILY_MAX + 1; i++) {
  const r = lookupLimiter.check(userA);
  events.push({ phase: 'sameUserLoop', i, ok: r.ok });
  if (r.ok) r.commit();
}

// (b) 5 個唔同 user 各打一次,全部應該 ok
for (const uid of [1, 2, 3, 4, 5]) {
  const r = lookupLimiter.check(uid);
  events.push({ phase: 'distinctUsers', uid, ok: r.ok });
  if (r.ok) r.commit();
}

for (const e of events) console.log(JSON.stringify(e));
