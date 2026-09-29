# TOKEN-REVOKE-REPORT 2026-09-29(Part A:改密碼即令舊 token 失效)

只出證據,唔判 PASS/FAIL。基準 HEAD `c29b0c1`。未部署、未 restart、未 OTA。

## 改動
- `backend/lib/userDb.js`:`ALTER TABLE users ADD COLUMN token_valid_after INTEGER`(try/catch,同既有 migration 一致)。
- `backend/lib/tokenValidity.js`(新):`isTokenRevoked(decoded,userRow)`、`markTokensRevoked(db,userId)`(回傳寫入嘅秒數,呼叫方 saveUserDb)。
- `jwt.verify` 入口清單(grep 全 backend,除 node_modules):
  | 位置 | 處理 |
  |---|---|
  | `lib/requireAuth.js:18` | 查 `token_valid_after`,撤銷 → 401 `{error:'unauthorized'}`;之後 `delete user.token_valid_after`(唔外洩落 req.user / renew response)。所有 `/api/me/*`、friends、share、admin、`/api/auth/renew` 都行呢個 |
  | `routes/auth.js` `/api/auth/me` | 同 SELECT 加欄,撤銷 → 401 `{error:'Invalid or expired token'}`(沿用該 route 既有 401 body) |
  | `routes/presence.js` `tryAuthenticate` | 撤銷 → return null(當訪客,同無效 token 既有處理一致,heartbeat 仍 204) |
  | `routes/otpAuth.js:152` `verifyTicket` | OTP ticket(`purpose:'phone_verified'`),唔關事,冇改 |
  其餘 `jwt.sign` 位(login、login-phone、register-phone、renew、reset-password)簽發內容冇改。
- `routes/otpAuth.js` `/api/auth/reset-password`:`UPDATE password_hash` 後即 `markTokensRevoked`,再走原有 `saveUserDb(db)`(同一次落盤),之後先簽新 token。
- 其他改 `password_hash` 路徑:grep 結果只有 reset-password(`otpAuth.js` UPDATE)+ register INSERT;冇 change-password。
- 冇改 token 壽命、冇加 rate limit。

## 邊界(如實)
- 用 `iat < token_valid_after`(秒精度):**同一秒簽發嘅舊 token 會通過**。
- 冇 `iat` 嘅 token 對 `token_valid_after` 非 NULL 用戶 → 撤銷;對 NULL 用戶照舊通過(舊行為不變)。
- reset-password 本身 response 簽出嘅新 token `iat` ≥ 寫入值(同一流程、同秒或之後)。
- 撤銷係 per-user 全部 token(含其他裝置),冇 per-device。

## App 端(A2)——冇改動,冇 frontend commit
- `AuthContext.resetPassword`(src/context/AuthContext.js:164)已經 `saveAuth(data.token, data.user)`,即做 reset 嗰部機會儲返新 token。
- 撤銷造成嘅 401 行 `56b0f93` 既有路徑:`api.js throwIfUnauthorized` / `sync/userSync.js` → `reportUnauthorized(token)` → AuthContext 清 session → App.js「登入已過期」Alert。冇新文案。
  - 補充細節:開機 `renewIfNeeded` 收到非 ok(含 401)會靜靜 return(`if(!resp.ok) return`),唔會即時觸發登出;要等下一個帶 token 嘅 api/userSync 請求食 401 先觸發提示。
- **舊 bundle 兼容(現出街 App,冇 401 處理、冇 renew)**:backend 先上、OTA 未推期間,其他裝置(舊 token)被撤銷後:requireAuth 類 route 回 401 → `/api/me/*` 同步靜靜失敗(同 token 自然過期一樣,outbox 積落去);admin 畫面原字彈「unauthorized」;`/api/auth/me` 401;heartbeat 變訪客(204)。冇 crash,冇自動登出,直到用戶自己重新登入。預期同 09-28 事故症狀一致。此外 iat 早於 reset 嘅 token 冇任何自動恢復途徑(renew 亦 401)。

## 驗證(harness:`ops/auth/test/token-revoke-harness.mjs`)
隔離方式:copy `backend/lib`+`routes` 去 scratch 樹(users.db 因而落 scratch),自己隨機 JWT secret,子進程隨機 port,掛真 auth/otpAuth/presence/friends(真 requireAuth route `GET /api/friends`)router;ticket 直接用測試 secret 簽(冇 Twilio)。presence 入口以 `last_seen_at` 有冇被寫判斷(有 authenticated / 冇 = 當訪客)。完整輸出 `/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/tokA/run1.txt`。

```
[A-1] token_valid_after NULL(userA 未 reset 前 + userL):舊 token => userA:{me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)} userL:{me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)}
[A-1] login-phone 簽發內容(唔改) => status=200 payloadKeys=id,username,iat,exp
[A-2] reset-password response => status=200 newToken.iat=1790672655
[A-2] 舊 token(userA)每個入口 => me=401 renew=401 requireAuth=401 presence=guest(last_seen_at NULL)
[A-2] response 新 token 每個入口 => me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)
[A-2] 對照 userB 舊 token(未 reset) => me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)
[A-2] 新密碼登入 / 舊密碼登入 => 200 / 401
[A-3] 舊 token 打 renew(冇新 token 回) => status=401
[A-3] 新 token renew(續得,新 token 亦有效) => status=200 renewedMe=200
[A-4] 冇 iat 偽造 token(iat=undefined) 對有 token_valid_after 嘅 userA => me=401 renew=401 requireAuth=401 presence=guest(last_seen_at NULL)
[A-4] (補充)冇 iat 對 NULL 用戶 userB => me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)
[A-6] restart 後(新進程由 users.db 讀)舊 token userA => me=401 renew=401 requireAuth=401 presence=guest(last_seen_at NULL)
[A-6] restart 後 新 token userA => me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)
[A-6] restart 後 userB/userL 舊 token 照 200 => B:{me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)} L:{me=200 renew=200 requireAuth=200 presence=authenticated(last_seen_at set)}
[A-5] 舊 schema db 副本起 boot#1 => before has token_valid_after: false | after boot 1 has token_valid_after: true | legacy row token_valid_after: [[1,null]]
[A-5] 重起 boot#2 => after boot 2 (欄已存在,無報錯) has token_valid_after: true
```

A-7:`node --check` 6 個 backend 檔 + harness 全部無輸出錯誤。`ops/deploy/backend-restart.sh --dry-run` 輸出(gate 因未批准 commit 攔,屬預期,未 restart):
```
❌ abort:HEAD (c29b0c1...) 唔等於已批准嘅 backend.sha (0521d6b...)。未經批准 commit:c29b0c1 / fda1d38 / 7f5b981
提示 approve.sh backend <HEAD> --confirm(**冇跑**)
```

## 冇做到 / 未覆蓋
- 冇跑 prod;冇喺真 Twilio/OTP 流程試(ticket 自簽)。
- harness 冇「移除 fix 嘅負對照」(A-1 同 A-2 用同一組探針,一邊 200 一邊 401,探針可分辨)。
- 未測 admin route 逐條(requireAuth 單一入口,以 friends route 代表)。
