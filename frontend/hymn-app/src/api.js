// API 連接
import { API_BASE } from './config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@hymn_app_token';

export async function getToken() {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function authHeaders() {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Hymn APIs
export async function fetchHymns(search = '', category = '') {
  let url = `${API_BASE}/api/hymns`;
  const params = [];
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (category) params.push(`category=${encodeURIComponent(category)}`);
  if (params.length) url += '?' + params.join('&');

  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchHymnDetail(id) {
  const res = await fetch(`${API_BASE}/api/hymns/${id}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchCategories() {
  const res = await fetch(`${API_BASE}/api/categories`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// Auth APIs
export async function register(email, password) {
  const res = await fetch(`${API_BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  await setToken(json.token);
  return json;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  await setToken(json.token);
  return json;
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.user;
}

// Playlist APIs
export async function createPlaylist(name) {
  const res = await fetch(`${API_BASE}/api/playlists`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.playlist;
}

export async function fetchPlaylists() {
  const res = await fetch(`${API_BASE}/api/playlists`, {
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deletePlaylist(id) {
  const res = await fetch(`${API_BASE}/api/playlists/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function addHymnToPlaylist(playlistId, hymnId) {
  const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/hymns`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ hymn_id: hymnId }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function fetchPlaylistHymns(playlistId) {
  const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/hymns`, {
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function removeHymnFromPlaylist(playlistId, hymnId) {
  const res = await fetch(`${API_BASE}/api/playlists/${playlistId}/hymns/${hymnId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

// ── Admin APIs(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)──────────────────────
// ⚠️ 呢五個 call 唔用呢個檔頭上面嗰個 authHeaders()/getToken()——嗰套
// AsyncStorage(@hymn_app_token)同真正登入流程用嘅 AuthContext(@hymn…uth)
// 係兩份唔同嘅存儲,實際登入唔會寫入呢邊。Admin call 一律由 caller(有
// useAuth() 嘅畫面/sheet)傳 token 落嚟,行 AuthContext.getToken() 嗰條真.路。
function adminAuthHeaders(token, withJson = false) {
  const headers = { Authorization: `Bearer ${token}` };
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function adminJson(res, fallbackMsg) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || json.error || fallbackMsg);
    err.code = json.error;
    throw err;
  }
  return json;
}

// 通用錯誤碼 → 用戶睇得明嘅文案(Opus 5 驗收揪出:編輯 sheet 之前淨係將
// backend 錯誤碼原字咁彈出嚟,冇 §3.2 講嘅「背景維護行緊,一陣再試」呢類
// 翻譯,AdminEditHymnSheet/AdminAddHymnScreen 兩邊共用同一套 mapping。
// 個別 route 專屬嘅碼(preview 嘅 bad_url/metadata_failed、confirm 入庫嘅
// resolve_failed/already_curated)由 caller 自己揀先過呢個 fallback。
export function adminErrorMessage(e, fallback) {
  switch (e?.code) {
    case 'db_busy': return '背景維護行緊,一陣再試';
    case 'forbidden': return '冇權限做呢個操作';
    case 'rate_limited': return '操作太密,等一陣先';
    case 'not_found': return '搵唔到呢首歌,可能已經被人改咗';
    case 'field_not_allowed':
    case 'bad_field_value':
    case 'no_fields':
      return '資料格式唔啱';
    case 'server_error': return '伺服器出錯,請再試';
    default: return e?.message || fallback;
  }
}

export async function adminGetHymn(token, id) {
  const res = await fetch(`${API_BASE}/api/admin/hymns/${id}`, { headers: adminAuthHeaders(token) });
  const json = await adminJson(res, '讀取失敗');
  return json.hymn;
}

export async function adminPatchHymn(token, id, fields) {
  const res = await fetch(`${API_BASE}/api/admin/hymns/${id}`, {
    method: 'PATCH',
    headers: adminAuthHeaders(token, true),
    body: JSON.stringify(fields),
  });
  return adminJson(res, '儲存失敗'); // { ok, hymn, dataVersion }
}

export async function adminPreviewHymn(token, url) {
  const res = await fetch(`${API_BASE}/api/admin/hymns/preview`, {
    method: 'POST',
    headers: adminAuthHeaders(token, true),
    body: JSON.stringify({ url }),
  });
  return adminJson(res, '查詢失敗'); // { exists|relistable|youtube_id..., ... }
}

export async function adminAddHymn(token, fields) {
  const res = await fetch(`${API_BASE}/api/admin/hymns`, {
    method: 'POST',
    headers: adminAuthHeaders(token, true),
    body: JSON.stringify(fields),
  });
  return adminJson(res, '入庫失敗'); // { ok, hymn, dataVersion }
}

export async function adminDelistHymn(token, id) {
  const res = await fetch(`${API_BASE}/api/admin/hymns/${id}/delist`, {
    method: 'POST',
    headers: adminAuthHeaders(token),
  });
  return adminJson(res, '落架失敗'); // { ok, hymn, dataVersion }
}

// 「我加過嘅歌」/「已下架」(MYPAGE-ADMIN-CHIPS-PLAN §3.3)—— read-only,讀
// audit log join hymns_all,回 { items: [{ hymn, in_library, listed, acted_at/delisted_at }] }
export async function adminListAddedHymns(token) {
  const res = await fetch(`${API_BASE}/api/admin/activity/added`, { headers: adminAuthHeaders(token) });
  const json = await adminJson(res, '讀取失敗');
  return json.items;
}

export async function adminListDelistedHymns(token) {
  const res = await fetch(`${API_BASE}/api/admin/activity/delisted`, { headers: adminAuthHeaders(token) });
  const json = await adminJson(res, '讀取失敗');
  return json.items;
}

// ── 好友 / 邀請碼 APIs(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN)─────────────
// 同 admin* 一樣:唔用檔頭嗰套 authHeaders()/getToken()(AsyncStorage 舊存
// 儲,真正登入唔會寫入),caller 由 useAuth().getToken() 傳 token 落嚟。
function meAuthHeaders(token, withJson = false) {
  const headers = { Authorization: `Bearer ${token}` };
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function meJson(res, fallbackMsg) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || json.error || fallbackMsg);
    err.code = json.error;
    throw err;
  }
  return json;
}

// { found, relation: 'none'|'self'|'friends'|'pending_out'|'pending_in' }
export async function friendsLookup(token, phone) {
  const res = await fetch(`${API_BASE}/api/friends/lookup`, {
    method: 'POST', headers: meAuthHeaders(token, true), body: JSON.stringify({ phone }),
  });
  return meJson(res, '搵唔到');
}

// { ok, status: 'pending'|'accepted' }
export async function friendsRequest(token, phone) {
  const res = await fetch(`${API_BASE}/api/friends/request`, {
    method: 'POST', headers: meAuthHeaders(token, true), body: JSON.stringify({ phone }),
  });
  return meJson(res, '發出請求失敗');
}

// { friends: [{user_id,username}], incoming: [{user_id,username,created_at}], outgoing: [{user_id,phone_tail,created_at}] }
export async function friendsList(token) {
  const res = await fetch(`${API_BASE}/api/friends`, { headers: meAuthHeaders(token) });
  return meJson(res, '讀取失敗');
}

export async function friendsAccept(token, userId) {
  const res = await fetch(`${API_BASE}/api/friends/${userId}/accept`, { method: 'POST', headers: meAuthHeaders(token) });
  return meJson(res, '接受失敗');
}

// 一個 API 三用:拒絕請求 / 收回自己嘅請求 / 解除好友
export async function friendsDelete(token, userId) {
  const res = await fetch(`${API_BASE}/api/friends/${userId}`, { method: 'DELETE', headers: meAuthHeaders(token) });
  return meJson(res, '操作失敗');
}

// { shares: [{ token, name, song_count }] }
export async function friendsShares(token, userId) {
  const res = await fetch(`${API_BASE}/api/friends/${userId}/shares`, { headers: meAuthHeaders(token) });
  return meJson(res, '讀取失敗');
}

// 錯誤碼 → 用戶睇得明嘅文案(同 adminErrorMessage 一致 pattern)
export function friendsErrorMessage(e, fallback) {
  switch (e?.code) {
    case 'rate_limited': return '操作太密,等一陣先';
    case 'too_many_pending': return '未應嘅請求太多,等對方回應先';
    case 'not_found': return '搵唔到呢個號碼';
    case 'bad_phone': return '電話號碼格式唔啱';
    case 'quota_full': return '未用嘅邀請碼已經用晒';
    case 'server_error': return '伺服器出錯,請再試';
    default: return e?.message || fallback;
  }
}
