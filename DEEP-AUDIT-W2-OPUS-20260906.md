# W2 Opus 5 獨立驗收 — resolve 失敗路徑 + 公開寫入面（C9 + C6 + D-10）2026-09-06

驗收：Opus 5（獨立，唔改 source、唔 commit、唔 restart/OTA/launchctl、唔改 plist、唔掂 Cloudflare）。
對象：`cb514ed`(A) / `6f13a2b`(B) / `e1e6cb0`(C) / `cea410c`(D) / `322bfc0`(報告)。
基準 `43589c7`。執行單 `DEEP-AUDIT-W2-EXEC-20260906.md`、報告 `DEEP-AUDIT-W2-REPORT-20260906.md`。
Scratch：`/private/tmp/claude-501/.../scratchpad/w2-opus/`。

---

## 0. 結論

**🟢 可以部署（backend restart × 1，唔使 OTA）**，但帶三條尾巴：

1. **C4 冇修到佢聲稱嘅嘢**（問題 #1）——`/api/internal/activity` 個 loopback guard 對**經 tunnel 入嚟嘅公網 request 完全無效**（cloudflared 由 127.0.0.1 連 origin）。唔阻部署（呢個 endpoint 今日本來就係公開，改完唔會差過而家），但報告 §4「已經係完整證據，唔再係限制」呢句要收返，修法要排 W3。
2. **建議出街前補一個 3 行修正**（問題 #4）——OTP verify 而家將「Twilio 網絡錯 / Twilio 自己 429」都當「錯碼」計入 5 次鎖，而且 `/otp/request` 攞新碼唔會解鎖。對住教會長輩用戶，「撳錯 5 次 → 攞新碼都要等 10 分鐘」係真嘅可用性倒退。唔補都出得，但補咗好過。
3. **306 條 harness 合成 row 污染咗真 client-log jsonl**（問題 #3）——要清（唔係我清），清之前所有引用 `client-log-2026-09-05.jsonl` 嘅 after 分析要打個星。

核心工程**做得好**：B 嘅「純機械抽取」我用獨立差分 fuzz 跑咗 36 萬步零不符；`trust proxy 1` 係**啱嘅值**（`2` 會錯，我實測過）；冇任何 limiter 會因為 C2 變成「全站共用一個 bucket」；紅線（唔掂 client / 唔改 resolve timeout / B 同 C 分開 commit / 冇 SIGTERM handler / 冇真密鑰入 commit）全部守住。

---

## 1. 逐條問題

### #1 🟠 C4 個 loopback guard 對 tunnel 路徑形同虛設（「聲稱修好但冇修好」）

- **檔:行**：`backend/server.js:380-386`；`~/.cloudflared/config.yml`（只讀）。
- **證據**：
  - cloudflared ingress：`api.god-music.com` 同 `api.odemusics.com` 兩個 hostname **全部 path** → `service: http://localhost:3001`，冇 path 過濾 → `/api/internal/activity` 由公網打得到。
  - cloudflared 係本機 daemon，connect origin 用 `http://localhost:3001` → `req.socket.remoteAddress` 永遠係 loopback → guard 一定放行。
  - **我獨立實證**（`scratchpad/w2-opus/probe-tunnel-guard.mjs`，純本機，冇掂 prod）：起一個同 `server.js:381` 一模一樣 guard 嘅 origin + 一個模擬 cloudflared 嘅本機 reverse proxy：
    | 路徑 | 結果 |
    |---|---|
    | 由 LAN IP 直連 origin（正控） | **404** ✅ |
    | 由 loopback 直連 origin | 200 |
    | 由 LAN IP → 本機 proxy → origin（＝真實 tunnel 路徑） | **200，`seenRemoteAddress=127.0.0.1`** ❌ |
