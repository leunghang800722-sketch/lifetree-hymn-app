import './src/perfMarks'; // PERF-BASELINE-1B-20260902 — 必須係第一行,T0 盡量貼近 bundle entry
import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';

// [FIX] Register playback service for Android background playback
// Use .default to extract the default export (a function) from the ES module
TrackPlayer.registerPlaybackService(() => require('./src/track-player-service').default);

registerRootComponent(App);
