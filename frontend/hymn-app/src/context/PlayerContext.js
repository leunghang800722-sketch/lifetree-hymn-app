// 全域播放器 Context — 管理目前播放狀態 & Mini Player 顯示
import React, { createContext, useContext, useState } from 'react';

const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [currentHymn, setCurrentHymn] = useState(null); // { id, title, artist, youtube_id }

  function playHymn(hymn) {
    setCurrentHymn(hymn);
  }

  function clearPlayer() {
    setCurrentHymn(null);
  }

  return (
    <PlayerContext.Provider value={{ currentHymn, playHymn, clearPlayer }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