- **報告哪裡報大**：H-C4 將「偽造 XFF/cf-connecting-ip 但 socket 仍係 127.0.0.1 → 依然 200」寫成「證明 guard 睇 socket 事實，唔受 header 擺布」——嗰一行**正正就係 bypass 嘅示範**，唔係穩健性嘅證明。§4 限制 2 講「後來加咗 LAN 正控，已經係完整證據，唔再係限制」亦都報大：LAN 正控證明嘅係「同一 LAN 直連擋到」，唔係「外人擋到」。
- **實際安全影響**：低（只洩漏 `{streaming:bool}`），而且**改完唔會差過今日**（今日呢條 route 一樣係公開）。所以唔阻部署。
- **修法（W3，唔喺呢波做）**，由平到貴：
  1. guard 加多一個條件：loopback socket **而且** 冇 `cf-ray` / `cf-connecting-ip` header（tunnel 過嚟嘅一定有 `cf-ray`，本機 growLibrary 一定冇）。純 backend、零依賴。
  2. 共用 secret：`INTERNAL_TOKEN` 入 `backend/.env`，growLibrary 由 `process.env` 讀，route 核 header。
  3. cloudflared ingress 加 path 規則擋 `/api/internal/`（要掂 Cloudflare — 唔喺我／執行者範圍）。

### #2 🟠 報告 H-B 個 `b3-harness` 喺 HEAD 已經唔再係有效儀器

- **檔:行**：`ops/perf/harness/w2/b3-harness.mjs:56-64`（起 app 冇 `app.set('trust proxy', 1)`）。
- **證據**：我喺 HEAD 重跑四條，`distinctIp` 相位（本來係用嚟證明「唔同 IP ≠ 同一 key」嗰個）**5/5 全部 429**，而報告 before/after 兩份 log 都係 200：

  | route | 報告 before/after `distinctIp` | Opus 喺 HEAD 重跑 |
  |---|---|---|
  | invites / share / presence / clientlog | 200 × 5 | **429 × 5** |

- **點解**：B 冇改 `clientIp()`，**C 改咗**（唔再讀 XFF）。harness 個 express app 冇設 `trust proxy`，所以 `clientIp()` 對五個「唔同 XFF」全部回 `127.0.0.1` → 塌成同一個 key，而嗰個 key 喺 phase (a) 已經爆咗額。
- **判斷**：**唔係 regression**，B 嘅 before/after 對照喺 B 階段做（果陣兩邊都讀 XFF），對照有效、結論成立（我另外獨立驗證咗，見 #9）。但**呢個 harness 之後唔可以再攞嚟證明 per-key 分隔**——要跟 `hc2-trustproxy-harness.mjs` 咁加 `app.set('trust proxy',1)` + 用 `cf-connecting-ip` 做 key。呢點報告冇寫，之後有人重跑會以為出事。

### #3 🟠 306 條 `b3-harness` 合成 row 污染咗真 client-log jsonl

- **檔**：`backend/logs/client-log/client-log-2026-09-05.jsonl`。
- **證據**：968 行入面 **306 行** `"event":"b3-harness"`（31.6%），ts 全部喺 `2026-09-05T18:58:03.517Z ~ .606Z`（＝本地 09-06 02:58，同 scratchpad `before-clientlog.log` 嘅 mtime 02:58 對上）。306 = 300（sameIp 頭 300 條 204）+ 5（distinctIp）+ 1（afterWindow）；第 301 條係 429 冇寫入。
- **成因**：`b3-harness.mjs` 嘅 `CLIENT_LOG_DIR_OVERRIDE` 係**後來先加**——「after」嗰輪（03:01）已經導咗去 scratchpad，「before」嗰輪（02:58）冇。
- **影響**：
  - 任何「數 09-05 有幾多條 client-log / 邊個 event 幾多條」嘅 **after 分析會偏高 46%**（306 假 / 662 真）。
  - 呢 306 行 `platform`/`deviceId`/`appVersion`/`sessionId` 全部空字串 → `ops/perf/classify-devices.mjs` 會多咗一個「空 deviceId」桶。
  - **已出嘅 before 數字唔受影響**：1E §5 引用嘅係 `/tmp/hymn_backend.log` 嘅 `[access]` 行，唔係呢個 jsonl。
  - **opsMetrics 冇被污染**（我核過：`opsMetrics.js` 嘅 `persist` 預設 `false`，只有 `server.js` 會 `enablePersistence()`，harness 冇 call → `backend/logs/metrics/ops-metrics.json` 冇被 harness 蓋，C9 V-5 個 baseline 安全）。
