# 純音樂類別 —— 更多貨源同更好識別方法規劃(MORE-SOURCES)

日期:2026-08-24
性質:**純規劃,呢個 session 冇寫過 DB、冇改過任何 code、冇入過任何歌。**
上游:`INSTRUMENTAL-CATEGORY-PLAN-20260821.md`、`INSTRUMENTAL-PHASE4-PLAN-20260824.md`、`backend/data/instrumental/T4-INVENTORY-20260824.md`
實查方法:read-only SELECT(`hymns.db`)+ `yt-dlp --flat-playlist`(零關鍵字,只列官方 channel 結構)+ iTunes Search API + WebFetch(sop.org)。所有數字除非明文標「估算」,全部係 2026-08-24 當日實查。

---

## §0 一頁摘要(俾 Eric)

T4 盤點話六個中文機構嘅 YouTube 頻道掘勻晒都係得 **15 首**新純音樂。呢份規劃書搵到點解,同埋搵到新路:

1. **啲貨一直都喺度,只係唔喺我哋望緊嗰格。** 好多機構嘅純音樂專輯**冇逐首上 YouTube 主頻道**,只係成張碟放咗上 Spotify / Apple Music 呢類串流平台。YouTube 會自動幫呢啲正式發行嘅專輯開一個「自動生成頻道」(叫 Topic channel),入面每首歌係一條獨立、播得嘅片 —— 我哋而家嘅工具**完全冇望過呢一格**。
2. **實測證明呢格有幾多貨**:淨係基恩敬拜一個機構,佢嘅自動生成頻道有 **109 首**鋼琴/結他純音樂單曲(9 張正式專輯),**一首都未喺我哋個庫**,而且全部 3-6 分鐘,啱晒現有規格。讚美之泉都有兩張 2022/2023 年嘅安靜演奏專輯(17 首)係頻道 playlist 搵唔到、只喺呢格先有。連鹹蛋音樂事工(香港粵語機構)都有 10 首鋼琴版單曲喺呢格。
3. **仲有一個免費專輯資料庫幫手把關**:Apple 嘅 iTunes 目錄 API 可以攞到每個機構官方發行過嘅所有專輯名同曲目數 —— 邊張係純音樂專輯一目了然,攞嚟做「呢首歌真係官方純音樂專輯出品」嘅多一重證明。
4. **合計保守估算**:行通呢條路,新增候選可以由 15 首升到 **150-250 首**(粵語都有份),唔使放寬任何你之前拍板嘅規矩(10 分鐘上限、唔收伴奏、唔收英文)照守。
5. **要你拍板嘅嘢**(詳見 §7):最主要一條係 —— YouTube 呢啲「自動生成頻道」嘅內容,算唔算「官方」?我哋建議算(佢係機構自己交俾唱片發行商嘅正式產品,唔係網友上載),但呢個係收歌原則,要你點頭先做。另外有幾個機構(ACM、鹹蛋、泥土音樂等)唔喺原本六個機構名單入面但實證有純音樂貨,收唔收都要你拍板。

---

## §1 現況同瓶頸:點解 T4 得 15 首

T4(2026-08-24)實數:六個中文 org 485 個 playlist 全列過 → 器樂 playlist 16 條、member 127、已喺庫 70、新片 57、過閘 2 得 **15 首**。三個根因(T4 已查明):① 70/127 早就收咗;② 新片 74% 係 55 分鐘–12 小時長合輯,俾 Q2 十分鐘上限擋(正確);③ 小羊嗰 11 條器樂 playlist 全部係伴奏帶(Q3 唔收,正確)。

**本規劃書補多一個結構性根因(今日實查先確認):**

