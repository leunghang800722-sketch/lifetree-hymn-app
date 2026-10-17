# backfillAlbumFromPlaylists apply 報告 —— org=讚美之泉

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 14:34:28

- approved playlist 數:55
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):12 首
- album 已非空(保護規則,冇覆寫):904 首
- album_source=manual/legacy(受保護,冇覆寫):52 首
- DB 搵唔到對應 youtube_id:570 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 5190 | S3pkoWdwA9M | 差遣我 |
| 5187 | qJwNJjRg450 | 差遣我 |
| 5191 | MH4QM21qtXk | 差遣我 |
| 5199 | Jh_rdk3EHLQ | 差遣我 |
| 5201 | 1mTY9Nl-7u4 | 差遣我 |
| 5186 | woY0JPOgVlk | 差遣我 |
| 5200 | 8hd6ymlcnQI | 差遣我 |
| 5188 | o47twMs54Ic | 差遣我 |
| 5198 | KCEpDBUm8jM | 差遣我 |
| 5189 | _XgP0p-S4S8 | 差遣我 |
| 5764 | j69OWSfUlhM | 我相信 |
| 183 | DYlo2qztLAs | 平安 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