- **清理方法（唔准我做，交 Fable/Eric）**：
  ```
  cp backend/logs/client-log/client-log-2026-09-05.jsonl /tmp/client-log-2026-09-05.jsonl.bak
  grep -v '"event":"b3-harness"' backend/logs/client-log/client-log-2026-09-05.jsonl > /tmp/cl.clean \
    && mv /tmp/cl.clean backend/logs/client-log/client-log-2026-09-05.jsonl
  # 核：清完應該剩 662 行、0 條 b3-harness
  ```
  ⚠️ 呢個檔 backend process 會 append，清之前最好排喺 restart 之後即刻做（避免 in-memory buffer flush 撞）。
- ✅ 我今次重跑全部用自己嘅 `CLIENT_LOG_DIR_OVERRIDE`，真檔仍然係 **306（冇加）**。

### #4 🟠 OTP verify：Twilio 側**非「錯碼」**嘅失敗都會計入 5 次鎖 + 攞新碼唔解鎖

- **檔:行**：`backend/routes/otpAuth.js:296-300`（`/otp/verify`）、`:339-343`（`/otp/verify-ticket`）
  ```js
  const chk = await twilioCheck(phone, code);
  if (!(chk.ok && chk.data?.status === 'approved')) {
    verifyRecordFail(phone);
    return res.status(401).json({ error: 'bad_code', ... });
  }
  ```
- **問題**：`chk.ok === false` 涵蓋「網絡失敗 / Twilio 5xx / Twilio 自己 429 / verification 已經 expire 或 `max_attempts_reached`」——全部都會消耗用戶嘅 5 次額度。而 Twilio Verify 本身預設每個 verification 最多 check 5 次，之後就算打啱碼都會 fail。**兩層鎖會疊**：用戶錯 5 次 → Twilio 作廢個 verification → 我哋再鎖 10 分鐘，而且 `/otp/request` 攞新碼**唔會**清 `verifyFailsByPhone`（`verifyClearPhone` 淨係喺驗證成功先 call）→ 用戶連「重新攞碼」呢條自救路都封死。
- **嚴重度**：🟠（可用性，唔係安全）。Eric 嘅用戶群係教會長輩，撳錯 5 次唔算罕見。
- **修法（3 行，建議出街前補）**：
  1. 只喺 Twilio 真係答「唔啱」先計：`if (chk.ok && chk.data?.status !== 'approved') verifyRecordFail(phone);`（`!chk.ok` 嘅 transport 失敗照回 401 但唔計數，或者更好回 503）。
  2. `/otp/request` 成功送出新碼之後 `verifyClearPhone(phone)`。**攻擊面唔會擴大**：`/otp/request` 本身有 60 秒 cooldown + per-phone 5/日 + `OTP_DAILY_CAP=100`/日全局熔斷 → 攻擊者上限係 5 個碼 × 5 次猜 = 25 次/日。

### #5 🟡 `.env` 生效喺**呢次 restart** 結構上驗證唔到（`[env]` log 一定唔會出現）

- **證據**：我用 sha256 前 8 位 + 長度對過（冇睇明文），plist `EnvironmentVariables` 五個 key 同 `backend/.env` 五個值**完全一致**：

  | key | plist sha8 / len | .env sha8 / len |
  |---|---|---|
  | JWT_SECRET | `da0c3f89` / 64 | `da0c3f89` / 64 |
  | TWILIO_ACCOUNT_SID | `7ba7472d` / 34 | `7ba7472d` / 34 |
  | TWILIO_AUTH_TOKEN | `7bcc6ae2` / 32 | `7bcc6ae2` / 32 |
  | TWILIO_VERIFY_SERVICE_SID | `fb93b82a` / 34 | `fb93b82a` / 34 |
  | REGISTRATION_MODE | `2348f998` / 4 | `2348f998` / 4 |

  `dotenv.js` 「已有 process.env 唔覆蓋」→ `loadedCount = 0` → **唔會 print `[env] backend/.env 讀入 N 個 key`**。
- **含義**：報告 §5 step 3 嗰句「log 有出現 `[env] ...`」**只喺 Eric 刪咗 plist 五個 key 之後先成立**。W2 呢次 restart **見唔到嗰行係預期**，唔好當 fail（smoke 清單已改寫，見 §3）。
- **順帶（新風險，報告冇講）**：`backend/.env` 冇入 git。一旦有人 `git clean -fdx`（memory 已列紅線）或者重新 clone，同時 plist 又已經刪咗嗰五個 key → backend 會喺 `authSecret.js` 嘅 `process.exit(1)` 度死，而且**冇第二份底**。建議 §5 指引加一句：喺 repo 外（例如 `~/secure/hymn-backend.env.bak`，`chmod 600`）留一份。

