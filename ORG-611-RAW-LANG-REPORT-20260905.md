# 611 RAW 追蹤 + 3 首補源 + 逐首語言判定（2026-09-05）

Eric 拍板三件事(611 相關)執行報告。

## T1 — @611RAW 正式追蹤

### 體檢

`node backend/scripts/auditChannel.js --channel @611RAW --name "611 RAW" --depth 60`
(channel_id `UCQIeW751tSyX7H_OdsHfuWQ`,已用 yt-dlp metadata 核對
`uploader_id=@611RAW` 冇撞錯 handle):

| 指標 | 數值 | 判定 |
|---|---|---|
| 帶內(75-600s)% | 21.7% | REJECT(<30%) |
| blocklist 命中% | 18.3% | — |
| 標題正面訊號% | 0% | — |

隨機 10 條眼證:代禱勇士見證、守望神國禱告會、我是被救的｜代禱者，加油！、
俯伏的敬拜、看見列國系列(馬達加斯加/維得角/日本 Hesed611/哥斯達黎加 等)。

⚠️ **同上一份報告(ORG-611-CATALOG-REPORT-20260905.md §8 Q1)嘅原始印象唔同**:
深挖之後,呢個頻道實際內容係**代禱者/守望禱告會/「看見列國」列國先知性內容
為主**,唔係一個「官方單曲歌詞版MV頻道」。之前已知嘅 2 首(【井啊！湧出水來】
【我的唯一】,歌詞版MV/Lyrics MV)係頻道入面嘅少數例外,唔係主力產出。

### worshipGroups.js entry(已加,冇 commit)

跟指示,org 跟 Church 611 保持一致(而唔係開獨立 org),entry 名 `611 RAW`,
`channel: '@611RAW'`。因為係 REJECT 級,跟 `Asia for JESUS`/`台北復興堂` 一樣嘅
政策加 `tier1Exclude: true`(防止夜晚 Tier1 自動掃入禱告會/見證片),
`contentGate: 'duration+title'` + `catalogAllowlist: 'church611-org-catalog.json'`
兩條路徑保留(「歌詞版MV/Lyrics MV」呢類極少數真.歌片嘅安全網)。
`durationCapSec` 冇加(已知 2 首 131s/437s 跌喺全局預設 75-600s 帶入面,唔使
override)。詳細 rationale 見 `backend/data/worshipGroups.js` Church 611 entry
下面新加嘅 comment block。

⚠️ `backend/data/worshipGroups.js` 呢個檔案另一個 session 有 61
insertions/18 deletions 嘅未 commit 改動一直喺 working tree(2026-08-01
提速方案A)。呢次淨係用 Edit 喺 Church 611 entry 後面插入新 entry,冇 git
commit,兩份改動並存喺 working tree,唔會互相影響。

### 一次性 scan(budget≤80,sequential)

`node backend/scripts/oneoff-scan611RAW-20260905.mjs --dry`
(用 `channelScan.js` 嘅 `scanChannelListing`+`channelLanguageSanityCheck`+
`validateChannelCandidates` 同一套 pipeline):

- listing 398 條 fresh(已收錄嘅 2 首唔喺入面)
- outcomes breakdown:`skip-duration` 367、`skip-title-signal` 27、
  `skip-quality` 4
- **candidates = 0**(冇一條撞中 catalogAllowlist 官網目錄,亦冇一條過到
  `duration+title` 兩層)

**入庫數:0**(dry-run 已經證實真寫都係 0,冇再重覆行一次燒 YouTube 額度)。
呢個結果同體檢判斷一致——頻道入面已知嘅 2 首單曲已經之前收咗,再冧唔到
第三首。

## T2 — 3 首「有歌詞冇片」補源

目標(`ORG-611-CATALOG-REPORT-20260905.md` §2 尾段):

1. 昂首高過四面仇敵(2026普珥節Sc9)——詞曲:陸美君、梁宇安
2. 上行之詩——詞曲:Stella Luk
3. 以賽亞書61章11節——詞曲:劉耀基、王京君

### 搜尋

