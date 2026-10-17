# OTA 真機落地覆核(Opus,純讀 log)— 2026-10-03

對象:10-02 10:32Z OTA(56b0f93 token 過期處理;iOS `01a0fc2d-327c…` / android `01a0fc2c-521e…`)
來源:`/tmp/hymn_backend.log`(`[access]`/`[stream]`/`[hls]`/`[w4rescue]`/`[client-log]`)、`backend/logs/client-log/*.jsonl`、`stat users.db`(只睇 mtime)、`ps lstart`、讀 source。冇開 db、冇對 backend 發請求。取樣至 06:38Z。

## 判詞:真機落地正常(有兩點要留意,唔使 rollback)

## 1. 時間線逐條核

| 協調者講法 | 核實 | 修正/補充 |
|---|---|---|
| 02:39:11 Android d03463c3 舊 bundle 01a07a06,authed 200 | ✅ | perfHome 02:39:15 session 683796ae updateId 01a07a06。authed 係 `me/sync 200` + `friends **304**`(304 = 過咗 auth,唔係 200) |
| 02:39:18 再開 → 新 bundle 01a0fc2c,authed 200 | ✅ | perfHome 02:39:23 session b2406180 updateId 01a0fc2c;`sync 200`、`friends 304`。相隔 7 秒 ⇒ 好可能係撳「已有新版本」banner 嘅 `Updates.reloadAsync()`(App.js:4770,舊 bundle 已有),唔一定係手動冷開 |
| 02:40:01 iOS e1b6dc8a 冷開:friends 401 + sync 401 = 舊 bundle | ✅ 高把握 | 見下 |
| 02:40:05 再開:冇 authed 請求 | ✅ | 只有 app-version/health/version/daily-verse/hymns |
| 02:40:07 otp/status 200 | ✅ | 呢條只由 `PhoneLoginScreen` mount 觸發(PhoneLoginScreen.js:67)⇒ 開機 2.2 秒已入登入頁,同「本地判過期 → 提示 → 去登入」吻合 |
| 02:40:26 login-phone 200 → sync 200、friends 200;02:40:50 me/data 200 | ✅ | sync 200 喺 login 後 0.57 秒 |
| iOS 新 bundle 播歌到 06:31,約 79 條 | ⚠️ 細修 | 實數 **80 條**,全部同一 session `08efe99a`、updateId `01a0fc2d`;最後一條 **06:35:41Z**(仲播緊) |
| 02:41 後 401 = 0;推後 5xx = 0;renew 0 | ✅ | 推後 `[access]` 只得 200×85 / 304×11 / 401×2(就係 02:40:01 兩條)。`[stream]` 冇 5xx(206×427、200×30、status=0 aborted×1,見下)。`[hls]` 推後 13/13 ok |
| users.db mtime 10:40:26 HKT = 登入刻 | ✅ | = 02:40:26Z。`login-phone` 本身唔落盤;落盤嘅係 02:40:26.881 嘅 `POST /api/me/sync`(routes/me.js `saveUserDb`)。秒級 mtime 分唔開兩者,但兩者同屬登入嗰下 |

**02:40:01 兩條 401 屬舊 bundle 嘅證據(把握:高,~90%;access log 冇裝置欄,冇直接證據):**
1. 嗰個 session 冇留低任何 client-log。iOS 10-03 全部 80 條都係 session `08efe99a`(新 bundle),第一條 perfHome 02:40:09.9 = 02:40:05 burst 後 4.2 秒(Android 兩次都係 burst 後 4 秒左右出 perfHome)。02:40:01 session 唔夠 4 秒就冇咗。
2. 同一 burst 屬 iOS:`[stream] 02:40:05.216 id=7041 mode=cold total_ms=3330 status=0 aborted=true ua=Odely/17_CFNetwork` ⇒ 02:40:01.9 由 iOS App 發起,02:40:05.2 因 JS reload 被斬,0.5 秒後就係新 burst。
3. 簽名同 10-02 10:23:53 一模一樣:嗰次 client-log 實錘係舊 bundle `01a07a07`(同一部 e1b6dc8a),都係開機 sync 401 + friends 401。
4. 新 bundle 開機會先 `isTokenExpired()`(authSession.js:42)本地判 exp,過期就唔會發 authed 請求;若係新 bundle 收 401,會行 `reportUnauthorized` 登出。
餘下 ~10% 不確定:理論上新 bundle 若判唔到 exp(`tokenExpiryMs` 回 null)會照發請求收 401 再登出,外觀亦係「401 → 再開冇 authed」。但第 1、3 點令呢個解釋唔自然。

## 2. 新 bundle 預期行為

- 過期 token 開機本地清走(冇 401):✅ 02:40:05 burst 零 authed 請求、零 401。冇直接睇到 Alert(冇 client-log event 記 Alert),間接證據係 2.2 秒後登入頁 mount。
- 登入後 authed 全 200:✅ sync/friends/me/data 3/3 = 200。
- 冇再彈過期:✅ 零第二次 login、零 401。**但留意**:02:40:50 之後 `[access]` 一條 authed 請求都冇(背景播歌唔打 authed route;heartbeat 唔入 access log 而且永遠唔 401,presence.js tryAuthenticate)。所以「之後零 401」只係覆蓋咗 3 條請求,樣本細,唔係 4 個鐘都驗過。
- 播放冇回歸:✅。09-06/09-07 client-log jsonl 已唔喺硬碟(最舊 09-22),改用推前同一部 iOS 機(09-22 → 10-02 10:32,舊 bundle 01a07a07,224 條)做基線:

