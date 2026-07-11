// Playlist Context — 管理音樂(A)／影音(B)播放清單（local AsyncStorage）
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const GUEST_KEY = '**…sts';
const NOT_INIT = {};

function getKey(user) {
  if (user && user.id) return `@playlists_user_${user.id}`;
  return GUEST_KEY;
}

const PlaylistContext = createContext(null);

export function PlaylistProvider({ children }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const prevUid = useRef(NOT_INIT);

  const loadPlaylists = useCallback(async (key) => {
    try {
      const stored = await AsyncStorage.getItem(key);
      setPlaylists(stored ? JSON.parse(stored) : []);
    } catch (_) { setPlaylists([]); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (prevUid.current === uid) return;
    prevUid.current = uid;
    loadPlaylists(getKey(user));
  }, [user, loadPlaylists]);

  const savePlaylists = useCallback(async (list) => {
    try { await AsyncStorage.setItem(getKey(user), JSON.stringify(list)); }
    catch (_) { console.log('Save playlists error'); }
  }, [user]);

  const createPlaylist = useCallback(async (name, type) => {
    // type: 'music' for A, 'video' for B
    const newPl = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || '未命名清單',
      type: type || 'music',
      hymns: [],
      created: Date.now(),
    };
    setPlaylists(prev => {
      const updated = [...prev, newPl];
      savePlaylists(updated);
      return updated;
    });
    return newPl;
  }, [savePlaylists]);

  const deletePlaylist = useCallback(async (id) => {
    setPlaylists(prev => {
      const updated = prev.filter(p => p.id !== id);
      savePlaylists(updated);
      return updated;
    });
  }, [savePlaylists]);

  const addToPlaylist = useCallback(async (playlistId, hymn) => {
    setPlaylists(prev => {
      const updated = prev.map(p => {
        if (p.id !== playlistId) return p;
        if (p.hymns.some(h => h.id === hymn.id)) return p; // dedup
        return { ...p, hymns: [...p.hymns, { id: hymn.id, title: hymn.title, artist: hymn.artist, youtube_id: hymn.youtube_id }] };
      });
      savePlaylists(updated);
      return updated;
    });
  }, [savePlaylists]);

  const removeFromPlaylist = useCallback(async (playlistId, hymnId) => {
    setPlaylists(prev => {
      const updated = prev.map(p => {
        if (p.id !== playlistId) return p;
        return { ...p, hymns: p.hymns.filter(h => h.id !== hymnId) };
      });
      savePlaylists(updated);
      return updated;
    });
  }, [savePlaylists]);

  const renamePlaylist = useCallback(async (id, name) => {
    setPlaylists(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, name } : p);
      savePlaylists(updated);
      return updated;
    });
  }, [savePlaylists]);

  return (
    <PlaylistContext.Provider value={{ playlists, loaded, createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, renamePlaylist }}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists() {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistProvider');
  return ctx;
}
