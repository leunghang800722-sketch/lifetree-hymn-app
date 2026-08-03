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
import { enqueue, flush, setStalePlaylistHandler } from '../sync/userSync';

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

  // 跨裝置同步(§2.2)—— 每個 mutation 之後推一個 pl_upsert(成個清單一舊)。
  // updated_at 要喺呢度、本地一齊寫(LWW 用);position 用陣時嗰刻喺陣列入面
  // 嘅 index,俾 server 排序用。
  const syncUpsert = useCallback((pl, list) => {
    enqueue({ op: 'pl_upsert', playlist: { ...pl, position: list.findIndex((p) => p.id === pl.id) } });
    flush();
  }, []);

  // firstSong:開新清單通常都係「想擺依家首歌入去」。一次過喺度加埋,
  // 唔好叫 caller 開完再 call addToPlaylist —— 嗰陣 setState 未 flush,
  // addToPlaylist 個 closure 仲未見到新清單,實 return missing。
  const createPlaylist = useCallback((name, firstSong) => {
    const songs = firstSong?.id
      ? [{ id: firstSong.id, title: firstSong.title, artist: firstSong.artist, youtube_id: firstSong.youtube_id, lang: firstSong.lang }]
      : [];
    const pl = { id: `pl_${Date.now()}`, name: name || '未命名清單', songs, updated_at: new Date().toISOString() };
    const next = [...playlists, pl];
    persist(next);
    syncUpsert(pl, next);
    return pl;
  }, [playlists, persist, syncUpsert]);

  // 回傳 { ok, reason } 俾 UI 決定點出提示 —— 唔喺 context 入面直接彈 Alert,
  // 咁 context 先可以喺冇 UI 嘅地方(測試 / 背景)照用。
  const addToPlaylist = useCallback((playlistId, hymn) => {
    if (!hymn?.id) return { ok: false, reason: 'invalid' };
    const target = playlists.find((p) => p.id === playlistId);
    if (!target) return { ok: false, reason: 'missing' };
    if (target.songs.some((s) => s.id === hymn.id)) return { ok: false, reason: 'duplicate', playlist: target };
    if (target.songs.length >= MAX_PLAYLIST_SONGS) return { ok: false, reason: 'full', playlist: target };

    const slim = { id: hymn.id, title: hymn.title, artist: hymn.artist, youtube_id: hymn.youtube_id, lang: hymn.lang };
    const updated = { ...target, songs: [...target.songs, slim], updated_at: new Date().toISOString() };
    const next = playlists.map((p) => (p.id === playlistId ? updated : p));
    persist(next);
    syncUpsert(updated, next);
    return { ok: true, playlist: target };
  }, [playlists, persist, syncUpsert]);

  // 儲存分享清單嘅副本(MEMBERSHIP-PHASE3-SHARE-PLAN §2.4)—— 新 id、songs
  // 照抄(slim object 原樣,收 link 嗰邊已經係 slim 格式;cap 30 係防禦性,
  // 分享源頭本身 ≤30,但收嘅人揀「儲存」嗰下唔應該假設對方個 client 冇 bug)。
  // 名照用原名,唔加「(分享)」後綴——id 唔同,同名唔會炒,想改名有現成
  // 改名功能。儲存完即刻同原清單無關(zero live 連結),同 createPlaylist
  // 一樣行返 persist + syncUpsert 現成路(登入自動同步、未登入純 MMKV)。
  const importPlaylist = useCallback((name, songs) => {
    const slimSongs = (Array.isArray(songs) ? songs : []).slice(0, MAX_PLAYLIST_SONGS).map((s) => ({
      id: s.id, title: s.title, artist: s.artist, youtube_id: s.youtube_id, lang: s.lang,
    }));
    const pl = { id: `pl_${Date.now()}`, name: name || '未命名清單', songs: slimSongs, updated_at: new Date().toISOString() };
    const next = [...playlists, pl];
    persist(next);
    syncUpsert(pl, next);
    return pl;
  }, [playlists, persist, syncUpsert]);

  // 改名:淨係改 name,songs 不動。空名直接唔理(UI 層有「未命名清單」fallback,
  // 但改名唔同開新清單 —— 改做空白多數係手滑,保留原名穩陣過改成 placeholder)。
  const renamePlaylist = useCallback((playlistId, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const target = playlists.find((p) => p.id === playlistId);
    if (!target) return;
    const updated = { ...target, name: trimmed, updated_at: new Date().toISOString() };
    const next = playlists.map((p) => (p.id === playlistId ? updated : p));
    persist(next);
    syncUpsert(updated, next);
  }, [playlists, persist, syncUpsert]);

  const removeFromPlaylist = useCallback((playlistId, hymnId) => {
    const target = playlists.find((p) => p.id === playlistId);
    if (!target) return;
    const updated = { ...target, songs: target.songs.filter((s) => s.id !== hymnId), updated_at: new Date().toISOString() };
    const next = playlists.map((p) => (p.id === playlistId ? updated : p));
    persist(next);
    syncUpsert(updated, next);
  }, [playlists, persist, syncUpsert]);

  const deletePlaylist = useCallback((playlistId) => {
    persist(playlists.filter((p) => p.id !== playlistId));
    enqueue({ op: 'pl_delete', id: playlistId });
    flush();
  }, [playlists, persist]);

  // 登入合併/pull(§2.3-2.4)、換帳戶保護(§2.5)用:server 全量覆蓋本地,
  // 跟 server 嘅 position 排序。
  const replaceAllPlaylists = useCallback((serverPlaylists) => {
    const sorted = [...(serverPlaylists || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    persist(sorted);
  }, [persist]);

  // pl_upsert 收到 stale:true(§2.1)→ userSync 呼叫呢個,用 server 版覆蓋本地
  // 嗰個清單。用 functional setState,唔靠 closure 嘅 playlists(呢個 callback
  // 隨時喺 flush 完成好耐之後先觸發)。
  const applyServerPlaylist = useCallback((serverPl) => {
    setPlaylists((prev) => {
      const idx = prev.findIndex((p) => p.id === serverPl.id);
      const next = idx >= 0 ? prev.map((p, i) => (i === idx ? { ...serverPl } : p)) : [...prev, { ...serverPl }];
      try { store()?.set(KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  useEffect(() => {
    setStalePlaylistHandler(applyServerPlaylist);
  }, [applyServerPlaylist]);

  const isPlaylistFull = useCallback(
    (playlistId) => {
      const p = playlists.find((x) => x.id === playlistId);
      return !!p && p.songs.length >= MAX_PLAYLIST_SONGS;
    },
    [playlists]
  );

  return (
    <PlaylistsCtx.Provider value={{
      playlists, createPlaylist, addToPlaylist, importPlaylist, renamePlaylist,
      removeFromPlaylist, deletePlaylist, isPlaylistFull,
      replaceAllPlaylists, MAX_PLAYLIST_SONGS,
    }}>
      {children}
    </PlaylistsCtx.Provider>
  );
};

export const usePlaylists = () => useContext(PlaylistsCtx);
