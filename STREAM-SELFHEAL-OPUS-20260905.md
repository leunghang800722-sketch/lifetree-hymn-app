# 串流自動修復梯 —— Opus 5 獨立驗收 2026-09-05

驗收對象:`6f6efd0` / `cd2212e` / `9e74a00` / `829d472`(+ 文檔 `d18127b`)。
**冇信 Sonnet 個 harness** —— 自己喺 scratchpad 起咗一套完全獨立嘅
mock HTTP server(206 / 403 / 416 / 502 四種回應)+ 雙 slot 假 yt-dlp
(`ytdlp-venv-a` 舊病 / `ytdlp-venv-b` 新)+ stub apply / stub restart,
行咗 **13 個功能 case + 3 個對抗 case + 1 個 12-tick soak**。

**紅線遵守聲明**:全程零 source 改動、零 commit;`backend/data/stream-health-state.json`
mtime 驗收前後都係 `14:00:22`(冇被我寫過);`backend/tools/yt-dlp` 驗收前後都係
`ytdlp-venv-b/bin/yt-dlp`;`backend/data/stream-selfheal-state.json` 到而家**仍然唔存在**;
冇 restart backend、冇跑 launchctl bootout/bootstrap/kickstart(只用咗唯讀嘅
`launchctl print`)。`ops/lyrics/stream-healthcheck.sh` 嘅 `STATE`/`HISTORY`/`LOG`
**唔可以 env override**(:44-46),所以我**冇跑過佢**,佢嗰段接線只做靜態核實。

---

## 0. 一頁判定

| 項 | 判 |
|---|---|
| 1 三形態自己重跑(①/②/③ + rollback + gate + 安全閥 + 恢復 + 跨日 + dry-run) | **PASS** — 16/16 同預期一致 |
| 2 判定邏輯漏洞 | **有保留** — 次序有 false-green;`failCache 15 分鐘` 呢個理由**寫錯咗**;`pendingRecheck` 係死欄位 |
| 3 安全閥 | **PASS(機制)/ 有保留(重試無節流)** |
| 4 Rollback 正確性 | **PASS(主路徑)/ FAIL(兩個邊界)** — 空 readlink 會整死條 symlink;416 會誤 rollback |
| 5 同 update-ytdlp.sh 互動 | **PASS(版本相同)/ FAIL(冇 lock)** |
| 6 stream-status.sh | **PASS(欄位/exit/tz)/ 有保留(needsHuman 有洞、stale 門檻同 live 排程唔夾)** |
| 7 healthcheck 改動 | **PASS(節流/恢復/exit)/ FAIL(selfheal 自己無節流洗版)** |
| 8 plist | **PASS(兩份一致)** — 但 live launchd **仍然 10800s**,S1 未生效;人手兩句命令**正確** |
| 9 最壞情況 | 列出 8 條路徑;**「健康時誤 rollback / 誤 restart」搵唔到路徑** |

**上線判定:有條件可以開。** 要先修 §A 三條(P1 一行 guard、洗版節流、needsHuman 補
consecutiveFail);Dispatch 接 status 之前一定要處理 §8 stale 門檻 + §3b
approved.json 每日過期(唔處理嘅話 Eric 批咗嘅 Q3 等於冇開)。

---

## 1. 三形態自己重跑 —— 我自己嘅 harness

Harness 位置(session scratchpad,唔入 repo):
`…/scratchpad/h/{mock.py,fake-apply.sh,fake-restart.sh,tools/ytdlp-venv-{a,b}}`。
每個 case 全部 env override:`SELFHEAL_STATE` / `HEALTH_STATE` / `SELFHEAL_HISTORY` /
`SELFHEAL_LOG_MD` / `YTDLP_LINK` / `SELFHEAL_APPLY_CMD` / `SELFHEAL_RESTART_CMD` /
`HYMN_STREAM_BASE` / `SELFHEAL_IDS` / `SELFHEAL_YT_IDS`。

**儀器正控**:假 apply / 假 restart 每次被叫都 append 一行去 `logs/*-calls.log`。
「叫咗一次」係由 O1/O5 嘅 `apply-calls=1` / `restart-calls=1` 實證;
「完全冇叫」(O4/O9/O10)係由同一個機制報 0 —— 唔係「log 冇出現」呢種空洞證據。

