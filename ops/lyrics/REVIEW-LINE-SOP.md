# 三線平行複核 SOP(Eric 2026-08-18 拍板重開)

沿用 47H 衝刺嘅 **P + R1 + R2** 平行設計,今次擴到三條複核線。
**P 線(producer)維持單線唔郁**(YouTube 出口 IP 係全 App 命脈,HANDOFF §2.2)。

| 線 | Task | 分區 | 核對來源 | Restart 權 |
|---|---|---|---|---|
| **R1** | `lyrics-line-mandarin` | `國語` **而且 id 係單數** | WebSearch(每班 ≤4 次) | ✅ **只有 R1 可以 approve + restart** |
| **R1b** | `lyrics-line-mandarin-b` | `國語` **而且 id 係雙數** | WebSearch(每班 ≤4 次) | ❌ |
| **R2** | `lyrics-line-cantonese` | `粵語` **而且 id 係單數** | `cantonhymnLookup.js`(**WebSearch 0 次**) | ❌ |
| **R2b** | `lyrics-line-cantonese-b` | `粵語` **而且 id 係雙數** | `cantonhymnLookup.js`(**WebSearch 0 次**) | ❌ |

> **2026-08-22 由 2 條線加到 4 條**(Eric 拍板):producer 出貨快過複核,draft 隊列升到 400。
> 加線方法係**喺原有 lang 分區之上再用 `id % 2` 拆一刀**:
> ```python
> mine = [d for d in actionable if d['lang']=='國語' and d['id'] % 2 == 1]   # R1
> mine = [d for d in actionable if d['lang']=='國語' and d['id'] % 2 == 0]   # R1b
> ```
> **點解用單/雙數而唔用 id 範圍或者搶佔式 queue:**
> - **零重疊、零協調**:唔使 lease、唔使鎖、唔使問隔籬線做緊乜,純數學保證兩條線永遠攞唔到同一首。
> - **自動平衡**:id 分佈平均,兩邊份量差唔多(實測國語 99 / 113、粵語 34 / 36)。
> - id 範圍分法會隨住新歌入庫而失衡;搶佔式 queue 要改 `reviewLyrics.js` 加 lease 欄,風險大好多。
| ~~**R3**~~ | ~~`lyrics-line-english`~~ | ~~`英文` + `兒童`~~ | — | ❌ |

> 🛑 **R3 英文線 2026-08-19 已停用(Eric 拍板)。** 英文/兒童分區 100% 係在版權當代敬拜歌(Yancy / Hillsong Kids / CJ and Friends / Listener Kids / Matt Redman / Chris Tomlin / Bethel…),複核 agent 嘅運作守則唔准重現在版權歌詞正文,所以呢條線**結構上做唔到嘢**(七轉零產出;早前「context 爆」嘅診斷係錯,見 SUPERVISION-LOG 2026-08-19)。66 首 draft + 池入面 39 首同類已記錄喺 `backend/data/lyrics-copyright-hold.json`,狀態「暫緩-版權」——**draft 保留唔郁**(唔 apply、唔判 unusable、唔 delist),隨時可翻案。池入面**冇任何非在版權英文歌**可以轉做,所以係暫停唔係轉線。第日收錄咗公有領域傳統聖詩先開返。

## §1 唔會撞車嘅五條機制

1. **lang 欄硬分區**:`reviewLyrics.js --export` 冇 lease 機制,三條線攞到同一份 list ——
   **一定要即刻按你嗰個 `lang` filter 走晒其他語言**,咁 apply 檔天然 disjoint,零重疊。
   **做唔屬於你分區嘅歌 = 直接違規**,會同隔籬線撞單、白燒兩份額度。
2. **DB 寫入**:全部經 `reviewLyrics.js --apply`(內置 `acquireDbLock`,即攞即放)。
   ⚠️ 而家有 **4 條線**,撞鎖機會比 2 條線高 —— 但 apply 攞鎖只係一瞬(唔係揸住做慢嘢),
   加上四條線嘅 cron **各自錯開至少 1 個鐘**,實際同時 apply 嘅機會好低。
   撞到就照原本規矩:等,5 分鐘都唔得就跳去下一批,**唔准 hack、唔准刪 lock 檔**。
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

