# OTA 推送後獨立驗收 — `4cd47fd`(frontend = `56b0f93`,token 過期處理)

- 日期:2026-10-02 · 驗收員:Opus(獨立)· 開始 10:34:19Z
- 推送:android 10:32:39Z group `480ae254…` / ios 10:33:36Z group `deb7d2d7…`,channel production
- 冇做嘅嘢:冇 eas(任何子命令)、冇 approve.sh、冇 OTA/rollback(連預覽都冇)、冇 restart、冇 launchctl、冇 git 寫、冇改 code、冇讀 .env/secret/token/keychain/users.db 內容;prod 只打 `GET /api/health`

## 判詞:**正常**(推送正確、live 已換新 bundle、監察窗口零 401/零 5xx/零錯誤;唔使 rollback)。限制:窗口內**冇任何裝置載入新 bundle**(流量極低,唯一活躍裝置喺背景播歌、行緊舊 bundle),所以「新 bundle 喺真機上點表現」今次未有實證,要等冷啟。

---

## 1. 推送正確性

| 檢查 | 結果 |
|---|---|
| HEAD | `4cd47fdfcb9999788d58423bf3521d3a75b0a10f` |
| `approved.json` ota.sha | `4cd47fd…`(approvedAt 10:32:00Z)= HEAD |
| `deploy.log` 尾兩行 | 10:32:39Z ota-publish android / 10:33:36Z ota-publish ios,兩行 sha 都係 `4cd47fd…` |
| `ota-groups.log` 尾兩行 | android group `480ae254-4be3-479a-bb09-bc463720019e`、ios group `deb7d2d7-6d77-4576-9c7d-aa014af58080`,sha `4cd47fd…` |
| `git diff f596c9b 4cd47fd --stat` | 只得 `OTA-PRECHECK-OPUS-20261002.md`(+117),冇 frontend |
| `git status --porcelain -- frontend` | 空 |

⇒ 推出去嘅 tree = 推前驗過嗰個(frontend 同 `56b0f93`/`f596c9b` 一樣)。

## 2. Live manifest(curl `u.expo.dev`,冇用 eas)

| | iOS(runtime 5) | Android(runtime 4) |
|---|---|---|
| HTTP | 200 | 200 |
| update id | `01a0fc2d-327c-7b74-afe8-1dca88f2c7e6`(= 啱啱推嗰個) | `01a0fc2c-521e-7bc6-ad59-06145105ad6a` |
| metadata.updateGroup | `deb7d2d7-…`(新) | `480ae254-…`(新) |
| createdAt | 2026-10-02T10:33:35.612Z | 2026-10-02T10:32:38.174Z |
| launchAsset | 存在,`application/javascript`,4 個 asset | 同 |
| bundle(下載落 scratch) | 3,080,124 bytes,Hermes bytecode v98 | 3,073,864 bytes,Hermes bytecode v98 |
| sha256(base64url)vs manifest `hash` | 一致 `TqEMTKpe…IUsko` | 一致 `OfhG_YaL…GqYU` |
| `/api/auth/renew`(UTF-8) | 1 | 1 |
| 「登入已過期」(Hermes UTF-16LE) | 1 | 1 |
| 「重新登入」(UTF-16LE) | 2 | 2 |

- 舊 group(ios `bf4c92de…` / android `2936d444…`)已唔係 live:manifest 回嘅 group 係新嗰兩個。
- 下載 asset 要用 manifest `extensions.assetRequestHeaders` 入面嘅 per-asset header(Expo Updates 協議本身,任何 client 都會收到);第一次冇帶 header 攞到 1.7KB 嘅「Unauthorized asset request」HTML,唔係 bundle。header 值冇印出、冇存落 repo。
- 側面發現:舊 binary runtime 仲有舊 update live —— ios runtime 4 → `019fff70…`(08-14)、android runtime 3 → `019fdfbf…`(08-08)。裝緊呢啲舊 binary 嘅裝置**收唔到今次修正**(預期,runtime 唔同)。android runtime 5 / ios runtime 6 → 204(冇 update)。

## 3. 即時監察

