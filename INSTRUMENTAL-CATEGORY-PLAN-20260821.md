# 「純音樂」新歌種規劃(INSTRUMENTAL-CATEGORY-PLAN)

日期:2026-08-21
狀態:**§8 六條政策問題 Eric 已全部拍板(2026-08-21)**。Phase 1 執行指引已出:`INSTRUMENTAL-PHASE1-EXEC-20260821.md`(交 Sonnet5 執行)。本檔其餘部分維持規劃原稿。
範圍:器樂/無人聲敬拜音樂 —— 敬拜背景音樂、禱告音樂、soaking / instrumental worship。

---

## §0 一頁摘要

1. **分類做法**:完全照抄「兒童」嗰套已行過一次嘅路 —— **加一個 `instrumental INTEGER DEFAULT 0` flag 欄**,唔好開新 `lang` 值(`lang='兒童'` 呢條路 C4 換血已經證明係錯,唔好行返轉頭)。前端加一個 tab + 一個首頁 chip,團體 chip 零改動(本身動態)。
2. **攞歌做法**:**零關鍵字搜尋**。只行「官方 channel → playlist discover → 人手簽白名單 → id-exact 入庫」,即係 album backfill 嗰套 `--discover`/`--apply` 兩段式,`backfillAlbumFromPlaylists.js` 幾乎零改就用得。keyword blacklist 只做第二道保險。
3. **人聲驗證**:入庫前每首過 whisper 人聲偵測(現成 `whisperTranscribe.js` + `auditLyricsBatch.js` 個 gate 反轉用)。庫入面 6155 首已有 whisper timeline,回標舊歌唔使重新落片。
4. **歌詞維度**:入庫嗰刻直接 `lyrics_status='unavailable'` + `lyrics_source='instrumental'`。實證:`unavailable` 喺現行 code 已經係終態(fetchLyrics 兩條候選 query 都硬性要 `'none'`),歌詞班唔會撈返 —— 但仍然逐條 query 加顯式 exclusion 做雙保險(§4.3 有 11 條清單)。
5. **最大工程風險係串流,唔係分類**:成套串流機制嘅單一核心假設係「一首歌 3-8MB」(`resolveAudio.js:322` 註解原文)。30 分鐘以上檔案撞爆幾道牆,最硬嗰道係 **iOS 預載 90 秒 timeout + 全檔入 JS heap**(30 分鐘檔基本必死,而且每次轉歌重試,每次白燒幾十 MB)。所以**長檔應對(§6)一定要落地先准出長 track**;第一批可以先出 10 分鐘以下嘅短器樂 track 避開呢個坑。
6. **歌名**:`displayTitle.js` 有一個實際 bug 位要補(「1 小時」有空格寫法會被行頭 track number 規則食咗個「1」),其餘規則對器樂標題安全(only-delete 設計 + looksBroken 安全網)。
7. **規模預估**:庫入面已經有 27 首器樂片(22 首已標 `unavailable`);中文 org 可攻 5-6 個、首批估 150-400 首;英文 org(Bethel/Elevation 等)另計,受英文線暫停政策影響,要 Eric 拍板(§8 Q1)。

---

## §1 現況盤點(調查實錄)

### 1.1 「分類」而家點運作

三套並存,只有一套真生效:

| 層 | 欄位 | 狀態 |
|---|---|---|
| App 前端(詩歌庫/首頁) | `lang` + `kids` + `org`(全部由 `/api/hymns` 一次過落) | ✅ 唯一生效 |
| `backend/routes/category.js` | `lang` + `artist` | ⚠️ 死 code,全 repo 零 caller,且六處 lang 值硬編碼、冇 kids 兼容墊 |
| DB `category` 欄 | 詩歌/粵語/國語/兒童 | ⚠️ 歷史遺留,TAXONOMY-5D-PLAN §2.3 明文「冇 UI 用佢做 truth」 |

「兒童」係現成先例:唔靠 `lang` 值,靠 `worshipGroups.js` 嘅 `priority===4` → 入庫時寫 `kids=1` + `lang` 寫真語言;前端 `LibraryScreen.js` 用 `h.kids===1` 分流 + sub-chips;`server.js:216-219` 有個兼容墊照顧舊 client。**呢套 pattern 全部可以照抄。**

前端 hardcode 位(加新分類要改嘅完整清單見 §3.3):`LibraryScreen.js:21` `LANGS`、`HomeScreen.js:57-64` `CHIP_DEFS`、兩個 admin 表單各一份 copy。團體 chip 係前端動態聚合(`LibraryScreen.js:189-194`),加新 org 零改動。

