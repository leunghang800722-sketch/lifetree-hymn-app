# backfillAlbumFromPlaylists apply 報告 —— org=ACM

> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:2026-08-04 13:54:10

- approved playlist 數:2
- yt-dlp 攞 member 失敗嘅 playlist 數:0
- 實際寫入(或 --dry 模擬寫入):20 首
- album 已非空(保護規則,冇覆寫):0 首
- album_source=manual/legacy(受保護,冇覆寫):1 首
- DB 搵唔到對應 youtube_id:1 首
- 衝突(同一 video 撞多個唔同專輯名,冇寫):0 個
- member 數變咗(簽名失效,成個 playlist 唔寫):0 個

## 寫入樣本(頭 50 條)

| id | youtube_id | album |
|---|---|---|
| 88 | H0B6KPHYbSQ | REBIRTH |
| 104 | VzmM9I0KqUM | REBIRTH |
| 5364 | oZUpxd99KXc | REBIRTH |
| 5352 | uwz0TZS9wD4 | REBIRTH |
| 5337 | vuFoTqmUizs | REBIRTH |
| 5336 | WEU2ssYDo7A | REBIRTH |
| 5340 | 2oxApVKVnkE | REBIRTH |
| 5339 | NXsUjmdHoPs | REBIRTH |
| 5341 | pVGdCaudW7o | REBIRTH |
| 5353 | S6CPktZ8KMY | REBIRTH |
| 5351 | aV8M5xWG9Q8 | REBIRTH |
| 5338 | e5_F06Kkqvc | REBIRTH |
| 5327 | Nps4WFC9PKk | REBIRTH |
| 5329 | PhJUcMFSwR4 | REBIRTH |
| 5328 | ylJ8K9Cvp_U | REBIRTH |
| 5375 | hbShoiTWHVk | 站立得穩 |
| 5372 | mCC1S_CZYNc | 站立得穩 |
| 5373 | ssctsmTB3s8 | 站立得穩 |
| 5374 | YTKE7M05c4k | 站立得穩 |
| 5365 | ajAOZYD6P6s | 站立得穩 |

## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)

冇衝突。

## Member 數變咗嘅 playlist(簽名失效,成個 playlist 冇寫,叫人重新 discover)

冇。
