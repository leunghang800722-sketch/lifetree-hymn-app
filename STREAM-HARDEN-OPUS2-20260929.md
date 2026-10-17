# STREAM-HARDEN 獨立驗收第二輪(Opus)2026-09-29 晚

對象:`0e36d1f`(script+README)、`22b6c15`(testlib/t9/t12+報告修正)。第一輪報告 `STREAM-HARDEN-OPUS-20260929.md`。
方法:冇信執行者報告,重新讀 diff、重新跑。scratch:`…/scratchpad/opus11/`(`attack.sh`/`attack.out`、`tl.sh`/`tl.out`、`reg/t*.out`、`pre-tick.txt`/`post-tick.txt`)。
時間窗:22:00 開始讀 code;22:08:32 真 tick 完先開始跑任何嘢;22:08:55–22:11:26 攻擊+testlib+回歸,冇撞 22:37 tick。

## 判詞:**過**

- M1 / M2 / M3 / L1 / L4 / L5(ctx 部分)全部修好,而且實測過。
- **22:07 tick 冇被新 guard 誤殺**(見下面),監察層冇靜死。
- 剩低嘅都係已知低風險(L2 / L3 / L5-lock)同範圍外(healthcheck / selfheal),另有幾個 Info。

## 最重要:22:07 真 tick 核實

| 項目 | 前(22:01) | 後(22:08:44) | 結論 |
|---|---|---|---|
| `~/.hymn-deploy/stream-watch-state.json` mtime | 21:38:10 | **22:08:32** | watch 行過 guard、攞到 lock、寫咗 state |
| `backend/data/stream-health-state.json` lastCheck | 21:38:10 | **22:08:32**(ok=3,cf=0) | 同 watch state 同一秒,即同一個 tick |
| `/tmp/hymn_stream_watch.log` | 6 行 md5 `10dde8f0…` | 6 行,md5 不變,`REFUSED` 0 次 | guard 冇 fire |
| 警報 / SUPERVISION-LOG | 冇 `STREAM-ALERT.md` | 冇;watch 冇寫 SUPERVISION-LOG | 冇新 alert |
| `.watch-ctx` | 冇 | tick 完已經刪咗 | L5 新 trap 喺真 tick 行得通 |

watch state 內容冇變(status=ok、badTicks=0),只係 mtime 更新,呢個係健康 tick 嘅正常樣。

## 第 7 點:「測試唔設 env 或者只設一半,都冇可能寫 prod」逐支判詞

| Script | 判詞 |
|---|---|
| `stream-remedy.sh` | **成立**。唔設 env、半設(三個 env 嘅所有子集)、其中一個指真 home、symlink、`..`、相對路徑、zsh `env $E`,有冇 CLAUDECODE 都試過,100+ 次全部 REFUSED,零寫入。 |
| `stream-diagnose.sh` | **成立**。唔設 env、半設、symlink、`..`、`DIAG_DIR` 指真 home:全部 REFUSED。測試模式下子 remedy 冇 tmp state,會跌返 prod 然後被拒(實測 `restart-backend → exit=2 REFUSED`)。 |
| `stream-watch.sh` | **喺 Claude shell 入面成立**。CLAUDECODE、`WATCH_MANUAL=0/yes`、`TEST=2` 全部 REFUSED;`TEST=1` 加上非 tmp 嘅 `WATCH_DIR`/`STATE`/`LOG_MD`/`ALERT`、symlink、`..`、冇 `WATCH_DIR` 都係 REFUSED。**唔成立嘅情況**:喺冇 CLAUDECODE 嘅 shell(Eric 自己個 Terminal、`env -u CLAUDECODE`)唔設 env 直接行 = 一個完整嘅真 tick。呢個係設計上嘅取捨(同 launchd 分唔開),唔係漏洞。 |
| `ops/lyrics/stream-healthcheck.sh` | **唔成立**(範圍外,紅線唔准改)。行一次就會寫真 health state/log/SUPERVISION-LOG,仲會 call selfheal。新情況:喺 Claude shell 行嘅話,尾段 watch 會 REFUSED,呢一行 REFUSED 會 append 落真 `/tmp/hymn_stream_watch.log`(Info)。 |
| `stream-selfheal.sh` | **唔成立**(範圍外,冇 guard,可以真 swap/restart)。 |
| `testlib.sh` | **預防成立**:export 晒 remedy/diagnose/watch 要用嘅 tmp 路徑同 stub notify,symlink 出 tmp 會 exit 2。**偵測成立**:canary、yt-dlp readlink、`stream-*.log`、SUPERVISION-LOG、listener pid 全部捉到(正控)。**捉唔到**:macOS 通知、backend cache/DB、SIGKILL 死咗嘅測試;另外用 `env -i` 嘅 case 冇咗 testlib 啲 env,只可以靠 script 自己嘅 guard。 |