| # | 場景 | 觀察到 | 判 |
|---|---|---|---|
| O1 | ① midfail=3,apply 換到 b,重驗 B 3/3 | `action=ytdlp-swap-ok` swaps=1 symlink a→b apply-calls=1 | PASS |
| O2 | ① 換咗但 B 仍 403×3 | `ytdlp-swap-rollback` symlink **揈返 a** form=③(①已試過) alert=1 swaps=1 | PASS |
| O3 | ① apply 冇候選(up-to-date) | `ytdlp-no-candidate` symlink 冇變 **swaps=0** form=③(①冇候選) | PASS |
| O4 | ① swapsToday=1 觸頂 | `alert-safetyvalve-ytdlp` **apply-calls=0** | PASS |
| O5 | ② A 全死 B 全好,restart rc=0,重驗 A 3/3 | `backend-restart-ok` restarts=1 restart-calls=1 alert=0 | PASS |
| O6 | ② restart 輸出 `abort:HEAD` rc=1 | `backend-restart-gate-blocked` **restarts 維持 0** alert=1 | PASS |
| O7 | ② restart 非 gate 失敗 rc=1 | `backend-restart-failed` restarts=1 alert=1 | PASS |
| O8 | ② restart rc=0 但 A 仍 502×3 | `backend-restart-recheck-fail` restarts=1 alert=1 | PASS |
| O9 | ② restartsToday=2 觸頂 | `alert-safetyvalve-backend` **restart-calls=0** | PASS |
| O10 | 純③(兩層死、midfail=1) | `alert-youtube` **apply/restart 兩個 log 都冇建立** | PASS |
| O11 | consecutiveFail=1 blip | 「唔郁手」只寫 state,hist/superv 全空 | PASS |
| O12 | cf=0 + 舊 alert active | `recovered`,alert 清,**swaps/restarts 保留 1/1**(日計數唔跟故障重置) | PASS |
| O13 | state date=09-04 swaps=1 restarts=2 | 跨日重置後照換,swaps=1 | PASS |
| O14 | `SELFHEAL_DRY_RUN=1`(見 §4 註) | — | 用 Sonnet 嗰個 case,我另外靜態核實 `hist()`/`supervision()`/`write_state()` 三個都有 `[[ "$DRY_RUN" == "1" ]] && return 0` 第一行 |

**意外收到嘅正控**:有一 round 我用 zsh 傳參,`$VAR` 冇 word-split,成串 args 變咗一個
argument。結果 selfheal 嘅 `*) shift ;;`(:82)**靜靜哋食晒**,用返 default
`healthy_a=1 healthy_b=1 midfail=0` → 判做形態③、只 alert。即係話 **args 壞咗嘅
fail-safe 方向係啱嘅**(唔會亂郁手),但亦都完全冇聲出。可以接受,值得知。

---

## 2. 判定邏輯漏洞

### 2a. 次序:兩層都 fail 而閒置 slot 有候選

`stream-selfheal.sh:224` `midfail >= 2` **一定贏**,唔理 `healthy_a`。
所以「YouTube 側全面封鎖」(A 全死 + B 全 resolve-fail)一定先當形態①。
規劃書 §2 本身就係咁寫(「①試完都唔得」→③),方向啱。

**但實測 A1 揭到一個 false-green**:

```
A1  --healthy-a 0 --healthy-b 0 --midfail 3   (即係 Layer A 0/3 全庫播唔到)
    → 形態①yt-dlp → apply 換到 b → 重驗 Layer B 3/3 過
    → action=ytdlp-swap-ok  alert_active=0
    → SUPERVISION-LOG 寫咗:🟢 **形態①已自動修復**
```

`Layer A 仍然 0/3`,即係用戶而家仍然一首都播唔到,但個梯已經清咗 alert、
寫咗綠燈。`stream-status.sh` 跟住會出 `needsHuman:false`(見 §6)。
**呢個係我搵到最容易令 Eric 收唔到消息嘅一條**。

②要等下一個 tick 先夠鐘試(A1b 實測:下一 tick B 已好、A 仍死 → 正確轉
`②backend` → `backend-restart-ok`)。即係最快都要 +30 分鐘(而家 live 係 +3 小時)。

> **建議**:①成功之後唔好無條件清 alert。要麼即場 `verify_layer_a`(見 2b:
> Layer A 個 failCache 其實只係 60 秒,唔係 15 分鐘,**驗得),要麼傳入嘅
> `healthy_a==0` 時保持 `alert_active=1` 兼 form 改做「①已修但 A 未返」。

### 2b. failCache —— 呢個理由寫錯咗（事實錯誤）