時間窗:**10:32Z → 11:01:30Z**(我 10:34:19Z 開始,最後取樣喺開始後 27 分鐘)。基線(推前)喺 10:35:51Z 取,之後每 5 分鐘一次。資料源:`/tmp/hymn_backend.log` `[access]`(注意:呢個 log **唔記** `/api/stream`、`/api/hls`、`/api/client-log`、`/api/presence/heartbeat`,亦冇 IP/裝置,所以「幾多部裝置」只可以靠 client-log 估)。

| 取樣(Z) | 10:32 起 access 行 | 401 | 5xx | `/api/auth/*`(renew/login-phone/otp/reset) | users.db mtime | client-log 10:32 起(platform/updateId/裝置) | 新 updateId |
|---|---|---|---|---|---|---|---|
| 10:35:51 | 0 | 0 | 0 | 0 | 09-30 02:49:08Z | ios `01a07a07` `e1b6dc8a` ×1 | 0 |
| 10:41:29 | 3 | 0 | 0 | 0 | 不變 | 同一部 ×2 | 0 |
| 10:46:29 | 3 | 0 | 0 | 0 | 不變 | 同一部 ×2 | 0 |
| 10:51:29 | 3 | 0 | 0 | 0 | 不變 | 同一部 ×3 | 0 |
| 10:56:29 | 4 | 0 | 0 | 0 | 不變 | 同一部 ×6 | 0 |
| 11:01:30 | 4 | 0 | 0 | 0 | 不變 | 同一部 ×8 | 0 |

- 4 條 access 行 = 2 條 `GET /api/health`(10:36:09,**係我自己**:localhost + 公網各一)+ 2 條 `GET /api/internal/activity`(10:39、10:54,內部輪詢)。即係推送後**冇任何 App 端 API 請求**。
- 401:推後 0。基線(過去 72 小時,`[access]` 401 按小時):09-29T12 renew×2+me×2(驗收探針)、09-30T02 `/api/me/favorites/:id`×22 + sync×1、09-30T08 sync×1、10-02T10 sync×1+friends×1(10:23:53,推前,舊 bundle 過期 token 裝置開 App)+ renew×1 + me×1(10:26,推前驗收探針)。⇒ **冇「多裝置/多路徑 401 暴增」**。
- `POST /api/auth/renew` 200:0;login-phone / otp / reset-password:0 ⇒ 未有人載入新 bundle 後續期或者重新登入。
- client-log:窗口內只得 1 部裝置(ios `e1b6dc8a…`,appVersion 1.5.1,**舊** updateId `01a07a07-6eb3-740f-a820-cae4da9d46d2`),appState=background 連續播歌(`nextTrackMs` source=local ×6、`prefetchFail` ×2 detail=`pruneSkipPinned=24/25`,係 cache 修剪資訊事件,唔係播放錯誤)。新 iOS id `01a0fc2d…`、新 Android id `01a0fc2c…` 出現次數:**0**。冇 crash 事件。
- presence:心跳唔入 access log,亦冇其他 log 可讀(presence 係 in-memory);今次冇數據,唔判斷。
- users.db mtime 全程 `2026-09-30T10:49:08+0800` 不變(冇開 db)。補充:backend 係 sql.js in-memory,`/api/auth/login`、`/api/auth/renew` 本身**唔會**落盤(requireAuth 嘅 last_seen_at UPDATE 冇 saveUserDb),所以 mtime 只會喺 OTP/register/reset/sync 等寫入先變,係弱訊號。
- backend:pid 91265 由 09-29 12:37Z 起冇 restart;local + 公網 `/api/health` 200;窗口內非 access log 只有 `[warm]`/`[pin]` 例行行,冇 error/exception。
- 旁注(唔關今次):`/api/internal/activity` 每 15 分鐘輪詢喺 02:23Z → 10:39Z 之間停咗 8 個鐘(backend 期間仍有 `[stream]` 行,唔係 backend 死),10:39Z 已恢復。

## 4. Rollback 就緒(只讀咗 script,冇執行)

`ops/deploy/ota-rollback.sh`:冇 `--confirm` = 預覽(都會 call `eas update:view`);有 `--confirm` = 兩平台各 `eas update:republish --group <舊 group>`,寫 deploy.log + ota-groups.log。目標由 `ota-groups.log` 每平台尾二行推算 —— 而家推算結果 = ios `bf4c92de-66a7-41d2-8140-7b854f1b5f2c`、android `2936d444-24f0-4c94-a598-27eaaa05ca21`(`217fe12`,09-07,即推之前 live 嗰個)。

