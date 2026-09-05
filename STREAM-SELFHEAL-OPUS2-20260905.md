# 串流自動修復梯 —— Opus 5 第二輪獨立驗收 2026-09-05

覆核對象:`STREAM-SELFHEAL-OPUS-20260905.md` 三條必修(F1/F2/F3)+ 兩條拍板(F4/F5)+ F6 更正。
Commits:`21fcbc5` `7347993` `82821eb` `c85bac8`。

**驗收方法**:唔信 exec sheet 嘅數字,全部用我自己搭嘅 harness 由零重跑 ——
獨立 mock HTTP server(可逐個 request 控制 206/403)、雙 slot 假 yt-dlp、假 apply/restart
(逐次 call 記數)、獨立 scratch git repo + `HYMN_DEPLOY_DIR` override、假 `launchctl`。
全部喺 scratchpad,`SELFHEAL_LOG_MD`/`SELFHEAL_STATE`/`HEALTH_STATE`/`SELFHEAL_HISTORY`
env override。**冇改任何 source、冇 commit、冇掂 production state / 真 symlink /
restart / launchctl 改狀態命令。**

---

## 一頁判定

| 項 | 判 | 一句話 |
|---|---|---|
| F1 rollback 空 target guard | ✅ **PASS** | 兩條路徑都唔會整出 dangling symlink;正常 rollback 冇被 guard 打爛 |
| F2 節流 | ✅ **PASS**(exec sheet 數字全部重現)+ 🟡 **一個未覆蓋嘅缺口** | 形態穩定時完美;**形態 flap 可以完全繞過節流** |
| F3 needsHuman + false-green | ✅ **PASS** | cf≥2 補漏正確,blip 冇被打爛;🟡 pending 分支確認保持警報 |
| F4 `--same-code` | ✅ **PASS**(主張全部成立)+ 🟡 **一個豁免過闊** | package-lock 算 code ✅;`backend/data/*.js` 係真 code 但被豁免 |
| F5 stale 門檻 + 時區 | ✅ **PASS** | launchd interval×3 正確,時區冇 bug(兩邊都 naive local) |
| F6 更正 | ✅ **PASS** | 常數同自相矛盾兩處都改啱 |
| 健康時零副作用 | ✅ **PASS** | 健康 tick 連 selfheal 都唔會被叫;就算叫都只寫一個 state JSON |

**最終上線判定:🟢 可以開街**,但要行 plist reload 兩句(見 §8)。
另外兩個 🟡 建議補(都係幾行嘅改動),**唔阻住開街**,細節喺 §2b / §4b。

---

## F1 — rollback 空 target guard ✅ PASS

### F1-A 唔係 symlink(`tools/yt-dlp` 換成普通可執行檔)

輸入:`consecutiveFail=2`、`midfail=3`(形態①)、閒置 slot 有候選。

```
action=ytdlp-not-symlink   alert=True   tick=2   form='①yt-dlp'
apply-calls=0                      ← 完全冇 call apply
file-unchanged=YES (mtime+size+mode+md5 全部一致)
is-symlink-now=NO                  ← 冇被改造成 symlink
SUPERVISION 行數=1  🔴「形態①但 yt-dlp 唔係 symlink,要人手」
```

✅ 「唔 apply、唔 rollback、needsHuman」三樣齊。原本 Opus §4 P1 嗰個最壞後果
(`ln -sfn "" yt-dlp` 整出空 target)喺呢條路徑上**結構上唔可能發生**——因為
`-z "$before_target"` 一入到就短路走咗。

### F1-B rollback 前核 executable(target `chmod -x`)

symlink 有效指住 `ytdlp-venv-a/bin/yt-dlp`,但將該檔案 `chmod -x`;候選 slot b 壞
(mock 回 403)逼出 rollback 分支。

