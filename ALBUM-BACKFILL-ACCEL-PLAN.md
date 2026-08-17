# 專輯(album)backfill 加速規劃 —— ALBUM-BACKFILL-ACCEL-PLAN

> 2026-08-04 Fable 5 出稿。背景:TAXONOMY-5D-PLAN.md 五維入面 album 進度最慢
> (status=ok 5741 首得 241 首有值,~4.2%)。Eric 要求跳出「淨係睇 YouTube
> 標題/描述」嘅限制,可以去官網或網上搵資料加速補齊。
> 本文件純規劃,未落地任何 code,等 Eric 拍板 §6 決策問題先動工。
>
> **2026-08-04 Eric 已拍板(§6 五條)**:
> ① Phase A 直接開始 ✓ ② 爬官網(sop.org 等)都試 ✓ ③ 第三方音樂 API
> (MusicBrainz/Spotify)**唔用** ✗ ④ 翻唱/翻譯片**填原曲所屬專輯** ✓
> ⑤ 殘餘允許 AI 用 web search,**但要有出處先准填**(唔可以憑空估)✓
> 執行安排:Sonnet 5 落地(Phase A 為主、Phase B sop.org 配合、search 做
> 最後 fallback,先加 `album_source` 欄),Opus 5 驗收(抽驗準確度/冇錯專輯
> 名/manual override 冇被覆蓋)。Phase C 改為淨係 search(§2C 唔做)。

---

## 1. 現有做法回顧(點解命中率天生低)

現行 `backend/scripts/backfillMeta.js`(C5/C5b 落地,每晚 17:30 排程)每首歌
一次 `yt-dlp -J --no-playlist` 攞 metadata,album 行三層 parse:

1. **Layer M**:yt-dlp JSON 結構化 `album` 欄——只有 Topic 式上載/YT Music
   有填 metadata 嘅片先有,官方頻道自傳 MV 通常係 None
2. **description**:regex 撞「Album (專輯): XXX」/「專輯:XXX」行
3. **title**:regex 撞「專輯 N:XXX」pattern

規則:**唔准 AI 估專輯名**(§3.3,專輯係事實資料,估錯好核突),parse 唔到
留空;已有值唔重寫。

**點解慢**:呢三層全部依賴「上傳者自己喺片度寫低專輯名」。實測得泥土音樂
呢類有固定 description template 嘅 org 先高命中(75/85 = 88%);其餘大 org
片上根本冇寫——所以唔係 parse 得唔夠好,係**資料唔喺片度**。逐 org 現況:

| org | 總數(ok) | 有 album | 備註 |
|---|---|---|---|
| 讚美之泉 | 1130 | 79 | 最大缺口 |
| 新心音樂事工 | 466 | 0 | |
| CantonHymn | 282 | 1 | 翻唱/翻譯 aggregator |
| 基恩敬拜 | 256 | 2 | |
| ACM | 242 | 9 | |
| 約書亞樂團 | 236 | 0 | |
| 同心圓敬拜 | 232 | 12 | |
| 泥土音樂 | 85 | 75 | 現有做法唯一贏面 |
| (英文 org 群:Hillsong/Bethel/Elevation…) | ~700+ | 幾乎 0 | 英文暫停擴充但存量仲喺度 |

結論:要加速就要**引入片以外嘅資料來源**。下面逐個評估。

---

## 2. 資料來源選項評估

### 選項 A:官方 channel 嘅 YouTube playlist(⭐ 建議 primary)

**原理**:官方頻道普遍會開「一隻專輯一個 playlist」。列晒 channel 嘅
playlists,認出「專輯類」playlist,再攞每個 playlist 嘅 member video id,
直接同 DB 嘅 `youtube_id` 對——**id-level exact match,唔使 fuzzy 對歌名**。

**2026-08-04 實測**(讚美之泉 channel `UC00EceQGGCMucNvwOS-jQ7A`):
- 一次 `yt-dlp -J --flat-playlist .../playlists` 攞到 **103 個 playlist**
- 官方專輯全部係穩定命名格式:「讚美之泉敬拜讚美專輯 (31) 這是我們的敬拜
  This is Our Worship」、「盡情地微笑 Smile｜讚美之泉兒童敬拜讚美專輯 (12)」、
  台語專輯/安靜系列/影音系列都有齊