### 1.2 庫入面已經有器樂內容

實查 `title LIKE '%演奏%'/'%Instrumental%'/'%純音樂%'` 嘅 curated ok 行 = **27 首**:

- 讚美之泉鋼琴演奏系列(5690/5691/5698-5701、5792-5802)、約書亞演奏版(6734/6735)、新心大提琴(3989)等,絕大部分已係 `unavailable/ocr`
- ⚠️ **4 首係 `verified/ocr`**(3959/3976/3984/8033)—— 器樂版但片入面打晒歌詞字幕。**8033 仲救返過 OCR 全死嘅原曲 7721。教訓:純標題 regex 判 instrumental 會出錯,見 SUPERVISION-LOG:6181。**
- 另有唔帶「演奏」字眼嘅死症 vein:讚美之泉「**安靜系列/弦樂四重奏/青少年弦樂團**」(SUPERVISION-LOG:6630,id 名單喺 :4145/:3822/:5321,合共 20+ 首)—— 標題完全冇 instrumental 字眼,只有 whisper 先判到。
- 2026-08-16 Eric 指示「純音樂無人唱歌既先唔好理住」嘅 `parkedInstrumentals` 機制(`lyrics-requeue-priority.json`)已被後續複核班用 `unusable:true` 覆蓋,嗰 7 首而家全部係 `unavailable/ocr` —— 即係呢個新規劃正正係接返嗰條線嘅正式做法。

### 1.3 收錄層而家反而係「擋住」純音樂

`backend/lib/hymnDb.js:208-209` 嘅 `INSTRUMENTAL_TUTORIAL_PATTERNS`(含「純音樂」「伴奏」「instrumental」「backing track」「karaoke」)喺 `isNonWorship()` 入面,`usablePool()`/`channelScan.js:107`/`backfillCore.js:29` 全部有用 —— **即係而家新收錄嗰刻已經自動剔走帶呢啲字眼嘅片**。開新歌種要俾條專用通道佢,但唔可以簡單剷走個 blacklist(佢同時擋緊教學/琴譜/宣傳片)。

### 1.4 長檔現況

庫入面 >10 分鐘 74 首、>30 分鐘 6 首(最長 57:58,id 739 鋼琴靈修 —— 本身就係器樂!)。`duration` 欄係 **TEXT `"M:SS"`**(`formatDuration` 純分鐘制,1 小時檔會寫 `"62:30"`,唔會爆 format,但欄位冇得直接 SQL 數值比較)。體積換算(128kbps AAC ≈ 0.96MB/分鐘):10 分鐘 ≈ 9.6MB、30 分鐘 ≈ 28.8MB、60 分鐘 ≈ 57.6MB,對比 12MB buffer cap。

---

## §2 方案一覽(五條線)

| 線 | 內容 | 依賴 |
|---|---|---|
| A. 分類架構 | `instrumental` flag + view 重建 + 前端 tab/chip + admin 表單 | 無,可先行 |
| B. 回標存量 | 27 首已知 + whisper 全庫掃描搵漏網,人手抽驗後落 flag | A(要有欄先落) |
| C. 新歌入庫 | playlist discover → 白名單 → whisper 驗證 → 入庫 | A;§8 Q1-Q3 拍板 |
| D. 串流長檔應對 | 預載豁免 + warm/TTL 調整 | 無,可同 A 並行;**出長 track 前必須落地** |
| E. 歌名規則 | `stripLeadingTrackNumber` 補丁 + dry-run 驗證 | 無,好細,搭 C 一齊 |

---

## §3 方案 A:App 點加「純音樂」分類

### 3.1 核心決定:flag 欄,唔係新 lang 值

**做法**:`hymns_all` 加 `instrumental INTEGER DEFAULT 0`,`lang` 照寫 org 嘅語言桶(粵語 org 出嘅器樂寫粵語)。

**點解唔用 `lang='純音樂'`**:
1. 器樂根本冇語言,塞入 `lang` 係語意錯誤 —— 同當年 `lang='兒童'` 一模一樣嘅錯,C4 成個換血工程就係為咗拆返呢舊嘢,唔好行返轉頭。
2. `lang` 保留真值,將來想做「粵語器樂/英文器樂」sub-chips 可以直接照抄 `kidsSubLangs` 三件套(`LibraryScreen.js:132-155`)。
3. flag 做法有完整先例(kids),三條 INSERT 路徑、migration、前端分流全部有樣板照抄。