| 指標 | 基線(舊 bundle) | 新 bundle 10-03 |
|---|---|---|
| nextTrackMs local | n=69 中位 169ms p90 230 max 1130 | n=40 中位 104.5ms max 356 |
| nextTrackMs stream | n=9 中位 413ms max 5171 | n=4 中位 139ms max 1115 |
| hlsStartupKick | 29 條,n 最高去到 8 | 8 條 = 4 首 HLS 歌各 n=1,n=2,第 2 次 kick 已有 buffer(7.7–30 秒)⇒ 正常起播 kick |
| nativeStall | 有(例如 10-02 11:09) | 0(10-03 冇空 platform 行) |
| hlsFallback / nativeSkipAttributed / midStallNudge | 1 / 9 / 1 | 0 / 0 / 0 |
| hlsPreflight | — | 6/6 ok status=200 |

  44 首 nextTrackMs(42 auto、1 start、1 tapNext;41 背景),冇用戶重開,最長空隙 17 分鐘(長歌,冇 stall event)。`[w4rescue]` 168 條全部 `fired=0`(alreadyBuffered 163),同播放量成正比,冇救援觸發。
- `prefetchFail` 15 條:**1 條**真網絡失敗(02:40:50 `The network connection was lost`,開機頭 1 分鐘,單次)+ **14 條** `pruneSkipPinned=N`。後者唔係失敗:係 audioPrefetch.js:550 嘅取證 log(快取清理時跳過隊列 pin 住嘅檔,借用 prefetchFail 通道報),code 由 08-24(06df59b)已存在,10-02 舊 bundle 推後都出過 2 條;56b0f93 冇改 audioPrefetch.js。屬預期,同 OTA 無關。

## 3. token_valid_after migration

- `lib/userDb.js:44` 開 DB 時 `ALTER TABLE users ADD COLUMN token_valid_after`;`lib/requireAuth.js:24` SELECT 有呢欄。如果欄唔存在,prepare 會拋錯,catch 成 401。
- 02:39:12/02:39:19(Android 舊 token)同 02:40:26/02:40:50(iOS 新 token)嘅 authed 請求全部 200/304 ⇒ 欄喺記憶體入面存在,`isTokenRevoked` 正常行。**M2「ALTER 失敗 → 全員 401」可以排除。**
- 落盤:backend pid 91265 由 09-29 20:37 HKT 開始行,之前一次落盤 09-30 10:49:08 HKT 已經喺 ALTER 之後(sql.js 每次 export 成個 DB)⇒ 磁碟上嘅 users.db 應該 09-30 已經有呢欄。10-03 10:40:26 mtime 係 me/sync 落盤,唔係 migration 本身。(冇開 db 核實,係推論。)
- 登入後冇 401 暴增:✅ 推後 401 總數 = 2,兩條都喺登入之前。

## 4. 未有真機證據嘅路徑

| 路徑 | 狀態 | 幾時自然出現 |
|---|---|---|
| renew(`/api/auth/renew` 200) | 0 次 | iOS e1b6dc8a 新 token 02:40:26Z 簽(30 日)⇒ 剩 <23 日 = **10-10 02:40Z 之後**第一次 JS 開機(冷開或者 reload)。Android d03463c3 02:39:18 新 bundle 開機冇 renew ⇒ 佢 token 剩 >23 日(或撞中 L2 race,機率極低),到期前 23 日嗰陣開機先會 renew。冇 token 內容,推唔到確實日期 |
| 撤銷 token(token_valid_after)→ 401 → Alert | 0 | 只會喺改密碼/reset 或撤銷操作之後出現,唔會自然觸發 |
| Android 過期流程(開機本地判過期 + Alert) | 0 | Android d03463c3 token 仲有效。要等某部 Android token 過期之後再開 App 先見到 |
| 第三部裝置 b1621153(Android) | 最後見 09-22 12:13Z,仍係舊 bundle 01a07a06 | 佢下次開 App:第一次舊 bundle(token 過期就照舊靜靜 401),第二次先入新 bundle |
| Alert 本身(UI) | 冇 log 記錄 | 只可以問 Eric 10:40 HKT 嗰陣 iPhone 有冇彈提示 |
| 新 bundle 收到 server 401 → 登出(`reportUnauthorized`) | 0 | 撤銷 token 或者 server 端出錯時先會出現 |

## 5. 結論

- 唔使 rollback。5xx 0、登入後 401 0、播放指標同推前一樣或者好啲。
- 跟進:
  1. 10-10 之後覆核第一次 `POST /api/auth/renew 200`(iOS e1b6dc8a),同埋之後冇 401。
  2. b1621153 再出現時,睇佢第二次開機有冇行過期流程。
  3. (建議,唔急)新 bundle 冇 client-log event 記錄「本地判過期/Alert」,所以今次只係間接推斷。之後可以加一條 `authExpired` diag,下次就唔使靠時序推。
  4. 09-06/09-07 client-log jsonl 已經 rotate 走咗,冇得做原定嘅基線比較;今次改用 09-22 至 10-02 推前同一部機做基線。

**俾 Eric 一句:** 新版已經裝咗落你兩部機。iPhone 嗰部舊登入過咗期,今朝 10:40 你重新登入之後一切正常,之後連續播咗 4 個鐘歌都冇問題;Android 嗰部本身登入有效,冇受影響。唔使做任何嘢。
