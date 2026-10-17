# backfillAlbumFromPlaylists discover 報告 —— org=基恩敬拜

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=channel/UCGpiURDJzGW0KLobc_pQLpw。生成時間:2026-08-04 13:49:00

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLj-Kuc40oOv0e9OGBzhPfEq1jqRBAe387 | 《復活的盼望》粵語敬拜讚美專輯 | 《復活的盼望》粵語敬拜讚美專輯 | 8 | 8 |
| PLj-Kuc40oOv0e6i7b5h78hLp12h26O6hX | 《感恩的祭》粵語敬拜讚美專輯 | 《感恩的祭》粵語敬拜讚美專輯 | 5 | 5 |
| PLj-Kuc40oOv0alDlCeChHUAN-9GSvXT9d | 《晨禱》粵語敬拜讚美專輯 | 《晨禱》粵語敬拜讚美專輯 | 9 | 9 |
| PLj-Kuc40oOv2HXZWEzg6fRDf5owolNDTH | 《信心的宣告》粵語敬拜讚美專輯 | 《信心的宣告》粵語敬拜讚美專輯 | 9 | 9 |
| PLj-Kuc40oOv2z-ekt1oEgDwteQ06DqOPZ | 專輯介紹 💽 | 專輯介紹 💽 | ⚠️ 41 | 0 |

候選 5 個,合共 matched_in_db 31 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:1 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLj-Kuc40oOv1d2Zx3O8_uYvwoiYkHVDo_ | 靈修音樂系列 | 純音樂/靈修背景音樂(冇編號,非正式專輯) |
| PLj-Kuc40oOv3cycfZZjDS_Q4Exd2blH-f | 「基恩敬拜音樂事工」事工簡介 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv3-AABpPBrAeTKgr9jU4bS3 | 靈命塑造系列 Spiritual Formation Playlist ∣ 心靈內在旅程 | 主題播放清單(唔係官方編號專輯) |
| PLj-Kuc40oOv00o8yM4v5psVpWHC7B71c7 | 2021華語詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv28fk8KYA7LEUwJHN6YEo80 | NEW! 最新粵語詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv1k9hRqhvtlTBx6EqKq0uvr | 粵語詩歌MV | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv1aHVXgsvqqmd_VOcWnF5CV | 伴奏和弦版MV | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv17jNjPWjJu3TBen_g9IOjE | 華語詩歌MV | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv0B8tXUJRPliGOlwYtqmSvh | 崇拜歌詞版MV | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv1bBe0vnOLwstpMcsSEpgUk | 精華片段及幕後花絮🎉 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv3c4QfJ5OZ5lSqKm03JRowr | 禱告更新 - LIVE | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv23CoQp3JE48jBMsTHKAhfy | 無牆敬拜 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv0CN9-rZZOKTvsgX1WG_JkN | 靜默有時靈修系列 | 純音樂/靈修背景音樂(冇編號,非正式專輯) |
| PLj-Kuc40oOv3vlDDWbWtxITKasT65ckT_ | LIVE WORSHIP | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv0VEf-KRSalh9HQV3OLUmya | 「回到家裡」分區培靈佈道會 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv0TU1rYIw1W3y2P_RAMpjb3 | 祈禱仔兒童敬拜系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLj-Kuc40oOv09aUKnRGbXbhA26S-tKOvS | 基恩敬拜海外佈道 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL31A87F70ACC17FFC | 我們的詩歌 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/基恩敬拜-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
