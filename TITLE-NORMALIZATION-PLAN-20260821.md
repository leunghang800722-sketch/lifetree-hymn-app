# 全庫歌名統一整理規劃(TITLE-NORMALIZATION-PLAN)

日期:2026-08-21
性質:純規劃分析,**未改任何 DB 數據**。所有統計嚟自當日 `backend/hymns.db` 全庫 read-only 掃描(curated live view `hymns`,6,103 首;`hymns_all` 全表 8,169 行)。

---

## 0. TL;DR

- 我哋**已經有一個安全架構**:`title` 係原始 YouTube 標題(永遠唔改,search/匹配用),`display_title` 係機器清理出嚟俾用戶睇嘅名(`lib/displayTitle.js` + `scripts/regenerateDisplayTitles.js`,可以隨時重生)。Eric 提出嘅「加一個原始輸入名欄位保底」——**呢個保底已經存在**,方向啱晒。
- 所以整理歌名 = **加強清理規則之後重跑生成 script**,唔係逐首手改 DB。風險天然細好多:最壞情況係「某首冇縮短到」,唔會「顯示錯歌名」。
- 全庫仍有大量殘留雜訊:1,824 首顯示名超過 40 字、1,629 首帶【】、666 首帶「|」分隔、527 首夾住專輯宣傳字眼、another ~300 首「官方/歌詞版/Official」殘留。
- 建議分三級:A 級(低風險純機械,即可做)、B 級(規則要人手抽查,分 org 批次做)、C 級(重複歌/跨 org 統一命名,唔建議自動化,獨立 task)。
- 有 4 個政策問題要 Eric 拍板先開工(見 §6)。

---

## 1. 現況架構(點解呢個 task 冇想像中危險)

| 部件 | 現況 | 對本 task 嘅意義 |
|---|---|---|
| `hymns_all.title` | 原始 YouTube 標題,爬返嚟之後唔改 | **保底層已存在**,任何清理都唔掂佢 |
| `hymns_all.display_title` | 由 `lib/displayTitle.js` 嘅 `cleanDisplayTitle()` 生成;6,103 首全部有值,5,008 首同 `title` 唔同 | 整理目標就係呢個欄;`scripts/regenerateDisplayTitles.js` 可以成庫重生(有 `--dry-run`,有攞 DB lock) |
| 清理器設計約束 | **只刪字、唔加字**(`lib/displayTitle.js` 檔頭寫明) | 最壞情況=冇縮到,唔會出錯名;呢條紅線建議繼續守 |
| 搜尋 `routes/search.js` | `title` 同 `display_title` **兩個欄都搜** | 改 display_title 唔會令舊寫法搜唔到(原始 title 仲喺度) |
| 分享/清單/心心 | `playlist_hymns.hymn_id` 外鍵、分享行 id | 改名**唔影響**任何連結同收藏 |
| 前端 | `getDisplayTitle()` = `display_title \|\| title`,cache 咗嘅舊 payload 會自然過期 refetch | 改名後客戶端自動跟,唔使 OTA |
| Admin 手改 | PATCH `/api/admin/hymns/:id` 可以手改 `display_title`,有 `logs/admin-audit.log` 逐行 JSON | ⚠️ 重生 script 會冚走手改 — 見 §5 風險 R1 |

**結論:改 `display_title` 係低連鎖反應操作。真正要小心嘅係(a)清理規則本身寫錯、(b)冚走 admin 手改、(c)C 級嘅「同曲異名合併」諗頭。**

---

## 2. 全庫統計(2026-08-21 掃描)

### 2.1 殘留雜訊(清理器而家漏咗嘅)

