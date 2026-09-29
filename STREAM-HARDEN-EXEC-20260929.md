# 執行單：小瑕疵收尾 + 測試防呆（唔准再寫 prod）2026-09-29 晚

Eric 要求今晚執埋 `FINAL-POSTCHECK-OPUS-20260929.md` 四個小瑕疵，並且回應「Opus 兩次手誤令測試寫咗嘢落正式 log」——唔准再靠記得設 env。
基準 HEAD `f565a3a`（`76dca5e` 已做咗：t7 stub 唔 echo、`san()` 改 byte 模式且已剔走 U+200D ZWJ、drill pgrep 錨定絕對路徑）。
流程：Sonnet 執行 → Opus 驗收（要用「唔設任何 env 直接跑」做負控）→ Fable commit 收爐。

## 0. 紅線（照舊）
唔改 `ops/deploy/*`/healthcheck/selfheal/plist/`.claude/`/`CLAUDE.md`/backend/frontend；唔掂 `stream-status.sh`；唔寫 `~/.hymn-deploy/*`、`/tmp/hymn_stream_watch.log`、`docs/SUPERVISION-LOG.md`、`backend/**`；唔 restart/launchctl/approve/OTA/swap/drill.request；唔真模型 call；唔 kill 非自己起嘅 process；git 只 pathspec。**絕對唔准喺真 repo 用 prod 模式跑 remedy 任何 action**——本單做完之後呢句會由 code 硬性保證。

## 1. 四個小瑕疵（Part 1）
| # | 項 | 做法 |
|---|---|---|
| 1a | t7 寫假嘢落 `/tmp/hymn_stream_watch.log` | `76dca5e` 已令 stub 唔 echo；**再加**：t7 跑前記行數、跑後行數不變先算過（行數變咗 → 測試 exit 1 並印 `PROD-WRITE`）。根因係 healthcheck 寫死路徑，紅線唔准改 healthcheck，所以用 assert 兜。 |
| 1b | `san()` UTF-8 切爛變空 | `76dca5e` 已改 byte 模式。**補測試**（`t11-san.sh`）：正控 `✅ 串流監察恢復` byte 不變；負控 U+202E/U+2028/U+0085/U+200B/U+2066/BOM 剷走；切爛 `a\xe4\xb8` 原樣保留、stderr 零輸出；`LANG=` + 150 個「串」→ 輸出非空、≤200 byte；escalate 流程端到端（測試模式）remedy.log 嗰格有內容。同一組字元亦要套用喺 `stream-diagnose.sh` 嘅 `ctl` regex（Python 側已含，核對 ZWJ U+200D **唔喺**剷走名單）。 |
| 1c | drill pgrep 量度 | Eric 指定改用 `/usr/sbin/lsof -nP -t -iTCP:3001 -sTCP:LISTEN`（絕對路徑，launchd PATH 有 `/usr/sbin`）做主量度，攞到 PID 後用 `ps -o command= -p` 核命令行含 `backend/server.js`（唔含就記 `pid_after=<pid>?`）；lsof 冇結果 → `none`。port 由 `$BASE` 解析（測試模式 t9 用 scratch 假 backend 嘅 port，`DRILL_PGREP_PAT` 可以移除或者保留做 fallback——報告寫明）。 |
| 1d | ZWJ 組合 emoji 被拆 | `76dca5e` 已剔走 U+200D；t11 加正控 `👨‍👩‍👧` byte 不變。 |

## 2. 測試防呆（Part 2）—— 「唔設 env 就冇可能寫 prod」

### 2.1 根因（要寫入報告，俾 Eric 睇）
兩次事故（Opus 第二輪 t2 section D、Opus 最終 20:47 zsh `env $E`）同 Fable 中午誤觸，共同點：**remedy/diagnose 預設係 prod 模式**，測試模式要靠 caller 記得設 `STREAM_WATCH_TEST=1` + tmp 路徑；一個 shell 拆字差異、一次 edit 出錯，就靜靜跌落 prod。設計上「忘記 = 寫 prod」係錯嘅方向，應該係「忘記 = 拒絕」。

### 2.2 remedy / diagnose：prod 模式要有「合法 caller 憑證」
- `stream-watch.sh` 每個 tick 攞到 lock 之後，寫 `$WATCH_DIR/.watch-ctx`（內容：`pid=<watch pid> ts=<epoch>`，`umask 077`），tick 結束（包括任何 exit 路徑，用 `trap`）刪走。
- `stream-remedy.sh` / `stream-diagnose.sh` 非測試模式時：**必須**滿足以下其一，否則 exit 2 印 `REFUSED: prod 模式只准由 stream-watch tick 內呼叫；人手用請設 REMEDY_MANUAL=1（或 DIAG_MANUAL=1）`，並且**零寫入**（連 remedy.log 都唔寫）：
  - (i) `$WATCH_DIR/.watch-ctx` 存在、mtime < 30 分鐘、入面 pid 仍然生存（`kill -0`）；
  - (ii) `REMEDY_MANUAL=1`（人手明示）。