`stream-selfheal.sh:23-24`、`:263-264`、commit `9e74a00` message、
`STREAM-SELFHEAL-EXEC-20260905.md:13` 全部話「backend failCache 15 分鐘」。

實際:Layer A 打嘅係 `/api/stream/<id>` = `backend/routes/stream.js:299`

```js
url = await resolveAudioUrl(hymn.youtube_id, { playbackRetry: true });
```

而 `backend/lib/resolveAudio.js:263` `const horizon = opts.playbackRetry ?
FAIL_TTL_PLAYBACK_MS : FAIL_TTL_MS;`,`FAIL_TTL_PLAYBACK_MS = 60 * 1000`(:46)。
**Layer A 嘅視野係 60 秒,唔係 15 分鐘。** 15 分鐘嗰個(`FAIL_TTL_MS`:30)只
管預取 / keep-warm,同健康探測完全無關。

影響:
- **唔會出錯**(唔驗 A 係保守方向),但個理由唔成立,而且白白放棄咗即場端到端確認。
- 順帶答埋任務問題:**「A fail 係因為 failCache 而被錯判做②多餘 restart」呢條唔成立** ——
  就算用 15 分鐘,tick 間隔 30 分鐘(live 180 分鐘)已經完全罩死;用真數 60 秒就更加冇機會。

### 2c. consecutiveFail 門檻 2 嘅來源一致性

- healthcheck `:146` 寫 `$STATE` → `:198` 先至叫 selfheal。**寫先、叫後**,所以
  selfheal 讀到嘅係本 tick 嘅新值,唔係上一 tick。核實 PASS。
- 兩邊 default 路徑逐字相同(`$REPO/backend/data/stream-health-state.json`,
  healthcheck:45 / selfheal:51)。healthcheck **冇** export `HEALTH_STATE`,靠
  default 相等 —— 現況啱,但係隱式耦合;`HEALTH_STATE` 呢個名太通用,建議
  healthcheck 明文 `HEALTH_STATE="$STATE"` 傳落去。
- 安全閥計數住喺 selfheal 自己嗰份 state(`swapsToday`/`restartsToday`),同
  健康 state 分開 —— 啱,因為兩者生命週期唔同。跨日重置實測 PASS(O13)。

### 2d. `pendingRecheck` —— 死欄位

全 repo grep(`ops/` `backend/lib` `backend/routes` `docs/*.md` `*.md`)只有
`stream-selfheal.sh` 自己寫,同 exec sheet 提咗一句。**零讀者** ——
`stream-status.sh` 都冇出佢。即係「記低咗但冇人會睇」。
要麼喺 `stream-status.sh` 個 JSON 加返,要麼落個 TODO,唔好扮咗有機制。

---

## 3. 安全閥

### 3a. 機制本身 —— PASS
- ① 同日第 2 次唔換:O4,`apply-calls=0`。
- ② 同日第 3 次唔重開:O9,`restart-calls=0`。
- gate 唔過(`abort:HEAD`)唔耗額度 + `needsHuman`:O6,`restartsToday` 維持 0,
  alert.active=true。判斷根據 `restart_rc != 0 && grep -q "abort:HEAD"`(:303)——
  同 `backend-restart.sh:55` 真嗰句 `❌ abort:HEAD (…) 唔等於…` 對得上,而嗰個分支
  喺 launchctl **之前**(:120 之前)就 exit,所以「唔算郁過手」係啱嘅。

### 3b. 🔴 但係 ② 而家實際上係關咗嘅（現場證據）

```
$ git rev-parse HEAD            → d18127ba8169aaa40fbaef433db614804bb92f02
$ cat ~/.hymn-deploy/approved.json → backend.sha = d89b3adaac2e…(2026-09-02 批)
```

HEAD ≠ approved,即係**今日一發生形態②,梯只會出 `backend-restart-gate-blocked`**。
更嚴重嘅係結構問題:`com.hymnapp.dbautosync` **每晚 19:30 自動 commit hymns.db**
(`8936811`/`1c0b5d5`/`959f356` 就係),HEAD 每日都會行前 → approved.json 每晚都會
過期。gate 係 **per-repo-sha**,唔係 per-path,所以連純 docs commit 都會令 ② 失效。

> 呢個係「Eric 批咗 Q3 但實際上永遠唔會 fire」嘅落差,**要喺上線前拍板點處理**:
> (i) 每晚 autosync 之後自動 re-approve backend sha;或
> (ii) gate 改成只比 `backend/` 有冇未批改動;或
> (iii) 接受 ② 只係「有人手 approve 過先生效」,咁就要喺 alert 文案講明。

