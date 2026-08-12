// TrackPlayer Background Service (v3 compatible)
import TrackPlayer, { Event } from 'react-native-track-player';

export default async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  // STREAM-LOCKSCREEN-STOP-ROOTCAUSE-2026-08-12 續篇 —— audio session interruption
  // (電話/Siri/另一app攞走audio/藍牙路由切換)完咗之後,`paused:false` 代表OS話
  // 可以恢復。setupPlayer 已經加咗 autoHandleInterruptions:true 交native自動
  // play(),呢度明文再叫一次做保險(同呢個app一路用開「唔信native個flag,
  // 明文再嗌一次」原則一致,見 App.js handleNextTrack)。`permanent:true`
  // (OS話唔應該恢復)嗰種唔理,由用戶自己撳返play。
  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    if (event?.paused === false && !event?.permanent) {
      TrackPlayer.play().catch(() => {});
    }
  });
}
