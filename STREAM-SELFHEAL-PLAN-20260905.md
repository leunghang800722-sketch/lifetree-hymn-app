# 串流自動健康檢查 + 自動修復規劃 2026-09-05

Eric 問：「YouTube 改版令全部歌 load 唔到嗰單之後，而家有冇自動機制每日 check、一有問題就修？」

## 1. 現狀（Fable 5.1 2026-09-05 查證）

| 環節 | 有冇 | 實際表現 |
|---|---|---|
| **偵測** | ✅ `com.hymnstream.healthcheck` 每 3 小時跑 `ops/lyrics/stream-healthcheck.sh`：Layer A 經 backend 攞頭 64KB ×3 首；Layer B 用現役 yt-dlp resolve 後**直打 googlevideo 攞 2MiB 位置**（正正係 8-22 病灶）；兩層各要 ≥2/3 過 | 8-22 落地至今 100+ 次 tick；**真係捉到** 8-28/8-29 零星失敗同 8-30 一單 5 小時斷播（16:39 首次 fail → 21:37 恢復） |
| **警報** | ⚠️ 只寫落 `docs/SUPERVISION-LOG.md` 一段文字 | 8-30 嗰次歌詞線 session 讀到警報但「唔喺權限內」冇動；**Eric 冇收到任何通知**，斷播 5 小時靠 YouTube 自己好返 |
| **yt-dlp 更新** | ✅ `com.hymnstream.ytdlpupdate` 每日 05:30 裝最新 nightly 落閒置 slot + 三關 canary（版本 / 兩首 resolve / 2MiB mid-range 206） | **但 Eric 8-22 拍板「保守：canary 過都唔自動換」**。結果：新版 `2026.08.30` 由 8-31 起連續 6 日 canary 全過，現役仍係 `2026.08.20`（16 日前），冇人 `--apply` |
| **自動修復** | ❌ 冇 | 出事時要人手：①睇到警報 ②判斷係 yt-dlp 定 backend 定 YouTube ③行 `update-ytdlp.sh --apply` 或 restart |

**一句答 Eric：** 有「每 3 小時自動 check」，冇「一有問題就自動修」，警報亦冇人收得到。8-22 嗰類病（舊 yt-dlp 簽名 URL 1MiB 後 403）而家會被偵測到，但修復仍然要人手，而且最快 3 小時後先知。

## 2. 三種故障形態（由歷史 log 歸納）同各自嘅自動修法
| 形態 | 指紋 | 根因 | 自動修法 |
|---|---|---|---|
| ① yt-dlp 太舊（8-18 / 8-19 / 8-22） | Layer A 過、Layer B 2MiB 位 403（或 resolve 全 fail 而閒置 slot 新版 canary 過） | YouTube 改 player，舊版簽嘅 URL 唔完整 | **揈 symlink 去已 canary 通過嘅新版**（`update-ytdlp.sh --apply` 已有；唔使 restart，每次 resolve 都新 spawn） |
| ② backend 側（process 死 / 卡 / 502） | Layer A 全 000/502、Layer B 直打 googlevideo 正常 | node process 問題 | **重開 backend**——同一份已批准 code，經現有 `ops/deploy/backend-restart.sh`（HEAD==approved sha 時 gate 會過；session 內 guard 亦規定 restart 只准經呢條路） |
| ③ YouTube 側暫時封鎖（8-30） | 兩層都 fail，新舊 yt-dlp 都 resolve 唔到 | 出口 IP 被 bot-check / 429 | 冇得自動修：**警報 Eric + 每 30 分鐘重試 + 恢復時再報**（8-30 就係咁自己好返） |

## 3. 方案（三件事）
**S1 偵測加密**：3 小時 → **30 分鐘**（每 tick 3 個 curl + 3 個 resolve，對 YouTube 負擔可忽略；連續 2 次 fail 先觸發修復 = 最遲 1 小時內動手，vs 而家最快 3 小時先知、冇人修）。

**S2 自動修復梯（新 script `ops/stream/stream-selfheal.sh`，由 healthcheck 判 unhealthy 時呼叫）**
1. 連續 2 次 unhealthy 先動手（單次 fail 容忍，避免誤修）。
2. 形態 ① → 若閒置 slot 有 canary-PASS 嘅新版：`update-ytdlp.sh --apply` → 即刻重跑 healthcheck → 過 = 修復完成（記錄 + 通知）；唔過 = **自動揈返舊版**（rollback 一句 symlink）→ 升級為 ③ 處理。
3. 形態 ② → 經 `backend-restart.sh` 重開（HEAD 必須仍等於已批准 sha；如果有其他 session 未批准嘅 commit 令 gate 唔過，就唔自動重開、改為警報）→ 等 15 秒重跑 healthcheck → 過 = 完成；唔過 → ③。
4. 形態 ③ → 通知 Eric（講明「YouTube 側，已試過 X，每 30 分鐘自動重試」）；恢復時再通知一次。
5. 安全閥：同一日最多自動換 yt-dlp 1 次、自動重開 backend 2 次；超過就只警報唔再動手（防止 flapping）。所有動作寫 `backend/data/stream-selfheal.log` + SUPERVISION-LOG。

**S3 通知真係到 Eric 手**：警報唔可以只寫 markdown。要揀一條渠道（見 §4 Q2）。

**唔改嘅**：daily canary 照舊 05:30；deploy gate 唔碰；backend code 零改動（全部係 ops script + launchd plist）。

## 4. 要 Eric 拍板
- **Q1 自動換 yt-dlp 政策**（會推翻 8-22「保守」決定）：
  - (a) **只喺壞咗先自動換**（canary 過 + 健康檢查連續 fail 先揈 symlink；平時唔郁）— 建議
  - (b) (a) + 平時 canary 過後 soak 24 小時就自動換（永遠跟住最新 nightly，可能引入 nightly regression）
  - (c) 維持人手 `--apply`（即係唔算「自動修」）
- **Q2 警報渠道**：Eric 平時經 Dispatch 收訊息——自動 script 可唔可以經 openclaw gateway 直接送一句去 Eric 嘅 chat？（要 Dispatch 話我知有冇呢個 hook / 用邊個命令）如果冇，退而求其次：macOS 通知 + SUPERVISION-LOG 頂部置頂「🔴 現正斷播」行。
- **Q3 自動重開 backend 授權**：形態 ② 由 script 經 gate 自動重開（會打斷嗰刻正在播嘅歌，但嗰刻已經係「全庫播唔到」）— 建議准。
- **Q4 即刻要做嘅一件事**：現役 yt-dlp `2026.08.20` 已 16 日舊、新版 canary 連過 6 日——批唔批我而家先人手 `--apply` 一次（rollback 一句 symlink、唔使 restart）？

## 5. 執行分工（拍板後）
Sonnet 5：改 plist 間隔、寫 selfheal script（含 dry-run + 三形態 harness：指去死 port / 換去無效 video id / 假 canary slot）、通知 hook；Opus 5 驗收：三形態各觸發一次真實路徑（用 env override 唔碰 production）+ flapping 安全閥 + rollback 路徑；Fable 5.1 收貨。預計半日。
