# TOKEN-REVOKE Part A — Opus 獨立驗收（部署前）2026-09-29

對象：`daef720`（backend）+ `2150677`（harness/報告）。執行單 `TOKEN-REVOKE-DRILL-EXEC-20260929.md` Part A。
方法：冇重用執行者 harness。自己寫 `scratchpad/opus6/verify.mjs`：兩棵 scratch 樹（`daef720` 同 `daef720^` 嘅 committed 版本，唔用 worktree），自己生成 secret，隨機 port，ticket 自簽，mount 真 auth/otpAuth/me/admin/share/friends/invites/presence（server.js 同一次序），`Date.now` 可調 offset 模擬時鐘倒退。完整輸出：`scratchpad/opus6/run-kn5BPv/out.txt`。

## 判詞：可部署（有條件 —— 條件係操作性，唔使改 code）

條件：
1. 部署前後都唔好叫 Eric/Joy 行「忘記密碼」，除非佢哋知道其他裝置會被登出。現時出街嘅 bundle 冇 401 處理，其他裝置會靜靜同步唔到，直到用戶自己登出再登入（見 §4）。
2. 照舊經 gate 批准 HEAD；backend 範圍只係 `daef720`（§6）。

## 1. 入口完整性
逐行讀 `git show daef720`，再 grep 全 backend（唔包 node_modules）：`jwt.verify|decode|sign`、`Bearer`、`authorization`、`req.user`、`FROM users`。
- 驗 user JWT 嘅地方淨係得 3 個：`lib/requireAuth.js`、`routes/auth.js` `/api/auth/me`、`routes/presence.js` `tryAuthenticate`。三個都加咗 `isTokenRevoked`。
- `otpAuth.js` `verifyTicket` 只驗 ticket，要求 `purpose==='phone_verified'` 同 `phone`；user token 冇 `purpose`，用唔到。
- `requireAdmin` 疊喺 `requireAuth` 後面，唔會自己 parse token。`/api/admin/*` 全部行 `app.use('/api/admin', requireAuth, requireAdmin)`，包括 fall-through 嘅 `/api/admin/presence`，同埋 invites 自己掛嘅 `/api/admin/invites*`。me、share、friends、invites 逐條行 `requireAuth`。hls、stream、clientLog、audio、home、search、category 冇用 user auth（clientLog 只記 deviceId）。
- 冇任何 `jwt.decode` 或者自己 parse token 嘅地方。改 `password_hash` 嘅路徑淨係 `reset-password`（另外有 register INSERT，但冇 change-password）。
- 結論：冇漏網入口。

