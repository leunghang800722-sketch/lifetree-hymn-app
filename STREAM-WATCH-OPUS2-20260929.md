# 串流保護監察 Opus 第二輪獨立驗收 2026-09-29

對象：`c0fac01`（script 修正）+ `6f444b6`（test + `STREAM-WATCH-FIX-REPORT-20260929.md`）。依據：`STREAM-WATCH-OPUS-20260929.md`（第一輪）、`STREAM-WATCH-FIX-EXEC-20260929.md`。
證據原檔：`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/opus2/`（`h1/` `fakerepo/` `m1/` `m2/` `m3/` `m4/` `l1/` `suite/*.out` `claude-help.txt`）。
執行者報告我冇當證據用，下面每一項都係我自己重跑或者自己寫新樣本得出嚟。

## 結論

**(A) 規則模式：可以啟用，有條件。** 只需要 `touch ~/.hymn-deploy/stream-watch.on`，因為 AI 而家預設係關（opt-in）。想穩陣啲可以順手 `touch stream-watch.no-ai`。
- PATH 問題已經修好：喺 `env -i`（冇 PATH）底下，watch → 規則 → remedy → `backend-restart.sh --same-code` 成條鏈都行得通，node 都搵得到。
- 但係**以現況，自動 restart 仍然做唔到**。gate 會擋，因為 backend code 同已批准 sha `78f9c5b`（09-10）之間有兩個未批准 commit：
  - `56b0f93`：`backend/routes/auth.js` +11 行，係 09-28 token 過期修正，未部署；
  - `f8362b6`：`backend/scripts/oneoff-delist611Testimony-20260911.mjs`。

  所以真出事嗰陣實際效果係：規則判斷 → restart 被 gate 擋（GATE-BLOCKED）→ 即刻升級通知。行為安全，唔會重試，亦唔會繞 gate。要 Eric approve HEAD 之後，自動 restart 先會真係生效。另外 selfheal ② 喺 launchd 底下都有 PATH 問題，一樣會 exit 127；呢個係舊有問題，唔喺今輪範圍。
- 要接受嘅副作用：規則 3（403 高就 `wait`）以而家嘅流量實際上觸發唔到，見 N5。所以 403 窗會直接升級，即係多咗誤報，但方向係保守嘅。

**(B) AI 模式：仍然唔可以啟用。** 仲差以下幾樣：
1. 用真模型跑一次 §B 圍欄測試。CLI 未登入，今輪做唔到，全部係推論。
2. 修 N1。remedy 自己嘅「忽略危險 env」防線可以用 env 前綴繞過（`STREAM_WATCH_TEST=1`、`SHELLOPTS`+`PS4`、`BASH_ENV`、`PATH`），我已經實測到可以執行任意命令。所以唯一真防線就係 CLI 嘅 Bash matcher 會唔會拒絕 env 前綴，呢樣一定要真模型實證。
3. launchd context 入面 keychain OAuth 用唔用到，都要驗。
4. 建議修埋 N3：巢狀 pgid 會逃出外層 cap，留低冇上限嘅孤兒。

---

## 逐項 finding