逐首 `ytsearch5:"<歌名> 611"` + `ytsearch5:"<歌名> 靈糧堂"`,再加開:
- 逐首補多輪 `<歌名> <作曲人名>`(陸美君/梁宇安/Stella Luk/劉耀基/王京君)
- 「以賽亞書61章11節」補一輪歌詞開頭句「好像新郎戴上華冠」
- 「上行之詩」補一輪淨歌名(呢個係詩篇 Song of Ascents 嘅常見中文譯名,
  好多唔同堂會/團體各自作過同名歌,預期會有好多撞名假陽性)

### church611.org 官網 detail page 復查

三條 detail page 逐條 curl 重新攞(識別性 UA),搵咗 YouTube embed/Vimeo/
SoundCloud/Facebook video/直接 mp3 連結——**三條 page 都冇任何audio/video
embed**,淨係「🎼下載歌譜」(歌譜下載,行為似係登入/JS觸發,冇直接 href)+
歌詞 excerpt。三條都係「純歌詞/歌譜貼文」,church611.org 本身結構上就冇
放呢 3 首嘅錄音。

### 結果:三首都搵唔到

| 歌名 | 搜尋結果 | 判定 |
|---|---|---|
| 昂首高過四面仇敵 | 撞到嘅全部係第三方講道/靈修片(Abundant Life Church/頭份靈糧堂 等),標題唔 exact match,亦冇一條提到「611」 | 冇音源 |
| 上行之詩 | 撞到多個**同名唔同版本**(TJC 官方MV/原始和聲/台北靈糧堂聯合崇拜 Live/各各他 Messianic 版),全部唔係 611靈糧堂 出品,人手核對描述都冇提611 | 冇音源 |
| 以賽亞書61章11節 | 撞到 Church 611 自己嘅晨禱/聖經演繹比賽片(講道/短劇,唔係呢首歌本身)+ 第三方「以賽亞書61章7下-11節」經文詩歌(生命水河詩歌出品,唔同作曲人、唔同經文範圍) | 冇音源 |

三首人手核對:候選標題冇一條 exact match「歌名 + 611」提及,亦冇一條係
611靈糧堂本身出品嘅同名歌。**結論同上一份報告一致——三首純粹官網歌詞/
歌譜貼文,YouTube 冇對應錄音,建議 Eric 睇下官網「下載歌譜」按鈕背後有冇
連埋官方音檔(呢個要登入/人手撳先知,唔喺呢次搜尋範圍),或者 Eric 有其他
管道(教會內部錄音/CD)可以補音源。**冇寫 DB。**

## T3 — 逐首語言判定

### 🔴 方法論重大限制(執行前 calibrate 就撞到,詳細記錄先過任務原意)

任務原意假設 whisper 語言自動偵測可以分 yue(粵語)/zh(國語)/en(英文)。**實測
證實呢個假設錯——兩個裝咗嘅 whisper.cpp model 都分唔到粵語同國語**:

1. `ggml-medium.bin`(呢個庫原有,fetchLyrics/alignBackfill 用緊嗰個)—— 對
   一段已知粵語(Church 611 RAWship)嘅 60 秒 clip 跑 `-l auto -dl`:
   `auto-detected language: zh (p = 0.980468)`。**冇 "yue" 呢個選項出過。**
2. 為咗排除「舊 model 太細唔識分」呢個可能性,**額外落載** `ggml-large-v3-
   turbo-q5_0.bin`(574MB,量化版,vocab 包 yue token,`backend/models/`
   已經 gitignore `*.bin` 唔會入 git)重試同一段 clip:**仍然係 "zh"
   (p=0.994633),冇偵測到 yue**。
3. 強行 `-l yue`(forced,唔係 auto)transcribe 同一段 —— 質素明顯跌:
   forced-zh 出「在你裡面 我深渴望 不被動揚 不被承諾」(尚算連貫),
   forced-yue 出「不被被被被 被被被被 被讓讓」(重覆幻覺),證實 yue
   喺呢個 model 度**唔係一個訓練好嘅 decoder mode**,forced 用會質素倒退,
   唔可以攞嚟做訊號。
4. 追加**內容層面**嘅輔助偵測:喺 zh 轉錄文字度掃粵語專屬語氣助詞
   (嘅/唔/冇/喺/佢/哋/咗/嚟/咁/啲/嘢/乜/嗰/畀/俾)。正控實測(見下面)
   **10/10 全部 0 命中**——包括已知係 CantonHymn 粵語 cover 嘅歌。原因:
   詩歌歌詞書面文字通常用標準中文,唔管唱嘅時候發音係粵定國,呢個係
   結構性限制,唔係工具寫錯。