- 混雜非專輯 playlist(巡迴歌單/卡拉OK/純音樂/和聲教室)——要 pattern 認/
  人手簽一次 per-org 白名單

**成本**:每 org 1 次列 playlist + 每個專輯 playlist 1 次 flat 攞 member
(flat 模式唔逐條片 resolve,好平)。讚美之泉全套 ~35 個專輯 playlist,
跟 backfillMeta 同款 3.5s delay,一晚跑完一個大 org 有突。

**準確度**:最高——係官方自己講「呢條片屬於呢隻專輯」。唯一誤差係
live/卡拉OK playlist 誤認做專輯(靠白名單解決)、一片入多個專輯 playlist
(精選輯 vs 原專輯,要優先次序規則,見 §4)。

**限制**:①得官方 channel 先有;DB 冇存 uploader,如果我哋收嗰條片係第三方
重傳(CantonHymn/生命河粵語呢類),官方 playlist 唔會有呢個 video id,
兜唔到——要 fallback 靠歌名 match(選項 B)。②冇官方 channel 嘅 org
(玻璃海/團契遊樂園等)直接冇得用。

**法律風險**:同現有 yt-dlp metadata 用法完全一樣,冇新增。
**403/VPN 風險**:同 backfillMeta 每晚跑緊嘅嘢同一 risk profile(都係經
NordVPN 出口打 YouTube metadata endpoint),唔會重蹈 googlevideo 媒體流
403 嘅覆轍(嗰個係媒體 CDN 層,唔係 metadata 層)。

### 選項 B:官網爬取/表格比對(⭐ 建議 secondary,逐 org 睇menu)

**2026-08-04 實測**(讚美之泉 sop.org):
- `sop.org/copyright-ccli/` 有**靜態 HTML 表格**:中文歌名/英文歌名/專輯名/
  專輯系列/詞曲/CCLI/年份,一次過 fetch 就攞晒成個 catalog——唔使 JS 渲染,
  唔使爬多頁,係「一頁一 catalog」嘅理想形態
- 用法:攞 catalog 落嚟做一份 `data/` 下嘅 JSON,再用歌名(normalize 後)
  對 DB 嘅 `title`/`display_title`,同一歌名喺多隻專輯出現(原版+精選+Live)
  要規則揀(§4)

**其他 org 官網要逐個盤點先知結構**(呢步本身係 plan 內嘅一個 task):
約書亞樂團(asiaforjesus 系)、新心音樂事工、同心圓、基恩敬拜、ACM 等
各有官網,但表格化程度未知——有啲可能係一頁一專輯要爬多頁,有啲可能
淨係得網店。建議每個 org 人手睇 5 分鐘定「可爬/難爬/冇料」三級,
先做「可爬」嗰批。

**成本**:每 org 一次性爬 + 之後偶然 refresh;request 量極低(幾頁 HTML),
冇 rate limit 問題。**技術難度**:中——每個官網一個 parser,冇通用性,
但一次過搞掂一個 org 成百首,per-song 成本係全部選項入面最低。

**準確度**:高(官方 first-party 資料),但歌名 match 係 fuzzy 位:
簡繁/異體字/英文名夾雜/副題,要 normalize + 唔確定嘅寧願留空。

**法律風險**:低。爬公開 catalog 資訊(邊首歌屬邊隻專輯係事實資料,
唔受版權保護;我哋唔碰歌詞/音源)。禮貌爬法:低頻、cache、UA 表明身份。

### 選項 C:第三方音樂資料庫 API

**MusicBrainz**:2026-08-04 quick check 實測**有**讚美之泉 recordings 連
album(《讓讚美飛揚》1996/《單單愛慕你》2003 等都收錄)。API 免費、
開放資料、1 req/s rate limit。但:①覆蓋深度未知,熱門 org 舊專輯有,
粵語細團體(基恩/同心圓/原始和聲)好大機會冇;②歌名 match 又係 fuzzy;
③中文詩歌條目質素參差。**定位:sanity-check 過先知值唔值得——唔建議
做主力,可以做選項 B 冇官網 org 嘅補漏**。

**Discogs**:實體唱片向,華語詩歌覆蓋估計更低,API 要 token。優先度低。

