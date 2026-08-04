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