```
action=ytdlp-swap-rollback   alert=True
post-symlink=ytdlp-venv-b/bin/yt-dlp   ← 冇郁,亦冇整死
still-symlink=YES
msg: …⚠️ rollback guard 唔過(before_target='ytdlp-venv-a/bin/yt-dlp' 唔係 <dir> 下可執行檔),
     為安全冇郁 symlink,而家現役可能仍然係 …,要人手核實同修正
```

✅ 唔會 rollback 去一個已經行唔到嘅版本,訊息夠人話。

### F1-C 負控(我加):guard 過 → 正常 rollback 要仲 work

```
post-symlink=ytdlp-venv-a/bin/yt-dlp    ← 正常揈返轉頭
msg: …已 rollback 返 ytdlp-venv-a/bin/yt-dlp。升級做③…
```

✅ guard 冇順手殺死好路徑(呢個係新加 guard 最容易踩嘅坑,exec sheet 冇測)。

### F1-D 邊界(我加):`before_target` 係絕對路徑

`ln -sfn <絕對路徑> yt-dlp` 嘅情況下,guard 用 `$YTDLP_DIR/$before_target` 拼出嚟嘅
路徑唔存在 → guard 判 false → 唔 rollback。結果 symlink 仍然有效可執行(停喺新版)+ 警報。

**判斷:非 bug,方向 fail-safe。** 生產實測係相對路徑(`readlink backend/tools/yt-dlp`
→ `ytdlp-venv-b/bin/yt-dlp`),同 `update-ytdlp.sh:194` 嘅 `ln -sfn "ytdlp-venv-$IDLE_NAME/bin/yt-dlp"`
一致,所以生產命中唔到。記低作為 residual。

---

## F2 — 節流 ✅ PASS(但有一個未覆蓋嘅缺口)

### F2-a 12-tick soak —— exec sheet 數字全部獨立重現

形態①持續(冇候選 → `ytdlp-no-candidate`),`consecutiveFail` 2→13:

```
cf=2   ytdlp-no-candidate        ← 唯一一次真郁手
cf=3..13  ytdlp-throttled-wait   ← 11 次
apply-calls   = 1    (要求 1)   ✅
history lines = 12   (每 tick 一行)✅
SUPERVISION   = 1    (要求 ≤1)  ✅
```

第 14 tick(`cf=14`,距離上次啱好 12):

```
apply-calls=2  SUPERVISION=2  action=ytdlp-no-candidate   ✅ 窗口正確,唔係永久收聲
```

形態轉變即時 due(`cf=15`,轉形態②):

```
restart-calls=1  SUPERVISION=3  action=backend-restart-ok  ✅ 冇被 12-tick 窗口拖住
```

安全閥觸頂 + 節流(我加,7 個 tick):`apply-calls=0`、`SUPERVISION=1` ✅
——`(( due == 1 )) && supervision` 呢個寫法喺三條 alert-only 分支上都 work。

### F2-b 🟡 缺口:形態 flap 可以完全繞過節流(exec sheet 冇測)

節流 key 係 `form_kind`。但真實故障期間 `midfail` 會自然喺 2 呢條界上下跳
(探測得 3 首歌,`midfail` 2 vs 1 就係 ①yt-dlp vs ③YouTube側 之差)。
我用 `midfail` 3/1 交替餵 20 個 tick(=10 個鐘):

| 情境 | 20 tick 嘅 apply 次數 | SUPERVISION 行數 | swapsToday |
|---|---|---|---|
| 形態穩定(F2 設計情境) | 2 | 2 | — |
| **形態 flap(①↔③)** | **10** | **20** | **0** |

即係**節流完全失效,退返做 P7 修之前嗰個行為**(每個 tick 一行 SUPERVISION-LOG,
持續故障一日 48 行)。

