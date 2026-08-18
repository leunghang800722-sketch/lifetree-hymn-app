# 三線平行複核 SOP(Eric 2026-08-18 拍板重開)

沿用 47H 衝刺嘅 **P + R1 + R2** 平行設計,今次擴到三條複核線。
**P 線(producer)維持單線唔郁**(YouTube 出口 IP 係全 App 命脈,HANDOFF §2.2)。

| 線 | Task | 分區(`lang` 欄) | 核對來源 | Restart 權 |
|---|---|---|---|---|
| **R1** | `lyrics-line-mandarin` | `國語` | WebSearch(每班 ≤4 次) | ✅ **只有 R1 可以 approve + restart** |
| **R2** | `lyrics-line-cantonese` | `粵語` | `cantonhymnLookup.js`(**WebSearch 0 次**) | ❌ |
| **R3** | `lyrics-line-english` | `英文` + `兒童` | WebSearch(每班 ≤2 次) | ❌ |

## §1 唔會撞車嘅五條機制

1. **lang 欄硬分區**:`reviewLyrics.js --export` 冇 lease 機制,三條線攞到同一份 list ——
   **一定要即刻按你嗰個 `lang` filter 走晒其他語言**,咁 apply 檔天然 disjoint,零重疊。
   **做唔屬於你分區嘅歌 = 直接違規**,會同隔籬線撞單、白燒兩份額度。
2. **DB 寫入**:全部經 `reviewLyrics.js --apply`(內置 `acquireDbLock`,即攞即放)。
   撞鎖等 5 分鐘唔得就跳去下一批,**唔准 hack、唔准刪 lock 檔**
   (04:00–04:15 `checkDeadLinks` 揸鎖屬正常)。
3. **已知 race**:producer in-flight snapshot 有機會蓋走啱 apply 嘅 verified(實錄 76 中 1)。
   **每次 apply 完即刻覆查**,中招就重 apply:
   ```bash
   sqlite3 "file:hymns.db?mode=ro" "SELECT id,lyrics_status FROM hymns_all WHERE id IN (<今批id>) AND lyrics_status<>'verified';"
   ```
4. **Restart 單一 owner**:只有 **R1** 喺班尾做 approve + restart。R2/R3 **嚴禁** approve、
   嚴禁 restart —— 你哋嘅歌詞寫咗入 DB 唔會冧,等 R1 下一轉一齊放出街。
5. **Ledger 只准 append**:三條線寫同一個 `docs/LYRICS-CATCHUP-LEDGER.md`,
   **一定要用 `>>` 追加**,**唔准整個檔重寫**(read-modify-write 會蓋走隔籬線啱寫嘅行)。
   每行開頭標明你係邊條線,例:`| 2026-08-18 14:20 | R2粵語 | ... |`。

## §2 收工紀律(47H 衝刺實證行得通嗰套)

- **每班上限 200 個決定 / 3 個鐘**,夠即收。
- **每批 ≤40 首**,做完一批**即刻 append ledger**,唔准等收工先寫
  (47H 衝刺十二班得四班交到功課,就係因為死之前咩都冇寫低)。
- **你分區嘅可做 draft < 10 → 即刻收工**。**嚴禁 until-loop 等隊列**
  (試過蝕 4 個半鐘),producer 自己會追上嚟,下一轉自然有貨。
- 🔬 **收工原因必填,四揀一**:`夠上限` / `夠鐘` / `冇貨做` / `撞 rate limit`。
  撞 rate limit 要抄低**原文警告字句** + **當時做咗幾多個決定**
  (Eric 靠呢個判斷 Max plan 有冇真係解決班次早死)。
- 撞 rate limit → 完成手頭嗰批 → apply → 寫 ledger 收工,**唔好死頂**。

## §3 每班流程

```bash
# 1. 開波三查
date '+%Y-%m-%d %H:%M'
tail -20 docs/LYRICS-CATCHUP-LEDGER.md
pgrep -fl producer-keeper || echo "keeper 死咗"      # 死咗要重開,見下
node ops/lyrics/bi-freeze.mjs --count                # 全庫可做總數(未分區)
# → 即刻 append 一行 ledger 寫低你開波(決定數暫寫 0),死咗都有紀錄

# 2. 攞料 + 過 BI 濾網 + 按你嘅 lang 分區
cd backend
node scripts/reviewLyrics.js --export --out <scratchpad>/drafts.json
node scripts/alignLyrics.js --all --out <scratchpad>/align
cd ..
node ops/lyrics/bi-freeze.mjs --refresh
node ops/lyrics/bi-freeze.mjs --filter <scratchpad>/drafts.json --out <scratchpad>/split
# → 讀 split/actionable.json,再自己 filter 淨低 lang == 你嘅分區
```