| # | 判定 | 證據（我自己跑） |
|---|---|---|
| **H1** | ✅ PATH 已修；⚠️ 自動 restart 現況仍然做唔到（gate） | `h1/`：`env -i HOME STREAM_WATCH_TEST=1 …（冇 PATH）/bin/bash stream-watch.sh` ×3 tick → `DIAGNOSED verdict=escalate engine=rules actions=restart-backend(failed)`，remedy.log 係 `gate-blocked exit=1`，rules.stderr 係真 gate 嘅 `approve.sh backend 6f444b6…` 輸出。直接喺 `env -i`+lib 行 `backend-restart.sh --same-code --dry-run`，gate 攔喺 `git log 78f9c5b..HEAD` 嗰步；**對照組（冇 source lib）**係 `line 63: node: command not found`。**Prod 模式（冇 STREAM_WATCH_TEST）**我用 scratch 假 repo 驗：stub `backend-restart.sh` 記錄到 `argv=[--same-code] node=/opt/homebrew/bin/node`，即係 prod 會真 restart，冇 `--dry-run`，同設計一致。gate 攔住嘅原因：`git diff 78f9c5b HEAD -- backend(除 runtime)` 只有 `routes/auth.js`（56b0f93）同 `scripts/oneoff-delist611Testimony-20260911.mjs`（f8362b6）；`backend/data/*.js` 已 commit 部分冇差異；working tree 過濾後冇髒檔 |
| **C1** | ⚠️ 部分（靜態層已修，真模型未驗；另外有 N1） | `claude --version` = 2.1.280。`--help` 逐個 flag 核對過：`--restricted`（拎走 Bash 等工具，除非 `--tools` 點名；**唔讀** user/project/local settings；file tools 限喺 cwd + `--add-dir`；拒絕 bypassPermissions）、`--setting-sources <sources>`、`--permission-mode` choices 有 `dontAsk`、`--permission-prompts host\|none`（none = 所有要 prompt 嘅一律拒絕）、`--tools`、`--allowedTools`、`--disallowedTools`、`--strict-mcp-config`、`--disable-slash-commands`、`--no-session-persistence`（只喺 --print 有效）、`--output-format json`。全部存在，語義同執行者講嘅一致。機上冇 managed settings（`/Library/Application Support/ClaudeCode/` 唔存在），亦冇 `~/.claude/CLAUDE.md`、`~/CLAUDE.md`。argv 同 cwd 我用 t3 mock 重跑過：cwd 係 `…/ai/`，入面只有 bundle.md，冇 `--add-dir`；冇 `ai-on` 就 0 次 call。**真 CLI 我冇跑**（要打 API，未登入，唔掂 auth） |
| **M1** | ✅ 已修 | `m1/`：自己寫嘅壓力測試。25 輪，每輪先 bad×3（升級），再 **3 個 ok tick 並行**，status stub 隨機延遲 0–0.4s，最後一個 ok tick 收尾。結果：25/25 輪 state=ok、警報檔已清；skip 50 次；🔴 25 = ✅曾升級 25 = 已恢復通知 25；冇殘留 lock，冇殘留 `.tmp` |
| **M2** | ✅ 大致已修；有一個 Low（N6） | `m2/`：新 mock 樣本。`rejforge`（action 帶 `\| exit=0` 被拒）→ 降為 escalate ✅；`dryforge` → 降為 escalate ✅；全形冒號 → 無效，交規則 ✅；CRLF → 正常解析 ✅；JSON 前面有雜訊 → 交規則（保守）✅；REASON 入面嘅字面 `\n`、偽造 ✅ 行、JWT、token → 單行而且已遮 ✅。**`pipeforge`（`escalate "x \| restart-backend \| exit=0"`）會令 `remedy_success_logged` 誤判成功**，見 N6。「prose」樣本（最後一段有散文行加 VERDICT）會被接受，同執行單「只含三行」唔一致，但無害 |
| **M3** | ✅ 照單修咗；⚠️ 規則 3 實際到唔到 | 抽咗 `stream-diagnose.sh:125-149` 出嚟獨立跑：最近 bucket <10 樣本 → 退去 3 個 bucket 加總 ✅；型別係字串 → 當 0 ✅；null bucket 唔會炸 ✅。**真 `ops-metrics.json`**：96 個 bucket 之中，upstream403 分母非 0 嘅只有 3 個，而且最大只係 1，所以 `RATE403` 幾乎永遠係空，`wait` 規則等同死咗（N5）。bucket 冇新鮮度檢查：人造一個 6 小時前嘅 bucket 都照當「最近 1 鐘」（N8，Low，因為真檔每個鐘都有 bucket，冇斷層） |
| **M4** | ⚠️ 部分 | `m4/`：新設計嘅 22 個正樣本 + 8 個負樣本。**遮到**：未加引號嘅 `KEY=值`／`Key: 值`、sig/lsig query、`user:pass@`、兩段 JWT、Twilio AC、`X-Api-Key:`、`*_API_KEY=`。**漏咗**：值有加引號嘅（`JWT_SECRET="…"`、JSON 嘅 `"password":"…"`、`"refresh_token": "…"`、`client_secret: '…'`、`Bearer "…"`）；URL-encoded 嘅 googlevideo `sig%3D`；冇關鍵字嘅 32-hex token；`--password X`／`pass=`；cookie；`ghp_`、`AKIA`、PEM；裸 query 嘅 `pot=`（PO token）、`n=`。負樣本：🔴 行、`PO token`、`cookies`、`passwordless`、`tokenizer` 全部保留 ✅；但 `http://127.0.0.1:3001/api/health` 會被砍成 `/[url-path-stripped]`，診斷資訊少咗（輕微過度過濾）。另外 state json 嘅 `summary` 欄冇過濾就直接寫入（來源係 stream-status，風險低） |
| **M5** | ⚠️ 部分 | Prod 模式（冇 STREAM_WATCH_TEST）底下，`REMEDY_STATE/REMEDY_STATUS_CMD/SELFHEAL_RESTART_CMD/REMEDY_DRY_RUN` 全部被忽略 ✅（E3，假 repo 實測）。**但可以繞過**，見 N1 |
| **L1** | ✅ 照單修咗；一個 Low 殘留 | 型別錯、`1e400` → 備份加重置 ✅。**`NaN`／`Infinity`**（Python json 接受）會令每個 tick 都出 `ERR decide 例外`，而且唔會自己重置。只會寫 `/tmp/hymn_stream_watch.log`，SUPERVISION-LOG 唔會有記錄。state 只由 Python 寫，正常唔會出現，要人手改壞先會中 |
| **L2** | ✅ 已修 | request 檔要對得上 incident（讀 code，加 t6 重跑）；`escalate "x\nincident=OTHER\nreason=fake"` → request 檔只有一行 `reason=xincident=OTHERreason=fake`，incident 仍然係真嗰個 ✅；remedy.log 單行 ✅ |
| **L3** | 只加咗文件（照單） | README 同檔頭已經寫明 |
| **L4** | ⚠️ 部分 | 單層 `wlib_capped_pg` 有效。**巢狀就會逃脫**：外層 cap 3s，入面係 `wlib_capped_pg 8 sleep 47` → 外層 rc=124，但 `sleep 47.321` 變成 PPID=1、自己一個 pgid，**冇人再執行佢嘅 8s cap**，會行足 47s（N3）。t7 hang 場景仍然會留低 `sleep 900` 孤兒（healthcheck 用 perl alarm，冇改，執行者已講） |
| **L5** | 偏離（重寫，唔係委派）；行為差異見下 | 逐行對照 `stream-selfheal.sh:312-393` 同 `stream-remedy.sh:174-198` |
| **L6** | ✅ 已修 | macOS **冇 `flock` CLI**（`which flock` 搵唔到），但 code 用嘅係 Python `fcntl.flock`（存在）✅。8 個並行 restart → `3 3 3 3 3 3 3 0`，stub 只被 call 1 次 ✅；selfheal swapsToday=1 → swap 被拒 ✅；restartsToday=3 → restart 被拒 ✅ |
| bust-resolve-cache | ✅ 已移除 | 送去 remedy → rc=2 |