| 模式 | 首數 | 例子 |
|---|---:|---|
| 顯示名 >40 字(過長) | 1,824 | 「神大愛God's Magnificent Love (現場版) 禱告更新2025AGWMM Official Live」 |
| 【】方頭括號 | 1,629 | 「【天父總會看顧】HK 齊唱兒歌6 兒童詩歌」 |
| 《》書名號(多數係專輯名) | 776 | 「智慧的人《創作專輯之六 弦外之歌》片長:3分11秒」 |
| 「\|」pipe 分隔殘留 | 666 | 「Promises \| Music \| TRIBL」 |
| 「Live」字樣(多數係 org 演唱會殘留,唔係版本標記) | 630 | 「玻璃海 Live Worship MV」 |
| 專輯字眼(「專輯」/「Album」) | 527 | 「愛的保證 (重投豐盛專輯)」 |
| feat./ft. | 422 | 「十字架 (feat. 孫耀威)」 |
| 「官方/歌詞版/完整CD版」殘留 | 292 | 「看見憐憫 - 齊唱兒歌2020 (官方完整CD版)」 |
| Official/Lyric/MV 英文殘留 | 241 | 「一首讚美的詩歌 / Lyric HD 粵語詩歌」 |
| cover/翻唱標記 | 231 | 「等候神 - Covered by 應許之地敬拜團」 |
| 年份(20xx) | 245 | 「下雨天的平安…禱告更新2024AGWMM Official Live」 |
| 語言版本標記(粵語版/國語版/Cantonese…) | 208 | 「我的生命獻給祢 (粵語版 - 官方譯本)」 |
| emoji/裝飾符號 | 97 | 「🎉🎉 詩歌~竭力稱頌耶和華 🎉🎉」 |
| 英文兒歌行銷尾巴(with lyrics/Kids Worship…) | 93 | 「I've Got A River Of life (with lyrics)」 |
| 串燒 medley(3+ 個「/」) | 85 | 「那些年,我們一起唱的歌 \|: 除祢以外 / 注目看耶穌 / …」 |
| **「HK」孤兒殘留(cleaner bug:剝「HKACM」時食咗「ACM」剩返「HK」)** | 54 | 「【我渴想 / THIRST】HK -「我的渴想…」」 |
| 通用「詩歌」前/後綴 | 33 | 「一首讚美的詩歌 / Lyric HD 粵語詩歌」 |
| 行頭 track number | 30 | 「05 耶和華的心」 |
| 引號包住全名 | 27 | 「'不是我,是基督住我心'」 |
| org 名殘留喺歌名度 | 26 | 「泥土音樂 最適合安靜聆聽的詩歌…」 |
| CD/DVD 字眼 | 17 | 「神的帳幕在人間 (CD Version)」 |
| 片長/時間文字 | 17 | 「智慧的人《…》片長:3分11秒」 |
| hashtag「#」 | 16 | 「《活水的江河》 l Living Water #原創歌曲 #敬拜詩歌…」 |
| 細楷「l」扮 pipe | 7 | 同上例 |
| 4K/HD/UHD | 6 | 「The Heralders 晨曦盼望 Dawn of Hope (4K UHD)」 |
| KTV/伴奏 | 2 | 「為祂試愛 (KTV)」 |

註:`display_title == title`(即清理器完全冇縮到)有 1,095 首,其中 355 首仲有明顯雜訊 — 呢啲係規則擴充嘅主要目標群。

### 2.2 標點/格式唔一致

| 模式 | 首數 |
|---|---:|
| 全形驚嘆/問號/冒號/分號(!?:;) | 185 |
| 全形括號() | 166 |
| 「」引號 | 154 |
| 全形逗號(,) | 100 |
| 全形英數字(日文歌名嗰批) | 9 |
| 連續孖空格 | 2 |
| 全形空格 U+3000 | 1 |
| 行頭行尾空白 | 0(清理器已 trim,✅) |

### 2.3 版本標記寫法變體(同一意思幾種寫法)

| 意思 | 變體分佈 |
|---|---|
| 現場版 | 「Live」無括號 599 /「(Live)」31 /「(現場版)」34 /「現場版」無括號 10 |
| 合作歌手 | feat./ft. 無括號 401 /「(ft. X)」11 /「(feat. X)」8 |
| 粵語版 | 無括號 122 /「(粵語版)」4 |

(「Live 無括號」599 首入面大部分其實係 org 實況專輯殘留,唔係真版本標記 — 處理時要分開對待。)

### 2.4 雙語歌名一致性(中文歌 5,711 首:國語 3,836 + 粵語 1,875)

| 格式 | 首數 |
|---|---:|
| 中文名 + 英文對照(「平安 Peace」式) | 4,077 |
| 純中文名 | 1,503 |
| 中文歌但顯示名純英文 | 130 |

另外 `title_en` 欄位得 51 首有值 — 雙語資訊而家幾乎全部塞喺 display_title 一條 string 度。

### 2.5 疑似重複(normalize 後歌名完全相同)

- 370 組 / 覆蓋 781 首
- 其中 330 組係**同 org 內重複**(多數係同一首歌唔同錄音/唔同片,例:611 兩條「將天敞開」)
- 40 組跨 org(例:「恩典太美麗」ACM vs 團契遊樂園;「盡情的敬拜」角聲 vs 611)— 呢啲係**唔同錄音版本,係合理並存**,唔係數據錯誤

---

## 3. 問題分類清單

**P1 清理器殘留(regex 漏網)** — 【】/《》/pipe/官方字眼/album 尾巴/年份/emoji/hashtag/track number/引號/org 名/HK 孤兒 bug。純機械可修。

**P2 標點全半形混用** — !?:;,() 全形 vs 半形冇統一;英文歌名同中文歌名混排時空格唔一致。

