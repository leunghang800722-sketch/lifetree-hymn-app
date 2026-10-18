#!/usr/bin/env node
// tools/usersync-harness/run.js — ODELY-OPT-EXEC-20261018 §① 1a/1b
//
// 做法(同 hls-preflight-harness 一樣「babel 真 module」):用 repo 自己嘅
// @babel/core 將真 src/sync/userSync.js(同 externalStore.js)轉 CJS,記憶體入面
// 載入(唔寫任何檔案),依賴(MMKV storage / config / clientLog / authSession)
// 用 in-memory mock 接住,fetch 用可控延遲 mock。
// 同一套場景對兩個版本跑:
//   NEW = 工作目錄而家嘅 src/sync/userSync.js(期望全過)
//   OLD = git show d74c483:frontend/hymn-app/src/sync/userSync.js(負控:
//         (a)(b)(c) 期望 FAIL;(d)(e) 舊版冇 outboxStore → (e) FAIL)
// 輸出只列證據同 PASS/FAIL 標記;任何 NEW 場景 fail → exit 1。
//
// 點跑: node tools/usersync-harness/run.js

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const babel = require(path.join(APP_ROOT, 'node_modules/@babel/core'));

function transform(src, filename) {
  return babel.transform(src, {
    filename, babelrc: false, configFile: false, cwd: APP_ROOT,
    plugins: [path.join(APP_ROOT, 'node_modules/@babel/plugin-transform-modules-commonjs')],
  }).code;
}

// 載入一份 userSync 源碼,回傳 { mod, env }。env 係本次載入獨立嘅 mock 世界。
function load(src, label) {
  const env = {
    mmkv: new Map(),
    fetchCalls: [],        // { method, url, tag }
    reportUnauthorized: [],
    clientLogs: [],
    gate: null,            // (call) => Promise<{status, ok}>,測試控制延遲/結果
    setThrows: false,      // true → MMKV set 持續 throw(f)
    getThrowOnce: false,   // true → 下一次 getString throw 一次(g)
  };
  const mocks = {
    '../storage': { getStorage: () => ({
      getString: (k) => {
        if (env.getThrowOnce) { env.getThrowOnce = false; throw new Error('mmkv read'); }
        return env.mmkv.has(k) ? env.mmkv.get(k) : undefined;
      },
      set: (k, v) => { if (env.setThrows) throw new Error('mmkv write'); env.mmkv.set(k, String(v)); },
      delete: (k) => { env.mmkv.delete(k); },
    }) },
    '../config': { API_BASE: 'http://harness.invalid' },
    '../clientLog.js': { sendClientLog: (e, f) => env.clientLogs.push({ e, f }) },
    '../authSession': { reportUnauthorized: (t) => env.reportUnauthorized.push(t) },
  };
  const esPath = path.join(APP_ROOT, 'src/hooks/externalStore.js');
  const esCode = transform(fs.readFileSync(esPath, 'utf8'), esPath);
  const esModule = { exports: {} };
  new Function('require', 'module', 'exports', esCode)(
    (id) => require(path.join(APP_ROOT, 'node_modules', id)), esModule, esModule.exports);
  mocks['../hooks/externalStore.js'] = esModule.exports;

  const code = transform(src, path.join(APP_ROOT, 'src/sync/userSync.js'));
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => {
    if (!(id in mocks)) throw new Error(`[harness:${label}] unexpected import ${id}`);
    return mocks[id];
  }, m, m.exports);

  global.fetch = (url, opts = {}) => {
    const call = { method: opts.method || 'GET', url: String(url) };
    env.fetchCalls.push(call);
    return Promise.resolve(env.gate ? env.gate(call) : { ok: true, status: 200 }).then((r) => ({
      ok: r.ok !== false, status: r.status || 200, json: async () => r.body || {},
    }));
  };
  return { mod: m.exports, env };
}

