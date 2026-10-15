# 串流警報手機推送 規劃 2026-10-15

背景：10-14 串流中斷 8.5 小時，監察層 11:27 已升級、Mac 通知彈咗兩次，Eric 唔喺 Mac 前面所以冇見到。Eric 10-15 拍板：**要加手機推送**（推翻 09-29「唔要」）。本文只係規劃，未落實。

## 0. 現有可用渠道（10-15 實查，只讀）
| 渠道 | 現況 | 備註 |
|---|---|---|
| **Telegram（經 openclaw gateway）** | 已連接、運作中（account `boaz`，3 小時前有出訊）；Eric 本人係 owner（`commands.ownerAllowFrom` = telegram:…504） | 即係 Dispatch 而家同 Eric 講嘢嗰條線。`openclaw message send --channel telegram --account boaz --target <chat id> -m "…"` 一句就出；有 `--dry-run` 可以零側效應測 |
| Discord（經 openclaw） | 已連接（bot @約拿） | 可做第二渠道 |
| WhatsApp（經 openclaw） | plugin 開住但 channel **停咗/斷線** | 要 Eric 重新 link，唔建議 |
| Twilio | backend 只有 Verify（OTP）服務，**冇** Messaging Service / 號碼 | 發自訂 SMS 要另買號碼 + 月費，唔建議 |
| App 內推送（expo-notifications） | App 冇裝呢個 module | 要出新 native build，係大工程，唔建議為此做 |
| ntfy.sh | 零帳號，Eric 裝 app 訂一個隨機 topic | 可行後備，但多一個 app、topic 靠保密 |
| iMessage（Mac Messages） | 要 Mac 上畀 osascript 自動化權限（要人喺 Mac 撳一下） | Eric 唔喺 Mac 前面做唔到 |

## 1. 建議方案：Telegram 經 openclaw gateway（A）
- `ops/stream/stream-watch.sh` 升級（寫警報檔 + Mac 通知）嗰一刻，**加一條** `notify_phone`：`/opt/homebrew/bin/openclaw message send --channel telegram --account boaz --target "<Eric chat id>" -m "<一句>"`，包 `wlib_capped` 30s；失敗（gateway 死/網絡）只記 log，**唔影響**警報檔同 Mac 通知（照舊做後備）。
- 發送時機（沿用現有狀態機，唔另加邏輯）：① 首次升級；② 持續未恢復每 **6 小時**重發；③ **恢復**一次（只有升級過先發）。即係一宗事故最多幾條，唔會洗版。
- 訊息內容（一句，唔含任何密鑰）：`🔴 Odely 串流中斷 <開始時間> 起，形態 <①/②/③>，自動修復 <已試/配額用晒>，需要你：<一句建議，例如「換 NordVPN server」>`；恢復：`✅ Odely 串流已恢復 <時間>（停咗 <n> 小時）`。
- 配置放 `~/.hymn-deploy/stream-notify.conf`（`PHONE_CHANNEL=telegram PHONE_ACCOUNT=boaz PHONE_TARGET=<id>`，600），script 讀；冇呢個檔 = 唔發（opt-in，同 `ai-on` 一樣）。**唔會**喺 repo 寫 Eric 嘅 chat id。
- 依賴：openclaw gateway 要生存（佢係常駐 launchd job，喺清理保護名單）。gateway 死咗嗰陣手機通知會失敗 → 有 Mac 通知後備 + log 一行。
- 測試：`--dry-run` 證明 payload；真發**一次**測試訊息（要 Eric 先 OK）。
- 工作量：Sonnet 半日 + Opus 驗收（含 launchd 等效 `cd / && env -i` 測 openclaw 搵得到、gateway 死時唔炸）。

## 2. 第二渠道（可選）
Discord（@約拿）做備份：Telegram 發送失敗先發 Discord。多 10 行。Eric 要先講佢 Discord 睇唔睇。

## 3. 一併做（同一單，唔涉 VPN）
10-14 事故揪出嘅自動修復改善，同手機通知一齊落：
- R1 selfheal / 規則診斷：backend log 近 30 分鐘有 `Sign in to confirm you're not a bot` / `LOGIN_REQUIRED` → 判「形態④ 出口 IP 被 bot-check」，**唔換 yt-dlp**、直接升級，訊息講明「要換 VPN server（Eric 自己做）」。
- R3 每 tick 記出口 IP（`curl -s ifconfig.me`，5s timeout，失敗記 `?`）落 `stream-health.log` 尾欄；IP 變咗 → SUPERVISION-LOG 一行 + 手機通知一句「出口 IP 由 A 變 B（Mac 重啟/VPN 重連？）」。
- R5 事故期間退避：healthcheck 連續 fail ≥2 時 Layer A/B 只探 1 首（唔係 3+3）；backend keep-warm 遇 bot-check 冷卻由 30 秒改 **指數退避最高 30 分鐘**（`resolveAudio.js` 一個常數 + 計數，要 backend restart）。
- R7 canary 告示：有健康警報時唔再寫「唔代表播歌有事」。
- 紅線不變：**唔掂 VPN／網絡／路由／Cloudflare**；唔改 healthcheck 探測判斷以外嘅嘢；唔自動換 server。

## 4. 要 Eric 拍板
1. **渠道**：A Telegram（建議，即係而家同 Dispatch 講嘢嗰個 bot）／Discord／ntfy／其他？
2. **收件人**：發去 Eric 同 Dispatch 嗰個私人對話（建議）定另開一個群？
3. **可唔可以真發一條測試訊息**（落實後 Opus 驗收要）？
4. §3 四項改善一齊做？（建議：一齊；其中 R5 keep-warm 退避要 backend restart）
5. 持續未恢復重發頻率：6 小時（現有）定改 2 小時？