### 3c. 「無候選唔耗 valve」合唔合理 —— 合理,但要配節流

「冇真係換過就唔扣額度」邏輯上啱(O3 實測 swaps=0)。**問題係佢冇任何重試節流**。
12-tick soak(= 30 分鐘 tick 嘅 6 個鐘):

```
12 個 tick 之後:apply 被 call 12 次
```

真 `update-ytdlp.sh --apply` 每次都會行 `pip install -q --upgrade --pre yt-dlp[default]`
(:117,行網絡);如果 PyPI 有新版就仲會做 **2 次 YouTube resolve + 2 次 googlevideo
mid-range curl**(canary :149-164)兼寫一行 canary-FAIL 落 SUPERVISION-LOG(:169-178)。

即係:**形態③(懷疑 YouTube 側 bot-check / 429)嗰陣,個梯反而每 30 分鐘向
YouTube 多打 4 次。** 方向錯。建議 ① 嘅重試改成每 N 個 tick 一次(或者記
`lastSwapAttemptAt`,同一日內失敗過就退到 2 小時一試)。

---

## 4. Rollback 正確性

**主路徑 PASS。** `before_target="$(readlink "$YTDLP_LINK")"` 喺 `:246`,即係
**apply 之前記低**,唔係猜。O2 實測 rollback 之後 `readlink` 準確返到
`ytdlp-venv-a/bin/yt-dlp`。`update-ytdlp.sh` 出嘅係**相對** target
(`:194` `ln -sfn "ytdlp-venv-$IDLE_NAME/bin/yt-dlp"`),selfheal 原字串寫返落
同一個目錄,相對解析一樣,冇問題。

**apply 中途失敗會唔會停喺壞狀態:唔會。** `update-ytdlp.sh` 揈 symlink 嗰句喺
`:194`,即係 pip(:117)、`--version`(:128)、canary(:142-178)全部過晒之後最尾
一步;任何一關失敗都係 `exit 0` 唔郁現役。呢個設計 PASS。

### 🔴 P1 邊界一:`readlink` 空 → 條 symlink 會變死

實測(A2:預先將 `tools/yt-dlp` 換成普通檔案,即 `readlink` = 空):

```
apply rc=0 before=  after=ytdlp-venv-b/bin/yt-dlp
重驗 Layer B:mid=0 midfail=3
action=ytdlp-swap-rollback
AFTER: lrwxr-xr-x  ->  readlink=''   runnable=(no such file or directory)
```

`:269` `ln -sfn "$before_target" "$YTDLP_LINK"`,`$before_target` 係空字串 →
**整咗條 target 係空嘅 dangling symlink,yt-dlp 完全行唔到**。之後:
全部 resolve 死 → 100% 斷播;而下一個 tick 嘅 healthcheck `[[ -x "$YTDLP" ]]`(:93)
false → `midcfg=3` → `b_tested==0` → **`healthy_b=1`**(:126)→ A 死 B「健康」
→ **判做形態② → 白白 restart backend 兩次** → 安全閥觸頂 → 淨係 alert。

即係「一個可以一句 `ln -sfn` 救返嘅狀態」被自動化變成硬斷播 + 兩次無用 restart。

`update-ytdlp.sh:91-93` 自己就明文承認呢個狀態存在(「未 bootstrap(clean checkout /
手殘剷咗)」)。機率低、損害高,**修法一行**:

```bash
if [[ -n "$before_target" ]]; then ln -sfn "$before_target" "$YTDLP_LINK"; fi
```

### 🟠 P2 邊界二:416 會誤 rollback 一個好版本

`verify_layer_b`(:190)`[[ "$code" == "206" ]] && m++ || mf++` —— **416 當 fail**。
但 `stream-healthcheck.sh:108` 明文將 416 分類做 `midcfg`(探測歌短過 2MiB =
**探測配置問題,唔係 upstream 壞**),而個檔頭 `:49-51` 仲有一段大字警告。

實測(A3:mock 對新 slot 回 416×3):

```
apply rc=0 before=a after=b
[verifyB] vid1/2/3 → HTTP 416
action=ytdlp-swap-rollback   post-symlink=ytdlp-venv-a  ← 揈返咗個壞版本
```

即係探測歌一日變短(下架換 id / YouTube 轉 format),個梯就會**把啱嘅新 yt-dlp
rollback 走**,燒埋當日 swap 額度,再升做③。兩個 script 對 416 嘅定義必須一致。

