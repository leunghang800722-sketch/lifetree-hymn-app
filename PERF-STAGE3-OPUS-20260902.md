# PERF-STAGE3-OPUS-20260902 — Stage 3 dead-code 清理 獨立驗收（Opus 5）

驗收對象：`d8b7f04` `5baf3e1` `3227fc3` `b13088f` `bbaeec8` `2c47252` `8a837eb`（HEAD = `8a837eb`，驗收期間冇新 commit 插入）。
依據：`PERF-STAGE3-EXEC-20260902.md`（執行單）、`PERF-STAGE3-20260902.md`（Sonnet 5 報告）、`PERF-BASELINE-1A-20260902.md` A4、`PERF-BASELINE-OPUS-20260902.md` §4e。
方法：**全部零引用結論由我重新做過**，冇引用執行者嘅 grep 輸出。

---

## 0. 驗收方法（含我自己嘅陷阱防護）

§4e 記錄過 zsh 令 `--include=*.js` 被 glob 展開 → grep 靜靜咁 0 hit 嘅陷阱。今次改用**另一條路徑避開晒**：

1. 用 `git ls-files` + `git ls-files --others --exclude-standard` + `ls ~/Library/LaunchAgents/*.plist` 砌一份**明文檔案清單**（1,236 個檔，含全部 `*.js/cjs/mjs/json/sh/md/py/plist/yml/txt`、17 個 LaunchAgent plist、`backend/Dockerfile`、`backend/.dockerignore`、兩個 `package.json`、`.gitignore`、全部 `README.md`），再 `grep -F -f <28個basename> $(cat 清單)` 一次過掃。**冇用 `--include`，所以 glob 陷阱結構上唔可能發生。**
2. **正控（同一份清單、同一條指令）**：

| 正控 pattern | hits |
|---|---|
| `resolveAudio` | 199 |
| `backend-restart.sh` | 175 |
| `server.js` | 167 |
| `hymnDb.js` | 154 |
| `serverDb.js` | 28 |

　全部非零 ⇒ 條 grep 掃得到檔案內容，「0 hit」係真結論唔係 silent zero。
3. **plist 掃描本身嘅正控**：`grep -l 'node' ~/Library/LaunchAgents/*.plist` 回 9 個檔 ⇒ plist 真係喺掃描範圍入面。
4. `.github`、`Dockerfile`、`docker-compose.yml`、根 `README` 我逐個 `ls` 確認存唔存在：**`.github`/根 Dockerfile/compose/README 全部唔存在**；只有 `backend/Dockerfile` + `backend/.dockerignore`（兩個都已納入掃描清單）。

Raw：scratchpad `allfiles.txt`（清單）、`hits.txt`（80 條命中原文）、`chain.mjs`（import graph）、`harness.mjs`（route harness）。

---

## 1. 逐 commit 判定

| commit | 項 | 判定 |
|---|---|---|
| `d8b7f04` | S3-1 七個 tracked 備份檔 | **PASS** |
| `5baf3e1` | S3-2 backend root 14 script + db.js | **PASS（一個保留：`.dockerignore` 未同步）** |
| `3227fc3` | S3-3 六爬蟲 + 一 oneoff | **PASS** |
| `b13088f` | S3-4 home.js 剷 queryAll/queryOne/getDb | **PASS** |
| `bbaeec8` | S3-5 deviceId.js 剷 `__resetForTest` | **PASS** |
| `2c47252` | S3-6 文檔加註 | **有保留（覆蓋唔齊：4 個提及檔只註咗 2 個）** |
| `8a837eb` | 執行報告 | **PASS（一處說明文字唔準確，數字全對）** |

---

## 2. 逐檔零引用重驗（29 個被刪檔）

`grep -F` 全部 28 個 basename（`db.js` 太通用另外單獨處理，見 §2.3），命中 80 行。**逐行讀完，可執行引用 = 0。** 命中分佈：

### 2.1 純文檔命中（唔算引用）
`PERF-BASELINE-1A-20260902.md`、`PERF-IMPROVEMENT-PLAN-20260902.md`、`PERF-STAGE3-EXEC/20260902.md`、`REDESIGN-PLAN.md`、`THIRD-PASS-REVIEW-20260822.md`、`YTDLP-UNIFY-PLAN-20260822.md`、`docs/SUPERVISION-LOG.md`。全部係盤點／規劃／歷史記錄文字。

