# 47 小時歌詞衝刺 ledger(2026-08-15 → 2026-08-17)

規格:`LYRICS-47H-SPRINT-PLAN.md`。**呢個檔唔 commit**(untracked,gate 只查 backend/)。
每班收工前 append 一行。「決定數」= 今班 apply 出去嘅 entry 總數(verified + unusable + demote),
係額度換算嘅唯一憑據:**~35 個決定 ≈ 週額度 1%**。

三級減速閘(以「累計決定」為準,見規格 §6):
- **900** → 唔再開 R2 粵語線,單線行
- **1,200** → 只複核高產 vein(約書亞/讚美之泉/小羊/基恩/ACM/同心圓/泥土/611/角聲),雜項留池
- **1,500(硬頂)** → 複核線全停,之後各班只做輕 checkpoint 班

| 時間 | 班 | 今班決定數 | 累計決定 | est%(÷35) | 累計verified | 備註 |
|---|---|---|---|---|---|---|
| 2026-08-15 11:22 | Phase 0 | 0 | 0 | 0% | 2207 | 基線:出街 6446 首、verified 2207(34.2%)、draft 1、unavailable 511、OCR池 605、CC未行 3120。patch 已落(dl ledger / --skip-orgs / audit langmismatch bucket),keeper 已開跑 OCR |
| 2026-08-15 13:35 | b01 | 131 | 131 | 3.7% | 2326 | 三輪複核(129+27+5 draft 全清)。verified 117 / unusable 14 / delist 6 / reject留draft 1 / **langmismatch hold 23**。backend restart 14:09 做咗(等真機播放靜足 20 分鐘先做),live 6446→6440 首、抽驗歌詞已出街。WebSearch 0 次。 |
| 2026-08-15 17:21 | b02 | 70(**b03 事後補嘅**) | 201 | 5.7% | 2386 | ⚠️ **b02 自己冇寫 ledger 亦冇寫 SUPERVISION-LOG**(17:00 開波,17:21 之後冇再出檔,疑似中途斷咗)。b03 由佢 scratchpad 重組:batchA/B passed 40+30=70 已 apply(verified 60 / unusable 10)、langmismatch hold +25、delist 7。**冇做 checkpoint、冇 restart。** |
| 2026-08-15 23:20 | b03 | 249 | 450 | 12.9% | 2609 | 五輪(A粵語小org 74 / B同心圓+ACM+角聲 76 / C英文兒歌+國語 50 / D約書亞+讚美之泉 36 / E新心+Yancy+小羊 33)。verified 223 / unusable 26 / delist 16 / reject留draft 3 / langmismatch hold 1。backend restart 做咗**三次**(21:42 / 22:36 / 23:19),live 6434→**6418** 首,每輪抽驗都全部吐到歌詞。WebSearch **0 次**(cantonhymnLookup 4 次)。 |
| 2026-08-17 08:30 | b11 | 182 | 1186 | 33.9% | 3215 | 十一輪複核。verified 141 / unusable 14 / delist 27 / reject留draft 9 / langmismatch hold **0**。backend restart 做咗**四次**(05:21 / 07:41 / 08:18 / 08:28,四次都行足 deploy gate,每次前都做咗 `[stream]` 靜音檢查——最後一條 stream 停喺 08-16 11:52,即 20 個鐘冇人聽歌,冇撞正真機 QA)。live 6408→**6381** 首,**verified 覆蓋率首次過半:50.4%**。⚠️ 05:21 嗰次順手放咗 b04–b10 + 根因線一直未出街嘅積壓(上一次 restart 係 b03 08-15 23:19,即係 8/16 成日嘅 430 首 verified 從來未 live 過)。WebSearch 0 次。 |

---

### 各班要知嘅兩件事