---

## 5. 同 `update-ytdlp.sh` 互動

### 5a. nightly == 現役(冇新版)—— PASS
`update-ytdlp.sh:135-139`:`[[ "$cur" == "$latest" ]]` → `hist up-to-date` → `exit 0`,
**唔會揈 symlink**。selfheal 靠 readlink 前後對比(:257),見到冇變 → 走
`ytdlp-no-candidate` 分支 → 唔耗 swap 額度 → 升③。O3 實測一致。處理正確。

現場相關:Eric 今日 13:36 已經人手 `--apply`(`ytdlp-update.log` 尾行:
`APPLIED 2026.08.20.234504(slot a)→ 2026.08.30.232658(slot b)`),所以閒置
slot 而家係 a、裝住舊版。如果 PyPI 冇更新版,①就一定行 no-candidate 路徑 —— 啱。

### 5b. 🔴 05:30 daily job 撞 selfheal —— **完全冇 lock**

```
$ grep -n 'flock|lockfile|mkdir.*lock|LOCK' ops/ytdlp/update-ytdlp.sh
(NO LOCK)
$ plutil -p ~/Library/LaunchAgents/com.hymnstream.ytdlpupdate.plist
  "StartCalendarInterval" => { "Hour" => 5, "Minute" => 30 }
```

30 分鐘一 tick 之後,05:30 必定有一個 healthcheck tick 喺同一分鐘窗口。兩個情境:

1. 兩個 `pip install` 同時寫同一個 idle venv → 裝爛。
2. **更差**:daily job 喺 `:87-94` 已經算好 `IDLE=slot X`,selfheal 中途 `--apply`
   將 symlink 揈咗去 slot X,daily job 跟住繼續 `pip install` 落 slot X —— 即係
   **一路 pip 一路俾人 exec 緊嘅現役 slot**。呢個正正係 a/b 雙 slot 設計嘅註釋
   (`:28-35`「唔會有裝到一半俾人 exec 嘅窗口」)要避免嘅嘢。

窗口窄(pip 幾十秒 × 一日一次),但既然係「播歌命脈嘅核心組件」,應該加個
`mkdir "$TOOLS/.ytdlp.lock"` 式互斥,攞唔到鎖就 skip 兼記 log。

---

## 6. `stream-status.sh`

實測 6 個 case(env 指去 scratch state):

| # | 輸入 | JSON | exit |
|---|---|---|---|
| S1 | cf=0、alert 冇 | `healthy:true needsHuman:false` `summary=健康:consecutiveFail=0,ok=3,mid=3,yt-dlp=…` | **0** |
| S2 | cf=4、alert.active、form=③(①已試過) | `healthy:false needsHuman:true` summary 有形態同訊息 | **1** |
| S3 | lastCheck 120 分鐘前 | `stale:true ageMin:120 needsHuman:true` | **2** |
| S4 | lastCheck 帶 `+08:00` | `ageMin:null stale:true summary "已經 ? 分鐘"` | 2 |
| S5 | cf=3 但 alert 未 active | `needsHuman:**false**` summary「唔健康但仲未觸發 alert」 | 1 |
| S6 | selfheal state 檔唔存在 | 同 S5 | 1 |

- **欄位齊、exit 0/1/2 全對** —— PASS。`backendPid` 讀到真 pid(`pgrep -f` 唯讀)。
- **tz 處理:現況啱。** health state 寫嘅係 `datetime.datetime.now().isoformat()`
  (healthcheck:148,naive local),status 用 `datetime.datetime.now()`(:69,一樣
  naive local)相減 —— 兩邊同一個時鐘,冇 tz bug。**但 S4 證實一旦 lastCheck 帶
  tz,`fromisoformat` 出 aware dt,減 naive 拋 TypeError → 食咗 → `ageMin=None`
  → 誤判 stale。** 方向係 fail-loud(報警而唔係報平安),可接受,但建議兩種都食。
- **`needsHuman` 四種齊唔齊:齊,但漏咗第五種。** ③形態 / 兩個安全閥觸頂 / gate
  唔過 / restart 完未確認 —— 四種都設 `alert_active=1`,`needsHuman` 都覆蓋到
  (O2/O4/O6/O8/O9/O10 逐個核實)。**漏嘅係 S5/S6 呢種:consecutiveFail 高但
  alert 唔 active。** 兩條真實路徑會踩中:
  1. §2a 嗰個 false-green(①swap-ok 清咗 alert,但 Layer A 仍然全死);
  2. selfheal 根本冇行過 / 中途 crash(healthcheck 將佢 stdout+stderr 掉晒去
     `/dev/null`,見 §7)。
  **建議 `needsHuman = alert_active or stale or consecutiveFail >= 2`。**