### 2.2 需要逐行判嘅命中（我全部讀過原文）

| 命中位置 | 判斷 |
|---|---|
| `ops/perf/baseline-20260902/1a-a4-depcheck-backend.json` | **掃描器自己嘅輸出**（`"using": {"sql.js": [...]}` 列住 13 個被刪 script 嘅絕對路徑）。§4e A4-5 已經標過呢個自我命中。唔係 referrer。 |
| `backend/routes/audio.js:5` | comment 提及 `check_hymns.cjs`。冇 import。 |
| `backend/scripts/backfillAlbumFromCatalog.js:3,98`、`backfillAlbumFromMusicBrainzCatalog.js:4,126` | comment + `console.error('…請先跑 node scripts/fetchSopCatalog.js')` 提示字串。我另外跑 `grep -E "^\s*(import\|const .*require)" … \| grep -i "fetch.*catalog"` = **0** ⇒ 冇 import/require。兩個 backfill 腳本只讀 catalog JSON，Sonnet 講法核實。 |
| `backend/hymn-check-report.txt:1333` | 保留嘅產物檔內嘅說明文字（`使用 backend/update_hymn_link.js 更新 youtube_id`）。純文字。 |
| `backend/scripts/restoreKidsLyricsC4.js:10,27`、`ops/deploy/nightly-db-sync.mjs:112,172`、`docs/SUPERVISION-LOG.md` 多處、`TAXONOMY-5D-PLAN.md:342`、`.gitignore:68` | 全部係 **`hymns.db.bak-*` 呢個 prefix**（`-c4swap-20260802`／`-gitsync-`／`-taxonomy-`），**唔係**被刪嘅 `backend/hymns.db.bak`。substring 撞中，唔係引用。我確認 `backend/hymns.db.bak-c4swap-20260802` 仍然喺碟上（gitignored，Stage 3 冇掂）。 |
| **`backend/.dockerignore:6-15`** | **⚠️ 真.檔名列表**，見 §5。 |

### 2.3 `backend/db.js` 專項（執行單特別點名）

```
grep -rnE "(require|from)\s*\(?\s*['\"]\.{1,2}/db(\.js)?['\"]" --include='*.js' --include='*.cjs' --include='*.mjs' --exclude-dir=node_modules .
→ 0 行
```
**同一條 regex 形狀嘅正控**（`../lib/hymnDb.js`）→ 5+ 行命中 ⇒ regex 本身 work。
額外：`backend/lib/hymnDb.js` **冇** `require('./db')`；`backend/scripts/*` 全部零命中。
再加一條更強嘅檢查（見 §3）：由 `server.js` 出發嘅完整 import graph 34 個 module，**冇一個係 `db.js`**。
⇒ **`backend/db.js` 零引用成立**，`seed.js` 係佢生前唯一 requirer（同批刪走）。

### 2.4 `seed.js` / `update_db.js` 有冇被 Dockerfile / README 當 setup 步驟（執行單特別點名）

- `backend/Dockerfile` 全文我讀晒：`COPY . .` → `CMD ["node", "server.js"]`，**冇任何 seed/migrate 步驟**。
- `backend/package.json` `scripts` = `{"start": "node server.js"}` **一條**。frontend = `expo start/run:android/run:ios/patch-package`。
- 根目錄冇 README；`ops/launchd/README.md`、兩個 harness README 零命中。
⇒ **成立**。

### 2.5 launchd / ops shell
17 個 LaunchAgent plist、全部 `ops/**/*.sh`、`ops/**/*.mjs`：**28 個 basename 零命中**（正控見 §0）。

---

## 3. launchd job 唔會壞（執行單第 2 點）

用 `PlistBuddy -c "Print :ProgramArguments"` 逐個 `com.hymn*.plist` 讀原文，再逐個 `[ -f ]`：

