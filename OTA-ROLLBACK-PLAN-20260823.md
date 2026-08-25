# OTA Rollback 規劃(2026-08-23)

背景:準備推 8/19 之後累積 41+ commit 嘅大 bundle OTA。呢份文件規劃「推出去之後 Eric 真機出事」嘅回退路徑。**目標:出事後 2-3 分鐘內裝置可以返到 8/19 已知穩定版。**

---

## §1 事實查證(全部本機實測過,唔係靠估)

1. **eas-cli 19.0.8 原生支援 rollback**,但唔係用 `eas update:rollback`:
   - `eas update:rollback` 係 interactive wizard,官方 help 明文寫:non-interactive 環境應該改用 `eas update:republish`(或 `update:roll-back-to-embedded`)。Claude session 冇 TTY,所以正路係:
     ```
     eas update:republish --group <舊group id> --platform <android|ios> --non-interactive -m "<message>"
     ```
   - republish 係 **server-side 複製**:攞舊 update group 嘅 bundle/assets 原封不動喺 branch 上出一個新 update。**唔會 re-export、唔讀 working tree、唔使 checkout 舊 commit** → 完美避開「多 session 共用 worktree 唔准 checkout」問題。
   - republish 嘅 help **冇 `--environment` flag**,即係唔會撞 eas-cli ≥19 non-interactive 必須帶 `--environment` 嗰條規則(嗰條只適用於 `eas update` 本身)。
   - runtimeVersion 跟原 update(8/19 group 係 runtimeVersion 5,而家 live binaries 正行緊佢,零相容問題)。

2. **guard-bash.sh 現況**:regex 係 `eas[[:space:]]+update`,所以直接喺 session 打 `eas update:republish`、甚至純讀嘅 `eas update:list` / `eas update:view` 都會被 deny。**但** hook 只檢查 Claude 打出嘅 command string 本身 —— 經 gate script 內部 call `eas`(ota-publish.sh 而家就係咁)唔會被攔。**結論:唔使改 guard,加一個新 gate script 就得。**

3. **查 live 版本嘅指令唔會中 guard**:`eas channel:view production --json`(字串唔 match `eas update`)已實測可行,今日跑出嚟最新 group 正係 ios `6faf4e94-…`,`gitCommitHash: 9f078d0`,同 8/19 記錄吻合。`eas update:view GROUPID --json` 都存在(可攞單一 group 詳情),但要經 script 內部 call 先避到 guard。

4. **8/19 已知穩定 group(rollback 目標,已核對)**:
   - ios: `6faf4e94-1939-4a1c-ac5e-80666fc0fda0`
   - android: `523275e7-d712-4694-9d70-46d0a4758447`
   - 對應 commit `9f078d0`,message「player鎖屏resume守衛+consume-once race+RemoteDuck+上一首iOS修復」

---

## §2 方案:三件套(全部要喺大 OTA 推出**之前**落地)

### A. 新 gate script:`ops/deploy/ota-rollback.sh`

用法(對齊 ota-publish.sh 風格):

```
ops/deploy/ota-rollback.sh "<message>" [--confirm]
    [--ios-group <id>] [--android-group <id>]
```

行為:

1. **目標 group 決定**:預設讀 `~/.hymn-deploy/ota-groups.log`(見 B)最近一次 publish 之前嗰組;明文 `--ios-group`/`--android-group` 可以 override(第一次用嗰陣 log 未必有嘢,就明文餵 8/19 嗰兩個 ID)。
2. **預覽(冇 `--confirm`)**:內部 call `eas update:view <group> --json`,印出目標 group 嘅 message / createdAt / gitCommitHash / platform,俾操作者眼見核實「rollback 去邊」先。唔推。
3. **執行(有 `--confirm`)**:兩個 platform 各 republish 一次:
   ```
   cd frontend/hymn-app
   eas update:republish --group <ios-group> --platform ios --non-interactive -m "<message>"
   eas update:republish --group <android-group> --platform android --non-interactive -m "<message>"
   ```
4. **記錄**:append `~/.hymn-deploy/deploy.log`(`ota-rollback | platform=… | target_group=… | new_group=…`)+ ota-groups.log。republish 出嚟嘅係一個**新 group id**(內容等於舊 bundle),要 parse `--json` output 記低,否則下次唔知邊個係 live。

**兩個刻意設計,同 ota-publish.sh 唔同**:

- **唔驗 working tree 乾淨** —— republish 根本唔讀 tree;緊急時刻其他 session 一定有 dirty file,唔可以俾呢個 check 卡死 rollback。
- **唔行 approve.sh** —— approve.sh 焗住「sha == 當前 HEAD」,rollback 場景 HEAD 係壞版本,永遠滿足唔到;而 rollback 目標本身就係「經 approve 出過街、live 過」嘅 bundle,唔存在未經批准 code 出街嘅風險。授權來源係 Eric/Dispatch 口頭 go + script 自己嘅 `--confirm` 兩步式。

### B. ota-publish.sh 補一步:錄低每次 publish 嘅 group id