**剩餘風險**
- **L2(已知)`.watch-ctx` 係全機通用憑證**:真 tick 行緊嗰陣,任何冇 CLAUDECODE 嘅 process 都過到 remedy/diagnose 嘅 guard。健康 tick 大約幾秒;要診斷嘅 tick 最長大約 11 分鐘。README 講 watch 測試模式下「drill 用嘅 remedy … → REFUSED」,呢句只喺有 CLAUDECODE 或者冇真 ctx 嗰陣先啱。
- **L3(未修)**:`kill -0` 唔會核 pid 係咪真係 stream-watch;`kill -9` 殘留 ctx,而 pid 喺 30 分鐘內被重用,就會當有效。
- **L5-lock(未修)**:trap 仍然係無條件 `rmdir "$LOCK"`。如果 stale lock 被第二個 tick 清走,第一個 tick 收尾會拆埋第二個 tick 個 lock(ctx 部分已經修好)。
- **healthcheck / selfheal**:範圍外,冇 guard。

## 1–6 證據

**1. `git show 0e36d1f` 逐行**
- remedy:測試模式要 `STREAM_WATCH_TEST=1` **而且** `REMEDY_STATE`、`REMEDY_LOG`、`WATCH_DIR` 三個都過 `_sw_tmpok`。`_sw_tmpok` 要求:絕對路徑、冇 `..`、用 `/usr/bin/python3 os.path.realpath` 解析之後喺 tmp 下。`/tmp` 本身唔收,因為要 `/*`。唔係測試模式就 unset 晒所有 override,用 dscl 重設 HOME,再行 guard。測試模式下 `SELFHEAL_STATE` 預設指 `$WATCH_DIR`,唔會 fallback 去 backend/data。⇒ 正確。
- watch guard 位置:喺 `. lib` 之後(lib 只係 export 同定義函數,唔寫嘢)、`STATE=`/`mkdir`/lock 之前。⇒ 正確。
  - prod 路徑唔會 call python(`&&` 短路),所以 launchd tick 唔會依賴 python。
  - 測試模式下,`LOG_MD`/`ALERT` 預設去 `$WATCH_DIR`,notify 預設 `/usr/bin/true`。
- **偏差 2(CLAUDECODE 只喺非測試模式先查)合理**:測試模式下,watch 自己所有寫入目標(state/lock/ctx/request/drill.log/alert/LOG_MD)都被迫留喺 tmp,notify 係 true。子 diagnose 會按自己規則入測試模式(ai-on 喺 tmp,冇 = 規則),子 remedy 冇 tmp state 就跌 prod 然後被拒。所以喺 Claude shell 跑測試模式 watch,結構上寫唔到 prod。實測:合法測試模式跑一次 rc=0,只喺 tmp 寫咗 `stream-watch-state.json`,ctx 已清。唯一出口係 caller **明文**將 `WATCH_*_CMD` 指去真 command,咁已經唔係「漏設」。
- diagnose:同一個 `_sw_tmpok`;測試模式 `SELFHEAL_STATE` 預設 `$WATCH_DIR`。⇒ 正確。
- L5:`_sw_ctx_rm` 只刪「內容 pid == `$$`」嘅 ctx(subshell 寫入嗰陣 `$$` 仍然係 watch pid)。真 tick 同測試 tick 行完都冇殘留 ctx。

