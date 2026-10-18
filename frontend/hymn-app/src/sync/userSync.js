// userSync — MEMBERSHIP-PHASE1-LOGIN-SYNC.md §2.1
//
// 單一職責:outbox 持久化 + flush + pull。唔係 context,係俾 FavoritesContext/
// PlaylistsContext 共用嘅 lib。**唔掂 UI state** —— UI 永遠讀 context 嘅本地
// state,離線體驗同而家一模一樣。
//
// token 由 AuthContext 用 setAuthToken() 灌入(冇 token 就一律 no-op,靜靜哋
// 留低 outbox 等下次)。

import { getStorage } from '../storage';
import { API_BASE } from '../config';
import { sendClientLog } from '../clientLog.js';
import { reportUnauthorized } from '../authSession';
import { createExternalStore } from '../hooks/externalStore.js';

// 401 = token 過期/失效(2026-09-28 事故:之前靜靜 fail,outbox 越積越多冇人
// 知)。報俾 AuthContext 叫用戶重新登入;回傳值照舊,queue 原封不動留低。
function checkAuth(r, token) {
  if (r.status === 401) reportUnauthorized(token);
  return r;
}

// BATCH5 O10:MMKV instance 收歸 storage.js 一份共用(零行為改變,本身就係
// 同一份 default instance)。
const store = getStorage;

const OUTBOX_KEY = 'sync.outbox.v1';
const OWNER_KEY = 'sync.owner.v1';

let _token = null;
export function setAuthToken(token) { _token = token || null; }

