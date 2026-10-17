# 611 Worship album catalog 搜尋報告 —— 跟約書亞樂團/天韻/小羊/基恩 Phase B 做法嘗試,結論:搵唔到

> 生成時間:2026-08-11。目標:仿照 `joshua-catalog.json`/`fetchJoshuaCatalog.js`/
> `backfillAlbumFromJoshuaCatalog.js` 嘅做法,幫 org='611 Worship' 冇 album 嘅
> 117 首起官網 catalog 對照表。**結論:611 Worship 冇官方靜態 discography(逐曲
> track list),搵唔到可用資料源,冇起 `611worship-catalog.json`,冇碰 DB。**

## 候選 row 現況

```
org='611 Worship' AND (album IS NULL OR album='')  → 117 首(status='ok'/curated,見 hymns view)
```

## 搜尋過程

### 0. 前情:YouTube playlist 途徑已經試過,0 candidate

`611 Worship-discover-report.md`(2026-08-04,ALBUM-BACKFILL-ACCEL-PLAN.md
Phase A)已經爬過 `@611worship` channel 嘅全部 playlist,候選專輯 playlist
**0 個**——channel 自己嘅 playlist 全部係「611 小組敬拜詩歌」「Live Worship
ENG」「現場敬拜 Live Worship」「Shine In The Darkness」「611 Worship
Moments」呢類主題/場次分類,冇一個帶「專輯/系列(N)」訊號。呢次係跟 Eric
指示改試官網/商店 catalog 呢條路。

### 1. 官網 church611.org

- `church611.org/611music/`(「最新原創」)—— WordPress 網誌式頁面,逐條
  post 列單曲(標題+發佈日期+語言標籤),**冚唪唥係單曲發佈,冇專輯分組**。
  例如 2024-2026 年間嘅「昂首高過四面仇敵」「祢名何其深廣」「恩雨降臨」
  「海邊的沙」「Rejoice!」「Psalm 8」「GET SET LAUNCH」「生命樹頌歌」
  「新酒湧流」全部獨立單曲,冇 album 概念。
- `church611.org/611出版品/影音產品系列/`(出版品清單)—— 靜態一頁列咗
  幾隻歷年 CD/VHS(611敬拜詩歌創作專輯〔一〕《一顆謙卑的心》12首、
  〔二〕《獻上我自己》、〔三〕《Shekinah Family》、611兒童教會音樂
  錄影帶等),**每隻淨係封面圖+一段簡介,完全冇逐曲 track list**,
  唔連結去任何 detail 頁。呢頁本身就係全部內容,搵唔到再深一層。

結論:官網結構係「教會網誌」,唔係「樂團官方商店」,冧唔到 joshua.com.tw
嗰種一 album_id 一頁嘅靜態 catalog。

### 2. YouTube 搜尋(ytsearch)搵替代 track list 訊號

搜「611 靈糧堂敬拜詩歌創作專輯1/2/3」等關鍵字,搵到 fan 帳號
`beLoved144` 重上載嘅 playlist「611 靈糧堂 - 一顆謙卑的心專輯」
(`PLbFuQdPlCwZlceDZ23u1x2wcbgODJD7Jc`),片名帶
`[611 靈糧堂敬拜詩歌創作專輯1 - 一顆謙卑的心]` 呢種帶專輯訊號嘅括號
tag,但**淨係 8 首**(官網講呢隻碟有 12 首,缺 4 首),而且係 fan 重
upload、唔係官方 channel。搜「專輯2」「專輯3」「Shekinah Family 專輯」
「獻上我自己 專輯」都搵唔到同類 bracket-tag 嘅第二/三輯重上載,冇得
砌成一份多過一隻碟嘅 catalog。8 首即使全部撞中都淨係 8/117 = 6.8%,
遠低於 50% 門檻。

### 3. Apple Music / iTunes

`music.apple.com/us/artist/611-worship/1488589937` 只有 **1 隻碟
「RAWship, Vol. 2 (Live)」、3 首 track**(2026 年新出);iTunes Lookup
API(`itunes.apple.com/lookup?id=1488589937&entity=album`,試過
us/tw/hk/sg storefront)結果一致,證實呢個 artist 喺 Apple 平台嘅
official album 目錄極薄,冇歷史舊碟(一顆謙卑的心/獻上我自己/Shekinah
Family)嘅數位上架記錄。

### 4. KKBOX

搜到 611 Worship 有個別歌曲頁(「願祢榮耀彰顯」「超越萬物的愛」),但
`kkbox.com` 對非瀏覽器 request 一律 403(bot 防護),curl 試過幾種
UA/header 組合都攞唔到頁面,亦搵唔到一個完整嘅 artist album 列表頁
link。冇再用 headless browser 深挖(預期投入唔成正比)。

### 5. Discogs

搜索冇任何相關 release/tracklist 結果。

## DB 現存線索(對照用)

`org='611 Worship'` 而家已經有 15 首靠早期『search』(音樂平台單曲比對)
方式填咗 album,分散喺 9 隻唔同碟名(Shine In The Darkness、Shekinah
榮耀同在、一顆謙卑的心、獻上我自己、將天敞開……),每隻碟得 1-3 首,
同呢次搜尋發現嘅「呢隊冇完整可爬 discography」結論吻合——連逐曲比對
都只能零散咁撈到幾首,冇一個資料源可以一次過覆蓋成批。

## 結論

611 Worship 同約書亞樂團/天韻/小羊/基恩結構性質唔同——嗰幾隊有官方
商店/官網嘅完整 discography 靜態頁(逐 album_id 一頁、track 逐首列);
611 Worship 官網係教會網誌(單曲發佈為主),歷年幾隻正式 CD 冇任何
資料源列出完整 track list,YouTube/Apple Music/KKBOX/Discogs 都搵唔到
夠覆蓋嘅替代來源。**冇起 `611worship-catalog.json`,冇寫任何 DB
row**,唔夾硬填。117 首待補 album 嘅歌維持現狀。
