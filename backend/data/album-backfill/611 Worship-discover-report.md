# backfillAlbumFromPlaylists discover 報告 —— org=611 Worship

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=@611worship。生成時間:2026-08-04 14:09:21

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
| PLOj_FXy0H63eOkQ6j7hxuA0BEL6WY9Kw3 | 611 小組敬拜詩歌 ｜ 611 Cell Group Resource | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOj_FXy0H63d1NIL63mqdHFJNjBQw6bBB | Live Worship ENG | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOj_FXy0H63eeQVQ8Slq4kPI9tgtMvQRs | 現場敬拜 Live Worship | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOj_FXy0H63csmYnA5A9Jrb1u4Ag38ewg | Shine In The Darkness | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLOj_FXy0H63eY3mHYT7nwQpCfy6nxvaAi | 611 Worship Moments | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/611 Worship-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
