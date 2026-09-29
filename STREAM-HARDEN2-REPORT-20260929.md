# STREAM-HARDEN2 執行報告 2026-09-29(healthcheck + selfheal 三層防呆)

基準 `2bbd80a`(執行單 commit `b141d5d`)。Script commit:`6c0ed09`(healthcheck、selfheal、`ops/stream/README.md`);test+報告 commit 見最後。
只出證據,唔判 PASS/FAIL。**冇自己觸發真 tick、冇用 env -i 跑真 repo healthcheck/selfheal 而未先預檢**(見 §3 預檢做法)。

## 1. V1:`git diff 2bbd80a HEAD` 逐行標註(guard / 路徑 / 測試模式 / 註解)

被刪走嘅原有行只有 5 行,全部係「路徑」或「註解」:

| 被刪行 | 換成 | 類別 |
|---|---|---|
| healthcheck `# 手動試: …--verbose` | 同一行加 `(HC_MANUAL…)` 註解 | 註解 |
| healthcheck `if [[ -f "$HOME/.hymn-deploy/stream-watch.on" && …` | `HC_WATCH_ON="$HOME/…/stream-watch.on"`(prod 值一樣)+ `if [[ -f "$HC_WATCH_ON" && …` | 路徑(prod 同值) |
| healthcheck `… stream-watch.sh" >> /tmp/hymn_stream_watch.log …` | `>> "$HC_WATCH_LOG"`(預設 `/tmp/hymn_stream_watch.log`) | 路徑(prod 同值) |
| selfheal 兩行「手動試」註解 | 加 `SELFHEAL_MANUAL=1` | 註解 |
| selfheal `YTDLP_LINK="${YTDLP_LINK:-$REPO/backend/tools/yt-dlp}"` | `if TEST … else <同一句> fi` | 路徑(prod 同句) |

新增行(healthcheck ~57 行 / selfheal ~53 行)逐段:

| 位置 | 內容 | 類別 |
|---|---|---|
| HC `HC_WATCH_LOG=` | watch log 路徑變數,預設舊寫死值 | 路徑 |
| HC `_hc_tmpok` | realpath tmp 檢查 | guard 函數 |
| HC `if STREAM_WATCH_TEST=1 … elif CLAUDECODE…` | 測試模式判定 + REFUSED exit 2(WATCH_DIR/YTDLP_BIN 要 tmp、BASE 唔准 :3001);非測試 + CLAUDECODE + 冇 HC_MANUAL → REFUSED | guard |
| HC 分支內 `LOG/STATE/HISTORY/HC_WATCH_LOG=$WATCH_DIR/…`、`export HEALTH_STATE/SELFHEAL_STATE` | 測試模式強制路徑 | 路徑(僅測試模式) |
| HC 分支內 `HYMN_STREAM_BASE` 預設 :9、`YTDLP_BIN` scratch stub | Layer A/B stub | 測試模式 |
| HC `_hc_cdn_stub` | 固定 206 | 測試模式 |
| HC `HC_CTX`、`mkdir -p`、寫 ctx、`_hc_ctx_rm`、`trap EXIT / TERM INT HUP` | tick 憑證 | guard(憑證) |
| HC Layer B `if HC_TEST … else <原 curl 行> fi` | 測試模式用 `HC_CDN_FETCH_CMD`/stub | 測試模式(prod 分支原句) |
| HC `HC_WATCH_ON` 測試模式覆蓋 | `.on` 落 `$WATCH_DIR` | 路徑(僅測試模式) |
| SH `_sh_tmpok`、`_sh_ctx_valid`、guard `if/else` | 測試模式判定(三 env 齊+tmp)/ prod:HOME 重設、要 `.tick-ctx` 或 `SELFHEAL_MANUAL=1`、CLAUDECODE 拒 | guard |
| SH `if TEST: LOG/HISTORY=$WATCH_DIR/…` | 測試模式強制路徑 | 路徑(僅測試模式) |
| SH `RESTART_CMD … --dry-run`、`APPLY_CMD=echo TEST-MODE…`(只喺測試模式且 caller 未設) | 測試模式唔真行 | 測試模式 |
| SH `BASE` 測試模式預設 :9、`verify_layer_b` 內 `if SH_TEST … else <原 curl 行> fi`、`_sh_cdn_stub` | Layer B/A stub | 測試模式 |

