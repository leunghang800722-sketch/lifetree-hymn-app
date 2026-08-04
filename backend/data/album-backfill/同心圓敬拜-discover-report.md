# backfillAlbumFromPlaylists discover 報告 —— org=同心圓敬拜

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=@theworshipers。生成時間:2026-08-04 13:49:02

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
| PLCBa0hP_ubBM | ʟɪᴠᴇ ᴡᴏʀꜱʜɪᴘ ᴍᴏᴍᴇɴᴛꜱ丨同心圓·敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEg4tTe8QPyoKlokYaUm6L2o | 2025「The Very First 最起初的」敬拜音樂會｜同心圓·敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEgBPdtqRIfHA8GkwdTSnhXU | 2024「HOPE 盼望」敬拜者使團30周年敬拜音樂會｜同心圓·敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEgCHJUS_oh9jWKMZ4xA3vHh | 2023「GUIDE US 引領」敬拜音樂會｜同心圓·敬拜者使團TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEgBr5RrgqxU8visT_O7h351 | 預苦期 x 復活節 \| 線上資源放送 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEjLDfvL64-kOOCz-yrq3uP1 | 2022 「KINGDOM REBORN · SET FREE」敬拜音樂特會｜同心圓‧敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEgvk0-lyxGeS4WvGv5O7pYS | 獨家幕後花絮｜同心圓 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEj30248vdfWZiXmqnPRkBBH | 2021 「CHOSEN」為香港守望 高峰敬拜音樂特會｜同心圓‧敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEjoro-akVDZNlFU6B96ujZu | 線上音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEide54TCB1fc8RWC7j2A4Rq | 「同心唱」敬拜歌詞領唱MV｜同心圓·敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEgpuHrz8GAlasEnigdQH3xq | 《DJ馬馬 x 同心電台》詩歌靈修清談節目｜同心圓 | 純音樂/靈修背景音樂(冇編號,非正式專輯) |
| PLOYShA7HDKEgaDsZZD7KIOH-n6Z1S_VOy | 同心圓 TWS 音樂教室 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEjdv0FEict71GTzPl9s_DsC | 2019 「EXTOL尊崇」敬拜音樂特會｜同心圓‧敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEhssXMhcIiQgYUcfWad-JDu | 國語詩歌精選｜同心圓·敬拜者使團 TWS | 合輯/精選(全碟連續播放/最佳精選,唔係單一專輯) |
| PLOYShA7HDKEi--2dhKM_sDJM0zGmXp4cP | 2018 「HEART」高峰敬拜音樂特會｜同心圓‧敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEii230V4M6llRt57WHgwFh9 | 2017「Mercy 憐憫」高峰敬拜音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEijjTR1FNpmS5SWqtAPZonZ | 2016 「LOVE」高峰敬拜音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEgEnVblGYHRT4YH1EuvKvVG | 簡單唱｜同心圓‧敬拜者使團 TWS | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEhAm4Tj0lD985FI0w1y7cqJ | 2015「Listen」高峰敬拜音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEhLffmCHiBJqzNi1VONLmgz | 2014「獻給祢」敬拜讚美音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLOYShA7HDKEgtOYN2e9crFhF4F3gSJqFt | 詩歌精選｜同心圓·敬拜者使團 TWS | 合輯/精選(全碟連續播放/最佳精選,唔係單一專輯) |
| PLOYShA7HDKEhvQiFLD2vVeS59_apvebZY | GLOW 敬拜青年事工｜同心圓 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEhjBuMudcj7RWAHr9J1l1Ty | ONE CARE 敬拜關懷事工 -「水深火熱」探訪行動｜同心圓 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEgxfHB9TpDY66z2XjnOPQxq | 新城電台「原味生活館」-「同心圓」敬拜及專訪特輯 (TWS) | 特輯(唔係正式編號專輯) |
| PLOYShA7HDKEg2qV8ztmct3C6loHn2RJYI | 同心圓敬拜福音平台 One Circle 事工簡介 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOYShA7HDKEhtUKDQDjaMjeqHwXiH9Opo | 2013「祢是神」敬拜讚美音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PLF0179A154A078EAB | WorshipFACE Missions 敬拜宣教事工｜同心圓 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL5197E776A5555C6A | 2011「更親近」敬拜讚美音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |
| PL655A305DD154D459 | TheONE 全港信徒事奉更新特會｜同心圓 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PL42949926F8359779 | 2012「祝福自己」敬拜音樂會｜同心圓‧敬拜者使團 TWS | 巡迴/演唱會歌單,唔係專輯 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/同心圓敬拜-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
