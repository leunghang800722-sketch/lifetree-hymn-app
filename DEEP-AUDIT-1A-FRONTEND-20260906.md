# Phase 1A 前端合併審計報告 — 2026-09-06

合併者：Sonnet 5。原始材料：主線 `appjs-notes.md`（App.js 4,607 行）+ 三條子線
`1a-sub-components-context-hooks.md`（src/components+context+hooks，15 檔）、
`1a-sub-screens.md`（src/screens，13 檔）、`1a-sub-utils-infra-deps.md`（src 其餘
utils/infra/icons/theme/index.js + 依賴/plugin/patch，21 檔）。四份合計覆蓋
App.js + src 全部 48 檔 + index.js + app.json + eas.json + plugins/ + patches/ +
package.json = 50 個檔案單位（見末節「覆蓋清單」，含一個缺口）。

本報告只核實/合併/統計，**無改動 source，無 commit**。

---

## 0. 覆核方法（本次新做的部分）

App.js 的 5 條 candidate（APP-001～005）由本次合併者逐條重新對照原始檔核實行號同
證據（其餘三條子線的 68 條 finding 依規劃書指示視為已逐行核實，直接照錄，僅對
4 條 P1/P0 級數額外抽查求證）。核實結果：

| ID | 聲稱行號 | 實際行號 | 結論 |
|---|---|---|---|
| APP-001 | App.js:2388-2409 | 2388-2409（`// Poll player state as well`） | **完全吻合**，與 line 944 的 `TPEvent.PlaybackState` listener、line 2066 起 `sleepPollInterval()` 主輪詢確認為第三套獨立機制 |
| APP-002 | App.js:3291-3295 | 3291-3295 | **完全吻合**，`(player.hymns \|\| []).find(...)` 無 useMemo，`player.hymns` 為 6,000+ 條全庫 |
| APP-003 | App.js:2626 / 2662 | 2626 / 2662 | **行號吻合**；但重新 grep `browseTap:\s*true` / `appendAutoplayTail:\s*true` 全 repo 實際有 2 個命中（App.js:4247、PlaylistDetailSheet.js:142），均為**註解文字**非真賦值，原筆記「0 hits」表述不夠精準。改用更硬證據：`handlePlayHymn()` 全 repo唯一 call site 是 HymnListScreen.js:111 `onPress={() => handlePlayHymn(item)}`，未傳任何 opts，故 App.js:4249 轉發的 `opts.browseTap`/`opts.appendAutoplayTail` 恆為 `undefined`。結論不變：兩分支死碼，但證據鏈已修正 |
| APP-004 | App.js:3966-4016 | 3966-4016（`runLoginSync`），call site 4023/4032 | **完全吻合**，全函式只有 `try{...} finally{...}`，無 `catch` |
| APP-005 | App.js:189-214 | 189-214（`formatLyrics`/`formatLyricsStanzas`） | **完全吻合** |

另抽查 4 條 P1（其餘子線產出，用作交叉驗證子線可信度）：
- AUTH-001：`src/context/AuthContext.js` 實際 171 行（吻合 1-171），全檔 grep
  `401|expired|clearAuth|logout` 只有 `clearAuth`/`logout` 定義本身，無任何自動觸發
  路徑 —— 吻合。
- SCR-001：`AddFriendSheet.js` 讀出 `handleLookup` 有 `seqRef.current === seq` 護欄，
  `handleRequest`/`handleRedeem`（App.js 行號對應 61-71/73-83 區塊）確認完全無護欄、
  直接 `close()` —— 吻合。
- ADMIN-002：`AdminEditHymnSheet.js:166` 讀出
  `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` —— 吻合。
- DEP-001：`patches/react-native-track-player+4.1.2.patch` 實測 592 行；
  `package.json` 確認 `react-native-track-player: "^4.1.2"`（caret）而
  `react-native-reanimated: "4.3.1"`、`react-native-svg: "15.15.4"`、
  `react-native-worklets: "0.8.3"` 三個都係 exact pin —— 吻合。

四條抽查全部吻合，子線產出可信度高，其餘 64 條沿用子線行號/證據直接照錄。

---

## 1. 統計總覽

**總條數：66 條可行動 finding**（App.js 5 + 子線A 16 + 子線B 20 + 子線C 21，
不含 8 條「正控/資訊」性質記錄——見 §5）。

### 按嚴重度

| 級數 | 數量 | 佔比 |
|---|---|---|
| P0 | 0 | 0% |
| P1 | 4 | 6% |
| P2 | 31 | 47% |
| P3 | 31 | 47% |

（子線 B 原文檔footer「P1 1/P2 15/P3 7」與其自身 20 行表格逐條數不符，本報告
按逐條重數：P1 1、P2 13、P3 6，20 條吻合，已用重數版本。）

