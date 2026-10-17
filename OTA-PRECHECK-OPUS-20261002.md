# OTA 推送前獨立驗收 — `56b0f93` App 端(token 過期處理)

- 日期:2026-10-02 · 驗收員:Opus(獨立,唔信 commit message)
- 基準:branch `feature/player-rebuild`,HEAD `f596c9b`;上次 OTA `217fe12`(09-07,android `2936d444…` / ios `bf4c92de…`)
- 冇做嘅嘢:冇 OTA/eas(連 list 都冇)、冇 approve、冇 restart、冇 launchctl、冇 git 寫、冇改 code、冇讀 secret/users.db、冇起模擬器

## 判詞:**可推**(冇 code 層阻塞;有兩項操作上要知情,見「發現」中級)

---

## 1. Release 範圍

| 檢查 | 結果 |
|---|---|
| `git log 217fe12..HEAD -- frontend/hymn-app` | 只得 `56b0f93` |
| `git diff --stat 217fe12 HEAD -- frontend/hymn-app` | 5 個檔:App.js(+13/-1)、src/api.js(+28)、src/authSession.js(新,54)、src/context/AuthContext.js(+52/-3)、src/sync/userSync.js(+21/-10) |
| `git status --porcelain -- frontend` | 空(乾淨);4 個改動 src 檔 worktree 同 HEAD `cmp` 一致 |
| 217fe12 之後 mtime 有變嘅非 build 檔(排除 android/ios/node_modules/.expo/dist) | 只有上面 5 個檔 |
| `.env*` | 唔存在 |
| app.json / package.json / package-lock / babel.config / eas.json / index.js | 全部 tracked,mtime 全部早過 09-07,唔喺 diff |
| `patches/` | 冇新改動 |
| `node_modules` | `.package-lock.json` 08-24;09-07 之後改過嘅檔 = 0 |
| runtimeVersion | app.json 冇改(ios `"5"` / android `"4"`) |
| approved.json | 仍係 `217fe12` → 推之前要行 approve.sh 批 `f596c9b`(其餘 HEAD 新 commit 全部唔掂 frontend) |

## 2. 逐行 code review

**JWT 解析(`authSession.js`)**
- 手寫 base64url → `%xx` → `decodeURIComponent`,冇用 `atob`/`Buffer`/`TextDecoder`(grep 確認,diff 入面淨係注釋提到 atob)。用到嘅 API(`String.replace`、`indexOf`、`decodeURIComponent`、`JSON.parse`、`Number.isFinite`)Hermes 全部有。用 `babel-preset-expo` 轉完再過 RN 0.85 自帶 `hermesc -emit-binary`:編譯成功。
- 冇 `exp`/`exp` 係字串/壞 base64/非 JSON/得一節/null/undefined/空字串/非法 UTF-8 → `null` → `isTokenExpired=false`(當「唔知」,交 server 401 兜底)。中文 username、有 `=` padding 都解得啱。全部冇 throw(harness jwt:* 12/12)。
- 時鐘:用裝置 `Date.now()`。機時鐘快過「剩餘有效期」會喺本地當過期登出(罕見);機時鐘慢就永遠唔當過期,靠 server 401。

**401 → 清 session**
- 觸發點只有兩類:`api.js` 17 個帶 token 嘅 admin/friends/invites 函數(`throwIfUnauthorized`),同 `userSync` 嘅 `runOp`/`pullData`/`pushSync`(`checkAuth`)。heartbeat 冇加(佢本身對壞 token 當訪客 204)。
- **唔會觸發**:`login`、`loginPhone`、`verifyOtpTicket`、`registerPhone`、`resetPassword` 全部行 AuthContext 自己嘅 fetch/`postAuth`,冇 call `reportUnauthorized`。訪客(token=null)就算食 401,handler `if (!rejected …) return` 擋咗。
- handler 只處理「被拒 token === 而家個 token」→ 舊 request 遲返嘅 401 唔會踢走啱啱重新登入嘅 session。
- 並發:5 個 401 同時返嚟 → `sessionExpired` 係 boolean,App.js effect 只 fire 一次 → 1 個 Alert(harness b2)。
- 登出方式係 `clearAuth()` 而**唔係** `logout()` → **outbox 同 owner 保留**(harness b4)。即係 TOKEN-REVOKE-OPUS 講嘅「要行登出先會清 outbox」嗰個風險,喺新 bundle 下過期/撤銷呢條路已經冇。不過重新登入(同一個人)會行 §2.3 `pushSync`(server 係 union merge,`INSERT OR IGNORE`)然後 `clearOutbox()` → outbox 入面**未推出去嘅刪除**(fav_remove/pl_delete)會喺重登後復活。呢個係既有行為,唔係今次引入。
- 錯誤文案:api.js 401 改拋 `code='unauthorized'`、訊息「登入已過期,請重新登入」;admin 畫面會同時見到呢句同 Alert(UX 小重複,無害)。

