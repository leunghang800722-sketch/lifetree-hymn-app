# 純音樂貨源:Spotify 播放清單線索(backlog,未做)

登記日期:2026-08-24 · 來源:Eric
狀態:**只係登記,未開始做**。等 11 個 org 嘅 releases 線 ingest 收爐先。

## 線索內容(Eric 提供,未實查)

Spotify 上面有唔少中英文純音樂詩歌播放清單,例:
- `Piano Instrumental Praise, Worship, and Hymns` —— 約 56 首
- `Christian Music - Instrumental Hymns on Piano` —— 約 194 首
- 中文「純音樂」artist 帳號 —— 約 5.99 萬 followers

## 構想中嘅做法

攞 Spotify 播放清單嘅**歌名 + artist**,反過去 YouTube 搵對應版本,做多一條 discover 線索。

## ⚠️ 開工前一定要處理嘅嘢

1. **零關鍵字搜尋紅線點守**:呢條路本質上就係「攞個歌名去搜」,同現行紅線
   (`INSTRUMENTAL-CATEGORY-PLAN §4.1`)直接相撞。可行方向係:Spotify 歌名淨係
   用嚟**決定去邊個官方頻道搵**,搵嘅動作仍然限死喺該 org 嘅官方 channel /
   releases / Topic 之內,**唔准用歌名去 `ytsearch` 全 YouTube 撈**。呢點要
   Eric 拍板寫死。
2. **對唔對得正版官方頻道**:Spotify 上嘅 artist 好多係第三方 re-upload / AI
   生成 / 個人 cover 帳號。要有一套「呢個 artist 係咪等同我哋認可嘅 org」嘅
   對數方法(iTunes/MusicBrainz artistName exact-match 呢類)。
3. **版權**:英文詩歌器樂版好多係第三方編曲發行,同官方機構發行唔同性質。
   §8 Q1 而家仲係「英文 org 唔收住」,呢條線大部分係英文,要先解 Q1。
4. **Spotify API 要 OAuth**:client credentials flow 攞 playlist 內容,要 Eric
   開一個 Spotify developer app。呢個係唯一需要新 credential 嘅步驟。

## 同現有五重閘嘅關係

就算搵到片,仍然要行返完整五重閘(結構 / 標題片長 / auto-caption / whisper
雙 pass / playlist 一致性)。呢條線改嘅只係**閘 1 點搵到候選**,唔改後面四閘。