const NEW_SRC = fs.readFileSync(path.join(APP_ROOT, 'src/sync/userSync.js'), 'utf8');
const OLD_SRC = execFileSync('git', ['show', 'd74c483:frontend/hymn-app/src/sync/userSync.js'],
  { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 可手動放行嘅 fetch gate:每個 call 掛住直到 release(call.url)。
function manualGate(env) {
  const pending = [];
  env.gate = (call) => new Promise((resolve) => { pending.push({ call, resolve }); });
  return {
    pending,
    release: (i = 0, res = { ok: true, status: 200 }) => { const p = pending.splice(i, 1)[0]; p.resolve(res); },
    waitPending: async (n) => { for (let i = 0; i < 200 && pending.length < n; i++) await sleep(1); },
  };
}
const outboxOf = (env) => JSON.parse(env.mmkv.get('sync.outbox.v1') || '[]');
const sig = (o) => `${o.op}:${o.hymn_id ?? o.playlist?.id ?? o.id}`;

// ---- 場景(回傳 { checks:[[name,bool,evidence]], ... }) ----
const scenarios = {};

// (a) flush 中 enqueue fav_add
scenarios.a = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });          // 飛行期間
  g.release(0);                                        // op1 完成
  await g.waitPending(1);                              // 若 op2 仍在 outbox,loop/pending flush 會推佢
  if (g.pending.length) g.release(0);                  // 舊版 op2 已丟 → 冇第二個 call,唔放行
  await f; await sleep(5);
  while (g.pending.length) g.release(0);
  await sleep(5);
  const pushed = env.fetchCalls.map((c) => `${c.method} ${c.url.split('/favorites/')[1]}`);
  return [
    ['(a) op2 有被推上 server', pushed.includes('POST 2'), { pushed }],
    ['(a) 最終 outbox 冇殘留(drain 完)', outboxOf(env).length === 0, { outbox: outboxOf(env).map(sig) }],
  ];
};
// 修前行為補一個直接證據:flush 剛結束時 outbox 內容
scenarios.aLost = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  const mid = outboxOf(env).map(sig);
  g.release(0);
  await sleep(5);
  const after = outboxOf(env).map(sig);   // op1 完成後、op2 未推前
  while (g.pending.length) { g.release(0); await sleep(5); }
  return [
    ['(a2) enqueue 後 outbox=[fav_add:1,fav_add:2]', JSON.stringify(mid) === '["fav_add:1","fav_add:2"]', { mid }],
    ['(a2) op1 完成後 outbox 仍含 fav_add:2', after.includes('fav_add:2'), { after }],
  ];
};

// (b) 連撳兩個心心:兩個 op 飛緊中再 enqueue
scenarios.b = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 3 });
  mod.enqueue({ op: 'fav_remove', hymn_id: 1 });
  g.release(0);
  for (let i = 0; i < 8; i++) { await g.waitPending(1); if (g.pending.length) g.release(0); await sleep(2); }
  await f; await sleep(5);
  while (g.pending.length) { g.release(0); await sleep(2); }
  const pushed = env.fetchCalls.map((c) => `${c.method}:${c.url.split('/favorites/')[1]}`);
  const want = ['POST:1', 'POST:2', 'POST:3', 'DELETE:1'];
  return [
    ['(b) 四個 op 全部推上 server(次序保留)', JSON.stringify(pushed) === JSON.stringify(want), { pushed }],
    ['(b) 最終 outbox 空', outboxOf(env).length === 0, { outbox: outboxOf(env).map(sig) }],
  ];
};

// (c) pl_upsert 飛緊中同 playlist 再 enqueue 更新 ts
scenarios.c = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  const realNow = Date.now; let t = 1000;
  Date.now = () => t;
  try {
    mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P1', name: 'v1' } });
    const g = manualGate(env);
    const f = mod.flush();
    await g.waitPending(1);
    t = 2000;
    mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P1', name: 'v2' } }); // collapse 剷走 v1,留 v2(ts=2000)
    const mid = outboxOf(env).map((o) => `${o.playlist.name}@${o.ts}`);
    g.release(0);
    await sleep(5);
    const after = outboxOf(env).map((o) => `${o.playlist.name}@${o.ts}`);
    for (let i = 0; i < 6; i++) { await g.waitPending(1); if (g.pending.length) g.release(0); await sleep(2); }
    await f; await sleep(5);
    while (g.pending.length) { g.release(0); await sleep(2); }
    const bodies = env.fetchCalls.map((c) => c.url.split('/playlists/')[1]);
    return [
      ['(c) enqueue 後 outbox 只剩新 ts 嗰個 v2@2000', JSON.stringify(mid) === '["v2@2000"]', { mid }],
      ['(c) 舊 op 完成後新嗰個保留(未推前仍在 outbox)', JSON.stringify(after) === '["v2@2000"]', { after }],
      ['(c) 新 op v2 最終被推(共 2 次 PUT P1)', bodies.length === 2 && bodies.every((x) => x === 'P1'), { bodies }],
    ];
  } finally { Date.now = realNow; }
};

