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
// RemotePause/RemoteStop/RemoteDuck 啱啱好 fire 完嗰下先係 true,消費一次之後
// 即刻歸位。
//
// F1(FRONTEND-CODE-REVIEW-20260819 Opus5 驗收發現)—— H3 改成 short-circuit
// (consume 淨係喺對應嗰個 false event 先叫)之後,拆走咗原本「無條件consume」
// 帶嚟嘅副作用:「過期標記自動失效」。如果 markRemotePauseExpected() 之後
// 對應嗰個 false event 冇出現(例如 native 冇 fire 呢個 event),支旗會永遠
// 卡喺 true,之後下一次(完全冇關係嘅)真正 unexpected false event 到嚟就會
// 錯誤咁攞到呢個過期標記,令 D2 guard 誤判做「已預期」而唔幫用戶自動恢復。
// 加返 TTL(3 秒——RemotePause/RemoteDuck 觸發到對應 playWhenReadyChanged
// event 嚟到,native 應該係毫秒級,3 秒已經好闊裕)令標記自動失效,消費一次
// 之後照舊即刻歸位(記錄時間戳為 0 = 冇 pending 標記)。
const TTL_MS = 3000;
let remotePauseExpectedAt = 0;

export function markRemotePauseExpected() {
  remotePauseExpectedAt = Date.now();
}

export function consumeRemotePauseExpected() {
  const ok = remotePauseExpectedAt > 0 && Date.now() - remotePauseExpectedAt < TTL_MS;
  remotePauseExpectedAt = 0;
  return ok;
}
