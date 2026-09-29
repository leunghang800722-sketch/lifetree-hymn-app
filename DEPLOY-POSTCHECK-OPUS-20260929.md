# 部署後獨立驗收（Opus）— 2026-09-29 15:17 backend restart（sha 0521d6b）

驗收員：Opus（獨立，部署後）｜時間：2026-09-29 15:18–15:40 HKT
範圍：部署正確性、backend smoke、自動 restart 係咪真係通、`df8a15e` 覆核、監察層現況。
全程只讀 prod；所有模擬寫入都喺 scratch（`scratchpad/opus4/`）。冇 restart、冇 launchctl、冇 approve、冇 OTA、冇真 swap、冇打 YouTube/googlevideo。

## 總判詞

| # | 項目 | 判詞 |
|---|---|---|
| 1 | 部署正確性 | 🟢 通過 |
| 2 | backend smoke | 🟢 通過 |
| 3 | 自動 restart 真係通咗？ | 🔴 **未通**：PATH 修咗，但 launchd 下 cwd=`/` 令 `backend-restart.sh` 喺第一步 `git rev-parse` 就死（rc=128）。selfheal ②、規則 remedy、AI remedy 三條路都中 |
| 4 | `df8a15e` 覆核 | 🟢 通過（有兩條低嚴重度備註） |
| 5 | 監察層現況 | 🟢 健康，冇警報；今日 remedy 配額已經用晒（見 §5） |

---

## 1. 部署正確性 🟢