| plist | 目標 | 存在 |
|---|---|---|
| com.hymnapp.backend | `backend/server.js` | ✅ |
| com.hymnapp.albumsearch | `backend/scripts/backfillAlbumSearch.js` | ✅ |
| com.hymnapp.alignbackfill | `backend/scripts/alignBackfill.js` | ✅ |
| com.hymnapp.backfillmeta | `backend/scripts/backfillMeta.js` | ✅ |
| com.hymnapp.dbautosync | `ops/deploy/nightly-db-sync.mjs` | ✅ |
| com.hymnapp.deadlinkcheck | `backend/scripts/checkDeadLinks.js` | ✅ |
| com.hymnapp.growlibrary | `backend/scripts/growLibrary.js` | ✅ |
| com.hymnapp.usersbackup | `backend/scripts/backupUsersDb.js` | ✅ |
| com.hymnops.lyricreaper | `ops/lyrics/session-reaper.sh` | ✅ |
| com.hymnstream.healthcheck | `ops/lyrics/stream-healthcheck.sh` | ✅ |
| com.hymnstream.ytdlpupdate | `ops/ytdlp/update-ytdlp.sh` | ✅ |

**11/11 目標仍然存在。** 再加一層 transitive 檢查：呢 11 個 entry point 有冇 `require`/`import` 任何被刪檔？

```
grep -nE "require\(['\"]\.\.?/(db|seed|update_db|check_hymns|generate_hymns|fetch_songs|fix_missing|bulk_insert_hymns|update_hymn_link|fix_dead_ytdlp|expand_[a-z0-9_]*|e2_[a-z_]*)" backend/scripts/*.js backend/*.js backend/lib/*.js backend/routes/*.js ops/deploy/*.mjs
→ 0 行
```
⇒ **PASS**。

---

## 4. 回歸證據夠唔夠（執行單第 3 點）

### 4.1 `node --check`
`backend/server.js` + 全部 `backend/routes/*.js` + 全部 `backend/lib/*.js`：零輸出 = 全部過。

### 4.2 我自己加咗一層 —— 完整 import graph 解析（比 `node --check` 強）

`node --check` **只驗語法，唔會 resolve import 目標**，所以佢單獨證明唔到「刪咗檔之後 boot 唔會 `ERR_MODULE_NOT_FOUND`」。我照執行單指示**冇** `import('./backend/server.js')`（會觸發 precache burst），改用靜態遞歸解析：由 `backend/server.js` 出發，regex 抽晒 `import … from './…'` / `import('./…')` / `export … from './…'` / `require('./…')`，逐層 resolve + `fs.existsSync`：

```
resolved modules: 34
missing: (none)
```

34 個 module 全部存在，**冇一個係 29 個被刪檔之一**（graph 入面 `lib/` 19 個 + `routes/` 14 個 + `server.js`）。
⇒ server.js 頂層 import 鏈**完全冇踩到被刪嘅嘢**，`node --check` + 呢個 graph 合埋，覆蓋度足夠判「boot 唔會爆」。

### 4.3 執行報告嘅 `node --check` 表述
Sonnet 寫「`node --check` 全 backend … 過（零輸出=零語法錯）」—— 表述**準確、冇越界**（冇聲稱佢等於 boot 驗證）。限制 #6 亦明文講咗唔係一鏡到底。**冇報大。**

---

## 5. S3-4 / 410 stub 回歸（執行單第 5 點）—— 我自己打過

scratchpad harness：`express` 由 `backend/node_modules/express/index.js` 絕對路徑 dynamic import，掛 `routes/{home,search,category,audio}.js` 四個 router 落一個新 express app，`listen(0)` 攞 ephemeral port，**完全冇 import `server.js`，冇 precache burst**。

```
200  /api/home/daily-verse      {"text":"…","ref":"約翰福音 16:33"}
410  /api/home/daily-quote      {"error":"Gone",…}
410  /api/home/top-verses       {"error":"Gone",…}
410  /api/search/all?q=x        {"error":"Gone",…}
410  /api/category/mandarin     {"error":"Gone",…}
410  /api/audio/abc123          {"error":"Gone",…}
--- lib/serverDb.js (即 /api/hymns 嘅資料路徑) ---
hymns view count = 6405
```

- `/daily-verse` **仍然 200 兼有真內容** ⇒ 剷走 `getDb` import 冇整爛佢（佢本身讀 `data/bible-verses.json`，我讀過 home.js:32-43 確認）。
- search / category / audio **各打一條，全部 410**，`[deprecated-route]` log 照出。
- `serverDb` 仍然開得、`hymns` = **6,405**，同 Sonnet 報告嘅數一致。
- 我另外讀晒現行 `home.js`（69 行）：`fs`/`path`/`fileURLToPath` 保留係啱嘅（`/daily-verse` 三個都用緊），冇殘留死碼。