- **俾 Dispatch 夠唔夠 / 一句 summary 可唔可以直接轉 Eric:可以**,三個 summary
  都係人話、冇 jargon。兩個 caveat:
  1. **`STALE_MIN=90` 同 live 排程唔夾**(§8):live 仲係 10800s,所以每個 3 小時
     週期入面有 ~90 分鐘會出 `exit 2 / needsHuman:true / 偵測本身可能死咗` ——
     Dispatch 一接就會日日狼來了。**plist reload 之前唔好接,或者暫時
     `STALE_MIN=200`。**
  2. `alert_message[:120]`(:95)—— 實際 ①/② 嘅 message 150-200 字,會斷句。

---

## 7. `stream-healthcheck.sh` 改動

- **節流 4→12 冇改壞恢復訊息** —— PASS。恢復係獨立 `elif`(:176-179),同
  `new_fail % 12` 嗰個 `if` 冇交叉;`cfg-err` 提醒(:180-188)排喺第三個 elif,
  只喺 healthy && prev_fail==0 先到,行為同改之前一樣。
- **尾段 tail-call 唔會喺 healthy 時誤 call** —— PASS(靜態)。`:198` 條件係
  `healthy == 0 || prev_fail > 0`:穩定健康(healthy=1 && prev_fail=0)唔會 call;
  恢復嗰個 tick(healthy=1 && prev_fail>0)會 call,而嗰時 `$STATE` 已經寫咗
  `consecutiveFail=0`,selfheal 走恢復分支(O12 驗證形態)。Sonnet §4 喺生產健康
  路徑實測亦冇產生 selfheal state 檔,同呢個推論一致。
- **selfheal 出錯唔會令 healthcheck exit 非 0** —— PASS。`:209 exit 0` 無條件。
- **🟠 但 selfheal 係完全靜音嘅。** `:206` `>/dev/null 2>&1`,rc 亦冇收。selfheal
  一旦死咗(python3 唔見、state 檔 permission、YTDLP_LINK 路徑變咗),**冇任何
  痕跡**,唯一症狀係 selfheal state 檔唔更新 —— 而 `stream-status.sh` 又唔會因為
  「state 舊」而報警(佢淨係睇 health state 嘅 lastCheck)。建議 `:204-206` 收返
  rc,append 一個 `selfheal_rc=N` 落 `stream-health.log`。
- **🔴 洗版:selfheal 自己完全冇節流,直接抵消咗 S1 個改動。**
  12-tick soak(形態③ 連續 12 次)實測:

  ```
  SUPERVISION-LOG 新增行數 = 12
  history 行數 = 12
  apply 被 call 次數 = 12
  ```

  同一段時間 healthcheck 自己只會寫 **2 行**(第 1 次 + 第 12 次)。即係
  cd2212e 特登由 4 改 12「避免洗版」,但同一個 commit 掛上去嘅 selfheal 反而
  每 30 分鐘寫一行。8-30 嗰單 5 小時 = **10 行**;一日 = **48 行**。
  `alert.since` 有正確保持穩定(soak 尾 `since` 仍係第一 tick 嗰個),所以
  「同一單 alert」係識別得到嘅 —— **建議:form 同上次一樣就唔好再寫
  SUPERVISION-LOG(history log 照寫,嗰個係 machine log 唔怕多)**。

---

## 8. plist

**repo 同 live 功能上一致** —— 兩份 `StartInterval` 都係 `1800`;`diff` 出嘅分別
純粹係 repo 嗰份多咗 XML 註釋 + 縮排風格(live 嗰份係俾 `plutil -replace` 重寫過)。
`Label` / `ProgramArguments` / `RunAtLoad` / 兩條 log path 逐項相同。**PASS。**

**但 launchd 未重讀,S1 未生效**(唯讀核實):

```
$ launchctl print gui/501/com.hymnstream.healthcheck
    path = /Users/macbookpro/Library/LaunchAgents/com.hymnstream.healthcheck.plist
    run interval = 10800 seconds          ← 仍然 3 小時
$ tail backend/data/stream-health.log
    02:00 … / 05:01 … / 08:01 … / 11:02 …  ← tick 實際間距 3 小時
```