**Migration**:抄 `scripts/migrateTaxonomy.js` pattern —— backup `hymns.db`+`users.db` → `acquireDbLock` → idempotent `ALTER TABLE`(先 `PRAGMA table_info` 查)→ 寫返出去。
⚠️ **`hymns` view 係 `SELECT *`,view 建立後 ADD 嘅欄唔會自動入 view**(`migrate-lyrics.js:13-15` 明文)—— 要重建 view,參考 `scripts/migrate-hymns-view.js`。
⚠️ 所有寫操作跟 [[feedback-hymnsdb-writes-need-lock]]:locked node script,唔准 raw sqlite3 CLI UPDATE。

### 3.2 API 層

- `server.js:206` 條 SELECT 加 `instrumental` 欄出街。
- **兼容墊(舊 client)**:照抄 kids 個墊(`server.js:216-219`)加一句 —— 建議 `if (h.instrumental) h.real_lang = h.lang; /* lang 保持真值,唔改 */`。同 kids 唔同:**唔建議**將 lang 強制改做「純音樂」,因為舊 client 冇呢個 tab,強制改反而令啲歌喺舊版 App 邊個 tab 都搵唔到;保持真 lang,舊 client 見到佢哋喺粵語/國語 tab(顯示做「暫無歌詞」嘅歌),過渡期可接受(§8 Q5 確認)。
- `routes/category.js` 係死 code,**唔加唔改**,維持現狀(佢本身六處硬編碼未跟 kids,唔好再加債)。

### 3.3 前端改動清單(照 kids pattern)

| # | 檔案:行 | 改乜 |
|---|---|---|
| 1 | `LibraryScreen.js:21` | `LANGS` 加 `'純音樂'` |
| 2 | `LibraryScreen.js:158-184` | filter 鏈加分支:`lang==='純音樂'` → `h.instrumental===1`(照 `kidsBase` 寫法);同時現有四個語言 tab 要唔要剔走 instrumental(`&& h.instrumental!==1`)—— 建議剔,唔好一首歌兩邊出 |
| 3 | `HomeScreen.js:57-64` | `CHIP_DEFS`:**剷走 `quiet`(安靜靈修)entry,換入 `{ id:'instrumental', title:'純音樂', match:(h)=>h.instrumental===1 }`**(§8 Q4 已拍板係取代唔係並存;細節同舊用戶 saved chip fallback 分析見 §8.1) |
| 4 | `AdminEditHymnSheet.js:31-32` + `AdminAddHymnScreen.js:22-23` | 兩份 hardcode copy 各加 instrumental checkbox(照 kids checkbox);`adminHymns.js:26` `EDITABLE_FIELDS` 加 `'instrumental'` |
| 5 | 播放器/歌詞面板 | 「暫無歌詞」文案對 instrumental 改做「純音樂 · 無歌詞」之類,唔好令用戶以為歌詞未做 |

**唔使改**:團體 chip(動態)、`useCachedHymns`(欄位跟 SELECT 自動落)、搜尋(照搜 title)。

---

## §4 方案 B+C:點攞歌、點驗證、點分類

### 4.1 攞歌:零關鍵字搜尋,全程白名單

**時代曲風險嘅唯一根治法就係唔搜**。`worshipGroups.js:5-7` 本身已經寫明呢條紀律(「關鍵字搜尋會扒一大堆唔相干嘅片返嚟」),器樂呢類 generic 關鍵字(純音樂/背景音樂/輕音樂)只會更衰 —— 粵語老歌純音樂版、電視劇配樂、瑜伽冥想音樂全部撈到。所以:

**Layer 1(唯一入口)— 官方 channel playlist discover**:
- 用 `backfillAlbumFromPlaylists.js --discover` 現成骨架(列 channel 全部 playlist → 人手簽白名單 → `--apply` 只處理 `approved:true`)。ALBUM-BACKFILL-ACCEL-PLAN §2A 實測讚美之泉 103 個 playlist 入面**已經見到「純音樂」playlist**(以前當雜訊剔走,而家反轉就係 seed)。
- 每個 org 出一份 `backend/data/instrumental/<org>-playlists.json` 白名單,人手(或 AI 初篩+人手)簽 `approved:true` + 標 `albumName`。
- 官網 catalog 補充:`fetchSopSiteCatalog.js` 已 scrape 咗 sop.org 60 隻專輯,「安靜敬拜/靈修系列」就喺入面,細改加 series/category 欄就得。