如果要回滾(由 repo 根目錄,要 Eric/Dispatch 口頭 go;建議明文寫 group,唔靠推算):

```bash
# 第一步:預覽(核對 message/createdAt/gitCommitHash=217fe12…)
bash ops/deploy/ota-rollback.sh "rollback: 4cd47fd token過期處理 → 217fe12" \
  --ios-group bf4c92de-66a7-41d2-8140-7b854f1b5f2c \
  --android-group 2936d444-24f0-4c94-a598-27eaaa05ca21
# 第二步:真推
bash ops/deploy/ota-rollback.sh "rollback: 4cd47fd token過期處理 → 217fe12" \
  --ios-group bf4c92de-66a7-41d2-8140-7b854f1b5f2c \
  --android-group 2936d444-24f0-4c94-a598-27eaaa05ca21 --confirm
```

推完驗證用 §2 嗰條 curl(group 要變返一個**新** group id,`metadata` 係 republish;bundle 入面 `/api/auth/renew` 計數 = 0)。通知用戶要完全熄 App 再開兩次。

**回滾救唔返已清走嘅登入**:新 bundle 一載入,過期 token 喺開機就 `AsyncStorage.removeItem`;食過 401 嘅 session 都被 `clearAuth()` 清走。回滾只換返舊 JS,本機已經冇 token,啲人照樣要自己重新登入(冇設密碼嘅舊電話用戶要行 OTP/忘記密碼)。本地最愛/清單/outbox 冇被清(兩個版本都唔受影響)。

## 5. 判斷

- **而家冇異常,唔需要 rollback。** 推後 27 分鐘零 401、零 5xx、零 backend error;唯一活躍裝置照常播歌。
- **但未有正面證據**:冇裝置載入新 bundle(expo-updates 係「開 App 時 check+下載 → 下一次冷啟先生效」;唯一活躍嗰部喺背景播歌,唔會換)。新 bundle 真機表現要等第一批冷啟。
- **Eric 部機(token 已過期)預期**:第一次冷啟仍係舊 bundle(只係背景落載新 bundle),行為同今朝一樣(靜靜 401 sync/friends,10:23:53 嗰兩條就係)。第二次冷啟載入新 bundle → 開機即刻(唔使網絡)判 token 過期 → 清本機登入 → 彈「登入已過期 / 為咗保障帳戶安全,請重新登入。你嘅最愛同清單唔會唔見。」兩個掣「稍後 / 重新登入」→ 登入畫面。**屬預期,唔係異常**。注意:過期 token 喺新 bundle 下**唔會再打出 401**(開機已經本地清走),所以喺 access log 見到嘅訊號會係 401 **減少** + `login-phone`/`otp` 請求出現,唔係 401 增加。
- **Eric 要做**:完全熄 App 再開兩次 → 見到 Alert 就撳「重新登入」→ 用電話+密碼登入(如果冇設過密碼,行「忘記密碼」OTP)。登入後最愛/清單會 union merge 推返上去(推前報告 L1:過期期間做過嘅「刪除」可能復活)。佢登入之後,下一次開 App 唔應該再見 Alert;如果再見到 = 異常,要即刻話俾我哋知。
- 建議協調者:Eric 重新登入之後覆查一次 access log —— 應見 `POST /api/auth/login-phone 200`、之後 `/api/me/sync` 200、冇再 401;同 client-log 出現 updateId `01a0fc2d…`。

## 6. M1 長期備忘(俾協調者)

**原則:App(4cd47fd 起)食到 server 401 = 即刻清本機登入。任何令 backend 對「有效 token」回 401 嘅操作 = 全員登出,OTA 回滾救唔返(本機 token 已刪),而且冇設密碼嘅舊電話用戶要行 OTP。**