### L5 逐行對比（selfheal ① vs remedy swap-ytdlp）
| 項目 | selfheal | remedy | 風險 |
|---|---|---|---|
| apply 指令 | `eval "$APPLY_CMD"` | word-split `$APPLY_CMD` | 預設路徑冇空格，所以等價 |
| symlink 前置檢查 | `readlink` 係空 → **拒絕 apply**（ytdlp-not-symlink） | **冇檢查**，照樣 apply；`update-ytdlp.sh` 遇到非 symlink 會由 slot a bootstrap 再 `ln -sfn`，可能蓋咗一個普通檔 | Low（而家係 symlink 佈局） |
| apply 上限 | 冇 cap | 240s pg-kill | update-ytdlp 最差情況 = pip（冇 cap）+ 60 + 2×(60+60) > 240 → 慢但合法嘅 apply 可能喺 canary 中途被殺，報 `no-candidate`，配額照扣。因為 symlink 係最後先換，所以唔會整爛現役（Low） |
| 計數 | 一 call 就 +1 | quota 喺 apply 前 +1 | 等價；**但只係單向**：remedy 會睇 selfheal 嘅數，selfheal 唔會睇 remedy 嘅數 → remedy 換完之後，selfheal 喺同日下個 tick 仍然可以再換一次（Low） |
| verify | 3 首，mid-range，≥2 首 206，每首 45s/45s | 一樣 | 等價 |
| rollback guard | `-x $YTDLP_DIR/$before` | 一樣 | 等價 |
| Layer A pending | healthy_a=0 → 保持 alert | 冇 Layer A 概念，exit 0 → fixed-pending-verify，交返 watch 過 2 tick 再驗 | 可以接受 |