**Layer 2(保險)— keyword blacklist**:
- 器樂線專用 exclude 名單(就算白名單 playlist 都可能混咗嘢):`時代曲/老歌/流行曲/懷舊/金曲/輕音樂/冥想/瑜伽/助眠/白噪音/karaoke/卡拉OK/伴奏(視乎 §8 Q3)/教學/琴譜/tutorial/sheet music/cover 舊曲` 呢類。
- ⚠️ 跟 `hymnDb.js:203-207` 紀律:**完整詞組(2+字),唔用單字**,新增 pattern 一定要先全庫 curated regression(有 bare「見證」誤殺 9/10 嘅前科)。
- ⚠️ 現有 `INSTRUMENTAL_TUTORIAL_PATTERNS` 對器樂線要反轉:新 ingestion path 要一個 per-line gate config,**唔准直接剷走全局 blacklist**(佢護緊主庫)。建議 `isNonWorship(title, group, {line:'instrumental'})` 咁樣傳 context,器樂線豁免「純音樂/instrumental/演奏」呢幾個 pattern、保留「教學/琴譜/宣傳/trailer」。

**Layer 3(實證)— whisper 人聲偵測**(§4.2)。

**片長 gate**:現有 `isInSongDurationBand` 係 75-600 秒,器樂線要另一條 band(建議 120 秒 – §8 Q2 拍板嘅上限),per-group/per-line 傳入,唔郁主庫個 band。

### 4.2 Whisper 人聲驗證(入庫前逐首過)

用現成 `backend/lib/whisperTranscribe.js`(whisper-cli + ggml-medium),判定式係 `auditLyricsBatch.js:100-160` `whisperShortVerdict()` 反轉:

```
coverage = max(seg.t1) / duration ≥ 0.85       ← 真係聽到尾
AND CJK 字數 < 30  AND  拉丁字元 < 60           ← 全程 [MUSIC] / 冇人聲
→ instrumental 實錘
```

- 中間地帶(coverage 唔夠 / 字數擦邊)→ 唔入庫,落 report 人手聽。**寧空莫錯**。
- ⚠️ 抄 code 時留意已修 bug:segs 一定要 `join('\n')`,唔可以空格 join(`auditLyricsBatch.js:132-137`)。
- ⚠️ whisper 幻覺前科([[project-shortok-ratio-hallucination]]):器樂片 whisper 有時會幻覺出歌詞。所以判定係「字多 → 唔准入」單向嚴格:幻覺令真器樂被拒(safe,落人手 report),唔會令有人聲片混入(佢真係有字)。方向啱。
- 長片成本:whisper timeout 現係 300s/600s(`fetchLyrics.js:578,540`),30 分鐘+ 檔要獨立 timeout 或者**只轉錄頭 10 分鐘 + 尾 2 分鐘抽樣**(器樂判定唔使全曲)。建議抽樣法,慳好多機時。
- **回標存量(方案 B)零落片**:6155 首已有 whisper timeline,直接跑判定式掃全庫,搵出「安靜系列」呢類標題冇字眼嘅漏網,出候選名單人手抽驗。

### 4.3 歌詞維度:點 set 先唔會被歌詞班撈返

**入庫嗰刻直接寫**:`lyrics_status='unavailable'` + `lyrics_source='instrumental'` + `instrumental=1`(三重保險)。

實證基礎:`unavailable` 喺現行 code 已經係終態 —— `fetchLyrics.js:305-322` 兩條候選 query 都硬性要求 `lyrics_status='none'`,檔頭寫嘅「90 日重試」從未實作;`reviewLyrics.js --export` 只出 `draft`。**所以理論上乜都唔加都唔會被重試。** 但為咗語意清晰 + 防將來邊個改 query 時中招,仍然加顯式 exclusion `AND (instrumental IS NULL OR instrumental=0)` 落以下 11 位:

1. `fetchLyrics.js:306-310`(CC 層候選)
2. `fetchLyrics.js:318-321`(OCR 層候選)
3. `fetchLyrics.js:265-270`(report 統計,要分開數)
4. `reviewLyrics.js:52-56`(複核 export)
5-6. `ops/lyrics/bi-freeze.mjs:64-65` / `:88-89`
7-9. `ops/lyrics/producer-keeper.sh:170/171/179`(池計數,唔好誤判「仲有貨」)
10. `ops/lyrics/requeue-pending-count.mjs:23-24`
11. `alignBackfill.js:86-89` —— **呢條建議唔加**:timeline 係人聲偵測證據,繼續幫佢做冇壞(但佢候選只揀 draft/verified,instrumental 天然唔會入)。