**要人手行嘅兩句 —— 我核實過係正確嘅(`id -u` = 501,job 確實喺 `gui/501` 域):**

```bash
launchctl bootout   gui/$(id -u)/com.hymnstream.healthcheck
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hymnstream.healthcheck.plist
launchctl print gui/$(id -u)/com.hymnstream.healthcheck | grep -i interval   # 要見 1800
```

(`kickstart` 唔會重讀 plist,呢點 `backend-restart.sh:8-12` 已經有記錄,文檔講法啱。)
**我冇行呢兩句。** 未行之前:tick 照 3 小時,行為同 9-05 之前一樣,唔會斷 —— 但
「連續 2 次 fail 最遲 1 小時內動手」變成 **最遲 6 小時**,而 `STALE_MIN=90` 同時會
令 status 長期報 stale(見 §6)。

---

## 9. 最壞情況推演(俾 Eric 睇)

**先講好消息:「系統健康嗰陣個梯自己搞出禍」呢條路,我搵唔到。** 三重閘:
①healthcheck 穩定健康時根本唔 call selfheal(:198);②selfheal 恢復判斷排喺最前
(:207);③`consecutiveFail < 2` 短路(:216)。而所有郁手嘅決定都係用 healthcheck
當場探測嘅真數,唔係讀舊 state。所以「明明冇事但去 rollback / restart」係封閉咗嘅。

以下係我搵到嘅每一條**真實**風險路徑,連證據:

| # | 路徑 | 觸發條件 | 後果 | 證據 |
|---|---|---|---|---|
| **P1** | `readlink` 空 → rollback 整死 symlink | `backend/tools/yt-dlp` 唔係 symlink(clean checkout / 手動換過檔)+ 形態① rollback | **yt-dlp 完全行唔到 → 100% 斷播**,而且之後被誤判做②白白 restart 2 次 | A2 實測 `readlink=''` + not runnable;selfheal:269 |
| **P2** | 416 誤 rollback | 探測歌變短過 2MiB / 換過 id | 揈返個壞版本 + 燒晒當日 swap 額度 | A3 實測;selfheal:190 vs healthcheck:108 |
| **P3** | ①成功 → false-green | 兩層都死,但換 yt-dlp 之後 B 過、A 仍死 | SUPERVISION 寫 🟢、`needsHuman:false`,**Eric 收唔到「仲係全庫播唔到」** | A1 + S5 實測 |
| **P4** | 本機出網斷咗兩個 tick | wifi / VPN / cloudflared 死 → A 全 fail + B 全 resolve-fail → `midfail=3` | 誤判① → 白換 yt-dlp → rollback → 燒晒當日額度。**成套探測冇任何「外網通唔通」正控** | 形態判定 :224,冇 control probe |
| **P5** | 探測 id 被下架 | `IDS=(42 77 5431)` 入面 2 首被 delist(呢個庫真係有 delist 流程) | A 永久 0/3、B 正常 → 形態② → **每日白白 restart backend 2 次** + 永久 alert | healthcheck:52;`:49-51` 只警告過 Layer B 換 id,冇警告 A 會被 delist |
| **P6** | yt-dlp binary 唔見 | 承 P1,或者 venv 俾人剷 | `midcfg` → `healthy_b=1`(healthcheck:126)→ 誤判② → 無用 restart。**`midcfg` 根本冇傳俾 selfheal**(:200-206 只傳 7 個數,冇 midcfg) | healthcheck:113,:126 |
| **P7** | SUPERVISION-LOG 洗版 | 任何長過 1 個鐘嘅故障 | 6 小時 12 行 / 一日 48 行,抵消咗 cd2212e 個節流 | 12-tick soak |
| **P8** | 05:30 撞 selfheal | 一日一次窗口 | 兩個 pip 寫同一 venv,或者 pip 落**現役** slot | `grep LOCK` = 冇 |
| **P9** | ② 長期靜靜失效 | HEAD ≠ approved(每晚 dbautosync 都會造成) | Eric 批咗 Q3 但實際永遠 `gate-blocked` | `git rev-parse HEAD` vs `approved.json` |

---

## A. 上線判定

### 開之前一定要修(3 條,全部係 ops script,唔使 build、唔使 restart)

1. **P1 —— `:269` rollback 加 `[[ -n "$before_target" ]]` guard。** 一行,防止把
   一個可救狀態變成硬斷播。