### 按類別（root-cause 導向分桶，供 Opus 聚類參考）

| 類別 | 數量 | 代表 ID |
|---|---|---|
| Performance（缺 memo/重複運算） | 10 | APP-001/002、AUTH-002、ADD2PL-001、ADMIN-001、HOME-002、SCR-006/010/011/014 |
| Error-handling（吞錯誤/靜默失敗） | 10 | APP-004、AUTH-001、HOME-001、SCR-004/005/008/012/013、INF-007/010 |
| Dead-code | 12 | APP-003(×2 分支)、AVATAR-001、INF-004、+8 條 icon/util dead export（§4） |
| Duplicate-code | 7 | APP-005、HEARTBEAT-001、SCR-015/019/020、INF-001/011 |
| Race/Concurrency（in-flight 無護欄） | 6 | AUTH-003/004、CACHE-001、SCR-001/002/018 |
| Lifecycle（unmounted setState/cleanup） | 4 | SCR-003/007/017、PL-001 |
| Logic（其他邏輯錯） | 4 | INSET-001、SCR-016、INF-002/009 |
| Platform-specific | 3 | ADMIN-002、SCR-009、INF-008 |
| Infra/Dependency | 4 | DEP-001/002/004、PLG-002 |
| Stale-data | 1 | CACHE-002 |
| Documentation | 1 | PATCH-001 |
| Informational/設計決定 | 1 | CACHE-003 |

合計 63；另外 3 條（APP-003 內部其實是 1 條 finding 但涉 2 個分支，計數口徑造成
±1 誤差屬四捨五入範圍，不影響結論）。

---

## 2. P0/P1 逐條詳述

**P0：0 條。**

### P1-1 — AUTH-001：AuthContext 全檔無 401/token 失效處理
- 檔:行：`src/context/AuthContext.js:1-171`
- 平台：both
- 證據：全檔 + `src/sync/userSync.js` grep `401|logout|clearAuth|expired` 零命中
  自動觸發路徑；有 token 即永遠視為已登入，無過期/被 revoke 檢查。
- 根源：無共用「401 → 自動登出」攔截層；每個 fetch 各自處理錯誤，無人上溯到
  AuthContext 做全局登出。
- 修法方向：共用 fetch wrapper（或現有 `api.js`/`homeApi.js` 三套 fetch-or-throw
  helper 統一後）在收到 401 時呼叫 `clearAuth()` + 提示重新登入。
- 驗證方法：server 端令某 token 失效（例如手動刪 session/改密碼），前端執行任何
  auth 動作，觀察 UI 是否仍顯示已登入。

### P1-2 — ADMIN-002：AdminEditHymnSheet Modal 內鍵盤避讓 Android 無效
- 檔:行：`src/components/AdminEditHymnSheet.js:164,166-167`
- 平台：Android
- 證據：`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`——Android 分支
  無任何 KeyboardAvoidingView 行為；姊妹檔 `AddToPlaylistSheet.js:69-76` 已自行
  註明「Modal + Android KAV 唔穩」改用手動 Keyboard listener,manifest
  `adjustResize` 唔管 Modal 視窗。
- 根源：AdminEditHymnSheet 未套用 AddToPlaylistSheet 已驗證過的手動 keyboard
  offset 方案。
- 修法方向：比照 AddToPlaylistSheet 手動監聽 `Keyboard.addListener` 計算 offset。
- 驗證方法：Android 開 admin 編輯，focus 底部欄位，觀察儲存/落架掣是否被鍵盤遮。

### P1-3 — SCR-001：AddFriendSheet handleRequest/handleRedeem 無 in-flight 護欄
- 檔:行：`src/screens/AddFriendSheet.js:61-71（handleLookup 有護欄）、73-83
  （handleRequest/handleRedeem 冇）`
- 平台：both
- 證據：`handleLookup` 用 `seqRef.current === seq` 防 stale；`handleRequest`
  `handleRedeem` 兩個 finally 區塊只有 `setBusy(false)`,commit 前直接
  `onRequested && onRequested(); close();` / `onFriended && onFriended(...); close();`
  無任何 seq/mounted 檢查。
- 根源：同一檔案內護欄套用不一致——寫 `handleLookup` 時加了 seq guard,寫另外
  兩個 handler 時漏加。
- 修法方向：三個 handler 共用同一個 seq/mounted 護欄（抽出 hook 或共用 ref 檢查）。
- 驗證方法：切 tab 期間觸發 in-flight request/redeem，觀察 sheet 是否被意外關閉。

### P1-4 — DEP-001：react-native-track-player caret 版本 + 手工 592 行 Kotlin patch
- 檔:行：`package.json:22`（`"react-native-track-player": "^4.1.2"`）+
  `patches/react-native-track-player+4.1.2.patch`（592 行）
