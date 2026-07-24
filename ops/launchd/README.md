# launchd agents（開機自動啟動）

四個 plist 嘅**副本**，正本喺 `~/Library/LaunchAgents/`。放喺呢度係為咗版本控制 + 萬一要重做有得抄。

| 檔案 | 做乜 |
|---|---|
| `com.hymnapp.backend.plist` | 行 backend（`node server.js`，port 3001） |
| `com.cloudflare.cloudflared.plist` | 行 tunnel（`cloudflared tunnel run hymn-api` → api.god-music.com） |
| `com.hymnapp.deadlinkcheck.plist` | 每晚 04:00，慢速重驗歌庫死鏈（見 `HANDOFF.md` 三之三） |
| `com.hymnapp.growlibrary.plist` | **每 15 分鐘一次、24 小時**（2026-07-21 由夜間 00:07-08:07 改，見下面），慢速擴歌庫（見 `HANDOFF.md` 三之九、`LIBRARY-EXPANSION-PLAN.md`） |

## 安裝
```bash
cp ops/launchd/*.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.hymnapp.backend.plist
launchctl load -w ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
launchctl load -w ~/Library/LaunchAgents/com.hymnapp.deadlinkcheck.plist
launchctl load -w ~/Library/LaunchAgents/com.hymnapp.growlibrary.plist
launchctl list | grep -iE "cloudflare|hymnapp"   # 第 2 欄 exit code，0 = 正常
```
**唔使 sudo。**

## ⚠️ 一定要知嘅坑
1. **凡係會 exec `yt-dlp` 嘅 job，plist 都要自己 set `EnvironmentVariables/PATH`** —— launchd 預設 PATH
   冇 `/opt/homebrew/bin`。唔 set 嘅話 job **照樣「成功」執行完，但每一次 yt-dlp resolve 都靜靜哋
   command-not-found**。而家四個 job 入面，`backend` / `deadlinkcheck` / `growlibrary` 三個都會行到
   `yt-dlp`，全部都要有呢個 PATH 區塊。
   🔺 **實測踩過**：`growlibrary` 裝落去嗰陣漏咗呢段，結果**由 07-18 裝好到 07-20 早,連續 9 次
   每小時 run 全部收錄 0 首**，仲要令斷路器每次都誤判「俾 YouTube 擋緊」即刻收工
   （因為連對照探測都係用 yt-dlp，一樣 command-not-found）。手動用 `env -i` 模擬 launchd 個
   minimal PATH 先查到根因；一補返 PATH，同一批歌立即 resolve 得返。裝任何新 job 前先照返呢個 checklist。
2. **`cloudflared service install` 整出嚟嗰個 plist 係壞嘅** —— 冇帶參數，
   淨行 `cloudflared` 會 exit 1 crash-loop，tunnel 永遠 530。一定要有 `tunnel run hymn-api`。
   再行一次 `service install` 會覆蓋返，要記得再加參數。
3. **`growlibrary` 同 `deadlinkcheck` 兩個都會讀寫 `hymns.db`，冇 lock 就會撞。**
   兩個 script 都係「開波讀成個 DB 落記憶體、跑完先一次過寫返落 disk」。
   2026-07-20→21 觀察到個「已收錄」數喺日頭(冇任何排程行緊)無故跌咗 9，
   懷疑就係呢個 lost-update。`growlibrary` 2026-07-21 轉 24 小時 + 每 15 分鐘
   一次之後，同 `deadlinkcheck`(每晚 04:00，單次 run 要 ~8 分鐘)撞埋嘅機會
   大好多，已經加咗 `hymnDb.js` 嘅 `acquireDbLock()`/`releaseDbLock()`
   （lockfile 喺 `hymns.db.lock`）兩個 script 都要用，攞唔到鎖就今次跳過、
   留返下個排程，唔會死等卡住成條隊。

## ⚠️ LaunchAgent 係「登入後」行，唔係「開機即行」
部 Mac 重開後停喺登入畫面嘅話，兩個都唔會行。要真開機即行，就要開自動登入。

詳情見 `HANDOFF.md` →「七、開機自動啟動」。