同步嘢:`lyrics-requeue-priority.json` 個 `parkedInstrumentals` 名單正式退役(嗰 7 首落 flag 後刪走);ledger 紀律照 [[oneoff-resetDlDead403 教訓]]:「改 DB 但唔清 ledger 等於冇改」。

**分流紀律(寫入 REVIEW-LINE-SOP)**:
- 純音樂 = **歌詞維度終態**(`unusable`/`instrumental`),**絕對唔准 delist** —— 佢係 org 官方發行、要繼續播。三處現有明文(`reviewLyrics.js:26-27`、`delist-batch.mjs:11-12`、SOP §6)已經劃咗界,新歌種只係加多個 source 值。
- 器樂版但有歌詞字幕(8033 型)= 照舊行 verified 線,`instrumental` flag 唔落(佢有歌詞,分類上係「歌」)。**判 instrumental 必須 whisper 實證 + `lyrics_status!='verified'` 保護,唔准純標題。**

### 4.4 delist 教訓嘅直接應用

[[adminHymns.js:98-107 教訓]]:淨係 `curated=0` 會俾 `growLibrary usablePool()` 翻生。同理,**instrumental flag 落咗之後要 audit 所有會「自動改 lyrics_status / 自動撈候選」嘅 pipeline** 有冇路徑會覆寫佢 —— §4.3 個 11 條清單就係呢個 audit 嘅結果,執行時要逐條再核實一次(code 可能已郁)。

---

## §5 方案 C 細節:邊啲 org、規模預估

### 5.1 中文 org(首波,唔受英文線暫停影響)

| Org | 已知器樂貨源 | 估計 |
|---|---|---|
| 讚美之泉 | 鋼琴演奏系列(3 輯)、安靜系列、弦樂四重奏、青少年弦樂團;官方 channel 有「純音樂」playlist(discover 實見) | 40-80 首 |
| 約書亞樂團 | 演奏版(6734/6735 已入庫);官網 catalog 59 專輯內有器樂/soaking 類 | 20-50 首 |
| 新心音樂事工 | 大提琴演奏(3989 已入庫);官網 catalog 現成 | 10-30 首 |
| 小羊詩歌 / 天韻 / 基恩 | 要 discover 先知;天韻有演奏傳統 | 各 0-20 首 |
| CantonHymn 等 aggregator | ❌ 唔攻(冇官方 catalog,7% album 命中率嘅前科) | — |

### 5.2 英文 org(§8 Q1 已拍板:**唔收住**,以下留檔俾將來再議)

Bethel Music(Without Words 系列成個 franchise)、Elevation(instrumental 版)、Hillsong(instrumental sessions)、專門 soaking 廠牌。呢批量大(單 Bethel Without Words 已 3-4 輯 × 10+ 首),但:
- 英文線而家 `PAUSED_LANGUAGES = ['英文']`(`growLibrary.js:146`)—— 器樂線係咪跟呢個掣,要 Eric 拍板。
- **只收 org 官方 channel**。專門 soaking 嘅第三方頻道(好多係 re-upload / AI 生成)一律唔收,除非逐個人手審過係原創機構。

### 5.3 總規模

- 存量回標:27 首已知 + whisper 掃描估多 20-50 首漏網 → **~50-80 首即刻有貨**(零 YouTube request)。
- 中文首波:150-400 首(5-6 個 org)。
- 英文第二波:100-300 首(3-5 個 org,視乎 Q1)。
- 對比全庫 curated 6102 首,新歌種佔 3-10%,做一個 tab 夠健康。

---

## §6 方案 D:串流長檔應對(出長 track 前必須落地)

核心假設寫喺 `resolveAudio.js:322`:「大部分詩歌全首得 3-8MB」。長檔逐道牆同對策:

### 🔴 P0 — iOS 預載:90 秒 timeout + 全檔入 JS heap(`audioPrefetch.js:37,:245`)

30 分鐘檔(28.8MB)要 320KB/s 先落得切,60 分鐘檔基本必死;死咗**每次轉歌重試一次,每次白燒幾十 MB 流量**(冇失敗記憶);`arrayBuffer()`+`Uint8Array` 雙份入 heap,60 分鐘檔峰值 ~115MB,jetsam 高危。另外 `prune()` 嘅 `touchedThisSession` 保護名單(12 個)對長檔 = 684MB 免剷,300MB cap 直接失效。