## §2b ⚠️ Payload 紀律(2026-08-18 R3 三轉全滅之後加)

**實錄:** R3 英文線 13:23 / 17:22 / 21:22 連續三轉,export 完一次過對成個 61 首分區做 dedupe,
2–3 分鐘後成個 session 蒸發,零決定零 ledger。根因唔係 quota(全日零 rate limit),
**係 per-session context 上限** —— 英文分區 61 首 raw draft 合共 57,279 字元,dedupe 完個 JSON
132KB,一入 context 就爆。

**所以:**
- **批次大細要按字元計,唔係按首數計。** 一批目標 ≤ **15,000 字元 raw draft**:
  中文歌(平均 ~1,400 字元)約 12–18 首;英文歌(平均 ~940 但長尾去到 3,799)**最多 12 首**。
- **一定要切完先讀**:先由分區揀今批嗰十幾個 id,**先至**對嗰批做 dedupe / 讀內容。
  **唔准對成個分區做 dedupe** —— 呢個就係 R3 死嘅動作。
- **唔准 `cat` / Read 成個大檔**(`drafts.json` / `mine-dd.json` / `align/*`)。要睇就寫 script
  逐首 print,睇完即刻判。align 數據只准攞當前批嘅 id。
- **每批做完即刻 audit + apply + append ledger 先攞下一批** —— 死喺第 N 批都保得住頭 N-1 批。

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

**keeper 死咗要唔要重開 —— 先睇個 stop flag,唔好盲重開:**

```bash
cat /tmp/lyrics-sprint-stop 2>/dev/null
```
- **檔案存在而且第一行係 `PAUSED-BY-ERIC`** → 🛑 **呢個係刻意暫停,唔係故障。
  唔准刪呢個檔、唔准重開 keeper。** 通常係 Eric 要用 CPU(Xcode build / 模擬器實測)。
  你照做複核就得(複核唔食乜 CPU),喺 ledger 記低「producer 暫停中(PAUSED-BY-ERIC)」。
- **檔案存在但冇 `PAUSED-BY-ERIC`**(舊格式殘留)→ 可以刪咗佢再重開。
- **檔案唔存在而 keeper 真係死咗** → 重開(唔食 Claude 額度,係最抵嘅資源):
```bash
nohup bash ops/lyrics/producer-keeper.sh >/dev/null 2>&1 & disown
sleep 10; pgrep -fl producer-keeper; tail -5 /tmp/hymn_keeper.log
```

> ⚠️ 2026-08-20 差啲出事:舊版呢段寫住「見到 stop flag 就刪咗佢再開 keeper」,
> 而 Eric 啱啱叫停 producer 去做模擬器實測 —— 下一班一開波就會自動拆咗個暫停。
> 所以而家 flag 入面會寫明原因,**要讀完先決定**。
⚠️ **三條線都嚴禁自己開 `fetchLyrics.js`** —— 全程只准一個 producer。

**校對方法正本:** Read `/Users/macbookpro/.claude/scheduled-tasks/lyrics47-b01/SKILL.md`
(dedupe 腳本、死症 vein、高產 vein、cantonhymnLookup 用法、粵語預篩檔、判決紀律,全部照跟)。

```bash
# 3. 驗收 + 寫入 + 覆查
node scripts/auditLyricsBatch.js <apply檔>       # 只准 apply -passed.json
node scripts/reviewLyrics.js --apply <passed檔>
# → 跟住做 §1.3 嘅覆查
```

## §3b 天然短詩歌:`shortOk` whisper override(Eric 2026-08-19 拍板)

有啲詩歌成首歌真係得三四句,俾 45 CJK 門檻硬擋死,每輪 export 都出返嚟俾人重讀,
**永遠出唔到街**。而家有正式出路:

**用法:** 你讀完覺得「唔係 OCR 漏,係首歌本身短」,就喺 apply entry 加 `shortOk: true`:
```json
{"id": 5431, "lang": "國語", "lyrics": "…", "shortOk": true}
```

**⚠️ 呢個唔係聲明就算數。** `auditLyricsBatch.js` 會**開 DB 查返條片嘅 whisper timeline
實證**,三樣都要過先放行:
1. whisper 覆蓋 ≥85% 歌曲長度(真係聽到尾)
2. whisper 本身聽到嘢(中文 ≥30 CJK / 英文 ≥60 字元)—— 擋走「成段都係 [MUSIC]」
3. whisper 去重後 unique 內容 ≤ 你交嘅歌詞 × 1.6 —— **最緊要嗰條**:whisper 聽到嘅
   多過你交嘅,即係 OCR 漏咗嘢,唔係天然短

實證唔過佢會印明點解(例:`whisper 聽到嘅 unique 內容 44 明顯多過你交嘅 7,比例 6.3×`),
**唔好夾硬再試,亦唔准為咗過關而屈歌詞** —— 過唔到就照留 draft。

override **只推翻「太薄」一個原因**;有第二個 reject 原因(衛生 regex / 經文括號 /
重複 id)照樣唔放行。冇 `shortOk` 嘅 entry 行為零改動。

已知實例:5431 願祢國降臨(27 CJK,覆蓋 95%)✅、5632 祢的慈愛(30 CJK,覆蓋 100%)✅
兩首已出街;6385 賜福與你 whisper 全程 [MUSIC] ❌ 實證唔到,維持 draft。

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

## §5b 串流健康探測(唔使你做,但要識睇)

`com.hymnstream.healthcheck`(launchd,每 6 個鐘)會 curl 三個固定 `/api/stream/<id>`,
唔係 206 就**自動寫警報落 `docs/SUPERVISION-LOG.md`**。你開波讀 log 見到
「🔴 串流健康警報」就代表**播放層出緊事,呢個重要過歌詞** —— 唔好當冇嘢,
喺 ledger 記低同埋喺你嘅收爐附註提出嚟。

- ⚠️ 個 label 特登**唔係 `com.hymnapp.*`**,所以 `launchctl list | grep hymnapp | wc -l`
  **照樣要係 7**,唔會變 8。見到 8 反而係有第二個 job 出事。
- 手動試:`ops/lyrics/stream-healthcheck.sh --verbose`;
  想測失敗路徑就 `HYMN_STREAM_BASE=http://127.0.0.1:39999 ops/lyrics/stream-healthcheck.sh --verbose`。

## §6 ⛔ 紅線(三條線一樣)

- **零 git 操作**(唔准 `git add` / `git commit` —— 多 session 共用 worktree)。ledger / SUPERVISION-LOG 照 append 但唔好 commit。
- 唔准自己開 `fetchLyrics.js`、唔准直接行 `yt-dlp`、唔准 `launchctl bootstrap` 恢復 fetchlyrics job、唔准掂 Cloudflare/DNS/cert/token、唔准用 `launchctl kickstart` 繞過 deploy gate。
- DB 寫入只准經 `reviewLyrics.js --apply` 同 `ops/lyrics/delist-batch.mjs`。
- **版權紅線(HANDOFF §2.0)**:第三方歌詞網(包括 cantonhymnLookup)嘅文字**只准核對,一隻字都唔准成段照抄**。log/報告唔准貼完整歌詞。
- **嚴禁 AskUserQuestion**(non-interactive session call 會永久卡死)。
- 明確非歌內容(訪問/教學/花絮/巡迴紀錄)→ 收集 id,班尾行 `node ops/lyrics/delist-batch.mjs <list.json>`(`[{"id":N,"reason":"..."}]`,reason 必填);模糊個案留 draft + ledger 記名。

出錯就停低喺 ledger 寫「⛔ <你條線> 煞停:原因」,唔好夾硬、唔好 hack。