⇒ **S3-4 PASS。**

---

## 6. S3-5 frontend（執行單第 4 點）

### 6.1 改動範圍
`git show bbaeec8 -- src/deviceId.js` = **淨係刪咗 `export function __resetForTest()` 六行**（含 comment），`_deviceIdPromise` 呢個 module 變數同 `getOrCreateDeviceId` 一個字冇改。**確認「只刪 export」成立。**

### 6.2 零引用重驗
```
grep -rn --include='*.js/jsx/ts/tsx/json' --exclude-dir=node_modules/dist/.expo -F "__resetForTest" frontend/
→ 0 行（連定義都冇咗）
正控 getOrCreateDeviceId → App.js / src/perfMarks.js / src/deviceId.js 三個檔
```
`frontend/hymn-app/tools/ota-harness`、`tools/react-harness` 兩個目錄我確認存在並喺掃描範圍內。⇒ **成立**。

### 6.3 `expo export` 3,720,357 B 可唔可以對照 —— **我決定唔重跑，理由如下**

- `ops/perf/stage3-20260902/s3-5-export-hbc-size.log` **有存 raw `ls -la`**（`3720357` + hash `index-d9669ea4….hbc`），`s3-5-expo-export.log` 有 exit 訊息、`1407 modules`、`7099ms`。呢個修正咗 §6 Errata #4「export 產物冇存檔」嗰個缺失，**做得啱**。
- **但呢個數字冇對照組，而且結構上唔可能有**：export 喺 `16:10` 做，當時 tree 已經含 2B 嘅 `4321f46`/`297bf52`/`8a2e729`（F-1/F-2/instrument）。同 1B 嘅 `main.jsbundle` 3,716,119 B 比只差 4,238 B，但嗰個係另一條 pipeline（Release build，唔同 HEAD），**兩個數唔可比**。
- 執行單 S3-5 嘅回歸定義就係「**成功 = bundle 編譯通過**」，唔係 size 對照。Sonnet **冇**聲稱過個 size 有歸因意義。
⇒ 重跑一次 export 只會再攞多一個同樣冇對照組嘅數（兼有機會撞 2B 用緊嘅 Metro），**冇資訊增益**。判 **PASS**，同時記低：**呢 6 行嘅 bundle 影響量度唔到、亦冇人聲稱量到**。

---

## 7. 數字重算（執行單第 6 點）

逐個 `git show --stat` 加總，我獨立重算：

| 項 | 檔 | 插入 | 刪除 |
|---|---|---|---|
| S3-1 `d8b7f04` | 7 | 0 | 3,367 |
| S3-2 `5baf3e1` | 15 | 0 | 1,660 |
| S3-3 `3227fc3` | 7 | 0 | 1,074 |
| S3-4 `b13088f` | 1 | 5 | 25 |
| S3-5 `bbaeec8` | 3 | 19 | 6 |
| S3-6 `2c47252` | 2 | 6 | 6 |
| **合計** | **35** | **30** | **6,138** |

- 35 檔 ✅ / +30 ✅ / −6,138 ✅ / 淨減 6,108 ✅ / 移除檔 7+15+7 = **29** ✅ —— **報告全部數字對得上。**
- S3-2 逐檔行數再加一次：125+176+41+53+132+115+199+225+94+49+80+110+50+112 = **1,561**（＝§6 Errata #1 我更正過嗰個數）+ `db.js` 99 = **1,660** ✅。
- S3-3：163+186+151+178+123+183+90 = **1,074** ✅。
- **不用 `base..HEAD` 對數呢個決定係啱嘅**：2B 三個 commit 真係交錯喺中間（`d8b7f04` … `4321f46`/`297bf52`/`8a2e729` … `2c47252`），直接 diff 會夾帶。頁首聲明 + 限制 #1 講得清楚。

