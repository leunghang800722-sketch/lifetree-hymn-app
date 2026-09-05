# W2 執行單 — resolve 失敗路徑 + 公開寫入面（C9 + C6）2026-09-06

規劃：Fable 5.1。執行：Sonnet 5。驗收：Opus 5。部署：Fable 經 gate（backend restart × 1；**執行者唔部署**）。
根源：`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C9、§C6、§W2、§2 D-8/D-9/D-10；`DEEP-AUDIT-1D-BACKEND-20260906.md` OTP-1/LOGIN-P2/SRV-2/SRV-5/F4；`DEEP-AUDIT-W1-OPUS-20260906.md` #4（XFF 繞過節流實證）。基準 HEAD `43589c7`。純 backend，唔使 OTA。

## 1. 範圍（四個 commit，次序固定）

### Commit A — C9：關 `youtube:player_client=tv` 策略（env flag）
| 項 | 具體 |
|---|---|
| A1 | `backend/lib/resolveAudio.js` STRATEGIES：`tv` 策略改為 **`RESOLVE_TV=1` 先加入**（預設唔加入）。code 保留，一個 env 回滾。`default` / `default-any` 不變、次序不變、`RESOLVE_PARALLEL` 不變 |
| A2 | 啟動時 log 一行 `[resolve] strategies=<名單>`，令 restart 後可以由 `/tmp/hymn_backend.log` 核實生效 |
| A3 | **唔改** client 側任何嘢；**唔改** timeout/retry 數字；D-9（`default-any`）保留唔郁 |

### Commit B — C6 第一步：純機械抽取 `backend/lib/rateLimit.js`
| 項 | 具體 |
|---|---|
| B1 | 新 `makeLimiter({ name, keyOf, max, windowMs, sweepAt = 5000, maxEntries = 5000 })` → `{ check(req) → boolean(limited), size(), reset() }`。內置 sweep-on-threshold + bounded Map（同 invites.js 範本一模一樣嘅語義：window 由第一擊起計、`count > max` 先 limited） |
| B2 | 現存節流全部改用佢：`routes/invites.js`（invite-check）、`routes/share.js`、`lib/loginRateLimit.js`（perIp 部分）、`routes/otpAuth.js`（`/otp/request` perIp/perPhone/global，**保留原 cooldown 語義**）、`routes/presence.js`（HEARTBEAT_RATE_MAX 300）、`routes/clientLog.js`（W1 嗰個，300）、stream 嗰個（如有）。**threshold / window 一個數字都唔准變**；每個 route 嘅 env override 名保留 |
| B3 | 對每個被替換嘅 limiter 出 harness：舊實作 vs 新實作，同一序列（同 IP 打 max+1、唔同 IP 各 1、過窗後再打）→ 逐次 limited 布林值序列**完全一致**（用 `git show 43589c7:<file>` 攞舊版做對照） |

### Commit C — C6 第二步：新 route 掛節流 + trust proxy + cors + internal
| 項 | 具體 |
|---|---|
| C1 | `/otp/verify` + `/otp/verify-ticket`：per-phone **10 分鐘 5 次錯**（只計錯，成功即 reset），錯滿回 429 + `retryAfterSec`；另加 per-IP 60/10 分鐘保底。用 B1 |
| C2 | `app.set('trust proxy', 1)`（cloudflared 一跳）+ `clientIp()` 改：優先 `cf-connecting-ip`，其次 `req.ip`（Express 經 trust proxy 解析後嘅），**唔再直接信 `x-forwarded-for` 原字串**。正控：假 XFF 打 20 次 `/api/client-log`（W1 Opus #4 NC-3b 個 case）要 429 仍生效；負控：真經 CF 路（`cf-connecting-ip` 唔同）唔准 429。**核所有 `req.ip` 用家**（grep）行為唔變 |
| C3 | `cors()` 改 allowlist：只放 `https://api.odemusics.com`、`https://odemusics.com`、`https://www.odemusics.com`；RN app 冇 Origin 照放行（`origin` undefined → allow）。**先 grep 所有 web 頁路由**（`/p/:token` 分享頁、admin 頁等）核唔會撻；harness 用 `Origin: https://evil.example` 打一個 GET 睇 header |
| C4 | `/api/internal/activity`：D-8 已核——唯一 caller `backend/scripts/growLibrary.js:112` 預設 `http://localhost:3001`；**再核** `~/Library/LaunchAgents/com.hymnapp.growlibrary.plist` 有冇設 `BACKEND_BASE` 指去 tunnel（只讀，唔改 plist）。冇嘅話加 localhost-only（`req.socket.remoteAddress` 係 `127.0.0.1`/`::1`/`::ffff:127.0.0.1` 先放行，否則 404），有嘅話寫低唔改 |
| C5 | 三個 per-user Map（1D ADM-1/FRIENDS-1/ME-1）加同款 bounded（`maxEntries` + sweep），唔改語義 |

