# Church 611 官網目錄對照表 + catalogAllowlist 閘（2026-09-05）

Eric 拍板：用 church611.org「611創作詩歌」分類頁做官網目錄對照表，解決 Church 611
主頻道講道多歌少嘅篩選問題——目標係「Church 611 淨收官網目錄有列嘅歌」。

## 0. 前情

`ORG-611CHURCH-NEWSONG-REPORT-20260905.md`（同日較早）已經幫 Church 611
（@Church611tv）開咗 entry，用 `durationCapSec:1900 + contentGate:'duration+title'`
淨收 RAWship/Live Worship 現場敬拜系列，54 首入庫。呢份報告係跟進：加官網目錄
做第二重對照，同埋處理「RAWship 系列如果唔喺官網目錄會唔會被踢走」呢個風險。

## 1. 抓目錄

`church611.org/category/611創作詩歌/` 有 3 頁分頁，逐條 post 一個 `<article>`，
帶標題（`<h4><a>`）、日期、官網自家語言標籤（普=國語/粵=粵語/英=英文）、
excerpt（含詞曲/發行 credits + YouTube watch 連結，如果有）。逐條 post 再開
detail page 攞 embed iframe 嘅 youtube_id（比 archive excerpt 更可靠——舊 post
冇 excerpt watch link 但 detail page iframe 有）+ 全曲歌詞（`elementor-text-editor`
區塊，用 Verse/Chorus/Bridge/Pre-chorus/主歌/副歌 標記過濾頁尾雜訊先揀啱歌詞區塊）。

節流 1 req/s，識別性 UA（跟 `fetchSopSiteCatalog.js` 一樣）。共 33 個 request
（3 頁 + 30 條 detail），~40 秒完成。

**產出**（跟現有 catalog JSON 慣例放喺 `backend/data/album-backfill/`，冇開新
`backend/data/catalogs/` 目錄）：
- `backend/data/album-backfill/church611-org-catalog.json`（30 首：title/
  title_matchkey/url/date/lang_tag/youtube_id/excerpt）
- `backend/data/album-backfill/church611-org-lyrics.json`（21 首有擷取到全曲
  歌詞區塊，俾歌詞複核線參考，**冇寫入 hymns 表 lyrics 欄**）
- `backend/scripts/fetchChurch611Catalog.mjs`（可重跑，官網出新歌後更新目錄）

目錄：**30 首**（官網「611創作詩歌」全部）。

## 2. 對照

匹配規則跟 `backfillAlbumFromSopSiteCatalog.js` 同一套（唔用 substring，分隔符
切候選 + normalize 後完全相等；youtube_id 優先，exact-title 次之）：

| 分類 | 數量 |
|---|---|
| 已在庫 | 14 |
| 未在庫、有生存 youtube_id、已補收 | 13 |
| 未在庫、搵唔到 youtube 記錄 | 3 |

**已在庫 14 首**（樣本）：祢名何其深廣（youtube_id 直接撞中）、恩雨降臨、
GET SET LAUNCH（中/英兩版）、生命樹頌歌、新酒湧流、奇妙策士、Be Still、
奇妙創造主、心版十誡、雅歌 Song of Songs、耶和華上升、JOY種、**我心所倚靠**
（同上一份報告手動補收嘅 RAWship vol.1 條片 `weq_Ubvc8wI` 完全吻合，交叉驗證咗
上次補收冇做錯）。

**未在庫、已補收 13 首**——逐條用 yt-dlp metadata 查過 uploader/duration/
availability，全部 public、片長跌喺正常歌帶：

| youtube_id | 標題 | uploader | 片長 | 掛落邊個 org |
|---|---|---|---|---|
| Y6e6tD7g5KY | JEHOSHUA 2022 | @Church611tv | 292s | Church 611 |
| FFaudaO4oww | 誰像耶和華我的神呢｜611靈糧堂 20週年堂慶 | @Church611tv | 449s | Church 611 |
| RTA9x3p7OHQ | 《主禱文》RAWship vol.1 | @Church611tv | 473s | Church 611 |
| Gk_bJYX_Cd0 | 《以祢慈愛引領我》RAWship vol.1 | @Church611tv | 268s | Church 611 |
| ocY_9ESKJE4 | 《人算什麼》RAWship vol.1 | @Church611tv | 346s | Church 611 |
| GXtxN9MdeE8 | 《這是我主所定的日子》RAWship vol.1 | @Church611tv | 264s | Church 611 |
| QklaKQMiPmo | 《你看見了我》RAWship vol.1 | @Church611tv | 312s | Church 611 |
| KiLzyPuFgLo | 《是你觸動我心》RAWship vol.1 | @Church611tv | 416s | Church 611 |
| RTiJnGo4vRY | 海邊的沙｜611 Worship 敬拜 | @Church611tv | 590s | Church 611 |
| heAPkSZxrJ4 | 【井啊！湧出水來】歌詞版MV | **@611RAW（新頻道）** | 131s | Church 611 |
| 6mVg4vAe9Gw | 【我的唯一】歌詞版MV | **@611RAW（新頻道）** | 437s | Church 611 |
| S9w5-jbsUjI | Rejoice｜611靈糧堂24周年 | @611Worship | 315s | 611 Worship |
| mOcaxCq3YzA | 詩篇8 Psalm 8｜611靈糧堂24周年 | @611Worship | 136s | 611 Worship |

