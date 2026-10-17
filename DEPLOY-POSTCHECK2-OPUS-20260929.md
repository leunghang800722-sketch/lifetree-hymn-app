# 部署後驗收(第二輪)— H1 修正 `cd "$REPO"` 覆核 2026-09-29

驗收對象:commit `7f5b981`(`ops/stream/stream-selfheal.sh`、`ops/stream/stream-remedy.sh` 喺 `REPO=` 之後加 `cd "$REPO" || exit 1`)。
背景:`DEPLOY-POSTCHECK-OPUS-20260929.md` 🔴 H1(launchd 冇 WorkingDirectory → cwd=/ → `backend-restart.sh` 嘅 `git rev-parse` rc=128)。

## 判詞:自動 restart 喺排程下 —— **有條件通**

會 call 到 `backend-restart.sh`、過到 gate、rc=0 唔會被當 failed:喺 launchd 等效環境(cwd=/、`env -i`、PATH 淨係
`/usr/bin:/bin:/usr/sbin:/sbin`、冇 LANG)已經實測證明。剩返嘅條件同不確定性:

1. **未有做過真 restart**(規定唔准做)。`launchctl bootout/bootstrap gui/$UID` 喺 launchd agent context 入面行唔行得通,係**推論**,冇實測。
   `deploy.log` 235 行 backend-restart 紀錄入面**冇一行 `mode=same-code`**——即係由排程觸發嘅 restart 歷來從未發生過,冇歷史佐證。
2. gate 條件(同環境無關,但決定當刻通唔通):backend/ code 要同 approved sha(而家 `0521d6b`)一樣,同埋 backend/ working tree 冇非運行時髒檔。
   多 session 共用 worktree,任何人留低未 commit 嘅 `backend/*.js` 改動都會令佢 abort。

## 1. Diff 範圍 ✅
`git show 7f5b981 -- ops/`:兩支 script 各 +3 行(2 行註解 + `cd "$REPO" || { echo …; exit 1; }`)。修復梯、配額、節流、allowlist、M5 env 清洗零改動。`ops/deploy/*` 冇改。
(commit 另外新增咗 `DEPLOY-POSTCHECK-OPUS-20260929.md`,純文件。)

## 2. launchd 等效實測
環境:`cd / && env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin <script>`(直接 exec,shebang `env bash` 喺呢個 PATH 下解析做 `/bin/bash` 3.2,同 launchd 一致)。
所有 state/log 指去 scratch;`~/.hymn-deploy/approved.json` 真檔只讀。Layer A 重驗指去 scratch 自己起嘅本機 stub(127.0.0.1:38917,永遠回 206),完咗已 kill。

