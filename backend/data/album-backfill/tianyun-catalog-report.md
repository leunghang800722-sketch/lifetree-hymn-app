# backfillAlbumFromTianyunCatalog 報告 —— 天韻合唱團(shop.hms.org.tw 官方商城 catalog)

> org=天韻合唱團/天韻詩歌。生成時間:2026-08-17 13:43:46

- 候選 row 總數:562
- match 到單一專輯且已寫(或 --dry 模擬):2
- 其中撞多隻專輯、靠「最早發行=原碟」解決咗:58
- match 到但撞多隻專輯(仲係解唔到,冇寫):1
- match 到但 DB 已有 album(冇覆寫):328
- match 到但 album_source=manual/legacy(受保護,冇覆寫):2
- catalog 搵唔到:229
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):59.3%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|
| 7836 | F4MT99liliE | ●●韻流聲機【眼光】●● 老歌新唱 | 眼光 | 飛翔 |
| 7873 | KuIbRUNYh08 | 得救者之歌 | 得救者之歌 | 不為明天憂慮 |

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 7751 | m9qo1gGNns4 | 主來的日子近了 | 主來的日子近了 | 不為明天憂慮 / 莫得為明日掛慮 |

(catalog 搵唔到嘅 229 首、DB 已有 album 冇覆寫嘅 328 首、
album_source=manual/legacy 受保護嘅 2 首,唔逐條列,見上面統計數字。)
