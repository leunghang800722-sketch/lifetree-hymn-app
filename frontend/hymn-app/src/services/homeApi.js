// Home page API — 10 sections for the main screen
// Use Zeabur production backend (or local for dev)
import { API_BASE } from '../config';

const HOME_BASE = `${API_BASE}/api/home`;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export const homeApi = {
  getDailyQuote: () => fetchJSON(`${HOME_BASE}/daily-quote`),
  getDailyVerse: () => fetchJSON(`${HOME_BASE}/daily-verse`),
  getFeaturedArtist: () => fetchJSON(`${HOME_BASE}/featured-artist`),
  getNewReleases: () => fetchJSON(`${HOME_BASE}/new-releases`),
  getGenreRecommendation: () => fetchJSON(`${HOME_BASE}/genre-recommendation`),
  getBasedOnTaste: () => fetchJSON(`${HOME_BASE}/based-on-taste`),
  getResonating: () => fetchJSON(`${HOME_BASE}/resonating`),
  getTopVerses: () => fetchJSON(`${HOME_BASE}/top-verses`),
  getFolkSharing: () => fetchJSON(`${HOME_BASE}/folk-sharing`),
  getCombinedCharts: () => fetchJSON(`${HOME_BASE}/combined-charts`),
};
