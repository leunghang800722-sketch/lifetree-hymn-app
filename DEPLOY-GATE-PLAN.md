# DEPLOY-GATE-PLAN.md — 部署批准 Gate 機制規劃

> 出稿：2026-08-02(Fable 5)。背景:同日發生3次「未經 Eric 批准嘅 code 意外落 production」事故
> (OTA 夾帶已 commit 未批准 commit ×1、backend 被唔知情 session kickstart ×2)。
> 現有 HANDOFF/EAS-UPDATE-PLAN 文字紅線證實擋唔住,需要技術上實際攔截嘅機制。
> 落地執行:Sonnet 5。驗收:Opus/Fable。

## 一、核心判斷

兩個副作用動作(`eas update` 推 OTA、restart backend)之所以出事,係因為:

1. **冇「批准狀態」嘅機器可讀記錄** — 「Eric 批咗邊個 commit 出街」只存在於對話入面,
   第二個 session 完全冇辦法知。
2. **原始命令冇任何攔截** — 任何 session 都可以直接跑 `eas update` / `launchctl kickstart`,
   文檔紅線冇 enforcement。

對應兩層機制,合埋先算完整:

- **L1 批准檔 + gate script**:批准狀態落地做檔案,兩個動作只可以經 gate script 做,script 內強制 check。
- **L2 PreToolUse hook 硬攔截**:所有 session 都係 Claude Code session,共用呢個 worktree 嘅
  project settings。用 hook 令「直接跑原始命令」喺工具層面直接被 deny — 唔靠自律,唔知情嘅
  session 想跑都跑唔到,錯誤訊息會指佢去 gate script。

feature branch 政策(方向2)今次**唔做主力**:共用 worktree 冇辦法 checkout 另一條 branch
而唔炒埋其他 session,要做就要 `git worktree add` 獨立目錄,改動所有 session 嘅工作習慣,
唔輕量。列做 Phase 2 選項。

## 二、L1:批准檔 + 三個 script

### 2.1 批准檔(repo 外,免俾 git 操作/stash 誤傷)

`~/.hymn-deploy/approved.json`:

```json
{
  "ota":     { "sha": "<40位 commit sha>", "approvedAt": "...", "note": "..." },
  "backend": { "sha": "<40位 commit sha>", "approvedAt": "...", "note": "..." }
}
```

語義:Eric 批准咗「呢個 sha 嘅(前端/後端)code 可以出 production」。HEAD 一有新 commit
就自動同批准檔唔對辦,gate 即刻擋 — 唔使人手 expire。

### 2.2 `ops/deploy/approve.sh <ota|backend> <sha> --confirm`

攞到 Eric go 嘅 session 先可以跑。設計成焗住做人肉核對:

1. `<sha>` 必須明文提供,而且必須等於當前 HEAD(防止 approve 咗個唔知係乜嘅嘢)。
2. 印出 `git log <上次批准sha>..<sha> --oneline`,即「今次批准會新包含嘅所有 commit」。
3. 冇 `--confirm` 就只印唔寫;有先寫入 approved.json 並 append 一行去
   `~/.hymn-deploy/deploy.log`(時間/sha/邊個 target/note)。

Script 冇辦法驗證「Eric 真係批咗」,但佢焗住批准者逐個 commit 望一次 —
今次事故正正係冇人望過「HEAD 同上次出街之間夾咗啲乜」。

### 2.3 `ops/deploy/ota-publish.sh "<message>" [--dry-run]`

唯一合法嘅 OTA 推送路徑。順序:

1. `git status --porcelain -- frontend/hymn-app` 必須**完全乾淨**(唔再係「叫你自己 stash」,
   係唔乾淨就 abort 並列出邊啲檔案髒)。
2. HEAD == approved.json 嘅 `ota.sha`,唔係就 abort,並印出
   `git log <approved>..HEAD --oneline`(即係「你想夾帶嘅未批准 commit 就係呢啲」)。
3. 全過 → `cd frontend/hymn-app && eas update --channel production --message "<message>"`。
4. 成功後 append deploy.log。`--dry-run` 行晒 1-2 但唔推,俾驗證用。

### 2.4 `ops/deploy/backend-restart.sh [--dry-run]`

唯一合法嘅 backend restart 路徑。順序:

1. HEAD == approved.json 嘅 `backend.sha`。
2. `git status --porcelain -- backend/` 乾淨,**排除運行時檔案**
   (`backend/hymns.db`、`backend/users.db*`、`backend/data/`、`*.log`、`*.bak*` —
   呢啲係 job 運行時狀態,永遠髒,唔係 code)。
3. 全過 → `launchctl kickstart -k gui/$(id -u)/com.hymnapp.backend`,
   然後 health check(curl localhost 對應 port,10 秒內要 200)先算成功。
4. append deploy.log。

## 三、L2:PreToolUse hook 硬攔截

### 3.1 位置