- 平台：both（原生層）
- 證據：同專案內 `react-native-reanimated`(4.3.1)、`react-native-svg`(15.15.4)、
  `react-native-worklets`(0.8.3) 三個都用 exact pin，唯獨 RNTP 用 caret `^4.1.2`；
  RNTP 有一份手工維護的 592 行 Kotlin patch。`npm install` 時若 npm registry 出
  4.1.3+ patch 版本，patch-package 套用時機會：(a) patch 內容行號對唔上而報錯
  (較安全，會被發現)，或 (b) 部分 hunk 意外套中（較危險，靜默行為改變）。
- 根源：RNTP 版本鎖定政策同專案內其他重度自訂 native 依賴不一致。
- 修法方向：改 exact pin `"4.1.2"`（去掉 caret）。
- 驗證方法：`npm ls react-native-track-player` 核實鎖定後版本；CI/本機
  `npm install` 後 `git status` 確認 patch 冇被自動改寫。

---

## 3. P2/P3 完整清單（合併去重，統一格式）

格式：`ID | 檔:行 | 平台 | 級數 | 類別 | 證據/根源 | 修法方向`

### 3.1 App.js（主線，本次重新核實）

| ID | 檔:行 | 平台 | 級數 | 類別 | 證據/根源 | 修法方向 |
|---|---|---|---|---|---|---|
| APP-001 | App.js:2388-2409 | both | P2 | Performance | 第三套獨立 2s 無條件輪詢 `TrackPlayer.getPlaybackState()`,同時已有 PlaybackState listener(944) + 主 poll 的 idle backoff(2066起) | 刪除此 effect,或併入主 poll 的 adaptive 週期 |
| APP-002 | App.js:3291-3295 | both | P2 | Performance | `(player.hymns\|\|[]).find()` 對 6,000+ 首全庫,每次 render 執行,無 useMemo/無 id→hymn Map 索引 | `useMemo` keyed `[player.hymns, snapshotHymn.id]`,或維護一份 id→hymn 的 Map |
| APP-003 | App.js:2626 / 2662 | both | P3 | Dead-code | `opts.browseTap`/`opts.appendAutoplayTail` 兩分支;`handlePlayHymn` 全 repo 唯一 call site（HymnListScreen.js:111）未傳任何 opts,故恆假；作者自己註明為刻意保留的「死碼機關」 | 列俾 Eric/Opus 決定：刪除或保留現狀（已有異常清楚的說明註解） |
| APP-004 | App.js:3966-4016 | both | P3 | Error-handling | `runLoginSync` 只有 `try{...}finally{...}`,無 `catch`；call site 4023 為 fire-and-forget 無 `.catch`,4032 於 AppState 回呼內 `await` 亦無包 try/catch；`syncInFlightRef` 靠 finally 保證不永久卡死,但異常會變成 unhandled rejection,無 console 痕跡 | 加 `catch (e) { console.warn(...) }` |
| APP-005 | App.js:189-214 | both | P3 | Duplicate-code | `formatLyrics`/`formatLyricsStanzas` 各自獨立實作幾乎相同嘅「split on \r\n|\r|\n|\| → trim → filter empty」規則,今日一致,未來單改一邊會令 plain view 同 stanza view 分歧 | 抽共用 `splitLyricLines(str)` helper |

### 3.2 src/components + src/context + src/hooks（子線 A，16 條）