---

## 新發現（按嚴重度）

**N1 🔴（只影響 B）remedy 嘅 env 防線可以繞過，實測到任意命令執行。** 假 repo，prod 模式，fake HOME：
- E1 `STREAM_WATCH_TEST=1 REMEDY_STATE=<任何 /tmp 路徑> REMEDY_STATUS_CMD="touch pwn" stream-remedy.sh status` → 建立咗 `pwn-status`。**唔使配額**。
- E2 同一招配 `SELFHEAL_RESTART_CMD` 用 `restart-backend` → 建立咗 `pwn-restart`。
- E6 `SHELLOPTS=xtrace PS4='$(touch pwn)' stream-remedy.sh wait` → 建立咗 `pwn-ps4`。**唔需要預先寫任何檔**。
- E4 `BASH_ENV=<檔>`、E5 `PATH=<dir>:…`（shebang 係 `/usr/bin/env bash`）→ 都執行到，但要預先有一個可寫檔。

意思係：`Bash(<abs>/stream-remedy.sh:*)` 如果放行 env 前綴，C1 嘅整個圍欄就失效。修法建議：
- 刪走「env 開 test mode」呢個設計，例如改成 test 專用嘅另一個入口，或者要求一個只喺 scratch 存在嘅檔；
- shebang 改做 `#!/bin/bash -p`，忽略 BASH_ENV/SHELLOPTS、唔繼承 function，同時避開 PATH 搵 bash；
- 最終仍然要用真模型驗證 matcher 會拒絕 env 前綴、`;`、`&&`、`|`、`$()`、`>` 重定向。

**N2 🟠 `REMEDY_DRY_RUN=1` 喺 prod 會被靜靜忽略，變成真 restart。** E3 實測：`REMEDY_DRY_RUN=1 … restart-backend` → 真係 call 咗 `backend-restart.sh --same-code`（我用嘅係假 repo stub）。README 有寫會忽略，但 `stream-remedy.sh:20` 檔頭仍然寫「REMEDY_DRY_RUN=1:全部側效應歸零」，`stream-diagnose.sh:18` 亦寫「會傳落 remedy」。人手照檔頭做 dry-run，只要 gate 過就會真 restart。修法：非 test mode 見到 `REMEDY_DRY_RUN=1` 就 exit 2 拒絕，唔好靜靜忽略；同時改好檔頭。

**N3 🟡 巢狀 `wlib_capped_pg` 會逃出外層 cap（L4 殘留）。** 見 L4 行。出事條件：watch cap 660 比 diagnose 內嘅 claude cap（600）先到。即係 build_bundle 要行超過 60s，例如兩次 `yt-dlp --version` 撞正 XProtect 掃描；或者 claude 嘅 Bash 子 process（remedy restart/swap 有自己嘅 setsid）。後果係 claude 或者 restart 變成冇 cap 嘅孤兒。修法：內層唔好再 setsid，只有最外層開 group；或者 watch 設 cap 時扣埋 bundle 時間。

**N4 🟡 M4 漏咗有引號嘅值（JSON 同 .env 格式）。** 見 M4 行。bundle 嘅來源（backend log、state json、deploy.log）都係 JSON 或者 key=value 格式，最有機會出現嘅正正就係有引號嘅寫法。