**renew**
- 門檻 `exp - now <= 23 日` 先續;只喺 AuthProvider mount(冷啟)行一次 → 頻率最多約每 7 日一次,唔係每次開機。
- 失敗(404/401/500/網絡/壞 JSON/200 但冇 token)全部 `return`,舊 token 保留,冇 Alert(harness e:* 6/6)。renew 401 唔會 call `reportUnauthorized`(唔會因為 renew 失敗而登出)。
- 成功:`saveAuth(newToken, {...currentUser, ...data.user})`,保留 gender/birthYear(harness d)。
- race:`tokenRef.current !== current` 擋「期間登出/換帳戶」(harness e:race)。舊 token 喺 renew 之後仲有效(server 冇撤銷舊 token),所以同時飛緊嘅開機請求唔會 401;就算 401,handler 只認新 token,唔會誤踢。
- response 形狀:`backend/routes/auth.js:66-70` 回 `{ token, user:{id,username,email,phone,role} }`,同 App `data?.token && data?.user` 夾。`jwt.sign` 預設帶 `iat=now`,過得 `token_valid_after` 撤銷檢查。

**App.js**:只改 `useAuth()` 解構多兩個值 + 一個 `sessionExpired` → `Alert` effect。冇掂 PlayerProvider/播放/watchdog/HLS。

**訪客 / 已登入剩 >23 日**:開機零額外網絡請求、零 state 變化(harness g、g2)。有變嘅只係「之後真係食到 401」嗰刻(以前靜靜失敗,而家登出+Alert)。

## 3. Harness(scratch,冇留 repo)

位置:`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/ota-pre/harness.cjs`。由 `git show <rev>:` 抽出真 `authSession.js`/`AuthContext.js`/`api.js`/`userSync.js`,babel 轉 CJS,mock AsyncStorage/MMKV/fetch/config,用真 `react-dom/client` + jsdom render `AuthProvider`。App.js 嘅 `sessionExpired`→Alert effect 由 App.js 原文 regex 抽出嚟執行(唔係人手抄)。

| 探針 | HEAD | 217fe12(負控) |
|---|---|---|
| a 過期 token 開機 → 登出、1 個 Alert、冇 renew、冇 crash | PASS | **FAIL**(token 照留、0 Alert) |
| b authed 401 → state+storage 清走;b2 5 個並發 401 → 1 個 Alert | PASS | **FAIL** |
| b4 401 後 outbox/owner 保留 | PASS | PASS(不變量) |
| b5 重新登入後舊 token 遲返 401 → 唔踢 | PASS | PASS |
| c 登入密碼錯 / OTP 錯 / email 登入 401 → 唔觸發;c2 已登入狀態下 loginPhone 401 → session 保留 | PASS | PASS(不變量) |
| d 剩 10 日 → renew 1 次、新 token 落 state+storage;d2 29 日 / d3 23.05 日 → 唔 call;d4 22.95 日 → call | PASS | d、d4 **FAIL**(冇 renew) |
| e renew 404/401/500/網絡/壞 JSON/冇 token → 靜靜算;e:race renew 喺登出後先返 → 唔復活 | PASS | PASS |
| f 撤銷 token(未本地過期,server 401 via pushSync)→ 清 + 1 Alert | PASS | **FAIL** |
| g 訪客零影響;g2 剩 29.5 日開機零 fetch | PASS | PASS(不變量) |
| jwt 邊界 12 個 + 時鐘偏差 2 個 | PASS | n/a |
| d5 [資訊] fetch 同步 resolve(早過 React re-render)| **不續期**(見發現 L2) | n/a |

HEAD:39 項 38 PASS + 1 個資訊項;負控 217fe12 有 7 個區分探針(a、a2、b、b2、d、d4、f)FAIL → harness 分得出新舊。b3(錯誤 code)兩版都 PASS,唔算區分探針。

## 4. 同已部署 backend 相容(prod,冇用真 token、冇登入)

| 請求 | 結果 |
|---|---|
| `GET /api/health` | 200 `{"status":"ok"}` |
| `POST /api/auth/renew`(冇 token) | 401 `{"error":"unauthorized"}` → route 已部署(唔係 404) |
| `GET /api/auth/me`(亂碼 token) | 401 `{"error":"Invalid or expired token"}` |

App 只睇 `status === 401`,唔睇 body → 兩種 body 都夾。renew 只睇 `resp.ok` + `data.token/user`。

## 5. 兩平台

`56b0f93` 冇 `Platform.*` 分支、冇 native module、冇 Hermes 欠缺嘅 API;`Alert.alert` 兩個掣喺 Android/iOS 都支援。`ota-publish.sh` 用同一個 working tree 先後推 android、ios。冇發現平台專屬風險。

## 6. 回滾