會觸發嘅 backend 操作(requireAuth:`jwt.verify` → users.db 搵 id → `token_valid_after` 檢查;任何例外都 catch 成 401):
1. **換/唔見 `JWT_SECRET`**(launchd plist `EnvironmentVariables`):所有舊 token verify 失敗 → 全員 401。唔見會令 backend 拒絕起身(反而安全);**換值**先係災難。⇒ 唔准輪換 secret,除非 Eric 拍板並接受全員重新登入。
2. **users.db 搵唔到/被換成空檔/舊備份還原**:`getUserDb()` 檔案唔存在會**靜靜開個空 DB 並即刻落盤** → 每個 id 搵唔到 → 全員 401(仲會用空 DB 蓋咗原檔位)。還原舊備份 → 備份之後註冊嘅用戶 401。⇒ restart 前核實 `backend/users.db` 存在且大細正常(而家 65536 bytes);任何 mv/rename/還原 users.db 一律當高風險,先停 backend、先備份。
3. **批量寫 `token_valid_after`**(`markTokensRevoked`、撤銷演習 TOKEN-REVOKE-DRILL、`ops/auth/test/token-revoke-harness.mjs` 對錯 DB 跑):被寫嘅用戶全部 401。⇒ 撤銷/演習只准對測試帳戶 + 測試 DB;harness 一定要指住 scratch DB。
4. **刪除/合併/改 id 嘅用戶腳本**(`backend/scripts/reconcileUserRefs.js`、`setAdmin.js`、`finalizeKidsC4.js`、`migrateTaxonomy.js` 凡掂 users 表嘅):id 對唔上 → 401。另外 backend 係 sql.js in-memory 單例,**backend 運行中有外部 script 寫 users.db,下一次 backend `saveUserDb` 會蓋走外部寫入**(同 hymns.db 無鎖覆寫同一類)。⇒ 改 users.db 要停 backend 先改,或者經 backend 自己嘅 route。
5. **改 `lib/requireAuth.js` / `lib/tokenValidity.js` / `lib/authSecret.js` / `lib/userDb.js` schema(`initSchema`)/ jsonwebtoken 升級**:任何新例外(例如 SELECT 新欄位而 DB 未 migrate)會被 catch-all 變 401 → 全員登出。⇒ 呢幾個檔改動 restart 前要跑 harness:用真 users.db **副本**驗「有效 token → 200」(正控)+「過期 token → 401」(負控),兩條都過先 restart。
6. **反向代理/tunnel 層**(cloudflared、tinyproxy、將來加 WAF/Access)如果開始對 `/api/me/*`、`/api/friends` 等回 401(例如 Cloudflare Access 認證):App 一樣當 token 被拒。⇒ 改 tunnel/Cloudflare 設定唔可以喺 `/api/*` 加任何 401 認證層。
7. **`TOKEN_EXPIRY` 改短**(`routes/auth.js:9`、`routes/otpAuth.js:22` 兩處)只影響新 token,唔會即時登出;但改短到 < 23 日會令 renew 每次冷啟都觸發。改之前要同步改 App `RENEW_WHEN_LEFT_MS`。

預防(建議寫入長期備忘 / deploy gate):
- backend-restart 前加一條自動 smoke:用測試帳戶(opus-verify)登入 → `GET /api/auth/me` 200 → `POST /api/auth/renew` 200;唔過唔准 restart 成功收尾。
- restart 後 10 分鐘睇 `[access]` 401 按路徑分佈,同基線(每小時 0–2 條)比;**多過 5 條且多過一條路徑** = 疑似全員 401,即刻 rollback backend(唔係 OTA)。
- 嚴禁:輪換 JWT_SECRET、手動 sqlite3 寫 users.db、喺 backend 行緊時還原 users.db 備份、對 prod DB 跑撤銷 harness。

## 側效應(如實)

- 對 prod backend:2 次 `GET /api/health`(10:36:09Z,localhost:3001 + api.odemusics.com 各 1)—— 呢兩條喺 access log 入面,唔好當用戶流量。
- 對 Expo:4 次 manifest curl(ios5/android4 主檢)+ 4 次其他 runtime 探測(ios4、android5、android3、ios6),2 次 launch bundle 下載(第一次冇 header 攞到 HTML 錯誤頁,第二次用 manifest 提供嘅 asset header)。冇用 eas。
- scratch(`…/scratchpad/ota-post/`)寫咗:manifest、bundle(.hbc)、`sample.sh`、`samples.log`、`acc.txt`。manifest 檔入面有 Expo asset authorization header(協議公開派發,唔係我哋 secret),冇抄入 repo/報告。
- 起咗 3 個背景 job(取樣 loop、兩個等待 loop)+ 1 個 Monitor,全部已自然結束;冇 kill 任何 process。
- repo 只寫咗本檔。
