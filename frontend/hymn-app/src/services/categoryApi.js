// src/services/categoryApi.js
// Category API — 8 methods for the category screen
const API_BASE = 'https://4e152f1ef2394bdb-94-190-228-145.serveousercontent.com/api';

export const categoryApi = {
  // 中文名分類（所有中文詩歌）
  getChineseName: async () => {
    const response = await fetch(`${API_BASE}/category/chinese-name`);
    return response.json();
  },

  // 英文名分類（所有英文詩歌）
  getEnglishName: async () => {
    const response = await fetch(`${API_BASE}/category/english-name`);
    return response.json();
  },

  // 歌手列表（含詩歌數）
  getArtists: async () => {
    const response = await fetch(`${API_BASE}/category/artist`);
    return response.json();
  },

  // 特定歌手嘅詩歌
  getArtistHymns: async (artistName) => {
    const response = await fetch(`${API_BASE}/category/artist/${encodeURIComponent(artistName)}`);
    return response.json();
  },

  // 國語詩歌
  getMandarin: async () => {
    const response = await fetch(`${API_BASE}/category/mandarin`);
    return response.json();
  },

  // 粵語詩歌
  getCantonese: async () => {
    const response = await fetch(`${API_BASE}/category/cantonese`);
    return response.json();
  },

  // 英文詩歌
  getEnglish: async () => {
    const response = await fetch(`${API_BASE}/category/english`);
    return response.json();
  },

  // 所有中文詩歌（國語 + 粵語）
  getChinese: async () => {
    const response = await fetch(`${API_BASE}/category/chinese`);
    return response.json();
  },
};
