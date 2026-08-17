# CantonHymn album catalog 搜尋報告 —— 跟約書亞樂團 Phase B 做法嘗試,結論:搵唔到

> 生成時間:2026-08-11。目標:仿照 `joshua-catalog.json`/`fetchJoshuaCatalog.js`/
> `backfillAlbumFromJoshuaCatalog.js` 嘅做法,幫 org='CantonHymn' 冇 album 嘅
> 263 首(status='ok')起官網 catalog 對照表。**結論:CantonHymn 冇官方專輯
> discography,搵唔到可用資料源,冇起 catalog.json,冇碰 DB。**

## 候選 row 現況

```
org='CantonHymn' AND status='ok' AND (album IS NULL OR album='')  → 263 首
```

## 搜尋過程

### 1. 官網 cantonhymn.net

`cantonhymn.net` 唔係樂團官網,而係「全球最大粵語詩歌歌詞庫」——一個由
CantonHymn 恢復粵語詩歌敬拜文化運動主導嘅**眾籌式翻譯資源庫**,收錄
~9995 首歌、來自 60+ 個唔同來源(讚美之泉、Hillsong、約書亞樂團、小羊
詩歌……),每首歌係「邊個原唱/邊個譯詞」,唔係一隊樂團嘅 discography。
網站有 `songalbum` taxonomy(3501 個 album 頁),但係跨全站眾多樂團嘅
「正式出版專輯」標籤,唔係 CantonHymn 自己嗰堆「堂會投稿 demo cover」/
「粵譯擂台」參賽作品嘅分類方式——嗰啲片本身冇「出自邊隻專輯」呢個概念。

站方嘅「來源」篩選入面,`CantonHymn`(89 首)同 `CantonHymn粵譯擂台`
(332 首)先係同我哋 org='CantonHymn' 對應嘅類別,但呢兩類歌本身唔會歸類
入邊隻 `songalbum`。而且個網站前端用 JS 渲染嘅 facet 篩選,冇 REST API
export 呢個 custom post type,scrape 成本高、命中率預期極低,冇再深入爬。

### 2. YouTube 官方 channel(@cantonhymn,372 條片)

睇咗成個 playlist 清單(40+ 個 playlist)。分類方式全部係「呢首歌係邊個
原唱嘅粵語 cover」(約書亞樂團/Hillsong/讚美之泉/Bethel Music……粵語版
cover)、或者「邊一批投稿」(堂會投稿 Demo Cover、粵譯擂台 第1-152回合)、
或者「邊個榜單上榜」(新城詩歌有Guide詩歌榜……)——**呢啲全部唔係
「專輯」概念**,用嚟填 album 欄會誤導(例如將 album 填做「讚美之泉粵語版
cover」,呢個唔係一隻碟)。

### 3. 「恢復粵語敬拜共建專輯」系列(2015-2020 五輯真.實體專輯)

CantonHymn 確實出過 5 輯正式共建專輯合輯(合一的呼求 2015、同心合意
2017、愛濤 2018、HKWorship I 2019、陪我走過春夏秋冬 2020),但:
- 搵唔到任何一輯有完整、可核實嘅逐曲 track list 靜態頁(Amazon/Gumroad
  產品頁都冇列 track,官網都冇對應 songalbum 靜態頁)
- 呢個系列**之前 2026-08-04 個 Phase A session 已經試過**(YouTube
  playlist 途徑):playlist「恢復粵語敬拜共建專輯系列」member_count=64,
  但 `matched_in_db` 淨係 **8 首**(見 `CantonHymn-playlists.json`,
  `approved: false`,仲未 apply 過)。8/263 = 3%,遠低於 50% 門檻,而且
  呢個候選已經存在、未批核,唔屬於我呢輪應該重做嘅嘢。

## 結論

CantonHymn 同約書亞樂團嘅結構性質完全唔同——約書亞樂團係一隊樂團,有
59 隻官方專輯嘅 discography;CantonHymn 係一個粵語詩歌翻譯眾籌運動,
263 首待補 album 嘅歌絕大部分係個別堂會/譯者提交嘅 demo cover 或者
翻譯擂台參賽作品,呢類內容本身唔屬於任何「專輯」。搵唔到高命中率嘅官方
資料源,**冇起 `cantonhymn-catalog.json`,冇寫任何 DB row**,唔夾硬填。

現存已知線索(64-member 共建專輯系列 playlist,matched 8 首)已經記錄喺
`CantonHymn-playlists.json`,如果之後想要嗰 3% 覆蓋率,可以直接由嗰個
Phase A pipeline approve+apply,唔使我呢度重複起 catalog。

---

## 2026-08-17 補充覆查:結論維持,但搵到合輯逐曲清單

呢輪按指示由「64-member 共建專輯系列 playlist」重新入手,結果如下。

### 1. 個 playlist 唔值得 approve

爬晒 64 條片對返 DB:

| | 條數 |
|---|---|
| 唔在庫 | 54 |
| 在庫、**已經有 album** | 9 |
| 在庫、冇 album | **1** |

而且白名單個 `proposed_album` 係「恢復粵語敬拜共建專輯系列」——
**係系列名唔係專輯名**,照 apply 落去等於填錯。**冇 approve。**

### 2. 但爬到咗合輯嘅逐曲清單(新嘢)

playlist 入面幾條「全碟試聽」片嘅 description 有完整曲序,已抽出做
`cantonhymn-cobuild-catalog.json`:

| 專輯 | 年 | 曲目 | 來源片 |
|---|---|---|---|
| HKWorship I 共建專輯(四) | 2019 | 14(完整) | 44eHkhXUrZQ |
| 陪我走過春夏秋冬 共建專輯(五) | 2020 | 12(完整) | j8HDqpqTlTM |
| 同心合意 共建專輯(二) | 2017 | 7(部分) | GCRn3-3Ti-8 |
| 合一的呼求 共建專輯(一) | 2015 | 4(部分) | aD-VS0eaxSs |
| 愛濤 共建專輯(三) | 2018 | **搵唔到任何逐曲清單** | — |

### 3. 之前漏咗嘅關鍵洞察

**呢個系列係合輯,每首歌掛喺唔同機構名下**(角聲使團 / HKACM /
Milk&Honey / 原始和聲 / 鹹蛋音樂事工 / Son Music / 小羊詩歌 / 4C Music /
各堂會…)。所以呢批 album 資料**唔應該淨係對 org='CantonHymn' 去搵**,
要**跨 org 對全庫**——8/11 嗰輪就係因為淨係睇 org='CantonHymn' 所以覺得
「呢啲歌唔屬任何碟」。

跨 org 搵完(`backfillAlbumFromCobuildCatalog.js`)實際命中:**3 首可寫**
(〈主的火〉CantonHymn、〈登我主的聖山〉原始和聲 x2),另外 6 首已經有
album。數目細,係因為呢 37 首歌大部分根本未入庫。

### 4. 結論

**org='CantonHymn' 冇 discography 呢個結論維持唔變**——264 首殘餘依然
係堂會投稿 demo cover / 粵譯擂台參賽作品,本身唔屬任何碟。
共建專輯系列嘅 album 資料已經榨乾(catalog 留低,第日新歌入庫會自動命中)。