### #6 🟡 `hd-dotenv-harness.mjs` 會喺 `backend/` 寫臨時檔，而且個「排序正控」而家重現唔到

- **檔:行**：`ops/perf/harness/w2/hd-dotenv-harness.mjs:216-243`。
- 兩件事：
  1. 佢喺 `backend/` 寫 `__hd_ordering_driver.mjs`（有 `finally rmSync`，但 SIGKILL / 中途死就會留低）——memory `feedback-scratch-scripts-block-deploy-gate`：`backend/` 底下嘅 scratch 檔會令 `backend-restart.sh` 第二步 abort。同樣，`fs.rmSync(ENV_PATH)` 喺 finally，理論上有機會刪走一個啱啱建立嘅 `.env`。
  2. 因為 `backend/.env` 而家已經存在，**case (d) 排序正控會 skip**——即係報告嗰個最關鍵嘅 claim，用佢自己個 harness **重現唔到**。
- **我獨立驗返**（`scratchpad/w2-opus/ord/`，完全喺 scratchpad，copy 咗 `lib/dotenv.js` + `lib/authSecret.js`）：
  - 正控 `import './lib/dotenv.js'` → `import authSecret.js`：`[env] ... 讀入 2 個 key`、`{"ok":true,"regMode":"open"}`、**exit 0**
  - 負控（掉轉次序）：`🚨 JWT_SECRET env var missing — refusing to start`、**exit 1**
  - **結論：D1「一定要係第一個 import」嘅 claim 成立，而且係必要嘅（唔係裝飾）。**

### #7 🟡 CORS：唔啱嘅 origin 嗰個回應冇 `Vary: Origin`

- **檔:行**：`backend/server.js:63-77`。
- **我獨立探針**（`scratchpad/w2-opus/probe-cors.mjs`，用返 backend 自己嗰份 `cors` package + 同一份 allowlist）：

  | case | status | ACAO | Vary |
  |---|---|---|---|
  | GET `Origin: https://odemusics.com` | 200 | ✅ 有 | `Origin` |
  | GET `Origin: https://api.odemusics.com` | 200 | ✅ 有 | `Origin` |
  | GET `Origin: https://www.odemusics.com` | 200 | ✅ 有 | `Origin` |
  | GET `Origin: https://evil.example` | 200 | ❌ 冇 | **冇** |
  | GET 冇 Origin（RN app） | 200 | 冇（正常） | `Origin` |
  | **OPTIONS preflight** allowed | 204 | ✅ 有 + `Allow-Methods`/`Allow-Headers` | `Origin, ACRH` |
  | **OPTIONS preflight** evil | 200（fall-through Express 預設） | 冇 | 冇 |
  | `/p/:token` 直接導航（冇 Origin） | 200 | — | — |
  | `Origin: http://odemusics.com`（非 https） | 200 | ❌ 冇 | 冇 |

- **判斷**：**冇任何 route 會撻**。preflight 由唔啱 origin 打嚟唔會 500、唔會斷（browser 自己 block，正確）。
- **殘留**：唔啱 origin 嘅回應冇 `Vary: Origin`，理論上中間 cache 可以撈亂（CF 預設唔 cache `/api/*`，低）。
- **我另外核過冇 web 消費者**：`frontend/hymn-app/app.json` `platforms` 只有 `ios`/`android`（冇 web）；repo 入面零個會打 `api.odemusics.com` 嘅 HTML；backend 冇 `res.render` / 冇 HTML 靜態目錄（`server.js:277/291` 兩個 `sendFile` 係 APK 下載）；`/p/:token` 係 SSR 直接導航。→ allowlist 安全。

### #8 🟡 bounded Map 嘅硬頂理論上可以「洗走」一個鎖（實際掂唔到，寫低）