// ODELY-OPT 1b-修正(M2):回 null = 讀錯(getString throw / JSON 壞),同「真係空」([])
// 分開。flush 重讀遇 null 要退返記憶體 queue,唔可以當空 outbox 寫 [] 蓋走持久化。
function readOutbox() {
  try {
    const raw = store()?.getString(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}
// 其他 caller:讀錯當空。
function readOutboxOrEmpty() { return readOutbox() || []; }

// ODELY-OPT 1b:outbox 長度改 external store(取代 useOutboxLength 每 2 秒輪詢)。
// 初始值讀一次持久化嘅 outbox;之後只喺 writeOutbox() 寫入後更新(長度冇變
// 就唔 setState,免無謂 re-render)。MMKV 讀寫失敗時照舊靜靜吞,store 保持舊值。
export const outboxStore = createExternalStore({ length: readOutboxOrEmpty().length });

function writeOutbox(queue) {
  try { store()?.set(OUTBOX_KEY, JSON.stringify(queue)); } catch (_) {}
  if (outboxStore.getSnapshot().length !== queue.length) {
    outboxStore.setState({ length: queue.length });
  }
}

export function getOutboxLength() {
  return readOutboxOrEmpty().length;
}

export function getOwner() {
  try { return store()?.getString(OWNER_KEY) || null; } catch (_) { return null; }
}

export function setOwner(userId) {
  try {
    if (userId == null) store()?.delete(OWNER_KEY);
    else store()?.set(OWNER_KEY, String(userId));
  } catch (_) {}
}

export function clearOutbox() {
  writeOutbox([]);
}

// 同一清單連續多個 pl_upsert collapse 淨最後一個(§2.1 順手優化)。
function collapse(queue) {
  const lastIdx = new Map();
  queue.forEach((op, i) => { if (op.op === 'pl_upsert') lastIdx.set(op.playlist.id, i); });
  return queue.filter((op, i) => op.op !== 'pl_upsert' || lastIdx.get(op.playlist.id) === i);
}

// ODELY-OPT 1a:op 身份 = op.op + ts + key(fav_* → hymn_id;pl_upsert →
// playlist.id;pl_delete → id)。flush() 成功後靠佢由最新 outbox 剔走剛推完
// 嗰個 op,唔再用閉包舊快照覆寫(飛行期間 enqueue 嘅新 op 會被蓋走)。
function opKey(op) {
  if (op.op === 'pl_upsert') return op.playlist?.id;
  if (op.op === 'pl_delete') return op.id;
  return op.hymn_id;
}
// L1:身份再加單調遞增 seq(同毫秒兩個 op 都分得開);舊 outbox 嘅 op 冇 seq
// → 任一邊冇 seq 就退返 ts 比對(兼容)。
function sameOp(a, b) {
  if (a.op !== b.op || a.ts !== b.ts || opKey(a) !== opKey(b)) return false;
  if (a.seq != null && b.seq != null) return a.seq === b.seq;
  return true;
}

// module-level 計數器;重啟後 enqueue 時由 outbox 現有 max seq 之後起。
let _seq = 0;

export function enqueue(op) {
  const cur = readOutboxOrEmpty();
  for (const x of cur) if (typeof x.seq === 'number' && x.seq > _seq) _seq = x.seq;
  _seq += 1;
  writeOutbox(collapse([...cur, { ...op, ts: Date.now(), seq: _seq }]));
}

// PlaylistsContext 註冊,俾 pl_upsert 收到 stale:true 時用 server 版覆蓋本地。
let _onStalePlaylist = null;
export function setStalePlaylistHandler(fn) { _onStalePlaylist = fn; }

async function runOp(op) {
  // 冇 body 嗰啲(POST/DELETE 淨靠 URL)唔可以帶 Content-Type: application/json——
  // 後端 express.json() 見到呢個 header 但冇 body 會 throw → 400,fav_add/
  // fav_remove/pl_delete 永遠推唔郁(P0,Opus 驗收揪出)。
  const token = _token;
  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
  try {
    if (op.op === 'fav_add') {
      const r = checkAuth(await fetch(`${API_BASE}/api/me/favorites/${op.hymn_id}`, { method: 'POST', headers: authHeaders }), token);
      return r.ok;
    }
    if (op.op === 'fav_remove') {
      const r = checkAuth(await fetch(`${API_BASE}/api/me/favorites/${op.hymn_id}`, { method: 'DELETE', headers: authHeaders }), token);
      return r.ok;
    }
    if (op.op === 'pl_upsert') {
      const r = checkAuth(await fetch(`${API_BASE}/api/me/playlists/${op.playlist.id}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify(op.playlist),
      }), token);
      if (!r.ok) return false;
      const data = await r.json().catch(() => ({}));
      if (data?.stale && data.server && _onStalePlaylist) _onStalePlaylist(data.server);
      return true;
    }
    if (op.op === 'pl_delete') {
      const r = checkAuth(await fetch(`${API_BASE}/api/me/playlists/${op.id}`, { method: 'DELETE', headers: authHeaders }), token);
      return r.ok;
    }
    // DEEP-AUDIT-W1-EXEC-20260906 F6(INF-010)—— 未知 op 之前係完全靜默
    // drop,冇任何訊號留低。加一條 beacon 令呢個路徑至少可觀測;唔改行為
    // (照舊當完成掉咗佢,唔卡隊)。
    sendClientLog('syncUnknownOp', { detail: String(op && op.op) });
    return true; // 未知 op:唔好卡死條隊,直接當完成掉咗佢
  } catch (_) {
    return false; // 網絡錯 → 停,keep queue
  }
}

let _flushing = false;
let _pendingFlush = false;
// DEEP-AUDIT-W1-EXEC-20260906 F6 —— outbox 長度冇任何 beacon(1A INF-010 附帶
// 建議),每個 session 最多送一次,避免每次 flush 都洗版。
let _outboxLongReported = false;

// 回傳 outbox 係咪真係推晒(drain 咗)——caller(App.js onActive)靠呢個先知
// 安唔安全用 server pull 覆蓋本地(P0:flush 失敗都照樣覆蓋 = 蝕用戶數據)。
// 撞正另一個 flush() 已經行緊嗰陣,唔知埋嗰邊實際推成點,保守答 false。
export async function flush() {
  if (!_token) return false;
  if (_flushing) { _pendingFlush = true; return false; }
  _flushing = true;
  let drained = false;
  try {
    let queue = collapse(readOutboxOrEmpty());
    if (!_outboxLongReported && queue.length >= 50) {
      _outboxLongReported = true;
      sendClientLog('outboxLong', { detail: String(queue.length) });
    }
    // M1:本輪已推 op 清單 + 硬上限(第二道保險),MMKV set 持續 throw 時唔會無限重推。
    const done = [];
    const pushLimit = queue.length + 50;
    while (queue.length > 0) {
      if (done.length >= pushLimit) {
        sendClientLog('outboxLoopGuard', { detail: String(done.length) });
        break;
      }
      const [op] = queue;
      const ok = await runOp(op);
      if (!ok) break; // fail 即停,queue 原封不動留低
      done.push(op);
      // ODELY-OPT 1a:await 期間 enqueue() 可能已經寫入新 op(或 collapse 取代
      // 咗本 op),所以成功後重讀最新 outbox,只剔走剛推完嗰個,唔用閉包 rest 覆寫。
      const raw = readOutbox();
      // M2:讀錯(null)退返舊版行為 queue.slice(1),唔寫 [] 蓋走持久化。
      const next = raw === null
        ? queue.slice(1)
        : collapse(raw).filter((x) => !done.some((d) => sameOp(x, d)));
      writeOutbox(next);
      queue = next;
    }
    drained = queue.length === 0;
  } finally {
    _flushing = false;
    if (_pendingFlush) {
      _pendingFlush = false;
      flush();
    }
  }
  return drained;
}

export async function pullData() {
  if (!_token) return null;
  try {
    const token = _token;
    const r = checkAuth(await fetch(`${API_BASE}/api/me/data`, { headers: { Authorization: `Bearer ${token}` } }), token);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

// 登入合併(§2.3)/換帳戶保護(§2.5)共用嘅一次性推晒本地全量。
export async function pushSync(favorites, playlists) {
  if (!_token) return null;
  try {
    const token = _token;
    const r = checkAuth(await fetch(`${API_BASE}/api/me/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ favorites, playlists }),
    }), token);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
