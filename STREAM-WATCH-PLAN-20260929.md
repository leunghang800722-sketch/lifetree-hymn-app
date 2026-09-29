# 串流自動修復「保護監察」規劃 2026-09-29

Eric 要求：長期監察 `stream-selfheal.sh` / `stream-status.sh` / `needsHuman` 健唔健康；**日常唔開新 Claude session**（之前 Dispatch 每幾個鐘開排程 task 問 status → session 太多、發熱）；只喺真係有事先通知人。
本文件只係規劃，未落實。

## 0. 現況（09-29 實查）
| 層 | 現有 | 開唔開 Claude session |
|---|---|---|
| 偵測 | launchd `com.hymnstream.healthcheck` 每 **30 分鐘**跑 `ops/lyrics/stream-healthcheck.sh`（Layer A 經 backend、Layer B 直打 googlevideo） | 唔開 |
| 自動修 | `ops/stream/stream-selfheal.sh`（換 yt-dlp 版 / 經 gate restart，有節流） | 唔開 |
| 讀狀態 | `ops/stream/stream-status.sh` → 一行 JSON + exit 0/1/2（`needsHuman`、`stale`、`summary`、403 率） | 唔開 |
| 通知 | ❌ 冇。而家靠 Dispatch 定時開 session 嚟問 | **呢度先係開 session 嘅源頭** |

結論：偵測同修復**本身已經係零 session 常駐排程**。缺嘅只係「有事先主動講」呢一環，同埋「監察自己死咗冇人知」。

## 1. 方案 A（建議）：純 shell 邊緣觸發通知，零 Claude session
新增一支 `ops/stream/stream-watch.sh`（~80 行），**掛喺現有 healthcheck tick 尾**（唔開新 launchd job → 唔使 Eric 再行 launchctl）：

1. 跑 `stream-status.sh`，攞 JSON + exit code。
2. 同上次狀態比（`~/.hymn-deploy/stream-watch-state.json`）：
   - **正常 → 有事**（exit≠0 / `needsHuman:true` / `stale:true`）：出警報。
   - **有事 → 正常**：出「已恢復」，清警報。
   - 冇變：乜都唔做（唔寫、唔通知）。
   - 有事持續：每 **6 小時**提醒一次（防洗版）。
3. 警報內容寫入 **`~/.hymn-deploy/STREAM-ALERT.md`**（存在 = 有事，唔存在 = 冇事），附診斷包：status JSON、`summary`、selfheal 最近 20 行、backend log 最近 30 條 `[stream]`/`[hls]`/`[resolve]` 錯誤、yt-dlp 現役/候選版本、403 率。**唔含任何密鑰。**
4. 同時 append 一行去 `docs/SUPERVISION-LOG.md`（沿用現有慣例，配對「⚠️ 警報 / ✅ 恢復」）。

資源：每 30 分鐘跑一次、每次 <1 秒 CPU、零常駐記憶體。

## 2. 通知渠道（出事嗰刻點樣「推」畀人）
| 渠道 | 成本 | Eric 喺邊度見到 | 要唔要 Eric 拍板 |
|---|---|---|---|
| **N1 警報檔** `STREAM-ALERT.md` | 零 | Dispatch／任何已開住嘅 session `ls` 一下就知（唔使開新 session、唔使 poll 我） | 唔使 |
| **N2 macOS 通知**（`osascript display notification`，系統內置） | 零 | Eric 坐喺 Mac 前面即見；通知中心留底 | 唔使 |
| **N3 手機推送**（ntfy.sh / Telegram bot / email 三揀一） | 細；要一個外部服務帳號 | Eric 唔喺 Mac 前面都收到 | **要**（對外發送；內容只會係「串流監察：需要人手，原因 X」一句，唔含歌庫/用戶資料） |
| N4 App 內 admin 提示（「我的」頁 admin chip 出紅點） | 中（要 backend 一條 route + OTA） | Eric 開 App 就見 | 要（UI 改動），建議第二期 |