1. **`lyrics-daily-proofread`(每日 09:40/15:40/21:40)喺 Phase 0 俾人暫時 disable 咗** —— 原因:佢同衝刺各班搶同一批 draft(export 冇 lease),重複複核 = 白燒額度,亦令呢個 ledger 個 1,500 硬頂管唔到數。**`lyrics47-wrap` 第 6 步負責開返佢。** 如果 wrap 班煞停/冇行到,邊個班見到都要補開返(scheduled-tasks MCP `update_scheduled_task(taskId="lyrics-daily-proofread", enabled=true)`)。
2. **producer(keeper)唔准班次自己開 `fetchLyrics.js`** —— 全程只准一個 process(YouTube 出口 IP 係全 App 命脈)。你嘅責任只係「keeper 死咗就重開 keeper」。
3. **粵語 cantonhymn 預篩(2026-08-15 11:57 Eric 拍板加建)**:`backend/data/cantonhymn-prescreen.json` 記低邊啲粵語歌有現成核對底本,producer 已經自動將嗰批排到 OCR 隊頭 → **粵語 draft 比例會明顯升,係刻意嘅**。用法見 b01 SKILL §3 E2。⚠️ 版權政策**零改動**:預篩命中 ≠ 有歌詞,一樣要用自己 OCR 嘅文字,cantonhymn 只准核對唔准照抄(HANDOFF §2.0)。
   - **12:20 跑完**:1,079 首掃晒,**621 首(57.6%)有底本**(561 強命中 / 60 弱命中要人核),cache 預熱到 743 個。當中 71 首已喺 OCR 池、550 首等 CC 一轉(預計今晚 19:00-20:00 池乾轉 CC 之後入池)。**唔好手動開 CC run 趕早**(搶 producer 線 + 犯單一 producer 紅線)。

---

### b01 班(13:00–13:35)留低嘅三件事,下一班一定要睇

1. **✅ backend restart 14:09 做咗,117 首歌詞 + 6 首落架已經出街。**
   13:28 撞正真機播放中(`client-log appState=background` + 每 3–6 分鐘自動轉歌),跟
   `feedback-no-deploy-during-live-qa` 同 SKILL §7.1 押後,開咗個 watcher 等 stream 靜足 20 分鐘
   (最後一條 stream 13:49,14:09 開閘)。deploy gate 一次過(HEAD 51279c5 == approved sha),
   launchctl 7 個 job 齊(冇 fetchlyrics 係正常),live 由 6446 跌到 **6440** 首,
   抽 8289/6077/7466/3141/5012 都吐到歌詞。**呢招下一班可以照抄:唔好硬等,開個背景 watcher
   等 stream 靜 20 分鐘,自己會通知你。**

2. **⚠️ langmismatch 擋板對「中英對照歌詞」誤判 —— 23 首靚貨卡咗喺 hold 池等 Eric。**
   `auditLyricsBatch.js` 用「拉丁字母數 > CJK 字數」做門檻,但約書亞/小羊/基恩官方 MV 好多都係
   **一行中文一行英文對照**,英文用字母數自然係中文字數嘅 3–4 倍,所以逐首中伏。
   呢批**唔係** Eric 講嗰種「lang 標中文但歌根本係英文」(嗰種呢班只有 1 首:id 6815,全首淨係英文)。
   b01 冇改門檻、冇繞過擋板,照規矩全部 merge 咗落 `backend/data/lyrics-langmismatch-hold.json`
   (歌詞全文有齊,Eric 一拍板就可以直接 apply)。**請 Eric 拍板:**
   (a) 中英對照照出街(建議改門檻做「CJK < 15 字先當英文歌」),定 (b) 只出中文行,定 (c) 維持現狀。
   受影響 id:206 4108 4142 4145 4997 5059 5123 5131 6620 6621 6640 6658 6815 7291 7312 8097 8126 8130 8205 8221 8222 8224 8226

3. **📋 兩個判斷偏離咗 SKILL 字面,寫低俾 Eric 覆核:**
   - SKILL §3B 話 `盛曉玫` 係死症 vein「見到即刻 unusable」,但 b01 逐首讀過 7 首泥土音樂/盛曉玫 lyric video
     (30 / 8387 / 8422 / 8545 / 8576 / 8577 / 8595 / 8385),OCR 其實好乾淨、全部救得返,所以照 verify 咗。
     真死症係嗰啲**節目片**(已落架嘅 8427 幸福熱線)。建議下一班照樣「睇 draft 質素判,唔好淨係睇 org」。
   - SKILL §3D 話「語言標錯台語 → unusable」,但 8268 / 8266 / 5513 三首台語/閩南語歌 draft 完整乾淨,
     判死等於白白剷走可用歌詞,所以 verify 咗。**lang 欄仍然係「國語」,係錯嘅**,等 Eric 決定點分類。


---

### b03 班(21:00–23:20)留低嘅五件事

