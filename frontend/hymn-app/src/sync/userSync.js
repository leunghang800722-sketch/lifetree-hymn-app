// userSync — MEMBERSHIP-PHASE1-LOGIN-SYNC.md §2.1
//
// 單一職責:outbox 持久化 + flush + pull。唔係 context,係俾 FavoritesContext/
// PlaylistsContext 共用嘅 lib。**唔掂 UI state** —— UI 永遠讀 context 嘅本地
// state,離線體驗同而家一模一樣。
//
// token 由 AuthContext 用 setAuthToken() 灌入(冇 token 就一律 no-op,靜靜哋
// 留低 outbox 等下次)。

import { MMKV } from 'react-native-mmkv';
import { API_BASE } from '../config';

let storage = null;
function store() {
  if (!storage) {
    try { storage = new MMKV(); } catch (e) { console.warn('MMKV(sync):', e?.message); }
  }
  return storage;
}

const OUTBOX_KEY = 'sync.outbox.v1';
const OWNER_KEY = 'sync.owner.v1';

let _token = null;
export function setAuthToken(token) { _token = token || null; }

function readOutbox() {
  try {
    const raw = store()?.getString(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function writeOutbox(queue) {
  try { store()?.set(OUTBOX_KEY, JSON.stringify(queue)); } catch (_) {}
}

export function getOutboxLength() {
  return readOutbox().length;
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

export function enqueue(op) {
  writeOutbox(collapse([...readOutbox(), { ...op, ts: Date.now() }]));
}

// PlaylistsContext 註冊,俾 pl_upsert 收到 stale:true 時用 server 版覆蓋本地。
let _onStalePlaylist = null;
export function setStalePlaylistHandler(fn) { _onStalePlaylist = fn; }

async function runOp(op) {
  // 冇 body 嗰啲(POST/DELETE 淨靠 URL)唔可以帶 Content-Type: application/json——
  // 後端 express.json() 見到呢個 header 但冇 body 會 throw → 400,fav_add/
  // fav_remove/pl_delete 永遠推唔郁(P0,Opus 驗收揪出)。
  const authHeaders = { Authorization: `Bearer ${_token}` };
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
  try {
    if (op.op === 'fav_add') {
      const r = await fetch(`${API_BASE}/api/me/favorites/${op.hymn_id}`, { method: 'POST', headers: authHeaders });
      return r.ok;
    }
    if (op.op === 'fav_remove') {
      const r = await fetch(`${API_BASE}/api/me/favorites/${op.hymn_id}`, { method: 'DELETE', headers: authHeaders });
      return r.ok;
    }
    if (op.op === 'pl_upsert') {
      const r = await fetch(`${API_BASE}/api/me/playlists/${op.playlist.id}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify(op.playlist),
      });
      if (!r.ok) return false;
      const data = await r.json().catch(() => ({}));
      if (data?.stale && data.server && _onStalePlaylist) _onStalePlaylist(data.server);
      return true;
    }
    if (op.op === 'pl_delete') {
      const r = await fetch(`${API_BASE}/api/me/playlists/${op.id}`, { method: 'DELETE', headers: authHeaders });
      return r.ok;
    }
    return true; // 未知 op:唔好卡死條隊,直接當完成掉咗佢
  } catch (_) {
    return false; // 網絡錯 → 停,keep queue
  }
}

let _flushing = false;
let _pendingFlush = false;

// 回傳 outbox 係咪真係推晒(drain 咗)——caller(App.js onActive)靠呢個先知
// 安唔安全用 server pull 覆蓋本地(P0:flush 失敗都照樣覆蓋 = 蝕用戶數據)。
// 撞正另一個 flush() 已經行緊嗰陣,唔知埋嗰邊實際推成點,保守答 false。
export async function flush() {
  if (!_token) return false;
  if (_flushing) { _pendingFlush = true; return false; }
  _flushing = true;
  let drained = false;
  try {
    let queue = collapse(readOutbox());
    while (queue.length > 0) {
      const [op, ...rest] = queue;
      const ok = await runOp(op);
      if (!ok) break; // fail 即停,queue 原封不動留低
      queue = rest;
      writeOutbox(queue);
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
    const r = await fetch(`${API_BASE}/api/me/data`, { headers: { Authorization: `Bearer ${_token}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

// 登入合併(§2.3)/換帳戶保護(§2.5)共用嘅一次性推晒本地全量。
export async function pushSync(favorites, playlists) {
  if (!_token) return null;
  try {
    const r = await fetch(`${API_BASE}/api/me/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
      body: JSON.stringify({ favorites, playlists }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
