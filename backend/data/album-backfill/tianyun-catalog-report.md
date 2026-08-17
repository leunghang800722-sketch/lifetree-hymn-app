# backfillAlbumFromTianyunCatalog 報告 —— 天韻合唱團(shop.hms.org.tw 官方商城 catalog)

> org=天韻合唱團/天韻詩歌。生成時間:2026-08-17 13:28:56(--dry,DB 未寫入)

- 候選 row 總數:562
- match 到單一專輯且已寫(或 --dry 模擬):0
- 其中撞多隻專輯、靠「最早發行=原碟」解決咗:52
- match 到但撞多隻專輯(仲係解唔到,冇寫):10
- match 到但 DB 已有 album(冇覆寫):321
- match 到但 album_source=manual/legacy(受保護,冇覆寫):2
- catalog 搵唔到:229
- 命中率(matched+conflicts+alreadyHasAlbum+protected / 候選):59.3%

## 已寫(或 --dry 模擬)清單(頭 200 條)

| id | youtube_id | title | matched_on | album |
|---|---|---|---|---|

## 衝突清單(撞多隻專輯,人手覆核)

| id | youtube_id | title | matched_on | 撞中嘅專輯 |
|---|---|---|---|---|
| 7745 | CslWW3MV-VQ | 心中得安息 | 心中得安息 | 不為明天憂慮 / 莫得為明日掛慮 |
| 7749 | 27P72PPd39c | 眼光(台) | 眼光(台) | 伊的疼惜 / 飛翔 |
| 7751 | m9qo1gGNns4 | 主來的日子近了 | 主來的日子近了 | 不為明天憂慮 / 莫得為明日掛慮 |
| 7827 | gxapUAjRDHM | 浪子 | 浪子 | 咱是一場戲 / 飛翔 |
| 7836 | F4MT99liliE | ●●韻流聲機【眼光】●● 老歌新唱 | 眼光 | 伊的疼惜 / 飛翔 |
| 7873 | KuIbRUNYh08 | 得救者之歌 | 得救者之歌 | 不為明天憂慮 / 莫得為明日掛慮 |
| 7879 | DbR6pi1ump8 | 眼光 | 眼光 | 伊的疼惜 / 飛翔 |
| 7889 | V7WGl5bqT8Y | 得救者之歌 | 得救者之歌 | 不為明天憂慮 / 莫得為明日掛慮 |
| 7904 | 8dC2UOuNSQo | 【眼光】 Official-現場演唱版 | 眼光 | 伊的疼惜 / 飛翔 |
| 8075 | SPGvl3ZwlxE | 眼光 | 眼光 | 伊的疼惜 / 飛翔 |

(catalog 搵唔到嘅 229 首、DB 已有 album 冇覆寫嘅 321 首、
album_source=manual/legacy 受保護嘅 2 首,唔逐條列,見上面統計數字。)
