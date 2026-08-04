# backfillAlbumFromPlaylists apply 報告 —— org=全心製作 HeartPro

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 14:11:26

- approved playlist 數:1
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):6 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):0 首
- DB 搵唔到對應 youtube_id:0 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 3275 | EqRfNHLL7gg | WAO - WeAreOne |
| 3276 | qEs1lP8uCYY | WAO - WeAreOne |
| 3289 | H9RYTeeQtp4 | WAO - WeAreOne |
| 3290 | T284-2BA9h4 | WAO - WeAreOne |
| 3274 | Ddz_zvXl5Ns | WAO - WeAreOne |
| 3271 | ImNaLoWo7BQ | WAO - WeAreOne |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