**對策(必做,改動細)**:`prefetchAudio()` 入面按 duration gate —— 超過閾值(建議 10 分鐘)嘅歌**唔做本地全檔預載**,行返 streaming 冷路徑。`duration` 係 TEXT `"M:SS"`,parse 做秒好易。呢一刀已經封晒 P0 兩個問題。第二步(可選)先做 streaming write + size-aware timeout。

### 🟠 P1 — backend warm:15 秒 fetch timeout + 全局串行鎖(`resolveAudio.js:386,:359-364`)

長檔 head fetch 一定攞足 12MB,要 820KB/s 先唔會被斬;斬咗 retry 再 15 秒,**30 秒白等係喺 `withWarmLock` 全局串行隊入面,塞住晒後面所有歌嘅 warm**。
**對策**:`warmBuffer()` 按 duration 分流 —— 長檔只 warm 細啲嘅頭(例如 4MB,夠起播)+ 512KB 尾,或者索性只 resolve 唔拉 bytes。

### 🟠 P1 — `BUFFER_TTL_MS = 25min` < 播放長度(`resolveAudio.js:328`)

30 分鐘+ 檔播到中段自己個 buffer entry 已過期,之後全冷。
**對策**:`getBufferedChunk` 命中時 refresh TTL(touch-on-hit),一行改動;或長檔 entry 用 duration-aware TTL。

### 🟠 P1 — `anyStreaming()` 令 warm 生態熄足成粒鐘(`server.js:360,:433,:501` 等五處)

播一首 60 分鐘歌,keep-warm URL 續期/backlog/daily cron 全部停一個鐘,積壓過期 URL。
**對策**:`anyStreaming()` gate 改做「streaming 開始超過 N 分鐘後,容許低頻 warm tick 照行」,或者對長檔 stream 唔計入 anyStreaming(佢本身好穩定,一條長連線唔驚爭頻寬)。呢個要斟酌,Phase 2 先做。

### 🟡 P2 — 中段 79% 冇 cache、記憶體 ceiling 變常態

60 分鐘檔頭 12MB+尾 512KB 之外全行冷路徑(`stream.js:253` 自認嘅「已知可接受缺口」——對長檔變主要路徑);`MAX_BUFFER_ENTRIES=8`×12.5MB≈100MB 常駐。
**對策**:接受現狀行冷路徑(googlevideo URL 壽命 4.5-5h,夠播;Node 唔會斬長 response)。唔建議為長檔起 disk cache 呢類新基建,除非實測卡。

### ✅ 唔使擔心嘅位(已核實)

resolve 層(`--get-url` 唔落載,同長度無關)、URL 壽命(4.5-5h > 1h 播放)、FE watchdog(45 秒固定,唔隨長度收緊)、Express timeout(冇設,default 唔斬)。

### 分段策略(關鍵決定)

**第一批只出 ≤10 分鐘嘅器樂 track**(演奏版單曲、器樂詩歌),完全喺現有假設安全區內(≤9.6MB,擦住 12MB cap 邊),D 線只需做 P0 嗰刀預載 gate 做保險。**30 分鐘+ soaking 長片留第二批**,等 D 線 P1 全套落地 + 實測先出。咁樣 C 線唔使等 D 線做晒先開波。

---

## §7 方案 E:歌名規則

逐條對過 `lib/displayTitle.js`(2026-08-21 現版):

1. **🐛 實際 bug 位要補**:`stripLeadingTrackNumber()`(:500-504)嘅 bare-digit 規則 `^\d{1,3}\s+(?!分鐘|分鍾)(?=[CJK])` —— negative lookahead 只保護「分鐘」。「**1 小時純音樂**」(數字後有空格嘅寫法)會被食咗個「1」變「小時純音樂」。修法:lookahead 加 `小時|小时`。「1小時」(黐埋寫)唔中呢條規則,安全。
2. **DECORATIVE_PHRASES 唔會誤殺**:名單冇「純音樂/instrumental/piano/soaking/演奏」,呢啲字眼會完整保留 —— 器樂標題可能囉嗦啲但唔會錯。**唔建議**將「純音樂/背景音樂」加入 decorative(對器樂 track 呢啲就係標題本身)。要唔要剷「1 小時/1 Hour」呢類時長前綴做 decorative,係 §8 Q4 嘅品味問題。
3. **括號抽取安全**:器樂常見嘅「【安靜等候】敬拜背景音樂」型,外層 fragment 有 CJK → `isDecorativeFragment` 判非 decorative → 唔抽取,原題保留(safe 方向)。
4. **安全網照冚**:only-delete 設計 + `looksBroken()` fallback,最壞情況係「冇縮短」。
5. **執行紀律**:器樂批入庫後照跑 `scripts/regenerateDisplayTitles.js` dry-run diff 人眼掃一次先出街(現成 harness)。