### ⚠️ 一處說明文字唔準確（唔影響數字）
報告 S3-1 寫「3,367 行（`.db` 二進位檔以刪除前 wc -l 計）」。**唔係**：`git show --stat` 對兩個 `.db` 顯示 `Bin 126976 → 0 bytes` / `Bin 40960 → 0 bytes`，**行數貢獻 = 0**。3,367 = 622+638+1,025+1,078+4，**純粹係五個 JS/文字檔**。1A 表入面嗰個 `wc -l` 103/51 **冇**入到呢個總數。數字啱，解釋錯。

---

## 8. 漏網之魚（執行單第 7 點）

### 8.1 🔴 `backend/.dockerignore` —— **1A 同 Stage 3 兩邊都漏咗**

```
backend/.dockerignore:6:hymn-check-report.txt
backend/.dockerignore:7:check_hymns.js
backend/.dockerignore:8:check_hymns.cjs
backend/.dockerignore:9:bulk_insert_hymns.js
backend/.dockerignore:10:fetch_songs.js
backend/.dockerignore:11:fix_missing.js
backend/.dockerignore:12:generate_hymns.js
backend/.dockerignore:13:seed.js
backend/.dockerignore:14:update_db.js
backend/.dockerignore:15:update_hymn_link.js
```

- **點解兩邊都見唔到**：`.dockerignore` 冇副檔名，1A 同 Stage 3 用嘅係 `--include='*.js' --include='*.md' …` 白名單式 grep，**呢個檔結構上唔會被掃到**。我今次用「明文檔案清單」而唔係 `--include`，先撞得返出嚟。**呢個係方法論教訓**：`--include` 白名單會靜靜咁漏走冇副檔名嘅設定檔（`.dockerignore`、`.gitignore`、`Dockerfile`、`Procfile`、`Makefile`）。
- **影響評估：功能上零影響。** Docker 對配唔到嘢嘅 ignore pattern 係 no-op（`check_hymns.js` 呢一行本身**一直都係死嘅** —— 由頭到尾只有 `.cjs` 版存在，即係呢個檔已經有先例證明 stale entry 唔會出事）。而且 `backend/Dockerfile` 本身喺現行部署路徑（launchd `com.hymnapp.backend` 直跑 `node server.js`）根本冇用到。
- **∴ 判「保留」唔判 FAIL**：**唔阻 restart**。建議收尾時順手剷 7-15 行（`hymn-check-report.txt` 嗰行要留，個檔仲喺度）。

### 8.2 `src/perfMarks.js :: span` —— **冇刪係啱嘅，而且理由變咗**

1A 列咗三個「真.零引用」export：`span`、`elapsedSinceT0`、`__resetForTest`。Stage 3 只刪咗第三個。
- `elapsedSinceT0`：執行單「唔准掂」明文寫「留待收尾」。我重驗**仍然零引用**（只有 `perfMarks.js:59` 定義）⇒ 正確押後。
- `span`：**已經唔再係零引用** —— 2B 嘅 `8a2e729`（D-1 section span）令佢喺 `HomeScreen.js`、`LibraryScreen.js`、`MineScreen.js` 三個檔真係 import + call（`secChips`/`secPages`/`secToday`/`secRecent`/`libraryRenderMs`/`mineRenderMs` 等）。**如果 Stage 3 照 1A 個清單剷咗 `span`，會即刻整爛 2B 進行緊嘅工作。** 執行單「唔准掂 `src/**`」呢條紅線喺呢度救咗一鑊。
- ⚠️ 但 Sonnet 報告嘅「保留」表只寫「`src/**` 執行單明文禁止」，**冇逐項點名 `span`/`elapsedSinceT0`**，讀者無從知道呢兩項嘅現況已經分岔。建議補一行。

### 8.3 3 個 tracked 產物檔 —— 保留理由我核實過，成立
`docs/HISTORY.md:303,1127` + `HANDOFF.md:108` 實質引用 `hymn-check-report.txt`（「650/665 死」假數據更正記錄，直接支撐現行死鏈規則）；`docs/SUPERVISION-LOG.md:6568,6804,6839` + `docs/LYRICS-CATCHUP-LEDGER.md:455,483,502,516` 記錄兩個 CSV 卡死 deploy gate 六轉嘅真事故。三個檔仍然 `git ls-files` tracked。⇒ **保留正確**。（細節：`hymn-check-report.txt` 而家係孤兒產物 —— 生成者 `check_hymns.cjs` 冇咗。唔係問題，但值得記低。）