冇碰:探測判斷(Layer A/B、healthy 判定、consecutiveFail、節流、警報寫法)、selfheal 形態判定/修復梯/配額/節流。

## 2. V2:prod 路徑靜態不變(唔跑真 tick;由 Opus 等 :07/:37 核)

真 launchd tick:冇 `STREAM_WATCH_TEST`、冇 `CLAUDECODE`。
- healthcheck:`if [[ "${STREAM_WATCH_TEST:-0}" == "1" ]]` 否;`elif [[ -n "${CLAUDECODE:-}" && … ]]` 否 ⇒ `HC_TEST=0`,兩個分支都短路;其餘新 code 全部有 `$HC_TEST -eq 1` 前綴,prod 走原句(`else` 內原 curl)。
- selfheal:測試判定要 `STREAM_WATCH_TEST=1` ⇒ prod 走 `else`:HOME 重設 + ctx 檢查;其餘新 code 全部 `$SH_TEST -eq 1` 前綴。

| 變數 / 行為 | 舊 | 新(prod) |
|---|---|---|
| HC `LOG`/`STATE`/`HISTORY` | `$REPO/docs/SUPERVISION-LOG.md`、`backend/data/stream-health-state.json`、`stream-health.log` | 一樣(測試模式先覆蓋) |
| HC watch log | 寫死 `/tmp/hymn_stream_watch.log` | `HC_WATCH_LOG` 預設 `/tmp/hymn_stream_watch.log`(⚠️ 若 caller env 有 `HC_WATCH_LOG` 會生效;launchd plist 冇 EnvironmentVariables) |
| HC `stream-watch.on` | `$HOME/.hymn-deploy/stream-watch.on` | 一樣 |
| HC `BASE`/`YTDLP`/`IDS`/`TIMEOUT`… | 原值 | 一樣(冇改) |
| HC Layer B 直打 | `curl … "$url"` | 一樣(prod 走 else 原句) |
| HC exit code | 0 | 0(EXIT trap 只 `return 0`,唔 override) |
| HC PATH/USER | 唔改 | 唔改(**冇 source `stream-watch-lib.sh`**,因為佢會 export PATH/USER) |
| SH `LOG`/`STATE`/`HEALTH_STATE`/`HISTORY` | 原值 | 一樣 |
| SH `YTDLP_LINK`/`APPLY_CMD`/`RESTART_CMD`/`BASE` | 原值 | 一樣(`--dry-run`/stub 只喺測試模式且 caller 未設) |
| SH prod env override(`SELFHEAL_APPLY_CMD`…) | 認 | 認(**冇**像 remedy 咁 unset,避免改行為) |
| SH exit code | 0/1 | 0/1,新增只有 REFUSED exit 2 |

**prod 真正新增嘅行為(實事求是,唔係「零」)**:(1) healthcheck 每 tick 寫/刪 `~/.hymn-deploy/.tick-ctx`,並先 `mkdir -p` 該目錄;(2) healthcheck 新掛 `trap TERM/INT/HUP → exit 143`;(3) selfheal 每次多幾個短命 fork(`id`、`dscl`、`awk`、`stat`、`kill -0`;測試判定嘅 python3 realpath 喺 prod 因 `STREAM_WATCH_TEST` 冇設而短路唔行)並 `export HOME=<dscl 真 home>`(`/Users/macbookpro`,同 launchd HOME 一樣;dscl 攞唔到→reject exit 2,同 remedy 同款);(4) selfheal 若冇有效 `.tick-ctx` 就 REFUSED——**真 tick 必然有**(healthcheck 先寫、selfheal 係佢子 process、pid 生存)。呢四點就係 Opus 等真 tick 要核嘅嘢:tick 後 `.tick-ctx` 消失、selfheal 冇 REFUSED(只喺 unhealthy/剛恢復嘅 tick 先會 call selfheal)、`stream-health-state.json` 照更新。

## 3. V3:t13 證據(`test/t13-hc-selfheal-guard.sh`,全文輸出見 scratch `harden3/t13.out`)

