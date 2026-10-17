# 串流事故獨立覆核 2026-10-14（Opus，純只讀）

覆核時間 19:13 HKT。只讀 log / plist 非 secret key / code；只打過一次 `GET /api/health`（200 `{"status":"ok"}`）；冇打 YouTube/googlevideo，冇改任何嘢。

## 判詞
**根因 = 重啟後 NordVPN 自動重連（target 只係 `country:us`，冇鎖 server）→ 新出口 IP 喺 YouTube player API 層被 bot-check（LOGIN_REQUIRED）。把握 ~90%。**
yt-dlp 版本、cloudflared、backend 自身、Eric 部機都可以排除；剩低 ~10% 係「YouTube 同日全球收緊」，無法喺唔打 YouTube 嘅前提下完全排除（但時間點同重啟精確重合，可能性低）。

## (a) 時間線（HKT，log 獨立重建）
| 時間 | 事件 | 來源 |
|---|---|---|
| 10-13 至 10-14 09:58 | 舊 IP 下 Layer A 一直 3/3；Layer B 長期間歇 1/3 403（慢性，非今次） | stream-health.log |
| 05:30 | nightly `2026.10.10` canary **PASS**（舊 IP） | SUPERVISION-LOG |
| 09:27 | B 2/3 403（典型間歇），09:58 全恢復 ok=3 mid=3 ← **最後一次全綠** | stream-health.log |
| 10:26–10:27 | Mac 重啟；tinyproxy 958 / backend 962 / cloudflared 973 全部 `10:27:27` 起 | ps lstart、uptime 8:46 |
| 10:27:3x | backend 開機 precache 第一首 `tPf7Ig1ebL4` 已經 `Sign in to confirm you're not a bot`（log 第 13 行） ← **第一條 bot-check，喺任何 healthcheck 之前** | /tmp/hymn_backend.log |
| 10:28 | 正常 tick 缺（重啟中） | — |
| 10:57 | 第一個 tick 兩層 fail；`[stream]` 第一條 502（id=77、id=5431 cold） | 兩份 log |
| 11:27 | nightly 10.10 canary **FAIL**（同一版本 05:30 PASS）→ selfheal「冇候選」→ ③ → AI escalate | ytdlp-update / selfheal log |
| 18:47–18:58 | Eric iPhone：之前播 `source=local` 嘅歌冇事；隊列行到冇本地檔嘅 5154/91 → `/api/stream` 502 ×7 → 18:58:57 `PlaybackError hid=5154 willRetry=false` | backend log |
| 19:00 | 連續 17 tick fail | stream-health.log |

排除其他解釋：
- **yt-dlp 版本**：同一個 `2026.10.10` 05:30 過、11:27 唔過，中間只變咗網絡；而且兩個 slot 都 LOGIN_REQUIRED。排除。
- **cloudflared**：`/api/health` 200、Eric 請求有到 backend（UA=Odely/AppleCoreMedia），502 係 backend resolve 失敗出嘅。排除。
- **backend 自身**：health 200，失敗全部係 yt-dlp stderr bot-check。排除。
- **YouTube 全球改動**：唔打 YouTube 驗唔到；但第一條 bot-check 喺重啟後幾秒、重啟前 31 分鐘全綠，時間重合度極高。低可能。
- 旁證：重啟前已存喺 disk resolve-cache 嘅 id=42 URL，10:57/11:27/11:58 仲係 206（ttfb 2.3s＝真係去咗上游）⇒ googlevideo 媒體層未必封新 IP，封嘅係 **player/innertube resolve 層**。（只有一首樣本，當旁證。）
- NordVPN plist（非 secret key）：`isAutoConnectOn=1`、`preferredLocationConnectionTarget wireguard_udp = country:us:-:-:-`（**冇指定 server**）、`lastServerDownloadTimeKey=2026-10-14 10:51:28Z`、`hadConnectionIssues=1`。`lastConnectionDate` 停喺 10-09 08:57Z（自動重連似乎唔更新呢個 key，唔可以用嚟定今日重連時間）。
- 舊出口 IP：log 入面**冇**記重啟前一刻嘅 IP（stream-health / selfheal 都冇寫 IP）。歷史記錄有 `185.219.141.201/.202`（PacketHub Seattle）、`187.15.89.159`（Datacamp）。新 IP `187.15.92.249` 我冇獨立驗（冇打外部服務），沿用協調者數字。

協調者結論修正：
1. 第 4 點「selfheal 11:27 換 yt-dlp、canary fail 回滾」**唔準確**：selfheal log 係 `ytdlp-no-candidate before=after=ytdlp-venv-a`，**根本冇換過**（候選 canary 唔過所以冇得換），之後係 safety valve。
2. 第 3 點 466 次 bot-check 唔係 healthcheck 主導（見 d）。
3. 「中途停」嘅機制：Eric 前面幾首係本地檔（`nextTrackMs source=local`），所以聽落「播播下先停」，其實係隊列第一首需要串流嘅歌就死。

## (b) 「換 NordVPN server 就好返」把握
- **~75–80%**。理據：同一 binary 喺舊 IP 05:30 過；歷史上 IP 換返去都好返（10-09 事故自己好返）。風險：同一 PacketHub/Datacamp 機房段可能成段被標記，換 server 有機會要試兩三個；要揀**唔同 /24 甚至唔同城市**嘅 US server。
- **唔使 Eric 掂 VPN 嘅出路：冇現成可用。**
  - backend `server.js` 冇任何 `--proxy` / cookies 機制。
  - tinyproxy（:8888）係**入站** HTTP proxy，自己出口一樣行 VPN，同一個 IP，救唔到；DEEP-AUDIT-1C 亦記錄佢冇實際用途。
  - cookies 被禁止（亦有帳號被封風險），唔建議。
  - 唯一「唔掂 VPN」嘅係等 YouTube 自己解封（可能數小時至數日，冇把握）。