⚠️ **兩個要 Eric 判嘅發現**：
1. **@611RAW 係新發現、未喺 `worshipGroups.js` 追蹤嘅第三個頻道**——官方單曲
   歌詞版MV，同 Church611tv/611Worship 屬同一611靈糧堂事工但獨立 channel。呢
   兩首暫掛 `org='Church 611'`。要唔要之後開返一個獨立 entry 長期追蹤，等 Eric
   判斷。
2. **S9w5-jbsUjI / mOcaxCq3YzA 撞正 `isCompilation()` 一個假陽性**：呢個函數嘅
   `dateStamp` regex（`/20\d{2}[.\/]\d{1,2}[.\/]\d{1,2}/`，原意係擋「台北611晨禱
   ｜...｜2026.06.19」呢類禱告會直播日期戳）撞中呢兩首標題尾嘅錄製日期
   「2025.5.11」（官方單曲發佈嘅正常慣例，唔係直播）。已用三重證據（官網
   目錄列出／片長跌喺正常歌帶 136-315s／標題本身係單一歌名）人手覆核
   override，唔靜靜哋跳、寫低喺 `ingestChurch611OrgCatalog.mjs` 入面同呢度。
   建議 Eric 睇下要唔要之後幫呢個 regex 加返一個「單一歌名 + 年.月.日」嘅豁免
   （呢次冇改全局函數，怕影響其他 org）。

**未在庫、搵唔到 3 首**（post 冇 embed iframe，Church611tv/611Worship/611RAW
三條頻道 listing 逐一搜過都冇撞中）：
- 昂首高過四面仇敵 (2026普珥節Sc9)
- 上行之詩
- 以賽亞書61章11節

呢 3 首純粹係官網歌詞/歌譜貼文，冇對應嘅 YouTube 影片（或者影片已落架），
留喺「目錄有、YouTube 搵唔到」清單，冇寫 DB。

## 3. 入庫

`backend/scripts/ingestChurch611OrgCatalog.mjs`——13 首經 `backfillGroupFromList()`
（同 `backfillFromList.js`/growLibrary Tier1 共用嘅同一條 code path，`--dry`
預覽過先真寫）+ 2 首（isCompilation 假陽性）人手 override，DB 寫入全程經
`acquireDbLock('ingest-church611-catalog')`。

| Org | 之前 | 之後 | 新增 |
|---|---|---|---|
| Church 611 | 54 | 65 | +11（9 個 @Church611tv + 2 個 @611RAW） |
| 611 Worship | 132 | 134 | +2 |

## 4. catalogAllowlist 閘 —— OR 條件，唔係取代

`lib/channelScan.js` `validateChannelCandidates()` 加咗 catalogAllowlist：
`group.catalogAllowlist` 有設值（而家得 Church 611），candidate 嘅 youtube_id
或者 normalize 後嘅歌名撞中官網目錄，就當「confirmed 官方原創曲」，略過
isCompilation/isNonWorship/contentGate 標題訊號嗰兩關（片長帶 2a 依然要過，
唔豁免）。冇設 `catalogAllowlist` 嘅 group（其他所有 org）行為**零改變**——
`group.catalogAllowlist &&` 短路,連 `isCatalogMatch()` 都唔會 call 到。

**點解一定要 OR，唔可以做取代**：對現存 65 首 Church 611 做咗一次全量比對——

```
Church 611 org 總數:65
同官網目錄 match 到(youtube_id 或 title exact):16
match 唔到(要靠 RAWship title 閘先入到):49
```

49 首（75.4%）係 RAWship/Live Worship 現場敬拜**改編別人嘅歌**（WayMaker、
Holy Forever、Raise A Hallelujah、As The Deer 呢類知名敬拜歌翻唱），官網
「611創作詩歌」（原創歌）目錄結構上收唔到呢類內容，但呢批一直係 Eric 拍板
要收嘅內容（同日較早份報告已審過:97%正面/0%blocklist）。如果將 catalogAllowlist
做成「淨係目錄有先收」，會即刻令現有內容嘅 75% 喺下一輪 discover 停止擴充
（現存已收錄嘅唔會被刪,但新片再冧唔到）。所以做法係兩條路 OR：舊
`contentGate:'duration+title'` 路徑完全保留，catalogAllowlist 淨係加多一條
路——即係話**RAWship 系列唔會被新閘踢走**。

## 5. 驗證

