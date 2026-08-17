# backfillAlbumFromCobuildCatalog 報告 —— CantonHymn 恢復粵語敬拜共建專輯系列

> 生成時間:2026-08-17 13:49:04

- catalog 曲目:37(4 隻專輯,其中(一)(二)只有部分曲目)
- 掃描 row(全庫 curated 生存 row):6381
- match 到單一專輯且已寫(或 --dry 模擬):3
- match 到但撞多隻專輯(冇寫):0
- match 到但 DB 已有 album(冇覆寫):6
- match 到但 album_source=manual/legacy(受保護):0

## 已寫(或 --dry 模擬)

| id | org | title | matched_on | album |
|---|---|---|---|---|
| 3379 | CantonHymn | 主的火 (Holy Fire 粵語版 Cantonese Demo Cover) | 主的火 | 合一的呼求 恢復粵語敬拜共建專輯（一） |
| 5884 | 原始和聲 | \|\| : 登我主的聖山 \| 朱肇階 \| 李俊霆 \| 李漫渟 \| 林倩薇 \| 關望生 \| Studio : \|\| | 登我主的聖山 | HKWorship I 恢復粵語敬拜共建專輯（四） |
| 5895 | 原始和聲 | \|\| : 登我主的聖山 \| 朱肇階 Daniel Chu \| 李俊霆 Matthew Li \| 李漫渟 Deborah Lee \| 敬拜𣊬間 : \|\| | 登我主的聖山 | HKWorship I 恢復粵語敬拜共建專輯（四） |

## DB 已有 album(冇覆寫,可用嚟核對 catalog 啱唔啱)

| id | org | title | matched_on | DB album | catalog album |
|---|---|---|---|---|---|
| 156 | 原始和聲 | 再次將我更新 原始和聲 x 小羊詩歌 x Cantonhymn Crossover | 再次將我更新 | 陪我走過春夏秋冬 (粵語) | 陪我走過春夏秋冬 |
| 2448 | 鹹蛋音樂事工 | 盡力地頌揚祢【恢復粵語敬拜共建專輯 (五) 】- SEMM X Cantonhymn X 小羊詩歌 | 盡力地頌揚祢 | 陪我走過春夏秋冬 | 陪我走過春夏秋冬 |
| 2999 | CantonHymn | 讓我作活祭 - 小羊詩歌（官方粵語版 CantonHymn Demo Cover） | 讓我作活祭 | 陪我走過春夏秋冬 | 陪我走過春夏秋冬 |
| 3891 | Milk&Honey | 求主給這世代看見異象【 live ver. 】// Milk&Honey Worship X Cantonhymn | 求主給這世代看見異象 | Hope城 | HKWorship I 恢復粵語敬拜共建專輯（四） |
| 8183 | 小羊詩歌 | 來充滿我 (粵語) \| 小羊詩歌 粵語《陪我走過春夏秋冬》專輯 | 來充滿我 | 陪我走過春夏秋冬 | 陪我走過春夏秋冬 |
| 8255 | 小羊詩歌 | 來充滿我 \| 小羊詩歌《活祭》專輯 | 來充滿我 | 活祭 | 陪我走過春夏秋冬 |
