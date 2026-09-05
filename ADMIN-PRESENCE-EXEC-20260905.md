# Admin「在線」頁執行單 2026-09-05（Fable 5.1 出，Sonnet 5 執行，Opus 5 驗收）

Eric 拍板：①在線 = 前台 + 背景播歌（分開標示）②訪客計數（只顯示數字）③唔顯示正在聽邊首歌 ④「在線幾耐」= 呢次連續在線 ⑤只做即時，歷史留第二版。

## 1. 定義
- **心跳**：App 每 60 秒 `POST /api/presence/heartbeat`，body `{ deviceId, state: 'fg' | 'bg-playing' }`；有 token 就帶 `Authorization: Bearer`（會員），冇就係訪客。只喺「App 前台」或「背景播緊歌」先送；背景冇播就唔送。App 變 active 嗰刻即刻送一個。
- **在線**：最後心跳 ≤ 180 秒前。**連續在線**：由 session 第一個心跳起計；中斷 >180 秒 → 新 session（firstSeen 重置）。
- **同一部機**：帶 token 嘅心跳以 userId 為 key，訪客以 deviceId 為 key；同一 deviceId 登入前後唔重複計（登入後以 userId 計，server 見到同 deviceId 嘅 guest entry 就移除）。

## 2. Backend（新 `backend/lib/presence.js` + route）
- 記憶體 Map：`key → { kind:'member'|'guest', userId, displayName, deviceId, state, firstSeen, lastSeen }`；每次心跳更新；`sweep()` 剷 >180 秒嘅（每次讀取或每分鐘）。上限 5,000 entries（超過就剷最舊），body 欄位長度白名單（照 clientLog.js 做法）。
- `POST /api/presence/heartbeat`：不強制 auth；有 token 就經 requireAuth 邏輯驗（沿用 `last_seen_at` 更新），token 無效當訪客。回 `204`。
- `GET /api/admin/presence`（`requireAuth` + `requireAdmin`）：`{ now, online: { total, members, guests }, members: [ { id, name, state, onlineSince, durationSec } ] }`，按 durationSec 降序。`name`：users 表有名就用名，冇就電話遮中間四位（Sonnet 先查 users 表有咩欄）。
- A-3 access log 排除 `/api/presence/heartbeat`（同 client-log 一樣避免洗版）。
- 唔碰 hymns.db / 唔加 users 表欄（第一版純記憶體，restart 清零係接受嘅）。

## 3. Frontend
- 新 hook `src/hooks/usePresenceHeartbeat.js`：入參 `{ token, deviceId, isPlaying }`；AppState active 或 isPlaying 時每 60 秒 POST；active 即刻一次；背景且冇播就 clearInterval。全部 try/catch，失敗靜默。喺 `AppContent` 掛一行（讀 `useAuth().token`、`usePlayer().isPlaying`、`getOrCreateDeviceId()`）——**PlayerProvider 一個字唔准掂**。
- MineScreen admin chip 「在線」（跟現有 admin chip pattern，non-admin 唔見）→ 新 `src/screens/AdminPresenceSheet.js`（跟 FriendSharesSheet / AdminEditHymnSheet 嘅 sheet pattern）：頂部三個數（總在線 / 會員 / 訪客），列表每行：名、標籤「前台」/「背景播放」、時長（`X 小時 Y 分` / `Y 分鐘`）；30 秒自動刷新 + 下拉刷新；空狀態「暫時冇人在線」。
- `src/api.js` 加 `adminPresence(token)`、`postHeartbeat(token, deviceId, state)`。

## 4. 驗證（執行者做，Opus 覆核）
- Backend harness（2A 方法，唔起 server.js、唔 restart 3001）：3 個訪客 + 2 個會員心跳 → admin 回 total 5 / members 2 / guests 3；同 deviceId 登入前後只計 1；181 秒後 sweep 剷走；durationSec 隨連續心跳增長、中斷 >180 秒重置；非 admin 打 admin route 403；5,001 entries 上限。
- Frontend：`npx expo export` 編譯過；iOS Release 模擬器（單機、hold 檔、收工 shutdown）用驗收帳號（`opus-verify`，見 memory / docs 搵登入方法；搵唔到就用 harness + 截圖 static render 代替並講明）開「我的」→「在線」sheet 截圖；用 `HYMN_API_BASE` / config 臨時指向 3002 harness backend 做 A/B 唔碰 prod（commit 前還原 config.js）。
- 心跳成本：60 秒一個 <200 byte POST；記錄 backend `[access]` 有冇被排除。

## 5. 鐵律
唔部署（backend restart / OTA 由 Fable 5.1 收貨後做）、唔掂 PlayerProvider、唔掂 hymns.db、commit pathspec-only（`--` 最後）、撞 .git lock 先 `pgrep -x git`、證據表制唔判 PASS/FAIL、scratch 放 /private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad。

## 6. 產出
commits（backend / frontend hook / admin sheet / api 各一）、`ADMIN-PRESENCE-REPORT-20260905.md` 證據表 + 截圖、回覆 300 字摘要。
