// src/services/searchApi.js
// Search API — 5 dimensions for the search screen
const API_BASE = 'https://4e152f1ef2394bdb-94-190-228-145.serveousercontent.com/api';

export const searchApi = {
  // 全維度搜尋（title + artist + lyrics + album）
  searchAll: async (query) => {
    const response = await fetch(`${API_BASE}/search/all?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // 歌名搜尋
  searchTitle: async (query) => {
    const response = await fetch(`${API_BASE}/search/title?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // 歌手搜尋
  searchArtist: async (query) => {
    const response = await fetch(`${API_BASE}/search/artist?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // 歌詞搜尋
  searchLyrics: async (query) => {
    const response = await fetch(`${API_BASE}/search/lyrics?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // 專輯搜尋
  searchAlbum: async (query) => {
    const response = await fetch(`${API_BASE}/search/album?q=${encodeURIComponent(query)}`);
    return response.json();
  },
};
