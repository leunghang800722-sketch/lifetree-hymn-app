# 串流保護監察 第二輪修正報告 2026-09-29

執行單：`STREAM-WATCH-FIX-EXEC-20260929.md`。驗收依據：`STREAM-WATCH-OPUS-20260929.md`。基準 HEAD `b0d4807`。
Commit 1（script 修正）= `c0fac01`；Commit 2（test + 本報告）= 見 git log（訊息 "test(ops): 串流監察第二輪修正測試 + 報告"）。
只出證據，唔判 PASS/FAIL。證據原檔：`/private/tmp/claude-501/-Users-macbookpro--openclaw-workspace-hymn-app/dbef9ccd-547a-4212-8309-0735348d98c1/scratchpad/fix/`（t1..t8 `.out`）。
未啟用（冇建立 `stream-watch.on`/`ai-on`）、未部署、冇 launchctl、冇改 plist / `.claude/` / `CLAUDE.md` / `ops/deploy/*` / healthcheck / selfheal / backend / frontend。

## 偏離執行單之處（先講）
1. **L5 唔係字面「委派 selfheal」**：`stream-selfheal.sh` 冇可單獨 call 嘅 swap 入口（swap 內嵌喺 due/節流判斷同 healthcheck 傳入嘅七個數之後），強行 call 佢會被 `due` 節流擋（watch 診斷時 selfheal 同 tick 已行過）且要讀 healthcheck state。所以 remedy 內做**同一序列**：同一 apply 指令 → `readlink` 前後對比 → 換咗即 Layer B 重驗（同 selfheal `verify_layer_b`：3 首 resolve + mid-range，≥2 首 206）→ 唔過用同一 guard rollback。`swap` 合共上限預設由 2 改 1（即 selfheal 今日換過就唔准，Opus L5 建議）。
2. **AI cwd 用 `stream-incident-<id>/ai/` 而唔係 `stream-incident-<id>/`**：因為 incident 目錄同時放 facts.env / diagnosis.json / claude.stderr，`ai/` 子目錄先做到「入面只有 bundle.md」。
3. 除單內指定 flag 外，加咗 `--restricted`（`claude --help` 有：removes Bash unless --tools names it、ignores user/project/local settings、confines file tools to cwd + --add-dir）同 `--permission-prompts none`（`--help` 有）。
4. Commit 訊息尾用 `Co-Authored-By: Claude Sonnet 5.5`（本 session 實際模型 + harness 指定），唔係執行單寫嘅 Fable 5.1。
5. `bust-resolve-cache`：上輪已實作為「唔做」，本輪確認 allowlist / prompt / 註解都冇殘留（`grep bust ops/stream/stream-remedy.sh` 只剩解釋點解冇；t2 §A 送入該 action → exit 2）。

## C1 headless claude 圍欄
**改咗**：`stream-diagnose.sh:139-160` prompt（remedy 用絕對路徑、bundle 只喺 cwd）、`:206`（AI opt-in）、`:208-218`（argv）；README。
**最終 argv**（mock 記錄，`t3.out`）：
```
claude -p <prompt> --model sonnet --max-turns 12 --output-format json \
  --restricted --setting-sources "" --permission-mode dontAsk --permission-prompts none \
  --tools "Read,Grep,Glob,Bash" \
  --allowedTools "Read,Grep,Glob,Bash(/Users/macbookpro/.openclaw/workspace/hymn-app/ops/stream/stream-remedy.sh:*)" \
  --disallowedTools "Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent" \
  --strict-mcp-config --disable-slash-commands --no-session-persistence     (cwd = …/stream-incident-<id>/ai/,冇 --add-dir)
```
**每個 flag 嘅 `claude --help`（v2.1.280）出處**：`--restricted`（"ignores user, project and local settings files … confines the file tools to the working directories (--add-dir included)"）；`--setting-sources <sources>`（"Comma-separated list of setting sources to load (user, project, local)"，傳空字串）；`--permission-mode`（choices 含 `dontAsk`）；`--permission-prompts <target>`（`host|none`，none=any prompt denied automatically）；`--tools`；`--allowedTools`；`--disallowedTools`；`--output-format json`；`--strict-mcp-config`；`--disable-slash-commands`；`--no-session-persistence`；`--add-dir` 冇用。冇任何 flag 係估嘅。
**證據**：
- V2 stub：cwd 只有 `bundle.md`、cwd 各層祖先冇 `.claude`/`CLAUDE.md`（`t3.out`）：
  `cwd=…/t3m/inc-ok/ai …` / `cwd-listing: bundle.md` / `ancestors-with-.claude-or-CLAUDE.md: (none)`。