**結論:whisper(呢部機嘅設備)可以準確分「中文 vs 英文」,但分唔到
「粵語 vs 國語」。** 呢個唔係實作 bug,係呢代 whisper model 訓練資料/
decoder 能力嘅結構性限制,加大 model 都改變唔到。

### 正控(方法論驗證)

跑同一套 pipeline 落 10 首已知答案嘅歌(3 首 CantonHymn 明知粵語 cover、
611 Worship/讚美之泉 明知國語共 7 首):

| id | 歌名 | org | 已知語言 | whisper偵測 | 助詞命中 | 結果 |
|---|---|---|---|---|---|---|
| 3002 | 祢比這一切更美麗(CantonHymn) | CantonHymn | 粵語 | zh, p=0.47 | 0 | 沿用(冇助詞證據) |
| 3040 | 恩雨滔滔(Cantonese Cover) | CantonHymn | 粵語 | zh, p=0.95 | 0 | 沿用 |
| 3350 | 禱告的殿(廣東話版) | CantonHymn | 粵語 | zh, p=0.94 | 0 | 沿用 |
| 3573 | 持續禱告 - FBI | CantonHymn | 粵語 | zh, p=1.00 | 0 | 沿用 |
| 3503 | 新酒湧流 | 611 Worship | 國語 | zh, p=1.00 | 0 | 沿用 |
| 3756 | 愛到底 | 611 Worship | 國語 | zh, p=0.99 | 0 | 沿用 |
| 3776 | 來慶賀+來高聲唱 | 611 Worship | 國語 | zh, p=0.99 | 0 | 沿用 |
| 4171 | 有你在的地方 | 讚美之泉 | 國語 | zh, p=0.83 | 0 | 沿用 |
| 5298 | 天父的孩子 | 讚美之泉 | 國語 | zh, p=0.97 | 0 | 沿用 |
| 5957 | 感謝天父 | 讚美之泉 | 國語 | zh, p=0.91 | 0 | 沿用 |

10/10 全部「zh + 0 個粵語助詞命中」,**同已知答案(3 粵 7 國)完全冧唔到
任何分野**——助詞掃描對真.粵語同真.國語嘅輸出一模一樣(都係 0),證實
呢條輔助訊號喺呢個場景**零區分力**,唯一安全用法係「冇撞到就沿用現有
lang」(唔會做錯決定,但都幫唔到手判斷)。

⚠️ 額外觀察(唔係正式結論,記低俾以後參考):CantonHymn 樣本嘅轉錄文字
傾向用繁體字、611 Worship/讚美之泉樣本有部份用簡體字——但唔一致(611
Worship 3503 一半繁一半簡),證實「繁簡傾向」都唔係可靠訊號(讚美之泉
本身係台灣事工,國語但用繁體,會撞埋一齊)。

### 全庫執行(65首,`node backend/scripts/classifyLangByWhisper.js --org "Church 611" --dry`)

每首:60秒clip由30%位置開始 → whisper `-l auto -dl` 判中/英 → 中文再
`-l zh` 轉錄 + 幻覺偵測(重覆句/字幕組等已知幻覺指紋) → 幻覺就換 60%
位置再試,再唔得就換 15%位置。全部用完 3 個 offset 都攞唔到有效語音就
標「要人手」。每首處理完即刻 rm 臨時音訊(`_16k.wav`),download 中途
intermediate `.webm`/`.part` 一併清(收工前發現 15 個殘留 part 檔,已經
`find -delete` 清晒,見下面「衛生」段核對)。

**分佈:**

| 結果 | 數量 | 說明 |
|---|---|---|
| 偵測到英文,高信心(候選,未寫DB) | 6 (9.2%) | 見下表,建議人手confirm先寫 |
| 中文但助詞證據不足,沿用現有(粵語) | 57 (87.7%) | 全部標「要人手」(粵/國分唔到) |
| 三個offset都攞唔到有效語音 | 2 (3.1%) | 9056/9070,要人手 |

**6 首偵測到英文內容(候選,建議 Eric/人手 confirm 先真寫 DB)：**