- `approved.json` backend.sha = `0521d6b14e23…`，approvedAt 07:17:12Z；`deploy.log` 最尾兩行：`approve … sha=0521d6b…`（07:17:12Z）→ `backend-restart | sha=0521d6b… | health=OK | mode=normal`（07:17:14Z）。
- HEAD = `0521d6b14e23f4664b5b3e39e075aa1930d6ea08`。
- 聽 :3001 嘅 PID 6270，PPID 1，`lstart` = Tue Sep 29 15:17:13 2026，cwd `backend/`，同 deploy.log 07:17:14Z 對得上。
- `git diff 0521d6b HEAD -- backend` 係空（HEAD 就係 0521d6b）。working tree `backend/` 只有運行時檔案（hymns.db、data/*.json/md、`?? backend/data/hymns.db`）**另加一個 code 檔案：`backend/data/worshipGroups.js`**（見發現 L1）。我核過：server runtime（`server.js`/`routes`/`lib`）**冇** import 佢，只有 `backend/scripts/*` 用。所以**跑緊嘅 server code = 已批准 sha**。
- 上次批准 78f9c5b → 0521d6b 喺 backend/ 嘅 code 差異只有 `routes/auth.js`（+11 行，新增 `POST /api/auth/renew`，用 `requireAuth`，冇開 ignoreExpiration）同一支 oneoff script（`scripts/oneoff-delist611Testimony-20260911.mjs`，runtime 唔用）。另外 hymns.db 有變。

## 2. backend smoke（只讀）🟢

| 檢查 | 結果 |
|---|---|
| `GET localhost:3001/api/health` | 200 `{"status":"ok"}` 1.6ms |
| `GET https://api.odemusics.com/api/health` | 200 `{"status":"ok"}` 0.8s |
| `GET /api/hymns`（localhost） | 200，5,791,582 B，6669 首，有 `dataVersion` |
| `GET /api/hymns`（public，--compressed） | 200，1,516,362 B（gzip） |
| `GET /api/app-version`（有/冇 `?d=`） | 200，keys = versionCode,versionName,url,hlsEnabled,hlsDeviceIds；**`hlsDeviceIds` 仲喺度（array len 2）**；假 deviceId 攞到 `hlsEnabled:false`，正確 |
| `POST /api/auth/renew` 冇 header / `Bearer garbage` / `Basic` / `alg=none` 偽造 JWT | localhost 同 public 都係 **401** `{"error":"unauthorized"}` |
| `GET /api/auth/renew` | 404（兩邊都係） |
| `/tmp/hymn_backend.log` restart 之後 | 起動序列正常（resolve-cache 319 條、hot-ids、hls cache、yt-dlp `2026.09.27.232945`、pre-cache 200）；之後全部係 `[resolve] ok` / `[access] 200`；**冇 error、fail、exception**；冇 crash loop（PID 6270 由 15:17:13 起一直喺度） |

冇用真用戶 token、冇登入、冇讀 .env/users.db。renew 嘅 401 路徑喺 `jwt.verify` 就已經死，唔會掂到 users.db。

## 3. 自動 restart 係咪真係通咗 🔴

### (a) selfheal 形態②（`env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`；state/health/history/SUPERVISION 全部指去 scratch；`SELFHEAL_RESTART_CMD=backend-restart.sh --same-code --dry-run`；`HYMN_STREAM_BASE=127.0.0.1:9`，所以重驗唔會打 backend）

| cwd | 結果 |
|---|---|
| repo 目錄（前一輪驗收同 t6 V1 都係咁測） | `restart rc=0`：gate「✅ 檢查全過… (--dry-run,唔會真係 kickstart backend)」→ 重驗打死 port → `backend-restart-recheck-fail`（係預期，因為 port 係我故意指死） |
| **`/`（launchd 預設）** | **`restart rc=128` → `backend-restart-failed`，`restartsToday=1/2` 配額照扣** |

負控（冇補 PATH）：`node: command not found`，rc=127。即係 `5a0ddc4` 修正咗 PATH 呢一層，係啱嘅。

**根因**：`ops/deploy/backend-restart.sh:43` 係 `REPO_ROOT="$(git rev-parse --show-toplevel)"`，佢靠 **cwd** 搵 repo，唔係靠 script 自己嘅位置。`com.hymnstream.healthcheck.plist`（`~/Library/LaunchAgents` 同 repo 入面嗰份都係）**冇 `WorkingDirectory`**，launchd 就會用 `/` 做 cwd。`stream-healthcheck.sh`、`stream-selfheal.sh`、`stream-watch.sh`、`stream-diagnose-rules.sh`、`stream-remedy.sh` 全部只係計 `REPO=$(cd … && pwd)`（喺 subshell 入面），冇一個真係 `cd "$REPO"`。結果係 `fatal: not a git repository`，`set -e` 令佢 exit 128。selfheal 只識得認 `abort:HEAD` 做「gate 攔咗」，128 會當咗「重開失敗」計，每次扣一個配額，然後寫 🔴 警報。

### (b) 監察層 remedy 路徑（`STREAM_WATCH_TEST=1` + scratch `REMEDY_STATE`/`WATCH_DIR`/`SELFHEAL_STATE`，facts：`HEALTH_HTTP=500`）

| cwd | 規則診斷 → remedy |
|---|---|
| repo | `restart-backend → exit=0`：gate「✅ 檢查全過」+ 自動加咗 `--dry-run`；VERDICT `fixed-pending-verify` |
| **`/`** | `restart-backend exit=128`，`fatal: not a git repository`；VERDICT `escalate`；**remedy 配額照扣**（restarts=1）。輸出冇 `abort` 字眼，所以唔係記做 gate-blocked |

AI 模式（而家關咗）嘅 cwd 係 `~/.hymn-deploy/stream-incident-<id>/ai/`，都唔喺 repo 入面，所以一樣會中。

**結論**：喺 launchd 排程之下，形態② 自動重開同監察層嘅 restart-backend **依然行唔通**，淨係換咗個錯（127 → 128）。swap-ytdlp（`update-ytdlp.sh`）用 script 位置搵 REPO，**唔受**影響。
**建議修法**（我冇改 code）：揀一樣就得——`backend-restart.sh` 喺 rev-parse 之前 `cd "$(dirname "${BASH_SOURCE[0]}")/../.."`（最乾淨，approve.sh/ota-*.sh 都係同一個 pattern，可以一齊修）；或者 selfheal/remedy 行 RESTART_CMD 之前 `cd "$REPO"`；或者 plist 加 `WorkingDirectory`（要人手 reload）。修完要喺 **cwd=/** 之下重跑 (a)(b)，順手將 t6 V1 改做 `cd /` 先行。

### (c) gate 係 per-sha：HEAD 行前咗之後 `--same-code` 仲放唔放行（真 repo，只讀；用 scratch `HYMN_DEPLOY_DIR` 假 approved.json，模擬「批准咗 X、HEAD 行咗去 0521d6b」）

| 模擬嘅已批准 sha | X..HEAD 喺 backend/ 嘅差異 | `--same-code --dry-run` |
|---|---|---|
| `5a0ddc4` | 冇（只係 docs commit） | ✅ 放行（mode=same-code） |
| `56b0f93` | 只有 `backend/hymns.db`（等同每晚 DB 備份 commit） | ✅ 放行 |
| `0755dde` | `routes/auth.js` + hymns.db | ❌ `abort:HEAD` |
| `78f9c5b` | auth.js + oneoff script + hymns.db | ❌ `abort:HEAD` |

- 會放行嘅：每晚 `chore(db)` 備份、docs/ops/frontend commit，同埋 `backend/data/**` 入面嘅非 .js 檔案。
- **會再被攔**嘅：`backend/` 入面任何 code commit（routes/lib/server.js、`backend/data/*.js|mjs|cjs`），**連 `backend/scripts/` 嘅 oneoff script 都計**。我單獨驗過 c5c1772→f8362b6（淨係加咗一支 oneoff .mjs），pathspec diff 一樣判做 code 改動。所以之後任何人 commit 一支 backend/scripts 嘅 oneoff，自動 restart 就會停，直至有人再 approve。
- 另外 working tree 層（第 2 步）：如果 backend/ 有未 commit 嘅非運行時改動，錯誤訊息係 `abort:backend/ working tree…`，**唔係** `abort:HEAD`。selfheal 認唔到，會當失敗計，扣配額；remedy 就認 `abort`，冇問題。

## 4. 覆核 `df8a15e` 🟢

diff 好細：非測試模式下，喺 `unset` 之前先記低 `REMEDY_DRY_RUN` 係咪字面 `1`，`unset` 完再設返。

假 repo（只抄 HEAD 版嘅 remedy + lib；backend-restart / update-ytdlp / stream-status / yt-dlp 全部換做 sentinel stub）+ 假 HOME，`env -i`，**冇** `STREAM_WATCH_TEST`，同時注入惡意 override（`SELFHEAL_RESTART_CMD`/`SELFHEAL_APPLY_CMD`=evil.sh、`REMEDY_STATE`/`REMEDY_LOG`=evil 路徑）：

- **A. prod + `REMEDY_DRY_RUN=1`**：restart-backend / swap-ytdlp / probe 9999917 / wait / escalate / status 全部 exit 0。sentinel 只記到 `stream-status.sh` 一次（status 本身就係只讀，DRY 下都照行，符合設計）。evil.sh 零次被 call；evil state/log 冇建立；假 HOME 嘅 `.hymn-deploy/` 保持空（冇 state、冇 log、冇 request、冇 lock）。backend log 入面搵唔到 `9999917`，即係 probe 冇真係 curl。→ **零側效應**。
- **B. 只收字面 `1`**：每個值用一個新嘅假 HOME（配額重置）去試，`true`/`yes`/`"1 "`/`" 1"`/`01`/`2`/`""`/`TRUE` 全部當非 dry，sentinel restart 真係 call 咗；只有 `1` 係 dry。
- **C. 配額行先**：配額用晒 + DRY=1 → exit 3 `QUOTA:`，唔會出 DRY-RUN 字樣。已經喺 header 註明，符合描述。
- **D. 新繞過？** 冇發現。`STREAM_WATCH_TEST=1` + 非 tmp `REMEDY_STATE`（`/Users/x`、`/tmp/../Users/x`）照當 prod，evil 冇行。DRY 只會令動作少做，唔會解鎖任何 override；`REMEDY_DRY_RUN` 設返之後冇 export，唔會漏去子 process。
- **測試重跑**（第一個參數都係 scratch）：t1、t2、t3、t5、t6、t8 全部 rc=0，行為同之前報告一致。兩點說明：
  - t2 D2 嘅註解「第 2 次被拒 exit 3」**已經過時**：因為 df8a15e 令 D1 變咗真 dry、唔扣配額，D2 就變咗第一次真 call（exit 0，而且 call 嘅係假 repo 嘅 stub）。行為啱，係測試文字要更新。
  - t8 案 3 出 escalate 唔係 swap：因為機上閒置 slot（b=08.30）唔係新過現役（a=09.27），跟規則係啱嘅。
  - grep 數到嘅「FAIL」其實係 `RESOLVE_FAIL` 呢啲欄位名，唔係測試失敗。
- 備註（低）：① prod DRY 嘅 exit 0 同真成功分唔開，DRY 又唔寫 log。如果將來有人喺 stream-watch 嘅 env 帶住 `REMEDY_DRY_RUN=1`，規則引擎會報 `fixed-pending-verify`，但其實乜都冇做，而且冇留痕。launchd 唔會帶呢個 env，所以現況冇事。② `REMEDY_DRY_RUN=true` 會靜靜變成真做。今朝誤觸就係同類陷阱。建議遇到非 `0`/`1`/空嘅值直接 reject（fail closed）。

## 5. 監察層現況 🟢（配額已經用晒）

- `stream-health-state.json`：lastCheck 15:04:03，consecutiveFail=0，ok 3/3，mid 3/3，yt-dlp `2026.09.27.232945`。
- `stream-watch-state.json`：status=ok，badTicks 0，冇 incident，冇 escalated（mtime 15:04）。`/tmp/hymn_stream_watch.log` 係 0 byte，因為健康嘅時候係邊緣觸發、零輸出，屬正常。`~/.hymn-deploy/STREAM-ALERT.md` 唔存在。`stream-watch.on` + `stream-watch.no-ai` 都喺度，即係規則模式。
- `stream-selfheal-state.json`：今日 swaps 0、restarts 0，冇 alert。
- SUPERVISION-LOG：13:24 人手升級 yt-dlp（b→a）、13:33 串流健康恢復，之後冇 🔴。
- **restart 之後第一個排程 tick（15:34:21）**：consecutiveFail=0，Layer A ok 3/3，Layer B mid 3/3，yt-dlp 09.27；stream-watch-state 喺 15:34 更新，status=ok，冇 incident；冇警報檔；SUPERVISION-LOG 冇新 🔴。**新 backend 喺排程健康檢查下證實健康。**

**今日（到 00:00 HKT 前）配額影響**：
- `stream-remedy-state.json`：swaps 1/1、restarts 1/1。13:24:20 嗰次 restart 其實係 **gate-blocked**（remedy 會先扣配額先行 gate，gate 攔咗都唔會退返）；13:24:42 嗰次 swap 就係真 swap（b→a，verified）。
- ⇒ 今日之內，監察層（規則/AI）嘅 `swap-ytdlp` 同 `restart-backend` 都會回 exit 3，規則診斷只會出 **escalate**（寫警報 + 通知），唔會自動修。
- selfheal 自己嘅配額仲係 swaps 0/1、restarts 0/2，但 ② 因為 §3 嘅 cwd bug 喺排程下一樣 restart 唔到，失敗仲會每次扣一格。selfheal ① swap 仲可以行一次。**selfheal 唔讀 remedy-state**，remedy 嗰邊「合共 swap ≤1」嘅保護只係單向，今日理論上可以再換多次 slot（update-ytdlp 係 canary-PASS 先換，所以風險低）。
- 零晨日期一轉，兩邊配額都會自動歸零。

---

## 發現（按嚴重度）

- 🔴 **H1（新）launchd 下 cwd=/，`backend-restart.sh` 用 `git rev-parse --show-toplevel` 搵 repo → rc=128**。selfheal ②、監察層規則 remedy、AI remedy 三條自動 restart 路喺排程下全部行唔通。`5a0ddc4` 只係修咗 PATH 嗰一層。之前嘅「V1 launchd 等效」同今日 precheck 都係喺 repo cwd 入面跑，所以冇揪到。附帶：selfheal 將 rc=128 當失敗計，每次扣配額 + 寫 🔴。
- 🟡 **M1 remedy restart 喺 gate-blocked 都照扣配額**。今日 13:24 就係咁用咗 1/1。selfheal 對 `abort:HEAD` 會退配額，兩邊唔一致。
- 🟡 **M2 selfheal 嘅 gate-blocked 判斷只認 `abort:HEAD`**。working-tree 髒（`abort:backend/ working tree`）同 rc=128 都會當「重開失敗」，扣配額。
- 🟢 **L1 deploy gate working tree 層豁免咗成個 `backend/data/`**，連 `.js` 都豁免（sha 層 09-05 已經收緊，但 working tree 層冇）。而家 `backend/data/worshipGroups.js` 由 09-05 起一直有未 commit 改動（加咗 channel/note/org 欄位）。server runtime 唔 import 佢，所以跑緊嘅 server 冇受影響，但 backend/scripts（growLibrary 那類）會用未批准版本。
- 🟢 **L2 `backend/scripts/` 嘅 oneoff commit 會令 `--same-code` 失效**，要人手再 approve 先會恢復自動 restart。係咪刻意，要協調者決定。
- 🟢 **L3 `REMEDY_DRY_RUN` 非 `1` 嘅值會靜靜變真做**；prod DRY 嘅 exit 0 同真成功分唔開，又冇 log。
- 🟢 **L4 t2 D2 註解過時**（行為啱）。
- ℹ️ `/api/app-version` 會公開 `hlsDeviceIds` 原值（2 個 deviceId），唔係今次改動引入。`ops/stream/stream-status.sh` 有 09-07 起未 commit 嘅改動（加 403 率欄位，只讀）。

## 側效應（如實）

- 對 prod 嘅寫入：**零**。前後用 md5 比對過 `approved.json`、`deploy.log`、`stream-remedy-state.json`、`stream-watch-state.json`、`stream-selfheal-state.json`、`stream-health-state.json`、`SUPERVISION-LOG.md`、yt-dlp symlink，全部不變。backend PID 6270（lstart 15:17:13）前後都係同一個。
- 對 backend 嘅請求：health ×2、/api/hymns ×3（localhost 2 + public 1）、/api/app-version ×2、`/api/auth/renew` ×10（全部 401/404，冇掂 users.db）。t8 同 t6 會 pgrep 同 curl localhost `/api/health`（只讀）。
- 冇打 YouTube/googlevideo：selfheal 重驗指去 127.0.0.1:9；假 repo 嘅 swap stub 唔會改 symlink，所以唔會觸發 verify_swap。
- scratch 用咗 `scratchpad/opus4/`（sh1、sh2、rm-*、dd-*、fake1、fakehome1、fh-lit-*、tests/）。冇 kill 任何 process。repo 入面唯一寫過嘅檔案就係本檔。