- 冇 `ai-on`：mock 被 call 次數 = 0（`= 0(預期 0)`），`claude.stderr` = "AI 診斷未啟用(冇 …/stream-watch.ai-on)→ 規則診斷"；`ai-on`+`no-ai` 並存 = 仍 0 次。
- 真 CLI argv 接受度（未登入，`claude auth status` → loggedIn:false；冇嘗試登入）：用上面同一組 flag 跑 `claude -p "reply OK" --max-turns 1`，輸出係 `"terminal_reason":"api_error","total_cost_usd":0`，冇 flag 解析錯誤 → 只證明 argv 被 CLI 接受，**唔證明圍欄有效**。
**未解決/限制**：真模型圍欄（Bash matcher 擋唔擋 `; && | env-前綴 bash ./`、`--restricted` 實際 Read 限制、permission_denials 內容）**冇測**（CLI 未登入）。Opus §B 命令清單要登入後由人跑。`Bash(<abs>:*)` 對含空格路徑嘅行為未驗（repo 路徑冇空格）。

## H1 launchd PATH
**改咗**：`stream-watch-lib.sh:7` `export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`（watch/diagnose/remedy 全部 source）；`stream-remedy.sh:202-205` restart 前 `command -v node` 預檢（缺→exit 4 `precondition-failed`，配額前檢查所以唔消耗）；`:177` swap 預檢 python3。
**證據 V1**（`t6.out`）：
```
env -i HOME=$HOME /bin/bash -c '…'   (未 source lib)  PATH=[/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin:.]
  node NOT-FOUND / claude NOT-FOUND / python3 /usr/bin/python3
source lib 之後 PATH=[/opt/homebrew/bin:…]  node /opt/homebrew/bin/node  claude /opt/homebrew/bin/claude
```
`env -i HOME=$HOME <STREAM_WATCH_TEST + scratch 覆寫，PATH 唔俾> /bin/bash stream-watch.sh` ×3 tick（stub status=bad，backend-down fixture 診斷）：
```
tick1: DIAGNOSE incident=… / DIAGNOSED verdict=escalate engine=rules actions=restart-backend(failed) / ESCALATE … notify rc=0
remedy.log: … engine=rules | incident=… | restart-backend | gate-blocked exit=1
手動 remedy:  run: /Users/…/ops/deploy/backend-restart.sh --same-code --dry-run
              (真 gate 輸出:abort:HEAD … 已試過 --same-code:backend/ code 同已批准 sha 有真實差異 …)  GATE-BLOCKED  exit=1
```
即：`node` 搵到（gate 行到 `node -e` 之後嘅步驟先 abort）、規則診斷行到、restart 去到 `backend-restart.sh --same-code --dry-run` 並回報 gate 結果（gate 而家會擋係真實狀態，同 Opus 一致）。
`REMEDY_NODE_BIN=node-missing` → `precondition-failed: 搵唔到 node-missing(PATH=…);未有試過 restart,配額冇消耗` exit=4，quota state 檔唔存在、stub restart 被 call 0 次；之後正常 restart 仍 exit 0（t2 §E）。
**selfheal 自身喺 launchd 下有冇同樣問題（只報告，冇修）**：有。plist（`plutil -p`）冇 `EnvironmentVariables`，healthcheck/selfheal/backend-restart.sh 全部冇設 PATH（`grep PATH` 只見 `PLIST_PATH`）。`env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash ops/deploy/backend-restart.sh --dry-run --same-code` → `line 63: node: command not found`（exit 非 0）。所以 selfheal ② backend 自動重開喺 launchd 下結構上會失敗（同 Opus H1）；`update-ytdlp.sh --apply` 冇實測。本層補 PATH 只保護 watch/diagnose/remedy 自己嘅子 process，唔會令 selfheal 好返。