- **檔:行**：`backend/lib/rateLimit.js:44-50`（`evictOverflow`）、`:89-104`（`sweepOnThreshold` 尾嗰個 `while`）。
- 一旦某個 Map 超過 `maxEntries`（預設 5000）就踢最舊 entry。對 `loginRateLimit.js` 嘅 `fails`、`otpAuth.js` 嘅 `perPhone`、C1 嘅 `verifyFailsByPhone` 嚟講，**理論上**攻擊者塞爆 5001 個唔同 key 就可以洗走自己個鎖。
- **實際掂唔到**：`otpAuth` 有 `OTP_DAILY_CAP=100`/日（entry 只喺 `commit()` 成功送出先加）→ 一日最多 ~100 格；`me.js`/`admin.js`/`friends.js` 個 key 係真實 user id；`loginRateLimit`/`verifyFailsByPhone` 要 5001 個唔同 phone，而同一個 IP 早就俾 `ipLoginLimiter`（10 fails/15min）或者 `verifyIpLimiter`（60/10min）鎖死。
- **判斷**：可接受，唔使改，但要寫低——如果將來有人調高 `OTP_DAILY_CAP` 或者放寬 IP 保底，呢條就會活返。

### #9 🟢 B「純機械抽取」成立 —— 我獨立差分 fuzz 36 萬步零不符

- **方法（比報告個 harness 強）**：我逐字抄返 `43589c7` 三種舊形狀（① sweep-on-threshold 型 = invites/share/clientLog；② 冇 sweep 冇 cap 型 = me/admin；③ presence 型「new-entry 路徑先 evict」），對 6 個真實 config × 3 個 seed × **20,000 步隨機序列**（7 個 key，時間推進刻意有 2% 機率跳 **啱啱等於窗口**、2% 跳 **窗口+1ms**、2% 跳 **窗口−1ms**）逐步比對布林值同 Map size。
- **結果：`mismatches = 0`（全部 18 條，共 360,000 步），`sizeOld === sizeNew`。**
- **邊界專測**（`> ` vs `>=`）：`[[0,f,f],[0,f,f],[0,t,t],[+windowMs,t,t],[0,t,t],[+1ms,f,f],[0,f,f]]` —— 證實**啱啱等於窗口嗰刻兩邊都唔 reset**（`now - windowStart > windowMs` 係嚴格大於），舊新完全一致。
- **env override 名逐個核過保留**：`INVITES_CHECK_RATE_MAX` / `CLIENT_LOG_RATE_MAX` / `FRIENDS_LOOKUP_DAILY_MAX` / `FRIENDS_REQUEST_DAILY_MAX` / `OTP_DAILY_CAP` / `OTP_ALLOWED_PREFIXES` 全在。
- **唯一「新行為」** = 加咗 `maxEntries` 硬頂（invites/share/clientLog/me/admin 之前冇；presence 本來就有）——執行單 §1 B1 明文批准，見 #8。
- **`stream.js` 冇現存節流**：我 grep 核過，報告嗰句「如有 = 冇」成立。

### #10 🟢 A / D / 紅線 / 密鑰全部過

- **A**：`RESOLVE_TV` 未設 → `[resolve] strategies=default,default-any`；`RESOLVE_TV=1` → `default,youtube:player_client=tv,default-any`；`RESOLVE_TV=true` → **兩個**（嚴格 `=== '1'`）。⚠️ 回滾一定要寫 `RESOLVE_TV=1`，`true`/`yes` 冇用。`default-any` 位置、`RESOLVE_PARALLEL`、timeout/retry 一個數字都冇改（diff 只有註解 + STRATEGIES + 一行 `console.log`）。
- **D**：`backend/.env` `-rw-------`(600) ✅；`git check-ignore -v backend/.env` → `.gitignore:52` ✅；`git -c core.quotepath=false status --porcelain -- backend/` **冇列出佢** ✅ → 報告「唔使加運行時白名單」成立（我另外核過現時 11 個髒檔全部落喺 `backend/data/` / `hymns.db` / `backend/public/` 豁免 pattern）。
- **`backend-restart.sh --dry-run`**：而家喺**第一步 sha gate** abort（`HEAD=312d4bb` ≠ approved `67dd618`）。⚠️ 注意：`312d4bb`(W3 執行單) 同 `ebd4ca4`(W1 after) 係另一個 session 加嘅 docs commit，approve 嗰陣會**一齊夾帶**（memory：deploy gate 係 per-sha）。兩個都係純 `.md`，可以接受，但要明知。
- **密鑰**：五個 commit 全文 + 報告 grep `AC[0-9a-f]{32}` / `VA…` / 長 base64 / 32+ 字元 token → **零命中**（只撞返 commit sha 本身）。`.env.example` 五個值全空。
- **紅線**：`git diff --name-only 43589c7 322bfc0` 只有 `backend/` + `ops/perf/harness/w2/` + `.gitignore` + 兩個 `.md` → **零個 client 檔**；`node --check` 13 個改動 `.js` 全過；冇加 SIGTERM/SIGINT handler（`grep` 只有註解）；B 同 C 分開 commit、次序 A→B→C→D 正確。
- **`trust proxy` 副作用**：全 backend 只有**一個** `req.ip` 用家（`clientIp()`），**零個** `req.protocol` / `req.hostname` / `req.secure` / `req.ips` 用家（host-based 301 用 `req.headers.host`，唔受影響）→ 冇隱藏副作用。