- [x] 目錄 30 首 / 已在庫 14 / 新收 13 / 搵唔到 3（數字對得上：14+13+3=30）
- [x] `sqlite3` org 計數:Church 611 54→65（+11）、611 Worship 132→134（+2）
- [x] 抽 5 首新收（Y6e6tD7g5KY / RTiJnGo4vRY / heAPkSZxrJ4 / S9w5-jbsUjI /
      mOcaxCq3YzA）`yt-dlp --get-url -f bestaudio[ext=m4a]/bestaudio`,全部 5
      條攞到有效 googlevideo URL
- [x] `/api/version` dataVersion 喺入庫後即刻變(`1788601069322.3838-61206528`),
      backend 冇 restart(`maybeReload` 自動生效)
- [x] `/api/hymns?lite=1`(6518 首):13 條新收全部搵到(id 9137-9149)
- [x] 正控 1(明知已在庫):「祢名何其深廣」→ matchedBy=youtube_id ✓
- [x] 正控 2(substring 陷阱字):單字「一」normalize 之後 `byTitleKey.has()`
      = false,證實冇撞中任何完整標題(唔係做緊 substring match)
- [x] catalogAllowlist 單元測試:模擬候選「海邊的沙」(bare 歌名,
      `passesTitlePositiveSignal()`=false,舊閘會判 skip-title-signal)——
      Church 611(有 catalogAllowlist)正確行「[目錄]」路徑放行到死鏈驗證;
      611 Worship(冇 catalogAllowlist)對照組行為唔受影響
    - 模擬候選 WayMaker RAWship 改編歌:兩個 group 都行舊路徑放行(OR 條件
      冇踢走現有內容嘅路)
    - 模擬候選「主日崇拜」講道:兩個 group 都俾片長帶擋咗
- [x] **實地 dry-run**(真頻道、真 budget=15、冇寫 DB):掃 Church 611 最新 74
      條未收錄片,結果**0 條入庫**——42 條 skip-title-signal(全部 611
      Testimony/EP系列/Sunday Sermon)、29 條 skip-duration(講道 3000-4800s)、
      3 條 skip-quality(Kingdom Artists Stage Play/入會禮)。證實新閘落地後
      講道類實測 0 條入,同時目錄若有新歌會優先經 catalogAllowlist 放行
      (呢 74 條入面冇撞中目錄嘅新歌,因為官網原創歌發佈頻率遠低於主頻道
      日常上載——最近一批全部係常規節目)

## 6. 已知限制

- catalogAllowlist 嘅 title 匹配淨係用官網 post 標題(通常係中文),唔包括
  detail page 入面嘅英文翻譯歌名。dry-run 掃到一條英文標題「How Deep And
  Wide Is Your Name」(即係「祢名何其深廣」嘅英文名)因為文字唔撞中目錄
  而俾 skip-title-signal 擋咗(冇撞 youtube_id 因為呢係唔同條片)。如果日後
  頻道有純英文標題嘅目錄歌新上載,可能要擴充目錄 entry 加英文別名先撞得中。
- 3 首搵唔到 youtube 記錄嘅目錄歌(§2)長遠淨係得歌詞/歌譜,冇聲源,冇得
  收錄,純粹紀錄喺目錄 JSON 度。

## 7. Git

`worshipGroups.js` 仍有另一 session 未 commit 嘅改動(2026-08-01 提速方案A,
61 行)——跟上一份報告嘅隔離手法,用 `git diff` 定位到我嘅改動精準喺第 3 個
hunk(`@@ -165,7 +208,21 @@`),抽出嚟做獨立 patch,`git apply --cached --check`
過先真 apply,`git diff --cached --stat` 核對淨係 16 行(+15/-1)先 commit,
commit 之後 `git diff` 確認另一 session 嘅 2 個 hunk 完整保留喺 working tree。

Commit `a752be4`(分支 `feature/player-rebuild`):6 個檔案(catalog JSON +
lyrics JSON + fetch script + ingest script + channelScan.js + worshipGroups.js
嗰一個 hunk)。冇部署、冇 restart、冇起第二個 server、冇掂 Cloudflare。

## 8. 要 Eric 判嘅嘢

1. `@611RAW`(新發現嘅第三個頻道,官方單曲歌詞版MV)——要唔要喺
   `worshipGroups.js` 開返一個獨立 entry 長期追蹤?而家兩首暫掛
   `org='Church 611'`。
2. `isCompilation()` 嘅 dateStamp regex 假陽性(§2 第 2 點)——要唔要幫呢個
   pattern 加豁免(單一歌名 + 錄製日期嘅官方單曲發佈慣例)?呢次冇改全局
   函數,淨係喺 ingest script 度人手 override 咗兩首。
3. 3 首搵唔到 youtube 記錄嘅目錄歌(昂首高過四面仇敵/上行之詩/以賽亞書
   61章11節)——確認唔使再追,定係 Eric 有其他管道(例如官網直接落載
   MP3/音檔)可以補聲源?