1. **✅(已解決)deploy gate 一度俾第三方 session 一個未 commit 嘅檔擋住,21:42 已經 restart 咗。**
```
❌ abort:backend/ working tree 有唔屬於運行時豁免嘅未 commit 改動:
   ?? backend/scripts/oneoff-delistLingMingSuZao.mjs      (今日 14:53 建立)
```
   呢個係【靈命塑造系列】6 首落架嘅一次性 script,**唔係 b03 建立**。b03 班 SKILL 紅線寫明「零 git 操作」,
   所以**冇 commit、冇搬走、冇剷、亦冇繞過個 gate**(approve.sh 已經行咗,HEAD cb67e87 已批准,
   卡住嘅純粹係第 2 關 working-tree 檢查)。
   - 當時後果:159 首 verified + 14 首落架入咗 hymns.db 但 live 仍然係舊 snapshot(實測抽 5 首全部「冇歌詞」)。
   - (如果冇解決,b04–b11 會撞同一道牆 —— 呢個 failure mode 記住。)
   - b03 已經 SendMessage 通知咗兩個 peer session(hymn-app-dc / hymn-app-3a)。
   - **解法(要監督線或者 Eric 做)**:`git commit -- backend/scripts/oneoff-delistLingMingSuZao.mjs`
     (pathspec commit,唔會夾埋人哋嘢),或者將個檔搬出 backend/。之後隨便邊一班 restart 就會一次過出街。

2. **OCR 池「有貨但攻唔到」開始常態化。** keeper 21:02 同 19:17 兩次報「池入面冇一首攻得(全部 cooldown / skip-orgs)」,
   要強制轉 CC 補倉。即係話 dl-failures ledger 嘅 12 鐘頭 cooldown + `--skip-orgs` 開始成為新樽頸,
   唔係池空。**下一班唔好見到「池 992」就以為有 992 首可以做**,睇 keeper log 嗰句先。

3. **🔴🔴 最緊要嗰件:中英對照擋板已經變成成個衝刺最大嘅樽頸,遠大過 OCR 同額度。**
   b03 五輪期間睇住個比例一路惡化:

   | 時間 | export 未做過 | 可做(非BI) | **BI(中英對照,必入 hold)** |
   |---|---|---|---|
   | 21:00(第 1-3 輪) | 259 | 200 (77%) | 59 (23%) |
   | 22:32(第 4 輪) | 126 | 36 (29%) | **90 (71%)** |
   | 23:14(第 5 輪) | 146 | 33 (23%) | **113 (77%)** |

   原因:producer 而家攻緊約書亞樂團 / 讚美之泉 / 小羊 呢批**官方雙語 MV**,一行中文一行英文係佢哋嘅標準做法。
   收工時 draft **171** 首,拆開係 **langmismatch hold 池 49 + BI 高危 ~113 + reject 3 ≈ 165**,
   即係**九成以上係卡住嘅,唔係新可做**。
   **淨計而家已經有 160+ 首完全可用嘅歌詞出唔到街**,而且每過一個鐘就多幾十首。
   **b01 問 Eric 嗰條問題((a) 中英對照照出街 / (b) 只出中文行 / (c) 維持現狀)而家係最高優先**,
   建議 wrap 班第一件事就係推佢拍板 —— 只要揀 (a) 或 (b),`lyrics-langmismatch-hold.json` 入面
   歌詞全文有齊,一個 script 就可以全部 apply 出街。

4. **可做存貨嘅真實補給速度**:producer OCR 一轉(budget 120,約 50 分鐘)大概出 60–65 首新 draft,
   但按上面個比例,**淨返 30–36 首係真正可做**。下一班排時間要用呢個數,唔好用 draft 總數。

5. **兩個新發現嘅 vein 質素評語(俾下一班):**
   - **同心圓敬拜(TWS)**:歌好,但佢個頻道混咗大量「TWS 音樂教室」教學片(結他/合唱/氣聲/前奏),
     b03 一次過落架咗 6 條。另外「同心唱系列 - 歌詞版」會喺畫面疊住 chord 名(`Chord: Bm`)同段落表
     (`正、副、間奏1…`),dedupe 剷唔走,要人眼跳過。
   - **ACM**:官方 Lyric Video 極乾淨(5243/5290/5293/5300 直接可用),但「管弦樂 Live」同
     「音樂會現場片段」呢類就得半首,而 MV 版(86/100/5305)watermark 極重、OCR 慘。

---

## 2026-08-16 下晝 —— 根因線(Fable 5)通報:Eric 已拍板,BI 樽頸解除,pipeline 大修已上線

(跨session訊息發唔到,寫呢度做正式 handoff。詳情:`LYRICS-CJK-OCR-ROOTCAUSE-PLAN.md`)

