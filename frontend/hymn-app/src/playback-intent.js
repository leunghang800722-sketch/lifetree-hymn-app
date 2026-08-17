// STREAM-LOCKSCREEN-PAUSE-RESUME-BUG-2026-08-17 —— 共用旗標,等
// track-player-service.js(獨立 event-listener 檔案,冇 access 到 App.js 嘅
// expectPlayingRef useRef)可以喺 RemotePause/RemoteStop(鎖屏、耳機、Control
// Center 嘅暫停/停止掣)嗰陣,話俾 App.js 嘅 D2 guard
// (PlaybackPlayWhenReadyChanged listener,見 App.js §4.4)知:「呢個即將嚟緊嘅
// playWhenReady=false 係用戶自己撳嘅,唔好誤判做『native靜靜清除播放意圖』
// 再自動 play() 番」。
//
// 淨係喺 App.js 同 track-player-service.js 行喺同一個 JS context 先有用
// (前台 / app 未死嘅背景)——呢個亦係 D2 guard 本身得返正常運作嘅唯一情境
// (D2 個 listener 本身就係 App.js 掛住嘅,冇 App.js JS context 根本冇聽緊,
// 所以呢個 module-level 單例喺呢個場景下一定同 App.js 共享同一份記憶體)。
// 用 module-level 變數(唔係 React state / Context)係因為呢個 flag 淨係俾
// 兩個檔案之間傳一個 one-shot 訊號,唔需要觸發任何 re-render,亦唔想拖 React
// tree 落嚟。
//
// Consume-once 設計:markRemotePauseExpected() 之後要 consumeRemotePauseExpected()
// 先攞到 true,攞完即刻自動清返 false。咁樣先唔會令呢支 flag 「賴死」响度,
// 誤蓋咗第日真係「native靜靜清除意圖」嘅場景——呢支 flag 應該淨係喺
// RemotePause/RemoteStop 啱啱好 fire 完嗰下先係 true,消費一次之後即刻歸位。
let remotePauseExpected = false;

export function markRemotePauseExpected() {
  remotePauseExpected = true;
}

export function consumeRemotePauseExpected() {
  const value = remotePauseExpected;
  remotePauseExpected = false;
  return value;
}