| id | 標題 | prob | offset | 備註 |
|---|---|---|---|---|
| 9055 | Shekinah榮耀 Shekinah Glory | 0.703 | 30% | 信心中等(剛過0.6門檻),標題本身雙語 |
| 9062 | See A Victory | 0.825 | 30% | 標題全英,信心高 |
| 9067 | 更深呼求 | 0.948 | 30% | ⚠️見下面警示——標題純中文,冇英文別名 |
| 9069 | Only You Can Satisfy | 0.936 | 30% | 標題全英,信心高 |
| 9079 | The More I Seek You | 0.971 | 30% | 標題全英,信心高 |
| 9089 | WayMaker | 0.981 | 60% | 標題全英,信心高(WayMaker本身係國際知名英文敬拜歌) |

⚠️ **9067 值得特別注意**:標題「更深呼求｜現場敬拜 Live Worship｜611
Worship」係純中文歌名,冇英文別名,但偵測到英文內容 p=0.948。同一個
歌名(《更深呼求 Deep Cries Out》,id=9074,唔同一條片/唔同晚錄影)喺
本次執行判返中文(inconclusive)。**呢個唔一定係錯**——RAWship 系列
係*連續多首歌一條片*嘅現場敬拜錄影,同一首歌喺唔同晚崇拜可能有英文
版同中文版輪流唱(常見雙語敬拜安排),9067 可能真係嗰晚用咗英文版。
但**都可能係取樣噪音**——60秒clip 抽中嘅未必係「呢條片個標題代表嘅
首歌」,因為一條片可以連做多首歌,30%位置could 撞正另一首歌或者主
持人講嘢。**建議寫DB前人手聽返呢一條片嘅30%位置(youtube_id見
church611_list,可以自己搵)先confirm,唔好盲信。**

**其餘 4 首英文候選(9055/9062/9069/9079/9089)標題本身已經係全英文
歌名**,同偵測結果一致,信心相對高,但**仍然建議人手掃一眼先寫**——
按任務指示「先出對照表俾我睇,再寫入」,呢份報告就係嗰張對照表,
**呢次執行冚唔到 `--dry` 之外嘅真寫**,等 Eric/下一手 review 完先跑:

```
node backend/scripts/classifyLangByWhisper.js --org "Church 611"
```

(冇 `--dry` 就會經 `acquireDbLock('classify-lang-whisper')` 真寫,只寫
`有變動` 嗰批,而家仲有 9067 呢個要格外核實嘅個案,建議跑之前手動剔走
或者人手聽真先過)。

**完整 65 首對照表**(全部原本 lang 都係「粵語」,冇一首本身已經係其他值):

