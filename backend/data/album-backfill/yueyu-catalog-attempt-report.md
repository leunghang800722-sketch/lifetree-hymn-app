# 悅雨音樂GRM album catalog 搜尋報告 —— 跟約書亞樂團/天韻/小羊/基恩做法嘗試,結論:搵唔到

> 生成時間:2026-08-11。目標:仿照 `joshua-catalog.json`/`tianyun-catalog.json`/
> `xiaoyang-catalog.json`/`keen-catalog.json` 嘅做法,幫 org='悦雨音樂 GRM' 冇
> album 嘅 138 首(curated=1、非 dead/rejected)起官網 catalog 對照表。**結論:
> 悅雨音樂GRM冇官方專輯 discography,搵唔到可用靜態資料源,冇起
> catalog.json,冇碰 DB。**

## 候選 row 現況

```
org='悦雨音樂 GRM' AND curated=1 AND status NOT IN ('dead','rejected')  → 140 首
其中 (album IS NULL OR album='')  → 138 首
```

## 搜尋過程

### 1. 官網 sites.google.com/view/gladnessrainmusic

呢個係一個 Google Sites 靜態頁,導航只有「最新消息/推介作品/關於我們/
索取歌譜/活動回顧」5 個分頁,冇任何「discography/專輯」頁面。

- **推介作品**頁:列出 ~25 首歌名(按頁面順序,冇分類、冇年份,除咗
  「小船」標「【新歌】」)。呢啲係單曲清單,唔係專輯分類。
- **關於我們**頁:提到 2014 年出過一張紀念專輯《起程》(基督教觀塘福臨
  教會獨立紀念專輯),之後**冇再列任何專輯**——頁面原文明確講佢哋
  「採取『平台』模式運作,成員以單曲形式發布作品,而非傳統唱片專輯
  形式」。呢個同約書亞樂團(59 隻官方專輯)、小羊詩歌、天韻合唱團、
  基恩敬拜嗰種「樂團持續出碟」嘅結構性質完全唔同——悅雨音樂本身
  就冇「專輯」呢個發行單位。

### 2. CMDA 資料庫(cmda.asia/organizations/gladnessrainmusic,cmda.hk 會
   308 redirect 去同一頁)

機構頁列出嘅歌曲(相關作品/官方音樂檔/官方樂譜三段,計去重後)只有
約 10 首,**全部冇專輯/年份/系列標記**,規模遠細過 DB 待補嘅 138 首,
就算全部命中都唔夠 10%。

### 3. 串流平台(KKBOX / Spotify / MOOV / StreetVoice)

逐個搜尋「悅雨音樂」「Gladness Rain Music」+ KKBOX/Spotify/MOOV/
StreetVoice,**冇搵到任何匹配嘅正式上架 artist 頁或專輯**。呢隊團體
似乎冇透過主流串流平台發行專輯,作品主要靠 YouTube/Facebook/Instagram
自行發布。

### 4. YouTube playlist(2026-08-04 Phase A 已經試過)

呢輪之前(`悦雨音樂 GRM-discover-report.md`)已經行過
`backfillAlbumFromPlaylists.js` discover,掃咗 channel @gladnessrainmusic
全部 playlist,**候選專輯 playlist 0 個**——25 個 playlist 全部係
「XX合集」(某成員個人作品合輯)、音樂分享會、演唱會回顧,冇任何一個
帶「專輯/系列(N)」訊號。呢個結果同官網「採取平台模式,單曲發布」
嘅自述互相印證。

## 結論

悅雨音樂GRM同約書亞樂團/天韻合唱團/小羊詩歌/基恩敬拜嘅結構性質完全
唔同——後幾隊係持續出碟嘅樂團/事工,有正式官網 discography 或至少
YouTube 專輯 playlist;悅雨音樂GRM自2014年紀念專輯《起程》之後就冇
再出過正式專輯,138 首待補 album 嘅歌絕大部分係逐首單曲發布,呢類
內容本身就唔屬於任何「專輯」——唔存在可以起 catalog 嘅資料源,唔係
「未搵到」而係「呢隊團體結構上冇專輯呢樣嘢」。

搵唔到高命中率(或者任何合理命中率)嘅官方資料源,**冇起
`yueyu-catalog.json`,冇寫任何 DB row**,唔夾硬填。