安全網:每個「真 script + 預期 REFUSED」case,先喺 scratch 假 repo(逐字同一份 code,selfheal 只 sed 換 HOME 一行,腳本內 `diff` 核過)確認真係 REFUSED,先跑真 repo;真 `~/.hymn-deploy` 有 `.tick-ctx/.watch-ctx` 就 SKIP。
- **(a)** 真 healthcheck:`CLAUDECODE=1`(`env -u STREAM_WATCH_TEST`)→ exit 2 REFUSED;`STREAM_WATCH_TEST=1 WATCH_DIR=$REALHOME/.hymn-deploy` → exit 2;另加 YTDLP_BIN=真 yt-dlp、BASE=:3001 → exit 2。每個都對比 prod 摘要(`~/.hymn-deploy` 全部檔 md5+檔數、watch log md5+行數、SUPERVISION-LOG md5、`backend/data/stream-*` md5)不變,連 tmp WATCH_DIR 都冇建。
- **(b)** 真 selfheal:冇 env / 半設(缺 WATCH_DIR、缺 HEALTH_STATE、缺 SELFHEAL_STATE)/ 三個齊但缺 STREAM_WATCH_TEST / `CLAUDECODE=1` / 偽造 `.tick-ctx`(`HOME=<scratch forgedhome>`、live pid、有效 mtime;加一個連 WATCH_DIR 都指去偽造 home)→ 全部 REFUSED exit 2 零寫入(prod 摘要不變、半設 env 指去嘅 scratch 路徑冇被建)。偽造 HOME 被重設成真 home 後搵唔到真 ctx,所以 HOME/WATCH_DIR 都搬唔走。
- **(c1)** 測試模式全鏈:真 healthcheck(base=死 port :9、yt-dlp scratch stub、CDN stub 206、state 種 `consecutiveFail=2`)→ 新 consecutiveFail=3 → selfheal 形態②;restart stub 被 call,行內錄到 `args=restart --dry-run`、被 call 嗰刻 `.tick-ctx` 存在且 `pid=98201`=祖先鏈上 `stream-healthcheck.sh` 嘅 pid;tick 完 `.tick-ctx` 消失;`$WD` 內寫咗 `SUPERVISION-LOG.md`、`stream-health-state.json`(consecutiveFail=3)、`stream-health.log`、`stream-selfheal-state.json`(`backend-restart-recheck-fail`,因 verify 對死 port)、`stream-selfheal.log`;前後 prod 摘要不變。
- **(c2)** 測試模式 selfheal + `SELFHEAL_RESTART_CMD` 未設 + `SELFHEAL_DRY_RUN=1 --verbose` → `[dry-run] 會行:…/ops/deploy/backend-restart.sh --same-code --dry-run`(預設指令帶 `--dry-run`,dry-run 冇真行)。
- **(c3)** 測試模式 `YTDLP_LINK`=真 yt-dlp / `HYMN_STREAM_BASE`=:3001 → REFUSED。
- **(c4)** `kill -9` healthcheck(由 Layer B stub 核過 ctx pid=祖先 + 命令行含 stream-healthcheck.sh 先殺;wait rc=137):`.tick-ctx` 殘留(pid=98470 已死)、冇行到 selfheal/history;將殘留 ctx 放入假 home → 假 repo prod 模式 selfheal REFUSED 零寫入。
- **(d)** 假 repo prod 模式 selfheal:冇 ctx REFUSED;有效 ctx(自起 live sleep pid、剛寫)→ 行到,restart stub 被 call,state/log 寫落假 repo;dead pid / mtime 31 分鐘 / symlink / 內容壞 / 有效 ctx+`CLAUDECODE=1` → REFUSED;`CLAUDECODE=1 SELFHEAL_MANUAL=1` → 行到;無 ctx + `SELFHEAL_MANUAL=1 DRY_RUN` → 行到。**(d9)** 假 repo prod 模式 healthcheck(`HC_MANUAL=1 CLAUDECODE=1`、base :9、yt-dlp stub):tick 內 `$HOME/.hymn-deploy/.tick-ctx` 存在、tick 完消失,prod 路徑檔案落假 repo(`backend/data/stream-health-state.json`、`stream-health.log`、`docs/SUPERVISION-LOG.md`)。(該 case 內假 repo selfheal 因 `CLAUDECODE` 冇 `SELFHEAL_MANUAL` 被 REFUSED——正符合設計:HC_MANUAL 唔連帶授權 selfheal。)
- 結果:t13 `FAILS=0`、`PROD-SNAPSHOT OK`。