| id | 標題(截) | 新判定 | prob | method |
|---|---|---|---|---|
| 9040 | Kingdom Artist Stage Play | 粵語 | 0.997 | inconclusive@30% |
| 9041 | Get Set Launch | 粵語 | 0.995 | inconclusive@30% |
| 9042 | 樹 (Tree) | 粵語 | 0.995 | inconclusive@30% |
| 9043 | 祢名何其深廣 | 粵語 | 0.996 | inconclusive@30% |
| 9044 | Revival Worship Night XIX | 粵語 | 0.989 | inconclusive@60% |
| 9045 | COUNTDOWN 2025 WORSHIP NIGHT | 粵語 | 0.995 | inconclusive@60% |
| 9046 | Revival Worship Night XVIII | 粵語 | 0.915 | inconclusive@30% |
| 9047 | Singing loudly | 粵語 | 0.995 | inconclusive@30% |
| 9048 | Did you feel the mountains tremble? | 粵語 | 0.990 | inconclusive@30% |
| 9049 | Revival Worship Night XVII 敬拜 | 粵語 | 0.990 | inconclusive@60% |
| 9050 | How deep and wide is your name | 粵語 | 0.993 | inconclusive@30% |
| 9051 | 展開清晨的翅膀 | 粵語 | 0.808 | inconclusive@30% |
| 9052 | Revival Worship Night XVI | 粵語 | 0.969 | inconclusive@30% |
| 9053 | A Loving Father | 粵語 | 0.949 | inconclusive@30% |
| 9054 | Holy Spirit, we welcome You | 粵語 | 0.997 | inconclusive@30% |
| 9055 | Shekinah榮耀 Shekinah Glory | **英文(候選)** | 0.703 | whisper-auto@30% |
| 9056 | Revival Worship Night XVII 敬拜 | 粵語 | n/a | all-offsets-failed⚠️要人手 |
| 9057 | 雅歌 Song of Songs | 粵語 | 0.966 | inconclusive@60% |
| 9058 | Revival Worship Night XV | 粵語 | 0.987 | inconclusive@30% |
| 9059 | Full of Power | 粵語 | 0.992 | inconclusive@30% |
| 9060 | More Than Conqueror | 粵語 | 0.969 | inconclusive@30% |
| 9061 | 向我神 | 粵語 | 0.957 | inconclusive@30% |
| 9062 | See A Victory | **英文(候選)** | 0.825 | whisper-auto@30% |
| 9063 | Revival Worship Night XIV | 粵語 | 0.982 | inconclusive@30% |
| 9064 | The Lord's Joy is My Strength | 粵語 | 0.983 | inconclusive@30% |
| 9065 | We welcome the King's arrival | 粵語 | 0.987 | inconclusive@30% |
| 9066 | Won't Stop Praising | 粵語 | 0.996 | inconclusive@30% |
| 9067 | 更深呼求 | **英文(候選,⚠️見上面警示)** | 0.948 | whisper-auto@30% |
| 9068 | The Lord's Joy is My Strength | 粵語 | 0.973 | inconclusive@30% |
| 9069 | Only You Can Satisfy | **英文(候選)** | 0.936 | whisper-auto@30% |
| 9070 | Revival Worship Night XIII | 粵語 | n/a | all-offsets-failed⚠️要人手 |
| 9071 | 新酒 New Wine | 粵語 | 0.992 | inconclusive@30% |
| 9072 | Revival Worship Night XII | 粵語 | 0.797 | inconclusive@60% |
| 9073 | Holy Forever | 粵語 | 0.992 | inconclusive@30% |
| 9074 | 更深呼求 Deep Cries Out | 粵語 | 0.980 | inconclusive@30% |
| 9075 | You are the King of Glory | 粵語 | 0.994 | inconclusive@30% |
| 9076 | 揚聲唱哈雷路亞 Raise A Hallelujah | 粵語 | 0.994 | inconclusive@30% |
| 9077 | Revival Worship Night XI | 粵語 | 0.989 | inconclusive@30% |
| 9078 | 你同在如天堂降臨 | 粵語 | 0.726 | inconclusive@60% |
| 9079 | The More I Seek You | **英文(候選)** | 0.971 | whisper-auto@30% |
| 9080 | Revival Worship Night IX | 粵語 | 0.976 | inconclusive@60% |
| 9081 | 恩雨降臨 | 粵語 | 0.962 | inconclusive@30% |
| 9082 | Revival Worship Night VIII | 粵語 | 0.981 | inconclusive@60% |
| 9083 | 如鹿切慕溪水 As The Deer | 粵語 | 0.731 | inconclusive@30% |
| 9084 | 祂是笑臉幫助我的神 | 粵語 | 0.667 | inconclusive@30% |
| 9085 | Tree | 粵語 | 0.915 | inconclusive@30% |
| 9086 | Revival Worship Night VII | 粵語 | 0.951 | inconclusive@60% |
| 9087 | 願天歡喜 Heavens Rejoice | 粵語 | 0.989 | inconclusive@30% |
| 9088 | 我們愛戴的王 Our Beloved King | 粵語 | 0.858 | inconclusive@30% |
| 9089 | WayMaker | **英文(候選)** | 0.981 | whisper-auto@60% |
| 9090 | 要稱謝耶和華 | 粵語 | 0.632 | inconclusive@30% |
| 9091 | Revival Worship Night VI | 粵語 | 0.516 | inconclusive@60% |
| 9092 | 奉主名來的是應當稱頌的 | 粵語 | 0.267 | inconclusive@30% |
| 9136 | 我心所倚靠 | 粵語 | 0.956 | inconclusive@30% |
| 9137 | JEHOSHUA 2022 | 粵語 | 0.787 | inconclusive@30% |
| 9138 | 誰像耶和華我的神呢 | 粵語 | 0.587 | inconclusive@30% |
| 9139 | 主禱文 | 粵語 | 0.967 | inconclusive@30% |
| 9140 | 以祢慈愛引領我 | 粵語 | 0.971 | inconclusive@30% |
| 9141 | 人算什麼 | 粵語 | 0.995 | inconclusive@30% |
| 9142 | 這是我主所定的日子 | 粵語 | 0.987 | inconclusive@30% |
| 9143 | 你看見了我 | 粵語 | 0.998 | inconclusive@30% |
| 9144 | 是你觸動我心 | 粵語 | 0.551 | inconclusive@60% |
| 9145 | 海邊的沙 | 粵語 | 0.993 | inconclusive@30% |
| 9146 | 井啊！湧出水來(611RAW) | 粵語 | 0.655 | inconclusive@30% |
| 9147 | 我的唯一(611RAW) | 粵語 | 0.954 | inconclusive@30% |