> **而家個 discover 工具只望「頻道嘅 /playlists tab」**(`backend/scripts/discoverInstrumentalPlaylists.mjs:95`,fetch `https://www.youtube.com/<channel>/playlists`)。呢個 tab 只有**機構自己人手開嘅 playlist**。但 YouTube 仲有兩格佢完全冇望:
>
> 1. **`/releases` tab** —— 機構經唱片發行商出街嘅**正式專輯**,YouTube 自動生成嘅 `OLAK5uy_…` 專輯播放清單,每首 track 係獨立可播嘅片;
> 2. **Topic 自動生成頻道** —— 同上一格同源,發行商 feed 自動開嘅「<機構名> - Topic」頻道,載住全部 DSP 發行嘅 track。
>
> 機構出純音樂專輯嘅慣性正正係「淨出串流,YouTube 主頻道最多放條長合輯宣傳」—— 即係話**呢個歌種嘅單曲形態,主要住喺我哋冇望嘅嗰兩格**。基恩敬拜就係教科書級例子:主頻道得 1 條器樂 playlist(11 member),但 Topic 頻道有 109 首器樂單曲(§2.1)。

---

## §2 未查過嘅機構/來源盤點

### 2.1 🥇 Topic / releases 自動生成層(已實測,最大單一貨源)