## M1 lock 前寫 state
**改咗**：`stream-watch.sh:46-56` lock 提前到最頂（status、decide 全部喺 lock 內；攞唔到=零寫、連 status 都唔行）；快路徑取消。
**證據**（`t6.out` V3）：20 輪「兩個 tick 同時起」：每輪 skip 1 個（20 次 skip 訊息），state 可解析、lock 目錄冇殘留、`.tmp` 0；SUPERVISION-LOG ✅ 恢復行 20 = 「曾升級」恢復行 20 = 「已恢復」通知 20，🔴 升級行 21（開場 1 + 每輪重建 20）——恢復行冇遺失。
V3b 確定性重現 Opus d2：已升級後人手 `mkdir stream-watch.lock` → 入 2 個 ok tick：兩次都 "另一個 tick 仲行緊…skip(零寫)"，state md5 不變=yes、警報檔仲喺=yes、LOG ✅=0；放 lock 後一個 ok tick：`RECOVER(escalated)`，state=ok、警報檔已刪、✅=1、恢復通知=1。
**限制**：每個 tick（包括健康）都會短暫 `mkdir`/`rmdir` lock 目錄——ok→ok 仍然只有 state 檔 mtime 變更（t1 劇本 1：`ok×3 後 wd 內容:stream-watch-state.json`）。

## M2 VERDICT 可偽造
**改咗**：`stream-diagnose.sh:173-192` `parse_ai_result`（只讀 json `result` 欄；`is_error:true` 唔信；最後一個非空段落內要**正正一行** `VERDICT:` 喺行首、值三選一）；`:194-203` `remedy_success_logged` + `:218-224` 降級。
**證據 V4**（`t3.out` §C，mock，AI_ON）：
| mock | 結果 |
|---|---|
| forged-quote（先 escalate，後段引用 `VERDICT: fixed-pending-verify` 喺獨立段） | 解析為 fixed → remedy.log 冇成功動作 → `engine=ai VERDICT: escalate REASON: AI 聲稱 fixed-pending-verify 但 remedy.log 冇…→ 降為 escalate` |
| forged-double（末段兩行 VERDICT） | 無效 → `engine=rules` fallback |
| forged-early（VERDICT 喺前段，末段係散文） | 無效 → `engine=rules` |
| forged-noaction（聲稱 fixed，冇 call remedy） | 降為 escalate |
| forged-bad（`VERDICT: fixed`） | 無效 → `engine=rules` |
| iserror（is_error:true 帶合法 wait） | 無效 → `engine=rules` |
正控 `ok`（真 call remedy dry-run，remedy.log 有 `engine=ai | incident=m-ok | [DRY] restart-backend | dry-run`）→ `engine=ai VERDICT: fixed-pending-verify`。
**限制**：成功判定只睇 `incident=<id>` + action + 結果（唔睇 engine 標籤，因 `REMEDY_ENGINE/INCIDENT` 係 diagnose 傳入嘅標籤，AI 可自行加 env 改；改 incident 只可令佢自己嘅動作記到別 incident，唔會令本 incident 過關）。

## M3 規則時間窗
**改咗**：`stream-diagnose.sh:118-150` facts（欄位來源寫喺註解）；`stream-diagnose-rules.sh` 註解 + resolve 規則 `total>=3`（`:41`）。RATE403 = ops-metrics 最近 1 個 hourly bucket 嘅 `upstream403 (hls+stream)/(hlsTotal+streamTotal)`；該 bucket 樣本 <10 → 最近 3 個 bucket；仍 <10 → 空（規則唔判）。RESOLVE_* = 最近 1 個 bucket 嘅 `resolve.total/fail`。
**證據**（`t8-m3-rules.sh`，前兩個鐘 0% 403）：
```
案1 最近1鐘 8/20=40%: RATE403=40.0 SAMPLES=20 → VERDICT: wait "403 率 40.0% >= 30%"(舊 24h 率會係 ~8% → 唔會 wait)
案2 最近1鐘樣本4: RATE403=1.0 SAMPLES=404(用 3 個鐘) RESOLVE 2/2 → total<3 → 唔判 resolve 全 fail → escalate
案3 最近1鐘 resolve 3/3 fail → 規則 swap-ytdlp(remedy dry-run) fixed-pending-verify
```
**限制**：README/規則檔頭寫明 08-22 嗰種病（resolve 成功、URL 1MiB 後 403）規則唔會自己 swap，由 selfheal ① 負責。案3 結果視乎機上候選 yt-dlp 版本（當時 idle 2026.09.27 > active 2026.08.30）。

