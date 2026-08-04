# backfillAlbumFromPlaylists apply 報告 —— org=角聲使團

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 14:11:24

- approved playlist 數:7
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):11 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):0 首
- DB 搵唔到對應 youtube_id:41 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 150 | OiBmgycJioY | 讓愛留痕 |
| 6090 | qGoHoXrLMl0 | 振翅翱翔 |
| 6055 | BEleyHJDPBE | 振翅翱翔 |
| 6077 | OYmNz1RHqi0 | 重投豐盛 |
| 145 | PvyywIj4Qx0 | 重投豐盛 |
| 148 | 6AjmdlQZt7Q | 重投豐盛 |
| 147 | KZDoxiqt2kg | 源來有祢 |
| 146 | tPziMHju3Ok | 源來有祢 |
| 6068 | JDLVv-d7Fsw | 源來有祢 |
| 6065 | 3hMPk1ZYFiw | 源來有祢 |
| 6064 | gqgD3BKNy9k | 源來有祢 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