| Org | 實查位置 | 實數 | 已喺庫 | 備註 |
|---|---|---|---|---|
| **基恩敬拜**(粵語) | Topic 頻道 `UCRo18xj7YjX-EEEhi7yjW1g`(509 條 track 全列) | **(Piano Version) 22 + (Guitar Version) 47 + (Instrumental…) 40 = 109 首** | **0** | 全部 156–395 秒,**109/109 喺 120-600 band 內**。對應 iTunes 上 9 張專輯:Amazing Guitar 1-4(7/13/13/14 首)、Amazing Piano 1-2(12/10)、靜默有時 1-3(15/13/12),合計啱啱 109 首 |
| **讚美之泉**(國語) | 主頻道 `/releases` tab(72 張 release 全列) | 13 張器樂專輯全部有 OLAK 清單;實測其中兩張最新:**安靜演奏專輯4(8 首)+ 住在祢裡面/安靜演奏3(9 首)= 17 首** | **0**(嗰 17 首) | 呢兩張 2022/2023 年專輯喺 T4 嘅 playlist discover **完全冇影** —— 佢哋根本冇對應嘅人手 playlist。17 首入面 16 首喺 band 內(1 首 611 秒 medley 超上限 11 秒) |
| **鹹蛋音樂事工**(粵語,唔喺六 org 名單) | `@semmhk` `/releases`(14 張) | 《一小時靈修音樂 Vol.1》OLAK 清單 = **10 首 (Piano Version)**,225–417 秒 | **0** | 同一張專輯嘅 55 分鐘連播版早就喺庫但 rejected(#1739);拆散單曲版一直冇人望過 |
| **泥土音樂**(國語,唔喺六 org 名單) | 頻道 `/releases`(12 張)+ iTunes | 《泥土音樂盛曉玫精選 鋼琴輕音樂》Vol.1+2,iTunes 各 10 首 = **20 首**;releases tab 見到 Vol.2(Vol.1 未見,可能要行 Topic 頻道) | 未逐首對(未實查) | ⚠️ 專輯名帶「輕音樂」—— 撞正 Phase 4 §3.3 器樂線 exclude 名單入面嘅「輕音樂」pattern,見 §7 Q5 |
| **HKACM / ACM**(粵語,唔喺六 org 名單) | iTunes 實查;YouTube Topic **未實查** | 《心曲 (Instrumental)》16 首(2000)+《祢愛環繞 靈修音樂專輯2》12 首(2026-04)= **28 首**(iTunes 實數) | 庫有 12 首 ACM 器樂訊號 title(大部分係「文化中心管弦樂Live」有人聲 verified,唔算) | ACM 主頻道冇 `/releases` tab(實測攞唔到)→ 要另搵佢嘅 Topic 頻道先知有冇得播 |
| 約書亞樂團 | `/releases` 73 張全列 | 器樂專輯 **0** | — | 同 iTunes(0 張器樂專輯)一致 —— **佢真係冇貨**,T4 結論再確認 |
| 新心音樂事工 | `/releases` 27 張全列 | 器樂專輯 **0** | — | 同上 |
| 小羊詩歌 | `/releases` 25 張全列 | 器樂專輯 **0**(EnterCalm 唔喺入面) | — | EnterCalm 見 §2.3 |
| 天韻合唱團 | 主頻道冇 `/releases` tab(實測) | 未實查 Topic 頻道 | 庫有 2 首小提琴演奏 MV(verified 有字幕) | 待搵 Topic 頻道 ID 先查得 |

**紅線點守**:成條路**零關鍵字搜尋** —— 全部係「已知官方頻道 → 佢嘅 `/releases` tab / 佢對應嘅 Topic 頻道 → 逐張 OLAK 專輯清單列 member」,同而家 playlist discover 一模一樣嘅結構式枚舉,只係換咗個 tab。唯一要搜尋嘅一步係「搵每個 org 嘅 Topic 頻道 ID」(一次性,人手 WebSearch 搵到之後寫死入 config,同 `worshipGroups.js` 補 channel handle 嘅現行做法一致)。

**估算**(明文標估算):基恩 109 + SOP 安靜3/4 嘅 17 係實數;SOP 其餘 11 張(129 首 iTunes 實數)要同庫入面 48 首已回標 + 15 首 T4 候選做**歌名級去重**先知淨新增,估 60–90;加鹹蛋 10、泥土 ~20、HKACM ~28(要驗 Topic 有冇)→ **合計新候選估 200–260,過晒閘 3/4 之後保守 150–250**。對比 T4 嘅 15 首係十幾倍。

### 2.2 官網 catalog 補漏(半實測)

- `sop.org` 器樂 slug namespace(`in01`–`in08` / `pa01`–`pa03` / `sa01`)—— 已知事實:現有 scrape(`backend/scripts/fetchSopSiteCatalog.js:23` 只掃 `/music/` index)漏咗六張。**今日補實測 `https://sop.org/music/in01/`:存在,《生命的凱歌》音樂演奏(01),1997 年,16 首曲目**。⚠️ 但注意:in01–in03 呢三張早期專輯**iTunes 冇**(iTunes 器樂專輯由演奏4 開始)——即係佢哋可能根本冇上串流,冇 Topic track 可播。噉樣官網呢三張嘅價值係**權威 metadata**(專輯名/曲序/對數),唔係貨源本身。
- 其他 org 官網:約書亞/新心 iTunes 同 releases 兩邊都零器樂,官網再掘預期都係零(未實查,推測);基恩官網(agwmm.org)未實查,但 iTunes+Topic 已經齊晒,官網最多做對數用。

### 2.3 散片型貨源:playlist 執唔到嘅零散官方片(已實測一個案)

實測案例:**EnterCalm《寧靜時分》禱告音樂系列**,3 首(#8137/8140/8144)——`yt-dlp` 實查上載者係**小羊詩歌官方頻道**(`UCdbFFcLrcDtwHf0TumhFXnQ`),但小羊 57 條 playlist **零器樂訊號**(T4 實數)——即係呢啲片喺頻道度「無 playlist 遮蓋」,playlist-level discover 結構上永遠睇唔到。今日全掃小羊頻道 `/videos` tab(432 條):器樂訊號 8 條 = 3 首 EnterCalm(已喺庫)+ 5 條原版伴奏(Q3 正確唔收)——**呢個頻道冇漏網**,但方法本身證明咗有效,而且成本極低(每頻道一個 flat call)。EnterCalm 有冇獨立頻道/更多曲目:**未實查,推測**佢係小羊嘅器樂副品牌,值得喺執行時順手查。

### 2.4 零網絡貨源:庫入面已有但 rejected/擦邊嘅器樂行(已實測)

Read-only SELECT 實查,`curated=0` 但明顯係官方器樂嘅行:

| id | org | title | 狀態 |
|---|---|---|---|
| 2482/2502/2520/2554 | 鹹蛋音樂事工 | 「詩歌純音樂系列」Piano/Guitar Cover 單曲 ×4(125–193 秒) | rejected |
| 753 | 基恩敬拜 | 《靜默有時》靈修音樂 | rejected(對應 iTunes 15 首成張專輯) |
| 756 | 基恩敬拜 | 《Amazing Guitar 3》51:48 合輯 | rejected(單曲版喺 Topic,§2.1) |
| 750 | 基恩敬拜 | 靈修弦樂精選 3 小時 | ok/uncurated(長合輯,Q2 範圍外) |
| 705 / 724 | 約書亞 / 讚美之泉 | 純音樂 2 小時合輯 | ok/uncurated(Q2 範圍外) |

另外 `curated=1` 但未回標、歌名有器樂訊號嘅存量(掃描報告 §3 擦邊名單已涵蓋):**天弦音樂事工【X】鋼琴版 ×10**(3224–3233,婚禮詩歌鋼琴 cover)、**角聲使團 Devotional Music** Piano/Guitar Cover ×4(6031/6033/6040/6041,其中 3 首 verified 有字幕屬 8033 型)、CantonHymn Piano Cover ×2(已回標)。呢批唔使落任何片,只等 §7 Q2/Q3 拍板。

### 2.5 查過但確認冇貨(唔使再嘥時間)

- **約書亞樂團**:iTunes 0 張器樂專輯 + releases 73 張全列 0 器樂。佢嘅「大衛帳幕的榮耀敬拜禱告系列」11 張全部係**有人聲**敬拜禱告專輯(iTunes 關鍵字「禱告」命中但唔係器樂),唔好俾字眼呃到。
- **新心音樂事工**:iTunes 淨係搜到 HKACM 嘅《心曲》(artist 唔係新心);releases 27 張零器樂。庫入面嗰首大提琴演奏(3989)係孤例。
- **MusicBrainz**:**未實查**。iTunes 目錄已經冚住「正式發行專輯」呢層,MB 對呢批中文事工嘅覆蓋歷史上得 7% 命中率級數(album backfill 前科),優先度放最低。

---

## §3 更好嘅識別方法

### 3.1 🥇 `/releases` tab + Topic 頻道枚舉(取代「淨望 /playlists」)

- **原理**:發行商 feed 自動生成嘅專輯清單(OLAK)係 YouTube 上**最接近「官方 discography」嘅結構化資料**,一張專輯一條清單、曲序齊、冇雜片。
- **點解好過而家**:playlist tab 係人手維護,漏嘢(SOP 安靜3/4 成張唔見)、遲更新;releases tab 係發行行為嘅鏡像,出咗街就有。
- **假陽性風險**:低。OLAK 清單掛喺 org 自己個頻道 / Topic 頻道下面,冇第三方內容。真正風險係**同曲異 id 重複**(見 §6 R2)。
- **驗證**:已做 —— SOP 72 張、約書亞 73 張、新心 27、小羊 25、鹹蛋 14、泥土 12 張 releases 全列過,器樂訊號命中同 iTunes 目錄逐一對得上;基恩 Topic 109 首同 iTunes 9 張專輯 109 首**啱啱好對數**。
- **紅線**:結構式枚舉,零關鍵字。Topic 頻道 ID 一次性人手考證後寫死。

### 3.2 🥈 iTunes Search API 做「第三條獨立證據」+ 專輯權威

- **原理**:`itunes.apple.com/search?term=<org名>&entity=album`(免費、免 auth)攞 org 全部正式發行專輯;專輯名/`trackCount`/發行日期係發行商級 metadata。器樂專輯喺專輯名層面自我聲明(「鋼琴演奏專輯3」「Amazing Piano 2 (Piano Version)」「(Instrumental Version)」)。
- **點解好過而家**:而家第二條證據係「playlist 標題器樂訊號」——係 YouTube 頻道管理員手寫嘅;iTunes 專輯名係**發行品本身**,仲可以攞嚟填 `album` 欄(同 T4 §2.1 官網 catalog 嘅角色一樣,但覆蓋全部 org 唔止 SOP)。
- **假陽性風險**:⚠️ **實測見過**:搜「角聲使團」回咗張完全無關嘅《Saxophone and Piano | Detlef Bensmann》。**必須硬性要求 `artistName` 同 org 名/官方英文名 exact match** 先准用,唔准淨靠搜尋命中。呢條紀律要寫死入工具。
- **驗證**:已做(六 org + 五個候選 org 全搜過,結果見 §2 各表)。

### 3.3 頻道 `/videos` 全片標題掃描(補散片盲點)

- **原理**:flat 列頻道全部上載,對 title 行同一套器樂訊號/blacklist。執到「冇入 playlist 嘅官方器樂散片」(EnterCalm 型)。
- **成本**:每頻道一個 flat call;**驗證已做**(小羊 432 條,見 §2.3)。產量低但零成本,建議做 discover 嘅標準附加步,唔做主力。
- **假陽性風險**:同 playlist 訊號一致(完整詞組紀律照跟);片級訊號比 playlist 級弱,**只可以入候選,唔可以當閘 1 證據**——閘 1 嘅「結構證據」要由 iTunes/官網專輯對數補上。

### 3.4 Track 級後綴訊號:「(Piano Version) / (Guitar Version) / (Instrumental Version)」

- **原理**:Topic track 標題後綴係發行 metadata 直出,唔係頻道管理員手寫。基恩 109 首、鹹蛋 10 首全部帶呢個後綴。
- **用法**:做閘 2 嘅加強證據(title-level),連埋 §3.2 專輯級證據 = 兩條發行商級證據,再加閘 4 whisper 音訊證據 —— 三腿。
- **風險**:「Version」後綴都有可能係人聲版變體(例:Acoustic Live);只認 Piano/Guitar/Instrumental/演奏呢類明確器樂詞,其他一律唔認。

### 3.5 聲學層新招:VAD / 音源分離做第二把獨立尺(**未實測,建議 pilot**)

- **原理**:而家音訊證據得 whisper 一把尺,而 whisper 交白卷唔等於冇人聲(807 首 verified 反例,已知事實)。獨立聲學工具兩款:① **silero-VAD**(輕量人聲活動偵測,CPU 秒級);② **demucs 音源分離**(拆 vocals stem,量 stem RMS 能量,有唱就有能量,同 whisper 嘅「聽唔聽得明」完全唔同原理)。
- **點解可能好過而家**:whisper 對非英文人聲成首交白卷係常態(#5202-5234 韓文 MV 全中招);demucs 唔理語言,淨計「有冇人聲頻譜」——啱啱好補到「非華語人聲 + 冇 auto-caption + whisper 白卷」呢個 Phase 4 §9 R2 自認嘅漏網位。
- **假陽性風險**:和音/氣聲/攞人聲做 pad 嘅器樂編曲會有低能量殘留 → 要用 ground truth 校閾值;VAD 對唱歌(非講嘢)偵測靈敏度未知 → 要測。
- **驗證計劃**(離線,零 YouTube 新請求以外嘅成本):由 `scan-20260824.json` 攞 30 首實錘器樂 + 30 首 whisper 標到人聲嘅歌做 ground truth,落 audio 跑 demucs vocals-RMS 分佈,睇兩批分唔分得開。分得開先入閘;分唔開就繼續三腿制唔加。**呢步做完先好講「取代」任何現有閘。**
- 現有閘照留:auto-caption 單向硬拒(閘 3)、whisper 雙 pass + A/B 幻覺白名單(閘 4)全部唔郁。

### 3.6 唔建議做嘅方向(免得再有人行冤枉路)

- ❌ 任何 generic 關鍵字 YouTube 搜尋(紅線,唔重複)。
- ❌ MusicBrainz 做主力(§2.5;iTunes 已冚同一層,覆蓋更好)。
- ❌ 再掃多幾個「六 org 式」主頻道 playlist —— T4 已證明呢格乾塘;增量要嚟自新嘅**格**(releases/Topic/iTunes),唔係新嘅頻道。

---

## §4 政策瓶頸分析(只分析,唔決定)

| 政策 | 而家制約幾大 | 放寬會多幾多 | 代價 |
|---|---|---|---|
| **Q2 十分鐘上限** | T4 嘅 57 新片有 42 首係長合輯被擋;另有邊界單曲(942 秒《我在這裡敬拜》、611 秒一閃一閃亮晶晶 medley) | 長 soaking 檔先係呢個歌種嘅 YouTube 主流形態(T4 結論);解封 = 幾百首級 | **技術前置未做**:D 線 P1 全套(warm 分流以外仲有 anyStreaming 等)+ 實測,係 Phase 5 嘅事。**新路(§2.1)嘅單曲全部喺 band 內,唔使掂呢條政策都有 150-250 首** —— 即係 Q2 唔再係樽頸 |
| **Q1 英文 org 唔收** | 現有中文路唔受影響 | 實查 iTunes:Bethel《Without Words》系列 3 張共 48 首 + 《Peace》12 首;Hillsong/Elevation 未實查(推測合計 100-200) | 英文線全面暫停政策一致性;曲目對 HK 用戶關聯度低。冇急切性 —— 中文貨源未食完 |
| **Q3 伴奏唔收** | 小羊 11 條伴奏 playlist 照擋(正確) | 唔建議放寬 | ⚠️ 但要一條**新界線**:天弦「鋼琴版」/角聲「Devotional Music Cover」/CantonHymn「Piano Cover」係**演繹型器樂 cover**,唔係伴奏帶(冇「跟住唱」用途)。而家 blacklist 冇擋佢哋,但佢哋都唔喺六 org 名單 → 見 §7 Q2/Q3 |
| **§5.1 六個中文 org 白名單** | **呢條先係而家最大嘅政策樽頸**:實證有貨嘅 ACM(28)、鹹蛋(10+4)、泥土(20)、天弦(10)、角聲(4)全部入唔到閘 1 | 合計 ~76 首(iTunes/DB 實數) | 呢五個 org 全部已經係 `worshipGroups.js` 入面審過嘅可信機構(唔係新來歷);風險唔係「掹錯時代曲」,係器樂 cover 界線(上行) |

---

## §5 建議次序 + 工作量估(全部估算)

```
N0  拍板 §7(Eric)                                       —
N1  Topic/releases discover 工具                          1 日
    擴 discoverInstrumentalPlaylists.mjs(或新 script):
    · 每 org 加 /releases tab 枚舉 + topic_channel 欄(人手考證後寫死)
    · OLAK 清單 member + DB 對數 + gate2 預篩(照抄現有邏輯)
    · /videos 全片標題掃描做附加段(§3.3)
N2  iTunes 目錄工具(read-only)                           半日
    fetch org 專輯目錄 → data/instrumental/itunes-catalog-<org>.json
    · artistName exact-match 硬閘(§3.2 教訓)
    · 器樂專輯標記 + trackCount,做簽白名單同 apply 對數用
N3  sop.org scrape 補六張漏網(in01-04/pa01/pa02)          半日(純 WebFetch)
N4  簽白名單 → 閘3/閘4 verify → apply                     照 Phase 4 §5 四段式原樣
    ⚠️ 加一個 org 內歌名級 dedup 閘(§6 R2)
N5  零網絡回收(§2.4 rejected 行 + 擦邊 org 存量)          半日(視乎 §7 Q2/Q3)
N6  VAD/demucs pilot(§3.5,可選)                          1 日(30+30 ground truth)
```

N1+N2 做完就有齊實數簽名單;N4 嘅 whisper 機時同 Phase 4 T7 同級(百幾首 = 2-3 晚)。

---

## §6 風險

1. **R1 Topic 頻道「官方性」**:Topic 係 YouTube 自動生成,唔係 org 親手管理。混入雜物嘅已知模式係「同名合輯/拼盤專輯掛錯 artist」。對策:只行 org 主頻道 `/releases` tab 或 iTunes artist exact-match 對到數嘅 OLAK 清單;iTunes 專輯目錄做強制對數(專輯名+曲目數啱先簽)。
2. **R2 同曲異 id 重複入庫**(呢條路最實在嘅新風險):同一首器樂歌可能有「主頻道人手上載版」+「Topic 自動生成版」兩個 youtube_id(SOP 鋼琴演奏系列就係兩邊都有)。現有冪等只查 youtube_id,唔夠。對策:apply 前 org 內做 normalize 後歌名 dedup(歌名+專輯級),撞名行落 report 人手裁,唔准自動雙收。
3. **R3 iTunes 搜尋假陽性**:實測見過無關 artist 混入(§3.2)。artistName exact-match 硬閘 + 白名單簽名照舊人手過目。
4. **R4 「輕音樂/冥想」blacklist 同真專輯名相撞**:泥土《鋼琴輕音樂》會俾器樂線自己個 exclude 名單擋死(§7 Q5)。對策:blacklist 只應用於**片級標題**,專輯級證據(iTunes)成立嘅候選俾佢入人手 report 而唔係靜靜剔走。
5. **R5 Topic track 縮圖/靜態片形態**:auto-gen track 係靜態封面片,串流層面同普通片一樣(googlevideo audio format 照有),預期零影響 —— 但 verify 段照樣逐首過閘 3/4,唔靠呢個假設。
6. **R6 貨多咗,P5「apply 即上架」風險面擴大**:百幾首一批 vs 15 首一批,Eric 抽驗負擔上升。對策:分批 apply(一張專輯一 run),report 保持一眼可抽驗。
7. **R7 whisper 機時**:150-250 首 × 2-6 分鐘 = 唔止一晚。照 Phase 4 可中斷設計,`--limit` 分段跑。

---

## §7 要 Eric 拍板嘅問題

| # | 問題 | 我哋建議 |
|---|---|---|
| **Q1** | YouTube 自動生成層(`/releases` tab OLAK 清單 + Topic 頻道)算唔算「官方 channel」,准唔准做器樂線貨源? | **准**,附 §6 R1 兩重對數(只認 org 主頻道 releases tab / iTunes exact-match 對到數嘅專輯) |
| **Q2** | 器樂線 org 白名單擴唔擴?候選(全部係 worshipGroups 已審機構,附實數):基恩以外加 **ACM/HKACM(28)、鹹蛋音樂事工(14)、泥土音樂(20)、天弦音樂事工(10)、角聲使團(4)** | 建議分兩批:ACM/鹹蛋/泥土(有正式器樂專輯發行)先;天弦/角聲(散片 cover 型)睇 Q3 |
| **Q3** | 「演繹型器樂 cover」(天弦鋼琴版婚禮詩歌、角聲 Devotional Cover、CantonHymn Piano Cover)收唔收?——佢哋唔係伴奏帶(Q3 舊拍板唔受影響),但都唔係原 org 嘅器樂專輯 | 傾向收(CantonHymn 兩首已回標,有先例),但界線要你劃 |
| **Q4** | 601–960 秒嘅**單曲**(唔係合輯):一閃一閃 medley 611s、我在這裡敬拜 942s 呢類,係咪跟 Q2 一刀切唔收? | 照一刀切(維持 600s),等 Phase 5;只係話你知有呢批邊界貨 |
| **Q5** | 泥土《鋼琴輕音樂》專輯名撞器樂線「輕音樂」exclude pattern —— 呢張專輯(iTunes 正式發行,20 首)收唔收? | 收,用 §6 R4 嘅「專輯級證據優先於片級 blacklist,入人手 report」規則處理 |
| **Q6** | EnterCalm 係咪當小羊詩歌旗下器樂副品牌跟小羊 org 收? | 執行時順手實查佢有冇獨立發行/頻道先答,暫緩 |

---

*規劃:Fable 5,2026-08-24。§2 各表全部當日實查(iTunes Search API、六個 org 嘅 /releases tab、基恩 Topic 頻道 509 track 全列 + DB 對數、sop.org/music/in01、鹹蛋/泥土 releases、SOP 兩張安靜演奏專輯 member 對數);冇實查嘅位逐一標明「未實查/推測/估算」。*