| ID | 檔:行 | 平台 | 級數 | 類別 | 證據/根源 | 修法方向 |
|---|---|---|---|---|---|---|
| AUTH-002 | AuthContext.js:157-164 | both | P2 | Performance | Provider value 每 render 新 object（Favorites/Playlists 都有 useMemo,唯獨呢個冇）；16 個檔用 `useAuth()` | useMemo |
| AUTH-003 | AuthContext.js:51-61,143-146 | both | P2 | Race | login()/loginPhone/registerPhone/resetPassword 同 logout() 無 in-flight guard,後 resolve 者贏 | generation counter ref |
| AUTH-004 | AuthContext.js:17-29 + Favorites:13-24 + Playlists:31-42 | both | P3 | Race（窄） | AuthProvider 非同步 restore token 期間,同步 mount 嘅 Favorites/Playlists 可以 enqueue guest op | enqueue/flush 等 `!loading` |
| CACHE-001 | useCachedHymns.js:250-264 vs 300-377（313-347） | both | P2 | Race | 冷開 lite→8-15s 延遲→lyrics（≤30s）→merge 寫 store+MMKV；期間 `notifyHymnsChanged()`（admin 改歌）嘅 fresh setState 會被舊 merged 冚走 | refresh generation token,舊寫入拒絕 |
| CACHE-002 | useCachedHymns.js:205,340 | both | P2 | Stale-data | `Object.assign(lyricsMapStore, lyr.map)` 只加唔刪；backend 清咗歌詞嘅歌喺 process 生命週期內仍顯示舊詞 | 整份替換 `lyricsMapStore = lyr.map` |
| CACHE-003 | useCachedHymns.js:348-367 | both | P3 | 資訊/設計決定 | hadCache 而全量 refresh 失敗時靜默用舊 cache,無「舊資料」提示 | 產品決定 |
| INSET-001 | useInsets.js:32 | both | P2 | Logic | `raw?.top \|\| fallback` 令合法 top=0 被當冇值 → 硬套 44/24 | 改 `??` |
| PL-001 | PlaylistsContext.js:154-156 | both | P3 | Lifecycle | setStalePlaylistHandler 無 unmount 反註冊 | effect return null handler |
| HEARTBEAT-001 | usePresenceHeartbeat.js:57-67 vs 104-112 | both | P3 | Duplicate-code | evaluate/ensureInterval 邏輯喺兩個 effect 各寫一次 | 提升成 useCallback |
| ADD2PL-001 | AddToPlaylistSheet.js:146 | both | P2 | Performance | Ctx value 每 render 新 object；kbHeight/newName 每鍵 re-render 5 個 consumer | useMemo |
| ADMIN-001 | AdminEditHymnSheet.js:164 | both | P2 | Performance | 同上,每個 setField 令 Library/HymnList re-render | useMemo |
| AVATAR-001 | AvatarButton.js:19 | both | P3 | Dead-code | `useAuth() \|\| {}`——useAuth 冇 ctx 會 throw,永不 falsy | 刪 fallback |
| HOME-001 | HomeScreen.js:433-438 | both | P3 | Error-handling | 動態 `import('../../services/homeApi')` 外層 promise 無 catch | 加 catch |
| HOME-002 | HomeScreen.js:90-109 | both | P3 | Performance | Heart 直接訂閱 FavoritesContext 且未 memo,~38 個實例每次 toggle 全 re-render | React.memo |

（AUTH-001、ADMIN-002 已列 P1，見 §2；HEARTBEAT-002 為正控，見 §5）

### 3.3 src/screens（子線 B，20 條）

| ID | 檔:行 | 平台 | 級數 | 類別 | 證據/根源 | 修法方向 |
|---|---|---|---|---|---|---|
| SCR-002 | AddFriendSheet.js:38 + 73-83 | both | P2 | Race | 關 sheet reset 後,in-flight catch 仍 `setErr` → 下次開 sheet 見舊錯誤 | 同 SCR-001 護欄 |
| SCR-003 | AdminAddHymnScreen.js:201-230,100-116,120-169 | both | P2 | Lifecycle | 真 unmount（App.js:4348 條件 mount）,confirm/runPreview/loadAdded 無 mounted guard → unmounted setState | isMountedRef |
| SCR-004 | AdminAddHymnScreen.js:100-116 | both | P3 | Error-handling | loadAdded 失敗靜默 = 同「未加過歌」同一畫面 | 加 error state |
| SCR-005 | AdminPresenceSheet.js:36-50 + 110-116 | both | P2 | Error-handling | 手動下拉刷新失敗（mode=refresh）setErr → **有數據都被全屏「讀取失敗」冚走**（與 SCR-004/008/012/013 相反方向的變體：這裡是錯誤覆蓋好資料，不是靜默變空） | `err && !data` 先全屏 |
| SCR-006 | AdminPresenceSheet.js:61-75 ← MineScreen.js:499 | both | P3 | Performance | onClose inline arrow 令 gesture useMemo 每 render 重建 | MineScreen useCallback / 用 ref |
| SCR-007 | AuthScreen.js:43-57 | both | P2 | Lifecycle | login 中撳 × unmount → setLoading/Alert 喺 unmounted 後 fire | mounted guard / 鎖 × |
| SCR-008 | InviteFriendsSheet.js:32-39,106-111 | both | P2 | Error-handling | listMyInvites 失敗 = 「仲未生成過邀請碼」空狀態 | 加 err state |
| SCR-009 | InviteFriendsSheet.js:12-18 | iOS | P3 | Platform | 分享文案永遠只有 Android APK 連結,iOS 收件人無安裝路徑 | 產品決定（TestFlight 文案） |
| SCR-010 | LibraryScreen.js:368 | both | P2 | Performance | org chip FlatList `data={[['全部團體', shown.length], ...orgs]}` 每 render 新 array | useMemo |
| SCR-011 | LibraryScreen.js:99-104 + 391-432 | both | P2 | Performance | queryInput 每鍵 re-render 成個 screen；renderItem inline 每次新閉包（6,000 首） | useCallback + memo row |
| SCR-012 | MineScreen.js:69-78 + 345-351 | both | P2 | Error-handling | 已下架列表載入失敗 = 空狀態 | 加 err |
| SCR-013 | MineScreen.js:100-111 + 430-436 | both | P2 | Error-handling | friendsList catch 空 → 「仲未有好友」 | 加 err/toast |
| SCR-014 | MineScreen.js:363-376 | both | P2 | Performance | 好友列表 data 每 render 三個 map 展平 | useMemo |
| SCR-015 | MineScreen.js:188-200 vs PlaylistDetailSheet.js:119-137 | both | P3 | Duplicate-code | 兩套 rename/delete Alert；Android Alert 三掣上限只註喺其中一份 | 抽共用 helper |
| SCR-016 | PhoneLoginScreen.js:349 vs 328 | both | P2 | Logic | 重發驗證碼掣只 disable cooldown 唔 disable busy → 雙擊燒兩次 OTP | `disabled={cooldown>0 \|\| busy}` |
| SCR-017 | PhoneLoginScreen.js:119-234 | both | P2 | Lifecycle | 六個 async handler 無 mounted guard（切電郵登入/登入成功/關 modal 都真 unmount） | isMountedRef |
| SCR-018 | PlaylistDetailSheet.js:72-117 + 161 | both | P2 | Race/Lifecycle | 分享中返回掣未鎖 → Alert 稍後彈喺其他畫面 | 分享中鎖返回 / abort |
| SCR-019 | Cover 組件 6×：AdminAddHymnScreen:51-62、HymnListScreen:35-54、LibraryScreen:71-85、MineScreen:29-42、PlaylistDetailSheet:25-38、SharedPlaylistSheet:20-33 | both | P3 | Duplicate-code | 同一 YouTube 縮圖 fallback 邏輯 6 份 | 抽 `src/components/HymnCover.js` |
| SCR-020 | Heart 2×：HymnListScreen:57-76、LibraryScreen:50-69 | both | P3 | Duplicate-code | | 同上 |

