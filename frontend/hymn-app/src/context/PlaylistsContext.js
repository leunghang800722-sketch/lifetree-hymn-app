// 自訂播放清單。
//
// ⚠️ v233 之前呢個係個殼:`addToPlaylist` 淨係 console.log,`playlists` 永遠係 []。
// 即係「我嘅清單」由頭到尾冇 work 過,而「加入清單」個 sheet 列緊嘅其實係**最愛啲歌**
// (仲要當咗歌 id 做 playlistId)。要做「上限 30 首」呢個要求,首先要有真嘅清單,
// 所以呢度補返實作:真 state + MMKV 持久化 + 30 首上限。
//
// 最愛(favorites)係另一套嘢,冇上限 —— Eric 講嘅 30 首上限淨係指自訂清單。

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MMKV } from 'react-native-mmkv';

export const MAX_PLAYLIST_SONGS = 30;

const KEY = 'playlists.v1';

let _store = null;
function store() {
  if (!_store) {
    try { _store = new MMKV(); } catch (e) { console.warn('MMKV(playlists):', e?.message); }
  }
  return _store;
}

const PlaylistsCtx = createContext();

export const PlaylistsProvider = ({ children }) => {
  // playlists: [{ id, name, songs: [hymn] }]
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    try {
      const raw = store()?.getString(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPlaylists(parsed);
      }
    } catch (_) {}
  }, []);

  // 同 favorites 一樣:記憶體 state 一定先更新,持久化盡力而為
  // (MMKV 喺 release JSI 出過事,唔可以因為佢掛咗就靜靜哋 no-op)。
  const persist = useCallback((next) => {
    setPlaylists(next);
    try { store()?.set(KEY, JSON.stringify(next)); } catch (e) { console.warn('playlists persist:', e?.message); }
  }, []);

  // firstSong:開新清單通常都係「想擺依家首歌入去」。一次過喺度加埋,
  // 唔好叫 caller 開完再 call addToPlaylist —— 嗰陣 setState 未 flush,
  // addToPlaylist 個 closure 仲未見到新清單,實 return missing。
  const createPlaylist = useCallback((name, firstSong) => {
    const songs = firstSong?.id
      ? [{ id: firstSong.id, title: firstSong.title, artist: firstSong.artist, youtube_id: firstSong.youtube_id, lang: firstSong.lang }]
      : [];
    const pl = { id: `pl_${Date.now()}`, name: name || '未命名清單', songs };
    setPlaylists((prev) => {
      const next = [...prev, pl];
      try { store()?.set(KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
    return pl;
  }, []);

  // 回傳 { ok, reason } 俾 UI 決定點出提示 —— 唔喺 context 入面直接彈 Alert,
  // 咁 context 先可以喺冇 UI 嘅地方(測試 / 背景)照用。
  const addToPlaylist = useCallback((playlistId, hymn) => {
    if (!hymn?.id) return { ok: false, reason: 'invalid' };
    const target = playlists.find((p) => p.id === playlistId);
    if (!target) return { ok: false, reason: 'missing' };
    if (target.songs.some((s) => s.id === hymn.id)) return { ok: false, reason: 'duplicate', playlist: target };
    if (target.songs.length >= MAX_PLAYLIST_SONGS) return { ok: false, reason: 'full', playlist: target };

    const slim = { id: hymn.id, title: hymn.title, artist: hymn.artist, youtube_id: hymn.youtube_id, lang: hymn.lang };
    persist(playlists.map((p) => (p.id === playlistId ? { ...p, songs: [...p.songs, slim] } : p)));
    return { ok: true, playlist: target };
  }, [playlists, persist]);

  const removeFromPlaylist = useCallback((playlistId, hymnId) => {
    persist(playlists.map((p) => (
      p.id === playlistId ? { ...p, songs: p.songs.filter((s) => s.id !== hymnId) } : p
    )));
  }, [playlists, persist]);

  const deletePlaylist = useCallback((playlistId) => {
    persist(playlists.filter((p) => p.id !== playlistId));
  }, [playlists, persist]);

  const isPlaylistFull = useCallback(
    (playlistId) => {
      const p = playlists.find((x) => x.id === playlistId);
      return !!p && p.songs.length >= MAX_PLAYLIST_SONGS;
    },
    [playlists]
  );

  return (
    <PlaylistsCtx.Provider value={{
      playlists, createPlaylist, addToPlaylist,
      removeFromPlaylist, deletePlaylist, isPlaylistFull,
      MAX_PLAYLIST_SONGS,
    }}>
      {children}
    </PlaylistsCtx.Provider>
  );
};

export const usePlaylists = () => useContext(PlaylistsCtx);
