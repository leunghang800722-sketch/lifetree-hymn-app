# backfillAlbumFromACMCatalog 報告 —— ACM(HKACM Official YouTube channel 專輯 playlist)

> org=ACM/ACM兒童詩歌。生成時間:2026-08-11 10:14:09(--dry,DB 未寫入)

- 候選 row 總數:355
- match 到單一專輯且已寫(或 --dry 模擬):0
- match 到但撞多隻專輯(衝突,冇寫):0
- match 到但 DB 已有 album(冇覆寫):154
- match 到但 album_source=manual/legacy(受保護,冇覆寫):2
- catalog 搵唔到(youtube_id 唔喺任何已收錄嘅專輯 playlist 入面):199
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):43.9%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | album |
|---|---|---|---|

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | 撞中嘅專輯 |
|---|---|---|---|

(catalog 搵唔到嘅 199 首、DB 已有 album 冇覆寫嘅 154 首、
album_source=manual/legacy 受保護嘅 2 首,唔逐條列,見上面統計數字。)