2. **P7 —— selfheal 寫 SUPERVISION-LOG 要節流。** 建議:`alert_form` 同上次一樣
   而且 `alert.active` 本來已經係 true 就唔再寫 markdown(history log 照寫)。
   否則 S1 個節流改動等於白做。
3. **§6 —— `needsHuman` 加 `or consecutiveFail >= 2`。** 唔加嘅話 P3 呢種
   「全庫死但 alert 已清」會喺 Dispatch 眼中係 `needsHuman:false`。

### 開之前要拍板(2 條)

4. **§3b / P9:approved.json 每晚過期,Q3 等於冇開。** 揀 (i) autosync 後自動
   re-approve、(ii) gate 改成只睇 `backend/`、定 (iii) 接受「②要人手 approve
   先生效」兼喺 alert 文案講明。
5. **§8:plist reload 同 `STALE_MIN` 邊個先。** reload 咗先接 Dispatch;
   或者未 reload 就暫時 `STALE_MIN=200`。兩者揀一,唔好兩樣都唔做。

### 建議跟手做(唔擋上線)

6. P2:`verify_layer_b` 對齊 healthcheck,416 當 `cfg-err` 唔當 fail。
7. P3:①成功但 `healthy_a==0` 時唔好清 alert。
8. §3c:① 重試加 backoff(唔好每 30 分鐘 pip + 打 YouTube 4 次)。
9. §7:收 selfheal 嘅 rc,append `selfheal_rc=N` 落 `stream-health.log`。
10. §2b:改正「failCache 15 分鐘」呢個註釋(真數係 60 秒,`FAIL_TTL_PLAYBACK_MS`)。
11. §2d:`pendingRecheck` 要麼喺 `stream-status.sh` 出返,要麼刪咗。
12. P5/P6:Layer A 探測 id 加存在性檢查;`midcfg` 傳埋俾 selfheal。
13. §5b:`update-ytdlp.sh` 加互斥鎖。

---

## B. 俾 Dispatch 嘅 status 接口確認

**接口本身可以用**,`ops/stream/stream-status.sh` 唔會郁任何嘢(純讀 2 個 JSON +
`readlink` + `pgrep`),適合排程 check-in。

```bash
out=$(ops/stream/stream-status.sh); rc=$?
# rc=0 健康(唔使出聲) / rc=1 唔健康 / rc=2 偵測本身死咗
# 要唔要通知 Eric:睇 JSON 個 needsHuman;要 send 嘅字 = 個 summary 欄
```

- `summary` 一句可以**原句轉俾 Eric**(三個 case 都係人話,無 jargon)。
- **接之前要清嘅兩件事**:①`STALE_MIN=90` vs live 10800s 排程(§8)——
  唔處理會日日誤報 stale;②`needsHuman` 補 `consecutiveFail>=2`(§6)——
  唔補會漏報 P3。
- 建議 Dispatch 側再加一條:`rc=1` 而 `lastAction` 連續幾個 check-in 都係
  `ytdlp-no-candidate` / `alert-safetyvalve-*`,就當升級。

---

## C. 對 `STREAM-SELFHEAL-EXEC-20260905.md` 嘅兩點更正

1. **§0 / §5 講「production `stream-health-state.json` / `stream-health.log` 全程唯讀、
   冇改」，同佢自己 §4 相矛盾。** §4 明明白白寫住行咗
   `SELFHEAL_DRY_RUN=1 ops/lyrics/stream-healthcheck.sh --verbose`,而 `lastCheck`
   由 `13:36:56` 變 `14:00:22`。而且 `stream-healthcheck.sh` 個 `STATE`/`HISTORY`
   **根本唔食 env override**(:44-46),`SELFHEAL_DRY_RUN` 只管 selfheal 唔管佢。
   實際後果:`backend/data/stream-health.log` 多咗 `13:36` 同 `14:00` 兩條**唔係
   launchd tick** 嘅行(3 小時排程對唔上),日後查 tick 節奏會撞板。損害細,
   但「宣稱冇改而實際改咗」呢種要更正。
2. **§0 引「`resolveAudio.js`(FAIL_TTL_MS=15 分鐘)」嚟解釋唔驗 Layer A —— 引錯咗
   常數**,見 §2b。真數係 `FAIL_TTL_PLAYBACK_MS` = 60 秒。

其餘 12 個 case 嘅結論我自己重跑之後**全部覆現**,冇發現報大。

---

*Opus 5 獨立驗收,2026-09-05。harness 喺 session scratchpad,唔入 repo。*