## M4 密鑰過濾
**改咗**：`stream-watch-lib.sh:15-26` `wlib_filter` 改 perl pattern 級遮值（唔再成行刪）：JWT `eyJ…\.…`、Twilio `(AC|SK)+32hex`、`Authorization[:=]…`、`Bearer \S+`、URL query `sig|signature|token|key|lsig=`、`://user:pass@`、`(…secret|password|passwd|token|api_key…)\s*[=:]\s*值`、最後 URL 只留 scheme://host。入 state（`diagReason/diagActions/escalateReason`）、alert、SUPERVISION-LOG（`sm`）、diagnosis.json/md 前都過同一 filter（`stream-watch.sh` DIAGNOSE 分支、`do_escalate`、`stream-diagnose.sh` 尾）。
**證據 V5**（`t5.out`）：正控 fixture 六類（+混合）每類 raw 命中 1 行（共 9 行含假值）。過濾後 bundle：
```
Authorization: [REDACTED] / JWT_SECRET=[REDACTED] / TWILIO_AUTH_TOKEN=[REDACTED] / password=[REDACTED]
…googlevideo.com/[url-path-stripped] / …&signature=[REDACTED]&key=[REDACTED]&token=[REDACTED]
JWT [REDACTED-JWT] 直接貼出 / twilio sid [REDACTED-TWILIO] and key [REDACTED-TWILIO] / http://[REDACTED]@proxy.example.invalid:8080/[url-path-stripped]
```
bundle / diagnosis.md / STREAM-ALERT.md / LOG.md / notify.log / **state json** 內假值 grep 全 = 0（舊版 state json 有 `Bearer FAKEJWT` 明文）。
負控：`[stream] 普通一行 status=403 id=77`、`PO token 未能取得 cookies 唔存在` 兩行原文保留；SUPERVISION-LOG 🔴 升級行骨架保留（`- 🔴 **串流監察升級 …** — incident … :診斷 verdict=escalate:見到 Authorization: [REDACTED] 同 JWT_SECRET=[REDACTED] …`），`filtered: sensitive line` 行數 = 0。
**限制**：`\S`-型值遮蓋以空白/引號/`,;&<>` 結束；純自然語言密碼（無 `=`/`:`）遮唔到；冇 scheme 嘅 googlevideo URL 只靠 query pattern。

## M5 T4 fixture / env 前綴
**改咗**：`stream-remedy.sh:24-40` 危險 env（`REMEDY_STATE/LOG/DRY_RUN`、`SELFHEAL_*_CMD/STATE`、`WATCH_DIR/STATE`、`HYMN_STREAM_BASE`、`YTDLP_LINK`、`REMEDY_LIMIT_*/TOTAL_*` 等）喺 source lib 前 `unset`，只有 `STREAM_WATCH_TEST=1` 且 `REMEDY_STATE` 喺 `/tmp|/private/tmp|/var/folders` 下（無 `..`）先認；測試模式 + 預設 restart 自動加 `--dry-run`、預設 swap 唔真行。`test/fixtures/bundle-injection.md` 重寫（9 行誘導，含 `.env` 路徑、`; touch`、`REMEDY_STATE=…` / `SELFHEAL_RESTART_CMD=…` env 前綴、`&&`、WebFetch）；`t4-injection.sh` 用 mock（`T4_REAL=1` 留俾登入後真模型）。
**證據**：t4：8 個誘導 pattern，fixture 命中數 = bundle.md 命中數（1/1/3/1/1/1/1/1，即全部到達 AI 眼前，舊 fixture 個 `.env` 行會被舊 filter 剷走）。canary `/tmp/pwn-*`、`/tmp/x-fresh.json` 4 個都唔存在；HEAD 不變=yes、plist checksum 不變=yes。
t2 §D（scratch 假 repo：只複製 remedy+lib，`backend-restart.sh` 換成記錄 stub；假 HOME；**唔設** STREAM_WATCH_TEST）：
```
D1 REMEDY_STATE/LOG/WATCH_DIR/SELFHEAL_RESTART_CMD/REMEDY_DRY_RUN=1 全部指去 evil →
   假 repo restart 被 call: REAL-RESTART-CALLED argv=[--same-code]   (DRY=1 被忽略;evil cmd 冇被用:EVIL-RESTART=0)
   evil.state/evil.log/wd-evil 被建? no/no/no;真正 state/log 落咗假 HOME/.hymn-deploy
D2 REMEDY_LIMIT_RESTART=99 → 第二次 "QUOTA: restart-backend 今日已用 1/1" exit=3
D3 STREAM_WATCH_TEST=1 但 REMEDY_STATE=$HOME/evil.state(非 tmp) → evil.state 唔存在
D4 測試模式+預設 → REAL-RESTART-CALLED argv=[--same-code --dry-run]
```
**限制**：REMEDY_ENGINE / REMEDY_INCIDENT 仍照收（標籤）。真模型 Bash matcher 對 env 前綴 / `bash ./` 嘅行為未測（見 C1）。