**P3 版本標記寫法唔統一** — Live/現場版/feat./ft./粵語版各有幾種寫法,冇標準格式。

**P4 雙語歌名政策未定** — 71% 中文歌帶英文對照、26% 冇;`title_en` 欄位近乎荒廢。係「保留喺 display_title」定「拆去 title_en」未有政策。

**P5 同曲多版本命名** — 同 org 內 330 組同名(合理:唔同錄音),跨 org 40 組。而家 UI 冇任何區分(版本/年份/專輯),用戶見到兩行一模一樣嘅名。

**P6 過長歌名** — 1,824 首 >40 字,UI 卡片/播放器一定截斷,好多時截走咗真歌名以外先至係雜訊。

---

## 4. 風險分級方案

### A 級 — 低風險,純機械,可自動化(建議即做)

原則:**繼續守「只刪唔加 + 唔會清空」紅線**(清空即 fallback 原名),全部改動經 `cleanDisplayTitle()` 規則層,唔係逐首 SQL。

1. 修「HKACM→HK」孤兒 bug(54 首)— artist alias 排序問題,長串先匹配。
2. 擴充 DECORATIVE_PHRASES:`with lyrics`、`kids worship`、`dance-a-long`、`sing-a-long`、`4K/UHD/HD/1080p`、`官方完整CD版`、`官方動作版`、`官方譯本`、`片長X分X秒`、`CD Version`、`DVD`、`KTV`、`Official Live`、`Lyric HD` 等(覆蓋 §2.1 好大部分)。
3. 刪 hashtag 段(`#xxx` 至句尾/下一分隔,16 首)、刪 emoji/裝飾符(🎉♫✦ 等,97 首)、刪行頭 track number(`^\d{1,2}[\s.、]`,30 首)、刪細楷「l」分隔(7 首)。
4. 空白統一:孖空格壓一格、U+3000 轉半形空格(3 首)。
5. 剝走「包住全名」嘅引號對(27 首)。
6. 尾巴年份+系列殘留(「禱告更新2025AGWMM Official Live」式)— 以 org-scoped phrase 逐個 org 加(AGWMM/讚美之泉 (數字) 等),唔做通用「見年份就刪」(年份有時係歌名一部分)。
7. 懸空分隔符清理:行頭行尾嘅 `- | / ~ :` 殘留(規則跑完之後嘅 second pass,而家清理器已有雛形)。

執行方式:改 `lib/displayTitle.js` → `regenerateDisplayTitles.js --dry-run` 出 diff 報告 → 抽查 → 正式跑。預計波及 ~2,000-2,500 首。

### B 級 — 中風險,規則+人手抽查(分批做,每批出 diff 俾人掃一眼)

1. **全形→半形標點統一**(!?:;,() 共 ~450 首)— 機械上簡單,但「聖哉!聖哉!聖哉!」呢類全形驚嘆號喺中文歌名入面**可能係想要嘅**。要先拍板政策(§6 Q1),先好郁。
2. **版本標記統一格式** — 建議標準:`歌名 (Live)` / `歌名 (粵語版)` / `歌名 (feat. X)`,半形括號、半形空格。涉及改寫(唔淨係刪),**突破「只刪唔加」紅線**,所以要逐批人手抽查;feat 嗰 422 首建議只統一括號寫法、唔刪(歌手資訊有用)。
3. **【】/《》/「\|」拆解** — 【歌名】式(1,629 首)可以規則化剝括號淨返內容;《》要分「專輯名(刪)」vs「歌名本身用書名號(保留內容)」兩種 case;pipe 段要判斷邊段係歌名。呢三類規則能力所及,但 edge case 多,必須 org 批次 + 抽查。
4. **medley 串燒名**(85 首)— 建議保留頭一/兩首歌名 +「(組曲)」,人手過一次清單。
5. **org 名殘留**(26 首)+ 通用「詩歌」前後綴(33 首)— 數量細,直接出清單人手斷。

### C 級 — 高風險,唔建議大規模自動改(獨立決策)

1. **跨 org / 同 org 同名歌「統一命名」或合併**(370 組)— 佢哋係唔同錄音,合併會影響清單/心心/歌詞綁定,**唔好做**。如果想 UI 分得開,正路係喺 UI 層加副標(org/專輯/年份),唔係改名。
2. **改原始 `title` 欄** — 永遠唔做。search、dedup、加歌匹配、歌詞 pipeline 全部靠佢。
3. **雙語名拆去 `title_en`** — 4,000+ 首自動拆中英邊界,錯一單就係錯歌名;而且 UI 未有地方顯示 title_en。除非有 UI 需求,建議唔做住(政策 §6 Q2)。
4. **逐首人手改名做「標準名」**(對齊詩集/版權方官方名)— 6,000 首人手工程,同歌詞複核衝突爭產能,唔建議依家開。

