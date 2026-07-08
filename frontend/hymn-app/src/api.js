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