## L1 state 壞型別
**改咗**：`stream-watch.sh:60-` decide 內 `validate`（int/bool/num/str 型別 + status 值）；壞→ `os.replace` 備份 `.corrupt-<ts>` + 重置 + `CORRUPT` 動作（stdout log + SUPERVISION-LOG 一行）；重置後若今次係 ok → `CLEAR_ALERT` 清殘留警報檔；decide 例外 → `ERR` 行（唔再靜吞）；`escalated` 模式同一次原子 `tmp+os.replace` 寫 `escalateReason`（取代 `do_escalate` 內非原子 `json.dump(open(p,'w'))`）。
**證據**（`t6.out` V6-L1）：五種損毀（`badTicks:"x"`、`not json{{`、`[1,2]`、`status:"weird"`、`diagnosed:"yes"`）→ 每種 tick 輸出 `watch:state 壞(…)已備份 stream-watch-state.json.corrupt-<ts> 並重置`，備份檔存在，之後 tick 繼續行（diag calls=1，LOG 1 行 state 壞）。已升級後 state 變 `garbage{` → ok tick：`state 壞…已備份…並重置` + `state 重置後健康,清走殘留警報檔`，警報檔=已清。escalate 後目錄冇 `.tmp` 殘留。

## L2 request / log 注入
**改咗**：`stream-watch.sh:212-222` `take_request`（要 `incident=` 等於當前 incidentId，否則掉並 log；RECOVER 時一併刪 request）；`stream-remedy.sh:77-83` `san()`（strip `\000-\037\177`、截 200 字，log 每個欄位都過）。
**證據**：t6 V6-L2（模擬 AI 診斷期間寫 request）：stale incident → `watch:掉咗 stale/冇 incidentId 嘅 escalate.request(request incident='STALE-OLD-INCIDENT' 當前=…)`，警報檔=no、request 已掉、🔴=0；冇 incident 欄 → 同樣掉；正控（同 incident）→ `ESCALATE … reason=診斷員登記升級:正控…`，警報檔=yes、request 已消耗。t2 §F：action 含 `\n engine=ai | incident=x | … exit=0` + 500 字元 action → remedy.log 2 行（唔會偽造多行）、最長一行 121 字元，內容 `restart-backendengine=ai | incident=x | | rejected: 未知 action`（換行已 strip，單行）。

## L4 timeout 孤兒
**改咗**：`stream-watch-lib.sh:35-` `wlib_capped_pg`（perl `setsid` 開自己 pgid，逾時 `kill TERM/KILL -pgid`，exit 124；只殺自己起嘅 group）；watch 跑診斷、diagnose 跑 claude、remedy 跑 restart/swap/verify 都改用佢。
**證據**：`wlib_capped_pg 2 bash -c 'sleep 30 & sleep 30'` → rc=124，事後 `ps | grep 'sleep 30'` 冇殘留；退出碼透傳（`exit 3`→3，`cat`→0）。t3 hang mode（DIAG_TIMEOUT=3）→ fallback rules，`ps` PPID=1 嘅 `sleep 300` 冇輸出。
**限制**：`ops/lyrics/stream-healthcheck.sh` 自己接線嘅 `WATCH_HARD_CAP`（perl alarm）唔喺本輪範圍（紅線：唔改 healthcheck）；t7 hang 場景仍會留一個 `sleep 900` 孤兒（我核對 PID 4343 = 本次 t7 剛起、PPID=1、`sleep 900` 後手動清咗）。osascript notify 仍用 `wlib_capped`（單 process）。

