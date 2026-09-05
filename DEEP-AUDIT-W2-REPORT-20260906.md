# W2 交付報告 — resolve 失敗路徑 + 公開寫入面(C9 + C6)2026-09-06

執行:Sonnet 5。規劃:Fable 5.1(`DEEP-AUDIT-W2-EXEC-20260906.md`)。根源:
`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C9/§C6/§W2/§2 D-8/D-9/D-10、
`DEEP-AUDIT-1D-BACKEND-20260906.md` OTP-1/LOGIN-P2/SRV-2/SRV-5/F4/ADM-1/
FRIENDS-1/ME-1、`DEEP-AUDIT-W1-OPUS-20260906.md` #4(XFF 繞過節流實證)。

基準 HEAD:`43589c7`。四個 commit:

| Commit | sha | 內容 |
|---|---|---|
| A | `cb514ed` | C9:關 `youtube:player_client=tv` 策略(env flag) |
| B | `6f13a2b` | C6 第一步:純機械抽取 `backend/lib/rateLimit.js` |
| C | `e1e6cb0` | C6 第二步:OTP verify 節流 + trust proxy + cors + internal + per-user Map bounded |
| D | `cea410c` | D-10:密鑰搬 `.env`(code 側,plist 改動留俾 Eric) |

**執行者冇部署、冇 restart、冇 launchctl、冇改 plist(只讀)、冇掂 Cloudflare/DNS/cert/token。**
本報告只判「做咗乜、證據點樣、before 數字出處喺邊」,唔判 PASS/FAIL。

---

## 1. 範圍 → 檔:行

### Commit A — C9(關 tv 策略)
| 檔:行 | 改動 |
|---|---|
| `backend/lib/resolveAudio.js:80-95` | `STRATEGIES` 改用 `RESOLVE_TV=1` 先加入 tv 策略(預設唔加入);`default`/`default-any` 次序不變;`RESOLVE_PARALLEL`/timeout/retry 數字全部不變 |
| `backend/lib/resolveAudio.js:95` | 啟動 log 一行 `[resolve] strategies=<名單>` |

### Commit B — C6 第一步(抽 `lib/rateLimit.js`)
| 檔:行 | 改動 |
|---|---|
| `backend/lib/rateLimit.js:29-63` | 新 `makeLimiter({name,keyOf,max,windowMs,sweepAt=5000,maxEntries=5000})`(count-all-hits,window 由第一擊起計,同 invites.js 範本語意一致 + 新增 maxEntries 硬頂) |
| `backend/lib/rateLimit.js:89-104` | 新 `sweepOnThreshold(map,{sweepAt,maxEntries,isExpired})`——俾有自己 bespoke 決策邏輯嘅 caller(fail-count/day-cap)淨係借「bounded+sweep」呢部分,唔逼佢哋改決策形狀 |
| `backend/routes/invites.js:73-81` | invite-check 限速改用 `makeLimiter` |
| `backend/routes/share.js:39-47` | `/p/:token`、`/api/p/:token` 限速改用 `makeLimiter` |
| `backend/routes/presence.js:39-47` | heartbeat 限速改用 `makeLimiter` |
| `backend/routes/clientLog.js:45-60` | W1 嗰個節流改用 `makeLimiter` |
| `backend/lib/loginRateLimit.js:18-45` | `ipLoginLimiter`/`phoneLoginLimiter` 底層 `fails` Map 加 `sweepOnThreshold`(isLocked/recordFail/clear 決策邏輯不變) |
| `backend/routes/otpAuth.js:19,63-71` | `/otp/request` 嘅 `perPhone`/`perIp` Map 加 `sweepOnThreshold`(`checkRate` 決策邏輯不變) |
| — | `routes/stream.js` 冇現存節流(「如有」= 冇,已 grep 確認) |

### Commit C — C6 第二步(新 route 掛節流 + trust proxy + cors + internal)
| 檔:行 | 改動 |
|---|---|
| `backend/routes/otpAuth.js:37-90` | 新增共用 `verifyCheckPhoneLock`/`verifyRecordFail`/`verifyClearPhone`(per-phone 10分鐘5次錯,只計錯)+ `verifyIpLimiter`(per-IP 60/10分鐘,`makeLimiter`) |
| `backend/routes/otpAuth.js:281-320`、`323-366` | `/otp/verify`、`/otp/verify-ticket` 掛上面嗰組限速(打 Twilio 之前先擋) |
| `backend/server.js:55` | `app.set('trust proxy', 1)` |
| `backend/lib/loginRateLimit.js:71-80` | `clientIp()` 唔再信 `x-forwarded-for` 原字串,優先 `cf-connecting-ip`,其次 `req.ip` |
| `backend/server.js:63-77` | `cors()` 改 allowlist(`api.odemusics.com`/`odemusics.com`/`www.odemusics.com`) |
| `backend/server.js:361-386` | `/api/internal/activity` 加 localhost-only(`req.socket.remoteAddress`) |
| `backend/routes/admin.js:110-131` | `previewRateByUser` 改用 `makeLimiter` |
| `backend/routes/me.js:48-65` | `rateByUser` 改用 `makeLimiter` |
| `backend/routes/friends.js:47-64` | `makeDailyLimiter` 加 `sweepOnThreshold`(day-cap 決策不變) |

### Commit D — D-10(.env,code 側)
| 檔:行 | 改動 |
|---|---|
| `backend/lib/dotenv.js`(新,50 行) | 極簡 `.env` loader,`process.env` 已有嘅唔覆蓋 |
| `backend/server.js:8` | `import './lib/dotenv.js'`(**server.js 第一個 import**,見下面排序說明) |
| `backend/.env.example`(新) | 五個 key 名,值留空 |
| `.gitignore` | 明文加 `backend/.env`(已俾通用 `.env` pattern 冚住,見 H-D) |
| `backend/.env`(唔 commit,已建) | 由 plist 抄嚟嘅真值,`chmod 600`,`git check-ignore` 命中 |

---

## 2. 驗證證據表

harness 全部喺 `ops/perf/harness/w2/`,原始輸出喺 scratchpad
(`/private/tmp/claude-501/.../scratchpad/w2/*.log`)。

| 項 | 證據 |
|---|---|
| **H-A** | `RESOLVE_TV` 未設 → `[resolve] strategies=default,default-any`;`RESOLVE_TV=1` → `[resolve] strategies=default,youtube:player_client=tv,default-any`。`node --check` 過。命令:`node -e "import('./backend/lib/resolveAudio.js')"` 兩次(一次 unset、一次 `RESOLVE_TV=1`)。 |
| **H-B** | `ops/perf/harness/w2/b3-harness.mjs {invites,share,presence,clientlog}`:隨機 port 起單一 route,同一序列(同 IP 打 max+1、5 個唔同 IP 各 1、monkeypatch `Date.now` 模擬過窗)。四條 route 嘅 before/after JSON 輸出**逐 byte 一致**(`diff` 零差異)。`b3-loginratelimit-harness.mjs`(unit 層面 isLocked/recordFail/clear)、`b3-otp-checkrate-{old,new}.mjs` + `b3-otp-driver.mjs`(unit 層面 checkRate 三層決策,含 cooldown/day-cap/ip-cap 邊界)—— 兩者 before/after **逐行一致**。 |
| **H-C1** | `hc1-otp-verify-harness.mjs`:同一 phone 打 6 次「錯」→ 第 6 次 `locked=true, retryAfterSec=600`;`verifyClearPhone` 之後即刻 `locked=false`;20 個唔同 phone 各 1 次全部 `locked=false`;per-IP 保底第 61 次先 `limited=true`(前 60 次 false)。⚠️ 冇 Twilio 帳戶,呢啲係直接 unit 層面測 `verifyCheckPhoneLock`/`verifyRecordFail`/`verifyIpLimiter`(otpAuth.js 加咗純 export 俾 harness 用,route handler 本身唔用呢啲 export,行為零改動)。 |
| **H-C2** | `hc2-trustproxy-harness.mjs` 三組:(A)冇 cf-connecting-ip、XFF 每次唔同值,301 次 → **0 個 429、301 個 204**(重現 NC-3b 嘅殘留缺口,見下面「已知限制」);(B)cf-connecting-ip 固定、XFF 亂噏,301 次 → **第 301 次先 429**(前 300 次 204);(C)20 個唔同 cf-connecting-ip 各打 10 次 → **全部 204**(負控)。 |
| **H-C3** | `hc3-cors-harness.mjs`:`Origin: https://evil.example` → 200 但**冇** `Access-Control-Allow-Origin`;`https://odemusics.com`/`https://api.odemusics.com`/`https://www.odemusics.com` → 都有 ACAO;冇 Origin(RN app)→ 200 照答。Harness 內建斷言核對 `server.js` 嘅 allowlist/`trust proxy` 冇漂移先跑。 |
| **H-C4** | `hc4-internal-activity-harness.mjs`:由 127.0.0.1 打(冇 header)→ 200;偽造 `X-Forwarded-For`/`cf-connecting-ip` 但 socket 仍係 127.0.0.1 → **依然 200**(證明 guard 睇 socket 事實,唔受 header 擺布);由呢部機真 LAN IP(`192.168.30.45`)連返嚟(真.非-loopback socket)→ **404**(完整正控,唔淨係「寫低限制」)。 |
| **H-C5** | `hc5-admin-me-driver.mjs`:admin.js `previewRateLimited`/me.js `isRateLimited` 逐個 i 對照舊手抄邏輯 vs `makeLimiter()`,`allMatch=true`。`hc5-friends-dailylimiter-{old,new}.mjs` + `hc5-friends-driver.mjs`:friends.js day-cap 邏輯 before/after 逐行一致(20 次撞 21 次失敗、5 個唔同 user 全過)。 |
| **H-D** | `hd-dotenv-harness.mjs` 四組,全部喺獨立 child process/臨時目錄跑,完全唔掂真 `backend/`:(a).env 唔存在 → 冇任何 key 被設;(b).env 存在兩個新 key(含帶引號值)→ 正確載入;(c).env 嘅值同 process.env 已有嘅撞 → **process.env 贏**(唔覆蓋);(d)**排序正控**——真身 `lib/dotenv.js` + `lib/authSecret.js` 一齊行,`authSecret.js` 讀到嘅 `JWT_SECRET` 正正嚟自淨係 `.env` 存在(冇喺 shell env 出現過)嘅值,證明 `import './lib/dotenv.js'` 擺喺 server.js 第一個 import 呢個次序係必要嘅(唔係裝飾)。`git check-ignore -v backend/.env` 命中(`.gitignore:52:backend/.env`);`ls -l backend/.env` = `-rw-------`(600);`backend-restart.sh --dry-run` 結果見下面「backend-restart.sh」段。 |
| 全部 | 四個 commit 涉及嘅全部 `.js` 檔 `node --check` 過(13 個檔);逐個 module 用 `import()` 單獨 import 過(帶假 `JWT_SECRET` 環境變數,唔起 `server.js` 本身)。 |

### backend-restart.sh --dry-run
```
$ ops/deploy/backend-restart.sh --dry-run
❌ abort:HEAD (e1e6cb0...) 唔等於已批准嘅 backend.sha (67dd618...)。
```
呢個係 deploy gate 嘅**第一步**(SHA approval)喺呢批未批准嘅 commit 度擋咗,
仲未行到第二步(`git status --porcelain -- backend/` 嘅運行時豁免檢查)。
獨立核實過(唔靠呢個 dry-run 行到嗰步):`git -c core.quotepath=false status
--porcelain -- backend/` 喺 `backend/.env` 存在期間**完全冇列出呢個檔**
(properly gitignored 嘅檔案唔會出現喺 `git status --porcelain`,唔理有冇
`--ignored` flag 都一樣——`--ignored` 先會顯示,預設唔會)。**結論:唔使將
`.env` 加入 script 嘅運行時白名單**,佢結構上唔會撞到嗰條檢查。

---

## 3. Before 數字出處

### C9(resolve 失敗路徑)
`DEEP-AUDIT-ROOTCAUSE-20260906.md` §C9 V-5(全部由 Fable 5.1 實跑
`ops-metrics.json` dump 得出,14 日窗):

| 策略 | tries | ok | fail | msSum | 平均/次 |
|---|---|---|---|---|---|
| `default` | 23,633 | 22,401 | 1,232 | 120,462,921ms | — |
| `youtube:player_client=tv` | 1,087 | **0** | 1,087 | 40,806,109ms | 37,540ms |
| `default-any` | 1,079 | 59 | 1,020 | 41,276,112ms | 38,254ms |

累計 `resolve.total=23,626 / ok=22,460 / fail=1,166`(失敗率 4.93%)。
**回滾條件(寫死俾之後量度用)**:7 日內 `resolve.fail` 率升穿 6% → `RESOLVE_TV=1` 開返。
After 量度屬於下一波(W2 之後,§2 D-9 拍板一齊睇),本報告冇新起爐灶量。

### C6(公開寫入面 × 節流)
`DEEP-AUDIT-1E-TELEMETRY-20260906.md` §5(`/tmp/hymn_backend.log`,
2026-09-05 07:36~16:35 單一 restart 窗,`[access]` 逐行紀錄):

| route | n | status |
|---|---|---|
| `GET /api/internal/activity` | 26 | 200×26(C4 之後:非 loopback 會變 404,呢 26 次全部係 growLibrary 由 loopback 打,唔受影響) |
| `GET /api/admin/presence` | 4 | 200×3 401×1 |
| `GET /api/friends` | 8 | 304×7 200×1 |
| `POST /api/me/sync` | 8 | 200×8(受 me.js `isRateLimited` 保護,C5 改用 `makeLimiter`) |
| `POST /api/presence/heartbeat` | 1 | **404×1**(1E §5 已標明係舊 process 答嘅殘留現象,唔關本次改動事) |

`/otp/verify`/`/otp/verify-ticket`/`/otp/request` 喺呢個 9 小時窗**完全冇出現過**
——同 1D OTP-1「4-8 位數字驗證碼冇任何 backend 側鎖死」嘅 finding 一致(未爆
唔等於唔會爆)。W1 Opus NC-3b(`DEEP-AUDIT-W1-OPUS-20260906.md` #4)係 XFF
繞過節流嘅實測:同一 socket 換 XFF,150/150 全 204,零 429——H-C2 嘅 A 組
刻意重現咗呢個測試(301 次版本),確認殘留缺口冇變(見下面「已知限制」)。

---

## 4. 已知限制 / 唔係 regression 嘅殘留缺口

1. **H-C2 嘅殘留缺口**:`app.set('trust proxy', 1)` 對 Express 嚟講純粹係
   「計幾多個 hop」,唔識分「呢個 loopback peer 係真 cloudflared 定係同一部
   機嘅人手動 curl」——兩者喺 socket 層面一模一樣。所以「冇 cf-connecting-ip、
   淨係亂噏 XFF」呢種案例依然繞得過(H-C2 A 組實測 301/301 全 204)。呢個係
   `DEEP-AUDIT-W1-OPUS-20260906.md` #4 本身已經明文「可接受」嘅殘留(「繞得到
   嘅係:(a) 直連 localhost:3001/同一LAN」),C2 冇聲稱解決呢個,解決嘅係
   「真經 Cloudflare 路,cf-connecting-ip 冒充唔到」嗰個場景(H-C2 B 組已證)。
2. **H-C4 冇做到「非 loopback socket」嘅完整正控喺同一個 harness 入面**——
   後來加咗(用呢部機真 LAN IP `192.168.30.45` 連返嚟),已經係完整證據,
   唔再係限制。
3. **D-9(`default-any` 策略值唔值)未答**——執行單本身寫明「暫時保留,等
   C9 加咗 `failMs` 直方圖有數據先決定」,呢個唔喺 W2 範圍(W2 之後)。
4. **`failMs` 直方圖**(C9 修法 §2「加一個 resolve.failMs 直方圖落
   opsMetrics」)—— 執行單 §1 Commit A 冇明文要求呢波做(A 嘅範圍淨係
   STRATEGIES 開關 + log),ROOTCAUSE §C9 修法第 2 點提到但排喺量度階段,
   **未做**,留俾 D-9 決策嗰陣一齊處理。

---

## 5. 俾 Eric 嘅 plist 指引(由 Fable 交 Dispatch)

**背景**:`backend/.env`(`chmod 600`)已經由現存 plist 值抄好,含
`JWT_SECRET`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
`TWILIO_VERIFY_SERVICE_SID`/`REGISTRATION_MODE`。`backend/lib/dotenv.js`
已經確認(H-D 排序正控)喺 plist 冇呢啲 key 嗰陣都可以令 backend 正常
讀到呢啲值。過渡期(plist 仲有呢啲 key)兩邊並存唔會撞——`dotenv.js`
「process.env 已有嘅唔覆蓋」,plist 值優先。

**⚠️ 呢一步淨係 Eric 拍板之後先做,執行者冇改過 plist 本身一個字。**

1. 打開 `~/Library/LaunchAgents/com.hymnapp.backend.plist`,喺
   `EnvironmentVariables` 度刪走呢五個 key(淨係留低 `PATH`,如果有其他
   同呢五個無關嘅 key 都照留):
   - `JWT_SECRET`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_VERIFY_SERVICE_SID`
   - `REGISTRATION_MODE`
2. 令 launchd 重新讀 plist(**呢一步等於 restart backend,要跟返正常
   deploy gate 流程,唔可以喺 Eric 真機 QA 進行緊嗰陣做**):
   ```
   launchctl bootout gui/$(id -u)/com.hymnapp.backend
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnapp.backend.plist
   ```
3. 驗證:`curl -s http://localhost:3001/api/health` 200、`/tmp/hymn_backend.log`
   有出現 `[env] backend/.env 讀入 5 個 key`、`/api/auth/otp/status` 回
   `configured:true`(即係 Twilio 值讀到)。

---

## 6. 未做項總表

| 項 | 原因 |
|---|---|
| D-9(`default-any` 保留與否) | 執行單明文排喺 W2 之後,等 `failMs` 直方圖數據 |
| `resolve.failMs` opsMetrics 直方圖 | 排喺 W2 之後嘅量度階段(見 ROOTCAUSE §C9 修法第 2 點) |
| plist 實際改動 / backend restart | 執行者紅線唔准做,已備妥指引俾 Eric(§5) |
| `.env` 真身部署後嘅生產驗證 | 要等 Eric/Fable 走 deploy gate + §5 手續 |

---

## 附:harness 檔案清單(`ops/perf/harness/w2/`)

```
b3-harness.mjs                        H-B(invites/share/presence/clientlog)
b3-loginratelimit-harness.mjs         H-B(loginRateLimit unit)
b3-otp-checkrate-{old,new}.mjs        H-B(otpAuth checkRate unit,old/new 對照)
b3-otp-driver.mjs                     H-B 驅動腳本
hc1-otp-verify-harness.mjs            H-C1
hc2-trustproxy-harness.mjs            H-C2
hc3-cors-harness.mjs                  H-C3
hc4-internal-activity-harness.mjs     H-C4
hc5-admin-me-driver.mjs               H-C5(admin.js/me.js)
hc5-friends-dailylimiter-{old,new}.mjs + hc5-friends-driver.mjs   H-C5(friends.js)
hd-dotenv-harness.mjs                 H-D
```

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