// (d) runOp fail 中途 enqueue → queue 原封 + 新 op 保留
scenarios.d = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 9 });
  g.release(0, { ok: false, status: 500 });     // op1 fail → break
  const drained = await f;
  await sleep(5);
  const calls0 = env.fetchCalls.length;
  // _pendingFlush 補跑會再試 op1:令佢一直 fail 以免無限
  while (g.pending.length) { g.release(0, { ok: false, status: 500 }); await sleep(3); }
  return [
    ['(d) fail 路徑 flush 回 false', drained === false, { drained }],
    ['(d) fail 後 outbox = [1,2,9] 原封 + 新 op 保留', JSON.stringify(outboxOf(env).map(sig)) === '["fav_add:1","fav_add:2","fav_add:9"]', { outbox: outboxOf(env).map(sig) }],
    ['(d) fail 後冇再推 op2/op9(fail 即停)', env.fetchCalls.every((c) => c.url.endsWith('/favorites/1')), { calls: env.fetchCalls.map((c) => c.url.split('/favorites/')[1]), calls0 }],
  ];
};

// (e) outbox length store 隨 write 即時變(1b)
scenarios.e = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  const store = mod.outboxStore;
  if (!store) return [['(e) userSync 有 outboxStore export', false, { outboxStore: typeof store }]];
  const snap = () => store.getSnapshot().length;
  const out = [];
  out.push(snap());                                  // 0
  mod.enqueue({ op: 'fav_add', hymn_id: 1 }); out.push(snap());            // 1
  mod.enqueue({ op: 'fav_add', hymn_id: 2 }); out.push(snap());            // 2
  mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P', n: 1 } }); out.push(snap()); // 3
  mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P', n: 2 } }); out.push(snap()); // collapse → 3
  const g = manualGate(env);
  const f = mod.flush();
  for (let i = 0; i < 12; i++) { await g.waitPending(1); if (g.pending.length) g.release(0); await sleep(2); }
  await f;
  out.push(snap());                                  // 0
  mod.enqueue({ op: 'fav_add', hymn_id: 5 }); mod.clearOutbox(); out.push(snap()); // 0
  // 與 getOutboxLength 一致
  mod.enqueue({ op: 'fav_add', hymn_id: 6 });
  const consistent = snap() === mod.getOutboxLength();
  return [
    ['(e) store.length 隨 write 即時變 [0,1,2,3,3,0,0]', JSON.stringify(out) === '[0,1,2,3,3,0,0]', { out }],
    ['(e) store.length === getOutboxLength()', consistent, { store: snap(), get: mod.getOutboxLength() }],
  ];
};

// ---- 階段①修正(M1/M2/L1)場景 ----
// (f) MMKV set 持續 throw + 2 個 op:推 <= 上限、唔死循環、outbox 保留
scenarios.f = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  env.setThrows = true;
  // 安全閘:舊寫法會無限重推 → 超過 300 次 call 即令 fetch fail 強制收工(計為 FAIL)
  env.gate = () => (env.fetchCalls.length > 300 ? { ok: false, status: 500 } : { ok: true, status: 200 });
  await mod.flush();
  const n = env.fetchCalls.length;
  return [
    ['(f) set 持續 throw:推 <= 上限(2+50)且冇死循環', n <= 52, { fetchCalls: n }],
    ['(f) 持久化 outbox 保留 [1,2](set 失敗冇改到)', JSON.stringify(outboxOf(env).map(sig)) === '["fav_add:1","fav_add:2"]', { outbox: outboxOf(env).map(sig) }],
  ];
};

