# 執行單：改密碼即令舊 token 失效（Part A）+ 自動 restart 真演習入口（Part B）2026-09-29

Eric 09-29 拍板：A 而家補做；B 批准真演習；OTA 今輪唔推（App 端改動留俾下次一次過推）。
流程：Fable 規劃 → Sonnet 執行（A、B 兩個執行者並行，檔案唔重疊）→ Opus 驗收 → Fable 經 gate 部署 + 做演習 → Opus 驗收。基準 HEAD `fda1d38`。
背景：`DEPLOY-PRECHECK-OPUS-20260929.md` 發現 1；`DEPLOY-POSTCHECK2-OPUS-20260929.md`「剩餘不確定性」。

## 共同紅線
- 唔部署、唔 restart（只 `--dry-run`）、唔 launchctl、唔 approve.sh、唔 OTA/eas、唔 swap yt-dlp、唔打 YouTube/googlevideo、唔掂 Cloudflare/tunnel/VPN。
- 唔讀 `.env`/plist secret/keychain/token/prod `users.db`；測試用 scratch db + 自己生成嘅 JWT secret。
- 唔寫 prod 檔（`~/.hymn-deploy/*`、`backend/*.db`、`backend/data/*`、`docs/SUPERVISION-LOG.md`）。唔准建立 `stream-drill.request`。
- scratch/harness 唔准放 `backend/` 下（會撞 deploy gate）；放 `ops/…/test/` 或 scratchpad。
- 唔准 kill 唔係自己親手起嘅 process（核 PID+lstart+PPID，唔准 pattern kill）。
- Git：只准 `git add -- <路徑>` + `git commit -- <pathspec>`；唔准 add -A/stash/clean/reset/push。共用 worktree，唔好掂人哋未 commit 嘅檔（`backend/data/worshipGroups.js`、`ops/stream/stream-status.sh` 等）。
- 只出證據，唔判 PASS/FAIL；冇做到嘅明寫。

## Part A：token 撤銷（backend + App 端，App 端只 commit 唔出街）

### A1 backend
1. `backend/lib/userDb.js`：`ALTER TABLE users ADD COLUMN token_valid_after INTEGER`（同現有 migration 寫法一致，try/catch）。NULL = 冇限制（舊用戶零影響）。
2. 新 `backend/lib/tokenValidity.js`：`isTokenRevoked(decoded, userRow)` → `userRow.token_valid_after != null && (typeof decoded.iat !== 'number' || decoded.iat < userRow.token_valid_after)`；`markTokensRevoked(db, userId)` → 寫 `Math.floor(Date.now()/1000)`，回傳該值。
3. **所有**驗 user JWT 嘅位都要查：`lib/requireAuth.js`、`routes/auth.js` `/api/auth/me`、`routes/presence.js`（自己 verify 嗰段）、其他任何 `jwt.verify` 攞 `decoded.id` 嘅位（自己 grep 齊，報告列清單；OTP ticket `purpose:'phone_verified'` 唔關事）。被撤銷 → 同現有 401 行為一致（`{error:'unauthorized'}`；presence 跟佢原本對無效 token 嘅處理）。
4. `routes/otpAuth.js` `/api/auth/reset-password`：更新 `password_hash` **同一個流程內** `markTokensRevoked`，然後先簽新 token（新 token `iat` ≥ 該值 → 做 reset 嗰部機即刻有效）。核實 sql.js 寫入有經現有 persist/save 路徑（同 `password_hash` 更新一樣）。
5. 找齊其他改 `password_hash` 嘅路徑（如有 change-password）一樣處理；冇就報告寫「只有 reset-password」。
6. 唔改 token 壽命、唔改 login/renew 簽發內容（renew 經 requireAuth 自然受保護）、唔加 rate limit（另案）。
7. 時鐘同秒邊界：同一秒簽發嘅舊 token 會通過（`<` 而唔係 `<=`）——可接受，報告寫明。

### A2 App 端（`frontend/hymn-app`，只 commit）
- 核實 reset-password 成功後 App 有冇儲返 response 嘅新 token（應該有，行登入流程）。冇就補。
- 其他裝置收到 401 嘅處理已喺 `56b0f93`（未出街）——確認撤銷造成嘅 401 行同一條「登入已過期」路徑，唔使新文案。
- **舊 bundle 兼容**（現時出街嘅 App 冇 401 處理）：報告要講清楚，backend 先上、App 未 OTA 期間，其他裝置被撤銷後會係乜行為（預期 = 同 token 自然過期一樣靜靜失敗直到重新登入）。