## 2. 自己 harness 結果（fixed 對比負控 pre）
| 探針 | pre（daef720^）| fixed |
|---|---|---|
| reset 前 NULL 用戶舊 token：me、renew、me/data、fav、share、friends、invites、admin/invites、admin/presence、admin/*、presence | 全部非 401，presence=AUTH | 同 pre（零回歸）|
| reset 後舊 token，同一組 11 個入口 | **仍然 200**，presence=AUTH | **全部 401**，presence=guest |
| reset 回傳嘅新 token | 200 | 200 |
| 對照：冇 reset 嘅 NULL 用戶 | 200（非 admin 403）| 同 pre |
| 舊 token renew | 200 | 401 |

負控成立：個探針分得開修正前同修正後。

邊界測試（fixed，`token_valid_after = V`）：
- `iat=V`（同一秒）→ 200，屬已接受嘅邊界。`iat=V-1` → 401。
- `iat` 係字串 `"9999999999"`、負數、缺失、`null` → 401，fail-closed。
- `iat=1e12` 或者 `V+0.5` → 200。呢啲 token 要有 secret 先造得出，無實際風險。
- `token_valid_after` 寫成字串 `"V"` → SQLite INTEGER affinity 會轉返 integer，正常。寫成 REAL → 正常。
- `token_valid_after` 寫成 `"abc"`、`""`、`-1`、`0` → **fail-open**（撤銷失效）。只有人手改 db 先會出現。
- `token_valid_after` 寫成未來時間 → 連新 token 都 401，要再 reset 先解到。
- 時鐘倒退：reset 之後時鐘退 30 秒，新密碼 login 攞到嘅 token 即刻 401，要等時鐘追返先用得。喺倒退期間再 reset，會將 `token_valid_after` 寫細，之前被撤銷嘅 token 會復活。
- 並發：reset 行 bcrypt 期間，40 個舊 token 請求全部 200；reset 完成之後全部 401。TOCTOU 窗口大約等於 bcrypt 嘅時間，可接受。
- 連續兩次 reset：唔同秒，第一次 reset 攞到嘅 token 會變 401；同一秒並發，兩個 token 都 200，密碼以最後寫入為準（呢樣係改動前已有嘅行為）。
- 落盤：restart 之後撤銷仍然生效，NULL 用戶照樣 200。
- `saveUserDb` 失敗（將 `users.db.tmp` 整成目錄）：reset 回 500。內存入面密碼同撤銷**一齊**生效；restart 之後兩樣**一齊**冇落盤，舊密碼同舊 token 恢復。即係同一次寫，唔會出現「密碼改咗但撤銷冇落盤」。
- migration：用 `daef720^` 版 `userDb` 建一個完整舊 schema，放 eric、joy 兩行 admin。boot 1 加咗欄，兩行都係 NULL；boot 2 冇報錯。回滾（新 schema 用舊 code 起）正常。
- 外洩：login-phone、me、renew、friends、admin/invites、admin/presence、me/data、email login 嘅 response 全部冇 `token_valid_after`。renew 嘅 user keys 仍然係 `id,username,email,phone,role`。

## 3. reset-password 流程
次序係：驗 ticket → 驗輸入 → 查用戶 → bcrypt → UPDATE hash → mark → 補完 profile → `saveUserDb` → 重讀 → 簽 token。mark 同 sign 之間冇 `await`，所以回傳嘅新 token `iat` 一定 ≥ `token_valid_after`（時鐘正常嘅話）。錯誤路徑不變。response shape 同改動前一樣（pre 同 fixed 都係 `token,user` / `id,username,phone,email,role,gender,birthYear`）。

## 4. 舊 bundle 兼容（`217fe12`）
- 做 reset 嗰部機：`resetPassword` → `saveAuth(data.token, data.user)`，shape 冇變，所以即刻用得。
- 其他裝置：同步 `runOp` 收到 401 會 `return false`，op 留喺 outbox，唔會蝕。`flush` 失敗就唔 pull，唔會覆蓋本地。`flush` 只喺 app 返到前台先行，唔會無限 retry。heartbeat 會變訪客，照回 204。admin 畫面會顯示 `unauthorized`。冇 crash。
- 風險：用戶要重新登入，就要先登出，而登出會 `clearOutbox`。未推出去嘅 add 會喺登入合併時由 `pushSync` 全量補返；但未推出去嘅**刪除**（`fav_remove`、`pl_delete`）會蝕，之後 union merge 會令佢哋復活。呢個風險同 token 自然過期一樣，唔係新 bug，但而家「reset 一次」都會觸發到。

## 5. 部署影響（靜態推論，冇開 prod users.db）
- `ALTER ... INTEGER` 冇 default，現有行一律 NULL。全個 backend 淨係 `markTokensRevoked` 會寫呢欄，而佢淨係喺 reset-password 被 call。所以 restart 本身唔會踢走任何人，Eric、Joy 現有登入零影響。
- `getUserDb` boot 時會 save 一次（現有行為），欄會即時落盤。
- 回滾舊 code 冇問題，不過已撤銷嘅 token 會恢復有效。

## 6. deploy gate
- `git diff 0521d6b HEAD -- backend`（豁免 runtime 檔）同 `daef720` 完全一樣：6 個檔，+41/-3。
- `backend/data/*.js` 冇 committed diff。Part B 嘅 commit 淨係改 `ops/stream`。
- `backend-restart.sh --dry-run` rc=1，係因為 HEAD `211605d` 未批准，屬預期。
- 6 個檔 `node --check` 全部通過。prod `GET /api/health` = 200。

## 發現（按嚴重度）
- **中（操作）**：舊 bundle 期間，reset 會令其他裝置靜靜失效。重新登入要行登出，會蝕 outbox 入面未推出去嘅刪除。建議 OTA `56b0f93` 之前唔好叫用戶行忘記密碼。
- **低**：`token_valid_after` 係非數字、空字串、≤0 時 fail-open。只有人手改 db 先會觸發。
- **低**：時鐘倒退期間新登入嘅 token 會即刻 401；倒退期間 reset 會令舊 token 復活。prod 靠 NTP，一般只係毫秒級調整。
- **低**：同一秒內簽發嘅舊 token 同並發 reset 都會通過，屬已接受嘅邊界。
- **資訊（同今次改動無關）**：`backend/data/worshipGroups.js` 喺 worktree 有未 commit 改動，而 runtime 經 `hymnDb.js`、`adminHymns.js` import 佢。gate 嘅 porcelain 檢查豁免成個 `backend/data/`，所以睇唔到。現時跑緊嘅 backend（PID 6270，15:17 起）已經載入咗呢個版本，今次 restart 唔會改變佢嘅行為。

## 側效應
- 淨係寫咗 scratch（`scratchpad/opus6/`）同本檔。
- 起過嘅子進程都係自己親手起嘅，已經全部退出（`ps` 核實零殘留）。
- 冇 restart、冇 approve、冇 OTA、冇 git 寫操作。冇讀 `.env`、prod `users.db` 或者任何 secret。
- `backend-restart.sh --dry-run` 喺 gate 就 abort，冇寫 `deploy.log`（寫 log 嘅位置喺 dry-run 退出之後）。
- 對 prod 淨係打過一次 `GET /api/health`。