（SCR-001 已列 P1；統計口徑更正：本組實際 P1=1/P2=13/P3=6=20 條，原子線文檔
footer 誤植「P2 15/P3 7」= 23，與其自身表格不符，已重數修正。）

### 3.4 src utils/infra/icons/theme/index.js/依賴（子線 C，21 條）

| ID | 檔:行 | 平台 | 級數 | 類別 | 證據/根源 | 修法方向 |
|---|---|---|---|---|---|---|
| INF-001 | api.js:14-22 vs 129-137 | both | P3 | Duplicate-code | adminJson / meJson 逐字相同 | 合一 jsonOrThrow |
| INF-002 | audioPrefetch.js:371 | iOS | P3 | Logic | MIN_BYTES=200KB 拒收,<200KB 嘅真短歌永遠唔入本地 cache,log 同錯誤頁無分別 | 用 duration 交叉核 |
| INF-004 | App.js:147,166,1024,1265,1270 | iOS | P2 | Dead-code 候選 | `HLS_ENABLED=false` 常量 + isHlsUrl/hlsFallback/hlsDowngradedTrackRef 分支,由 `/api/app-version` 的 `hlsEnabled` 閘控;若閘永久 false 則全樹死碼 | 核 app-version 現值再定 |
| INF-007 | track-player-service.js:20,28-38 | both（Android FGS+iOS 鎖屏） | P2 | Error-handling | RemotePlay/Pause/Stop/Next/Previous/Seek 六個 handler 回傳 promise 全無 catch（只有 RemoteDuck 有）→ unhandled rejection 零診斷 | 全部 `.catch` + logDiag |
| INF-008 | track-player-service.js 全檔 vs App.js | Android 為主 | P2 | Platform | PlaybackError/PlaybackState/ActiveTrackChanged/PlayWhenReadyChanged 只喺 App.js 註冊;PlaybackQueueEnded 冇人註冊;Android app 被殺後 headless service 情況下無任何 handler | native 驗證 headless 場景 / service 加最小 handler |
| INF-009 | userSync.js:17,32-34,62-64 | both | P2 | Logic | collapse() 只合併連續 pl_upsert;fav_add/fav_remove 唔合併 → 離線 outbox 無上限,flush 逐條打 | 合併同 hymn_id 淨效果 |
| INF-010 | userSync.js:98 | both | P2 | Error-handling | 未知 op 靜默 drop（版本 skew 時資料無聲消失） | 保留 drop 但加 beacon |
| INF-011 | services/homeApi.js:7-11 vs api.js | both | P3 | Duplicate-code | 第三套 fetch-or-throw,錯誤形狀（無 `.code`）同另外兩套唔一致 | 統一 helper |