**網易雲/QQ音樂**:華語覆蓋其實幾好(讚美之泉/約書亞喺呢啲平台有官方
上架),**但冇公開 API**,要用非官方接口/爬 app 接口,ToS 風險 + 接口
隨時死 + 大陸平台對基督教內容有下架風險。唔建議依賴。

**Spotify/Apple Music API**:正規 API、華語詩歌大 org 都有上架(sop.org
自己都連去 Spotify)。Spotify API 免費 quota 夠用,搜「歌名+artist」返
album 名。缺點:要開 developer app + 英繁對 match、精選輯污染。
**如果接受用第三方 API,呢個係 C 類入面最正路嘅一個**。

### 選項 D:Web search + AI 解讀(通用 fallback)

歌名+org 名丟去 search API(Brave/Google CSE 呢類),AI 讀 result snippet
判斷專輯。通用性最高(乜 org 都得),但:

- **成本**:~4000 首 × 每首 1-2 個 search call。Google CSE 免費 100/日,
  之後 $5/1000;Brave 免費 tier 2000/月。全量跑係要俾錢或者拖好耐
- **準確度風險**:AI 讀 search snippet 係「軟證據」,同 §3.3「唔准 AI 估」
  嘅精神有張力——如果用,建議規則改做「AI 要引到出處(邊個網站話嘅)先准
  填,並且 album_source 標 'search' 方便日後覆核/回滾」
- **定位:最後一層 fallback**,淨係處理 A/B/C 都兜唔到嘅殘餘,嗰陣時
  殘餘數量應該已經細,成本可控

---

## 3. 建議組合方案(先易後難,三階段)

**Phase A —— YouTube playlist membership(即刻可做,唔使新外部依賴)**
1. 新 script `backfillAlbumFromPlaylists.js`:食 `worshipGroups.js` 有
   channel 嘅 org,列 playlists → 認專輯 playlist → flat 攞 member ids →
   同 DB `youtube_id` 對 → 寫 `album`
2. 每 org 第一次跑出「playlist 認定清單」(邊啲當專輯/邊啲跳過)做
   dry-run report 俾人手簽一眼,簽完先真寫(同 C5 pilot 流程一樣)
3. 預期收成:官方片源為主嘅大 org(讚美之泉/約書亞/同心圓/基恩/ACM/
   英文 org 群)一 org 一晚,估計可以由 4% 推上 40-60% 區間

**Phase B —— 官網 catalog(讚美之泉先行,其他 org 逐個盤點)**
1. sop.org CCLI 表已證實係靜態表格:寫一次性 fetch script 出
   `data/albumCatalogs/sop.json`,對埋 Phase A 兜唔到嘅讚美之泉殘餘
   (第三方重傳片 id 對唔上,但歌名對到 catalog)
2. 出一份「org 官網盤點表」(有冇官網/有冇 discography/結構三級評分),
   可爬嗰批逐個補 parser
3. 歌名 match 規則:normalize(簡繁/全半形/去括號副題)後 exact match 先收,
   fuzzy 唔收(寧空莫錯);同名多專輯按 §4 優先次序

**Phase C —— 殘餘清尾(拍板先做)**
- MusicBrainz/Spotify API 對殘餘做一輪(如果 Eric 接受第三方 API)
- Web search+AI 做最後一層(如果 Eric 接受 search 成本 + 放寬「AI 唔准估」
  做「AI 要有出處先准填」)
- 到呢步都冇嘅(細團體單曲/散裝上載,本身可能真係冇專輯)正式留空,
  唔再夜夜重試

---

## 4. 技術實作考量

- **新欄 `album_source`**:performer 有 `performer_source` 做保護/追溯,
  album 而家冇——引入多來源之後必須加(值:`metadata`/`description`/
  `title`/`playlist`/`website`/`api`/`search`/`manual`),admin 手動改過嘅
  永不覆寫,低可信 source 先准俾高可信 source 升級(precedence:
  manual > website ≈ playlist > metadata/description/title > api > search)
- **同名多專輯揀邊隻**:官方 playlist 場景一片通常得一個專輯 playlist,
  撞到多個(精選輯)就旗開 report 人手睇;官網 catalog 場景優先揀
  「原專輯」(年份最早嘅 studio album),Live/精選唔自動填