**keeper 死咗要重開**(唔食 Claude 額度,係最抵嘅資源):
```bash
ls /tmp/lyrics-sprint-stop && rm -f /tmp/lyrics-sprint-stop   # 有呢個檔 keeper 一開就自殺
nohup bash ops/lyrics/producer-keeper.sh >/dev/null 2>&1 & disown
sleep 10; pgrep -fl producer-keeper; tail -5 /tmp/hymn_keeper.log
```
⚠️ **三條線都嚴禁自己開 `fetchLyrics.js`** —— 全程只准一個 producer。

**校對方法正本:** Read `/Users/macbookpro/.claude/scheduled-tasks/lyrics47-b01/SKILL.md`
(dedupe 腳本、死症 vein、高產 vein、cantonhymnLookup 用法、粵語預篩檔、判決紀律,全部照跟)。

```bash
# 3. 驗收 + 寫入 + 覆查
node scripts/auditLyricsBatch.js <apply檔>       # 只准 apply -passed.json
node scripts/reviewLyrics.js --apply <passed檔>
# → 跟住做 §1.3 嘅覆查
```

## §4 🔴 最高優先政策(Eric 2026-08-16,凌駕一切效率考慮)

> **完全拒絕「中文歌配英文歌詞」,唔可以為咗衝數字而做。**

- **三個唔准**:唔准 apply、唔准當 verified、**亦唔准判 `unusable`**(底本冇罪,判死等於永久剷走翻案機會)。留喺 draft 唔好郁。
- **唔准諗計繞過**:唔准剷英文行淨出中文、唔准改 `auditLyricsBatch.js` 門檻、唔准手動 merge 入 passed。
- 機械擋板已經幫你隔咗(`bi-freeze --filter` + audit 出嘅 `-langmismatch.json` 一律唔 apply)。
- 8/17 已經因為呢條政策 bulk 剷咗 416 首出街緊嘅歌詞,覆蓋率主動由 50.4% 回落到 44.1%。
  **Eric 寧願個數低啲都要啱。**

## §5 R1 專屬:班尾 checkpoint(R2/R3 跳過呢節)

1. `[stream]` 20 分鐘靜音檢查(`tail -200 /tmp/hymn_backend.log | grep "^\[stream\]" | tail -5`,時間戳係 **UTC**,本地 = UTC+8)。有播放活動 → **唔好 restart**,ledger 寫明押後。
2. `ops/deploy/approve.sh backend "$(git rev-parse HEAD)" --confirm`(classifier 間中亂擋,同一句重試最多 3 次,再唔得等 5 分鐘)。見到其他 session 嘅 backend commit 你唔明 → **skip restart**,下轉補。
3. `ops/deploy/backend-restart.sh` → `launchctl list | grep hymnapp | wc -l` 要夠 **7 個**。
4. 抽 3 首今班新 verify 嘅 id curl `/api/hymns` 確認吐到歌詞。

## §6 ⛔ 紅線(三條線一樣)

- **零 git 操作**(唔准 `git add` / `git commit` —— 多 session 共用 worktree)。ledger / SUPERVISION-LOG 照 append 但唔好 commit。
- 唔准自己開 `fetchLyrics.js`、唔准直接行 `yt-dlp`、唔准 `launchctl bootstrap` 恢復 fetchlyrics job、唔准掂 Cloudflare/DNS/cert/token、唔准用 `launchctl kickstart` 繞過 deploy gate。
- DB 寫入只准經 `reviewLyrics.js --apply` 同 `ops/lyrics/delist-batch.mjs`。
- **版權紅線(HANDOFF §2.0)**:第三方歌詞網(包括 cantonhymnLookup)嘅文字**只准核對,一隻字都唔准成段照抄**。log/報告唔准貼完整歌詞。
- **嚴禁 AskUserQuestion**(non-interactive session call 會永久卡死)。
- 明確非歌內容(訪問/教學/花絮/巡迴紀錄)→ 收集 id,班尾行 `node ops/lyrics/delist-batch.mjs <list.json>`(`[{"id":N,"reason":"..."}]`,reason 必填);模糊個案留 draft + ledger 記名。

出錯就停低喺 ledger 寫「⛔ <你條線> 煞停:原因」,唔好夾硬、唔好 hack。