repo 內新增 `.claude/settings.json`(**shared、要 commit**,咁全部指住呢個 worktree 嘅
session 都自動繼承;而家只有 settings.local.json,冇衝突):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "ops/deploy/guard-bash.sh" }]
      }
    ]
  }
}
```

### 3.2 `ops/deploy/guard-bash.sh`

從 stdin 讀 hook JSON,抽 `.tool_input.command`,兩組 pattern 命中即 deny
(輸出 `permissionDecision: "deny"` JSON,reason 指去正確 script):

- 命中 `eas update`(唔理 flags)→ deny:「OTA 必須經 ops/deploy/ota-publish.sh」
- 命中 `launchctl` 同時提及 `com.hymnapp.backend`(kickstart/load/unload/stop 都算)
  → deny:「backend restart 必須經 ops/deploy/backend-restart.sh」

其他命令一律放行(exit 0 唔輸出),**唔會拖慢日常操作**。gate script 自己內部跑
`eas update`/`launchctl` 唔受影響 — hook 見到嘅係 session 打嘅命令字串
(`ops/deploy/ota-publish.sh ...`),唔係 script 內部展開嘅嘢。

### 3.3 已知限制(要寫入 HANDOFF)

- Hook 係開 session 時載入 — **依家已經開緊嘅長命 session 要重啟先受保護**。
  落地當日要通知所有活躍 session。
- Hook 擋「意外」,擋唔住蓄意繞過(session 自己寫個 wrapper script)。呢個 project
  嘅威脅模型係唔知情/順手,唔係惡意,夠用。
- 非 Claude Code 途徑(Eric 自己開 Terminal)唔受 hook 管 — 但 Eric 唔落手跑命令,可接受。

## 四、驗證計劃(Sonnet 落地後必須逐項行,結果記入 SUPERVISION-LOG)

Git 邏輯測試喺 scratchpad 嘅 **臨時 clone** 度做(唔好喺共用 worktree 度整測試 commit);
hook 測試先喺真 worktree 做(用無害命令)。

1. **夾帶模擬(核心)**:臨時 clone 入面 `approve.sh ota HEAD --confirm` →
   `git commit --allow-empty -m "unapproved"` → `ota-publish.sh "test" --dry-run`
   → 必須 abort,而且輸出入面見到 "unapproved" 呢個 commit 被點名。
2. **髒 tree 模擬**:touch 一個 frontend 檔案 → dry-run → abort 並列出該檔案。
3. **backend 未批准模擬**:backend.sha 落舊 commit → `backend-restart.sh --dry-run` → abort。
4. **運行時檔案豁免**:淨係 hymns.db 髒 → backend dry-run 嘅乾淨檢查要**過**。
5. **Hook 攔截(真 worktree,新開 session)**:直接跑 `eas update --help` → 被 deny;
   跑 `launchctl print gui/501/com.hymnapp.backend` 呢類唔改狀態嘅…照樣會中 pattern 被
   deny — 接受呢個 false positive(查狀態可以改用 `launchctl list | grep hymn`),
   或者 Sonnet 收窄 pattern 淨係攔 kickstart/load/unload/stop。**推薦收窄**。
6. **正路全通**:臨時 clone 入面 approve 正確 sha → dry-run 全綠。
7. **真身首次啟用**:機制驗完後,第一次真 OTA/真 restart 必須經新 script 行,
   結果記 log — 呢下先算 end-to-end。

## 五、落地清單(Sonnet)

1. `ops/deploy/approve.sh`、`ota-publish.sh`、`backend-restart.sh`、`guard-bash.sh`(bash,`set -euo pipefail`)
2. `.claude/settings.json`(hooks)
3. `mkdir -p ~/.hymn-deploy` + 初始 approved.json(兩個 sha 初始化做**當前已出街版本**嘅
   sha — OTA 用最後一次 publish 嗰個 commit,backend 用今日密碼登入部署完成嗰個 commit;
   搵唔返就用當前 HEAD 並喺 note 註明)
4. 行晒第四節驗證,記 SUPERVISION-LOG
5. 改 HANDOFF.md §2 紅線 + EAS-UPDATE-PLAN.md §5:唔再教人手 stash+eas update,
   一律指去兩個 gate script;註明「已開 session 要重啟先有 hook」

## 六、Phase 2(今次唔做,留紀錄)

- **backend release-dir 分離**:launchd 指去 rsync 出嚟嘅獨立 release 目錄,worktree 點亂
  kickstart 都唔會影響 prod。結構上最徹底,但 backend 用 `__dirname` 定位
  hymns.db/users.db/data/public,要 symlink 一堆共享狀態 + package-lock 變更要 npm ci,
  仲要改 plist — 唔輕量。L1+L2 跑穩之後如果仲想加固先做。
- **大型未批准功能用獨立 `git worktree add` 目錄開發**,批准先 merge 落主線 —
  改變 session 分工習慣,由 Dispatch 層按功能大小決定。