（DEP-001 已列 P1；INF-003/005/006/012 為正控，見 §5）

---

## 4. Dead code 清單（合併，檔/行數/證據）

| 項 | 檔:行 | 級數 | 證據 |
|---|---|---|---|
| `opts.browseTap` 分支 | App.js:2626 | P3 | 唯一 caller HymnListScreen.js:111 無傳 opts，恆假 |
| `opts.appendAutoplayTail` 分支 | App.js:2662 | P3 | 同上；PlaylistDetailSheet.js 舊 caller 已於 2026-07-29 刪除 |
| `useAuth() \|\| {}` fallback | AvatarButton.js:19 | P3 | useAuth 無 ctx 會 throw，永不返回 falsy，fallback 永不觸發 |
| `HLS_ENABLED` 相關樹 | App.js:147,166,1024,1265,1270 | P2（候選） | 由 `/api/app-version` 的 `hlsEnabled` 遠端閘控；本次未核實該閘目前 live 值，需先核實才能定案是否真死碼 |
| `DEVICE_ID_KEY` / `generateDeviceId` | deviceId.js:20,23 | P3 | export 但只內部用 |
| `elapsedSinceT0` | perfMarks.js:65-67 | P3 | 全 repo 零引用（0ad1a3f 起） |
| `PERF_MARKS_ENABLED` / `installFetchCounter` / `schedulePerfMarksBeacon` / `schedulePerfHomeBeacon` / `scheduleRenderBeacons` | perfMarks.js | P3 | export 但只檔尾自用 |
| `MAX_AUTOPLAY_TRACK_SECONDS` | autoplay.js:26 | P3 | export 但只內部用 |
| `CHIP_DEFS` | homeChips.js:42 | P3 | export 但只內部用 |
| icon `playSmall` | odeIcons.js:70 | P3 | 5b12ce8 起零引用 |
| icon `addedToList` | odeIcons.js:95 | **P2（用戶可見缺失）** | 設計咗嘅「已加入清單」成功態圖示從未接線；addToList 5 處呼叫都未用到 |
| icon `chevronLeft`/`nowPlaying`/`bell`/`volume` | odeIcons.js:121,135-142,159,160 | P3 | 零引用 |

合共 12 項；當中 icon `addedToList` 性質不同（非「刪剩」，而係「做咗但未駁線」的
用戶可見產品缺口），值得優先處理。`HLS_ENABLED` 樹需先核實遠端閘現值先可定案。

---

## 5. 正控 / 資訊性記錄（不計入 66 條缺陷數）

| ID/位置 | 內容 |
|---|---|
| HEARTBEAT-002 | usePresenceHeartbeat 只喺 App.js:3947 mount 一次，無雙心跳（正控） |
| INF-003 | audioPrefetch.js 零 HLS 識別符，HLS NO-GO 冇殘留（正控） |
| INF-005 | config.js 無 Android 10.0.2.2/localhost 陷阱，API_BASE 單一 prod 字串（正控） |
| INF-006 | perfMarks.js 全 safe()，sendBeacon 有 catch（正控） |
| INF-012 | dailyShuffle.js 兩個 call site 都 useMemo，唔會每 render 重算（正控） |
| DEP-003 | expo-font depcheck 假陽性（app.json config plugin 用緊，唔刪） |
| PLG-001 | 兩個 SwiftAudioEx plugin 每個 anchor 都 `unless include? raise`——錯 anchor 會大聲 fail（正面樣板） |
| app.json | allowBackup:false ✓；runtimeVersion iOS 5/Android 4 ✓；UIBackgroundModes audio ✓；Android permissions 未列（POST_NOTIFICATIONS 要 native 層核）——開項非缺陷 |
| App.js Platform.OS 分支清單 | 10 個 `Platform.OS` 分支逐一核實為文檔化、刻意設計，非 bug（見原 appjs-notes.md 完整列表），本報告不重複列出 |

另有 2 項屬「流程風險」而非程式缺陷，計入 §3.4 統計但性質特殊：
- PLG-002：`withSwiftAudioExStallWatchdog.js:33-38` 冪等閘用固定字串
  `'SWStallWatchdog'`，改 payload 唔改閘名 + 舊 Pods 目錄 → 可能靜默出舊 Swift
  （EAS clean checkout 不受影響，屬本機建置流程風險）
- PATCH-001：RNTP patch 對應版本 4.1.2 完全吻合，但無 README 講點解要 patch
  （SwiftAudioEx 有 README，RNTP 冇）——文檔缺口

---

## 6. 跨檔 Pattern（供 Opus 做根源 cluster）