## 4. 回歸

| 測試 | rc | 結尾 |
|---|---|---|
| t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13 | 全 0 | 全部 `PROD-SNAPSHOT OK` |

t7 改動:刪咗 `sed` 副本換 watch log 路徑嗰段(healthcheck 副本而家自己有測試模式,強制落 `$WATCH_DIR/watch.log`);仍要用假 repo 副本,因為要將 `stream-watch.sh` 換成 stub(healthcheck 寫死 `$REPO/ops/stream/stream-watch.sh`);加咗 case 6 直接跑**真 repo healthcheck(測試模式)**;`/tmp/hymn_stream_watch.log` 行數不變 assert 保留(輸出 `行數不變(6)`)。testlib 快照加咗憑證隱藏檔存在性區塊(`find` 本身已含隱藏檔)。全部 `bash -n` 過。跑測試時間 23:59–00:02,避開 :07/:37/:12。

## 5. 偏離 / 補充(如實)

1. 冇 source `stream-watch-lib.sh`(執行單容許「自帶同一段」):因 lib 會 `export PATH/USER`,會改 healthcheck prod 環境;guard 函數各自內嵌一份(`_hc_tmpok`/`_sh_tmpok`/`_sh_ctx_valid`)。
2. 額外測試模式安全欄(超出執行單字面,但屬 guard/stub):測試模式 `YTDLP_BIN`(HC)/`YTDLP_LINK`(SH)要喺 tmp、`HYMN_STREAM_BASE` 唔准 `:3001`;HC 未設 `YTDLP_BIN` 時用 scratch stub(否則會真打 YouTube);selfheal verify Layer B 直打 CDN 加 `SELFHEAL_CDN_FETCH_CMD`/預設 stub(對稱 `HC_CDN_FETCH_CMD`)。理由:執行單要求「測試模式 Layer B 一律 stub」。
3. `HC_WATCH_LOG` 喺 prod 模式亦認 env(預設同舊值);執行單字面「預設維持」,冇要求 prod 忽略 env。
4. selfheal prod 模式**冇** unset override env(remedy 有)——保 prod 行為不變;由 ctx guard 擋。
5. healthcheck prod 嘅 `.tick-ctx` 路徑用 `$HOME/.hymn-deploy`(同原有 `stream-watch.on` 一樣由 HOME 計),唔用 dscl;selfheal prod 用 dscl 真 home。真 tick 兩者相同;`HC_MANUAL` 下 HOME 被搬會令 selfheal REFUSED(安全方向)。
6. `README.md` 亦改咗(舊句「healthcheck/selfheal 唔包」已過時),放喺 script commit。
7. 工作樹有不屬於我嘅 `stream-status.sh` 等 modified 檔,冇碰、冇入 commit(git 只用 pathspec)。

## 6. 側效應(如實)

- 測試期間冇寫 prod:每支 t* 結尾 `PROD-SNAPSHOT OK`;t13 內另有自己嘅 prod 摘要前後比對。冇 canary 寫入。
- 冇 restart / launchctl / approve / OTA / swap / drill.request / 真模型 / YouTube / googlevideo。測試模式 Layer B 全 stub;(d9) 假 repo prod 模式 healthcheck 只 curl `127.0.0.1:9`(死 port)。
- 起過嘅 process:t13 自起 `/bin/sleep 300`(收尾核 PPID+命令行後 kill,輸出 `killed`)、(c4) 用 stub `kill -9` 咗**自己起嘅測試 healthcheck**(核 ctx pid=祖先+命令行);冇 kill 非自己起嘅 process。
- 冇真 launchd tick 喺測試窗口內觸發;`.tick-ctx` 真 prod 路徑冇被測試寫過(只有真 tick 會寫,Opus 核)。