建議：**N1 + N2 即做；N3 由 Eric 揀一種**（冇 N3 嘅話，Eric 唔喺 Mac 前面就要等佢返嚟先見到）。

## 3. 「監察自己死咗」點算（dead-man）
- `stream-status.sh` 已有 `stale`（healthcheck 超過 N 分鐘冇跑）——但如果成個 launchd job 死咗，冇人去跑 status。
- 補法：backend `/api/health` 加一欄 `streamWatchAgeMin`（讀 watch state 檔 mtime）。backend 本身係常駐 process，Dispatch 有需要時一個 `curl` 就知監察仲生唔生（唔使開 session）。
- 進階（可選，要拍板）：外部 dead-man（例如 healthchecks.io 免費版，watch 每 tick ping 一下，連續 2 小時冇 ping 就佢通知 Eric）。呢個係唯一可以捉到「成部 Mac 熄咗／斷網」嘅方法——本機任何方案都捉唔到自己斷電。

## 4. 如果要 AI 判斷（唔止讀 exit code）
**唔建議「keep 一個 session 長期存在」**，原因：
- 一個閒置 Claude session 常駐都要食幾百 MB 記憶體，context 會愈積愈長，desktop app 重開就冇；而 99% 時間佢冇嘢做。
- 真正需要智能診斷嘅時刻好少（09-05 至今 needsHuman 觸發次數 = 0）。

建議做法（按需，唔常駐）：
- **B1（建議）人手觸發**：警報檔已經附齊診斷包。Eric／Dispatch 見到警報，喺**現有**呢個 session 講一句「睇 STREAM-ALERT」，我讀個檔即診斷。零額外 session。
- **B2（可選）自動一次性診斷**：警報觸發時，watch script 起一個 headless `claude -p`（非互動、讀診斷包、寫 `STREAM-ALERT-DIAGNOSIS.md`、即刻退出），**每宗事故最多一次、每 24 小時最多一次**。只讀、唔准改 code/唔准部署。要 Eric 拍板（會用 API 額度；而且係自動起 process）。
- 兩者都唔會喺冇事嗰陣開任何 session。

## 5. 資源同複雜度
| 方案 | 日常 session | 日常 CPU | 工作量 | 部署 |
|---|---|---|---|---|
| A + N1 + N2 | **0** | 每 30 分鐘 <1 秒 | Sonnet 半日 + Opus 驗收（用假 state 檔做故障注入：正常→有事→持續→恢復、stale、節流） | 純加檔 + 改 healthcheck 尾一行；唔使 restart、唔使 launchctl |
| + §3 backend 欄 | 0 | 零 | +1 小時 | 一次 backend restart |
| + N3 手機推送 | 0 | 零 | +1–2 小時 | Eric 提供渠道（bot token / 電郵）放 `.env` |
| + B2 自動診斷 | 出事先 1 個、即用即棄 | 出事先有 | +半日 | Eric 拍板 |

## 6. 建議
1. 做 **A + N1 + N2 + §3 backend 欄**（全部本機、零 session、零對外）。
2. Eric 揀一種 **N3**（我建議 ntfy 或 Telegram，設定最簡單）——否則人唔喺 Mac 前面就收唔到。
3. AI 診斷用 **B1**（按需，用現有 session），唔常駐；B2 暫時唔做。
4. 落實後**停咗 Dispatch 嗰個定時問 status 嘅排程**——呢個先係 session 數同發熱嘅來源。
5. 流程照舊：Sonnet 執行 → Opus 驗收（故障注入）→ 報 Eric → 上線。

## 7. 要 Eric 答嘅三條
- Q1：手機推送要唔要？要嘅話揀 ntfy / Telegram / email。
- Q2：外部 dead-man（捉「成部 Mac 熄咗」）要唔要？
- Q3：自動一次性 AI 診斷（B2）要唔要，定係有事先人手叫我睇（B1）？