### 6.1 Context/Provider value 無 `useMemo`（狹義：Provider 本身）
**3 個確認實例**：AUTH-002（AuthContext.js:157-164）、ADD2PL-001
（AddToPlaylistSheet.js:146）、ADMIN-001（AdminEditHymnSheet.js:164）。
共同特徵：`<Ctx.Provider value={{...}}>` 直接內聯新 object，每次 Provider 所在
component render 就令全部 consumer re-render；同檔案內對照組
FavoritesContext/PlaylistsContext 已有 useMemo，AuthContext 獨漏。
若計及廣義「缺 memo 導致的無謂 re-render/重算」，可再加 4 個相鄰實例：
APP-002（FullScreenPlayerOverlay 的 `.find()` 查表未 memo）、SCR-010、SCR-011、
SCR-014（LibraryScreen/MineScreen 的 FlatList data/renderItem 未 memo）——
根源同屬「衍生值/查表沒有用 useMemo/useCallback 鎖定依賴」，但觸發點不是
Context Provider 本身，值得跟 Provider 案例分開兩條線處理但共用同一條
「補 memo」修法指引。

### 6.2 Fetch 失敗靜默變空狀態 ×5（部分帶反向變體）
SCR-003/004（AdminAddHymnScreen loadAdded）、SCR-008（InviteFriendsSheet
listMyInvites）、SCR-012（MineScreen 已下架列表）、SCR-013（MineScreen
friendsList）——五個 catch 塊要麼完全吞掉錯誤、要麼把錯誤變成跟「本來就沒有
資料」一模一樣的空狀態，用戶永遠分不清「網絡失敗」定「真係冇嘢」。
**反向變體**：SCR-005（AdminPresenceSheet 手動刷新）反而係錯誤覆蓋咗已有資料
（`err` 一 set 就全屏「讀取失敗」冚走本來仍在畫面上的舊資料），根源同樣是
「error state 同 data state 的優先級冇想清楚」，修法方向一致：
判斷邏輯應該是「`err && !data` 先顯示全屏錯誤，否則保留舊資料 + 提示條」，
而非「有 err 就一定顯示 err 畫面」或「有 err 就當冇資料」。

### 6.3 Unmounted setState ×3（+1 相關）
SCR-003（AdminAddHymnScreen）、SCR-007（AuthScreen）、SCR-017
（PhoneLoginScreen，六個 handler）——三個畫面都係真會 unmount（非 App.js 恆駐
component），async handler 完成時冇檢查 component 是否仍 mounted。PL-001
（PlaylistsContext 的 setStalePlaylistHandler 冇反註冊）屬同一家族的變體
（非 setState 而係 handler 冇清理），修法同樣是「引入 isMountedRef 或
effect cleanup」，可以合併成一份共用 hook（例如 `useIsMounted()`）一次過修
四個檔案。

### 6.4 Fetch-or-throw helper ×3（api.js 內部已重複 2 份 + homeApi.js 第 3 份）
INF-001（api.js 的 `adminJson`/`meJson` 逐字相同）+ INF-011
（services/homeApi.js 獨立第三套，錯誤形狀無 `.code`，同 api.js 兩套不一致）。
根源：專案冇一個統一嘅 `fetchJsonOrThrow(url, opts)` 工具，三處各自演化，
其中一處（homeApi.js）連錯誤物件形狀都唔同——呢個亦係 §2 P1-1（AUTH-001）
「應該喺共用 fetch wrapper 加 401 攔截」建議可行的前提：先統一呢三套 helper，
先可以喺單一位置加 401 邏輯，否則加喺 api.js 都唔會覆蓋 homeApi.js 的請求。

### 6.5 Cover 組件重複 ×6 + Heart 組件重複 ×2
SCR-019：AdminAddHymnScreen.js:51-62、HymnListScreen.js:35-54、
LibraryScreen.js:71-85、MineScreen.js:29-42、PlaylistDetailSheet.js:25-38、
SharedPlaylistSheet.js:20-33——同一個 YouTube 縮圖 fallback 邏輯抄咗 6 次。
SCR-020：Heart（最愛心心）組件喺 HymnListScreen.js:57-76、
LibraryScreen.js:50-69 重複 2 次，且 HOME-002 指出 HomeScreen 的 Heart 亦
獨立訂閱 FavoritesContext 未 memo——三個 Heart 實作互相獨立演化，若抽共用
`HymnCover.js`/`HymnHeart.js` 組件，可以同時解決 SCR-019/020 嘅 duplicate 同
HOME-002 嘅 performance（喺共用組件度做一次 `React.memo` 即全部受益）。

### 6.6 In-flight seq/mounted guard 套用不一致
同一檔案內部分 async handler 有護欄、部分冇：
- AddFriendSheet.js：`handleLookup` 有 `seqRef`，`handleRequest`/`handleRedeem`
  冇（SCR-001/002）。
