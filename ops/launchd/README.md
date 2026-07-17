# launchd agents（開機自動啟動）

兩個 plist 嘅**副本**，正本喺 `~/Library/LaunchAgents/`。放喺呢度係為咗版本控制 + 萬一要重做有得抄。

| 檔案 | 做乜 |
|---|---|
| `com.hymnapp.backend.plist` | 行 backend（`node server.js`，port 3001） |
| `com.cloudflare.cloudflared.plist` | 行 tunnel（`cloudflared tunnel run hymn-api` → api.god-music.com） |

## 安裝
```bash
cp ops/launchd/*.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.hymnapp.backend.plist
launchctl load -w ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
launchctl list | grep -iE "cloudflare|hymnapp"   # 第 2 欄 exit code，0 = 正常
```
**唔使 sudo。**

## ⚠️ 兩個一定要知嘅坑
1. **backend plist 要自己 set `PATH`** —— launchd 預設 PATH 冇 `/opt/homebrew/bin`，
   但 backend 要 exec `yt-dlp`。唔 set 嘅話 server 開得成功但**每首歌都 resolve 唔到**（超難查）。
2. **`cloudflared service install` 整出嚟嗰個 plist 係壞嘅** —— 冇帶參數，
   淨行 `cloudflared` 會 exit 1 crash-loop，tunnel 永遠 530。一定要有 `tunnel run hymn-api`。
   再行一次 `service install` 會覆蓋返，要記得再加參數。

## ⚠️ LaunchAgent 係「登入後」行，唔係「開機即行」
部 Mac 重開後停喺登入畫面嘅話，兩個都唔會行。要真開機即行，就要開自動登入。

詳情見 `HANDOFF.md` →「七、開機自動啟動」。