- **翻唱/翻譯片點填**(CantonHymn/生命河粵語呢類):片本身唔屬於任何
  官方專輯。填「原曲所屬專輯」定留空係產品決策 → §6 Q4
- **DB 寫入**:全部行 `acquireDbLock` + locked node script(唔准 raw
  sqlite3 CLI UPDATE——並行 job saveDb() 會靜靜哋覆寫,已知教訓)
- **同現有架構結合**:Phase A script 做完一次性清存量後,可以併入
  backfillMeta 嘅夜晚排程做增量(新歌收錄後隔晚補 album),或者獨立
  隔週跑一次(playlist membership 變動慢,唔使夜夜跑)
- **rate limit/403**:Phase A 全部係 YouTube metadata call,同現有排程
  同一 risk profile,跟同一套 3.5s+jitter delay;官網爬取量極低;
  唯一有真金成本嘅係 Phase C 嘅 search API,所以擺最後、淨做殘餘
- **報告先行**:每 phase 跟 C5 pilot 慣例——先 dry-run 出 md report
  (命中幾多/樣本/衝突清單)俾人手/Opus 驗收,先開真寫

---

## 5. 預期效果粗估

| Phase | 覆蓋增量(粗估) | 前置 |
|---|---|---|
| A playlist | +2000~3000 首(官方片源 org) | 冇,即刻可做 |
| B 官網 | +讚美之泉殘餘幾百 + 逐 org 遞增 | sop 先行;其他要盤點 |
| C API/search | 殘餘清尾 | 拍板 + 可能要 API key/成本 |

---

## 6. 關鍵決策問題(等 Eric 拍板)

1. **Phase A(官方 playlist 對 video id)係咪即批?** 唔使新外部依賴、
   風險同現有排程一樣,建議直接開工。
2. **接唔接受爬官網做資料來源?**(讚美之泉 sop.org 已證實有現成表格,
   低頻禮貌爬;其他 org 逐個盤點)
3. **第三方 API(Spotify/MusicBrainz)用唔用?** 要開 developer 帳號,
   資料係第三方所以可信度次一級,淨做殘餘補漏。
4. **翻唱/翻譯片(CantonHymn 呢類)嘅 album 填「原曲專輯」定留空?**
   填就搜尋/篩選好用啲,但嚴格嚟講嗰條片唔係嗰隻專輯出品。
5. **「唔准 AI 估專輯」條線放唔放寬做「AI 有出處先准填」?**(淨係影響
   Phase C web search 層;唔放寬就 Phase C 唔做 search,殘餘正式留空)

---

## 7. 執行記錄(2026-08-04,Fable 5 監督)

- Sonnet 5 落地四 commit:71c1e53(album_source 欄+三處 stamping)/52022b4(Phase A
  script)/7b95fab(Phase B sop catalog)/1ed40b4(Phase C search script,未跑)
- Opus 5 pilot 驗收:三大項 PASS(905 首全量對 catalog、legacy 259 逐條對 backup
  零覆寫);唯一錯 id=735(官方 playlist 尾巴污染),已清並標 manual
- Opus 必修+七項加固:c364153/7b2852a(guard 睇 album_source、member 增長 skip、
  fallback null、fetchFail abort 等)
- Phase A 推展:讚美之泉家族 905 + 新心 328 + 約書亞 119(classifier 加編號系列
  pattern)+ 基恩 31 + ACM 20 + 角聲 11 + 全心 6;Phase B sop catalog 25
- **結果:全庫 status=ok album 覆蓋 241 (4.2%) → 1678 (29.2%)**;讚美之泉家族 82%
- Phase A 冇收成:同心圓/CantonHymn/原始和聲/悦雨/611(channel 冇可用專輯
  playlist)、英文 org 群(worshipGroups 冇 channel)——連同各 org 殘餘留 Phase C
- Phase C 開波前置:人手驗 headless `claude -p --allowedTools WebSearch` 得唔得
  (backfillAlbumSearch.js header TODO);成本細批跑(--limit 30/晚)

---

## 8. 執行記錄(2026-08-17,Opus 5 —— 停咗 6 日之後接返手)