**有變動:6/65,冇一首寫入 DB(全部 dry-run)。**

### 「要人手」清單(3 種)

1. **9067** —— 偵測英文但標題純中文、同名兄弟片(9074)判中文,要人手聽
   真先confirm 係咪呢一晚真係唱英文版。
2. **9056、9070** —— 三個 offset(30%/60%/15%)全部攞唔到有效語音(幻覺
   或者下載失敗),要人手揀個位聽,或者接受「呢兩首暫時判唔到,沿用
   粵語」。
3. **其餘 57 首「粵/國分唔到」** —— 呢個唔係「呢個工具做得唔好」,係
   結構性限制(見上面正控),要人手真正聽發音先可以實錘粵定國。Church
   611 頻道層面推斷(zh-HK caption/自我介紹雙語 Cantonese 為主)保持
   `粵語` 冇改。

### 產出:可重跑工具

`backend/scripts/classifyLangByWhisper.js` —— 支援 `--org`/`--ids` +
`--dry`,可重跑(讀現有 `lang` 做 baseline,只有偵測到高信心英文先算
「有變動」)。冇加 launchd 排程(任務要求等 Eric 判斷會唔會定期跑)。

⚠️ 呢個 script 對「粵/國」分類**本質上係一個永遠回傳「沿用現有值」嘅
函數**(因為冇可靠訊號),唔好誤會佢會自動判到粵/國——佢真正有用嘅
產出係「英文 vs 中文」呢一刀,同「邊幾首要人手聽」嘅清單。

## 收工衛生核對

- scratchpad 音訊全部已刪(執行中段檢查發現 15 個殘留 `.webm.part`——
  部份下載中途失敗嘅 offset attempt 冇入到 finally 清理,已用
  `find ... -delete` 一次性清晒,`find` 核對輸出為空):
  ```
  find $SCRATCH \( -iname "*.wav" -o -iname "*.webm*" -o -iname "*.part" \)
  (冇輸出)
  ```
- 冇部署、冇 restart backend、冇起第二個 server.js
- 三個 T1/T2/T3 全程冇改動任何已寫入嘅 hymns_all 資料(T1 candidates=0、
  T2 冇音源冇寫、T3 全部 `--dry`)
- `backend/data/worshipGroups.js` 淨係用 Edit 加咗兩段(Church 611 note
  補充 + 新加 611 RAW entry),另一 session 嘅 61-insertion 改動完整保留
  喺 working tree,冇 commit、冇碰佢
- `backend/models/ggml-large-v3-turbo-q5_0.bin`(574MB)已落載落
  `backend/models/`,`*.bin` 已經 gitignore,唔會入 git

## 總結 / 下一步要 Eric 判嘅嘢

1. **611 RAW entry 已開,一次性 scan 入庫 0 首**(頻道實際係代禱/禱告會
   內容,已知 2 首單曲之前已收)。要唔要保留 `tier1Exclude:true` 呢個
   保守做法(建議保留)。
2. **3 首「有歌詞冇片」確認冇音源**,church611.org 官網淨係歌詞/歌譜
   貼文。Eric 有冇其他管道(教會內部錄音/CD)?
3. **T3 核心發現**:whisper 呢代 model 分唔到粵語/國語,只能分中文/
   英文。65 首入面 6 首(9.2%)偵測到英文內容,**建議人手 review 呢 6
   首(尤其 9067)先真寫 DB**,真寫指令已備好(見上面)。其餘 57 首粵/
   國分唔到,`lang` 保持沿用頻道推斷(粵語)。
4. 如果 Eric 想要真.粵/國逐首判定,呢次執行證實**冇一個自動化方法做
   得到**——要人手聽,或者搵一個專門訓練過粵語/國語聲學分類(唔係
   語言辨識)嘅 model,現時裝嘅 whisper 兩個 model 都做唔到。