---

## 2. 重跑數字表（Opus 獨立跑，同報告對數）

### 2.1 報告嘅 harness，我逐個重跑

| 項 | 報告數字 | Opus 重跑 | 對唔對 |
|---|---|---|---|
| H-A `RESOLVE_TV` unset | `default,default-any` | 同 | ✅ |
| H-A `RESOLVE_TV=1` | `default,youtube:player_client=tv,default-any` | 同 | ✅ |
| H-B `b3-harness` × 4 route，sameIp 第 max+1 次 429 | invites 11 / share 61 / presence 301 / clientlog 301 | 同 | ✅ |
| H-B `b3-harness` `distinctIp` | 200 × 5（before＝after） | **429 × 5** | ⚠️ 見 #2（儀器失效，唔係 regression） |
| H-B `b3-harness` `afterWindow` | 唔 limited | 200 / 410 / 204 / 204，全部唔 limited | ✅ |
| H-B `loginRateLimit` old vs new | 逐行一致 | 38 行 **IDENTICAL** | ✅ |
| H-B `otpAuth checkRate` old vs new | 逐行一致 | 34 行 **IDENTICAL** | ✅ |
| H-C1 同一 phone 6 次錯 | 第 6 次 `locked=true, retryAfterSec=600` | 同（1-5 `false`，6 `true`/600） | ✅ |
| H-C1 成功即清零 | `afterSuccessClear locked=false` | 同 | ✅ |
| H-C1 20 個唔同 phone 各 1 次 | 全 `locked=false` | 同（i=0..19） | ✅ |
| H-C1 per-IP 保底 | 第 61 次先 `limited=true` | 同（60 `false` / 61 `true`） | ✅ |
| H-C3 cors 五個 case | evil 冇 ACAO、三個域有、冇 Origin 200 | 同 | ✅ |
| H-C4 四個 case | 200/200/200/404 | 同 | ✅（但見 #1：呢四個 case 冚唔到 tunnel 路徑） |
| H-C5 admin/me 逐 i 對照 | `allMatch=true` | 同 | ✅ |
| H-C5 friends day-cap old vs new | 逐行一致 | 26 行 **IDENTICAL** | ✅ |
| H-D (a)(b)(c) | 冇 key / 正確載入 / process.env 贏 | 同 | ✅ |
| H-D (d) 排序正控 | `sawExpectedSecret=true` | **SKIPPED**（`.env` 已存在） | ⚠️ 見 #6，我獨立正控+負控補返，claim 成立 |
| H-D `git check-ignore` / 600 / `--dry-run` | 命中 / `-rw-------` / sha gate abort | 同 | ✅ |

**同報告唔對嘅只有兩格**，兩格都已經解釋清楚（#2 儀器、#6 skip），**冇一格係報告作假或者計錯**。

### 2.2 Opus 自己加嘅測試（報告冇做過）

| 測試 | 結果 |
|---|---|
| **差分 fuzz**：6 個 config × 3 seed × 20,000 步（含窗口邊界 ±1ms） | **mismatches = 0 / 360,000**，size 亦一致 |
| **`req.ip` 語意探針**：`trust proxy` = unset / 1 / 2 × 7 種 header 形狀 | `1` → 永遠攞 XFF **最尾**一段（＝CF append 嘅真訪客 IP，W1 Opus #4 建議嘅做法）；`2` → 攞倒數第二段（**攻擊者可控**，所以 `1` 唔可以加大）；unset → 永遠 `127.0.0.1` |
| **CORS preflight（OPTIONS）** 9 個 case | 冇 route 會撻；evil preflight 200 fall-through；缺 `Vary: Origin`（見 #7） |
| **模擬 cloudflared 打 loopback guard** | LAN 直連 404 ✅ / 經本機 proxy **200** ❌（見 #1） |
| **ESM 排序 正控 + 負控**（獨立 copy，唔掂 backend/） | dotenv 先 → exit 0 ✅；authSecret 先 → exit 1 ✅ |
| **plist vs `.env` 值比對**（sha256 前 8 + 長度，唔睇明文） | 5/5 完全一致 ✅ |
| **opsMetrics 有冇被 harness 污染** | 冇（`persist` 預設 false，只有 server.js `enablePersistence()`） ✅ |
| **client-log jsonl 污染量化** | 306 / 968 行（31.6%），單一時間窗 18:58:03.5xx ❌ 見 #3 |

