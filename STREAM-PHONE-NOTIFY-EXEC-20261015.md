# 執行單：串流警報 Telegram 推送 + 10-14 事故四項改善 2026-10-15

規劃 `STREAM-PHONE-NOTIFY-PLAN-20261015.md`。Eric 拍板：Telegram、發去佢同 Dispatch 嘅私人對話、准發一條測試訊息、四項改善一齊做、重發 6 小時。
流程：Sonnet 執行 → Opus 驗收（含 `cd / && env -i` 排程等效、gateway 死唔炸）→ Fable 部署（backend 一項要 gate restart）→ 真發一條測試訊息 → 報 Dispatch。基準 HEAD `8064cfd`。

## 0. 紅線
- 🔴 **唔掂 VPN／網絡／路由／Cloudflare／openclaw 設定**（`~/.openclaw/*` 一個字唔准讀寫；Eric chat id 已由 Fable 寫入 `~/.hymn-deploy/stream-notify.conf`，script 只讀呢個檔，**唔准印出 PHONE_TARGET 值**，log/報告一律遮成 `<target>`）。
- 🔴 **唔准真發 Telegram**：測試一律 `--dry-run`（openclaw 支援）或 stub；真發一次由 Fable 喺 Opus 驗收後做。
- 🔴 唔自動換 server、唔改 selfheal 修復梯／配額（只加形態④判定 + 退避）、唔改 healthcheck 探測判斷（只加出口 IP 記錄 + 事故期間少探）。
- 照舊：prod 零寫入（testlib 快照）、`STREAM_WATCH_TEST=1` 三 env 齊、唔 restart/launchctl/approve/OTA/swap/drill/真模型/YouTube；git 只 pathspec；bash；`bash -n`；只出證據。

## 1. Telegram 推送（`ops/stream/stream-watch.sh` + `stream-watch-lib.sh`）
1. lib 加 `wlib_notify_phone "<text>"`：讀 `$WATCH_DIR/stream-notify.conf`（prod = 真 home；測試模式 = scratch WATCH_DIR；檔唔存在/缺欄 → 靜靜 return 1）；行 `wlib_capped 30 /opt/homebrew/bin/openclaw message send --channel "$PHONE_CHANNEL" --account "$PHONE_ACCOUNT" --target "$PHONE_TARGET" -m "$text"`（測試模式/`WATCH_PHONE_CMD` override 時用 stub；`PHONE_DRY_RUN=1` 加 `--dry-run`）；rc≠0 只寫一行 `stream-notify.log`（遮 target），**唔准**令 watch 非零 exit；文字先過 `wlib_filter` + strip 控制字元，≤400 字。
2. 接線（唔改狀態機轉移）：`do_escalate` 首次升級 → 發 🔴；已升級且距上次 ≥ `PHONE_RENOTIFY_SEC`（conf，預設 21600）→ 重發（同現有 Mac 通知 6h 節流共用計時）；恢復且曾升級 → 發 ✅。訊息格式照規劃 §1（含開始時間、形態、自動修復做過乜、建議人手一步；恢復含停咗幾小時）。
3. Mac 通知、警報檔照舊。`stream-notify.log` 記每次嘗試（時間、類型、rc、耗時）。
4. README 加「手機推送」一節（conf 格式、點停：刪 conf）。

## 2. 四項改善
- **R1 形態④（`stream-selfheal.sh` + `stream-diagnose-rules.sh`）**：判形態前先查 `/tmp/hymn_backend.log` 最近 30 分鐘有冇 `Sign in to confirm you.re not a bot|LOGIN_REQUIRED|bot-check 偵測到`（≥3 條）→ 形態④「出口 IP 被 bot-check」：**唔行 apply/swap/restart**、唔食配額、alert 訊息寫明「換 yt-dlp 無用；要人手換 VPN server（Eric 自己做）」；規則診斷同樣出 `escalate "出口 IP 被 YouTube bot-check…"`。測試模式 backend log 路徑可 override（`HC_BACKEND_LOG`/已有 `BACKEND_LOG`）。
- **R3 出口 IP（`stream-healthcheck.sh`）**：每 tick `curl -s -m 5 https://ifconfig.me`（失敗記 `?`；測試模式用 stub/`HC_IP_CMD`），寫入 `stream-health.log` 尾欄 `ip=<x>`，並存 `backend/data/stream-health-state.json` `exitIp`；IP 由 A 變 B（兩邊都非 `?`）→ SUPERVISION-LOG 一行 ℹ️ + watch 側收到 `ipChanged` 旗（state 檔）→ 手機通知一句「出口 IP 由 A 變 B（Mac 重啟/VPN 重連？），下個 tick 會驗串流」。首次記錄唔算變。
- **R5 退避**：(a) healthcheck `consecutiveFail ≥ 2` 時 Layer A/B 各只探 1 首（判斷邏輯不變，只係樣本少）；(b) `backend/lib/resolveAudio.js` bot-check 冷卻由固定 30s 改**指數退避**：連續 bot-check 次數 n → `min(30s × 2^(n-1), 30min)`，任何一次 resolve 成功歸零；log 一行 `冷卻 <秒>（第 n 次）`；加 opsMetrics 計數（如有現成 pattern）。唔改其他 resolve 邏輯。
- **R7**：`ops/ytdlp/update-ytdlp.sh` canary 告示：若 `backend/data/stream-health-state.json` `consecutiveFail ≥ 2` 就唔寫「唔代表而家播歌有事」，改寫「⚠️ 而家串流健康檢查正在失敗」。

## 3. 驗證
| 項 | 證據 |
|---|---|
| P1 | watch 狀態機 T1 劇本加手機 stub：首次升級 1 條 🔴、6h 內 0、6h 後 1、恢復 1 ✅；診斷後下一 tick 即 ok → 0 條；conf 缺 → 0 條且 watch rc=0 |
| P2 | stub 模擬 openclaw 失敗（exit 1 / hang 60s）→ watch rc=0、Mac 通知同警報檔照出、notify.log 有一行、耗時 ≤ cap |
| P3 | `cd / && env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`（launchd 等效）下 `wlib_notify_phone` 用 **真 openclaw 二進位 + `--dry-run`**（真 conf 可用但 target 遮罩輸出）→ payload JSON 正確（`to: telegram:<target>`） |
| P4 | 文字過濾：含 JWT/`$()`/U+202E 嘅 reason → 遮/剷；長度截 400 |
| P5 | R1：fixture backend log 含 5 條 bot-check → selfheal 判形態④、零 apply/restart、alert 訊息含「VPN」；規則診斎 escalate；負控：冇 bot-check 行 → 形態①照舊 |
| P6 | R3：stub IP A→A（唔觸發）→B（觸發：log 欄、SUPERVISION ℹ️、watch 旗、手機 stub 1 條）→`?`（唔觸發） |
| P7 | R5(a)：state 種 consecutiveFail=2 → healthcheck 只探 1+1；(b) harness（babel 真 module）連續 bot-check 1..6 次冷卻 30/60/120/…/1800s，成功後歸零 |
| P8 | R7 兩個 fixture |
| P9 | 回歸 t1–t13 全 `PROD-SNAPSHOT OK`；`bash -n`；`node --check` resolveAudio.js；`backend-restart.sh --dry-run`（預期 gate 攔，照錄） |

## 4. 交付
Commit：ops/stream+ops/lyrics/healthcheck+ops/ytdlp 一個；backend/lib/resolveAudio.js 一個；test+報告 `STREAM-PHONE-NOTIFY-REPORT-20261015.md` 一個。唔部署、唔真發。
