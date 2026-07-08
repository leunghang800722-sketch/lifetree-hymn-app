import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';

// [FIX] Register playback service for Android background playback
// Use .default to extract the default export (a function) from the ES module
TrackPlayer.registerPlaybackService(() => require('./src/track-player-service').default);

registerRootComponent(App);