而且 `swapsToday` 全程 **0** —— 因為 `ytdlp-no-candidate` / canary-FAIL 嗰陣 symlink
冇變,每日安全閥根本冇被消耗。所以**每日安全閥攔唔到呢種 apply 風暴**。
每次 `update-ytdlp.sh --apply` 都會行一次 `pip install --pre yt-dlp[default]`(打 PyPI),
如果有新版仲會 canary **打 YouTube 兩次 resolve + 兩次 mid-range**。喺形態③
(YouTube 側擋緊)嘅時候每個鐘去撩 YouTube,方向啱啱相反,亦有 429 風險。

**建議修(幾行,唔阻開街)**:節流 key 由 `form_kind` 改做「有冇 alert 連續住」,
或者另外加一個唔理形態嘅 `lastApplyTick`,兩者取嚴。`form` 換咗仍然可以即時**寫一行
SUPERVISION**(新消息要通知),但**唔應該即時再 call apply**。

---

## F3 — needsHuman + false-green ✅ PASS

### F3(a) `stream-status.sh`

| consecutiveFail | alert.active | needsHuman | exit | 判 |
|---|---|---|---|---|
| 0 | false | **False** | 0 | ✅ 健康冇被打爛 |
| 1 | false | **False** | 1 | ✅ 單次 blip 容忍保住 |
| 2 | false | **True** | 1 | ✅ 補漏生效 |
| 3 | false | **True** | 1 | ✅ |
| 0 | true | **True** | 1 | ✅ 舊行為保留 |

### F3(b) swap-ok 拆兩支

```
healthy_a=1 → action=ytdlp-swap-ok            alert=False  pending=None   SUPERVISION 🟢
healthy_a=0 → action=ytdlp-swap-ok-pending-a  alert=True                  SUPERVISION 🟡
              pending=layerA-after-ytdlp-swap(…,backend failCache(playbackRetry)約60秒,…)
              → stream-status: needsHuman=True  healthy=False
```

✅ Opus §2a 嗰個 false-green 真係冇咗。兩層(alert.active + cf≥2)都會叫醒人。

### 🟡 我加嘅對抗測試:兩層防守共用同一個單點

`stream-health-state.json` 唔見咗 / 內容爛咗 →
`consecutiveFail` 讀出嚟係 **0** → selfheal 行**恢復分支**,寫
「✅ 自動修復梯:健康已恢復」兼清 alert(**假恢復**);而 F3(a) 嗰層都係讀同一個檔,
一樣見到 0。即係「defense in depth」兩層踩同一個單點。

**但唔會靜靜死**:`stream-status.sh` 嘅 `stale` 判斷讀唔到 `lastCheck` →
`ageMin=None` → `stale=True` → `needsHuman=True`、exit 2(實測確認)。
所以人仲係會收到通知,只不過訊息係「偵測本身可能死咗」——啱嘅訊息。

**判斷:🟡 非阻斷**(呢個係修改前已經有嘅行為,唔係呢輪引入)。窗口好窄
(healthcheck 啱啱寫完個檔就即刻 call selfheal)。建議日後 selfheal 分開
「讀到 0」同「讀唔到」,讀唔到就當唔敢郁手。

---

## F4 — `backend-restart.sh --same-code` ✅ PASS

用完全隔離嘅 scratch git repo + `HYMN_DEPLOY_DIR` override,全部 `--dry-run`。
Production `~/.hymn-deploy/approved.json` md5 跑前跑後一樣(`e8da8f29…`),`deploy.log` 冇被寫。