### A3 驗證
隔離 harness（scratch，隨機 port，掛真 auth/otpAuth router + requireAuth；OTP/Twilio 用 stub 或直接簽 ticket）：
| 項 | 證據 |
|---|---|
| A-1 | 舊用戶 `token_valid_after` NULL：現有 token 照 200（me/renew/一條 requireAuth route/presence） |
| A-2 | reset-password 後：舊 token 喺上面**每一個**入口都 401；response 新 token 全部 200 |
| A-3 | 舊 token 打 renew → 401（續唔到） |
| A-4 | 冇 `iat` 嘅偽造 token（用測試 secret 簽）喺有 `token_valid_after` 嘅用戶 → 401 |
| A-5 | migration：喺冇該欄嘅舊 schema db 副本上起 → 欄加到、重起唔報錯 |
| A-6 | reset 後重新 load db（模擬 restart）撤銷仍然生效（有落盤） |
| A-7 | `node --check` 全部改動檔；`ops/deploy/backend-restart.sh --dry-run` 輸出（預期 gate 因新 commit 攔，屬正常，照錄） |

### A4 交付
Commit：backend 一個、frontend 一個（如有改）、harness（`ops/auth/test/`）+ 報告 `TOKEN-REVOKE-REPORT-20260929.md` 一個。

## Part B：演習入口（`ops/stream/`）

目的：喺**真 launchd context**（healthcheck tick 內）行一次真 `backend-restart.sh --same-code`，驗最後一步 `launchctl bootout/bootstrap gui/$UID` 喺 agent context 得唔得。

1. `stream-remedy.sh` 新 action `drill-restart`（冇參數）：
   - 前置：`$WATCH_DIR/stream-drill.inflight` 存在而且 mtime < 10 分鐘，否則 exit 2；一開始就刪走（一次性）。
   - 自己配額 `drills` 每日 ≤1（state 檔同一份，唔食 `restarts` 配額，亦唔受 `restarts` 配額影響）。
   - 行同 `restart-backend` 完全相同嘅 `RESTART_CMD`（prod = `--same-code`；測試模式自動 `--dry-run`）；gate 攔 → 回報、**唔重試、唔繞**。
   - 成功後等 10 秒打 `GET $BASE/api/health`，記 http code + 新 backend PID/lstart（`pgrep`/`ps` 只讀）。
   - 輸出同 log 記：cwd、PATH、`id -u`、launchd 判別（`$XPC_SERVICE_NAME`、PPID）、restart rc、耗時、health。
   - **唔入** AI prompt 嘅動作清單；`REMEDY_ENGINE=ai` 時一律 exit 2。
2. `stream-watch.sh`：tick 開頭（攞到 lock 之後、狀態機之前）如果 `$WATCH_DIR/stream-drill.request` 存在：`mv` 去 `stream-drill.inflight` → call `stream-remedy.sh drill-restart`（`REMEDY_ENGINE=drill`，包 `wlib_capped_pg` 上限 240s）→ 結果 append `$WATCH_DIR/stream-drill.log` → 繼續正常狀態機。演習失敗唔准令 watch/healthcheck 非零 exit。`stream-watch.off` 存在時唔行演習。
3. README 加「點做演習」一節（`touch ~/.hymn-deploy/stream-drill.request`，等下一個 tick，睇 `stream-drill.log`）。
4. 驗證（全部 `cd /` + `env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin` + 絕對路徑 script + `STREAM_WATCH_TEST=1` scratch state）：
   | 項 | 證據 |
   |---|---|
   | B-1 | 有 request：watch 一個 tick → inflight 被消耗 → remedy 去到 `backend-restart.sh --same-code --dry-run` → drill.log 有一行齊欄位 |
   | B-2 | 冇 inflight 直接 call `drill-restart` → exit 2 零側效應；inflight 過期（mtime 11 分鐘前）→ exit 2 |
   | B-3 | 同日第二次 → 配額 exit 3；`restarts` 配額用晒時 drill 仍可行；drill 唔令 `restarts` +1 |
   | B-4 | `REMEDY_ENGINE=ai` → exit 2 |
   | B-5 | 演習 stub 故意 exit 1 / hang：watch 照行完狀態機、exit 0 |
   | B-6 | 回歸 t1,t2,t3,t5,t6,t8（第一個參數傳 scratch 目錄）+ `bash -n` |
5. 交付 commit：script+README 一個、test+報告 `STREAM-DRILL-REPORT-20260929.md` 一個。