**2. 攻擊重演**(真 repo、cwd=/、bash;每一項前後都快照 `~/.hymn-deploy` 全部檔含隱藏檔 md5、watch log md5、SUPERVISION-LOG md5、`backend/data/stream-*` md5、yt-dlp readlink、:3001 pid)
- 126 項,**全部符合預期,零 prod 寫入**(BAD=0)。
  - M1:半設嘅 10 種組合(空、單個、兩兩、三個齊但其中一個指真 home)× 5 個 action(escalate、wait、status、swap DRY、restart DRY)× CLAUDECODE 有/冇 = 100 次,全部 rc=2 REFUSED。半設路徑一個檔都冇建。
  - zsh `env $E`、symlink→真 home(有冇 CLAUDECODE 都試)、`/tmp/../Users/…`、相對路徑、`WATCH_DIR`=真 home、`HOME`=tmp:全部 rc=2。
  - diagnose 7 項:6 項 rc=2;測試模式 + backend-down fixture 嗰項 rc=0,子 remedy restart-backend 被 REFUSED。
  - M2 watch 12 項:11 項 REFUSED rc=2;合法測試模式嗰項 rc=0,只寫 tmp。
- **冇用** `env -i` 行真 repo 嘅 watch。

**3. testlib 新快照**(`tl.out`)
- C0 負控:`PROD-SNAPSHOT OK`,預設 `WATCH_DIR`/`LOG_MD` 喺 scratch,notify 係 stub。
- C1 canary:喺真 `~/.hymn-deploy` 寫隱藏檔 `.opus11-canary-34459` → rc=1 `PROD-WRITE DETECTED`,**即刻刪咗,已確認唔存在**。
- 假 repo(copy testlib,port 3001 換做 39011):
  - F0 負控 OK。
  - F1 yt-dlp `va→vb`:捉到。
  - F2 `stream-x.log` append:捉到。
  - F3 喺 39011 起一個 listener:捉到,印 `PROD-RESTART DETECTED`。
  - F4 SUPERVISION-LOG:捉到。
  - F5 `WATCH_DIR` 經 symlink 指去 `/usr`:testlib exit 2。

**4. L4**:`grep -rn "REMEDY_MANUAL=1\|DIAG_MANUAL=1" ops/stream/test/` 得 5 行(t12:53/54/57/79、t9:88),全部都係 `$FR_R`/`$FR_D`/`$FR/…` 假 repo 副本(HOME 經 sed 換咗)。t9 B-7 實跑:HOME/WATCH_DIR/STATE/LOG 全部解析去假 home,`/tmp/x-f6-home` 同假 home 都係 0 個檔。t9/t12 真 repo 淨係剩 prod 模式嘅**負控**(冇憑證 → 期望 REFUSED)。

**5. 回歸**:`cd /`,t1–t12 全部 rc=0,每支最尾都係 `PROD-SNAPSHOT OK`。t12 44 個 PASS、`FAILS=0`,冇 SKIP(新 (i)(j)(k) 都有行到)。所有 `ops/stream/*.sh`、`test/*.sh` 過 `bash -n`。`git diff fa14bce HEAD --stat`:8 個檔,全部喺 `ops/stream/` 加 `STREAM-HARDEN-REPORT-20260929.md`。

