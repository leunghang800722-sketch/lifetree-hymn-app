// TrackPlayer Background Service (v3 compatible)
import TrackPlayer, { Event } from 'react-native-track-player';
import { API_BASE } from './config.js';
import { markRemotePauseExpected } from './playback-intent.js';

// STREAM-MIDTRACK-SILENCE-ROOTCAUSE 續篇(2026-08-13)—— 呢個service行喺獨立
// registerPlaybackService context,冇App.js嘅logDiag()可以攞,自成一個極簡版
// (同App.js嗰個一樣寫法:fire-and-forget、唔await、唔重試)。
function logDiag(event, extra) {
  try {
    fetch(`${API_BASE}/api/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, clientTs: new Date().toISOString(), ...extra }),
    }).catch(() => {});
  } catch (_) {}
}

export default async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  // STREAM-LOCKSCREEN-PAUSE-RESUME-BUG-2026-08-17 —— 鎖屏/耳機/Control Center
  // 嘅暫停/停止掣撳落去,native會令`playWhenReady`變false,觸發App.js嗰個D2
  // guard(PlaybackPlayWhenReadyChanged listener)。舊code淨係call
  // TrackPlayer.pause()/stop(),冇話俾App.js嘅expectPlayingRef知呢個係用戶
  // 主動嘅動作,搞到D2誤判做「native靜靜清除播放意圖」,即刻幫用戶play()番
  // ——變相撳咗暫停但即刻自己彈返播。而家喺call pause()/stop()之前,經
  // playback-intent.js呢個共用module,明文話俾D2 guard知呢個係預期之內。
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    markRemotePauseExpected();
    TrackPlayer.pause();
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    markRemotePauseExpected();
    TrackPlayer.stop();
  });
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
    logDiag('RemoteDuck', { detail: `paused=${event?.paused} permanent=${event?.permanent}` });
    // H2(FRONTEND-CODE-REVIEW-20260819)—— native pause 呢種 interruption(電話
    // 打入/Siri/另一個app攞走audio focus)一樣要 markRemotePauseExpected(),
    // 唔係就會撞正App.js嗰個D2 guard,見到未預期嘅playWhenReady=false就誤判
    // 做「native靜靜清除播放意圖」,即刻自動play()番——變成聽歌途中接電話/開
    // 第二個app,音樂會自己響返。permanent:true(OS話唔應該恢復,好似接聽電話)
    // 尤其要防,因為呢種情況之後冇任何『paused:false』resume event會再嚟補救。
    if (event?.paused === true) {
      markRemotePauseExpected();
    }
    if (event?.paused === false && !event?.permanent) {
      TrackPlayer.play().catch(() => {});
    }
  });
}