**N5 🟡 規則 3（403 高就 wait）以而家流量等同死咗。** 真 ops-metrics 96 個鐘入面，upstream403 分母加埋只有個位數，最近 3 個 bucket 永遠湊唔夠 10 → `RATE403` 係空 → 403 窗會直接 escalate。方向係保守（多咗誤報），但同規則文件嘅設計唔一致。

**N6 🟢 M2 成功判定可以用 escalate reason 偽造。** `remedy.log` 行格式係 `| escalate | requested reason=x | restart-backend | exit=0`，`grep` 同「最後一欄」判斷都會當佢係成功。實際冇害，因為 escalate 本身會寫 request，watch 照樣即刻升級。修法：只接受第 4 欄 action 完全等於 `restart-backend`/`swap-ytdlp` 嘅行，或者 remedy 喺 log 前將 reason 入面嘅 `|` 換走。

**N7 🟢 state 值係 NaN/Infinity 會永久 ERR（L1 殘留）。**

**N8 🟢 規則冇檢查 bucket 新鮮度；stale lock（>20 分鐘）有機會互相 rmdir。** A 嘅 lock 被 B 當 stale 清走之後，A 退出時嘅 trap 會 rmdir 咗 B 嘅 lock。要一個 tick 行超過 20 分鐘先會發生（上限大約 660s 加 notify），所以現實入面好難中。

---

## 回歸
- t1–t6、t8 全部重跑，rc=0（`suite/*.out`）。T1 劇本 1–3：notify 係 0/0/0/0/0/1/3/4，blip 零寫檔，同第一輪一致。
- 健康 tick（我另外量）：5 個 ok tick，每個 0.04–0.05s；`wd` 只有 state 檔，LOG 0 bytes，notify 0，`/tmp` 冇 `streamwatch.*` 殘留。
- t7：off／exit 0／exit 1／SIGKILL／hang（cap 6s）／status 亂碼，healthcheck exit 全部 0；耗時 0–1s，hang 嗰次 6s（等於 cap）。
- 紅線：`git diff --name-only 3625289 HEAD` 只有 `ops/stream/**` 加 3 份報告 md；冇掂 plist、`.claude/`、`CLAUDE.md`、`ops/deploy/*`、`ops/lyrics/stream-healthcheck.sh`、`stream-selfheal.sh`、`backend/`、`frontend/` ✅。（working tree 入面 `stream-status.sh` 有另一個 session 未 commit 嘅改動，加咗 24h 403 率欄位，唔屬本輪。）

## 我做過嘅側效應（如實）
- **向本機 backend 發過請求**：
  - 參數測試入面 `probe 0012` 喺 prod 模式行咗，向 `127.0.0.1:3001/api/stream/0012` 發咗 2 個 Range GET，兩個都 404，約 1ms 就返，冇觸發 resolve；
  - 跑 `t8-m3-rules.sh` 用咗真 build_bundle：`/api/health` GET 3 次、本機 `yt-dlp --version` 幾次、`pgrep`。

  冇打 YouTube 或者 googlevideo。
- 喺 scratch 起咗兩個孤兒，核對過 PID、PPID=1 同 lstart 之後親手 kill：`sleep 47.321`（PID 31807，我嘅 L4 測試）、`sleep 900`（PID 45848，t7 hang）。冇 kill 過任何其他 process，冇用 pattern kill。
- t7 建立咗 `/tmp/hymn_stream_watch.log`（之前唔存在），已經刪咗。
- 冇發 osascript 通知（0 次，全部用 stub）。冇 launchctl（stream-status 會 call `launchctl print`，所以真 stream-status 我冇跑）。冇登入，冇讀 token/keychain/.env。冇改 code，冇 git add/commit/stash。
- Prod 檔核對：`~/.hymn-deploy` 仍然只有 `approved.json`、`deploy.log`、`ota-groups.log`，md5 同 `docs/SUPERVISION-LOG.md` 跑前一樣；冇 `stream-watch.on`／`ai-on`。