---

## §8 政策問題 —— ✅ Eric 已全部拍板(2026-08-21)

| # | 問題 | **拍板結果** |
|---|---|---|
| Q1 | 英文 org(Bethel/Elevation 等)收唔收? | **唔收(住)**。首波只做中文 org;英文器樂將來再議 |
| Q2 | 長度上限? | **10 分鐘**。呢個係新歌入庫嘅硬上限(§4.1 器樂線 duration band 上限 = 600 秒);存量回標唔受此限(見 Phase 1 執行指引 §3.3 —— 已上架嘅長器樂片今日已經咁樣播緊,回標唔會令佢變差) |
| Q3 | 「伴奏/backing track/karaoke 版」收唔收? | **唔收**。blacklist 保留「伴奏/karaoke/卡拉OK/backing track」pattern(§4.1 Layer 2 唔使反轉呢幾個) |
| Q4 | 前端呈現? | **詩歌庫加 tab;首頁「安靜靈修」chip 改做「純音樂」—— 係取代,唔係並存**。細節見下面 §8.1 |
| Q5 | 過渡期舊 client(instrumental 歌暫時出現喺原語言 tab)? | **接受**,照 kids 換血做法,靠 OTA 收尾 |
| Q6 | 存量回標係咪自動? | **whisper 實錘嘅自動落 flag 唔使問;唔肯定嘅開名單俾 Eric 過目先做**(同 [[feedback-nonsong-autonomous-delist]] 一致) |

### §8.1 Q4 補充:「安靜靈修」chip 現況實查(2026-08-21)

- 現行邏輯(`HomeScreen.js:63-64`):**純前端 title 關鍵字 regex** `/(安靜|靈修|禱告|恩典|同在|安息|寧靜|Still|Peace|Quiet|Rest)/i`,測 `h.title` —— 唔連任何 backend 分類/欄位,撈出嚟嘅大部分係**有人聲**嘅慢歌。
- chip 選擇存喺 MMKV `home.chip.v1`(`homePrefs.js:13`),但 `HomeScreen.js:145` 有 fallback:`chips.find((c) => c.id === chipId) || chips[0]` —— **剷走 `quiet` 唔會 crash 舊用戶**,saved 咗 `quiet` 嘅人下次開 App 自動跌返去第一個 chip(粵語敬拜)。唔使寫 migration。
- chip 有「夠 3 首先出現」gate(`HomeScreen.js:139`)—— 新「純音樂」chip 會喺 Phase 1 回標完成、OTA 推出後**自動現身**,唔使處理空狀態。
- **取代做法**:成條 `quiet` entry 剷走,加 `{ id: 'instrumental', title: '純音樂', match: (h) => h.instrumental === 1 }`。**用新 id `instrumental`,唔好翻用 `quiet` 個 id**(`dailyPick` 用 chip id 做 salt,翻用舊 id 會令新分類繼承舊分類嘅每日輪換 seed,冇壞但語意混亂)。
- 影響評估:原本俾 quiet regex 撈中嘅有人聲慢歌冇咗個入口,但佢哋照樣喺語言 tab / 搜尋度搵到 —— Eric 已接受呢個取捨。

---

## §9 分階段執行計劃

