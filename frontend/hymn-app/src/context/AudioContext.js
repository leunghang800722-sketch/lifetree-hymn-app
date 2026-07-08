// Audio Context - 已停用（改用直接開 YouTube Music App）

import React, { createContext, useContext, useState, useCallback } from 'react';

const AudioContext = createContext(null);

export function AudioProvider({ children }) {
  return <>{children}</>;
}

export function useAudio() {
  return {};
}