### 8.1 先答返 Eric 兩條疑問:新心/天韻「已完成但仲有 160 缺口」

**兩隊都唔係 track list 攞漏,亦唔係 DB match 唔到。**(順帶一提,Eric 手上
嗰批數字係舊嘅;8/17 實查係 CantonHymn 264 / 天韻 138 / 新心 43 / 讚美之泉 88 /
約書亞 89。)

- **新心音樂事工:43 首殘餘 100% 係非歌內容**。逐條睇過:
  《二十天求復興》默想禱告集(13 條)、大提琴演奏、《沉思集》、「—作者分享」
  系列、事工介紹片(音樂學院/培訓服事/新加坡義工團隊…)。**呢隊實質做完。**
- **天韻合唱團:138 首殘餘 = 229 首 catalog 搵唔到(親輕唱 Ep.1-13 兒童聖經
  故事、「歌唱的威立」教學、與爵士之間個人訪談篇、微電影、巡迴 vlog、
  感恩見證)+ 62 首「撞多隻專輯」conflict 卡住冇寫**。後者先係真嘢——
  見下面 8.2。

### 8.2 新做法:用「最早發行 = 原碟」解 conflict(呢輪最大收成)

之前所有 catalog backfill 遇到「同一首歌喺 catalog 出現喺多隻碟」(原碟 +
之後嘅精選/重編合輯)都係一律 flag conflict 唔寫,**全庫累積卡咗 383 個
conflict**(天韻 62 / 基恩 133 / 約書亞 169 / MusicBrainz 81)。

解法:攞到每隻碟嘅**發行年份**,同一首歌撞幾隻碟就揀**最早嗰隻 = 原碟**。

- 新寫 `scripts/fetchTianyunAlbumYears.js`:天韻嘅 catalog 本身 year 全部
  null,由 shop.hms.org.tw 商品頁抽「YYYY年M月發行」補返(53 隻碟攞到 38 隻)。
  順帶實錘咗《另一種情歌》係 1998 年嘅**後期精選**,而《野地的花》1980、
  《風和愛》1983 先係原碟——之前一律當 conflict 就係因為分唔出。
- 四個 backfill script 加咗同一條規則(`--no-resolve-earliest` 可關):
  `backfillAlbumFrom{Tianyun,Joshua,Keen,MusicBrainz}Catalog.js`。
  **有任何一隻碟欠年份、或者最早嗰個平手 → 照舊唔寫**(守返「寧空莫錯」)。
- ⚠️ 踩過一個坑:MusicBrainz catalog 嘅 `year` 係**字串**("2012"),
  `===` 比唔到 number,一開始 51 個可解嘅 conflict 全部靜靜哋當「解唔到」。
  已改成 `Number(t.year)` + `Number.isFinite` 守門。

**成績:383 conflict → 324 個解到(天韻 52 / 基恩 126 / 約書亞 95 / MB 51),
其中 78 首本身 album 空、真係寫得入。**

### 8.3 另一條新做法:標題自帶《專輯》字面(零外部抓取)

**全心製作 HeartPro**:37 首冇 album 入面 21 首標題尾自帶
「《HIS70ry 齊唱。吳秉堅之歌。》自傳第一樂章。」,而 DB 入面已經有 2 首
**同一標記**嘅 row 喺早期 'search' 輪填咗 `album='齊唱‧吳秉堅之歌'`
(同一隻碟,得標點寫法唔同)——即係 DB 內部已經有實錘,唔使爬任何嘢。
跟小羊詩歌 Tier1 做法,新寫 `scripts/backfillAlbumHeartProTitle.js`,
`album_source='title'`。**37 → 16**(剩返 WAO 訪談/北美巡迴等非專輯內容)。

> 順帶做咗全庫掃描:no-album row 之中帶 `《》` 嘅得 196 條,而其中
> 《X》真係撞到同 org 已有專輯名嘅**得 5 條**。即係話呢招**唔通用**——
> 大部分《》係歌名(Giggles)或者系列名(《沉思集》/《二十天求復興》),
> HeartPro 係少數特例。唔好下輪又當佢係萬能鎖匙。

### 8.4 呢輪寫入總數

