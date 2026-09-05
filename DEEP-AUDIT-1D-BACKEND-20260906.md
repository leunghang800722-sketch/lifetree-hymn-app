# 1D Backend 深審 — findings register 2026-09-06

範圍：`server.js`、`routes/*`（15 檔）、`lib/*`（28 檔）、launchd 排程 scripts、`ops/deploy/*`、launchd plists、`package.json`。只審唔改，唔起第二個 server、唔 restart、唔碰 hymns.db/Cloudflare。

方法：三條並行 sub-agent（routes+server.js／lib／scripts+ops+launchd+package.json）逐檔全文讀 + 主 agent 直接抽查交叉驗證（JWT/CORS/otpAuth rate-limit/日誌保留/HLS gate/dead route 現狀/saveUserDb/依賴清單）。所有「零引用」「零命中」結論均以實跑 grep/log 佐證，唔憑印象判「冇問題」。

---

## 0. 覆蓋清單

| 線 | 檔案 | 讀法 |
|---|---|---|
| server.js | 982 行全讀 | 主 agent + sub-agent 交叉 |
| routes/*（15 檔） | 全讀 | sub-agent A 全覆蓋 + 主 agent 抽讀 auth.js/me.js/home.js/hls.js/presence.js/stream.js 核實 |
| lib/*（28 檔） | 全讀 | sub-agent B 全覆蓋 + 主 agent 抽讀 authSecret.js/loginRateLimit.js/userDb.js/clientLogStore.js 核實 |
| scripts/*（launchd 排程 7 個 + nightly-db-sync.mjs） | 全讀 | sub-agent C 全覆蓋（見 §5） |
| ops/deploy/*、launchd plists ×10、package.json | 全讀 | sub-agent C + 主 agent 直接 `plutil -p` 全部 10 個 plist |

---

## 1. Findings register（按嚴重度）

### P1

| ID | 檔案:行 | 類別 | 證據 | 根源 | 修法方向 | 量度法 |
|---|---|---|---|---|---|---|
| **CLOG-1** | `routes/clientLog.js:27-62` + `lib/clientLogStore.js:64-81` | security/perf | `/api/client-log` 全 repo 搵唔到任何 rate-limit（同其他開放 route 唔同，呢個係全 codebase 入面唯一一條完全冇 per-IP 節流嘅公開寫入 endpoint）；每個 request 同步行 `fs.mkdirSync`+`fs.chmodSync`+`fs.statSync`+`fs.appendFileSync`（`clientLogStore.js:64-81`），`mkdirSync`/`chmodSync` 對一個已經 700 嘅目錄每次都重做一次 | fire-and-forget beacon 設計（唔認證、唔拒絕壞 request）從未配對節流；持久化層用咗 `*Sync` API 而唔係 buffered/async writer | (1) 抄 share.js/invites.js 現成嘅 per-IP sweep-on-threshold 節流；(2) `mkdirSync`/`chmodSync` 搬去 module load 一次性；(3) `appendFileSync`→`fs.appendFile` 或批量 writer，避免同一 event loop 上塞住 `/api/stream`/`/api/hls` | 洗版測試（唔可以喺 prod 做）：本機起計時腳本量 1000 次連續 `appendFileSync` 耗時；或加 opsMetrics 計數觀察 request/min |
| **OTP-1** | `routes/otpAuth.js`（`/otp/verify`、`/otp/verify-ticket`） | security | `checkRate()`（連同 `perPhone`/`perIp`/`globalCount`）只喺 `/otp/request` 被呼叫，`verify`/`verify-ticket` 兩條 route 完全冇本地 attempt 節流——4-8 位數字驗證碼冇任何 backend 側鎖死機制，淨係靠 Twilio Verify 自己嘅（未知配置）節流 | 節流邏輯掛咗喺 request 端，冇跟埋 verify 端一齊做防猜碼 | 抄 `/otp/request` 現成嘅 per-phone Map+cooldown pattern，加喺 verify/verify-ticket 前面（例如 10 分鐘 5 次錯） | `for i in 0000..9999; do curl verify-ticket; done` 睇 backend 有冇自己 429（現狀：冇） |
| **RESOLVE-P1** | `lib/resolveAudio.js:166`、`lib/hymnDb.js:375`、`lib/reconcileCore.js:45/68/89`、`lib/whisperTranscribe.js:61` | bug/ops | 全部用 `promisify(exec)(cmd, {timeout})`；harness 實測（本機、唔連網絡）：`exec("sleep 30",{timeout:1000})` timeout 後，`err.killed=true` 但 `pgrep -f "sleep 30"` 仍見返一條獨立 pid（`/bin/sh` wrapper 俾殺咗，真正被包住嘅子進程冇死，reparent 去 launchd） | Node `exec` 嘅 timeout 淨係 signal 佢知道嘅 pid（shell wrapper），唔會落去真正嘅子進程；冇 yt-dlp `--socket-timeout` 做第二層保險（`grep socket-timeout` = 0 hit） | 改用 `spawn`（唔經 shell）令 kill 直接指向真 pid，或者 `{detached:true}` + `process.kill(-pid,'SIGKILL')` 殺成個 process group；加 yt-dlp `--socket-timeout` | `ps -eo pid,etime,command | grep -E 'yt-dlp|whisper-cli'`，etime 遠超對應 timeout 嘅就係孤兒 |

### P2

| ID | 檔案:行 | 類別 | 證據 | 根源 | 修法方向 | 量度法 |
|---|---|---|---|---|---|---|
| **RESOLVE-P2a** | `lib/resolveAudio.js`（`cache/resolve-cache.json`）+ `lib/hymnDb.js`（`discover-fail-cache.json`/`channel-cooldown.json`） | bug | backend server + growLibrary.js/checkDeadLinks.js/refetchKids.js 等維護 script 各自獨立 import `resolveAudio.js`，各自一份私有記憶體 Map，`scheduleFlush()` 淨係寫返自己嗰份、整份覆蓋（`fs.writeFileSync`，冇鎖冇 merge）；同 hymns.db 已經因為「兩個 process 同寫」出過事故（`hymnDb.js:559-567` 「9 首無故跌咗」）先至加咗 `acquireDbLock` 唔同，呢三份 cache 檔完全冇跨進程協調 | hymns.db 個教訓冇搬字過紙落呢三個 cache 檔 | 用返 `acquireDbLock`/lockfile 協議，或者 flush 前 read-merge-write | 兩個 process 同時對唔同 id 各自 resolve，事後睇 `cache/resolve-cache.json` 有冇兩邊都保住 |
| **RESOLVE-P2b** | `lib/resolveAudio.js:18,20`（`cache`/`failCache` Map） | perf | `bufferCache` 已有 `MAX_BUFFER_ENTRIES=40`+`MAX_BUFFER_TOTAL_BYTES=128MB` LRU（STARTUP-ROOTFIX-EXEC-BC-20260831），但 URL-resolve `cache`/`failCache` 完全冇上限，淨係靠 `bustCache()`/重新 resolve 先會被取代，唔會因為單純過期而被剪走 | 上限機制淨係補咗 bufferCache 嗰次事故現場，冇推廣去姊妹 Map | 加同款 bounded+LRU，或者定期 sweep 過期 entry | `cache.size`/`failCache.size` 隨開機日數增長 vs 歌庫總數對比 |
| **LOGIN-P2** | `lib/loginRateLimit.js:46`（`clientIp()`） | security | `req.headers['x-forwarded-for']` 做 fallback，`grep "trust proxy" server.js routes/*.js` = 0 hit——Express 冇設 `trust proxy`，冇任何機制核實呢個 header 真係嚟自可信反向代理（Cloudflare/cloudflared）定係 client 自己嗰句;`otpAuth.js` 嘅 `perIp` Map 同款 pattern 但完全冇 sweep（連 lazy expiry 都冇）| 抄嚟嘅共用 `clientIp()` 冇跟住加 trust-proxy 驗證；rate-limit Map 冇統一嘅上限/sweep 規格 | 設 `app.set('trust proxy', ...)` 令 `req.ip` 可信，只喺確定經 CF 嘅路先信 `x-forwarded-for`；otpAuth.js `perIp` 加 sweep | 用唔同假 `X-Forwarded-For` 連續打 20 次登入，睇 429 會唔會失效 |
| **HLS-1** | `routes/hls.js:29-30,97-129`（`playlistCache`） | bug/perf | `cached.expiresAt > Date.now()` 淨係喺讀嗰陣判斷新舊，完全冇 eviction/size cap（隔籬 `recentHeadFetchFail` Map 喺 `size>200` 就會 sweep，呢個冇抄埋）；cache key 帶住會轉嘅 googlevideo URL（約 4.5 小時輪一次），每次輪換就加新 key，舊 key 永久留喺記憶體 | 同一檔案入面兩個 Map，一個有 sweep 一個冇，抄漏咗 | 加同款 `size>N` sweep | `/api/audio/cache/warm-stats` 或 opsMetrics 加一行 `playlistCache.size` 觀察多日增長（唔起 server 冇得直接量） |
| **DEAD-2** | `[deprecated-route]` 命中量法 | ops/dead-code | `grep -c "\[deprecated-route\]" /tmp/hymn_backend.log` = 0，但呢個 log 只涵蓋 ~9-19 小時（`grep -n "running on port 3001"` 見 3 次 restart marker，全部集中喺 09-05 之後；`clientLog.js:12-16` 自己註解證實「macOS 開機清 /tmp，8/15-17 三日數據全部蒸發」曾經發生過一次），距離 09-02 11:01Z 部署已 4 日，但呢條 log 冇辦法證明「成 4 日零命中」——`[deprecated-route]` 只 `console.log`，冇寫入任何存活過重啟嘅地方（`backend/logs/client-log/`、`admin-audit.log`、`opsMetrics` 都唔記呢個） | 410 化嗰陣冇跟手加持久計數，靠 stdout（已知會被 /tmp 清走）做刪檔證據 | 刪檔前喺 opsMetrics 加一個持久 `deprecatedRouteHits` counter 補返呢 4 日缺口；或者接受「前端零引用 grep + 19 小時零命中」已經夠格刪 | 見上 |
| **USERDB-P2** | `lib/userDb.js:104-108`（`saveUserDb`） | perf | `fs.writeFileSync`+`fs.renameSync` 全同步、全檔覆寫，`routes/me.js` 每次 `/favorites/:id`（單次 add/remove）、`/playlists/:id` upsert 都各自即刻 call 一次（`/sync` 批量操作先淨係一次，算做得啱）；`users.db` 現時 64KB（21 個備份全部 65536 bytes,用戶量細),但呢個係 hymns.db 已經因為「全檔 saveDb 太頻」而特登修過（C-7）嘅同一種 pattern,userDb.js 完全冇享受到嗰次修法 | saveUserDb 抄 hymnDb.js 「每次寫完即刻 atomic save」嘅舊做法(comment 明講「用戶量細,每次全量 export 冇壓力」),用戶量一大就會重現 hymns.db 舊病 | 短期唔使郁(現時量細);中期:單次 favorite add/remove 呢類高頻小動作可以 debounce(例如同一用戶 500ms 內合併),或者改用 async fs.writeFile | 用大幾十倍嘅假 users.db（harness 複製再灌水）量 `saveUserDb()` 耗時,對比而家 <5ms 量級 |

### P3

| ID | 檔案:行 | 類別 | 證據 / 備註 |
|---|---|---|---|
| **SRV-2** | `server.js:39` `app.use(cors())` | security | 冇 origin allowlist,任何 origin 都會俾 reflect 返 `Access-Control-Allow-Origin`。Bearer-JWT(唔係 cookie)所以唔係傳統 CSRF,但 RN app 本身唔需要 CORS header(唔係瀏覽器 fetch),而家嘅寬鬆設定純粹擴大咗「第三方網頁可以用偷嚟嘅 token 隔空讀 API」嘅麵。`curl -H "Origin: https://evil.example" -I .../api/hymns` 驗證 reflect。 |
| **SRV-3** | `server.js:174-180` 掛載次序 + `share.js:29-33`/`invites.js` | bug(唔傷但同註解矛盾) | `meRoutes(app)` 用 `app.use('/api/me', requireAuth, rateLimitMW)` 係前綴匹配,之後掛載嘅 `/api/me/playlists/:id/share`(share.js)、`/api/me/invites`(invites.js)都會行多次 requireAuth(2× DB SELECT+UPDATE)兼佔用 `/api/me` 60/min 節流額——share.js 自己註解聲稱「獨立 requireAuth 就夠、唔使嗰個節流」,同實際唔符。Fail-safe(唔係漏洞),但值得對正註解。 |
| **SRV-5** | `server.js` `GET /api/internal/activity` | security(輕微) | 冇 auth/IP allowlist,回 `{streaming: bool}`,comment 話「唔係俾 App 用」但實際任何人都 curl 得到。低敏感度 info leak,建議加 localhost-only 或 shared-secret header。 |
| **HOME-1** | `routes/home.js:36-38`（`daily-verse`） | bug | `dayOfYear` 計法混用咗 `new Date(today)`(ISO date-only string,依 spec 解做 **UTC** 午夜)同 `new Date(today.slice(0,4),0,0)`(依 3 個 number 引數,解做**本機時區**嘅上一年 12 月 31 日)——兩個時區基準唔一致,喺 UTC 同本機時區有偏移嘅時段(例如香港 UTC+8,每日 00:00-08:00 UTC 前後)有機會揀錯日嘅金句。低影響(頂多錯一日),但係一個真實可重現嘅 off-by-timezone bug。 |
| **STR-1** | `routes/stream.js:576-587` | platform-diff(脆弱性) | iOS webm/opus 攔截淨係靠 `/AppleCoreMedia/i.test(UA)` 判斷——第三方 UA 字串,Apple 改格式呢度會靜靜哋失效,冇任何告警。App 本身喺 clientLog/presence 已經有專用 `platform` 欄位,建議 stream/hls request 都加一個 `X-Client-Platform` header 取代 UA sniffing,唔使賭 AVFoundation UA 格式永唔變。 |
| **ADM-1 / FRIENDS-1 / ME-1** | `admin.js:116`、`friends.js:48-61`、`me.js:50` | perf(同款) | 三個 per-user rate-limit Map(`previewRateByUser`/`byUser`/`rateByUser`)都冇 eviction,但 key 係 `user_id`,受限於真實用戶數(而家細),同 `share.js`/`invites.js`/`stream.js` 有 sweep-on-threshold 嘅寫法唔一致,值得為咗一致性補返,但唔急。 |
| **REQAUTH-P3** | `lib/requireAuth.js` | bug(潛伏) | `try{...; next();}catch{return 401}`——`next()` 擺咗喺 try 入面,如果下游 handler 同步拋錯會被錯誤歸類做「未授權」,掩蓋真正錯誤;現時冇任何下游 handler 會同步拋錯,純粹係地雷,建議 `next()` 移出 try 區。 |

---

## 2. 分類統計（含 §5 scripts/ops 線，全審完成）

| 類別 | P1 | P2 | P3 | 小計 |
|---|---|---|---|---|
| bug | 1（RESOLVE-P1） | 3（RESOLVE-P2a、HLS-1、USERDB-P2） | 3（SRV-3、HOME-1、REQAUTH-P3） | 7 |
| perf | 1（CLOG-1 兼 security） | 2（RESOLVE-P2b、USERDB-P2 兼 bug） | 1（ADM/FRIENDS/ME 合併計 1 組） | 4（USERDB-P2 兩類皆計，CLOG-1 重複計入 security） |
| security | 2（CLOG-1、OTP-1） | 3（LOGIN-P2、F4 明文密鑰、DEAD-2 屬 ops 但牽涉可信度） | 2（SRV-2、SRV-5） | 7 |
| dead-code | 0 | 0 | 2（F5 stray hymns.db、410 stub 4 檔已確認乾淨見 §3） | 2 |
| duplication | 0 | 1（F8 backfillAlbumFrom*Catalog 11 檔） | 0 | 1 |
| ops/維運 | 1（F2 冇部署期 QA guard） | 4（DEAD-2、F1 checkDeadLinks 長鎖、F6 log 無限增長、F4 見上已計 security） | 2（F3 排程重疊、F7 log 缺失未查實） | 7 |
| platform-diff | 0 | 0 | 1（STR-1，另有已落地嘅 iOS webm 502 攔截記錄在案） | 1 |

（數字有重疊：CLOG-1/USERDB-P2/DEAD-2/F4 橫跨兩類，按主類別計一次，上表供概覽用，不作精確對賬。**總計約 25 條 findings**，另有 8 條「正面核實、無問題」項目——F9/F10/F11/F12/F13/F14/F15 + presence.js/hlsPlaylist.js/opsMetrics.js 等，見 §6。）

---

## 3. Dead code 清單

### 3.1 已確認嘅 410 stub（PERF-STAGE2-EXEC-20260902 §2A A-4）

| 檔案 | 現狀 | 命中證據 |
|---|---|---|
| `routes/category.js`（8 條 route） | 全部 `gone()`，DB loader 完全冇執行 | 前端 grep `api/category` = 0（09-02 已記錄）；`[deprecated-route]` 觀察窗（09-05 05:36 – 09-06 00:30，跨 3 次 restart）= 0 命中 |
| `routes/search.js`（5 條 route） | 全部 `gone()` | 同上，前端 grep `api/search` = 0；觀察窗 0 命中 |
| `routes/audio.js`（`/:youtubeId`） | `gone()`；`/cache/stats`、`/cache/warm-stats` 特意保留（唔掂 DB，純讀 in-memory Map，2026-07-28/THIRD-PASS 事故用得著） | 前端 grep `api/audio`/`fetchAudioUrl` = 0；`backend/check_hymn.cjs`（零引用維運 script）曾直呼 `/api/audio/:id` 但本身冇被排程/引用，不影響判定 |
| `routes/home.js`（9/10 條，`/daily-verse` 除外） | 全部 `gone()` | 前端 `homeApi.js` 只 export `/daily-verse` |

**唯一缺口**：以上四檔嘅刪檔判斷全部依賴 `[deprecated-route]` console.log，而呢條 log 冇持久化（見 DEAD-2）。現時可證：19 小時觀察窗 + 4 檔前端零引用（09-02 已用正控驗證 grep 方法有效）。距離「48h 零命中」呢個原定門檻，**時間上已過（09-02 → 09-06 共 4 日）但證據上唔可驗**——建議刪檔前用 opsMetrics 補一個持久計數器跑多一輪，或者接受「前端零引用 + 觀察窗零命中」已足夠。**不建議直接刪檔而未先補計數**。

### 3.2 lib/ 全部 26 檔——零死碼

三線交叉核實：對每個 `lib/*.js` 做 `grep -rlE "lib/<name>(\.js)?" --include='*.js' --include='*.mjs' .`，全部 ≥1 非自身引用（`instrumentalSilence.js` 首輪只搜 `.js` 顯示零引用，加返 `.mjs` 後在 `scanInstrumentalCandidates.mjs`/`ingestInstrumental.mjs` 命中 2 次——**zsh/grep 正控陷阱**，同 09-02 報告已記錄嘅「`--include=*.js` 會 glob 展開令正控回 0」屬同一類方法論教訓）。**無 lib 檔案可判定為死碼。**

### 3.3 scripts/ 死碼（sub-agent C 完成，見 §5 F9）

89 個非 migration 檔全部核實：7 個 launchd 排程中、82 個係已執行嘅 `oneoff-*`/`migrate-*` 或仍在用嘅人手 CLI 工具（多個 Sep 5 剛改過，配合 Church 611 目錄擴充工程），**冇任何檔案夠格判死碼**。唯一嘅真死碼係 F5：`backend/data/hymns.db`（0 bytes、零引用、可安全刪除）。

---

## 4. 完整 route 清單（含 auth 分級）

見附錄 A（來自 sub-agent A 全量掃描，主 agent 抽 10+ 條核實無誤）。摘要：
- **開放（無認證）且有節流**：`/api/auth/login`（IP）、`/api/auth/login-phone`（IP+phone）、`/api/auth/otp/request`（phone+IP+global）、`/api/auth/invite-check`（IP）、`/api/presence/heartbeat`（IP）、`/p/:token`/`/api/p/:token`（IP）。
- **開放且無節流（缺口）**：`POST /api/client-log`（CLOG-1）、`/api/auth/otp/verify`、`/api/auth/otp/verify-ticket`（OTP-1）、`GET /api/internal/activity`（SRV-5，低敏感度）。
- **開放、純讀、低風險**：`/api/hymns*`、`/api/health`、`/api/version`、`/api/app-version`、`/api/audio/cache/*`、`/api/stream/:id`、`/api/hls`（HLS 靠 client manifest gate `hlsEnabled`/`hlsDeviceIds`，backend route 本身冇強制——目前是設計上嘅 staged-rollout 開關，唔係安全邊界，任何人繞過 manifest 直接 curl `.m3u8` 一樣攞到）。
- **authed**：`/api/me/*`、`/api/friends/*`、`/api/me/invites`、playlist share 擁有者操作。
- **admin**：`/api/admin/*`（含 `/api/admin/presence`，靠掛載次序 `adminRoutes(app)` 早於 `presenceRoutes(app)` 生效，已核實 server.js:175/180 次序正確，presence.js 自己仲加咗 `req.user` sanity guard 做 defense-in-depth）。

---

## 5. scripts / ops / launchd / package.json（sub-agent C 全量完成）

### 5.1 新 findings

| ID | 檔案 | 嚴重度 | 類別 | 證據 / 根源 / 修法 |
|---|---|---|---|---|
| **F2** | `ops/deploy/backend-restart.sh`/`ota-publish.sh`/`ota-rollback.sh`/`apk-publish.sh` | **P1** | ops | 「唔准喺 Eric 真機 QA 進行緊嗰陣部署」（`feedback-no-deploy-during-live-qa.md`）**淨係人手/文檔約定，冇任何代碼守衛**：四個部署 script 全部 `grep -rln "QA進行緊\|live-qa\|LIVE_QA\|qa.hold\|eric-qa"` = 0 命中。同 iOS 模擬器清理已有嘅真實並發 guard（`session-cleanup-guard.py`）唔對稱。修法：仿 `session-cleanup-ios.sh` 嘅 `HOLD_FILE` 機制，加一個 `/tmp/hymn-qa.hold`，四個部署 script 一齊查。 |
| **F4** | `~/Library/LaunchAgents/com.hymnapp.backend.plist` | P2（見下方覆核） | security | `EnvironmentVariables` 入面 `JWT_SECRET`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_VERIFY_SERVICE_SID` 全部明文存喺 plist（唔喺 git repo，但磁碟上呢個檔案對同用戶嘅任何進程可讀，通常 644）。sub-agent 原評 P1；主 agent 覆核：呢個係 launchd 環境變數嘅標準做法（唔係本次改動引入嘅新漏洞），單用戶開發機風險主要嚟自「同機任何進程都讀得到」而非網絡暴露，故降評 **P2**，記錄為既有慣例，建議跟進改用 `chmod 600` 嘅獨立 `.env` 或 macOS Keychain。 |
| **F1** | `backend/scripts/checkDeadLinks.js:38-118` | P2 | ops（設計取捨） | 成個 run（150 個目標×3 秒延遲+解析，約 10 分鐘）淨係頭尾 acquire/release 一次 DB 鎖，`saveDb()` 只喺結尾行一次；其餘寫入者（growLibrary/backfillMeta/alignBackfill/backfillAlbumSearch）都係逐行 acquire→寫→release。效果：`growLibrary`（每 15 分鐘一 tick，`StartInterval` 唔對齊日曆）若啱好撞正 `checkDeadLinks` 每日 04:00 嗰 ~10 分鐘鎖窗，會攞唔到鎖而優雅跳過（兩邊都已經處理呢個情況，唔會崩潰/寫壞）——即每日 04:00-04:10 一個可預期嘅 growLibrary 空窗。修法：`checkDeadLinks.js` 改用同款逐行 acquire/write/release。量度：`grep -c "攞唔到 DB 鎖" /tmp/hymn_growlibrary.log` 睇 04:00-04:15 窗口。 |
| **F3** | `com.hymnapp.albumsearch.plist` | P3 | ops（排程重疊，非資料風險） | `albumsearch` 每小時 `:15` 觸發（一日 24 次），同其他日程（backfillmeta 17:30、alignbackfill 18:40、dbautosync 19:30、usersbackup 03:30、deadlinkcheck 04:00、ytdlpupdate 05:30）都落喺同一小時內但分鐘錯開。因為全部寫 hymns.db 嘅 script 共用 `acquireDbLock`/`releaseDbLock`（`LOCK_MAX_WAIT_MS=5min`、`LOCK_STALE_MS=20min`/`LOCK_HARD_STALE_MS=2h`），撞鐘只會令較慢嗰個優雅跳過，唔會爛資料——純粹係 17:00-19:40/03:00-05:30 兩個時段對外部 API（YouTube/搜尋源）嘅疊加負載值得留意，非急切。 |
| **F5** | `backend/data/hymns.db` | P3 | dead-code | 0 bytes、mtime 2026-09-01，`git status` 顯示 untracked，全 repo grep `data/hymns.db` = 0 引用。應該係人手測試/打錯路徑遺留（真檔喺 `backend/hymns.db`）。可安全刪除。 |
| **F6** | 12 個 `/tmp/hymn_*.log`（全部 launchd plist 嘅 StandardOutPath/StandardErrorPath） | P2 | ops | launchd bootout+bootstrap 唔會 truncate 呢啲檔，`grep -rln "logrotate\|truncate.*log\|MAX_LOG"` 喺 ops/backend 搵唔到任何呢 12 個檔嘅 rotation 邏輯（現時 hymn_backend.log 260K/2440 行、hymn_fetchlyrics.log 196K、hymn_growlibrary.log 176K），對比 `backend/logs/client-log/*.jsonl` 已有 `RETENTION_DAYS=14`+`MAX_FILE_BYTES=50MB` 嘅完整 rotation（`clientLogStore.js`）——呢 12 個 launchd 直出 log 完全冇享受到同一個修法，會無上限增長（最快嘅係 albumsearch 每小時、growlibrary/lyricreaper 每 15 分鐘）。修法：加輕量 size-based truncate，或者搬去同 clientLogStore.js 一樣嘅按日 rotation。 |
| **F7** | `/tmp/hymn_deadlink.log`、`/tmp/hymn_usersbackup.log`、`/tmp/hymn_ytdlpupdate.log` | P3 | ops（未完全根查） | 對應 job 確實跑過（例如 `backend/backups/users-20260904.db` mtime 顯示 usersbackup 09-05 03:30 有跑），但呢三個 log 檔案本身唔存在。`backupUsersDb.js:77` 確認有無條件 `console.log`，理論上唔應該冇輸出——懷疑係 macOS 定期 tmp 清理，非 script 本身問題，但未完全實錘，留待下次 03:30 後即查有冇曇花一現。 |
| **F8** | `backend/scripts/backfillAlbumFrom{ACM,Catalog,Cobuild,Joshua,Keen,MusicBrainz,Nitu,SopSite,Tianyun,Xiaoyang,Xinxin}Catalog.js`（11 檔） | P2 | duplication | 除咗共用 `lib/hymnDb.js`（open/save/query/lock）同 `opencc-js`，5 組邏輯逐檔獨立重寫：`mdEscape()`（9/11 檔）、`fullwidthToHalfwidth()`+`normalizeZh/En()`（7/11 檔）、`extractCandidates()`類標題解析（11/11，各自針對唔同來源嘅括號/分隔符）、`writeReport()`（11/11，幾乎一樣嘅 markdown 報告產生器）、`main()` 整體流程（load catalog→建索引→逐行匹配→lock→寫→報告）。各檔 header comment 自認「抄上一個來源嘅寫法再改」（例如 Nitu「跟返約書亞/天韻嗰個做法」）。修法：抽一個 `backend/lib/albumBackfillCommon.js` 共用 `mdEscape`/`fullwidthToHalfwidth`/normalize pipeline/`writeReport`，每檔淨係留返來源專屬嘅標題解析+匹配規則——粗估可以剷走 9 檔 × 60-100 行重複。 |
| F9 | `backend/scripts/*`（89 檔非 migration） | 無 | dead-code（已核實非死碼） | 全部 89 檔對照全部 plist 嘅 `ProgramArguments` + 真實跨檔引用（`require`/`import`/`execFile`/`spawn` 指向 `scripts/` 路徑 = 0 真命中，唯一命中係各檔自己 header 嘅 `// Usage: node scripts/X.js` 假陽性）：7 個排程中、82 個係 `oneoff-*`/`migrate-*`（已執行一次性）或獨立人手 CLI 工具，mtime 分佈 Jul 27–Sep 5（多個 Sep 5 剛改過，同 Church 611 目錄擴充工程仍在做吻合）。**呢批冇任何檔案夠格判死碼，唔建議刪。** |
| F10 | 全 backend/ | 無 | broken-refs（已核實乾淨） | `grep` 搵殘留 `require(...db.js)`/`from './db'` = 0 命中，09-02 刪 db.js 冇留低斷引用。 |
| F11 | `backend/package.json` | 無 | dependency（已核實乾淨，同主 agent 獨立核實結果一致） | 7 個宣告依賴全部有用到，冇缺、冇多餘、冇 phantom import。 |
| F12 | `session-cleanup-guard.py`/`session-cleanup-ios.sh` | 無 | bug-hunt（已核實冇 bug） | 逐行讀完：guard 正確排除自身 session（`sessionId`/`cliSessionId` 對 `self_sid`）、`lastActivityAt` 支援 epoch/ISO 雙格式、store 讀唔到/空一律 fail-closed（exit 2）；cleanup script 嘅 guard-first-then-kill 次序正確，`PROTECT_RE` 對比本機真實 `ps` 輸出（backend/server.js、cloudflared、tinyproxy、openclaw gateway 全部命中，gateway 仲雙重命中）驗證有效；guard 檢查同真正 kill 之間理論上有幾秒 TOCTOU 窗，但呢個係呢類 guard 結構性局限，唔算 code bug。 |
| F13 | `com.hymnapp.fetchlyrics.plist.disabled-20260813` | 無 | ops（已核實現狀） | `launchctl list` 確認冇載入（排程真係停咗），但 `ps aux` 見到 `fetchLyrics.js --mode ocr --ignore-window` 手動起緊嘅進程，`/tmp/hymn_fetchlyrics.log` 今日 00:32 有新鮮輸出——排程停咗，但 script 本身仍然俾人手動長期用緊（配合歌詞複核工作記錄）。 |
| F14 | `ops/deploy/backend-restart.sh`（正面核實） | 無 | 正面發現 | `launchctl bootout`+`bootstrap` 之後確實有 10 秒內、每秒一次 poll `/api/health`，唔過就寫 `health=FAIL` 落 deploy.log 兼 exit 1——warm-up+health check 機制存在。 |
| F15 | `backupUsersDb.js`／`nightly-db-sync.mjs`（正面核實） | 無 | 正面發現 | 14 天（users）/7 份（hymns gitsync）retention 都係按檔名日期（唔靠 mtime，特登避開 Time Machine/複製導致嘅 mtime 漂移）正確運作，實測現場檔案數目/日期範圍完全符合設定。 |

### 5.2 主 agent 已直接核實嘅部分

- **launchd 時間表全表**（`plutil -p` 全部 10 個 plist 直讀）：
  | Label | 排程 | 備註 |
  |---|---|---|
  | com.hymnapp.backend | KeepAlive+RunAtLoad | JWT_SECRET/Twilio 三個密鑰以明文存喺 plist 嘅 `EnvironmentVariables`（唔喺 repo，但磁碟上任何同用戶進程可讀——標準 launchd 做法，非新問題，僅記錄） |
  | com.hymnapp.growlibrary | 每 900 秒（15 分鐘）一次 | `--budget 6 --delay 4000` |
  | com.hymnapp.deadlinkcheck | 每日 04:00 | |
  | com.hymnapp.backfillmeta | 每日 17:30 | |
  | com.hymnapp.albumsearch | **每小時 :15**（0:15, 1:15 … 23:15，24 個 StartCalendarInterval 項） | 同 growlibrary(每 15 分鐘)、alignbackfill(18:40)、backfillmeta(17:30)冇直接撞鐘，但一日 24 次頻率遠高於其他排程，值得留意對 YouTube/yt-dlp 嘅疊加負載 |
  | com.hymnapp.alignbackfill | 每日 18:40 | `--budget 60` |
  | com.hymnapp.usersbackup | 每日 03:30 | |
  | com.hymnapp.dbautosync | 每日 19:30 | `--max-wait-min 120` |
  | com.hymnops.lyricreaper | 每 900 秒 + RunAtLoad | |
  | com.hymnstream.healthcheck | 每 1800 秒（30 分鐘） | 驅動 `ops/stream/stream-selfheal.sh`（2026-09-05 新增,已獨立經 Opus 兩輪驗收，唔喺本次 1D 範圍內重審，僅記錄其存在同「最多每日自動 restart backend 2 次」嘅安全閥會影響 backend 進程壽命/log 連續性） |
  | com.hymnstream.ytdlpupdate | 每日 05:30 | |

  **冇發現嚴重時間撞鐘**（memory 提到嘅「launchd job 時間撞」响呢個快照未見；albumsearch 24 次/日頻率係唯一值得留意的高頻項）。

- **`/tmp/hymn_backend.log` 不可靠佐證**（見 DEAD-2）：`clientLog.js:12-16` 自己註解證實 macOS 整機重啟會清 `/tmp`，08-15~17 三日 beacon 曾全部蒸發，因而催生咗 `lib/clientLogStore.js` 嘅持久化設計——但 `[deprecated-route]` 呢類 log 冇享受到同一個修法。

- **package.json 依賴清潔度**：`node --version` = v26.0.0（原生 `fetch`，冇 `node-fetch` 依賴，乾淨）；`Object.keys(dependencies)`（bcryptjs/compression/cors/express/jsonwebtoken/opencc-js/sql.js）同 `node_modules` 頂層目錄逐一核對，其餘全部係 express 的傳遞依賴，**冇多餘/冇缺**。

- **備份/日誌體積健康度**：`backend/logs/` 1.1MB（client-log 14 個 jsonl + admin-audit.log 60KB + metrics 兩個 json，符合 clientLogStore.js 自訂 14 天保留），`backend/backups/` 414MB（7 個 hymns.db.bak-gitsync 每日快照 + 14 個 users-*.db 每日快照，觀察期內未見 retention 裁剪但绝对量細，暫唔算問題）。

---

## 6. 好嘢（已核實非問題，唔重複列做 finding）

- `authSecret.js` 冇 hardcoded fallback，冇 env 就 `process.exit(1)`。
- `auth.js` 冇 user enumeration（登入失敗一律回同一句），bcrypt.compare 安全。
- `invites.js`/`share.js` 嘅 `hitsByIp` sweep-on-threshold 寫法正確，係全 codebase 應該推廣嘅範本。
- `inviteRedeem.js` 嘅 `UPDATE...WHERE used_by IS NULL` + `getRowsModified()` 喺 sql.js 單執行緒下係真·無競態。
- `presence.js`（route+lib）已經過 P5/P7/Opus2 N1/N4 多輪加固，`MAX_ENTRIES=5000`+訪客優先剔除、per-IP 節流、掛載次序 defense-in-depth 全部核實屬實。
- `hlsPlaylist.js` box 解析邊界處理正確、fail-closed。
- `opsMetrics.js`/`warmLog.js`/`clientLogStore.js` 三個持久化模組都有明確上限（`MAX_HOURLY`/`MAX_LASTSEEN`/`MAX_IDS_PER_DAY`/`MAX_FILE_BYTES`+`RETENTION_DAYS`）。
- `stream.js` 的 iOS webm/opus 502 攔截係刻意、已文檔化、風險最小化嘅做法（非 bug，係已落地嘅 platform-diff 正確範例）。

---

## 附錄 A：完整 route 清單（path / 檔案 / auth）

| Route | 檔案 | Auth |
|---|---|---|
| `/.well-known/apple-app-site-association`、`/apple-app-site-association` | server.js | open |
| `GET /app.apk`、`GET /downloads/app.apk` | server.js | open |
| `GET /api/health` | server.js | open |
| `GET /api/version` | server.js | open |
| `GET /api/app-version` | server.js | open（HLS 單機 gate 邏輯喺呢度） |
| `GET /api/internal/activity` | server.js | open（意圖內部專用，未強制，見 SRV-5） |
| `GET /api/hymns`、`GET /api/hymns/lyrics` | server.js | open |
| `GET /api/home/daily-verse` | home.js | open |
| `GET /api/home/*`（其餘 9 條） | home.js | open，410 stub |
| `GET /api/search/*`（全部） | search.js | open，410 stub |
| `GET /api/category/*`（全部） | category.js | open，410 stub |
| `GET /api/audio/:youtubeId` | audio.js | open，410 stub |
| `GET /api/audio/cache/stats`、`/cache/warm-stats` | audio.js | open（診斷用） |
| `POST /api/auth/register` | auth.js | open，422 永久封 |
| `POST /api/auth/login` | auth.js | open（IP 限速） |
| `GET /api/auth/me` | auth.js | authed（Bearer JWT） |
| `POST /api/auth/otp/request` | otpAuth.js | open（有限速） |
| `POST /api/auth/otp/verify`、`/otp/verify-ticket` | otpAuth.js | open（**冇本地限速**——OTP-1） |
| `POST /api/auth/register-phone` | otpAuth.js | ticket-gated |
| `POST /api/auth/login-phone` | otpAuth.js | open（IP+phone 限速） |
| `POST /api/auth/reset-password` | otpAuth.js | ticket-gated |
| `GET /api/auth/otp/status` | otpAuth.js | open |
| `POST /api/auth/invite-check` | invites.js | open（限速） |
| `GET/POST/PUT/DELETE /api/me/*` | me.js | authed |
| `POST/DELETE /api/me/playlists/:id/share` | share.js | authed（同時受 `/api/me` 前綴節流，見 SRV-3） |
| `GET /p/:token`、`GET /api/p/:token` | share.js | open（IP 限速） |
| `GET /.well-known/assetlinks.json` | share.js | open |
| `POST/GET/DELETE /api/friends/*` | friends.js | authed |
| `POST/GET /api/me/invites` | invites.js | authed |
| `POST /api/invites/redeem` | invites.js | authed |
| `GET /api/admin/invites`、`POST /api/admin/invites/:code/revoke` | invites.js | admin |
| `POST /api/presence/heartbeat` | presence.js | open（IP 限速） |
| `GET /api/admin/presence` | presence.js | admin（掛載次序 + 自身 guard 雙重保障，已核實） |
| `GET/PATCH /api/admin/hymns/:id`、`POST /api/admin/hymns`、`/preview`、`/:id/delist`、`/activity/added`、`/activity/delisted` | admin.js | admin |
| `GET /api/stream/:hymnId.m3u8`（掛喺 `/api/stream` 同 `/api/hls` 兩個 prefix） | hls.js | open，靠 client manifest `hlsEnabled`/`hlsDeviceIds` 做 staged-rollout（非安全邊界） |
| `POST /api/stream/warm`、`GET /api/stream/:hymnId` | stream.js | open |
| `POST /api/client-log` | clientLog.js | open，**冇任何限速**（CLOG-1） |

**若要排優先次序**：CLOG-1（未認證+同步 fs I/O+零限速，最平最真嘅 DoS 面）→ OTP-1（驗證碼冇本地防猜）→ F2（部署期冇 QA guard，可能撞正 Eric 真機測試）→ RESOLVE-P1（yt-dlp/whisper 孤兒進程）→ HLS-1/RESOLVE-P2a/P2b（記憶體/檔案無上限增長，暫未爆但結構性缺口）→ F8（11 檔重複，維護成本）→ 其餘 P3。
