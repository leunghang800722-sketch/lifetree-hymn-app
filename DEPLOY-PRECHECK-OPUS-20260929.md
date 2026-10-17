# 部署前獨立驗收 2026-09-29(Opus)

範圍:A `56b0f93` backend 部分(`POST /api/auth/renew`)/ B `5a0ddc4` selfheal PATH / C restart 前 worktree 覆核。
全部喺 scratch(`/private/tmp/claude-501/.../scratchpad/opus3/`)做;prod backend 只打過一次 `GET /api/health`(200)。

## 判詞

| 項 | 判詞 |
|---|---|
| A `56b0f93` backend | **可以部署**(有一個新風險要 Eric 知情,唔阻部署) |
| B `5a0ddc4` selfheal PATH | **可以部署** |
| C worktree 覆核 | **可以部署**,restart 只會帶入 `auth.js` +11 行;你嘅結論有一處講錯(worshipGroups.js 其實 server 冇 import),但結論方向更安全 |

⚠️ 前提:restart 前要 `approve.sh backend <HEAD>`。現行 approved=`78f9c5b`,用 `--same-code` 都過唔到(實測 gate 擋:`auth.js` 同 `backend/scripts/oneoff-delist611Testimony-20260911.mjs` 都當 code 計)。

---

## A. `POST /api/auth/renew`

改動:`routes/auth.js` +11(import `../lib/requireAuth.js` 存在;掛 `requireAuth`;用 `req.user` 簽新 30d token)。

**隔離 harness**(scratch 抄 `lib/{requireAuth,authSecret,loginRateLimit,rateLimit,userDb}.js` + `routes/auth.js`,
`users.db` 落 scratch(`USER_DB_PATH` 由 `__dirname` 推,有 assert 唔係 scratch 就 abort),JWT secret 喺 process 內隨機生成,
`127.0.0.1` 隨機 port,跑完 `process.exit`,已核冇殘留 process)。**16/16 PASS**:

| 情況 | 結果 |
|---|---|
| 有效 token | 200;`user` 有 `id/username/email/phone/role`(role 由 DB 讀,NULL→`member`;phone NULL 照回 null) |
| 新 token payload | `{id,username,iat,exp}`,壽命 2,592,000s = 30 日,同 login 一樣 |
| 冇 header / `Basic` / `Bearer ` 空 / 亂碼 | 401 |
| 過期 token | 401(冇 `ignoreExpiration`) |
| 錯 secret 偽造 / `alg=none` / 改 payload 保留舊簽名 | 401 |
| OTP ticket(`{phone,purpose}`,同 secret 簽,冇 `id`) | 401(`bind(undefined)` 拋錯→catch→401) |
| 簽名啱但 user 唔存在 / 簽發後被刪 | 401 |
| 改咗密碼後用舊 token | **200(照續)** |
| `GET /api/auth/renew` | 404(只 POST) |
| 200 次連續有效 renew | 200×200(冇 rate limit) |
| 50 次壞 token renew 之後 login | login limiter 冇被污染 |

