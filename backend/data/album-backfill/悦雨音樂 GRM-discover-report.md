# backfillAlbumFromPlaylists discover 報告 —— org=悦雨音樂 GRM

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=@gladnessrainmusic。生成時間:2026-08-04 14:09:20

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|

候選 0 個,合共 matched_in_db 0 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLU3A8wBRImKFlvhqPbrAEqjtPY3QhWI-b | ▍余幸蓓合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKEyMyWO04rO4u59rMtaQjP- | ▍Lauren合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKGVXhU28gK5yhpw2_ju7Tjy | ▍盧凱韻AiryLolo合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKFCMeMtxTxIetT3FwbdhJuN | ▍屈臣合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKGrjUNSuMkGTYNzB0dRyb02 | ▍Stephy合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKErlfXMUalijSoWHZClTxan | ▍阿修合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKG-0SEkAZFjg_v41vU1YgpX | ▍𝟐𝟎𝟐𝟑 𝐖𝐡𝐚𝐭 𝐈𝐟... 𝐂𝐡𝐫𝐢𝐬𝐭𝐢𝐚𝐧 𝐌𝐮𝐬𝐢𝐜 𝐆𝐚𝐭𝐡𝐞𝐫𝐢𝐧𝐠 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKGoGMeOi1L9_QQFgLwbNKq9 | ▍2022 The Pulse Concert x Market by ACM | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKE1vlpF4diW6yNJbsCzxGgo | ▍2022 基督教會加利利堂分享會 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKGW3s9NCKl85FGNkxD9AU4V | ▍2021 Hypersonic Fest 獻唱重溫 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKE4uTlRLkLAEdBHY1LHnwgd | ▍訪問合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKHBFh_QCAz9xm-k9wzZLQHK | ▍2020 復活節音樂特輯【愛的BIG降】 | 特輯(唔係正式編號專輯) |
| PLU3A8wBRImKGn7_MjPKmmCd19ySl7Eebn | ▍2019 聖誕音樂崇拜【望咩呀望】 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKG1WO8MvWVMJzco6YM-Jh5Y | ▍現場獻唱 (高音質) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKHZka0_J42kkqn5Mf6ISnjd | ▍2019 中華基督教播道會茵怡堂音樂分享會 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKG7llKiAZnGd5niifJIg5dX | ▍2019 「雨」祢共鳴．音樂分享會 by YMCA TST | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKEhYUv8w_drG01IpHLL2goW | ▍介紹返系列 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKG59cQ5EPhSLP1R2CYkZB4Q | ▍協作詩歌合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKF8wYBya8enSS4oSjtk0H7z | ▍敬拜原創詩歌合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKHF_Fl5yRMFwPD9Or75DPco | ▍2018 Gather ToGether Mini Music Cafe | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKGd-c_PvhP1LYIklW3LhN7b | ▍現場獻唱 (任何音質) | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKHrbb0Re1B0vhLBcYwC2ga2 | ▍2016 Cafe de Gladra | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKESfJU9Rg5naokox0swF1-N | ▍2013 Mini Music Cafe | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLU3A8wBRImKFV8SyKiGcVhCNbU3eiy_9U | ▍原創歌曲合集 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/悦雨音樂 GRM-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