---

## 5. 風險同緩解(Eric 特別提嘅嗰啲)

| # | 風險 | 實況 | 緩解 |
|---|---|---|---|
| R1 | **重生 script 冚走 admin 手改** | audit log 實查:13 次 edit,涉 display_title 嘅 7 次,除去測試行**真手改得 ~3 首** | 重跑前由 `logs/admin-audit.log` 抽返手改過 display_title 嘅 id 做 skip-list;中期方案:加 `display_title_locked` flag(admin 改過自動 set,regen 跳過) |
| R2 | 搜尋搵唔返 | `routes/search.js` 同時搜 `title` + `display_title`,原始 title 唔郁 | 無需額外動作;regen 後跑一輪 smoke query(舊寫法+新寫法各搜幾首) |
| R3 | 分享連結/清單/心心失效 | 全部行 `hymn_id` 外鍵,唔靠名 | 無風險 |
| R4 | 客戶端 cache 舊名 | 前端 fallback `display_title \|\| title`,refetch 自癒 | 純顯示層短暫唔一致,可接受;唔使 OTA |
| R5 | 歌詞 pipeline / album backfill 靠名匹配 | backfill scripts 主要行 youtube_id / id;**執行前要 grep 確認**冇 job 靠 display_title 匹配 | 開工前加一步 audit(半個鐘內做完) |
| R6 | Script 寫 DB 同跑緊嘅 job 相撞 | `regenerateDisplayTitles.js` 已行 `acquireDbLock()`(符合 hymns.db 寫操作鐵律) | 照舊行 lock;避開夜晚排程時段跑 |
| R7 | 改完 DB 但 backend 未見到 | 同 oneoff delist 一樣,跑完 script 要 backend restart 先出街 | 跟 deploy gate 流程;⚠️ 而家 gate 卡住緊(BATCH7 收貨中),要排隊或者等 gate 清咗先推 |
| R8 | 規則寫錯導致錯名 | 「只刪唔加」紅線下最壞係冇縮到;B2(版本標記改寫)係唯一突破紅線位 | 每批必出 before/after diff CSV;DB 先 backup;B2 批次人手全掃(唔係抽查) |

**回滾方案**:每次 regen 前 `cp hymns.db hymns.db.bak-title-norm-<date>`;diff CSV 入 repo;因為 `title` 不動,就算規則出事,rollback = 用舊版 `lib/displayTitle.js` 重跑一次即可,零數據損失。

---

## 6. 要 Eric 拍板嘅政策問題

- **Q1 全形標點**:中文歌名內嘅全形 !?, 統一轉半形,定係「中文名保留全形、英文名用半形」?(建議:淨係統一**括號**做半形,句內標點跟語言,騷擾最細)
- **Q2 雙語名**:維持「中文 English」一條 string(現狀,71% 已係咁),定係長遠拆 `title_en`?(建議:維持現狀,拆欄係大工程冇 UI 收益)
- **Q3 版本標記標準**:接唔接受 B2 突破「只刪唔加」紅線,統一做 `歌名 (Live)` / `歌名 (粵語版)` 格式?(接受先做 B2,唔接受就只刪唔改寫)
- **Q4 做到邊級**:淨做 A(即刻有感,零爭議)?A+B(全庫觀感統一,要人手抽查產能)?C 級維持唔做(建議)。

---

## 7. 建議執行步驟(拍板後)

1. **Phase 0 — 工具準備**(半日):R5 依賴 audit;整 `--diff-csv` 輸出模式(id, org, before, after);由 audit log 生成手改 skip-list。
2. **Phase 1 — A 級**(1 日):改 `lib/displayTitle.js` 規則 → dry-run 全庫 diff → 抽查(每個受影響 org 抽 10 首)→ backup → 正式跑 → smoke search → 排隊 deploy gate restart。
3. **Phase 2 — B 級**(分 3-4 批,每批 1 日):按 org 分批(先 ACM/讚美之泉/AGWMM 呢啲大戶),每批 diff CSV 人手掃 → 跑 → 驗。B2 版本標記批人手全掃。
4. **Phase 3 — 收尾**:剩返嘅雜項清單(org 名殘留/medley/詩歌前綴)逐首人手斷;寫 SUPERVISION-LOG 記錄;考慮加 `display_title_locked` 欄位入 schema。
5. **持續**:新歌入庫本身行 `cleanDisplayTitle()`,規則改善自動惠及以後新歌,唔使再做第二次大掃除。

---

*本文件只做分析規劃;所有數字可用 scratchpad 掃描 script 重現。未有任何 DB 寫操作。*
