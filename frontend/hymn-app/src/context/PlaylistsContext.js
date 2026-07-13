import React, { createContext, useContext, useState } from 'react';

const PlaylistsCtx = createContext();

export const PlaylistsProvider = ({ children }) => {
 const [playlists, setPlaylists] = useState([]); // 之後會區分音樂/影音

 const addToPlaylist = (playlistId, hymn) => {
 // 暫時簡單實作，之後擴展
 console.log(`Added to playlist ${playlistId}`, hymn);
 };

 return (
 <PlaylistsCtx.Provider value={{ playlists, addToPlaylist }}>
 {children}
 </PlaylistsCtx.Provider>
 );
};

export const usePlaylists = () => useContext(PlaylistsCtx);