| Case | 情境 | flag | rc | 結果 |
|---|---|---|---|---|
| F4-1 | HEAD == approved | — | 0 | ✅ 正常路徑 |
| F4-2 | HEAD 領先(docs + runtime) | — | 1 | ✅ 照舊 abort |
| F4-3 | 同上 | `--same-code` | 0 | ✅ 過,印 `mode=same-code approved=… head=…` |
| F4-4 | 領先真 `backend/routes/stream.js` 改動 | `--same-code` | 1 | ✅ abort + 「已試過 --same-code…有真實差異」 |
| **F4-5**(我加) | `backend/package-lock.json` 改咗 | `--same-code` | **1** | ✅ **算 code,abort** —— 任務問嘅嗰條 |
| **F4-7**(我加) | `backend/data/worshipGroups.js` 改咗 | `--same-code` | **0** | 🟡 **放行**(見 §4b) |
| **F4-8**(我加) | `backend/public/app-version.json` 改咗 | `--same-code` | 0 | ✅ 可接受(唔係 server.js 載入嘅 code) |
| **F4-9**(我加) | working tree 有未 commit `backend/routes` 改動 | `--same-code` | **1** | ✅ **第 2 步照擋** —— 最重要嗰條安全性 |
| **F4-10**(我加) | approved sha 唔存在於 repo | `--same-code` | **1** | ✅ fail-safe(`git diff` 出錯 → 當有差異) |

**生產實況核實**(`--dry-run`,唯讀):

```
唔加 flag → ❌ abort:HEAD (c85bac8…) ≠ approved (d89b3ad…)
加 --same-code → ✅ 過(mode=same-code)
```

即係 Opus §3b 講嗰個「②永久 gate-blocked」係**真嘅**,而 F4 真係解到。

### 4b 🟡 排除清單有一處過闊:`backend/data/*.js`

`':!backend/data'` 之下有**真嘅可執行 JS**:

- `backend/data/worshipGroups.js`
- `backend/data/knownPerformers.js`

(被 `backend/scripts/growLibrary.js` / `backfillAlbumFromPlaylists.js` 等 6 個 script `import`)

**點解唔阻開街**:我核過 `backend/server.js` 嘅 import graph(routes/ + lib/,冇一個
喺 `data/`/`public/`/`logs/`),所以 **backend restart 本身唔會載入呢兩個檔**;
佢哋只影響另外幾個獨立 launchd job。而且第 2 步嘅髒檔案豁免清單本來就已經豁免
`backend/data/`,即係「未 commit 嘅 worshipGroups.js 改動照過」呢個窿**修改前已經存在**,
`--same-code` 只係將佢由「working tree」擴到「已 commit」。

**建議收緊**(實測可行,我試過 pathspec 重新納入嘅寫法係**唔 work** 嘅 —— git
exclude 會贏,要用第二條獨立 diff):

```bash
git diff --quiet "$APPROVED_SHA" "$HEAD_SHA" -- backend \
     ':!backend/hymns.db' ':!backend/data' ':!backend/public' ':!backend/logs' \
  && git diff --quiet "$APPROVED_SHA" "$HEAD_SHA" -- \
     'backend/data/*.js' 'backend/data/*.mjs' 'backend/data/*.cjs'
```

實測:只改 `backend/data/*.json` → 放行 ✅;改 `worshipGroups.js` → abort ✅;同一 sha → 放行 ✅。

### 4c 安全性總結:有冇可能 restart 到未批准嘅 backend code?

- 已 commit 嘅 `backend/**` code(routes/lib/server.js/package.json/package-lock.json)
  → **唔可能**,`git diff` 逐個 byte 比 ✅
- 未 commit 嘅 backend code → **唔可能**,第 2 步原封不動保留(F4-9 實測)✅
- `backend/data/*.js` → **可能**,但唔喺 server.js 嘅 import graph(§4b)🟡
- `backend/public/` → 可能,但係靜態 data,而且本身唔使 restart 就 live ✅
- `~/Library/LaunchAgents/com.hymnapp.backend.plist`(bootstrap 會重讀)→ 一路都唔喺
  gate 範圍內,**呢輪冇變**,pre-existing ⚠️

另外一個 F4 令佢**第一次真正可達**嘅 pre-existing 風險:`backend-restart.sh` 用
`set -euo pipefail`,`launchctl bootout` 之後如果 `bootstrap` 失敗,script 即場 exit,
backend 會**停喺卸載咗嘅狀態**。selfheal 會收到 rc≠0 → `backend-restart-failed` →
🔴 SUPERVISION + `restartsToday+1`(有人被叫醒),所以唔算靜默故障,但呢條路以前
永遠 gate-blocked、從來冇喺生產行過。開街後第一次形態②要留意。