| 做法 | org | 寫入 |
|---|---|---|
| 標題字面《》 | 全心製作 HeartPro | 21 |
| 最早發行解 conflict | 基恩敬拜 + 祈禱仔 | 29 |
| 最早發行解 conflict | MusicBrainz 群(Phil Wickham/Bethel/Elevation/Hillsong…) | 31 |
| 最早發行解 conflict | 天韻合唱團 | 10 |
| 最早發行解 conflict | 約書亞樂團 | 8 |
| | **合計** | **99** |

⚠️ **99 首係 `hymns_all` 層面**;其中 **46 首**係 app 真係見到嘅 curated 活
row(全庫 curated no-album 1619 → 1573)。差額 53 首落咗喺 non-curated /
rejected row 度——因為 Keen/MB 兩個 script **原本就冇 curated 過濾**
(8/11 就係咁,唔係呢輪改壞)。冇害(第日 revive 返仲慳返功夫),但報數
要分開講。

### 8.5 確認「結構性冇專輯、唔使再試」嘅 org(新增)

呢輪逐隊爬晒 YouTube playlist 結構 + 對返 DB 命中率,確認以下幾隊同
[[悅雨音樂 GRM]]/[[611 Worship]] 同一類 —— playlist 全部係**內容分桶**
(原創/Cover/Demo/教學/訪問/年齡分層)而唔係專輯,已寫 attempt report:

| org | 冇album | 報告 |
|---|---|---|
| KEC Worship | 66 | `kec-catalog-attempt-report.md` |
| Giggles and Tunes | 57 | `giggles-catalog-attempt-report.md` |
| Milk&Honey | 50 | `milkhoney-cjfriends-woxin-catalog-attempt-report.md` |
| CJ and Friends | 45 | 同上 |
| 我心旋律 | 38 | 同上 |
| 原始和聲 | 44 | `rawharmony-tws-catalog-attempt-report.md` |

**另外兩隊唔係「未做」,係已經做完**(殘餘全部係非專輯內容):
- **同心圓敬拜(43)**:13 個逐年高峰敬拜音樂會 playlist **全部 0 首欠
  album**;殘餘落喺詩歌精選/GLOW 青年事工/幕後花絮/清談節目/探訪行動。
- **新心音樂事工(43)**:見 8.1。

### 8.6 仲未做 / 下輪可以再試

- **CantonHymn(264)** —— 2026-08-11 已有 `cantonhymn-catalog-attempt-report.md`
  嘅死結論(眾籌翻譯運動,唔係樂團,demo cover 本身唔屬任何碟)。
  **唯一剩低嘅線索**:Phase A 嗰個 64-member「恢復粵語敬拜共建專輯系列」
  playlist,`CantonHymn-playlists.json` 入面 `approved:false`,matched 8 首
  (3%)。想要嗰 3% 就直接 approve+apply,唔使重起 catalog。
- **Milk&Honey「More than a Concert 2015 【LIVE】」9 首** —— 9/9 全部在庫,
  係唯一似正式 release 嘅嘢,但未實錘有冇發行過 live 專輯。**留咗未寫**,
  搵到證據就即刻有 9 首。
- **天韻剩低 10 個解唔到嘅 conflict** —— 兩種情況:①《不為明天憂慮》vs
  《莫得為明日掛慮》(1993 同年,國語/台語版同一隻碟)平手;②《飛翔》
  呢隻碟喺 shop 抽唔到年份。補到年份/釐清版本就解到。
- **天韻仲有 15 隻碟冇年份**(多數係近年 release:逆轉/更新/等待中的讚美
  /超越星河的愛…),`fetchTianyunAlbumYears.js` 再跑或者換抽法可以補。
- **讚美之泉(88)/ 約書亞(81)殘餘** —— 對過官方 catalog(sop-catalog.json
  51 隻碟到 2026、joshua-catalog.json 59 隻碟到 2026,兩個都係最新):
  殘餘係 **YouTube 系列而唔係碟**(SOP:2023/24/25 聖誕系列單曲、天堂敬拜
  LIVE、個人安靜敬拜時分、台北青少年弦樂團、異象影片;約書亞:J-US /
  Yeram Worship / 제이어스 韓團合作單曲、搖滾媽媽唱清談)。韓團合作嗰批
  **確認唔喺約書亞任何一隻碟入面**,係獨立單曲。