**衝突檢查**:`/api/auth/*` 其他 route(login/me/otp/*/register-phone/login-phone/reset-password/invite-check)冇同名;
冇 `app.use('/api/auth', …)`;server.js 喺 auth routes 之前嘅 middleware(access log / compression / host redirect)全部 `next()`。

**發現**

- 🟡 **新風險:token 可無限續期,而系統冇任何撤銷機制。** 刪用戶→即刻 401(`requireAuth` 每次查 DB,冇問題);但改密碼/`reset-password` **唔會**令舊 token 失效(**既有風險**:login/me/`/api/me/*` 本來就係咁,最多撐 30 日)。
  `renew` 將呢個窗口由「最多 30 日」變成「只要 30 日內 renew 一次就永遠有效」——偷咗 token 嘅人改密碼都踢唔走。schema 冇 `disabled`/`token_version`/`password_changed_at`,即係冇「停用帳戶」概念(admin 路由亦冇)。
  用戶量細(幾十人)+ 主要係為咗修「日日用都被登出」,我判可接受;建議之後加 `token_version`(或 `password_changed_at` 比 `iat`)先至完整。
- 🟢 renew 冇 rate limit(`/api/me/*` 有 per-user 60/min;`/api/auth/me` 同樣冇)。每次成本 = 1 次 HMAC verify + 1 次 SELECT + 1 次 sign,冇 bcrypt,冇 brute-force 面(要先有有效 token)。低。
- 🟢 同一秒內 renew 兩次會攞到一模一樣嘅 token(`iat` 同秒)——無害。
- 🟢 `requireAuth` 嘅 `last_seen_at` UPDATE 冇 `saveUserDb`(既有,同 renew 無關)。

**只部署 backend、App 係舊 bundle**:`git grep auth/renew 78f9c5b -- frontend` = 0 行;只有 HEAD 嘅 `AuthContext.js:74` 先 call(未 OTA)。
backend 只係**加**一條 POST route,其他 route 零改動 → 舊 App **零影響**。新 frontend 將來 OTA 時:`!resp.ok` 就靜靜算、`{...currentUser, ...data.user}` merge(保留 gender/birthYear),形狀對得上。

## B. `5a0ddc4` selfheal PATH

- diff numstat `5 0`:4 行註解 + `export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"`,位於 `set -u` 之後、任何命令之前。修復梯/配額/節流/gate 攔截邏輯零改動。
- **模擬形態②**(`env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`,state/health/history/SUPERVISION 全部指 scratch,
  `SELFHEAL_RESTART_CMD="ops/deploy/backend-restart.sh --same-code --dry-run"`、`SELFHEAL_APPLY_CMD=/usr/bin/false`、
  `HYMN_STREAM_BASE=http://127.0.0.1:9`、`consecutiveFail=2`,`--healthy-a 0 --healthy-b 1`):

| 版本 | approved.json | restart rc | action |
|---|---|---|---|
| 新(5a0ddc4) | scratch(=HEAD) | **0**(`backend-restart.sh` 行到「檢查全過 --dry-run」) | `backend-restart-recheck-fail`(Layer A 指死 port,預期) |
| 舊(5a0ddc4~1)負控 | scratch(=HEAD) | **127** — `backend-restart.sh: line 63: node: command not found` | `backend-restart-failed` |
| 新 | prod(78f9c5b,只讀) | 1,`abort:HEAD` | `backend-restart-gate-blocked`(冇消耗額度)—— 證明 node 行到、gate 照擋 |
| 舊 | prod | 127 | `backend-restart-failed`(仲食咗一格 restartsToday) |

  跑前跑後 md5 核對 `~/.hymn-deploy/{deploy.log,approved.json}`、`docs/SUPERVISION-LOG.md`、`backend/data/stream-selfheal-{state.json,.log}`:全部冇變。
- `ops/ytdlp/update-ytdlp.sh`:`bash -n` OK;用到嘅外部命令 `readlink/tr/perl/curl/head/ln/date` 全部喺 `/usr/bin:/bin`;`python3` 只喺 slot 唔存在先用(`/usr/bin/python3` 有);yt-dlp venv 用絕對 shebang。**冇同類 127 問題**。實證:`com.hymnstream.ytdlpupdate`(plist 冇 PATH)每日 05:30 canary 都行到(09-19~09-29 十次 PASS、一次 09-24 resolve FAIL)。
  - 🟢 註:`deno` 喺 `/opt/homebrew/bin`,venv 有 `yt_dlp_ejs`。經 selfheal(新 PATH)call 嘅 `--apply` 會搵到 deno,獨立 launchd job 就搵唔到——兩邊 canary 環境唔完全一樣。backend plist PATH 有 `/opt/homebrew/bin`,所以 selfheal 路線反而更貼近 prod。唔使改。

## C. restart 前 worktree 覆核

- server.js 靜態 import graph(連 side-effect import `./lib/dotenv.js`):**40 個檔,全部喺 `server.js`/`lib/`/`routes/`**,冇 `data/*.js`、冇 `scripts/`。`execFile` 只 call `YTDLP`。
- 呢 40 個檔:`git diff HEAD` 空;mtime 新過 PID 991 起動時間(09-21 11:46:14)嘅**只有 `routes/auth.js`**。
- `78f9c5b..HEAD -- backend`:`auth.js` +11、`scripts/oneoff-delist611Testimony-20260911.mjs`(server 唔 import)、`hymns.db`。同你結論一致。
- **更正**:`backend/data/worshipGroups.js` **server 冇 import**——`lib/hymnDb.js:386`、`lib/adminHymns.js:171` 只係註解提到個名。真正 import 佢嘅係 `scripts/`(growLibrary/reconcileChannels/backfill* 等 20 個 script)。所以 restart 同佢**完全無關**。
  佢嘅未 commit diff(+61/−18)係將 18 個 inPool group 補 `channel`/`note`(2026-08-01 audit 數據);mtime=ctime=birth=09-05 19:44:03,之後冇郁過。runtime 風險 = 零(server 唔載入);`node` import 得到(`ACTIVE_GROUPS,GROUPS,PENDING_GROUPS`,79 個 group)。
  🟡 唔關今次 restart 但要知:`growLibrary` 等夜晚 script **一直**用緊呢份未 commit 版本(帶 `channel`),HEAD 版反而冇——回滾 / `git checkout` 呢個檔會改變夜晚收歌行為。另外 `backend-restart.sh` 嘅 working-tree 髒檔檢查整個豁免咗 `backend/data/`(R2 收緊只係 sha-to-sha diff),所以 data/*.js 髒改動 gate 本身睇唔到。
- 其他:
  - `backend/.env` mtime 09-06 03:21(冇讀內容)、`lib/dotenv.js` 09-06 — 早過 09-21,已經載入緊。
  - `package.json`/`package-lock.json`/`node_modules/.package-lock.json` 全部 09-02,冇變。
  - node binary:PID 991 載入 `/opt/homebrew/Cellar/node/26.0.0`,而家 `/opt/homebrew/bin/node` 都係 26.0.0,restart 唔會換 runtime。
  - `backend/public/`:只有 ignored 嘅 apk;`app-version.json` 09-06、每個 request 讀,冇 restart 效應。`data/bible-verses.json` 08-13。
  - untracked `backend/data/hymns.db`(09-01)server 冇用(server 讀 `backend/hymns.db`)。`backend/hymns.db` 已經俾 `maybeReload` 追緊。
  - `backend/tools/yt-dlp` symlink 今日 13:24 換咗做 09.27(即 memory 講嘅誤觸 swap),但 `YTDLP` 係 symlink 路徑、每次 exec 先解析 → **已經生效緊**,restart 唔會再帶入新嘢(只係開機會多一行 `🔧 yt-dlp: 2026.09.27…` log)。
  - restart 會照常重新讀 `cache/*.json`(hls-playlist-cache 等)同清 in-memory 狀態(presence Map、limiter)——每次 restart 都係咁,唔係新行為。

## 側效應(如實)

- 喺 scratch 起過一個 node harness(PID 99726,`127.0.0.1` 隨機 port),跑完自己 `process.exit`,已核冇殘留。
- scratch 寫咗:harness 副本 + `users.db`、selfheal 模擬 state/log/supervision 檔、舊版 selfheal 副本、假 approved.json。
- prod:只 `GET http://localhost:3001/api/health` 一次(200);只讀 `~/.hymn-deploy/approved.json`/`deploy.log`、`backend/data/ytdlp-update.log`;用 `plutil -extract EnvironmentVariables.PATH` 只讀咗 3 個 plist 嘅 PATH key(冇讀其他 key)。冇讀 `.env`、prod users.db、secret。
- 冇 restart、冇 launchctl、冇 approve、冇 git 寫、冇改 code。唯一 repo 寫入 = 本報告。