**6. 報告 §2.1 + 白話版**
- 三宗事故拆開寫,已經改正咗第一輪指出嘅 (i)(ii)(iii)。適用範圍講得如實(remedy/diagnose/watch 包,healthcheck/selfheal 唔包),亦寫明快照係「事後偵測」。**準**。
- 細節唔準(Info):
  - 第 3 點「watch … 本身冇測試模式」係第二輪**之前**嘅狀態,而家 watch 已經有,建議加「(當時)」。
  - 同一份報告「偏差」節將 21:30 嗰次歸因於 testlib 跨 run 累積 state,§2.1 就講「真正修好佢嘅係 t7 個 sed」。兩樣其實都係真,但未講明係「累積 = 觸發,寫死路徑 = 根因」。
- 白話版:Eric 睇得明,冇術語,範圍講得準。唯一漏咗:「監察程式自己排程行嗰陣」嗰幾秒到幾分鐘,其他(非 Claude)程式都過到(L2)。可以唔加,但知道就好。

## 新發現(全部都係 Info / 低)

- **I1** 歌詞 keeper 每個鐘 **:12** 都會 append `docs/SUPERVISION-LOG.md`(今晚 22:12:37 見到,唔係我寫嘅)。所以除咗 :07/:37,跨 :12 跑測試都會令快照假紅。README 嘅「避開時間窗」要加埋 :12(keeper 19:00–09:00 先行)。
- **I2** 喺 Claude shell 行 healthcheck,尾段 watch 會 REFUSED,呢行會寫落真 `/tmp/hymn_stream_watch.log`。如果有 Claude 例行 session 會人手行 healthcheck,watch log 會出 REFUSED 行,而嗰個例行 session 嗰次就唔會有監察。
- **I3** remedy 測試模式下 `probe` 冇設 `HYMN_STREAM_BASE` 嘅話,會打真 backend `127.0.0.1:3001/api/stream/<id>`,即係會觸發真 resolve / googlevideo。唔寫 repo 檔,但係真網絡副作用。t* 全部有設 BASE,所以冇中。
- **I4** testlib 發現 yt-dlp / pid 變咗嘅時候,diff 行只印 `< va` / `> vb` / `> 35041`,冇標明係邊一節(pid 有另外一行 `PROD-RESTART`,yt-dlp 就冇)。睇 log 嘅人未必知係 swap。
- **I5** 測試模式預設 restart 指令,仍然會行真 `ops/deploy/backend-restart.sh --same-code --dry-run`(t6 V1 行過一次:冇寫 deploy.log,pid 冇變)。安全與否取決於嗰支 script 嘅 `--dry-run` 啱唔啱。呢個係沿用第一輪嘅設計。

## 側效應(如實)

- **prod 寫入**:22:09 canary `~/.hymn-deploy/.opus11-canary-34459`,即刻刪咗,已確認唔存在(`~/.hymn-deploy` 目錄 mtime 因此變咗)。除此之外冇寫過 prod。
  - 最終核對(22:12:58):`~/.hymn-deploy` 檔案清單同 tick 後一樣。watch log 仍然係 6 行,md5 不變。yt-dlp 仍然係 `ytdlp-venv-a`。:3001 仍然係 pid 91265。
  - `docs/SUPERVISION-LOG.md` md5 22:12 變咗,係歌詞 keeper 嘅 `[22:12] P線時報`,唔係我寫嘅(I1)。
- **跑過嘅嘢**:
  - attack.sh 126 項。
  - tl.sh(canary + 假 repo 6 項)。
  - t1–t12 各一次。t6 V1 照舊行咗真 `backend-restart.sh --same-code --dry-run` 一次,冇寫 deploy.log,冇 restart。
- **起過嘅 process**:我起嘅 python http.server :39011 已經 kill;t9/t12 起嘅 sleep 同 http server 由測試自己收。`pgrep` 確認冇殘留。
- **冇做**:restart、launchctl、approve、OTA、swap、drill.request、真模型、YouTube;冇讀 secret、冇改 code、冇 git 寫操作;冇 kill 過唔係自己起嘅 process。
- **唯一改過嘅 repo 檔**:本檔。