// (g) 飛行中 getString throw 一次:未推 op 保留(唔被 [] 蓋走)
scenarios.g = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  env.getThrowOnce = true;                         // op1 完成後重讀會 throw
  g.release(0);
  await g.waitPending(1);                          // op2 應仍被推(記憶體 queue)
  g.release(0, { ok: false, status: 500 });        // op2 fail → break
  await f; await sleep(5);
  while (g.pending.length) { g.release(0, { ok: false, status: 500 }); await sleep(3); }
  return [
    ['(g) 讀錯後 op2 仍被推(fetch 見 POST 1,POST 2...)', env.fetchCalls.some((c) => c.url.endsWith('/favorites/2')), { calls: env.fetchCalls.map((c) => c.url.split('/favorites/')[1]) }],
    ['(g) op2 fail 後持久化 outbox 仍含 fav_add:2(冇被 [] 蓋走;尾巴-1 後讀錯唔寫,已推 op1 暫留,下次成功重讀剔走)', outboxOf(env).map(sig).includes('fav_add:2'), { outbox: outboxOf(env).map(sig) }],
  ];
};

// (h) 同毫秒:pl_upsert 同 id 兩個;fav add→remove→add
scenarios.h = async (src, label) => {
  const realNow = Date.now; Date.now = () => 5000;
  try {
    const A = load(src, label); A.mod.setAuthToken('t');
    A.mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P1', name: 'v1' } });
    const gA = manualGate(A.env);
    const fA = A.mod.flush();
    await gA.waitPending(1);
    A.mod.enqueue({ op: 'pl_upsert', playlist: { id: 'P1', name: 'v2' } });   // 同毫秒
    gA.release(0);
    for (let i = 0; i < 6; i++) { await gA.waitPending(1); if (gA.pending.length) gA.release(0); await sleep(2); }
    await fA; await sleep(5);
    while (gA.pending.length) { gA.release(0); await sleep(2); }
    const puts = A.env.fetchCalls.length;

    const B = load(src, label); B.mod.setAuthToken('t');
    B.mod.enqueue({ op: 'fav_add', hymn_id: 1 });
    const gB = manualGate(B.env);
    const fB = B.mod.flush();
    await gB.waitPending(1);
    B.mod.enqueue({ op: 'fav_remove', hymn_id: 1 });
    B.mod.enqueue({ op: 'fav_add', hymn_id: 1 });                             // 同毫秒同 key 同 op
    gB.release(0);
    for (let i = 0; i < 8; i++) { await gB.waitPending(1); if (gB.pending.length) gB.release(0); await sleep(2); }
    await fB; await sleep(5);
    while (gB.pending.length) { gB.release(0); await sleep(2); }
    const pushed = B.env.fetchCalls.map((c) => `${c.method}:${c.url.split('/favorites/')[1]}`);
    return [
      ['(h) 同毫秒同 id pl_upsert:v2 保留並推(共 2 次 PUT)+ outbox 空', puts === 2 && outboxOf(A.env).length === 0, { puts, outbox: outboxOf(A.env).map(sig) }],
      ['(h) 同毫秒 fav add→remove→add:全保留次序 [POST:1,DELETE:1,POST:1]', JSON.stringify(pushed) === '["POST:1","DELETE:1","POST:1"]' && outboxOf(B.env).length === 0, { pushed, outbox: outboxOf(B.env).map(sig) }],
    ];
  } finally { Date.now = realNow; }
};

// (i) 舊格式(冇 seq)outbox op 照推;飛行中新 op(有 seq)亦保留
scenarios.i = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  env.mmkv.set('sync.outbox.v1', JSON.stringify([
    { op: 'fav_add', hymn_id: 1, ts: 100 },
    { op: 'fav_add', hymn_id: 2, ts: 101 },
  ]));
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 3 });
  for (let i = 0; i < 8; i++) { g.release(0); await g.waitPending(1).catch(() => {}); await sleep(2); if (!g.pending.length) break; }
  await f; await sleep(5);
  while (g.pending.length) { g.release(0); await sleep(2); }
  const pushed = env.fetchCalls.map((c) => c.url.split('/favorites/')[1]);
  return [
    ['(i) 舊格式 op 全推 + 飛行中新 op 保留 [1,2,3],outbox 空', JSON.stringify(pushed) === '["1","2","3"]' && outboxOf(env).length === 0, { pushed, outbox: outboxOf(env).map(sig) }],
  ];
};