- `.watch-ctx` 路徑喺 prod 模式一律由真 HOME 計（F6 已有），env 搬唔走。
- selfheal 唔經 remedy，唔改。drill 路徑同樣受 (i) 保護（本來就係 watch 內叫）。
- 額外一層：非測試模式而且 `${CLAUDECODE:-}` 非空（Claude 工具 shell）而且冇 `REMEDY_MANUAL=1` → 同樣 REFUSED（兩次事故同 Fable 誤觸全部發生喺 Claude shell）。

### 2.3 測試 harness 硬防呆（`ops/stream/test/testlib.sh`，全部 t*.sh source 佢）
- 入口即 `export STREAM_WATCH_TEST=1`；第一個參數 scratch 目錄必須存在且喺 `/tmp|/private/tmp|/var/folders|/private/var/folders` 下，否則 exit 2。
- 預設 export `WATCH_DIR`、`REMEDY_STATE`、`REMEDY_LOG`、`SELFHEAL_STATE`、`DIAG_DIR` 去 scratch（個別 case 可以覆蓋，但覆蓋值同樣要過 tmp 檢查——提供 `tl_require_tmp <path>`）。
- **prod 快照斷言**：source 時記 `~/.hymn-deploy/*`（全部檔 md5 + 檔名清單）、`/tmp/hymn_stream_watch.log` 行數、`docs/SUPERVISION-LOG.md` md5、`backend/data/stream-*.json` md5；`trap EXIT` 再比一次，任何差異 → 印 `PROD-WRITE DETECTED: <檔>` 並 exit 1。**呢個係最後防線：就算上面全部繞過，測試都會即刻紅。**
- 每支 t*.sh 改為 `. "$(dirname "$0")/testlib.sh" "$@"` 開頭；`env -u STREAM_WATCH_TEST` 嗰類「模擬冇設 env」嘅 case（t2 D）改為驗 2.2 嘅 REFUSED 行為（唔設 env、唔設 MANUAL → exit 2 零寫入）。
- 新 `t12-guard.sh`：(a) 直接 `stream-remedy.sh wait` / `status` / `restart-backend`（冇任何 env，cwd=/）→ exit 2、remedy.log md5 不變、state 不變；(b) `REMEDY_MANUAL=1 REMEDY_DRY_RUN=1 … wait` → 行到（dry）；(c) `.watch-ctx` 存在但 pid 死咗 → REFUSED；(d) 存在且 pid 生存（用測試自己嘅 sleep 做 pid）→ 行到；(e) `CLAUDECODE=1` 冇 MANUAL → REFUSED；(f) diagnose 同樣 (a)(b)。**全部喺測試模式外跑但 state 指去 scratch？—— 唔係：(a)(c)(e) 就係要證明「唔設 env 都寫唔到 prod」，所以 (a)(c)(e) 唔設 REMEDY_STATE，靠 REFUSED 零寫入 + testlib 快照斷言雙保險。**
- 跑 watch 全鏈（t1/t3）時 watch 自己會寫 `.watch-ctx` 落 scratch WATCH_DIR，remedy (i) 條件自然滿足，唔使改 case。

### 2.4 README：加「點解會 REFUSED / 人手點用（`REMEDY_MANUAL=1`）/ 測試點寫（必 source testlib）」。

## 3. 驗證
| 項 | 證據 |
|---|---|
| V1 | t1–t12 全過（`cd /` + 絕對路徑 + scratch 參數），每支結尾印 `PROD-SNAPSHOT OK` |
| V2 | 負控：故意喺一支測試入面加一行寫 `~/.hymn-deploy/zz-canary`（用完即刪，報告寫明）→ testlib 快照斷言令 rc=1 並印 `PROD-WRITE DETECTED` |
| V3 | 真 launchd 等效（`cd /` + `env -i HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin`）：watch tick（scratch WATCH_DIR）→ `.watch-ctx` 出現 → diagnose/remedy 行到 → tick 完 `.watch-ctx` 消失；watch 被 kill -9 之後殘留 `.watch-ctx`（pid 死）→ remedy REFUSED |
| V4 | 重演兩次事故指令（Opus t2 D 舊寫法 `env -u STREAM_WATCH_TEST HOME=… restart-backend`；zsh `env $E …`）→ 全部 REFUSED exit 2，prod 快照不變 |
| V5 | `bash -n` 全部；`git diff f565a3a HEAD --stat` 只有 `ops/stream/`（含 test）+ 報告 |

## 4. 交付
Commit：script+README 一個；test（testlib/t11/t12/各 t 改動）+ 報告 `STREAM-HARDEN-REPORT-20260929.md` 一個（報告要有 §2.1 根因段，Eric 會睇）。