```
Phase 0  拍板 §8(Eric)               ── ✅ 2026-08-21 已完成,六條全批
         Phase 1 執行指引:INSTRUMENTAL-PHASE1-EXEC-20260821.md
Phase 1  schema + 存量回標          ── A+B 線,1 個班
  1a. migration:加欄 + 重建 view(backup→lock→ALTER→重建 view)
  1b. whisper 全庫掃描出候選名單(零落片,現成 timeline)
  1c. 27 首已知 + 實錘漏網落 flag;parkedInstrumentals 退役
  1d. §4.3 十條 query 加 exclusion
Phase 2  前端 + API               ── A 線,1 個班,可同 Phase 3 並行
  2a. server SELECT + 兼容墊;2b. LibraryScreen tab + filter;2c. HomeScreen chip
  2d. admin 表單×2;2e. 歌詞面板文案;2f. OTA(行 deploy gate)
Phase 3  串流保險刀               ── D 線 P0,細改,可同 Phase 2 並行
  3a. iOS prefetchAudio duration gate(>10min 唔全檔預載)
  3b. warmBuffer duration 分流(長檔只 warm 細頭)
Phase 4  新歌入庫首波(中文 org)   ── C+E 線,依賴 Phase 1
  4a. displayTitle 「小時」lookahead 補丁 + dry-run
  4b. instrumental line gate config(blacklist 反轉 + 專用 duration band)
  4c. 逐 org discover → 白名單人手簽 → whisper 驗證 → apply 入庫
  4d. regenerateDisplayTitles dry-run + 上架驗收
Phase 5  長 track 解封(30min+)    ── D 線 P1 全套 + 實測,先解 §8 Q2 上限
Phase 6  英文 org 第二波          ── 等 Q1
```

並行關係:Phase 2 / 3 互不依賴可齊行;Phase 4 只依賴 Phase 1(前端未出 tab 前入咗庫嘅歌會喺原語言 tab 出現,所以實務上 4 最好等 2 嘅 OTA 推咗先 apply 上架,discover/簽名單可以照做)。

---

## §10 風險清單(按易中招排)

1. **掹錯時代曲/冥想音樂** — 根治:零關鍵字搜尋,只行官方 playlist 白名單 + 人手簽。blacklist 同 whisper 只係第二三道保險。
2. **純標題判 instrumental 誤殺 8033 型(器樂版但有字幕)** — 必須 whisper 實證 + `verified` 保護欄。
3. **長檔出街但 §6 P0 未落地** — iOS 用戶每轉一次歌白燒幾十 MB 流量 + jetsam crash。**Phase 3 係 Phase 5 嘅硬前置,第一批限 ≤10 分鐘。**
4. **flag 被其他 pipeline 靜靜哋無效化**(delist 翻生前科)— §4.3 清單執行時逐條重核,新 pipeline code review 加一條 checklist。
5. **新增 blacklist pattern 誤殺主庫** — 完整詞組紀律 + 全庫 regression(bare「見證」前科)。
6. **DB 併發覆寫** — 全程 locked script、慢工序唔揸鎖、fresh openDb(fetchLyrics 三晚得返 1 首嘅前科)。
7. **whisper 幻覺** — 判定方向係「有字→拒收」,幻覺只會誤拒(落人手 report),唔會誤收。可接受。
8. **view 重建甩漏** — `SELECT *` view 唔會自動見新欄,migration 必須連 view 一齊做,做完 live `/api/hymns` 驗欄位。
9. **deploy 節奏** — backend restart 照行 deploy gate;唔好喺 Eric 真機 QA 進行緊嗰陣部署([[feedback-no-deploy-during-live-qa]])。

---

## §11 同現有工作流程嘅整合點(唔重新發明輪子)

| 需求 | 直接複用 | 改動量 |
|---|---|---|
| 分類 flag + migration | kids pattern(`migrateTaxonomy.js`、三條 INSERT 路徑、`LibraryScreen kidsBase` 三件套) | 照抄改名 |
| org discography discover | `backfillAlbumFromPlaylists.js --discover/--apply` 兩段式 + 白名單簽名 | 幾乎零改 |
| 官網 catalog | `fetchSopSiteCatalog.js` 等 fetch/write 分離骨架 | 細改加 series 欄 |
| 人聲偵測 | `whisperTranscribe.js` + `auditLyricsBatch.js whisperShortVerdict()` 反轉 | 抄判定式,留意 `\n` join bug |
| 存量掃描 | 6155 首現成 whisper timeline | 零落片 |
| 批量安全寫入 | `delist-batch.mjs` 嘅 `[{id,reason}]`+dry+冪等 pattern | 照抄 |
| 可翻案名單 | `lyrics-copyright-hold.json` 格式 | 照抄 |
| 歌名清理 | `displayTitle.js` + `regenerateDisplayTitles.js` dry-run harness | 一個 lookahead 補丁 |
| 收錄四關 | `channelScan.js validateChannelCandidates()` | 加 per-line gate config(blacklist 反轉 + duration band) |

---

*規劃:Fable 5,2026-08-21。三路並行調查(分類架構/串流機制/歌詞 pipeline+album backfill 方法論)+ displayTitle.js 逐行核對,所有 file:line 同數字係當日實查。*