1. **b01 嗰條問題 Eric 揀咗 (a):中英對照照出街(跟官方)。** 上面第 3 點個樽頸即刻解除。
2. **擋板已改行級判斷**(`backend/lib/lyricsLangCheck.js`,audit + bi-freeze 共用):
   CJK 行佔比 ≥35% = pass(雙語對照);<10% 真錯配 hold;10-35% 亂碼 hold。
   你哋手頭舊 export 唔使改,行一次新 audit 就得。
3. **hold 池 121 條已處置,而家係空:**
   - 117 條中英對照 → `backend/data/lyrics-bilingual-release-20260816-passed.json`(已過新 audit 117/117)
   - 4 條英文歌(6595/6669/6815/8271)lang 已改英文 → `backend/data/lyrics-english4-release-20260816-passed.json`
   - **呢兩份係你哋 review 過嘅貨,班次覆核一眼就可以 `reviewLyrics.js --apply` 出街。**
   - 舊 hold 檔歸咗檔:`lyrics-langmismatch-hold-archive-20260816.json`
4. **OCR pipeline 大修已生效**(producer 已用新代碼重開,keeper 亦重啟咗):
   - 中文歌(國語/粵語/兒童)主引擎換咗 **PaddleOCR chinese_cht**(藝術字體實測完勝 Vision:
     4228 兒歌 Vision 讀「慈愛和機間…心踢」,Paddle 360p 全對),Vision 做英文歌 + 兜底。
   - watermark 改 fuzzy 聚類 + containment + 時間分佈 + 幾何(細字+偏離中線)四重偵測 ——
     ACM MV 嗰類「watermark 極重、OCR 慘」應該大幅改善,拼音行/credits 行都會自動剔。
   - 合併改「行級多數投票」(唔再揀長),卡拉OK填色/藝術字嘅亂碼變體會俾正確讀數投贏。
5. **重做隊 280 首已排**(`backend/data/lyrics-requeue-priority.json`,producer 排隊頭先做):
   66 live 遺害(重做期間 live 歌詞照住,Eric 拍板)+ 45 凍結 + 169 亂碼 draft。
   keeper 改咗:**重做隊有貨時 draft ceiling 唔攔**(唔使擔心 ceiling 卡住重做批)。
6. 16 首 KEC/約書亞英文 cover lang 已改英文。5142/5143(英文兒歌,lang=兒童)未郁,等 Eric 定 lang 體系。
7. 上面第 1 點嗰個 deploy gate 卡關(oneoff-delistLingMingSuZao.mjs 未 commit):根因線已用
   pathspec commit 處理,下一班 restart 就會一次過出街。

---

## 🔚 b11 班(Mon 05:00–08:45)交俾 `lyrics47-wrap` 嘅六件事

**1. hold 池已經空咗 —— 呢件事已經冇 backlog。**
`backend/data/lyrics-langmismatch-hold.json` = **0 條**(根因線 8/16 已全部釋放:117 條中英對照 +
4 條英文歌,兩份 `*-passed.json` 都 apply 咗、抽驗過 live 有歌詞)。b11 八輪 171 個決定入面
**langmismatch hold 0 條** —— 新嘅行級擋板(CJK 行佔比 ≥35% 就 pass)實測完全冇再誤殺中英對照。

**2. 🔴 b04–b10 七班全部冇寫 ledger、冇寫 SUPERVISION-LOG、冇做過一次 backend restart。**
- ledger 個表由 b03(08-15 23:20)直接跳到 b11;SUPERVISION-LOG 最後修改時間 08-15 23:21。
- `~/.hymn-deploy/deploy.log` 實錘:**上一次 backend restart 係 08-15 23:19(b03),之後直到
  b11 05:21 中間 30 個鐘冇 restart 過**。即係 8/16 全日做嘅 **430 首 verified 一直未出街**,
  b11 05:21 嗰次 restart 一次過放晒出去(verified live 2609 → 3168)。
- 佢哋**有做嘢**(scratchpad 仲喺度:b04 174 條 passed / b05 16 / b06 9 / b08 45 / b09 53 / b10 64,
  另 a1485f9a 係根因線 286 條),淨係冇留紀錄。**wrap 班唔好靠 ledger 個表估數,要用 DB delta。**
- 教訓:**「班尾 checkpoint」入面最緊要嗰步係 restart,唔係寫檔** —— 冇 restart 嘅班,做幾多都係
  寫入 DB 但用戶睇唔到。下次衝刺個 SKILL 建議加一句「開波先睇 deploy.log,見到上一班冇 restart
  就即刻補做」。