---

## F5 — stale 門檻讀 launchd + 時區 ✅ PASS

真 `launchctl print gui/501/com.hymnstream.healthcheck` 輸出(唯讀核實)含
`	run interval = 10800 seconds` —— 同 script 個 `grep -oE 'run interval = [0-9]+'` 對得上。
(注意:plist 檔上已經係 1800,但 launchd 未 reload,live 仲係 10800 —— 同 §8 待辦一致。)

| 測試 | 結果 |
|---|---|
| interval=10800 → 門檻 540:ageMin 539 / 541 | `stale=False` / `stale=True` ✅ 門檻卡準 |
| interval=1800(reload 之後)→ 門檻 90:ageMin 89 / 91 | `False` / `True` ✅ |
| launchctl 讀唔到 → fallback 270:ageMin 269 / 271 | `False` / `True` ✅ |
| 同一個 ageMin=300 喺兩個門檻下 | 540→`False`,270→`True` ✅ 真係讀緊 launchd,唔係死寫 |
| 顯式 `STALE_MIN=5000` + launchctl 讀唔到 | `stale=False` ✅ override 優先 |
| interval=0 / 垃圾 | 用返 fallback 270 ✅ |

### 時區 ✅ 冇 bug

- 寫:`stream-healthcheck.sh:148` `datetime.datetime.now().isoformat(timespec='seconds')` → **naive local**
- 讀:`stream-status.sh` `fromisoformat(lastCheck)` vs `datetime.datetime.now()` → **naive local**
- 兩邊同一種,無 offset 錯位。機器 `TZ=HKT +0800`,香港冇 DST。
- 生產 live 實測:`lastCheck=2026-09-05T14:37:50 ageMin=12 stale=False needsHuman=False` ✅
- 防守:如果有人日後改寫成 UTC `…Z`,aware − naive 會拋 `TypeError` → `ageMin=None` →
  `stale=True` → 通知人。**方向 fail-safe** ✅
- 時鐘向前跳:`ageMin=-120` → `stale=False`,唔會誤報 ✅

---

## F6 — 更正 ✅ PASS

1. `FAIL_TTL_PLAYBACK_MS = 60 * 1000`(`backend/lib/resolveAudio.js:46`),
   `FAIL_TTL_MS = 15 * 60 * 1000`(`:30`);`backend/routes/stream.js:299` 確係
   `resolveAudioUrl(hymn.youtube_id, { playbackRetry: true })`。
   更正**正確**,`stream-selfheal.sh` 註解同 `pendingRecheck` 字串都一齊改咗 ✅
2. 「冇改 production state」嗰句自相矛盾已經改成「跑生產健康檢查會更新 `lastCheck`
   係設計內副作用」——同 §4 自己嘅證據一致咗 ✅

---

## 7. 整體推演:健康系統會唔會變壞?

| 檢查 | 結果 |
|---|---|
| 健康 tick 會唔會叫 selfheal? | **唔會** —— `stream-healthcheck.sh` 尾段 `if healthy==0 \|\| prev_fail>0` 先叫 |
| 就算叫咗(cf=0 冇 alert)? | 實測 3 個 tick:apply=0、restart=0、**SUPERVISION 檔冇被建立**、history 檔冇被建立、symlink 冇郁,只寫一個 state JSON |
| 恢復訊息會唔會被節流食咗? | **唔會** —— 恢復分支喺 due 計算之前,一定寫 ✅ |
| 單次 blip(cf=1) | 一路短路走,`needsHuman=False` ✅ |
| selfheal state 爛咗 | 重建 default,照走 alert 路徑(fail-safe)✅ |
| production state 檔 | `backend/data/stream-selfheal-state.json` 現時**仲未存在**(系統一直健康,從來冇 fire 過);`.gitignore:101-102` 已加 ✅ |
| 呢輪驗收有冇污染? | `docs/SUPERVISION-LOG.md` 尾段仍係 09-05 落地嗰兩條,冇多;`ops/stream/*` git 乾淨;production `approved.json` / `deploy.log` md5 冇變 ✅ |