- 側發現（安全）：tinyproxy `Allow 0.0.0.0/0` + listen `*:8888`（IPv4+IPv6）＝局域網內任何人都用得做 open proxy。今次唔關事，但建議收窄做 `Allow 127.0.0.1` 或停用（交 Eric 拍板，我冇改）。

## (c) 自動修復層表現 + 改善建議（唔實作）
問題：
1. **形態判定錯**：`stream-selfheal.sh:14/327` 純睇 `midfail>=2` 就判 ①yt-dlp（1MiB 病），但今次 midfail 係 `resolve-fail`（連 URL 都攞唔到），唔係 403@2MiB。resolve-fail 同 403 被當同一類。實害細（冇候選所以冇換），但 SUPERVISION-LOG 第一句建議係「先查 yt-dlp 版本」，誤導人手。
2. **AI escalate reason**：verdict（escalate）正確，reason 「resolve 全 fail、backend 健康、yt-dlp 候選未過 canary」**事實啱但冇點出 bot-check/IP**——backend log 明明有 466 條 `not a bot`，診斷冇讀 stderr 關鍵字。
3. **canary 告示誤導**：11:27「唔代表而家播歌有事」——當時全庫已經播唔到。
4. **通知渠道**：只得 `osascript display notification`（Mac 本機 banner），Eric 唔喺 Mac 前就等於冇。
5. **冇「重啟/IP 變更」偵測**：重啟後冇任何嘢比較出口 IP。

建議清單：
- R1 selfheal/diagnose 加規則：backend log 近 N 分鐘 `Sign in to confirm you're not a bot` / `LOGIN_REQUIRED` 佔 resolve 失敗 >50% ⇒ 新形態「④出口 IP 被 bot-check」，**唔試 yt-dlp swap**，直接升級並講明「要換 VPN server」。
- R2 healthcheck Layer B 分開記 `resolve-fail` 同 `403`，形態①只認 `403/302@2MiB`。
- R3 每 tick 記出口 IP（查一個中立 IP echo 服務，或讀 VPN 狀態），IP 變咗即寫 SUPERVISION-LOG + 觸發一次額外檢查。
- R4 通知加一條 Eric 手機會見到嘅渠道（例如已有嘅 Dispatch/訊息路徑），escalate 先發、之後每 2–3 小時重發。
- R5 事故期（bot-check 形態）：healthcheck 由 30 分鐘降到 60–90 分鐘，**但保留**，因為佢只係 3 首、佔比細；真正要減嘅係 keep-warm（見 d）。
- R6 HANDOFF §2.2 建議落實：NordVPN 鎖死一個已知好嘅 server，或買 Dedicated IP；同時考慮把 auto-connect target 由 `country:us` 改做指定 server（Eric 手動，喺 NordVPN App 入面）。
- R7 canary 告示文案：如果同時有 health 警報，唔好講「唔代表而家播歌有事」。

## (d) 466 次 bot-check 來源分佈
（backend log 失敗行冇 caller tag，以下係由時間分佈 + code 推斷，標明係推斷）
- 逐小時（UTC）：02 時 39、03 時 78、04 時 80、05 時 77、06–08 時各約 60、09 時 2、10 時 10（共 466；另 2 條喺 precache 段）。
- 開機 precache（200 首）：**只得 2 條** bot-check，其餘被 backend 嘅 30 秒全局冷卻跳過（log 有 298 條「冷卻中…跳過」）。
- healthcheck：每 tick 約 5 個 cold resolve（A 2–3 + B 3），17 tick ≈ **~60–85**。
- App 真播放（Eric）：18:47–18:58 共 3 個 cold resolve ⇒ **~3**。
- warm/prefetch：`[warm]` 4 次 client=3，大部分命中冷卻或已計入 stream 502，**個位數**。
- keeper：日間停（19:00 前），今日 0。
- **餘下 ~370 條（約 80%）= backend 背景 keep-warm**：`startKeepWarm`（每分鐘 1 首，07:00–23:59，上限 800/日）+ `warmColdBacklog`（每 90 秒 1 首，上限 150/日）。每次 bot-check 只觸發 30 秒冷卻，冷卻過後又再試，所以穩定 60–80 次/小時。09–10 時（UTC）跌到 2/10 係因為 Eric 18:47 起播緊（`anyStreaming()` 令 keep-warm 停）。
- 判斷：繼續每分鐘打一次 bot-check 端點，**有合理機會延長同一 IP 嘅信譽懲罰**（YouTube 對持續被擋仲重試嘅 IP 一般唔會快速解封），而且對換 server 之前完全冇益處。建議（交協調者/Eric 拍板，要 restart 先生效，我冇做）：事故期 `URL_KEEPWARM=0`，或者 code 層加「bot-check 冷卻指數退避（30s→5min→30min）」。如果 Eric 好快換 server，呢點就唔急。

## Eric 要做嘅一步
喺 Mac 嘅 NordVPN App **手動連去另一個 US server（最好唔同城市）**，然後等下一個 healthcheck tick（或叫協調者幫手睇 `/api/health` + 下一行 stream-health.log）。好返之後，考慮鎖死嗰個 server / 開 Dedicated IP。

## 側效應（如實）
- 寫咗呢個檔（唯一寫入）。
- 打咗 1 次 `GET http://localhost:3001/api/health`。
- 讀咗 NordVPN plist，只 grep 非 secret key（server/connect/time 類），冇讀 token。
- 冇打 YouTube/googlevideo，冇查外部 IP 服務，冇改網絡/VPN/code/launchd，冇 kill。