而家 ota-publish.sh 推完只記 sha,唔記 group id → 想 rollback 嗰陣要人手周圍搵「上一個穩定 group 係邊個」。改法:

- publish loop 入面改用 `eas update … --json | tee` 捕捉 output,parse group id,append 一行落 `~/.hymn-deploy/ota-groups.log`:
  ```
  2026-08-23T…Z | publish | platform=ios | sha=… | group=… | message=…
  ```
  (執行時要先驗證 19.0.8 嘅 `eas update --json` output shape;如果 parse 唔穩陣,fallback 係 publish 完即刻 `eas channel:view production --json` 攞最新 group。)
- **即刻手動 seed 兩行** 8/19 嘅 ios/android group(§1.4),等 log 由第一日起就有「上一個穩定版」可查。

### C. settings.local.json 白名單

照 backend-restart.sh / ota-publish.sh 先例(settings.local.json:482-483)加:

```
"Bash(bash ops/deploy/ota-rollback.sh:*)"
```

唔加嘅話 permission classifier 會擋(deploy gate 落地嗰陣撞過同一樣嘢)。

### 唔改嘅嘢:guard-bash.sh 原封不動

曾考慮放行 `eas update:list`(純讀),但 grep 係全 string 掃,早放行會俾 `eas update:list; eas update …` 呢類 chained command 鑽窿。查嘢用 `eas channel:view` 已經夠,維持現狀最穩陣。

---

## §3 觸發標準同流程

**邊個決定**:Eric 只負責報症狀(「開唔到」「閃退」「播唔到歌」);**判斷 rollback 同執行由 Dispatch 決定**,唔使 Eric 落技術指令。

**門檻(建議,等拍板)**:rollback 係可逆嘅(舊 bundle 隨時可以再 republish 返新版,或者修好再推),所以門檻應該偏低:

| 症狀 | 動作 |
|---|---|
| 開機 crash / 白屏 / 核心播放全壞 | **即刻 rollback**,唔使等 root-cause |
| 單一功能 regression(某個掣/某頁壞) | 15 分鐘內睇唔到 quick-fix 就 rollback,修好再推 |
| 純外觀瑕疵 | 唔 rollback,排隊修 |

**時間線**:republish 兩個 platform 約 1 分鐘內完成(server-side copy,冇 export)。裝置端 expo-updates 係「開 app 時 check → 下載 → **下一次冷啟先生效**」,所以要同 Eric 講明:「rollback 推咗之後,完全熂 App 再開,做兩次」。由 Dispatch 決定到 Eric 部機返舊版:**約 2-3 分鐘**。任何有呢個 repo 嘅 session 都執行到(script 唔掂 git state),唔使另開專用 session。

**Rollback 之後**:41-commit 大 bundle 唔好原封不動推第二次 —— 拆細批次或者加診斷先再上。另外一個結構性注意:今次 rollback 目標就係「今日 live 緊」嘅版本,同現時 backend 必定夾;但**如果將來大 OTA 係同 backend 改動配套出街,rollback 前要先諗舊 bundle 同新 backend 夾唔夾**,必要時 backend 都要一齊回。

---

## §4 事故當刻 runbook(照住做)

前提:§2 A+C 已落地。假設事故發生、Dispatch 已決定回退:

```bash
# 1. 核實目標(唔推,純預覽)
bash ops/deploy/ota-rollback.sh "rollback: <一句講點解>" \
  --ios-group 6faf4e94-1939-4a1c-ac5e-80666fc0fda0 \
  --android-group 523275e7-d712-4694-9d70-46d0a4758447

# 2. 眼見預覽印出 9f078d0 / 8-19 嘅 message 無誤 → 加 --confirm 真推
bash ops/deploy/ota-rollback.sh "rollback: <同一句>" \
  --ios-group 6faf4e94-1939-4a1c-ac5e-80666fc0fda0 \
  --android-group 523275e7-d712-4694-9d70-46d0a4758447 --confirm

# 3. 驗證 live 已切換(睇最新 group 嘅 message 係咪 rollback 嗰句)
cd frontend/hymn-app && eas channel:view production --json | head -40

# 4. 通知 Eric:完全熂 App 再開兩次
```

如果 script 未落地就出事(唔應該發生 —— A+C 係大 OTA 嘅前置):最後 fallback 係 expo.dev web dashboard 嘅 update 頁有 republish 操作,Dispatch 攞 Eric go 之後可以經 browser 做,但呢條路慢好多,唔好當正路。

---

## §5 等拍板

1. **A+B+C 三件套落地,而且係大 OTA 嘅前置**(先有降落傘先跳)—— 建議照做,約 80-100 行 script,零 native 零 restart。
2. §3 嘅 rollback 門檻表認唔認(尤其「單一 regression 15 分鐘冇 quick-fix 就回退」呢條)。
3. guard-bash.sh 維持原封不動(連 `eas update:list` 都繼續擋,查嘢行 `eas channel:view`)。
4. B 嘅 seed:即刻寫兩行 8/19 group 落 ota-groups.log。