---

## 3. Restart 之後嘅 smoke 清單（逐條可以貼落 Terminal）

> 前提：`ops/deploy/approve.sh backend <HEAD sha> --confirm` → `ops/deploy/backend-restart.sh`。
> ⚠️ 唔可以喺 Eric 真機 QA 進行緊嗰陣做（memory `feedback-no-deploy-during-live-qa`）。

**S1 — backend 起返身 + `.env` 冇整死佢**
```bash
curl -s -o /dev/null -w 'health=%{http_code}\n' http://localhost:3001/api/health
grep -c 'JWT_SECRET env var missing' /tmp/hymn_backend.log     # 期望 0
grep -c '\[env\] backend/.env' /tmp/hymn_backend.log           # 期望 **0**（見問題 #5：plist 未刪 key，呢個係預期，唔係 fail）
```

**S2 — C9 策略名單真係換咗（A2 個 log 行）**
```bash
grep -m1 '\[resolve\] strategies=' /tmp/hymn_backend.log
# 期望：[resolve] strategies=default,default-any        （冇 tv）
```

**S3 — CORS allowlist**
```bash
curl -s -D- -o /dev/null -H 'Origin: https://evil.example'   http://localhost:3001/api/health | grep -i access-control   # 期望：冇任何輸出
curl -s -D- -o /dev/null -H 'Origin: https://odemusics.com'  http://localhost:3001/api/health | grep -i access-control   # 期望：access-control-allow-origin: https://odemusics.com
curl -s -o /dev/null -w 'no-origin=%{http_code}\n'           http://localhost:3001/api/health                            # 期望：200
```

**S4 — per-IP 節流真係按 `cf-connecting-ip` 分 key（C2 最關鍵嗰條）**
```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "$i:%{http_code} " -X POST http://localhost:3001/api/auth/invite-check \
    -H 'content-type: application/json' -H 'cf-connecting-ip: 203.0.113.77' -d '{}'
done; echo
# 期望：1:200 … 10:200 11:429
curl -s -o /dev/null -w 'other-ip=%{http_code}\n' -X POST http://localhost:3001/api/auth/invite-check \
  -H 'content-type: application/json' -H 'cf-connecting-ip: 203.0.113.78' -d '{}'
# 期望：other-ip=200   ← 證明唔同真實客戶端唔會互相拖累（負控）
```

**S5 — `/api/internal/activity`**
```bash
curl -s -o /dev/null -w 'loopback=%{http_code}\n'  http://127.0.0.1:3001/api/internal/activity      # 期望 200
curl -s -o /dev/null -w 'lan=%{http_code}\n'       http://192.168.30.45:3001/api/internal/activity  # 期望 404
```
⚠️ **經 tunnel 嗰條（`https://api.odemusics.com/api/internal/activity`）會係 200 —— 見問題 #1，唔好當 fail。**

**S6 — OTP verify 節流正控（用假 phone，唔會送任何 SMS）**
```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "$i:%{http_code} " -X POST http://localhost:3001/api/auth/otp/verify \
    -H 'content-type: application/json' -d '{"phone":"+85290000000","code":"000000"}'
done; echo
# 期望：1:401 2:401 3:401 4:401 5:401 6:429
curl -s -X POST http://localhost:3001/api/auth/otp/verify \
  -H 'content-type: application/json' -d '{"phone":"+85290000000","code":"000000"}'
# 期望 body 有 "error":"too_many_attempts" 同 "retryAfterSec"
```
⚠️ 頭 5 次會打 Twilio 嘅 **check** API（對住一個唔存在嘅 verification，回 404）——**唔會送 SMS、唔會開新 verification**。第 6 次喺打 Twilio **之前**就 429（本地擋）。做完呢個測試，`+85290000000` 會鎖 10 分鐘（in-memory，唔關真用戶事）。

