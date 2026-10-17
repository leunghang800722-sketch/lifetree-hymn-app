// Home page API
// Use Zeabur production backend (or local for dev)
import { API_BASE } from '../config';

const HOME_BASE = `${API_BASE}/api/home`;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export const homeApi = {
  getDailyVerse: () => fetchJSON(`${HOME_BASE}/daily-verse`),
};