| # | 情景 | 結果 |
|---|---|---|
| 根因重現 | `backend-restart.sh --same-code --dry-run`,cwd=/ | `fatal: not a git repository`,rc=128 |
| 根因重現 | 同上,cwd=repo 但 PATH 冇 node | rc=127(`node: command not found`,即 5a0ddc4 修嗰個) |
| (a) | **修正後** selfheal 形態②,cwd=/ | `restart rc=0` → gate same-code 放行 → 重驗 A 3/3 → `backend-restart-ok`,script rc=0 |
| (a') | 同上,重驗 base 指死 port | `restart rc=0` → `backend-restart-recheck-fail`(即 restart 本身冇當 failed,係重驗唔過) |
| (c1) 負控 | **修正前**副本(`git show 7f5b981^:…`,放喺 scratch 假 repo 結構),cwd=/ | `restart rc=128` → `backend-restart-failed`,**restartsToday 被扣 1** |
| (c2) 對照 | 同一份修正前副本,cwd=repo | rc=0 → `backend-restart-ok`(證明 c1 失敗只係 cwd 造成,唔係副本擺位) |
| (b1) | **修正後** remedy `restart-backend`,STREAM_WATCH_TEST=1(自動加 `--dry-run`),cwd=/ | gate 放行,`restart-backend exit=0`,rc=0 |
| (c3) 負控 | 修正前 remedy 副本,cwd=/ | `exit=128`,rc=1(配額**已經**喺 call 之前扣咗) |
| (c4) 對照 | 修正前 remedy 副本,cwd=repo | exit=0 |
| (b2) 成條鏈 | cwd=/ 行 `stream-watch.sh` ×3 tick(stub status=bad,fixture facts=backend down,冇 SELFHEAL_RESTART_CMD → 預設 backend-restart.sh `--same-code --dry-run`) | tick1 DIAGNOSE → rules → remedy `restart-backend` → 真 gate 放行 exit=0 → `VERDICT: fixed-pending-verify` |

注:env -i 冇 LANG/LC_*,即係 C locale 情景已經一併覆蓋(python3 寫中文 JSON、git porcelain 中文路徑、grep 豁免 pattern 全部正常)。

## 3. `cd` 嘅副作用 ✅ 冇發現
- 兩支 script 所有路徑都係 `$REPO/…` 絕對路徑或者 env override;grep 唔到任何依賴原 cwd 嘅相對路徑。`ln -sfn "$before_target"` 係相對 symlink target,解析基準係 link 所在目錄,同 cwd 無關。
- **AI 模式**:claude 喺 `stream-incident-<id>/ai/` 用絕對路徑 call remedy;`cd` 只改 remedy 自己個 process,唔影響 claude。t3 `MOCK_MODE=ok` 實證:`engine=ai | incident=m-ok | [DRY] restart-backend | dry-run`。
- **healthcheck**(`ops/lyrics/stream-healthcheck.sh`)靜態讀:call selfheal 同 watch 都係 `$REPO/…` 絕對路徑;LOG/STATE/HISTORY/YTDLP 全部絕對;冇 git、冇 node、冇相對路徑。佢自己喺 cwd=/ 冇同類問題。PATH 冇補,但佢用到嘅 curl/perl/python3 全部喺 `/usr/bin`。

## 4. 其他「只喺真 launchd 先出現」嘅環境差異
| 項目 | 結論 | 證據等級 |
|---|---|---|
| cwd=/ | 已修 | 實測 |
| PATH(node) | 已修(selfheal 自己補 PATH;remedy 經 lib 補) | 實測 |
| HOME | launchd 有設 | **間接實測**:15:34 嗰個排程 tick 更新咗 `~/.hymn-deploy/stream-watch-state.json`,而 healthcheck 係靠 `$HOME/.hymn-deploy/stream-watch.on` 先會行 watch |
| locale | 冇影響 | 實測(env -i) |
| git safe.directory / `/usr/bin/git` shim | 冇影響(同一 uid 擁有 repo;冇 DEVELOPER_DIR 都行得) | 實測(env -i) |
| approved.json 路徑 | `$HOME/.hymn-deploy/approved.json`,HOME 有就搵到 | 實測 |
| TCC 權限 | repo 唔喺 Documents/Desktop;healthcheck 已經日日喺排程下讀寫 `backend/data/` | 間接實測 |
| `launchctl bootout/bootstrap gui/$UID` 喺 agent context | 預期得(同 uid、healthcheck agent 喺 gui domain);如果 healthcheck 其實係 load 咗入 `user/` domain(例如冇 GUI login 時 load),bootstrap `gui/` 有機會失敗 | **推論**,冇實測(唔准 launchctl,連 print 都冇做) |
| bootout 後 `sleep 1` 再 bootstrap 嘅 race | 同環境無關,但係真 restart 先會見到嘅風險(bootout 未完就 bootstrap 可能 `Bootstrap failed: 5`) | 推論 |
| 新 backend process 生命週期 | 由 launchd bootstrap 自己起,唔係 healthcheck 嘅子 process,healthcheck job 完咗唔會拖死佢 | 推論 |

**唯一完整證明係一次真 restart**(例如下次 Eric 批准部署時,由 Terminal 用 `cd / && env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash ops/deploy/backend-restart.sh --same-code`,或者等真故障發生)。唔做呢一步,「launchctl 喺 agent context 得唔得」仍然係未驗證。

## 5. 測試重跑(`ops/stream/test/`,scratch 目錄)
t1 / t2 / t3 / t5 / t6 / t8 全部行完 rc=0,輸出同預期一致:
- t2:gate-fail stub → GATE-BLOCKED;node 缺 → precondition-failed 冇扣配額;L6 並行只 1 個過。
- t3:冇 ai-on 零 call;偽造 VERDICT 降級/規則接手;冇孤兒 `sleep 300`。
- t5:密鑰全部 REDACTED。
- t6:V1 launchd 等效鏈 gate 放行 exit=0;V3 並發 20 輪 state 可解析、冇殘留 lock。
- t8:案 3 回 escalate 而唔係 swap —— 係因為閒置 slot(08.30)舊過現役(09.27),測試本身已註明「視乎機上候選版本」,唔係 regression。
- (附註:t6 V1 嘅「對照」段冇傳 PATH,得出嘅係 bash 預設 PATH,唔係 launchd 嗰個;唔影響結論,但嗰段唔算嚴格嘅 launchd 等效。)

## 發現(唔擋今次修正)
- **F1(低)配額被失敗 restart 食咗**:selfheal 淨係認 `abort:HEAD` 做 gate-blocked。`backend-restart.sh` 其他失敗(rc=128、dirty tree 嘅 `abort:backend/ working tree`)全部當 `backend-restart-failed`,**restartsToday +1**。remedy 就係 call 之前已經扣咗配額。修正前每次形態② 都係咁白白扣額;修正後只剩 dirty-tree 呢條路會咁。
- **F2(資訊)`ops/stream/stream-status.sh` 喺 working tree 有未 commit 改動**(+30/-2,HLS-PREFLIGHT 09-07 加 403 率欄位)。launchd 行嘅係 working tree,即係正喺排程下行緊未 commit 嘅 code。
- **F3(資訊)** `backend/data/stream-selfheal.log` 唔存在(selfheal 從未喺 due 路徑寫過 history),同「形態② 自動 restart 從未真正發生」一致。

## 側效應(如實)
- 冇 restart backend(全部 `--dry-run`)、冇 launchctl、冇 approve.sh、冇 OTA、冇 swap、冇打 YouTube/googlevideo、冇掂 Cloudflare。
- 冇寫 prod 檔:`~/.hymn-deploy/*`、`backend/data/stream-*`、`docs/SUPERVISION-LOG.md` mtime 全部早過驗收開始時間(15:37)。
- 喺 scratch 起過一個 python 本機 stub(127.0.0.1:38917),完咗已 kill 並確認冇殘留。
- 冇改 code、冇 git 寫操作;唯一寫入 repo 嘅檔係本文件。