### 8.4 S3-6 覆蓋唔齊 —— **有保留**
全 repo 提及被刪檔名嘅**非盤點類**文檔有四個：`YTDLP-UNIFY-PLAN`（已註 4 處 ✅）、`THIRD-PASS-REVIEW`（已註 2 處 ✅）、**`REDESIGN-PLAN.md:313`**（「而家 project 入面有五六個咁嘅檔案…要清走」—— 而家已經清走咗，**冇註**）、**`PERF-IMPROVEMENT-PLAN-20260902.md:25-26`**（用現在式列住「仲 tracked 喺 git」、「4,435 行」，**冇註**）。
`HANDOFF.md` 我獨立重驗：28 個 basename **零命中** ⇒ 「唔使改」成立 ✅。
影響：純文檔陳舊，零功能風險。判**有保留**唔判 FAIL。

### 8.5 §4e / 1A A4 其餘項目對數
- 4 條 route 前端零引用（§4e 窮舉法）→ 已由 2A `ebe29ba` 處理成 410 stub，Stage 3 按執行單唔刪檔 ✅。
- `search.js`/`category.js` 重複 inline `queryDb()`（1A 候選表最後一行）→ 我讀晒兩個檔，**inline loader 早已隨 2A 剷清**，兩個檔而家各得 ~25 行純 stub。Sonnet「檢查完發現冇嘢好做」成立 ✅。
- `backend/lib` 28 檔、`src/**` 45 檔全部有 importer ⇒ 冇新候選。
- **冇發現任何「1A/§4e 列過、Stage 3 又刪又冇解釋」嘅項目。**

---

## 9. 「可以安全 restart backend」判定

**✅ 可以。** 依據：

1. `server.js` import graph 34 個 module **零 missing**，冇一個係被刪檔（§4.2）。
2. `node --check` 全 `server.js`/`routes/*`/`lib/*` 過（§4.1）。
3. Harness 實打：`/api/home/daily-verse` 200、五條 410 stub 全中、`serverDb` 開得、`hymns` = 6,405（§5）。
4. `backend/db.js` 零 requirer，同一 regex 形狀有正控（§2.3）。
5. 11/11 launchd job 目標檔仍存在，冇一個 transitive 依賴被刪檔（§3）。
6. 唯一「真.檔名列表」命中係 `backend/.dockerignore` 嘅 stale entry，Docker 語意上係 no-op，而且現行部署路徑根本唔行 Docker（§8.1）。
7. `git status --short backend/` 冇 Stage 3 遺留；`?? backend/data/hymns.db` 係 session 開始前已存在嘅別線檔，而且 `backend/data/` 喺 `backend-restart.sh` 嘅運行時豁免名單入面。

**restart 前仍然要行嘅程序（唔係我批准得嘅）**：`backend-restart.sh` 第 1 關要 `HEAD == approved.json.backend.sha`，即係要 Eric 行 `ops/deploy/approve.sh backend 8a837eb --confirm`。而且 `8a837eb..approved` 之間夾住 2B 三個 **frontend-only** commit（`4321f46`/`297bf52`/`8a2e729`，`git diff --name-only -- backend/` 對佢哋 = 0），approve 嗰陣要知道呢點。

---

## 10. 總判

**Stage 3 可以收貨。** 六個執行 commit 全部 PASS，兩個保留（`.dockerignore` stale、S3-6 註解漏兩個檔）都係**純文檔／零功能風險**，唔阻 restart，建議收尾一併處理。

執行質素上值得記低嘅三點：
1. **拒絕用 `base..HEAD` 對數**、改逐 commit 加總並且喺頁首同限制 #1 兩度聲明 —— 呢個係共用 worktree 環境下正確嘅做法，數字我重算全對。
2. **S3-5 存低咗 raw `ls -la`** —— 直接修正咗 §6 Errata #4 嗰個「產物冇存檔」缺失。
3. **`node --check` 冇被講成 boot 驗證**，限制 #6 明文自曝覆蓋範圍。

我補嘅唯一實質缺口係 §4.2 嘅 import-graph 解析：`node --check` 單獨其實**證明唔到** module resolution，執行單同報告都冇補呢一層，而呢一層先係「刪檔會唔會令 boot 爆」嘅直接證據。結論一致（零 missing），但論證由「語法冇錯」變成「依賴圖封閉」。