// ---- 階段①尾巴(Opus2 發現 1–3)場景 ----
// (j) flush 重讀 null 時,飛行期間 enqueue 嘅新 op 保留(舊版 writeOutbox(slice(1)) 蓋走)
scenarios.j = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  const g = manualGate(env);
  const f = mod.flush();
  await g.waitPending(1);
  mod.enqueue({ op: 'fav_add', hymn_id: 9 });      // 飛行期間
  env.getThrowOnce = true;                         // op1 完成後重讀 throw
  g.release(0);
  await f; await sleep(5);
  while (g.pending.length) { g.release(0); await sleep(3); }
  return [
    ['(j) 重讀 null 後飛行期間 op9 仍喺持久化 outbox', outboxOf(env).map(sig).includes('fav_add:9'), { outbox: outboxOf(env).map(sig) }],
  ];
};

// (k) enqueue 遇讀錯唔蓋走已有持久化 outbox;之後讀回成功新 op 都併返
scenarios.k = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  mod.enqueue({ op: 'fav_add', hymn_id: 2 });
  env.getThrowOnce = true;
  mod.enqueue({ op: 'fav_add', hymn_id: 3 });      // 讀錯
  const afterErr = outboxOf(env).map(sig);
  mod.enqueue({ op: 'fav_add', hymn_id: 4 });      // 讀回成功
  const afterOk = outboxOf(env).map(sig);
  return [
    ['(k) 讀錯嗰下 enqueue 後主隊仍含 [1,2](冇被 [3] 蓋走)', afterErr.includes('fav_add:1') && afterErr.includes('fav_add:2'), { afterErr }],
    ['(k) 下次成功後主隊 = [1,2,3,4](side buffer 合併,無丟 op)', JSON.stringify(afterOk) === '["fav_add:1","fav_add:2","fav_add:3","fav_add:4"]', { afterOk }],
    ['(k) outboxReadError 只報一次', env.clientLogs.filter((l) => l.e === 'outboxReadError').length <= 1, { logs: env.clientLogs.map((l) => l.e) }],
  ];
};

// (l) outboxLoopGuard detail 含 initialLen/pushed/enqueuedDuring
//     (用戶狂撳:每推一個 op 飛行期間又 enqueue 一個,推到上限)
scenarios.l = async (src, label) => {
  const { mod, env } = load(src, label);
  mod.setAuthToken('t');
  mod.enqueue({ op: 'fav_add', hymn_id: 1 });
  let n = 100;
  env.gate = () => {
    if (env.fetchCalls.length > 300) return { ok: false, status: 500 };
    mod.enqueue({ op: 'fav_add', hymn_id: n++ });
    return { ok: true, status: 200 };
  };
  await mod.flush();
  const lg = env.clientLogs.find((l) => l.e === 'outboxLoopGuard');
  let d = null; try { d = JSON.parse(lg && lg.f.detail); } catch (_) {}
  const ok = d && d.initialLen === 1 && d.pushed === 51 && d.enqueuedDuring === 51;
  return [['(l) loopGuard detail 有 initialLen=1/pushed=51/enqueuedDuring=51', !!ok, { detail: lg && lg.f.detail }]];
};

(async () => {
  let newFail = 0;
  const report = [];
  async function runAll(src, label, expectRed) {
    console.log(`\n=== ${label} ===`);
    let p = 0, f = 0;
    for (const [key, fn] of Object.entries(scenarios)) {
      let checks;
      try { checks = await fn(src, label); } catch (e) { checks = [[`${key} threw`, false, { err: String(e && e.message) }]]; }
      for (const [name, ok, ev] of checks) {
        ok ? p++ : f++;
        console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${name}  ${JSON.stringify(ev)}`);
      }
    }
    console.log(`  → ${label}: ${p} pass / ${f} fail`);
    return { p, f };
  }
  const nw = await runAll(NEW_SRC, 'NEW (working tree userSync.js)');
  const old = await runAll(OLD_SRC, 'OLD (d74c483 userSync.js) — 負控');
  if (process.env.PREV_SHA) {
    const prevSrc = execFileSync('git', ['show', `${process.env.PREV_SHA}:frontend/hymn-app/src/sync/userSync.js`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
    await runAll(prevSrc, `PREV (${process.env.PREV_SHA}) — 額外負控(只供參考)`);
  }
  console.log(`\n結果: NEW ${nw.p}/${nw.p + nw.f};負控 OLD fail ${old.f}(必須 > 0 先算負控成立)`);
  if (nw.f > 0 || old.f === 0) process.exit(1);
  process.exit(0);
})();