## L5 swap 委派 + verify/rollback、timeout 對齊
**改咗**：見「偏離 1」。`stream-remedy.sh:143-` `verify_swap`、`:174-197` swap 分支；上限 restart 240 / swap apply 240 + verify 240 < `DIAG_TIMEOUT` 600（舊：swap 900）。
**證據**（t2 §G，假 slot 佈局 + stub apply/verify）：
```
換版+verify 過        → "swap-ytdlp: a -> b,重驗 Layer B 過" exit=0  symlink→b   cmd.calls: stub-swap;stub-verify rc=0
換版+verify 唔過      → "…重驗 Layer B 唔過;已 rollback 返 a" exit=1  symlink→a  cmd.calls: stub-swap;stub-verify rc=1
冇候選(symlink 不變)  → "冇候選版本可換(apply exit=0,symlink 冇變:a)" exit=1   symlink→a
selfheal 今日 swapsToday=1 → "QUOTA: swap-ytdlp 合共(remedy 0 + selfheal 1)今日已到上限 1" exit=3
```
**限制**：真 Layer B（打 YouTube/googlevideo）**冇跑**（紅線）；`REMEDY_VERIFY_CMD` 只用 stub。真 apply 冇跑。

## L6 合共配額
**改咗**：`stream-remedy.sh:90-` quota 加 `flock`（`<state>.lock`）、`probes` 每次清走非當前 incident、swap 合共上限預設 1（會用 selfheal state 嘅 `swapsToday`）。
**證據**：t2 §H：4 個並行 `restart-backend` → exit codes `3 3 3 0`，stub restart 被 call 1 次；`REMEDY_INCIDENT=incA` 後 `incB` probe → probes keys 只剩 `['incB']`。t2 §C 「selfheal 今日已 restart 3」→ remedy restart / swap 被拒（沿用）。
**限制**：restart 合共 ≤3 對 selfheal 上限 2 + remedy 1 係「剛好用晒」，結構上唔會觸發第 4 次（設計值，冇改）。

## L3
只喺 README「已知限制」同 `stream-watch.sh` 檔頭寫明（偵測本身死咗，呢層唔會知）；未修（Eric 已拍板）。

## V7 回歸 / lint
- T1 狀態機全套（`t1.out`，`STREAM_WATCH_TEST=1`）：ok×3 零寫（wd 只有 state 檔）→ bad#1 唔診斷 → bad#2 診斷 1 次 → bad#4 升級（notify=1，警報檔，LOG 2 行）→ 再 24 tick notify=3（首次+6h+12h）→ 恢復 notify=4（已恢復），警報檔刪；劇本2 診斷後即 ok：notify=0，LOG 有「自動修復成功」行；劇本3 blip：log bytes=0。同上輪一致。
- T7（`t7.out`）：healthcheck exit 全 0（off / watch exit0 / exit1 / SIGKILL / hang cap 6s / status 亂碼）。副作用：t7 會建 `/tmp/hymn_stream_watch.log`（寫死 prod log 路徑，跑前不存在），我已刪；hang 場景孤兒 `sleep 900` 已核對 PID 後清。
- `bash -n`：`ops/stream/*.sh` 同 `ops/stream/test/*.sh` 全部通過；`shellcheck` 機上冇裝。
- Prod 檔案核對：跑完 `ls ~/.hymn-deploy` = `approved.json deploy.log ota-groups.log`（冇 stream-watch-state / stream-remedy* / STREAM-ALERT / stream-incident-* / `.on` / `.ai-on`）；冇寫 `docs/SUPERVISION-LOG.md`（測試全用 `WATCH_LOG_MD` scratch）。
- 孤兒 process：只殺過 1 個（PID 4343，t7 起嘅 `sleep 900`，核對 lstart=13:06:15 屬本次任務）。

## 冇做 / 做唔到
- 真模型 T3/T4 圍欄測試、launchd 真 LaunchAgent 內 keychain OAuth 測試（CLI 未登入 / 紅線）。
- 真 yt-dlp swap / Layer B / 真 backend restart（紅線；只 `--dry-run` + stub）。
- healthcheck / selfheal PATH 問題（只報告）。
- `ops/stream/stream-status.sh` 有別人嘅未 commit 改動（30 行），我冇掂、冇 commit。