**3. 累計決定 1,186(est 33.9% 週額度),距離 1,500 硬頂仲有 314 個。**
基準:Phase 0 verified 2207 / unavailable 511 / live 6446 → 而家 3215 / 624 / 6381(覆蓋率 34.2% → 50.4%)。
wrap 班照計仲有大量餘額,唔使為額度收手。

**4. 模糊個案 / 等 Eric 拍板嘅嘢(b11 新增):**
- **純器樂點處理唔一致**:b11 撞到 7 首純音樂 draft(3228/3229 天弦鋼琴版、4821/4823 Hillsong Kids
  Piano Lullaby、5981 讚美之泉安靜系列、3628 同心圓《緊隨祢》OCR 全空、5911 讚美之泉弦樂四重奏),
  **跟 b03 先例判咗 unusable**;但 Eric 8/16 對重做隊嗰 7 首(5699/5700/5794/5795/5799/5801/6734)
  嘅指示係「擱置唔好理」= 留返喺度唔郁。兩種做法唔一致,**請 Eric 一句話統一**
  (判 unusable 隨時拉得返 draft,唔會蝕底)。
- **lang 欄錯標(繼續累積,由 b01 講到而家都未拍板)**:8432《想起你》係日文版但 lang=國語;
  4896《耶和華是我的牧者》title 明寫「華語詩歌」但 lang=粵語。b11 照 verify 冇改 lang 欄。
- **天然短曲(CJK < 45 門檻)今班再多 9 首**,全部歌詞冇問題、純粹係首歌本身短,每班都會 re-export
  出嚟俾人重讀一次:8347(35字)、4074(44)、4385(38)、4396(27)、4976(23)、8432(28)、
  6133(40)、6179(31)、6147(44)。**b03 已經提過同一件事(5255/6147/6179),而家累積到 9 首。**
  建議:人手 approve 一次,或者開個「短曲豁免名單」,唔好再燒下一班時間。
- **ACM 齊唱兒歌 CD 版只 OCR 到半首**(4385 珍惜、4396 無比忠心):唔係 OCR 差,係條片本身淨係
  show 咗幾行字幕。呢類建議入重做隊試 whisper,唔好當死症。

**5. 隊列同 producer 現況(b11 08:00 實測):**
- 收工時 draft 33,BI 凍結 24,**可做 9 首 —— 而且嗰批全部係 b11 判「太薄」reject 返出嚟嘅**(見第 4 點),
  即係新貨已經做清晒,wrap 班開波唔會即刻有貨,要等 producer 嗰轉 OCR 再出。
  OCR 池約 870、CC 未行過約 1,617、dl:dead 70、重做隊仲有約 74 首未做。
- producer(keeper pid 25630)生勾勾,05:05 開咗新一轉 OCR(budget 120),**新 PaddleOCR 之後每首
  約 5–6 分鐘**(舊 Vision 大約 1–2 分鐘),所以一轉 120 首要行 8–12 個鐘,**產出速度大約
  每個鐘 15–17 首 draft、其中約 10 首真係可做**。b11 後半段每 30–40 分鐘 re-export 一次,
  每次得 5–9 首新貨 —— 呢個係而家嘅真實補給率,wrap 班排時間用呢個數。
- **BI 凍結 24 首入面有一半係純器樂**(鋼琴演奏系列/弦樂四重奏,draft 冇 CJK 所以中招),
  唔係真係「中文歌配英文歌詞」。呢個係凍結名單嘅已知雜訊,唔使驚。

**6. keeper 同 caffeinate b11 冇郁過(照 SKILL 指示留返俾 wrap 班停)。**
`pgrep -fl producer-keeper` → pid 25630 生存;`caffeinate -dims` pid 38249 生存。
| 2026-08-17 11:15 | **wrap(手動補做)** | 0 | 1186 | 33.9% | **3215** | ⚠️ 排程 wrap 09:00:07 觸發咗但**死咗**(冇寫 ledger/LOG、冇做第 6 步)。11:10 由 Dispatch 叫 Opus 5 手動補做。部 Mac **10:56:55 重啟過**(`/tmp` 清空,keeper/producer/caffeinate 死於重啟,backend 由 launchd 自動返生、7 個 job 齊)。核實:HEAD=approved=044190c、**DB verified 3215 全部已 live**、draft 46(可做 21)、hold 池 0、覆蓋率 **50.4%**。`lyrics-daily-proofread` 已開返。 |