- `ops/deploy/ota-rollback.sh`(只讀咗 code,冇行 —— 佢預覽模式都會 call `eas update:view`):冇 `--confirm` 只預覽;有就 `eas update:republish` 兩個平台。目標由 `ota-groups.log` 每個平台嘅尾二行推算。
- `ota-groups.log` 而家最後一行:android `2936d444-24f0-4c94-a598-27eaaa05ca21` / ios `bf4c92de-66a7-41d2-8140-7b854f1b5f2c`(217fe12,09-07)。09-02 之後冇 rollback 行。今次推完,自動目標會啱啱好係呢兩個 group。publish 攞唔到 group id 都只會寫 `unknown`,唔影響推算尾二行。
- **限制**:回滾換返舊 JS,但**已經被清走嘅登入(AsyncStorage 已刪)唔會返嚟**,啲人要自己再登入。

## 7. 風險評估

- **預期效果**:token 已經過咗 30 日嘅用戶,下次冷啟會見到一次「登入已過期」。佢哋本身已經靜靜壞咗(同步失敗、admin 出 unauthorized),所以呢個係修正,唔係 regression。數量要睇 users.db(今次冇權讀)。
- **最壞情況**:backend 對有效 token 大規模回 401,例如 users.db 搵唔到(`getUserDb` 會開個空 DB)、`JWT_SECRET` 換咗、批量寫 `token_valid_after`、或者 `requireAuth` 嘅 catch-all 撞到例外。以前咁只會令同步靜靜失敗;推咗之後,所有活躍用戶下一個 authed 請求就會被登出,而且回滾都救唔返。冇設密碼嘅舊電話用戶要行 OTP/忘記密碼。呢個係 backend 事故嘅放大器,唔係 App bug。
- **使唔使分階段**:我判斷唔使。App 端冇 code 層 bug,出錯最多係「Alert + 要重新登入」,唔會蝕資料(outbox/本地資料都留低)。如果 Eric 想分:
  - `eas update --rollout-percentage`:expo-updates 56 支援,但 `ota-publish.sh` 冇呢個 flag,要改 script + 過 gate,而且之後要 `eas update:edit` 推到 100%。可以做,但成本最高。
  - 先 iOS 後 Android:script 而家一次過推兩邊,要人手分開或者改 script。
  - JS 內按 deviceId gate:要出新 commit,今次唔建議。
  - 最平嘅替代做法:推之前確認 backend auth 穩定(health ok、冇計劃中嘅 users.db/secret 變動),推完由 Eric 部機冷啟兩次確認冇 Alert(token 仲有效嘅話)。

## 發現(按嚴重度)

- **中 M1:server 401 而家會直接令 client 登出。** 見上面「最壞情況」。唔阻推,但推完之後任何掂 users.db、`JWT_SECRET`、`token_valid_after` 或 requireAuth 嘅 backend 操作都要當高風險,因為 OTA 回滾救唔返已經清走嘅 session。
- **中 M2:推之後即刻會有一批真過期用戶見到 Alert。** 屬預期,但 Eric 應該知;冇設密碼嘅用戶要行忘記密碼/OTP。
- **低 L1:**過期期間 outbox 入面嘅刪除,同一個人重新登入後會復活(`/api/me/sync` union merge + `clearOutbox`)。既有行為。Alert 文案「最愛同清單唔會唔見」講新增係啱,刪除嗰邊冇保證。
- **低 L2:**renew 只喺冷啟行一次。如果 fetch 喺 React re-render 之前 resolve,`tokenRef` guard 會令今次 renew 靜靜跳過(harness d5 用同步 resolve 先重現到;真網絡幾乎冇可能)。後果只係下次冷啟再試。
- **低 L3:**裝置時鐘快過「剩餘有效期」會喺本地被當過期登出。
- **資訊 I1:**`PlaylistDetailSheet.js:100` 有一個帶 Bearer 嘅 fetch 冇接 401 報告(覆蓋缺口,無害,同舊行為一樣)。
- **資訊 I2:**admin 畫面 401 時會同時見到錯誤字同 Alert。

## 側效應(如實)

- 我抽取源碼時 zsh `$rev:f` 展開出錯,加上 `cd` 失敗,喺 repo 根目錄整咗兩個空殼目錄 `src-HEAD/`、`src-217fe12/`(各有一個 0 byte `App.js` 同兩個空子目錄)。大約一分鐘內已經用字面路徑 `rm`+`rmdir` 清走,覆核 `ls src-*` 冇嘢、`git status -- frontend` 乾淨。
- 有一個 `rm -f $d/$f` 被安全檢查擋咗(冇執行),之後改咗寫法,冇再用 rm 清 scratch 以外嘅嘢。
- scratch 寫咗:抽出嚟嘅源碼、`harness.cjs`、`authSession.expo.js` / `authSession.hbc`(hermesc 輸出)。
- repo 只寫咗本檔。對 prod 只打咗 3 個允許嘅請求。冇 kill 任何 process。
