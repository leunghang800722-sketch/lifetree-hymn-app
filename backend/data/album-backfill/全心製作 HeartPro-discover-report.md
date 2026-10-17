# backfillAlbumFromPlaylists discover 報告 —— org=全心製作 HeartPro

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=@heartpro12。生成時間:2026-08-04 14:10:07

## 候選專輯 playlist(白名單,等人手 approved)

⚠️ `proposed_album` 為 `(要人手填)` 嘅一定要人手喺白名單 JSON 入面填
好個名先可以簽 approved(唔准留空 approve)。member_count > 30
嘅有 ⚠️ 標記——專輯好少超過 30 首,大機會係官方 playlist 尾巴被人加咗
唔相關嘅片(2026-08-04 id=735 就係呢個根因,簽嗰陣請人手核實 member 名單)。

| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |
|---|---|---|---|---|
| PLVnsTB8V5JSBhmWdcf5mktXkr6-kQZ4dZ | WAO - WeAreOne Album | WAO - WeAreOne Album | 6 | 6 |

候選 1 個,合共 matched_in_db 6 首(未去重,同一片可能撞多個候選,見底下衝突段)。
需要人手填 proposed_album 嘅候選:0 個。member_count > 30 嘅候選:0 個。

## 跳過嘅 playlist(非專輯類,連原因)

| playlist_id | playlist_title | 跳過原因 |
|---|---|---|
| PLVnsTB8V5JSAFMCjkiXtE7Izrw6ehZPY7 | 見證集  神祢在掌管。 《HIS70ry 齊唱。吳秉堅之歌。》 自傳第一樂章。 七十年只會出現一次嘅自傳音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLVnsTB8V5JSBA0azzJTWDBzK-IPGqkG6T | 詩歌集  神祢在掌管。 《HIS70ry 齊唱。吳秉堅之歌。》 自傳第一樂章。 七十年只會出現一次嘅自傳音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLVnsTB8V5JSDjR2UIZHqTSUy8SWKMdIdD | 音樂會足本  神祢在掌管。 《HIS70ry 齊唱。吳秉堅之歌。》 自傳第一樂章。 七十年只會出現一次嘅自傳音樂會 | 巡迴/演唱會歌單,唔係專輯 |
| PLVnsTB8V5JSDTJo7Bnv8WXn5jEfKnagvO | Others | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLVnsTB8V5JSC8FXN_X22u72uG7acv-E7c | 神祢在掌管。 《HIS70ry 齊唱。吳秉堅之歌。》自傳第一樂章 | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLVnsTB8V5JSCc4h0-gYn8S251LpzIPUD8 | ACM X 全心製作 北美巡迴 2018 | 巡迴/演唱會歌單,唔係專輯 |
| FLDluxa7X4PVAH3Bk_EYpMIw | Favorites | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLVnsTB8V5JSAHKQTmqxJoAKnGn-pJFoo7 | WAO - We Are One | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |
| PLVnsTB8V5JSArk3QEWwDSmzOxXlkJNGCc | Heartproduction | 冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核 |

## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)

冇撞到衝突。

## 下一步

人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單
(`backend/data/album-backfill/全心製作 HeartPro-playlists.json`)入面將簽咗嘅項 `approved` 改做 `true`,
proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。
