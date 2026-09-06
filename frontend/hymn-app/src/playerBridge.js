// src/playerBridge.js — PLAYNEXT-EXEC-20260906 §1.2
//
// 背景:AddToPlaylistSheet.js 個「下一首播放」行要攞 PlayerProvider 嘅
// insertNext()/queue/currentHymn,但兩個 provider 喺 App.js 嘅 JSX 巢狀次序
// 係 `<AddToPlaylistProvider><PlayerProvider>{children}</PlayerProvider>
// </AddToPlaylistProvider>`——AddToPlaylistProvider 喺外,PlayerProvider 喺
// 入面。呢個次序冇得改:`FullScreenPlayerOverlay`(PlayerProvider 自己
// render 出嚟嘅,唔喺 `{children}` 之內)本身已經要用 `useAddToPlaylist()`,
// 靠佢做「祖先」;掉轉次序會即刻整爛嗰個現有用法。兩個方向嘅 React context
// 祖先關係互相排斥,冇一個線性巢狀次序可以同時滿足——所以 AddToPlaylistSheet
// 呢邊唔用 `usePlayer()`(佢自己嗰截 SheetShell UI 都係喺 provider 自己
// return 出嚟,唔喺 `{children}` 入面,結構同 FullScreenPlayerOverlay 一樣,
// 攞唔到 PlayerCtx),改用呢個 module-level bridge。
//
// 寫入:PlayerProvider 每次 render 都同步 call `setPlayerBridge({...})`
// (唔經 useEffect,唔觸發任何 re-render——同呢個檔案 `queueRef.current =
// queue;` 嗰句、render body 直接寫 ref 嘅慣例一致)。
// 讀出:AddToPlaylistSheet.js 喺 render body(決定「下一首播放」行使唔使
// 顯示)同 onPress handler(真正 call insertNext)都直接 `getPlayerBridge()`,
// 唔訂閱、每次都攞返「呢一刻」嘅真實值,冇 staleness 顧慮。
//
// 用 CommonJS 定 ESM 都得(Metro 兩種都食),呢度用 ESM 同其他 src/*.js 一致。
let _current = null;

export function setPlayerBridge(actions) {
  _current = actions;
}

// 冇 PlayerProvider mount 過(理論上唔會發生,佢係 App 根層 provider)先會
// 見到 `{}` fallback——同 usePlayer() 嘅 `useContext(PlayerCtx) || {}` 做法
// 一致,call site 用 optional chaining 就唔使另外 guard。
export function getPlayerBridge() {
  return _current || {};
}