### Commit D — D-10：密鑰搬 `.env`（只做 code 側，plist 改動留俾 Eric）
| 項 | 具體 |
|---|---|
| D1 | `backend/server.js` 最頂加一個極簡 `.env` loader（唔加依賴）：讀 `backend/.env`（如存在），`KEY=VALUE` 逐行，**已有 process.env 嘅唔覆蓋**（plist 值優先，過渡期兩邊並存唔會撞） |
| D2 | `backend/.env.example` 列出 key 名（JWT_SECRET / TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID / REGISTRATION_MODE，值留空）；`.gitignore` 加 `backend/.env`；**唔准將真值寫入任何會 commit 嘅檔** |
| D3 | 由 plist 抄真值出嚟建 `backend/.env`，`chmod 600`。plist 本身**唔改**——出一段俾 Eric 嘅指引（刪 plist 入面嗰五個 key + `launchctl bootout/bootstrap` 兩句）放入報告 §5，由 Fable 交 Dispatch |

### 唔包／紅線
- 🔴 唔掂任何 client 側 code；唔改 PlayerProvider/watchdog；唔改 resolve timeout。
- 🔴 B（抽取）同 C（新 route）分開 commit；B 嘅 harness 唔過就唔准去 C。
- 🔴 唔部署、唔 restart、唔 launchctl、唔改 plist、唔掂 Cloudflare。
- 唔起完整 `server.js` 打 prod 歌庫（harness 用 express 起 router 喺隨機 port）。scratch 唔准放 backend/（`backend/.env` 係例外——佢係運行時檔，要核 `ops/deploy/backend-restart.sh` 嘅髒檔檢查會唔會因為佢 fail：先 `--dry-run` 睇，會 fail 就將 `.env` 加入 script 嘅運行時白名單，呢個改動單獨一個 commit 並寫明）。

## 2. 驗證證據表（執行者唔判）
| 項 | 證據 |
|---|---|
| H-A | import `resolveAudio.js` 喺 `RESOLVE_TV` 未設/=1 兩種情況，dump STRATEGIES 名單；`node --check` |
| H-B | 每個 limiter 舊 vs 新 布林序列逐位相同（列出序列）；harness 命令原文 |
| H-C1 | 同一 phone 打 6 次錯 verify → 第 6 次 429；成功一次後 counter 歸零；20 個唔同 phone 各 1 次全通 |
| H-C2 | 假 XFF 20 個唔同值同一 socket 打 `/api/client-log` 301 次 → 第 301 條 429（W1 Opus NC-3b 反轉）；`cf-connecting-ip` 20 個唔同值各 10 條全 204 |
| H-C3 | `Origin: https://evil.example` → 無 `Access-Control-Allow-Origin`；`Origin: https://odemusics.com` → 有；無 Origin → 200 照答 |
| H-C4 | growlibrary plist BACKEND_BASE 核實結果；harness 由 `127.0.0.1` 打 200、由 `X-Forwarded-For` 假裝外部照 200（因為 socket 仍係本機——寫低呢個限制）；如有法模擬非 loopback socket 就做 404 正控 |
| H-D | `.env` 唔存在/存在/同 process.env 撞三種情況嘅 loader 行為；`git check-ignore backend/.env` 要命中；`ls -l backend/.env` 600；`backend-restart.sh --dry-run` 結果 |
| 全部 | `node --check` 所有改動檔；逐個 module `import()`（唔 import server.js） |

## 3. 交付
四個 pathspec commit（A/B/C/D）+ 報告 `DEEP-AUDIT-W2-REPORT-20260906.md`（範圍→檔:行→證據表→before 數字出處（V-5 表、1E §5）→未做項→俾 Eric 嘅 plist 指引）。訊息尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。唔准 `git add -A`。