**結論:健康路徑零副作用。** 新增風險集中喺「故障期間」,而故障期間最大嘅新風險係
F4 令形態② restart 第一次真正可達(§4c),同 F2 flap 噪音(§2b)。

---

## 8. 要人手行嘅命令清單

### 8.1 必做 —— launchd 重讀 plist(兩句)

plist 檔上已經係 `StartInterval 1800`,但 launchd live 仲係 `10800`。
呢兩句俾 session guard 擋,要 Dispatch / Eric 喺終端機行:

```bash
launchctl bootout gui/$(id -u)/com.hymnstream.healthcheck
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnstream.healthcheck.plist
```

核對(唯讀,唔會俾 guard 擋):

```bash
launchctl print gui/$(id -u)/com.hymnstream.healthcheck | grep -E 'run interval|state'
# 期望:run interval = 1800 seconds
```

行完之後 `stream-status.sh` 嘅 stale 門檻會**自動**由 540 分鐘收窄做 90 分鐘(F5 已驗)。

### 8.2 必做 —— reload 之後即刻核一次現況

```bash
ops/stream/stream-status.sh
# 期望:{"healthy":true,…,"stale":false,"needsHuman":false,…}  exit 0
```

### 8.3 建議做 —— 開街後 24 小時 check(唔使改嘢)

```bash
tail -20 ~/.hymn-deploy/deploy.log          # 有冇 mode=same-code 嘅 restart
tail -30 backend/data/stream-selfheal.log   # 有冇 throttled-wait / no-candidate 風暴
grep -c '自動修復梯' docs/SUPERVISION-LOG.md # 一日超過 ~4 行 = 撞正 §2b flap 缺口
```

### 8.4 唔使做

- **唔使**再行 `approve.sh` —— `--same-code` 已經解決咗「dbautosync 令 HEAD 日日行前」;
  只有**真嘅 backend code 改動**先要照舊 `ops/deploy/approve.sh backend <sha> --confirm`。
- **唔使**手動起 selfheal state 檔 —— 第一次 fire 嗰陣自己會建。

---

## 9. Residual(全部非阻斷,建議之後補)

| # | 項 | 嚴重度 | 建議 |
|---|---|---|---|
| R1 | F2 節流可以俾 `midfail` 喺 2 附近 flap 完全繞過(20 tick → 10 apply / 20 行 log,每日安全閥攔唔到) | 🟡 中 | 加一個唔理形態嘅 `lastApplyTick`,同 `form_kind` 取嚴;form 換咗照寫 log 但唔即刻 apply |
| R2 | `--same-code` 豁免咗 `backend/data/*.js`(真可執行 code,不過唔喺 server.js import graph) | 🟡 低 | 加第二條 `git diff --quiet … 'backend/data/*.js'`(§4b,已實測) |
| R3 | `stream-health-state.json` 唔見/爛 → selfheal 假報「健康已恢復」清 alert | 🟡 低 | selfheal 分開「讀到 0」同「讀唔到」;`stream-status.sh` 嘅 stale 已經頂住,唔會靜默 |
| R4 | rollback guard 對絕對路徑 symlink target 會 false-negative(唔 rollback,但唔會整壞) | 🟢 極低 | 生產用相對路徑,唔命中;記低就算 |
| R5 | `backend-restart.sh` bootout 成功但 bootstrap 失敗會令 backend 停喺 down(pre-existing,但 F4 令佢第一次可達) | 🟡 低 | 開街後第一次形態② 留意;可考慮 bootstrap 失敗時再試一次 |
