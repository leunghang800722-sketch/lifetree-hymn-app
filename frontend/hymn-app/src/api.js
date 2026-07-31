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
