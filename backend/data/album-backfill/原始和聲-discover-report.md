# backfillAlbumFromPlaylists discover 報告 —— org=原始和聲

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=channel/UCGelEY7g5t058FGbwzNCuUA。生成時間:2026-08-04 14:10:03

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLBkWgNrcFeA4bSzcFGxECMJxdVjKzkrzp | 【 原始和聲 Raw Harmony Studio Album 】 | 【 原始和聲 Raw Harmony Studio Album 】 | 4 | 1 |

候選 1 個,合共 matched_in_db 1 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLBkWgNrcFeA5gdHL3Gba6CTFJbevXYa8G | Raw Harmony Worship Live 2026 無有 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA4179nLP4ftVrARhd1Fojlz | 【 COMMON / GROUND 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7flLFk7y0KP_DMtmVlcY6t | 【會員限定 — Raw Harmony Night】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7g1EpOmyamHU-W5DBaYOpC | 【 詩篇139系列 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA6ih6p8TVNBSjpbhwJKX-UL | Raw Harmony Worship Night 2023 真 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7JEeC6omcpsN-WGgv8VX_w | 【 原聲 Song Story 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA6MWwJEeSD9Xpjn1urFHCA4 | 【 會員限定 — Song Seed】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA6aHmwHHKGemovP-CmIe4id | 【 會員限定 — 原始人生 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA57szvXquVfVco3a0BK4jLe | 【 Behind The Scenes 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7aWhOjhWpfUGj53Lac9gDK | 【 RH日常 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA5sNCK77zTod9v3ybNeaC5v | 【 無恥和聲 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA5SKRm4ozhCbuUzS88x6RZd | 【 設計導讀 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA4cLaPC8AKPa65rHevPLpsJ | 【 Crossover 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA4CeyIQqfb88d3m2tUcFDFH | 【 Studio 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7J09kvw-Dlymbqnh3NYO0k | 【 敬拜𣊬間 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA53apzXci2L7KPXBaUeTiPw | 【 Cover 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLBkWgNrcFeA7XNhy58pfqSvHEE7kwf-lk | 【 Demo 】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/原始和聲-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