**S7 — 15 分鐘觀察窗（真用戶側，最重要）**
```bash
tail -n 2000 /tmp/hymn_backend.log | grep -E '\[access\].* (429) ' | awk '{print $4}' | sort | uniq -c
```
- 期望：`/api/presence/heartbeat` / `/api/client-log` / `/api/me/sync` 嘅 429 **≈ 0**。
- 🔴 **一見到大量 429 落呢幾條 → 即係 `cf-connecting-ip` 假設崩咗（全部用戶塌成同一個 bucket），立即 rollback（見 §4）。**

**S8 — growLibrary 下一個 tick 冇被自己個 guard 擋**
```bash
tail -50 /tmp/hymn_growlibrary.log | grep -i 'activity\|ECONNREFUSED\|404'   # 期望：冇 activity 相關 error
```
（`com.hymnapp.growlibrary.plist` `StartInterval=900`，最多等 15 分鐘。我已核實佢個 plist **冇** `BACKEND_BASE`，只有 `PATH`。）

**S9 — 清 client-log 污染（見問題 #3，restart 之後即刻做）**——命令喺 #3。

---

## 4. Rollback

| 想回滾邊部分 | 做法 | 使唔使 restart |
|---|---|---|
| **只回滾 C9（tv 策略）** | 喺 `com.hymnapp.backend.plist` `EnvironmentVariables` 加 `RESOLVE_TV=1` → `launchctl bootout/bootstrap` | 要（launchd reload） |
| **整套 W2** | `git revert --no-commit cea410c e1e6cb0 6f13a2b cb514ed` → 一個 revert commit（⚠️ 唔准 `git add -A`，用 pathspec 只夾 `backend/ .gitignore`，共用 worktree）→ `approve.sh backend <revert sha> --confirm` → `backend-restart.sh` | 要 |
| **只回滾 C2（trust proxy + clientIp）** | ❌ **冇 env flag** —— 一定要改 code。**建議 W3 補一個 `TRUST_PROXY` env**（同 C9 一樣嘅一鍵手勢），因為 C2 係呢批入面唯一一個「一崩就全站」嘅改動 |
| `backend/.env` | 回滾後可以留低（無害：`dotenv.js` 已經被 revert 走，冇人讀佢）。**唔好刪**——重新出街嗰陣仲要用 |
| OTA | **唔使**（純 backend，零 client 改動） |

**回滾觸發條件（寫死）**
- S7 見到 `/api/presence/heartbeat` 或 `/api/client-log` 429 率突然由 ~0 升到有意義嘅數 → 即刻回滾整套（`clientIp()` key 塌咗）。
- 真用戶反映「登入話太多次嘗試」但佢冇試過幾次 → 即刻回滾（`verifyIpLimiter` 或 `ipLoginLimiter` key 塌咗）。
- 7 日內 `resolve.fail` 率由 4.93% 升穿 6% → 只開返 `RESOLVE_TV=1`（唔使回滾其餘）。

---

## 5. 未做／交返俾下一波

| 項 | 去向 |
|---|---|
| #1 `/api/internal/activity` 真正嘅 guard（cf-ray 判斷 / shared secret） | W3 |
| #4 OTP verify recordFail 收窄 + `/otp/request` 清鎖 | 建議出街前補（3 行），最遲 W3 |
| #3 清 306 條 client-log 污染 + 補一句「呢個檔 09-05 有污染」落 1E | Fable/Eric，restart 後即做 |
| #2 `b3-harness` 加 `trust proxy` + `cf-connecting-ip`（否則之後重跑會誤判） | W3 harness 維護 |
| #6 `hd-dotenv-harness` 唔好再喺 `backend/` 寫檔 | W3 harness 維護 |
| `TRUST_PROXY` env 一鍵回滾 | W3 |
| `backend/.env` repo 外備份 + 寫入報告 §5 指引 | Fable 交 Dispatch 嗰陣加 |
| D-9（`default-any` 保留與否）、`resolve.failMs` 直方圖 | 執行單本身已排喺 W2 之後，冇問題 |

---

驗收：Claude Opus 5，2026-09-06。