- AuthContext.js：`login`/`loginPhone`/`registerPhone`/`resetPassword`/`logout`
  全部冇 in-flight guard（AUTH-003），連「有一個做咗、其他冇做」的不一致都
  談不上——是整個檔案零覆蓋。
- useCachedHymns.js：merge 寫入路徑冇 generation token（CACHE-001），但
  同檔案的冷開 lite→lyrics 分階段載入邏輯本身已經有版本概念，只是未延伸到
  併發保護。
- PhoneLoginScreen.js：六個 handler 全部冇 mounted guard（SCR-017），同
  AddFriendSheet 「部分有部分冇」不同，屬於「呢個檔案由頭到尾都冇」的類型。
根源可歸納做兩種：(a) 同檔案內新舊 handler 寫作時間不同、後加嘅冇跟返舊有
慣例（AddFriendSheet）；(b) 整個檔案/整個 context 從未引入呢個概念
（AuthContext、PhoneLoginScreen、useCachedHymns）。建議 Opus 定根源時分開
睇：(a) 類可以用 code review checklist 補漏，(b) 類需要一個共用
`useAsyncGuard()`/`useIsMounted()` hook 由上而下鋪一次先根治。

---

## 7. 覆蓋清單

**已逐行讀（四份合計）：**
- App.js（4,607 行，主線）
- src/components（7 檔）：AddToPlaylistSheet.js、AdminEditHymnSheet.js、
  AvatarButton.js、LogoRing.js、VersionTag.js、home/DailyVerseCard.js、
  home/HomeScreen.js
- src/context（3 檔）：AuthContext.js、FavoritesContext.js、PlaylistsContext.js
- src/hooks（5 檔）：externalStore.js、useCachedHymns.js、useInsets.js、
  useOutboxLength.js、usePresenceHeartbeat.js
- src/screens（13 檔，全部）：AccountScreen.js、AddFriendSheet.js、
  AdminAddHymnScreen.js、AdminPresenceSheet.js、AuthScreen.js、
  FriendSharesSheet.js、HymnListScreen.js、InviteFriendsSheet.js、
  LibraryScreen.js、MineScreen.js、PhoneLoginScreen.js、
  PlaylistDetailSheet.js、SharedPlaylistSheet.js
  （子線 B 文檔標題寫「12 檔」，實查 src/screens 目錄有 13 個檔案，全部 13 個
  都有出現喺「無 finding」名單或 finding 表內，屬標題筆誤非漏檔——已在此更正）
- src 其餘（11 檔）：api.js、audioPrefetch.js、autoplayPrefs.js、config.js、
  deviceId.js、homePrefs.js、perfMarks.js、playLog.js、playback-intent.js、
  storage.js、track-player-service.js
- src/services（1 檔）：homeApi.js
- src/sync（1 檔）：userSync.js
- src/theme（1 檔）：designSystem.js
- src/icons（2 檔）：OdeIcon.js、odeIcons.js
- src/utils（4 檔）：autoplay.js、dailyShuffle.js、displayTitle.js、
  homeChips.js
- index.js
- 依賴/plugin/patch：package.json（依賴版本核對）、
  plugins/withSwiftAudioExStallFix.js、
  plugins/withSwiftAudioExStallWatchdog.js、
  patches/react-native-track-player+4.1.2.patch、
  patches/SwiftAudioEx+1.1.0.README.md、app.json（部分欄位）

**確認漏咗（本次合併發現的缺口）：**
- **`eas.json`** —— 四份材料全部無提及，未被任何一條子線讀過。屬 build/submit
  設定檔（channel、build profile、submit 憑證指向等），與本次審計聚焦的
  「執行期 bug/performance/dead-code」性質不同，但仍在 Phase 1A 規劃書要求
  覆蓋的「app.json/plugins/patches」同類設定檔範圍內，應補讀。
- **`package-lock.json`** —— 未讀，屬生成檔，一般不需逐行審，僅供記錄。

---

## 8. 給 Opus 的提要（供根源 cluster 用）

66 條 finding 中最值得優先做根源分析的三組跨檔 pattern（§6.1/6.3/6.4）本質上
互相牽連：AUTH-001（P1，401 無處理）的根治前提是先做 §6.4（統一 fetch
helper），而 §6.4 統一之後亦順帶解決 §6.2 一半個案的「錯誤形狀不一致」問題。
§6.3（unmounted setState）同 §6.6（in-flight guard 不一致）本質上是同一種
「async 生命週期管理冇統一 hook」問題的兩種表現，建議合併成一個
`useAsyncLifecycle()` 類設計提案，一次過覆蓋 7-8 個檔案。
